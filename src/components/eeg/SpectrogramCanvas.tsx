import { useEffect, useRef } from "react";
import type { SpectrogramData } from "@/lib/eeg/dsp";

/** Renders a time-frequency map (dB power) with a perceptual blue→cyan→amber→red ramp. */
export function SpectrogramCanvas({ data, height = 220 }: { data: SpectrogramData; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const nT = data.values.length;
    const nF = data.freqs.length;
    if (!nT || !nF) return;
    const w = canvas.clientWidth || 600;
    canvas.width = w;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(w, height);
    const range = Math.max(1e-6, data.max - data.min);
    for (let px = 0; px < w; px++) {
      const ti = Math.min(nT - 1, Math.floor((px / w) * nT));
      for (let py = 0; py < height; py++) {
        const fi = Math.min(nF - 1, Math.floor(((height - 1 - py) / height) * nF));
        const norm = Math.max(0, Math.min(1, (data.values[ti][fi] - data.min) / range));
        const [r, g, b] = ramp(norm);
        const o = (py * w + px) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [data, height]);

  const maxFreq = data.freqs.length ? data.freqs[data.freqs.length - 1] : 0;
  const maxTime = data.times.length ? data.times[data.times.length - 1] : 0;

  return (
    <div>
      <canvas ref={ref} className="w-full rounded-md border border-border" style={{ height }} />
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>0 s</span>
        <span>
          {maxFreq.toFixed(0)} Hz max · {data.min.toFixed(0)} to {data.max.toFixed(0)} dB
        </span>
        <span>{maxTime.toFixed(1)} s</span>
      </div>
    </div>
  );
}

function ramp(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [12, 22, 40]],
    [0.35, [20, 100, 150]],
    [0.6, [70, 200, 210]],
    [0.8, [240, 190, 90]],
    [1, [220, 70, 60]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (t - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}
