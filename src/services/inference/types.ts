import type { Annotation } from "../../types";

/** What the inference layer hands back to the UI - identical for demo and real adapters. */
export interface InferenceResult {
  adapter: "demo" | "real";
  detections: Annotation[];
  /** server-rendered annotated image (data URL / http URL), if the model returns one */
  annotatedImageUrl?: string;
  /** shown verbatim in the UI so nobody mistakes demo data for model output */
  disclosure: string;
}

export type InferenceInput =
  | { kind: "sample"; sampleId: string }
  | { kind: "file"; file: File };

export interface InferenceAdapter {
  id: "demo" | "real";
  label: string;
  predict(input: InferenceInput, signal?: AbortSignal): Promise<InferenceResult>;
}

/**
 * Wire format expected from the FastAPI server (POST /api/predict).
 * bbox is [x1, y1, x2, y2] in source-image pixels.
 */
export interface PredictResponse {
  image_width: number;
  image_height: number;
  detections: { class_name: string; bbox: [number, number, number, number]; confidence: number }[];
  annotated_image?: string | null; // data URL or URL
}
