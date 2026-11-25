import { Home, Info, Layers, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { CONFIG } from "../../data/config";
import { useApp } from "../../store/appStore";
import { goOverview } from "../../twin/actions";
import { cameraController } from "./cameraController";

/** Google-Earth-style navigation stack: zoom, compass, 2D/3D tilt, home, layer info. */
export function MapControls() {
  const mapInfo = useApp((s) => s.mapInfo);
  const [heading, setHeading] = useState(0);
  const [tilted, setTilted] = useState(true);
  const [info, setInfo] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      const v = cameraController.viewerRef;
      if (!v || v.isDestroyed()) return;
      setHeading((v.camera.heading * 180) / Math.PI);
      setTilted(v.camera.pitch > -1.45);
    }, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-end gap-2" data-testid="map-controls">
      {info && (
        <div className="glass w-[270px] p-3 text-[12px] leading-relaxed mb-1">
          <div className="font-semibold mb-1.5">Map layers</div>
          <div className="text-muted">Imagery · <span className="text-text">{mapInfo.imagery}</span></div>
          <div className="text-muted">Terrain · <span className="text-text">{mapInfo.terrain}</span></div>
          <div className="text-muted">Buildings · <span className="text-text">{mapInfo.buildings}</span></div>
          {!CONFIG.ionToken && <div className="text-amber mt-1.5">No Cesium ion token set: using public fallbacks.</div>}
          <div className="mt-2 pt-2 border-t border-white/10 text-muted">
            Incidents are <b className="text-text">simulated demo data</b>; positions are placements, not survey records.
          </div>
        </div>
      )}
      <div className="glass !rounded-xl flex flex-col overflow-hidden">
        <button className="map-btn" aria-label="Zoom in" title="Zoom in" onClick={() => cameraController.dolly(0.55)}><Plus size={18} /></button>
        <div className="h-px bg-white/10" />
        <button className="map-btn" aria-label="Zoom out" title="Zoom out" onClick={() => cameraController.dolly(1.8)}><Minus size={18} /></button>
      </div>
      <div className="glass !rounded-xl flex flex-col overflow-hidden">
        <button className="map-btn" aria-label="Face north" title="Face north" onClick={() => cameraController.reorient({ heading: 0 })}>
          <svg width="20" height="20" viewBox="0 0 24 24" style={{ transform: `rotate(${-heading}deg)`, transition: "transform .15s" }}>
            <path d="M12 3l4 9h-8z" fill="#ff453a" />
            <path d="M12 21l-4-9h8z" fill="#8aa0b8" />
          </svg>
        </button>
        <div className="h-px bg-white/10" />
        <button className="map-btn text-[12px] font-semibold" aria-label="Toggle 2D / 3D" title="Toggle 2D / 3D view"
          onClick={() => cameraController.reorient({ pitch: tilted ? -Math.PI / 2 + 0.0001 : -0.75 })}>
          {tilted ? "3D" : "2D"}
        </button>
        <div className="h-px bg-white/10" />
        <button className="map-btn" aria-label="Back to the roads" title="Back to the demo roads" onClick={goOverview}><Home size={17} /></button>
      </div>
      <div className="glass !rounded-xl overflow-hidden">
        <button className="map-btn" aria-label="Map layers and info" title="Map layers & info" aria-pressed={info} onClick={() => setInfo(!info)}>
          {info ? <Info size={17} /> : <Layers size={17} />}
        </button>
      </div>
    </div>
  );
}
