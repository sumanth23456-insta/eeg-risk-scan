/**
 * Analysis pipeline orchestrator:
 * column validation -> preprocessing -> artifact stage -> feature extraction ->
 * EEG sanity check -> reference comparison -> model inference -> risk score ->
 * explainability -> chart data.
 *
 * Fixed processing order (per channel, never on the time column):
 *   1. remove non-finite / missing samples
 *   2. DC / baseline removal
 *   3. extreme-outlier limiting (robust MAD envelope)
 *   4. band-pass 0.5–45 Hz (zero-phase FIR)
 *   5. 50 Hz notch (bidirectional IIR) when the sampling rate permits
 *   6. power-line verification (before vs. after)
 *   7. artifact detection
 *   8. optional normalisation (scale-independent features only)
 *
 * Each stage is a pure function so an external Python service (NumPy/SciPy/MNE/
 * scikit-learn/PyWavelets) can replace any stage without touching the UI.
 */
import {
  baselineCorrect,
  bandpass,
  cleanInvalid,
  detectArtifacts,
  median,
  normalize,
  notch,
  peakToPeak,
  powerlineRatio,
  rms as rmsOf,
  spectrogram,
  welchPsd,
  type SpectrogramData,
} from "./dsp";
import { extractFeatures, FEATURE_KEYS, type FeatureVector } from "./features";
import {
  analyzedRange,
  bandCoverage,
  validateSamplingRate,
  worstLevel,
  type AnalyzedRange,
  type BandStatus,
  type SanityCheck,
  type SanityCheckItem,
} from "./validation";
import type { EegRecording } from "./parse";

import {
  assessRisk,
  compareToReference,
  explain,
  REFERENCE_PREPROCESS_LABEL,
  type FeatureContribution,
  type ParameterComparison,
  type ReferenceTable,
  type RiskResult,
  type TrainedModel,
} from "./model";

export interface PreprocessOptions {
  removeInvalid: boolean;
  baseline: boolean;
  bandpass: boolean;
  bandLow: number;
  bandHigh: number;
  notch: boolean;
  notchFreq: number;
  normalize: boolean;
}

export const DEFAULT_PREPROCESS: PreprocessOptions = {
  removeInvalid: true,
  baseline: true,
  bandpass: true,
  bandLow: 0.5,
  bandHigh: 45,
  notch: true,
  notchFreq: 50,
  normalize: false,
};

export interface PreprocessResult {
  signal: Float64Array;
  steps: { name: string; detail: string; applied: boolean }[];
  invalidCount: number;
  artifactRatio: number;
  artifactSegments: number;
  clipped: boolean;
  /** effective band actually analysed after Nyquist / sampling-rate limits */
  effectiveLow: number;
  effectiveHigh: number;
  outlierCount: number;
  excludedRatio: number;
  /** relative power around the mains frequency, before and after filtering */
  powerlineBefore: number;
  powerlineAfter: number;
  warnings: string[];
}

