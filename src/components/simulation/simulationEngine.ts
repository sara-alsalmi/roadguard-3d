import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  CustomDataSource,
  DistanceDisplayCondition,
  Entity,
  HeadingPitchRoll,
  HorizontalOrigin,
  LabelStyle,
  Math as CesiumMath,
  PolylineGlowMaterialProperty,
  Quaternion,
  Transforms,
  VerticalOrigin,
  type Viewer,
} from "cesium";
import {
  INSPECTION_EVENTS,
  MAINTENANCE_SPEED_MPS,
  MAINTENANCE_WORK_SECONDS,
} from "../../data/route";
import { routePolyline, useApp } from "../../store/appStore";
import type { Incident, InspectionEventDef } from "../../types";
import {
  buildPolyline,
  pointAt,
  slicePath,
  smoothBearing,
  type LonLat,
  type Polyline,
} from "../../utils/geo";
import {
  newDispatchSim,
  newInspectionSim,
  stepDispatch,
  stepInspection,
  type DispatchSim,
  type InspectionSim,
} from "../../utils/simModel";
import type { Anchor } from "../map/cameraController";
import { heightAt, routeHeightAt } from "../map/terrain";
import { asset } from "../../utils/asset";
import { labelBillboard } from "../map/labelImage";
import { NETWORK, corridorLocation, nearestCorridor } from "../../utils/network";
import { clockMs } from "../../utils/pulse";

/** The bundled truck model faces +X; Cesium heading 0 = east, compass 0 = north. */
const MODEL_HEADING_OFFSET = 90;
const DENSE_STEP = 8;

interface Rendered {
  pos: Cartesian3;
  quat: Quaternion;
  bearing: number;
}
const rendered = (): Rendered => ({ pos: new Cartesian3(), quat: new Quaternion(), bearing: 0 });

interface DispatchRuntime {
  incidentId: string;
  sim: DispatchSim;
  path: Polyline;
  cur: Rendered;
  shown: Rendered; // what the model actually drew last frame (camera reads this)
  entities: Entity[];
  lastStoreMs: number;
  /** whole route, and the part still to drive (the route line shrinks as the team advances) */
  dense: Cartesian3[];
  remaining: Cartesian3[];
}

function densify(pl: Polyline, heightFn: (lon: number, lat: number, s: number) => number, lift = 0.5): Cartesian3[] {
  const out: Cartesian3[] = [];
  const n = Math.max(1, Math.ceil(pl.total / DENSE_STEP));
  for (let i = 0; i <= n; i++) {
    const p = pointAt(pl, (i / n) * pl.total);
    out.push(Cartesian3.fromDegrees(p.lon, p.lat, heightFn(p.lon, p.lat, p.s) + lift));
  }
  return out;
}

const labelOf = (text: string, color = "#f5f5f7") => ({
  text,
  font: "600 12px 'IBM Plex Sans', sans-serif",
  fillColor: Color.fromCssColorString(color),
  style: LabelStyle.FILL,
  showBackground: true,
  backgroundColor: Color.fromCssColorString("#1c1c1e").withAlpha(0.8),
  backgroundPadding: new Cartesian2(8, 5),
  pixelOffset: new Cartesian2(0, -78),
  verticalOrigin: VerticalOrigin.BOTTOM,
  horizontalOrigin: HorizontalOrigin.CENTER,
  distanceDisplayCondition: new DistanceDisplayCondition(0, 2600),
  disableDepthTestDistance: Number.POSITIVE_INFINITY,
});

/**
 * Deterministic simulation runtime. One tick listener drives every vehicle;
 * all movement is derived from pure functions in utils/simModel.ts so a given
 * sequence of (dt, speed) always produces the same result.
 */
export class SimulationEngine {
  private viewer: Viewer | null = null;
  private ds = new CustomDataSource("simulation");
  private insp: { sim: InspectionSim; cur: Rendered; shown: Rendered } = {
    sim: newInspectionSim(routePolyline.total),
    cur: rendered(),
    shown: rendered(),
  };
  private dispatches = new Map<string, DispatchRuntime>();
  private dense: Cartesian3[] = [];
  private progressPositions: Cartesian3[] = [];
  private running = false;
  private frozen = false;
  private lastMs = 0;
  private lastStoreMs = 0;
  private off: (() => void) | null = null;
  /** Called when the vehicle reaches a scripted inspection event. */
  onEvent: ((e: InspectionEventDef) => void) | null = null;
  fixedDt: number | null = null; // test hook: deterministic stepping

