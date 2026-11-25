import {
  Cartesian3,
  ClassificationType,
  Color,
  ColorMaterialProperty,
  CornerType,
  CustomDataSource,
  PolylineGlowMaterialProperty,
  type Viewer,
} from "cesium";
import { useApp, type AppState } from "../../store/appStore";
import { heightAt, terrainVersion } from "../map/terrain";
import { pointAt } from "../../utils/geo";
import { NETWORK } from "../../utils/network";
import { SEGMENTS, segmentHealth, snapIncidents, type Health } from "./segments";

const COLORS: Record<Health, Color> = {
  healthy: Color.fromCssColorString("#30d158"),
  warning: Color.fromCssColorString("#ff9f0a"),
  critical: Color.fromCssColorString("#ff453a"),
};

/** Real-world width (m) of the painted health overlay on the road surface. */
export const ROAD_WIDTH_M = 12;

/**
 * Road health: every ~60 m of road is tinted green (healthy), orange (early warning) or red (damage being handled).
 * Two layers: a road-width band draped on the ground (reads like paint on the asphalt up close) and a thin glowing
 * line that keeps the roads readable from far away.
 */
export class HealthLayer {
  private ds = new CustomDataSource("road-health");
  private unsub: (() => void) | null = null;
  private state = new Map<string, Health>();
  private version = -1;
  private viewer: Viewer | null = null;

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
    this.ds = new CustomDataSource("road-health");
    this.state.clear();
    this.version = -1;
    this.viewer = null;
  }

  private positions(segId: string) {
    const seg = SEGMENTS.find((s) => s.id === segId)!;
    const c = NETWORK.find((n) => n.id === seg.corridor)!;
    const out: Cartesian3[] = [];
    const steps = Math.max(2, Math.ceil((seg.s1 - seg.s0) / 10));
    for (let k = 0; k <= steps; k++) {
      const p = pointAt(c.pl, seg.s0 + ((seg.s1 - seg.s0) * k) / steps);
      out.push(Cartesian3.fromDegrees(p.lon, p.lat, heightAt(p.lon, p.lat) + 0.9));
    }
    return out;
  }

  private bandMaterial(h: Health) {
    return new ColorMaterialProperty(COLORS[h].withAlpha(h === "healthy" ? 0.22 : 0.36));
  }

  private lineMaterial(h: Health) {
    return new PolylineGlowMaterialProperty({ glowPower: h === "healthy" ? 0.18 : 0.35, color: COLORS[h].withAlpha(0.9) });
  }

  private sync(s: AppState) {
    const snaps = snapIncidents(s.incidents);
    const rebuild = terrainVersion() !== this.version;
    this.version = terrainVersion();
    for (const seg of SEGMENTS) {
      const h = segmentHealth(seg, snaps);
      const e = this.ds.entities.getById(seg.id);
      if (!e) {
        const pos = this.positions(seg.id);
        this.ds.entities.add({
          id: seg.id,
          polyline: { positions: pos, width: 4, material: this.lineMaterial(h) },
          corridor: {
            positions: pos,
            width: ROAD_WIDTH_M,
            cornerType: CornerType.MITERED,
            material: this.bandMaterial(h),
            classificationType: ClassificationType.TERRAIN,
            zIndex: 2,
          },
        });
        this.state.set(seg.id, h);
        continue;
      }
      if (rebuild) {
        const pos = this.positions(seg.id);
        if (e.polyline) e.polyline.positions = pos as never;
        if (e.corridor) e.corridor.positions = pos as never;
      }
      if (this.state.get(seg.id) !== h) {
        if (e.polyline) e.polyline.material = this.lineMaterial(h) as never;
        if (e.corridor) e.corridor.material = this.bandMaterial(h) as never;
        this.state.set(seg.id, h);
      }
    }
  }
}

export const healthLayer = new HealthLayer();
