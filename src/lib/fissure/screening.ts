/**
 * Transparent, rule-based research screening score.
 * Every point is traceable to a clinical parameter the user entered.
 * No machine-learning claim, no validated thresholds, no diagnosis.
 */
import type {
  EegSummary,
  FissureClinical,
  PatientInfo,
  ScreeningCategory,
  ScreeningResult,
} from "./types";

const MAX_SCORE = 100;

/** Clinical fields that must be present for a score to be produced at all. */
const REQUIRED: { key: keyof FissureClinical; label: string }[] = [
  { key: "painDuringDefecation", label: "Pain during defecation" },
  { key: "painAfterDefecation", label: "Pain after defecation" },
  { key: "rectalBleeding", label: "Rectal bleeding" },
  { key: "constipation", label: "Constipation" },
  { key: "stoolConsistency", label: "Stool consistency" },
  { key: "straining", label: "Straining during defecation" },
  { key: "symptomDurationDays", label: "Symptom duration (days)" },
];

export function computeScreening(
  patient: PatientInfo,
  c: FissureClinical,
  eeg: EegSummary | null,
): ScreeningResult {
  const missing: string[] = [];
  for (const r of REQUIRED) {
    const v = c[r.key];
    if (v === "" || v === null || v === undefined) missing.push(r.label);
  }
  if (!patient.patientId.trim()) missing.push("Patient ID");
  if (patient.age === null) missing.push("Age");
  if (!patient.sex) missing.push("Sex");

  const limitations = buildLimitations(c, eeg);

  if (missing.length > 0) {
    return {
      category: "Insufficient Data",
      score: null,
      maxScore: MAX_SCORE,
      breakdown: [],
      findings: ["Insufficient Data for Research Screening — required fields are missing."],
      missing,
      limitations,
      eegIncluded: false,
    };
  }

  const breakdown: { label: string; points: number; detail: string }[] = [];
  const add = (label: string, points: number, detail: string) => {
    if (points !== 0) breakdown.push({ label, points, detail });
  };

  add("Pain severity", Math.round((c.painSeverity / 10) * 20), `Reported ${c.painSeverity}/10`);
  add("Pain during defecation", c.painDuringDefecation === "yes" ? 10 : 0, "Yes");
  add("Pain after defecation", c.painAfterDefecation === "yes" ? 8 : 0, "Yes");
  add("Rectal bleeding", c.rectalBleeding === "yes" ? 8 : 0, "Yes");
  const bleed = { none: 0, mild: 3, moderate: 6, severe: 8 }[c.bleedingSeverity || "none"] ?? 0;
  add("Bleeding severity", bleed, c.bleedingSeverity || "none");
  add("Constipation", c.constipation === "yes" ? 6 : 0, "Yes");
  add("Stool consistency", c.stoolConsistency === "hard" ? 6 : 0, "Hard stools");
  const strain = { never: 0, sometimes: 3, frequently: 6 }[c.straining || "never"] ?? 0;
  add("Straining", strain, c.straining || "never");
  const days = c.symptomDurationDays ?? 0;
  add("Symptom duration", days >= 42 ? 6 : days > 0 ? 3 : 0, `${days} day(s)`);
  add("Previous fissure history", patient.previousFissureHistory === "yes" ? 4 : 0, "Yes");

  if (c.clinicallyObservedFissure === "yes") add("Clinical examination", 25, "Fissure observed");
  else if (c.clinicallyObservedFissure === "no") add("Clinical examination", -20, "No fissure observed");
  add("Sentinel skin tag", c.sentinelSkinTag === "yes" ? 8 : 0, "Present");

  const raw = breakdown.reduce((s, b) => s + b.points, 0);
  const score = Math.max(0, Math.min(MAX_SCORE, raw));

  let category: ScreeningCategory;
  if (score >= 50) category = "High Fissure Likelihood";
  else if (score >= 20) category = "Possible Fissure Indicators";
  else category = "No / Low Fissure Indicators";

  const findings: string[] = [];
  if (c.painDuringDefecation === "yes" && c.rectalBleeding === "yes")
    findings.push("Pain during defecation together with rectal bleeding is a common symptom pairing.");
  if (c.stoolConsistency === "hard" || c.constipation === "yes")
    findings.push("Hard stools / constipation reported.");
  if (days >= 42) findings.push("Symptom duration of 6 weeks or more (chronic-range duration).");
  if (c.clinicallyObservedFissure === "not-assessed" || c.clinicallyObservedFissure === "")
    findings.push(
      "Clinical examination information was not provided. This result cannot confirm or exclude an anal fissure.",
    );
  if (c.clinicallyObservedFissure === "no")
    findings.push("Clinical examination did not observe a fissure; symptom score reduced accordingly.");
  if (findings.length === 0) findings.push("No prominent fissure-related indicators recorded.");

  return {
    category,
    score,
    maxScore: MAX_SCORE,
    breakdown,
    findings,
    missing: optionalMissing(c),
    limitations,
    eegIncluded: false,
  };
}

function optionalMissing(c: FissureClinical): string[] {
  const m: string[] = [];
  if (!c.clinicallyObservedFissure || c.clinicallyObservedFissure === "not-assessed")
    m.push("Clinically observed fissure");
  if (!c.fissureLocation || c.fissureLocation === "not-assessed") m.push("Fissure location");
  if (!c.fissureAppearance || c.fissureAppearance === "not-assessed") m.push("Fissure appearance");
  if (!c.sentinelSkinTag || c.sentinelSkinTag === "not-assessed") m.push("Sentinel skin tag");
  if (!c.bleedingSeverity) m.push("Bleeding severity");
  return m;
}

function buildLimitations(c: FissureClinical, eeg: EegSummary | null): string[] {
  const l = [
    "This score is a research prototype and is not clinically validated.",
    "EEG is not a diagnostic test for anal fissures. EEG features are reported as a separate neurological signal summary and do not contribute to the fissure screening score.",
    "The score is a transparent sum of self-reported symptom points, not a machine-learning probability.",
  ];
  if (!eeg) l.push("No EEG recording was analysed for this record.");
  else if (eeg.signalQuality === "poor") l.push("EEG signal quality was poor; EEG summary values may be unreliable.");
  if (!c.clinicallyObservedFissure || c.clinicallyObservedFissure === "not-assessed")
    l.push("No physical examination findings were entered; examination cannot be inferred from EEG.");
  return l;
}

export function categoryColorVar(cat: ScreeningCategory): string {
  switch (cat) {
    case "High Fissure Likelihood":
      return "var(--risk-high)";
    case "Possible Fissure Indicators":
      return "var(--risk-moderate)";
    case "No / Low Fissure Indicators":
      return "var(--risk-low)";
    default:
      return "var(--risk-unknown)";
  }
}
