/**
 * Link RoadGuard 3D with another website.
 *
 * Embed:   <iframe src="https://<site>/?embed"></iframe>
 * Inbound  (host page -> map), via iframe.contentWindow.postMessage(msg, "*"):
 *   { type: "roadguard:detection", cls, image?, title?, boxes?, auto?, focus? }   a model result enters the map
 *   { type: "roadguard:select", id }                                              open a report
 *   { type: "roadguard:ping" }                                                    ask for "roadguard:ready"
 * Outbound (map -> host page, window.parent):
 *   roadguard:ready, roadguard:created {id, cls, lon, lat}, roadguard:status {id, status}, roadguard:selected {id}, roadguard:error {message}
 *
 * Integrity: the dataset has no GPS, so every detection is placed at a SIMULATED spot on the demo roads (locationSource
 * "simulated"). Confidence is shown only when the host sends one from a real model; nothing is invented here.
 * `?origin=https://your-site.com` restricts which page may send messages (recommended once you know the host URL).
 */
import { CLASS_META } from "../data/config";
import { useApp } from "../store/appStore";
import type { Annotation, Incident, IncidentClass, IncidentStatus } from "../types";
import { corridorLocation, NETWORK } from "../utils/network";
import { assignMaintenance, resolveIncident, selectIncident, setReview } from "../components/simulation/actions";

const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const ALLOWED_ORIGIN = params.get("origin");
const CLASSES: IncidentClass[] = ["pothole", "barrier", "sidewalk"];
const MAX_IMAGE_CHARS = 4_000_000; // ~3 MB data URL

const st = () => useApp.getState();
const inFrame = typeof window !== "undefined" && window.parent !== window;

function post(type: string, data: Record<string, unknown> = {}) {
  if (!inFrame) return;
  window.parent.postMessage({ type, ...data }, ALLOWED_ORIGIN ?? "*");
}

export interface DetectionMessage {
  cls: IncidentClass;
  /** https URL or data:image/... URL of the camera frame */
  image?: string;
  title?: string;
  /** model boxes: bbox [x, y, w, h] normalised 0..1; confidence 0..1 from the real model */
  boxes?: { bbox: [number, number, number, number]; confidence?: number; cls?: IncidentClass }[];
  /** run the automatic response (confirm -> team -> repair). Default true. */
  auto?: boolean;
  /** open the report and fly to it. Default true. */
  focus?: boolean;
}

