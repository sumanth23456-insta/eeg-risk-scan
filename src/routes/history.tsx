import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { requireUnlocked } from "@/lib/gate.functions";
import { useEffect } from "react";
import { Trash2, Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clearHistory, getState, hydrateHistory, openAnalysis, useAppState } from "@/lib/eeg/store";
import { generateReport } from "@/lib/eeg/report";
import { generateScreeningReport } from "@/lib/fissure/report";
import { clearRecords, hydrateFissure, useFissureState } from "@/lib/fissure/store";
import { fmtDate, fmtTime, riskColorVar } from "@/lib/eeg/ui";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Analysis History — NeuroRisk EEG" },
      {
        name: "description",
        content:
          "Review previous EEG risk assessments, reopen full results and export research PDF reports.",
      },
      { property: "og:title", content: "Analysis History — NeuroRisk EEG" },
      {
        property: "og:description",
        content: "Locally stored log of previous EEG seizure risk analyses.",
      },
    ],
  }),
  loader: () => requireUnlocked(),
  component: HistoryPage,
});

function HistoryPage() {
  const s = useAppState();
  const f = useFissureState();
  const navigate = useNavigate();

  useEffect(() => {
    hydrateHistory();
    hydrateFissure();
  }, []);

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analysis history</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Stored in this browser only ({s.history.length} record{s.history.length === 1 ? "" : "s"}).
            Full results can be reopened while the session is active.
          </p>
        </div>
        {s.history.length ? (
          <Button variant="outline" onClick={clearHistory}>
            <Trash2 className="size-4" /> Clear history
          </Button>
        ) : null}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Previous assessments</CardTitle>
          <CardDescription>Most recent first.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {s.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No analyses yet. Run one from the analysis page.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Channel / window</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead className="text-right">Risk</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.history.map((h) => {
                  const available = Boolean(s.analyses[h.id]);
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDate(h.createdAt)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{h.fileName}</span>
                        <Badge variant="outline" className="ml-2">
                          {h.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {h.analysedChannel} · {fmtTime(h.windowStart)}–{fmtTime(h.windowEnd)}
                      </TableCell>
                      <TableCell className="text-sm">{h.classification}</TableCell>
                      <TableCell
                        className="text-right font-mono"
                        style={{ color: riskColorVar(h.riskScore) }}
                      >
                        {h.riskScore.toFixed(0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {h.confidence.toFixed(0)}%
                      </TableCell>
                      <TableCell className="space-x-2 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!available}
                          onClick={() => {
                            openAnalysis(h.id);
                            void navigate({ to: "/analysis" });
                          }}
                        >
                          Open
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!available}
                          onClick={() => {
                            const a = getState().analyses[h.id];
                            if (a) generateReport(a);
                          }}
                        >
                          <Download className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Research screening records</CardTitle>
          <CardDescription>
            Saved patient + clinical records with their screening outcome ({f.records.length}).
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {f.records.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No screening records saved yet. Enter patient and clinical parameters, then save the
              result.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Patient ID</TableHead>
                    <TableHead>Age / sex</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>EEG</TableHead>
                    <TableHead className="text-right">Report</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {f.records.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDate(r.createdAt)}
                      </TableCell>
                      <TableCell>{r.patient.patientId || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.patient.age ?? "—"} / {r.patient.sex || "—"}
                      </TableCell>
                      <TableCell>{r.screening.category}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.screening.score ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.eeg ? (r.eeg.source === "demo" ? "Synthetic demo" : r.eeg.fileName) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateScreeningReport(r)}
                        >
                          <Download className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4">
                <Button variant="outline" size="sm" onClick={clearRecords}>
                  <Trash2 className="size-4" /> Clear screening records
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
