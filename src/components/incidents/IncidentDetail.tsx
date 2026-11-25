import { CheckCircle2, ChevronLeft, Check, Eye, LocateFixed, Truck, UserCheck, X } from "lucide-react";
import { useApp } from "../../store/appStore";
import type { Incident } from "../../types";
import { AnnotatedImage } from "../inspection/AnnotatedImage";
import {
  assignMaintenance,
  dismissPrediction,
  flyToLocation,
  followMaintenance,
  isDispatchable,
  resolveIncident,
  selectIncident,
  setReview,
  setSpeed,
} from "../simulation/actions";
import { ClassBadge, LocationBadge, StatusBadge } from "../ui/common";

/** Right-hand panel: everything about one report, with the prediction and the next action. */
export function IncidentDetail({ incident: i }: { incident: Incident }) {
  const dispatch = useApp((s) => s.dispatches[i.id]);
  const speed = useApp((s) => s.sim.speed);
  const phase = dispatch?.phase;
  const canAssign = i.status === "new" || i.status === "review";
  const demo = i.annotations.some((a) => a.source === "demo");
  const model = i.annotations.some((a) => a.source === "model");

  return (
    <div className="flex flex-col gap-4 popin" data-testid="incident-detail" key={i.id}>
      <button className="flex items-center gap-1 text-[13px] text-[#6cb4ff] self-start -ml-1" onClick={() => selectIncident(null)} data-testid="back-to-list"><ChevronLeft size={16} /> All reports</button>
      <div className="min-w-0">
        <div className="font-mono text-[11px] text-muted">{i.id}</div>
        <div className="h-display text-[19px] font-semibold leading-tight mt-0.5">{i.title}</div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={i.status} />
        <ClassBadge cls={i.cls} />
      </div>

      {i.imageUrl && (
        <div className="flex flex-col gap-2">
          <AnnotatedImage src={i.imageUrl} annotations={i.annotations} showBoxes alt={i.title} />
          <div className="flex items-center justify-between gap-2">
            <span className="label">Prediction</span>
            {demo ? <span className="chip chip-demo" data-testid="demo-badge">Demo</span> : model ? <span className="chip chip-ok" data-testid="model-badge">Model</span> : <span className="chip">Manual label</span>}
          </div>
          {i.annotations.map((a, k) => (
            <div key={k} className="flex items-center justify-between text-[13px]">
              <span>{a.cls === "pothole" ? "Pothole" : a.cls === "barrier" ? "Excavation barrier" : "Dilapidated sidewalk"}</span>
              <span className="text-muted text-[12px]">{typeof a.confidence === "number" ? `${(a.confidence * 100).toFixed(0)}% confidence` : "no confidence (demo)"}</span>
            </div>
          ))}
          {demo && <div className="text-[11.5px] text-muted leading-snug">Manually authored annotation on a demo illustration. Real predictions and confidence appear here once the model is connected.</div>}
        </div>
      )}

      <div className="rounded-2xl bg-white/[.06] p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="label">Location</span>
          <LocationBadge source={i.locationSource} />
        </div>
        <div className="font-mono text-[12px]">{i.lat.toFixed(5)}°N, {i.lon.toFixed(5)}°E</div>
        {i.source && <div className="text-[12px] text-muted">Detected by · <span className="text-text">{i.source}</span></div>}
        <button className="btn btn-sm self-start" onClick={() => void flyToLocation(i.lon, i.lat)}><LocateFixed size={13} /> Show on map</button>
      </div>

      {phase && (
        <div className="rounded-2xl bg-white/[.06] p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">
              {phase === "enroute" && "Team on the way"}
              {phase === "working" && "Team on site"}
              {phase === "done" && "Work finished, awaiting your review"}
            </span>
            {phase !== "done" && <button className="text-[12.5px] text-accent text-[#6cb4ff]" onClick={() => followMaintenance(i.id)} data-testid="follow-maint">Follow</button>}
          </div>
          {phase === "enroute" && <div className="progress"><i style={{ width: `${(dispatch?.progress ?? 0) * 100}%` }} /></div>}
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] text-muted">Simulation only, no physical repair.</span>
            <div className="seg !w-[104px]">
              {([1, 2, 4] as const).map((s) => <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)} data-testid={`speed-${s}`}>{s}×</button>)}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {i.status === "predicted" && (
          <>
            <div className="rounded-2xl bg-[#ff9f0a]/12 p-3 text-[12.5px] leading-snug text-[#ffc266]">Early warning from the road-camera network. Confirm to start a review, or dismiss it as a false alarm. Nothing is dispatched until you confirm.</div>
            <div className="flex gap-2">
              <button className="btn btn-primary flex-1 !h-10" onClick={() => setReview(i.id)} data-testid="confirm-prediction"><Check size={15} /> Confirm</button>
              <button className="btn flex-1 !h-10" onClick={() => dismissPrediction(i.id)} data-testid="dismiss-prediction"><X size={15} /> Dismiss</button>
            </div>
          </>
        )}
        {i.status === "new" && (
          <button className="btn btn-block" onClick={() => setReview(i.id)} data-testid="start-review"><Eye size={15} /> Start review</button>
        )}
        {canAssign && (
          <button className="btn btn-primary btn-block" disabled={!isDispatchable(i)} onClick={() => assignMaintenance(i.id)} data-testid="assign-maintenance">
            <UserCheck size={15} /> Assign team
          </button>
        )}
        {i.status === "assigned" && (
          <button className="btn btn-primary btn-block" disabled={phase !== "done"} onClick={() => resolveIncident(i.id)} data-testid="resolve">
            <CheckCircle2 size={15} /> Mark resolved
          </button>
        )}
        {i.status === "resolved" && <div className="text-[13px] text-center text-muted py-1 flex items-center justify-center gap-2"><Truck size={14} /> Resolved after review (simulation)</div>}
        {canAssign && !isDispatchable(i) && <div className="text-[11.5px] text-muted text-center">Teams can only be dispatched inside the demo corridor.</div>}
      </div>
    </div>
  );
}
