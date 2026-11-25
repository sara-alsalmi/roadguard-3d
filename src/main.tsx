import { createRoot } from "react-dom/client";
import App from "./App";
import { preloadGlyphs } from "./components/map/markerIcons";
import "./index.css";
import { loadTestImages } from "./data/samples";
import { seedIncidents, useApp } from "./store/appStore";
import { EMBED, startBridge } from "./embed/bridge";

// StrictMode is intentionally not used: it would mount/destroy the Cesium viewer twice in development.
// MapView still cleans up fully on unmount (viewer, event handlers, data sources, listeners).
void loadTestImages().then((n) => {
  // real test images (if any) replace the generated illustrations in the seed reports too
  if (n > 0) useApp.setState({ incidents: seedIncidents() });
});
// Keep the demo state across page reloads (reports and counters). Reset clears it.
const KEY = "roadguard-demo-v3";
// embedded in another website: always start from the same clean demo state
try {
  if (EMBED) throw new Error("embed");
  const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
  if (saved?.incidents?.length) {
    useApp.setState({
      incidents: saved.incidents.map((i: { status: string }) => (i.status === "assigned" ? { ...i, status: "review" } : i)),
      idCounter: saved.idCounter ?? 108,
      incomingCount: saved.incomingCount ?? 0,
    });
  }
} catch {
  /* storage unavailable: demo simply starts fresh */
}
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useApp.subscribe((s, prev) => {
  if (EMBED) return;
  if (s.incidents === prev.incidents && s.incomingCount === prev.incomingCount) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ incidents: s.incidents.filter((i) => !i.imageUrl?.startsWith("blob:")), idCounter: s.idCounter, incomingCount: s.incomingCount }));
    } catch {
      /* ignore */
    }
  }, 400);
});
startBridge();
void preloadGlyphs().finally(() => createRoot(document.getElementById("root")!).render(<App />));