  attach(viewer: Viewer) {
    this.detach();
    this.viewer = viewer;
    viewer.dataSources.add(this.ds);
    this.dense = densify(routePolyline, (_lon, _lat, s) => routeHeightAt(s));
    this.buildStaticEntities();
    for (const id of ["route:base", "route:progress", "vehicle:inspection", "vehicle:inspection-scan"]) {
      const ent = this.ds.entities.getById(id);
      if (ent) ent.show = false;
    }
    this.poseInspection(0);
    this.lastMs = performance.now();
    const cb = () => this.onTick();
    viewer.clock.onTick.addEventListener(cb);
    this.off = () => viewer.clock.onTick.removeEventListener(cb);
  }

  detach() {
    this.off?.();
    this.off = null;
    if (this.viewer && !this.viewer.isDestroyed()) this.viewer.dataSources.remove(this.ds, true);
    this.ds = new CustomDataSource("simulation");
    this.dispatches.clear();
    this.viewer = null;
  }

  /** Rebuild route geometry after terrain heights arrive. */
  refreshHeights() {
    if (!this.viewer) return;
    this.dense = densify(routePolyline, (_lon, _lat, s) => routeHeightAt(s));
    const base = this.ds.entities.getById("route:base");
    if (base?.polyline) base.polyline.positions = new CallbackProperty(() => this.dense, true) as never;
    this.poseInspection(this.insp.sim.s);
    for (const c of NETWORK) {
      const depot = this.ds.entities.getById(`depot:${c.id}`);
      if (!depot) continue;
      const [dlon, dlat] = corridorLocation(c.id, 0, c.depotLateral);
      depot.position = Cartesian3.fromDegrees(dlon, dlat, heightAt(dlon, dlat) + 0.5) as never;
    }
  }

