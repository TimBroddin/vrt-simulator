// Prop and light-fixture geometry, all made from boxes and a few primitives.
import { CylinderGeometry, IcosahedronGeometry, SphereGeometry } from "three";
import { CEIL, DOOR_H } from "./config";
import { Builder, Frame, UP, fbox, type RGB, type Spec } from "./builder";
import type { Light, Prop } from "./furnish";
import { ART0, L, LABEL0 } from "./layers";
import { ART } from "./art";
import { Rng } from "./rng";

const CYL = new CylinderGeometry(1, 1, 1, 14, 1);
const CYL6 = new CylinderGeometry(1, 1, 1, 6, 1);
const BLOB = new IcosahedronGeometry(1, 1);
const DISH = new SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, Math.PI * 0.28);

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

const TV_LAYERS = [L.TV_BARS, L.TV_GEDULD, L.NOISE, L.SCREEN];

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
      cyl(b, new Frame(...fr.p(0, 0, 0.03), fr.rot), 0, -0.19, 0, 0.19, 0.05, DARK);
      b.quad(fr.p(-0.18, -0.18, 0.056), [fr.c * 0.36, 0, -fr.s * 0.36], [0, 0.36, 0], fr.az, { layer: L.CLOCK, uv: [0, 0, 1, 1] }, 0);
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
      const layer = pr.a < 4 ? L.POSTERS1 : L.POSTERS2;
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
      const layer = TV_LAYERS[pr.a]!;
      fbox(b, fr, 0, -0.05, 0.02, 0.2, 0.2, 0.04, DARK);
      fbox(b, fr, 0, -0.3, 0.12, 1.05, 0.62, 0.06, { all: DARK, pz: screen(layer, layer !== L.SCREEN, 1.05) });
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
    case "onair":
      fbox(b, fr, 0, 0, 0.04, 0.6, 0.18, 0.08, { all: DARK, pz: pr.a ? { layer: L.ONAIR, emit: [1.6, 1.6, 1.6], uv: [0, 0, 1, 1] } : { layer: L.ONAIR, tint: [0.35, 0.3, 0.3], uv: [0, 0, 1, 1] } });
      break;
    case "sign": {
      const q = pr.a;
      const u0 = (q % 2) * 0.5, v0 = 0.75 - Math.floor(q / 2) * 0.25;
      fbox(b, fr, 0, 0, 0.01, 0.34, 0.17, 0.012, { all: GREY, pz: { layer: L.SIGNS, uv: [u0, v0, u0 + 0.5, v0 + 0.25] } });
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
      fbox(b, fr, 0, 0.8, 0.05, 2.9, 1.9, 0.1, DARK);
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) {
          const layer = rng.pick([L.TV_BARS, L.TV_GEDULD, L.NOISE, L.SCREEN, L.NWSWALL, L.NOISE, L.SCREEN]);
          const k = rng.range(0.6, 1.0);
          fbox(b, fr, (c - 1) * 0.95, 0.88 + r * 0.6, 0.12, 0.88, 0.52, 0.04, { all: DARK, pz: screen(layer, layer !== L.SCREEN, k) });
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
    case "bulkhead":
      fbox(b, fr, 0, -0.1, 0, 0.34, 0.2, 0.1, { all: GREY, pz: on ? { layer: L.WHITE, emit: bright, flick: l.flick || undefined } : { layer: L.WHITE, tint: [0.4, 0.4, 0.4] } });
      break;
  }
}
