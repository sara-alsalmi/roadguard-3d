import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
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
import { handleInspectionEvent, selectIncident, setCamMode } from "../simulation/actions";
import { engine } from "../simulation/simulationEngine";
import { cameraController } from "./cameraController";
import { incidentLayer } from "./incidentLayer";
import { createViewer } from "./viewerHost";

declare global {
  interface Window {
    /** Debug / test hook used by the Playwright suite. */
    __rg?: { viewer: Viewer; engine: typeof engine; camera: typeof cameraController; store: typeof useApp };
  }
}

export function MapView() {
  const ref = useRef<HTMLDivElement>(null);
  const picking = useApp((s) => s.pickingLocation);

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
    engine.attach(viewer);
    engine.onEvent = handleInspectionEvent;
    incidentLayer.attach(viewer);
    window.__rg = { viewer, engine, camera: cameraController, store: useApp };

    // ------------------------------------------------------------ input
    const handler = new ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction((click: { position: { x: number; y: number } }) => {
      const st = useApp.getState();
      if (st.pickingLocation) {
        const ray = viewer.camera.getPickRay(click.position as never);
        const cart = (ray && viewer.scene.globe.pick(ray, viewer.scene)) || viewer.camera.pickEllipsoid(click.position as never);
        if (cart) {
          const c = Cartographic.fromCartesian(cart);
          st.patchDetection({
            draftLocation: { lon: CesiumMath.toDegrees(c.longitude), lat: CesiumMath.toDegrees(c.latitude), source: "manual" },
          });
          st.set({ pickingLocation: false });
          st.addLog("Report location selected manually on the map", "info");
        }
        return;
      }
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
        if (id.id.startsWith("incident:")) selectIncident(id.id.slice("incident:".length), true);
        else if (id.id === "vehicle:inspection") {
          useApp.getState().set({ followTarget: "inspection" });
          setCamMode("follow");
        } else if (id.id.startsWith("maint:")) {
          useApp.getState().set({ followTarget: id.id.slice("maint:".length) });
          setCamMode("follow");
        }
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    let lastMove = 0;
    handler.setInputAction((m: { endPosition: { x: number; y: number } }) => {
      const now = performance.now();
      if (now - lastMove < 80) return;
      lastMove = now;
      if (useApp.getState().pickingLocation) {
        viewer.canvas.style.cursor = "crosshair";
        return;
      }
      const p = viewer.scene.pick(m.endPosition as never);
      const id = p?.id;
      viewer.canvas.style.cursor = Array.isArray(id) || (id instanceof Entity && /^(incident|vehicle|maint):/.test(id.id)) ? "pointer" : "";
      const cur = useApp.getState().hover;
      if (id instanceof Entity && id.id.startsWith("incident:")) {
        const rect = viewer.canvas.getBoundingClientRect();
        useApp.setState({ hover: { id: id.id.slice("incident:".length), x: rect.left + m.endPosition.x, y: rect.top + m.endPosition.y } });
      } else if (cur) useApp.setState({ hover: null });
    }, ScreenSpaceEventType.MOUSE_MOVE);

    // ----------------------------------------------------------- startup
    let cancelled = false;
    void handle.ready.then(({ terrainSampled }) => {
      if (cancelled) return;
      if (terrainSampled) engine.refreshHeights();
      set({ mapStatus: "ready", mapMessage: "" });
      void cameraController.intro();
    });
    // Show the globe immediately behind the loading veil
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(8, 12, 2.4e7) });

    return () => {
      cancelled = true;
      handler.destroy();
      engine.onEvent = null;
      incidentLayer.detach();
      engine.detach();
      cameraController.detach();
      handle.destroy();
      if (window.__rg?.viewer === viewer) delete window.__rg;
    };
  }, []);

  useEffect(() => {
    const c = ref.current?.querySelector("canvas");
    if (c) c.style.cursor = picking ? "crosshair" : "";
  }, [picking]);

  return <div ref={ref} className="absolute inset-0 rg-cesium" data-testid="cesium-container" />;
}
