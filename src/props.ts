// Prop and light-fixture geometry, all made from boxes and a few primitives.
import { CylinderGeometry, ExtrudeGeometry, IcosahedronGeometry, Shape, SphereGeometry } from "three";
import { CEIL, CELL, DOOR_H } from "./config";
import { Builder, Frame, UP, fbox, type RGB, type Spec, type V3 } from "./builder";
import type { Light, Prop } from "./furnish";
import { ART0, BOARD_UV, DPC_UV, KOFFIE_UV, L, LABEL0, POSTER_UV } from "./layers";
import { ART } from "./art";
import { Rng } from "./rng";

const CYL = new CylinderGeometry(1, 1, 1, 14, 1);
// the head of a pop: a disc of r 0.25 with its top sliced off at +0.16, 18 mm thick
// (drawn squeezed sideways: as tall as that, but narrower)
const POP_HEAD = (() => {
  const r = 0.25, top = 0.16, a0 = Math.asin(top / r);
  const sh = new Shape();
  sh.moveTo(r * Math.cos(a0), top);
  sh.absarc(0, 0, r, a0, Math.PI - a0, true);
  sh.lineTo(r * Math.cos(a0), top);
  return new ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: false, curveSegments: 24 });
})();
const CYL6 = new CylinderGeometry(1, 1, 1, 6, 1);
const BLOB = new IcosahedronGeometry(1, 1);
const CONE = new CylinderGeometry(0, 1, 1, 8, 1);
const DISH = new SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, Math.PI * 0.28);
const BALL = new SphereGeometry(1, 16, 12);

const sp = (layer: number, tint?: RGB, emit?: RGB): Spec => ({ layer, tint, emit });
const WHITE = sp(L.WHITE, [0.9, 0.9, 0.88]);
const OFFWHITE = sp(L.WHITE, [0.78, 0.78, 0.75]);
const DARK = sp(L.WHITE, [0.07, 0.07, 0.08]);
const GREY = sp(L.WHITE, [0.35, 0.36, 0.38]);
const STEEL = sp(L.STEEL);
const RED = sp(L.WHITE, [0.72, 0.06, 0.05]);
const FABRIC_DARK = sp(L.CARPET_GREY, [0.35, 0.35, 0.38]);
const WOOD = sp(L.WOOD_FLOOR, [0.9, 0.75, 0.6]);
const CARDBOARD = sp(L.WHITE, [0.55, 0.42, 0.26]);
const CAR_COLORS: RGB[] = [
  [0.75, 0.75, 0.74], [0.08, 0.08, 0.09], [0.5, 0.06, 0.05], [0.12, 0.18, 0.35],
  [0.4, 0.42, 0.44], [0.85, 0.85, 0.82], [0.2, 0.3, 0.2], [0.6, 0.5, 0.2],
];

function solidRect(b: Builder, fr: Frame, lx: number, lz: number, sx: number, sz: number) {
  const c = fr.p(lx, 0, lz);
  const ex = (Math.abs(fr.c) * sx + Math.abs(fr.s) * sz) / 2;
  const ez = (Math.abs(fr.s) * sx + Math.abs(fr.c) * sz) / 2;
  b.solid(c[0] - ex, c[2] - ez, c[0] + ex, c[2] + ez);
}

function cyl(b: Builder, fr: Frame, lx: number, ly: number, lz: number, r: number, h: number, s: Spec, g = CYL) {
  const p = fr.p(lx, ly + h / 2, lz);
  b.geom(g, p[0], p[1], p[2], fr.rot, r, h, r, s);
}

export function chair(b: Builder, fr: Frame, lx: number, lz: number, rot: number) {
  const f = new Frame(...fr.p(lx, 0, lz), fr.rot + rot);
  fbox(b, f, 0, 0.44, 0, 0.48, 0.07, 0.46, FABRIC_DARK);
  fbox(b, f, 0, 0.52, 0.22, 0.46, 0.52, 0.05, FABRIC_DARK);
  fbox(b, f, 0, 0.1, 0, 0.05, 0.34, 0.05, DARK);
  fbox(b, f, 0, 0.04, 0, 0.62, 0.04, 0.06, DARK);
  fbox(b, f, 0, 0.04, 0, 0.06, 0.04, 0.62, DARK);
}

function simpleChair(b: Builder, fr: Frame, lx: number, lz: number, rot: number, s: Spec = GREY) {
  const f = new Frame(...fr.p(lx, 0, lz), fr.rot + rot);
  fbox(b, f, 0, 0.44, 0, 0.44, 0.04, 0.42, s);
  fbox(b, f, 0, 0.48, 0.19, 0.42, 0.42, 0.03, s);
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) fbox(b, f, x!, 0, z!, 0.03, 0.44, 0.03, DARK);
}

function screen(layer: number, on: boolean, k = 1): Spec {
  return on ? { layer, emit: [0.9 * k, 0.9 * k, 0.9 * k] } : { layer: L.SCREEN };
}

function monitor(b: Builder, fr: Frame, lx: number, ly: number, lz: number, on: boolean, layer: number = L.SCREEN) {
  fbox(b, fr, lx, ly, lz - 0.04, 0.08, 0.18, 0.08, DARK);
  fbox(b, fr, lx, ly + 0.14, lz, 0.56, 0.34, 0.03, { all: DARK, pz: on ? { layer, emit: [0.32, 0.42, 0.58] } : { layer: L.SCREEN } });
}

const LED: Spec = { layer: L.DIGITAL, emit: [1.5, 1.5, 1.5], uv: [0, 0, 1, 1] };
const LIVE_ANY: Spec = { layer: L.SCREEN, emit: [0.9, 0.9, 0.92], uv: [0, 0, 1, 1], live: "any" };

const TV_LAYERS = [L.TV_BARS, L.TV_GEDULD, L.NOISE, L.SCREEN];
const POSTER_LAYERS = [L.POSTERS1, L.POSTERS2, L.POSTERS3, L.POSTERS4, L.POSTERS5, L.POSTERS6];

// uv rectangle of cell k in a cols x rows atlas layer (row 0 at the top)
function cellUV(k: number, cols: number, rows: number): [number, number, number, number] {
  const u0 = (k % cols) / cols, v0 = 1 - (Math.floor(k / cols) + 1) / rows;
  return [u0, v0, u0 + 1 / cols, v0 + 1 / rows];
}
// a channel ident (0 Ketnet, 1 Sporza, 2 VRT 1, 3 Canvas) on a lit screen
const ident = (k: number, e = 0.9): Spec => ({ layer: L.IDENTS, emit: [e, e, e], uv: cellUV(k, 2, 2) });

// a straight bar between two points, its flat side facing `az`
function bar(b: Builder, p0: V3, p1: V3, th: number, s: Spec, az: V3 = [0, 1, 0]) {
  const d: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const l = Math.hypot(d[0], d[1], d[2]);
  const ax: V3 = [d[0] / l, d[1] / l, d[2] / l];
  // make az perpendicular to ax
  const k = az[0] * ax[0] + az[1] * ax[1] + az[2] * ax[2];
  let z: V3 = [az[0] - ax[0] * k, az[1] - ax[1] * k, az[2] - ax[2] * k];
  const zl = Math.hypot(z[0], z[1], z[2]) || 1;
  z = [z[0] / zl, z[1] / zl, z[2] / zl];
  const ay: V3 = [z[1] * ax[2] - z[2] * ax[1], z[2] * ax[0] - z[0] * ax[2], z[0] * ax[1] - z[1] * ax[0]];
  b.obox([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], ax, ay, z, [l / 2, th / 2, th / 2], s);
}

