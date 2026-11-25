import { ChevronLeft, ChevronRight, Crosshair, Film, RotateCw, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CLASS_META } from "../data/config";
import { SAMPLES } from "../data/samples";
import { useApp } from "../store/appStore";
import type { Incident, IncidentClass, MediaItem } from "../types";
import { AnnotatedImage } from "../components/inspection/AnnotatedImage";
import { ClassBadge, ClassGlyph, LocationBadge } from "../components/ui/common";
import { flyToLocation, goOverview, removeDamage, selectDamage } from "./actions";
import { CLASSES, datasetManifest, ingestFiles, loadDatasetCases, placeDamage } from "./ingest";

/** Right panel: upload photos / videos, the list of damages on the map, and the opened damage. */
export function TwinPanel() {
  const selected = useApp((s) => s.incidents.find((i) => i.id === s.selectedId));
  return selected ? <DamageView d={selected} /> : <Overview />;
}

function Overview() {
  const damages = useApp((s) => s.incidents);
  const [dataset, setDataset] = useState<Awaited<ReturnType<typeof datasetManifest>>>(null);
  useEffect(() => { void datasetManifest().then(setDataset); }, []);
  return (
    <div className="flex flex-col gap-5">
      {dataset && (
        <button className="btn btn-primary w-full justify-center" onClick={() => { loadDatasetCases(dataset); goOverview(); }} data-testid="load-dataset">
          Show {dataset.cases.length} real dataset cases
        </button>
      )}
      <UploadBox />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="label">On the map</span>
          <span className="text-muted text-[12px]">{damages.length}</span>
        </div>
        {damages.length === 0 && (
          <div className="text-[13px] text-muted leading-snug">
            Nothing yet. Upload road photos or videos, or{" "}
            <button className="text-[#6cb4ff]" onClick={loadExamples} data-testid="load-examples">load 3 examples</button>.
          </div>
        )}
        <div className="flex flex-col gap-1.5" data-testid="damage-list">
          {[...damages].reverse().map((d) => <DamageRow key={d.id} d={d} />)}
        </div>
      </div>
    </div>
  );
}

function loadExamples() {
  for (const s of SAMPLES) {
    placeDamage({
      cls: s.cls,
      media: [{ type: "image", url: s.url, name: s.label, annotations: s.annotations }],
      title: CLASS_META[s.cls].label,
      source: "Demo illustration (not a photo)",
    });
  }
}

