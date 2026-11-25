import { Cartesian3 } from "cesium";
import { CLASS_META } from "../../data/config";
import { SOURCE_LABEL } from "../../store/appStore";
import { INCOMING_REPORTS, INSPECTION_EVENTS } from "../../data/route";
import { sampleById } from "../../data/samples";
import { adapters } from "../../services/inference";
import { corridorLocation, nearestCorridor } from "../../utils/network";
import { routePolyline, useApp } from "../../store/appStore";
import type { CameraMode, Incident, InspectionEventDef } from "../../types";
import { routeLocation, pointAt, smoothBearing } from "../../utils/geo";
import { cameraController } from "../map/cameraController";
import { heightAt } from "../map/terrain";
import { engine } from "./simulationEngine";

const store = () => useApp.getState();

/** Where the user's camera was before an inspection event hijacked it. */
let modeBeforeEvent: CameraMode = "follow";
let starting = false;

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const groundPos = (lon: number, lat: number, lift = 0) => Cartesian3.fromDegrees(lon, lat, heightAt(lon, lat) + lift);

// ------------------------------------------------------------------ camera
export function setCamMode(mode: CameraMode) {
  const s = store();
  if (mode === "free") return cameraController.release("free");
  if (mode === "overview") {
    void cameraController.flyToOverview(2.4);
    return;
  }
  void cameraController.setVehicleMode(mode, () => cameraAnchor(s.followTarget));
}

/** What the Follow / Aerial / Street views look at: the active team, else the selected report. */
function cameraAnchor(followTarget: string) {
  const st = store();
  const team = engine.getAnchor(followTarget !== "inspection" ? followTarget : (Object.keys(st.dispatches)[0] ?? ""));
  if (team) return team;
  const sel = st.incidents.find((i) => i.id === st.selectedId) ?? st.incidents[st.incidents.length - 1];
  if (!sel) return null;
  const sn = nearestCorridor(sel.lon, sel.lat);
  return { pos: groundPos(sel.lon, sel.lat, 1.5), bearing: smoothBearing(sn.corridor.pl, sn.s) };
}

export function flyToLocation(lon: number, lat: number, opts?: { range?: number; pitch?: number; duration?: number }) {
  const sn = nearestCorridor(lon, lat);
  const bearing = smoothBearing(sn.corridor.pl, sn.s);
  return cameraController.flyToPoint(groundPos(lon, lat, 1), {
    heading: bearing + 28,
    pitch: opts?.pitch ?? -32,
    range: opts?.range ?? 85,
    duration: opts?.duration ?? 2,
  });
}

// -------------------------------------------------------------- simulation
export async function startInspection() {
  const s = store();
  if (starting || s.sim.status === "running") return;
  if (s.sim.status === "finished") resetSimulation();
  if (s.sim.status === "paused" || s.sim.status === "event") return resumeInspection();
  starting = true;
  try {
    store().set({ followTarget: "inspection" });
    store().addLog("Inspection started", "info");
    // 1) smooth focus on the vehicle, 2) go, 3) cinematic tracking shot
    const p = engine.inspectionPosition();
    await cameraController.flyToPoint(p, { heading: 335 + 40, pitch: -24, range: 80, duration: 2.2 }, "follow");
    engine.start();
    await cameraController.setVehicleMode("follow", () => engine.getAnchor("inspection"));
  } finally {
    starting = false;
  }
}

export function pauseInspection() {
  engine.pause();
  store().addLog("Inspection paused");
}

export function resumeInspection() {
  const s = store();
  if (s.sim.status === "event") return; // must be handled in the AI panel first
  engine.resume();
  store().addLog("Inspection resumed");
}

export function setSpeed(speed: 1 | 2 | 4) {
  store().patchSim({ speed });
}

export function resetSimulation() {
  stopLive();
  cameraController.release("overview");
  engine.reset();
  const speed = store().sim.speed;
  store().resetAll();
  store().patchSim({ speed });
  store().addLog("Simulation reset to initial state");
  void cameraController.flyToOverview(2.2);
}

