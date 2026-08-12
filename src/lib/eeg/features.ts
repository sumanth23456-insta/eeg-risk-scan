/**
 * Feature extraction layer.
 * Produces a fixed, ordered feature vector from a single EEG segment.
 * Every value is computed from the actual samples — nothing is simulated.
 */
import {
  BANDS,
  bandPower,
  dominantFrequency,
  energy,
  hjorth,
  lineLength,
  mean,
  moments,
  peakAbs,
  peakToPeak,
  rms,
  sampleEntropy,
  spectralEdge,
  spectralEntropy,
  spikeFeatures,
  std,
  transitionFeatures,
  variance,
  waveletFeatures,
  welchPsd,
  zeroCrossingRate,
  type Spectrum,
} from "./dsp";

export type FeatureGroup = "time" | "frequency" | "complexity" | "wavelet" | "transient";

export interface FeatureMeta {
  key: string;
  label: string;
  unit: string;
  group: FeatureGroup;
  description: string;
}

export const FEATURES: FeatureMeta[] = [
  { key: "meanAmplitude", label: "Mean amplitude", unit: "µV", group: "time", description: "Arithmetic mean of the segment (post baseline correction it approaches 0)." },
  { key: "rms", label: "RMS amplitude", unit: "µV", group: "time", description: "Root-mean-square amplitude of the segment." },
  { key: "variance", label: "Variance", unit: "µV²", group: "time", description: "Sample variance of the amplitude." },
  { key: "std", label: "Standard deviation", unit: "µV", group: "time", description: "Amplitude dispersion." },
  { key: "energy", label: "Signal energy", unit: "µV²·s", group: "time", description: "Sum of squared samples normalised by sampling rate." },
  { key: "peak", label: "Peak amplitude", unit: "µV", group: "time", description: "Maximum absolute deflection." },
  { key: "p2p", label: "Peak-to-peak amplitude", unit: "µV", group: "time", description: "Difference between maximum and minimum sample." },
  { key: "kurtosis", label: "Kurtosis (excess)", unit: "-", group: "time", description: "Tailedness of the amplitude distribution; sensitive to transients." },
  { key: "zcr", label: "Zero-crossing rate", unit: "1/sample", group: "time", description: "Proportion of consecutive samples crossing zero." },

  { key: "deltaAbs", label: "Delta power (0.5–4 Hz)", unit: "µV²", group: "frequency", description: "Absolute band power." },
  { key: "thetaAbs", label: "Theta power (4–8 Hz)", unit: "µV²", group: "frequency", description: "Absolute band power." },
  { key: "alphaAbs", label: "Alpha power (8–13 Hz)", unit: "µV²", group: "frequency", description: "Absolute band power." },
  { key: "betaAbs", label: "Beta power (13–30 Hz)", unit: "µV²", group: "frequency", description: "Absolute band power." },
  { key: "gammaAbs", label: "Gamma power (30–100 Hz)", unit: "µV²", group: "frequency", description: "Absolute band power (requires fs > 60 Hz)." },
  { key: "deltaRel", label: "Relative delta power", unit: "ratio", group: "frequency", description: "Delta power / total 0.5–100 Hz power." },
  { key: "thetaRel", label: "Relative theta power", unit: "ratio", group: "frequency", description: "Theta power / total power." },
  { key: "alphaRel", label: "Relative alpha power", unit: "ratio", group: "frequency", description: "Alpha power / total power." },
  { key: "betaRel", label: "Relative beta power", unit: "ratio", group: "frequency", description: "Beta power / total power." },
  { key: "gammaRel", label: "Relative gamma power", unit: "ratio", group: "frequency", description: "Gamma power / total power." },
  { key: "totalPower", label: "Total spectral power", unit: "µV²", group: "frequency", description: "Integrated PSD from 0.5 to 100 Hz." },
  { key: "dominantFreq", label: "Dominant frequency", unit: "Hz", group: "frequency", description: "Frequency of maximum spectral density." },
  { key: "spectralEdge95", label: "Spectral edge frequency (95%)", unit: "Hz", group: "frequency", description: "Frequency below which 95% of power lies." },
  { key: "thetaAlphaRatio", label: "Theta / alpha ratio", unit: "ratio", group: "frequency", description: "Slow-to-posterior-rhythm power ratio." },
  { key: "betaAlphaRatio", label: "Beta / alpha ratio", unit: "ratio", group: "frequency", description: "Fast-to-posterior-rhythm power ratio." },
  { key: "highLowRatio", label: "High / low frequency ratio", unit: "ratio", group: "frequency", description: "(Beta+gamma) / (delta+theta) power." },

  { key: "spectralEntropy", label: "Spectral entropy", unit: "0–1", group: "complexity", description: "Normalised Shannon entropy of the power spectrum." },
  { key: "sampleEntropy", label: "Sample entropy", unit: "nats", group: "complexity", description: "Regularity measure (m=2, r=0.2·SD)." },
  { key: "hjorthMobility", label: "Hjorth mobility", unit: "-", group: "complexity", description: "Mean frequency proxy from signal derivatives." },
  { key: "hjorthComplexity", label: "Hjorth complexity", unit: "-", group: "complexity", description: "Bandwidth / shape-change proxy." },
  { key: "lineLength", label: "Line length", unit: "µV/sample", group: "complexity", description: "Mean absolute sample-to-sample change." },

  { key: "waveletEntropy", label: "Wavelet entropy", unit: "0–1", group: "wavelet", description: "Entropy of the relative wavelet energy distribution (db4)." },
  { key: "waveletD1", label: "Wavelet D1 relative energy", unit: "ratio", group: "wavelet", description: "Highest-frequency detail band energy share." },
  { key: "waveletD2", label: "Wavelet D2 relative energy", unit: "ratio", group: "wavelet", description: "Detail level 2 energy share." },
  { key: "waveletD3", label: "Wavelet D3 relative energy", unit: "ratio", group: "wavelet", description: "Detail level 3 energy share." },
  { key: "waveletD4", label: "Wavelet D4 relative energy", unit: "ratio", group: "wavelet", description: "Detail level 4 energy share." },
  { key: "waveletA", label: "Wavelet approximation energy", unit: "ratio", group: "wavelet", description: "Low-frequency approximation energy share." },

  { key: "spikeRate", label: "Sharp-transient rate", unit: "1/s", group: "transient", description: "Rate of >5·MAD deflections. A feature, NOT a spike diagnosis." },
  { key: "sharpness", label: "Transient sharpness", unit: "µV/s²", group: "transient", description: "Mean second derivative at detected transients." },
  { key: "burstRatio", label: "High-amplitude burst ratio", unit: "ratio", group: "transient", description: "Fraction of 250 ms windows with RMS > 2× median." },
  { key: "freqChange", label: "Dominant-frequency change", unit: "Hz/s", group: "transient", description: "Mean absolute change of dominant frequency between 1 s frames." },
  { key: "energyChange", label: "Energy change rate", unit: "ratio", group: "transient", description: "Mean relative energy change between 1 s frames." },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);

