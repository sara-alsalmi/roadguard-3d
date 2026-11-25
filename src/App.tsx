import gsap from "gsap";
import { BarChart3, BellPlus, Crosshair, ListChecks, Play, Presentation, Radio, ScanSearch, ShieldCheck, Square, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { MissionHUD } from "./components/demo/MissionHUD";
import { exitMission, startMission } from "./components/demo/missionController";
import { IncidentDetail } from "./components/incidents/IncidentDetail";
import { ReportsList } from "./components/incidents/ReportsPanel";
import { Analytics } from "./components/dashboard/Analytics";
import { InspectionPanel } from "./components/inspection/InspectionPanel";
import { FallbackMap } from "./components/map/FallbackMap";
import { LeftCard } from "./components/map/LeftCard";
import { MapControls } from "./components/map/MapControls";
import { HoverTip } from "./components/map/HoverTip";
import { MapCallout } from "./components/map/MapCallout";
import { MapView } from "./components/map/MapView";
import { selectIncident, simulateIncomingReport, startLive, stopLive } from "./components/simulation/actions";
import { useApp } from "./store/appStore";
import { EMBED } from "./embed/bridge";

const RIGHT_W = 364;

const TABS = [
  { id: "inspection", label: "AI Inspection", icon: ScanSearch },
  { id: "incidents", label: "Incidents", icon: ListChecks },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
] as const;

export default function App() {
  const mapStatus = useApp((s) => s.mapStatus);
  const selected = useApp((s) => s.incidents.find((i) => i.id === s.selectedId));
  const panel = useApp((s) => s.panel);
  const mission = useApp((s) => s.mission.active);
  const picking = useApp((s) => s.pickingLocation);
  const live = useApp((s) => s.live);
  const presentation = useApp((s) => s.presentation);
  const alert = useApp((s) => s.alert);
  const set = useApp((s) => s.set);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".rg-in-left", { x: -30, autoAlpha: 0, duration: 0.7, ease: "power3.out", delay: 0.15 });
      gsap.from(".rg-in-right", { x: 30, autoAlpha: 0, duration: 0.7, ease: "power3.out", delay: 0.25 });
      gsap.from(".rg-in-bottom", { y: 20, autoAlpha: 0, duration: 0.6, ease: "power3.out", delay: 0.4 });
    }, root);
    return () => ctx.revert();
  }, []);

  // F toggles presentation mode, Esc leaves it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "f" || e.key === "F") useApp.setState((s) => ({ presentation: !s.presentation }));
      if (e.key === "Escape" && useApp.getState().presentation) {
        if (useApp.getState().mission.active) exitMission();
        useApp.setState({ presentation: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const startPresentation = () => {
    set({ presentation: true });
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    void startMission();
  };
  const disabled = mapStatus === "fallback";

  return (
    <div ref={root} className="relative h-full w-full overflow-hidden" data-testid="app" data-map-status={mapStatus} data-embed={EMBED ? "1" : undefined}>
      {mapStatus === "fallback" ? <FallbackMap /> : <MapView />}

      {mapStatus === "loading" && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 backdrop-blur-md" data-testid="loading-veil">
          <div className="flex flex-col items-center gap-3">
            <ShieldCheck size={34} />
            <div className="h-display text-lg font-semibold">RoadGuard 3D</div>
            <div className="progress w-44"><i className="!w-full animate-pulse" /></div>
          </div>
        </div>
      )}

      {/* LEFT: compact card, as in the first version (camera, filters, analysis) */}
      {!presentation && <div className="rg-in-left absolute left-4 top-4 z-20"><LeftCard /></div>}

      {/* RIGHT: report list, or the selected report */}
      {!presentation && <aside className="rg-in-right absolute right-4 top-4 bottom-4 z-20 glass flex flex-col" style={{ width: RIGHT_W }} data-testid="right-panel">
        <div className="p-2.5 pb-0">
          <div className="seg" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={panel === t.id} onClick={() => set({ panel: t.id })} data-testid={`tab-${t.id}`} className="flex items-center justify-center gap-1.5">
                <t.icon size={13} /> {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="scroll flex-1 min-h-0 p-5">
          {panel === "inspection" && <InspectionPanel />}
          {panel === "incidents" && (selected ? <IncidentDetail incident={selected} /> : <ReportsList />)}
          {panel === "analytics" && <Analytics />}
        </div>
      </aside>}

      {/* Earth-style navigation, docked beside the right panel */}
      {!presentation && <div className="absolute z-20 top-1/2 -translate-y-1/2" style={{ right: RIGHT_W + 32 }}><MapControls /></div>}

      {/* the photo lives in the right panel; the on-map balloon is only used in presentation mode, when the panels are hidden */}
      {presentation && <MapCallout reservedRight={90} reservedLeft={24} />}
      <HoverTip />

      {presentation && (
        <button className="absolute top-4 right-4 z-30 btn btn-sm" onClick={() => { if (useApp.getState().mission.active) exitMission(); set({ presentation: false }); }} data-testid="exit-presentation"><X size={13} /> Exit presentation (Esc)</button>
      )}

      {/* arrival alert */}
      {alert && (
        <button
          key={alert.id}
          className="absolute top-5 z-30 -translate-x-1/2 glass !rounded-full pl-4 pr-5 py-2.5 flex items-center gap-3 text-[13px] popin"
          style={{ left: `calc(50% - 24px)` }}
          onClick={() => selectIncident(alert.id, true)}
          data-testid="arrival-alert"
        >
          <span className="w-2 h-2 rounded-full bg-[#ff9f0a] animate-pulse" />
          <span className="font-medium">{alert.text}</span>
          <span className="text-muted text-[12px]">Road camera · tap to view</span>
        </button>
      )}

      {picking && (
        <div className="absolute top-20 z-30 -translate-x-1/2 glass !rounded-full pl-5 pr-2 py-2 flex items-center gap-3 text-[13px]" style={{ left: "50%" }}>
          <Crosshair size={15} className="text-[#6cb4ff]" /> Click the map to place this report
          <button className="btn btn-sm" onClick={() => set({ pickingLocation: false })}><X size={12} /> Cancel</button>
        </div>
      )}

      {/* bottom centre: live feed + demo */}
      <div className="rg-in-bottom absolute bottom-5 z-20 -translate-x-1/2 flex flex-col items-center gap-3 pointer-events-none" style={{ left: presentation ? "50%" : `calc(50% - 24px)`, width: presentation ? "min(760px, calc(100% - 64px))" : "min(760px, calc(100% - 760px))" }}>
        <div className="pointer-events-auto w-full flex flex-col items-center gap-3">
          <MissionHUD />
          {!mission && !EMBED && (
            <div className="glass !rounded-full p-1.5 flex items-center gap-1.5">
              {live ? (
                <button className="btn btn-primary" onClick={stopLive} data-testid="live-toggle"><Square size={13} /> Stop live feed</button>
              ) : (
                <button className="btn btn-primary" onClick={startLive} disabled={disabled} data-testid="live-toggle"><Radio size={15} /> Live simulation</button>
              )}
              <button className="btn" onClick={() => simulateIncomingReport()} disabled={disabled} data-testid="simulate-report"><BellPlus size={15} /> New report</button>
              <button className="btn" onClick={() => void startMission()} disabled={disabled} data-testid="launch-mission"><Play size={14} /> Guided demo</button>
              <button className="btn" onClick={startPresentation} disabled={disabled} data-testid="present"><Presentation size={15} /> Present</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
