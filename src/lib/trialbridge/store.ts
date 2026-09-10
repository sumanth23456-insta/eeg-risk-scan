import { useSyncExternalStore } from "react";

export type TrialRole = "Admin" | "PI" | "Coordinator" | "Monitor" | "Participant" | "Sponsor";

export type RecruitmentStage =
  "discovery" | "pre-screen" | "ai-screened" | "human-review" | "consent" | "enrolled";

export interface Site {
  id: string;
  name: string;
  targetEnrollment: number;
}

export interface Study {
  id: string;
  name: string;
  protocolVersion: string;
  eligibilitySummary: string;
  siteIds: string[];
  status: "draft" | "active";
}

export interface CandidateSignals {
  age: number;
  conditionMatch: number;
  comorbidityRisk: number;
  travelAvailability: number;
}

export interface Participant {
  id: string;
  name: string;
  siteId: string;
  studyId: string;
  stage: RecruitmentStage;
  signals: CandidateSignals;
  aiScore: number | null;
  aiRecommendation: "Likely eligible" | "Borderline" | "Likely ineligible" | null;
  humanReview: "pending" | "approved" | "rejected" | null;
  consentVersion: string | null;
}

export interface VisitTask {
  id: string;
  participantId: string;
  siteId: string;
  label: string;
  dueOn: string;
  done: boolean;
}

export interface ConsentRecord {
  id: string;
  participantId: string;
  studyId: string;
  version: string;
  signedAt: string;
  signedByRole: TrialRole;
}

export interface AuditEvent {
  id: string;
  at: string;
  actorRole: TrialRole;
  action: string;
  entity: string;
  details: string;
}

interface State {
  role: TrialRole;
  studies: Study[];
  sites: Site[];
  participants: Participant[];
  tasks: VisitTask[];
  consents: ConsentRecord[];
  audit: AuditEvent[];
}

const STORAGE_KEY = "trialbridge_state_v1";

function nowIso() {
  return new Date().toISOString();
}

function seedState(): State {
  return {
    role: "Coordinator",
    sites: [
      { id: "site-nyc", name: "TrialBridge NYC", targetEnrollment: 20 },
      { id: "site-sfo", name: "TrialBridge SFO", targetEnrollment: 18 },
      { id: "site-atl", name: "TrialBridge ATL", targetEnrollment: 16 },
    ],
    studies: [
      {
        id: "study-tb-001",
        name: "TB-001 Type 2 Diabetes Outcomes",
        protocolVersion: "v1.3",
        eligibilitySummary: "Adults 18-70, HbA1c 7.0-10.5, no severe renal impairment",
        siteIds: ["site-nyc", "site-sfo"],
        status: "active",
      },
      {
        id: "study-tb-002",
        name: "TB-002 Heart Failure Lifestyle Study",
        protocolVersion: "v0.9",
        eligibilitySummary: "Adults 30-80, stable NYHA II/III, smartphone access",
        siteIds: ["site-atl"],
        status: "draft",
      },
    ],
    participants: [
      {
        id: "pt-101",
        name: "Alex Carter",
        siteId: "site-nyc",
        studyId: "study-tb-001",
        stage: "pre-screen",
        signals: { age: 54, conditionMatch: 82, comorbidityRisk: 25, travelAvailability: 75 },
        aiScore: null,
        aiRecommendation: null,
        humanReview: null,
        consentVersion: null,
      },
      {
        id: "pt-102",
        name: "Rina Patel",
        siteId: "site-sfo",
        studyId: "study-tb-001",
        stage: "human-review",
        signals: { age: 43, conditionMatch: 78, comorbidityRisk: 38, travelAvailability: 68 },
        aiScore: 66,
        aiRecommendation: "Borderline",
        humanReview: "pending",
        consentVersion: null,
      },
      {
        id: "pt-103",
        name: "Jordan Lee",
        siteId: "site-atl",
        studyId: "study-tb-002",
        stage: "enrolled",
        signals: { age: 60, conditionMatch: 85, comorbidityRisk: 21, travelAvailability: 81 },
        aiScore: 81,
        aiRecommendation: "Likely eligible",
        humanReview: "approved",
        consentVersion: "v2.1",
      },
    ],
    tasks: [
      {
        id: "task-1",
        participantId: "pt-103",
        siteId: "site-atl",
        label: "Week 2 follow-up visit",
        dueOn: "2026-09-12",
        done: false,
      },
      {
        id: "task-2",
        participantId: "pt-103",
        siteId: "site-atl",
        label: "Baseline labs review",
        dueOn: "2026-09-11",
        done: true,
      },
      {
        id: "task-3",
        participantId: "pt-102",
        siteId: "site-sfo",
        label: "Manual eligibility review",
        dueOn: "2026-09-10",
        done: false,
      },
    ],
    consents: [
      {
        id: "consent-1",
        participantId: "pt-103",
        studyId: "study-tb-002",
        version: "v2.1",
        signedAt: "2026-09-08T10:30:00.000Z",
        signedByRole: "Participant",
      },
    ],
    audit: [
      {
        id: "audit-1",
        at: "2026-09-08T10:31:00.000Z",
        actorRole: "Coordinator",
        action: "consent_captured",
        entity: "participant:pt-103",
        details: "Digital consent version v2.1 recorded.",
      },
      {
        id: "audit-2",
        at: "2026-09-09T09:00:00.000Z",
        actorRole: "Monitor",
        action: "audit_review",
        entity: "study:study-tb-001",
        details: "Review completed for recruitment logs and consent versions.",
      },
    ],
  };
}

