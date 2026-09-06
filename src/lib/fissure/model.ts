/**
 * Optional demonstration classifier for the fissure workflow.
 * It is only ever trained on data the user supplies or on clearly labelled
 * synthetic demonstration data — no clinical validation is claimed anywhere.
 */
import type { FissureClinical, PatientInfo } from "./types";

export type FissureLabel = "No Fissure" | "Fissure";

/** Clinical / patient features (never EEG). */
export const CLINICAL_FEATURES = [
  "age",
  "sexMale",
  "painSeverity",
  "painDuring",
  "painAfter",
  "bleeding",
  "bleedSeverity",
  "constipation",
  "hardStool",
  "straining",
  "durationDays",
  "prevHistory",
] as const;

/** EEG-derived features (never patient metadata). */
export const EEG_FEATURES = [
  "deltaPower",
  "thetaPower",
  "alphaPower",
  "betaPower",
  "gammaPower",
  "rmsAmplitude",
  "peakFrequency",
  "totalSpectralPower",
] as const;

export interface LabeledSample {
  subjectId: string;
  clinical: number[];
  eeg: number[];
  label: FissureLabel;
  synthetic: boolean;
}

export interface FissureMetrics {
  datasetSize: number;
  trainSize: number;
  valSize: number;
  testSize: number;
  classDistribution: Record<FissureLabel, number>;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  confusion: { tp: number; fp: number; tn: number; fn: number };
}

export interface FissureModel {
  name: string;
  trainedAt: string;
  synthetic: boolean;
  featureNames: string[];
  weights: number[];
  bias: number;
  mean: number[];
  sd: number[];
  metrics: FissureMetrics;
}

