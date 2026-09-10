import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FEATURES } from "@/lib/eeg/features";
import { backendStatus } from "@/lib/eeg/backend";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Methodology, Limitations & Safety — NeuroRisk EEG" },
      {
        name: "description",
        content:
          "Signal processing, feature definitions, reference pattern construction, risk scoring formula, validation approach and safety limitations.",
      },
      { property: "og:title", content: "Methodology, Limitations & Safety — NeuroRisk EEG" },
      {
        property: "og:description",
        content: "How the EEG risk score is computed, validated, and why it is not a clinical tool.",
      },
    ],
  }),
  component: MethodologyPage,
});

function MethodologyPage() {
  const backend = backendStatus();
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Methodology & limitations</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Full description of the processing chain so results can be reproduced and critiqued.
      </p>

      <Alert variant="destructive" className="mt-6">
        <AlertTitle>Not a medical device</AlertTitle>
        <AlertDescription>
          This is an academic research prototype for Biomedical Engineering coursework. It has no
          regulatory clearance, no clinical validation, and no prospective evaluation on patient data.
          It must not be used for diagnosis, seizure monitoring, medication decisions, or any other
          clinical purpose.
        </AlertDescription>
      </Alert>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="1 · Signal validation">
          <p>
            Files are parsed in-browser (CSV/TXT numeric matrices, EDF/EDF+ headers with
            digital-to-physical scaling). Validation reports non-finite sample ratio, flat or
            near-constant channels, insufficient duration, and amplitude clipping. Quality is graded
            good / fair / poor and reduces the reported confidence.
          </p>
        </Section>

        <Section title="2 · Preprocessing">
          <p>
            Optional stages, applied in this order: invalid-sample interpolation, baseline (mean)
            removal, windowed-sinc FIR band-pass (default 0.5–45 Hz), bidirectional zero-phase IIR
            notch (50/60 Hz), and amplitude normalisation. Every applied step is listed alongside the
            result and included in the PDF report.
          </p>
        </Section>

        <Section title="3 · Parameter extraction">
          <p>
            Time-domain statistics, Welch power spectral density with absolute and relative band
            powers (delta, theta, alpha, beta, gamma), spectral edge/entropy descriptors, nonlinear
            measures (sample entropy, Hjorth mobility and complexity), and Daubechies-4 discrete
            wavelet energies plus wavelet entropy.
          </p>
        </Section>

        <Section title="4 · Reference pattern system">
          <p>
            Reference distributions are computed from a dataset — never hard-coded. For each class and
            parameter, the mean, standard deviation, median, interquartile range and range are stored.
            The built-in dataset is a deterministic synthetic cohort with subject grouping; any
            labelled dataset with subject IDs can replace it.
          </p>
        </Section>

        <Section title="5 · Pattern comparison">
          <p>
            Each parameter is z-scored against the class distribution and flagged within / above /
            below the interquartile range. A bounded Mahalanobis-like distance across all parameters
            is converted to a per-class similarity percentage.
          </p>
        </Section>

        <Section title="6 · Risk calculation">
          <p>
            A multinomial logistic (softmax) classifier trained with L2-regularised gradient descent
            produces class probabilities. The research risk score is
          </p>
          <p className="mt-2 rounded-md bg-secondary/40 px-3 py-2 font-mono text-xs">
            risk = 100 × (0.85 × P(preictal) + 1.00 × P(ictal))
          </p>
          <p className="mt-2">
            Confidence combines the probability margin with signal-quality penalties. Low confidence
            or ambiguous probabilities yield “Uncertain / Insufficient Data” instead of a class.
          </p>
        </Section>

        <Section title="7 · Validation">
          <p>
            Models are validated with patient-wise splitting to prevent subject leakage. Reported
            metrics are accuracy, per-class precision, recall, specificity, F1, one-vs-rest ROC-AUC,
            and the confusion matrix. Synthetic-data metrics are optimistic by construction.
          </p>
        </Section>

        <Section title="8 · Known limitations">
          <ul className="list-disc space-y-1 pl-4">
            <li>Single-channel analysis per run; no spatial or connectivity features.</li>
            <li>No artifact rejection by ICA; muscle and electrode artifacts can dominate.</li>
            <li>Preictal state definitions vary widely across the literature.</li>
            <li>No prospective, patient-level or cross-dataset evaluation.</li>
            <li>Synthetic demo data cannot represent real epileptiform morphology.</li>
            <li>
              Gamma is reported over 30–45 Hz only. The band-pass ceiling is 45 Hz, so gamma content
              above 45 Hz is never analysed even when the sampling rate would allow it.
            </li>
            <li>
              The Daubechies-4 decomposition is a circular (periodic) approximation of the discrete
              wavelet transform — edge samples wrap around instead of being reflected or zero-padded,
              so the first and last coefficients of each level carry boundary error.
            </li>
            <li>
              Sample entropy is computed on a subsample capped at 800 points to keep the O(N²)
              comparison tractable. Entropy values from windows of very different lengths are
              therefore not directly comparable.
            </li>
            <li>
              The channel-consistency filter excludes channels whose RMS is 6× off the group median;
              on heterogeneous montages this can drop a legitimately different brain region.
            </li>
          </ul>
        </Section>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Processing module bridge</CardTitle>
          <CardDescription>
            The architecture is modular: each stage can be delegated to a Python service (MNE, SciPy,
            PyWavelets, scikit-learn, PyTorch) by setting VITE_EEG_BACKEND_URL. Modules that are not
            connected are reported as such and never silently simulated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {backend.modules.map((m) => (
            <div key={m.name} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>{m.name}</span>
              <span className="flex items-center gap-2">
                <code className="text-muted-foreground">{m.endpoint}</code>
                <Badge variant={m.status === "not-connected" ? "outline" : "secondary"}>
                  {m.status}
                </Badge>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Parameter dictionary ({FEATURES.length})</CardTitle>
          <CardDescription>Definitions of every extracted parameter.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parameter</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Definition</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FEATURES.map((f) => (
                <TableRow key={f.key}>
                  <TableCell className="whitespace-nowrap">{f.label}</TableCell>
                  <TableCell className="text-muted-foreground">{f.group}</TableCell>
                  <TableCell className="text-muted-foreground">{f.unit}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{f.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}
