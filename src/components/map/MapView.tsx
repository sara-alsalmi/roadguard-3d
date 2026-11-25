import {
  BoundingSphere,
  Cartesian3,
  Entity,
  HeadingPitchRange,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Viewer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useEffect, useRef } from "react";
import { useApp } from "../../store/appStore";
import { selectDamage } from "../../twin/actions";
import { hazardLayer } from "../twin/hazardLayer";
import { cameraController } from "./cameraController";
import { incidentLayer } from "./incidentLayer";
import { createViewer } from "./viewerHost";

declare global {
  interface Window {
    /** Debug / test hook used by the Playwright suite. */
    __rg?: { viewer: Viewer; camera: typeof cameraController; store: typeof useApp };
  }
}

export function MapView() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = useApp.getState().set;
    let handle: ReturnType<typeof createViewer>;
    try {
      handle = createViewer(el);
    } catch (e) {
      console.error("[RoadGuard] Cesium could not start", e);
      set({
        mapStatus: "fallback",
        mapMessage: e instanceof Error ? e.message : "WebGL / Cesium failed to initialise",
      });
      return;
    }
    const { viewer } = handle;
    cameraController.attach(viewer);
    incidentLayer.attach(viewer);
    hazardLayer.attach(viewer);
    window.__rg = { viewer, camera: cameraController, store: useApp };

    // ------------------------------------------------------------ input
    const handler = new ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction((click: { position: { x: number; y: number } }) => {
      const picked = viewer.scene.pick(click.position as never);
      const id = picked?.id;
      if (Array.isArray(id)) {
        // cluster: fly in on the clustered markers
        const pts = (id as Entity[]).map((e) => e.position?.getValue(viewer.clock.currentTime)).filter(Boolean) as Cartesian3[];
        if (pts.length) {
          cameraController.release("free");
          viewer.camera.flyToBoundingSphere(BoundingSphere.fromPoints(pts), {
            offset: new HeadingPitchRange(CesiumMath.toRadians(335), CesiumMath.toRadians(-40), 420),
            duration: 1.6,
          });
        }
      } else if (id instanceof Entity) {
        if (id.id.startsWith("incident:")) selectDamage(id.id.slice("incident:".length), true);
        else if (id.id.startsWith("hazard:")) selectDamage(id.id.slice("hazard:".length), true);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    let lastMove = 0;
    handler.setInputAction((m: { endPosition: { x: number; y: number } }) => {
      const now = performance.now();
      if (now - lastMove < 80) return;
      lastMove = now;
      const p = viewer.scene.pick(m.endPosition as never);
      const id = p?.id;
      viewer.canvas.style.cursor = Array.isArray(id) || (id instanceof Entity && /^(incident|hazard):/.test(id.id)) ? "pointer" : "";
      const cur = useApp.getState().hover;
      if (id instanceof Entity && id.id.startsWith("incident:")) {
        const rect = viewer.canvas.getBoundingClientRect();
        useApp.setState({ hover: { id: id.id.slice("incident:".length), x: rect.left + m.endPosition.x, y: rect.top + m.endPosition.y } });
      } else if (cur) useApp.setState({ hover: null });
    }, ScreenSpaceEventType.MOUSE_MOVE);

    // ----------------------------------------------------------- startup
    let cancelled = false;
    void handle.ready.then(() => {
      if (cancelled) return;
      set({ mapStatus: "ready", mapMessage: "" });
      void cameraController.intro();
    });
    // Show the globe immediately behind the loading veil
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(8, 12, 2.4e7) });

    return () => {
      cancelled = true;
      handler.destroy();
      incidentLayer.detach();
      hazardLayer.detach();
      cameraController.detach();
      handle.destroy();
      if (window.__rg?.viewer === viewer) delete window.__rg;
    };
  }, []);

  return <div ref={ref} className="absolute inset-0 rg-cesium" data-testid="cesium-container" />;
}
