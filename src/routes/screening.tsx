import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppState, hydrateHistory } from "@/lib/eeg/store";
import { toEegSummary } from "@/lib/fissure/eeg-summary";
import { categoryColorVar, computeScreening } from "@/lib/fissure/screening";
import { generateScreeningReport } from "@/lib/fissure/report";
import { hydrateFissure, saveRecord, useFissureState } from "@/lib/fissure/store";
import { DISCLAIMER, type ResearchAnalysisRecord } from "@/lib/fissure/types";

export const Route = createFileRoute("/screening")({
  head: () => ({
    meta: [
      { title: "Research Screening Result — NeuroRisk Research Prototype" },
      {
        name: "description",
        content:
          "Transparent rule-based research screening result combining patient metadata and clinical symptom parameters, with a separate EEG signal summary.",
      },
      { property: "og:title", content: "Research Screening Result — NeuroRisk Research" },
      {
        property: "og:description",
        content:
          "Research screening likelihood category, point breakdown, findings and limitations. Not a medical diagnosis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScreeningPage,
});

function ScreeningPage() {
  const { patient, clinical } = useFissureState();
  const app = useAppState();
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    hydrateFissure();
    hydrateHistory();
  }, []);

  const eeg = useMemo(() => (app.analysis ? toEegSummary(app.analysis) : null), [app.analysis]);
  const screening = useMemo(
    () => computeScreening(patient, clinical, eeg),
    [patient, clinical, eeg],
  );

  const record: ResearchAnalysisRecord = useMemo(
    () => ({
      id: `rec-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      patient,
      clinical,
      eeg,
      screening,
    }),
    [patient, clinical, eeg, screening],
  );

  const color = categoryColorVar(screening.category);

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Research screening result</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Likelihood assessment for research purposes. This is not a diagnosis and does not
            replace clinical examination.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link to="/patient">Edit parameters</Link>
          </Button>
          <Button
            onClick={() => {
              saveRecord(record);
              setSaved(record.id);
            }}
          >
            <Save className="size-4" /> Save record
          </Button>
          <Button variant="outline" onClick={() => generateScreeningReport(record)}>
            <Download className="size-4" /> PDF report
          </Button>
        </div>
      </div>

      {saved ? (
        <p className="mt-4 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          Record saved to this browser ({saved}). See it under History.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Screening category</CardTitle>
            <CardDescription>Patient {patient.patientId || "—"}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold" style={{ color: `hsl(var(${color}))` }}>
              {screening.category}
            </p>
            <p className="mt-3 text-3xl font-semibold tabular-nums">
              {screening.score === null ? "—" : screening.score}
              <span className="ml-1 text-base font-normal text-muted-foreground">
                / {screening.maxScore}
              </span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Research screening score — a transparent sum of symptom points, not a probability.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline">
                {eeg ? "EEG summary attached" : "No EEG recording attached"}
              </Badge>
              {eeg?.source === "demo" ? (
                <Badge variant="destructive">Synthetic EEG — testing/demo only</Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Findings</CardTitle>
            <CardDescription>Derived from the clinical parameters entered.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {screening.findings.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            {screening.missing.length > 0 ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Not provided: {screening.missing.join(", ")}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {screening.breakdown.length > 0 ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Score breakdown</CardTitle>
            <CardDescription>Every point is traceable to an entered parameter.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parameter</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {screening.breakdown.map((b) => (
                  <TableRow key={b.label}>
                    <TableCell>{b.label}</TableCell>
                    <TableCell className="text-muted-foreground">{b.detail}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>EEG signal summary</CardTitle>
          <CardDescription>
            Neurological signal parameters only. These values do not contribute to the fissure
            screening score.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!eeg ? (
            <p className="text-sm text-muted-foreground">
              No EEG analysis in this session.{" "}
              <Link to="/upload" className="underline">
                Upload a recording
              </Link>{" "}
              to attach a signal summary.
            </p>
          ) : (
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Field label="File" value={eeg.fileName} />
              <Field label="Channels" value={eeg.eegChannels.join(", ")} />
              <Field label="Sampling frequency" value={`${eeg.samplingFrequency} Hz`} />
              <Field label="Duration" value={`${eeg.recordingDuration.toFixed(1)} s`} />
              <Field label="Signal quality" value={eeg.signalQuality} />
              <Field label="Delta power" value={eeg.deltaPower.toFixed(2)} />
              <Field label="Theta power" value={eeg.thetaPower.toFixed(2)} />
              <Field label="Alpha power" value={eeg.alphaPower.toFixed(2)} />
              <Field label="Beta power" value={eeg.betaPower.toFixed(2)} />
              <Field label="Gamma power" value={eeg.gammaPower.toFixed(2)} />
              <Field label="Mean amplitude" value={`${eeg.meanAmplitude.toFixed(2)} µV`} />
              <Field label="Peak frequency" value={`${eeg.peakFrequency.toFixed(2)} Hz`} />
            </div>
          )}
        </CardContent>
      </Card>

      <Alert className="mt-4">
        <AlertTitle className="flex items-center gap-2">
          <FileText className="size-4" /> Limitations and disclaimer
        </AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-1 pl-4">
            {screening.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="mt-3">{DISCLAIMER}</p>
        </AlertDescription>
      </Alert>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-medium">{value}</p>
    </div>
  );
}
