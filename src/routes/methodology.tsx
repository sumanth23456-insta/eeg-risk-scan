import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSitePerformance, useTrialBridgeState } from "@/lib/trialbridge/store";

export const Route = createFileRoute("/methodology")({
  component: CompliancePage,
});

function CompliancePage() {
  const state = useTrialBridgeState();
  const siteMetrics = getSitePerformance(state);

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">
        Site coordination, RBAC and audit trails
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Multi-site operational oversight with GCP-aligned activity traceability.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Research site coordination</CardTitle>
          <CardDescription>
            Comparative view of recruitment throughput across sites.
          </CardDescription>
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Role-based access model (6 roles)</CardTitle>
          <CardDescription>Admin, PI, Coordinator, Monitor, Participant, Sponsor.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>Admin: full configuration and oversight</p>
          <p>PI: protocol and eligibility authority</p>
          <p>Coordinator: daily operations and review queue</p>
          <p>Monitor: compliance and source verification</p>
          <p>Participant: portal access and consent visibility</p>
          <p>Sponsor: portfolio metrics and monitoring views</p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>GCP-aligned audit log</CardTitle>
          <CardDescription>
            Every key action is timestamped with actor role and entity.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.audit.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{new Date(event.at).toLocaleString()}</TableCell>
                  <TableCell>{event.actorRole}</TableCell>
                  <TableCell>{event.action}</TableCell>
                  <TableCell>{event.entity}</TableCell>
                  <TableCell className="text-muted-foreground">{event.details}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