export function clinicalVector(p: PatientInfo, c: FissureClinical): number[] {
  const bleed = { none: 0, mild: 1, moderate: 2, severe: 3 }[c.bleedingSeverity || "none"] ?? 0;
  const strain = { never: 0, sometimes: 1, frequently: 2 }[c.straining || "never"] ?? 0;
  return [
    p.age ?? 0,
    p.sex === "male" ? 1 : 0,
    c.painSeverity,
    c.painDuringDefecation === "yes" ? 1 : 0,
    c.painAfterDefecation === "yes" ? 1 : 0,
    c.rectalBleeding === "yes" ? 1 : 0,
    bleed,
    c.constipation === "yes" ? 1 : 0,
    c.stoolConsistency === "hard" ? 1 : 0,
    strain,
    c.symptomDurationDays ?? 0,
    p.previousFissureHistory === "yes" ? 1 : 0,
  ];
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Synthetic Data — Demonstration Only. */
export function buildSyntheticClinicalDataset(n = 240, seed = 42): LabeledSample[] {
  const r = rng(seed);
  const out: LabeledSample[] = [];
  for (let i = 0; i < n; i++) {
    const positive = r() < 0.45;
    const pain = positive ? 4 + Math.floor(r() * 7) : Math.floor(r() * 4);
    const clinical = [
      18 + Math.floor(r() * 55),
      r() < 0.5 ? 1 : 0,
      pain,
      positive && r() < 0.85 ? 1 : r() < 0.15 ? 1 : 0,
      positive && r() < 0.7 ? 1 : r() < 0.12 ? 1 : 0,
      positive && r() < 0.7 ? 1 : r() < 0.1 ? 1 : 0,
      positive ? Math.floor(r() * 4) : Math.floor(r() * 2),
      positive && r() < 0.7 ? 1 : r() < 0.25 ? 1 : 0,
      positive && r() < 0.75 ? 1 : r() < 0.2 ? 1 : 0,
      positive ? 1 + Math.floor(r() * 2) : Math.floor(r() * 2),
      positive ? Math.floor(r() * 120) : Math.floor(r() * 20),
      positive && r() < 0.4 ? 1 : r() < 0.05 ? 1 : 0,
    ];
    const eeg = EEG_FEATURES.map(() => r() * 100);
    out.push({
      subjectId: `SYN-${String(i + 1).padStart(3, "0")}`,
      clinical,
      eeg,
      label: positive ? "Fissure" : "No Fissure",
      synthetic: true,
    });
  }
  return out;
}

export interface TrainConfig {
  includeEeg: boolean;
  epochs?: number;
  lr?: number;
  l2?: number;
}

export function trainFissureModel(samples: LabeledSample[], cfg: TrainConfig): FissureModel {
  if (samples.length < 12) throw new Error("At least 12 labelled samples are required to train.");
  const featureNames = [
    ...CLINICAL_FEATURES,
    ...(cfg.includeEeg ? EEG_FEATURES : []),
  ] as unknown as string[];
  const X = samples.map((s) => (cfg.includeEeg ? [...s.clinical, ...s.eeg] : s.clinical));
  const y = samples.map((s) => (s.label === "Fissure" ? 1 : 0));

  // subject-wise deterministic split 60/20/20
  const order = samples.map((_, i) => i);
  const nTrain = Math.floor(order.length * 0.6);
  const nVal = Math.floor(order.length * 0.2);
  const trainIdx = order.slice(0, nTrain);
  const valIdx = order.slice(nTrain, nTrain + nVal);
  const testIdx = order.slice(nTrain + nVal);

  // standardise using training data only
  const d = featureNames.length;
  const mean = Array(d).fill(0);
  const sd = Array(d).fill(1);
  for (let j = 0; j < d; j++) {
    const vals = trainIdx.map((i) => X[i][j]);
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    const v = vals.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, vals.length - 1);
    mean[j] = m;
    sd[j] = Math.sqrt(v) || 1;
  }
  const z = (row: number[]) => row.map((v, j) => (v - mean[j]) / sd[j]);

  let w = Array(d).fill(0);
  let b = 0;
  const lr = cfg.lr ?? 0.1;
  const l2 = cfg.l2 ?? 0.01;
  const epochs = cfg.epochs ?? 400;
  for (let e = 0; e < epochs; e++) {
    const gw = Array(d).fill(0);
    let gb = 0;
    for (const i of trainIdx) {
      const xi = z(X[i]);
      const p = 1 / (1 + Math.exp(-(xi.reduce((a, v, j) => a + v * w[j], 0) + b)));
      const err = p - y[i];
      for (let j = 0; j < d; j++) gw[j] += err * xi[j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= (lr * (gw[j] / trainIdx.length + l2 * w[j]));
    b -= lr * (gb / trainIdx.length);
  }

  const predict = (i: number) => {
    const xi = z(X[i]);
    return 1 / (1 + Math.exp(-(xi.reduce((a, v, j) => a + v * w[j], 0) + b))) >= 0.5 ? 1 : 0;
  };
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  for (const i of testIdx) {
    const p = predict(i);
    if (p === 1 && y[i] === 1) tp++;
    else if (p === 1 && y[i] === 0) fp++;
    else if (p === 0 && y[i] === 0) tn++;
    else fn++;
  }
  const acc = (tp + tn) / Math.max(1, testIdx.length);
  const prec = tp / Math.max(1, tp + fp);
  const rec = tp / Math.max(1, tp + fn);
  const f1 = (2 * prec * rec) / Math.max(1e-9, prec + rec);

  return {
    name: samples.every((s) => s.synthetic)
      ? "Synthetic Data — Demonstration Only"
      : "User-supplied labelled dataset",
    trainedAt: new Date().toISOString(),
    synthetic: samples.every((s) => s.synthetic),
    featureNames,
    weights: w,
    bias: b,
    mean,
    sd,
    metrics: {
      datasetSize: samples.length,
      trainSize: trainIdx.length,
      valSize: valIdx.length,
      testSize: testIdx.length,
      classDistribution: {
        Fissure: samples.filter((s) => s.label === "Fissure").length,
        "No Fissure": samples.filter((s) => s.label === "No Fissure").length,
      },
      accuracy: acc,
      precision: prec,
      recall: rec,
      f1,
      confusion: { tp, fp, tn, fn },
    },
  };
}
