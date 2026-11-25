// End-to-end check of the real running app (Playwright + headless Chromium).
//   npm run dev                         (terminal 1)
//   npx playwright install chromium     (once)
//   npm run test:e2e                    (terminal 2)
// Uses ?lowperf and the window.__rg hook to pump frames: headless software GL renders only a few fps.
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
page.setDefaultTimeout(120000);
const consoleErrors = [];
const failedRequests = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("response", (r) => r.status() >= 400 && failedRequests.push(`${r.status()} ${r.url()}`));

await page.goto(`${BASE}/?lowperf`);
await page.waitForFunction(() => window.__rg && window.__rg.store.getState().mapStatus === "ready", null, { timeout: 60000 });
await page.evaluate(() => {
  const rg = window.__rg;
  window.__pump = async (ms) => { const end = performance.now() + ms; while (performance.now() < end) { rg.viewer.render(); await new Promise((r) => setTimeout(r, 0)); } };
  window.__until = async (cond, ms = 40000) => { const end = performance.now() + ms; while (performance.now() < end) { if (cond()) return true; rg.viewer.render(); await new Promise((r) => setTimeout(r, 0)); } return false; };
});
const pump = (ms) => page.evaluate((m) => window.__pump(m), ms);
const until = (src, ms = 60000) => page.evaluate(`window.__until(() => ${src}, ${ms})`);
const state = () => page.evaluate(() => { const s = window.__rg.store.getState(); return { n: s.incidents.length, sel: s.selectedId, busy: s.cameraBusy, st: Object.fromEntries(s.incidents.map((i) => [i.id, i.status])) }; });

check("Cesium canvas renders", (await page.locator(".cesium-widget canvas").count()) === 1);
await pump(9000);
await page.screenshot({ path: "shots/01-overview.png" });
check("Left card (Riyadh locator + camera) and right panel are visible", (await page.getByTestId("left-panel").isVisible()) && (await page.getByTestId("right-panel").isVisible()));
check("Right panel starts on AI Inspection with the three sample images", (await page.getByTestId("sample-pothole").isVisible()) && (await page.getByTestId("sample-barrier").isVisible()) && (await page.getByTestId("sample-sidewalk").isVisible()));
check("Riyadh locator is shown", await page.getByTestId("locator").isVisible());
await page.getByTestId("tab-incidents").click();
check("Seed reports listed", (await page.getByTestId("incident-total").innerText()).includes("8"));
check("Reports are spread over several streets", await page.evaluate(() => { const l = window.__rg.store.getState().incidents.map((i) => i.lon); return Math.max(...l) - Math.min(...l) > 0.008; }));

// filters
await page.getByTestId("filter-class-pothole").click();
check("Type filter narrows the list", (await page.getByTestId("incident-count").innerText()).includes("4 of 8"));
await page.getByTestId("filter-class-all").click();
await page.getByTestId("filter-status-alerts").click();
check("Status filter narrows the list", (await page.getByTestId("incident-count").innerText()).includes("4 of 8"));
await page.getByTestId("filter-status-all").click();
check("Map key (legend) is in the left card", await page.getByTestId("legend").isVisible());
await page.keyboard.press("f");
await pump(300);
check("Presentation mode (F) hides the panels", !(await page.getByTestId("left-panel").isVisible()) && !(await page.getByTestId("right-panel").isVisible()));
await page.keyboard.press("Escape");
await pump(300);
check("Esc brings the panels back", (await page.getByTestId("left-panel").isVisible()) && (await page.getByTestId("right-panel").isVisible()));

// incoming report -> appears on map, details open
const before = (await state()).n;
await page.getByTestId("simulate-report").click();
await until("!window.__rg.store.getState().cameraBusy");
await pump(800);
const after = await state();
const id = after.sel;
check("Incoming report appears immediately", after.n === before + 1 && after.sel !== null);
check("Details panel shows the prediction with the Demo label", (await page.getByTestId("incident-detail").getByTestId("demo-badge").isVisible()) && (await page.getByTestId("bbox").count()) >= 1);
check("Photo shows in the right panel only (no extra balloon on the map)", (await page.getByTestId("map-callout").count()) === 0 && (await page.getByTestId("incident-detail").locator("img").first().isVisible()));
check("Arrival alert is shown", (await page.evaluate(() => !!window.__rg.store.getState().alert)) || (await page.getByTestId("arrival-alert").isVisible()));
await page.getByTestId("back-to-list").click();
check("Total counter updates", (await page.getByTestId("incident-total").innerText()).includes(String(before + 1)));
await page.getByTestId(`incident-row-${id}`).click();
await pump(600);
await page.screenshot({ path: "shots/02-incoming-report.png" });

