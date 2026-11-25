import type { IncidentClass, IncidentStatus, InspectionEventDef } from "../types";

/**
 * Curated inspection corridor: a ~1.6 km stretch of the King Fahd Road service
 * road (northbound), Al Olaya, Riyadh.
 *
 * Waypoints come from OpenStreetMap way 844036241 (c) OpenStreetMap
 * contributors, ODbL - real road geometry, not generated. This is a fixed
 * demonstration route; there is no live road-network routing.
 * Format: [lat, lon].
 */
export const ROUTE_LATLON: [number, number][] = [
  [24.70964, 46.6735024],
  [24.7097676, 46.6734424],
  [24.7098241, 46.6734132],
  [24.7102032, 46.6732183],
  [24.7112836, 46.6726705],
  [24.7117005, 46.6724692],
  [24.7120873, 46.6722637],
  [24.7121151, 46.672248],
  [24.7122436, 46.6721879],
  [24.7126043, 46.671996],
  [24.7130451, 46.671768],
  [24.7133666, 46.6715787],
  [24.714333, 46.6711223],
  [24.7143934, 46.6710912],
  [24.7148216, 46.6708711],
  [24.7151138, 46.6707517],
  [24.7159962, 46.6703511],
  [24.7172921, 46.6696472],
  [24.719065, 46.6687343],
  [24.7191276, 46.6687077],
  [24.7205253, 46.6680508],
  [24.7206653, 46.6679848],
  [24.7215888, 46.6674818],
  [24.7217337, 46.6674069],
  [24.7217929, 46.6673763],
  [24.7220394, 46.667249],
  [24.7221971, 46.6671676],
  [24.7228658, 46.6668309],
];

export const INSPECTION_SPEED_MPS = 18; // base speed at 1x
export const MAINTENANCE_SPEED_MPS = 15;
export const MAINTENANCE_WORK_SECONDS = 6; // simulated activity duration at 1x

export const DEPOT = {
  name: "Municipal Maintenance Depot (demo)",
  atMeters: 0,
  lateral: 28, // metres to the right of the route start
};

/** Scripted inspection events: the vehicle "detects" these as it passes. */
export const INSPECTION_EVENTS: InspectionEventDef[] = [
  {
    id: "evt-pothole",
    atMeters: 560,
    cls: "pothole",
    sampleId: "sample-pothole",
    lateral: 2,
    title: "Pothole on service lane",
  },
  {
    id: "evt-barrier",
    atMeters: 1160,
    cls: "barrier",
    sampleId: "sample-barrier",
    lateral: 4,
    title: "Excavation barrier across kerb lane",
  },
];

export interface SeedIncident {
  id: string;
  cls: IncidentClass;
  status: IncidentStatus;
  /** corridor id (see corridors.ts) */
  corridor: string;
  atMeters: number;
  lateral: number;
  title: string;
  sampleId: string;
}

/** Simulated seed incidents. Positions are demo placements along the demo corridors. */
export const SEED_INCIDENTS: SeedIncident[] = [
  { id: "RG-0101", cls: "pothole", status: "predicted", corridor: "fahd", atMeters: 240, lateral: 1, title: "Pothole near junction", sampleId: "sample-pothole" },
  { id: "RG-0102", cls: "sidewalk", status: "review", corridor: "olaya", atMeters: 420, lateral: 9, title: "Cracked paving slabs", sampleId: "sample-sidewalk" },
  { id: "RG-0103", cls: "barrier", status: "resolved", corridor: "urubah", atMeters: 700, lateral: 5, title: "Utility excavation barrier", sampleId: "sample-barrier" },
  { id: "RG-0104", cls: "pothole", status: "review", corridor: "fahd", atMeters: 820, lateral: -1, title: "Pothole, inner lane", sampleId: "sample-pothole" },
  { id: "RG-0105", cls: "sidewalk", status: "predicted", corridor: "olaya", atMeters: 1150, lateral: 10, title: "Broken kerb and tiles", sampleId: "sample-sidewalk" },
  { id: "RG-0106", cls: "barrier", status: "new", corridor: "fahd", atMeters: 1380, lateral: 5, title: "Barrier left in place", sampleId: "sample-barrier" },
  { id: "RG-0107", cls: "pothole", status: "resolved", corridor: "fahd", atMeters: 1500, lateral: 0, title: "Patched carriageway", sampleId: "sample-pothole" },
  { id: "RG-0108", cls: "pothole", status: "predicted", corridor: "urubah", atMeters: 1900, lateral: 1, title: "Pothole at roundabout exit", sampleId: "sample-pothole" },
];

/** Demo reports that arrive from the "camera network" (cycled in order, spread over the corridors). */
export const INCOMING_REPORTS: { cls: IncidentClass; corridor: string; atMeters: number; lateral: number; title: string; sampleId: string }[] = [
  { cls: "pothole", corridor: "fahd", atMeters: 570, lateral: 2, title: "Pothole on service lane", sampleId: "sample-pothole" },
  { cls: "barrier", corridor: "olaya", atMeters: 780, lateral: 5, title: "Excavation barrier across kerb lane", sampleId: "sample-barrier" },
  { cls: "sidewalk", corridor: "urubah", atMeters: 1350, lateral: 10, title: "Broken paving and kerb", sampleId: "sample-sidewalk" },
  { cls: "pothole", corridor: "olaya", atMeters: 1300, lateral: 1, title: "Pothole at junction approach", sampleId: "sample-pothole" },
  { cls: "barrier", corridor: "urubah", atMeters: 2300, lateral: 5, title: "Barrier left after roadworks", sampleId: "sample-barrier" },
  { cls: "sidewalk", corridor: "fahd", atMeters: 1010, lateral: 11, title: "Dilapidated sidewalk slabs", sampleId: "sample-sidewalk" },
];
