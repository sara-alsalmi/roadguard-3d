import type { Incident } from "../../types";
import { buildPolyline, pointAt, type Polyline } from "../../utils/geo";
import { NETWORK, nearestCorridor } from "../../utils/network";

/** Road health is shown per ~60 m segment of every demo corridor. */
export const SEGMENT_M = 60;

export interface Segment {
  id: string;
  corridor: string;
  s0: number;
  s1: number;
  pl: Polyline;
}

export const SEGMENTS: Segment[] = NETWORK.flatMap((c) => {
  const n = Math.max(1, Math.ceil(c.pl.total / SEGMENT_M));
  return Array.from({ length: n }, (_, i) => {
    const s0 = (i / n) * c.pl.total;
    const s1 = ((i + 1) / n) * c.pl.total;
    const pts: [number, number][] = [];
    const steps = Math.max(2, Math.ceil((s1 - s0) / 10));
    for (let k = 0; k <= steps; k++) {
      const p = pointAt(c.pl, s0 + ((s1 - s0) * k) / steps);
      pts.push([p.lat, p.lon]);
    }
    return { id: `${c.id}:${i}`, corridor: c.id, s0, s1, pl: buildPolyline(pts) } satisfies Segment;
  });
});

export type Health = "healthy" | "warning" | "critical";

/** Worst open report near a segment decides its colour: predicted = warning, being handled = critical. */
export function segmentHealth(seg: Segment, snaps: { corridor: string; s: number; status: Incident["status"] }[]): Health {
  let worst: Health = "healthy";
  for (const sn of snaps) {
    if (sn.corridor !== seg.corridor || sn.status === "resolved") continue;
    if (sn.s < seg.s0 - 35 || sn.s > seg.s1 + 35) continue;
    if (sn.status === "predicted") worst = worst === "critical" ? worst : "warning";
    else worst = "critical";
  }
  return worst;
}

export const snapIncidents = (incidents: Incident[]) =>
  incidents.map((i) => {
    const sn = nearestCorridor(i.lon, i.lat);
    return { corridor: sn.corridor.id, s: sn.s, status: i.status };
  });

export function healthSummary(incidents: Incident[]) {
  const snaps = snapIncidents(incidents);
  let healthy = 0;
  for (const seg of SEGMENTS) if (segmentHealth(seg, snaps) === "healthy") healthy++;
  return { total: SEGMENTS.length, healthy, pct: Math.round((healthy / SEGMENTS.length) * 100) };
}
