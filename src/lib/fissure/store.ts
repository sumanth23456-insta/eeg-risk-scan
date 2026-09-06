/** Patient / clinical / research-record store (browser-local, no backend). */
import { useSyncExternalStore } from "react";
import {
  EMPTY_CLINICAL,
  EMPTY_PATIENT,
  type FissureClinical,
  type PatientInfo,
  type ResearchAnalysisRecord,
} from "./types";

interface FState {
  patient: PatientInfo;
  clinical: FissureClinical;
  records: ResearchAnalysisRecord[];
}

const KEY = "fissure_research_records_v1";
const DRAFT_KEY = "fissure_patient_draft_v1";

let state: FState = { patient: EMPTY_PATIENT, clinical: EMPTY_CLINICAL, records: [] };
const listeners = new Set<() => void>();
const serverSnapshot = state;

function set(patch: Partial<FState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useFissureState(): FState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => serverSnapshot,
  );
}

export function getFissureState() {
  return state;
}

export function setPatient(patch: Partial<PatientInfo>) {
  set({ patient: { ...state.patient, ...patch } });
  persistDraft();
}

export function setClinical(patch: Partial<FissureClinical>) {
  set({ clinical: { ...state.clinical, ...patch } });
  persistDraft();
}

export function replacePatientAndClinical(patient: PatientInfo, clinical: FissureClinical) {
  set({ patient, clinical });
  persistDraft();
}

export function resetPatientForm() {
  set({ patient: EMPTY_PATIENT, clinical: EMPTY_CLINICAL });
  persistDraft();
}

export function saveRecord(record: ResearchAnalysisRecord) {
  const records = [record, ...state.records.filter((r) => r.id !== record.id)].slice(0, 100);
  set({ records });
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(records));
    } catch {
      /* storage full — records stay in memory */
    }
  }
}

export function clearRecords() {
  set({ records: [] });
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}

function persistDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ patient: state.patient, clinical: state.clinical }),
    );
  } catch {
    /* ignore */
  }
}

export function hydrateFissure() {
  if (typeof window === "undefined") return;
  const patch: Partial<FState> = {};
  if (state.records.length === 0) {
    try {
      const r = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as ResearchAnalysisRecord[];
      if (r.length) patch.records = r;
    } catch {
      /* ignore */
    }
  }
  if (!state.patient.patientId) {
    try {
      const d = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null") as {
        patient: PatientInfo;
        clinical: FissureClinical;
      } | null;
      if (d?.patient) {
        patch.patient = { ...EMPTY_PATIENT, ...d.patient };
        patch.clinical = { ...EMPTY_CLINICAL, ...d.clinical };
      }
    } catch {
      /* ignore */
    }
  }
  if (Object.keys(patch).length) set(patch);
}
