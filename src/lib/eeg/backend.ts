/**
 * Pluggable processing backend.
 *
 * The default backend runs entirely in the browser (TypeScript DSP in dsp.ts).
 * A Python service (NumPy / SciPy / Pandas / MNE-Python / scikit-learn /
 * PyWavelets / PyTorch) can be connected later by implementing these endpoints
 * and setting VITE_EEG_BACKEND_URL. Until then the remote modules report
 * "Processing module not connected." rather than returning fabricated values.
 */
import type { FeatureVector } from "./features";

export interface BackendCapabilities {
  connected: boolean;
  baseUrl: string | null;
  modules: { name: string; endpoint: string; status: "local" | "not-connected" }[];
}

export const BACKEND_BASE_URL: string | null =
  (import.meta.env.VITE_EEG_BACKEND_URL as string | undefined) ?? null;

export const BACKEND_MODULES = [
  { name: "Signal preprocessing (SciPy filtfilt / MNE)", endpoint: "POST /api/eeg/preprocess" },
  { name: "Feature extraction (NumPy / PyWavelets)", endpoint: "POST /api/eeg/features" },
  { name: "Reference distribution builder (Pandas)", endpoint: "POST /api/eeg/reference" },
  { name: "Model training (scikit-learn / XGBoost)", endpoint: "POST /api/eeg/train" },
  { name: "Deep models (PyTorch CNN / LSTM)", endpoint: "POST /api/eeg/train-deep" },
  { name: "Inference (scikit-learn predict_proba)", endpoint: "POST /api/eeg/predict" },
];

export function backendStatus(): BackendCapabilities {
  return {
    connected: Boolean(BACKEND_BASE_URL),
    baseUrl: BACKEND_BASE_URL,
    modules: BACKEND_MODULES.map((m) => ({
      ...m,
      status: BACKEND_BASE_URL ? ("local" as const) : ("not-connected" as const),
    })),
  };
}

export class ModuleNotConnectedError extends Error {
  constructor(module: string) {
    super(`Processing module not connected: ${module}. Configure VITE_EEG_BACKEND_URL to attach the Python EEG service.`);
    this.name = "ModuleNotConnectedError";
  }
}

export async function remotePredict(features: FeatureVector): Promise<number[]> {
  if (!BACKEND_BASE_URL) throw new ModuleNotConnectedError("Inference (scikit-learn)");
  const res = await fetch(`${BACKEND_BASE_URL}/api/eeg/predict`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ features }),
  });
  if (!res.ok) throw new Error(`Remote inference failed: ${res.status}`);
  const json = (await res.json()) as { probabilities: number[] };
  return json.probabilities;
}
