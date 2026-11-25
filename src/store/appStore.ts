import { create } from "zustand";
import { SEED_INCIDENTS } from "../data/route";
import { sampleById } from "../data/samples";
import type {
  Annotation,
  CameraMode,
  Incident,
  IncidentClass,
  IncidentStatus,
  InspectionEventDef,
  LocationSource,
  MapStatus,
  SimStatus,
} from "../types";
import { buildPolyline } from "../utils/geo";
import { corridorLocation } from "../utils/network";
import { ROUTE_LATLON } from "../data/route";

export const SOURCE_LABEL = "Road camera network · AI prediction (demo)";

export const routePolyline = buildPolyline(ROUTE_LATLON);

export function seedIncidents(): Incident[] {
  return SEED_INCIDENTS.map((s) => {
    const [lon, lat] = corridorLocation(s.corridor, s.atMeters, s.lateral);
    const sample = sampleById(s.sampleId)!;
    return {
      id: s.id,
      cls: s.cls,
      status: s.status,
      lon,
      lat,
      locationSource: "simulated",
      title: s.title,
      note: "Simulated demo incident. Location is a demo placement along the corridor, not a survey.",
      imageUrl: sample.url,
      imageLabel: sample.label,
      annotations: sample.annotations,
      origin: "seed",
      createdLabel: "Seed data",
      source: SOURCE_LABEL,
    } satisfies Incident;
  });
}

export interface DetectionSession {
  /** where the session came from */
  origin: "event" | "manual";
  eventId?: string;
  sampleId?: string;
  file?: File;
  imageUrl: string;
  imageLabel: string;
  status: "idle" | "running" | "done" | "error";
  adapter: "demo" | "real";
  detections: Annotation[];
  /** index -> confirmed by the reviewer */
  confirmed: boolean[];
  annotatedImageUrl?: string;
  disclosure?: string;
  error?: string;
  /** manual location for the draft report */
  draftLocation?: { lon: number; lat: number; source: LocationSource };
  /** bump to invalidate stale async results */
  runId: number;
}

export interface Dispatch {
  incidentId: string;
  phase: "enroute" | "working" | "done";
  progress: number; // 0..1 of the drive
}

export interface LogEntry {
  id: number;
  t: string;
  text: string;
  tone: "info" | "ok" | "warn";
}

interface Filters {
  classes: IncidentClass[];
  statuses: IncidentStatus[];
}

const ALL_CLASSES: IncidentClass[] = ["pothole", "barrier", "sidewalk"];
const ALL_STATUSES: IncidentStatus[] = ["predicted", "new", "review", "assigned", "resolved"];

export interface AppState {
  // map
  mapStatus: MapStatus;
  mapMessage: string;
  mapInfo: { terrain: string; imagery: string; buildings: string };
  cluster: boolean;
  /** true while a scripted camera flight is running (camera presets are disabled) */
  cameraBusy: boolean;
  // incidents
  incidents: Incident[];
  selectedId: string | null;
  filters: Filters;
  idCounter: number;
  // inspection simulation
  sim: { status: SimStatus; speed: 1 | 2 | 4; camMode: CameraMode; s: number; progress: number; fired: string[] };
  pendingEvent: InspectionEventDef | null;
  // maintenance
  dispatches: Record<string, Dispatch>;
  followTarget: "inspection" | string; // incident id of a maintenance dispatch
  // detection / inspection panel
  detection: DetectionSession | null;
  adapterId: "demo" | "real";
  pickingLocation: boolean;
  // mission
  mission: { active: boolean; step: number; paused: boolean };
  // ui
  panel: "inspection" | "incidents" | "analytics";
  panelOpen: boolean;
  leftTab: "view" | "filters" | "analysis";
  /** true while the operator is checking an uploaded / sample image in the right panel */
  checkMode: boolean;
  incomingCount: number;
  /** hovered map pin (screen position) for the tooltip */
  hover: { id: string; x: number; y: number } | null;
  /** presentation mode: map only, captions on */
  presentation: boolean;
  /** live simulation: reports keep arriving on their own */
  live: boolean;
  alert: { id: string; text: string } | null;
  log: LogEntry[];
  logCounter: number;

