/**
 * Photos and videos enter the digital twin here (uploaded on this page or sent by the linked website).
 *
 * - The dataset has no GPS, so every damage is placed at a SIMULATED spot on the real demo roads (marked "Simulated").
 * - Files of the same case (the INC number in the MOMRA file names) become ONE damage with a gallery.
 * - A YOLO label file (.txt, same name as the image) gives the class and boxes. Those are dataset labels, not model
 *   predictions; a confidence is only shown when a real model sends one.
 */
import { CLASS_META } from "../data/config";
import { useApp } from "../store/appStore";
import type { Annotation, Incident, IncidentClass, MediaItem } from "../types";
import { corridorLocation, NETWORK } from "../utils/network";

export const CLASSES: IncidentClass[] = ["pothole", "barrier", "sidewalk"];
/** class order of the Saudi visual-pollution dataset (dataset.yaml: names: ['barriers', 'sidewalks', 'pothole']) */
const DATASET_CLASSES: IncidentClass[] = ["barrier", "sidewalk", "pothole"];

const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp)$/i;
const VIDEO_RE = /\.(mp4|webm|mov|m4v|ogv)$/i;
const st = () => useApp.getState();

/** YOLO rows "cls cx cy w h" (normalised) -> boxes [x, y, w, h] */
export function parseYolo(text: string): Annotation[] {
  const out: Annotation[] = [];
  for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/);
    if (p.length < 5) continue;
    const cls = DATASET_CLASSES[Number(p[0])];
    const [cx, cy, w, h] = p.slice(1, 5).map(Number);
    if (!cls || [cx, cy, w, h].some((n) => !Number.isFinite(n))) continue;
    out.push({ cls, bbox: [Math.max(0, cx - w / 2), Math.max(0, cy - h / 2), Math.min(1, w), Math.min(1, h)], source: "manual" });
  }
  return out;
}

const baseName = (n: string) => n.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");

/** "…INC-21-06-038549!20210610T165255.438 GMT.jpg" -> case "INC-21-06-038549" */
export function caseKey(name: string): string | undefined {
  return name.match(/INC-\d{2}-\d{2}-\d{4,}/i)?.[0].toUpperCase();
}

/** "…!20210610T165255…" -> "2021-06-10T16:52:55Z" */
export function capturedAt(name: string): string | undefined {
  const m = name.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : undefined;
}

/** most frequent class among the boxes */
const majority = (a: Annotation[]): IncidentClass | undefined => {
  const n = new Map<IncidentClass, number>();
  for (const x of a) n.set(x.cls, (n.get(x.cls) ?? 0) + 1);
  return [...n.entries()].sort((p, q) => q[1] - p[1])[0]?.[0];
};

/** a random spot on one of the real demo roads (simulated: the images carry no GPS) */
function simulatedSpot(cls: IncidentClass): [number, number] {
  const c = NETWORK[Math.floor(Math.random() * NETWORK.length)];
  const s = 40 + Math.random() * Math.max(10, c.pl.total - 80);
  const lateral = cls === "sidewalk" ? 8 : Math.random() * 3 - 0.5;
  return corridorLocation(c.id, s, lateral);
}

export interface NewDamage {
  cls: IncidentClass;
  media: MediaItem[];
  title?: string;
  source: string;
  groupKey?: string;
}

/** Put a damage on the map, or add the media to the damage of the same case. */
export function placeDamage(d: NewDamage): Incident {
  const existing = d.groupKey ? st().incidents.find((i) => i.groupKey === d.groupKey) : undefined;
  if (existing) {
    const media = [...(existing.media ?? []), ...d.media];
    useApp.setState((s) => ({ incidents: s.incidents.map((i) => (i.id === existing.id ? { ...i, media } : i)) }));
    return { ...existing, media };
  }
  const first = d.media[0];
  const [lon, lat] = simulatedSpot(d.cls);
  const title = d.title?.trim().slice(0, 80) || (d.groupKey ? `${CLASS_META[d.cls].label} · ${d.groupKey}` : CLASS_META[d.cls].label);
  const inc = st().addIncident({
    cls: d.cls,
    status: "new",
    lon,
    lat,
    locationSource: "simulated",
    title,
    note: "Position simulated on a real Riyadh road: the image has no GPS.",
    imageUrl: first?.type === "image" ? first.url : undefined,
    imageLabel: first?.name,
    annotations: first?.annotations ?? [],
    origin: "manual-report",
    source: d.source,
    media: d.media,
    groupKey: d.groupKey,
  });
  st().set({ alert: { id: inc.id, text: `${CLASS_META[d.cls].label} · placed on the map` } });
  setTimeout(() => { if (st().alert?.id === inc.id) st().set({ alert: null }); }, 6000);
  return inc;
}

/**
 * Files chosen on this page: images (+ optional YOLO .txt labels with the same name) and videos.
 * `fallback` is the class used when a file has no label (until the model is connected).
 */
export async function ingestFiles(files: File[], fallback: IncidentClass): Promise<Incident[]> {
  const labels = new Map<string, string>();
  for (const f of files) if (/\.txt$/i.test(f.name)) labels.set(baseName(f.name), await f.text());

  const groups = new Map<string, { cls?: IncidentClass; media: MediaItem[] }>();
  for (const f of files) {
    const type = IMAGE_RE.test(f.name) ? "image" : VIDEO_RE.test(f.name) ? "video" : null;
    if (!type) continue;
    const label = labels.get(baseName(f.name));
    const annotations = label ? parseYolo(label) : [];
    const key = caseKey(f.name) ?? `file:${f.name}:${f.size}`;
    const g = groups.get(key) ?? { media: [] };
    g.media.push({ type, url: URL.createObjectURL(f), name: f.name, annotations, capturedAt: capturedAt(f.name) });
    g.cls ??= majority(annotations);
    groups.set(key, g);
  }

  const placed: Incident[] = [];
  for (const [key, g] of groups) {
    const labelled = g.media.some((m) => m.annotations.length);
    placed.push(
      placeDamage({
        cls: g.cls ?? fallback,
        media: g.media.sort((a, b) => (a.capturedAt ?? a.name).localeCompare(b.capturedAt ?? b.name)),
        groupKey: key.startsWith("file:") ? undefined : key,
        source: labelled ? "Uploaded · dataset labels" : "Uploaded · class chosen by hand",
      }),
    );
  }
  return placed;
}
