import { cameraController } from "../map/cameraController";
import {
  assignMaintenance,
  followMaintenance,
  resetSimulation,
  resolveIncident,
  selectIncident,
  setReview,
  setSpeed,
  simulateIncomingReport,
} from "../simulation/actions";
import { engine } from "../simulation/simulationEngine";
import { useApp } from "../../store/appStore";

export const MISSION_STEPS = [
  { id: "discover", title: "Discover", caption: "From orbit to a real road corridor in Al Olaya, Riyadh." },
  { id: "detect", title: "Detect", caption: "A damage report arrives and appears on the map immediately, with its prediction." },
  { id: "review", title: "Review", caption: "The operator checks the photo and the prediction (demo annotation for now)." },
  { id: "dispatch", title: "Dispatch", caption: "A team is assigned and drives from the depot to the location." },
  { id: "resolve", title: "Resolve", caption: "The team finishes, the operator confirms, and the report is closed." },
  { id: "summary", title: "Summary", caption: "Everything above is reflected live in the analytics." },
] as const;

let token = 0;
let userSpeed: 1 | 2 | 4 = 1;
let missionIncidentId: string | null = null;
const st = () => useApp.getState();
const cancelled = (t: number) => t !== token;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Sleeps for `ms` of un-paused wall-clock time (measured, so a busy main thread cannot stretch it). */
async function missionSleep(t: number, ms: number) {
  let left = ms;
  let prev = performance.now();
  while (left > 0 && !cancelled(t)) {
    await sleep(50);
    const now = performance.now();
    if (!st().mission.paused) left -= now - prev;
    prev = now;
  }
}

async function waitFor(t: number, cond: () => boolean, timeoutMs = 90000) {
  let waited = 0;
  let prev = performance.now();
  while (!cancelled(t) && !cond() && waited < timeoutMs) {
    await sleep(50);
    const now = performance.now();
    if (!st().mission.paused) waited += now - prev;
    prev = now;
  }
}

export async function startMission() {
  token++;
  const t = token;
  if (!st().mission.active) userSpeed = st().sim.speed;
  missionIncidentId = null;
  resetSimulation();
  st().set({ mission: { active: true, step: 0, paused: false }, panel: "incidents" as const });
  await missionSleep(t, 400);
  await runFrom(0, t);
}

async function runFrom(start: number, t: number) {
  for (let i = start; i < MISSION_STEPS.length; i++) {
    if (cancelled(t)) return;
    st().set({ mission: { ...st().mission, step: i } });
    await runStep(i, t);
    if (cancelled(t)) return;
    await missionSleep(t, 700);
  }
  if (!cancelled(t)) st().addLog("Guided demo complete", "ok");
}

async function runStep(i: number, t: number) {
  switch (i) {
    case 0:
      engine.freeze(false);
      await cameraController.intro();
      await missionSleep(t, 1000);
      break;
    case 1: {
      const inc = simulateIncomingReport();
      missionIncidentId = inc.id;
      await waitFor(t, () => !st().cameraBusy);
      await missionSleep(t, 2500);
      break;
    }
    case 2:
      if (missionIncidentId) {
        selectIncident(missionIncidentId, false);
        setReview(missionIncidentId);
      }
      await missionSleep(t, 4000);
      break;
    case 3: {
      const id = missionIncidentId;
      if (!id) return;
      setSpeed(4);
      assignMaintenance(id);
      followMaintenance(id);
      await waitFor(t, () => st().dispatches[id]?.phase === "done");
      await missionSleep(t, 1000);
      break;
    }
    case 4:
      if (missionIncidentId) resolveIncident(missionIncidentId);
      void cameraController.flyToOverview(3);
      await missionSleep(t, 3200);
      break;
    case 5:
      st().set({ panel: "analytics" });
      await missionSleep(t, 3500);
      break;
  }
}

export function pauseMission() {
  const paused = !st().mission.paused;
  st().set({ mission: { ...st().mission, paused } });
  engine.freeze(paused);
}

/** Whether the mission can safely skip to the next step from here. */
export function canAdvance(): boolean {
  const s = st();
  if (!s.mission.active || s.mission.step >= MISSION_STEPS.length - 1) return false;
  if (s.mission.step === 3) return !!missionIncidentId && s.dispatches[missionIncidentId]?.phase === "done";
  if (s.mission.step >= 2) return !!missionIncidentId;
  return s.mission.step === 0 || !!missionIncidentId;
}

export function nextMission() {
  const m = st().mission;
  if (!canAdvance()) return;
  token++;
  const t = token;
  engine.freeze(false);
  st().set({ mission: { ...m, paused: false } });
  void runFrom(m.step + 1, t);
}

export function exitMission() {
  token++;
  engine.freeze(false);
  setSpeed(userSpeed);
  st().set({ mission: { active: false, step: 0, paused: false }, presentation: false });
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
}
