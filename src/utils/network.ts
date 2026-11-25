import { CORRIDORS, type CorridorDef } from "../data/corridors";
import { buildPolyline, project, routeLocation, type LonLat, type Polyline } from "./geo";

export interface Corridor extends CorridorDef {
  pl: Polyline;
}

/** All demo corridors with their precomputed polylines. */
export const NETWORK: Corridor[] = CORRIDORS.map((c) => ({ ...c, pl: buildPolyline(c.latlon) }));
export const corridorById = (id: string): Corridor => NETWORK.find((c) => c.id === id) ?? NETWORK[0];

export interface Snap {
  corridor: Corridor;
  /** metres along the corridor */
  s: number;
  /** perpendicular distance (m) from the corridor */
  off: number;
}

/** Nearest corridor to a point (used for dispatch, camera bearing and terrain heights). */
export function nearestCorridor(lon: number, lat: number): Snap {
  let best: Snap | null = null;
  for (const c of NETWORK) {
    const p = project(c.pl, lon, lat);
    if (!best || p.off < best.off) best = { corridor: c, s: p.s, off: p.off };
  }
  return best!;
}

export const corridorLocation = (id: string, s: number, lateral: number): LonLat => routeLocation(corridorById(id).pl, s, lateral);
