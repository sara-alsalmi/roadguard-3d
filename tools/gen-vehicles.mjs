// Procedurally builds the two vehicle models (public/models/*.glb). Original geometry, no third-party assets.
// Convention: +X forward, +Y up, Z across. Units: metres. Cesium maps glTF X to its local forward axis.
import { mkdirSync, writeFileSync } from "node:fs";

class Builder {
  constructor() { this.prims = new Map(); this.mats = []; }
  mat(name, color, { metal = 0.1, rough = 0.5, emissive = [0, 0, 0] } = {}) {
    const i = this.mats.length;
    this.mats.push({ name, pbrMetallicRoughness: { baseColorFactor: [...color, 1], metallicFactor: metal, roughnessFactor: rough }, emissiveFactor: emissive, doubleSided: false });
    this.prims.set(i, { pos: [], nor: [], idx: [] });
    return i;
  }
  quad(m, a, b, c, d) {
    const p = this.prims.get(m);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
    const base = p.pos.length / 3;
    for (const q of [a, b, c, d]) { p.pos.push(...q); p.nor.push(...n); }
    p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** hexahedron from 4 bottom + 4 top corners (counter-clockwise seen from above) */
  hex(m, bt, tp) {
    const [b0, b1, b2, b3] = bt, [t0, t1, t2, t3] = tp;
    this.quad(m, t0, t3, t2, t1); // top (normal up)
    this.quad(m, b0, b1, b2, b3); // bottom
    this.quad(m, b0, t0, t1, b1);
    this.quad(m, b1, t1, t2, b2);
    this.quad(m, b2, t2, t3, b3);
    this.quad(m, b3, t3, t0, b0);
  }
  box(m, cx, cy, cz, sx, sy, sz) { this.frustum(m, cx - sx / 2, cx + sx / 2, cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, sz / 2, sz / 2); }
  /** bottom spans x0..x1, top spans tx0..tx1 (slopes), half-widths zb (bottom) zt (top) */
  frustum(m, x0, x1, tx0, tx1, y0, y1, zb, zt) {
    // order so that normals point outward: corners (-x,-z)(+x,-z)(+x,+z)(-x,+z) viewed from +Y is clockwise, handled by quad winding below
    const bt = [[x0, y0, -zb], [x1, y0, -zb], [x1, y0, zb], [x0, y0, zb]];
    const tp = [[tx0, y1, -zt], [tx1, y1, -zt], [tx1, y1, zt], [tx0, y1, zt]];
    this.hex(m, bt, tp);
  }
  /** cylinder with axis along Z */
  cyl(m, cx, cy, cz, r, len, seg = 20) {
    const p = this.prims.get(m);
    const z0 = cz - len / 2, z1 = cz + len / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = [Math.cos(a0), Math.sin(a0)], c1 = [Math.cos(a1), Math.sin(a1)];
      const base = p.pos.length / 3;
      for (const [c, z] of [[c0, z0], [c1, z0], [c1, z1], [c0, z1]]) { p.pos.push(cx + c[0] * r, cy + c[1] * r, z); p.nor.push(c[0], c[1], 0); }
      p.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      for (const [z, nz] of [[z0, -1], [z1, 1]]) {
        const b = p.pos.length / 3;
        p.pos.push(cx, cy, z, cx + c0[0] * r, cy + c0[1] * r, z, cx + c1[0] * r, cy + c1[1] * r, z);
        for (let k = 0; k < 3; k++) p.nor.push(0, 0, nz);
        if (nz > 0) p.idx.push(b, b + 1, b + 2); else p.idx.push(b, b + 2, b + 1);
      }
    }
  }
  /** cylinder with vertical axis */
  vcyl(m, cx, y0, y1, cz, r, seg = 14) {
    const p = this.prims.get(m);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const base = p.pos.length / 3;
      for (const [a, y] of [[a0, y0], [a1, y0], [a1, y1], [a0, y1]]) { p.pos.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r); p.nor.push(Math.cos(a), 0, Math.sin(a)); }
      p.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      const b = p.pos.length / 3;
      p.pos.push(cx, y1, cz, cx + Math.cos(a0) * r, y1, cz + Math.sin(a0) * r, cx + Math.cos(a1) * r, y1, cz + Math.sin(a1) * r);
      for (let k = 0; k < 3; k++) p.nor.push(0, 1, 0);
      p.idx.push(b, b + 2, b + 1);
    }
  }
  glb(name) {
    const bufs = [], views = [], accs = [], prims = [];
    let offset = 0;
    const push = (arr, Type, target) => {
      const data = Buffer.from(new Type(arr).buffer);
      const pad = (4 - (data.length % 4)) % 4;
      views.push({ buffer: 0, byteOffset: offset, byteLength: data.length, target });
      bufs.push(data, Buffer.alloc(pad));
      offset += data.length + pad;
      return views.length - 1;
    };
    for (const [m, p] of this.prims) {
      if (!p.idx.length) continue;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p.pos[i + k]); max[k] = Math.max(max[k], p.pos[i + k]); }
      const pv = push(p.pos, Float32Array, 34962), nv = push(p.nor, Float32Array, 34962), iv = push(p.idx, Uint16Array, 34963);
      accs.push({ bufferView: pv, componentType: 5126, count: p.pos.length / 3, type: "VEC3", min, max });
      accs.push({ bufferView: nv, componentType: 5126, count: p.nor.length / 3, type: "VEC3" });
      accs.push({ bufferView: iv, componentType: 5123, count: p.idx.length, type: "SCALAR" });
      const a = accs.length - 3;
      prims.push({ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: m, mode: 4 });
    }
    const json = { asset: { version: "2.0", generator: "roadguard gen-vehicles" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, mesh: 0 }], meshes: [{ primitives: prims }], materials: this.mats, accessors: accs, bufferViews: views, buffers: [{ byteLength: offset }] };
    let js = Buffer.from(JSON.stringify(json));
    js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
    const bin = Buffer.concat(bufs);
    const head = Buffer.alloc(12); head.write("glTF", 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
    const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.write("JSON", 4);
    const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.write("BIN\0", 4);
    return Buffer.concat([head, jh, js, bh, bin]);
  }
}

