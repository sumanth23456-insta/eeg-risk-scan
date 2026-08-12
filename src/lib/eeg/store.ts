/**
 * Global application store (no backend required).
 * - current recording + analysis live in memory
 * - analysis history + trained model metadata persist in localStorage
 */
import { useSyncExternalStore } from "react";
import type { EegRecording } from "./parse";
import type { AnalysisResult, PreprocessOptions } from "./pipeline";
import { DEFAULT_PREPROCESS } from "./pipeline";
import type { ReferenceDataset, ReferenceTable, TrainedModel } from "./model";
import { buildReferenceTable, buildSyntheticDataset, trainModel } from "./model";

export interface HistoryEntry {
  id: string;
  createdAt: string;
  fileName: string;
  source: "upload" | "demo";
  classification: string;
  riskScore: number;
  confidence: number;
  channels: number;
  analysedChannel: string;
  samplingRate: number;
  durationSec: number;
  windowStart: number;
  windowEnd: number;
  recordingId: string;
  modelName: string;
}

interface State {
  recording: EegRecording | null;
  analysis: AnalysisResult | null;
  preprocess: PreprocessOptions;
  channelIndex: number;
  windowStart: number;
  windowEnd: number;
  showProcessed: boolean;
  dataset: ReferenceDataset | null;
  table: ReferenceTable | null;
  model: TrainedModel | null;
  history: HistoryEntry[];
  analyses: Record<string, AnalysisResult>;
  status: "idle" | "loading-reference" | "analyzing" | "ready" | "error";
  statusMessage: string;
  recordingId: string;
}

const HISTORY_KEY = "eeg_analysis_history_v1";

function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryEntry[];
  } catch {
    return [];
  }
}

let state: State = {
  recording: null,
  analysis: null,
  preprocess: DEFAULT_PREPROCESS,
  channelIndex: 0,
  windowStart: 0,
  windowEnd: 30,
  showProcessed: true,
  dataset: null,
  table: null,
  model: null,
  history: [],
  analyses: {},
  status: "idle",
  statusMessage: "",
  recordingId: "",
};

const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getState() {
  return state;
}

const serverSnapshot = state;

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(serverSnapshot),
  );
}

export function useAppState(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => serverSnapshot,
  );
}

/** Lazily build the built-in reference distributions + baseline model. */
export function ensureReference(): { table: ReferenceTable; model: TrainedModel; dataset: ReferenceDataset } {
  if (state.table && state.model && state.dataset) {
    return { table: state.table, model: state.model, dataset: state.dataset };
  }
  const dataset = buildSyntheticDataset();
  const table = buildReferenceTable(dataset);
  const model = trainModel(dataset, { split: "patient-wise" });
  set({ dataset, table, model, status: "ready" });
  return { table, model, dataset };
}

export function setDatasetAndModel(dataset: ReferenceDataset, model: TrainedModel) {
  set({ dataset, table: buildReferenceTable(dataset), model });
}

export function setModel(model: TrainedModel) {
  set({ model });
}

export function setRecording(recording: EegRecording | null) {
  const end = recording ? Math.min(30, recording.durationSec) : 30;
  set({
    recording,
    channelIndex: 0,
    windowStart: 0,
    windowEnd: end,
    analysis: null,
    recordingId: recording?.id ?? "",
  });
}

export function setPreprocess(patch: Partial<PreprocessOptions>) {
  set({ preprocess: { ...state.preprocess, ...patch } });
}

export function setWindow(start: number, end: number) {
  set({ windowStart: start, windowEnd: end });
}

export function setChannel(i: number) {
  set({ channelIndex: i });
}

export function setShowProcessed(v: boolean) {
  set({ showProcessed: v });
}

export function setStatus(status: State["status"], statusMessage = "") {
  set({ status, statusMessage });
}

export function saveAnalysis(a: AnalysisResult) {
  const entry: HistoryEntry = {
    id: a.id,
    createdAt: a.createdAt,
    fileName: a.fileName,
    source: a.source,
    classification: a.risk.classification,
    riskScore: a.risk.riskScore,
    confidence: a.risk.confidence,
    channels: a.channelNames.length,
    analysedChannel: a.analysedChannel,
    samplingRate: a.samplingRate,
    durationSec: a.durationSec,
    windowStart: a.windowStart,
    windowEnd: a.windowEnd,
    recordingId: a.recordingId,
    modelName: a.modelName,
  };
  const history = [entry, ...state.history].slice(0, 100);
  set({ analysis: a, history, analyses: { ...state.analyses, [a.id]: a }, status: "ready" });
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* storage full — history stays in memory */
    }
  }
}

export function openAnalysis(id: string) {
  const a = state.analyses[id];
  if (a) set({ analysis: a });
  return a ?? null;
}

export function clearHistory() {
  set({ history: [], analyses: {} });
  if (typeof window !== "undefined") window.localStorage.removeItem(HISTORY_KEY);
}

export function hydrateHistory() {
  if (state.history.length) return;
  const h = loadHistory();
  if (h.length) set({ history: h });
}
