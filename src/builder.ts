// Geometry builder with baked per-vertex lighting (the building has hundreds of
// fluorescent tubes; we pay for them once, in a worker, instead of per frame).
import type { BufferGeometry } from "three";
import { CELL, CH, H } from "./config";
import { getFurnished, type Light } from "./furnish";
import { K, kindAt, lightPass } from "./layout";
import { SCALE } from "./layers";

export type V3 = [number, number, number];
export type RGB = readonly [number, number, number];

export interface Spec {
  layer: number;
  emit?: RGB; // emissive colour, skips lighting
  tint?: RGB;
  uv?: [number, number, number, number]; // explicit u0 v0 u1 v1
  flick?: number; // flicker phase for emissive fixtures
  radio?: number; // emissive only while this station (index into STATIONS) is on the air
  live?: number | "any"; // a screen showing the live studio video of this station (or whichever is streaming); hidden otherwise
}

export class LightCtx {
  lights: Light[] = [];
  buckets = new Map<number, number[]>();
  vis = new Map<number, boolean>();
  bx: number;
  bz: number;
  constructor(public f: number, cx: number, cz: number, public mode: "indoor" | "outdoor" = "indoor") {
    this.bx = (cx - 1) * CH;
    this.bz = (cz - 1) * CH;
    if (mode === "outdoor") return;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const fu = getFurnished(f, cx + dx, cz + dz);
        for (const l of fu.lights) if (l.on) this.add(l);
      }
  }
  private add(l: Light) {
    const li = this.lights.length;
    this.lights.push(l);
    const r = Math.ceil(l.range / CELL);
    for (let z = l.gz - r; z <= l.gz + r; z++)
      for (let x = l.gx - r; x <= l.gx + r; x++) {
        const k = this.key(x, z);
        if (k < 0) continue;
        let b = this.buckets.get(k);
        if (!b) this.buckets.set(k, (b = []));
        b.push(li);
      }
  }
  key(gx: number, gz: number) {
    const x = gx - this.bx, z = gz - this.bz;
    if (x < 0 || z < 0 || x >= CH * 3 || z >= CH * 3) return -1;
    return z * CH * 3 + x;
  }
  visible(li: number, gx: number, gz: number): boolean {
    const ck = this.key(gx, gz);
    const vk = li * 1296 + ck;
    const c = this.vis.get(vk);
    if (c !== undefined) return c;
    const l = this.lights[li]!;
    let res = true;
    if (l.gx !== gx || l.gz !== gz) {
      // Amanatides-Woo walk in cell units from the light to the cell centre
      const x = l.x / CELL, z = l.z / CELL;
      const ex = gx + 0.5, ez = gz + 0.5;
      let cx = l.gx, cz = l.gz;
      const dx = ex - x, dz = ez - z;
      const sx = Math.sign(dx), sz = Math.sign(dz);
      let tMaxX = dx !== 0 ? ((sx > 0 ? cx + 1 : cx) - x) / dx : Infinity;
      let tMaxZ = dz !== 0 ? ((sz > 0 ? cz + 1 : cz) - z) / dz : Infinity;
      const tdX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
      const tdZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
      for (let n = 0; n < 12; n++) {
        if (cx === gx && cz === gz) break;
        if (tMaxX < tMaxZ) {
          if (!lightPass(this.f, cx, cz, sx > 0 ? 0 : 2)) { res = false; break; }
          cx += sx;
          tMaxX += tdX;
        } else {
          if (!lightPass(this.f, cx, cz, sz > 0 ? 1 : 3)) { res = false; break; }
          cz += sz;
          tMaxZ += tdZ;
        }
      }
      if (cx !== gx || cz !== gz) res = false;
    }
    this.vis.set(vk, res);
    return res;
  }
  // out: r g b flickAmount flickPhase
  at(px: number, py: number, pz: number, nx: number, ny: number, nz: number, gx: number, gz: number, out: number[]) {
    let r = 0, g = 0, b = 0, fr = 0, fp = 0, fmax = 0;
    const k = this.mode === "outdoor" ? K.ROOF : kindAt(this.f, gx, gz);
    if (k === K.ROOF) {
      const s = 0.62 + 0.38 * ny + 0.08 * nx - 0.05 * nz;
      out[0] = 0.66 * s; out[1] = 0.69 * s; out[2] = 0.74 * s; out[3] = 0; out[4] = 0;
      return out;
    }
    const amb = k === K.GARAGE ? 0.026 : 0.038;
    r = amb * 0.95; g = amb; b = amb * 1.12;
    const bucket = this.buckets.get(this.key(gx, gz));
    if (bucket)
      for (const li of bucket) {
        const l = this.lights[li]!;
        const dx = l.x - px, dy = l.y - py, dz = l.z - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > l.range * l.range) continue;
        if (!this.visible(li, gx, gz)) continue;
        const d = Math.sqrt(d2) + 1e-4;
        const t = 1 - d / l.range;
        const att = (t * t) / (1 + d * 0.15);
        const ndl = (nx * dx + ny * dy + nz * dz) / d;
        const w = Math.max(0, ndl * 0.78 + 0.22) * att;
        r += l.r * w; g += l.g * w; b += l.b * w;
        if (l.flick) {
          const lum = (l.r + l.g + l.b) * w;
          fr += lum;
          if (lum > fmax) { fmax = lum; fp = l.flick; }
        }
      }
    out[0] = r; out[1] = g; out[2] = b;
    const tot = r + g + b;
    out[3] = tot > 0 ? Math.min(1, fr / tot) : 0;
    out[4] = fp;
    return out;
  }
}

