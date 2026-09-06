/**
 * Reference pattern database + pattern comparison engine + risk model.
 *
 * Architecture (swappable):
 *   labelled dataset -> feature extraction -> per-class statistical distribution
 *                                          -> reference ranges (mean/sd/median/IQR/min/max)
 *                                          -> softmax logistic model (trained in-browser)
 *
 * The initial reference dataset is SYNTHETIC (see demo.ts). Researchers can
 * replace it with a real labelled dataset from the Model Training page; every
 * downstream page reads from the same interfaces, so no UI change is required.
 */
import { CLASSES, synthEpoch, type EegClass } from "./demo";
import { extractFeatures, FEATURE_KEYS, type FeatureVector } from "./features";
import { median, quantile } from "./dsp";

export interface Sample {
  subject: string;
  label: EegClass;
  features: FeatureVector;
}

export interface FeatureStats {
  mean: number;
  sd: number;
  median: number;
  q1: number;
  q3: number;
  min: number;
  max: number;
  n: number;
}

export type ReferenceTable = Record<EegClass, Record<string, FeatureStats>>;

export interface ReferenceDataset {
  name: string;
  origin: "synthetic" | "uploaded";
  samples: Sample[];
  subjects: string[];
  createdAt: string;
  fs: number;
  epochSec: number;
}

function statsOf(values: number[]): FeatureStats {
  const n = values.length;
  const m = values.reduce((s, v) => s + v, 0) / (n || 1);
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, n - 1));
  return {
    mean: m,
    sd,
    median: median(values),
    q1: quantile(values, 0.25),
    q3: quantile(values, 0.75),
    min: Math.min(...values),
    max: Math.max(...values),
    n,
  };
}

export function buildReferenceTable(ds: ReferenceDataset): ReferenceTable {
  const table = {} as ReferenceTable;
  for (const cls of CLASSES) {
    const rows = ds.samples.filter((s) => s.label === cls);
    const perFeature: Record<string, FeatureStats> = {};
    for (const key of FEATURE_KEYS) {
      perFeature[key] = statsOf(rows.map((r) => r.features[key] ?? 0));
    }
    table[cls] = perFeature;
  }
  return table;
}

/** Build the built-in synthetic reference dataset (deterministic). */
export function buildSyntheticDataset(
  subjectsPerClass = 6,
  epochsPerSubject = 5,
  fs = 256,
  epochSec = 10,
): ReferenceDataset {
  const samples: Sample[] = [];
  const subjects: string[] = [];
  CLASSES.forEach((cls, ci) => {
    for (let s = 0; s < subjectsPerClass; s++) {
      const subject = `SYN-${String.fromCharCode(65 + s)}`;
      if (!subjects.includes(subject)) subjects.push(subject);
      const subjectFactor = 0.75 + (s / subjectsPerClass) * 0.6;
      for (let e = 0; e < epochsPerSubject; e++) {
        const sig = synthEpoch(cls, {
          fs,
          seconds: epochSec,
          seed: 7919 * (ci + 1) + 131 * s + e,
          subjectFactor,
        });
        samples.push({ subject, label: cls, features: extractFeatures(sig, fs).features });
      }
    }
  });
  return {
    name: "Built-in synthetic reference set",
    origin: "synthetic",
    samples,
    subjects,
    createdAt: new Date().toISOString(),
    fs,
    epochSec,
  };
}

/* ---------------------------- softmax classifier --------------------------- */

export interface TrainedModel {
  name: string;
  algorithm: string;
  featureKeys: string[];
  mu: number[];
  sigma: number[];
  weights: number[][]; // [class][feature]
  bias: number[];
  classes: EegClass[];
  trainedAt: string;
  datasetName: string;
  datasetOrigin: "synthetic" | "uploaded";
  nTrain: number;
  nTest: number;
  split: "patient-wise" | "random";
  metrics: Metrics | null;
}

export interface Metrics {
  accuracy: number;
  perClass: Record<
    EegClass,
    { precision: number; recall: number; specificity: number; f1: number; auc: number; support: number }
  >;
  macroF1: number;
  macroAuc: number;
  confusion: number[][]; // [true][pred]
}

