import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  EasingFunction,
  Ellipsoid,
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
  Transforms,
  type Viewer,
} from "cesium";
import { ROUTE_LATLON } from "../../data/route";
import { useApp } from "../../store/appStore";
import type { CameraMode } from "../../types";
import { angleDiff, bearingDeg, buildPolyline, pointAt } from "../../utils/geo";
import { NETWORK } from "../../utils/network";
import { routeHeightAt } from "./terrain";

export interface Anchor {
  pos: Cartesian3;
  /** compass bearing of travel, degrees */
  bearing: number;
}
type AnchorFn = () => Anchor | null;
type VehicleMode = Exclude<CameraMode, "free" | "overview">;

const pl = buildPolyline(ROUTE_LATLON);
const mids = NETWORK.map((n) => pointAt(n.pl, n.pl.total / 2));
/** centre of all demo corridors */
const mid = { lon: mids.reduce((a, m) => a + m.lon, 0) / mids.length, lat: mids.reduce((a, m) => a + m.lat, 0) / mids.length };
export const ROUTE_HEADING = bearingDeg(pl.pts[0], pl.pts[pl.pts.length - 1]);

/** Camera presets relative to a moving vehicle. Angles in degrees. */
const PRESETS: Record<VehicleMode, { heading: (b: number, t: number) => number; pitch: number; range: number; lift: number }> = {
  follow: { heading: (b, t) => b + 28 + 8 * Math.sin(t / 5), pitch: -17, range: 52, lift: 1.6 },
  street: { heading: (b) => b, pitch: -5, range: 20, lift: 2.4 },
  aerial: { heading: (b) => b, pitch: -52, range: 240, lift: 0 },
};

const setBusy = (cameraBusy: boolean) => useApp.getState().set({ cameraBusy });

/**
 * Single owner of the Cesium camera. Every cinematic move goes through here so
 * flights, follow-cameras and user input can never fight each other:
 *  - starting any move first cancels the previous flight / follow lock
 *  - follow modes drive camera.lookAt() from one preRender listener
 */
export class CameraController {
  private viewer: Viewer | null = null;
  private mode: CameraMode = "free";
  private anchorFn: AnchorFn | null = null;
  private heading = 0;
  private pitch = -17;
  private range = 52;
  private rangeScale = 1;
  private following = false;
  private flightToken = 0;
  private lastMs = 0;
  private offPreRender: (() => void) | null = null;
  private onWheel = (e: WheelEvent) => {
    if (!this.following) return;
    e.preventDefault();
    this.rangeScale = Math.min(4, Math.max(0.35, this.rangeScale * Math.exp(e.deltaY * 0.0012)));
  };

