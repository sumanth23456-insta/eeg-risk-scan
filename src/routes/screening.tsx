import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { captureConsent, roleCan, useTrialBridgeState } from "@/lib/trialbridge/store";

export const Route = createFileRoute("/screening")({
  component: ConsentPage,
});

function ConsentPage() {
  const state = useTrialBridgeState();
  const [version, setVersion] = useState("v2.2");
  const canCapture = roleCan("captureConsent");

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Digital consent management</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Version-tracked consent collection with immutable audit events per participant.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Consent queue</CardTitle>
          <CardDescription>
            Participants in consent stage awaiting digital signature capture.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-xs">
            <Input value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          {state.participants
            .filter((participant) => participant.stage === "consent")
            .map((participant) => (
              <div
                key={participant.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div>
                  <p className="font-medium">{participant.name}</p>
                  <p className="text-xs text-muted-foreground">{participant.id}</p>
                </div>
                <Button
                  size="sm"
                  disabled={!canCapture || !version}
                  onClick={() => captureConsent(participant.id, version)}
                >
                  Capture consent
                </Button>
              </div>
            ))}
          {state.participants.every((participant) => participant.stage !== "consent") ? (
            <p className="text-sm text-muted-foreground">
              No participants currently waiting for consent.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Consent history</CardTitle>
          <CardDescription>
            Versioned consent records used for regulatory traceability.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Signed at</TableHead>
                <TableHead>Participant</TableHead>
                <TableHead>Study</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Signed by role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.consents.map((consent) => (
                <TableRow key={consent.id}>
                  <TableCell>{new Date(consent.signedAt).toLocaleString()}</TableCell>
                  <TableCell>{consent.participantId}</TableCell>
                  <TableCell>{consent.studyId}</TableCell>
                  <TableCell>{consent.version}</TableCell>
                  <TableCell>{consent.signedByRole}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
