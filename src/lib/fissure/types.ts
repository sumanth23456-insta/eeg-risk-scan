/**
 * Data model for the fissure research-screening workflow.
 * Patient/clinical features are kept strictly separate from EEG-derived features.
 */

export type YesNo = "yes" | "no";
export type Assessed = "yes" | "no" | "not-assessed";

export interface PatientInfo {
  patientId: string;
  age: number | null;
  sex: "male" | "female" | "other" | "";
  heightCm: number | null;
  weightKg: number | null;
  previousFissureHistory: YesNo | "";
  previousAnorectalSurgery: YesNo | "";
}

export interface FissureClinical {
  painSeverity: number; // 0-10
  painDuringDefecation: YesNo | "";
  painAfterDefecation: YesNo | "";
  rectalBleeding: YesNo | "";
  bleedingSeverity: "none" | "mild" | "moderate" | "severe" | "";
  constipation: YesNo | "";
  stoolConsistency: "hard" | "normal" | "loose" | "";
  straining: "never" | "sometimes" | "frequently" | "";
  symptomDurationDays: number | null;
  clinicallyObservedFissure: Assessed | "";
  fissureLocation: "posterior" | "anterior" | "other" | "not-assessed" | "";
  fissureAppearance: "linear-tear" | "ulcer-like" | "chronic-appearing" | "not-assessed" | "";
  sentinelSkinTag: Assessed | "";
}

/** EEG-derived features only — never contains age, sex or symptoms. */
export interface EegSummary {
  fileName: string;
  source: "upload" | "demo";
  eegChannels: string[];
  timeColumn: string | null;
  samplingFrequency: number;
  recordingDuration: number;
  signalQuality: string;
  artifactPercent: number | null;
  deltaPower: number;
  thetaPower: number;
  alphaPower: number;
  betaPower: number;
  gammaPower: number;
  meanAmplitude: number;
  rmsAmplitude: number;
  peakToPeak: number;
  peakFrequency: number;
  totalSpectralPower: number;
}

export interface ResearchAnalysisRecord {
  id: string;
  createdAt: string;
  patient: PatientInfo;
  clinical: FissureClinical;
  eeg: EegSummary | null;
  screening: ScreeningResult;
}

export type ScreeningCategory =
  | "No / Low Fissure Indicators"
  | "Possible Fissure Indicators"
  | "High Fissure Likelihood"
  | "Insufficient Data";

export interface ScreeningResult {
  category: ScreeningCategory;
  score: number | null; // 0-100 research screening score
  maxScore: number;
  breakdown: { label: string; points: number; detail: string }[];
  findings: string[];
  missing: string[];
  limitations: string[];
  eegIncluded: boolean;
}

export const EMPTY_PATIENT: PatientInfo = {
  patientId: "",
  age: null,
  sex: "",
  heightCm: null,
  weightKg: null,
  previousFissureHistory: "",
  previousAnorectalSurgery: "",
};

export const EMPTY_CLINICAL: FissureClinical = {
  painSeverity: 0,
  painDuringDefecation: "",
  painAfterDefecation: "",
  rectalBleeding: "",
  bleedingSeverity: "",
  constipation: "",
  stoolConsistency: "",
  straining: "",
  symptomDurationDays: null,
  clinicallyObservedFissure: "",
  fissureLocation: "",
  fissureAppearance: "",
  sentinelSkinTag: "",
};

export const DISCLAIMER =
  "This application is a student/research prototype. It does not diagnose anal fissures and should not be used as a substitute for clinical examination or professional medical advice. EEG is not a standard diagnostic test for anal fissures. Results are intended for research and demonstration purposes only.";

export function validatePatient(p: PatientInfo): string[] {
  const errs: string[] = [];
  if (!p.patientId.trim()) errs.push("Patient ID is required.");
  if (p.age === null || Number.isNaN(p.age)) errs.push("Age is required.");
  else if (p.age < 0 || p.age > 120) errs.push("Age must be between 0 and 120.");
  if (!p.sex) errs.push("Sex is required.");
  if (p.heightCm !== null && p.heightCm < 0) errs.push("Height cannot be negative.");
  if (p.weightKg !== null && p.weightKg < 0) errs.push("Weight cannot be negative.");
  return errs;
}

export function validateClinical(c: FissureClinical): string[] {
  const errs: string[] = [];
  if (c.painSeverity < 0 || c.painSeverity > 10) errs.push("Pain severity must be between 0 and 10.");
  if (c.symptomDurationDays !== null && c.symptomDurationDays < 0)
    errs.push("Symptom duration cannot be negative.");
  return errs;
}