  // ---------------------------------------------------------------- entities
  private buildStaticEntities() {
    const e = this.ds.entities;
    e.add({
      id: "route:base",
      polyline: {
        positions: new CallbackProperty(() => this.dense, true) as never,
        width: 9,
        material: new PolylineGlowMaterialProperty({ glowPower: 0.22, color: Color.fromCssColorString("#34d399").withAlpha(0.5) }),
        depthFailMaterial: Color.fromCssColorString("#34d399").withAlpha(0.25),
      },
    });
    e.add({
      id: "route:progress",
      polyline: {
        positions: new CallbackProperty(() => this.progressPositions, false) as never,
        width: 9,
        material: new PolylineGlowMaterialProperty({ glowPower: 0.35, color: Color.fromCssColorString("#6ee7b7") }),
        depthFailMaterial: Color.fromCssColorString("#6ee7b7").withAlpha(0.5),
      },
    });

    for (const c of NETWORK) {
      const [dlon, dlat] = corridorLocation(c.id, 0, c.depotLateral);
      e.add({
        id: `depot:${c.id}`,
        position: Cartesian3.fromDegrees(dlon, dlat, heightAt(dlon, dlat) + 0.5),
        point: {
          pixelSize: 10,
          color: Color.fromCssColorString("#0a84ff"),
          outlineColor: Color.fromCssColorString("#1c1c1e"),
          outlineWidth: 3,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        billboard: labelBillboard("Depot · demo", { offsetY: -16, maxDistance: 4200 }),
      });
    }

    e.add({
      id: "vehicle:inspection",
      position: new CallbackProperty((_t, r) => {
        Cartesian3.clone(this.insp.cur.pos, this.insp.shown.pos);
        this.insp.shown.bearing = this.insp.cur.bearing;
        return Cartesian3.clone(this.insp.cur.pos, r as Cartesian3);
      }, false) as never,
      orientation: new CallbackProperty((_t, r) => Quaternion.clone(this.insp.cur.quat, r as Quaternion), false) as never,
      model: {
        uri: asset("models/inspection.glb"),
        minimumPixelSize: 44,
        maximumScale: 1200,
        scale: 1.2,
      },
      label: labelOf("INSPECTION UNIT 01"),
    });
    e.add({
      id: "vehicle:inspection-scan",
      position: new CallbackProperty((_t, r) => Cartesian3.clone(this.insp.cur.pos, r as Cartesian3), false) as never,
      ellipse: {
        semiMajorAxis: 4.6,
        semiMinorAxis: 4.6,
        material: Color.fromCssColorString("#34d399").withAlpha(0.09),
        outline: true,
        outlineColor: Color.fromCssColorString("#34d399").withAlpha(0.55),
        height: 0,
      },
    });
  }

  private pose(r: Rendered, lon: number, lat: number, h: number, bearing: number) {
    Cartesian3.fromDegrees(lon, lat, h, undefined, r.pos);
    r.bearing = bearing;
    Transforms.headingPitchRollQuaternion(
      r.pos,
      new HeadingPitchRoll(CesiumMath.toRadians(bearing - 90 + MODEL_HEADING_OFFSET), 0, 0),
      undefined,
      undefined,
      r.quat,
    );
  }

  private poseInspection(s: number) {
    const p = pointAt(routePolyline, s);
    this.pose(this.insp.cur, p.lon, p.lat, routeHeightAt(s), smoothBearing(routePolyline, s));
    Cartesian3.clone(this.insp.cur.pos, this.insp.shown.pos);
    this.insp.shown.bearing = this.insp.cur.bearing;
    const k = Math.min(this.dense.length - 1, Math.floor(s / DENSE_STEP));
    this.progressPositions = this.dense.slice(0, k + 1).concat([Cartesian3.clone(this.insp.cur.pos)]);
    if (this.progressPositions.length < 2) this.progressPositions.push(Cartesian3.clone(this.insp.cur.pos));
  }

  // -------------------------------------------------------------------- tick
  private onTick() {
    const now = performance.now();
    clockMs.t = now;
    const real = Math.min(0.25, Math.max(0, (now - this.lastMs) / 1000));
    this.lastMs = now;
    const dt = this.fixedDt ?? real;
    if (this.frozen || dt === 0) return;
    const store = useApp.getState();
    const speed = store.sim.speed;

    if (this.running) {
      const r = stepInspection(this.insp.sim, dt, speed);
      this.insp.sim = r.sim;
      this.poseInspection(r.sim.s);
      if (r.event) {
        this.running = false;
        store.patchSim({ status: "event", s: r.sim.s, progress: r.sim.s / r.sim.total, fired: r.sim.fired });
        store.set({ pendingEvent: r.event });
        store.addLog(`Inspection event: ${r.event.title}`, "warn");
        this.onEvent?.(r.event);
      } else if (r.finished) {
        this.running = false;
        store.patchSim({ status: "finished", s: r.sim.s, progress: 1 });
        store.addLog("Inspection route complete", "ok");
      } else if (now - this.lastStoreMs > 90) {
        this.lastStoreMs = now;
        store.patchSim({ s: r.sim.s, progress: r.sim.s / r.sim.total });
      }
    }

    for (const d of this.dispatches.values()) this.tickDispatch(d, dt, speed);
  }

  private tickDispatch(d: DispatchRuntime, dt: number, speed: number) {
    if (d.sim.phase === "done") return;
    const prev = d.sim.phase;
    d.sim = stepDispatch(d.sim, dt, speed, MAINTENANCE_SPEED_MPS, MAINTENANCE_WORK_SECONDS);
    const p = pointAt(d.path, d.sim.s);
    this.pose(d.cur, p.lon, p.lat, heightAt(p.lon, p.lat), smoothBearing(d.path, d.sim.s, 6));
    const k = Math.min(d.dense.length - 1, Math.floor((d.sim.s / d.path.total) * (d.dense.length - 1)) + 1);
    d.remaining = [Cartesian3.clone(d.cur.pos), ...d.dense.slice(k)];
    if (d.remaining.length < 2) d.remaining.push(Cartesian3.clone(d.cur.pos));
    const store = useApp.getState();
    const nowMs = performance.now();
    if (prev !== d.sim.phase || nowMs - d.lastStoreMs > 120) {
      d.lastStoreMs = nowMs;
      store.set({
        dispatches: {
          ...store.dispatches,
          [d.incidentId]: { incidentId: d.incidentId, phase: d.sim.phase, progress: d.sim.s / d.sim.total },
        },
      });
    }
    if (prev !== d.sim.phase) {
      if (d.sim.phase === "working")
        store.addLog(`${d.incidentId}: maintenance unit arrived · simulated maintenance activity`, "info");
      if (d.sim.phase === "done")
        store.addLog(`${d.incidentId}: simulated activity complete · awaiting review (no physical repair occurred)`, "ok");
    }
  }

  // --------------------------------------------------------------- controls
  start() {
    if (this.insp.sim.s >= this.insp.sim.total) return;
    this.running = true;
    useApp.getState().patchSim({ status: "running" });
  }
  pause() {
    this.running = false;
    useApp.getState().patchSim({ status: "paused" });
  }
  resume() {
    this.start();
  }
  /** Continue after an inspection event has been handled. */
  resumeAfterEvent() {
    useApp.getState().set({ pendingEvent: null });
    this.start();
  }
  freeze(b: boolean) {
    this.frozen = b;
    this.lastMs = performance.now();
  }
  get isRunning() {
    return this.running;
  }
  get eventsDone() {
    return this.insp.sim.fired.length === INSPECTION_EVENTS.length;
  }

  reset() {
    this.running = false;
    this.frozen = false;
    this.insp.sim = newInspectionSim(routePolyline.total);
    this.poseInspection(0);
    for (const id of [...this.dispatches.keys()]) this.removeDispatch(id);
  }

  // --------------------------------------------------------------- dispatch
  dispatch(incident: Incident): boolean {
    if (!this.viewer || this.dispatches.has(incident.id)) return false;
    const snap = nearestCorridor(incident.lon, incident.lat);
    const depotLL = corridorLocation(snap.corridor.id, 0, snap.corridor.depotLateral);
    // the team stops on the road (at most ~4 m towards the report), never driving between buildings
    const onRoad = pointAt(snap.corridor.pl, snap.s);
    const frac = snap.off > 4 ? 4 / snap.off : 1;
    const stop: LonLat = [onRoad.lon + (incident.lon - onRoad.lon) * frac, onRoad.lat + (incident.lat - onRoad.lat) * frac];
    const pts: LonLat[] = [depotLL, ...slicePath(snap.corridor.pl, 0, snap.s), stop];
    const path = buildPolyline(pts.map(([lon, lat]) => [lat, lon]));
    const cur = rendered();
    const shown = rendered();
    const dense = densify(path, (lon, lat) => heightAt(lon, lat), 0.7);
    const id = incident.id;
    const sitePos = Cartesian3.fromDegrees(incident.lon, incident.lat, heightAt(incident.lon, incident.lat) + 0.3);
    const rt: DispatchRuntime = { incidentId: id, sim: newDispatchSim(path.total), path, cur, shown, entities: [], lastStoreMs: 0, dense, remaining: dense };
    this.pose(cur, pts[0][0], pts[0][1], heightAt(pts[0][0], pts[0][1]), smoothBearing(path, 0, 6));
    Cartesian3.clone(cur.pos, shown.pos);

    const vehicle = this.ds.entities.add({
      id: `maint:${id}`,
      position: new CallbackProperty((_t, r) => {
        Cartesian3.clone(rt.cur.pos, rt.shown.pos);
        rt.shown.bearing = rt.cur.bearing;
        return Cartesian3.clone(rt.cur.pos, r as Cartesian3);
      }, false) as never,
      orientation: new CallbackProperty((_t, r) => Quaternion.clone(rt.cur.quat, r as Quaternion), false) as never,
      model: {
        uri: asset("models/maintenance.glb"),
        minimumPixelSize: 44,
        maximumScale: 1200,
        scale: 1.2,
      },
      billboard: labelBillboard(`Team · ${id}`, { sub: "Maintenance unit", offsetY: -52, maxDistance: 1800 }),
    });
    const route = this.ds.entities.add({
      id: `maint-route:${id}`,
      polyline: {
        positions: new CallbackProperty(() => rt.remaining, false) as never,
        width: 6,
        material: new PolylineGlowMaterialProperty({ glowPower: 0.3, color: Color.fromCssColorString("#3d9bff") }),
        depthFailMaterial: Color.fromCssColorString("#0a84ff").withAlpha(0.35),
      },
    });
    const site = this.ds.entities.add({
      id: `maint-site:${id}`,
      position: sitePos,
      show: new CallbackProperty(() => rt.sim.phase !== "enroute", false) as never,
      ellipse: {
        semiMajorAxis: 7,
        semiMinorAxis: 7,
        material: Color.fromCssColorString("#f5a524").withAlpha(0.28),
        outline: true,
        outlineColor: Color.fromCssColorString("#f5a524"),
        height: 0,
      },
      billboard: labelBillboard("Work in progress", { sub: "Simulated, no real repair", offsetY: 26, below: true, maxDistance: 1400 }),
    });
    rt.entities = [vehicle, route, site];
    this.dispatches.set(id, rt);
    useApp.getState().set({
      dispatches: { ...useApp.getState().dispatches, [id]: { incidentId: id, phase: "enroute", progress: 0 } },
    });
    return true;
  }

  removeDispatch(id: string) {
    const d = this.dispatches.get(id);
    if (!d) return;
    for (const e of d.entities) this.ds.entities.remove(e);
    this.dispatches.delete(id);
    const { [id]: _gone, ...rest } = useApp.getState().dispatches;
    void _gone;
    useApp.getState().set({ dispatches: rest });
  }

  // ----------------------------------------------------------------- anchors
  getAnchor(target: "inspection" | string): Anchor | null {
    if (target === "inspection") return { pos: this.insp.shown.pos, bearing: this.insp.shown.bearing };
    const d = this.dispatches.get(target);
    return d ? { pos: d.shown.pos, bearing: d.shown.bearing } : null;
  }
  inspectionPosition(): Cartesian3 {
    return this.insp.cur.pos;
  }
}

export const engine = new SimulationEngine();