/** Never mutates the input array. */
export function preprocess(raw: Float64Array, fs: number, o: PreprocessOptions): PreprocessResult {
  let x: Float64Array = Float64Array.from(raw) as Float64Array;
  const steps: PreprocessResult["steps"] = [];
  const warnings: string[] = [];
  let invalidCount = 0;
  let outlierCount = 0;

  const fsCheck = validateSamplingRate(fs);
  warnings.push(...fsCheck.errors, ...fsCheck.warnings);
  const range = analyzedRange(fs, o);

  // 1. invalid / missing samples
  if (o.removeInvalid) {
    const r = cleanInvalid(x);
    x = r.out;
    invalidCount = r.invalidCount;
    steps.push({
      name: "Invalid / missing value handling",
      detail: `${r.invalidCount} non-finite sample(s) interpolated from neighbours.`,
      applied: true,
    });
    if (r.invalidCount > 0) {
      warnings.push(
        `${r.invalidCount} invalid or missing EEG sample(s) were interpolated. Verify the uploaded file.`,
      );
    }
  }

  // power-line content of the RAW (baseline-corrected) signal, for verification
  const rawSpec = welchPsd(baselineCorrect(x), fs, Math.min(1024, Math.max(64, 2 ** Math.round(Math.log2(fs * 2)))));
  const powerlineBefore = powerlineRatio(rawSpec, o.notchFreq, Math.min(fs / 2, 100));

  // 2. DC / baseline
  if (o.baseline) {
    x = baselineCorrect(x);
    steps.push({ name: "Baseline correction", detail: "DC offset (segment mean) removed.", applied: true });
  }

  // 3. extreme amplitude outliers limited so one artifact cannot dominate the features
  {
    const r = limitExtremeOutliers(x, 8);
    x = r.out;
    outlierCount = r.count;
    steps.push({
      name: "Extreme amplitude outlier handling",
      detail: `${r.count} sample(s) beyond 8×MAD limited to the robust amplitude envelope (no ICA is applied).`,
      applied: true,
    });
  }

  // 4. band-pass
  if (o.bandpass) {
    const hi = range.high;
    x = bandpass(x, fs, o.bandLow, hi);
    steps.push({
      name: "Band-pass filter",
      detail: `Zero-phase FIR windowed-sinc (Blackman, 101 taps), ${o.bandLow}–${hi.toFixed(hi % 1 ? 1 : 0)} Hz.`,
      applied: true,
    });
    if (hi < o.bandHigh) {
      warnings.push(
        `Requested upper cut-off ${o.bandHigh} Hz exceeds what ${fs.toFixed(1)} Hz sampling supports; analysis limited to ${hi.toFixed(1)} Hz (Nyquist ${(fs / 2).toFixed(1)} Hz).`,
      );
    }
  }

  // 5. notch
  if (o.notch && o.notchFreq < fs / 2) {
    x = notch(x, fs, o.notchFreq);
    steps.push({
      name: "Notch filter",
      detail: `Bidirectional (zero-phase) IIR notch at ${o.notchFreq} Hz (Q=30) for power-line interference.`,
      applied: true,
    });
  } else if (o.notch) {
    warnings.push(
      `${o.notchFreq} Hz notch not applied — it lies above the Nyquist frequency of ${(fs / 2).toFixed(1)} Hz.`,
    );
  }

  // 6. residual power-line verification
  const outSpec = welchPsd(x, fs, Math.min(1024, Math.max(64, 2 ** Math.round(Math.log2(fs * 2)))));
  const powerlineAfter = powerlineRatio(outSpec, o.notchFreq, Math.min(fs / 2, range.high));
  steps.push({
    name: "Power-line interference check",
    detail: `${o.notchFreq} Hz relative power ${(powerlineBefore * 100).toFixed(2)}% before → ${(powerlineAfter * 100).toFixed(2)}% after filtering.`,
    applied: true,
  });
  if (powerlineAfter > 0.15) {
    warnings.push(
      `Power-line interference detected — EEG classification may be unreliable (${(powerlineAfter * 100).toFixed(1)}% of analysed power remains near ${o.notchFreq} Hz).`,
    );
  }

  // 7. artifacts
  const art = detectArtifacts(x);
  steps.push({
    name: "Artifact detection",
    detail: `${(art.ratio * 100).toFixed(2)}% of samples exceed 6×MAD across ${art.segments} segment(s)${art.clipped ? "; possible clipping detected" : ""}.`,
    applied: true,
  });
  if (art.ratio > 0.2 || art.clipped) {
    warnings.push(
      "High artifact burden detected. Seizure-risk classification may be unreliable for this segment.",
    );
  }

  // 8. optional normalisation
  if (o.normalize) {
    x = normalize(x);
    steps.push({ name: "Normalisation", detail: "Z-score normalisation (mean 0, SD 1).", applied: true });
  }
  return {
    signal: x,
    steps,
    invalidCount,
    artifactRatio: art.ratio,
    artifactSegments: art.segments,
    clipped: art.clipped,
    effectiveLow: range.low,
    effectiveHigh: range.high,
    outlierCount,
    excludedRatio: art.ratio,
    powerlineBefore,
    powerlineAfter,
    warnings,
  };
}

