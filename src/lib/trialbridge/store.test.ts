import { beforeEach, describe, expect, it } from "vitest";
import {
  completeHumanReview,
  getStageCounts,
  getTrialBridgeState,
  resetTrialBridgeState,
  roleCan,
  runEligibilityScreen,
  setRole,
} from "./store";

describe("trialbridge eligibility workflow", () => {
  beforeEach(() => {
    resetTrialBridgeState();
  });

  it("computes AI score and requires human review", () => {
    runEligibilityScreen("pt-101");
    const participant = getTrialBridgeState().participants.find((p) => p.id === "pt-101");
    expect(participant?.aiScore).not.toBeNull();
    expect(participant?.stage).toBe("human-review");
    expect(participant?.humanReview).toBe("pending");
  });

  it("moves approved candidates to consent stage", () => {
    runEligibilityScreen("pt-101");
    completeHumanReview("pt-101", "approved");
    const participant = getTrialBridgeState().participants.find((p) => p.id === "pt-101");
    expect(participant?.stage).toBe("consent");
    expect(participant?.humanReview).toBe("approved");
  });
});

describe("trialbridge rbac and metrics", () => {
  beforeEach(() => {
    resetTrialBridgeState();
  });

  it("enforces edit-study permission by role", () => {
    setRole("Monitor");
    expect(roleCan("editStudy")).toBe(false);
    setRole("PI");
    expect(roleCan("editStudy")).toBe(true);
  });

  it("returns recruitment stage counts", () => {
    const counts = getStageCounts(getTrialBridgeState().participants);
    expect(counts.preScreen).toBe(1);
    expect(counts.humanReview).toBe(1);
    expect(counts.enrolled).toBe(1);
  });
});