function standardize(samples: Sample[], keys: string[]) {
  const mu: number[] = [];
  const sigma: number[] = [];
  keys.forEach((k) => {
    const vals = samples.map((s) => s.features[k] ?? 0);
    const m = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, vals.length - 1)) || 1;
    mu.push(m);
    sigma.push(sd);
  });
  return { mu, sigma };
}

export function encode(f: FeatureVector, keys: string[], mu: number[], sigma: number[]): number[] {
  return keys.map((k, i) => {
    const v = (f[k] ?? 0 - mu[i]) as number;
    const z = ((f[k] ?? 0) - mu[i]) / (sigma[i] || 1);
    return Number.isFinite(z) ? Math.max(-8, Math.min(8, z)) : 0 * v;
  });
}

export function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0) || 1;
  return e.map((v) => v / s);
}

export interface TrainOptions {
  algorithm?: string;
  epochs?: number;
  lr?: number;
  l2?: number;
  split?: "patient-wise" | "random";
  testFraction?: number;
  featureKeys?: string[];
}

function fitSoftmax(
  train: Sample[],
  keys: string[],
  mu: number[],
  sigma: number[],
  classes: EegClass[],
  epochs: number,
  lr: number,
  l2: number,
) {
  const K = classes.length;
  const D = keys.length;
  const W = Array.from({ length: K }, () => new Array<number>(D).fill(0));
  const b = new Array<number>(K).fill(0);
  const X = train.map((s) => encode(s.features, keys, mu, sigma));
  const y = train.map((s) => classes.indexOf(s.label));
  const n = X.length || 1;
  for (let ep = 0; ep < epochs; ep++) {
    const gW = Array.from({ length: K }, () => new Array<number>(D).fill(0));
    const gb = new Array<number>(K).fill(0);
    for (let i = 0; i < X.length; i++) {
      const z = W.map((w, k) => w.reduce((s, wj, j) => s + wj * X[i][j], b[k]));
      const p = softmax(z);
      for (let k = 0; k < K; k++) {
        const err = p[k] - (y[i] === k ? 1 : 0);
        for (let j = 0; j < D; j++) gW[k][j] += (err * X[i][j]) / n;
        gb[k] += err / n;
      }
    }
    for (let k = 0; k < K; k++) {
      for (let j = 0; j < D; j++) W[k][j] -= lr * (gW[k][j] + l2 * W[k][j]);
      b[k] -= lr * gb[k];
    }
  }
  return { W, b };
}

function splitDataset(ds: ReferenceDataset, mode: "patient-wise" | "random", testFraction: number) {
  if (mode === "patient-wise") {
    const subjects = Array.from(new Set(ds.samples.map((s) => s.subject))).sort();
    const nTest = Math.max(1, Math.round(subjects.length * testFraction));
    const testSubjects = new Set(subjects.slice(-nTest));
    return {
      train: ds.samples.filter((s) => !testSubjects.has(s.subject)),
      test: ds.samples.filter((s) => testSubjects.has(s.subject)),
    };
  }
  const shuffled = [...ds.samples];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(((i * 9301 + 49297) % 233280) / 233280 * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const cut = Math.floor(shuffled.length * (1 - testFraction));
  return { train: shuffled.slice(0, cut), test: shuffled.slice(cut) };
}

function rocAuc(scores: number[], labels: number[]): number {
  const pairs = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s);
  const pos = labels.filter((l) => l === 1).length;
  const neg = labels.length - pos;
  if (!pos || !neg) return 0.5;
  let rankSum = 0;
  let i = 0;
  while (i < pairs.length) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1].s === pairs[i].s) j++;
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) if (pairs[k].y === 1) rankSum += avgRank;
    i = j + 1;
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

