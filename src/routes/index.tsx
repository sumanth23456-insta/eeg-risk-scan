import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
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
import { getSitePerformance, getStageCounts, useTrialBridgeState } from "@/lib/trialbridge/store";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const state = useTrialBridgeState();
  const stages = useMemo(() => getStageCounts(state.participants), [state.participants]);
  const siteMetrics = useMemo(() => getSitePerformance(state), [state]);
  const openTasks = state.tasks.filter((task) => !task.done);

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Coordinator dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time trial operations snapshot across recruitment, eligibility, consent, tasks and
            sites.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/analysis">Run AI screening</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/screening">Capture consent</Link>
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Pre-screen" value={String(stages.preScreen)} />
        <Metric label="Human review" value={String(stages.humanReview)} />
        <Metric label="Consent pending" value={String(stages.consent)} />
        <Metric label="Enrolled" value={String(stages.enrolled)} />
        <Metric label="Open tasks" value={String(openTasks.length)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recruitment pipeline</CardTitle>
            <CardDescription>Discovery to enrollment with mandatory human gate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Discovery: {stages.discovery}</p>
            <p>Pre-screen: {stages.preScreen}</p>
            <p>Human review: {stages.humanReview}</p>
            <p>Consent: {stages.consent}</p>
            <p>Enrolled: {stages.enrolled}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Site performance</CardTitle>
            <CardDescription>Cross-site enrollment and conversion metrics.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead className="text-right">Enrolled</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {siteMetrics.map((site) => (
                  <TableRow key={site.siteId}>
                    <TableCell>{site.siteName}</TableCell>
                    <TableCell className="text-right">{site.enrolled}</TableCell>
                    <TableCell className="text-right">{site.targetEnrollment}</TableCell>
                    <TableCell className="text-right">{site.conversionRate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
