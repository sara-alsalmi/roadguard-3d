import gsap from "gsap";
import { ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { FallbackMap } from "./components/map/FallbackMap";
import { HoverTip } from "./components/map/HoverTip";
import { MapControls } from "./components/map/MapControls";
import { MapView } from "./components/map/MapView";
import { EMBED } from "./embed/bridge";
import { useApp } from "./store/appStore";
import { selectDamage } from "./twin/actions";
import { TwinCard } from "./twin/TwinCard";
import { TwinPanel } from "./twin/TwinPanel";

const RIGHT_W = 360;

/** RoadGuard 3D digital twin: real Riyadh roads, and the photos / videos of road damage placed on them. */
export default function App() {
  const mapStatus = useApp((s) => s.mapStatus);
  const alert = useApp((s) => s.alert);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".rg-in-left", { x: -30, autoAlpha: 0, duration: 0.7, ease: "power3.out", delay: 0.15 });
      gsap.from(".rg-in-right", { x: 30, autoAlpha: 0, duration: 0.7, ease: "power3.out", delay: 0.25 });
    }, root);
    return () => ctx.revert();
  }, []);

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

      <div className="rg-in-left absolute left-4 top-4 z-20"><TwinCard /></div>

      <aside className="rg-in-right absolute right-4 top-4 bottom-4 z-20 glass flex flex-col" style={{ width: RIGHT_W }} data-testid="right-panel">
        <div className="scroll flex-1 min-h-0 p-5"><TwinPanel /></div>
      </aside>

      <div className="absolute z-20 top-1/2 -translate-y-1/2" style={{ right: RIGHT_W + 32 }}><MapControls /></div>
      <HoverTip />

      {alert && (
        <button
          key={alert.id}
          className="absolute top-5 z-30 -translate-x-1/2 glass !rounded-full pl-4 pr-5 py-2.5 flex items-center gap-3 text-[13px] popin"
          style={{ left: `calc(50% - ${RIGHT_W / 2 - 140}px)` }}
          onClick={() => selectDamage(alert.id, true)}
          data-testid="arrival-alert"
        >
          <span className="w-2 h-2 rounded-full bg-[#ff453a] animate-pulse" />
          <span className="font-medium">{alert.text}</span>
          <span className="text-muted text-[12px]">tap to view</span>
        </button>
      )}
    </div>
  );
}
