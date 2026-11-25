// Procedural 3D models of the three damage types (public/models/{pothole,barrier,sidewalk}.glb), modelled on what the
// Saudi visual-pollution photos show. Representative shapes, NOT scans of real damage.
// +X = direction of travel, +Y up, +Z = right-hand side (away from the road centre). Units: metres.
import { mkdirSync, writeFileSync } from "node:fs";
import { Builder } from "./glb-builder.mjs";

const rnd = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => c1.map((v, i) => lerp(v, c2[i], t));
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
// cheap smooth value noise
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, z) => {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(hash(xi, zi), hash(xi + 1, zi), u), lerp(hash(xi, zi + 1), hash(xi + 1, zi + 1), u), v);
};
const fbm = (x, z) => vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 5, z * 2.1 + 3) * 0.3 + vnoise(x * 4.3 + 9, z * 4.3 + 1) * 0.15;
const speck = (c, amt) => { const k = (rnd() - 0.5) * amt; return c.map((v) => clamp(v + k)); };

const ASPHALT = [0.27, 0.27, 0.28];
const ASPHALT_EDGE = [0.4, 0.4, 0.41]; // close to the road colour on the satellite imagery, so the edge blends in

/** polar heightfield: rings x angles, f(t, angle) -> { y, c } where t = r / boundary(angle) */
function polarField(b, m, boundary, tMax, rings, segs, f) {
  const verts = [], cols = [], tris = [];
  const centre = f(0, 0);
  verts.push([0, centre.y, 0]); cols.push(centre.c);
  for (let i = 1; i <= rings; i++) {
    const t = (i / rings) * tMax;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const r = boundary(a) * t;
      const { y, c } = f(t, a);
      verts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
      cols.push(c);
    }
  }
  const idx = (i, j) => (i === 0 ? 0 : 1 + (i - 1) * segs + (j % segs));
  for (let j = 0; j < segs; j++) tris.push([0, idx(1, j + 1), idx(1, j)]);
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = idx(i, j), bb = idx(i, j + 1), c = idx(i + 1, j + 1), d = idx(i + 1, j);
      tris.push([a, bb, c], [a, c, d]);
    }
  }
  b.mesh(m, verts, cols, tris);
}

/** rectangular heightfield over [x0,x1] x [z0,z1] */
function gridField(b, m, x0, x1, z0, z1, nx, nz, f) {
  const verts = [], cols = [], tris = [];
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const x = lerp(x0, x1, i / nx), z = lerp(z0, z1, j / nz);
    const { y, c } = f(x, z);
    verts.push([x, y, z]); cols.push(c);
  }
  const id = (i, j) => i * (nz + 1) + j;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) tris.push([id(i, j), id(i, j + 1), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i + 1, j)]);
  b.mesh(m, verts, cols, tris);
}

