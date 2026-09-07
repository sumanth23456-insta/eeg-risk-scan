/** PDF export for a research screening record (client-side, jsPDF). */
import jsPDF from "jspdf";
import { DISCLAIMER, type ResearchAnalysisRecord } from "./types";

export function generateScreeningReport(r: ResearchAnalysisRecord) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;

  const line = (text: string, size = 10, bold = false, gap = 14) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    for (const l of doc.splitTextToSize(text, W - 2 * M) as string[]) {
      if (y > H - M) {
        doc.addPage();
        y = M;
      }
      doc.text(l, M, y);
      y += gap;
    }
  };
  const rule = () => {
    doc.setDrawColor(190);
    doc.line(M, y, W - M, y);
    y += 12;
  };

  line("Research Screening / Likelihood Assessment", 16, true, 22);
  rule();
  line("NOT A MEDICAL DIAGNOSIS", 11, true);
  line(DISCLAIMER, 9, false, 12);
  rule();

  line("1. Patient", 12, true);
  line(`Patient ID: ${r.patient.patientId}`);
  line(`Age: ${r.patient.age ?? "—"} · Sex: ${r.patient.sex || "—"}`);
  line(
    `Height: ${r.patient.heightCm ?? "—"} cm · Weight: ${r.patient.weightKg ?? "—"} kg · Previous fissure history: ${r.patient.previousFissureHistory || "—"}`,
  );
  line(`Record created: ${new Date(r.createdAt).toLocaleString()}`);
  y += 6;

  line("2. Clinical parameters", 12, true);
  Object.entries(r.clinical).forEach(([k, v]) =>
    line(`• ${k}: ${v === "" || v === null ? "not provided" : String(v)}`, 9, false, 12),
  );
  y += 6;

  line("3. Research screening outcome", 12, true);
  line(`Category: ${r.screening.category}`, 11, true);
  line(
    r.screening.score === null
      ? "Screening score: not computed (insufficient data)"
      : `Research screening score: ${r.screening.score} / ${r.screening.maxScore}`,
  );
  r.screening.breakdown.forEach((b) => line(`• ${b.label}: ${b.points} pts (${b.detail})`, 9, false, 12));
  y += 6;

  line("4. Findings", 12, true);
  r.screening.findings.forEach((f) => line(`• ${f}`, 9, false, 12));
  if (r.screening.missing.length) {
    y += 4;
    line("Not provided: " + r.screening.missing.join(", "), 9, false, 12);
  }
  y += 6;

  line("5. EEG signal summary (neurological signal only)", 12, true);
  if (!r.eeg) {
    line("No EEG recording was analysed for this record.", 9, false, 12);
  } else {
    const e = r.eeg;
    if (e.source === "demo")
      line("Synthetic EEG — for testing/demo purposes only.", 9, true, 12);
    line(`File: ${e.fileName}`, 9, false, 12);
    line(`Channels: ${e.eegChannels.join(", ")}`, 9, false, 12);
    line(
      `Sampling frequency: ${e.samplingFrequency} Hz · Duration: ${e.recordingDuration.toFixed(1)} s · Quality: ${e.signalQuality}`,
      9,
      false,
      12,
    );
    line(
      `Band power — delta ${e.deltaPower.toFixed(2)}, theta ${e.thetaPower.toFixed(2)}, alpha ${e.alphaPower.toFixed(2)}, beta ${e.betaPower.toFixed(2)}, gamma ${e.gammaPower.toFixed(2)}`,
      9,
      false,
      12,
    );
    line(
      `Mean amplitude ${e.meanAmplitude.toFixed(2)} µV · RMS ${e.rmsAmplitude.toFixed(2)} µV · Peak frequency ${e.peakFrequency.toFixed(2)} Hz`,
      9,
      false,
      12,
    );
    line(
      "EEG features are reported for research interest only and do not contribute to the screening score.",
      9,
      false,
      12,
    );
  }
  y += 6;

  line("6. Limitations", 12, true);
  r.screening.limitations.forEach((l) => line(`• ${l}`, 9, false, 12));

  y += 8;
  rule();
  line(`Generated locally in the browser. Record ID: ${r.id}`, 8, false, 11);

  doc.save(`research-screening-${r.patient.patientId || r.id}.pdf`);
}
