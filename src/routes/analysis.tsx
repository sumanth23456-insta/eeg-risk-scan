import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Download, Loader2, Play } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SpectrogramCanvas } from "@/components/eeg/SpectrogramCanvas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { decimateForPlot } from "@/lib/eeg/dsp";
import { featureMeta, FEATURES } from "@/lib/eeg/features";
import { preprocess, runAnalysis, sliceWindow } from "@/lib/eeg/pipeline";
import { generateReport } from "@/lib/eeg/report";
import {
  ensureReference,
  saveAnalysis,
  setChannel,
  setPreprocess,
  setShowProcessed,
  setWindow,
  useAppState,
} from "@/lib/eeg/store";
import { CLASS_TITLE, classificationColorVar, fmt, fmtTime, riskColorVar } from "@/lib/eeg/ui";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Signal Analysis & Risk Assessment — NeuroRisk EEG" },
      {
        name: "description",
        content:
          "Interactive EEG waveform, spectrum and spectrogram viewer with parameter extraction, reference comparison and explainable risk scoring.",
      },
      { property: "og:title", content: "Signal Analysis & Risk Assessment — NeuroRisk EEG" },
      {
        property: "og:description",
        content: "Explore EEG parameters, pattern comparison and a 0–100 research seizure risk score.",
      },
    ],
  }),
  component: AnalysisPage,
});

