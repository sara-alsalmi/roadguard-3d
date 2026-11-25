import {
  Cesium3DTileset,
  Color,
  createGooglePhotorealistic3DTileset,
  Cesium3DTileStyle,
  createOsmBuildingsAsync,
  GoogleMaps,
  ImageryLayer,
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  Rectangle,
  IonGeocodeProviderType,
  IonImageryProvider,
  Ion,
  JulianDate,
  ScreenSpaceEventType,
  Terrain,
  UrlTemplateImageryProvider,
  Viewer,
  type Primitive,
} from "cesium";
import { CONFIG } from "../../data/config";
import { useApp } from "../../store/appStore";
import { buildCorridorClipping } from "./clipping";
import { bindTerrainViewer, sampleRouteHeights } from "./terrain";
import { createFootprintBuildings, type FootprintBuilding } from "./buildings";

export interface ViewerHandle {
  viewer: Viewer;
  /** resolves once optional layers (imagery / terrain / buildings) have settled */
  ready: Promise<{ terrainSampled: boolean }>;
  destroy: () => void;
}

const patchInfo = (p: Partial<{ terrain: string; imagery: string; buildings: string }>) =>
  useApp.setState((s) => ({ mapInfo: { ...s.mapInfo, ...p } }));

/** `?lowperf` renders at reduced resolution without MSAA (software GL / automated tests). */
const LOW = typeof location !== "undefined" && new URLSearchParams(location.search).has("lowperf");
/** `?hq` keeps the old high-quality settings (4x MSAA, up to 1.5x resolution) for strong GPUs / recordings. */
const HQ = typeof location !== "undefined" && new URLSearchParams(location.search).has("hq");