export function buildProp(b: Builder, pr: Prop) {
  b.cell(pr.gx, pr.gz);
  const fr = new Frame(pr.x, pr.y, pr.z, pr.rot);
  const rng = new Rng((pr.a * 7919 + pr.gx * 131 + pr.gz * 977) | 0);
  switch (pr.t) {
    case "desks": {
      for (const side of [1, -1]) {
        const f = new Frame(pr.x, pr.y, pr.z, pr.rot + (side < 0 ? Math.PI : 0));
        fbox(b, f, 0, 0.72, 0.4, 1.6, 0.03, 0.8, WHITE);
        fbox(b, f, -0.77, 0, 0.4, 0.04, 0.72, 0.72, GREY);
        fbox(b, f, 0.77, 0, 0.4, 0.04, 0.72, 0.72, GREY);
        fbox(b, f, 0, 0.3, 0.03, 1.5, 0.4, 0.02, GREY);
        const on = rng.chance(0.25);
        monitor(b, f, rng.range(-0.3, 0.3), 0.75, 0.18, on);
        fbox(b, f, 0, 0.75, 0.55, 0.44, 0.02, 0.14, DARK);
        if (rng.chance(0.5)) fbox(b, f, rng.range(-0.7, -0.4), 0.75, 0.5, 0.21, 0.03 + rng.range(0, 0.06), 0.3, OFFWHITE);
        if (rng.chance(0.3)) cyl(b, f, 0.6, 0.75, 0.55, 0.04, 0.1, rng.pick([RED, WHITE, sp(L.WHITE, [0.1, 0.3, 0.6])]));
        if (rng.chance(0.85)) chair(b, f, rng.range(-0.1, 0.1), 1.1 + rng.range(0, 0.2), rng.range(-0.5, 0.5));
      }
      solidRect(b, fr, 0, 0, 1.6, 1.6);
      break;
    }
    case "cabinet": {
      const h = rng.pick([0.75, 1.1, 1.9]);
      fbox(b, fr, 0, 0, 0.23, 0.8, h, 0.45, { all: OFFWHITE, pz: sp(L.WHITE, [0.82, 0.82, 0.8]) }, true);
      for (let y = 0.35; y < h; y += 0.36) fbox(b, fr, 0, y, 0.46, 0.3, 0.02, 0.02, DARK);
      break;
    }
    case "plant": {
      fbox(b, fr, 0, 0, 0.35, 0.42, 0.45, 0.42, WHITE, true);
      fbox(b, fr, 0, 0.44, 0.35, 0.38, 0.02, 0.38, sp(L.GRAVEL, [0.3, 0.25, 0.2]));
      const top = fr.p(0, 0, 0.35);
      for (let k = 0; k < 4; k++) {
        const a = k * 0.8 + rng.next();
        const h = rng.range(0.7, 1.2);
        b.obox([top[0] + Math.cos(a) * 0.06, top[1] + 0.45 + h / 2, top[2] + Math.sin(a) * 0.06], [Math.cos(a), 0, Math.sin(a)], UP, [-Math.sin(a), 0, Math.cos(a)], [0.35, h / 2, 0.001], { all: { layer: L.FOLIAGE, uv: [0, 0, 1, 1] } });
      }
      break;
    }
    case "whiteboard":
      fbox(b, fr, 0, 0, 0.02, 1.6, 1.0, 0.03, { all: GREY, pz: { layer: L.WHITEBOARD, uv: [0, 0, 1, 1] } });
      fbox(b, fr, 0, -0.04, 0.06, 1.5, 0.03, 0.08, GREY);
      break;
    case "clock":
      // wall-mounted LED clock
      fbox(b, fr, 0, -0.08, 0.05, 0.44, 0.16, 0.1, { all: DARK, pz: LED });
      break;
    case "extinguisher": {
      cyl(b, fr, 0, 0.12, 0.16, 0.09, 0.55, sp(L.WHITE, [0.8, 0.05, 0.04]));
      cyl(b, fr, 0, 0.67, 0.16, 0.03, 0.08, DARK);
      fbox(b, fr, 0.06, 0.6, 0.2, 0.03, 0.12, 0.1, DARK);
      fbox(b, fr, 0, 1.6, 0.01, 0.2, 0.2, 0.01, RED);
      break;
    }
    case "hosebox":
      fbox(b, fr, 0, 0.9, 0.13, 0.7, 0.8, 0.26, { all: RED, pz: sp(L.WHITE, [0.78, 0.08, 0.06]) }, true);
      fbox(b, fr, 0, 1.25, 0.265, 0.3, 0.06, 0.01, sp(L.WHITE, [0.95, 0.95, 0.9]));
      break;
    case "poster": {
      const layer = POSTER_LAYERS[pr.a >> 2]!;
      const q = pr.a % 4;
      const u0 = (q % 2) * 0.5, v0 = q < 2 ? 0.5 : 0;
      fbox(b, fr, 0, -0.45, 0.01, 0.64, 0.9, 0.01, { all: WHITE, pz: { layer, uv: [u0, v0, u0 + 0.5, v0 + 0.5] } });
      break;
    }
    case "bench":
      fbox(b, fr, 0, 0.42, 0.3, 1.6, 0.05, 0.4, WOOD, true);
      fbox(b, fr, -0.7, 0, 0.3, 0.05, 0.42, 0.35, DARK);
      fbox(b, fr, 0.7, 0, 0.3, 0.05, 0.42, 0.35, DARK);
      break;
    case "cooler":
      fbox(b, fr, 0, 0, 0.2, 0.32, 1.0, 0.32, WHITE, true);
      cyl(b, fr, 0, 1.0, 0.2, 0.14, 0.42, sp(L.WHITE, [0.35, 0.55, 0.85]));
      break;
    case "notice":
      fbox(b, fr, 0, -0.45, 0.015, 1.2, 0.9, 0.02, sp(L.WHITE, [0.5, 0.36, 0.22]));
      for (let k = 0; k < 6; k++)
        fbox(b, fr, rng.range(-0.45, 0.45), rng.range(-0.35, 0.2), 0.03, rng.range(0.15, 0.25), rng.range(0.18, 0.3), 0.003, sp(L.WHITE, rng.pick([[0.95, 0.95, 0.9], [0.95, 0.9, 0.5], [0.8, 0.9, 1.0]] as RGB[])));
      break;
    case "tv": {
      const face = pr.a >= 4 ? ident(pr.a - 4, 0.95) : screen(TV_LAYERS[pr.a]!, TV_LAYERS[pr.a] !== L.SCREEN, 1.05);
      fbox(b, fr, 0, -0.05, 0.02, 0.2, 0.2, 0.04, DARK);
      fbox(b, fr, 0, -0.3, 0.12, 1.05, 0.62, 0.06, { all: DARK, pz: face });
      // tunes in to whatever studio camera is streaming
      fbox(b, fr, 0, -0.28, 0.151, 1.0, 0.58, 0.002, { pz: LIVE_ANY });
      break;
    }
    case "bin":
      cyl(b, fr, 0, 0, 0.2, 0.17, 0.5, GREY, CYL6);
      break;
    case "vending": {
      fbox(b, fr, 0, 0, 0.42, 0.95, 1.85, 0.8, { all: pr.a ? RED : sp(L.WHITE, [0.12, 0.2, 0.5]), pz: { layer: L.VENDING, emit: [1.05, 1.05, 1.0], uv: pr.a ? [0.5, 0, 1, 1] : [0, 0, 0.5, 1] } }, true);
      break;
    }
    case "exit":
      fbox(b, fr, 0, 0, 0.03, 0.4, 0.16, 0.06, { all: WHITE, pz: { layer: L.EXIT, emit: [1.3, 1.3, 1.3], uv: [0, 0, 1, 1] } });
      break;
    case "onair": {
      // pr.b: 1 + the station this studio belongs to (lit while it's on the ghost radio)
      const face: Spec = pr.b ? { layer: L.ONAIR, emit: [1.6, 1.6, 1.6], uv: [0, 0, 1, 1], radio: pr.b - 1 }
        : pr.a ? { layer: L.ONAIR, emit: [1.6, 1.6, 1.6], uv: [0, 0, 1, 1] } : { layer: L.ONAIR, tint: [0.35, 0.3, 0.3], uv: [0, 0, 1, 1] };
      fbox(b, fr, 0, 0, 0.04, 0.6, 0.18, 0.08, { all: DARK, pz: face });
      break;
    }
    case "sign": {
      // pr.a < 8: SIGNS, 8+: the services (SIGNS2); pr.b: French
      const q = pr.a % 8;
      const u0 = (q % 2) * 0.5, v0 = 0.75 - Math.floor(q / 2) * 0.25;
      const layer = pr.a >= 8 ? (pr.b ? L.SIGNS2_FR : L.SIGNS2) : pr.b ? L.SIGNS_FR : L.SIGNS;
      fbox(b, fr, 0, 0, 0.01, 0.34, 0.17, 0.012, { all: GREY, pz: { layer, uv: [u0, v0, u0 + 0.5, v0 + 0.25] } });
      break;
    }
    case "plaque": {
      const [pw, ph] = pr.b ? [0.7, 0.35] : [0.4, 0.2];
      fbox(b, fr, 0, 0, 0.01, pw, ph, 0.015, { all: GREY, pz: { layer: L.PLAQUES, uv: cellUV(pr.a, 2, 4) } });
      break;
    }
    case "frosted":
      fbox(b, fr, 0, 0.6, 0.0, 1.7, 1.8, 0.06, { all: GREY, pz: { layer: L.FROSTED, emit: [1.35, 1.4, 1.5], uv: [0, 0, 1, 1] } });
      fbox(b, fr, 0, 1.47, 0.04, 1.7, 0.05, 0.04, GREY);
      fbox(b, fr, 0, 0.55, 0.04, 1.8, 0.05, 0.12, GREY);
      break;
    case "firedoor": {
      // frame across the corridor at a chunk seam, leaves held open
      const half = 1.5 - 0.12;
      const fs = sp(L.WHITE, [0.2, 0.28, 0.26]);
      for (const s of [-1, 1]) {
        fbox(b, fr, s * (half - 0.06), 0, 0, 0.12, DOOR_H + 0.1, 0.2, fs);
        solidRect(b, fr, s * (half - 0.06), 0, 0.12, 0.2);
        const leafLen = half - 0.12;
        const lx = s * (half - 0.16);
        fbox(b, fr, lx, 0.02, -leafLen / 2 - 0.1, 0.04, DOOR_H - 0.04, leafLen, fs);
        const g0 = fr.p(lx + s * 0.03, 0.5, -0.25);
        b.glass(g0, [fr.s * -(leafLen - 0.3), 0, fr.c * -(leafLen - 0.3)], [0, 1.4, 0], [0.8, 0.9, 0.88, 0.22]);
      }
      fbox(b, fr, 0, DOOR_H + 0.05, 0, half * 2, CEIL - DOOR_H - 0.05, 0.2, { all: fs, pz: sp(L.PLASTER, [0.85, 0.85, 0.82]), nz: sp(L.PLASTER, [0.85, 0.85, 0.82]) });
      break;
    }
    case "tree": {
      // red round bench around a planter with a tree (NWS lobby)
      const n = 20;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const f = new Frame(pr.x + Math.cos(a) * 1.35, pr.y, pr.z + Math.sin(a) * 1.35, -a + Math.PI / 2);
        fbox(b, f, 0, 0, 0, 0.46, 0.45, 0.55, sp(L.WHITE, [0.85, 0.18, 0.12]));
        const f2 = new Frame(pr.x + Math.cos(a) * 1.02, pr.y, pr.z + Math.sin(a) * 1.02, -a + Math.PI / 2);
        fbox(b, f2, 0, 0, 0, 0.34, 0.9, 0.12, sp(L.WHITE, [0.85, 0.18, 0.12]));
      }
      b.geom(CYL, pr.x, pr.y + 0.5, pr.z, 0, 0.95, 1.0, 0.95, WHITE);
      b.hrect(pr.x - 0.9, pr.z - 0.9, pr.x + 0.9, pr.z + 0.9, pr.y + 1.01, true, sp(L.GRAVEL, [0.35, 0.3, 0.25]), 0);
      b.geom(CYL6, pr.x, pr.y + 2.6, pr.z, 0, 0.12, 3.2, 0.12, sp(L.WOOD_FLOOR, [0.35, 0.28, 0.2]));
      for (let k = 0; k < 9; k++) {
        const a = rng.range(0, 6.28), r = rng.range(0.2, 1.1);
        b.geom(BLOB, pr.x + Math.cos(a) * r, pr.y + rng.range(3.4, 5.6), pr.z + Math.sin(a) * r, a, rng.range(0.7, 1.2), rng.range(0.6, 1.0), rng.range(0.7, 1.2), sp(L.FOLIAGE, [0.55, 0.75, 0.5]));
      }
      b.solid(pr.x - 1.6, pr.z - 1.6, pr.x + 1.6, pr.z + 1.6);
      break;
    }
    case "nwswall":
      fbox(b, fr, 0, 0.2, 0.0, 2.7, 2.3, 0.04, { all: DARK, pz: { layer: L.NWSWALL, emit: [0.85, 0.85, 0.9], uv: [0, 0, 1, 1] } });
      break;
    case "mtable": {
      const lx = pr.a, lz = pr.b;
      fbox(b, fr, 0, 0.72, 0, lx, 0.04, lz, sp(L.WOOD_FLOOR, [0.85, 0.8, 0.72]), true);
      fbox(b, fr, 0, 0, 0, 0.1, 0.72, lz * 0.5, GREY);
      if (lx > 2) { fbox(b, fr, -lx / 3, 0, 0, 0.1, 0.72, lz * 0.5, GREY); fbox(b, fr, lx / 3, 0, 0, 0.1, 0.72, lz * 0.5, GREY); }
      const n = Math.max(1, Math.floor(lx / 0.75));
      for (let k = 0; k < n; k++) {
        const x = -lx / 2 + (k + 0.5) * (lx / n);
        if (rng.chance(0.9)) chair(b, fr, x + rng.range(-0.1, 0.1), lz / 2 + 0.35, rng.range(-0.4, 0.4));
        if (rng.chance(0.9)) chair(b, fr, x + rng.range(-0.1, 0.1), -lz / 2 - 0.35, Math.PI + rng.range(-0.4, 0.4));
      }
      if (rng.chance(0.6)) fbox(b, fr, rng.range(-lx / 3, lx / 3), 0.76, 0, 0.21, 0.02, 0.3, OFFWHITE);
      break;
    }
    case "stalls": {
      const ps = sp(L.WHITE, [0.55, 0.62, 0.7]);
      for (const x of [-0.95, 0, 0.95]) fbox(b, fr, x, 0.12, 0.75, 0.03, 1.85, 1.5, ps);
      for (const x of [-0.475, 0.475]) {
        fbox(b, fr, x, 0, 0.35, 0.38, 0.42, 0.55, WHITE);
        fbox(b, fr, x, 0.42, 0.28, 0.4, 0.04, 0.46, WHITE);
        const open = rng.chance(0.6);
        if (open) fbox(b, fr, x - 0.44, 0.12, 1.5 + 0.35, 0.03, 1.85, 0.7, ps);
        else fbox(b, fr, x, 0.12, 1.5, 0.9, 1.85, 0.03, ps);
      }
      solidRect(b, fr, 0, 0.75, 1.95, 1.5);
      break;
    }
    case "sinks": {
      fbox(b, fr, 0, 0.82, 0.28, 2.0, 0.06, 0.55, sp(L.TILE_SMALL, [0.8, 0.8, 0.8]), true);
      fbox(b, fr, 0, 0, 0.05, 2.0, 0.82, 0.08, sp(L.TILE_BLUE, [0.8, 0.85, 0.95]));
      for (const x of [-0.5, 0.5]) {
        fbox(b, fr, x, 0.78, 0.3, 0.45, 0.1, 0.35, WHITE);
        fbox(b, fr, x, 0.88, 0.08, 0.04, 0.2, 0.04, STEEL);
      }
      fbox(b, fr, 0, 1.05, 0.01, 1.9, 0.9, 0.01, sp(L.STEEL, [1.2, 1.25, 1.3]));
      fbox(b, fr, 0.9, 1.3, 0.08, 0.26, 0.35, 0.12, WHITE);
      break;
    }
    case "shelf": {
      fbox(b, fr, -0.88, 0, 0.23, 0.03, 2.0, 0.45, GREY);
      fbox(b, fr, 0.88, 0, 0.23, 0.03, 2.0, 0.45, GREY);
      for (let y = 0.1; y < 2.0; y += 0.48) {
        fbox(b, fr, 0, y, 0.23, 1.76, 0.025, 0.45, GREY);
        let x = -0.8;
        while (x < 0.7) {
          const w = rng.range(0.25, 0.5);
          if (rng.chance(0.7)) fbox(b, fr, x + w / 2, y + 0.025, 0.23, w - 0.03, rng.range(0.15, 0.4), 0.38, CARDBOARD);
          x += w;
        }
      }
      solidRect(b, fr, 0, 0.23, 1.8, 0.46);
      break;
    }
    case "racks": {
      for (const z of [-0.7, 0.7]) {
        for (let k = -1; k <= 1; k++) {
          const f = new Frame(...fr.p(k * 0.8, 0, z), fr.rot + (z > 0 ? 0 : Math.PI));
          fbox(b, f, 0, 0, 0, 0.78, 2.0, 0.9, { all: DARK, pz: { layer: L.LEDS, emit: [0.9, 0.9, 0.9], uv: [0, 0, 1.3, 3.3] } });
        }
        solidRect(b, fr, 0, z, 2.4, 0.9);
      }
      break;
    }
    case "backdrop":
      fbox(b, fr, 0, 0, 0, 2.98, 3.2, 0.04, { all: DARK, pz: pr.a ? { layer: L.NWSWALL, emit: [0.5, 0.52, 0.6], uv: [0, 0, 1, 1] } : sp(L.WHITE, [0.55, 0.6, 0.75]) });
      break;
    case "newsdesk": {
      fbox(b, fr, 0, 0, 0, 2.6, 0.95, 0.8, { all: sp(L.WHITE, [0.85, 0.85, 0.88]), pz: { layer: L.VRT_LOGO, tint: [1, 1, 1], uv: [-0.9, 0, 1.9, 1] } }, true);
      fbox(b, fr, 0, 0.95, -0.05, 2.7, 0.04, 0.95, WHITE);
      for (const x of [-0.6, 0.6]) {
        chair(b, fr, x, -0.75, Math.PI);
        monitor(b, new Frame(...fr.p(0, 0, 0), fr.rot + Math.PI), -x * 1.4, 0.99, 0.1, true, L.TV_BARS);
      }
      break;
    }
    case "camera": {
      cyl(b, fr, 0, 0, 0, 0.42, 0.22, DARK, CYL6);
      fbox(b, fr, 0, 0.22, 0, 0.14, 1.1, 0.14, GREY);
      fbox(b, fr, 0, 1.32, 0, 0.32, 0.34, 0.6, DARK);
      const lens = fr.p(0, 1.49, 0.42);
      b.geom(CYL, lens[0], lens[1], lens[2], fr.rot, 0.1, 0.28, 0.1, DARK, Math.PI / 2);
      fbox(b, fr, 0, 1.66, -0.1, 0.24, 0.18, 0.2, { all: DARK, nz: { layer: L.NOISE, emit: [0.4, 0.4, 0.45] } });
      fbox(b, fr, 0, 1.68, 0.22, 0.05, 0.03, 0.03, pr.a ? { layer: L.WHITE, emit: [2.0, 0.1, 0.05] } : DARK);
      fbox(b, fr, -0.35, 1.2, -0.4, 0.04, 0.04, 0.6, GREY);
      fbox(b, fr, 0.35, 1.2, -0.4, 0.04, 0.04, 0.6, GREY);
      solidRect(b, fr, 0, 0, 0.8, 0.8);
      break;
    }
    case "rig": {
      fbox(b, fr, 0, 0, -1.0, 3.0, 0.05, 0.05, DARK);
      fbox(b, fr, 0, 0, 1.0, 3.0, 0.05, 0.05, DARK);
      fbox(b, fr, -1.0, 0.05, 0, 0.05, 0.05, 3.0, DARK);
      for (let k = 0; k < 2; k++) {
        const x = rng.range(-1.2, 1.2), z = rng.pick([-1, 1]);
        fbox(b, fr, x, -0.35, z, 0.03, 0.35, 0.03, DARK);
        fbox(b, fr, x, -0.62, z, 0.26, 0.28, 0.34, { all: DARK, pz: rng.chance(0.3) ? { layer: L.WHITE, emit: [1.4, 1.2, 0.9] } : GREY });
      }
      break;
    }
    case "ctable": {
      fbox(b, fr, 0, 0.72, 0, 2.6, 0.03, 0.9, sp(L.FABRIC, [0.78, 0.72, 0.62]), true);
      fbox(b, fr, 0, 0.55, 0.45, 2.6, 0.17, 0.005, sp(L.FABRIC, [0.72, 0.66, 0.56]));
      fbox(b, fr, 0, 0.55, -0.45, 2.6, 0.17, 0.005, sp(L.FABRIC, [0.72, 0.66, 0.56]));
      fbox(b, fr, 0, 0, 0, 2.2, 0.55, 0.04, GREY);
      for (const x of [-0.85, 0, 0.85]) {
        if (rng.chance(0.8)) simpleChair(b, fr, x, 0.72, rng.range(-0.3, 0.3), sp(L.WOOD_FLOOR, [0.75, 0.5, 0.3]));
        if (rng.chance(0.8)) simpleChair(b, fr, x, -0.72, Math.PI + rng.range(-0.3, 0.3), sp(L.WOOD_FLOOR, [0.75, 0.5, 0.3]));
        if (rng.chance(0.35)) {
          const z = rng.pick([-0.25, 0.25]);
          fbox(b, fr, x, 0.75, z, 0.4, 0.02, 0.3, WHITE);
          if (rng.chance(0.6)) for (let k = 0; k < 6; k++) fbox(b, fr, x + rng.range(-0.1, 0.1), 0.77, z + rng.range(-0.08, 0.08), 0.02, 0.02, 0.09, sp(L.WHITE, [0.95, 0.78, 0.3]));
          if (rng.chance(0.5)) cyl(b, fr, x + 0.25, 0.75, z, 0.033, 0.12, sp(L.WHITE, rng.pick([[0.8, 0.1, 0.1], [0.9, 0.9, 0.9], [0.1, 0.3, 0.1]] as RGB[])));
        }
      }
      break;
    }
    case "tapes": {
      for (const z of [-0.65, 0.65]) {
        fbox(b, fr, 0, 0, z, 2.5, 2.2, 0.5, { all: GREY, pz: { layer: L.TAPES }, nz: { layer: L.TAPES } }, true);
      }
      break;
    }
    case "monwall": {
      // pr.b = 1: the Sporza wall (the match on every screen)
      fbox(b, fr, 0, 0.8, 0.05, 2.9, 1.9, 0.1, DARK);
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) {
          const k = rng.range(0.6, 1.0);
          let face: Spec;
          if (pr.b && rng.chance(0.3)) face = ident(1, k);
          else if (pr.b) {
            const u = rng.range(0, 0.4), v = rng.range(0.1, 0.6);
            face = { layer: L.SPORTFLOOR, emit: [k, k, k], uv: [u, v, u + 0.55, v + 0.32] };
          } else {
            const layer = rng.pick([L.TV_BARS, L.TV_GEDULD, L.NOISE, L.SCREEN, L.NWSWALL, L.NOISE, L.SCREEN, L.IDENTS]);
            face = layer === L.IDENTS ? ident(rng.int(0, 3), k) : screen(layer, layer !== L.SCREEN, k);
          }
          fbox(b, fr, (c - 1) * 0.95, 0.88 + r * 0.6, 0.12, 0.88, 0.52, 0.04, { all: DARK, pz: face });
          if (rng.chance(0.35)) fbox(b, fr, (c - 1) * 0.95, 0.9 + r * 0.6, 0.141, 0.84, 0.48, 0.002, { pz: LIVE_ANY });
        }
      break;
    }
    case "mixdesk": {
      const f = new Frame(pr.x, pr.y, pr.z, pr.rot);
      fbox(b, f, 0, 0, 0, 2.7, 0.78, 0.8, GREY, true);
      b.obox(f.p(0, 0.84, 0), f.ax, [f.s * -0.26, 0.97, f.c * -0.26] as any, [f.s * 0.97, 0.26, f.c * 0.97] as any, [1.35, 0.05, 0.42], { all: DARK, py: { layer: L.DESK_BUTTONS, emit: [0.7, 0.7, 0.7], uv: [0, 0, 3, 1] } });
      for (const x of [-0.7, 0.7]) if (rng.chance(0.8)) chair(b, f, x, 0.85, rng.range(-0.4, 0.4));
      break;
    }
    case "chair":
      chair(b, fr, 0, 0, 0);
      break;
    case "editdesk": {
      fbox(b, fr, 0, 0.72, 0.4, 1.8, 0.04, 0.75, sp(L.WHITE, [0.2, 0.2, 0.22]), true);
      fbox(b, fr, -0.85, 0, 0.4, 0.05, 0.72, 0.7, DARK);
      fbox(b, fr, 0.85, 0, 0.4, 0.05, 0.72, 0.7, DARK);
      for (const x of [-0.55, 0, 0.55]) monitor(b, fr, x, 0.76, 0.18, rng.chance(0.7), rng.pick([L.SCREEN, L.TV_BARS, L.NOISE]));
      fbox(b, fr, 0, 0.76, 0.6, 0.5, 0.02, 0.16, DARK);
      chair(b, fr, 0, 1.2, rng.range(-0.6, 0.6));
      break;
    }
    case "sofa": {
      const s = sp(L.CARPET_GREY, [0.45, 0.3, 0.25]);
      fbox(b, fr, 0, 0, 0.45, 1.9, 0.45, 0.85, s, true);
      fbox(b, fr, 0, 0.45, 0.12, 1.9, 0.45, 0.2, s);
      fbox(b, fr, -0.88, 0.45, 0.45, 0.16, 0.2, 0.85, s);
      fbox(b, fr, 0.88, 0.45, 0.45, 0.16, 0.2, 0.85, s);
      break;
    }
    case "pillar":
      b.aabox(pr.x - 0.28, pr.y, pr.z - 0.28, pr.x + 0.28, pr.y + 2.6, pr.z + 0.28, { all: sp(L.CONCRETE, [0.72, 0.72, 0.7]) }, 1);
      b.aabox(pr.x - 0.29, pr.y, pr.z - 0.29, pr.x + 0.29, pr.y + 0.5, pr.z + 0.29, { all: sp(L.WHITE, [0.85, 0.7, 0.1]), py: null, ny: null });
      b.solid(pr.x - 0.3, pr.z - 0.3, pr.x + 0.3, pr.z + 0.3);
      break;
    case "car": {
      const col = CAR_COLORS[pr.a % CAR_COLORS.length]!;
      const paint = sp(L.WHITE, col);
      fbox(b, fr, 0, 0.3, 0, 1.75, 0.62, 4.1, paint, true);
      fbox(b, fr, 0, 0.92, -0.2, 1.55, 0.5, 2.2, { all: sp(L.SCREEN, [0.5, 0.55, 0.6]), py: paint });
      for (const [x, z] of [[-0.8, 1.3], [0.8, 1.3], [-0.8, -1.3], [0.8, -1.3]]) {
        const p = fr.p(x!, 0.32, z!);
        b.geom(CYL, p[0], p[1], p[2], fr.rot + Math.PI / 2, 0.32, 0.22, 0.32, DARK, Math.PI / 2);
      }
      fbox(b, fr, -0.6, 0.6, 2.05, 0.3, 0.1, 0.02, sp(L.WHITE, [0.95, 0.95, 0.9]));
      fbox(b, fr, 0.6, 0.6, 2.05, 0.3, 0.1, 0.02, sp(L.WHITE, [0.95, 0.95, 0.9]));
      fbox(b, fr, -0.6, 0.6, -2.05, 0.3, 0.1, 0.02, sp(L.WHITE, [0.6, 0.05, 0.05]));
      fbox(b, fr, 0.6, 0.6, -2.05, 0.3, 0.1, 0.02, sp(L.WHITE, [0.6, 0.05, 0.05]));
      break;
    }
    case "pipe": {
      const p = fr.p(0, 0, 0);
      b.geom(CYL, p[0], p[1], p[2], fr.rot + Math.PI / 2, 0.1, 3.0, 0.1, sp(L.WHITE, [0.6, 0.62, 0.64]), Math.PI / 2);
      break;
    }
    case "hvac": {
      fbox(b, fr, 0, 0, 0, 2.2, 1.3, 1.3, { all: sp(L.STEEL, [0.75, 0.77, 0.8]) }, true);
      cyl(b, fr, -0.5, 1.3, 0, 0.45, 0.12, DARK);
      cyl(b, fr, 0.5, 1.3, 0, 0.45, 0.12, DARK);
      break;
    }
    case "antenna": {
      const h = pr.a;
      fbox(b, fr, 0, 0, 0, 0.1, h, 0.1, GREY, true);
      for (let y = 2; y < h; y += 1.4) fbox(b, fr, 0, y, 0, 1.0 - y / (h * 1.4), 0.04, 0.04, GREY);
      fbox(b, fr, 0, h, 0, 0.12, 0.12, 0.12, { layer: L.WHITE, emit: [1.6, 0.1, 0.05] });
      break;
    }
    case "dish": {
      fbox(b, fr, 0, 0, 0, 0.12, 1.4, 0.12, GREY, true);
      const p = fr.p(0, 1.9, 0.2);
      b.geom(DISH, p[0], p[1], p[2], fr.rot, 0.8, 0.8, 0.8, sp(L.WHITE, [0.85, 0.85, 0.86]), Math.PI / 2 + 0.6);
      fbox(b, fr, 0, 1.9, 0.9, 0.08, 0.08, 0.3, GREY);
      break;
    }
    case "vent":
      cyl(b, fr, 0, 0, 0, 0.14, 0.7, sp(L.STEEL, [0.7, 0.72, 0.74]));
      cyl(b, fr, 0, 0.7, 0, 0.26, 0.12, sp(L.STEEL, [0.6, 0.62, 0.64]));
      break;
    case "art": {
      const art = ART[pr.a]!;
      const { w, h } = art;
      const fw = art.frame === "none" ? 0 : art.frame === "steel" ? 0.035 : 0.045;
      const fs =
        art.frame === "wood" ? sp(L.WOOD_FLOOR, [0.32, 0.22, 0.15]) : art.frame === "alu" ? sp(L.STEEL, [0.85, 0.86, 0.88]) : sp(L.WHITE, [0.16, 0.16, 0.17]);
      fbox(b, fr, 0, -h / 2, 0.02, w, h, 0.035, { all: sp(L.WHITE, [0.25, 0.24, 0.22]), pz: { layer: ART0 + pr.a, uv: [0, 0, 1, 1] } });
      if (fw) {
        fbox(b, fr, 0, h / 2, 0.028, w + 2 * fw, fw, 0.055, fs);
        fbox(b, fr, 0, -h / 2 - fw, 0.028, w + 2 * fw, fw, 0.055, fs);
        fbox(b, fr, -w / 2 - fw / 2, -h / 2, 0.028, fw, h, 0.055, fs);
        fbox(b, fr, w / 2 + fw / 2, -h / 2, 0.028, fw, h, 0.055, fs);
      }
      // picture lamp
      if (pr.b) {
        fbox(b, fr, 0, h / 2 + fw + 0.12, 0.02, 0.05, 0.05, 0.04, sp(L.WOOD_FLOOR, [0.75, 0.6, 0.3]));
        fbox(b, fr, 0, h / 2 + fw + 0.12, 0.14, Math.min(0.7, w * 0.6), 0.045, 0.06, { all: sp(L.WOOD_FLOOR, [0.75, 0.6, 0.3]), ny: { layer: L.WHITE, emit: [1.6, 1.3, 0.9] } });
      }
      // museum label, beside the work (or below it for the wide ones)
      const k = pr.a % 8;
      const u0 = (k % 2) * 0.5, v0 = 0.75 - Math.floor(k / 2) * 0.25;
      const lbl: Spec = { layer: LABEL0 + Math.floor(pr.a / 8), uv: [u0, v0, u0 + 0.5, v0 + 0.25] };
      if (w + fw * 2 + 0.5 < 2.7) fbox(b, fr, w / 2 + fw + 0.2, -0.22, 0.008, 0.24, 0.12, 0.012, { all: GREY, pz: lbl });
      else fbox(b, fr, w / 2 - 0.12, -h / 2 - fw - 0.2, 0.008, 0.24, 0.12, 0.012, { all: GREY, pz: lbl });
      break;
    }
    case "planter": {
      const pl = sp(L.CONCRETE, [0.92, 0.92, 0.9]);
      fbox(b, fr, 0, 0, 0, 1.4, 0.55, 1.1, { all: pl, py: null }, true);
      b.hrect(pr.x - 0.66, pr.z - 0.66, pr.x + 0.66, pr.z + 0.66, pr.y + 0.5, true, sp(L.GRAVEL, [0.28, 0.22, 0.16]), 0);
      const leaf = sp(L.FOLIAGE, [0.55, 0.8, 0.5]);
      for (let k = 0; k < 5; k++)
        b.geom(BLOB, pr.x + rng.range(-0.45, 0.45), pr.y + 0.7 + rng.range(0, 0.25), pr.z + rng.range(-0.35, 0.35), rng.range(0, 6), rng.range(0.3, 0.45), rng.range(0.25, 0.4), rng.range(0.3, 0.45), leaf);
      if (pr.a) {
        // a ficus reaching for the glass roof
        const th = rng.range(2.4, 3.6);
        b.geom(CYL6, pr.x, pr.y + 0.5 + th / 2, pr.z, 0, 0.07, th, 0.07, sp(L.WOOD_FLOOR, [0.4, 0.32, 0.24]));
        for (let k = 0; k < 8; k++) {
          const a = rng.range(0, 6.28), r = rng.range(0.1, 0.8);
          b.geom(BLOB, pr.x + Math.cos(a) * r, pr.y + 0.5 + th * rng.range(0.55, 1.1), pr.z + Math.sin(a) * r, a, rng.range(0.5, 0.8), rng.range(0.45, 0.7), rng.range(0.5, 0.8), leaf);
        }
      }
      break;
    }
    case "screens": {
      for (const x of [-0.45, 0.45]) {
        fbox(b, fr, x, 0, 0, 0.08, 1.1, 0.08, sp(L.STEEL, [0.8, 0.8, 0.82]));
        fbox(b, fr, x, 1.1, 0.03, 0.62, 1.05, 0.06, { all: DARK, pz: { layer: x < 0 ? L.NWSWALL : L.TV_GEDULD, emit: [0.95, 0.95, 1.0], uv: x < 0 ? [0.1, 0, 0.7, 1] : [0.3, 0, 0.7, 1] } });
      }
      fbox(b, fr, 0, 0, 0, 1.3, 0.05, 0.5, DARK, true);
      break;
    }
    case "hangclock": {
      // double-sided red LED clock, hung just under the ceiling
      for (const x of [-0.15, 0.15]) fbox(b, fr, x, -0.2, 0, 0.012, 0.2, 0.012, DARK);
      fbox(b, fr, 0, -0.37, 0, 0.44, 0.17, 0.1, { all: DARK, pz: LED, nz: LED });
      break;
    }
    case "hangsign": {
      for (const x of [-0.7, 0.7]) fbox(b, fr, x, -0.45, 0, 0.015, 0.45, 0.015, DARK);
      const v0 = pr.a ? 0.5 : 0;
      fbox(b, fr, 0, -0.75, 0, 1.9, 0.32, 0.04, { all: WHITE, pz: { layer: L.MIDSIGN, uv: [0, v0, 1, v0 + 0.5] }, nz: { layer: L.MIDSIGN, uv: [0, 0.5 - v0, 1, 1 - v0] } });
      break;
    }
    case "speaker":
      fbox(b, fr, 0, -0.1, 0, 0.04, 0.12, 0.2, DARK);
      fbox(b, fr, 0, -0.5, 0.08, 0.26, 0.42, 0.22, { all: DARK, pz: sp(L.CARPET_GREY, [0.15, 0.15, 0.16]) });
      break;
    case "fakedoor": {
      // a proper door, held open... onto brick
      const trim = sp(L.WHITE, [0.55, 0.52, 0.48]);
      fbox(b, fr, 0, 0, 0.004, 1.0, 2.1, 0.004, sp(L.BRICK, [0.62, 0.6, 0.56]));
      fbox(b, fr, -0.53, 0, 0.015, 0.06, 2.16, 0.03, trim);
      fbox(b, fr, 0.53, 0, 0.015, 0.06, 2.16, 0.03, trim);
      fbox(b, fr, 0, 2.1, 0.015, 1.12, 0.06, 0.03, trim);
      const a = (100 * Math.PI) / 180, dx = -Math.cos(a), dz = Math.sin(a);
      const leaf = new Frame(...fr.p(0.5 + dx * 0.5, 0, 0.05 + dz * 0.5), fr.rot + Math.atan2(-dz, dx));
      const door: Spec = { layer: L.DOOR_WOOD, uv: [0, 0, 1, 1] };
      fbox(b, leaf, 0, 0, 0, 1.0, 2.08, 0.04, { all: DARK, pz: door, nz: door });
      fbox(b, leaf, -0.38, 1.0, 0.05, 0.12, 0.035, 0.035, STEEL);
      break;
    }
    case "tinydoor": {
      const x = pr.a ? 0.7 : -0.6;
      const door: Spec = { layer: L.DOOR_WOOD, uv: [0, 0, 1, 1] };
      fbox(b, fr, x, 0, 0.012, 0.52, 1.02, 0.025, sp(L.WHITE, [0.5, 0.48, 0.44]));
      fbox(b, fr, x, 0, 0.03, 0.44, 0.96, 0.02, { all: DARK, pz: door });
      fbox(b, fr, x + 0.14, 0.48, 0.045, 0.05, 0.02, 0.02, STEEL);
      fbox(b, fr, x, 1.1, 0.01, 0.16, 0.06, 0.01, { all: GREY, pz: { layer: L.NUMBERS, uv: [0.25, 0.75, 0.5, 1] } });
      break;
    }
    case "blackwindow": {
      // an interior window into a room that is simply not there
      const f = sp(L.WHITE, [0.25, 0.25, 0.26]);
      fbox(b, fr, 0, 0.95, 0.004, 1.3, 1.05, 0.006, sp(L.SCREEN, [0.02, 0.02, 0.02]));
      fbox(b, fr, 0, 0.9, 0.03, 1.4, 0.05, 0.06, f);
      fbox(b, fr, 0, 2.0, 0.03, 1.4, 0.05, 0.06, f);
      fbox(b, fr, -0.675, 0.95, 0.03, 0.05, 1.05, 0.06, f);
      fbox(b, fr, 0.675, 0.95, 0.03, 0.05, 1.05, 0.06, f);
      fbox(b, fr, 0, 0.86, 0.08, 1.46, 0.04, 0.16, sp(L.WHITE, [0.8, 0.8, 0.78]));
      b.glass(fr.p(-0.65, 0.95, 0.03), [fr.c * 1.3, 0, -fr.s * 1.3], [0, 1.05, 0], [0.7, 0.8, 0.85, 0.12]);
      break;
    }
    case "chairfield": {
      // every chair in the building, facing the same wall
      const W = Math.max(1, pr.a), D = Math.max(1, pr.b);
      const seat = sp(L.WOOD_FLOOR, [0.6, 0.42, 0.28]);
      let n = 0;
      for (let z = -D / 2 + 0.6; z <= D / 2 && n < 140; z += 0.85)
        for (let x = -W / 2; x <= W / 2 && n < 140; x += 0.72, n++) simpleChair(b, fr, x, z, rng.range(-0.04, 0.04), seat);
      break;
    }
    case "stairsup": {
      // twelve steps up, straight into the ceiling
      const lino: Spec = sp(L.LINO);
      const side = sp(L.PLASTER, [0.85, 0.85, 0.83]);
      for (let i = 0; i < 12; i++) {
        fbox(b, fr, 0, 0, -1.6 + i * 0.27, 1.1, (i + 1) * 0.222, 0.27, { all: side, py: lino });
        fbox(b, fr, 0, (i + 1) * 0.222 - 0.01, -1.6 + i * 0.27 - 0.13, 1.1, 0.012, 0.025, STEEL);
      }
      for (let i = 0; i < 12; i += 3) fbox(b, fr, 0.58, (i + 1) * 0.222, -1.6 + i * 0.27, 0.03, 0.9, 0.03, DARK);
      solidRect(b, fr, 0, -0.07, 1.2, 3.3);
      break;
    }
    case "water": {
      // ankle-deep, perfectly still
      const h = 0.14;
      b.glass([pr.x - 1.38, pr.y + h, pr.z - 1.38], [2.76, 0, 0], [0, 0, 2.76], [0.1, 0.17, 0.2, 0.55]);
      // the tube light mirrored in the still water
      if (pr.a) b.glass(fr.p(-0.62, h + 0.003, -0.05), [fr.c * 1.24, 0, -fr.s * 1.24], [fr.s * 0.1, 0, fr.c * 0.1], [1.8, 1.9, 2.0, 0.55]);
      // the waterline on the walls
      b.glass([pr.x - 1.38, pr.y + h + 0.002, pr.z - 1.38], [2.76, 0, 0], [0, 0, 0.02], [0.6, 0.7, 0.75, 0.3]);
      if (rng.chance(0.3)) fbox(b, fr, rng.range(-0.8, 0.8), h - 0.005, rng.range(-0.8, 0.8), 0.21, 0.004, 0.3, sp(L.WHITE, [0.8, 0.8, 0.76]));
      break;
    }
    case "upside": {
      // the office, but on the ceiling
      const up = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, s: Parameters<typeof fbox>[8]) => fbox(b, fr, lx, CEIL - ly - sy, lz, sx, sy, sz, s);
      for (const side of [1, -1]) {
        const z = side * 0.4;
        up(0, 0.72, z, 1.6, 0.03, 0.8, WHITE);
        up(-0.77, 0, z, 0.04, 0.72, 0.72, GREY);
        up(0.77, 0, z, 0.04, 0.72, 0.72, GREY);
        up(0, 0.75, side * 0.18, 0.56, 0.34, 0.03, { all: DARK, [side > 0 ? "pz" : "nz"]: { layer: L.SCREEN } } as any);
        up(0, 0.44, side * 1.1, 0.48, 0.07, 0.46, FABRIC_DARK);
        up(0, 0.52, side * 1.33, 0.46, 0.52, 0.05, FABRIC_DARK);
        up(0, 0.1, side * 1.1, 0.05, 0.34, 0.05, DARK);
        up(0, 0.04, side * 1.1, 0.62, 0.04, 0.06, DARK);
      }
      break;
    }
    case "goal": {
      // handball goal, red and white
      const red = sp(L.WHITE, [0.8, 0.1, 0.08]);
      for (const x of [-1.5, 1.5]) for (let k = 0; k < 5; k++) fbox(b, fr, x, k * 0.4, 0, 0.08, 0.4, 0.08, k % 2 ? WHITE : red);
      for (let k = 0; k < 8; k++) fbox(b, fr, -1.5 + k * 0.375 + 0.19, 2.0, 0, 0.375, 0.08, 0.08, k % 2 ? WHITE : red);
      fbox(b, fr, -1.5, 0, -0.5, 0.04, 0.04, 1.0, GREY);
      fbox(b, fr, 1.5, 0, -0.5, 0.04, 0.04, 1.0, GREY);
      b.glass(fr.p(-1.5, 0, -1.0), [fr.c * 3, 0, -fr.s * 3], [0, 2.0, 0], [0.85, 0.85, 0.85, 0.12]);
      solidRect(b, fr, 0, -0.5, 3.1, 1.0);
      break;
    }
    case "ball": {
      const c = fr.p(0, 0.12, 0);
      b.geom(BLOB, c[0], c[1], c[2], 0, 0.12, 0.12, 0.12, sp(L.WHITE, [0.9, 0.45, 0.1]));
      break;
    }
    case "tball":
      b.geom(BLOB, pr.x, pr.y + 0.034, pr.z, 0, 0.034, 0.034, 0.034, sp(L.WHITE, [0.8, 0.95, 0.18]));
      break;
    case "cone":
      b.geom(CYL6, pr.x, pr.y + 0.14, pr.z, rng.range(0, 3), 0.1, 0.28, 0.1, sp(L.WHITE, [0.95, 0.5, 0.1]));
      break;
    case "hoop": {
      fbox(b, fr, 0, 0, 0.5, 0.12, 3.2, 0.12, GREY, true);
      fbox(b, fr, 0, 2.9, 0.62, 1.8, 1.05, 0.05, { all: WHITE, pz: sp(L.WHITE, [0.95, 0.95, 0.95]) });
      fbox(b, fr, 0, 3.05, 0.8, 0.46, 0.02, 0.46, sp(L.WHITE, [0.85, 0.3, 0.05]));
      break;
    }
    case "wallbars":
      fbox(b, fr, -0.45, 0, 0.06, 0.08, 2.6, 0.1, WOOD);
      fbox(b, fr, 0.45, 0, 0.06, 0.08, 2.6, 0.1, WOOD);
      for (let y = 0.2; y < 2.55; y += 0.17) fbox(b, fr, 0, y, 0.06, 0.82, 0.035, 0.035, WOOD);
      break;
    case "mats":
      for (let k = 0; k < 5; k++) fbox(b, fr, rng.range(-0.05, 0.05), k * 0.08, rng.range(-0.05, 0.05), 2.0, 0.08, 1.0, sp(L.FABRIC, [0.2, 0.3, 0.6]), k === 0);
      break;
    case "brace": {
      // diagonal steel rod across a bay of the footbridge
      const up = pr.a ? 1 : -1;
      const x0 = -1.35 * up, x1 = 1.35 * up, ya = 0.15, yb = CEIL - 0.1;
      const p0 = fr.p(x0, ya, 0.02), p1 = fr.p(x1, yb, 0.02);
      const d: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const l = Math.hypot(d[0], d[1], d[2]);
      const ax: V3 = [d[0] / l, d[1] / l, d[2] / l];
      const az = fr.az;
      const ay: V3 = [ax[1] * az[2] - ax[2] * az[1], ax[2] * az[0] - ax[0] * az[2], ax[0] * az[1] - ax[1] * az[0]];
      b.obox([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], ax, ay, az, [l / 2, 0.035, 0.035], sp(L.STEEL, [0.8, 0.82, 0.85]));
      fbox(b, fr, x0, 0, 0.02, 0.2, 0.2, 0.2, sp(L.CONCRETE, [0.8, 0.8, 0.78]));
      break;
    }
    case "downlights":
      for (const [x, z] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) {
        const c = fr.p(x!, -0.015, z!);
        b.geom(CYL, c[0], c[1], c[2], 0, 0.1, 0.015, 0.1, { layer: L.WHITE, emit: [1.8, 1.6, 1.3] });
      }
      break;
    case "gpillar": {
      const green = sp(L.WHITE, [0.45, 0.78, 0.12]);
      b.aabox(pr.x - 0.3, pr.y, pr.z - 0.3, pr.x + 0.3, pr.y + CEIL, pr.z + 0.3, { all: green }, 1);
      fbox(b, fr, 0, 1.9, 0.31, 0.3, 0.22, 0.02, { all: WHITE, pz: { layer: L.EXIT, emit: [1.2, 1.2, 1.2], uv: [0, 0, 1, 1] } });
      b.solid(pr.x - 0.32, pr.z - 0.32, pr.x + 0.32, pr.z + 0.32);
      break;
    }
    case "messtable": {
      fbox(b, fr, 0, 0.72, 0, 1.2, 0.03, 0.8, sp(L.WHITE, [0.92, 0.9, 0.84]), true);
      for (const [x, z] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) fbox(b, fr, x!, 0, z!, 0.04, 0.72, 0.04, STEEL);
      const seat = [sp(L.WOOD_FLOOR, [0.85, 0.62, 0.38]), sp(L.WHITE, [0.85, 0.85, 0.82])];
      for (const [x, z, r] of [[-0.3, 0.72, 0], [0.3, 0.72, 0], [-0.3, -0.72, Math.PI], [0.3, -0.72, Math.PI]] as const)
        if (rng.chance(0.85)) simpleChair(b, fr, x + rng.range(-0.08, 0.08), z + rng.range(-0.1, 0.15) * Math.sign(z), r + rng.range(-0.3, 0.3), rng.pick(seat));
      if (rng.chance(0.4)) fbox(b, fr, 0, 0.75, 0, 0.06, 0.12, 0.06, GREY);
      break;
    }
    case "counter": {
      // serving counter with a lit display
      fbox(b, fr, 0, 0, 0.45, 3.0, 0.95, 0.7, { all: STEEL, pz: sp(L.WHITE, [0.2, 0.2, 0.22]) }, true);
      fbox(b, fr, 0, 0.95, 0.45, 3.0, 0.04, 0.72, STEEL);
      fbox(b, fr, 0, 1.0, 0.35, 2.8, 0.4, 0.4, { all: DARK, pz: { layer: L.WHITE, emit: [1.1, 1.0, 0.8] } });
      if (pr.a % 3 === 0) fbox(b, fr, 1.0, 0.99, 0.35, 0.5, 0.7, 0.45, { all: DARK, pz: sp(L.STEEL, [0.9, 0.9, 0.9]) });
      break;
    }
    case "flag": {
      // Belgian tricolour hanging from the ceiling
      for (const [k, col] of [[-1, [0.05, 0.05, 0.05]], [0, [0.95, 0.8, 0.05]], [1, [0.85, 0.1, 0.12]]] as const)
        fbox(b, fr, k * 0.6, -1.8, 0, 0.6, 1.6, 0.01, sp(L.FABRIC, col as unknown as RGB));
      fbox(b, fr, 0, -0.2, 0, 1.9, 0.03, 0.03, DARK);
      break;
    }
    case "greenwall":
      fbox(b, fr, 0, 0, 0.0, 2.9, CEIL, 0.03, { all: sp(L.WHITE, [0.45, 0.78, 0.12]), pz: pr.a ? { layer: L.VRT_LOGO, tint: [0.45, 0.78, 0.12], uv: [-0.4, -0.3, 1.4, 1.3] } : sp(L.WHITE, [0.45, 0.78, 0.12]) });
      break;
    case "pooltable": {
      const felt = sp(L.FABRIC, [0.55, 0.06, 0.08]);
      const rail = sp(L.WOOD_FLOOR, [0.35, 0.18, 0.1]);
      fbox(b, fr, 0, 0, 0, 1.2, 0.68, 2.2, rail, true);
      fbox(b, fr, 0, 0.68, 0, 1.3, 0.1, 2.3, { all: rail, py: null });
      fbox(b, fr, 0, 0.7, 0, 1.12, 0.06, 2.12, felt);
      for (const [x, z] of [[-0.56, -1.06], [0.56, -1.06], [-0.58, 0], [0.58, 0], [-0.56, 1.06], [0.56, 1.06]]) fbox(b, fr, x!, 0.765, z!, 0.1, 0.02, 0.1, DARK);
      const cols: RGB[] = [[0.95, 0.9, 0.8], [0.9, 0.35, 0.05], [0.8, 0.05, 0.05], [0.9, 0.35, 0.05], [0.05, 0.05, 0.05], [0.8, 0.05, 0.05], [0.9, 0.35, 0.05]];
      for (const col of cols) {
        const c = fr.p(rng.range(-0.45, 0.45), 0.79, rng.range(-0.9, 0.9));
        b.geom(BLOB, c[0], c[1], c[2], 0, 0.028, 0.028, 0.028, sp(L.WHITE, col));
      }
      const cue = new Frame(...fr.p(0.2, 0.8, -0.3), fr.rot + 0.4);
      fbox(b, cue, 0, 0, 0, 0.025, 0.025, 1.45, sp(L.WOOD_FLOOR, [0.9, 0.75, 0.55]));
      break;
    }
    case "dartboard":
      fbox(b, fr, 0, 1.2, 0.02, 0.9, 0.9, 0.03, sp(L.WHITE, [0.45, 0.32, 0.2]));
      b.quad(fr.p(-0.23, 1.42, 0.04), [fr.c * 0.46, 0, -fr.s * 0.46], [0, 0.46, 0], fr.az, { layer: L.DARTBOARD, uv: [0, 0, 1, 1] }, 0);
      break;
    case "chalkboard":
      fbox(b, fr, 0, 0.9, 0.02, 1.5, 1.1, 0.03, { all: sp(L.WOOD_FLOOR, [0.6, 0.45, 0.3]), pz: { layer: L.CHALK, uv: [0, 0, 1, 1] } });
      break;
    case "plantshelf":
      fbox(b, fr, 0, 0.95, 0.15, 2.4, 0.04, 0.3, WHITE);
      for (let k = -2; k <= 2; k++) {
        fbox(b, fr, k * 0.5, 0.99, 0.15, 0.16, 0.15, 0.16, sp(L.WHITE, [0.8, 0.75, 0.7]));
        for (let l = 0; l < 3; l++) fbox(b, new Frame(...fr.p(k * 0.5, 0, 0.15), fr.rot + l * 1.1), 0, 1.14, 0, 0.03, 0.4, 0.015, sp(L.WHITE, [0.2, 0.45, 0.15]));
      }
      break;
    case "stools":
      for (const x of [-0.8, 0, 0.8]) {
        fbox(b, fr, x, 0.72, 0.4, 0.38, 0.05, 0.38, WOOD);
        for (const [dx, dz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) fbox(b, fr, x + dx!, 0, 0.4 + dz!, 0.03, 0.72, 0.03, WOOD);
      }
      fbox(b, fr, 0, 1.0, 0.1, 2.4, 0.04, 0.2, WOOD);
      break;
    case "mural":
      // Hec Leemans' Kampioenen, as a wall graphic in a lobby
      fbox(b, fr, 0, 0.35, 0.0, 2.3, 2.3, 0.04, { all: DARK, pz: { layer: L.KAMPWALL, uv: [0, 0, 1, 1] } });
      break;
    case "hallmural":
      fbox(b, fr, 0, 0, 0.0, 5.6, 5.6, 0.03, { all: DARK, pz: { layer: L.KAMPWALL, uv: [0, 0, 1, 1] } });
      break;
    case "banner": {
      // hall banner on a rod, hung from the vault on two wires; row pr.a of the banners layer
      const face: Spec = { layer: L.BANNERS, uv: cellUV(pr.a, 1, 4) };
      fbox(b, fr, 0, -1.0, 0, 4.0, 1.0, 0.015, { all: WHITE, pz: face, nz: face });
      fbox(b, fr, 0, 0, 0, 4.2, 0.04, 0.04, STEEL);
      for (const x of [-1.9, 1.9]) fbox(b, fr, x, 0.04, 0, 0.01, 1.6, 0.01, DARK);
      break;
    }
    case "bigbanner": {
      const face: Spec = { layer: L.BANNERS, uv: cellUV(0, 1, 4) };
      fbox(b, fr, 0, -1.6, 0, 6.4, 1.6, 0.02, { all: WHITE, pz: face });
      fbox(b, fr, 0, 0, 0, 6.6, 0.05, 0.05, STEEL);
      break;
    }
    case "shirtrack": {
      // a rolling rack with the green-and-yellow shirts
      for (const x of [-0.65, 0.65]) {
        fbox(b, fr, x, 0, 0, 0.04, 1.75, 0.04, STEEL);
        fbox(b, fr, x, 0.02, 0, 0.06, 0.04, 0.5, STEEL);
      }
      fbox(b, fr, 0, 1.73, 0, 1.34, 0.03, 0.03, STEEL);
      const shirt: Spec = { layer: L.MISC, uv: cellUV(0, 2, 2) };
      for (let k = 0; k < 4; k++) {
        const x = -0.45 + k * 0.3 + rng.range(-0.04, 0.04);
        const f = new Frame(...fr.p(x, 0, 0), fr.rot + Math.PI / 2 + rng.range(-0.25, 0.25));
        fbox(b, f, 0, 1.68, 0, 0.3, 0.04, 0.012, DARK);
        fbox(b, f, 0, 0.98, 0, 0.5, 0.7, 0.04, { all: sp(L.WHITE, [0.2, 0.55, 0.22]), pz: shirt, nz: shirt });
        for (const s of [-1, 1]) fbox(b, new Frame(...f.p(s * 0.3, 0, 0), f.rot - s * 0.5), 0, 1.38, 0, 0.18, 0.26, 0.035, sp(L.WHITE, [0.2, 0.55, 0.22]));
      }
      solidRect(b, fr, 0, 0, 1.4, 0.5);
      break;
    }
    case "radiologo": {
      // a lit panel with the station's logo; pr.b = 1 + station for the ON AIR sign above
      fbox(b, fr, 0, 1.0, 0.03, 2.4, 1.2, 0.06, { all: DARK, pz: { layer: L.RADIOWALL, emit: [0.95, 0.95, 0.95], uv: cellUV(pr.a, 2, 4) } });
      if (pr.b) {
        fbox(b, fr, 0, 2.28, 0.04, 0.84, 0.25, 0.08, { all: DARK, pz: { layer: L.ONAIR, emit: [2.2, 2.2, 2.2], uv: [0, 0, 1, 1], radio: pr.b - 1 } });
        // the station's own studio camera, live, over the logo when you're around
        fbox(b, fr, 0, 1.0, 0.062, 2.13, 1.2, 0.002, { pz: { layer: L.SCREEN, emit: [0.95, 0.95, 0.95], uv: [0, 0, 1, 1], live: pr.b - 1 } });
      }
      break;
    }
    case "foam": {
      // acoustic foam: a grid of wedges, every other one turned
      const t = rng.range(0.13, 0.19);
      const foam = sp(L.FABRIC, [t, t, t * 1.08]);
      fbox(b, fr, 0, 0.6, 0.01, 2.5, 1.8, 0.02, foam);
      for (let r = 0; r < 5; r++)
        for (let k = 0; k < 7; k++) {
          const turn = (r + k) % 2;
          fbox(b, fr, -1.08 + k * 0.36, 0.64 + r * 0.35, 0.05, turn ? 0.3 : 0.1, turn ? 0.1 : 0.3, 0.07, foam);
        }
      break;
    }
    case "radiodesk": {
      // host at -z with the console, two guests at +z; mics on arms
      const top = sp(L.WHITE, [0.2, 0.2, 0.22]);
      fbox(b, fr, 0, 0.72, 0, 2.1, 0.04, 0.95, { all: top, py: sp(L.WOOD_FLOOR, [0.55, 0.45, 0.38]) }, true);
      fbox(b, fr, 0, 0, 0, 1.9, 0.72, 0.6, sp(L.WHITE, [0.14, 0.14, 0.16]));
      fbox(b, fr, 0, 0.76, -0.24, 1.0, 0.05, 0.36, { all: DARK, py: { layer: L.DESK_BUTTONS, emit: [0.75, 0.75, 0.75], uv: [0, 0, 2, 0.7] } });
      // the red ON AIR lamp on the desk
      if (pr.b) fbox(b, fr, 0.62, 0.76, -0.3, 0.1, 0.06, 0.1, { all: DARK, py: { layer: L.WHITE, emit: [2.0, 0.12, 0.06], radio: pr.b - 1 }, pz: { layer: L.WHITE, emit: [2.0, 0.12, 0.06], radio: pr.b - 1 } });
      const back = new Frame(pr.x, pr.y, pr.z, pr.rot + Math.PI);
      for (const x of [-0.55, 0.55]) monitor(b, back, x, 0.76, -0.05, rng.chance(0.8), rng.pick([L.SCREEN, L.NOISE, L.TV_BARS]));
      const mic = (x: number, z: number, dir: number) => {
        fbox(b, fr, x, 0.76, z, 0.025, 0.42, 0.025, DARK);
        fbox(b, fr, x, 1.16, z + dir * 0.14, 0.02, 0.02, 0.3, DARK);
        fbox(b, fr, x, 1.07, z + dir * 0.3, 0.07, 0.14, 0.07, sp(L.CARPET_GREY, [0.2, 0.2, 0.22]));
      };
      mic(-0.2, -0.3, -1);
      mic(-0.55, 0.3, 1);
      mic(0.55, 0.3, 1);
      chair(b, fr, -0.2, -0.95, Math.PI + rng.range(-0.3, 0.3));
      chair(b, fr, -0.55, 0.95, rng.range(-0.3, 0.3));
      if (rng.chance(0.6)) chair(b, fr, 0.55, 0.95, rng.range(-0.3, 0.3));
      // headphones and a mug
      for (const x of [-0.55, 0.55]) {
        fbox(b, fr, x - 0.08, 0.76, 0.2, 0.05, 0.06, 0.08, sp(L.WHITE, [0.08, 0.08, 0.09]));
        fbox(b, fr, x + 0.08, 0.76, 0.2, 0.05, 0.06, 0.08, sp(L.WHITE, [0.08, 0.08, 0.09]));
        fbox(b, fr, x, 0.8, 0.2, 0.18, 0.015, 0.02, sp(L.WHITE, [0.08, 0.08, 0.09]));
      }
      cyl(b, fr, 0.3, 0.76, -0.25, 0.04, 0.1, rng.pick([RED, WHITE, sp(L.WHITE, [0.95, 0.8, 0.1])]));
      break;
    }
    case "brandwall": {
      // an LED wall: pr.a 0 Ketnet, 1 Sporza; pr.b 1 = the piece with the logo
      const layer = pr.a ? L.SPORZAWALL : L.KETNETWALL;
      fbox(b, fr, 0, 0, 0, 2.98, 3.2, 0.04, { all: DARK, pz: { layer, emit: [0.8, 0.8, 0.84], uv: pr.b ? [0.5, 0, 1, 1] : [0, 0, 0.5, 1] } });
      break;
    }
    case "greenscreen": {
      const g = sp(L.WHITE, [0.1, 0.6, 0.2]);
      fbox(b, fr, 0, 0, 0.0, 2.98, 3.2, 0.03, g);
      fbox(b, fr, 0, 0, 0.7, 2.98, 0.012, 1.4, g);
      break;
    }
    case "kdesk": {
      // the Ketnet desk: pink, with the K on the front
      fbox(b, fr, 0, 0, 0, 2.4, 0.95, 0.8, { all: sp(L.WHITE, [0.95, 0.32, 0.62]), pz: ident(0, 0.85) }, true);
      fbox(b, fr, 0, 0.95, -0.05, 2.5, 0.05, 0.95, sp(L.WHITE, [0.95, 0.95, 0.92]));
      fbox(b, fr, -1.25, 0, 0, 0.1, 0.95, 0.8, sp(L.WHITE, [0.43, 0.9, 0.63]));
      fbox(b, fr, 1.25, 0, 0, 0.1, 0.95, 0.8, sp(L.WHITE, [1.0, 0.7, 0.0]));
      for (const x of [-0.6, 0.6]) chair(b, fr, x, -0.75, Math.PI);
      cyl(b, fr, 0.8, 1.0, 0.1, 0.05, 0.12, sp(L.WHITE, [0.43, 0.9, 0.63]));
      break;
    }
    case "sdesk": {
      // the Sporza desk: a high table, three stools
      fbox(b, fr, 0, 0, 0, 2.6, 1.05, 0.7, { all: DARK, pz: { layer: L.MISC, uv: cellUV(2, 2, 2), tint: [1.3, 1.3, 1.3] } }, true);
      fbox(b, fr, 0, 1.05, -0.05, 2.7, 0.04, 0.85, sp(L.WHITE, [0.85, 0.87, 0.86]));
      fbox(b, fr, 0, 0.02, 0.36, 2.6, 0.03, 0.02, { layer: L.WHITE, emit: [0.3, 1.2, 0.5] });
      for (const x of [-0.8, 0, 0.8]) {
        cyl(b, fr, x, 0, -0.75, 0.2, 0.03, DARK);
        cyl(b, fr, x, 0.03, -0.75, 0.03, 0.72, STEEL);
        cyl(b, fr, x, 0.75, -0.75, 0.2, 0.06, sp(L.CARPET_GREY, [0.2, 0.22, 0.2]));
      }
      for (const x of [-0.8, 0.8]) monitor(b, new Frame(...fr.p(0, 0.3, 0), fr.rot + Math.PI), x, 0.78, 0.2, true, L.SPORTFLOOR);
      break;
    }
    case "beanbag": {
      const cols: RGB[] = [[0.95, 0.32, 0.62], [0.43, 0.9, 0.63], [1.0, 0.7, 0.0], [0.22, 0.6, 1.0], [0.9, 0.9, 0.9]];
      const p = fr.p(0, 0.28, 0);
      b.geom(BLOB, p[0], p[1], p[2], pr.rot, 0.5, 0.3, 0.45, sp(L.FABRIC, cols[pr.a % cols.length]!));
      const q = fr.p(0, 0.42, -0.28);
      b.geom(BLOB, q[0], q[1], q[2], pr.rot, 0.42, 0.28, 0.2, sp(L.FABRIC, cols[pr.a % cols.length]!));
      solidRect(b, fr, 0, 0, 0.8, 0.8);
      break;
    }
    case "tvset":
      tvSet(b, fr, pr.a, pr.b % 2 === 0, Math.floor(pr.b / 2) / 10, rng);
      break;
    case "rail": {
      // a rolling rail of costumes: uprights, a bar, garments hanging across it
      for (const x of [-1.15, 1.15]) {
        fbox(b, fr, x, 0.06, 0, 0.035, 1.68, 0.035, STEEL);
        fbox(b, fr, x, 0.02, 0, 0.05, 0.04, 0.55, STEEL);
      }
      fbox(b, fr, 0, 1.72, 0, 2.34, 0.03, 0.03, STEEL);
      const cols: RGB[] = [[0.7, 0.1, 0.12], [0.1, 0.2, 0.55], [0.85, 0.75, 0.2], [0.15, 0.45, 0.2], [0.55, 0.2, 0.55], [0.9, 0.9, 0.85], [0.08, 0.08, 0.09], [0.85, 0.45, 0.6], [0.45, 0.3, 0.18], [0.2, 0.6, 0.65]];
      let x = -1.05;
      while (x < 1.05) {
        const len = rng.chance(0.25) ? rng.range(1.2, 1.45) : rng.range(0.6, 1.0);
        const col = sp(L.FABRIC, rng.pick(cols));
        const f = new Frame(...fr.p(x, 0, 0), fr.rot + rng.range(-0.12, 0.12));
        fbox(b, f, 0, 1.64, 0, 0.015, 0.07, 0.36, DARK);
        fbox(b, f, 0, 1.64 - len, 0, 0.05, len, rng.range(0.4, 0.52), col);
        if (len > 1.1) fbox(b, f, 0, 1.64 - len, 0, 0.09, 0.4, 0.62, col);
        x += rng.range(0.1, 0.17);
      }
      solidRect(b, fr, 0, 0, 2.4, 0.6);
      break;
    }
    case "mannequin": {
      // a dress form in costume: knight, ball gown, bunny, king, clown
      const kind = pr.a % 5;
      cyl(b, fr, 0, 0, 0, 0.22, 0.03, DARK);
      cyl(b, fr, 0, 0.03, 0, 0.025, 0.95, STEEL);
      const cols: [RGB, RGB][] = [[[0.55, 0.57, 0.6], [0.4, 0.42, 0.45]], [[0.95, 0.55, 0.7], [0.95, 0.8, 0.85]], [[0.95, 0.95, 0.93], [0.95, 0.7, 0.75]], [[0.62, 0.06, 0.08], [0.95, 0.78, 0.15]], [[0.2, 0.5, 0.9], [0.95, 0.85, 0.1]]];
      const [main, trim] = cols[kind]!;
      const m = kind === 0 ? sp(L.STEEL, main) : sp(L.FABRIC, main);
      const body = fr.p(0, 1.28, 0);
      b.geom(BLOB, body[0], body[1], body[2], fr.rot, 0.2, 0.34, 0.14, m);
      const head = fr.p(0, 1.78, 0);
      b.geom(BLOB, head[0], head[1], head[2], fr.rot, 0.1, 0.13, 0.11, kind === 0 ? m : sp(L.WHITE, [0.85, 0.8, 0.72]));
      if (kind === 1 || kind === 3) {
        // a long skirt or robe
        const p = fr.p(0, 0.55, 0);
        b.geom(CYL, p[0], p[1], p[2], fr.rot, kind === 1 ? 0.5 : 0.32, 0.95, kind === 1 ? 0.5 : 0.32, m);
      } else fbox(b, fr, 0, 0.62, 0, 0.3, 0.42, 0.16, m);
      if (kind === 2) for (const x of [-0.05, 0.05]) fbox(b, fr, x, 1.88, 0, 0.04, 0.26, 0.02, sp(L.WHITE, trim));
      if (kind === 3) {
        cyl(b, fr, 0, 1.9, 0, 0.1, 0.08, sp(L.WHITE, trim));
        fbox(b, fr, 0, 1.2, 0.1, 0.5, 0.06, 0.08, sp(L.WHITE, trim));
      }
      if (kind === 4) for (const [x, z] of [[0, 0.14], [0, 0.15]]) b.geom(BLOB, ...fr.p(x!, 1.48 - z! * 2, z!), fr.rot, 0.04, 0.04, 0.02, sp(L.WHITE, trim));
      if (kind === 0) fbox(b, fr, 0, 1.2, -0.02, 0.44, 0.28, 0.2, sp(L.STEEL, trim));
      solidRect(b, fr, 0, 0, 0.6, 0.6);
      break;
    }
    case "lendcounter": {
      // the lending desk (pr.a 1 kostuums, 2 rekwisieten) with its sign on the wall behind
      const top = sp(L.WOOD_FLOOR, [0.55, 0.45, 0.35]);
      fbox(b, fr, 0, 0, 1.0, 2.2, 1.02, 0.6, { all: sp(L.WHITE, [0.3, 0.3, 0.33]), pz: sp(L.WHITE, [0.85, 0.85, 0.82]) }, true);
      fbox(b, fr, 0, 1.02, 1.0, 2.3, 0.04, 0.7, top);
      fbox(b, fr, 0, 1.72, 0.01, 1.3, 0.65, 0.02, { all: DARK, pz: { layer: L.PLAQUES, emit: [0.9, 0.9, 0.9], uv: cellUV(pr.a, 2, 4) } });
      fbox(b, fr, -0.6, 1.06, 1.05, 0.34, 0.04, 0.24, sp(L.WHITE, [0.2, 0.25, 0.5]));
      fbox(b, fr, -0.6, 1.1, 1.05, 0.3, 0.005, 0.2, OFFWHITE);
      cyl(b, fr, 0.5, 1.06, 1.1, 0.05, 0.035, STEEL);
      cyl(b, fr, 0.52, 1.095, 1.1, 0.01, 0.03, DARK);
      fbox(b, fr, 0.95, 1.06, 1.15, 0.12, 0.2, 0.1, { all: RED, pz: sp(L.WHITE, [0.95, 0.95, 0.9]) });
      simpleChair(b, fr, 0.2, 0.4, Math.PI, sp(L.CARPET_GREY, [0.3, 0.3, 0.33]));
      break;
    }
    case "hatshelf": {
      fbox(b, fr, 0, 0, 0.2, 2.0, 0.04, 0.38, GREY);
      for (const y of [1.0, 1.45, 1.9]) {
        fbox(b, fr, 0, y, 0.2, 2.0, 0.03, 0.38, WOOD);
        for (let k = 0; k < 4; k++) {
          const x = -0.75 + k * 0.5 + rng.range(-0.05, 0.05);
          const col = sp(L.FABRIC, rng.pick([[0.1, 0.1, 0.1], [0.6, 0.1, 0.1], [0.75, 0.65, 0.4], [0.2, 0.25, 0.5], [0.3, 0.5, 0.25]] as RGB[]));
          if (rng.chance(0.3)) {
            const h = fr.p(x, y + 0.14, 0.2);
            b.geom(BLOB, h[0], h[1], h[2], fr.rot, 0.1, 0.13, 0.1, sp(L.WHITE, [0.85, 0.82, 0.78]));
            b.geom(BLOB, h[0], h[1] + 0.08, h[2], fr.rot, 0.11, 0.08, 0.11, sp(L.FABRIC, rng.pick([[0.9, 0.8, 0.3], [0.5, 0.25, 0.1], [0.95, 0.4, 0.7]] as RGB[])));
          } else {
            cyl(b, fr, x, y + 0.03, 0.2, 0.17, 0.015, col);
            cyl(b, fr, x, y + 0.045, 0.2, 0.1, rng.range(0.08, 0.2), col);
          }
        }
      }
      for (const x of [-0.98, 0.98]) fbox(b, fr, x, 0, 0.2, 0.03, 2.0, 0.38, GREY);
      solidRect(b, fr, 0, 0.2, 2.0, 0.4);
      break;
    }
    case "mirror":
      fbox(b, fr, 0, 0.2, 0.02, 0.8, 1.9, 0.04, sp(L.WOOD_FLOOR, [0.5, 0.35, 0.2]));
      fbox(b, fr, 0, 0.26, 0.045, 0.68, 1.78, 0.005, sp(L.STEEL, [1.25, 1.3, 1.35]));
      break;
    case "sewing": {
      fbox(b, fr, 0, 0.72, 0.4, 1.4, 0.04, 0.7, WOOD, true);
      for (const x of [-0.65, 0.65]) fbox(b, fr, x, 0, 0.4, 0.05, 0.72, 0.6, DARK);
      fbox(b, fr, -0.1, 0.76, 0.35, 0.45, 0.14, 0.18, WHITE);
      fbox(b, fr, 0.02, 0.9, 0.35, 0.18, 0.18, 0.16, WHITE);
      fbox(b, fr, -0.15, 1.04, 0.35, 0.4, 0.08, 0.16, WHITE);
      const r = fr.p(0.45, 0.83, 0.35);
      b.geom(CYL, r[0], r[1], r[2], fr.rot, 0.08, 0.5, 0.08, sp(L.FABRIC, [0.7, 0.15, 0.3]), Math.PI / 2);
      simpleChair(b, fr, 0, 1.0, 0, GREY);
      break;
    }
    case "vanity": {
      // a dressing-room mirror framed in bulbs, twice, on a long counter
      fbox(b, fr, 0, 0.74, 0.25, 2.6, 0.05, 0.5, sp(L.WHITE, [0.92, 0.9, 0.86]), true);
      fbox(b, fr, 0, 0, 0.25, 2.5, 0.74, 0.46, sp(L.WHITE, [0.55, 0.45, 0.42]));
      const bulb: Spec = { layer: L.WHITE, emit: [2.0, 1.75, 1.3] };
      for (const x of [-0.65, 0.65]) {
        fbox(b, fr, x, 1.0, 0.02, 1.0, 0.85, 0.03, sp(L.WHITE, [0.2, 0.18, 0.18]));
        fbox(b, fr, x, 1.06, 0.04, 0.84, 0.72, 0.005, sp(L.STEEL, [1.25, 1.3, 1.35]));
        for (let k = 0; k < 5; k++) {
          fbox(b, fr, x - 0.4 + k * 0.2, 1.84, 0.06, 0.06, 0.06, 0.06, bulb);
          if (k > 0 && k < 4) for (const s of [-0.47, 0.47]) fbox(b, fr, x + s, 1.0 + k * 0.2, 0.06, 0.06, 0.06, 0.06, bulb);
        }
        chair(b, fr, x + rng.range(-0.15, 0.15), 1.0, rng.range(-0.3, 0.3));
        for (let k = 0; k < 4; k++) fbox(b, fr, x + rng.range(-0.35, 0.35), 0.79, rng.range(0.1, 0.35), 0.04, rng.range(0.04, 0.14), 0.04, sp(L.WHITE, rng.pick([[0.8, 0.1, 0.2], [0.1, 0.1, 0.1], [0.95, 0.8, 0.7], [0.9, 0.9, 0.9], [0.6, 0.3, 0.6]] as RGB[])));
      }
      break;
    }
    case "flowers": {
      cyl(b, fr, 0, 0, 0, 0.35, 0.03, DARK);
      cyl(b, fr, 0, 0.03, 0, 0.04, 0.6, STEEL);
      cyl(b, fr, 0, 0.63, 0, 0.35, 0.03, WHITE, CYL);
      cyl(b, fr, 0, 0.66, 0, 0.07, 0.25, sp(L.WHITE, [0.7, 0.85, 0.9]));
      for (let k = 0; k < 9; k++) {
        const a = k * 0.7, r = rng.range(0.02, 0.14);
        b.geom(BLOB, pr.x + Math.cos(a) * r, pr.y + rng.range(0.95, 1.15), pr.z + Math.sin(a) * r, a, 0.05, 0.05, 0.05, sp(L.WHITE, rng.pick([[0.95, 0.3, 0.45], [0.95, 0.85, 0.2], [0.95, 0.95, 0.95], [0.6, 0.2, 0.7]] as RGB[])));
      }
      solidRect(b, fr, 0, 0, 0.7, 0.7);
      break;
    }
    case "vipbar": {
      // back bar with backlit bottles, a dark counter with a purple glow, stools; pr.a: the neon sign
      fbox(b, fr, 0, 0, 0.2, 2.9, 0.9, 0.4, sp(L.WOOD_FLOOR, [0.2, 0.12, 0.1]), true);
      fbox(b, fr, 0, 0.95, 0.06, 2.9, 1.0, 0.1, { all: DARK, pz: { layer: L.MISC, emit: [1.0, 0.85, 0.75], uv: [0.5, 0, 1, 0.5] } });
      fbox(b, fr, 0, 1.95, 0.15, 2.9, 0.05, 0.3, sp(L.WOOD_FLOOR, [0.2, 0.12, 0.1]));
      if (pr.a) fbox(b, fr, 0, 2.08, 0.03, 1.1, 0.55, 0.03, { all: DARK, pz: { layer: L.PLAQUES, emit: [1.4, 1.3, 1.2], uv: cellUV(0, 2, 4) } });
      if (pr.b) break; // a narrow room: just the shelves
      fbox(b, fr, 0, 0, 1.4, 2.9, 1.05, 0.5, { all: sp(L.WOOD_FLOOR, [0.16, 0.09, 0.1]), pz: sp(L.CARPET_GREY, [0.3, 0.12, 0.25]) }, true);
      fbox(b, fr, 0, 1.05, 1.42, 2.95, 0.05, 0.62, sp(L.BLACK, [1.6, 1.4, 1.6]));
      fbox(b, fr, 0, 0.05, 1.66, 2.9, 0.03, 0.02, { layer: L.WHITE, emit: [0.9, 0.3, 1.4] });
      for (const x of [-0.9, 0, 0.9]) {
        cyl(b, fr, x, 0, 2.05, 0.18, 0.03, STEEL);
        cyl(b, fr, x, 0.03, 2.05, 0.03, 0.72, STEEL);
        cyl(b, fr, x, 0.75, 2.05, 0.2, 0.07, sp(L.FABRIC, [0.45, 0.1, 0.3]));
        if (rng.chance(0.5)) {
          cyl(b, fr, x + 0.1, 1.1, 1.5, 0.035, 0.12, { layer: L.WHITE, emit: [0.7, 0.75, 0.8] });
          cyl(b, fr, x + 0.1, 1.1, 1.5, 0.03, 0.05, { layer: L.WHITE, emit: [0.9, 0.55, 0.15] });
        }
      }
      break;
    }
    case "lounge": {
      // two velvet sofas across a low table with a candle
      const v = sp(L.FABRIC, rng.pick([[0.42, 0.1, 0.28], [0.18, 0.1, 0.35], [0.5, 0.12, 0.12]] as RGB[]));
      for (const s of [-1, 1]) {
        const f = new Frame(...fr.p(0, 0, s * 1.0), fr.rot + (s > 0 ? 0 : Math.PI));
        fbox(b, f, 0, 0, 0, 1.6, 0.42, 0.7, v, true);
        fbox(b, f, 0, 0.42, 0.28, 1.6, 0.42, 0.16, v);
        for (const x of [-0.8, 0.8]) fbox(b, f, x, 0.42, 0, 0.12, 0.18, 0.7, v);
      }
      fbox(b, fr, 0, 0, 0, 1.0, 0.36, 0.55, { all: DARK, py: sp(L.STEEL, [0.9, 0.85, 0.7]) }, true);
      cyl(b, fr, 0, 0.36, 0, 0.04, 0.08, { layer: L.WHITE, emit: [1.8, 1.2, 0.5] });
      break;
    }
    case "rope": {
      for (const x of [-0.7, 0.7]) {
        cyl(b, fr, x, 0, 0, 0.16, 0.03, STEEL);
        cyl(b, fr, x, 0.03, 0, 0.025, 0.92, sp(L.STEEL, [1.1, 1.0, 0.7]));
        cyl(b, fr, x, 0.95, 0, 0.04, 0.05, sp(L.STEEL, [1.1, 1.0, 0.7]));
      }
      const pts: V3[] = [];
      for (let k = 0; k <= 6; k++) pts.push(fr.p(-0.7 + (k * 1.4) / 6, 0.9 - Math.sin((Math.PI * k) / 6) * 0.2, 0));
      for (let k = 0; k < 6; k++) bar(b, pts[k]!, pts[k + 1]!, 0.035, sp(L.FABRIC, [0.6, 0.05, 0.1]));
      solidRect(b, fr, 0, 0, 1.5, 0.2);
      break;
    }
    case "rtable": {
      // white linen, four chairs, plates, glasses, a candle
      cyl(b, fr, 0, 0.26, 0, 0.62, 0.5, sp(L.FABRIC, [0.95, 0.94, 0.9]));
      cyl(b, fr, 0, 0.76, 0, 0.62, 0.01, sp(L.FABRIC, [0.98, 0.97, 0.94]));
      cyl(b, fr, 0, 0, 0, 0.3, 0.26, DARK);
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + 0.3;
        const x = Math.sin(a) * 0.95, z = Math.cos(a) * 0.95;
        if (rng.chance(0.9)) simpleChair(b, fr, x, z, a + rng.range(-0.2, 0.2), sp(L.FABRIC, [0.5, 0.12, 0.14]));
        const px = Math.sin(a) * 0.42, pz = Math.cos(a) * 0.42;
        cyl(b, fr, px, 0.77, pz, 0.12, 0.012, WHITE);
        cyl(b, fr, px + Math.cos(a) * 0.18, 0.77, pz - Math.sin(a) * 0.18, 0.03, 0.14, { layer: L.WHITE, emit: [0.65, 0.7, 0.75] });
      }
      cyl(b, fr, 0, 0.77, 0, 0.025, 0.2, WHITE);
      cyl(b, fr, 0, 0.97, 0, 0.012, 0.03, { layer: L.WHITE, emit: [2.0, 1.4, 0.6] });
      solidRect(b, fr, 0, 0, 1.4, 1.4);
      break;
    }
    case "winerack": {
      fbox(b, fr, 0, 0, 0.2, 2.2, 2.1, 0.4, { all: sp(L.WOOD_FLOOR, [0.3, 0.18, 0.12]), pz: sp(L.WOOD_FLOOR, [0.12, 0.07, 0.05]) }, true);
      for (let r = 0; r < 9; r++)
        for (let k = 0; k < 11; k++) {
          if (rng.chance(0.15)) continue;
          fbox(b, fr, -0.95 + k * 0.19, 0.12 + r * 0.21, 0.405, 0.08, 0.08, 0.01, sp(L.WHITE, rng.pick([[0.25, 0.04, 0.06], [0.12, 0.2, 0.08], [0.08, 0.08, 0.06], [0.7, 0.6, 0.3]] as RGB[])));
        }
      break;
    }
    case "lectern": {
      fbox(b, fr, 0, 0, 0, 0.5, 1.05, 0.4, sp(L.WOOD_FLOOR, [0.3, 0.18, 0.12]), true);
      b.obox(fr.p(0, 1.1, 0), fr.ax, [fr.s * -0.34, 0.94, fr.c * -0.34] as V3, [fr.s * 0.94, 0.34, fr.c * 0.94] as V3, [0.3, 0.03, 0.25], sp(L.WOOD_FLOOR, [0.3, 0.18, 0.12]));
      b.obox(fr.p(0, 1.14, 0), fr.ax, [fr.s * -0.34, 0.94, fr.c * -0.34] as V3, [fr.s * 0.94, 0.34, fr.c * 0.94] as V3, [0.2, 0.012, 0.15], OFFWHITE);
      fbox(b, fr, 0.2, 1.1, -0.15, 0.04, 0.2, 0.04, STEEL);
      fbox(b, fr, 0.2, 1.3, -0.1, 0.1, 0.05, 0.1, { layer: L.WHITE, emit: [1.6, 1.3, 0.8] });
      break;
    }
    case "ceodesk": {
      // the CEO's desk faces the room; the leather chair has its back to the VRT logo
      const wood = sp(L.WOOD_FLOOR, [0.32, 0.18, 0.11]);
      fbox(b, fr, 0, 0.74, 0, 2.4, 0.05, 1.0, wood, true);
      fbox(b, fr, 0, 0, 0.42, 2.3, 0.74, 0.08, wood);
      for (const x of [-1.1, 1.1]) fbox(b, fr, x, 0, 0, 0.12, 0.74, 0.95, wood);
      const back = new Frame(pr.x, pr.y, pr.z, pr.rot + Math.PI);
      monitor(b, back, 0.35, 0.79, 0.15, true, L.NWSWALL);
      fbox(b, fr, 0.3, 0.8, 0.38, 0.4, 0.1, 0.03, { all: sp(L.WHITE, [0.5, 0.4, 0.2]), pz: { layer: L.PLAQUES, uv: cellUV(3, 2, 4) } });
      fbox(b, fr, -0.7, 0.79, 0.1, 0.22, 0.05, 0.18, DARK);
      fbox(b, fr, -0.2, 0.79, 0.05, 0.3, 0.02, 0.4, OFFWHITE);
      cyl(b, fr, -0.95, 0.79, -0.2, 0.04, 0.1, sp(L.STEEL, [0.9, 0.8, 0.5]));
      // the leather chair
      const lea = sp(L.CARPET_GREY, [0.22, 0.12, 0.08]);
      const cf = new Frame(...fr.p(0, 0, -0.85), fr.rot + Math.PI);
      fbox(b, cf, 0, 0.45, 0, 0.62, 0.12, 0.6, lea);
      fbox(b, cf, 0, 0.55, 0.28, 0.62, 0.95, 0.12, lea);
      for (const x of [-0.33, 0.33]) fbox(b, cf, x, 0.55, 0, 0.08, 0.22, 0.55, lea);
      fbox(b, cf, 0, 0.08, 0, 0.06, 0.37, 0.06, DARK);
      fbox(b, cf, 0, 0.04, 0, 0.7, 0.04, 0.07, DARK);
      fbox(b, cf, 0, 0.04, 0, 0.07, 0.04, 0.7, DARK);
      // two chairs for the visitors
      for (const x of [-0.5, 0.5]) chair(b, fr, x, 1.05, rng.range(-0.2, 0.2));
      break;
    }
    case "bookcase": {
      const wood = sp(L.WOOD_FLOOR, [0.35, 0.22, 0.14]);
      fbox(b, fr, 0, 0, 0.2, 2.6, 2.3, 0.04, wood);
      for (const x of [-1.28, 1.28]) fbox(b, fr, x, 0, 0.2, 0.04, 2.3, 0.4, wood);
      for (let r = 0; r < 5; r++) {
        const y = 0.05 + r * 0.45;
        fbox(b, fr, 0, y, 0.2, 2.56, 0.03, 0.4, wood);
        let x = -1.2;
        while (x < 1.15) {
          const bw = rng.range(0.03, 0.07), bh = rng.range(0.24, 0.38);
          if (rng.chance(0.08)) x += 0.15;
          else fbox(b, fr, x + bw / 2, y + 0.03, 0.26, bw, bh, rng.range(0.18, 0.26), sp(L.WHITE, rng.pick([[0.5, 0.1, 0.1], [0.12, 0.2, 0.4], [0.15, 0.3, 0.15], [0.7, 0.6, 0.45], [0.1, 0.1, 0.1], [0.85, 0.82, 0.72]] as RGB[])));
          x += bw + 0.004;
        }
      }
      solidRect(b, fr, 0, 0.2, 2.6, 0.42);
      break;
    }
    case "vrtframe":
      fbox(b, fr, 0, 0.95, 0.02, 1.4, 1.4, 0.04, sp(L.WHITE, [0.15, 0.15, 0.16]));
      fbox(b, fr, 0, 1.0, 0.045, 1.3, 1.3, 0.005, { layer: L.VRT_LOGO, uv: [0, 0, 1, 1] });
      break;
    case "cflag": {
      // a VRT flag on a pole with a brass eagle... well, ball
      cyl(b, fr, 0, 0, 0.4, 0.2, 0.05, DARK);
      cyl(b, fr, 0, 0.05, 0.4, 0.02, 2.3, sp(L.STEEL, [1.0, 0.9, 0.6]));
      b.geom(BLOB, ...fr.p(0, 2.38, 0.4), 0, 0.045, 0.045, 0.045, sp(L.STEEL, [1.1, 0.95, 0.55]));
      fbox(b, fr, 0.5, 1.25, 0.4, 0.95, 0.95, 0.01, { layer: L.VRT_LOGO, uv: [0, 0, 1, 1] });
      break;
    }
    case "rollerdoor": {
      // a loading-dock door with bumpers and hazard stripes; pr.b: half open onto daylight
      const open = pr.b ? 1.1 : 0;
      fbox(b, fr, 0, open, 0.02, 2.6, 2.4 - open, 0.04, { all: GREY, pz: { layer: L.ROLLER, uv: [0, open / 2.4, 1, 1] } });
      if (open) fbox(b, fr, 0, 0, 0.005, 2.6, open, 0.01, { layer: L.WHITE, emit: [1.9, 1.95, 2.0] });
      fbox(b, fr, 0, 2.4, 0.18, 2.8, 0.3, 0.36, sp(L.STEEL, [0.7, 0.72, 0.75]));
      for (const x of [-1.35, 1.35]) {
        fbox(b, fr, x, 0, 0.06, 0.1, 2.4, 0.12, sp(L.STEEL, [0.6, 0.62, 0.65]));
        fbox(b, fr, x, 0.2, 0.2, 0.3, 0.35, 0.25, DARK);
      }
      fbox(b, fr, 0, 0.004, 0.5, 2.6, 0.004, 0.35, { layer: L.HAZARD, uv: [0, 0, 3.25, 0.44] });
      fbox(b, fr, 0, 2.74, 0.03, 0.5, 0.25, 0.02, { all: GREY, pz: { layer: L.PLAQUES, uv: cellUV(5 + (pr.a % 2), 2, 4) } });
      break;
    }
    case "pallet": {
      const wood = sp(L.WOOD_FLOOR, [0.75, 0.6, 0.42]);
      for (const z of [-0.35, 0, 0.35]) fbox(b, fr, 0, 0, z, 1.2, 0.1, 0.1, wood);
      fbox(b, fr, 0, 0.1, 0, 1.2, 0.03, 0.8, wood);
      const n = rng.int(1, 3);
      if (rng.chance(0.4)) fbox(b, fr, 0, 0.13, 0, 1.1, 0.4 * n, 0.72, sp(L.WHITE, [0.85, 0.88, 0.9]));
      else for (let k = 0; k < n; k++) for (const x of [-0.3, 0.3]) fbox(b, fr, x + rng.range(-0.03, 0.03), 0.13 + k * 0.4, 0, 0.55, 0.39, 0.75, CARDBOARD);
      solidRect(b, fr, 0, 0, 1.2, 0.8);
      break;
    }
    case "flightcase": {
      const w = rng.range(0.7, 1.3), h = rng.range(0.5, 1.0), dd = rng.range(0.5, 0.8);
      fbox(b, fr, 0, 0.1, 0, w, h, dd, sp(L.WHITE, [0.1, 0.1, 0.11]), true);
      for (const y of [0.1, 0.1 + h]) fbox(b, fr, 0, y - 0.02, 0, w + 0.02, 0.04, dd + 0.02, STEEL);
      for (const x of [-w / 2, w / 2]) cyl(b, fr, x * 0.8, 0, 0.2, 0.05, 0.1, DARK);
      fbox(b, fr, 0, 0.1 + h * 0.6, dd / 2 + 0.005, 0.3, 0.1, 0.01, sp(L.WHITE, [0.9, 0.9, 0.85]));
      break;
    }
    case "forklift": {
      const yel = sp(L.WHITE, [0.95, 0.7, 0.05]);
      fbox(b, fr, 0, 0.2, 0, 1.1, 0.8, 1.6, yel, true);
      fbox(b, fr, 0, 0.2, -0.95, 1.1, 0.7, 0.35, DARK);
      for (const x of [-0.45, 0.45]) {
        fbox(b, fr, x, 0.05, 0.95, 0.08, 2.3, 0.1, DARK);
        fbox(b, fr, x * 0.5, 0.05, 1.45, 0.1, 0.05, 0.9, STEEL);
        for (const z of [-0.5, 0.55]) {
          const p = fr.p(x * 1.15, 0.28, z);
          b.geom(CYL, p[0], p[1], p[2], fr.rot + Math.PI / 2, 0.28, 0.2, 0.28, DARK, Math.PI / 2);
        }
      }
      for (const [x, z] of [[-0.5, -0.6], [0.5, -0.6], [-0.5, 0.45], [0.5, 0.45]]) fbox(b, fr, x!, 1.0, z!, 0.05, 1.1, 0.05, DARK);
      fbox(b, fr, 0, 2.1, -0.08, 1.1, 0.05, 1.15, DARK);
      fbox(b, fr, 0, 1.0, -0.2, 0.5, 0.1, 0.45, sp(L.CARPET_GREY, [0.15, 0.15, 0.15]));
      fbox(b, fr, 0, 1.1, -0.42, 0.5, 0.5, 0.1, sp(L.CARPET_GREY, [0.15, 0.15, 0.15]));
      fbox(b, fr, 0, 2.15, -0.5, 0.12, 0.08, 0.12, { layer: L.WHITE, emit: [2.0, 1.1, 0.1] });
      break;
    }
    case "palletjack":
      for (const x of [-0.2, 0.2]) fbox(b, fr, x, 0.02, 0.1, 0.16, 0.08, 1.15, sp(L.WHITE, [0.8, 0.1, 0.08]));
      fbox(b, fr, 0, 0.02, -0.55, 0.55, 0.3, 0.2, sp(L.WHITE, [0.8, 0.1, 0.08]));
      bar(b, fr.p(0, 0.3, -0.6), fr.p(0, 1.15, -0.9), 0.04, DARK);
      fbox(b, fr, 0, 1.12, -0.9, 0.3, 0.04, 0.04, DARK);
      break;
    case "palletrack": {
      // a double pallet rack, 5.4 m tall, full of things from forty years of television
      const blue = sp(L.WHITE, [0.12, 0.25, 0.6]), orange = sp(L.WHITE, [0.95, 0.4, 0.05]);
      for (const x of [-1.35, 1.35]) for (const z of [-1.05, -0.05, 0.05, 1.05]) fbox(b, fr, x, 0, z, 0.08, 5.4, 0.08, blue);
      for (const y of [0.15, 1.55, 2.95, 4.35]) {
        for (const z of [-1.05, -0.05, 0.05, 1.05]) fbox(b, fr, 0, y, z, 2.7, 0.1, 0.06, orange);
        for (const side of [-1, 1])
          for (const x of [-0.68, 0.68]) {
            if (rng.chance(0.12)) continue;
            junk(b, new Frame(...fr.p(x, y + 0.1, side * 0.55), fr.rot + (side < 0 ? Math.PI : 0)), rng);
          }
      }
      solidRect(b, fr, 0, 0, 2.8, 2.2);
      break;
    }
    case "bigprop": {
      // too big for the racks: a palm, a throne, a giant die, a suit of armour, a globe, an old camera
      const k = pr.a % 6;
      if (k === 0) {
        cyl(b, fr, 0, 0, 0, 0.35, 0.5, sp(L.WHITE, [0.55, 0.35, 0.2]));
        for (let s = 0; s < 6; s++) b.geom(CYL6, ...fr.p(Math.sin(s * 0.4) * 0.05, 0.6 + s * 0.4, 0), s, 0.1 - s * 0.008, 0.42, 0.1 - s * 0.008, sp(L.WOOD_FLOOR, [0.5, 0.38, 0.25]));
        for (let s = 0; s < 8; s++) {
          const a = s * 0.8;
          b.geom(BLOB, ...fr.p(Math.cos(a) * 0.6, 2.9 - Math.abs(Math.sin(a)) * 0.2, Math.sin(a) * 0.6), a, 0.7, 0.06, 0.2, sp(L.FOLIAGE, [0.5, 0.8, 0.4]));
        }
        solidRect(b, fr, 0, 0, 0.8, 0.8);
      } else if (k === 1) {
        const red = sp(L.FABRIC, [0.6, 0.05, 0.08]), gold = sp(L.STEEL, [1.1, 0.9, 0.45]);
        fbox(b, fr, 0, 0, 0, 0.9, 0.5, 0.8, gold, true);
        fbox(b, fr, 0, 0.5, 0.05, 0.75, 0.12, 0.7, red);
        fbox(b, fr, 0, 0.5, -0.38, 0.9, 1.6, 0.14, gold);
        fbox(b, fr, 0, 0.7, -0.3, 0.7, 1.2, 0.03, red);
        for (const x of [-0.4, 0.4]) fbox(b, fr, x, 0.5, 0, 0.12, 0.3, 0.8, gold);
        b.geom(BLOB, ...fr.p(0, 2.2, -0.38), 0, 0.14, 0.14, 0.08, gold);
      } else if (k === 2) {
        fbox(b, fr, 0, 0, 0, 1.2, 1.2, 1.2, sp(L.WHITE, [0.95, 0.95, 0.93]), true);
        for (const [x, y] of [[0, 0.6], [-0.3, 0.3], [0.3, 0.9], [-0.3, 0.9], [0.3, 0.3]] as const) fbox(b, fr, x, y - 0.1, 0.6, 0.2, 0.2, 0.02, DARK);
        fbox(b, fr, 0, 1.2, 0, 0.2, 0.01, 0.2, DARK);
      } else if (k === 3) {
        const st = sp(L.STEEL, [0.85, 0.87, 0.9]);
        fbox(b, fr, 0, 0, 0, 0.6, 0.1, 0.6, DARK, true);
        for (const x of [-0.12, 0.12]) fbox(b, fr, x, 0.1, 0, 0.14, 0.85, 0.16, st);
        fbox(b, fr, 0, 0.95, 0, 0.5, 0.6, 0.3, st);
        for (const x of [-0.33, 0.33]) fbox(b, fr, x, 0.95, 0, 0.12, 0.55, 0.14, st);
        b.geom(BLOB, ...fr.p(0, 1.72, 0), 0, 0.15, 0.17, 0.16, st);
        fbox(b, fr, 0, 1.74, 0.13, 0.2, 0.03, 0.02, DARK);
        fbox(b, fr, 0.45, 0.1, 0.05, 0.04, 1.9, 0.04, sp(L.WOOD_FLOOR, [0.5, 0.35, 0.2]));
      } else if (k === 4) {
        cyl(b, fr, 0, 0, 0, 0.3, 0.05, sp(L.WOOD_FLOOR, [0.4, 0.25, 0.15]));
        cyl(b, fr, 0, 0.05, 0, 0.05, 0.7, sp(L.WOOD_FLOOR, [0.4, 0.25, 0.15]));
        b.geom(BLOB, ...fr.p(0, 1.45, 0), pr.rot, 0.72, 0.72, 0.72, sp(L.WHITE, [0.25, 0.45, 0.75]));
        for (let s = 0; s < 6; s++) b.geom(BLOB, ...fr.p(Math.cos(s * 1.1) * 0.5, 1.45 + Math.sin(s * 2.3) * 0.4, Math.sin(s * 1.1) * 0.5), s, 0.3, 0.2, 0.3, sp(L.WHITE, [0.35, 0.6, 0.3]));
        solidRect(b, fr, 0, 0, 1.3, 1.3);
      } else {
        cyl(b, fr, 0, 0, 0, 0.45, 0.25, DARK, CYL6);
        fbox(b, fr, 0, 0.25, 0, 0.16, 1.0, 0.16, GREY);
        fbox(b, fr, 0, 1.25, 0, 0.5, 0.5, 0.9, sp(L.WHITE, [0.35, 0.37, 0.4]));
        const l = fr.p(0, 1.5, 0.55);
        b.geom(CYL, l[0], l[1], l[2], fr.rot, 0.16, 0.3, 0.16, DARK, Math.PI / 2);
        fbox(b, fr, 0.15, 1.78, -0.1, 0.35, 0.1, 0.12, sp(L.WHITE, [0.9, 0.9, 0.88]));
        solidRect(b, fr, 0, 0, 0.9, 0.9);
      }
      break;
    }
    case "cctv": {
      // a camera on a bracket, tilted down (pr.a: pitch in 1/100 rad), a red light that's always on
      const pitch = pr.a / 100;
      fbox(b, fr, 0, -0.02, -0.06, 0.06, 0.1, 0.1, GREY);
      fbox(b, fr, 0, -0.08, 0.0, 0.03, 0.03, 0.16, GREY);
      const body = fr.p(0, -0.14, 0.12);
      const up: V3 = [0, Math.cos(pitch), 0];
      const fwd: V3 = [fr.s * Math.cos(pitch), -Math.sin(pitch), fr.c * Math.cos(pitch)];
      up[0] = fr.s * Math.sin(pitch); up[2] = fr.c * Math.sin(pitch);
      b.obox(body, fr.ax, up, fwd, [0.065, 0.06, 0.16], { all: sp(L.WHITE, [0.82, 0.83, 0.82]), pz: DARK });
      b.obox([body[0] + fwd[0] * 0.15 + up[0] * 0.07, body[1] + fwd[1] * 0.15 + up[1] * 0.07, body[2] + fwd[2] * 0.15 + up[2] * 0.07], fr.ax, up, fwd, [0.08, 0.008, 0.06], sp(L.WHITE, [0.82, 0.83, 0.82]));
      b.obox([body[0] + fwd[0] * 0.1 + up[0] * 0.065 + fr.ax[0] * 0.04, body[1] + fwd[1] * 0.1 + up[1] * 0.065, body[2] + fwd[2] * 0.1 + up[2] * 0.065 + fr.ax[2] * 0.04], fr.ax, up, fwd, [0.008, 0.008, 0.008], { layer: L.WHITE, emit: [2.0, 0.1, 0.05] });
      break;
    }
    case "cctvwall": {
      // pr.a 0: the main bank, 3 x 2 feeds; otherwise two bigger screens
      fbox(b, fr, 0, 0.75, 0.06, 2.9, 1.85, 0.12, DARK);
      fbox(b, fr, 0, 0, 0.3, 2.9, 0.75, 0.6, sp(L.WHITE, [0.2, 0.21, 0.23]), true);
      const feed = (k: number, e: number): Spec => ({ layer: L.CCTV, emit: [e, e, e], uv: cellUV(k, 3, 2) });
      if (pr.a === 0) {
        for (let r = 0; r < 2; r++)
          for (let c = 0; c < 3; c++) {
            fbox(b, fr, (c - 1) * 0.94, 0.85 + (1 - r) * 0.86, 0.13, 0.88, 0.66, 0.05, { all: DARK, pz: feed(r * 3 + c, rng.range(0.85, 1.0)) });
          }
      } else {
        for (const [x, k] of [[-0.72, (pr.a * 2) % 6], [0.72, (pr.a * 2 + 1) % 6]] as const) fbox(b, fr, x, 1.0, 0.13, 1.36, 1.02, 0.05, { all: DARK, pz: feed(k, 0.9) });
      }
      fbox(b, fr, 0, 0.75, 0.61, 2.9, 0.03, 0.02, { layer: L.WHITE, emit: [0.2, 0.9, 0.35] });
      break;
    }
    case "secdesk": {
      // the operator sits on the room side (+z), facing the monitor wall
      const top = sp(L.WHITE, [0.3, 0.3, 0.32]);
      fbox(b, fr, 0, 0.72, 0, 2.3, 0.04, 0.8, top, true);
      for (const x of [-1.1, 1.1]) fbox(b, fr, x, 0, 0, 0.06, 0.72, 0.75, DARK);
      fbox(b, fr, 0, 0.3, -0.36, 2.2, 0.42, 0.03, DARK);
      // keyboard, joystick, the radio, the logbook, a mug, a phone
      fbox(b, fr, -0.1, 0.76, 0.15, 0.45, 0.02, 0.15, DARK);
      fbox(b, fr, 0.45, 0.76, 0.1, 0.3, 0.05, 0.22, { all: DARK, py: { layer: L.DESK_BUTTONS, emit: [0.7, 0.7, 0.7], uv: [0, 0, 0.6, 0.4] } });
      cyl(b, fr, 0.45, 0.81, 0.05, 0.015, 0.14, DARK);
      b.geom(BLOB, ...fr.p(0.45, 0.96, 0.05), 0, 0.03, 0.03, 0.03, RED);
      fbox(b, fr, -0.75, 0.76, 0.0, 0.07, 0.2, 0.04, DARK);
      fbox(b, fr, -0.75, 0.96, 0.0, 0.012, 0.08, 0.012, DARK);
      fbox(b, fr, -0.75, 0.93, 0.021, 0.04, 0.03, 0.002, { layer: L.WHITE, emit: [0.2, 1.2, 0.3] });
      fbox(b, fr, -0.35, 0.76, -0.12, 0.3, 0.03, 0.22, sp(L.WHITE, [0.1, 0.15, 0.35]));
      fbox(b, fr, -0.35, 0.79, -0.12, 0.28, 0.004, 0.2, OFFWHITE);
      cyl(b, fr, 0.9, 0.76, 0.1, 0.04, 0.1, rng.pick([WHITE, RED, sp(L.WHITE, [0.95, 0.8, 0.1])]));
      fbox(b, fr, 0.85, 0.76, -0.2, 0.2, 0.06, 0.15, sp(L.WHITE, [0.85, 0.85, 0.8]));
      const back = new Frame(pr.x, pr.y, pr.z, pr.rot + Math.PI);
      monitor(b, back, 0.3, 0.76, 0.2, true, L.TV_BARS);
      chair(b, fr, 0, 0.9, Math.PI + rng.range(-0.4, 0.4));
      break;
    }
    case "keybox": {
      fbox(b, fr, 0, 1.2, 0.05, 0.8, 0.7, 0.1, { all: sp(L.WHITE, [0.5, 0.52, 0.55]), pz: sp(L.WHITE, [0.85, 0.85, 0.82]) });
      for (let r = 0; r < 4; r++)
        for (let k = 0; k < 6; k++) {
          if (rng.chance(0.2)) continue;
          fbox(b, fr, -0.3 + k * 0.12, 1.78 - r * 0.15, 0.11, 0.012, 0.012, 0.03, STEEL);
          fbox(b, fr, -0.3 + k * 0.12, 1.68 - r * 0.15, 0.115, 0.04, 0.07, 0.006, sp(L.WHITE, rng.pick([[0.9, 0.2, 0.2], [0.2, 0.4, 0.9], [0.95, 0.8, 0.1], [0.3, 0.75, 0.35], [0.95, 0.95, 0.95]] as RGB[])));
        }
      break;
    }
    case "lockers": {
      const col = sp(L.WHITE, rng.pick([[0.35, 0.45, 0.55], [0.55, 0.57, 0.6], [0.3, 0.4, 0.3]] as RGB[]));
      fbox(b, fr, 0, 0, 0.25, 1.8, 1.9, 0.5, col, true);
      for (let k = 0; k < 4; k++) {
        const x = -0.675 + k * 0.45;
        fbox(b, fr, x, 0.05, 0.505, 0.42, 1.8, 0.01, col);
        for (let y = 0; y < 3; y++) fbox(b, fr, x, 1.55 + y * 0.04, 0.512, 0.2, 0.012, 0.004, DARK);
        fbox(b, fr, x + 0.15, 0.95, 0.515, 0.03, 0.08, 0.01, STEEL);
      }
      break;
    }
    case "lorry": {
      // a white lorry with the VRT drop on its sides, front at +z
      const body = sp(L.WHITE, [0.92, 0.92, 0.9]);
      const side: Spec = { layer: L.VRT_LOGO, uv: [-0.9, -0.15, 1.9, 1.15] };
      fbox(b, fr, 0, 0.95, -1.2, 2.5, 2.9, 6.6, { all: body, px: side, nx: side }, true);
      fbox(b, fr, 0, 0.55, -1.2, 2.3, 0.4, 6.6, DARK);
      fbox(b, fr, 0, 0.6, 3.25, 2.45, 2.6, 2.1, { all: sp(L.WHITE, [0.85, 0.1, 0.35]) }, true);
      fbox(b, fr, 0, 1.9, 4.31, 2.2, 0.9, 0.02, sp(L.SCREEN, [0.5, 0.55, 0.6]));
      for (const x of [-0.9, 0.9]) fbox(b, fr, x, 1.0, 4.32, 0.35, 0.18, 0.02, { layer: L.WHITE, emit: [1.4, 1.35, 1.2] });
      for (const [x, z] of [[-1.15, 3.4], [1.15, 3.4], [-1.15, -0.6], [1.15, -0.6], [-1.15, -3.6], [1.15, -3.6]]) {
        const w = fr.p(x!, 0.5, z!);
        b.geom(CYL, w[0], w[1], w[2], fr.rot + Math.PI / 2, 0.5, 0.35, 0.5, DARK, Math.PI / 2);
      }
      fbox(b, fr, 0, 0.95, -4.52, 2.5, 2.9, 0.02, { all: sp(L.STEEL, [0.8, 0.8, 0.82]) });
      for (const x of [-1.1, 1.1]) fbox(b, fr, x, 0.7, -4.55, 0.2, 0.12, 0.02, { layer: L.WHITE, emit: [1.4, 0.1, 0.05] });
      break;
    }
    case "flat": {
      // two or three decor flats leaning against the wall, painted side out
      const n = rng.int(2, 3);
      for (let k = 0; k < n; k++) {
        const w = rng.range(2.2, 2.9), h = rng.range(3.2, 4.4), x = rng.range(-0.3, 0.3);
        const lean = 0.12 + k * 0.1, zb = 0.35 + k * 0.12;
        const f = new Frame(...fr.p(x, 0, zb - (lean * h) / 2), fr.rot);
        const up: V3 = [f.s * -lean, 1, f.c * -lean];
        const ul = Math.hypot(up[0], up[1], up[2]);
        const upn: V3 = [up[0] / ul, up[1] / ul, up[2] / ul];
        const az: V3 = [f.s * (1 / ul), lean / ul, f.c * (1 / ul)];
        const q = rng.int(0, 3);
        const paint: Spec = { layer: L.FLATS, uv: [(q % 2) * 0.5, q < 2 ? 0.5 : 0, (q % 2) * 0.5 + 0.5, q < 2 ? 1 : 0.5] };
        b.obox(f.p(0, h / 2, 0), f.ax, upn, az, [w / 2, h / 2, 0.025], { all: sp(L.PLYWOOD), pz: rng.chance(0.85) ? paint : sp(L.PLYWOOD) });
      }
      solidRect(b, fr, 0, 0.4, 3.0, 0.8);
      break;
    }
    case "blokjes": {
      // the blocks from Blokken, stacked
      const cols: RGB[] = [[0.9, 0.2, 0.15], [0.95, 0.78, 0.1], [0.18, 0.5, 0.9], [0.22, 0.75, 0.35], [0.62, 0.3, 0.88], [0.95, 0.5, 0.12]];
      for (let r = 0; r < 3; r++)
        for (let k = 0; k < 3 - r; k++) if (rng.chance(0.85)) fbox(b, fr, -0.8 + k * 0.8 + r * 0.4, r * 0.78, 0.45, 0.76, 0.76, 0.76, sp(L.WHITE, rng.pick(cols)));
      solidRect(b, fr, 0, 0.45, 2.4, 0.8);
      break;
    }
    case "showsign": {
      const face: Spec = pr.b ? { layer: L.SHOWSIGN, emit: [1.4, 1.4, 1.4], uv: cellUV(pr.a, 2, 4) } : { layer: L.SHOWSIGN, uv: cellUV(pr.a, 2, 4) };
      const [w, h] = pr.a < 2 ? [2.4, 1.2] : pr.a === 3 ? [1.4, 0.7] : [2.0, 1.0];
      fbox(b, fr, 0, -h / 2, 0.02, w, h, 0.08, { all: DARK, pz: face });
      break;
    }
    case "tribune": {
      // the audience: rows rising away from the set (+z), red seats, two aisles, a rail at the back
      const W = 11.2, rows = 7;
      const riser = sp(L.CARPET_GREY, [0.25, 0.25, 0.28]);
      const seat = sp(L.FABRIC, [0.62, 0.08, 0.1]);
      for (let k = 0; k < rows; k++) {
        const z = 5.6 - k * 0.8, y = k * 0.42;
        if (k) fbox(b, fr, 0, 0, z - 0.4, W, y, 0.8, { all: riser, pz: sp(L.WHITE, [0.2, 0.2, 0.22]) });
        fbox(b, fr, 0, y - 0.01, z + 0.39, W, 0.012, 0.02, { layer: L.WHITE, emit: [0.3, 0.3, 0.35] });
        for (let x = -W / 2 + 0.4; x < W / 2 - 0.3; x += 0.56) {
          if (Math.abs(Math.abs(x) - 2.9) < 0.45) continue;
          fbox(b, fr, x, y + 0.42, z - 0.1, 0.48, 0.08, 0.44, seat);
          fbox(b, fr, x, y + 0.5, z - 0.34, 0.48, 0.45, 0.06, seat);
          fbox(b, fr, x, y, z - 0.1, 0.05, 0.42, 0.05, DARK);
        }
      }
      fbox(b, fr, 0, rows * 0.42, 0.25, W, 0.05, 0.05, STEEL);
      for (let x = -W / 2; x <= W / 2; x += 1.4) fbox(b, fr, x, (rows - 1) * 0.42, 0.25, 0.04, 1.05, 0.04, STEEL);
      solidRect(b, fr, 0, 3.0, W, 5.6);
      break;
    }
    case "talkset": {
      // Van Gils & gasten: an LED wall, a riser, the desk, a sofa for the guests, a band corner; front at +z
      fbox(b, fr, 0, 0.3, 0.15, 9.0, 4.2, 0.1, { all: DARK, pz: { layer: L.SHOWSIGN, emit: [0.95, 0.95, 1.0], uv: cellUV(4, 2, 4) } });
      fbox(b, fr, 0, 0, 2.4, 8.0, 0.3, 4.0, { all: sp(L.BLACK, [1.6, 1.6, 1.7]), py: sp(L.WOOD_FLOOR, [0.4, 0.3, 0.25]) }, true);
      fbox(b, fr, 0, 0.02, 4.41, 8.0, 0.04, 0.02, { layer: L.WHITE, emit: [0.9, 0.5, 1.2] });
      fbox(b, fr, -1.2, 0.3, 2.6, 2.6, 0.75, 0.8, { all: sp(L.WHITE, [0.9, 0.88, 0.85]), pz: { layer: L.WHITE, emit: [0.35, 0.3, 0.45] } });
      fbox(b, fr, -1.2, 1.05, 2.55, 2.7, 0.05, 0.95, sp(L.WOOD_FLOOR, [0.35, 0.22, 0.14]));
      chair(b, fr, -1.2, 1.9, Math.PI);
      const sofa = sp(L.FABRIC, [0.2, 0.25, 0.45]);
      fbox(b, new Frame(...fr.p(1.8, 0.3, 2.4), fr.rot - 0.5), 0, 0, 0, 2.2, 0.45, 0.85, sofa);
      fbox(b, new Frame(...fr.p(1.8, 0.3, 2.4), fr.rot - 0.5), 0, 0.45, -0.35, 2.2, 0.5, 0.2, sofa);
      // drums
      for (const [x, z, r] of [[3.4, 1.3, 0.3], [3.9, 1.6, 0.22], [3.0, 1.8, 0.2]] as const) cyl(b, fr, x, 0.3, z, r, 0.45, sp(L.WHITE, [0.7, 0.1, 0.12]));
      cyl(b, fr, 3.5, 0.3, 0.8, 0.02, 1.2, STEEL);
      b.geom(CYL, ...fr.p(3.5, 1.5, 0.8), 0, 0.35, 0.01, 0.35, sp(L.STEEL, [1.1, 0.95, 0.5]));
      break;
    }
    case "blokkenset": {
      // Blokken: a wall of glowing blocks, the logo, the host in the middle, two contestants
      const cols: RGB[] = [[1.3, 0.25, 0.2], [1.3, 1.05, 0.15], [0.25, 0.7, 1.3], [0.3, 1.1, 0.45], [0.9, 0.4, 1.3], [1.3, 0.7, 0.18]];
      fbox(b, fr, 0, 0, 0.12, 8.6, 5.4, 0.12, DARK);
      for (let r = 0; r < 8; r++)
        for (let k = 0; k < 11; k++) {
          if (r > 4 && rng.chance(0.3 + (r - 4) * 0.2)) continue;
          fbox(b, fr, -3.9 + k * 0.78, 0.1 + r * 0.64, 0.24, 0.72, 0.58, 0.1, { layer: L.WHITE, emit: rng.pick(cols) });
        }
      fbox(b, fr, 0, 5.5, 0.2, 4.0, 1.0, 0.08, { all: DARK, pz: { layer: L.SHOWSIGN, emit: [1.2, 1.2, 1.2], uv: cellUV(5, 2, 4) } });
      fbox(b, fr, 0, 0, 2.6, 7.0, 0.2, 3.4, { all: sp(L.BLACK, [1.6, 1.6, 1.7]), py: sp(L.TILEDARK, [0.6, 0.6, 0.7]) }, true);
      fbox(b, fr, 0, 0.2, 3.4, 0.9, 1.0, 0.6, { all: sp(L.WHITE, [0.2, 0.2, 0.25]), pz: { layer: L.WHITE, emit: [0.25, 0.7, 1.3] } });
      for (const s of [-1, 1]) {
        const f = new Frame(...fr.p(s * 2.3, 0.2, 3.0), fr.rot + s * 0.35);
        fbox(b, f, 0, 0, 0, 1.2, 1.0, 0.6, { all: sp(L.WHITE, [0.2, 0.2, 0.25]), pz: { layer: L.WHITE, emit: s < 0 ? [1.3, 0.25, 0.2] : [1.3, 1.05, 0.15] } });
        fbox(b, f, 0, 1.0, 0, 1.25, 0.04, 0.65, WHITE);
        fbox(b, f, -0.3, 1.04, 0.1, 0.12, 0.03, 0.12, { layer: L.WHITE, emit: [1.5, 0.2, 0.1] });
      }
      break;
    }
    case "stage": {
      // a dark stage, pr.a wide, pr.b deep, from the wall (+z into the room)
      const w = pr.a, d = pr.b;
      fbox(b, fr, 0, 0, d / 2, w, 0.6, d, { all: sp(L.BLACK, [1.2, 1.2, 1.25]), py: sp(L.CARPET_GREY, [0.3, 0.3, 0.32]) }, true);
      fbox(b, fr, 0, 0.6, d - 0.03, w, 0.01, 0.06, sp(L.WHITE, [0.85, 0.85, 0.8]));
      break;
    }
    // --- de koffiekamer
    case "kwall":
      // a partition, pr.a cm long, floor to ceiling
      fbox(b, fr, 0, 0, 0, pr.a / 100, CEIL, 0.12, sp(L.PLASTER, [0.97, 0.97, 0.95]), true);
      break;
    case "kfridge": {
      // pr.a tall fridges side by side, glass fronts, a lit strip on top
      const n = pr.a || 3;
      for (let k = 0; k < n; k++) fbox(b, fr, (k - (n - 1) / 2) * 0.72, 0, 0.36, 0.7, 2.0, 0.7, { all: sp(L.WHITE, [0.2, 0.22, 0.24]), pz: { layer: L.KOFFIE, emit: [1.0, 1.02, 1.05], uv: KOFFIE_UV.fridge } }, true);
      fbox(b, fr, 0, 2.0, 0.36, n * 0.72, 0.14, 0.7, { all: DARK, pz: { layer: L.WHITE, emit: [1.2, 1.25, 1.3] } });
      break;
    }
    case "kcounter": {
      // the broodjesbar: pr.a cm long, the fillings under glass facing +z, the till at one end
      const len = pr.a / 100;
      fbox(b, fr, 0, 0, 0, len, 0.92, 0.7, { all: STEEL, pz: sp(L.WHITE, [0.86, 0.86, 0.84]) }, true);
      fbox(b, fr, 0, 0.12, 0.352, len, 0.14, 0.004, sp(L.WHITE, [0.42, 0.7, 0.08]));
      fbox(b, fr, 0, 0.92, 0.02, len - 0.1, 0.4, 0.5, { all: STEEL, pz: { layer: L.KOFFIE, emit: [1.05, 1.05, 1.0], uv: KOFFIE_UV.display }, py: sp(L.WHITE, [0.8, 0.86, 0.88]) });
      fbox(b, fr, 0, 0.92, 0.36, len, 0.03, 0.3, STEEL);
      fbox(b, fr, len / 2 - 0.35, 1.32, -0.05, 0.4, 0.22, 0.32, { all: DARK, pz: { layer: L.WHITE, emit: [0.3, 0.9, 0.45] } });
      break;
    }
    case "koven": {
      // the back of the broodjesbar: a steel bench with panini grills and ovens, bread, the menu
      const len = pr.a / 100;
      fbox(b, fr, 0, 0, 0.3, len, 0.9, 0.6, STEEL, true);
      const n = Math.max(1, Math.floor(len / 1.1));
      for (let k = 0; k < n; k++) {
        const x = (k - (n - 1) / 2) * 1.1;
        if (k % 2 === 0) fbox(b, fr, x, 0.9, 0.3, 0.6, 0.42, 0.5, { all: STEEL, pz: { layer: L.WHITE, tint: [0.12, 0.08, 0.06], emit: [0.45, 0.2, 0.05] } });
        else {
          fbox(b, fr, x, 0.9, 0.3, 0.5, 0.12, 0.42, STEEL);
          fbox(b, fr, x, 1.02, 0.3, 0.5, 0.05, 0.42, DARK);
        }
      }
      fbox(b, fr, 0, 1.5, 0.15, len, 0.03, 0.3, STEEL);
      for (let k = 0; k < 8; k++) fbox(b, fr, rng.range(-len / 2 + 0.3, len / 2 - 0.3), 1.53, 0.15 + rng.range(-0.06, 0.06), 0.45, 0.07, 0.08, sp(L.WHITE, [0.85, 0.62, 0.32]));
      fbox(b, fr, 0, 1.7, 0.03, Math.min(len - 0.4, 2.6), 0.75, 0.04, { all: DARK, pz: { layer: L.KOFFIE, emit: [0.95, 0.95, 0.95], uv: KOFFIE_UV.menu } });
      break;
    }
    case "poortje": {
      // a turnstile: two waist-high posts with a tripod between them (you push through); pr.b: 0 IN, 1 UIT
      for (const x of [-0.55, 0.55]) fbox(b, fr, x, 0, 0, 0.18, 1.0, 0.55, { all: STEEL, py: sp(L.WHITE, [0.2, 0.2, 0.22]) }, true);
      const sign: Spec = { layer: L.KOFFIE, emit: [1.3, 1.3, 1.3], uv: pr.b ? KOFFIE_UV.out : KOFFIE_UV.in };
      fbox(b, fr, -0.55, 1.0, 0, 0.14, 0.09, 0.3, { all: DARK, pz: sign, nz: sign });
      cyl(b, fr, -0.44, 0.84, 0, 0.05, 0.16, STEEL);
      const hub = fr.p(-0.44, 0.92, 0);
      for (const [x, y, z] of [[0.4, 0.92, 0], [-0.2, 0.62, 0.32], [-0.2, 0.62, -0.32]] as const) bar(b, hub, fr.p(x, y, z), 0.035, STEEL);
      break;
    }
    case "koffiebar": {
      // three coffee machines on a counter, cups and sugar, an orange mat in front of each
      fbox(b, fr, 0, 0, 0.3, 2.7, 0.88, 0.6, { all: sp(L.WHITE, [0.9, 0.9, 0.88]), pz: sp(L.WHITE, [0.42, 0.7, 0.08]) }, true);
      fbox(b, fr, 0, 0.88, 0.3, 2.74, 0.03, 0.62, GREY);
      for (const x of [-0.9, 0, 0.9]) {
        fbox(b, fr, x, 0.91, 0.28, 0.6, 0.82, 0.5, { all: DARK, pz: { layer: L.KOFFIE, emit: [0.9, 0.9, 0.9], uv: KOFFIE_UV.machine } });
        fbox(b, fr, x, 0, 1.05, 0.8, 0.012, 0.6, { all: sp(L.WHITE, [0.6, 0.3, 0.15]), py: { layer: L.KOFFIE, uv: KOFFIE_UV.mat } });
      }
      for (const x of [-0.45, 0.45]) cyl(b, fr, x, 0.91, 0.45, 0.04, 0.3, WHITE);
      fbox(b, fr, 1.28, 0.91, 0.42, 0.12, 0.1, 0.12, sp(L.WHITE, [0.95, 0.8, 0.45]));
      break;
    }
    case "cocktail": {
      // a high square table, white, with high stools in green and yellow
      fbox(b, fr, 0, 1.02, 0, 0.75, 0.04, 0.75, sp(L.WHITE, [0.95, 0.95, 0.93]));
      for (const [x, z] of [[-0.33, -0.33], [0.33, -0.33], [-0.33, 0.33], [0.33, 0.33]]) fbox(b, fr, x!, 0, z!, 0.03, 1.02, 0.03, STEEL);
      fbox(b, fr, 0, 0.25, 0, 0.7, 0.02, 0.02, STEEL);
      solidRect(b, fr, 0, 0, 0.75, 0.75);
      const seats = [sp(L.FABRIC, [0.55, 0.82, 0.16]), sp(L.FABRIC, [0.96, 0.82, 0.12])];
      for (const [x, z, r] of [[0.62, 0, Math.PI / 2], [-0.62, 0, -Math.PI / 2], [0, 0.62, 0], [0, -0.62, Math.PI]] as const) {
        if (!rng.chance(0.8)) continue;
        const f = new Frame(...fr.p(x + rng.range(-0.08, 0.08), 0, z + rng.range(-0.08, 0.08)), fr.rot + r + rng.range(-0.3, 0.3));
        fbox(b, f, 0, 0.74, 0, 0.4, 0.05, 0.38, rng.pick(seats));
        fbox(b, f, 0, 0.8, 0.18, 0.38, 0.22, 0.02, STEEL);
        for (const [lx, lz] of [[-0.16, -0.15], [0.16, -0.15], [-0.16, 0.15], [0.16, 0.15]]) fbox(b, f, lx!, 0, lz!, 0.02, 0.74, 0.02, STEEL);
        fbox(b, f, 0, 0.28, -0.15, 0.34, 0.02, 0.02, STEEL);
      }
      if (rng.chance(0.3)) cyl(b, fr, rng.range(-0.2, 0.2), 1.06, rng.range(-0.2, 0.2), 0.04, 0.1, WHITE);
      break;
    }
    case "lowround":
    case "bigtafel": {
      // a round table, low and small, or the big one; chairs around it
      const big = pr.t === "bigtafel";
      const r = big ? 1.0 : 0.42, n = big ? 7 : rng.int(2, 4);
      cyl(b, fr, 0, 0.72, 0, r, 0.03, sp(L.WHITE, [0.95, 0.95, 0.93]));
      cyl(b, fr, 0, 0.02, 0, 0.05, 0.7, STEEL);
      cyl(b, fr, 0, 0, 0, big ? 0.45 : 0.28, 0.02, STEEL);
      solidRect(b, fr, 0, 0, r * 1.8, r * 1.8);
      const seat = sp(L.FABRIC, rng.pick([[0.55, 0.82, 0.16], [0.96, 0.82, 0.12], [0.3, 0.3, 0.32]] as RGB[]));
      const a0 = rng.range(0, 6.28);
      for (let k = 0; k < n; k++) {
        const a = a0 + (k / n) * Math.PI * 2 + rng.range(-0.15, 0.15), d = r + 0.36 + rng.range(0, 0.12);
        simpleChair(b, fr, Math.sin(a) * d, Math.cos(a) * d, a + rng.range(-0.3, 0.3), seat);
      }
      if (rng.chance(0.5)) cyl(b, fr, rng.range(-r / 2, r / 2), 0.75, rng.range(-r / 2, r / 2), 0.04, 0.1, WHITE);
      break;
    }
    case "cokefridge":
      fbox(b, fr, 0, 0, 0.42, 0.9, 2.0, 0.8, { all: RED, pz: { layer: L.KOFFIE, emit: [1.05, 1.05, 1.0], uv: KOFFIE_UV.coke } }, true);
      break;
    case "ksign":
      fbox(b, fr, 0, 0, 0.01, 0.34, 0.17, 0.012, { all: GREY, pz: { layer: L.KOFFIE, uv: pr.b ? KOFFIE_UV.signFr : KOFFIE_UV.sign } });
      break;
    case "prijslijst":
      // the price list in a plastic sleeve, and the sheet with the drinks under it
      fbox(b, fr, 0, 0, 0.012, 0.3, 0.42, 0.01, { all: sp(L.WHITE, [0.95, 0.95, 0.92]), pz: { layer: L.KOFFIE, uv: KOFFIE_UV.prices } });
      fbox(b, fr, 0.02, -0.3, 0.012, 0.28, 0.2, 0.01, sp(L.WHITE, [0.94, 0.94, 0.9]));
      ([[0.85, 0.2, 0.15], [0.95, 0.65, 0.15], [0.2, 0.5, 0.9], [0.3, 0.7, 0.3]] as RGB[]).forEach((col, k) => fbox(b, fr, -0.07 + k * 0.05, -0.24, 0.018, 0.025, 0.07, 0.002, sp(L.WHITE, col)));
      break;
    case "kgreen":
      // a lime green patch in the floor
      fbox(b, fr, 0, 0.002, 0, pr.a / 100, 0.004, pr.b / 100, sp(L.WHITE, [0.42, 0.66, 0.14]));
      break;
    case "ledclock":
      // the red LED clock on the wall
      fbox(b, fr, 0, 0, 0.05, 0.5, 0.17, 0.1, { all: DARK, pz: LED });
      break;
    // --- het DPC
    case "devdesk": {
      // two desks facing each other, two screens each (code, a terminal, a graph, a
      // pipeline), a keyboard that glows; an energy drink, a rubber duck, a hoodie on the chair
      for (const side of [1, -1]) {
        const f = new Frame(pr.x, pr.y, pr.z, pr.rot + (side < 0 ? Math.PI : 0));
        const stand = rng.chance(0.25); // a standing desk, all the way up
        const top = stand ? 1.08 : 0.74;
        fbox(b, f, 0, top - 0.03, 0.4, 1.6, 0.03, 0.8, sp(L.WHITE, [0.8, 0.8, 0.78]));
        if (stand) {
          for (const x of [-0.65, 0.65]) {
            fbox(b, f, x, 0, 0.4, 0.07, top - 0.03, 0.07, GREY);
            fbox(b, f, x, 0, 0.4, 0.07, 0.04, 0.7, DARK);
          }
        } else {
          for (const x of [-0.77, 0.77]) fbox(b, f, x, 0, 0.4, 0.04, top - 0.03, 0.72, GREY);
          fbox(b, f, 0, 0.3, 0.03, 1.5, 0.4, 0.02, GREY);
        }
        const screens = ["code", "term", "graph", "deploy", "code"] as const;
        for (const x of [-0.34, 0.34]) {
          const m = new Frame(...f.p(x, 0, 0.17), f.rot + (x < 0 ? 0.18 : -0.18));
          fbox(b, m, 0, top, -0.04, 0.2, 0.02, 0.16, DARK);
          fbox(b, m, 0, top, -0.04, 0.05, 0.2, 0.04, DARK);
          const on = rng.chance(0.85);
          fbox(b, m, 0, top + 0.12, 0, 0.6, 0.36, 0.025, { all: DARK, pz: on ? { layer: L.DPC, emit: [0.85, 0.87, 0.9], uv: DPC_UV[rng.pick([...screens])] } : { layer: L.SCREEN } });
        }
        // the keyboard, now and then with a glow underneath
        if (rng.chance(0.6)) fbox(b, f, -0.05, top, 0.55, 0.46, 0.01, 0.16, { layer: L.WHITE, emit: rng.pick([[0.9, 0.2, 0.9], [0.2, 0.8, 1.0], [0.3, 1.0, 0.4], [1.0, 0.4, 0.1]] as RGB[]) });
        fbox(b, f, -0.05, top + 0.01, 0.55, 0.44, 0.025, 0.14, DARK);
        fbox(b, f, 0.3, top, 0.56, 0.06, 0.03, 0.1, DARK);
        if (rng.chance(0.7)) cyl(b, f, rng.range(0.45, 0.7), top, rng.range(0.3, 0.6), 0.033, 0.13, sp(L.WHITE, rng.pick([[0.1, 0.1, 0.12], [0.2, 0.75, 0.25], [0.15, 0.35, 0.8], [0.95, 0.95, 0.95]] as RGB[])));
        if (rng.chance(0.3)) {
          // the rubber duck you explain your bug to
          const q = f.p(-0.62, top + 0.05, 0.45);
          b.geom(BALL, q[0], q[1], q[2], 0, 0.06, 0.05, 0.07, sp(L.WHITE, [1.0, 0.85, 0.1]));
          const h = f.p(-0.62, top + 0.12, 0.49);
          b.geom(BALL, h[0], h[1], h[2], 0, 0.035, 0.035, 0.035, sp(L.WHITE, [1.0, 0.85, 0.1]));
          const k = f.p(-0.62, top + 0.115, 0.53);
          b.geom(BALL, k[0], k[1], k[2], 0, 0.018, 0.01, 0.022, sp(L.WHITE, [1.0, 0.45, 0.05]));
        }
        if (rng.chance(0.25)) fbox(b, f, 0.65, top, 0.25, 0.3, 0.12, 0.22, { all: GREY, py: sp(L.WHITE, [0.15, 0.15, 0.17]) }); // a laptop, closed, covered in stickers
        if (!stand && rng.chance(0.85)) {
          const x = rng.range(-0.1, 0.1), z = 1.1 + rng.range(0, 0.2), r = rng.range(-0.5, 0.5);
          chair(b, f, x, z, r);
          if (rng.chance(0.4)) {
            // a hoodie over the back
            const cf = new Frame(...f.p(x, 0, z), f.rot + r);
            fbox(b, cf, 0, 0.6, 0.255, 0.5, 0.42, 0.07, sp(L.FABRIC, rng.pick([[0.08, 0.08, 0.1], [0.3, 0.32, 0.36], [0.5, 0.05, 0.06], [0.1, 0.18, 0.4]] as RGB[])));
          }
        }
      }
      solidRect(b, fr, 0, 0, 1.6, 1.6);
      break;
    }
    case "tux": {
      // Tux, the Linux penguin, as a plush toy, 1.5 m tall (pr.a: height in cm, 100 = 1.55 m)
      const k = (pr.a || 100) / 100;
      const blk = sp(L.FABRIC, [0.07, 0.07, 0.08]), wht = sp(L.FABRIC, [0.95, 0.95, 0.92]), org = sp(L.FABRIC, [1.0, 0.62, 0.08]);
      const ball = (x: number, y: number, z: number, rx: number, ry: number, rz: number, s: Spec) => {
        const q = fr.p(x * k, y * k, z * k);
        b.geom(BALL, q[0], q[1], q[2], fr.rot, rx * k, ry * k, rz * k, s);
      };
      for (const x of [-0.2, 0.2]) ball(x, 0.05, 0.22, 0.17, 0.06, 0.24, org);
      ball(0, 0.62, 0, 0.5, 0.6, 0.44, blk);
      ball(0, 0.58, 0.12, 0.4, 0.5, 0.36, wht);
      for (const x of [-0.5, 0.5]) ball(x, 0.6, 0.02, 0.1, 0.36, 0.2, blk);
      ball(0, 1.22, 0.02, 0.36, 0.33, 0.33, blk);
      for (const x of [-0.11, 0.11]) {
        ball(x, 1.24, 0.24, 0.13, 0.17, 0.12, wht);
        ball(x * 0.9, 1.27, 0.35, 0.04, 0.055, 0.03, blk);
      }
      ball(0, 1.14, 0.33, 0.15, 0.06, 0.12, org);
      ball(0, 1.09, 0.31, 0.11, 0.04, 0.09, org);
      solidRect(b, fr, 0, 0, 1.0 * k, 0.9 * k);
      break;
    }
    case "redhat": {
      // the Red Hat flag on the wall, hung from a rod, in four folds
      const [u0, v0, u1, v1] = DPC_UV.flag;
      const w = 2.6 / 4;
      for (let n = 0; n < 4; n++) {
        const f = new Frame(...fr.p(-1.3 + (n + 0.5) * w, 0, 0.07), fr.rot + (n % 2 ? 0.07 : -0.07));
        const uv: [number, number, number, number] = [u0 + ((u1 - u0) * n) / 4, v0, u0 + ((u1 - u0) * (n + 1)) / 4, v1];
        fbox(b, f, 0, 0, 0, w, 1.3, 0.006, { all: sp(L.FABRIC, [0.75, 0.02, 0.02]), pz: { layer: L.DPC, uv } });
      }
      fbox(b, fr, 0, 1.31, 0.07, 2.76, 0.03, 0.03, STEEL);
      for (const x of [-1.32, 1.32]) fbox(b, fr, x, 1.29, 0.035, 0.03, 0.07, 0.07, STEEL);
      break;
    }
    case "dashwall": {
      // two big screens on the wall with the live ticket dashboards (pr.a, pr.b: which panel)
      for (const [x, k] of [[-0.69, pr.a], [0.69, pr.b]] as const) {
        fbox(b, fr, x, 1.5, 0.04, 1.32, 0.77, 0.06, { all: DARK, pz: { layer: L.DASH, emit: [1.0, 1.0, 1.0], uv: cellUV(k % 4, 2, 2) } });
        fbox(b, fr, x, 1.8, 0.005, 0.3, 0.2, 0.02, GREY);
      }
      break;
    }
    case "dashstand": {
      // a dashboard on a rolling stand (pr.a: which panel)
      fbox(b, fr, 0, 0.05, 0, 0.75, 0.04, 0.5, DARK);
      for (const [x, z] of [[-0.33, -0.2], [0.33, -0.2], [-0.33, 0.2], [0.33, 0.2]]) cyl(b, fr, x!, 0, z!, 0.04, 0.05, GREY);
      fbox(b, fr, 0, 0.09, -0.05, 0.08, 1.15, 0.08, GREY);
      fbox(b, fr, 0, 1.2, 0, 1.24, 0.72, 0.06, { all: DARK, pz: { layer: L.DASH, emit: [1.0, 1.0, 1.0], uv: cellUV(pr.a % 4, 2, 2) } });
      solidRect(b, fr, 0, 0, 0.8, 0.55);
      break;
    }
    case "kanban": {
      // a whiteboard on wheels: the sprint on one side, the burndown and the retro on the other
      const board: Spec = { layer: L.SPRINT, uv: BOARD_UV }, back: Spec = { layer: L.BURNDOWN, uv: BOARD_UV };
      fbox(b, fr, 0, 0.78, 0, 1.8, 1.12, 0.03, { all: GREY, pz: pr.a % 2 ? back : board, nz: pr.a % 2 ? board : back });
      fbox(b, fr, 0, 0.74, 0, 1.86, 0.04, 0.05, GREY);
      fbox(b, fr, 0, 1.9, 0, 1.86, 0.04, 0.05, GREY);
      for (const x of [-0.95, 0.95]) {
        fbox(b, fr, x, 0.06, 0, 0.04, 1.9, 0.04, STEEL);
        fbox(b, fr, x, 0.04, 0, 0.05, 0.03, 0.6, STEEL);
        for (const z of [-0.27, 0.27]) cyl(b, fr, x, 0, z, 0.035, 0.05, DARK);
      }
      fbox(b, fr, 0.4, 0.76, 0.05, 0.5, 0.025, 0.06, GREY);
      for (const [x, col] of [[0.24, [0.1, 0.2, 0.6]], [0.3, [0.7, 0.1, 0.1]], [0.36, [0.1, 0.1, 0.1]], [0.42, [0.1, 0.5, 0.2]]] as const) fbox(b, fr, x, 0.785, 0.06, 0.13, 0.02, 0.02, sp(L.WHITE, col as unknown as RGB));
      solidRect(b, fr, 0, 0, 1.95, 0.62);
      break;
    }
    case "dpcboard":
      // the same boards, on the wall (pr.a: 0 the sprint, 1 the burndown)
      fbox(b, fr, 0, -0.6, 0.02, 2.0, 1.24, 0.03, { all: GREY, pz: { layer: pr.a ? L.BURNDOWN : L.SPRINT, uv: BOARD_UV } });
      fbox(b, fr, 0, -0.64, 0.06, 1.9, 0.03, 0.08, GREY);
      break;
    case "dpcposter":
      // pr.a 0-2 under the sprint board, 3-5 under the burndown
      fbox(b, fr, 0, -0.45, 0.01, 0.62, 0.7, 0.01, { all: WHITE, pz: { layer: pr.a >= 3 ? L.BURNDOWN : L.SPRINT, uv: POSTER_UV(pr.a % 3) } });
      break;
    case "dpcsign":
      fbox(b, fr, 0, 0, 0.01, 0.34, 0.17, 0.012, { all: GREY, pz: { layer: L.DPC, uv: pr.b ? DPC_UV.signFr : DPC_UV.sign } });
      break;
    case "hightable": {
      cyl(b, fr, 0, 0, 0, 0.3, 0.03, DARK);
      cyl(b, fr, 0, 0.03, 0, 0.04, 1.05, DARK);
      cyl(b, fr, 0, 1.08, 0, 0.45, 0.03, sp(L.WHITE, [0.08, 0.08, 0.1]));
      cyl(b, fr, 0, 1.08, 0, 0.46, 0.025, sp(L.WOOD_FLOOR, [0.8, 0.6, 0.3]));
      if (pr.a) {
        fbox(b, fr, 0, 1.11, 0.05, 0.35, 0.015, 0.24, STEEL);
        b.obox(fr.p(0, 1.23, -0.08), fr.ax, [fr.s * -0.26, 0.97, fr.c * -0.26] as V3, [fr.s * 0.97, 0.26, fr.c * 0.97] as V3, [0.17, 0.12, 0.006], { all: STEEL, pz: { layer: L.WHITE, emit: [0.55, 0.6, 0.95] } });
      }
      solidRect(b, fr, 0, 0, 0.9, 0.9);
      break;
    }
    case "projscreen": {
      // a white screen with the name of the room projected on it
      const sh = pr.b || 2.9, sw = sh * 1.72;
      fbox(b, fr, 0, -0.1, 0.03, sw + 0.2, 0.12, 0.12, DARK);
      fbox(b, fr, 0, -0.1 - sh, 0.06, sw, sh, 0.01, { all: WHITE, pz: { layer: L.SHOWSIGN, emit: [0.75, 0.72, 0.7], uv: cellUV(pr.a, 2, 4) } });
      break;
    }
    case "truss": {
      // a box truss with spots, a projector and speakers hanging from it
      const len = pr.a;
      for (const [y, z] of [[0, -0.2], [0, 0.2], [0.4, -0.2], [0.4, 0.2]]) fbox(b, fr, 0, y!, z!, len, 0.04, 0.04, STEEL);
      for (let x = -len / 2; x <= len / 2; x += 0.5) {
        bar(b, fr.p(x, 0, -0.2), fr.p(x + 0.25, 0.4, -0.2), 0.02, STEEL);
        bar(b, fr.p(x, 0, 0.2), fr.p(x + 0.25, 0.4, 0.2), 0.02, STEEL);
      }
      for (const x of [-len / 2 + 0.3, len / 2 - 0.3]) fbox(b, fr, x, 0.4, 0, 0.012, 3.5, 0.012, DARK);
      for (let x = -len / 2 + 0.7; x < len / 2 - 0.4; x += rng.range(0.9, 1.5)) {
        const f = new Frame(...fr.p(x, 0, rng.pick([-0.2, 0.2])), fr.rot + rng.range(-0.6, 0.6));
        fbox(b, f, 0, -0.08, 0, 0.03, 0.1, 0.03, DARK);
        fbox(b, f, 0, -0.35, 0.05, 0.22, 0.24, 0.32, { all: DARK, pz: rng.chance(0.4) ? { layer: L.WHITE, emit: [1.6, 1.3, 0.9] } : GREY });
      }
      fbox(b, fr, 0.4, -0.5, 0, 0.5, 0.2, 0.45, { all: WHITE, pz: DARK });
      cyl(b, fr, 0.4, -0.45, 0.25, 0.06, 0.02, { layer: L.WHITE, emit: [1.6, 1.6, 1.8] });
      if (pr.b < 1000) for (const x of [-len / 2 + 0.6, len / 2 - 0.6]) fbox(b, fr, x, -0.9, 0, 0.5, 0.75, 0.45, { all: DARK, pz: sp(L.CARPET_GREY, [0.12, 0.12, 0.13]) });
      break;
    }
    case "bistro": {
      // a bistro chair: black steel ring back, a wooden seat
      const f = new Frame(pr.x, pr.y, pr.z, pr.rot);
      cyl(b, f, 0, 0.44, 0, 0.21, 0.03, sp(L.WOOD_FLOOR, [0.85, 0.62, 0.35]));
      for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) fbox(b, f, x!, 0, z!, 0.02, 0.44, 0.02, DARK);
      for (let k = 0; k <= 6; k++) {
        const a0 = Math.PI * (0.15 + (k / 6) * 0.7);
        fbox(b, f, Math.cos(a0) * 0.2, 0.47 + Math.sin(a0) * 0.36, 0.19, 0.03, 0.03, 0.02, DARK);
      }
      break;
    }
    case "tallwindow": {
      const h = pr.a;
      fbox(b, fr, 0, 0.3, 0.02, 1.4, h, 0.04, { all: GREY, pz: { layer: L.FROSTED, emit: [1.5, 1.55, 1.6], uv: [0, 0, 1, 2] } });
      for (const y of [0.3, 0.3 + h / 2, 0.3 + h]) fbox(b, fr, 0, y - 0.03, 0.05, 1.46, 0.06, 0.06, GREY);
      break;
    }
    case "sunlamp": {
      // the sun: a huge round softbox on the wall
      b.geom(CYL, ...fr.p(0, 0, 0.06), fr.rot, 2.6, 0.12, 2.6, DARK, Math.PI / 2);
      b.geom(CYL, ...fr.p(0, 0, 0.2), fr.rot, 2.4, 0.16, 2.4, { layer: L.WHITE, emit: [2.2, 2.0, 1.6] }, Math.PI / 2);
      for (const a0 of [0, 1.57, 3.14, 4.71]) fbox(b, fr, Math.cos(a0) * 2.5, Math.sin(a0) * 2.5 - 0.1, 0.1, 0.1, 0.2, 0.2, STEEL);
      break;
    }
    case "bostree": {
      // a real tree, in the VRT-bos (pr.b: 0 beech/oak, 1 birch, 2 pine; +10 a smaller one)
      const kind = pr.b % 10;
      const h = pr.b >= 10 ? rng.range(4.2, 5.8) : rng.range(6, 9.5), r = rng.range(0.16, 0.3);
      const bark = kind === 1 ? sp(L.WHITE, [0.82, 0.8, 0.74]) : sp(L.WOOD_FLOOR, [0.3, 0.24, 0.18]);
      b.geom(CYL6, pr.x, pr.y + h / 2, pr.z, rng.range(0, 3), r, h, r, bark);
      b.geom(CYL6, pr.x, pr.y + 0.25, pr.z, 0, r * 1.5, 0.5, r * 1.5, bark);
      if (kind === 1) for (let k = 0; k < 7; k++) {
        const yy = rng.range(0.6, h - 0.5);
        b.geom(CYL6, pr.x, pr.y + yy, pr.z, rng.range(0, 3), r * 1.03, 0.06, r * 1.03, DARK);
      }
      if (kind === 2) {
        const leaf = sp(L.FOLIAGE, [0.32, 0.46, 0.34]);
        for (let k = 0; k < 4; k++) {
          const rr = 2.4 - k * 0.5, yy = h * 0.4 + k * 1.3;
          b.geom(CONE, pr.x, pr.y + yy + 1.2, pr.z, rng.range(0, 3), rr, 2.6, rr, leaf);
        }
      } else {
        const tint: RGB = kind === 1 ? [0.72, 0.95, 0.52] : rng.pick([[0.62, 0.9, 0.5], [0.52, 0.8, 0.44], [0.72, 0.95, 0.52]] as RGB[]);
        const spread = kind === 1 ? 1.4 : 2.4;
        for (let k = 0; k < (kind === 1 ? 8 : 13); k++) {
          const a = rng.range(0, 6.28), d = rng.range(0, spread);
          const s = rng.range(0.9, 1.6) * (kind === 1 ? 0.8 : 1);
          b.geom(BLOB, pr.x + Math.cos(a) * d, pr.y + h * rng.range(0.6, 1.05) + 0.6, pr.z + Math.sin(a) * d, a, s, s * 0.8, s, sp(L.FOLIAGE, tint));
        }
      }
      b.solid(pr.x - r - 0.12, pr.z - r - 0.12, pr.x + r + 0.12, pr.z + r + 0.12);
      break;
    }
    case "floodmast": {
      // a floodlight mast by the tennis court
      cyl(b, fr, 0, 0, 0, 0.09, 7.2, sp(L.WHITE, [0.12, 0.28, 0.16]));
      fbox(b, fr, 0, 7.0, 0.1, 1.0, 0.12, 0.12, sp(L.WHITE, [0.12, 0.28, 0.16]));
      const fwd: V3 = [fr.s * 0.88, -0.48, fr.c * 0.88], upv: V3 = [fr.s * 0.48, 0.88, fr.c * 0.48];
      for (const x of [-0.35, 0.35]) b.obox(fr.p(x, 7.25, 0.25), fr.ax, upv, fwd, [0.2, 0.14, 0.1], { all: DARK, pz: { layer: L.WHITE, emit: [2.2, 2.1, 1.8] } });
      b.solid(pr.x - 0.12, pr.z - 0.12, pr.x + 0.12, pr.z + 0.12);
      break;
    }
    case "umpire": {
      // the umpire's chair, by the net
      const g = sp(L.WHITE, [0.12, 0.28, 0.16]);
      for (const x of [-0.35, 0.35]) for (const z of [-0.35, 0.35]) fbox(b, fr, x, 0, z, 0.06, 1.9, 0.06, g);
      for (let k = 1; k <= 4; k++) fbox(b, fr, 0, k * 0.38, 0.38, 0.7, 0.04, 0.1, g);
      fbox(b, fr, 0, 1.9, 0, 0.8, 0.06, 0.8, g);
      fbox(b, fr, 0, 1.96, -0.1, 0.5, 0.06, 0.5, sp(L.WHITE, [0.9, 0.9, 0.88]));
      fbox(b, fr, 0, 1.96, -0.36, 0.5, 0.55, 0.05, sp(L.WHITE, [0.9, 0.9, 0.88]));
      solidRect(b, fr, 0, 0, 0.8, 0.9);
      break;
    }
    case "cutout": {
      // a tree cut out of plywood, painted, on a strut with a sandbag
      const h = rng.range(3.2, 4.6);
      fbox(b, fr, 0, 0, 0, 0.35, h * 0.55, 0.04, sp(L.WOOD_FLOOR, [0.45, 0.3, 0.18]));
      b.quad(fr.p(-h * 0.35, h * 0.35, 0.01), [fr.c * h * 0.7, 0, -fr.s * h * 0.7], [0, h * 0.7, 0], fr.az, { layer: L.FOLIAGE, tint: [0.7, 1.0, 0.65], uv: [0, 0, 1, 1] }, 0);
      b.quad(fr.p(h * 0.35, h * 0.35, -0.01), [-fr.c * h * 0.7, 0, fr.s * h * 0.7], [0, h * 0.7, 0], [-fr.az[0], 0, -fr.az[2]], { layer: L.FOLIAGE, tint: [0.62, 0.48, 0.32], uv: [1, 0, 0, 1] }, 0);
      bar(b, fr.p(0, h * 0.5, -0.05), fr.p(0, 0.05, -1.1), 0.05, sp(L.WOOD_FLOOR, [0.6, 0.48, 0.32]));
      fbox(b, fr, 0, 0, -1.05, 0.5, 0.18, 0.35, sp(L.FABRIC, [0.36, 0.3, 0.2]));
      solidRect(b, fr, 0, -0.5, 0.6, 1.2);
      break;
    }
    case "parkbench": {
      const wood = sp(L.WOOD_FLOOR, [0.55, 0.36, 0.2]);
      for (const z of [-0.18, 0, 0.18]) fbox(b, fr, 0, 0.44, z, 1.8, 0.04, 0.12, wood);
      for (const y of [0.62, 0.78]) b.obox(fr.p(0, y, -0.32 - (y - 0.62) * 0.2), fr.ax, UP, fr.az, [0.9, 0.05, 0.02], wood);
      for (const x of [-0.75, 0.75]) {
        fbox(b, fr, x, 0, 0, 0.06, 0.46, 0.5, DARK);
        fbox(b, fr, x, 0.46, -0.3, 0.05, 0.45, 0.05, DARK);
      }
      solidRect(b, fr, 0, 0, 1.9, 0.7);
      break;
    }
    case "lamppost": {
      cyl(b, fr, 0, 0, 0, 0.14, 0.3, DARK, CYL6);
      cyl(b, fr, 0, 0.3, 0, 0.05, 3.0, DARK);
      b.geom(BLOB, pr.x, pr.y + 3.45, pr.z, 0, 0.25, 0.28, 0.25, { layer: L.WHITE, emit: [1.8, 1.5, 1.0] });
      cyl(b, fr, 0, 3.7, 0, 0.18, 0.05, DARK);
      b.solid(pr.x - 0.15, pr.z - 0.15, pr.x + 0.15, pr.z + 0.15);
      break;
    }
    case "filmlight": {
      // a big lamp on a tripod, tilted up at the tower (pr.a: tilt in degrees)
      for (let k = 0; k < 3; k++) {
        const a0 = (k / 3) * Math.PI * 2;
        bar(b, fr.p(Math.cos(a0) * 0.6, 0, Math.sin(a0) * 0.6), fr.p(0, 1.4, 0), 0.04, DARK);
      }
      cyl(b, fr, 0, 1.4, 0, 0.035, 1.2, STEEL);
      const tilt = (pr.a * Math.PI) / 180;
      const hc = fr.p(0, 2.7, 0);
      const fwd: V3 = [fr.s * Math.cos(tilt), Math.sin(tilt), fr.c * Math.cos(tilt)];
      const upv: V3 = [-fr.s * Math.sin(tilt), Math.cos(tilt), -fr.c * Math.sin(tilt)];
      b.obox(hc, fr.ax, upv, fwd, [0.35, 0.35, 0.4], { all: DARK, pz: { layer: L.WHITE, emit: [2.2, 2.0, 1.6] } });
      solidRect(b, fr, 0, 0, 1.0, 1.0);
      break;
    }
    case "windfan": {
      fbox(b, fr, 0, 0, 0, 1.2, 0.5, 0.8, DARK, true);
      const c = fr.p(0, 1.6, 0.1);
      b.geom(CYL, c[0], c[1], c[2], fr.rot, 1.1, 0.4, 1.1, sp(L.STEEL, [0.5, 0.52, 0.55]), Math.PI / 2);
      b.geom(CYL, ...fr.p(0, 1.6, 0.32), fr.rot, 1.0, 0.02, 1.0, DARK, Math.PI / 2);
      for (let k = 0; k < 5; k++) {
        const a0 = (k / 5) * Math.PI * 2;
        fbox(b, new Frame(...fr.p(0, 0, 0.35), fr.rot), Math.cos(a0) * 0.45, 1.6 + Math.sin(a0) * 0.45 - 0.08, 0, 0.8, 0.16, 0.02, sp(L.STEEL, [0.8, 0.8, 0.82]));
      }
      fbox(b, fr, 0, 0.5, 0.1, 0.2, 0.7, 0.2, DARK);
      break;
    }
    case "pipes": {
      // along the ceiling: a duct, three pipes (one red, for the sprinklers), a cable tray, brackets
      const L3 = pr.b || CELL + 0.02;
      fbox(b, fr, -0.55, -0.34, 0, 0.36, 0.26, L3, sp(L.STEEL, [0.78, 0.8, 0.82]));
      const pipe = (x: number, y: number, r: number, s: Spec) => {
        const p = fr.p(x, y, 0);
        b.geom(CYL, p[0], p[1], p[2], fr.rot, r, L3, r, s, Math.PI / 2);
      };
      pipe(-0.15, -0.14, 0.06, sp(L.WHITE, [0.82, 0.82, 0.8]));
      pipe(0.08, -0.12, 0.045, sp(L.WHITE, [0.7, 0.08, 0.06]));
      pipe(0.32, -0.18, 0.08, sp(L.STEEL, [0.6, 0.62, 0.64]));
      fbox(b, fr, 0.66, -0.1, 0, 0.24, 0.04, L3, sp(L.STEEL, [0.55, 0.57, 0.6]));
      for (let k = 0; k < 3; k++) fbox(b, fr, 0.66 + rng.range(-0.08, 0.08), -0.08, rng.range(-L3 / 2 + 0.4, L3 / 2 - 0.4), 0.03, 0.03, 0.7, sp(L.WHITE, rng.pick([[0.1, 0.1, 0.1], [0.8, 0.8, 0.8], [0.9, 0.5, 0.1]] as RGB[])));
      for (const z of [-L3 / 4, L3 / 4]) fbox(b, fr, 0, -0.22, z, 1.76, 0.03, 0.04, DARK);
      break;
    }
    case "stencil": {
      const q = pr.a;
      const u0 = (q % 2) * 0.5, v0 = 0.75 - Math.floor(q / 2) * 0.25;
      b.quad(fr.p(-0.6, 0, 0.004), [fr.c * 1.2, 0, -fr.s * 1.2], [0, 0.6, 0], fr.az, { layer: L.STENCIL, uv: [u0, v0, u0 + 0.5, v0 + 0.25] }, 0);
      break;
    }
    case "pop": {
      // de vakbond: a figure cut out of MDF, standing in a pine block. Facing +z.
      const mdf = sp(L.WHITE, [0.9, 0.56, 0.48]);
      const pine = sp(L.WOOD_FLOOR, [1.05, 0.95, 0.72]);
      const t = 0.018;
      const f = new Frame(pr.x, pr.y, pr.z, pr.rot + rng.range(-0.08, 0.08));
      fbox(b, f, 0, 0.0, 0.02, 0.56, 0.07, 0.2, pine);
      fbox(b, f, 0, 0.07, -0.06, 0.56, 0.1, 0.035, pine);
      // legs
      for (const x of [-0.13, 0.13]) fbox(b, f, x, 0.08, 0, 0.18, 0.68, t, mdf);
      // body, arms either side of a slot, shoulders
      fbox(b, f, 0, 0.76, 0, 0.44, 0.56, t, mdf);
      for (const x of [-0.29, 0.29]) fbox(b, f, x, 0.66, 0, 0.08, 0.66, t, mdf);
      fbox(b, f, 0, 1.32, 0, 0.66, 0.1, t, mdf);
      // the head: a circle with the top cut straight off, sunk into the shoulders
      const h = f.p(0, 1.56, -t / 2);
      b.geom(POP_HEAD, h[0], h[1], h[2], f.rot, 0.64, 1, 1, mdf);
      solidRect(b, f, 0, 0.02, 0.6, 0.25);
      break;
    }
    case "puddle": {
      const s = pr.a;
      b.quad(fr.p(-s, 0.006, -s * 0.7), [fr.c * 2 * s, 0, -fr.s * 2 * s], [fr.s * 1.4 * s, 0, fr.c * 1.4 * s], [0, 1, 0], { layer: L.PUDDLE, uv: [0, 0, 1, 1] }, 0);
      break;
    }
  }
}

