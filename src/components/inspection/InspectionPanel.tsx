import { AlertTriangle, Crosshair, ImagePlus, MapPin, PencilRuler, ScanSearch, ShieldCheck, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { CLASS_META } from "../../data/config";
import { SAMPLES } from "../../data/samples";
import { useApp } from "../../store/appStore";
import type { IncidentClass } from "../../types";
import {
  createReportFromDetection,
  dismissDetection,
  loadSample,
  loadUpload,
  runDetection,
} from "../simulation/actions";
import { ClassBadge, LocationBadge, Spinner } from "../ui/common";
import { AnnotatedImage } from "./AnnotatedImage";

export function InspectionPanel() {
  const d = useApp((s) => s.detection);
  const adapterId = useApp((s) => s.adapterId);
  const picking = useApp((s) => s.pickingLocation);
  const set = useApp((s) => s.set);
  const patch = useApp((s) => s.patchDetection);
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"original" | "annotated">("annotated");
  const [drawCls, setDrawCls] = useState<IncidentClass | null>(null);

  const isDemo = d ? d.adapter === "demo" : adapterId === "demo";
  const confirmedCount = d ? d.confirmed.filter(Boolean).length : 0;
  const canCreate = !!d && d.status === "done" && confirmedCount > 0 && !!d.draftLocation;

  const showAnnotatedServerImage = d?.annotatedImageUrl && view === "annotated";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="h-display text-[15px] font-semibold flex items-center gap-2">
            <ScanSearch size={16} className="text-emerald" /> AI Road Inspection
          </div>
          <div className="text-[12px] text-muted mt-0.5">Review detections, then create an incident report.</div>
        </div>
        {isDemo ? (
          <span className="chip chip-demo" data-testid="demo-badge">Simulation / Demo Data</span>
        ) : (
          <span className="chip chip-ok">Real model adapter</span>
        )}
      </div>

      {!d && (
        <>
          <div className="seg w-full" role="group" aria-label="Inference adapter">
            {(["demo", "real"] as const).map((a) => (
              <button key={a} className="flex-1" aria-pressed={adapterId === a} onClick={() => set({ adapterId: a })}>
                {a === "demo" ? "Demo adapter" : "Real model (FastAPI)"}
              </button>
            ))}
          </div>
          <div className="text-[12px] text-muted leading-relaxed">
            {adapterId === "demo"
              ? "The demo adapter returns manually authored annotations for bundled illustrations. It does not run a model and reports no confidence."
              : "Uploads are sent to POST /api/predict. Confidence is shown only when the inference server returns it."}
          </div>

          <div className="label">Bundled demo images</div>
          <div className="grid grid-cols-3 gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                onClick={() => loadSample(s.id)}
                className="group rounded-xl overflow-hidden border border-white/10 hover:border-emerald/60 transition text-left bg-black/30"
                data-testid={`sample-${s.cls}`}
              >
                <img src={s.url} alt={s.label} className="block w-full h-[62px] object-cover" />
                <div className="px-2 py-1.5 text-[11px] leading-tight" style={{ color: CLASS_META[s.cls].color }}>
                  {CLASS_META[s.cls].label}
                </div>
              </button>
            ))}
          </div>

          <button
            className="rounded-xl border border-dashed border-white/20 hover:border-emerald/60 hover:bg-white/[.03] transition p-4 flex flex-col items-center gap-1.5 text-[12px] text-muted"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) loadUpload(f);
            }}
          >
            <Upload size={18} className="text-emerald" />
            <span className="text-text font-medium text-[13px]">Upload a road image</span>
            JPG / PNG · or drop a file here
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden data-testid="upload-input" onChange={(e) => e.target.files?.[0] && loadUpload(e.target.files[0])} />
        </>
      )}

      {d && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {d.origin === "event" && <span className="chip chip-demo">Inspection event</span>}
              <span className="text-[12px] text-muted truncate">{d.imageLabel}</span>
            </div>
            <button className="btn btn-sm" onClick={dismissDetection} aria-label="Dismiss detection">
              <X size={13} /> {d.origin === "event" ? "Dismiss" : "Clear"}
            </button>
          </div>

          <div className="seg w-full" role="tablist">
            {(["original", "annotated"] as const).map((v) => (
              <button key={v} className="flex-1" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
                {v === "original" ? "Original" : "Annotated"}
              </button>
            ))}
          </div>

          <div className="relative">
            <AnnotatedImage
              src={showAnnotatedServerImage ? d.annotatedImageUrl! : d.imageUrl}
              annotations={d.detections}
              showBoxes={view === "annotated" && !showAnnotatedServerImage}
              dim={d.confirmed}
              drawClass={drawCls}
              onDraw={(a) => {
                patch({
                  status: "done",
                  error: undefined,
                  detections: [...d.detections, a],
                  confirmed: [...d.confirmed, true],
                  disclosure: d.disclosure ?? "Manual reviewer annotation",
                });
                setDrawCls(null);
              }}
              alt={d.imageLabel}
            />
            {d.status === "running" && (
              <div className="absolute inset-0 grid place-items-center bg-black/55 rounded-xl text-[12px] gap-1">
                <span className="flex items-center gap-2"><Spinner /> Running {d.adapter === "demo" ? "demo adapter" : "inference"}…</span>
              </div>
            )}
          </div>

          {d.disclosure && (
            <div className={`flex gap-2 text-[11.5px] leading-snug rounded-lg px-2.5 py-2 border ${isDemo ? "border-amber/30 bg-amber/10 text-[#fcd68a]" : "border-emerald/30 bg-emerald/10 text-[#a7f3d0]"}`}>
              <ShieldCheck size={14} className="shrink-0 mt-px" /> {d.disclosure}
            </div>
          )}

          {d.status === "error" && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-[12px] flex flex-col gap-2" role="alert">
              <div className="flex gap-2"><AlertTriangle size={14} className="text-danger shrink-0 mt-px" /> <span>{d.error}</span></div>
              <div className="flex gap-2">
                <button className="btn btn-sm" onClick={() => void runDetection()}>Retry</button>
                <span className="text-muted self-center">or draw a box manually below</span>
              </div>
            </div>
          )}

          {d.detections.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="label">Detections · review &amp; confirm</div>
              {d.detections.map((a, i) => (
                <label key={i} className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-emerald w-4 h-4"
                    checked={d.confirmed[i] ?? false}
                    onChange={(e) => patch({ confirmed: d.confirmed.map((c, j) => (j === i ? e.target.checked : c)) })}
                  />
                  <ClassBadge cls={a.cls} />
                  <span className="ml-auto text-[11px] text-muted text-right leading-tight">
                    {a.source === "model" ? (
                      typeof a.confidence === "number" ? <><span className="num text-text">{(a.confidence * 100).toFixed(1)}%</span> confidence</> : "model · no confidence"
                    ) : a.source === "demo" ? "demo annotation · no confidence" : "manual box"}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button
              className="btn btn-sm"
              aria-pressed={!!drawCls}
              onClick={() => setDrawCls(drawCls ? null : "pothole")}
              style={drawCls ? { borderColor: "#0a84ff" } : undefined}
            >
              <PencilRuler size={13} /> {drawCls ? "Drawing…" : "Draw box"}
            </button>
            {drawCls && (
              <div className="seg">
                {(Object.keys(CLASS_META) as IncidentClass[]).map((c) => (
                  <button key={c} aria-pressed={drawCls === c} onClick={() => setDrawCls(c)}>{CLASS_META[c].short}</button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[.03] p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="label flex items-center gap-1.5"><MapPin size={11} /> Report location</div>
              {d.draftLocation && <LocationBadge source={d.draftLocation.source} />}
            </div>
            {d.draftLocation ? (
              <div className="font-mono text-[12px] text-text">{d.draftLocation.lat.toFixed(5)}°N, {d.draftLocation.lon.toFixed(5)}°E</div>
            ) : (
              <div className="text-[12px] text-muted">No location yet. The dataset photos carry no GPS, so choose where this report belongs.</div>
            )}
            {d.origin === "manual" && (
              <button
                className={`btn btn-sm self-start ${picking ? "btn-amber" : ""}`}
                onClick={() => set({ pickingLocation: !picking })}
                data-testid="pick-location"
              >
                <Crosshair size={13} /> {picking ? "Click the map… (cancel)" : d.draftLocation ? "Change location on map" : "Pick location on map"}
              </button>
            )}
            {d.origin === "event" && (
              <div className="text-[11.5px] text-muted">Simulated placement from the scripted inspection event, not a survey fix.</div>
            )}
          </div>

          <button className="btn btn-primary h-10" disabled={!canCreate} onClick={() => createReportFromDetection()} data-testid="create-report">
            <ImagePlus size={15} /> Confirm &amp; create incident report
          </button>
          {!canCreate && d.status === "done" && (
            <div className="text-[11.5px] text-muted -mt-1">
              {confirmedCount === 0 ? "Confirm at least one detection." : "Choose a report location first."}
            </div>
          )}
        </>
      )}
    </div>
  );
}
