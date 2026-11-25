# RoadGuard 3D — Saudi Road Infrastructure Intelligence

A **CesiumJS** operations map for road-damage reports. New reports appear on a 3D map as soon as they arrive, the
operator reviews the photo and prediction, assigns a team, and watches the team drive to the location.

> **Data integrity.** The Saudi dataset has no GPS. Every incident here is a **simulated demo placement** (or a location an
> operator picks manually). Demo annotations are **manually authored**, not AI predictions, and the UI says so. No
> confidence, severity, repair cost or repair time is ever invented. The map is an incident-management layer, not
> evidence that a photo was taken where it is plotted.

## Run it

```powershell
npm install
npm run dev          # http://localhost:5173
```

Other scripts: `npm run build`, `npm test` (unit), `npm run test:e2e` (Playwright; needs the dev server and
`npx playwright install chromium` once), `npm run gen:demo` (demo images), `npm run gen:vehicles` (vehicle models).

### Cesium credentials (optional)

```powershell
copy .env.example .env     # then set VITE_CESIUM_ION_TOKEN
```

| | With `VITE_CESIUM_ION_TOKEN` | Without (default) |
|---|---|---|
| Imagery | Cesium World Imagery | Esri World Imagery (public tiles) |
| Terrain | Cesium World Terrain | Flat ellipsoid |
| Buildings | Cesium OSM Buildings (3D Tiles) | Real OSM footprints, extruded (heights mostly estimated) |

**Google-Earth-level realism** needs Google Photorealistic 3D Tiles: set `VITE_GOOGLE_MAPS_API_KEY` and
`VITE_ENABLE_GOOGLE_3D_TILES=true` (Map Tiles API enabled, and you must be permitted to use it). That path is
implemented but **untested** here (no key). Every layer failure falls back and is listed under the map's layers button.
If WebGL cannot start, a labelled 2D schematic is shown instead of a blank screen.

## Screen layout

* **Map** – Google-Earth-style controls (zoom, compass, 2D/3D, home, layer info).
* **Left card (compact)** – where this is in Riyadh (locator inset + place name) and the camera views (Overview / Aerial / Street / Follow).
* **Right panel** – three tabs: *AI Inspection* (check an image), *Incidents* (filters + list; click one for its photo,
  prediction box, confidence (only from a real model), source, location provenance) and *Analytics*.
* **Predicted → action** – camera detections arrive as **Predicted** (early warning). The operator **Confirms** (Under Review →
  Assign team → Resolved) or **Dismisses** a false alarm. Nothing is dispatched until confirmed.
* **Map** – click a pin: its photo and prediction open in the right panel (in presentation mode, where the panels are hidden, a small photo balloon appears next to the pin). Pin colour = type (pothole white, barrier yellow, sidewalk purple),
  small dot = status. Place names come from the Esri reference layer (or Bing labels with an ion token).
* **Presentation mode** – press **F** (or the *Present* button, which also starts the guided demo full-screen): panels hide and the map
  takes over. **Esc** exits. Hover a pin for a tooltip; the left card shows the map key.
* **Real test images** – drop photos into `public/test-images` and describe them in `manifest.json` (see the README.txt there).
  They replace the generated illustrations; use `"source": "model"` + `confidence` only for real model output.
* **Live simulation** – reports arrive on their own as if from the road-camera network (the cameras themselves are assumed to
  exist, not modelled): an alert, a pulse on the map, a new row in the list. **New report** adds one on demand. Replace
  both with your real feed / model output.
* **Team dispatch** – a utility truck leaves a demo depot, follows a demonstration route (Follow button, 1×/2×/4×), works
  on site (simulated), then the operator marks the report Resolved. No physical repair is claimed.
* **Check an image** – upload or pick a sample; demo adapter or real FastAPI adapter; manual box and manual location.
* **Guided demo** – Discover · Detect · Review · Dispatch · Resolve · Summary using the real components.

## Architecture

```
src/components/map/         viewer host, camera controller, incident layer, map controls
src/components/simulation/  deterministic engine (team dispatch), actions
src/components/inspection/  image check panel      src/components/incidents/  report list + detail
src/components/dashboard/   analytics              src/components/demo/       guided demo
src/services/inference/     demo + real adapters   src/store/ (Zustand)       src/data/ (route, samples, config)
```

One viewer created once and fully torn down on unmount; one tick listener drives vehicles; the `CameraController` is the
only owner of the camera. Movement is a pure function of route distance (`src/utils/simModel.ts`, unit-tested).

## Connect your Kaggle-trained YOLO model

1. Export weights (e.g. `best.pt`). Map your class names in `CLASS_ALIASES` (`src/services/inference/realAdapter.ts`).
2. Run the reference server (`server/main.py`; returns **503** until weights exist, never fake output):
   ```powershell
   pip install fastapi "uvicorn[standard]" python-multipart ultralytics pillow
   $env:WEIGHTS="C:\path\to\best.pt"; uvicorn server.main:app --port 8000
   ```
3. In **Check an image** choose *Real model (FastAPI)* and upload an image. To make incoming reports use the model, call
   `useApp.getState().addIncident(...)` with the model's detections (see `simulateIncomingReport` in `actions.ts`).

Contract — `POST /api/predict` (multipart `file`) → `{ image_width, image_height, detections:[{class_name, bbox:[x1,y1,x2,y2], confidence}], annotated_image }`.

## Testing

`npm test` — 12 unit tests. `npm run test:e2e` — 18 checks against the running app (panels, filters, incoming report,
prediction label, marker, review/assign/resolve, all three types, analytics, guided demo, console and asset errors).
Automation flags: `?lowperf`, `?forcefallback`; `window.__rg` exposes viewer, engine, camera and store.

## Deploying

`npm run build` produces a static site in `dist/` (host on Vercel/Netlify/any static host). Use a URL-restricted Cesium ion
token; the inference server is deployed separately. Not deployed yet.

## Attribution

Road geometry and building footprints © OpenStreetMap contributors (ODbL). Esri World Imagery © Esri, Maxar, Earthstar
Geographics (fallback). Vehicle models and demo images are generated by scripts in `tools/` (original geometry).
Dataset for your training: Saudi Arabia Public Roads Visual Pollution Dataset, Mendeley Data (bb7b8vtwry/5).
