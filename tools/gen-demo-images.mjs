// Generates the three bundled demo illustrations (public/demo/*.svg).
// These are stylised ILLUSTRATIONS, not photographs from the Saudi Roads dataset.
// Bounding boxes in src/data/samples.ts were authored by hand against these files.
import { mkdirSync, writeFileSync } from "node:fs";

const W = 1200;
const H = 800;
const HZ = 270; // horizon y

// perspective helpers: road centre at x=600 at horizon, widening to the bottom
const xl = (y) => 560 - ((y - HZ) / (H - HZ)) * 860; // left road edge
const xr = (y) => 640 + ((y - HZ) / (H - HZ)) * 860; // right road edge

function base(extra = "") {
  const dashes = [];
  for (let i = 0; i < 9; i++) {
    const t0 = Math.pow(i / 9, 1.8);
    const t1 = Math.pow((i + 0.55) / 9, 1.8);
    const y0 = HZ + t0 * (H - HZ);
    const y1 = HZ + t1 * (H - HZ);
    const w0 = 1.2 + t0 * 22;
    const w1 = 1.2 + t1 * 22;
    dashes.push(`<polygon points="${600 - w0},${y0} ${600 + w0},${y0} ${600 + w1},${y1} ${600 - w1},${y1}" fill="#e8e6dc" opacity="0.92"/>`);
  }
  const towers = [];
  const seed = [60, 150, 90, 210, 130, 70, 180, 110, 240, 95, 160, 75];
  seed.forEach((h, i) => towers.push(`<rect x="${i * 105 - 20}" y="${HZ - h}" width="${70 + (i % 3) * 22}" height="${h + 4}" fill="#9aa8b6" opacity="${0.35 + (i % 4) * 0.08}"/>`));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fc4e4"/><stop offset="1" stop-color="#f3e6cb"/></linearGradient>
  <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a6f78"/><stop offset="1" stop-color="#3b3f46"/></linearGradient>
  <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9c29a"/><stop offset="1" stop-color="#b79c70"/></linearGradient>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .22 0"/></filter>
  <radialGradient id="hole" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#0d0e11"/><stop offset=".7" stop-color="#22252a"/><stop offset="1" stop-color="#3a3e45"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${towers.join("")}
<rect y="${HZ}" width="${W}" height="${H - HZ}" fill="url(#sand)"/>
<polygon points="${xl(HZ)},${HZ} ${xr(HZ)},${HZ} ${xr(H)},${H} ${xl(H)},${H}" fill="url(#road)"/>
<polygon points="${xl(HZ)},${HZ} ${xr(HZ)},${HZ} ${xr(H)},${H} ${xl(H)},${H}" filter="url(#grain)"/>
<polygon points="${xl(HZ) + 2},${HZ} ${xl(HZ) + 5},${HZ} ${xl(H) + 70},${H} ${xl(H) + 20},${H}" fill="#ddd9ca" opacity=".85"/>
<polygon points="${xr(HZ) - 5},${HZ} ${xr(HZ) - 2},${HZ} ${xr(H) - 20},${H} ${xr(H) - 70},${H}" fill="#ddd9ca" opacity=".85"/>
${dashes.join("")}
${extra}
<g font-family="IBM Plex Sans, Arial, sans-serif" font-size="20" font-weight="600">
  <rect x="18" y="${H - 52}" width="360" height="34" rx="8" fill="#0a1220" opacity=".78"/>
  <text x="32" y="${H - 29}" fill="#fcd68a">DEMO ILLUSTRATION · NOT A DATASET PHOTO</text>
</g>
</svg>`;
}

// ---------- pothole: bbox 510,570 → 770,670
const crack = (x1, y1, x2, y2, x3, y3) => `<path d="M${x1} ${y1} L${x2} ${y2} L${x3} ${y3}" stroke="#16181b" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85"/>`;
const pothole = base(`
  <ellipse cx="640" cy="626" rx="134" ry="50" fill="#2a2d32"/>
  <ellipse cx="640" cy="620" rx="118" ry="42" fill="url(#hole)"/>
  <ellipse cx="624" cy="612" rx="62" ry="17" fill="#07080a" opacity=".85"/>
  <ellipse cx="640" cy="616" rx="122" ry="45" fill="none" stroke="#7d828a" stroke-width="4" opacity=".7"/>
  ${crack(520, 600, 470, 585, 430, 560)}${crack(760, 598, 815, 578, 850, 560)}${crack(650, 664, 662, 700, 640, 740)}${crack(580, 580, 560, 540, 566, 505)}
`);

// ---------- barriers: bbox 330,470 → 810,590
const barrierUnit = (x, y, w) => {
  const stripes = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    stripes.push(`<polygon points="${x + (i * w) / n},${y} ${x + ((i + 0.5) * w) / n},${y} ${x + ((i + 0.5) * w) / n - 14},${y + 26} ${x + (i * w) / n - 14},${y + 26}" fill="${i % 2 ? "#ffffff" : "#e8590c"}"/>`);
  }
  return `<g>
    <rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="32" rx="5" fill="#222"/>
    ${stripes.join("")}
    <rect x="${x + 10}" y="${y + 28}" width="10" height="50" fill="#44484f"/><rect x="${x + w - 20}" y="${y + 28}" width="10" height="50" fill="#44484f"/>
  </g>`;
};
const cone = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><polygon points="-16,0 16,0 6,-58 -6,-58" fill="#f2711c"/><rect x="-20" y="0" width="40" height="8" rx="2" fill="#2a2d32"/><rect x="-11" y="-30" width="22" height="9" fill="#fff"/></g>`;
const barrier = base(`
  <rect x="318" y="568" width="500" height="18" rx="9" fill="#14161a" opacity=".35"/>
  ${barrierUnit(335, 480, 150)}${barrierUnit(492, 480, 150)}${barrierUnit(649, 480, 150)}
  ${cone(300, 640, 1.05)}${cone(836, 640, 1.05)}
  <rect x="320" y="590" width="490" height="6" fill="#0d0e11" opacity=".55"/>