const okImage = (u: unknown): u is string =>
  typeof u === "string" && u.length < MAX_IMAGE_CHARS && (/^https:\/\//i.test(u) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u));

const okBox = (b: unknown): b is { bbox: [number, number, number, number]; confidence?: number; cls?: IncidentClass } => {
  if (!b || typeof b !== "object") return false;
  const { bbox, confidence, cls } = b as Record<string, unknown>;
  return (
    Array.isArray(bbox) && bbox.length === 4 && bbox.every((n) => typeof n === "number" && n >= 0 && n <= 1) &&
    (confidence === undefined || (typeof confidence === "number" && confidence >= 0 && confidence <= 1)) &&
    (cls === undefined || CLASSES.includes(cls as IncidentClass))
  );
};

/** a random spot on one of the demo roads (simulated: the dataset has no GPS) */
function simulatedSpot(cls: IncidentClass): [number, number] {
  const c = NETWORK[Math.floor(Math.random() * NETWORK.length)];
  const s = 40 + Math.random() * Math.max(10, c.pl.total - 80);
  const lateral = cls === "sidewalk" ? 8 : Math.random() * 3 - 0.5;
  return corridorLocation(c.id, s, lateral);
}

/** A detection from the other website enters the map. Returns the new report, or an error message. */
export function addExternalDetection(d: DetectionMessage): Incident | string {
  if (!CLASSES.includes(d.cls)) return `cls must be one of ${CLASSES.join(", ")}`;
  if (d.image !== undefined && !okImage(d.image)) return "image must be an https:// URL or a data:image/(png|jpeg|webp|gif);base64 URL under ~3 MB";
  const boxes = (d.boxes ?? []).filter(okBox);
  const annotations: Annotation[] = boxes.map((b) => ({
    cls: b.cls ?? d.cls,
    bbox: b.bbox,
    // confidence is only kept when the model actually sent it
    ...(typeof b.confidence === "number" ? { confidence: b.confidence, source: "model" as const } : { source: "manual" as const }),
  }));
  const fromModel = annotations.some((a) => a.source === "model");
  const [lon, lat] = simulatedSpot(d.cls);
  const title = (typeof d.title === "string" && d.title.trim().slice(0, 80)) || `${CLASS_META[d.cls].label} detected`;
  const inc = st().addIncident({
    cls: d.cls,
    status: "predicted",
    lon,
    lat,
    locationSource: "simulated",
    title,
    note: "Sent by a linked website. The position is a simulated placement on the demo roads (the image has no GPS).",
    imageUrl: d.image,
    imageLabel: fromModel ? "Camera frame · model prediction" : "Camera frame (linked website)",
    annotations,
    origin: "manual-report",
    source: fromModel ? "Linked website · model prediction" : "Linked website",
  });
  st().addLog(`Linked website sent ${inc.id} · ${CLASS_META[d.cls].label}`, "warn");
  st().set({ alert: { id: inc.id, text: `New ${CLASS_META[d.cls].label.toLowerCase()} · ${title}` } });
  setTimeout(() => { if (st().alert?.id === inc.id) st().set({ alert: null }); }, 9000);
  if (d.focus !== false) selectIncident(inc.id, true);
  if (d.auto !== false) void autoRespond(inc.id);
  return inc;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const statusOf = (id: string) => st().incidents.find((i) => i.id === id)?.status;

/** the automatic response: confirm, send the nearest team, wait for the simulated work, close the report */
async function autoRespond(id: string) {
  await sleep(4000);
  if (statusOf(id) !== "predicted") return;
  setReview(id);
  await sleep(2500);
  if (statusOf(id) !== "review" || !assignMaintenance(id)) return;
  for (let t = 0; t < 600 && st().dispatches[id]?.phase !== "done"; t++) await sleep(500);
  if (st().dispatches[id]?.phase !== "done") return;
  await sleep(1500);
  resolveIncident(id);
}

let started = false;
/** Start listening for the host page and reporting changes back to it. Safe to call when not embedded. */
export function startBridge() {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("message", (e: MessageEvent) => {
    if (ALLOWED_ORIGIN && e.origin !== ALLOWED_ORIGIN) return;
    const m = e.data as { type?: unknown } | null;
    if (!m || typeof m !== "object" || typeof m.type !== "string" || !m.type.startsWith("roadguard:")) return;
    if (m.type === "roadguard:ping") post("roadguard:ready");
    else if (m.type === "roadguard:select") {
      const id = (m as { id?: unknown }).id;
      if (typeof id === "string" && st().incidents.some((i) => i.id === id)) selectIncident(id, true);
    } else if (m.type === "roadguard:detection") {
      const r = addExternalDetection(m as unknown as DetectionMessage);
      if (typeof r === "string") post("roadguard:error", { message: r });
      else post("roadguard:created", { id: r.id, cls: r.cls, lon: r.lon, lat: r.lat, locationSource: r.locationSource });
    }
  });

  // report status / selection changes back to the host page
  const last = new Map<string, IncidentStatus>(st().incidents.map((i) => [i.id, i.status]));
  let lastSel = st().selectedId;
  useApp.subscribe((s) => {
    for (const i of s.incidents) {
      if (last.get(i.id) !== i.status) {
        if (last.has(i.id)) post("roadguard:status", { id: i.id, status: i.status });
        last.set(i.id, i.status);
      }
    }
    if (s.selectedId !== lastSel) {
      lastSel = s.selectedId;
      post("roadguard:selected", { id: s.selectedId });
    }
  });

  const announce = () => post("roadguard:ready");
  if (st().mapStatus === "ready") announce();
  else {
    const unsub = useApp.subscribe((s) => {
      if (s.mapStatus === "ready" || s.mapStatus === "fallback") {
        unsub();
        announce();
      }
    });
  }
}

/** `?embed`: the clean view for another website (no demo buttons). */
export const EMBED = params.has("embed");