const wheels = (b, tire, hub, xs, r, zOut, y = r) => {
  for (const x of xs) for (const z of [-zOut, zOut]) { b.cyl(tire, x, y, z, r, 0.32); b.cyl(hub, x, y, z + Math.sign(z) * 0.17, r * 0.55, 0.04, 14); }
};

// ---------------------------------------------------------------- inspection SUV
function inspection() {
  const b = new Builder();
  const white = b.mat("body", [0.96, 0.97, 0.98], { metal: 0.35, rough: 0.28 });
  const glass = b.mat("glass", [0.05, 0.09, 0.14], { metal: 0.7, rough: 0.08 });
  const dark = b.mat("trim", [0.08, 0.09, 0.1], { metal: 0.2, rough: 0.6 });
  const green = b.mat("stripe", [0.12, 0.8, 0.55], { metal: 0.2, rough: 0.4, emissive: [0.02, 0.18, 0.12] });
  const amber = b.mat("beacon", [1, 0.65, 0.1], { emissive: [1, 0.55, 0.05], rough: 0.3 });
  const lamp = b.mat("headlamp", [1, 1, 0.92], { emissive: [0.9, 0.9, 0.8] });
  const tail = b.mat("tail", [0.9, 0.1, 0.1], { emissive: [0.7, 0.05, 0.05] });
  const tire = b.mat("tire", [0.03, 0.03, 0.035], { rough: 0.9 });
  const hub = b.mat("hub", [0.7, 0.72, 0.75], { metal: 0.9, rough: 0.3 });
  const lens = b.mat("lens", [0.1, 0.9, 0.7], { emissive: [0.05, 0.7, 0.5] });
  // body: sloped hood, full-width lower
  b.frustum(white, -2.4, 2.45, -2.4, 2.2, 0.42, 1.12, 1.0, 0.98);
  // cabin (glass) sloping windshield
  b.frustum(glass, -1.55, 1.15, -1.45, 0.45, 1.12, 1.78, 0.93, 0.84);
  b.frustum(white, -1.5, 0.5, -1.5, 0.5, 1.78, 1.86, 0.88, 0.88); // roof
  // pillars between windows (white thin boxes)
  for (const z of [-0.9, 0.9]) b.box(white, -0.35, 1.45, z, 0.1, 0.66, 0.06);
  // bumpers & skid
  b.box(dark, 2.42, 0.55, 0, 0.18, 0.3, 1.9); b.box(dark, -2.42, 0.55, 0, 0.18, 0.3, 1.9);
  b.box(dark, 0, 0.36, 0, 4.7, 0.1, 1.84);
  // side stripe
  for (const z of [-1.012, 1.012]) b.box(green, 0, 0.82, z, 4.2, 0.1, 0.02);
  // lamps
  for (const z of [-0.7, 0.7]) { b.box(lamp, 2.28, 0.92, z, 0.12, 0.14, 0.34); b.box(tail, -2.4, 0.95, z, 0.08, 0.14, 0.3); }
  // roof light bar
  b.box(dark, -0.5, 1.9, 0, 0.3, 0.06, 1.2); b.box(amber, -0.5, 1.96, -0.35, 0.22, 0.08, 0.3); b.box(amber, -0.5, 1.96, 0.35, 0.22, 0.08, 0.3);
  // AI camera mast + sensor head (the "inspection rig")
  b.vcyl(dark, -1.25, 1.86, 2.45, 0, 0.05); b.box(dark, -1.25, 2.52, 0, 0.5, 0.16, 0.5); b.box(lens, -1.0, 2.52, 0, 0.04, 0.1, 0.26);
  b.box(lens, -1.25, 2.52, -0.26, 0.2, 0.08, 0.02); b.box(lens, -1.25, 2.52, 0.26, 0.2, 0.08, 0.02);
  wheels(b, tire, hub, [1.5, -1.55], 0.4, 0.92);
  return b.glb("RoadGuard inspection unit");
}

