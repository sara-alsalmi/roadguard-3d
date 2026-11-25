import { CLASS_META, STATUS_META } from "../../data/config";
import { classIconSvg } from "../ui/classIcons";
import type { IncidentClass, IncidentStatus } from "../../types";

const cache = new Map<string, string>();

const glyphImgs = new Map<IncidentClass, HTMLImageElement>();

/** Decode the bundled class icons once, before the first pin is drawn. */
export function preloadGlyphs(): Promise<void> {
  const classes = Object.keys(CLASS_META) as IncidentClass[];
  return Promise.all(
    classes.map(
      (cls) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            glyphImgs.set(cls, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(classIconSvg(cls, "#1c1c1e", 1.7));
        }),
    ),
  ).then(() => undefined);
}

function glyph(ctx: CanvasRenderingContext2D, cls: IncidentClass, cx: number, cy: number) {
  const img = glyphImgs.get(cls);
  if (img) ctx.drawImage(img, cx - 17, cy - 17, 34, 34);
}

/** Teardrop map pin: fill = class colour, ring/dot = status. */
export function markerIcon(cls: IncidentClass, status: IncidentStatus): string {
  const key = `${cls}:${status}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 72;
  const H = 92;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
    const st = STATUS_META[status].color;
  const color = CLASS_META[cls].color;
  ctx.globalAlpha = status === "resolved" ? 0.72 : 1;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  // pin body
  ctx.beginPath();
  ctx.moveTo(W / 2, H - 6);
  ctx.bezierCurveTo(W / 2 - 6, H - 22, 8, 46, 8, 34);
  ctx.arc(W / 2, 34, 28, Math.PI, 0);
  ctx.bezierCurveTo(W - 8, 46, W / 2 + 6, H - 22, W / 2, H - 6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#1c1c1e";
  ctx.stroke();
  // inner disc
  ctx.beginPath();
  ctx.arc(W / 2, 34, 21, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  glyph(ctx, cls, W / 2, 34);
  // status dot
  ctx.beginPath();
  ctx.arc(W - 12, 12, 9.5, 0, Math.PI * 2);
  ctx.fillStyle = st;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#0a1220";
  ctx.stroke();
  if (status === "resolved") {
    ctx.beginPath();
    ctx.moveTo(W - 16.5, 12);
    ctx.lineTo(W - 12.5, 16);
    ctx.lineTo(W - 7, 8.5);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#08111f";
    ctx.stroke();
  }
  const url = c.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

export function clusterIcon(n: number): string {
  const key = `cluster:${n}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 72;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 30, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10,18,32,0.92)";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#0a84ff";
  ctx.stroke();
  ctx.fillStyle = "#e6fff4";
  ctx.font = "700 28px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), S / 2, S / 2 + 1);
  const url = c.toDataURL("image/png");
  cache.set(key, url);
  return url;
}
