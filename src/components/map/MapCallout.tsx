import { Cartesian3 } from "cesium";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useApp } from "../../store/appStore";
import { AnnotatedImage } from "../inspection/AnnotatedImage";
import { selectIncident } from "../simulation/actions";
import { ClassBadge, StatusBadge } from "../ui/common";
import { cameraController } from "./cameraController";
import { heightAt } from "./terrain";

const W = 252;

/** Photo callout pinned to the selected report on the map (like a Google Earth placemark balloon). */
export function MapCallout({ reservedRight, reservedLeft = 340 }: { reservedRight: number; reservedLeft?: number }) {
  const incident = useApp((s) => s.incidents.find((i) => i.id === s.selectedId));
  const ref = useRef<HTMLDivElement>(null);
  const id = incident?.id;
  const lon = incident?.lon;
  const lat = incident?.lat;

  useEffect(() => {
    const el = ref.current;
    const v = cameraController.viewerRef;
    if (!el || !v || id === undefined || lon === undefined || lat === undefined) return;
    const pos = Cartesian3.fromDegrees(lon, lat, heightAt(lon, lat) + 6);
    const place = () => {
      const sc = v.scene.cartesianToCanvasCoordinates(pos);
      if (!sc) {
        el.style.visibility = "hidden";
        return;
      }
      const maxX = v.canvas.clientWidth - reservedRight - W;
      const h = el.offsetHeight || 250;
      let x = sc.x + 30;
      if (x > maxX) x = sc.x - 30 - W;
      x = Math.min(Math.max(x, reservedLeft), Math.max(reservedLeft, maxX));
      const y = Math.min(Math.max(sc.y - h + 40, 16), v.canvas.clientHeight - h - 90);
      el.style.visibility = "visible";
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    place();
    const off = v.scene.postRender.addEventListener(place);
    return () => {
      off();
    };
  }, [id, lon, lat, reservedRight, reservedLeft]);

  if (!incident) return null;
  return (
    <div ref={ref} className="absolute left-0 top-0 z-20 glass !rounded-2xl p-2.5 popin" style={{ width: W, visibility: "hidden" }} data-testid="map-callout">
      <div className="flex items-start justify-between gap-2 mb-2 px-0.5">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight truncate">{incident.title}</div>
          <div className="text-[11px] text-muted font-mono">{incident.id}</div>
        </div>
        <button className="icon-btn !w-6 !h-6 shrink-0" onClick={() => selectIncident(null)} aria-label="Close photo"><X size={12} /></button>
      </div>
      {incident.imageUrl && <AnnotatedImage src={incident.imageUrl} annotations={incident.annotations} showBoxes alt={incident.title} />}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <ClassBadge cls={incident.cls} />
        <StatusBadge status={incident.status} />
      </div>
    </div>
  );
}
