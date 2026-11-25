import { useRef, useState } from "react";
import { CLASS_META } from "../../data/config";
import type { Annotation, IncidentClass } from "../../types";

interface Props {
  src: string;
  annotations: Annotation[];
  showBoxes: boolean;
  /** when set, the user can drag a new manual box of this class */
  drawClass?: IncidentClass | null;
  onDraw?: (a: Annotation) => void;
  dim?: boolean[];
  alt: string;
}

/** Image with resolution-independent bounding boxes (normalised coordinates). */
export function AnnotatedImage({ src, annotations, showBoxes, drawClass, onDraw, dim, alt }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const pt = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  return (
    <div
      ref={box}
      className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40 select-none"
      style={{ cursor: drawClass ? "crosshair" : "default", touchAction: drawClass ? "none" : "auto" }}
      onPointerDown={(e) => {
        if (!drawClass) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = pt(e);
        setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const p = pt(e);
        setDrag({ ...drag, x1: p.x, y1: p.y });
      }}
      onPointerUp={() => {
        if (!drag || !drawClass) return setDrag(null);
        const x = Math.min(drag.x0, drag.x1);
        const y = Math.min(drag.y0, drag.y1);
        const w = Math.abs(drag.x1 - drag.x0);
        const h = Math.abs(drag.y1 - drag.y0);
        setDrag(null);
        if (w > 0.02 && h > 0.02) onDraw?.({ cls: drawClass, bbox: [x, y, w, h], source: "manual" });
      }}
    >
      <img src={src} alt={alt} className="block w-full h-auto" draggable={false} />
      {showBoxes &&
        annotations.map((a, i) => {
          const c = CLASS_META[a.cls].color;
          return (
            <div
              key={i}
              data-testid="bbox"
              className="absolute"
              style={{
                left: `${a.bbox[0] * 100}%`,
                top: `${a.bbox[1] * 100}%`,
                width: `${a.bbox[2] * 100}%`,
                height: `${a.bbox[3] * 100}%`,
                border: `2px solid ${c}`,
                borderRadius: 4,
                background: `${c}1f`,
                opacity: dim?.[i] === false ? 0.35 : 1,
                boxShadow: `0 0 0 1px rgba(0,0,0,.45), 0 0 18px ${c}55`,
              }}
            >
              <span
                className="absolute -top-px left-0 -translate-y-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                style={{ background: c, color: "#07101c", borderRadius: "4px 4px 0 0" }}
              >
                {CLASS_META[a.cls].label}
                {typeof a.confidence === "number" ? ` · ${(a.confidence * 100).toFixed(0)}%` : ""}
                {a.source === "demo" ? " · DEMO" : a.source === "manual" ? " · MANUAL" : ""}
              </span>
            </div>
          );
        })}
      {drag && (
        <div
          className="absolute border-2 border-dashed border-white/80 bg-white/10"
          style={{
            left: `${Math.min(drag.x0, drag.x1) * 100}%`,
            top: `${Math.min(drag.y0, drag.y1) * 100}%`,
            width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
            height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
          }}
        />
      )}
    </div>
  );
}
