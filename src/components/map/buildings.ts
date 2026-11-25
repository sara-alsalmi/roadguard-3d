import {
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  Primitive,
  Cartesian3,
} from "cesium";

export interface FootprintBuilding {
  /** metres, or null when OSM has no height / level tag (height is then estimated) */
  h: number | null;
  /** flat [lon, lat, lon, lat, ...] */
  ring: number[];
}

/** Deterministic pseudo-random in [0,1) from a number. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Extrudes real OpenStreetMap building footprints into one batched Primitive.
 * Footprints are real; heights are real only where OSM carries a height or
 * building:levels tag - the rest are clearly flagged estimates.
 */
export function createFootprintBuildings(data: FootprintBuilding[]): { primitive: Primitive; tagged: number } {
  let tagged = 0;
  const instances = data.map((b, idx) => {
    let height = b.h;
    if (height === null) height = 9 + hash(idx + 1) * 16; // estimated
    else tagged++;
    const tone = 0.74 + hash(idx * 3.7) * 0.1;
    const color = new Color(0.93 * tone, 0.91 * tone, 0.87 * tone, 1);
    return new GeometryInstance({
      geometry: new PolygonGeometry({
        polygonHierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(b.ring)),
        height: 0,
        extrudedHeight: height,
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
    });
  });
  const primitive = new Primitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }),
    asynchronous: true,
    releaseGeometryInstances: true,
  });
  return { primitive, tagged };
}
