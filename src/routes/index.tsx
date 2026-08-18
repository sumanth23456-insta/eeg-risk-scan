import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Activity, Brain, Database, FileUp, LineChart, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppState, hydrateHistory, ensureReference } from "@/lib/eeg/store";
import { fmt, fmtDate, riskColorVar } from "@/lib/eeg/ui";
import { backendStatus } from "@/lib/eeg/backend";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NeuroRisk EEG — Early Seizure Risk Assessment Dashboard" },
      {
        name: "description",
        content:
          "Research dashboard for EEG parameter-based early seizure risk assessment using pattern comparison and machine learning.",
      },
      { property: "og:title", content: "NeuroRisk EEG — Early Seizure Risk Assessment" },
      {
        property: "og:description",
        content:
          "Upload EEG recordings, extract time, frequency, nonlinear and wavelet parameters, and compute a research risk score.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const s = useAppState();

  useEffect(() => {
    hydrateHistory();
    ensureReference();
  }, []);

  const backend = backendStatus();
  const last = s.history[0];

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            EEG Parameter-Based Early Seizure Risk Assessment Using Pattern Comparison and Machine
            Learning. All signal processing runs locally in your browser.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/upload">
              <FileUp className="size-4" /> Upload recording
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/analysis">Open analysis</Link>
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Activity className="size-4" />}
          label="Loaded recording"
          value={s.recording ? s.recording.fileName : "None"}
          hint={
            s.recording
              ? `${s.recording.channelNames.length} ch · ${s.recording.samplingRate} Hz · ${s.recording.durationSec.toFixed(1)} s`
              : "Upload a file or start demo mode"
          }
        />
        <StatCard
          icon={<Brain className="size-4" />}
          label="Latest risk score"
          value={last ? `${last.riskScore.toFixed(0)} / 100` : "—"}
          hint={last ? last.classification : "No analysis yet"}
          color={last ? riskColorVar(last.riskScore) : undefined}
        />
        <StatCard
          icon={<Database className="size-4" />}
          label="Reference model"
          value={s.model ? s.model.datasetOrigin : "building…"}
          hint={
            s.model
              ? `${s.model.featureKeys.length} features · acc ${s.model.metrics ? fmt(s.model.metrics.accuracy * 100, 1) : "—"}%`
              : "Preparing reference distributions"
          }
        />
        <StatCard
          icon={<LineChart className="size-4" />}
          label="Analyses stored"
          value={String(s.history.length)}
          hint={last ? `Last: ${fmtDate(last.createdAt)}` : "History is kept in this browser"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Assessment workflow</CardTitle>
            <CardDescription>
              Each stage is deterministic and inspectable — no step fabricates data.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              ["1 · File upload", "CSV, TXT or EDF/EDF+ parsed in-browser."],
              ["2 · Signal validation", "Flat channels, invalid samples, duration and clipping checks."],
              ["3 · Preprocessing", "Baseline removal, FIR band-pass, zero-phase notch, normalisation."],
              ["4 · Parameter extraction", "Time, frequency band, nonlinear and wavelet features."],
              ["5 · Reference comparison", "Per-parameter z-scores against class distributions."],
              ["6 · Risk calculation", "Softmax model probabilities → 0–100 research risk score."],
              ["7 · Visualisation", "Waveform, spectrum, spectrogram and risk timeline."],
              ["8 · Reporting", "PDF report and locally stored analysis history."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-sm font-medium">{t}</p>
                <p className="mt-1 text-xs text-muted-foreground">{d}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-destructive" /> Safety notice
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p>
                This software is a Biomedical Engineering research prototype. It is not a medical
                device and has not been clinically validated.
              </p>
              <p>
                Outputs are algorithmic pattern-similarity scores. They must never be used for
                diagnosis, monitoring, or treatment decisions.
              </p>
              <Link to="/methodology" className="inline-block text-primary underline">
                Read the methodology and limitations
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Processing backend</CardTitle>
              <CardDescription>
                Modular architecture: an optional Python service (MNE, SciPy, scikit-learn) can take
                over any stage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {backend.modules.map((m) => (
                <div key={m.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{m.name}</span>
                  <Badge variant={m.status === "not-connected" ? "outline" : "secondary"}>
                    {m.status === "not-connected" ? "in-browser" : "remote"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <span className="text-primary">{icon}</span>
          {label}
        </div>
        <p className="mt-2 truncate text-lg font-semibold" style={color ? { color } : undefined}>
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
