import { createFileRoute } from "@tanstack/react-router";
import { requireUnlocked } from "@/lib/gate.functions";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTrialBridgeState } from "@/lib/trialbridge/store";

export const Route = createFileRoute("/history")({
  loader: () => requireUnlocked(),
  component: ParticipantPortalPage,
});

function ParticipantPortalPage() {
  const state = useTrialBridgeState();
  const participants = state.participants;

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Participant portal</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Self-service status tracking, upcoming reminders and consent-document visibility.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {participants.map((participant) => (
          <Card key={participant.id}>
            <CardHeader>
              <CardTitle>{participant.name}</CardTitle>
              <CardDescription>{participant.id}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>Current status: {participant.stage}</p>
              <p>Eligibility outcome: {participant.aiRecommendation ?? "Pending"}</p>
              <p>Consent version: {participant.consentVersion ?? "Pending"}</p>
              <p>
                Next reminder:{" "}
                {participant.stage === "enrolled"
                  ? "Upcoming study visit"
                  : "Coordinator follow-up"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
