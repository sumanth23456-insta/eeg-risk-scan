/**
 * Combined patient + clinical + EEG-summary CSV import.
 * Column names follow the documented research template.
 */
import {
  EMPTY_CLINICAL,
  EMPTY_PATIENT,
  type EegSummary,
  type FissureClinical,
  type PatientInfo,
} from "./types";

export interface ClinicalCsvRow {
  patient: PatientInfo;
  clinical: FissureClinical;
  eeg: EegSummary | null;
  errors: string[];
}

export const CSV_TEMPLATE_COLUMNS = [
  "Patient_ID",
  "Age",
  "Sex",
  "Pain_Score",
  "Pain_During_Defecation",
  "Pain_After_Defecation",
  "Rectal_Bleeding",
  "Bleeding_Severity",
  "Constipation",
  "Stool_Consistency",
  "Straining",
  "Symptom_Duration_Days",
  "Previous_Fissure_History",
  "Clinically_Observed_Fissure",
  "Fissure_Location",
  "Fissure_Appearance",
  "Sentinel_Skin_Tag",
  "EEG_Channel",
  "Sampling_Frequency",
  "Recording_Duration",
  "Delta_Power",
  "Theta_Power",
  "Alpha_Power",
  "Beta_Power",
  "Gamma_Power",
  "Mean_Amplitude",
  "RMS_Amplitude",
  "Peak_Frequency",
  "Total_Spectral_Power",
  "Signal_Quality",
] as const;

/** True when the header looks like a clinical record file rather than an EEG waveform matrix. */
export function isClinicalCsv(headerLine: string): boolean {
  const h = headerLine.toLowerCase();
  return h.includes("patient_id") && (h.includes("pain_score") || h.includes("rectal_bleeding"));
}

function splitLine(line: string): string[] {
  return line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function yesNo(v: string | undefined): "yes" | "no" | "" {
  const s = (v ?? "").trim().toLowerCase();
  if (["yes", "y", "1", "true"].includes(s)) return "yes";
  if (["no", "n", "0", "false"].includes(s)) return "no";
  return "";
}

function pick<T extends string>(v: string | undefined, allowed: readonly T[]): T | "" {
  const s = (v ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  return (allowed as readonly string[]).includes(s) ? (s as T) : "";
}

export function parseClinicalCsv(text: string): ClinicalCsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("The CSV file must contain a header row and at least one record.");
  const header = splitLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name.toLowerCase());
  const get = (cols: string[], name: string) => {
    const i = idx(name);
    return i >= 0 ? cols[i] : undefined;
  };

  if (idx("Patient_ID") < 0) throw new Error("Missing required column: Patient_ID.");

  return lines.slice(1).map((line) => {
    const cols = splitLine(line);
    const errors: string[] = [];

    const age = num(get(cols, "Age"));
    if (age !== null && (age < 0 || age > 120)) errors.push("Age must be between 0 and 120.");

    const patient: PatientInfo = {
      ...EMPTY_PATIENT,
      patientId: get(cols, "Patient_ID") ?? "",
      age,
      sex: pick(get(cols, "Sex"), ["male", "female", "other"] as const),
      previousFissureHistory: yesNo(get(cols, "Previous_Fissure_History")),
    };
    if (!patient.patientId) errors.push("Patient_ID is empty.");

    const pain = num(get(cols, "Pain_Score"));
    if (pain !== null && (pain < 0 || pain > 10)) errors.push("Pain_Score must be between 0 and 10.");

    const duration = num(get(cols, "Symptom_Duration_Days"));
    if (duration !== null && duration < 0) errors.push("Symptom_Duration_Days cannot be negative.");

    const clinical: FissureClinical = {
      ...EMPTY_CLINICAL,
      painSeverity: pain === null ? 0 : Math.max(0, Math.min(10, pain)),
      painDuringDefecation: yesNo(get(cols, "Pain_During_Defecation")),
      painAfterDefecation: yesNo(get(cols, "Pain_After_Defecation")),
      rectalBleeding: yesNo(get(cols, "Rectal_Bleeding")),
      bleedingSeverity: pick(get(cols, "Bleeding_Severity"), ["none", "mild", "moderate", "severe"] as const),
      constipation: yesNo(get(cols, "Constipation")),
      stoolConsistency: pick(get(cols, "Stool_Consistency"), ["hard", "normal", "loose"] as const),
      straining: pick(get(cols, "Straining"), ["never", "sometimes", "frequently"] as const),
      symptomDurationDays: duration,
      clinicallyObservedFissure: pick(get(cols, "Clinically_Observed_Fissure"), [
        "yes",
        "no",
        "not-assessed",
      ] as const),
      fissureLocation: pick(get(cols, "Fissure_Location"), [
        "posterior",
        "anterior",
        "other",
        "not-assessed",
      ] as const),
      fissureAppearance: pick(get(cols, "Fissure_Appearance"), [
        "linear-tear",
        "ulcer-like",
        "chronic-appearing",
        "not-assessed",
      ] as const),
      sentinelSkinTag: pick(get(cols, "Sentinel_Skin_Tag"), ["yes", "no", "not-assessed"] as const),
    };

    const fs = num(get(cols, "Sampling_Frequency"));
    let eeg: EegSummary | null = null;
    if (fs !== null) {
      if (fs <= 0) errors.push("Sampling_Frequency must be positive.");
      eeg = {
        fileName: "clinical-csv-import",
        source: "upload",
        eegChannels: (get(cols, "EEG_Channel") ?? "")
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean),
        timeColumn: null,
        samplingFrequency: fs,
        recordingDuration: num(get(cols, "Recording_Duration")) ?? 0,
        signalQuality: (get(cols, "Signal_Quality") ?? "unknown").toLowerCase(),
        artifactPercent: null,
        deltaPower: num(get(cols, "Delta_Power")) ?? 0,
        thetaPower: num(get(cols, "Theta_Power")) ?? 0,
        alphaPower: num(get(cols, "Alpha_Power")) ?? 0,
        betaPower: num(get(cols, "Beta_Power")) ?? 0,
        gammaPower: num(get(cols, "Gamma_Power")) ?? 0,
        meanAmplitude: num(get(cols, "Mean_Amplitude")) ?? 0,
        rmsAmplitude: num(get(cols, "RMS_Amplitude")) ?? 0,
        peakToPeak: 0,
        peakFrequency: num(get(cols, "Peak_Frequency")) ?? 0,
        totalSpectralPower: num(get(cols, "Total_Spectral_Power")) ?? 0,
      };
      const bad = Object.entries(eeg).filter(
        ([, v]) => typeof v === "number" && !Number.isFinite(v),
      );
      if (bad.length) errors.push("EEG columns contain NaN or infinite values.");
    }

    return { patient, clinical, eeg, errors };
  });
}

export function csvTemplateText(): string {
  return (
    CSV_TEMPLATE_COLUMNS.join(",") +
    "\n" +
    "P001,34,male,7,yes,yes,yes,mild,yes,hard,frequently,50,no,yes,posterior,chronic-appearing,yes,Fp1|F3,256,60,120.5,80.2,45.1,20.3,5.2,0.1,12.4,9.8,271.3,good\n"
  );
}
