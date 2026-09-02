/**
 * EEG file parsing: CSV / TXT (user-declared metadata) and EDF/EDF+ (header parsed).
 * The uploaded buffer is never modified; parsing produces a new in-memory recording.
 *
 * Column handling contract:
 *  - a time/index column is detected by NAME and by numeric behaviour and is
 *    NEVER exposed as an EEG channel;
 *  - the sampling rate is derived from the time column when one exists;
 *  - amplitudes are converted to microvolts before anything downstream runs.
 */
import {
  isTimeColumnName,
  looksLikeTimeSeriesAxis,
  samplingRateFromTime,
  suggestAmplitudeUnit,
  toMicrovoltFactor,
  type AmplitudeUnit,
} from "./validation";
import { rms as rmsOf } from "./dsp";

export interface EegRecording {
  id: string;
  fileName: string;
  fileSize: number;
  format: "CSV" | "TXT" | "EDF" | "DEMO";
  samplingRate: number;
  /** How the sampling rate was obtained. */
  samplingRateSource: "time-column" | "user" | "header" | "generated";
  channelNames: string[]; // EEG channels only — never the time column
  data: Float64Array[]; // per EEG channel, always in µV
  durationSec: number;
  unit: string;
  amplitudeUnit: AmplitudeUnit;
  /** false when no unit metadata existed and a unit was assumed. */
  unitKnown: boolean;
  /** Name of the detected time column, or null when the file has none. */
  timeColumn: string | null;
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
  /** Legacy hint; automatic detection takes precedence. */
  timeColumnFirst: boolean;
  /** "auto" = not declared by the user; data is then treated as µV but flagged. */
  amplitudeUnit?: AmplitudeUnit | "auto";
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
  const columnName = (i: number) => headerNames?.[i]?.trim() || `COL${i + 1}`;
  const column = (i: number) => rows.map((r) => r[i]);

  const notes: string[] = [];

  /* ---------------------- 1. time column identification ---------------------- */
  let timeIdx = -1;
  for (let c = 0; c < nCols; c++) {
    if (headerNames && isTimeColumnName(columnName(c))) {
      timeIdx = c;
      break;
    }
  }
  if (timeIdx < 0 && nCols > 1) {
    // no name match: fall back to numeric behaviour of the first column
    const first = column(0).filter((v) => Number.isFinite(v));
    if ((opts.timeColumnFirst && looksLikeTimeSeriesAxis(first)) || looksLikeTimeSeriesAxis(first)) {
      timeIdx = 0;
    }
  }
  const timeColumn = timeIdx >= 0 ? columnName(timeIdx) : null;
  if (timeColumn) notes.push(`Time column detected: ${timeColumn} (excluded from EEG channels).`);
  else notes.push("No time column detected — every numeric column is treated as an EEG channel.");

  /* ------------------------- 2. EEG channel extraction ----------------------- */
  const eegIdx: number[] = [];
  for (let c = 0; c < nCols; c++) {
    if (c === timeIdx) continue;
    const col = column(c);
    const finite = col.filter((v) => Number.isFinite(v)).length;
    if (finite / (col.length || 1) < 0.5) {
      notes.push(`Column "${columnName(c)}" ignored — fewer than 50% numeric values.`);
      continue;
    }
    eegIdx.push(c);
  }
  if (!eegIdx.length) {
    throw new Error(
      "No valid EEG channel found. The file must contain at least one numeric channel column besides the time column.",
    );
  }

  const providedNames =
    opts.channelNames && opts.channelNames.length === eegIdx.length ? opts.channelNames : null;
  const names = eegIdx.map((c, i) =>
    providedNames ? providedNames[i] : headerNames ? columnName(c) : `CH${i + 1}`,
  );
  notes.push(`EEG channels detected: ${names.length} (${names.join(", ")}).`);

  const data: Float64Array[] = eegIdx.map((c) => {
    const arr = new Float64Array(rows.length);
    for (let r = 0; r < rows.length; r++) arr[r] = rows[r][c];
    return arr;
  });

