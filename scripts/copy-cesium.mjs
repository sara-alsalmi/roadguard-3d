// Copies Cesium's static runtime assets (Workers, Assets, ThirdParty, Widgets) into public/cesium.
import { cpSync, mkdirSync } from "node:fs";
const src = "node_modules/cesium/Build/Cesium";
const dest = "public/cesium";
mkdirSync(dest, { recursive: true });
for (const d of ["Workers", "Assets", "ThirdParty", "Widgets"]) cpSync(`${src}/${d}`, `${dest}/${d}`, { recursive: true });
console.log("Cesium assets copied to public/cesium");
