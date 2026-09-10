/**
 * Digital signal processing primitives for EEG analysis.
 * All computations are real (no placeholder / random values).
 * Pure TypeScript so it runs in the browser; the same interfaces are used by
 * the pluggable processing backend (see src/lib/eeg/backend.ts).
 */

export type Signal = Float64Array;

export function toFloat64(a: number[] | Float64Array): Float64Array {
  return a instanceof Float64Array ? a : Float64Array.from(a);
}

/* ------------------------------- basic stats ------------------------------ */

export function mean(x: Signal): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return x.length ? s / x.length : 0;
}

export function variance(x: Signal): number {
  const m = mean(x);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] - m) ** 2;
  return x.length > 1 ? s / (x.length - 1) : 0;
}

export function std(x: Signal): number {
  return Math.sqrt(variance(x));
}

export function rms(x: Signal): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return x.length ? Math.sqrt(s / x.length) : 0;
}

export function energy(x: Signal): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return s;
}

export function peakAbs(x: Signal): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  return m;
}

export function peakToPeak(x: Signal): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < x.length; i++) {
    if (x[i] < lo) lo = x[i];
    if (x[i] > hi) hi = x[i];
  }
  return x.length ? hi - lo : 0;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
}

/* ------------------------------ preprocessing ----------------------------- */

/** Replace NaN / Inf by linear interpolation between valid neighbours. */
export function cleanInvalid(x: Signal): { out: Float64Array; invalidCount: number } {
  const out = Float64Array.from(x);
  let invalid = 0;
  let lastValid = NaN;
  for (let i = 0; i < out.length; i++) {
    if (!Number.isFinite(out[i])) {
      invalid++;
      let j = i + 1;
      while (j < out.length && !Number.isFinite(out[j])) j++;
      const next = j < out.length ? out[j] : lastValid;
      const prev = Number.isFinite(lastValid) ? lastValid : next;
      out[i] = Number.isFinite(prev) && Number.isFinite(next) ? (prev + next) / 2 : 0;
    } else {
      lastValid = out[i];
    }
  }
  return { out, invalidCount: invalid };
}

/** Baseline (DC / mean) removal. */
export function baselineCorrect(x: Signal): Float64Array {
  const m = mean(x);
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] - m;
  return out;
}

/** Windowed-sinc FIR kernel design (Blackman window). */
function sincKernel(fc: number, taps: number): Float64Array {
  const N = taps % 2 === 0 ? taps + 1 : taps;
  const k = new Float64Array(N);
  const M = N - 1;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const n = i - M / 2;
    const s = n === 0 ? 2 * Math.PI * fc : Math.sin(2 * Math.PI * fc * n) / n;
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / M) + 0.08 * Math.cos((4 * Math.PI * i) / M);
    k[i] = s * w;
    sum += k[i];
  }
  for (let i = 0; i < N; i++) k[i] /= sum;
  return k;
}

function convolveSame(x: Signal, kernel: Float64Array): Float64Array {
  const N = kernel.length;
  const half = (N - 1) / 2;
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let acc = 0;
    for (let j = 0; j < N; j++) {
      const idx = i + j - half;
      const v = idx < 0 ? x[0] : idx >= x.length ? x[x.length - 1] : x[idx];
      acc += v * kernel[j];
    }
    out[i] = acc;
  }
  return out;
}

/** Zero-phase-ish FIR band-pass filter (low cut + high cut, normalised freqs). */
export function bandpass(x: Signal, fs: number, low: number, high: number, taps = 101): Float64Array {
  const nyq = fs / 2;
  const hi = Math.min(high, nyq * 0.95);
  const lo = Math.max(low, 0.01);
  const lowPass = sincKernel(hi / fs, taps);
  const lp = convolveSame(x, lowPass);
  const lowPass2 = sincKernel(lo / fs, taps);
  const lp2 = convolveSame(x, lowPass2);
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = lp[i] - lp2[i]; // band = LP(hi) - LP(lo)
  return out;
}