// ------------------------------------------------------------------ pothole
function pothole() {
  const b = new Builder();
  const ground = b.vmat("broken asphalt", { rough: 0.95 });
  const chunk = b.mat("asphalt chunk", [0.2, 0.2, 0.21], { rough: 0.95 });
  const chunk2 = b.mat("asphalt chunk light", [0.33, 0.33, 0.34], { rough: 0.95 });
  const crack = b.mat("crack", [0.05, 0.05, 0.055], { rough: 1 });
  const D = 0.15; // depth (m)
  const boundary = (a) => 0.62 * (1 + 0.17 * Math.sin(3 * a + 1.3) + 0.09 * Math.sin(5 * a + 0.4) + 0.05 * Math.sin(11 * a)) * (Math.abs(Math.cos(a)) * 0.35 + 1);
  polarField(b, ground, boundary, 1.45, 36, 72, (t, a) => {
    const n = fbm(Math.cos(a) * 3 + t * 2, Math.sin(a) * 3 + t * 2);
    if (t <= 1) {
      // bowl: flat rough bottom, steep broken walls
      const wall = smooth(0.62, 1.0, t);
      const y = -D * (1 - wall) - 0.018 * n * (1 - wall);
      const bottom = speck(mix([0.07, 0.07, 0.075], [0.18, 0.16, 0.14], n * 0.6), 0.09); // wet dark grit with gravel
      const side = speck(mix([0.36, 0.32, 0.27], [0.25, 0.23, 0.21], n), 0.06); // exposed base course
      return { y, c: mix(bottom, side, smooth(0.5, 0.85, t)) };
    }
    if (t <= 1.12) return { y: 0.012 * n, c: speck(mix([0.44, 0.44, 0.45], ASPHALT, (t - 1) / 0.12), 0.05) }; // fractured edge
    // cracked, worn asphalt that fades into the road
    const k = smooth(1.12, 1.45, t);
    const y = 0.004 * (1 - k) * n;
    return { y, c: speck(mix(mix(ASPHALT, [0.2, 0.2, 0.21], n * 0.5), ASPHALT_EDGE, k), 0.04) };
  });
  // standing water in the deepest part
  const wv = [[0, -D * 0.72, 0]], wc = [[0, 0, 0]], wt = [];
  const S = 40;
  for (let j = 0; j < S; j++) {
    const a = (j / S) * Math.PI * 2;
    const r = boundary(a) * (0.5 + 0.06 * Math.sin(4 * a + 2));
    wv.push([Math.cos(a) * r, -D * 0.72, Math.sin(a) * r]); wc.push([0, 0, 0]);
  }
  for (let j = 0; j < S; j++) wt.push([0, 1 + ((j + 1) % S), 1 + j]);
  const wm = b.vmat("water surface", { metal: 0, rough: 0.03 });
  b.mesh(wm, wv, wc.map(() => [0.09, 0.11, 0.13]), wt);
  // loose chunks of asphalt on the rim and inside
  for (let i = 0; i < 18; i++) {
    const a = rnd() * Math.PI * 2;
    const r = boundary(a) * (i < 12 ? 0.95 + rnd() * 0.35 : 0.3 + rnd() * 0.4);
    const y = i < 12 ? 0.02 : -D * 0.6;
    b.rbox(rnd() < 0.6 ? chunk : chunk2, Math.cos(a) * r, y, Math.sin(a) * r, 0.05 + rnd() * 0.12, 0.03 + rnd() * 0.03, 0.04 + rnd() * 0.09, rnd() * 3);
  }
  // hairline cracks running out of the hole
  for (let i = 0; i < 7; i++) {
    let a = (i / 7) * Math.PI * 2 + rnd() * 0.4;
    let r = boundary(a) * 1.05;
    let x = Math.cos(a) * r, z = Math.sin(a) * r;
    for (let s = 0; s < 4; s++) {
      const len = 0.18 + rnd() * 0.22, dir = a + (rnd() - 0.5) * 0.9;
      const nx = x + Math.cos(dir) * len, nz = z + Math.sin(dir) * len;
      b.rbox(crack, (x + nx) / 2, 0.006, (z + nz) / 2, len, 0.008, 0.012 + rnd() * 0.01, -dir);
      x = nx; z = nz;
    }
  }
  return b.glb("Pothole");
}

// ------------------------------------------------------------------ excavation behind barriers
function jersey(b, m, cx, cz, alongX, len = 1.0) {
  // plastic water-filled barrier: wide foot, narrow top, 0.8 m high
  const hw0 = 0.23, hw1 = 0.09, h = 0.8, l = len / 2 - 0.02;
  const P = (dx, y, dz) => (alongX ? [cx + dx, y, cz + dz] : [cx + dz, y, cz + dx]);
  const bt = [P(-l, 0, -hw0), P(l, 0, -hw0), P(l, 0, hw0), P(-l, 0, hw0)];
  const mid = [P(-l, 0.3, -hw0 * 0.8), P(l, 0.3, -hw0 * 0.8), P(l, 0.3, hw0 * 0.8), P(-l, 0.3, hw0 * 0.8)];
  const tp = [P(-l, h, -hw1), P(l, h, -hw1), P(l, h, hw1), P(-l, h, hw1)];
  b.hex(m, alongX ? bt : [bt[0], bt[3], bt[2], bt[1]], alongX ? mid : [mid[0], mid[3], mid[2], mid[1]]);
  b.hex(m, alongX ? mid : [mid[0], mid[3], mid[2], mid[1]], alongX ? tp : [tp[0], tp[3], tp[2], tp[1]]);
}

