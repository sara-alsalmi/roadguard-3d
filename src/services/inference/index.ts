import { demoAdapter } from "./demoAdapter";
import { realAdapter } from "./realAdapter";
import type { InferenceAdapter } from "./types";

export const adapters: Record<"demo" | "real", InferenceAdapter> = { demo: demoAdapter, real: realAdapter };
export type { InferenceResult, InferenceInput, InferenceAdapter } from "./types";
