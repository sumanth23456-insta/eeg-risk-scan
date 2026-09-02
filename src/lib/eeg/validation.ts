/**
 * Sampling-rate / Nyquist / analysed-frequency-range validation.
 *
 * Central place that decides which frequency content a recording can actually
 * support, so the interface never claims that a band was analysed when the
 * sampling rate or the preprocessing filter removed it.
 */
import { BANDS } from "./dsp";

export const BAND_DEFINITIONS: { name: string; label: string; lo: number; hi: number }[] = Object.entries(
  BANDS,
).map(([name, [lo, hi]]) => ({
  name,
  label: name[0].toUpperCase() + name.slice(1),
  lo,
  hi,
}));

/** Frequency the full analysis pipeline targets (top of the gamma band, 45 Hz). */
export const TARGET_MAX_FREQ = 45;
/** Sampling rate required to analyse the complete 30–45 Hz gamma band. */
export const MIN_FS_FOR_FULL_GAMMA = 128;

/** Highest frequency that can be analysed safely (kept below Nyquist). */
export function maxAnalyzableFreq(fs: number): number {
  if (!Number.isFinite(fs) || fs <= 0) return 0;
  return Math.min(TARGET_MAX_FREQ, Math.max(1, 0.4 * fs));
}

export interface SamplingRateValidation {
  valid: boolean;
  nyquist: number;
  maxAnalyzable: number;
  fullGamma: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSamplingRate(fs: number): SamplingRateValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Number.isFinite(fs) || fs <= 0) {
    return {
      valid: false,
      nyquist: 0,
      maxAnalyzable: 0,
      fullGamma: false,
      errors: ["Invalid sampling rate: enter a positive sampling frequency in Hz."],
      warnings,
    };
  }
  if (fs < 32) {
    errors.push(
      `Invalid sampling rate: ${fs} Hz cannot support the requested frequency range (minimum 32 Hz).`,
    );
  }
  const nyquist = fs / 2;
  const maxAnalyzable = maxAnalyzableFreq(fs);
  const fullGamma = fs >= MIN_FS_FOR_FULL_GAMMA;
  if (!fullGamma && fs >= 32) {
    warnings.push(
      `Gamma analysis requires a sampling frequency of at least ${MIN_FS_FOR_FULL_GAMMA} Hz for the 30–45 Hz range. Analysis is limited to ${maxAnalyzable.toFixed(1)} Hz (Nyquist ${nyquist.toFixed(1)} Hz).`,
    );
  }
  if (fs < 75) {
    warnings.push("Sampling rate below 75 Hz — the gamma band (30–45 Hz) cannot be evaluated at all.");
  }
  return { valid: errors.length === 0, nyquist, maxAnalyzable, fullGamma, errors, warnings };
}

export interface AnalyzedRange {
  low: number;
  high: number;
  nyquist: number;
  limitedBy: "filter" | "sampling-rate";
  label: string;
}

/** Effective analysed range given the sampling rate and the requested band-pass. */
export function analyzedRange(
  fs: number,
  requested: { bandpass: boolean; bandLow: number; bandHigh: number },
): AnalyzedRange {
  const nyquist = fs / 2;
  const ceiling = maxAnalyzableFreq(fs);
  const requestedHigh = requested.bandpass ? requested.bandHigh : TARGET_MAX_FREQ;
  const high = Math.min(requestedHigh, ceiling);
  const low = requested.bandpass ? Math.max(0.1, requested.bandLow) : 0.5;
  return {
    low,
    high,
    nyquist,
    limitedBy: high < requestedHigh ? "sampling-rate" : "filter",
    label: `${low}–${high.toFixed(high % 1 ? 1 : 0)} Hz`,
  };
}

export type BandCoverage = "full" | "partial" | "unavailable";

export interface BandStatus {
  name: string;
  label: string;
  lo: number;
  hi: number;
  coverage: BandCoverage;
  analysedHi: number;
}