/** IIR notch (biquad, bidirectional for zero phase) for power-line interference. */
export function notch(x: Signal, fs: number, f0: number, Q = 30): Float64Array {
  if (f0 <= 0 || f0 >= fs / 2) return Float64Array.from(x);
  const w0 = (2 * Math.PI * f0) / fs;
  const alpha = Math.sin(w0) / (2 * Q);
  const b0 = 1,
    b1 = -2 * Math.cos(w0),
    b2 = 1,
    a0 = 1 + alpha,
    a1 = -2 * Math.cos(w0),
    a2 = 1 - alpha;
  const apply = (sig: Float64Array) => {
    const y = new Float64Array(sig.length);
    let x1 = 0,
      x2 = 0,
      y1 = 0,
      y2 = 0;
    for (let i = 0; i < sig.length; i++) {
      const v = (b0 / a0) * sig[i] + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
      x2 = x1;
      x1 = sig[i];
      y2 = y1;
      y1 = v;
      y[i] = v;
    }
    return y;
  };
  const fwd = apply(Float64Array.from(x));
  const rev = apply(fwd.slice().reverse());
  return rev.reverse();
}

/** Z-score normalisation. */
export function normalize(x: Signal): Float64Array {
  const m = mean(x);
  const s = std(x) || 1;
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = (x[i] - m) / s;
  return out;
}

/** Artifact detection: fraction of samples exceeding k*robust sigma, plus flat/clipped detection. */
export function detectArtifacts(x: Signal, k = 6): { ratio: number; segments: number; clipped: boolean } {
  const med = median(Array.from(x));
  const mad = median(Array.from(x, (v) => Math.abs(v - med))) * 1.4826 || 1e-9;
  let count = 0;
  let segments = 0;
  let inSeg = false;
  for (let i = 0; i < x.length; i++) {
    const bad = Math.abs(x[i] - med) > k * mad;
    if (bad) {
      count++;
      if (!inSeg) {
        segments++;
        inSeg = true;
      }
    } else inSeg = false;
  }
  return { ratio: x.length ? count / x.length : 0, segments, clipped: detectClipping(x) };
}

/**
 * Rail-based clipping detection.
 *
 * True amplifier clipping shows up as *repeated consecutive* samples pinned at a
 * fixed rail near the signal minimum and maximum, not merely as samples close to
 * a single extreme peak. We therefore look for flat runs (>= 3 samples) sitting
 * inside a narrow tolerance band at either rail and require a meaningful sample
 * fraction, so quantisation noise or one genuine large spike is not misread as
 * clipping.
 */
export function detectClipping(x: Signal, minFraction = 0.005): boolean {
  const n = x.length;
  if (n < 64) return false;
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = x[i];
    if (!Number.isFinite(v)) continue;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  const span = mx - mn;
  if (!Number.isFinite(span) || span < 1e-12) return false; // flat signal, handled separately
  const tol = span * 0.002;

  const railRun = (isRail: (v: number) => boolean) => {
    let railed = 0;
    let run = 0;
    for (let i = 0; i <= n; i++) {
      const on = i < n && Number.isFinite(x[i]) && isRail(x[i]);
      if (on) run++;
      else {
        if (run >= 3) railed += run; // only sustained runs count as a rail
        run = 0;
      }
    }
    return railed / n;
  };

  const hi = railRun((v) => v >= mx - tol);
  const lo = railRun((v) => v <= mn + tol);
  const need = Math.max(minFraction, 5 / n);
  // both rails pinned, or one rail pinned for a substantial share of the record
  return (hi >= need && lo >= need) || hi >= need * 4 || lo >= need * 4;
}

/* ---------------------------------- FFT ----------------------------------- */

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place iterative radix-2 FFT. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export interface Spectrum {
  freqs: Float64Array;
  psd: Float64Array; // power spectral density (units^2 / Hz)
  df: number;
}

/** Welch periodogram with Hann window, 50% overlap. */
export function welchPsd(x: Signal, fs: number, segLen = 256): Spectrum {
  const n = Math.min(nextPow2(Math.min(segLen, x.length)), nextPow2(x.length));
  const step = Math.max(1, Math.floor(n / 2));
  const win = new Float64Array(n);
  let winPow = 0;
  for (let i = 0; i < n; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    winPow += win[i] * win[i];
  }
  const half = n / 2;
  const acc = new Float64Array(half);
  let segs = 0;
  for (let start = 0; start + n <= x.length; start += step) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = x[start + i] * win[i];
    fft(re, im);
    for (let k = 0; k < half; k++) {
      const p = (re[k] * re[k] + im[k] * im[k]) / (fs * winPow);
      acc[k] += k > 0 && k < half - 1 ? 2 * p : p;
    }
    segs++;
  }
  if (segs === 0) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < Math.min(n, x.length); i++) re[i] = x[i] * win[i];
    fft(re, im);
    for (let k = 0; k < half; k++) acc[k] = (re[k] * re[k] + im[k] * im[k]) / (fs * winPow);
    segs = 1;
  }
  const psd = new Float64Array(half);
  const freqs = new Float64Array(half);
  const df = fs / n;
  for (let k = 0; k < half; k++) {
    psd[k] = acc[k] / segs;
    freqs[k] = k * df;
  }
  return { freqs, psd, df };
}