// ---------------------------------------------------------------- maintenance truck
function maintenance() {
  const b = new Builder();
  const orange = b.mat("body", [0.95, 0.45, 0.06], { metal: 0.3, rough: 0.35 });
  const dark = b.mat("chassis", [0.1, 0.11, 0.12], { rough: 0.6 });
  const glass = b.mat("glass", [0.05, 0.09, 0.14], { metal: 0.7, rough: 0.08 });
  const yellow = b.mat("hazard", [1, 0.82, 0.1], { rough: 0.5 });
  const amber = b.mat("beacon", [1, 0.65, 0.1], { emissive: [1, 0.55, 0.05] });
  const white = b.mat("white", [0.95, 0.95, 0.95], { rough: 0.4 });
  const tire = b.mat("tire", [0.03, 0.03, 0.035], { rough: 0.9 });
  const hub = b.mat("hub", [0.7, 0.72, 0.75], { metal: 0.9, rough: 0.3 });
  const lamp = b.mat("headlamp", [1, 1, 0.92], { emissive: [0.9, 0.9, 0.8] });
  const tail = b.mat("tail", [0.9, 0.1, 0.1], { emissive: [0.7, 0.05, 0.05] });
  b.box(dark, 0, 0.75, 0, 6.2, 0.3, 1.9); // chassis
  b.frustum(orange, 1.55, 3.1, 1.55, 2.95, 0.9, 2.1, 1.05, 1.0); // cab
  b.frustum(glass, 2.0, 3.09, 2.1, 2.97, 1.35, 2.0, 1.01, 0.96);
  b.box(white, 2.45, 2.15, 0, 1.3, 0.08, 1.9); // cab roof
  b.box(orange, -0.9, 1.15, 0, 3.4, 0.5, 2.1); // flatbed
  for (const z of [-1.05, 1.05]) b.box(orange, -0.9, 1.65, z, 3.4, 0.5, 0.08);
  b.box(orange, -2.6, 1.65, 0, 0.08, 0.5, 2.1);
  // asphalt-patch pallets
  b.box(dark, -1.6, 1.62, 0, 1.2, 0.4, 1.1); b.box(white, -0.2, 1.55, 0, 0.9, 0.25, 0.9);
  // crane
  b.box(dark, -2.2, 1.7, 0.55, 0.3, 0.5, 0.3);
  b.frustum(yellow, -2.25, -1.15, -1.6, -0.5, 1.9, 2.9, 0.1, 0.1);
  // hazard bar & beacon
  b.box(yellow, -2.78, 1.2, 0, 0.1, 0.34, 2.0); b.box(dark, -2.8, 1.2, 0, 0.06, 0.12, 1.8);
  b.box(amber, 2.2, 2.28, 0, 0.3, 0.18, 0.5);
  for (const z of [-0.75, 0.75]) { b.box(lamp, 3.1, 1.15, z, 0.1, 0.16, 0.34); b.box(tail, -2.8, 0.95, z, 0.06, 0.16, 0.3); }
  wheels(b, tire, hub, [2.25, -1.7, -2.5], 0.5, 0.95, 0.5);
  return b.glb("RoadGuard maintenance unit");
}

mkdirSync("public/models", { recursive: true });
writeFileSync("public/models/inspection.glb", inspection());
writeFileSync("public/models/maintenance.glb", maintenance());
console.log("vehicle models written");
