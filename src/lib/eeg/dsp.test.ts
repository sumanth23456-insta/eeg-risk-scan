import { describe, expect, it } from "vitest";
import {
  BANDS,
  bandPower,
  bandpass,
  detectArtifacts,
  detectClipping,
  notch,
  powerlineRatio,
  welchPsd,
} from "./dsp";

const FS = 256;

function tone(freqHz: number, seconds = 8, amplitude = 20, fs = FS): Float64Array {
  const n = Math.round(seconds * fs);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / fs);
  return out;
}

function dominantFreq(x: Float64Array, fs = FS): number {
  const sp = welchPsd(x, fs, 1024);
  let best = 0;
  let bestIdx = 0;
  for (let i = 1; i < sp.psd.length; i++) {
    if (sp.psd[i] > best) {
      best = sp.psd[i];
      bestIdx = i;
    }
  }
  return sp.freqs[bestIdx];
}

describe("spectral estimation", () => {
  it("locates the dominant frequency of a pure tone", () => {
    for (const f of [2, 6, 10, 21, 38]) {
      expect(Math.abs(dominantFreq(tone(f)) - f)).toBeLessThan(1);
    }
  });

  it("puts a 10 Hz tone's power in the alpha band", () => {
    const sp = welchPsd(tone(10), FS, 1024);
    const total = bandPower(sp, 0.5, 45) || 1e-12;
    const alpha = bandPower(sp, ...BANDS.alpha) / total;
    const beta = bandPower(sp, ...BANDS.beta) / total;
    expect(alpha).toBeGreaterThan(0.8);
    expect(beta).toBeLessThan(0.1);
  });
});

describe("filters", () => {
  it("passes an in-band tone and attenuates an out-of-band tone", () => {
    const inBand = bandpass(tone(10), FS, 0.5, 45);
    const outBand = bandpass(tone(90), FS, 0.5, 45);
    const energy = (x: Float64Array) => x.reduce((s, v) => s + v * v, 0) / x.length;
    expect(energy(inBand)).toBeGreaterThan(0.5 * energy(tone(10)));
    expect(energy(outBand)).toBeLessThan(0.05 * energy(tone(90)));
  });

  it("removes 50 Hz interference without erasing the 10 Hz rhythm", () => {
    const alpha = tone(10);
    const mains = tone(50, 8, 15);
    const mixed = Float64Array.from(alpha, (v, i) => v + mains[i]);
    const before = powerlineRatio(welchPsd(mixed, FS, 1024), 50, 100);
    const after = powerlineRatio(welchPsd(notch(mixed, FS, 50), FS, 1024), 50, 100);
    expect(before).toBeGreaterThan(0.2);
    expect(after).toBeLessThan(before / 5);
    expect(Math.abs(dominantFreq(notch(mixed, FS, 50)) - 10)).toBeLessThan(1);
  });
});

describe("clipping detection", () => {
  it("does not flag a clean tone or a single large spike", () => {
    expect(detectClipping(tone(10))).toBe(false);
    const spiky = tone(10);
    spiky[500] = 500;
    spiky[501] = 500;
    expect(detectClipping(spiky)).toBe(false);
    expect(detectArtifacts(spiky).clipped).toBe(false);
  });

  it("flags a signal railed at fixed levels", () => {
    const x = Float64Array.from(tone(10, 8, 40), (v) => Math.max(-15, Math.min(15, v)));
    expect(detectClipping(x)).toBe(true);
  });
});
