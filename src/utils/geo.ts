/**
 * Pure geographic helpers (no Cesium dependency) so simulation logic stays
 * deterministic and unit-testable. Uses a local equirectangular approximation,
 * accurate to well under a metre over the ~2 km demo corridor.
 */
export type LonLat = [number, number];

const M_PER_DEG_LAT = 110574;
const mPerDegLon = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

export interface Polyline {
  pts: LonLat[];
  /** cumulative distance (m) at each vertex */
  cum: number[];
  total: number;
}

export function distanceM(a: LonLat, b: LonLat): number {
  const lat = (a[1] + b[1]) / 2;
  return Math.hypot((b[0] - a[0]) * mPerDegLon(lat), (b[1] - a[1]) * M_PER_DEG_LAT);
}

/** Compass bearing in degrees (0 = north, 90 = east). */
export function bearingDeg(a: LonLat, b: LonLat): number {
  const lat = (a[1] + b[1]) / 2;
  const dx = (b[0] - a[0]) * mPerDegLon(lat);
  const dy = (b[1] - a[1]) * M_PER_DEG_LAT;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

export function buildPolyline(latlon: [number, number][]): Polyline {
  const pts: LonLat[] = latlon.map(([lat, lon]) => [lon, lat]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distanceM(pts[i - 1], pts[i]));
  return { pts, cum, total: cum[cum.length - 1] };
}

export interface RoutePoint {
  lon: number;
  lat: number;
  /** segment bearing, degrees */
  bearing: number;
  s: number;
}

export function pointAt(pl: Polyline, s: number): RoutePoint {
  const d = Math.min(Math.max(s, 0), pl.total);
  let i = 1;
  while (i < pl.cum.length - 1 && pl.cum[i] < d) i++;
  const a = pl.pts[i - 1];
  const b = pl.pts[i];
  const seg = pl.cum[i] - pl.cum[i - 1] || 1;
  const t = (d - pl.cum[i - 1]) / seg;
  return {
    lon: a[0] + (b[0] - a[0]) * t,
    lat: a[1] + (b[1] - a[1]) * t,
    bearing: bearingDeg(a, b),
    s: d,
  };
}

/** Bearing blended over a look-around window so heading turns smoothly at vertices. */
export function smoothBearing(pl: Polyline, s: number, window = 9): number {
  const a = pointAt(pl, s - window);
  const b = pointAt(pl, s + window);
  if (a.s === b.s) return pointAt(pl, s).bearing;
  return bearingDeg([a.lon, a.lat], [b.lon, b.lat]);
}

/** Nearest point on the polyline: distance along it and perpendicular distance. */
export function project(pl: Polyline, lon: number, lat: number): { s: number; off: number } {
  let best = { s: 0, off: Infinity };
  for (let i = 1; i < pl.pts.length; i++) {
    const a = pl.pts[i - 1];
    const b = pl.pts[i];
    const mx = mPerDegLon(lat);
    const ax = 0;
    const ay = 0;
    const bx = (b[0] - a[0]) * mx;
    const by = (b[1] - a[1]) * M_PER_DEG_LAT;
    const px = (lon - a[0]) * mx;
    const py = (lat - a[1]) * M_PER_DEG_LAT;
    const len2 = bx * bx + by * by || 1;
    const t = Math.min(1, Math.max(0, ((px - ax) * bx + (py - ay) * by) / len2));
    const off = Math.hypot(px - bx * t, py - by * t);
    if (off < best.off) best = { s: pl.cum[i - 1] + t * Math.sqrt(len2), off };
  }
  return best;
}

/** Shift a point `meters` to the right of a bearing (negative = left). */
export function offsetRight(lon: number, lat: number, bearing: number, meters: number): LonLat {
  const r = ((bearing + 90) * Math.PI) / 180;
  return [lon + (Math.sin(r) * meters) / mPerDegLon(lat), lat + (Math.cos(r) * meters) / M_PER_DEG_LAT];
}

/** Position `meters` right of the route at distance s. */
export function routeLocation(pl: Polyline, s: number, lateral: number): LonLat {
  const p = pointAt(pl, s);
  return lateral === 0 ? [p.lon, p.lat] : offsetRight(p.lon, p.lat, smoothBearing(pl, s), lateral);
}

/** Sub-path between two distances (direction aware), including interior vertices. */
export function slicePath(pl: Polyline, s0: number, s1: number): LonLat[] {
  const out: LonLat[] = [];
  const p0 = pointAt(pl, s0);
  out.push([p0.lon, p0.lat]);
  const fwd = s1 >= s0;
  const inner: number[] = [];
  for (let i = 0; i < pl.cum.length; i++) {
    const c = pl.cum[i];
    if (fwd ? c > s0 && c < s1 : c < s0 && c > s1) inner.push(i);
  }
  if (!fwd) inner.reverse();
  for (const i of inner) out.push(pl.pts[i]);
  const p1 = pointAt(pl, s1);
  out.push([p1.lon, p1.lat]);
  return out;
}

/** Wrap an angle to the shortest signed difference (degrees). */
export const angleDiff = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;
