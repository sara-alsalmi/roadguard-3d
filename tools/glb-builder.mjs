// Tiny glTF (GLB) mesh builder used by the model generators. +X forward, +Y up, Z across. Units: metres.

export class Builder {
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
      const big = p.pos.length / 3 > 65535;
      const pv = push(p.pos, Float32Array, 34962), nv = push(p.nor, Float32Array, 34962), iv = push(p.idx, big ? Uint32Array : Uint16Array, 34963);
      accs.push({ bufferView: pv, componentType: 5126, count: p.pos.length / 3, type: "VEC3", min, max });
      accs.push({ bufferView: nv, componentType: 5126, count: p.nor.length / 3, type: "VEC3" });
      accs.push({ bufferView: iv, componentType: big ? 5125 : 5123, count: p.idx.length, type: "SCALAR" });
      const a = accs.length - 3;
      const attributes = { POSITION: a, NORMAL: a + 1 };
      if (p.col && p.col.length === p.pos.length) {
        const cv = push(p.col, Float32Array, 34962);
        accs.push({ bufferView: cv, componentType: 5126, count: p.col.length / 3, type: "VEC3" });
        attributes.COLOR_0 = accs.length - 1;
      }
      prims.push({ attributes, indices: a + 2, material: m, mode: 4 });
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


/** Y-rotated box (angle in radians) - for cracks, debris, irregular rims. */
Builder.prototype.rbox = function (m, cx, cy, cz, sx, sy, sz, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const p = (dx, dz) => [cx + dx * c - dz * s, dz * c + dx * s + cz];
  const pts = [[-sx / 2, -sz / 2], [sx / 2, -sz / 2], [sx / 2, sz / 2], [-sx / 2, sz / 2]].map(([dx, dz]) => p(dx, dz));
  this.hex(m, pts.map(([x, z]) => [x, cy - sy / 2, z]), pts.map(([x, z]) => [x, cy + sy / 2, z]));
};

/** Slab with one edge lifted (raised / tilted paving slab). */
Builder.prototype.slab = function (m, cx, cz, sx, sz, h, lift) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  this.hex(m, [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], [[x0, h, z0], [x1, h + lift, z0], [x1, h + lift, z1], [x0, h, z1]]);
};


/** Material whose colour comes from the vertices (COLOR_0): use it only with mesh(). */
Builder.prototype.vmat = function (name, { metal = 0, rough = 0.9 } = {}) {
  const m = this.mat(name, [1, 1, 1], { metal, rough });
  this.mats[m].doubleSided = true;
  this.prims.get(m).col = [];
  return m;
};

/** Triangle mesh with per-vertex colours and smooth normals. verts [[x,y,z]], cols [[r,g,b]], tris [[a,b,c]] (counter-clockwise from outside). */
Builder.prototype.mesh = function (m, verts, cols, tris) {
  const p = this.prims.get(m);
  const base = p.pos.length / 3;
  const nor = verts.map(() => [0, 0, 0]);
  for (const [a, b, c] of tris) {
    const A = verts[a], B = verts[b], C = verts[c];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const k of [a, b, c]) for (let i = 0; i < 3; i++) nor[k][i] += n[i];
  }
  verts.forEach((q, i) => {
    const n = nor[i], l = Math.hypot(...n) || 1;
    p.pos.push(...q);
    p.nor.push(n[0] / l, n[1] / l, n[2] / l);
    p.col.push(...cols[i].map((v) => Math.pow(v, 2.2))); // glTF vertex colours are linear
  });
  for (const [a, b, c] of tris) p.idx.push(base + a, base + b, base + c);
};