function scoreSignals(signals: CandidateSignals): {
  score: number;
  recommendation: Participant["aiRecommendation"];
  factors: string[];
} {
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        signals.conditionMatch * 0.45 +
          (100 - signals.comorbidityRisk) * 0.35 +
          signals.travelAvailability * 0.2,
      ),
    ),
  );

  const recommendation: Participant["aiRecommendation"] =
    score >= 75 ? "Likely eligible" : score >= 55 ? "Borderline" : "Likely ineligible";

  const factors = [
    `Condition-match contribution: ${(signals.conditionMatch * 0.45).toFixed(1)}`,
    `Comorbidity adjustment: ${((100 - signals.comorbidityRisk) * 0.35).toFixed(1)}`,
    `Logistics contribution: ${(signals.travelAvailability * 0.2).toFixed(1)}`,
  ];

  return { score, recommendation, factors };
}

function loadState(): State {
  if (typeof window === "undefined") return seedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as State;
    if (!parsed.studies || !parsed.participants || !parsed.sites) return seedState();
    return parsed;
  } catch {
    return seedState();
  }
}

let state: State = seedState();
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
}

export function hydrateTrialBridge() {
  state = loadState();
  listeners.forEach((listener) => listener());
}

export function resetTrialBridgeState() {
  state = seedState();
  listeners.forEach((listener) => listener());
}

