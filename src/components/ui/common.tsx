import gsap from "gsap";
import { useEffect, useRef } from "react";
import { CLASS_META, LOCATION_META, STATUS_META } from "../../data/config";
import { CLASS_ICON_SVG } from "./classIcons";
import type { IncidentClass, IncidentStatus, LocationSource } from "../../types";

export function ClassGlyph({ cls, size = 18 }: { cls: IncidentClass; size?: number }) {
  const icon = CLASS_ICON_SVG[cls];
  // trusted, bundled SVG markup (UIX Icons, MIT)
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden dangerouslySetInnerHTML={{ __html: icon.body }} />;
}

export function ClassBadge({ cls }: { cls: IncidentClass }) {
  return (
    <span className="chip">
      <ClassGlyph cls={cls} size={13} />
      {CLASS_META[cls].label}
    </span>
  );
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span className="chip">
      <span className="dot" style={{ background: STATUS_META[status].color }} />
      {STATUS_META[status].label}
    </span>
  );
}

export function LocationBadge({ source }: { source: LocationSource }) {
  const tone = source === "verified" ? "chip-ok" : source === "manual" ? "" : "chip-demo";
  return (
    <span className={`chip ${tone}`} title={LOCATION_META[source].hint}>
      {LOCATION_META[source].label} location
    </span>
  );
}

/** Number that tweens to its new value (GSAP). */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const state = useRef({ v: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tween = gsap.to(state.current, {
      v: value,
      duration: 0.6,
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = String(Math.round(state.current.v));
      },
    });
    return () => {
      tween.kill();
    };
  }, [value]);
  return (
    <span ref={ref} className={className} data-value={value}>
      {value}
    </span>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