  attach(viewer: Viewer) {
    this.detach();
    this.viewer = viewer;
    this.offPreRender = viewer.scene.preRender.addEventListener(() => this.tick());
    viewer.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  detach() {
    this.offPreRender?.();
    this.offPreRender = null;
    this.viewer?.canvas.removeEventListener("wheel", this.onWheel);
    this.viewer = null;
    this.following = false;
  }

  get viewerRef() {
    return this.viewer;
  }

  /** Smoothly dolly along the view direction (zoom buttons). factor<1 zooms in. */
  dolly(factor: number) {
    const v = this.viewer;
    if (!v) return;
    this.release("free");
    const h = Math.max(v.camera.positionCartographic.height, 30);
    const amount = h * (1 - factor);
    const dest = Cartesian3.add(v.camera.positionWC, Cartesian3.multiplyByScalar(v.camera.directionWC, amount, new Cartesian3()), new Cartesian3());
    v.camera.flyTo({ destination: dest, orientation: { heading: v.camera.heading, pitch: v.camera.pitch, roll: 0 }, duration: 0.6, easingFunction: EasingFunction.QUADRATIC_OUT });
  }

  /** Re-orient around whatever is at screen centre (compass / tilt buttons). */
  reorient(o: { heading?: number; pitch?: number }) {
    const v = this.viewer;
    if (!v) return;
    this.release("free");
    const cam = v.camera;
    const centre = new Cartesian2(v.canvas.clientWidth / 2, v.canvas.clientHeight / 2);
    const ray = cam.getPickRay(centre);
    const target = (ray && v.scene.globe.pick(ray, v.scene)) || cam.pickEllipsoid(centre);
    if (!target) return;
    const range = Cartesian3.distance(cam.positionWC, target);
    cam.flyToBoundingSphere(new BoundingSphere(target, 1), {
      offset: new HeadingPitchRange(o.heading ?? cam.heading, o.pitch ?? cam.pitch, range),
      duration: 0.9,
      easingFunction: EasingFunction.CUBIC_IN_OUT,
    });
  }

  get currentMode() {
    return this.mode;
  }

  /** Stop any flight and release any follow lock; the user regains free control. */
  release(mode: CameraMode = "free") {
    const v = this.viewer;
    if (!v) return;
    this.flightToken++;
    v.camera.cancelFlight();
    if (this.following) v.camera.lookAtTransform(Matrix4.IDENTITY);
    this.following = false;
    this.lockInputs(false);
    this.mode = mode;
    setBusy(false);
    useApp.getState().patchSim({ camMode: mode });
  }

  private lockInputs(lock: boolean) {
    const c = this.viewer?.scene.screenSpaceCameraController;
    if (!c) return;
    c.enableRotate = c.enableTranslate = c.enableTilt = c.enableLook = c.enableZoom = !lock;
  }

  /** Cinematic flight to a point with a heading/pitch/range offset. */
  flyToPoint(
    pos: Cartesian3,
    opts: { heading: number; pitch: number; range: number; duration?: number },
    mode: CameraMode = "free",
  ): Promise<void> {
    const v = this.viewer;
    if (!v) return Promise.resolve();
    this.release(mode);
    const token = this.flightToken;
    setBusy(true);
    return new Promise((resolve) => {
      v.camera.flyToBoundingSphere(new BoundingSphere(pos, 1), {
        offset: new HeadingPitchRange(
          CesiumMath.toRadians(opts.heading),
          CesiumMath.toRadians(opts.pitch),
          opts.range,
        ),
        duration: opts.duration ?? 2.4,
        easingFunction: EasingFunction.CUBIC_IN_OUT,
        complete: () => {
          if (token === this.flightToken) setBusy(false);
          resolve();
        },
        cancel: () => resolve(),
      });
    });
  }

  flyToOverview(duration = 2.8): Promise<void> {
    const h = routeHeightAt(pl.total / 2);
    const pos = Cartesian3.fromDegrees(mid.lon, mid.lat, h);
    return this.flyToPoint(pos, { heading: ROUTE_HEADING, pitch: -36, range: 3300, duration }, "overview");
  }

  /** Globe -> Saudi Arabia -> the Riyadh corridor. */
  async intro(): Promise<void> {
    const v = this.viewer;
    if (!v) return;
    this.release();
    const token = this.flightToken;
    v.camera.setView({ destination: Cartesian3.fromDegrees(8, 12, 2.4e7) });
    setBusy(true);
    await new Promise<void>((resolve) =>
      v.camera.flyTo({
        destination: Cartesian3.fromDegrees(44.5, 22.5, 5.0e6),
        orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
        duration: 3.4,
        easingFunction: EasingFunction.CUBIC_IN_OUT,
        complete: resolve,
        cancel: resolve,
      }),
    );
    if (token !== this.flightToken) return;
    await this.flyToOverview(4.8);
  }

  /** Lock the camera to a moving anchor using one of the vehicle presets. */
  async setVehicleMode(mode: VehicleMode, anchorFn: AnchorFn): Promise<void> {
    const v = this.viewer;
    if (!v) return;
    const a = anchorFn();
    if (!a) return;
    const wasFollowing = this.following;
    const dist = Cartesian3.distance(v.camera.positionWC, a.pos);
    this.anchorFn = anchorFn;
    this.mode = mode;
    useApp.getState().patchSim({ camMode: mode });
    if (!wasFollowing && dist > 1200) {
      const p = PRESETS[mode];
      await this.flyToPoint(a.pos, { heading: p.heading(a.bearing, 0), pitch: p.pitch, range: p.range, duration: 2.6 }, mode);
      if (this.mode !== mode || this.anchorFn !== anchorFn) return; // superseded while flying
    }
    this.engage(mode);
  }

  /** Switch to a follow lock, seeding heading/pitch/range from where the camera really is. */
  private engage(mode: CameraMode) {
    const v = this.viewer;
    const a = this.anchorFn?.();
    if (!v || !a) return;
    if (!this.following) {
      v.camera.cancelFlight();
      const inv = Matrix4.inverseTransformation(Transforms.eastNorthUpToFixedFrame(a.pos), new Matrix4());
      const local = Matrix4.multiplyByPoint(inv, v.camera.positionWC, new Cartesian3());
      const r = Cartesian3.magnitude(local) || 50;
      this.heading = CesiumMath.toDegrees(Math.atan2(-local.x, -local.y));
      this.pitch = -CesiumMath.toDegrees(Math.asin(CesiumMath.clamp(local.z / r, -1, 1)));
      this.range = r;
      this.following = true;
      this.lockInputs(true);
    }
    this.mode = mode;
    setBusy(false);
    useApp.getState().patchSim({ camMode: mode });
  }

  private tick() {
    const v = this.viewer;
    if (!v || !this.following || !this.anchorFn) return;
    const a = this.anchorFn();
    if (!a) return;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (now - (this.lastMs || now)) / 1000));
    this.lastMs = now;
    const mode = this.mode;
    if (mode === "free" || mode === "overview") return;
    const p = PRESETS[mode];
    const k = 1 - Math.exp(-dt * 2.8);
    const th = p.heading(a.bearing, now / 1000);
    this.heading += angleDiff(this.heading, th) * k;
    this.pitch += (p.pitch - this.pitch) * k;
    this.range += (p.range - this.range) * k;
    const normal = Ellipsoid.WGS84.geodeticSurfaceNormal(a.pos, new Cartesian3());
    const target = Cartesian3.add(a.pos, Cartesian3.multiplyByScalar(normal, p.lift, new Cartesian3()), new Cartesian3());
    v.camera.lookAt(
      target,
      new HeadingPitchRange(
        CesiumMath.toRadians(this.heading),
        CesiumMath.toRadians(this.pitch),
        this.range * this.rangeScale,
      ),
    );
  }
}

export const cameraController = new CameraController();
