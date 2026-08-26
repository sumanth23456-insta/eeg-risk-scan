/**
 * Analysis pipeline orchestrator:
 * validation -> preprocessing -> feature extraction -> reference comparison ->
 * model inference -> risk score -> explainability -> chart data.
 *
 * Each stage is a pure function so an external Python service (NumPy/SciPy/MNE/
 * scikit-learn/PyWavelets) can replace any stage without touching the UI.
 * See backend.ts for the remote-processing interface.
 */
import {
  baselineCorrect,
  bandpass,
  cleanInvalid,
  detectArtifacts,
  normalize,
  notch,
  spectrogram,
  type SpectrogramData,
} from "./dsp";
import { extractFeatures, type FeatureVector } from "./features";
import type { EegRecording } from "./parse";
import {
  assessRisk,
  compareToReference,
  explain,
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
  bandHigh: 100,
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

  if (o.removeInvalid) {
    const r = cleanInvalid(x);
    x = r.out;
    invalidCount = r.invalidCount;
    steps.push({
      name: "Invalid / missing value handling",
      detail: `${r.invalidCount} non-finite samples interpolated from neighbours.`,
      applied: true,
    });
    if (r.invalidCount > 0) {
      warnings.push("Invalid EEG values detected. Please check the uploaded file.");
    }
  }
  if (o.baseline) {
    x = baselineCorrect(x);
    steps.push({ name: "Baseline correction", detail: "DC offset (segment mean) removed.", applied: true });
  }

  // Extreme amplitude outliers are limited so single artifacts cannot dominate
  // the extracted features (no ICA — see methodology, future enhancement).
  {
    const r = limitExtremeOutliers(x, 8);
    x = r.out;
    outlierCount = r.count;
    steps.push({
      name: "Extreme amplitude outlier handling",
      detail: `${r.count} sample(s) beyond 8×MAD limited to the robust amplitude envelope.`,
      applied: true,
    });
  }

  if (o.bandpass) {
    const hi = range.high;
    x = bandpass(x, fs, o.bandLow, hi);
    steps.push({
      name: "Band-pass filter",
      detail: `FIR windowed-sinc (Blackman, 101 taps), ${o.bandLow}–${hi.toFixed(hi % 1 ? 1 : 0)} Hz.`,
      applied: true,
    });
    if (hi < o.bandHigh) {
      warnings.push(
        `Requested upper cut-off ${o.bandHigh} Hz exceeds what ${fs} Hz sampling supports; analysis limited to ${hi.toFixed(1)} Hz (Nyquist ${(fs / 2).toFixed(1)} Hz).`,
      );
    }
  }
  if (o.notch && o.notchFreq < fs / 2) {
    x = notch(x, fs, o.notchFreq);
    steps.push({
      name: "Notch filter",
      detail: `Bidirectional IIR notch at ${o.notchFreq} Hz (Q=30) for power-line interference.`,
      applied: true,
    });
  }
  const art = detectArtifacts(x);
  steps.push({
    name: "Artifact detection",
    detail: `${(art.ratio * 100).toFixed(2)}% of samples exceed 6×MAD across ${art.segments} segment(s)${art.clipped ? "; possible clipping detected" : ""}.`,
    applied: true,
  });
  if (art.ratio > 0.2 || art.clipped) {
    warnings.push("Some EEG segments contain excessive artifacts and were excluded or down-weighted.");
  }
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

export interface AnalysisResult {
  id: string;
  createdAt: string;
  recordingId: string;
  fileName: string;
  source: "upload" | "demo";
  recordingLabel?: string;
  samplingRate: number;
  channelNames: string[];
  analysedChannel: string;
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
  bandPowers: { band: string; absolute: number; relative: number }[];
  spectrogram: SpectrogramData;
  timeline: RiskTimelinePoint[];
  modelName: string;
  modelAlgorithm: string;
  modelDatasetOrigin: "synthetic" | "uploaded";
  featureCount: number;
  qualityStatus: string;
  recordingId_: string;
}

export interface RunAnalysisArgs {
  recording: EegRecording;
  channelIndex: number;
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

export function runAnalysis(args: RunAnalysisArgs): AnalysisResult {
  const { recording, channelIndex, windowStart, windowEnd, options, model, table } = args;
  const fs = recording.samplingRate;
  const raw = sliceWindow(recording, channelIndex, windowStart, windowEnd);
  const pre = preprocess(raw, fs, options);
  const { features, spectrum, bandPowers } = extractFeatures(pre.signal, fs);

  const qualityPenalty = Math.min(1, pre.artifactRatio * 3 + (pre.clipped ? 0.2 : 0));
  const risk = assessRisk({
    features,
    model,
    table,
    qualityPenalty,
    segmentSeconds: windowEnd - windowStart,
  });
  const contributions = explain(model, features, model.classes.indexOf(risk.predictedClass));

  const comparisons: AnalysisResult["comparisons"] = {
    interictal: compareToReference(features, table, "interictal"),
    preictal: compareToReference(features, table, "preictal"),
    ictal: compareToReference(features, table, "ictal"),
  };

  // Risk timeline over consecutive non-overlapping windows across the whole recording
  const winSec = Math.max(2, Math.min(30, windowEnd - windowStart));
  const timeline: RiskTimelinePoint[] = [];
  const maxWindows = 40;
  const step = Math.max(winSec, recording.durationSec / maxWindows);
  for (let t = 0; t + winSec <= recording.durationSec + 1e-6; t += step) {
    const seg = sliceWindow(recording, channelIndex, t, t + winSec);
    if (seg.length < fs) continue;
    const p = preprocess(seg, fs, options);
    const f = extractFeatures(p.signal, fs).features;
    const r = assessRisk({ features: f, model, table, segmentSeconds: winSec });
    timeline.push({
      start: t,
      end: t + winSec,
      risk: r.riskScore,
      classification: r.classification,
    });
  }

  const specData = spectrogram(pre.signal, fs, 1, Math.min(60, fs / 2));

  return {
    id: `an_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    recordingId: recording.id,
    recordingId_: recording.id,
    fileName: recording.fileName,
    source: recording.source,
    recordingLabel: recording.demoLabel,
    samplingRate: fs,
    channelNames: recording.channelNames,
    analysedChannel: recording.channelNames[channelIndex] ?? `CH${channelIndex + 1}`,
    windowStart,
    windowEnd,
    durationSec: recording.durationSec,
    preprocess: options,
    preprocessSteps: pre.steps,
    features,
    comparisons,
    risk,
    contributions,
    spectrum: Array.from(spectrum.freqs)
      .map((f, i) => ({ freq: f, power: spectrum.psd[i] }))
      .filter((p) => p.freq <= Math.min(60, fs / 2)),
    bandPowers,
    spectrogram: specData,
    timeline,
    modelName: model.name,
    modelAlgorithm: model.algorithm,
    modelDatasetOrigin: model.datasetOrigin,
    featureCount: model.featureKeys.length,
    qualityStatus: recording.quality.status,
  };
}