export function evaluate(model: TrainedModel, test: Sample[]): Metrics {
  const K = model.classes.length;
  const confusion = Array.from({ length: K }, () => new Array<number>(K).fill(0));
  const probsByClass: number[][] = Array.from({ length: K }, () => []);
  const truth: number[] = [];
  test.forEach((s) => {
    const p = predictProbs(model, s.features);
    const pred = p.indexOf(Math.max(...p));
    const t = model.classes.indexOf(s.label);
    confusion[t][pred]++;
    truth.push(t);
    for (let k = 0; k < K; k++) probsByClass[k].push(p[k]);
  });
  const total = test.length || 1;
  let correct = 0;
  for (let k = 0; k < K; k++) correct += confusion[k][k];
  const perClass = {} as Metrics["perClass"];
  let f1Sum = 0;
  let aucSum = 0;
  model.classes.forEach((cls, k) => {
    const tp = confusion[k][k];
    let fp = 0;
    let fn = 0;
    for (let i = 0; i < K; i++) {
      if (i !== k) {
        fp += confusion[i][k];
        fn += confusion[k][i];
      }
    }
    const tn = total - tp - fp - fn;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const specificity = tn + fp ? tn / (tn + fp) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    const auc = rocAuc(probsByClass[k], truth.map((t) => (t === k ? 1 : 0)));
    perClass[cls] = { precision, recall, specificity, f1, auc, support: tp + fn };
    f1Sum += f1;
    aucSum += auc;
  });
  return {
    accuracy: correct / total,
    perClass,
    macroF1: f1Sum / K,
    macroAuc: aucSum / K,
    confusion,
  };
}

export function trainModel(ds: ReferenceDataset, opts: TrainOptions = {}): TrainedModel {
  const keys = opts.featureKeys ?? FEATURE_KEYS;
  const split = opts.split ?? "patient-wise";
  const { train, test } = splitDataset(ds, split, opts.testFraction ?? 0.3);
  const { mu, sigma } = standardize(train.length ? train : ds.samples, keys);
  const { W, b } = fitSoftmax(
    train.length ? train : ds.samples,
    keys,
    mu,
    sigma,
    CLASSES,
    opts.epochs ?? 600,
    opts.lr ?? 0.5,
    opts.l2 ?? 0.01,
  );
  const model: TrainedModel = {
    name: `${opts.algorithm ?? "Multinomial logistic regression"} · ${ds.name}`,
    algorithm: opts.algorithm ?? "Multinomial logistic regression (softmax, L2)",
    featureKeys: keys,
    mu,
    sigma,
    weights: W,
    bias: b,
    classes: CLASSES,
    trainedAt: new Date().toISOString(),
    datasetName: ds.name,
    datasetOrigin: ds.origin,
    nTrain: train.length,
    nTest: test.length,
    split,
    metrics: null,
  };
  model.metrics = evaluate(model, test.length ? test : ds.samples);
  return model;
}

export function predictProbs(model: TrainedModel, f: FeatureVector): number[] {
  const x = encode(f, model.featureKeys, model.mu, model.sigma);
  const z = model.weights.map((w, k) => w.reduce((s, wj, j) => s + wj * x[j], model.bias[k]));
  return softmax(z);
}

/* -------------------------- comparison + risk score ------------------------ */

export interface ParameterComparison {
  key: string;
  value: number;
  reference: FeatureStats;
  z: number;
  status: "within" | "above" | "below";
}

export function compareToReference(
  f: FeatureVector,
  table: ReferenceTable,
  cls: EegClass,
): ParameterComparison[] {
  return FEATURE_KEYS.map((key) => {
    const ref = table[cls][key];
    const v = f[key] ?? 0;
    const z = ref.sd > 1e-12 ? (v - ref.mean) / ref.sd : 0;
    return {
      key,
      value: v,
      reference: ref,
      z,
      status: v > ref.q3 ? "above" : v < ref.q1 ? "below" : ("within" as const),
    } as ParameterComparison;
  });
}

/** Distance-based similarity: mean |z| against each class distribution -> similarity %. */
export function patternSimilarity(f: FeatureVector, table: ReferenceTable): Record<EegClass, number> {
  const dist = {} as Record<EegClass, number>;
  for (const cls of CLASSES) {
    let acc = 0;
    let n = 0;
    for (const key of FEATURE_KEYS) {
      const ref = table[cls][key];
      if (ref.sd <= 1e-12) continue;
      const z = ((f[key] ?? 0) - ref.mean) / ref.sd;
      acc += Math.min(64, z * z);
      n++;
    }
    dist[cls] = n ? Math.sqrt(acc / n) : Infinity;
  }
  // convert Mahalanobis-like distance to a bounded similarity, then normalise
  const sim = {} as Record<EegClass, number>;
  let total = 0;
  for (const cls of CLASSES) {
    const s = 1 / (1 + dist[cls]);
    sim[cls] = s;
    total += s;
  }
  for (const cls of CLASSES) sim[cls] = total ? (sim[cls] / total) * 100 : 0;
  return sim;
}

