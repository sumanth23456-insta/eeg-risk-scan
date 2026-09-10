import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addStudy, roleCan, useTrialBridgeState } from "@/lib/trialbridge/store";

export const Route = createFileRoute("/patient")({
  component: StudySetupPage,
});

function StudySetupPage() {
  const state = useTrialBridgeState();
  const [name, setName] = useState("");
  const [protocolVersion, setProtocolVersion] = useState("v1.0");
  const [eligibilitySummary, setEligibilitySummary] = useState("");

  const canEdit = roleCan("editStudy");

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Study setup & management</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure study protocol version, eligibility criteria summary and participating sites.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create study</CardTitle>
            <CardDescription>
              Only Admin and PI roles can publish study setup changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Study name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="TB-003 ..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Protocol version</Label>
              <Input value={protocolVersion} onChange={(e) => setProtocolVersion(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Eligibility summary</Label>
              <Input
                value={eligibilitySummary}
                onChange={(e) => setEligibilitySummary(e.target.value)}
                placeholder="Adults 18-65, ..."
              />
            </div>
            <Button
              disabled={!canEdit || !name || !eligibilitySummary}
              onClick={() => {
                addStudy({
                  name,
                  protocolVersion,
                  eligibilitySummary,
                  siteIds: state.sites.map((site) => site.id),
                  status: "draft",
                });
                setName("");
                setEligibilitySummary("");
              }}
            >
              Add study draft
            </Button>
            {!canEdit ? (
              <p className="text-xs text-muted-foreground">Current role cannot edit studies.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configured sites</CardTitle>
            <CardDescription>Site assignments used for enrollment planning.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {state.sites.map((site) => (
              <p key={site.id}>
                {site.name} · target {site.targetEnrollment}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Study registry</CardTitle>
          <CardDescription>Version-tracked studies and eligibility definitions.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Study</TableHead>
                <TableHead>Protocol</TableHead>
                <TableHead>Eligibility</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.studies.map((study) => (
                <TableRow key={study.id}>
                  <TableCell>{study.name}</TableCell>
                  <TableCell>{study.protocolVersion}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {study.eligibilitySummary}
                  </TableCell>
                  <TableCell>{study.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
