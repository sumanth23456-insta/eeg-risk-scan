import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  completeHumanReview,
  explainEligibility,
  roleCan,
  runEligibilityScreen,
  useTrialBridgeState,
} from "@/lib/trialbridge/store";

export const Route = createFileRoute("/analysis")({
  component: EligibilityPage,
});

function EligibilityPage() {
  const state = useTrialBridgeState();
  const canRun = roleCan("runAI");
  const canReview = roleCan("reviewAI");

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">AI-assisted eligibility screening</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Machine-assisted eligibility recommendation with mandatory coordinator/PI human review.
      </p>

      <div className="mt-6 space-y-4">
        {state.participants.map((participant) => {
          const factors = explainEligibility(participant);
          return (
            <Card key={participant.id}>
              <CardHeader>
                <CardTitle>
                  {participant.name} ({participant.id})
                </CardTitle>
                <CardDescription>
                  Stage: {participant.stage} · AI: {participant.aiRecommendation ?? "not run"} ·
                  Human review: {participant.humanReview ?? "not started"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Score inputs → condition match {participant.signals.conditionMatch}, comorbidity
                  risk {participant.signals.comorbidityRisk}, travel availability{" "}
                  {participant.signals.travelAvailability}
                </p>
                <ul className="list-disc pl-4 text-sm text-muted-foreground">
                  {factors.map((factor) => (
                    <li key={factor}>{factor}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={!canRun}
                    onClick={() => runEligibilityScreen(participant.id)}
                  >
                    Run AI screening
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!canReview || participant.humanReview !== "pending"}
                    onClick={() => completeHumanReview(participant.id, "approved")}
                  >
                    Approve (human gate)
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!canReview || participant.humanReview !== "pending"}
                    onClick={() => completeHumanReview(participant.id, "rejected")}
                  >
                    Reject (human gate)
                  </Button>
                </div>
                {participant.aiScore !== null ? (
                  <p className="text-sm font-medium">
                    Current AI score: {participant.aiScore} / 100
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Alert className="mt-6">
        <AlertTitle>Human review is mandatory</AlertTitle>
        <AlertDescription>
          Enrollment decisions are blocked until a coordinator or PI explicitly approves screening
          results.
        </AlertDescription>
      </Alert>
    </AppShell>
  );
}