export const BANDS: Record<string, [number, number]> = {
  delta: [0.5, 4],
  theta: [4, 8],
  alpha: [8, 13],
  beta: [13, 30],
  gamma: [30, 45],
};

/**
 * Relative power contained in a narrow band around the mains frequency
 * (f0 +/- bw) compared with the 0.5-fMax total. Used to detect and to verify
 * removal of power-line interference. Returns 0..1.
 */
export function powerlineRatio(sp: Spectrum, f0: number, fMax: number, bw = 2): number {
  const nyq = sp.freqs[sp.freqs.length - 1] ?? 0;
  if (f0 + bw > nyq) return 0;
  const line = bandPower(sp, f0 - bw, f0 + bw);
  const total = bandPower(sp, 0.5, Math.max(f0 + bw + 1, fMax));
  return total > 1e-15 ? Math.min(1, line / total) : 0;
}

export function bandPower(sp: Spectrum, lo: number, hi: number): number {
  let s = 0;
  for (let k = 0; k < sp.freqs.length; k++) {
    if (sp.freqs[k] >= lo && sp.freqs[k] < hi) s += sp.psd[k] * sp.df;
  }
  return s;
}

export function dominantFrequency(sp: Spectrum, minF = 0.5, maxF = Infinity): number {
  let best = 0;
  let f = 0;
  for (let k = 0; k < sp.freqs.length; k++) {
    if (sp.freqs[k] < minF || sp.freqs[k] > maxF) continue;
    if (sp.psd[k] > best) {
      best = sp.psd[k];
      f = sp.freqs[k];
    }
  }
  return f;
}

/** Shannon entropy of the normalised power spectrum, normalised to [0,1]. */
export function spectralEntropy(sp: Spectrum, fMax: number): number {
  let total = 0;
  const p: number[] = [];
  for (let k = 1; k < sp.freqs.length; k++) {
    if (sp.freqs[k] > fMax) break;
    p.push(sp.psd[k]);
    total += sp.psd[k];
  }
  if (total <= 0 || p.length < 2) return 0;
  let h = 0;
  for (const v of p) {
    const q = v / total;
    if (q > 0) h -= q * Math.log(q);
  }
  return h / Math.log(p.length);
}

export function spectralEdge(sp: Spectrum, fraction = 0.95, fMax = 100): number {
  let total = 0;
  for (let k = 1; k < sp.freqs.length && sp.freqs[k] <= fMax; k++) total += sp.psd[k];
  let acc = 0;
  for (let k = 1; k < sp.freqs.length && sp.freqs[k] <= fMax; k++) {
    acc += sp.psd[k];
    if (acc >= fraction * total) return sp.freqs[k];
  }
  return fMax;
}

/* --------------------------- complexity measures --------------------------- */

/** Sample entropy (m=2). Subsampled to keep O(N^2) tractable. */
export function sampleEntropy(x: Signal, m = 2, rFactor = 0.2, maxN = 800): number {
  const stride = Math.max(1, Math.ceil(x.length / maxN));
  const d: number[] = [];
  for (let i = 0; i < x.length; i += stride) d.push(x[i]);
  const N = d.length;
  if (N < m + 2) return 0;
  const sd = std(Float64Array.from(d));
  const r = rFactor * (sd || 1);
  const count = (mm: number) => {
    let c = 0;
    for (let i = 0; i + mm <= N; i++) {
      for (let j = i + 1; j + mm <= N; j++) {
        let ok = true;
        for (let k = 0; k < mm; k++) {
          if (Math.abs(d[i + k] - d[j + k]) > r) {
            ok = false;
            break;
          }
        }
        if (ok) c++;
      }
    }
    return c;
  };
  const B = count(m);
  const A = count(m + 1);
  if (B === 0 || A === 0) return 0;
  return -Math.log(A / B);
}