// -------------------------------------------------------- inspection events
export function handleInspectionEvent(evt: InspectionEventDef) {
  modeBeforeEvent = cameraController.currentMode === "free" || cameraController.currentMode === "overview"
    ? "follow"
    : cameraController.currentMode;
  const sample = sampleById(evt.sampleId)!;
  const sessionLoc = eventLocation(evt);
  store().set({
    detection: {
      origin: "event",
      eventId: evt.id,
      sampleId: sample.id,
      imageUrl: sample.url,
      imageLabel: sample.label,
      status: "running",
      adapter: "demo",
      detections: [],
      confirmed: [],
      draftLocation: { lon: sessionLoc[0], lat: sessionLoc[1], source: "simulated" },
      runId: Date.now(),
    },
  });
  void runDetection();
  void flyToLocation(sessionLoc[0], sessionLoc[1], { range: 62, pitch: -30, duration: 2.1 });
}

export const eventLocation = (evt: InspectionEventDef) => routeLocation(routePolyline, evt.atMeters + 14, evt.lateral);

// --------------------------------------------------------------- detection
export async function runDetection() {
  const d = store().detection;
  if (!d) return;
  const runId = d.runId;
  store().patchDetection({ status: "running", error: undefined });
  try {
    const adapter = d.sampleId ? adapters.demo : adapters[store().adapterId];
    const result = await adapter.predict(d.sampleId ? { kind: "sample", sampleId: d.sampleId } : { kind: "file", file: d.file! });
    if (store().detection?.runId !== runId) return; // superseded
    store().patchDetection({
      status: "done",
      detections: result.detections,
      confirmed: result.detections.map(() => true),
      annotatedImageUrl: result.annotatedImageUrl,
      disclosure: result.disclosure,
      adapter: result.adapter,
    });
  } catch (e) {
    if (store().detection?.runId !== runId) return;
    store().patchDetection({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

export function loadSample(sampleId: string) {
  const sample = sampleById(sampleId)!;
  store().set({
    detection: {
      origin: "manual",
      sampleId,
      imageUrl: sample.url,
      imageLabel: sample.label,
      status: "idle",
      adapter: "demo",
      detections: [],
      confirmed: [],
      runId: Date.now(),
    },
  });
  void runDetection();
}

export function loadUpload(file: File) {
  const prev = store().detection;
  if (prev?.file && prev.imageUrl.startsWith("blob:")) URL.revokeObjectURL(prev.imageUrl);
  store().set({
    detection: {
      origin: "manual",
      file,
      imageUrl: URL.createObjectURL(file),
      imageLabel: file.name,
      status: "idle",
      adapter: store().adapterId,
      detections: [],
      confirmed: [],
      runId: Date.now(),
    },
  });
  void runDetection();
}

export function createReportFromDetection(): Incident | null {
  const s = store();
  const d = s.detection;
  if (!d || d.status !== "done") return null;
  const picked = d.detections.filter((_, i) => d.confirmed[i]);
  if (!picked.length || !d.draftLocation) return null;
  const evt = INSPECTION_EVENTS.find((e) => e.id === d.eventId);
  const cls = picked[0].cls;
  const fromModel = picked.some((p) => p.source === "model");
  const incident = s.addIncident({
    cls,
    status: "new",
    lon: d.draftLocation.lon,
    lat: d.draftLocation.lat,
    locationSource: d.draftLocation.source,
    title: evt?.title ?? `${CLASS_META[cls].label} report`,
    note: fromModel
      ? "Model-assisted report. Detections were reviewed and confirmed by an operator; location was selected manually."
      : d.draftLocation.source === "simulated"
        ? "Created from a scripted demo inspection event. Annotation is manually authored demo data, not an AI prediction; location is simulated."
        : "Operator report with a manually selected location. Annotation is demo/manual data.",
    imageUrl: d.imageUrl,
    imageLabel: d.imageLabel,
    annotations: picked,
    origin: d.origin === "event" ? "inspection" : "manual-report",
  });
  s.addLog(`Report ${incident.id} created · ${CLASS_META[cls].label}`, "ok");
  s.set({ selectedId: incident.id, detection: null, pickingLocation: false, checkMode: false });
  if (d.origin === "event") {
    engine.resumeAfterEvent();
    setCamMode(modeBeforeEvent);
  }
  return incident;
}

export function dismissDetection() {
  const d = store().detection;
  store().set({ detection: null, pickingLocation: false, checkMode: false });
  if (d?.origin === "event") {
    store().addLog("Detection dismissed by reviewer");
    engine.resumeAfterEvent();
    setCamMode(modeBeforeEvent);
  }
}

// --------------------------------------------------------------- incidents
export function selectIncident(id: string | null, fly = true) {
  store().select(id);
  if (!id) return;
  store().set({ panel: "incidents" });
  const inc = store().incidents.find((i) => i.id === id);
  if (inc && fly) void flyToLocation(inc.lon, inc.lat);
}

export function setReview(id: string) {
  store().setStatus(id, "review");
  store().addLog(`${id} confirmed by the operator · Under Review`);
}

/** The operator rejects an early warning as a false alarm: it leaves the queue. */
export function dismissPrediction(id: string) {
  store().removeIncident(id);
  store().addLog(`${id} dismissed as a false alarm`);
}

/** Demonstration routes only exist along the curated corridor. */
export const DISPATCH_MAX_OFFSET_M = 150;
export const isDispatchable = (inc: Incident) => nearestCorridor(inc.lon, inc.lat).off <= DISPATCH_MAX_OFFSET_M;

export function assignMaintenance(id: string): boolean {
  const inc = store().incidents.find((i) => i.id === id);
  if (!inc || inc.status === "resolved" || inc.status === "assigned") return false;
  if (!isDispatchable(inc)) {
    store().addLog(`${id}: outside the demo corridor, no demonstration route available`, "warn");
    return false;
  }
  if (!engine.dispatch(inc)) return false;
  store().setStatus(id, "assigned");
  store().addLog(`${id}: maintenance assigned · unit leaving demo depot`, "info");
  return true;
}

export function followMaintenance(id: string) {
  store().set({ followTarget: id });
  void cameraController.setVehicleMode("follow", () => engine.getAnchor(id));
}

export function resolveIncident(id: string) {
  const d = store().dispatches[id];
  if (d && d.phase !== "done") return; // simulated activity still in progress
  store().setStatus(id, "resolved");
  store().addLog(`${id} marked Resolved after review (simulation, no physical repair)`, "ok");
  engine.removeDispatch(id);
  if (store().followTarget === id) {
    store().set({ followTarget: "inspection" });
    cameraController.release("free");
  }
}

export const routeBearingAt = (s: number) => pointAt(routePolyline, s).bearing;

/**
 * Demo of a detection arriving from the road-camera network: a new report appears on the map as status New
 * with its (demo) prediction attached. Replace with your real feed / model output later.
 */
export function simulateIncomingReport(opts: { focus?: boolean } = {}): Incident {
  const focus = opts.focus ?? true;
  const s = store();
  const n = s.incomingCount;
  const def = INCOMING_REPORTS[n % INCOMING_REPORTS.length];
  const sample = sampleById(def.sampleId)!;
  const [lon, lat] = corridorLocation(def.corridor, def.atMeters + 16 * Math.floor(n / INCOMING_REPORTS.length), def.lateral);
  const incident = s.addIncident({
    cls: def.cls,
    status: "predicted",
    lon,
    lat,
    locationSource: "simulated",
    title: def.title,
    note: "Simulated incoming report. The annotation is manually authored demo data, not an AI prediction; the location is a demo placement.",
    imageUrl: sample.url,
    imageLabel: sample.label,
    annotations: sample.annotations,
    origin: "inspection",
    source: SOURCE_LABEL,
  });
  s.set({ incomingCount: n + 1, checkMode: false, detection: null, ...(focus ? { panel: "incidents" as const } : {}) });
  s.addLog(`New report ${incident.id} · ${CLASS_META[def.cls].label}`, "warn");
  raiseAlert(incident);
  if (focus) selectIncident(incident.id, true);
  return incident;
}

let alertTimer: ReturnType<typeof setTimeout> | undefined;
function raiseAlert(inc: Incident) {
  store().set({ alert: { id: inc.id, text: `New ${CLASS_META[inc.cls].label.toLowerCase()} · ${inc.title}` } });
  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => store().set({ alert: null }), 9000);
}

// ------------------------------------------------------- live simulation
const LIVE_INTERVAL_MS = 9000;
const LIVE_MAX = 9;
let liveTimer: ReturnType<typeof setInterval> | undefined;
let liveCount = 0;

/** Reports keep arriving on their own, as they would from the camera network. The camera is not hijacked. */
export function startLive() {
  if (store().live) return;
  liveCount = 0;
  store().set({ live: true });
  store().addLog("Live simulation started: reports arrive from the camera network", "info");
  liveTimer = setInterval(() => {
    if (!store().live) return;
    simulateIncomingReport({ focus: false });
    if (++liveCount >= LIVE_MAX) stopLive();
  }, LIVE_INTERVAL_MS);
}

export function stopLive() {
  clearInterval(liveTimer);
  liveTimer = undefined;
  if (store().live) {
    store().set({ live: false });
    store().addLog("Live simulation stopped");
  }
}