export type FeatureVector = Record<string, number>;

export interface ExtractionResult {
  features: FeatureVector;
  spectrum: Spectrum;
  bandPowers: { band: string; absolute: number; relative: number }[];
}

function safeRatio(a: number, b: number) {
  return b > 1e-12 ? a / b : 0;
}

export function extractFeatures(x: Float64Array, fs: number): ExtractionResult {
  const sp = welchPsd(x, fs, Math.min(1024, Math.max(64, 2 ** Math.round(Math.log2(fs * 2)))));
  const nyq = fs / 2;
  const gammaHi = Math.min(100, nyq);
  const abs: Record<string, number> = {};
  for (const [name, [lo, hi]] of Object.entries(BANDS)) {
    abs[name] = hi <= nyq ? bandPower(sp, lo, Math.min(hi, nyq)) : lo < nyq ? bandPower(sp, lo, nyq) : 0;
  }
  const total = bandPower(sp, 0.5, gammaHi) || 1e-12;
  const h = hjorth(x);
  const wav = waveletFeatures(x, 5);
  const sf = spikeFeatures(x, fs);
  const tf = transitionFeatures(x, fs);
  const mom = moments(x);

  const features: FeatureVector = {
    meanAmplitude: mean(x),
    rms: rms(x),
    variance: variance(x),
    std: std(x),
    energy: energy(x) / fs,
    peak: peakAbs(x),
    p2p: peakToPeak(x),
    kurtosis: mom.kurt,
    zcr: zeroCrossingRate(x),

    deltaAbs: abs.delta,
    thetaAbs: abs.theta,
    alphaAbs: abs.alpha,
    betaAbs: abs.beta,
    gammaAbs: abs.gamma,
    deltaRel: safeRatio(abs.delta, total),
    thetaRel: safeRatio(abs.theta, total),
    alphaRel: safeRatio(abs.alpha, total),
    betaRel: safeRatio(abs.beta, total),
    gammaRel: safeRatio(abs.gamma, total),
    totalPower: total,
    dominantFreq: dominantFrequency(sp),
    spectralEdge95: spectralEdge(sp, 0.95, gammaHi),
    thetaAlphaRatio: safeRatio(abs.theta, abs.alpha),
    betaAlphaRatio: safeRatio(abs.beta, abs.alpha),
    highLowRatio: safeRatio(abs.beta + abs.gamma, abs.delta + abs.theta),

    spectralEntropy: spectralEntropy(sp, gammaHi),
    sampleEntropy: sampleEntropy(x),
    hjorthMobility: h.mobility,
    hjorthComplexity: h.complexity,
    lineLength: lineLength(x),

    waveletEntropy: wav.entropy,
    waveletD1: wav.relative[0] ?? 0,
    waveletD2: wav.relative[1] ?? 0,
    waveletD3: wav.relative[2] ?? 0,
    waveletD4: wav.relative[3] ?? 0,
    waveletA: wav.relative[wav.relative.length - 1] ?? 0,

    spikeRate: sf.spikeRate,
    sharpness: sf.sharpness,
    burstRatio: sf.burstRatio,
    freqChange: tf.freqChange,
    energyChange: tf.energyChange,
  };

  for (const k of FEATURE_KEYS) if (!Number.isFinite(features[k])) features[k] = 0;

  const bandPowers = Object.keys(BANDS).map((band) => ({
    band: band[0].toUpperCase() + band.slice(1),
    absolute: abs[band],
    relative: safeRatio(abs[band], total),
  }));

  return { features, spectrum: sp, bandPowers };
}

export function featureMeta(key: string): FeatureMeta {
  return (
    FEATURES.find((f) => f.key === key) ?? {
      key,
      label: key,
      unit: "-",
      group: "time",
      description: "",
    }
  );
}
