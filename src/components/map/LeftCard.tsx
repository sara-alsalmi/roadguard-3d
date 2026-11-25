import { MapPin, ShieldCheck } from "lucide-react";
import { CLASS_META, DEFAULT_CITY, STATUS_META } from "../../data/config";
import type { IncidentClass, IncidentStatus } from "../../types";
import { resetSimulation } from "../simulation/actions";
import { ClassGlyph } from "../ui/common";

/** Web-Mercator tile that contains Riyadh, used as a locator inset. */
const Z = 10;
const n = 2 ** Z;
const fx = ((DEFAULT_CITY.lon + 180) / 360) * n;
const latRad = (DEFAULT_CITY.lat * Math.PI) / 180;
const fy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
const tileX = Math.floor(fx);
const tileY = Math.floor(fy);
const TILE_PX = 512; // displayed size of the 256px tile (2x upscale)

const TYPES = Object.keys(CLASS_META) as IncidentClass[];
const STATUSES = Object.keys(STATUS_META) as IncidentStatus[];

/** Compact floating card (top-left): brand, where this is in Riyadh, and the map key. */
export function LeftCard() {
  const BOX_W = 288;
  const BOX_H = 120;
  const bx = BOX_W / 2 - (fx - tileX) * TILE_PX;
  const by = BOX_H / 2 - (fy - tileY) * TILE_PX;

  return (
    <aside className="glass p-3.5 flex flex-col gap-3 w-[316px]" data-testid="left-panel">
      <div className="flex items-center gap-3 px-0.5">
        <div className="w-9 h-9 rounded-xl grid place-items-center bg-white/12"><ShieldCheck size={19} /></div>
        <div className="min-w-0">
          <h1 className="h-display text-[16px] font-semibold leading-none">RoadGuard 3D</h1>
          <div className="text-[11px] text-muted mt-1 truncate">Saudi Road Infrastructure Intelligence</div>
        </div>
      </div>

      {/* where in Riyadh */}
      <div className="relative rounded-2xl overflow-hidden border border-white/10" style={{ width: BOX_W, height: BOX_H }} data-testid="locator">
        {[-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => (
          <img key={`${dx}:${dy}`} alt="" aria-hidden draggable={false}
            src={`https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${tileY + dy}/${tileX + dx}`}
            style={{ position: "absolute", width: TILE_PX, height: TILE_PX, left: bx + dx * TILE_PX, top: by + dy * TILE_PX, maxWidth: "none", filter: "saturate(0.85)" }} />
        )))}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5))" }} />
        <span className="absolute w-3 h-3 rounded-full bg-[#0a84ff] border-2 border-white" style={{ left: BOX_W / 2 - 6, top: BOX_H / 2 - 6 }} />
        <span className="absolute rounded-full border border-[#0a84ff]/70 animate-ping" style={{ left: BOX_W / 2 - 14, top: BOX_H / 2 - 14, width: 28, height: 28 }} />
        <div className="absolute left-3 bottom-2 flex items-center gap-1.5 text-[12px] font-medium"><MapPin size={13} /> Al Olaya · King Fahd Rd, Riyadh</div>
      </div>

      {/* map key */}
      <div className="flex flex-col gap-2.5" data-testid="legend">
        <div className="label">Map key</div>
        <div className="flex flex-col gap-1">
          <div className="text-[11px] text-muted">Pin type</div>
          <div className="grid grid-cols-3 gap-1.5">
            {TYPES.map((t) => (
              <div key={t} className="rounded-xl bg-white/[.06] py-2 px-1 flex flex-col items-center gap-1.5 text-center">
                <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: `${CLASS_META[t].color}26`, color: CLASS_META[t].color }}><ClassGlyph cls={t} size={16} /></span>
                <span className="text-[10.5px] leading-tight text-text">{t === "pothole" ? "Pothole" : t === "barrier" ? "Excavation barrier" : "Damaged sidewalk"}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] text-muted">Status (dot on the pin)</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {STATUSES.map((s) => (
              <span key={s} className="flex items-center gap-2 text-[11.5px]"><span className="dot" style={{ background: STATUS_META[s].color }} />{STATUS_META[s].label}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted"><span className="w-3.5 h-3.5 rounded-full border border-[#ff9f0a] bg-[#ff9f0a]/25 shrink-0" /> Pulsing ring = needs attention (Predicted / New)</div>
      </div>

      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="text-[10.5px] text-muted leading-snug" data-testid="integrity-note">Demo data · positions are placements, not survey records.</div>
        <button className="btn btn-sm shrink-0" onClick={() => resetSimulation()} data-testid="reset-demo" title="Reset the demo to its starting state">Reset</button>
      </div>
    </aside>
  );
}
