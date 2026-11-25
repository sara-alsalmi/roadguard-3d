import { STATUS_META } from "../../data/config";
import { useApp } from "../../store/appStore";
import { ClassBadge } from "../ui/common";

/** Small tooltip that follows the mouse over a map pin (like Google Earth). */
export function HoverTip() {
  const hover = useApp((s) => s.hover);
  const inc = useApp((s) => s.incidents.find((i) => i.id === s.hover?.id));
  if (!hover || !inc) return null;
  return (
    <div className="pointer-events-none fixed z-40 glass !rounded-xl px-3 py-2 flex flex-col gap-1.5 popin" style={{ left: hover.x + 16, top: hover.y + 14, maxWidth: 260 }} data-testid="hover-tip">
      <div className="text-[13px] font-semibold leading-tight">{inc.title}</div>
      <div className="flex items-center gap-2">
        <ClassBadge cls={inc.cls} />
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted"><span className="dot" style={{ background: STATUS_META[inc.status].color }} />{STATUS_META[inc.status].label}</span>
      </div>
    </div>
  );
}
