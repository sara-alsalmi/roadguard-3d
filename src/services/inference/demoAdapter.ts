import { sampleById } from "../../data/samples";
import type { InferenceAdapter } from "./types";

/**
 * Demo adapter: returns manually authored annotations for the bundled demo
 * illustrations. It performs NO inference, produces NO confidence values and
 * must never be presented as model output.
 */
export const demoAdapter: InferenceAdapter = {
  id: "demo",
  label: "Demo adapter (simulation)",
  async predict(input) {
    if (input.kind !== "sample") {
      throw new Error(
        "The demo adapter has no model. Pick a bundled demo image, draw a box manually, or switch to the Real Model adapter.",
      );
    }
    const sample = sampleById(input.sampleId);
    if (!sample) throw new Error(`Unknown demo sample: ${input.sampleId}`);
    await new Promise((r) => setTimeout(r, 450)); // purely cosmetic: lets the UI show its running state
    return {
      adapter: "demo",
      detections: sample.annotations.map((a) => ({ ...a, source: "demo" as const, confidence: undefined })),
      disclosure: "Simulation / Demo Data · manually authored annotation, not an AI prediction",
    };
  },
};
