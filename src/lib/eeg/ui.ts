/** Presentation helpers shared by the UI (no computation happens here). */
import type { Classification } from "./model";

export function riskTone(score: number): "low" | "moderate" | "high" {
  if (score >= 60) return "high";
  if (score >= 30) return "moderate";
  return "low";
}

export function riskColorVar(score: number): string {
  const t = riskTone(score);
  return t === "high" ? "var(--risk-high)" : t === "moderate" ? "var(--risk-moderate)" : "var(--risk-low)";
}

export function classificationColorVar(c: Classification): string {
  switch (c) {
    case "Possible Ictal Pattern":
      return "var(--risk-high)";
    case "Possible Preictal Pattern":
      return "var(--risk-moderate)";
    case "Normal / Interictal Pattern":
      return "var(--risk-low)";
    default:
      return "var(--risk-unknown)";
  }
}

export function fmt(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(2);
  return v.toFixed(digits);
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
}

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export const CLASS_TITLE: Record<string, string> = {
  interictal: "Interictal",
  preictal: "Preictal",
  ictal: "Ictal",
};