`);

// ---------- sidewalk: a wide paved footpath seen along its length, damaged slabs in the middle
const U = (y) => (y - HZ) / (H - HZ);
const SL = (y) => 600 - 760 * U(y); // left edge (kerb)
const SR = (y) => 600 + 820 * U(y); // right edge
const ROWS = 15, COLS = 7;
const rowY = (i) => HZ + Math.pow(i / ROWS, 1.7) * (H - HZ);
const cellX = (y, j) => SL(y) + ((SR(y) - SL(y)) * j) / COLS;
const DMG = { r0: 8, r1: 13, c0: 2, c1: 6 }; // damaged block (rows r0..r1-1, cols c0..c1-1)
const tilesSvg = [];
const poly = (pts, fill, extra = "") => `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="${fill}" ${extra}/>`;
for (let i = 0; i < ROWS; i++) {
  const y0 = rowY(i), y1 = rowY(i + 1);
  for (let j = 0; j < COLS; j++) {
    const quad = [[cellX(y0, j), y0], [cellX(y0, j + 1), y0], [cellX(y1, j + 1), y1], [cellX(y1, j), y1]];
    const inD = i >= DMG.r0 && i < DMG.r1 && j >= DMG.c0 && j < DMG.c1;
    const k = (i * 7 + j * 3) % 5;
    if (inD && k === 1) { tilesSvg.push(poly(quad, "#5b4a33", 'stroke="#2c2418" stroke-width="2"')); continue; } // missing slab: bare soil
    const base = inD ? ["#b8b2a4", "#a39d8f", "#bdb7a9", "#9a9486", "#aea898"][k] : ["#d8d3c6", "#d2cdc0", "#dcd7ca"][(i + j) % 3];
    tilesSvg.push(poly(quad, base, 'stroke="#8b867a" stroke-width="2"'));
    if (inD && k === 3) { // cracked slab
      const cx = (quad[0][0] + quad[2][0]) / 2, cy = (quad[0][1] + quad[2][1]) / 2;
      tilesSvg.push(`<path d="M${quad[0][0] + 6} ${quad[0][1] + 4} L${cx} ${cy} L${quad[2][0] - 6} ${quad[2][1] - 4} M${cx} ${cy} L${quad[3][0] + 8} ${quad[3][1] - 4}" stroke="#2a2824" stroke-width="3.5" fill="none" stroke-linecap="round"/>`);
    }
    if (inD && k === 4) tilesSvg.push(poly(quad.map(([x, y]) => [x + 5, y - 7]), "#c9c3b5", 'opacity=".55" stroke="#6e695e" stroke-width="2"')); // lifted slab
  }
}
const dy0 = rowY(DMG.r0), dy1 = rowY(DMG.r1);
const bx0 = Math.min(cellX(dy0, DMG.c0), cellX(dy1, DMG.c0)), bx1 = Math.max(cellX(dy0, DMG.c1), cellX(dy1, DMG.c1));
console.log("sidewalk bbox (normalised):", JSON.stringify([+(bx0 / W).toFixed(4), +(dy0 / H).toFixed(4), +((bx1 - bx0) / W).toFixed(4), +((dy1 - dy0) / H).toFixed(4)]));
const sidewalk = base(`
  ${poly([[500, HZ], [600, HZ], [SL(H), H], [SL(H) - 900, H]], "#4a4f57")}
  ${poly([[598, HZ], [602, HZ], [SL(H) + 0, H], [SL(H) - 40, H]], "#e4dfd2")}
  ${poly([[600, HZ], [602, HZ], [SR(H), H], [SL(H), H]], "#cfcabd")}
  ${tilesSvg.join("")}
  ${poly([[SL(HZ + 40) - 4, HZ + 40], [SL(HZ + 40) + 2, HZ + 40], [SL(H) + 8, H], [SL(H) - 28, H]], "#efe9da")}
`);

mkdirSync("public/demo", { recursive: true });
writeFileSync("public/demo/pothole.svg", pothole);
writeFileSync("public/demo/barrier.svg", barrier);
writeFileSync("public/demo/sidewalk.svg", sidewalk);
console.log("demo images written");
