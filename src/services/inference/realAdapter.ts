import { CONFIG } from "../../data/config";
import type { Annotation, IncidentClass } from "../../types";
import type { InferenceAdapter, InferenceResult, PredictResponse } from "./types";

/** Map the model's class names onto the app's three classes. Adjust to your training labels. */
const CLASS_ALIASES: Record<string, IncidentClass> = {
  pothole: "pothole",
  potholes: "pothole",
  "excavation barrier": "barrier",
  "excavation barriers": "barrier",
  excavation_barrier: "barrier",
  barrier: "barrier",
  "dilapidated sidewalk": "sidewalk",
  "dilapidated sidewalks": "sidewalk",
  dilapidated_sidewalk: "sidewalk",
  sidewalk: "sidewalk",
};

export function normaliseClass(name: string): IncidentClass | null {
  return CLASS_ALIASES[name.trim().toLowerCase()] ?? null;
}

/** Convert the server payload into the app's annotation format (pure; unit-testable). */
export function parsePredictResponse(res: PredictResponse): InferenceResult {
  const w = res.image_width || 1;
  const h = res.image_height || 1;
  const detections: Annotation[] = [];
  for (const d of res.detections ?? []) {
    const cls = normaliseClass(d.class_name);
    if (!cls) continue; // ignore classes the app doesn't manage
    const [x1, y1, x2, y2] = d.bbox;
    detections.push({
      cls,
      bbox: [x1 / w, y1 / h, (x2 - x1) / w, (y2 - y1) / h],
      confidence: typeof d.confidence === "number" ? d.confidence : undefined,
      source: "model",
    });
  }
  return {
    adapter: "real",
    detections,
    annotatedImageUrl: res.annotated_image ?? undefined,
    disclosure: "Model prediction · confidence values come from the inference server",
  };
}

/**
 * Real model adapter. POSTs the image to `${VITE_INFERENCE_API_URL}/api/predict`
 * (multipart field "file"). See server/main.py for a FastAPI reference server.
 */
export const realAdapter: InferenceAdapter = {
  id: "real",
  label: "Real model (FastAPI /api/predict)",
  async predict(input, signal) {
    if (input.kind !== "file") throw new Error("The real model adapter needs an uploaded image file.");
    const body = new FormData();
    body.append("file", input.file);
    let res: Response;
    try {
      res = await fetch(`${CONFIG.inferenceBase}/api/predict`, { method: "POST", body, signal });
    } catch (e) {
      throw new Error(
        `Could not reach the inference server (${CONFIG.inferenceBase || "same origin"}/api/predict). Is it running? ${e instanceof Error ? e.message : ""}`,
      );
    }
    if (!res.ok) throw new Error(`Inference server returned HTTP ${res.status}.`);
    return parsePredictResponse((await res.json()) as PredictResponse);
  },
};
