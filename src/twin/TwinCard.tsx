import { ShieldCheck } from "lucide-react";
import { CLASS_META } from "../data/config";
import { useApp } from "../store/appStore";
import type { IncidentClass } from "../types";
import { ClassGlyph, CountUp } from "../components/ui/common";

const TYPES = Object.keys(CLASS_META) as IncidentClass[];

/** Top-left card: what this is, live numbers, and the map key. */
export function TwinCard() {
  const damages = useApp((s) => s.incidents);
  const files = damages.reduce((n, d) => n + (d.media?.length ?? 1), 0);
  return (
    <aside className="glass p-3.5 flex flex-col gap-3 w-[270px]" data-testid="left-panel">
      <div className="flex items-center gap-3 px-0.5">
        <div className="w-9 h-9 rounded-xl grid place-items-center bg-white/12"><ShieldCheck size={19} /></div>
        <div className="min-w-0">
          <h1 className="h-display text-[16px] font-semibold leading-none">RoadGuard 3D</h1>
          <div className="text-[11px] text-muted mt-1 truncate">Digital twin · Riyadh roads</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-center">
        <Stat label="Damages" value={damages.length} testid="stat-damages" />
        <Stat label="Files" value={files} testid="stat-files" />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="label">Map key</div>
        {TYPES.map((t) => (
          <div key={t} className="flex items-center gap-2 text-[12.5px]"><ClassGlyph cls={t} size={13} /> {CLASS_META[t].label}</div>
        ))}
      </div>
      <div className="text-[11px] text-muted leading-snug">Zoom in on a pin to see the damage in 3D. Positions are simulated (the photos have no GPS).</div>
    </aside>
  );
}

function Stat({ label, value, suffix, testid }: { label: string; value: number; suffix?: string; testid: string }) {
  return (
    <div className="rounded-xl bg-white/[.06] py-2" data-testid={testid}>
      <div className="h-display text-[18px] font-semibold leading-none"><CountUp value={value} />{suffix}</div>
      <div className="text-[10.5px] text-muted mt-1">{label}</div>
    </div>
  );
}
