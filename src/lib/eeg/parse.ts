/**
 * EEG file parsing: CSV / TXT (user-declared metadata) and EDF/EDF+ (header parsed).
 * The uploaded buffer is never modified; parsing produces a new in-memory recording.
 */

export interface EegRecording {
  id: string;
  fileName: string;
  fileSize: number;
  format: "CSV" | "TXT" | "EDF" | "DEMO";
  samplingRate: number;
  channelNames: string[];
  data: Float64Array[]; // per channel
  durationSec: number;
  unit: string;
  source: "upload" | "demo";
  demoLabel?: string;
  notes: string[];
  quality: {
    status: "good" | "fair" | "poor";
    invalidRatio: number;
    flatChannels: string[];
    messages: string[];
  };
}

export interface CsvOptions {
  samplingRate: number;
  hasHeader: boolean;
  delimiter: "," | ";" | "\t" | " " | "auto";
  channelNames?: string[];
  timeColumnFirst: boolean;
}

function detectDelimiter(line: string): string {
  const candidates = [",", ";", "\t", " "];
  let best = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const n = line.split(c).length;
    if (n > bestCount) {
      bestCount = n;
      best = c;
    }
  }
  return best;
}

export function parseDelimitedText(
  text: string,
  fileName: string,
  fileSize: number,
  opts: CsvOptions,
): EegRecording {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) throw new Error("File is empty.");
  const delim = opts.delimiter === "auto" ? detectDelimiter(lines[0]) : opts.delimiter;
  const split = (l: string) => l.split(delim).map((c) => c.trim()).filter((c) => c !== "");

  let headerNames: string[] | null = null;
  let startRow = 0;
  const firstCells = split(lines[0]);
  const looksHeader = opts.hasHeader || firstCells.some((c) => Number.isNaN(Number(c)));
  if (looksHeader) {
    headerNames = firstCells;
    startRow = 1;
  }

  const rows: number[][] = [];
  for (let i = startRow; i < lines.length; i++) {
    const cells = split(lines[i]);
    if (!cells.length) continue;
    rows.push(cells.map((c) => Number(c)));
  }
  if (!rows.length) throw new Error("No numeric rows found in file.");

  const nCols = Math.max(...rows.map((r) => r.length));
  const startCol = opts.timeColumnFirst ? 1 : 0;
  const nCh = Math.max(1, nCols - startCol);

  const data: Float64Array[] = [];
  for (let c = 0; c < nCh; c++) {
    const arr = new Float64Array(rows.length);
    for (let r = 0; r < rows.length; r++) arr[r] = rows[r][c + startCol];
    data.push(arr);
  }

  let names =
    opts.channelNames && opts.channelNames.length === nCh
      ? opts.channelNames
      : headerNames
        ? headerNames.slice(startCol, startCol + nCh)
        : Array.from({ length: nCh }, (_, i) => `CH${i + 1}`);
  if (names.length !== nCh) names = Array.from({ length: nCh }, (_, i) => `CH${i + 1}`);

  const notes: string[] = [];
  let fs = opts.samplingRate;
  if (opts.timeColumnFirst && rows.length > 2) {
    const dt = rows[1][0] - rows[0][0];
    if (Number.isFinite(dt) && dt > 0) {
      const derived = 1 / dt;
      notes.push(`Sampling rate derived from time column: ${derived.toFixed(2)} Hz.`);
      fs = derived;
    }
  }

  return finalize({
    fileName,
    fileSize,
    format: fileName.toLowerCase().endsWith(".txt") ? "TXT" : "CSV",
    samplingRate: fs,
    channelNames: names,
    data,
    unit: "µV (assumed)",
    source: "upload",
    notes,
  });
}

/* ---------------------------------- EDF ----------------------------------- */

function ascii(buf: Uint8Array, start: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(buf[start + i]);
  return s.trim();
}

