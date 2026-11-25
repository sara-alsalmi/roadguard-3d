import { Cartesian2, DistanceDisplayCondition, HorizontalOrigin, VerticalOrigin } from "cesium";

const RATIO = 3; // draw at 3x and show at 1/3: stays crisp on high-DPI screens and when the camera is close

const cache = new Map<string, string>();

/** Crisp dark "pill" with text, as an image (Cesium text labels are rasterised at 1x and look soft up close). */
export function labelImage(text: string, color = "#f5f5f7", sub?: string): string {
  const key = `${text}|${color}|${sub ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const font = "600 13px Inter, -apple-system, 'Segoe UI', sans-serif";
  const subFont = "500 11px Inter, -apple-system, 'Segoe UI', sans-serif";
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const w1 = probe.measureText(text).width;
  probe.font = subFont;
  const w2 = sub ? probe.measureText(sub).width : 0;
  const padX = 11;
  const h = sub ? 38 : 26;
  const w = Math.ceil(Math.max(w1, w2) + padX * 2);
  const c = document.createElement("canvas");
  c.width = w * RATIO;
  c.height = h * RATIO;
  const ctx = c.getContext("2d")!;
  ctx.scale(RATIO, RATIO);
  ctx.fillStyle = "rgba(28,28,30,0.9)";
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(0.5, 0.5, w - 1, h - 1, h / 2 > 14 ? 12 : h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.fillText(text, w / 2, sub ? 14 : h / 2 + 0.5);
  if (sub) {
    ctx.fillStyle = "rgba(235,235,245,0.62)";
    ctx.font = subFont;
    ctx.fillText(sub, w / 2, 28);
  }
  const url = c.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

/** Billboard options for a crisp label that floats above an entity. */
export function labelBillboard(text: string, opts: { color?: string; sub?: string; offsetY?: number; maxDistance?: number; below?: boolean } = {}) {
  return {
    image: labelImage(text, opts.color, opts.sub),
    scale: 1 / RATIO,
    verticalOrigin: opts.below ? VerticalOrigin.TOP : VerticalOrigin.BOTTOM,
    horizontalOrigin: HorizontalOrigin.CENTER,
    pixelOffset: new Cartesian2(0, opts.offsetY ?? -60),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
    distanceDisplayCondition: new DistanceDisplayCondition(0, opts.maxDistance ?? 2600),
  };
}
