import {
  Cartesian3,
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
  pothole: { file: "models/pothole.glb", yaw: 0, scale: 1 },
  barrier: { file: "models/barrier.glb", yaw: 0, scale: 1 },
  sidewalk: { file: "models/sidewalk.glb", yaw: 90, scale: 1 },
};

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

  detach() {
    this.unsub?.();
    this.unsub = null;
    if (this.viewer && !this.viewer.isDestroyed()) this.viewer.dataSources.remove(this.ds, true);
    this.ds = new CustomDataSource("hazards");
    this.sig.clear();
    this.viewer = null;
  }

  private sync(s: AppState) {
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
          distanceDisplayCondition: new DistanceDisplayCondition(0, 650),
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
