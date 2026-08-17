import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { FileUp, FlaskConical, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseDelimitedText, parseEdf, type CsvOptions, type EegRecording } from "@/lib/eeg/parse";
import { buildDemoRecording } from "@/lib/eeg/demo";
import { setRecording } from "@/lib/eeg/store";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Upload EEG Recording — NeuroRisk EEG" },
      {
        name: "description",
        content:
          "Upload CSV, TXT or EDF EEG recordings for automated signal validation, preprocessing and seizure risk feature analysis.",
      },
      { property: "og:title", content: "Upload EEG Recording — NeuroRisk EEG" },
      {
        property: "og:description",
        content: "Import CSV, TXT or EDF EEG files and validate signal quality before analysis.",
      },
    ],
  }),
  component: UploadPage,
});

function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EegRecording | null>(null);
  const [opts, setOpts] = useState<CsvOptions>({
    samplingRate: 256,
    hasHeader: true,
    delimiter: "auto",
    timeColumnFirst: false,
  });

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const isEdf = /\.edf$/i.test(file.name);
      let rec: EegRecording;
      if (isEdf) {
        rec = parseEdf(await file.arrayBuffer(), file.name, file.size);
      } else {
        rec = parseDelimitedText(await file.text(), file.name, file.size, opts);
      }
      setResult(rec);
      setRecording(rec);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function loadDemo(kind: "evolving" | "interictal" | "preictal" | "ictal") {
    const rec = buildDemoRecording(kind);
    setRecording(rec);
    setResult(rec);
    setError(null);
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Upload EEG recording</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Files are parsed and analysed entirely in your browser — no recording is uploaded to a server.
        Supported formats: CSV, TXT (numeric matrix) and EDF / EDF+.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Select a file</CardTitle>
            <CardDescription>
              CSV/TXT: one column per channel (optionally a leading time column). EDF: header metadata
              is read automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
              className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-secondary/40 px-6 py-10 text-center"
            >
              <FileUp className="size-6 text-primary" />
              <p className="mt-3 text-sm font-medium">Drop an EEG file here</p>
              <p className="text-xs text-muted-foreground">.csv · .txt · .edf — max ~50 MB</p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.txt,.edf,.tsv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
              <Button className="mt-4" onClick={() => inputRef.current?.click()} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Browse files
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fs">Sampling rate (Hz) — CSV/TXT only</Label>
                <Input
                  id="fs"
                  type="number"
                  min={16}
                  max={5000}
                  value={opts.samplingRate}
                  onChange={(e) =>
                    setOpts({ ...opts, samplingRate: Number(e.target.value) || 256 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Delimiter</Label>
                <Select
                  value={opts.delimiter}
                  onValueChange={(v) => setOpts({ ...opts, delimiter: v as CsvOptions["delimiter"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    <SelectItem value=",">Comma</SelectItem>
                    <SelectItem value=";">Semicolon</SelectItem>
                    <SelectItem value={"\t"}>Tab</SelectItem>
                    <SelectItem value=" ">Space</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <Label htmlFor="hdr" className="text-sm font-normal">
                  First row contains channel names
                </Label>
                <Switch
                  id="hdr"
                  checked={opts.hasHeader}
                  onCheckedChange={(v) => setOpts({ ...opts, hasHeader: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <Label htmlFor="tcol" className="text-sm font-normal">
                  First column is a time axis
                </Label>
                <Switch
                  id="tcol"
                  checked={opts.timeColumnFirst}
                  onCheckedChange={(v) => setOpts({ ...opts, timeColumnFirst: v })}
                />
              </div>
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Could not read the file</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {result ? <ValidationReport rec={result} onContinue={() => navigate({ to: "/analysis" })} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="size-4 text-primary" /> Demo mode
            </CardTitle>
            <CardDescription>
              Deterministic synthetic EEG generated in-browser. Clearly labelled as synthetic in every
              result and report.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="secondary" className="w-full justify-start" onClick={() => loadDemo("evolving")}>
              Evolving record (interictal → preictal → ictal)
            </Button>
            <Button variant="secondary" className="w-full justify-start" onClick={() => loadDemo("interictal")}>
              Interictal-like, 60 s
            </Button>
            <Button variant="secondary" className="w-full justify-start" onClick={() => loadDemo("preictal")}>
              Preictal-like, 60 s
            </Button>
            <Button variant="secondary" className="w-full justify-start" onClick={() => loadDemo("ictal")}>
              Ictal-like, 60 s
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function ValidationReport({ rec, onContinue }: { rec: EegRecording; onContinue: () => void }) {
  const tone =
    rec.quality.status === "good"
      ? "var(--risk-low)"
      : rec.quality.status === "fair"
        ? "var(--risk-moderate)"
        : "var(--risk-high)";
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{rec.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {rec.format} · {rec.channelNames.length} channel(s) · {rec.samplingRate} Hz ·{" "}
            {rec.durationSec.toFixed(1)} s · {rec.unit}
          </p>
        </div>
        <Badge style={{ backgroundColor: tone, color: "var(--primary-foreground)" }}>
          Signal quality: {rec.quality.status}
        </Badge>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        {[...rec.quality.messages, ...rec.notes].map((m, i) => (
          <li key={i}>• {m}</li>
        ))}
        {rec.quality.flatChannels.length ? (
          <li>• Flat / near-constant channels: {rec.quality.flatChannels.join(", ")}</li>
        ) : null}
        <li>• Invalid sample ratio: {(rec.quality.invalidRatio * 100).toFixed(2)}%</li>
      </ul>
      <Button className="mt-4" onClick={onContinue}>
        Continue to analysis
      </Button>
    </div>
  );
}