/** Hjorth parameters: activity, mobility, complexity. */
export function hjorth(x: Signal): { activity: number; mobility: number; complexity: number } {
  const d1 = new Float64Array(Math.max(0, x.length - 1));
  for (let i = 1; i < x.length; i++) d1[i - 1] = x[i] - x[i - 1];
  const d2 = new Float64Array(Math.max(0, d1.length - 1));
  for (let i = 1; i < d1.length; i++) d2[i - 1] = d1[i] - d1[i - 1];
  const v0 = variance(x) || 1e-12;
  const v1 = variance(d1) || 1e-12;
  const v2 = variance(d2) || 1e-12;
  const mob = Math.sqrt(v1 / v0);
  const comp = Math.sqrt(v2 / v1) / mob;
  return { activity: v0, mobility: mob, complexity: comp };
}

/** Line length (curve length) — a classic seizure-detection feature. */
export function lineLength(x: Signal): number {
  let s = 0;
  for (let i = 1; i < x.length; i++) s += Math.abs(x[i] - x[i - 1]);
  return x.length > 1 ? s / (x.length - 1) : 0;
}

export function zeroCrossingRate(x: Signal): number {
  let c = 0;
  for (let i = 1; i < x.length; i++) if (x[i - 1] <= 0 !== x[i] <= 0) c++;
  return x.length > 1 ? c / (x.length - 1) : 0;
}

/** Kurtosis (excess) and skewness. */
export function moments(x: Signal): { skew: number; kurt: number } {
  const m = mean(x);
  const s = std(x) || 1e-12;
  let m3 = 0;
  let m4 = 0;
  for (let i = 0; i < x.length; i++) {
    const z = (x[i] - m) / s;
    m3 += z ** 3;
    m4 += z ** 4;
  }
  const n = x.length || 1;
  return { skew: m3 / n, kurt: m4 / n - 3 };
}

/* --------------------------------- wavelet -------------------------------- */

/** Discrete wavelet transform (Daubechies db4), returns detail + approx energies. */
export function dwtEnergies(x: Signal, levels = 5): number[] {
  const h = [
    0.23037781330885523, 0.7148465705525415, 0.6308807679295904, -0.02798376941698385,
    -0.18703481171888114, 0.030841381835986965, 0.032883011666982945, -0.010597401784997278,
  ];
  const g = h.map((v, i) => (i % 2 === 0 ? h[h.length - 1 - i] : -h[h.length - 1 - i]));
  let a = Array.from(x);
  const out: number[] = [];
  for (let l = 0; l < levels; l++) {
    if (a.length < h.length * 2) break;
    const n = Math.floor(a.length / 2);
    const approx = new Array<number>(n).fill(0);
    const detail = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      let sa = 0;
      let sd = 0;
      for (let k = 0; k < h.length; k++) {
        const idx = (2 * i + k) % a.length;
        sa += h[k] * a[idx];
        sd += g[k] * a[idx];
      }
      approx[i] = sa;
      detail[i] = sd;
    }
    out.push(detail.reduce((s, v) => s + v * v, 0));
    a = approx;
  }
  out.push(a.reduce((s, v) => s + v * v, 0)); // final approximation energy
  return out;
}

/** Relative wavelet energy distribution + wavelet entropy. */
export function waveletFeatures(x: Signal, levels = 5): { relative: number[]; entropy: number } {
  const e = dwtEnergies(x, levels);
  const total = e.reduce((s, v) => s + v, 0) || 1e-12;
  const rel = e.map((v) => v / total);
  let h = 0;
  for (const p of rel) if (p > 0) h -= p * Math.log(p);
  return { relative: rel, entropy: h / Math.log(rel.length || 2) };
}

/* --------------------------- transient detection --------------------------- */

/**
 * Sharp-wave / spike-like transient detection.
 * These are FEATURES only; a detected transient is not a seizure.
 */