function barrier() {
  const b = new Builder();
  const dirt = b.vmat("excavated soil", { rough: 1 });
  const orange = b.mat("barrier orange", [0.93, 0.36, 0.05], { rough: 0.45 });
  const white = b.mat("barrier white", [0.93, 0.93, 0.9], { rough: 0.45 });
  const cone = b.mat("cone", [0.98, 0.35, 0.04], { rough: 0.5 });
  const band = b.mat("reflective band", [0.95, 0.95, 0.95], { rough: 0.2, metal: 0.2 });
  const black = b.mat("rubber base", [0.08, 0.08, 0.09], { rough: 0.8 });
  const steel = b.mat("steel", [0.55, 0.56, 0.58], { metal: 0.7, rough: 0.4 });
  const lamp = b.mat("warning lamp", [1, 0.75, 0.2], { emissive: [1, 0.55, 0.05], rough: 0.3 });
  const signR = b.mat("sign red", [0.8, 0.08, 0.06], { rough: 0.5 });
  const signW = b.mat("sign white", [0.95, 0.95, 0.93], { rough: 0.5 });
  const pipe = b.mat("pipe", [0.15, 0.32, 0.6], { rough: 0.6 });

  // the dug-up patch: cut asphalt edge, soil mound and a trench
  const X = 1.9, Z = 1.05;
  gridField(b, dirt, -X, X, -Z, Z, 48, 28, (x, z) => {
    const ex = Math.abs(x) / X, ez = Math.abs(z) / Z;
    const edge = Math.max(ex, ez);
    const n = fbm(x * 2.2 + 3, z * 2.2 + 1);
    if (edge > 0.93) return { y: 0.01, c: speck([0.2, 0.2, 0.21], 0.04) }; // saw-cut asphalt edge
    const trench = Math.exp(-((z + 0.15) ** 2) / 0.06) * smooth(0.95, 0.6, ex);
    const mound = Math.exp(-(((x - 0.7) ** 2) / 0.35 + ((z - 0.45) ** 2) / 0.12)) * 0.32;
    const y = mound - trench * 0.45 + (n - 0.5) * 0.06;
    const sand = mix([0.62, 0.5, 0.35], [0.5, 0.39, 0.26], n);
    const deep = [0.24, 0.18, 0.13];
    return { y, c: speck(mix(sand, deep, clamp(trench * 1.3)), 0.06) };
  });
  // a pipe exposed in the trench
  for (let i = -3; i <= 3; i++) b.rbox(pipe, i * 0.5, -0.33, -0.15, 0.5, 0.12, 0.12, 0);

  // ring of alternating orange / white barriers around the dig
  let k = 0;
  for (let i = 0; i < 4; i++) for (const z of [-1.35, 1.35]) jersey(b, (k++ % 2) ? white : orange, -1.5 + i * 1.0, z, true);
  for (let i = 0; i < 2; i++) for (const x of [-2.25, 2.25]) jersey(b, (k++ % 2) ? white : orange, x, -0.5 + i * 1.0, false);
  b.box(lamp, -2.25, 0.88, -0.5, 0.12, 0.12, 0.12);
  b.box(lamp, 2.25, 0.88, 0.5, 0.12, 0.12, 0.12);

  // traffic cones on the approach
  for (const [x, z] of [[-3.0, -1.1], [-3.4, -0.2], [-3.0, 0.7]]) {
    b.box(black, x, 0.015, z, 0.38, 0.03, 0.38);
    b.frustum(cone, x - 0.15, x + 0.15, x - 0.03, x + 0.03, 0.03, 0.72, 0.15, 0.03);
    b.frustum(band, x - 0.105, x + 0.105, x - 0.075, x + 0.075, 0.33, 0.46, 0.105, 0.075);
  }
  // "road works" warning sign on a stand
  const sx = -3.8, sz = -1.6;
  b.box(steel, sx, 0.6, sz, 0.04, 1.2, 0.04);
  b.box(steel, sx, 0.02, sz, 0.5, 0.04, 0.06);
  const tri = (m, r, y0, dx) => {
    const p = [[sx + dx, y0, sz - r], [sx + dx, y0, sz + r], [sx + dx, y0 + r * 1.7, sz]];
    b.quad(m, p[0], p[1], p[2], p[2]);
    b.quad(m, p[2], p[1], p[0], p[0]);
  };
  tri(signR, 0.42, 1.0, -0.03);
  tri(signW, 0.3, 1.08, -0.04);
  return b.glb("Excavation behind barriers");
}