/** Robust limiter: clamps samples beyond k×MAD instead of deleting them. */
function limitExtremeOutliers(x: Float64Array, k: number): { out: Float64Array; count: number } {
  const vals = Array.from(x);
  const med = median(vals);
  const mad = median(vals.map((v) => Math.abs(v - med))) * 1.4826;
  if (!Number.isFinite(mad) || mad <= 1e-12) return { out: x, count: 0 };
  const lim = k * mad;
  const out = Float64Array.from(x);
  let count = 0;
  for (let i = 0; i < out.length; i++) {
    const d = out[i] - med;
    if (Math.abs(d) > lim) {
      out[i] = med + Math.sign(d) * lim;
      count++;
    }
  }
  return { out, count };
}

export interface RiskTimelinePoint {
  start: number;
  end: number;
  risk: number;
  classification: string;
}

export type ChannelQuality = "Good" | "Acceptable" | "Poor" | "Unreliable";

export interface ChannelReport {
  index: number;
  name: string;
  quality: ChannelQuality;
  artifactPercent: number;
  invalidCount: number;
  flat: boolean;
  clipped: boolean;
  rms: number;
  p2p: number;
  dominantFreq: number;
  powerlineBefore: number;
  powerlineAfter: number;
  bands: { band: string; absolute: number; relative: number }[];
  features: FeatureVector;
  included: boolean;
  exclusionReason: string | null;
}

export interface TechnicalInfo {
  timeColumn: string | null;
  detectedChannels: string[];
  selectedChannels: string[];
  includedChannels: string[];
  excludedChannels: { name: string; reason: string }[];
  samplingRate: number;
  samplingRateSource: string;
  nyquist: number;
  sampleCount: number;
  durationSec: number;
  amplitudeUnit: string;
  amplitudeUnitKnown: boolean;
  filter: string;
  notch: string;
  bandDefinitions: string;
  analysedRangeLabel: string;
  meanArtifactPercent: number;
  featureCount: number;
  modelFeatureCount: number;
  scalerStatus: string;
  referenceDataset: string;
  referencePreprocess: string;
  referenceSamplingRate: number;
  referenceAmplitudeUnit: string;
  classificationEligible: boolean;
  invalidFeatures: string[];
}

export interface AnalysisResult {
  id: string;
  createdAt: string;
  recordingId: string;
  fileName: string;
  source: "upload" | "demo";
  recordingLabel?: string;
  samplingRate: number;
  channelNames: string[];
  /** Human-readable summary of the analysed EEG channels (never the time column). */
  analysedChannel: string;
  analysedChannels: string[];
  timeColumn: string | null;
  channelReports: ChannelReport[];
  windowStart: number;
  windowEnd: number;
  durationSec: number;
  preprocess: PreprocessOptions;
  preprocessSteps: PreprocessResult["steps"];
  features: FeatureVector;
  comparisons: Record<string, ParameterComparison[]>;
  risk: RiskResult;
  contributions: FeatureContribution[];
  spectrum: { freq: number; power: number }[];
  spectrumRaw: { freq: number; power: number }[];
  bandPowers: { band: string; absolute: number; relative: number }[];
  spectrogram: SpectrogramData;
  timeline: RiskTimelinePoint[];
  modelName: string;
  modelAlgorithm: string;
  modelDatasetOrigin: "synthetic" | "uploaded";
  featureCount: number;
  qualityStatus: string;
  analyzedRange: AnalyzedRange;
  bandCoverage: BandStatus[];
  preprocessWarnings: string[];
  sanity: SanityCheck;
  powerlineBefore: number;
  powerlineAfter: number;
  technical: TechnicalInfo;
}