function AnalysisPage() {
  const s = useAppState();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ensureReference();
  }, []);

  const rec = s.recording;

  const preview = useMemo(() => {
    if (!rec) return null;
    const raw = sliceWindow(rec, s.channelIndex, s.windowStart, s.windowEnd);
    const pre = preprocess(raw, rec.samplingRate, s.preprocess);
    const source = s.showProcessed ? pre.signal : raw;
    return {
      pre,
      points: decimateForPlot(source, rec.samplingRate, s.windowStart, 1200),
    };
  }, [rec, s.channelIndex, s.windowStart, s.windowEnd, s.preprocess, s.showProcessed]);

  function analyse() {
    if (!rec) return;
    setBusy(true);
    setTimeout(() => {
      try {
        const { table, model } = ensureReference();
        const a = runAnalysis({
          recording: rec,
          channelIndex: s.channelIndex,
          windowStart: s.windowStart,
          windowEnd: s.windowEnd,
          options: s.preprocess,
          model,
          table,
        });
        saveAnalysis(a);
      } finally {
        setBusy(false);
      }
    }, 10);
  }

  if (!rec) {
    return (
      <AppShell>
        <h1 className="text-2xl font-semibold tracking-tight">Analysis</h1>
        <Alert className="mt-6 max-w-2xl">
          <AlertTitle>No recording loaded</AlertTitle>
          <AlertDescription>
            Upload a CSV, TXT or EDF file — or load a synthetic demo recording — to begin.{" "}
            <Link to="/upload" className="text-primary underline">
              Go to upload
            </Link>
          </AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  const a = s.analysis;
  const maxEnd = rec.durationSec;

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analysis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rec.fileName} · {rec.format} · {rec.samplingRate} Hz · {rec.durationSec.toFixed(1)} s
            {rec.source === "demo" ? " · SYNTHETIC DEMO DATA" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={analyse} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run analysis
          </Button>
          {a ? (
            <Button variant="secondary" onClick={() => generateReport(a)}>
              <Download className="size-4" /> PDF report
            </Button>
          ) : null}
        </div>
      </div>

      {rec.source === "demo" ? (
        <Alert className="mt-4">
          <AlertTitle>Demo mode</AlertTitle>
          <AlertDescription>
            {rec.demoLabel ?? "Synthetic recording"} — generated in-browser. Not real patient data.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Preprocessing</CardTitle>
            <CardDescription>Applied before every extraction.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select
                value={String(s.channelIndex)}
                onValueChange={(v) => setChannel(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rec.channelNames.map((c, i) => (
                    <SelectItem key={c + i} value={String(i)}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                Window: {fmtTime(s.windowStart)} – {fmtTime(s.windowEnd)}
              </Label>
              <Slider
                min={0}
                max={Math.max(1, maxEnd)}
                step={0.5}
                value={[s.windowStart, Math.min(s.windowEnd, maxEnd)]}
                onValueChange={(v) => setWindow(v[0] ?? 0, Math.max((v[0] ?? 0) + 1, v[1] ?? 1))}
              />
            </div>

            <Toggle
              label="Show processed signal"
              checked={s.showProcessed}
              onChange={setShowProcessed}
            />
            <Toggle
              label="Baseline correction"
              checked={s.preprocess.baseline}
              onChange={(v) => setPreprocess({ baseline: v })}
            />
            <Toggle
              label={`Band-pass ${s.preprocess.bandLow}–${s.preprocess.bandHigh} Hz`}
              checked={s.preprocess.bandpass}
              onChange={(v) => setPreprocess({ bandpass: v })}
            />
            <Toggle
              label={`Notch ${s.preprocess.notchFreq} Hz`}
              checked={s.preprocess.notch}
              onChange={(v) => setPreprocess({ notch: v })}
            />
            <Toggle
              label="Amplitude normalisation"
              checked={s.preprocess.normalize}
              onChange={(v) => setPreprocess({ normalize: v })}
            />
            <Toggle
              label="Interpolate invalid samples"
              checked={s.preprocess.removeInvalid}
              onChange={(v) => setPreprocess({ removeInvalid: v })}
            />

            {preview ? (
              <ul className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                {preview.pre.steps
                  .filter((st) => st.applied)
                  .map((st) => (
                    <li key={st.name}>• {st.name}: {st.detail}</li>
                  ))}
                <li>• Artifact ratio: {(preview.pre.artifactRatio * 100).toFixed(2)}%</li>
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Waveform</CardTitle>
            <CardDescription>
              {s.showProcessed ? "Preprocessed" : "Raw"} trace, {rec.channelNames[s.channelIndex]} ({rec.unit})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={preview?.points ?? []}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  tickFormatter={(v: number) => v.toFixed(1)}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} width={48} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  labelFormatter={(v) => `t = ${Number(v).toFixed(2)} s`}
                  formatter={(v: number) => [fmt(v, 2), rec.unit]}
                />
                <Line
                  type="monotone"
                  dataKey="v"
                  dot={false}
                  stroke="var(--signal-trace)"
                  strokeWidth={1}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {!a ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Set the window and preprocessing, then run the analysis to compute parameters and the risk
          score.
        </p>
      ) : (
        <Results />
      )}
    </AppShell>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <Label className="text-xs font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Results() {
  const s = useAppState();
  const a = s.analysis!;
  const risk = a.risk;
  const color = riskColorVar(risk.riskScore);

  const bandData = a.bandPowers.map((b) => ({
    band: b.band,
    relative: b.relative * 100,
  }));

  return (
    <div className="mt-8 space-y-6">
      {risk.earlyWarning ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Early warning: preictal-like pattern detected</AlertTitle>
          <AlertDescription>
            Parameters in this window resemble the preictal reference distribution. This is a research
            signal only — it is not a clinical alert and must not drive care decisions.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Risk score</CardTitle>
            <CardDescription>Algorithmic 0–100 research score</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <span className="text-5xl font-semibold" style={{ color }}>
                {risk.riskScore.toFixed(0)}
              </span>
              <span className="pb-2 text-sm text-muted-foreground">/ 100</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full"
                style={{ width: `${risk.riskScore}%`, backgroundColor: color }}
              />
            </div>
            <p
              className="mt-4 text-sm font-medium"
              style={{ color: classificationColorVar(risk.classification) }}
            >
              {risk.classification}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Confidence {risk.confidence.toFixed(0)}% · window {fmtTime(a.windowStart)}–
              {fmtTime(a.windowEnd)} · channel {a.analysedChannel}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Class probabilities</CardTitle>
            <CardDescription>{a.modelAlgorithm}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(["interictal", "preictal", "ictal"] as const).map((c) => (
              <div key={c}>
                <div className="flex justify-between text-xs">
                  <span>{CLASS_TITLE[c]}</span>
                  <span className="text-muted-foreground">
                    {(risk.probs[c] * 100).toFixed(1)}% · similarity {risk.similarity[c].toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${risk.probs[c] * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Band power distribution</CardTitle>
            <CardDescription>Relative power (%)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={bandData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="band" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} width={36} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, "relative power"]}
                />
                <Bar dataKey="relative" fill="var(--primary)" radius={3} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Power spectral density</CardTitle>
            <CardDescription>Welch periodogram (µV²/Hz)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={a.spectrum}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="freq"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v: number) => v.toFixed(0)}
                />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} width={52} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  labelFormatter={(v) => `${Number(v).toFixed(1)} Hz`}
                  formatter={(v: number) => [fmt(v), "PSD"]}
                />
                <Area
                  type="monotone"
                  dataKey="power"
                  stroke="var(--signal-trace)"
                  fill="var(--signal-trace)"
                  fillOpacity={0.18}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spectrogram</CardTitle>
            <CardDescription>Time–frequency power (dB)</CardDescription>
          </CardHeader>
          <CardContent>
            <SpectrogramCanvas data={a.spectrogram} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Risk timeline</CardTitle>
          <CardDescription>
            Sliding-window risk across the whole recording (same preprocessing and model).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={a.timeline}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="start"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickFormatter={(v: number) => `${v.toFixed(0)}s`}
              />
              <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} width={36} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }}
                labelFormatter={(v) => `t = ${Number(v).toFixed(1)} s`}
                formatter={(v: number) => [v.toFixed(1), "risk"]}
              />
              <Area
                type="monotone"
                dataKey="risk"
                stroke="var(--risk-moderate)"
                fill="var(--risk-moderate)"
                fillOpacity={0.2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Tabs defaultValue="features">
        <TabsList>
          <TabsTrigger value="features">Parameters</TabsTrigger>
          <TabsTrigger value="comparison">Reference comparison</TabsTrigger>
          <TabsTrigger value="xai">Explainability</TabsTrigger>
        </TabsList>

        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Extracted parameters ({a.featureCount})</CardTitle>
              <CardDescription>
                Time-domain, frequency-domain, nonlinear and wavelet features.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parameter</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {FEATURES.map((f) => (
                    <TableRow key={f.key}>
                      <TableCell title={f.description}>{f.label}</TableCell>
                      <TableCell className="text-muted-foreground">{f.group}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt(a.features[f.key] ?? NaN)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{f.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparison">
          <Card>
            <CardHeader>
              <CardTitle>Comparison with reference distributions</CardTitle>
              <CardDescription>
                z-scores against the {a.modelDatasetOrigin} reference set for the predicted class (
                {CLASS_TITLE[risk.predictedClass]}).
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parameter</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Ref mean ± SD</TableHead>
                    <TableHead className="text-right">z</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(a.comparisons[risk.predictedClass] ?? []).map((c) => (
                    <TableRow key={c.key}>
                      <TableCell>{featureMeta(c.key).label}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(c.value)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {fmt(c.reference.mean)} ± {fmt(c.reference.sd)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmt(c.z, 2)}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === "within" ? "secondary" : "outline"}>
                          {c.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="xai">
          <Card>
            <CardHeader>
              <CardTitle>Why this result?</CardTitle>
              <CardDescription>
                Signed standardised contributions to the predicted class logit (% of total absolute
                contribution). Top 15 parameters shown.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {a.contributions.slice(0, 15).map((c) => (
                <div key={c.key} className="text-xs">
                  <div className="flex justify-between">
                    <span>{featureMeta(c.key).label}</span>
                    <span className="font-mono text-muted-foreground">
                      {c.contribution >= 0 ? "+" : ""}
                      {c.contribution.toFixed(1)}% · z {fmt(c.z, 2)}
                    </span>
                  </div>
                  <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.abs(c.contribution) * 2)}%`,
                        backgroundColor:
                          c.contribution >= 0 ? "var(--risk-high)" : "var(--risk-low)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
