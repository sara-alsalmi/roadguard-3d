/**
 * Link the RoadGuard 3D digital twin with another website.
 *
 * Embed:   <iframe src="https://<site>/?embed"></iframe>
 * Inbound  (host page -> map), via iframe.contentWindow.postMessage(msg, "*"):
 *   { type: "roadguard:detection", cls, image?, video?, name?, title?, boxes?, caseId?, focus? }   a photo / video enters the map
 *   { type: "roadguard:select", id }                                                            open a damage
 *   { type: "roadguard:clear" }                                                                 remove everything
 *   { type: "roadguard:ping" }                                                                  ask for "roadguard:ready"
 * Outbound (map -> host page, window.parent):
 *   roadguard:ready, roadguard:created {id, cls, lon, lat, locationSource}, roadguard:selected {id}, roadguard:error {message}
 *
 * image / video: an https:// URL, a data: URL, or a Blob / File object (postMessage can carry files directly).
 * Integrity: the images have no GPS, so every damage is placed at a SIMULATED spot on a real road (locationSource
 * "simulated"). Confidence is shown only when the host sends one from a real model; nothing is invented here.
 * `?origin=https://your-site.com` restricts which page may send messages.
 */
import { useApp } from "../store/appStore";
import type { Annotation, IncidentClass, MediaItem } from "../types";
import { clearAll, selectDamage } from "../twin/actions";
import { CLASSES, placeDamage } from "../twin/ingest";

const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const ALLOWED_ORIGIN = params.get("origin");
const MAX_URL_CHARS = 8_000_000;

const st = () => useApp.getState();
const inFrame = typeof window !== "undefined" && window.parent !== window;

function post(type: string, data: Record<string, unknown> = {}) {
  if (!inFrame) return;
  window.parent.postMessage({ type, ...data }, ALLOWED_ORIGIN ?? "*");
}

type Media = string | Blob;
export interface DetectionMessage {
  cls: IncidentClass;
  image?: Media;
  video?: Media;
  /** file name to show */
  name?: string;
  title?: string;
  /** model boxes for the image: bbox [x, y, w, h] normalised 0..1; confidence 0..1 from the real model */
  boxes?: { bbox: [number, number, number, number]; confidence?: number; cls?: IncidentClass }[];
  /** same caseId = same damage (more photos / videos of it) */
  caseId?: string;
  focus?: boolean;
}

function mediaUrl(m: unknown, kind: "image" | "video"): string | null {
  if (typeof Blob !== "undefined" && m instanceof Blob) return m.type.startsWith(`${kind}/`) || m.type === "" ? URL.createObjectURL(m) : null;
  if (typeof m !== "string" || m.length > MAX_URL_CHARS) return null;
  if (/^https:\/\//i.test(m)) return m;
  if (kind === "image" && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(m)) return m;
  if (kind === "video" && /^data:video\/(mp4|webm|ogg|quicktime);base64,/i.test(m)) return m;
  return null;
}

const okBox = (b: unknown): b is { bbox: [number, number, number, number]; confidence?: number; cls?: IncidentClass } => {
  if (!b || typeof b !== "object") return false;
  const { bbox, confidence, cls } = b as Record<string, unknown>;
  return (
    Array.isArray(bbox) && bbox.length === 4 && bbox.every((n) => typeof n === "number" && n >= 0 && n <= 1) &&
    (confidence === undefined || (typeof confidence === "number" && confidence >= 0 && confidence <= 1)) &&
    (cls === undefined || CLASSES.includes(cls as IncidentClass))
  );
};

/** A photo / video from the other website enters the map. Returns the damage id, or an error message. */
export function addExternalDetection(d: DetectionMessage): { id: string } | string {
  if (!CLASSES.includes(d.cls)) return `cls must be one of ${CLASSES.join(", ")}`;
  if (d.image === undefined && d.video === undefined) return "send an image or a video";
  const media: MediaItem[] = [];
  const name = typeof d.name === "string" ? d.name.slice(0, 120) : "";
  if (d.image !== undefined) {
    const url = mediaUrl(d.image, "image");
    if (!url) return "image must be an https:// URL, a data:image URL or an image Blob/File";
    const annotations: Annotation[] = (d.boxes ?? []).filter(okBox).map((b) => ({
      cls: b.cls ?? d.cls,
      bbox: b.bbox,
      ...(typeof b.confidence === "number" ? { confidence: b.confidence, source: "model" as const } : { source: "manual" as const }),
    }));
    media.push({ type: "image", url, name: name || "Photo from the linked website", annotations });
  }
  if (d.video !== undefined) {
    const url = mediaUrl(d.video, "video");
    if (!url) return "video must be an https:// URL, a data:video URL or a video Blob/File";
    media.push({ type: "video", url, name: name || "Video from the linked website", annotations: [] });
  }
  const fromModel = media.some((m) => m.annotations.some((a) => a.source === "model"));
  const inc = placeDamage({
    cls: d.cls,
    media,
    title: typeof d.title === "string" ? d.title : undefined,
    groupKey: typeof d.caseId === "string" && d.caseId ? `ext:${d.caseId.slice(0, 60)}` : undefined,
    source: fromModel ? "Linked website · model prediction" : "Linked website",
  });
  if (d.focus !== false) selectDamage(inc.id, true);
  return { id: inc.id };
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
    else if (m.type === "roadguard:clear") clearAll();
    else if (m.type === "roadguard:select") {
      const id = (m as { id?: unknown }).id;
      if (typeof id === "string" && st().incidents.some((i) => i.id === id)) selectDamage(id, true);
    } else if (m.type === "roadguard:detection") {
      const r = addExternalDetection(m as unknown as DetectionMessage);
      if (typeof r === "string") post("roadguard:error", { message: r });
      else {
        const inc = st().incidents.find((i) => i.id === r.id)!;
        post("roadguard:created", { id: inc.id, cls: inc.cls, lon: inc.lon, lat: inc.lat, locationSource: inc.locationSource });
      }
    }
  });

  let lastSel = st().selectedId;
  useApp.subscribe((s) => {
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

/** `?embed`: shown inside another website. */
export const EMBED = params.has("embed");