export interface RunAnalysisArgs {
  recording: EegRecording;
  /** EEG channel indices to analyse. Defaults to all channels. */
  channelIndices?: number[];
  /** Legacy single-channel entry point. */
  channelIndex?: number;
  windowStart: number;
  windowEnd: number;
  options: PreprocessOptions;
  model: TrainedModel;
  table: ReferenceTable;
  recordingId?: string;
}

export function sliceWindow(rec: EegRecording, ch: number, start: number, end: number): Float64Array {
  const fs = rec.samplingRate;
  const a = Math.max(0, Math.floor(start * fs));
  const b = Math.min(rec.data[ch].length, Math.ceil(end * fs));
  return rec.data[ch].slice(a, Math.max(a + 1, b));
}

function gradeChannel(r: {
  artifactRatio: number;
  clipped: boolean;
  flat: boolean;
  powerlineAfter: number;
  invalidRatio: number;
}): ChannelQuality {
  if (r.flat || r.invalidRatio > 0.2) return "Unreliable";
  if (r.artifactRatio > 0.25 || r.powerlineAfter > 0.3 || r.clipped) return "Unreliable";
  if (r.artifactRatio > 0.1 || r.powerlineAfter > 0.15) return "Poor";
  if (r.artifactRatio > 0.03 || r.powerlineAfter > 0.05) return "Acceptable";
  return "Good";
}

function aggregateFeatures(reports: ChannelReport[]): FeatureVector {
  const out: FeatureVector = {};
  const used = reports.filter((r) => r.included);
  for (const key of FEATURE_KEYS) {
    const vals = used.map((r) => r.features[key]).filter((v) => Number.isFinite(v));
    out[key] = vals.length ? median(vals) : 0;
  }
  return out;
}

