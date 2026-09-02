/**
 * SYNTHETIC EEG GENERATOR — DEMO / RESEARCH SCAFFOLD ONLY.
 *
 * The signals produced here are mathematically generated and are NOT real
 * patient recordings. They exist so the full pipeline (upload -> preprocess ->
 * features -> reference comparison -> model -> risk) can be demonstrated and so
 * the reference distributions have a reproducible, inspectable origin.
 *
 * Replace `buildReferenceDataset()` with real labelled recordings (e.g. CHB-MIT,
 * Bonn, TUH) via the Model Training page for research-grade reference ranges.
 */
import { finalize, type EegRecording } from "./parse";

export type EegClass = "interictal" | "preictal" | "ictal";
export const CLASSES: EegClass[] = ["interictal", "preictal", "ictal"];
export const CLASS_LABEL: Record<EegClass, string> = {
  interictal: "Normal / Interictal",
  preictal: "Possible Preictal",
  ictal: "Possible Ictal",
};

/** Deterministic PRNG (mulberry32) so demo data and reference ranges are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  const u = Math.max(1e-9, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 1/f (pink-ish) background produced by summing decaying-amplitude sinusoids. */
function background(n: number, fs: number, r: () => number, amp: number): Float64Array {
  const out = new Float64Array(n);
  for (let f = 1; f <= 60; f += 1) {
    const a = amp / Math.pow(f, 0.9);
    const ph = r() * 2 * Math.PI;
    for (let i = 0; i < n; i++) out[i] += a * Math.sin((2 * Math.PI * f * i) / fs + ph);
  }
  for (let i = 0; i < n; i++) out[i] += amp * 0.35 * gauss(r);
  return out;
}

function addRhythm(x: Float64Array, fs: number, freq: number, amp: number, r: () => number) {
  const ph = r() * 2 * Math.PI;
  for (let i = 0; i < x.length; i++) x[i] += amp * Math.sin((2 * Math.PI * freq * i) / fs + ph);
}

function addSpikes(x: Float64Array, fs: number, rate: number, amp: number, r: () => number) {
  const n = x.length;
  const count = Math.round((rate * n) / fs);
  for (let s = 0; s < count; s++) {
    const c = Math.floor(r() * n);
    const w = Math.max(3, Math.floor(fs * 0.02));
    for (let i = -w; i <= w; i++) {
      const idx = c + i;
      if (idx < 0 || idx >= n) continue;
      x[idx] += amp * Math.exp(-(i * i) / (2 * (w / 2.2) ** 2)) * (i < 0 ? 1 : -0.6);
    }
  }
}

export interface SynthOptions {
  fs: number;
  seconds: number;
  seed: number;
  subjectFactor?: number; // subject-level amplitude/frequency variability
}

/** Generate one synthetic single-channel EEG epoch of a given class. */
export function synthEpoch(cls: EegClass, opts: SynthOptions): Float64Array {
  const { fs, seconds, seed } = opts;
  const sf = opts.subjectFactor ?? 1;
  const r = rng(seed);
  const n = Math.round(fs * seconds);

  if (cls === "interictal") {
    const x = background(n, fs, r, 6 * sf);
    addRhythm(x, fs, 9 + r() * 2.5, 22 * sf, r); // posterior alpha
    addRhythm(x, fs, 5 + r() * 2, 8 * sf, r);
    addSpikes(x, fs, 0.05 + r() * 0.1, 35 * sf, r);
    return x;
  }
  if (cls === "preictal") {
    const x = background(n, fs, r, 8 * sf);
    addRhythm(x, fs, 9 + r() * 2, 12 * sf, r);
    addRhythm(x, fs, 16 + r() * 8, 20 * sf, r); // beta build-up
    addRhythm(x, fs, 32 + r() * 12, 10 * sf, r); // gamma build-up
    addRhythm(x, fs, 4 + r() * 2, 14 * sf, r);
    addSpikes(x, fs, 0.6 + r() * 0.8, 60 * sf, r);
    // progressive amplitude ramp toward the end of the epoch
    for (let i = 0; i < n; i++) x[i] *= 1 + 0.6 * (i / n);
    return x;
  }
  // ictal: high-amplitude rhythmic spike-wave activity
  const x = background(n, fs, r, 10 * sf);
  const f0 = 3 + r() * 2.5;
  addRhythm(x, fs, f0, 110 * sf, r);
  addRhythm(x, fs, f0 * 2, 55 * sf, r);
  addRhythm(x, fs, f0 * 3, 28 * sf, r);
  addRhythm(x, fs, 25 + r() * 15, 25 * sf, r);
  addSpikes(x, fs, 3 + r() * 2, 150 * sf, r);
  return x;
}

/** Multi-channel synthetic demo recording that transitions interictal -> preictal -> ictal. */
export function buildDemoRecording(kind: EegClass | "evolving" = "evolving", fs = 256): EegRecording {
  const channelNames = ["Fp1", "F3", "C3", "P3", "O1", "T3"];
  const totalSec = kind === "evolving" ? 120 : 60;
  const data: Float64Array[] = channelNames.map((_, ci) => {
    if (kind !== "evolving") {
      return synthEpoch(kind, { fs, seconds: totalSec, seed: 1000 + ci, subjectFactor: 0.9 + ci * 0.04 });
    }
    const parts: Array<[EegClass, number]> = [
      ["interictal", 50],
      ["preictal", 40],
      ["ictal", 30],
    ];
    const out = new Float64Array(Math.round(fs * totalSec));
    let off = 0;
    parts.forEach(([cls, sec], pi) => {
      const seg = synthEpoch(cls, {
        fs,
        seconds: sec,
        seed: 2000 + ci * 17 + pi * 101,
        subjectFactor: 0.9 + ci * 0.04,
      });
      for (let i = 0; i < seg.length && off + i < out.length; i++) {
        // cross-fade 1 s between phases to avoid artificial step discontinuities
        const fade = Math.min(1, i / fs);
        out[off + i] = out[off + i] * (1 - fade) + seg[i] * fade;
      }
      off += seg.length;
    });
    return out;
  });

  return finalize({
    fileName: "synthetic_demo_eeg_evolving.csv",
    fileSize: 0,
    format: "DEMO",
    samplingRate: fs,
    samplingRateSource: "generated",
    channelNames,
    data,
    unit: "µV",
    amplitudeUnit: "µV",
    unitKnown: true,
    timeColumn: null,
    source: "demo",
    demoLabel: "Synthetic EEG — for testing/demo purposes only (not a real patient recording)",
    notes: [
      "Synthetic EEG — for testing/demo purposes only. Generated deterministically in the browser.",
      kind === "evolving"
        ? "Structure: 0–50 s interictal-like, 50–90 s preictal-like, 90–120 s ictal-like."
        : `Structure: uniform ${kind}-like activity.`,
    ],
  });
}
