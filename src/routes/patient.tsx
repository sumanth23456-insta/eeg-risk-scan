import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Download, FileUp, RotateCcw, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CSV_TEMPLATE_COLUMNS,
  csvTemplateText,
  isClinicalCsv,
  parseClinicalCsv,
} from "@/lib/fissure/csv";
import {
  hydrateFissure,
  replacePatientAndClinical,
  resetPatientForm,
  setClinical,
  setPatient,
  useFissureState,
} from "@/lib/fissure/store";
import { DISCLAIMER, validateClinical, validatePatient } from "@/lib/fissure/types";

export const Route = createFileRoute("/patient")({
  head: () => ({
    meta: [
      { title: "Patient & Clinical Parameters — NeuroRisk Research Screening" },
      {
        name: "description",
        content:
          "Enter patient metadata and anal-fissure related clinical parameters for a research screening record, or import them from a CSV template.",
      },
      { property: "og:title", content: "Patient & Clinical Parameters — NeuroRisk Research" },
      {
        property: "og:description",
        content:
          "Research prototype form for patient metadata and clinical symptom parameters, kept separate from EEG signal features.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PatientPage,
});

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">— select —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </div>
  );
}

const YESNO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

function PatientPage() {
  const { patient, clinical } = useFissureState();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    hydrateFissure();
  }, []);

  async function onImport(file: File) {
    const text = await file.text();
    const header = text.split(/\r?\n/)[0] ?? "";
    if (!isClinicalCsv(header)) {
      setErrors([
        "This file does not look like a clinical record CSV. It should contain Patient_ID and symptom columns. EEG waveform files belong on the Upload page.",
      ]);
      return;
    }
    const rows = parseClinicalCsv(text);
    if (rows.length === 0) {
      setErrors(["No data rows found in the CSV."]);
      return;
    }
    const first = rows[0];
    replacePatientAndClinical(first.patient, first.clinical);
    setErrors(first.errors);
    setNotice(
      `Imported row 1 of ${rows.length} (${first.patient.patientId || "no ID"}). Review the fields below before running the screening.`,
    );
  }

  function downloadTemplate() {
    const blob = new Blob([csvTemplateText()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "research-clinical-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function submit() {
    const errs = [...validatePatient(patient), ...validateClinical(clinical)];
    setErrors(errs);
    if (errs.length === 0) navigate({ to: "/screening" });
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patient & clinical parameters</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            These fields are patient and symptom features. They are stored and scored separately from
            any EEG signal parameters.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="size-4" /> CSV template
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <FileUp className="size-4" /> Import CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <Alert className="mt-5">
        <AlertTitle>Research prototype — not a diagnosis</AlertTitle>
        <AlertDescription>{DISCLAIMER}</AlertDescription>
      </Alert>

      {notice ? (
        <p className="mt-4 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {errors.length > 0 ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Please check these fields</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patient information</CardTitle>
            <CardDescription>Demographic and history fields.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Patient ID / code</Label>
              <Input
                value={patient.patientId}
                placeholder="e.g. P-001"
                onChange={(e) => setPatient({ patientId: e.target.value })}
              />
            </div>
            <Num label="Age (years)" value={patient.age} onChange={(v) => setPatient({ age: v })} />
            <Select
              label="Sex"
              value={patient.sex}
              onChange={(v) => setPatient({ sex: v as never })}
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "other", label: "Other" },
              ]}
            />
            <Num
              label="Height (cm)"
              value={patient.heightCm}
              onChange={(v) => setPatient({ heightCm: v })}
            />
            <Num
              label="Weight (kg)"
              value={patient.weightKg}
              onChange={(v) => setPatient({ weightKg: v })}
            />
            <Select
              label="Previous fissure history"
              value={patient.previousFissureHistory}
              onChange={(v) => setPatient({ previousFissureHistory: v as never })}
              options={YESNO}
            />
            <Select
              label="Previous anorectal surgery"
              value={patient.previousAnorectalSurgery}
              onChange={(v) => setPatient({ previousAnorectalSurgery: v as never })}
              options={YESNO}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Symptom parameters</CardTitle>
            <CardDescription>Self-reported symptoms.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">
                Pain severity: {clinical.painSeverity} / 10
              </Label>
              <Slider
                value={[clinical.painSeverity]}
                min={0}
                max={10}
                step={1}
                onValueChange={([v]) => setClinical({ painSeverity: v })}
              />
            </div>
            <Select
              label="Pain during defecation"
              value={clinical.painDuringDefecation}
              onChange={(v) => setClinical({ painDuringDefecation: v as never })}
              options={YESNO}
            />
            <Select
              label="Pain after defecation"
              value={clinical.painAfterDefecation}
              onChange={(v) => setClinical({ painAfterDefecation: v as never })}
              options={YESNO}
            />
            <Select
              label="Rectal bleeding"
              value={clinical.rectalBleeding}
              onChange={(v) => setClinical({ rectalBleeding: v as never })}
              options={YESNO}
            />
            <Select
              label="Bleeding severity"
              value={clinical.bleedingSeverity}
              onChange={(v) => setClinical({ bleedingSeverity: v as never })}
              options={[
                { value: "none", label: "None" },
                { value: "mild", label: "Mild" },
                { value: "moderate", label: "Moderate" },
                { value: "severe", label: "Severe" },
              ]}
            />
            <Select
              label="Constipation"
              value={clinical.constipation}
              onChange={(v) => setClinical({ constipation: v as never })}
              options={YESNO}
            />
            <Select
              label="Stool consistency"
              value={clinical.stoolConsistency}
              onChange={(v) => setClinical({ stoolConsistency: v as never })}
              options={[
                { value: "hard", label: "Hard" },
                { value: "normal", label: "Normal" },
                { value: "loose", label: "Loose" },
              ]}
            />
            <Select
              label="Straining during defecation"
              value={clinical.straining}
              onChange={(v) => setClinical({ straining: v as never })}
              options={[
                { value: "never", label: "Never" },
                { value: "sometimes", label: "Sometimes" },
                { value: "frequently", label: "Frequently" },
              ]}
            />
            <Num
              label="Symptom duration (days)"
              value={clinical.symptomDurationDays}
              onChange={(v) => setClinical({ symptomDurationDays: v })}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Examination findings (optional)</CardTitle>
            <CardDescription>
              Entered by a clinician after physical examination. Leave as “not assessed” if no
              examination was performed.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              label="Clinically observed fissure"
              value={clinical.clinicallyObservedFissure}
              onChange={(v) => setClinical({ clinicallyObservedFissure: v as never })}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
                { value: "not-assessed", label: "Not assessed" },
              ]}
            />
            <Select
              label="Fissure location"
              value={clinical.fissureLocation}
              onChange={(v) => setClinical({ fissureLocation: v as never })}
              options={[
                { value: "posterior", label: "Posterior" },
                { value: "anterior", label: "Anterior" },
                { value: "other", label: "Other" },
                { value: "not-assessed", label: "Not assessed" },
              ]}
            />
            <Select
              label="Fissure appearance"
              value={clinical.fissureAppearance}
              onChange={(v) => setClinical({ fissureAppearance: v as never })}
              options={[
                { value: "linear-tear", label: "Linear tear" },
                { value: "ulcer-like", label: "Ulcer-like" },
                { value: "chronic-appearing", label: "Chronic appearing" },
                { value: "not-assessed", label: "Not assessed" },
              ]}
            />
            <Select
              label="Sentinel skin tag"
              value={clinical.sentinelSkinTag}
              onChange={(v) => setClinical({ sentinelSkinTag: v as never })}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
                { value: "not-assessed", label: "Not assessed" },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={submit}>
          <Save className="size-4" /> Run research screening
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            resetPatientForm();
            setErrors([]);
            setNotice(null);
          }}
        >
          <RotateCcw className="size-4" /> Clear form
        </Button>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        CSV template columns: {CSV_TEMPLATE_COLUMNS.join(", ")}
      </p>
    </AppShell>
  );
}
