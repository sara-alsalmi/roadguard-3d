import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CLASS_META, STATUS_META } from "../../data/config";
import { useApp } from "../../store/appStore";
import type { IncidentClass, IncidentStatus } from "../../types";

const tip = {
  contentStyle: { background: "#0a1220", border: "1px solid rgba(148,163,184,.25)", borderRadius: 10, fontSize: 12, color: "#e5edf7" },
  itemStyle: { color: "#e5edf7" },
  cursor: { fill: "rgba(148,163,184,.08)" },
} as const;

export function Analytics() {
  const incidents = useApp((s) => s.incidents);
  const log = useApp((s) => s.log);

  const byClass = (Object.keys(CLASS_META) as IncidentClass[]).map((c) => ({
    name: CLASS_META[c].label,
    value: incidents.filter((i) => i.cls === c).length,
    color: CLASS_META[c].color,
  }));
  const byStatus = (Object.keys(STATUS_META) as IncidentStatus[]).map((s) => ({
    name: STATUS_META[s].label,
    value: incidents.filter((i) => i.status === s).length,
    color: STATUS_META[s].color,
  }));
  const resolved = incidents.filter((i) => i.status === "resolved").length;
  const rate = incidents.length ? Math.round((resolved / incidents.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-4" data-testid="analytics">
      <div>
        <div className="h-display text-[15px] font-semibold">Operational summary</div>
        <div className="text-[12px] text-muted mt-0.5">Computed live from the incident list · demo data.</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
          <div className="label">Total incidents</div>
          <div className="num text-[26px] font-semibold mt-1">{incidents.length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
          <div className="label">Resolved</div>
          <div className="num text-[26px] font-semibold mt-1 text-emerald">{rate}<span className="text-[15px] text-muted">%</span></div>
        </div>
      </div>

      <div>
        <div className="label mb-1">By class</div>
        <div style={{ height: 130 }}>
          <ResponsiveContainer>
            <BarChart data={byClass} layout="vertical" margin={{ left: 0, right: 14, top: 4, bottom: 4 }}>
              <XAxis type="number" allowDecimals={false} hide />
              <YAxis type="category" dataKey="name" width={128} tick={{ fill: "#8aa0b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...tip} />
              <Bar dataKey="value" radius={6} barSize={14} label={{ position: "right", fill: "#e5edf7", fontSize: 11 }} isAnimationActive={false}>
                {byClass.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <div className="label mb-1">By status</div>
        <div className="flex items-center gap-3">
          <div style={{ width: 120, height: 120 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byStatus.filter((d) => d.value > 0)} dataKey="value" innerRadius={34} outerRadius={54} paddingAngle={3} stroke="none" isAnimationActive={false}>
                  {byStatus.filter((d) => d.value > 0).map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip {...tip} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-1.5 text-[12px] flex-1">
            {byStatus.map((d) => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                <span className="text-muted flex-1">{d.name}</span>
                <span className="num">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="label mb-1.5">Activity</div>
        <div className="flex flex-col gap-1 max-h-[160px] scroll pr-1" data-testid="activity-log">
          {log.length === 0 && <div className="text-[12px] text-muted">No activity yet. Start an inspection.</div>}
          {log.map((l) => (
            <div key={l.id} className="flex gap-2 text-[12px] leading-snug">
              <span className="font-mono text-[10px] text-muted pt-0.5 shrink-0">{l.t}</span>
              <span style={{ color: l.tone === "ok" ? "#64d2ff" : l.tone === "warn" ? "#ffb84d" : "#d1d1d6" }}>{l.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
