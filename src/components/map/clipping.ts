import { Cartesian3, ClippingPolygon, ClippingPolygonCollection } from "cesium";
import { offsetRight, pointAt, smoothBearing, type LonLat } from "../../utils/geo";
import { NETWORK } from "../../utils/network";

/**
 * Cuts a strip out of the 3D-tiles buildings along every demo road, so teams drive on a clear road and never
 * through a building (OSM road geometry and the building footprints are not perfectly aligned).
 */
export function buildCorridorClipping(halfWidth = 15): ClippingPolygonCollection {
  const polygons = NETWORK.map((c) => {
    const left: LonLat[] = [];
    const right: LonLat[] = [];
    const n = Math.max(2, Math.ceil(c.pl.total / 12));
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * c.pl.total;
      const p = pointAt(c.pl, s);
      const b = smoothBearing(c.pl, s, 9);
      left.push(offsetRight(p.lon, p.lat, b, -halfWidth));
      right.push(offsetRight(p.lon, p.lat, b, halfWidth));
    }
    const ring = [...left, ...right.reverse()].flat();
    return new ClippingPolygon({ positions: Cartesian3.fromDegreesArray(ring) });
  });
  return new ClippingPolygonCollection({ polygons });
}
