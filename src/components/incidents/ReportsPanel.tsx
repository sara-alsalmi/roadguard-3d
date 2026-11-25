import { CLASS_META } from "../../data/config";
import { isVisible, useApp } from "../../store/appStore";
import type { IncidentClass, IncidentStatus } from "../../types";
import { selectIncident } from "../simulation/actions";
import { ClassGlyph, StatusBadge } from "../ui/common";

const ALL_CLASSES = Object.keys(CLASS_META) as IncidentClass[];
const ALL_STATUSES: IncidentStatus[] = ["predicted", "new", "review", "assigned", "resolved"];

const TYPE_OPTIONS: { id: IncidentClass | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pothole", label: "Potholes" },
  { id: "barrier", label: "Barriers" },
  { id: "sidewalk", label: "Sidewalks" },
];
const STATUS_GROUPS: { id: string; label: string; statuses: IncidentStatus[] }[] = [
  { id: "all", label: "All", statuses: ALL_STATUSES },
  { id: "alerts", label: "Alerts", statuses: ["predicted", "new"] },
  { id: "active", label: "In progress", statuses: ["review", "assigned"] },
  { id: "done", label: "Done", statuses: ["resolved"] },
];

/** Filters live in the left card (Filters tab). Single-select keeps it calm. */
export function FiltersPanel() {
  const incidents = useApp((s) => s.incidents);
  const filters = useApp((s) => s.filters);
  const typeValue = filters.classes.length === 1 ? filters.classes[0] : "all";
  const sameSet = (a: IncidentStatus[], b: IncidentStatus[]) => a.length === b.length && a.every((x) => b.includes(x));
  const statusValue = STATUS_GROUPS.find((g) => sameSet(g.statuses, filters.statuses))?.id ?? "all";
  const setType = (v: IncidentClass | "all") => useApp.setState((s) => ({ filters: { ...s.filters, classes: v === "all" ? [...ALL_CLASSES] : [v] } }));
  const setStatus = (id: string) => useApp.setState((s) => ({ filters: { ...s.filters, statuses: [...(STATUS_GROUPS.find((g) => g.id === id)?.statuses ?? ALL_STATUSES)] } }));
  const shown = incidents.filter((i) => isVisible(i, filters)).length;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="label mb-1.5">Type</div>
        <div className="seg" role="group" aria-label="Filter by type">
          {TYPE_OPTIONS.map((o) => (
            <button key={o.id} aria-pressed={typeValue === o.id} onClick={() => setType(o.id)} data-testid={`filter-class-${o.id}`}>{o.label}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="label mb-1.5">Status</div>
        <div className="seg" role="group" aria-label="Filter by status">
          {STATUS_GROUPS.map((o) => (
            <button key={o.id} aria-pressed={statusValue === o.id} onClick={() => setStatus(o.id)} data-testid={`filter-status-${o.id}`}>{o.label}</button>
          ))}
        </div>
      </div>
      <div className="text-[11.5px] text-muted" data-testid="incident-count">{shown} of {incidents.length} reports shown</div>
    </div>
  );
}

/** Right panel (nothing selected): the live list of reports. */
export function ReportsList() {
  const incidents = useApp((s) => s.incidents);
  const filters = useApp((s) => s.filters);
  const selectedId = useApp((s) => s.selectedId);
  const live = useApp((s) => s.live);
  const visible = incidents.filter((i) => isVisible(i, filters));
  const open = incidents.filter((i) => i.status !== "resolved").length;
  const predicted = incidents.filter((i) => i.status === "predicted").length;

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full">
      <div className="flex items-baseline justify-between px-1">
        <div className="h-display text-[24px] font-semibold num leading-none" data-testid="incident-total">{incidents.length}<span className="text-[13px] font-medium text-muted ml-2">reports</span></div>
        <div className="text-[12.5px] text-muted flex items-center gap-2" data-testid="incident-open">
          {predicted > 0 && <span className="text-[#ff9f0a]">{predicted} to confirm</span>}
          <span>{open} open</span>
          {live && <span className="chip chip-ok !h-[20px]"><span className="dot bg-[#0a84ff] animate-pulse" /> Live</span>}
        </div>
      </div>
      <FiltersPanel />
      <div className="scroll flex-1 min-h-0 -mx-2 px-2 flex flex-col gap-0.5" data-testid="report-list">
        {visible.length === 0 && <div className="text-[13px] text-muted py-10 text-center">No reports match the filters.</div>}
        {[...visible].reverse().map((i) => (
          <button key={i.id} className="row" aria-current={selectedId === i.id} onClick={() => selectIncident(i.id)} data-testid={`incident-row-${i.id}`}>
            <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: `${CLASS_META[i.cls].color}26`, color: CLASS_META[i.cls].color }}><ClassGlyph cls={i.cls} size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium truncate">{i.title}</span>
              <span className="block text-[12px] text-muted font-mono">{i.id}</span>
            </span>
            <StatusBadge status={i.status} />
          </button>
        ))}
      </div>
    </div>
  );
}