const tmp = [0, 0, 0, 0, 0];

export class Builder {
  P: number[] = [];
  UV: number[] = [];
  LY: number[] = [];
  LI: number[] = [];
  FL: number[] = [];
  IX: number[] = [];
  gP: number[] = [];
  gC: number[] = [];
  gIX: number[] = [];
  boxes: number[] = [];
  gx = 0;
  gz = 0;
  // offset added when sampling light, for geometry built around a local origin
  ox = 0;
  oy = 0;
  oz = 0;
  constructor(public ctx: LightCtx) {}

  cell(gx: number, gz: number) {
    this.gx = gx;
    this.gz = gz;
    return this;
  }

  private vert(x: number, y: number, z: number, u: number, v: number, s: Spec, nx: number, ny: number, nz: number) {
    this.P.push(x, y, z);
    this.UV.push(u, v);
    this.LY.push(s.layer);
    if (s.emit) {
      this.LI.push(s.emit[0], s.emit[1], s.emit[2]);
      if (s.live !== undefined) this.FL.push(s.live === "any" ? -1 : -1 - s.live, s.live === "any" ? 2 : 1);
      else if (s.radio !== undefined) this.FL.push(-1 - s.radio, 0);
      else this.FL.push(s.flick ? 1 : 0, s.flick ?? 0);
    } else {
      this.ctx.at(x + this.ox + nx * 0.05, y + this.oy + ny * 0.05, z + this.oz + nz * 0.05, nx, ny, nz, this.gx, this.gz, tmp);
      const t = s.tint;
      if (t) this.LI.push(tmp[0]! * t[0], tmp[1]! * t[1], tmp[2]! * t[2]);
      else this.LI.push(tmp[0]!, tmp[1]!, tmp[2]!);
      this.FL.push(tmp[3]!, tmp[4]!);
    }
  }

  // Quad from origin o spanned by edges a and b, facing n. UVs at corners come
  // from spec.uv or world scale. Subdivided for lighting when `sub` > 0.
  quad(o: V3, a: V3, b: V3, n: V3, s: Spec, sub = 1.0, uvRect?: [number, number, number, number]) {
    const la = Math.hypot(a[0], a[1], a[2]);
    const lb = Math.hypot(b[0], b[1], b[2]);
    const na = sub > 0 && !s.emit ? Math.max(1, Math.min(8, Math.round(la / sub))) : 1;
    const nb = sub > 0 && !s.emit ? Math.max(1, Math.min(8, Math.round(lb / sub))) : 1;
    let u0: number, v0: number, u1: number, v1: number;
    if (s.uv) [u0, v0, u1, v1] = s.uv;
    else if (uvRect) [u0, v0, u1, v1] = uvRect;
    else {
      const sc = SCALE[s.layer]!;
      u0 = 0; v0 = 0; u1 = la / sc; v1 = lb / sc;
    }
    const base = this.P.length / 3;
    for (let j = 0; j <= nb; j++)
      for (let i = 0; i <= na; i++) {
        const ta = i / na, tb = j / nb;
        this.vert(
          o[0] + a[0] * ta + b[0] * tb,
          o[1] + a[1] * ta + b[1] * tb,
          o[2] + a[2] * ta + b[2] * tb,
          u0 + (u1 - u0) * ta,
          v0 + (v1 - v0) * tb,
          s, n[0], n[1], n[2],
        );
      }
    // orientation: cross(a, b) should point along n
    const cx = a[1] * b[2] - a[2] * b[1];
    const cy = a[2] * b[0] - a[0] * b[2];
    const cz = a[0] * b[1] - a[1] * b[0];
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const row = na + 1;
    for (let j = 0; j < nb; j++)
      for (let i = 0; i < na; i++) {
        const q0 = base + j * row + i, q1 = q0 + 1, q2 = q0 + row + 1, q3 = q0 + row;
        if (flip) this.IX.push(q0, q2, q1, q0, q3, q2);
        else this.IX.push(q0, q1, q2, q0, q2, q3);
      }
  }