export function subscribeTrialBridge(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverSnapshot = state;

export function useTrialBridgeState() {
  return useSyncExternalStore(
    subscribeTrialBridge,
    () => state,
    () => serverSnapshot,
  );
}

export function getTrialBridgeState() {
  return state;
}

export function setRole(role: TrialRole) {
  emit({ ...state, role });
}

export function addStudy(input: Omit<Study, "id">) {
  const id = `study-${Date.now().toString(36)}`;
  const study: Study = { id, ...input };
  emit({
    ...state,
    studies: [study, ...state.studies],
    audit: [
      {
        id: `audit-${Date.now().toString(36)}`,
        at: nowIso(),
        actorRole: state.role,
        action: "study_created",
        entity: `study:${id}`,
        details: `Created ${study.name} with protocol ${study.protocolVersion}`,
      },
      ...state.audit,
    ],
  });
}

export function moveToNextRecruitmentStage(participantId: string) {
  const steps: RecruitmentStage[] = [
    "discovery",
    "pre-screen",
    "ai-screened",
    "human-review",
    "consent",
    "enrolled",
  ];
  const participants = state.participants.map((participant) => {
    if (participant.id !== participantId) return participant;
    const index = steps.indexOf(participant.stage);
    const nextStage = steps[Math.min(index + 1, steps.length - 1)] ?? participant.stage;
    return { ...participant, stage: nextStage };
  });

  emit({
    ...state,
    participants,
    audit: [
      {
        id: `audit-${Date.now().toString(36)}`,
        at: nowIso(),
        actorRole: state.role,
        action: "recruitment_stage_updated",
        entity: `participant:${participantId}`,
        details: "Participant moved to next recruitment stage.",
      },
      ...state.audit,
    ],
  });
}

export function runEligibilityScreen(participantId: string) {
  let factors: string[] = [];
  const participants = state.participants.map((participant) => {
    if (participant.id !== participantId) return participant;
    const scored = scoreSignals(participant.signals);
    factors = scored.factors;
    return {
      ...participant,
      aiScore: scored.score,
      aiRecommendation: scored.recommendation,
      stage: "human-review",
      humanReview: "pending",
    };
  });

  emit({
    ...state,
    participants,
    audit: [
      {
        id: `audit-${Date.now().toString(36)}`,
        at: nowIso(),
        actorRole: state.role,
        action: "ai_screening_completed",
        entity: `participant:${participantId}`,
        details: factors.join(" | "),
      },
      ...state.audit,
    ],
  });
}

export function completeHumanReview(participantId: string, decision: "approved" | "rejected") {
  const participants = state.participants.map((participant) => {
    if (participant.id !== participantId) return participant;
    if (participant.humanReview !== "pending" || participant.aiScore === null) return participant;
    return {
      ...participant,
      humanReview: decision,
      stage: decision === "approved" ? "consent" : "pre-screen",
    };
  });

  emit({
    ...state,
    participants,
    audit: [
      {
        id: `audit-${Date.now().toString(36)}`,
        at: nowIso(),
        actorRole: state.role,
        action: "human_review_completed",
        entity: `participant:${participantId}`,
        details: `Decision: ${decision}`,
      },
      ...state.audit,
    ],
  });
}

export function captureConsent(participantId: string, version: string) {
  const participant = state.participants.find((p) => p.id === participantId);
  if (!participant) return;

  const participants = state.participants.map((item) =>
    item.id === participantId ? { ...item, consentVersion: version, stage: "enrolled" } : item,
  );

  const record: ConsentRecord = {
    id: `consent-${Date.now().toString(36)}`,
    participantId,
    studyId: participant.studyId,
    version,
    signedAt: nowIso(),
    signedByRole: "Participant",
  };

  emit({
    ...state,
    participants,
    consents: [record, ...state.consents],
    audit: [
      {
        id: `audit-${Date.now().toString(36)}`,
        at: nowIso(),
        actorRole: state.role,
        action: "consent_captured",
        entity: `participant:${participantId}`,
        details: `Digital consent captured for version ${version}`,
      },
      ...state.audit,
    ],
  });
}

export function completeTask(taskId: string) {
  const tasks = state.tasks.map((task) => (task.id === taskId ? { ...task, done: true } : task));
  emit({
    ...state,
    tasks,
    audit: [
      {
        id: `audit-${Date.now().toString(36)}`,
        at: nowIso(),
        actorRole: state.role,
        action: "task_completed",
        entity: `task:${taskId}`,
        details: "Study visit/task marked complete.",
      },
      ...state.audit,
    ],
  });
}

export function roleCan(
  action: "editStudy" | "runAI" | "reviewAI" | "captureConsent" | "viewAudit",
) {
  const role = state.role;
  if (action === "editStudy") return role === "Admin" || role === "PI";
  if (action === "runAI") return role !== "Participant";
  if (action === "reviewAI") return role === "PI" || role === "Coordinator";
  if (action === "captureConsent") return role === "Coordinator" || role === "Participant";
  if (action === "viewAudit") return role !== "Participant";
  return false;
}

export function getStageCounts(participants: Participant[]) {
  return {
    discovery: participants.filter((p) => p.stage === "discovery").length,
    preScreen: participants.filter((p) => p.stage === "pre-screen").length,
    humanReview: participants.filter((p) => p.stage === "human-review").length,
    consent: participants.filter((p) => p.stage === "consent").length,
    enrolled: participants.filter((p) => p.stage === "enrolled").length,
  };
}

export function getSitePerformance(stateValue: State) {
  return stateValue.sites.map((site) => {
    const siteParticipants = stateValue.participants.filter((p) => p.siteId === site.id);
    const enrolled = siteParticipants.filter((p) => p.stage === "enrolled").length;
    return {
      siteId: site.id,
      siteName: site.name,
      enrolled,
      targetEnrollment: site.targetEnrollment,
      conversionRate: siteParticipants.length
        ? Math.round((enrolled / siteParticipants.length) * 100)
        : 0,
    };
  });
}

export function explainEligibility(participant: Participant) {
  const scored = scoreSignals(participant.signals);
  return scored.factors;
}
