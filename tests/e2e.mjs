// End-to-end check of the digital twin (Playwright + headless Chromium).
//   npm run dev                         (terminal 1)
//   npx playwright install chromium     (once)
//   npm run test:e2e                    (terminal 2)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173";
mkdirSync("shots", { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(60000);
const consoleErrors = [];
const failedRequests = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("response", (r) => r.status() >= 400 && failedRequests.push(`${r.status()} ${r.url()}`));

await page.goto(`${BASE}/?lowperf`);
await page.waitForFunction(() => window.__rg && window.__rg.store.getState().mapStatus === "ready", null, { timeout: 60000 });
const s = () => page.evaluate(() => { const st = window.__rg.store.getState(); return { n: st.incidents.length, sel: st.selectedId, items: st.incidents }; });
const ents = (name) => page.evaluate((n) => window.__rg.viewer.dataSources._dataSources.find((d) => d.name === n)?.entities.values.length ?? 0, name);

check("Cesium canvas renders", (await page.locator(".cesium-widget canvas").count()) === 1);
check("Starts empty", (await s()).n === 0);
check("No vehicles, teams or operator buttons", (await page.locator('[data-testid="live-toggle"], [data-testid="assign-maintenance"], [data-testid="launch-mission"]').count()) === 0);

await page.getByTestId("load-examples").click();
await page.waitForTimeout(800);
check("Examples are placed on the map", (await s()).n === 3);
check("Each damage gets a 3D model", (await ents("hazards")) === 3);
check("No coloured roads or danger circles", (await ents("road-health")) === 0 && (await page.evaluate(() => window.__rg.viewer.dataSources._dataSources.find((d) => d.name === "incident-fx").entities.values.filter((e) => e.id.startsWith("zone:")).length)) === 0);

// upload: two photos of the same MOMRA case + a YOLO label, and one video
const n1 = "DATA-WORKATTACH-FILE MOMRA-OPS-CS-WORK INC-21-06-038549!20210610T165255.438 GMT";
const n2 = "DATA-WORKATTACH-FILE MOMRA-OPS-CS-WORK INC-21-06-038549!20210610T165256.358 GMT";
const jpg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
await page.getByTestId("upload-input").setInputFiles([
  { name: `${n1}.jpg`, mimeType: "image/jpeg", buffer: jpg },
  { name: `${n1}.txt`, mimeType: "text/plain", buffer: Buffer.from("2 0.55 0.37 0.5 0.72\n") },
  { name: `${n2}.jpg`, mimeType: "image/jpeg", buffer: jpg },
  { name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(64) },
]);
await page.waitForTimeout(1200);
const after = await s();
const group = after.items.find((i) => i.groupKey === "INC-21-06-038549");
check("Photos of the same case become one damage", !!group && group.media.length === 2);
check("YOLO label gives class and box", group?.cls === "pothole" && group.media[0].annotations.length === 1 && group.media[0].annotations[0].confidence === undefined);
check("Date is read from the file name", group?.media[0].capturedAt === "2021-06-10T16:52:55Z");
check("Video becomes its own damage", after.items.some((i) => i.media?.[0]?.type === "video"));
check("Every position is marked simulated", after.items.every((i) => i.locationSource === "simulated"));

await page.getByTestId(`damage-${group.id}`).click();
await page.waitForTimeout(800);
check("Opening a damage shows its gallery", (await page.getByTestId("damage-view").isVisible()) && (await page.getByTestId("damage-view").locator("img").count()) >= 2);
await page.screenshot({ path: "shots/01-damage.png" });
await page.getByTestId("back").click();

// linked website: a model result arrives through postMessage
const r = await page.evaluate(async () => {
  window.postMessage({ type: "roadguard:detection", cls: "barrier", image: "https://example.com/x.jpg", boxes: [{ bbox: [0.1, 0.1, 0.3, 0.3], confidence: 0.9 }], focus: false }, "*");
  await new Promise((res) => setTimeout(res, 400));
  return window.__rg.store.getState().incidents.at(-1);
});
check("Linked website detection is placed with model confidence", r.cls === "barrier" && r.media[0].annotations[0].confidence === 0.9 && r.locationSource === "simulated");

const ignorable = (t) => /example\.com|ERR_ABORTED|clip\.mp4|blob:/.test(t);
const errs = consoleErrors.filter((t) => !ignorable(t));
check("No important console errors", errs.length === 0, errs.slice(0, 2).join(" | ").slice(0, 300));
const failed = failedRequests.filter((t) => !ignorable(t));
check("No essential asset failed to load", failed.length === 0, failed.slice(0, 3).join(" | "));

await browser.close();
const bad = results.filter((x) => !x.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
process.exit(bad.length ? 1 : 0);