  // actions
  set: (p: Partial<AppState>) => void;
  addLog: (text: string, tone?: LogEntry["tone"]) => void;
  select: (id: string | null) => void;
  setStatus: (id: string, status: IncidentStatus) => void;
  removeIncident: (id: string) => void;
  addIncident: (i: Omit<Incident, "id" | "createdLabel"> & { createdLabel?: string }) => Incident;
  toggleClassFilter: (c: IncidentClass) => void;
  toggleStatusFilter: (s: IncidentStatus) => void;
  resetFilters: () => void;
  patchSim: (p: Partial<AppState["sim"]>) => void;
  patchDetection: (p: Partial<DetectionSession>) => void;
  resetAll: () => void;
}

const initialSim = (speed: 1 | 2 | 4 = 1): AppState["sim"] => ({
  status: "idle",
  speed,
  camMode: "overview",
  s: 0,
  progress: 0,
  fired: [],
});

export const useApp = create<AppState>((set, get) => ({
  mapStatus: "loading",
  mapMessage: "Starting Cesium…",
  mapInfo: { terrain: "—", imagery: "—", buildings: "—" },
  cluster: true,
  cameraBusy: false,
  incidents: seedIncidents(),
  selectedId: null,
  filters: { classes: [...ALL_CLASSES], statuses: [...ALL_STATUSES] },
  idCounter: 108,
  sim: initialSim(),
  pendingEvent: null,
  dispatches: {},
  followTarget: "inspection",
  detection: null,
  adapterId: "demo",
  pickingLocation: false,
  mission: { active: false, step: 0, paused: false },
  panel: "inspection",
  panelOpen: false,
  leftTab: "view",
  checkMode: false,
  incomingCount: 0,
  hover: null,
  presentation: false,
  live: false,
  alert: null,
  log: [],
  logCounter: 0,

  set: (p) => set(p),
  addLog: (text, tone = "info") =>
    set((s) => ({
      log: [{ id: s.logCounter + 1, t: new Date().toLocaleTimeString("en-GB"), text, tone }, ...s.log].slice(0, 40),
      logCounter: s.logCounter + 1,
    })),
  select: (id) => set({ selectedId: id }),
  removeIncident: (id) => set((s) => ({ incidents: s.incidents.filter((i) => i.id !== id), selectedId: s.selectedId === id ? null : s.selectedId })),
  setStatus: (id, status) =>
    set((s) => ({ incidents: s.incidents.map((i) => (i.id === id ? { ...i, status } : i)) })),
  addIncident: (i) => {
    const n = get().idCounter + 1;
    const incident: Incident = {
      ...i,
      id: `RG-${String(n).padStart(4, "0")}`,
      createdLabel: i.createdLabel ?? new Date().toLocaleTimeString("en-GB"),
    };
    set((s) => ({ incidents: [...s.incidents, incident], idCounter: n }));
    return incident;
  },
  toggleClassFilter: (c) =>
    set((s) => ({
      filters: {
        ...s.filters,
        classes: s.filters.classes.includes(c) ? s.filters.classes.filter((x) => x !== c) : [...s.filters.classes, c],
      },
    })),
  toggleStatusFilter: (st) =>
    set((s) => ({
      filters: {
        ...s.filters,
        statuses: s.filters.statuses.includes(st)
          ? s.filters.statuses.filter((x) => x !== st)
          : [...s.filters.statuses, st],
      },
    })),
  resetFilters: () => set({ filters: { classes: [...ALL_CLASSES], statuses: [...ALL_STATUSES] } }),
  patchSim: (p) => set((s) => ({ sim: { ...s.sim, ...p } })),
  patchDetection: (p) => set((s) => (s.detection ? { detection: { ...s.detection, ...p } } : {})),
  resetAll: () =>
    set((s) => ({
      incidents: seedIncidents(),
      idCounter: 108,
      selectedId: null,
      filters: { classes: [...ALL_CLASSES], statuses: [...ALL_STATUSES] },
      sim: initialSim(s.sim.speed),
      pendingEvent: null,
      dispatches: {},
      followTarget: "inspection",
      detection: null,
      pickingLocation: false,
      checkMode: false,
      incomingCount: 0,
      hover: null,
      live: false,
      alert: null,
      log: [],
    })),
}));

export const isVisible = (i: Incident, f: Filters) => f.classes.includes(i.cls) && f.statuses.includes(i.status);