/** Per-band availability after sampling rate + preprocessing limits. */
export function bandCoverage(range: AnalyzedRange): BandStatus[] {
  return BAND_DEFINITIONS.map((b) => {
    const lo = Math.max(b.lo, range.low);
    const hi = Math.min(b.hi, range.high);
    const coverage: BandCoverage = hi <= lo ? "unavailable" : hi >= b.hi && lo <= b.lo ? "full" : "partial";
    return { ...b, coverage, analysedHi: Math.max(lo, hi) };
  });
}


/* -------------------------- column / unit validation ----------------------- */

const TIME_NAME_RE = /^(time|time_s|time_sec|time_seconds|timestamp|t|sec|secs|seconds|ms|millis|sample|samples|index|idx)$/i;

/** True when a column NAME denotes a time / index axis rather than an EEG channel. */
export function isTimeColumnName(name: string): boolean {
  const n = (name ?? "").trim().replace(/[\[\](){}]/g, "");
  if (TIME_NAME_RE.test(n)) return true;
  return /^time\b|_time$|\btime[_ -]?(s|sec|ms)$|timestamp/i.test(n);
}

/** True when a numeric column behaves like a time axis (monotonic, near-uniform). */
export function looksLikeTimeSeriesAxis(col: number[]): boolean {
  if (col.length < 8) return false;
  const diffs: number[] = [];
  for (let i = 1; i < col.length; i++) diffs.push(col[i] - col[i - 1]);
  if (diffs.some((d) => !Number.isFinite(d) || d <= 0)) return false;
  const sorted = [...diffs].sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1];
  if (!(med > 0)) return false;
  const jitter = diffs.filter((d) => Math.abs(d - med) > 0.25 * med).length / diffs.length;
  return jitter < 0.05;
}

export interface TimeAxisInfo {
  fs: number;
  uniform: boolean;
  jitterRatio: number;
  medianStep: number;
}

/** fs = 1 / median(diff(time)) with a uniformity check. */
export function samplingRateFromTime(col: number[]): TimeAxisInfo | null {
  if (col.length < 4) return null;
  const diffs: number[] = [];
  for (let i = 1; i < col.length; i++) {
    const d = col[i] - col[i - 1];
    if (Number.isFinite(d)) diffs.push(d);
  }
  if (!diffs.length) return null;
  const sorted = [...diffs].sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1];
  if (!(med > 0)) return null;
  const jitterRatio = diffs.filter((d) => Math.abs(d - med) > 0.25 * med).length / diffs.length;
  return { fs: 1 / med, uniform: jitterRatio < 0.05, jitterRatio, medianStep: med };
}

export type AmplitudeUnit = "µV" | "mV" | "V" | "unknown";

/** Multiplier that converts a value in `unit` to microvolts. */
export function toMicrovoltFactor(unit: AmplitudeUnit): number {
  return unit === "V" ? 1e6 : unit === "mV" ? 1e3 : 1;
}

/**
 * Heuristic ONLY — used to suggest a unit, never to silently claim one.
 * Typical scalp EEG is tens of µV peak-to-peak.
 */
export function suggestAmplitudeUnit(rmsValue: number): AmplitudeUnit {
  if (!Number.isFinite(rmsValue) || rmsValue <= 0) return "unknown";
  if (rmsValue > 2) return "µV";
  if (rmsValue > 2e-3) return "mV";
  return "V";
}

/* ------------------------------ EEG sanity check --------------------------- */

export type SanityLevel = "pass" | "warning" | "fail";

export interface SanityCheckItem {
  name: string;
  level: SanityLevel;
  detail: string;
}

export interface SanityCheck {
  level: SanityLevel;
  eligible: boolean;
  reason: string;
  items: SanityCheckItem[];
}

export function worstLevel(items: SanityCheckItem[]): SanityLevel {
  return items.some((i) => i.level === "fail")
    ? "fail"
    : items.some((i) => i.level === "warning")
      ? "warning"
      : "pass";
}