// Visible light fixtures.
export function buildFixture(b: Builder, l: Light) {
  if (!l.fix) return;
  b.cell(l.gx, l.gz);
  const fr = new Frame(l.x, l.y, l.z, l.rot);
  const on = l.on;
  const bright: RGB = [l.r * 1.7 + 0.2, l.g * 1.7 + 0.2, l.b * 1.7 + 0.2];
  const lit: Spec = on ? { layer: L.LIGHTPANEL, emit: bright, flick: l.flick || undefined, uv: [0, 0, 1, 1] } : { layer: L.LIGHTPANEL, tint: [0.3, 0.3, 0.3], uv: [0, 0, 1, 1] };
  switch (l.fix) {
    case "panel":
      fbox(b, fr, 0, -0.012, 0, 0.62, 0.012, 1.22, { all: GREY, ny: lit });
      break;
    case "strip":
      fbox(b, fr, 0, -0.05, 0, 2.6, 0.05, 0.16, { all: GREY, ny: lit });
      break;
    case "tube": {
      fbox(b, fr, 0, -0.06, 0, 1.3, 0.04, 0.12, GREY);
      const t: Spec = on ? { layer: L.WHITE, emit: bright, flick: l.flick || undefined } : { layer: L.WHITE, tint: [0.35, 0.35, 0.35] };
      fbox(b, fr, 0, -0.11, 0, 1.22, 0.05, 0.05, t);
      break;
    }
    case "bulb": {
      fbox(b, fr, 0, -0.3, 0, 0.012, 0.3, 0.012, DARK);
      const t: Spec = on ? { layer: L.WHITE, emit: bright, flick: l.flick || undefined } : { layer: L.WHITE, tint: [0.4, 0.4, 0.4] };
      fbox(b, fr, 0, -0.42, 0, 0.1, 0.12, 0.1, t);
      break;
    }
    case "roundlamp": {
      // a round bulkhead lamp on the wall
      b.geom(CYL, ...fr.p(0, 0, -0.095), fr.rot, 0.16, 0.05, 0.16, GREY, Math.PI / 2);
      const g: Spec = on ? { layer: L.WHITE, emit: bright, flick: l.flick || undefined } : { layer: L.WHITE, tint: [0.45, 0.45, 0.45] };
      b.geom(CYL, ...fr.p(0, 0, -0.055), fr.rot, 0.13, 0.04, 0.13, g, Math.PI / 2);
      break;
    }
    case "chandelier": {
      fbox(b, fr, 0, -0.3, 0, 0.015, 0.3, 0.015, DARK);
      const g: Spec = on ? { layer: L.WHITE, emit: [2.0, 1.6, 1.0], flick: l.flick || undefined } : { layer: L.WHITE, tint: [0.5, 0.45, 0.4] };
      const c = fr.p(0, -0.4, 0);
      b.geom(BLOB, c[0], c[1], c[2], 0, 0.1, 0.08, 0.1, sp(L.STEEL, [1.1, 0.95, 0.6]));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        fbox(b, fr, Math.cos(a) * 0.28, -0.46, Math.sin(a) * 0.28, 0.05, 0.1, 0.05, g);
        fbox(b, fr, Math.cos(a) * 0.14, -0.42, Math.sin(a) * 0.14, 0.26, 0.012, 0.012, sp(L.STEEL, [1.1, 0.95, 0.6]));
      }
      break;
    }
    case "bulkhead":
      fbox(b, fr, 0, -0.1, 0, 0.34, 0.2, 0.1, { all: GREY, pz: on ? { layer: L.WHITE, emit: bright, flick: l.flick || undefined } : { layer: L.WHITE, tint: [0.4, 0.4, 0.4] } });
      break;
  }
}

