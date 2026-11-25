import { INSPECTION_EVENTS, INSPECTION_SPEED_MPS } from "../data/route";
import type { InspectionEventDef } from "../types";

/**
 * Pure, deterministic stepping logic for the inspection vehicle. The engine
 * feeds it real frame deltas; tests feed it fixed deltas and get identical
 * results every time.
 */
export interface InspectionSim {
  s: number; // metres travelled along the route
  total: number;
  fired: string[]; // ids of events already triggered
}

export const newInspectionSim = (total: number): InspectionSim => ({ s: 0, total, fired: [] });

export interface StepResult {
  sim: InspectionSim;
  /** event that fired during this step (vehicle should stop), if any */
  event?: InspectionEventDef;
  finished: boolean;
}

export function stepInspection(
  sim: InspectionSim,
  dtSeconds: number,
  speedMultiplier: number,
  events: InspectionEventDef[] = INSPECTION_EVENTS,
): StepResult {
  const next = Math.min(sim.total, sim.s + dtSeconds * speedMultiplier * INSPECTION_SPEED_MPS);
  const pending = events.find((e) => !sim.fired.includes(e.id) && e.atMeters > sim.s - 1e-6 && e.atMeters <= next);
  if (pending) {
    return { sim: { ...sim, s: pending.atMeters, fired: [...sim.fired, pending.id] }, event: pending, finished: false };
  }
  return { sim: { ...sim, s: next }, finished: next >= sim.total };
}

/** Maintenance vehicle progress along its own path. */
export interface DispatchSim {
  s: number;
  total: number;
  phase: "enroute" | "working" | "done";
  workElapsed: number;
}

export const newDispatchSim = (total: number): DispatchSim => ({ s: 0, total, phase: "enroute", workElapsed: 0 });

export function stepDispatch(
  d: DispatchSim,
  dtSeconds: number,
  speedMultiplier: number,
  speedMps: number,
  workSeconds: number,
): DispatchSim {
  if (d.phase === "enroute") {
    const s = Math.min(d.total, d.s + dtSeconds * speedMultiplier * speedMps);
    return s >= d.total ? { ...d, s, phase: "working" } : { ...d, s };
  }
  if (d.phase === "working") {
    const workElapsed = d.workElapsed + dtSeconds * speedMultiplier;
    return workElapsed >= workSeconds ? { ...d, workElapsed: workSeconds, phase: "done" } : { ...d, workElapsed };
  }
  return d;
}
