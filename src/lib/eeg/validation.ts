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

/** Frequency the full analysis pipeline targets (top of the gamma band). */
export const TARGET_MAX_FREQ = 100;
/** Sampling rate required to analyse the complete 30–100 Hz gamma band. */
export const MIN_FS_FOR_FULL_GAMMA = 200;

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
  const fullGamma = fs > MIN_FS_FOR_FULL_GAMMA;
  if (!fullGamma && fs >= 32) {
    warnings.push(
      `Gamma analysis requires a sampling frequency greater than ${MIN_FS_FOR_FULL_GAMMA} Hz for the 30–100 Hz range. Analysis is limited to ${maxAnalyzable.toFixed(1)} Hz (Nyquist ${nyquist.toFixed(1)} Hz).`,
    );
  }
  if (fs < 100) {
    warnings.push("Sampling rate below 100 Hz — the gamma band cannot be evaluated at all.");
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
