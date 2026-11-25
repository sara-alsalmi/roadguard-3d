// Procedural 3D models of the three hazard types (public/models/{pothole,barrier,sidewalk}.glb).
// Representative shapes, NOT scans of real damage. +X = direction of travel, +Y up, Z across the road.
import { mkdirSync, writeFileSync } from "node:fs";
import { Builder } from "./glb-builder.mjs";

const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

// ------------------------------------------------------------------ pothole
function pothole() {
  const b = new Builder();
  const halo = b.mat("disturbed asphalt", [0.36, 0.37, 0.4], { rough: 0.95 });
  const hole = b.mat("hole", [0.015, 0.015, 0.02], { rough: 1 });
  const deep = b.mat("deep", [0.0, 0.0, 0.0], { rough: 1 });
  const rim = b.mat("broken rim", [0.5, 0.51, 0.54], { rough: 0.9 });
  const crack = b.mat("crack", [0.03, 0.03, 0.035], { rough: 1 });
  b.vcyl(halo, 0, 0.0, 0.012, 0, 1.55, 28);
  b.vcyl(hole, 0.0, 0.012, 0.04, 0, 0.82, 26);
  b.vcyl(hole, 0.42, 0.012, 0.036, 0.15, 0.5, 20);
  b.vcyl(hole, -0.36, 0.012, 0.034, -0.22, 0.46, 20);
  b.vcyl(deep, 0.04, 0.04, 0.046, 0.02, 0.5, 18);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rnd() * 0.3;
    const r = 0.86 + rnd() * 0.22;
    b.rbox(rim, Math.cos(a) * r, 0.04, Math.sin(a) * r, 0.18 + rnd() * 0.22, 0.07 + rnd() * 0.05, 0.1 + rnd() * 0.12, a + 1.2 + rnd());
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    b.rbox(crack, Math.cos(a) * 1.35, 0.018, Math.sin(a) * 1.35, 0.9 + rnd() * 0.5, 0.012, 0.03, a + (rnd() - 0.5) * 0.5);
  }
  return b.glb("Pothole");
}

// ------------------------------------------------------------------ excavation barrier
function barrier() {
  const b = new Builder();
  const orange = b.mat("orange", [0.96, 0.42, 0.05], { rough: 0.5 });
  const white = b.mat("white", [0.96, 0.96, 0.94], { rough: 0.5 });
  const dark = b.mat("dark", [0.1, 0.1, 0.11], { rough: 0.7 });
  const amber = b.mat("lamp", [1, 0.7, 0.1], { emissive: [1, 0.6, 0.05], rough: 0.3 });
  const coneM = b.mat("cone", [0.98, 0.38, 0.04], { rough: 0.5 });
  const board = (y, h) => {
    const n = 8, len = 3.9;
    for (let i = 0; i < n; i++) b.box(i % 2 ? white : orange, 0, y, -len / 2 + (i + 0.5) * (len / n), 0.05, h, len / n);
    for (const z of [-len / 2 + 0.25, len / 2 - 0.25]) {
      b.box(dark, 0.0, y / 2, z, 0.06, y, 0.06);
      b.box(dark, 0.0, 0.02, z, 0.5, 0.04, 0.08);
    }
  };
  board(0.85, 0.24);
  board(0.5, 0.2);
  for (const z of [-2.35, 2.35, 0]) {
    const x = z === 0 ? -1.1 : -0.5;
    b.box(dark, x, 0.015, z, 0.4, 0.03, 0.4);
    b.frustum(coneM, x - 0.15, x + 0.15, x - 0.035, x + 0.035, 0.03, 0.72, 0.15, 0.035);
    b.frustum(white, x - 0.1, x + 0.1, x - 0.07, x + 0.07, 0.3, 0.45, 0.1, 0.07);
  }
  b.box(amber, 0, 1.05, 1.7, 0.16, 0.14, 0.16);
  return b.glb("Excavation barrier");
}

// ------------------------------------------------------------------ dilapidated sidewalk
function sidewalk() {
  const b = new Builder();
  const slabA = b.mat("slab", [0.78, 0.76, 0.71], { rough: 0.9 });
  const slabB = b.mat("old slab", [0.66, 0.64, 0.6], { rough: 0.95 });
  const kerb = b.mat("kerb", [0.58, 0.58, 0.58], { rough: 0.9 });
  const soil = b.mat("soil", [0.34, 0.25, 0.17], { rough: 1 });
  const crack = b.mat("crack", [0.06, 0.06, 0.06], { rough: 1 });
  const grout = b.mat("grout", [0.2, 0.2, 0.2], { rough: 1 });
  b.box(kerb, -0.95, 0.09, 0, 0.2, 0.18, 4.4);
  b.box(grout, 0.65, 0.01, 0, 2.2, 0.02, 4.4);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      const x = -0.35 + i * 0.66, z = -1.5 + j * 1.0;
      const k = (i * 5 + j * 3) % 7;
      if (k === 1) { b.box(soil, x, 0.025, z, 0.6, 0.05, 0.9); continue; }
      const lift = k === 3 ? 0.16 : k === 5 ? -0.05 : 0.0;
      b.slab(k % 2 ? slabB : slabA, x, z, 0.6, 0.92, 0.07, lift);
      if (k === 2 || k === 6) { b.rbox(crack, x, 0.075, z, 0.7, 0.012, 0.03, 0.9); b.rbox(crack, x, 0.075, z + 0.1, 0.5, 0.012, 0.03, -0.5); }
    }
  }
  for (let i = 0; i < 9; i++) b.rbox(slabB, -0.3 + rnd() * 1.8, 0.03, -1.9 + rnd() * 3.8, 0.1 + rnd() * 0.15, 0.05, 0.08 + rnd() * 0.1, rnd() * 3);
  return b.glb("Dilapidated sidewalk");
}

mkdirSync("public/models", { recursive: true });
writeFileSync("public/models/pothole.glb", pothole());
writeFileSync("public/models/barrier.glb", barrier());
writeFileSync("public/models/sidewalk.glb", sidewalk());
console.log("hazard models written");