  /* ------------------------- 3. sampling-rate handling ----------------------- */
  let fs = opts.samplingRate;
  let fsSource: EegRecording["samplingRateSource"] = "user";
  if (timeIdx >= 0) {
    const info = samplingRateFromTime(column(timeIdx).filter((v) => Number.isFinite(v)));
    if (info && info.fs > 0) {
      fs = info.fs;
      fsSource = "time-column";
      notes.push(
        `Sampling rate derived from ${timeColumn}: ${info.fs.toFixed(2)} Hz (median step ${info.medianStep.toExponential(3)} s).`,
      );
      if (!info.uniform) {
        notes.push(
          `Non-uniform sampling interval: ${(info.jitterRatio * 100).toFixed(1)}% of steps deviate >25% from the median. Spectral results may be distorted.`,
        );
      }
      const declared = opts.samplingRate;
      if (Number.isFinite(declared) && declared > 0 && Math.abs(declared - info.fs) / info.fs > 0.05) {
        notes.push(
          `Sampling-rate mismatch: file time column implies ${info.fs.toFixed(2)} Hz but ${declared} Hz was entered manually. The time-column value is used — verify the file.`,
        );
      }
    }
  }

  /* ----------------------------- 4. amplitude unit --------------------------- */
  const declaredUnit = opts.amplitudeUnit && opts.amplitudeUnit !== "auto" ? opts.amplitudeUnit : null;
  const typicalRms = data.length ? rmsOf(data[0]) : 0;
  const unitKnown = Boolean(declaredUnit);
  const amplitudeUnit: AmplitudeUnit = declaredUnit ?? "µV";
  if (!declaredUnit) {
    const suggested = suggestAmplitudeUnit(typicalRms);
    notes.push(
      `EEG amplitude unit not explicitly provided — values are treated as µV. Signal RMS is ${typicalRms.toExponential(2)}, which is typical of ${suggested === "unknown" ? "an undetermined scale" : suggested}. Select the correct unit if this is wrong.`,
    );
  }
  const factor = toMicrovoltFactor(amplitudeUnit);
  if (factor !== 1) {
    for (const ch of data) for (let i = 0; i < ch.length; i++) ch[i] *= factor;
    notes.push(`Amplitudes converted from ${amplitudeUnit} to µV (×${factor}).`);
  }

  return finalize({
    fileName,
    fileSize,
    format: fileName.toLowerCase().endsWith(".txt") ? "TXT" : "CSV",
    samplingRate: fs,
    samplingRateSource: fsSource,
    channelNames: names,
    data,
    unit: "µV",
    amplitudeUnit,
    unitKnown,
    timeColumn,
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
    .filter(({ l, i }) => !/EDF Annotations/i.test(l) && samplesPerRecord[i] > 0 && !isTimeColumnName(l));

  if (!keep.length) throw new Error("No valid EEG channel found in the EDF file.");

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
  const dim = (dims[keep[0].i] || "uV").toLowerCase();
  const amplitudeUnit: AmplitudeUnit = dim.startsWith("mv") ? "mV" : dim === "v" ? "V" : "µV";
  const factor = toMicrovoltFactor(amplitudeUnit);
  if (factor !== 1) for (const ch of data) for (let i = 0; i < ch.length; i++) ch[i] *= factor;

  return finalize({
    fileName,
    fileSize,
    format: "EDF",
    samplingRate: fs,
    samplingRateSource: "header",
    channelNames: keep.map(({ l }, idx) => l || `CH${idx + 1}`),
    data,
    unit: "µV",
    amplitudeUnit,
    unitKnown: true,
    timeColumn: null,
    source: "upload",
    notes: [
      `EDF header parsed: ${numRecords} data records × ${recordDuration} s.`,
      `EEG channels detected: ${keep.length} (${keep.map((k) => k.l).join(", ")}).`,
      `Amplitude unit from EDF header: ${amplitudeUnit}${factor !== 1 ? ` (converted to µV, ×${factor})` : ""}.`,
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
  if (r.samplingRate < 128)
    messages.push("Sampling rate below 128 Hz — the 30–45 Hz gamma band cannot be fully evaluated.");
  if (durationSec < 5) messages.push("Recording shorter than 5 s — analysis may be unreliable.");
  const status: "good" | "fair" | "poor" =
    invalidRatio > 0.05 || flat.length === r.data.length || durationSec < 2
      ? "poor"
      : invalidRatio > 0.001 || flat.length > 0 || r.samplingRate < 128
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