// A TV set inside a studio: three flats around a café, open to the cameras.
// From the front it's Bar Madam (Thuis) or Café De Kampioenen; from behind it's
// raw plywood, braces and sandbags. Origin at the studio wall, +z into the room.
function tvSet(b: Builder, fr: Frame, W: number, thuis: boolean, D: number, rng: Rng) {
  const z0 = 1.2, z1 = z0 + D, Hs = 3.0, th = 0.08;
  const ply = sp(L.PLYWOOD);
  const batten = sp(L.WOOD_FLOOR, [0.62, 0.5, 0.34]);
  const paper = sp(L.WALLPAPER, thuis ? [0.66, 0.3, 0.36] : [0.98, 0.93, 0.72]);
  const wains = sp(L.WOODSLAT, thuis ? [0.42, 0.26, 0.2] : [0.75, 0.52, 0.32]);
  const wood = sp(L.WOOD_FLOOR, thuis ? [0.4, 0.22, 0.16] : [0.6, 0.4, 0.24]);
  const floor = thuis ? sp(L.TILE_SMALL, [0.55, 0.42, 0.36]) : sp(L.WOOD_FLOOR, [0.75, 0.6, 0.45]);
  const GREEN: RGB = [0.12, 0.55, 0.2], YELLOW: RGB = [0.98, 0.8, 0.1];

  // the flats: wallpaper and wainscot inside, plywood outside
  fbox(b, fr, 0, 0, z0, W + th, Hs, th, { all: ply, pz: paper }, true);
  fbox(b, fr, 0, 0, z0 + th / 2 + 0.012, W, 1.0, 0.02, wains);
  fbox(b, fr, 0, Hs - 0.12, z0 + th / 2 + 0.03, W, 0.12, 0.06, wood);
  for (const s of [-1, 1]) {
    fbox(b, fr, (s * W) / 2, 0, z0 + D / 2, th, Hs, D, s < 0 ? { all: ply, px: paper } : { all: ply, nx: paper }, true);
    fbox(b, fr, s * (W / 2 - th / 2 - 0.012), 0, z0 + D / 2, 0.02, 1.0, D, wains);
    fbox(b, fr, s * (W / 2 - th / 2 - 0.03), Hs - 0.12, z0 + D / 2, 0.06, 0.12, D, wood);
  }
  fbox(b, fr, 0, 0, z0 + D / 2 + th / 2, W - th, 0.03, D - th, { all: wood, py: floor });

  // behind: battens, braces, sandbags, a stencil
  for (const y of [0.9, 2.2]) fbox(b, fr, 0, y, z0 - th / 2 - 0.03, W, 0.08, 0.05, batten);
  const nb = Math.max(2, Math.round(W / 2));
  for (let k = 0; k < nb; k++) {
    const x = -W / 2 + 0.5 + (k * (W - 1)) / (nb - 1);
    bar(b, fr.p(x, 0.04, z0 - 1.05), fr.p(x, 2.3, z0 - th / 2 - 0.04), 0.07, batten, fr.ax);
    fbox(b, fr, x + rng.range(-0.05, 0.05), 0, z0 - 1.0, 0.42, 0.16, 0.3, sp(L.FABRIC, [0.36, 0.3, 0.2]));
  }
  for (const s of [-1, 1]) {
    const x = (s * W) / 2;
    bar(b, fr.p(x + s * 0.95, 0.04, z0 + D / 2), fr.p(x + s * (th / 2 + 0.04), 2.3, z0 + D / 2), 0.07, batten, fr.az);
    fbox(b, fr, x + s * 0.9, 0, z0 + D / 2, 0.3, 0.16, 0.42, sp(L.FABRIC, [0.36, 0.3, 0.2]));
  }
  fbox(b, fr, -W / 4, 1.35, z0 - th / 2 - 0.006, 1.3, 0.54, 0.006, { all: ply, nz: { layer: L.SETSIGNS, uv: cellUV(3, 2, 2) } });

  // the bar, the bottles behind it, and the sign over it
  const cx = thuis ? -W * 0.14 : W * 0.12, lc = Math.min(3.2, W * 0.5);
  fbox(b, fr, cx, 0, z0 + 0.95, lc, 1.02, 0.55, { all: wood, pz: sp(L.WOODSLAT, thuis ? [0.35, 0.2, 0.16] : [0.6, 0.42, 0.26]) }, true);
  fbox(b, fr, cx, 1.02, z0 + 0.98, lc + 0.1, 0.05, 0.68, sp(L.WOOD_FLOOR, thuis ? [0.25, 0.14, 0.1] : [0.4, 0.26, 0.16]));
  for (let k = 0; k < 3; k++) {
    cyl(b, fr, cx - 0.4 + k * 0.25, 1.07, z0 + 0.82, 0.025, 0.32, STEEL);
    cyl(b, fr, cx - 0.4 + k * 0.25, 1.36, z0 + 0.86, 0.035, 0.06, k === 1 ? sp(L.WHITE, YELLOW) : DARK);
  }
  for (let k = 0; k < 4; k++) cyl(b, fr, cx + 0.3 + k * 0.14 + rng.range(-0.03, 0.03), 1.07, z0 + 1.1, 0.032, 0.12, sp(L.WHITE, [0.85, 0.82, 0.6]));
  fbox(b, fr, cx, 1.15, z0 + th / 2 + 0.1, lc, 0.95, 0.18, { all: wood, pz: { layer: L.MISC, uv: cellUV(3, 2, 2) } });
  for (let k = 0; k < 4; k++) {
    const x = cx - lc / 2 + 0.4 + (k * (lc - 0.8)) / 3;
    cyl(b, fr, x, 0, z0 + 1.55, 0.03, 0.72, STEEL);
    cyl(b, fr, x, 0.72, z0 + 1.55, 0.17, 0.06, sp(L.CARPET_GREY, thuis ? [0.55, 0.12, 0.16] : GREEN));
  }
  if (thuis) {
    fbox(b, fr, cx, 2.1, z0 + th / 2 + 0.02, 1.9, 0.8, 0.03, { all: DARK, pz: { layer: L.SETSIGNS, emit: [1.3, 1.25, 1.3], uv: cellUV(1, 2, 2) } });
    for (const s of [-1, 1]) {
      fbox(b, fr, cx + s * 1.3, 1.95, z0 + th / 2 + 0.06, 0.05, 0.05, 0.12, DARK);
      fbox(b, fr, cx + s * 1.3, 1.85, z0 + th / 2 + 0.14, 0.16, 0.2, 0.16, { layer: L.WHITE, emit: [1.6, 1.25, 0.8] });
    }
  } else {
    fbox(b, fr, cx, 2.12, z0 + th / 2 + 0.02, 1.62, 0.86, 0.03, { all: DARK, pz: { layer: L.SETSIGNS, emit: [0.95, 0.95, 0.9], uv: cellUV(0, 2, 2) } });
    // the club's trophy on the bar
    cyl(b, fr, cx - lc / 2 + 0.3, 1.07, z0 + 1.0, 0.06, 0.08, DARK);
    cyl(b, fr, cx - lc / 2 + 0.3, 1.15, z0 + 1.0, 0.03, 0.14, sp(L.WHITE, YELLOW));
    cyl(b, fr, cx - lc / 2 + 0.3, 1.29, z0 + 1.0, 0.09, 0.12, sp(L.WHITE, YELLOW));
  }

  // tables and chairs out front
  const tables: [number, number][] = [[W * 0.3, z1 - 0.95], [-W * 0.32, z1 - 0.8]];
  if (W > 6) tables.push([W * 0.02, z1 - 0.7]);
  for (const [x, z] of tables) {
    fbox(b, fr, x, 0.72, z, 0.75, 0.04, 0.75, sp(L.WOOD_FLOOR, thuis ? [0.3, 0.18, 0.12] : [0.55, 0.38, 0.22]), true);
    fbox(b, fr, x, 0, z, 0.06, 0.72, 0.06, DARK);
    fbox(b, fr, x, 0, z, 0.45, 0.02, 0.45, DARK);
    for (const [ox, oz, r] of [[0, 0.55, 0], [0, -0.55, Math.PI], [0.55, 0, -Math.PI / 2]] as const)
      if (rng.chance(0.85)) simpleChair(b, fr, x + ox, z + oz, r + rng.range(-0.3, 0.3), sp(L.WOOD_FLOOR, thuis ? [0.35, 0.2, 0.14] : [0.62, 0.45, 0.28]));
    if (rng.chance(0.7)) cyl(b, fr, x + rng.range(-0.2, 0.2), 0.76, z + rng.range(-0.2, 0.2), 0.035, 0.13, sp(L.WHITE, [0.92, 0.75, 0.25]));
  }

  // dressing on the side flats
  const leftWall = new Frame(...fr.p(-W / 2 + th / 2, 0, z0 + D * 0.5), fr.rot + Math.PI / 2);
  const rightWall = new Frame(...fr.p(W / 2 - th / 2, 0, z0 + D * 0.5), fr.rot - Math.PI / 2);
  if (thuis) {
    // the Thuis poster, a TV with VRT 1 on it, a plant
    fbox(b, leftWall, 0, 1.3, 0.01, 0.64, 0.9, 0.02, { all: WHITE, pz: { layer: L.POSTERS5, uv: [0.5, 0.5, 1, 1] } });
    fbox(b, rightWall, 0, 1.75, 0.2, 0.8, 0.5, 0.08, { all: DARK, pz: ident(2, 0.8) });
    fbox(b, rightWall, 0, 1.68, 0.05, 0.1, 0.1, 0.25, DARK);
    const pot = fr.p(W / 2 - 0.45, 0, z1 - 0.35);
    b.geom(CYL, pot[0], pot[1] + 0.25, pot[2], 0, 0.2, 0.5, 0.2, sp(L.WHITE, [0.7, 0.4, 0.3]));
    for (let k = 0; k < 4; k++) b.geom(BLOB, pot[0] + rng.range(-0.15, 0.15), pot[1] + 0.75 + rng.range(0, 0.4), pot[2] + rng.range(-0.15, 0.15), rng.range(0, 6), 0.25, 0.22, 0.25, sp(L.FOLIAGE, [0.5, 0.75, 0.45]));
  } else {
    // Boma Worst, the dartboard, a framed shirt, and pennants across the front
    fbox(b, leftWall, 0, 1.45, 0.01, 1.1, 0.5, 0.02, { all: WHITE, pz: { layer: L.SETSIGNS, uv: cellUV(2, 2, 2) } });
    fbox(b, rightWall, 0.3, 1.2, 0.02, 0.9, 0.9, 0.03, sp(L.WHITE, [0.45, 0.32, 0.2]));
    b.quad(rightWall.p(0.07, 1.42, 0.04), [rightWall.c * 0.46, 0, -rightWall.s * 0.46], [0, 0.46, 0], rightWall.az, { layer: L.DARTBOARD, uv: [0, 0, 1, 1] }, 0);
    fbox(b, fr, cx + lc / 2 + 0.7, 1.3, z0 + th / 2 + 0.02, 0.62, 0.72, 0.03, { all: sp(L.WOOD_FLOOR, [0.3, 0.2, 0.12]), pz: { layer: L.MISC, uv: cellUV(0, 2, 2) } });
    const n = Math.round(W / 0.3);
    for (let k = 0; k < n; k++) {
      const x = -W / 2 + ((k + 0.5) * W) / n;
      const y = 2.78 - 0.3 * Math.sin((Math.PI * (k + 0.5)) / n);
      const f = new Frame(...fr.p(x, 0, z1 - 0.2), fr.rot);
      const flag = sp(L.WHITE, k % 2 ? YELLOW : GREEN);
      const tri: [V3, V3, V3, V3] = [f.p(0, y - 0.24, 0), f.p(0.11, y, 0), f.p(-0.11, y, 0), f.p(0, y - 0.24, 0)];
      const uv: [number, number][] = [[0.5, 0], [1, 1], [0, 1], [0.5, 0]];
      b.quad4(tri, uv, f.az, flag);
      b.quad4([tri[3], tri[2], tri[1], tri[0]], [uv[3]!, uv[2]!, uv[1]!, uv[0]!], [-f.az[0], 0, -f.az[2]], flag);
    }
    bar(b, fr.p(-W / 2, 2.8, z1 - 0.2), fr.p(0, 2.48, z1 - 0.2), 0.012, DARK);
    bar(b, fr.p(0, 2.48, z1 - 0.2), fr.p(W / 2, 2.8, z1 - 0.2), 0.012, DARK);
  }

  // spike tape on the studio floor where the actors stand
  for (let k = 0; k < 4; k++) {
    const x = rng.range(-W / 2 + 0.8, W / 2 - 0.8), z = rng.range(z0 + 1.9, z1 - 0.3);
    const tape = { layer: L.WHITE, emit: rng.pick([[1.2, 1.0, 0.1], [0.2, 0.9, 0.4], [1.2, 0.2, 0.3]] as RGB[]) };
    fbox(b, fr, x, 0.045, z, 0.2, 0.004, 0.04, tape);
    fbox(b, fr, x, 0.045, z, 0.04, 0.004, 0.2, tape);
  }
}

