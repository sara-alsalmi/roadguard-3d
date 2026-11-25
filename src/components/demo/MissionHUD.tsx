import gsap from "gsap";
import { Pause, Play, RotateCcw, SkipForward, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useApp } from "../../store/appStore";
import { canAdvance, exitMission, MISSION_STEPS, nextMission, pauseMission, startMission } from "./missionController";

export function MissionHUD() {
  const m = useApp((s) => s.mission);
  // subscribe to the pieces canAdvance() reads so the button re-evaluates
    useApp((s) => s.detection?.status);
  useApp((s) => s.dispatches);
  const ref = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (m.active && ref.current) gsap.fromTo(ref.current, { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: "power3.out" });
  }, [m.active]);
  useEffect(() => {
    if (m.active && title.current) gsap.fromTo(title.current, { x: -14, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.45, ease: "power2.out" });
  }, [m.step, m.active]);

  if (!m.active) return null;
  const step = MISSION_STEPS[m.step];
  const done = m.step === MISSION_STEPS.length - 1;

  return (
    <div ref={ref} className="glass px-4 py-3 w-[min(680px,92vw)]" data-testid="mission-hud" data-step={m.step}>
      <div className="flex items-center gap-1.5 mb-3">
        {MISSION_STEPS.map((s, i) => (
          <div key={s.id} className="flex-1">
            <div className="h-1 rounded-full" style={{ background: i <= m.step ? "#0a84ff" : "rgba(255,255,255,.18)", opacity: i === m.step ? 1 : i < m.step ? 0.7 : 1 }} />
            <div className={`mt-1.5 text-[10px] font-mono tracking-wider ${i === m.step ? "text-emerald" : "text-muted"}`}>
              {String(i + 1).padStart(2, "0")} {s.title.toUpperCase()}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-end justify-between gap-4">
        <div ref={title} className="min-w-0">
          <div className="h-display text-[20px] font-semibold leading-tight">
            <span className="text-emerald">{String(m.step + 1).padStart(2, "0")}</span> — {step.title}
          </div>
          <div className="text-[12.5px] text-muted mt-1 leading-snug">{step.caption}</div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button className="btn btn-sm" onClick={pauseMission} data-testid="mission-pause" aria-label={m.paused ? "Resume mission" : "Pause mission"}>
            {m.paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <button className="btn btn-sm" onClick={nextMission} disabled={!canAdvance() || done} data-testid="mission-next" aria-label="Next step">
            <SkipForward size={13} /> Next
          </button>
          <button className="btn btn-sm" onClick={() => void startMission()} data-testid="mission-restart" aria-label="Restart mission">
            <RotateCcw size={13} />
          </button>
          <button className="btn btn-sm" onClick={exitMission} data-testid="mission-exit" aria-label="Exit mission">
            <X size={13} /> Exit
          </button>
        </div>
      </div>
    </div>
  );
}