export interface FeatureContribution {
  key: string;
  contribution: number; // signed, standardised logit contribution
  z: number;
  direction: "increase" | "decrease";
}

/**
 * Explainability: for a softmax model, the signed contribution of feature j to
 * class k's logit is w[k][j] * z_j (standardised value). Reported relative to
 * the total absolute contribution for the predicted class.
 */
export function explain(model: TrainedModel, f: FeatureVector, classIdx: number): FeatureContribution[] {
  const x = encode(f, model.featureKeys, model.mu, model.sigma);
  const raw = model.featureKeys.map((key, j) => ({
    key,
    contribution: model.weights[classIdx][j] * x[j],
    z: x[j],
  }));
  const total = raw.reduce((s, r) => s + Math.abs(r.contribution), 0) || 1;
  return raw
    .map((r) => ({
      key: r.key,
      contribution: (r.contribution / total) * 100,
      z: r.z,
      direction: r.z >= 0 ? ("increase" as const) : ("decrease" as const),
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

/** Preprocessing configuration used to build the reference/synthetic dataset. */
export const REFERENCE_PREPROCESS_LABEL =
  "Band-pass 0.5–45 Hz (zero-phase FIR) · 50 Hz notch · DC removal · 8×MAD outlier limiting · amplitude in µV · fs 256 Hz";

export type Classification =
  | "Normal / Interictal Pattern"
  | "Possible Preictal Pattern"
  | "Possible Ictal Pattern"
  | "Uncertain / Insufficient Data"
  | "Unreliable / Insufficient-Quality Signal"
  | "Unreliable / Power-line Interference";

export interface RiskResult {
  probs: Record<EegClass, number>;
  similarity: Record<EegClass, number>;
  riskScore: number; // 0-100
  confidence: number; // 0-100
  classification: Classification;
  predictedClass: EegClass;
  earlyWarning: boolean;
  uncertain: boolean;
}

export interface RiskInput {
  features: FeatureVector;
  model: TrainedModel;
  table: ReferenceTable;
  qualityPenalty?: number; // 0..1, reduces confidence
  segmentSeconds: number;
  /** Whether the signal passed EEG sanity checks; false blocks classification. */
  eligible?: boolean;
  /** Human-readable reason when not eligible. */
  ineligibleReason?: string;
  /** Residual power-line power ratio after notch filtering (0..1). */
  powerlineRatio?: number;
}


/**
 * Risk score = 100 * (0.85 * P(preictal) + 1.0 * P(ictal)).
 * This is an algorithmic research score derived from the trained model output —
 * it is NOT a clinically validated seizure probability.
 */
export function assessRisk(input: RiskInput): RiskResult {
  const { features, model, table, segmentSeconds } = input;
  const pArr = predictProbs(model, features);
  const probs = {} as Record<EegClass, number>;
  model.classes.forEach((c, i) => (probs[c] = pArr[i]));
  const similarity = patternSimilarity(features, table);

  const riskScore = Math.max(0, Math.min(100, 100 * (0.85 * probs.preictal + probs.ictal)));
  const maxP = Math.max(...pArr);
  const idx = pArr.indexOf(maxP);
  const predictedClass = model.classes[idx];

  const penalty = input.qualityPenalty ?? 0;
  const shortSegment = segmentSeconds < 5;
  let confidence = Math.max(0, Math.min(100, maxP * 100 * (1 - penalty) * (shortSegment ? 0.6 : 1)));

  const uncertain = maxP < 0.45 || shortSegment || penalty > 0.5;
  const classification: Classification = uncertain
    ? "Uncertain / Insufficient Data"
    : predictedClass === "interictal"
      ? "Normal / Interictal Pattern"
      : predictedClass === "preictal"
        ? "Possible Preictal Pattern"
        : "Possible Ictal Pattern";
  if (uncertain) confidence = Math.min(confidence, 50);

  return {
    probs,
    similarity,
    riskScore,
    confidence,
    classification,
    predictedClass,
    earlyWarning: !uncertain && (classification === "Possible Preictal Pattern" || riskScore >= 60),
    uncertain,
  };
}