// Something on a pallet in the rekwisieten, within about 1.2 x 1.2 x 1.3 m.
function junk(b: Builder, fr: Frame, rng: Rng) {
  const k = rng.int(0, 9);
  const col = (): Spec => sp(L.WHITE, rng.pick([[0.8, 0.15, 0.12], [0.15, 0.3, 0.7], [0.9, 0.75, 0.2], [0.2, 0.55, 0.3], [0.85, 0.85, 0.82], [0.4, 0.28, 0.18], [0.6, 0.3, 0.6]] as RGB[]));
  const wood = sp(L.WOOD_FLOOR, [0.72, 0.58, 0.4]);
  fbox(b, fr, 0, 0, 0, 1.1, 0.08, 0.9, wood);
  switch (k) {
    case 0: case 1:
      for (let n = 0; n < rng.int(1, 4); n++) fbox(b, fr, rng.range(-0.25, 0.25), 0.08 + n * 0.3, rng.range(-0.15, 0.15), rng.range(0.4, 0.8), 0.29, rng.range(0.4, 0.7), CARDBOARD);
      break;
    case 2: // stacked chairs
      for (let n = 0; n < 4; n++) simpleChair(b, new Frame(...fr.p(0, 0.08 + n * 0.12, 0), fr.rot), 0, 0, 0, col());
      break;
    case 3: { // a standard lamp and a lampshade
      fbox(b, fr, -0.2, 0.08, 0, 0.04, 1.1, 0.04, DARK);
      const p = fr.p(-0.2, 1.1, 0);
      b.geom(CYL, p[0], p[1], p[2], 0, 0.22, 0.25, 0.22, col());
      fbox(b, fr, 0.25, 0.08, 0.1, 0.4, 0.5, 0.4, col());
      break;
    }
    case 4: { // a fake plant
      cyl(b, fr, 0, 0.08, 0, 0.18, 0.3, col());
      for (let n = 0; n < 5; n++) b.geom(BLOB, ...fr.p(rng.range(-0.2, 0.2), rng.range(0.55, 1.1), rng.range(-0.2, 0.2)), n, 0.2, 0.18, 0.2, sp(L.FOLIAGE, [0.5, 0.8, 0.45]));
      break;
    }
    case 5: // an old television
      fbox(b, fr, 0, 0.08, 0, 0.65, 0.5, 0.5, { all: sp(L.WOOD_FLOOR, [0.4, 0.25, 0.15]), pz: { layer: L.SCREEN } });
      fbox(b, fr, 0, 0.58, -0.05, 0.02, 0.35, 0.02, DARK);
      break;
    case 6: { // a white statue
      const p = fr.p(0, 0.6, 0);
      b.geom(BLOB, p[0], p[1], p[2], fr.rot, 0.2, 0.45, 0.18, sp(L.WHITE, [0.92, 0.9, 0.86]));
      b.geom(BLOB, p[0], p[1] + 0.55, p[2], fr.rot, 0.1, 0.12, 0.1, sp(L.WHITE, [0.92, 0.9, 0.86]));
      break;
    }
    case 7: // rolled carpets
      for (let n = 0; n < 3; n++) {
        const p = fr.p(0, 0.2 + (n % 2) * 0.22, -0.25 + n * 0.25);
        b.geom(CYL, p[0], p[1], p[2], fr.rot + Math.PI / 2, 0.11, 1.05, 0.11, col(), Math.PI / 2);
      }
      break;
    case 8: // a travelling trunk
      fbox(b, fr, 0, 0.08, 0, 0.9, 0.5, 0.55, { all: sp(L.WOOD_FLOOR, [0.35, 0.2, 0.12]) });
      for (const x of [-0.35, 0.35]) fbox(b, fr, x, 0.08, 0, 0.05, 0.52, 0.57, sp(L.STEEL, [0.9, 0.8, 0.5]));
      break;
    default: // a door, leaning
      fbox(b, fr, 0, 0.08, 0.2, 0.85, 1.15, 0.05, { all: { layer: L.DOOR_WOOD, uv: [0, 0, 1, 1] } });
  }
}
