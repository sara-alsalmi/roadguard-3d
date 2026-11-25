import { Cartographic, sampleTerrainMostDetailed, type TerrainProvider, type Viewer } from "cesium";
import { pointAt } from "../../utils/geo";
import { NETWORK, corridorById, nearestCorridor } from "../../utils/network";

const STEP = 10; // metres between sampled corridor heights
/** terrain height (m above the ellipsoid) sampled along every demo corridor */
const heights = new Map<string, number[]>(NETWORK.map((c) => [c.id, new Array(Math.ceil(c.pl.total / STEP) + 1).fill(0)]));
let viewerRef: Viewer | null = null;
let terrainLoaded = false;
let version = 0;
/** Bumps whenever real terrain heights arrive, so map layers can re-position themselves. */
export const terrainVersion = () => version;

export function bindTerrainViewer(v: Viewer) {
  viewerRef = v;
}

/** Sample real terrain along every corridor once (no-op on the flat ellipsoid fallback). */
export async function sampleRouteHeights(provider: TerrainProvider): Promise<boolean> {
  try {
    // one batched request for every corridor keeps start-up fast
    const all: Cartographic[] = [];
    const spans: { id: string; n: number }[] = [];
    for (const c of NETWORK) {
      const n = heights.get(c.id)!.length;
      spans.push({ id: c.id, n });
      for (let i = 0; i < n; i++) {
        const p = pointAt(c.pl, i * STEP);
        all.push(Cartographic.fromDegrees(p.lon, p.lat));
      }
    }
    const out = await sampleTerrainMostDetailed(provider, all);
    let k = 0;
    for (const sp of spans) {
      heights.set(sp.id, out.slice(k, k + sp.n).map((x) => (Number.isFinite(x.height) ? x.height : 0)));
      k += sp.n;
    }
    terrainLoaded = true;
    version++;
    return true;
  } catch (e) {
    console.warn("[RoadGuard] terrain sampling failed; using ellipsoid height 0", e);
    return false;
  }
}

const interp = (arr: number[], s: number): number => {
  const f = Math.max(0, s) / STEP;
  const i = Math.min(Math.floor(f), arr.length - 1);
  const a = arr[i] ?? 0;
  const b = arr[Math.min(i + 1, arr.length - 1)] ?? a;
  return a + (b - a) * (f - Math.floor(f));
};

/** Height along a corridor (default: the main King Fahd corridor). */
export const routeHeightAt = (s: number, corridorId = "fahd"): number => interp(heights.get(corridorId) ?? [0], Math.min(s, corridorById(corridorId).pl.total));

/** Height above the ellipsoid for any lon/lat near the demo corridors. */
export function heightAt(lon: number, lat: number): number {
  const sn = nearestCorridor(lon, lat);
  if (sn.off < 80) return routeHeightAt(sn.s, sn.corridor.id);
  if (terrainLoaded && viewerRef) {
    const { Cartographic: C } = { Cartographic };
    const h = viewerRef.scene.globe.getHeight(C.fromDegrees(lon, lat));
    if (h !== undefined) return h;
  }
  return routeHeightAt(sn.s, sn.corridor.id);
}

export const resetTerrainState = () => {
  for (const k of heights.keys()) heights.set(k, heights.get(k)!.map(() => 0));
  terrainLoaded = false;
};