/** true when the Cesium ion API answers within `ms` (any HTTP answer counts; only a timeout or network error fails). */
async function ionReachable(token: string, ms = 6000): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    await fetch(`https://api.cesium.com/v1/assets/1/endpoint?access_token=${encodeURIComponent(token)}`, { signal: ctl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * The map only covers Riyadh: imagery is requested only inside this box and the camera cannot leave it.
 * Keeps the demo focused and light (no world tiles, no flying around the globe).
 */
export const RIYADH = { west: 46.45, south: 24.45, east: 47.0, north: 25.0 };
const RIYADH_RECT = Rectangle.fromDegrees(RIYADH.west, RIYADH.south, RIYADH.east, RIYADH.north);
const MAX_HEIGHT_M = 40000;

/** Keep the camera above Riyadh (position clamped to the box, height capped). */
function lockToRiyadh(viewer: Viewer) {
  const ctl = viewer.scene.screenSpaceCameraController;
  ctl.maximumZoomDistance = MAX_HEIGHT_M;
  const carto = new Cartographic();
  viewer.scene.preUpdate.addEventListener(() => {
    const cam = viewer.camera;
    Cartographic.fromCartesian(cam.positionWC, undefined, carto);
    if (!carto) return;
    const lon = CesiumMath.toDegrees(carto.longitude);
    const lat = CesiumMath.toDegrees(carto.latitude);
    const cl = Math.min(RIYADH.east, Math.max(RIYADH.west, lon));
    const ct = Math.min(RIYADH.north, Math.max(RIYADH.south, lat));
    const ch = Math.min(MAX_HEIGHT_M, carto.height);
    if (cl === lon && ct === lat && ch === carto.height) return;
    cam.setView({
      destination: Cartesian3.fromDegrees(cl, ct, ch),
      orientation: { heading: cam.heading, pitch: cam.pitch, roll: cam.roll },
    });
  });
}

/** Create the single Cesium viewer. Throws if WebGL is unavailable. */
export function createViewer(container: HTMLElement): ViewerHandle {
  if (typeof location !== "undefined" && new URLSearchParams(location.search).has("forcefallback")) {
    throw new Error("Fallback forced with ?forcefallback (test hook).");
  }
  let hasIon = !!CONFIG.ionToken;
  const useGoogle = CONFIG.enableGoogle3D && !!CONFIG.googleKey;
  if (hasIon) Ion.defaultAccessToken = CONFIG.ionToken;

  const viewer = new Viewer(container, {
    baseLayer: false,
    baseLayerPicker: false,
    // Google Photorealistic 3D Tiles must be used together with Google's geocoder
    geocoder: useGoogle ? IonGeocodeProviderType.GOOGLE : false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    shadows: false,
    msaaSamples: HQ ? 4 : 1,
    requestRenderMode: false,
  });

  bindTerrainViewer(viewer);
  const scene = viewer.scene;
  scene.globe.baseColor = Color.fromCssColorString("#0b1424");
  scene.globe.enableLighting = false;
  scene.globe.depthTestAgainstTerrain = true;
  scene.globe.showGroundAtmosphere = true;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
  scene.fog.enabled = true;
  scene.fog.density = 0.00018;
  scene.postProcessStages.fxaa.enabled = true;
  viewer.resolutionScale = LOW ? 0.5 : HQ ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
  scene.globe.tileCacheSize = 300;
  scene.globe.maximumScreenSpaceError = HQ ? 2 : 2.5;
  scene.screenSpaceCameraController.minimumZoomDistance = 12;
  lockToRiyadh(viewer);

  // Fixed late-afternoon sun in Riyadh (15:20 local) for consistent, warm lighting.
  viewer.clock.currentTime = JulianDate.fromIso8601("2026-11-24T12:20:00Z");
  viewer.clock.shouldAnimate = false;

  // Entities are selected through our own handlers; the default double-click tracking would fight the camera controller.
  viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  let disposed = false;
  const track: Primitive[] = [];

  /** District / place names over the imagery (Esri reference layer). Starts at z8: no country names on the globe. */
  const addPlaceNames = () => {
    const labels = new UrlTemplateImageryProvider({
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      minimumLevel: 8,
      maximumLevel: 16,
      credit: "Labels © Esri",
    });
    labels.errorEvent.addEventListener(() => undefined);
    const l = new ImageryLayer(labels, { rectangle: RIYADH_RECT });
    viewer.imageryLayers.add(l);
    l.alpha = 0.85;
  };

  const ready = (async () => {
    // ion can be unreachable on some networks; then every ion request hangs ~40 s and the map stays stuck on "loading".
    // Probe it once with a short timeout and use the public fallbacks when it does not answer.
    if (hasIon) {
      hasIon = await ionReachable(CONFIG.ionToken);
      if (!hasIon) console.warn("[RoadGuard] Cesium ion did not answer in time; using public imagery and OSM footprints");
    }
    // ------------------------------------------------------------- imagery
    try {
      if (hasIon) {
        // plain aerial (no road shields / numbers) so the hazards stay the focus; district names come from the Esri layer below
        const layer = ImageryLayer.fromProviderAsync(IonImageryProvider.fromAssetId(2), { rectangle: RIYADH_RECT });
        viewer.imageryLayers.add(layer);
        layer.brightness = 0.82;
        layer.saturation = 0.8;
        addPlaceNames();
        patchInfo({ imagery: "Cesium World Imagery (ion) + place names" });
      } else {
        const provider = new UrlTemplateImageryProvider({
          url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          maximumLevel: 19,
          credit: "Imagery © Esri, Maxar, Earthstar Geographics",
        });
        provider.errorEvent.addEventListener((err) => console.warn("[RoadGuard] imagery tile error", err?.message));
        const layer = new ImageryLayer(provider, { rectangle: RIYADH_RECT });
        viewer.imageryLayers.add(layer);
        layer.brightness = 0.92;
        layer.saturation = 0.9;
        addPlaceNames();
        patchInfo({ imagery: "Esri World Imagery + place names (public tiles)" });
      }
    } catch (e) {
      console.warn("[RoadGuard] imagery unavailable", e);
      patchInfo({ imagery: "Unavailable · schematic base colour" });
    }
    if (disposed) return { terrainSampled: false };

    // -------------------------------------------------------------- terrain
    let terrainSampled = false;
    if (hasIon) {
      try {
        const terrain = Terrain.fromWorldTerrain({ requestVertexNormals: true });
        scene.setTerrain(terrain);
        const provider = await new Promise<NonNullable<typeof terrain.provider>>((res, rej) => {
          terrain.readyEvent.addEventListener(res);
          terrain.errorEvent.addEventListener(rej);
        });
        terrainSampled = await sampleRouteHeights(provider);
        patchInfo({ terrain: "Cesium World Terrain" });
      } catch (e) {
        console.warn("[RoadGuard] Cesium World Terrain unavailable; using flat ellipsoid", e);
        patchInfo({ terrain: "Flat ellipsoid (terrain unavailable)" });
      }
    } else {
      patchInfo({ terrain: CONFIG.ionToken ? "Flat ellipsoid (Cesium ion unreachable)" : "Flat ellipsoid (no Cesium ion token)" });
    }
    if (disposed) return { terrainSampled };

    // ------------------------------------------------------------ buildings
    let buildingsDone = false;
    if (useGoogle) {
      try {
        GoogleMaps.defaultApiKey = CONFIG.googleKey;
        const g = await createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true });
        scene.primitives.add(g);
        patchInfo({ buildings: "Google Photorealistic 3D Tiles" });
        buildingsDone = true;
      } catch (e) {
        console.warn("[RoadGuard] Google 3D Tiles unavailable", e);
      }
    }
    if (!buildingsDone && hasIon) {
      try {
        const osm: Cesium3DTileset = await createOsmBuildingsAsync();
        osm.maximumScreenSpaceError = HQ ? 16 : 28;
        // calm neutral buildings: the coloured pins are the only bright things on the map
        osm.style = new Cesium3DTileStyle({ color: "color('#cfccc6')" });
        // no buildings on top of the demo roads (teams must never drive through a building)
        try {
          osm.clippingPolygons = buildCorridorClipping();
        } catch (e) {
          console.warn("[RoadGuard] building clipping unavailable", e);
        }
        scene.primitives.add(osm);
        patchInfo({ buildings: "Cesium OSM Buildings (3D Tiles)" });
        buildingsDone = true;
      } catch (e) {
        console.warn("[RoadGuard] Cesium OSM Buildings unavailable", e);
      }
    }
    if (!buildingsDone) {
      try {
        const data = (await import("../../data/osmBuildings.json")).default as FootprintBuilding[];
        if (!disposed) {
          const { primitive, tagged } = createFootprintBuildings(data);
          scene.primitives.add(primitive);
          track.push(primitive);
          patchInfo({
            buildings: `OSM footprints, extruded (${data.length}; heights tagged for ${tagged}, rest estimated)`,
          });
        }
      } catch (e) {
        console.warn("[RoadGuard] footprint buildings failed", e);
        patchInfo({ buildings: "None" });
      }
    }
    return { terrainSampled };
  })();

  return {
    viewer,
    ready,
    destroy: () => {
      disposed = true;
      if (!viewer.isDestroyed()) viewer.destroy();
    },
  };
}