  // Any four points (p0..p3 counter-clockwise seen from n), with explicit UVs.
  quad4(p: [V3, V3, V3, V3], uv: [number, number][], n: V3, s: Spec) {
    const base = this.P.length / 3;
    for (let k = 0; k < 4; k++) this.vert(p[k]![0], p[k]![1], p[k]![2], uv[k]![0], uv[k]![1], s, n[0], n[1], n[2]);
    const a = [p[1]![0] - p[0]![0], p[1]![1] - p[0]![1], p[1]![2] - p[0]![2]];
    const c = [p[2]![0] - p[0]![0], p[2]![1] - p[0]![1], p[2]![2] - p[0]![2]];
    const cr = [a[1]! * c[2]! - a[2]! * c[1]!, a[2]! * c[0]! - a[0]! * c[2]!, a[0]! * c[1]! - a[1]! * c[0]!];
    if (cr[0]! * n[0] + cr[1]! * n[1] + cr[2]! * n[2] < 0) this.IX.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else this.IX.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // Axis-aligned horizontal rectangle, world-mapped UVs.
  hrect(x0: number, z0: number, x1: number, z1: number, y: number, up: boolean, s: Spec, sub = 1.0) {
    const sc = SCALE[s.layer]!;
    const uv: [number, number, number, number] = s.uv ?? [x0 / sc, z0 / sc, x1 / sc, z1 / sc];
    this.quad([x0, y, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], [0, up ? 1 : -1, 0], s, sub, uv);
  }

  // Vertical rectangle on the plane x = const (nx = ±1) or z = const (nz = ±1),
  // spanning `a0..a1` along the other horizontal axis.
  vrect(axisX: boolean, c: number, a0: number, a1: number, y0: number, y1: number, nsign: number, s: Spec, sub = 1.0, vbase = 0) {
    const sc = SCALE[s.layer]!;
    const uv: [number, number, number, number] = s.uv ?? [a0 / sc, (y0 - vbase) / sc, a1 / sc, (y1 - vbase) / sc];
    if (axisX) this.quad([c, y0, a0], [0, 0, a1 - a0], [0, y1 - y0, 0], [nsign, 0, 0], s, sub, uv);
    else this.quad([a0, y0, c], [a1 - a0, 0, 0], [0, y1 - y0, 0], [0, 0, nsign], s, sub, uv);
  }

  // Oriented box. c = centre, ax/ay/az = unit axes, h = half extents.
  obox(c: V3, ax: V3, ay: V3, az: V3, h: V3, s: Spec | Partial<Record<"px" | "nx" | "py" | "ny" | "pz" | "nz", Spec | null>> & { all?: Spec }, sub = 0) {
    const all = (s as any).layer !== undefined ? (s as Spec) : (s as any).all;
    const face = (k: string): Spec | null => {
      const v = (s as any)[k];
      if (v === null) return null;
      return v ?? all ?? null;
    };
    const P = (sx: number, sy: number, sz: number): V3 => [
      c[0] + ax[0] * h[0] * sx + ay[0] * h[1] * sy + az[0] * h[2] * sz,
      c[1] + ax[1] * h[0] * sx + ay[1] * h[1] * sy + az[1] * h[2] * sz,
      c[2] + ax[2] * h[0] * sx + ay[2] * h[1] * sy + az[2] * h[2] * sz,
    ];
    const sc3 = (v: V3, k: number): V3 => [v[0] * k, v[1] * k, v[2] * k];
    const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
    const W = 2 * h[0], Hh = 2 * h[1], D = 2 * h[2];
    const uvFor = (sp: Spec, w: number, hh: number): [number, number, number, number] => {
      if (sp.uv) return sp.uv;
      const sc = SCALE[sp.layer]!;
      return [0, 0, w / sc, hh / sc];
    };
    let f: Spec | null;
    if ((f = face("pz"))) this.quad(P(-1, -1, 1), sc3(ax, W), sc3(ay, Hh), az, f, sub, uvFor(f, W, Hh));
    if ((f = face("nz"))) this.quad(P(1, -1, -1), sc3(ax, -W), sc3(ay, Hh), neg(az), f, sub, uvFor(f, W, Hh));
    if ((f = face("px"))) this.quad(P(1, -1, 1), sc3(az, -D), sc3(ay, Hh), ax, f, sub, uvFor(f, D, Hh));
    if ((f = face("nx"))) this.quad(P(-1, -1, -1), sc3(az, D), sc3(ay, Hh), neg(ax), f, sub, uvFor(f, D, Hh));
    if ((f = face("py"))) this.quad(P(-1, 1, 1), sc3(ax, W), sc3(az, -D), ay, f, sub, uvFor(f, W, D));
    if ((f = face("ny"))) this.quad(P(-1, -1, -1), sc3(ax, W), sc3(az, D), neg(ay), f, sub, uvFor(f, W, D));
  }

  // Axis-aligned box given min/max corners.
  aabox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, s: Parameters<Builder["obox"]>[5], sub = 0) {
    this.obox([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1], [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2], s, sub);
  }