// ------------------------------------------------------------------ dilapidated sidewalk
function sidewalk() {
  const b = new Builder();
  const greys = [[0.62, 0.62, 0.6], [0.56, 0.56, 0.55], [0.67, 0.66, 0.63], [0.5, 0.5, 0.5], [0.59, 0.58, 0.56]].map((c, i) => b.mat(`paver ${i}`, c, { rough: 0.9 }));
  const sand = b.vmat("bedding sand", { rough: 1 });
  const kerbB = b.mat("kerb black", [0.08, 0.08, 0.09], { rough: 0.7 });
  const kerbW = b.mat("kerb white", [0.9, 0.9, 0.88], { rough: 0.7 });
  const conc = b.mat("concrete", [0.6, 0.59, 0.56], { rough: 0.95 });
  const crack = b.mat("crack", [0.12, 0.12, 0.12], { rough: 1 });
  const L = 5.0, z0 = -1.25, z1 = 1.25, H = 0.16; // sidewalk raised H above the road

  // bedding sand under the pavers (visible where pavers are missing)
  gridField(b, sand, -L / 2, L / 2, z0 + 0.15, z1, 40, 20, (x, z) => {
    const n = fbm(x * 3, z * 3);
    return { y: H - 0.07 + (n - 0.5) * 0.03, c: speck(mix([0.76, 0.66, 0.5], [0.62, 0.53, 0.4], n), 0.05) };
  });
  // painted kerb (black / white blocks) along the road edge, one block broken off
  for (let i = 0; i < 10; i++) {
    const x = -L / 2 + 0.25 + i * 0.5;
    if (i === 6) { b.rbox(i % 2 ? kerbW : kerbB, x + 0.1, 0.05, z0 - 0.15, 0.3, 0.1, 0.14, 0.5); continue; }
    b.box(i % 2 ? kerbW : kerbB, x, H / 2 + 0.01, z0 + 0.07, 0.49, H + 0.02, 0.15);
  }
  // concrete edge strip
  b.box(conc, 0, H - 0.01, z0 + 0.2, L, 0.06, 0.1);

  // interlocking pavers, running bond; a broken patch in the middle
  const pw = 0.3, pd = 0.15;
  const hole = (x, z) => ((x - 0.3) ** 2) / 0.9 + ((z - 0.25) ** 2) / 0.35 < 1 + (fbm(x * 4, z * 4) - 0.5) * 0.8;
  const sunk = (x, z) => ((x + 1.3) ** 2) / 0.4 + ((z + 0.1) ** 2) / 0.3 < 1;
  for (let row = 0; z0 + 0.26 + row * pd < z1; row++) {
    const z = z0 + 0.26 + row * pd + pd / 2;
    const off = row % 2 ? pw / 2 : 0;
    for (let x = -L / 2 + pw / 2 - off; x < L / 2; x += pw) {
      if (x < -L / 2 + 0.05) continue;
      const m = greys[Math.floor(hash(x * 7.1, z * 3.3) * greys.length)];
      if (hole(x, z)) {
        if (rnd() < 0.25) b.rbox(m, x + (rnd() - 0.5) * 0.2, H - 0.03, z + (rnd() - 0.5) * 0.1, pw * (0.4 + rnd() * 0.4), 0.05, pd * (0.5 + rnd() * 0.5), rnd() * 3);
        continue;
      }
      const y = H - (sunk(x, z) ? 0.05 : 0) + (hash(x, z) - 0.5) * 0.008;
      const lift = sunk(x, z) ? 0 : hash(x * 2, z * 5) > 0.93 ? 0.05 : 0;
      b.slab(m, x, z, pw - 0.008, pd - 0.008, y, lift);
    }
  }
  // cracks across the paving
  for (let i = 0; i < 5; i++) b.rbox(crack, -2 + rnd() * 4, H + 0.003, z0 + 0.4 + rnd() * 2, 0.4 + rnd() * 0.5, 0.006, 0.015, rnd() * 3);
  return b.glb("Dilapidated sidewalk");
}

mkdirSync("public/models", { recursive: true });
writeFileSync("public/models/pothole.glb", pothole());
writeFileSync("public/models/barrier.glb", barrier());
writeFileSync("public/models/sidewalk.glb", sidewalk());
console.log("hazard models written");
