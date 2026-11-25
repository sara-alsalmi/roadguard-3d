// Ready-made class icons: UIX Icons (MIT) - https://github.com/mdrakibshekh/uix-icons, fetched from Iconify.
// 24x24 viewBox, stroke="currentColor". Do not hand-edit; swap the SVG bodies to change the icon set.
import type { IncidentClass } from "../../types";

export const CLASS_ICON_SVG: Record<IncidentClass, { body: string; strokeWidth: string }> = {
  pothole: { body: "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M2.5 5h4l2 4.5l2-1l2 2.5l2-2l1.5 1l1.5-5h4v14h-19Zm0 9.5h19\"/>", strokeWidth: "1.5" },
  barrier: { body: "<path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\" d=\"M5.625 4.5h12.75A2.625 2.625 0 0 1 21 7.125v.75a2.625 2.625 0 0 1-2.625 2.625H5.625A2.625 2.625 0 0 1 3 7.875v-.75A2.625 2.625 0 0 1 5.625 4.5m3.125 6l3-6m3 6l3-6M6 10.5L3.5 19M18 10.5l2.5 8.5\"/>", strokeWidth: "1.5" },
  sidewalk: { body: "<g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"><path d=\"M7.313 6h11.854a1.75 1.75 0 0 1 1.68 2.24l-2.48 8.5A1.75 1.75 0 0 1 16.688 18H4.833a1.75 1.75 0 0 1-1.68-2.24l2.48-8.5A1.75 1.75 0 0 1 7.313 6m6.437 0l-3.5 12\"/><path d=\"m17.5 6l-1.75 4l2 3l-2.5 5\"/></g>", strokeWidth: "1.5" },
};

/** Standalone SVG markup (for canvas / image use) in the given colour. */
export const classIconSvg = (cls: IncidentClass, color: string, strokeWidth?: number) => {
  const i = CLASS_ICON_SVG[cls];
  const body = i.body.replace(/stroke-width="[d.]+"/g, `stroke-width="${strokeWidth ?? i.strokeWidth}"`).replace(/currentColor/g, color);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96">${body}</svg>`;
};