  // Arbitrary three.js geometry (cylinders, spheres) transformed by pos/rotY/scale.
  geom(g: BufferGeometry, x: number, y: number, z: number, rot: number, sx: number, sy: number, sz: number, s: Spec, rotX = 0) {
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    const uv = g.getAttribute("uv");
    const base = this.P.length / 3;
    const c = Math.cos(rot), sn = Math.sin(rot);
    const cxr = Math.cos(rotX), sxr = Math.sin(rotX);
    for (let i = 0; i < pos.count; i++) {
      let px = pos.getX(i) * sx, py = pos.getY(i) * sy, pz = pos.getZ(i) * sz;
      let nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      if (rotX) {
        const py2 = py * cxr - pz * sxr, pz2 = py * sxr + pz * cxr;
        py = py2; pz = pz2;
        const ny2 = ny * cxr - nz * sxr, nz2 = ny * sxr + nz * cxr;
        ny = ny2; nz = nz2;
      }
      const wx = x + px * c + pz * sn, wz = z - px * sn + pz * c;
      const wnx = nx * c + nz * sn, wnz = -nx * sn + nz * c;
      const u = uv ? uv.getX(i) : 0, v = uv ? uv.getY(i) : 0;
      this.vert(wx, y + py, wz, u, v, s, wnx, ny, wnz);
    }
    const idx = g.getIndex();
    if (idx) for (let i = 0; i < idx.count; i++) this.IX.push(base + idx.getX(i));
    else for (let i = 0; i < pos.count; i++) this.IX.push(base + i);
  }

  // Transparent glass (drawn double-sided, separate buffer).
  glass(o: V3, a: V3, b: V3, rgba: [number, number, number, number]) {
    const base = this.gP.length / 3;
    const pts: V3[] = [o, [o[0] + a[0], o[1] + a[1], o[2] + a[2]], [o[0] + a[0] + b[0], o[1] + a[1] + b[1], o[2] + a[2] + b[2]], [o[0] + b[0], o[1] + b[1], o[2] + b[2]]];
    for (const p of pts) {
      this.gP.push(p[0], p[1], p[2]);
      this.gC.push(...rgba);
    }
    this.gIX.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  solid(x0: number, z0: number, x1: number, z1: number) {
    this.boxes.push(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1));
  }

  finish() {
    const n = this.P.length / 3;
    return {
      pos: new Float32Array(this.P),
      uv: new Float32Array(this.UV),
      layer: new Float32Array(this.LY),
      light: new Float32Array(this.LI),
      flick: new Float32Array(this.FL),
      index: n > 65535 ? new Uint32Array(this.IX) : new Uint16Array(this.IX),
      gpos: new Float32Array(this.gP),
      gcol: new Float32Array(this.gC),
      gindex: new Uint32Array(this.gIX),
      boxes: new Float32Array(this.boxes),
    };
  }
}

export type Built = ReturnType<Builder["finish"]>;

// Local prop frame helper: rotation about Y (three.js convention).
export class Frame {
  c: number;
  s: number;
  constructor(public x: number, public y: number, public z: number, public rot: number) {
    this.c = Math.cos(rot);
    this.s = Math.sin(rot);
  }
  p(lx: number, ly: number, lz: number): V3 {
    return [this.x + lx * this.c + lz * this.s, this.y + ly, this.z - lx * this.s + lz * this.c];
  }
  get ax(): V3 { return [this.c, 0, -this.s]; }
  get az(): V3 { return [this.s, 0, this.c]; }
}

export const UP: V3 = [0, 1, 0];

// Box in a prop frame: (lx, lz) centre, ly = bottom, sizes sx/sy/sz.
export function fbox(b: Builder, fr: Frame, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, s: Parameters<Builder["obox"]>[5], collide = false) {
  b.obox(fr.p(lx, ly + sy / 2, lz), fr.ax, UP, fr.az, [sx / 2, sy / 2, sz / 2], s);
  if (collide) {
    const c = fr.p(lx, 0, lz);
    const ex = (Math.abs(fr.c) * sx + Math.abs(fr.s) * sz) / 2;
    const ez = (Math.abs(fr.s) * sx + Math.abs(fr.c) * sz) / 2;
    b.solid(c[0] - ex, c[2] - ez, c[0] + ex, c[2] + ez);
  }
}

export { H };
