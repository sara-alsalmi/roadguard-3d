import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  CustomDataSource,
  Entity,
  NearFarScalar,
  PolylineGlowMaterialProperty,
  VerticalOrigin,
  type Viewer,
} from "cesium";
import { isVisible, useApp, type AppState } from "../../store/appStore";
import type { Incident } from "../../types";
import { clusterIcon, markerIcon } from "./markerIcons";
import { clockMs } from "../../utils/pulse";
import { heightAt, terrainVersion } from "./terrain";

/** Keeps Cesium entities in sync with the incident list in the store (one-way: store -> map). */
export class IncidentLayer {
  private ds = new CustomDataSource("incidents");
  private fx = new CustomDataSource("incident-fx");
  private viewer: Viewer | null = null;
  private unsub: (() => void) | null = null;
  private signature = new Map<string, string>();
  private known: Set<string> | null = null;

  attach(viewer: Viewer) {
    this.detach();
    this.viewer = viewer;
    const c = this.ds.clustering;
    c.enabled = useApp.getState().cluster;
    c.pixelRange = 26;
    c.minimumClusterSize = 3;
    c.clusterEvent.addEventListener((entities, cluster) => {
      cluster.label.show = false;
      cluster.point.show = false;
      cluster.billboard.show = true;
      cluster.billboard.id = cluster.label.id;
      cluster.billboard.verticalOrigin = VerticalOrigin.CENTER;
      cluster.billboard.image = clusterIcon(entities.length);
      cluster.billboard.scale = 0.7;
      cluster.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
    });
    viewer.dataSources.add(this.ds);
    viewer.dataSources.add(this.fx);
    this.sync(useApp.getState());
    this.unsub = useApp.subscribe((s) => this.sync(s));
  }

  detach() {
    this.unsub?.();
    this.unsub = null;
    if (this.viewer && !this.viewer.isDestroyed()) {
      this.viewer.dataSources.remove(this.ds, true);
      this.viewer.dataSources.remove(this.fx, true);
    }
    this.ds = new CustomDataSource("incidents");
    this.fx = new CustomDataSource("incident-fx");
    this.signature.clear();
    this.viewer = null;
  }

  private position(i: Incident) {
    return Cartesian3.fromDegrees(i.lon, i.lat, heightAt(i.lon, i.lat) + 0.4);
  }

  private sync(s: AppState) {
    this.ds.clustering.enabled = s.cluster;
    const live = new Set<string>();
    const firstSync = this.known === null;
    this.known ??= new Set();
    for (const inc of s.incidents) {
      if (!this.known.has(inc.id)) {
        this.known.add(inc.id);
        if (!firstSync) this.arrival(inc);
      }
      const key = `incident:${inc.id}`;
      live.add(key);
      const selected = s.selectedId === inc.id;
      const sig = `${inc.cls}|${inc.status}|${selected}|${inc.lon}|${inc.lat}|${terrainVersion()}`;
      let e = this.ds.entities.getById(key);
      if (!e) {
        e = this.ds.entities.add(
          new Entity({
            id: key,
            position: this.position(inc),
            billboard: {
              image: markerIcon(inc.cls, inc.status),
              scale: 0.92,
              verticalOrigin: VerticalOrigin.BOTTOM,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              scaleByDistance: new NearFarScalar(250, 1, 7000, 0.5),
            },
          }),
        );
      } else if (this.signature.get(key) !== sig) {
        e.position = this.position(inc) as never;
        if (e.billboard) {
          e.billboard.image = markerIcon(inc.cls, inc.status) as never;
          e.billboard.scale = (selected ? 1.2 : 0.92) as never;
        }
      }
      this.signature.set(key, sig);
      e.show = isVisible(inc, s.filters);
    }
    for (const e of [...this.ds.entities.values]) {
      if (!live.has(e.id)) {
        this.ds.entities.remove(e);
        this.signature.delete(e.id);
        this.known?.delete(e.id.slice("incident:".length));
      }
    }
    this.syncSelectionFx(s);
    this.syncDraft(s);
    this.syncZones(s);
  }