// marker exists at the report coordinates
const markerOk = await page.evaluate((rid) => {
  const v = window.__rg.viewer; const i = window.__rg.store.getState().incidents.find((x) => x.id === rid);
  for (let k = 0; k < v.dataSources.length; k++) {
    const e = v.dataSources.get(k).entities.getById(`incident:${rid}`);
    if (e) { const c = window.Cesium ? null : null; void c; return !!e.position && e.show; }
  }
  return false;
}, id);
check("Map marker exists for the new report", markerOk);

// lifecycle
check("New camera reports arrive as Predicted", (await state()).st[id] === "predicted");
await page.getByTestId("confirm-prediction").click();
check("Confirm moves a prediction to Under Review", (await state()).st[id] === "review");
await page.evaluate(() => { window.__rg.engine.fixedDt = 0.1; });
await page.getByTestId("assign-maintenance").click();
check("Assign team sets Team Assigned", (await state()).st[id] === "assigned");
await page.getByTestId("speed-4").click();
await page.getByTestId("follow-maint").click();
check("Team completes the (simulated) work", await until(`window.__rg.store.getState().dispatches['${id}']?.phase === 'done'`, 200000));
await page.screenshot({ path: "shots/03-team-on-site.png" });
await page.getByTestId("resolve").click();
check("Mark resolved closes the report", (await state()).st[id] === "resolved");

// all three demo types
for (let k = 0; k < 2; k++) { await page.getByTestId("simulate-report").click(); await pump(400); }
const classes = await page.evaluate(() => [...new Set(window.__rg.store.getState().incidents.slice(-3).map((i) => i.cls))].sort().join(","));
check("Pothole, barrier and sidewalk demos all work", classes === "barrier,pothole,sidewalk", classes);

const nBefore = (await state()).n;
await page.getByTestId("simulate-report").click();
await pump(400);
await page.getByTestId("dismiss-prediction").click();
check("Dismiss removes a false alarm", (await state()).n === nBefore);

// a team on another street (Olaya Street)
await page.evaluate(() => window.__rg.store.getState().set({ panel: "incidents", selectedId: null }));
await page.getByTestId("incident-row-RG-0102").click();
await pump(500);
await page.getByTestId("assign-maintenance").click();
check("A team can be sent along Olaya Street", await until("window.__rg.store.getState().dispatches['RG-0102']?.phase === 'done'", 240000));

// analytics
await page.getByTestId("tab-analytics").click();
check("Analytics tab renders", await page.getByTestId("analytics").isVisible());
await page.getByTestId("tab-incidents").click();

// live simulation: reports arrive on their own
if (await page.getByTestId("back-to-list").isVisible()) await page.getByTestId("back-to-list").click();
const n0 = (await state()).n;
await page.getByTestId("live-toggle").click();
check("Live simulation adds reports by itself", await until(`window.__rg.store.getState().incidents.length > ${n0}`, 60000));
await page.getByTestId("live-toggle").click();

// guided demo
await page.evaluate(() => { window.__rg.engine.fixedDt = 0.25; });
await page.getByTestId("launch-mission").click();
check("Guided demo reaches the final step", await until("window.__rg.store.getState().mission.step === 5", 360000));
await pump(2500);
await page.screenshot({ path: "shots/04-demo-summary.png" });
await page.getByTestId("mission-exit").click();

const ignorable = (t) => /\/api\/predict|502|ERR_ABORTED/.test(t);
const errs = consoleErrors.filter((t) => !ignorable(t));
check("No important console errors", errs.length === 0, errs.slice(0, 2).join(" | ").slice(0, 300));
const failed = failedRequests.filter((t) => !ignorable(t));
check("No essential asset failed to load", failed.length === 0, failed.slice(0, 3).join(" | "));

await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
process.exit(bad.length ? 1 : 0);
