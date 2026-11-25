import { createRoot } from "react-dom/client";
import App from "./App";
import { preloadGlyphs } from "./components/map/markerIcons";
import "./index.css";
import { useApp } from "./store/appStore";
import { startBridge } from "./embed/bridge";

// StrictMode is intentionally not used: it would mount/destroy the Cesium viewer twice in development.
// The twin starts empty: damages appear when photos / videos are uploaded or sent by the linked website.
useApp.setState({ incidents: [], selectedId: null });
startBridge();
void preloadGlyphs().finally(() => createRoot(document.getElementById("root")!).render(<App />));