export function parseEdf(buffer: ArrayBuffer, fileName: string, fileSize: number): EegRecording {
  const buf = new Uint8Array(buffer);
  if (buf.length < 256) throw new Error("File too small to be a valid EDF file.");
  const numRecords = parseInt(ascii(buf, 236, 8), 10);
  const recordDuration = parseFloat(ascii(buf, 244, 8));
  const ns = parseInt(ascii(buf, 252, 4), 10);
  if (!Number.isFinite(ns) || ns <= 0) throw new Error("Invalid EDF header (signal count).");

  let off = 256;
  const labels: string[] = [];
  for (let i = 0; i < ns; i++) labels.push(ascii(buf, off + i * 16, 16));
  off += ns * 16;
  off += ns * 80; // transducer
  const dims: string[] = [];
  for (let i = 0; i < ns; i++) dims.push(ascii(buf, off + i * 8, 8));
  off += ns * 8;
  const physMin: number[] = [];
  for (let i = 0; i < ns; i++) physMin.push(parseFloat(ascii(buf, off + i * 8, 8)));
  off += ns * 8;
  const physMax: number[] = [];
  for (let i = 0; i < ns; i++) physMax.push(parseFloat(ascii(buf, off + i * 8, 8)));
  off += ns * 8;
  const digMin: number[] = [];
  for (let i = 0; i < ns; i++) digMin.push(parseFloat(ascii(buf, off + i * 8, 8)));
  off += ns * 8;
  const digMax: number[] = [];
  for (let i = 0; i < ns; i++) digMax.push(parseFloat(ascii(buf, off + i * 8, 8)));
  off += ns * 8;
  off += ns * 80; // prefiltering
  const samplesPerRecord: number[] = [];
  for (let i = 0; i < ns; i++) samplesPerRecord.push(parseInt(ascii(buf, off + i * 8, 8), 10));
  off += ns * 8;
  off += ns * 32; // reserved
  const headerBytes = parseInt(ascii(buf, 184, 8), 10) || off;

  const view = new DataView(buffer);
  const keep = labels
    .map((l, i) => ({ l, i }))
    .filter(({ l, i }) => !/EDF Annotations/i.test(l) && samplesPerRecord[i] > 0);

  const data: Float64Array[] = keep.map(({ i }) => new Float64Array(samplesPerRecord[i] * numRecords));
  const writeIdx = keep.map(() => 0);

  let pos = headerBytes;
  for (let r = 0; r < numRecords; r++) {
    for (let s = 0; s < ns; s++) {
      const n = samplesPerRecord[s];
      const keepIdx = keep.findIndex((k) => k.i === s);
      for (let k = 0; k < n; k++) {
        const bytePos = pos + k * 2;
        if (bytePos + 1 >= buf.length) break;
        if (keepIdx >= 0) {
          const raw = view.getInt16(bytePos, true);
          const scale = (physMax[s] - physMin[s]) / ((digMax[s] - digMin[s]) || 1);
          data[keepIdx][writeIdx[keepIdx]++] = (raw - digMin[s]) * scale + physMin[s];
        }
      }
      pos += n * 2;
    }
  }

  const fs = samplesPerRecord[keep[0].i] / (recordDuration || 1);
  return finalize({
    fileName,
    fileSize,
    format: "EDF",
    samplingRate: fs,
    channelNames: keep.map(({ l }, idx) => l || `CH${idx + 1}`),
    data,
    unit: dims[keep[0].i] || "µV",
    source: "upload",
    notes: [
      `EDF header parsed: ${numRecords} data records × ${recordDuration} s.`,
      `Patient/recording identification fields were intentionally NOT imported.`,
    ],
  });
}

/* ------------------------------- finalisation ------------------------------ */

export function finalize(r: Omit<EegRecording, "id" | "durationSec" | "quality">): EegRecording {
  const n = r.data[0]?.length ?? 0;
  const durationSec = r.samplingRate > 0 ? n / r.samplingRate : 0;
  let invalid = 0;
  let totalSamples = 0;
  const flat: string[] = [];
  r.data.forEach((ch, i) => {
    let mn = Infinity;
    let mx = -Infinity;
    for (let j = 0; j < ch.length; j++) {
      if (!Number.isFinite(ch[j])) invalid++;
      else {
        if (ch[j] < mn) mn = ch[j];
        if (ch[j] > mx) mx = ch[j];
      }
    }
    totalSamples += ch.length;
    if (mx - mn < 1e-9) flat.push(r.channelNames[i] ?? `CH${i + 1}`);
  });
  const invalidRatio = totalSamples ? invalid / totalSamples : 0;
  const messages: string[] = [];
  if (invalidRatio > 0) messages.push(`${(invalidRatio * 100).toFixed(2)}% invalid/missing samples detected.`);
  if (flat.length) messages.push(`Flat channels: ${flat.join(", ")}.`);
  if (r.samplingRate < 100) messages.push("Sampling rate below 100 Hz — gamma band cannot be evaluated.");
  if (durationSec < 5) messages.push("Recording shorter than 5 s — analysis may be unreliable.");
  const status: "good" | "fair" | "poor" =
    invalidRatio > 0.05 || flat.length === r.data.length || durationSec < 2
      ? "poor"
      : invalidRatio > 0.001 || flat.length > 0 || r.samplingRate < 100
        ? "fair"
        : "good";

  return {
    ...r,
    id: `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    durationSec,
    quality: { status, invalidRatio, flatChannels: flat, messages },
  };
}

export async function parseEegFile(file: File, opts: CsvOptions): Promise<EegRecording> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".edf") || lower.endsWith(".bdf")) {
    return parseEdf(await file.arrayBuffer(), file.name, file.size);
  }
  if (lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".tsv") || lower.endsWith(".dat")) {
    return parseDelimitedText(await file.text(), file.name, file.size, opts);
  }
  throw new Error(
    `Unsupported file type "${file.name.split(".").pop()}". Supported: CSV, TXT, TSV, EDF. Other proprietary formats require the Python processing backend (module not connected).`,
  );
}
