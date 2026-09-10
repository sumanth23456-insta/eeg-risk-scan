import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { moveToNextRecruitmentStage, useTrialBridgeState } from "@/lib/trialbridge/store";

export const Route = createFileRoute("/upload")({
  component: RecruitmentPage,
});

function RecruitmentPage() {
  const state = useTrialBridgeState();

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Participant recruitment workflow</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        End-to-end participant movement from discovery to enrollment with stage-based tracking.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recruitment pipeline</CardTitle>
          <CardDescription>
            Advance participants as outreach, screening and coordination complete.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Participant</TableHead>
                <TableHead>Study</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Current stage</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.participants.map((participant) => {
                const study = state.studies.find((item) => item.id === participant.studyId);
                const site = state.sites.find((item) => item.id === participant.siteId);
                return (
                  <TableRow key={participant.id}>
                    <TableCell>
                      {participant.name}{" "}
                      <span className="text-muted-foreground">({participant.id})</span>
                    </TableCell>
                    <TableCell>{study?.name ?? participant.studyId}</TableCell>
                    <TableCell>{site?.name ?? participant.siteId}</TableCell>
                    <TableCell>{participant.stage}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={participant.stage === "enrolled"}
                        onClick={() => moveToNextRecruitmentStage(participant.id)}
                      >
                        Move next
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
