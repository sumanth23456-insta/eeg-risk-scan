import { createFileRoute } from "@tanstack/react-router";
import { requireUnlocked } from "@/lib/gate.functions";
import { useEffect, useState } from "react";
import { Loader2, Brain } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildSyntheticDataset, trainModel, type TrainOptions } from "@/lib/eeg/model";
import { CLASSES, CLASS_LABEL } from "@/lib/eeg/demo";
import { ensureReference, setDatasetAndModel, useAppState } from "@/lib/eeg/store";
import { fmt, fmtDate } from "@/lib/eeg/ui";

export const Route = createFileRoute("/training")({
  head: () => ({
    meta: [
      { title: "Model Training & Validation — NeuroRisk EEG" },
      {
        name: "description",
        content:
          "Train and validate the EEG classification model in-browser with patient-wise splitting, accuracy, F1, ROC-AUC and confusion matrix.",
      },
      { property: "og:title", content: "Model Training & Validation — NeuroRisk EEG" },
      {
        property: "og:description",
        content: "Researcher tools: retrain the reference model and inspect validation metrics.",
      },
    ],
  }),
  loader: () => requireUnlocked(),
  component: TrainingPage,
});

function TrainingPage() {
  const s = useAppState();
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState({
    subjects: 24,
    epochsPerClass: 24,
    iterations: 600,
    lr: 0.5,
    l2: 0.01,
    split: "patient-wise" as TrainOptions["split"],
  });

  useEffect(() => {
    ensureReference();
  }, []);

  function retrain() {
    setBusy(true);
    setTimeout(() => {
      try {
        const ds = buildSyntheticDataset(cfg.subjects, cfg.epochsPerClass);
        const model = trainModel(ds, {
          split: cfg.split,
          epochs: cfg.iterations,
          lr: cfg.lr,
          l2: cfg.l2,
        });
        setDatasetAndModel(ds, model);
      } finally {
        setBusy(false);
      }
    }, 10);
  }

  const model = s.model;
  const m = model?.metrics ?? null;

  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Model training</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Researcher tooling. The reference distributions and classifier are rebuilt from the dataset —
        no coefficients are hard-coded. Training runs in your browser.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="size-4 text-primary" /> Configuration
            </CardTitle>
            <CardDescription>Deterministic synthetic cohort with subject grouping.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <NumField
              label="Subjects"
              value={cfg.subjects}
              onChange={(v) => setCfg({ ...cfg, subjects: v })}
            />
            <NumField
              label="Epochs per class / subject"
              value={cfg.epochsPerClass}
              onChange={(v) => setCfg({ ...cfg, epochsPerClass: v })}
            />
            <NumField
              label="Gradient iterations"
              value={cfg.iterations}
              onChange={(v) => setCfg({ ...cfg, iterations: v })}
            />
            <NumField
              label="Learning rate"
              value={cfg.lr}
              step={0.05}
              onChange={(v) => setCfg({ ...cfg, lr: v })}
            />
            <NumField
              label="L2 regularisation"
              value={cfg.l2}
              step={0.005}
              onChange={(v) => setCfg({ ...cfg, l2: v })}
            />
            <div className="space-y-2">
              <Label>Validation split</Label>
              <Select
                value={cfg.split}
                onValueChange={(v) => setCfg({ ...cfg, split: v as TrainOptions["split"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="patient-wise">Patient-wise (no subject leakage)</SelectItem>
                  <SelectItem value="random">Random epoch split</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={retrain} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Rebuild dataset & train
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Current model</CardTitle>
              <CardDescription>{model?.algorithm ?? "Preparing…"}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <Field k="Dataset" v={model?.datasetName ?? "—"} />
              <Field k="Origin" v={model?.datasetOrigin ?? "—"} />
              <Field k="Features" v={String(model?.featureKeys.length ?? 0)} />
              <Field k="Split" v={model?.split ?? "—"} />
              <Field k="Train / test epochs" v={model ? `${model.nTrain} / ${model.nTest}` : "—"} />
              <Field k="Trained at" v={model ? fmtDate(model.trainedAt) : "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Validation metrics</CardTitle>
              <CardDescription>
                Computed on the held-out split. Synthetic-data performance is an upper bound and does
                not transfer to clinical recordings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {m ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Metric label="Accuracy" value={`${(m.accuracy * 100).toFixed(1)}%`} />
                    <Metric label="Macro F1" value={fmt(m.macroF1, 3)} />
                    <Metric label="Macro ROC-AUC" value={fmt(m.macroAuc, 3)} />
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Class</TableHead>
                        <TableHead className="text-right">Precision</TableHead>
                        <TableHead className="text-right">Recall</TableHead>
                        <TableHead className="text-right">Specificity</TableHead>
                        <TableHead className="text-right">F1</TableHead>
                        <TableHead className="text-right">AUC</TableHead>
                        <TableHead className="text-right">n</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {CLASSES.map((c) => {
                        const p = m.perClass[c];
                        return (
                          <TableRow key={c}>
                            <TableCell>{CLASS_LABEL[c]}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(p.precision, 3)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(p.recall, 3)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(p.specificity, 3)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(p.f1, 3)}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(p.auc, 3)}</TableCell>
                            <TableCell className="text-right font-mono">{p.support}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  <div>
                    <p className="mb-2 text-sm font-medium">Confusion matrix (rows = true)</p>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead />
                            {CLASSES.map((c) => (
                              <TableHead key={c} className="text-right">
                                {CLASS_LABEL[c]}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {m.confusion.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{CLASS_LABEL[CLASSES[i]]}</TableCell>
                              {row.map((v, j) => (
                                <TableCell key={j} className="text-right font-mono">
                                  {v}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No metrics yet.</p>
              )}
            </CardContent>
          </Card>

          <Alert>
            <AlertTitle>Extending with real datasets</AlertTitle>
            <AlertDescription>
              The training interface consumes any dataset of labelled feature vectors with subject
              IDs (e.g. CHB-MIT, Bonn, TUH). Attach a Python service (scikit-learn Random Forest /
              SVM, PyTorch CNN) via the backend module bridge to train on full recordings server-side.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </AppShell>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</p>
      <p className="mt-0.5 truncate text-sm">{v}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