export function runAnalysis(args: RunAnalysisArgs): AnalysisResult {
  const { recording, windowStart, windowEnd, options, model, table } = args;
  const fs = recording.samplingRate;
  const fsCheck = validateSamplingRate(fs);
  if (!fsCheck.valid) throw new Error(fsCheck.errors.join(" "));

  /* ------------------------- channel selection guard ------------------------ */
  const allIdx = recording.channelNames.map((_, i) => i);
  let selected = (args.channelIndices ?? (args.channelIndex != null ? [args.channelIndex] : allIdx))
    .filter((i) => i >= 0 && i < recording.channelNames.length);
  if (!selected.length) selected = allIdx;
  if (recording.timeColumn) {
    const before = selected.length;
    selected = selected.filter((i) => recording.channelNames[i] !== recording.timeColumn);
    if (selected.length !== before) {
      // hard safety check — the time axis is never an EEG channel
      if (!selected.length) {
        throw new Error(
          `Analysis rejected: the time column "${recording.timeColumn}" cannot be analysed as an EEG channel.`,
        );
      }
    }
  }
  if (!selected.length) throw new Error("No valid EEG channel selected for analysis.");

  const range = analyzedRange(fs, options);

  /* ------------------------- per-channel processing ------------------------- */
  const reports: ChannelReport[] = [];
  let primarySpecRaw: { freq: number; power: number }[] = [];
  let primarySpec: { freq: number; power: number }[] = [];
  let primarySignal: Float64Array | null = null;
  let steps: PreprocessResult["steps"] = [];
  const warnings: string[] = [];

  for (const ci of selected) {
    const raw = sliceWindow(recording, ci, windowStart, windowEnd);
    if (raw.length < Math.max(64, fs)) {
      throw new Error("Insufficient EEG data for reliable feature extraction (at least 1 s is required).");
    }
    const pre = preprocess(raw, fs, options);
    const { features, spectrum, bandPowers } = extractFeatures(pre.signal, fs, range.high);
    const flat = peakToPeak(raw) < 1e-9;
    let invalid = 0;
    for (let i = 0; i < raw.length; i++) if (!Number.isFinite(raw[i])) invalid++;
    const quality = gradeChannel({
      artifactRatio: pre.artifactRatio,
      clipped: pre.clipped,
      flat,
      powerlineAfter: pre.powerlineAfter,
      invalidRatio: invalid / raw.length,
    });
    reports.push({
      index: ci,
      name: recording.channelNames[ci] ?? `CH${ci + 1}`,
      quality,
      artifactPercent: pre.artifactRatio * 100,
      invalidCount: invalid,
      flat,
      clipped: pre.clipped,
      rms: rmsOf(pre.signal),
      p2p: peakToPeak(pre.signal),
      dominantFreq: features.dominantFreq,
      powerlineBefore: pre.powerlineBefore,
      powerlineAfter: pre.powerlineAfter,
      bands: bandPowers,
      features,
      included: quality !== "Unreliable",
      exclusionReason:
        quality === "Unreliable"
          ? flat
            ? "flat / near-constant signal"
            : pre.powerlineAfter > 0.3
              ? "dominant power-line interference"
              : pre.clipped
                ? "amplitude clipping"
                : "artifact burden above 25%"
          : null,
    });

    if (!primarySignal && quality !== "Unreliable") {
      primarySignal = pre.signal;
      steps = pre.steps;
      warnings.push(...pre.warnings);
      const rawSpec = welchPsd(
        baselineCorrect(raw),
        fs,
        Math.min(1024, Math.max(64, 2 ** Math.round(Math.log2(fs * 2)))),
      );
      const cap = Math.min(fs / 2, Math.max(60, range.high + 15));
      primarySpecRaw = Array.from(rawSpec.freqs)
        .map((f, i) => ({ freq: f, power: rawSpec.psd[i] }))
        .filter((p) => p.freq <= cap);
      primarySpec = Array.from(spectrum.freqs)
        .map((f, i) => ({ freq: f, power: spectrum.psd[i] }))
        .filter((p) => p.freq <= cap);
    }
  }

  // channel-consistency check: a channel whose RMS is wildly off the group is suspect
  const includedRms = reports.filter((r) => r.included).map((r) => r.rms);
  if (includedRms.length >= 4) {
    const medRms = median(includedRms);
    for (const r of reports) {
      if (!r.included) continue;
      if (medRms > 1e-9 && (r.rms > 6 * medRms || r.rms < medRms / 6)) {
        r.included = false;
        r.quality = r.quality === "Good" ? "Poor" : r.quality;
        r.exclusionReason = `amplitude inconsistent with the other channels (RMS ${r.rms.toFixed(1)} vs median ${medRms.toFixed(1)} µV)`;
      }
    }
  }

  const included = reports.filter((r) => r.included);
  if (!included.length) {
    // keep the least-bad channel so the user still gets a (flagged) result
    reports[0].included = true;
    reports[0].exclusionReason = null;
    included.push(reports[0]);
  }
  if (!primarySignal) {
    const raw = sliceWindow(recording, included[0].index, windowStart, windowEnd);
    const pre = preprocess(raw, fs, options);
    primarySignal = pre.signal;
    steps = pre.steps;
    warnings.push(...pre.warnings);
  }

  for (const r of reports) {
    if (!r.included && r.exclusionReason) {
      warnings.push(`Channel ${r.name} excluded from aggregate analysis due to ${r.exclusionReason}.`);
    }
  }

  /* ----------------------------- aggregate result --------------------------- */
  const features = aggregateFeatures(reports);
  const invalidFeatures = FEATURE_KEYS.filter((k) => !Number.isFinite(features[k]));
  const bandPowers = included[0].bands.map((b, i) => ({
    band: b.band,
    absolute: median(included.map((r) => r.bands[i]?.absolute ?? 0)),
    relative: median(included.map((r) => r.bands[i]?.relative ?? 0)),
  }));
  const meanArtifact = included.reduce((s, r) => s + r.artifactPercent, 0) / included.length;
  const powerlineBefore = median(reports.map((r) => r.powerlineBefore));
  const powerlineAfter = median(included.map((r) => r.powerlineAfter));

  /* ------------------------------ sanity check ------------------------------ */
  const items: SanityCheckItem[] = [];
  items.push({
    name: "EEG channels",
    level: included.length ? "pass" : "fail",
    detail: `${included.length} of ${reports.length} selected channel(s) usable${recording.timeColumn ? `; time column ${recording.timeColumn} excluded` : ""}.`,
  });
  items.push({
    name: "Sampling rate",
    level: fsCheck.fullGamma ? "pass" : "warning",
    detail: `${fs.toFixed(2)} Hz (Nyquist ${(fs / 2).toFixed(1)} Hz); analysed range ${range.label}.`,
  });
  const aggRms = median(included.map((r) => r.rms));
  items.push({
    name: "Amplitude range",
    level: aggRms >= 1 && aggRms <= 500 ? "pass" : aggRms > 0 ? "warning" : "fail",
    detail: `Median channel RMS ${aggRms.toFixed(2)} µV${recording.unitKnown ? "" : " (unit not declared — assumed µV)"}.`,
  });
  items.push({
    name: "Artifact burden",
    level: meanArtifact < 10 ? "pass" : meanArtifact < 25 ? "warning" : "fail",
    detail: `${meanArtifact.toFixed(2)}% of samples flagged as artifact across included channels.`,
  });
  items.push({
    name: "Power-line interference",
    level: powerlineAfter < 0.1 ? "pass" : powerlineAfter < 0.25 ? "warning" : "fail",
    detail: `${(powerlineBefore * 100).toFixed(2)}% before → ${(powerlineAfter * 100).toFixed(2)}% after ${options.notchFreq} Hz notch.`,
  });
  const totalPower = features.totalPower ?? 0;
  items.push({
    name: "Spectral content",
    level: totalPower > 1e-9 ? "pass" : "fail",
    detail: `Total analysed-band power ${totalPower.toExponential(2)} µV².`,
  });
  items.push({
    name: "Numeric validity",
    level: invalidFeatures.length ? "fail" : "pass",
    detail: invalidFeatures.length
      ? `${invalidFeatures.length} feature(s) are NaN/Infinity: ${invalidFeatures.join(", ")}.`
      : `All ${FEATURE_KEYS.length} extracted parameters are finite.`,
  });
  const level = worstLevel(items);
  const sanity: SanityCheck = {
    level,
    eligible: level !== "fail",
    reason:
      level === "fail"
        ? items
            .filter((i) => i.level === "fail")
            .map((i) => i.name)
            .join(", ") + " failed the EEG sanity check"
        : "",
    items,
  };

  /* --------------------------------- model ---------------------------------- */
  const qualityPenalty = Math.min(1, meanArtifact / 100 * 3 + powerlineAfter * 2);
  const risk = assessRisk({
    features,
    model,
    table,
    qualityPenalty,
    segmentSeconds: windowEnd - windowStart,
    eligible: sanity.eligible,
    ineligibleReason: sanity.reason,
    powerlineRatio: powerlineAfter,
  });
  const contributions = explain(model, features, Math.max(0, model.classes.indexOf(risk.predictedClass)));

  const comparisons: AnalysisResult["comparisons"] = {
    interictal: compareToReference(features, table, "interictal"),
    preictal: compareToReference(features, table, "preictal"),
    ictal: compareToReference(features, table, "ictal"),
  };

  /* -------------------------------- timeline -------------------------------- */
  const primaryIdx = included[0].index;
  const winSec = Math.max(2, Math.min(30, windowEnd - windowStart));
  const timeline: RiskTimelinePoint[] = [];
  const maxWindows = 40;
  const step = Math.max(winSec, recording.durationSec / maxWindows);
  for (let t = 0; t + winSec <= recording.durationSec + 1e-6; t += step) {
    const seg = sliceWindow(recording, primaryIdx, t, t + winSec);
    if (seg.length < fs) continue;
    const p = preprocess(seg, fs, options);
    const f = extractFeatures(p.signal, fs, range.high).features;
    const r = assessRisk({
      features: f,
      model,
      table,
      segmentSeconds: winSec,
      eligible: true,
      powerlineRatio: p.powerlineAfter,
    });
    timeline.push({ start: t, end: t + winSec, risk: r.riskScore, classification: r.classification });
  }

  const specData = spectrogram(primarySignal, fs, 1, Math.min(range.high, fs / 2));

  const technical: TechnicalInfo = {
    timeColumn: recording.timeColumn,
    detectedChannels: recording.channelNames,
    selectedChannels: selected.map((i) => recording.channelNames[i]),
    includedChannels: included.map((r) => r.name),
    excludedChannels: reports
      .filter((r) => !r.included)
      .map((r) => ({ name: r.name, reason: r.exclusionReason ?? "excluded" })),
    samplingRate: fs,
    samplingRateSource: recording.samplingRateSource,
    nyquist: fs / 2,
    sampleCount: recording.data[primaryIdx]?.length ?? 0,
    durationSec: recording.durationSec,
    amplitudeUnit: recording.unit,
    amplitudeUnitKnown: recording.unitKnown,
    filter: options.bandpass ? `Band-pass ${options.bandLow}–${range.high.toFixed(1)} Hz (zero-phase FIR)` : "none",
    notch: options.notch ? `${options.notchFreq} Hz bidirectional IIR (Q=30)` : "none",
    bandDefinitions: "Delta 0.5–4 · Theta 4–8 · Alpha 8–13 · Beta 13–30 · Gamma 30–45 Hz",
    analysedRangeLabel: range.label,
    meanArtifactPercent: meanArtifact,
    featureCount: FEATURE_KEYS.length,
    modelFeatureCount: model.featureKeys.length,
    scalerStatus: `Training-set scaler reused (${model.mu.length} means / ${model.sigma.length} SDs, fitted on ${model.nTrain} training epochs)`,
    referenceDataset: `${model.datasetName} (${model.datasetOrigin})`,
    referencePreprocess: REFERENCE_PREPROCESS_LABEL,
    referenceSamplingRate: 256,
    referenceAmplitudeUnit: "µV",
    classificationEligible: sanity.eligible,
    invalidFeatures,
  };

  return {
    id: `an_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    recordingId: recording.id,
    fileName: recording.fileName,
    source: recording.source,
    recordingLabel: recording.demoLabel,
    samplingRate: fs,
    channelNames: recording.channelNames,
    analysedChannel: included.map((r) => r.name).join(", "),
    analysedChannels: included.map((r) => r.name),
    timeColumn: recording.timeColumn,
    channelReports: reports,
    windowStart,
    windowEnd,
    durationSec: recording.durationSec,
    preprocess: options,
    preprocessSteps: steps,
    features,
    comparisons,
    risk,
    contributions,
    spectrum: primarySpec,
    spectrumRaw: primarySpecRaw,
    bandPowers,
    spectrogram: specData,
    timeline,
    modelName: model.name,
    modelAlgorithm: model.algorithm,
    modelDatasetOrigin: model.datasetOrigin,
    featureCount: model.featureKeys.length,
    qualityStatus: recording.quality.status,
    analyzedRange: range,
    bandCoverage: bandCoverage(range),
    preprocessWarnings: Array.from(new Set(warnings)),
    sanity,
    powerlineBefore,
    powerlineAfter,
    technical,
  };
}