function UploadBox() {
  const input = useRef<HTMLInputElement>(null);
  const [cls, setCls] = useState<IncidentClass>("pothole");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const take = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      const placed = await ingestFiles([...list], cls);
      if (placed.length === 1) selectDamage(placed[0].id, true);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="rounded-2xl border border-dashed p-4 flex flex-col items-center gap-1.5 text-center cursor-pointer transition-colors"
        style={{ borderColor: over ? "#0a84ff" : "rgba(255,255,255,0.18)", background: over ? "rgba(10,132,255,0.08)" : "rgba(255,255,255,0.03)" }}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files); }}
        data-testid="upload-box"
      >
        <Upload size={18} className="text-[#6cb4ff]" />
        <div className="text-[14px] font-medium">{busy ? "Placing on the map…" : "Upload photos or videos"}</div>
        <div className="text-[12px] text-muted leading-snug">Drop files here. Add the YOLO .txt label files too and the boxes and class come with them.</div>
        <input ref={input} type="file" multiple accept="image/*,video/*,.txt" className="hidden" onChange={(e) => void take(e.target.files)} data-testid="upload-input" />
      </div>
      <div>
        <div className="label mb-1.5">Class for files without a label</div>
        <div className="seg">
          {CLASSES.map((c) => (
            <button key={c} aria-selected={cls === c} onClick={() => setCls(c)} className="flex items-center justify-center gap-1.5">
              <ClassGlyph cls={c} size={13} /> {CLASS_META[c].label.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>
      <div className="text-[11.5px] text-muted leading-snug">The photos have no GPS, so each damage is placed at a simulated spot on a real Riyadh road.</div>
    </div>
  );
}

function DamageRow({ d }: { d: Incident }) {
  const first = d.media?.[0];
  const n = d.media?.length ?? 0;
  return (
    <button className="row flex items-center gap-3 rounded-xl p-2 text-left hover:bg-white/[.06]" onClick={() => selectDamage(d.id, true)} data-testid={`damage-${d.id}`}>
      <div className="w-14 h-11 rounded-lg overflow-hidden bg-black/40 shrink-0 grid place-items-center">
        {first?.type === "image" ? <img src={first.url} alt="" className="w-full h-full object-cover" /> : <Film size={16} className="text-muted" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium truncate">{d.title}</div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[11.5px] text-muted">
          <ClassGlyph cls={d.cls} size={11} /> {CLASS_META[d.cls].label} · {n} {n === 1 ? "file" : "files"}
        </div>
      </div>
    </button>
  );
}

function DamageView({ d }: { d: Incident }) {
  const media = d.media?.length ? d.media : d.imageUrl ? [{ type: "image", url: d.imageUrl, name: d.imageLabel ?? "", annotations: d.annotations } as MediaItem] : [];
  const [k, setK] = useState(0);
  const m = media[Math.min(k, media.length - 1)];

  return (
    <div className="flex flex-col gap-4 popin" key={d.id} data-testid="damage-view">
      <button className="flex items-center gap-1 text-[13px] text-[#6cb4ff] self-start -ml-1" onClick={() => selectDamage(null)} data-testid="back"><ChevronLeft size={16} /> All damages</button>
      <div>
        <div className="font-mono text-[11px] text-muted">{d.id}</div>
        <div className="h-display text-[19px] font-semibold leading-tight mt-0.5">{d.title}</div>
        <div className="flex items-center gap-2 flex-wrap mt-2"><ClassBadge cls={d.cls} /><LocationBadge source={d.locationSource} /></div>
      </div>

      {m && (
        <div className="flex flex-col gap-2">
          {m.type === "image" ? (
            <RotatableImage key={m.url} src={m.url} annotations={m.annotations} alt={d.title} />
          ) : (
            <video src={m.url} controls autoPlay muted loop playsInline className="w-full rounded-xl border border-white/10 bg-black" data-testid="damage-video" />
          )}
          {media.length > 1 && (
            <div className="flex items-center gap-2">
              <button className="icon-btn" aria-label="Previous" onClick={() => setK((k - 1 + media.length) % media.length)}><ChevronLeft size={16} /></button>
              <div className="flex gap-1.5 overflow-x-auto flex-1">
                {media.map((x, i) => (
                  <button key={i} onClick={() => setK(i)} className="w-12 h-9 rounded-md overflow-hidden shrink-0 grid place-items-center bg-black/40" style={{ outline: i === k ? "2px solid #0a84ff" : "none" }} aria-label={`File ${i + 1}`}>
                    {x.type === "image" ? <img src={x.url} alt="" className="w-full h-full object-cover" /> : <Film size={13} className="text-muted" />}
                  </button>
                ))}
              </div>
              <button className="icon-btn" aria-label="Next" onClick={() => setK((k + 1) % media.length)}><ChevronRight size={16} /></button>
            </div>
          )}
          <div className="text-[11.5px] text-muted break-all">{m.name}{m.capturedAt ? ` · ${m.capturedAt.slice(0, 16).replace("T", " ")}` : ""}</div>
          {m.annotations.map((a, i) => (
            <div key={i} className="flex items-center justify-between text-[13px]">
              <span className="flex items-center gap-1.5"><ClassGlyph cls={a.cls} size={12} /> {CLASS_META[a.cls].label}</span>
              <span className="text-muted text-[12px]">
                {typeof a.confidence === "number" ? `${(a.confidence * 100).toFixed(0)}% model confidence` : a.source === "manual" ? "dataset label" : "demo label"}
              </span>
            </div>
          ))}
          {m.type === "image" && m.annotations.length === 0 && <div className="text-[12px] text-muted">No boxes for this file.</div>}
        </div>
      )}

      <div className="rounded-2xl bg-white/[.06] p-3 flex flex-col gap-2">
        <div className="label">Where on the map</div>
        <div className="text-[12px] text-muted">Simulated position on a real road · {d.source}</div>
        <div className="font-mono text-[12px]">{d.lat.toFixed(5)}°N, {d.lon.toFixed(5)}°E</div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-sm" onClick={() => void flyToLocation(d.lon, d.lat, { range: 26, pitch: -34, duration: 1.6 })} data-testid="zoom"><Crosshair size={13} /> Close up</button>
          <button className="btn btn-sm" onClick={() => void flyToLocation(d.lon, d.lat, { range: 160, pitch: -50, duration: 1.8 })}>Wider view</button>
          <button className="btn btn-sm" onClick={() => removeDamage(d.id)} data-testid="remove"><Trash2 size={13} /> Remove</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Many dataset photos were stored sideways. Rotating turns the photo AND its boxes together (the labels stay correct,
 * because the boxes were drawn on the stored pixels).
 */
function RotatableImage({ src, annotations, alt }: { src: string; annotations: MediaItem["annotations"]; alt: string }) {
  const [rot, setRot] = useState(0);
  const [ratio, setRatio] = useState(1); // width / height of the stored image
  useEffect(() => {
    const im = new Image();
    im.onload = () => im.naturalHeight && setRatio(im.naturalWidth / im.naturalHeight);
    im.src = src;
  }, [src]);
  const side = rot % 180 !== 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: side ? `${1 / ratio}` : `${ratio}` }}>
        <div
          className="absolute left-1/2 top-1/2"
          style={{ width: side ? `${ratio * 100}%` : "100%", transform: `translate(-50%, -50%) rotate(${rot}deg)` }}
        >
          <AnnotatedImage src={src} annotations={annotations} showBoxes alt={alt} />
        </div>
      </div>
      <button className="btn btn-sm self-start" onClick={() => setRot((rot + 90) % 360)} data-testid="rotate"><RotateCw size={13} /> Rotate photo</button>
    </div>
  );
}
