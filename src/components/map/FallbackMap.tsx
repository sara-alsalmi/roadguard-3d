import { AlertTriangle } from "lucide-react";
import { CLASS_META } from "../../data/config";
import { routePolyline, useApp } from "../../store/appStore";

/** 2D schematic shown when WebGL / Cesium cannot start. Clearly labelled; never a blank screen. */
export function FallbackMap() {
  const incidents = useApp((s) => s.incidents);
  const message = useApp((s) => s.mapMessage);
  const lons = routePolyline.pts.map((p) => p[0]);
  const lats = routePolyline.pts.map((p) => p[1]);
  const [x0, x1] = [Math.min(...lons) - 0.002, Math.max(...lons) + 0.002];
  const [y0, y1] = [Math.min(...lats) - 0.002, Math.max(...lats) + 0.002];
  const W = 800;
  const H = 800 * ((y1 - y0) / ((x1 - x0) * Math.cos((24.71 * Math.PI) / 180)));
  const X = (lon: number) => ((lon - x0) / (x1 - x0)) * W;
  const Y = (lat: number) => H - ((lat - y0) / (y1 - y0)) * H;
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#0b1424]" data-testid="fallback-map">
      <div className="absolute top-24 left-1/2 -translate-x-1/2 glass px-4 py-2.5 flex items-center gap-2 text-[12.5px] z-10">
        <AlertTriangle size={15} className="text-amber" />
        <span><b>3D map unavailable</b> — showing a 2D schematic fallback. {message}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="max-h-[78vh] w-auto max-w-[70vw]" role="img" aria-label="Schematic of the demo corridor">
        <polyline points={routePolyline.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(" ")} fill="none" stroke="#0a84ff" strokeWidth="6" strokeLinecap="round" strokeOpacity=".7" />
        {incidents.map((i) => (
          <circle key={i.id} cx={X(i.lon)} cy={Y(i.lat)} r="9" fill={CLASS_META[i.cls].color} stroke="#0a1220" strokeWidth="3" />
        ))}
      </svg>
    </div>
  );
}
