export type IncidentClass = "pothole" | "barrier" | "sidewalk";
export type IncidentStatus = "predicted" | "new" | "review" | "assigned" | "resolved";
/** verified = surveyed GPS record; manual = picked by an operator; simulated = demo placement */
export type LocationSource = "verified" | "manual" | "simulated";
export type AnnotationSource = "demo" | "model" | "manual";

export interface Annotation {
  cls: IncidentClass;
  /** [x, y, w, h] normalised to the image (0..1) */
  bbox: [number, number, number, number];
  /** Only ever set by a real model. Never fabricated. */
  confidence?: number;
  source: AnnotationSource;
}

/** One photo or video of a damage, shown in the gallery when the damage is opened on the map. */
export interface MediaItem {
  type: "image" | "video";
  url: string;
  name: string;
  annotations: Annotation[];
  /** ISO date-time when known (e.g. read from the file name) */
  capturedAt?: string;
}

export interface Incident {
  id: string;
  cls: IncidentClass;
  status: IncidentStatus;
  lon: number;
  lat: number;
  locationSource: LocationSource;
  title: string;
  note: string;
  /** URL of the associated image (demo illustration or uploaded blob) */
  imageUrl?: string;
  imageLabel?: string;
  annotations: Annotation[];
  origin: "seed" | "inspection" | "manual-report";
  createdLabel: string;
  /** all photos / videos of this damage (the first one is also imageUrl / annotations) */
  media?: MediaItem[];
  /** groups uploads of the same case, e.g. the INC number in the file name */
  groupKey?: string;
  /** where the detection came from (display text), e.g. the camera network */
  source?: string;
}

export type CameraMode = "free" | "follow" | "aerial" | "street" | "overview";
export type SimStatus = "idle" | "running" | "paused" | "event" | "finished";
export type MapStatus = "loading" | "ready" | "fallback";

export interface InspectionEventDef {
  id: string;
  /** distance along the route (m) at which the event fires */
  atMeters: number;
  cls: IncidentClass;
  sampleId: string;
  /** lateral offset (m, +right of travel) of the affected asset from the route */
  lateral: number;
  title: string;
}
