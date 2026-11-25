import {
  Cartesian3,
  ClippingPolygon,
  ClippingPolygonCollection,
  Matrix4,
  CustomDataSource,
  DistanceDisplayCondition,
  HeadingPitchRoll,
  Math as CesiumMath,
  Transforms,
  type Viewer,
} from "cesium";
import { useApp, type AppState } from "../../store/appStore";
import type { IncidentClass } from "../../types";
import { asset } from "../../utils/asset";
import { smoothBearing } from "../../utils/geo";
import { nearestCorridor } from "../../utils/network";
import { heightAt, terrainVersion } from "../map/terrain";

const MODEL: Record<IncidentClass, { file: string; yaw: number; scale: number }> = {
  // close to real size (representative shapes modelled on the dataset photos, not scans)
  pothole: { file: "models/pothole.glb", yaw: 0, scale: 1.3 },
  barrier: { file: "models/barrier.glb", yaw: 0, scale: 1 },
  sidewalk: { file: "models/sidewalk.glb", yaw: 0, scale: 1 },
};

/** outline of the pothole bowl in model units (same formula as tools/gen-hazards.mjs) */
const potholeEdge = (a: number) =>
  0.62 * (1 + 0.17 * Math.sin(3 * a + 1.3) + 0.09 * Math.sin(5 * a + 0.4) + 0.05 * Math.sin(11 * a)) * (Math.abs(Math.cos(a)) * 0.35 + 1);

/** The damage itself, as a 3D model on the road (visible when the camera is close). Representative shapes, not scans. */
export class HazardLayer {
  private ds = new CustomDataSource("hazards");
  private viewer: Viewer | null = null;
  private unsub: (() => void) | null = null;
  private sig = new Map<string, string>();

  attach(viewer: Viewer) {
    this.detach();
    this.viewer = viewer;
    viewer.dataSources.add(this.ds);
    this.sync(useApp.getState());
    this.unsub = useApp.subscribe((s) => this.sync(s));
  }

  /** Holes cut in the ground under potholes and digs, so their below-ground part (the actual depth) is visible. */
  private holesKey = "";
  private syncHoles(s: AppState) {
    const v = this.viewer;
    if (!v) return;
    const list = s.incidents.filter((i) => i.status !== "resolved" && (i.cls === "pothole" || i.cls === "barrier"));
    const key = list.map((i) => `${i.id}:${i.lon}:${i.lat}`).join("|") + `|${terrainVersion()}`;
    if (key === this.holesKey) return;
    this.holesKey = key;
    const polygons = list.map((inc) => {
      const pos = Cartesian3.fromDegrees(inc.lon, inc.lat, heightAt(inc.lon, inc.lat));
      const sn = nearestCorridor(inc.lon, inc.lat);
      const b = CesiumMath.toRadians(smoothBearing(sn.corridor.pl, sn.s, 6));
      const enu = Transforms.eastNorthUpToFixedFrame(pos);
      // local outline: x forward along the road, z to the right (metres, already scaled)
      const local: [number, number][] =
        inc.cls === "pothole"
          ? Array.from({ length: 48 }, (_, k) => { const a = (k / 48) * Math.PI * 2; const r = potholeEdge(a) * 1.12 * MODEL.pothole.scale; return [Math.cos(a) * r, Math.sin(a) * r] as [number, number]; })
          : [[-1.75, -0.95], [1.75, -0.95], [1.75, 0.95], [-1.75, 0.95]];
      const positions = local.map(([x, z]) => {
        const e = x * Math.sin(b) + z * Math.cos(b);
        const n = x * Math.cos(b) - z * Math.sin(b);
        return Matrix4.multiplyByPoint(enu, new Cartesian3(e, n, 0), new Cartesian3());
      });
      return new ClippingPolygon({ positions });
    });
    v.scene.globe.clippingPolygons = new ClippingPolygonCollection({ polygons });
  }

  detach() {
    this.unsub?.();
    this.unsub = null;
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.dataSources.remove(this.ds, true);
      this.viewer.scene.globe.clippingPolygons = undefined as never;
    }
    this.holesKey = "";
    this.ds = new CustomDataSource("hazards");
    this.sig.clear();
    this.viewer = null;
  }

  private sync(s: AppState) {
    this.syncHoles(s);
    const live = new Set<string>();
    for (const inc of s.incidents) {
      if (inc.status === "resolved") continue;
      const id = `hazard:${inc.id}`;
      live.add(id);
      const sig = `${inc.cls}|${inc.lon}|${inc.lat}|${terrainVersion()}`;
      if (this.sig.get(id) === sig) continue;
      this.sig.set(id, sig);
      this.ds.entities.removeById(id);
      const m = MODEL[inc.cls];
      const pos = Cartesian3.fromDegrees(inc.lon, inc.lat, heightAt(inc.lon, inc.lat) + 0.03);
      const sn = nearestCorridor(inc.lon, inc.lat);
      const bearing = smoothBearing(sn.corridor.pl, sn.s, 6);
      this.ds.entities.add({
        id,
        position: pos,
        orientation: Transforms.headingPitchRollQuaternion(pos, new HeadingPitchRoll(CesiumMath.toRadians(bearing + m.yaw), 0, 0)) as never,
        model: {
          uri: asset(m.file),
          scale: m.scale,
          distanceDisplayCondition: new DistanceDisplayCondition(0, 900),
        },
      });
    }
    for (const e of [...this.ds.entities.values]) {
      if (!live.has(e.id)) {
        this.ds.entities.remove(e);
        this.sig.delete(e.id);
      }
    }
  }
}

export const hazardLayer = new HazardLayer();
