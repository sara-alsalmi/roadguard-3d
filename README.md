# RoadGuard 3D: digital twin of Riyadh roads

Live: https://sara-alsalmi.github.io/roadguard-3d/

A 3D digital twin of real Riyadh roads built with CesiumJS. Road photos and videos of damage (pothole, excavation
barrier, broken sidewalk) are placed on the map as 3D damage models. Click a damage to see its photos with the boxes,
or play its video. Road segments turn red where damage is.

- **Upload on the page:** drop photos and videos. YOLO `.txt` label files with the same name bring the class and boxes. Photos of the same `INC-…` case (MOMRA file names) become one damage with a gallery, dated from the file name.
- **Link from another website:** see [LINKING.md](LINKING.md) (`?embed` iframe + `postMessage`). Try `link-demo.html`.
- **Honest data:** the photos have no GPS, so positions are **simulated on real roads** and marked so. Confidence is shown only when a real model sends it.
- **Riyadh only:** opens on the whole Earth, flies to Riyadh, then keeps the camera over Riyadh. Detailed imagery is loaded only there.

## Run
```powershell
npm install
npm run dev
```
Open http://localhost:5173. Tests: `npm run test:e2e` (needs `npx playwright install chromium` once).

## Cesium token (optional)
Without a token: Esri satellite imagery, flat ground, OpenStreetMap buildings near the demo roads.
With a token: Cesium World Terrain and 3D buildings for all of Riyadh.
- **Local:** put the token in `.env` as `VITE_CESIUM_ION_TOKEN=…`.
- **Published site:** add a repo secret `VITE_CESIUM_ION_TOKEN`. Use a token restricted in the Cesium ion dashboard: Allowed URLs = your site, scope `assets:read`.

Road geometry and building footprints © OpenStreetMap contributors (ODbL). Esri World Imagery © Esri.