  private zoneKey = new Map<string, string>();
  /** Soft pulsing "danger zone" under every report that still needs attention (Predicted / New). */
  private syncZones(s: AppState) {
    const want = new Map<string, Incident>();
    for (const i of s.incidents) if ((i.status === "predicted" || i.status === "new") && isVisible(i, s.filters)) want.set(`zone:${i.id}`, i);
    for (const [id, key] of [...this.zoneKey]) {
      if (!want.has(id) || key !== `${want.get(id)!.status}|${terrainVersion()}`) {
        this.fx.entities.removeById(id);
        this.zoneKey.delete(id);
      }
    }
    for (const [id, i] of want) {
      if (this.zoneKey.has(id)) continue;
      const color = i.status === "new" ? "#ff453a" : "#ff9f0a";
      const phase = (id.length * 397) % 1000;
      this.fx.entities.add({
        id,
        position: this.position(i),
        ellipse: {
          semiMajorAxis: 22,
          semiMinorAxis: 22,
          material: new ColorMaterialProperty(new CallbackProperty(() => Color.fromCssColorString(color).withAlpha(0.16 + 0.1 * Math.sin(clockMs.t / (520 + phase * 0.2))), false) as never),
          outline: true,
          outlineColor: Color.fromCssColorString(color).withAlpha(0.8),
          outlineWidth: 2,
        },
      });
      this.zoneKey.set(id, `${i.status}|${terrainVersion()}`);
    }
  }

  private draftFor = "";
  /** Marker for the location of a report that is being drafted (event location or manual pick). */
  private syncDraft(s: AppState) {
    const d = s.detection?.draftLocation;
    const want = d ? `${d.lon}:${d.lat}:${d.source}:${terrainVersion()}` : "";
    if (want === this.draftFor) return;
    this.draftFor = want;
    this.fx.entities.removeById("draft:marker");
    if (!d) return;
    const amber = Color.fromCssColorString("#ff9f0a");
    this.fx.entities.add({
      id: "draft:marker",
      position: Cartesian3.fromDegrees(d.lon, d.lat, heightAt(d.lon, d.lat) + 0.5),
      point: { pixelSize: 11, color: amber, outlineColor: Color.fromCssColorString("#1c1c1e"), outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      ellipse: {
        semiMajorAxis: 6,
        semiMinorAxis: 6,
        material: amber.withAlpha(0.2),
        outline: true,
        outlineColor: amber,
      },
      label: {
        text: d.source === "manual" ? "REPORT LOCATION · MANUAL" : "AFFECTED LOCATION · SIMULATED",
        font: "600 12px 'IBM Plex Sans', sans-serif",
        fillColor: Color.fromCssColorString("#f5f5f7"),
        showBackground: true,
        backgroundColor: Color.fromCssColorString("#1c1c1e").withAlpha(0.85),
        pixelOffset: new Cartesian2(0, -22),
        verticalOrigin: VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  /** Expanding ring when a report arrives, so new detections are impossible to miss. */
  private arrival(inc: Incident) {
    const t0 = clockMs.t || performance.now();
    const k = () => Math.min(1, Math.max(0, (clockMs.t - t0) / 3200)); // shared per-frame clock keeps both axes equal
    const radius = () => 6 + k() * 46;
    const e = this.fx.entities.add({
      id: `arrival:${inc.id}`,
      position: this.position(inc),
      ellipse: {
        semiMajorAxis: new CallbackProperty(radius, false) as never,
        semiMinorAxis: new CallbackProperty(radius, false) as never,
        material: new ColorMaterialProperty(new CallbackProperty(() => Color.fromCssColorString("#ff9f0a").withAlpha(0.45 * (1 - k())), false) as never),
        outline: false,
      },
    });
    setTimeout(() => this.fx.entities.remove(e), 3400);
  }

  private fxFor = "";
  private syncSelectionFx(s: AppState) {
    const sel = s.incidents.find((i) => i.id === s.selectedId);
    const want = sel ? `${sel.id}:${sel.lon}:${sel.lat}:${terrainVersion()}` : "";
    if (want === this.fxFor) return;
    this.fxFor = want;
    this.fx.entities.removeById("selection:ring");
    this.fx.entities.removeById("selection:beam");
    if (!sel) return;
    const base = this.position(sel);
    const top = Cartesian3.fromDegrees(sel.lon, sel.lat, heightAt(sel.lon, sel.lat) + 70);
    this.fx.entities.add({
      id: "selection:ring",
      position: base,
      ellipse: {
        semiMajorAxis: 9,
        semiMinorAxis: 9,
        material: Color.fromCssColorString("#0a84ff").withAlpha(0.16),
        outline: true,
        outlineColor: Color.fromCssColorString("#0a84ff"),
        outlineWidth: 2,
      },
    });
    this.fx.entities.add({
      id: "selection:beam",
      polyline: {
        positions: [base, top],
        width: 5,
        material: new PolylineGlowMaterialProperty({ glowPower: 0.3, color: Color.fromCssColorString("#64d2ff").withAlpha(0.8) }),
      },
    });
  }
}

export const incidentLayer = new IncidentLayer();