export function spikeFeatures(
  x: Signal,
  fs: number,
): { spikeRate: number; sharpness: number; burstRatio: number } {
  const med = median(Array.from(x));
  const mad = median(Array.from(x, (v) => Math.abs(v - med))) * 1.4826 || 1e-9;
  const thr = med + 5 * mad;
  let spikes = 0;
  let sharpSum = 0;
  let above = false;
  for (let i = 1; i < x.length - 1; i++) {
    const amp = Math.abs(x[i] - med);
    if (amp > thr && !above) {
      spikes++;
      above = true;
      const slope = Math.abs(x[i + 1] - 2 * x[i] + x[i - 1]) * fs * fs;
      sharpSum += slope;
    } else if (amp <= thr) above = false;
  }
  const durSec = x.length / fs || 1;
  // burst ratio: fraction of 0.25 s windows whose RMS is > 2x the median window RMS
  const w = Math.max(8, Math.floor(fs * 0.25));
  const rmsList: number[] = [];
  for (let s = 0; s + w <= x.length; s += w) rmsList.push(rms(x.subarray(s, s + w)));
  const medRms = median(rmsList) || 1e-9;
  const burst = rmsList.filter((v) => v > 2 * medRms).length / (rmsList.length || 1);
  return {
    spikeRate: spikes / durSec,
    sharpness: spikes ? sharpSum / spikes : 0,
    burstRatio: burst,
  };
}

/** Frame-to-frame change in dominant frequency and energy (sudden-change features). */
export function transitionFeatures(
  x: Signal,
  fs: number,
): { freqChange: number; energyChange: number } {
  const w = Math.max(64, Math.floor(fs * 1));
  const domFreqs: number[] = [];
  const energies: number[] = [];
  for (let s = 0; s + w <= x.length; s += w) {
    const seg = x.subarray(s, s + w);
    const sp = welchPsd(seg, fs, Math.min(256, w));
    domFreqs.push(dominantFrequency(sp));
    energies.push(energy(seg) / w);
  }
  const diff = (arr: number[]) => {
    if (arr.length < 2) return 0;
    let s = 0;
    for (let i = 1; i < arr.length; i++) s += Math.abs(arr[i] - arr[i - 1]);
    return s / (arr.length - 1);
  };
  const meanE = energies.reduce((s, v) => s + v, 0) / (energies.length || 1) || 1e-12;
  return { freqChange: diff(domFreqs), energyChange: diff(energies) / meanE };
}

/* -------------------------------- spectrogram ------------------------------ */

export interface SpectrogramData {
  times: number[];
  freqs: number[];
  values: number[][]; // [timeIndex][freqIndex] = 10*log10(psd)
  min: number;
  max: number;
}

export function spectrogram(x: Signal, fs: number, winSec = 1, fMax = 60): SpectrogramData {
  const w = Math.max(64, nextPow2(Math.floor(fs * winSec)));
  const step = Math.max(1, Math.floor(w / 2));
  const times: number[] = [];
  const values: number[][] = [];
  let freqs: number[] = [];
  let min = Infinity;
  let max = -Infinity;
  for (let s = 0; s + w <= x.length; s += step) {
    const sp = welchPsd(x.subarray(s, s + w), fs, w);
    if (!freqs.length) freqs = Array.from(sp.freqs).filter((f) => f <= fMax);
    const row: number[] = [];
    for (let k = 0; k < freqs.length; k++) {
      const v = 10 * Math.log10(sp.psd[k] + 1e-12);
      row.push(v);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    values.push(row);
    times.push(s / fs);
  }
  return { times, freqs, values, min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 1 };
}

/** Downsample for plotting using min/max decimation (keeps visual peaks). */
export function decimateForPlot(x: Signal, fs: number, t0: number, maxPoints = 1600) {
  const out: { t: number; v: number }[] = [];
  if (x.length <= maxPoints) {
    for (let i = 0; i < x.length; i++) out.push({ t: t0 + i / fs, v: x[i] });
    return out;
  }
  const bucket = Math.ceil(x.length / maxPoints);
  for (let i = 0; i < x.length; i += bucket) {
    const end = Math.min(i + bucket, x.length);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = i; j < end; j++) {
      if (x[j] < lo) lo = x[j];
      if (x[j] > hi) hi = x[j];
    }
    out.push({ t: t0 + i / fs, v: hi });
    out.push({ t: t0 + (i + bucket / 2) / fs, v: lo });
  }
  return out;
}
