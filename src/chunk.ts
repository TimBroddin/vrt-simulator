// Turns a furnished plan into geometry: floors, ceilings, walls with openings,
// stairwells, elevator cars and the courtyard facades.
import { CEIL, CELL, CH, CHUNK, DOOR_H, DX, DZ, FLOOR_MAX, FLOOR_MIN, H, MID_FLOOR, SNAKE_HALF, ST_HALF, ST_U1, ST_U2, ST_VM, T, isRtbf } from "./config";
import { Builder, Frame, LightCtx, UP, fbox, type Built, type RGB, type Spec, type V3 } from "./builder";
import { getFurnished } from "./furnish";
import { K, PASS_DROP, PASS_RUN, RT, SK, TALL, gardenStair, getStructure, kindAt, mazeAt, marconiGallery, roomAnomaly, sideAt, stairFrame, tallTop, towerSpec, bosSpec, BAREEL, bareelBooms, bareelLamps, bareelCanopyLamps, type GardenStair, type Plan } from "./layout";
import { hash } from "./rng";
import { L } from "./layers";
import { buildFixture, buildProp } from "./props";
import { BufferGeometry, CylinderGeometry, RingGeometry } from "three";

const DUCT = new CylinderGeometry(1, 1, 1, 16, 1, true);

const sp = (layer: number, tint?: RGB, emit?: RGB): Spec => ({ layer, tint, emit });
const DARKTRIM = sp(L.WHITE, [0.12, 0.12, 0.13]);
const ALU = sp(L.STEEL, [0.55, 0.57, 0.6]);
const BLACKSTEEL = sp(L.WHITE, [0.05, 0.05, 0.055]);
const STEELS = sp(L.STEEL);

interface Surf {
  floor: Spec;
  ceil: Spec | null;
  wall: Spec;
  h: number;
  base: boolean;
}

export interface ElevOut {
  gx: number;
  gz: number;
  d: number;
  x: number;
  z: number;
  px: number;
  pz: number;
  panels: [Built, Built];
}

function surf(p: Plan, i: number): Surf {
  const k = p.kind[i];
  switch (k) {
    case K.CORR:
      // de gang naar de parking: painted blocks, a concrete floor, a low ceiling full of pipes
      if (mazeAt(p.f, p.st)) return { floor: sp(L.CONCRETE, [0.72, 0.72, 0.7]), ceil: sp(L.CONCRETE, [0.62, 0.62, 0.6]), wall: sp(L.BLOCKWALL), h: 2.5, base: false };
      if (p.st.atrium?.kind === "hall" && p.zone[i] === 2)
        return { floor: sp(L.SPORTFLOOR), ceil: null, wall: sp(L.PLASTER, [0.95, 0.9, 0.74]), h: CEIL, base: false };
      if (p.st.special === "park") return { floor: sp(L.CONCRETE, [0.75, 0.75, 0.72]), ceil: sp(L.STEEL, [0.7, 0.72, 0.75]), wall: sp(L.PLASTER), h: CEIL, base: false };
      {
        const a = p.st.atrium;
        if (a && TALL.has(a.kind) && a.kind !== "hall" && (p.zone[i] === 1 || p.zone[i] === 2)) {
          const top = tallTop(a, H, CEIL), x = i % CH, z = (i / CH) | 0;
          if (a.kind === "decor") {
            if (x === 5 || x === 6) return { floor: sp(L.CONCRETE, [0.62, 0.62, 0.6]), ceil: null, wall: sp(L.BRICK_DOTS, [0.72, 0.72, 0.72]), h: top, base: false };
            return { floor: sp(L.BLACK, [1.3, 1.3, 1.35]), ceil: null, wall: sp(L.BLACK, [1.1, 1.1, 1.15]), h: top, base: false };
          }
          if (a.kind === "marconi") {
            const panels = sp(L.PANELS);
            if (p.zone[i] === 1) return { floor: sp(L.CARPET_GREY, [0.5, 0.5, 0.52]), ceil: null, wall: panels, h: CEIL, base: false };
            // under the gallery the walls stop at the gallery floor
            return { floor: sp(L.WOOD_FLOOR, [0.95, 0.9, 0.8]), ceil: null, wall: panels, h: marconiGallery(a, x, z) ? H : top, base: false };
          }
          // the painted sky is lit by itself, like a cyclorama
          if (a.kind === "bareel") return { floor: sp(L.GRASS, [1.0, 1.2, 0.8]), ceil: null, wall: { layer: L.CYC, emit: [1.35, 1.38, 1.36] }, h: top, base: false };
          if (a.kind === "bos") return { floor: sp(L.GRASS, [0.9, 1.1, 0.72]), ceil: null, wall: { layer: L.CYC, emit: [1.0, 1.04, 1.02] }, h: top, base: false };
          return { floor: sp(L.GRASS, [1.1, 1.25, 0.95]), ceil: null, wall: { layer: L.CYC, emit: [0.82, 0.84, 0.86] }, h: top, base: false };
        }
      }
      if (p.st.atrium?.kind === "props" && (p.zone[i] === 1 || p.zone[i] === 2))
        return { floor: sp(L.CONCRETE, [0.72, 0.72, 0.7]), ceil: sp(L.CEILMETAL, [0.7, 0.7, 0.72]), wall: sp(L.BRICK_DOTS, [0.85, 0.85, 0.84]), h: CEIL, base: false };
      if (p.st.mid) return { floor: sp(L.TILEDARK, [2.0, 1.9, 1.7]), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER), h: CEIL, base: false };
      if ((p.zone[i] === 1 || p.zone[i] === 2) && p.st.atrium?.kind === "garden")
        return p.zone[i] === 2
          ? { floor: sp(L.TILEDARK, [0.75, 0.75, 0.75]), ceil: null, wall: sp(L.PLASTER), h: CEIL, base: false }
          : { floor: sp(L.CARPET_GREY, [0.6, 0.6, 0.64]), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER, [0.95, 0.94, 0.9]), h: CEIL, base: true };
      if (p.zone[i] === 1 || p.zone[i] === 2)
        return { floor: sp(L.WOOD_FLOOR, [0.9, 0.84, 0.76]), ceil: sp(L.CEILTILE), wall: sp(L.WOODSLAT, [0.95, 0.85, 0.75]), h: CEIL, base: false };
      if (p.style === 0) return { floor: sp(L.TILEDARK), ceil: sp(L.WOODSLAT, [0.5, 0.4, 0.32]), wall: sp(L.BRICK), h: CEIL, base: false };
      if (p.style === 1) return { floor: sp(L.CARPET_FLECK), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER), h: CEIL, base: true };
      return { floor: sp(L.CARPET_GREY), ceil: sp(L.CEILMETAL), wall: sp(L.BRICK_DOTS), h: CEIL, base: false };
    case K.ROOM: {
      const r = p.rooms[p.room[i]!]!;
      const an = roomAnomaly(p, r);
      // a long room with the ceiling pressing down
      if (an === "low") return { floor: sp(L.CARPET_FLECK, [0.8, 0.78, 0.75]), ceil: sp(L.CEILTILE, [0.85, 0.85, 0.8]), wall: sp(L.PLASTER, [0.85, 0.83, 0.76]), h: 2.02, base: true };
      if (an === "flooded") return { floor: sp(L.CONCRETE, [0.45, 0.47, 0.46]), ceil: sp(L.CONCRETE, [0.8, 0.8, 0.78]), wall: sp(L.TILE_SMALL, [0.75, 0.8, 0.8]), h: CEIL, base: false };
      switch (r.type) {
        case RT.OFFICE: return { floor: sp(L.CARPET_BLUE), ceil: sp(L.CEILMETAL), wall: sp(L.PLASTER), h: CEIL, base: true };
        case RT.MEETING: return { floor: sp(L.CARPET_GREY), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER, [0.95, 0.93, 0.88]), h: CEIL, base: true };
        case RT.BATH: return { floor: sp(L.TILE_SMALL), ceil: sp(L.CEILTILE), wall: sp(L.TILE_BLUE), h: CEIL, base: false };
        case RT.STORAGE: return { floor: sp(L.CONCRETE, [0.8, 0.8, 0.78]), ceil: sp(L.CONCRETE), wall: sp(L.PLASTER, [0.75, 0.75, 0.72]), h: CEIL, base: false };
        case RT.SERVER: return { floor: sp(L.TILE_SMALL, [0.7, 0.72, 0.75]), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER, [0.8, 0.82, 0.85]), h: CEIL, base: false };
        case RT.STUDIO: case RT.SET: return { floor: sp(L.BLACK, [0.9, 0.9, 0.9]), ceil: sp(L.BLACK, [0.6, 0.6, 0.6]), wall: sp(L.BLACK), h: 3.3, base: false };
        case RT.KETNET:
          if (isRtbf(p.cz)) return { floor: sp(L.BLACK, [0.9, 0.9, 0.9]), ceil: sp(L.BLACK, [0.6, 0.6, 0.6]), wall: sp(L.BLACK), h: 3.3, base: false };
          return { floor: sp(L.WHITE, [0.07, 0.1, 0.22]), ceil: sp(L.BLACK, [0.6, 0.6, 0.6]), wall: sp(L.PLASTER, [0.42, 0.9, 0.62]), h: 3.3, base: false };
        case RT.SPORZA: return { floor: sp(L.TILEDARK, [0.55, 0.55, 0.58]), ceil: sp(L.BLACK, [0.6, 0.6, 0.6]), wall: sp(L.BLACK, [1.1, 1.15, 1.1]), h: 3.3, base: false };
        case RT.COSTUME: return { floor: sp(L.LINO, [0.9, 0.85, 0.8]), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER, [0.96, 0.93, 0.88]), h: CEIL, base: true };
        case RT.DRESSING: return { floor: sp(L.CARPET_GREY, [0.62, 0.48, 0.5]), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER, [0.98, 0.9, 0.84]), h: CEIL, base: true };
        case RT.VIPBAR: return { floor: sp(L.CARPET_FLECK, [0.55, 0.3, 0.38]), ceil: sp(L.BLACK, [0.7, 0.6, 0.75]), wall: sp(L.WOODSLAT, [0.45, 0.32, 0.4]), h: CEIL, base: false };
        case RT.VIPRESTO: return { floor: sp(L.CARPET_BLUE, [0.8, 0.5, 0.45]), ceil: sp(L.CEILTILE, [1.0, 0.95, 0.88]), wall: sp(L.WALLPAPER, [0.9, 0.82, 0.62]), h: CEIL, base: true };
        case RT.CEO: return { floor: sp(L.WOOD_FLOOR, [0.7, 0.5, 0.36]), ceil: sp(L.CEILTILE), wall: sp(L.WOODSLAT, [0.8, 0.62, 0.48]), h: CEIL, base: true };
        case RT.TOOTS: return { floor: sp(L.WOOD_FLOOR, [0.95, 0.9, 0.8]), ceil: sp(L.SLATWIN, [0.75, 0.62, 0.48]), wall: sp(L.PANELS), h: 3.3, base: false };
        case RT.SECURITY: return { floor: sp(L.CARPET_GREY, [0.45, 0.46, 0.5]), ceil: sp(L.CEILTILE, [0.7, 0.72, 0.75]), wall: sp(L.PLASTER, [0.72, 0.74, 0.76]), h: CEIL, base: true };
        case RT.DOCK: return { floor: sp(L.CONCRETE, [0.62, 0.62, 0.6]), ceil: sp(L.CONCRETE, [0.72, 0.72, 0.7]), wall: sp(L.BRICK, [0.6, 0.62, 0.64]), h: CEIL, base: false };
        case RT.RADIO: return { floor: sp(L.CARPET_GREY, [0.55, 0.55, 0.6]), ceil: sp(L.CEILTILE, [0.45, 0.45, 0.48]), wall: sp(L.FABRIC, [0.3, 0.3, 0.33]), h: CEIL, base: false };
        case RT.CANTEEN: return { floor: sp(L.TILEDARK, [1.1, 1.05, 1.0]), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER, [0.95, 0.9, 0.82]), h: CEIL, base: true };
        case RT.KOFFIE: return { floor: sp(L.CONCRETE, [0.44, 0.45, 0.47]), ceil: sp(L.CEILMETAL, [1.1, 1.1, 1.08]), wall: sp(L.PLASTER, [0.97, 0.97, 0.95]), h: CEIL, base: false };
        case RT.ARCHIVE: return { floor: sp(L.CONCRETE), ceil: sp(L.CONCRETE, [0.8, 0.8, 0.8]), wall: sp(L.BRICK, [0.8, 0.8, 0.78]), h: CEIL, base: false };
        case RT.REGIE: return { floor: sp(L.CARPET_GREY, [0.6, 0.6, 0.65]), ceil: sp(L.BLACK), wall: sp(L.BLACK, [1.4, 1.4, 1.45]), h: CEIL, base: false };
        case RT.MESS: return { floor: sp(L.TILEDARK, [0.8, 0.8, 0.8]), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER, [0.95, 0.95, 0.93]), h: CEIL, base: false };
        case RT.LOUNGE: return { floor: sp(L.WOOD_FLOOR, [0.85, 0.8, 0.72]), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER, [0.97, 0.94, 0.88]), h: CEIL, base: true };
        case RT.PASSAGE: return { floor: sp(L.TILEDARK, [1.05, 1.0, 0.95]), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER, [0.9, 0.9, 0.86]), h: CEIL, base: false };
        case RT.EMPTY: return { floor: sp(L.CARPET_FLECK), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER, [0.88, 0.88, 0.84]), h: CEIL, base: true };
        default: return { floor: sp(L.CARPET_BLUE, [0.9, 0.85, 0.85]), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER, [0.93, 0.88, 0.82]), h: CEIL, base: true };
      }
    }
    case K.STAIR:
      return { floor: sp(L.LINO), ceil: null, wall: sp(L.PLASTER, [0.92, 0.92, 0.9]), h: p.f === FLOOR_MAX ? CEIL : H, base: false };
    case K.ELEV:
      return { floor: sp(L.TILEDARK, [0.5, 0.5, 0.5]), ceil: STEELS, wall: STEELS, h: 2.4, base: false };
    case K.GARAGE:
      return { floor: sp(L.CONCRETE, [0.6, 0.6, 0.58]), ceil: sp(L.CONCRETE, [0.75, 0.75, 0.74]), wall: sp(L.CONCRETE, [0.8, 0.8, 0.78]), h: 2.6, base: false };
    case K.ROOF:
      return { floor: sp(L.ROOF), ceil: null, wall: sp(L.CONCRETE, [0.75, 0.77, 0.8]), h: 2.9, base: false };
  }
  return { floor: sp(L.CONCRETE), ceil: null, wall: sp(L.CONCRETE), h: CEIL, base: false };
}

export function buildChunk(f: number, cx: number, cz: number) {
  const fur = getFurnished(f, cx, cz);
  const p = fur.plan;
  const ctx = new LightCtx(f, cx, cz);
  const b = new Builder(ctx);
  const y0 = f * H;
  const elevs: ElevOut[] = [];
  for (let i = 0; i < CH * CH; i++) {
    const gx = cx * CH + (i % CH), gz = cz * CH + ((i / CH) | 0);
    b.cell(gx, gz);
    emitCell(b, p, i, gx, gz, y0, elevs);
  }
  if (p.st.stair) buildStair(b, p);
  const gs = gardenStair(p.st);
  if (gs && f === gs.f0) buildGardenStair(b, gs, cx, cz);
  if (p.st.atrium?.kind === "hall" && f === p.st.atrium.f0) buildHall(b, p);
  if (p.st.atrium && TALL.has(p.st.atrium.kind) && p.st.atrium.kind !== "hall" && f === p.st.atrium.f0) buildTall(b, p);
  if (mazeAt(f, p.st)) buildSnake(b, p);
  for (const l of fur.lights) buildFixture(b, l);
  for (const pr of fur.props) buildProp(b, pr);
  return { built: b.finish(), elevs };
}

function emitCell(b: Builder, p: Plan, i: number, gx: number, gz: number, y0: number, elevs: ElevOut[]) {
  const k = p.kind[i]!;
  const f = p.f;
  const x0 = gx * CELL, z0 = gz * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
  if (k === K.SOLID) {
    if (f === FLOOR_MAX) {
      const e = [0, 1, 2, 3].map((d) => (kindAt(f, gx + DX[d]!, gz + DZ[d]!) === K.ROOF ? T : 0));
      b.aabox(x0 - e[2]!, y0 + 2.7, z0 - e[3]!, x1 + e[0]!, y0 + 2.9, z1 + e[1]!, { all: sp(L.CONCRETE, [0.7, 0.72, 0.75]), ny: null });
    }
    return;
  }
  if (k === K.COURT) return;
  if (k === K.VOID) {
    const a = p.st.atrium!;
    if (f === a.f1 && a.kind === "garden") {
      // glass roof: big luminous panels in a steel grid
      b.hrect(x0, z0, x1, z1, y0 + CEIL + 0.01, false, { layer: L.FROSTED, emit: [1.7, 1.66, 1.55], uv: [0, 0, 2, 2] }, 0);
      for (const o of [0, 1.5]) {
        b.aabox(x0, y0 + CEIL - 0.1, z0 + o - 0.04, x1, y0 + CEIL, z0 + o + 0.04, DARKTRIM);
        b.aabox(x0 + o - 0.04, y0 + CEIL - 0.1, z0, x0 + o + 0.04, y0 + CEIL, z1, DARKTRIM);
      }
    } else if (f === a.f1 && a.kind === "props") {
      // a plain steel deck over the rekwisieten
      b.hrect(x0, z0, x1, z1, y0 + CEIL + 0.01, false, sp(L.CEILMETAL, [0.55, 0.56, 0.58]), 1.5);
    } else if (f === a.f1 && a.kind === "lobby") {
      b.hrect(x0, z0, x1, z1, y0 + CEIL + 0.01, false, { layer: L.FROSTED, emit: [1.45, 1.5, 1.58], uv: [0, 0, 1, 1] }, 0);
      b.aabox(x0, y0 + CEIL - 0.08, z0 + 1.45, x1, y0 + CEIL, z0 + 1.55, DARKTRIM);
      b.aabox(x0 + 1.45, y0 + CEIL - 0.08, z0, x0 + 1.55, y0 + CEIL, z1, DARKTRIM);
    }
    return;
  }
  const s = surf(p, i);
  if (k !== K.STAIR) {
    const hall = p.st.atrium?.kind === "hall" && p.zone[i] === 2 ? p.st.atrium : null;
    if (hall) {
      // the court drawing spans the whole hall floor
      const X0 = (p.cx * CH + hall.x0 - 1) * CELL, Z0 = (p.cz * CH + hall.z0 - 1) * CELL;
      const W = (hall.x1 - hall.x0 + 3) * CELL, D = (hall.z1 - hall.z0 + 3) * CELL;
      b.hrect(x0, z0, x1, z1, y0, true, { layer: L.SPORTFLOOR, uv: [(x0 - X0) / W, (z0 - Z0) / D, (x1 - X0) / W, (z1 - Z0) / D] });
    } else {
      // a doorgang: the floor a few steps down
      const pr = k === K.ROOM ? p.rooms[p.room[i]!]! : null;
      b.hrect(x0, z0, x1, z1, y0 - (pr?.pass ? PASS_DROP : 0), true, s.floor);
      if (pr?.pass) buildPassageCell(b, p, pr, i, gx, gz, y0, s);
    }
    if (s.ceil && !(k === K.CORR && p.zone[i] === 2)) b.hrect(x0, z0, x1, z1, y0 + s.h, false, s.ceil);
  }
  if (k === K.GARAGE) {
    const row = ((gz % 4) + 4) % 4;
    if (row === 1 || row === 2) b.hrect(x0 - 0.05, z0, x0 + 0.05, z1, y0 + 0.004, true, sp(L.WHITE, [0.8, 0.8, 0.75]), 0);
    if (row === 0) b.hrect(x0, z0 + 1.4, x1, z0 + 1.6, y0 + 0.004, true, sp(L.WHITE, [0.8, 0.7, 0.2]), 0);
    if (gz % 2 === 0) b.aabox(x0, y0 + 2.2, z0 - 0.2, x1, y0 + 2.6, z0 + 0.2, { all: sp(L.CONCRETE, [0.7, 0.7, 0.68]), py: null }, 1.5);
  }
  for (let d = 0; d < 4; d++) emitSide(b, p, i, gx, gz, d, y0, s, elevs);
  if (k === K.ELEV) {
    const e = p.st.elevs.find((e) => e.e === i);
    if (e) buildCarInterior(b, gx, gz, y0, e.d);
  }
}

function emitSide(b: Builder, p: Plan, i: number, gx: number, gz: number, d: number, y0: number, s: Surf, elevs: ElevOut[]) {
  const f = p.f;
  const side = sideAt(f, gx, gz, d);
  const sk = side.sk;
  if (sk === SK.OPEN || sk === SK.NONE) return;
  const pd = (d + 1) % 4, nd = (d + 3) % 4;
  const axisX = d % 2 === 0;
  const Dn = axisX ? DX[d]! : DZ[d]!;
  const Pc = axisX ? DZ[pd]! : DX[pd]!;
  const cxw = (gx + 0.5) * CELL, czw = (gz + 0.5) * CELL;
  const cc = axisX ? cxw : czw, ca = axisX ? czw : cxw;
  const half = CELL / 2;
  const plane = (off: number) => cc + Dn * (half - off);
  const A = (sv: number) => ca + Pc * sv;
  const h = s.h;
  const wall = s.wall;
  const pt = (sv: number, off: number, y: number): V3 => (axisX ? [plane(off), y0 + y, A(sv)] : [A(sv), y0 + y, plane(off)]);
  const along: V3 = axisX ? [0, 0, Pc] : [Pc, 0, 0];

  const face = (s0: number, s1: number, ya: number, yb: number, spec: Spec = wall, off = T) => {
    if (s1 - s0 < 1e-3 || yb - ya < 1e-3) return;
    b.vrect(axisX, plane(off), A(s0), A(s1), y0 + ya, y0 + yb, -Dn, spec, 1.0, y0);
  };
  const jamb = (sv: number, ya: number, yb: number, facing: number, spec: Spec = wall) =>
    b.vrect(!axisX, A(sv), plane(T), plane(0), y0 + ya, y0 + yb, Pc * facing, spec, 0, y0);
  const hslab = (s0: number, s1: number, off0: number, off1: number, y: number, up: boolean, spec: Spec) => {
    const n0 = plane(off0), n1 = plane(off1), a0 = A(s0), a1 = A(s1);
    if (axisX) b.hrect(n0, a0, n1, a1, y0 + y, up, spec, 0);
    else b.hrect(a0, n0, a1, n1, y0 + y, up, spec, 0);
  };
  const seg = (s0: number, s1: number, off0 = 0, off1 = T) => {
    const n0 = plane(off0), n1 = plane(off1), a0 = A(s0), a1 = A(s1);
    if (axisX) b.solid(n0, a0, n1, a1);
    else b.solid(a0, n0, a1, n1);
  };
  // box in side space. front = face looking into this cell, back = the other way
  const frontKey = axisX ? (Dn > 0 ? "nx" : "px") : Dn > 0 ? "nz" : "pz";
  const backKey = axisX ? (Dn > 0 ? "px" : "nx") : Dn > 0 ? "pz" : "nz";
  const sideKeys = axisX ? ["pz", "nz"] : ["px", "nx"];
  const sbox = (sa: number, sb: number, oa: number, ob: number, ya: number, yb: number, spec: Spec, front?: Spec, back?: Spec, bb: Builder = b, flatSide?: Spec) => {
    const n0 = plane(oa), n1 = plane(ob), a0 = A(sa), a1 = A(sb);
    const S: Record<string, Spec> = { all: spec };
    if (front) S[frontKey] = front;
    if (back !== undefined) S[backKey] = back;
    if (flatSide) for (const k of sideKeys) S[k] = flatSide;
    if (axisX) bb.aabox(Math.min(n0, n1), y0 + ya, Math.min(a0, a1), Math.max(n0, n1), y0 + yb, Math.max(a0, a1), S as any);
    else bb.aabox(Math.min(a0, a1), y0 + ya, Math.min(n0, n1), Math.max(a0, a1), y0 + yb, Math.max(n0, n1), S as any);
  };
  const ext = (ld: number) => {
    const sl = sideAt(f, gx, gz, ld);
    if (sl.sk !== SK.OPEN) return half - T;
    const sn = sideAt(f, gx + DX[ld]!, gz + DZ[ld]!, d);
    return sn.sk === SK.OPEN ? half + T : half;
  };
  const s0 = -ext(nd), s1 = ext(pd);
  const base = (a: number, c: number) => {
    if (s.base) b.vrect(axisX, plane(T + 0.012), A(a), A(c), y0, y0 + 0.08, -Dn, sp(L.WHITE, [0.14, 0.14, 0.15]), 0, y0);
  };

  switch (sk) {
    case SK.WALL:
    case SK.PARAPET: {
      if (sk === SK.PARAPET) {
        face(s0, s1, 0, 1.1);
        hslab(s0, s1, T, 0, 1.1, true, wall);
        b.vrect(axisX, plane(0), A(s0), A(s1), y0 - 0.05, y0 + 1.1, Dn, wall, 0, y0);
        seg(s0, s1);
        break;
      }
      face(s0, s1, 0, h);
      base(s0, s1);
      seg(s0, s1);
      break;
    }
    case SK.DOOR: {
      const door = side.door!;
      const w = door.w;
      const isElev = door.kind === "elev";
      const jspec = isElev ? STEELS : wall;
      const dh = DOOR_H;
      face(s0, -w / 2, 0, h);
      face(w / 2, s1, 0, h);
      face(-w / 2, w / 2, dh, h);
      jamb(-w / 2, 0, dh, 1, jspec);
      jamb(w / 2, 0, dh, -1, jspec);
      hslab(-w / 2, w / 2, T, 0, dh, false, jspec);
      base(s0, -w / 2);
      base(w / 2, s1);
      seg(s0, -w / 2);
      seg(w / 2, s1);
      const k = p.kind[i];
      if (isElev) {
        if (k === K.ELEV) {
          // inside the car: buttons and floor indicator
          sbox(w / 2 + 0.12, w / 2 + 0.34, T - 0.005, T + 0.025, 0.95, 1.45, STEELS, { layer: L.DESK_BUTTONS, emit: [0.8, 0.75, 0.6], uv: [0, 0, 0.4, 1] });
          sbox(-0.22, 0.22, T - 0.005, T + 0.02, dh + 0.06, dh + 0.24, DARKTRIM, numberSpec(f, [1.6, 0.7, 0.25]));
          // mirror + handrail on the back wall happen in the car interior pass below
        } else {
          sbox(-w / 2 - 0.12, -w / 2, T - 0.035, T + 0.001, 0, dh + 0.12, STEELS);
          sbox(w / 2, w / 2 + 0.12, T - 0.035, T + 0.001, 0, dh + 0.12, STEELS);
          sbox(-w / 2, w / 2, T - 0.035, T + 0.001, dh, dh + 0.12, STEELS);
          sbox(-0.2, 0.2, T - 0.03, T + 0.001, dh + 0.24, dh + 0.42, DARKTRIM, numberSpec(f, [1.6, 0.7, 0.25]));
          sbox(w / 2 + 0.22, w / 2 + 0.34, T - 0.03, T + 0.001, 1.02, 1.32, STEELS, { layer: L.WHITE, emit: [1.4, 1.0, 0.55] });
          // lift doors are animated on the main thread
          const st = getStructure(p.cx, p.cz);
          const bankIdx = st.elevs.findIndex((e) => e.c === i);
          const u0 = bankIdx === 1 ? 0.5 : 0;
          const cg = [gx + DX[d]!, gz + DZ[d]!];
          const mk = (sa: number, sb: number, ua: number, ub: number) => {
            // corridor side lit from the corridor, inner side lit from the car
            const bb = new Builder(b.ctx).cell(gx, gz);
            sbox(sa, sb, -0.02, 0.025, 0, dh, STEELS, { layer: L.ELEV_DOOR, uv: [ua, 0, ub, 1] }, null as unknown as Spec, bb);
            bb.cell(cg[0]!, cg[1]!);
            bb.vrect(axisX, plane(-0.02), A(sa), A(sb), y0, y0 + dh, Dn, STEELS, 0, y0);
            return bb.finish();
          };
          elevs.push({
            gx: cg[0]!, gz: cg[1]!, d,
            x: axisX ? plane(0) : A(0), z: axisX ? A(0) : plane(0),
            px: axisX ? 0 : Pc, pz: axisX ? Pc : 0,
            panels: [mk(-w / 2 - 0.01, 0.005, u0, u0 + 0.25), mk(-0.005, w / 2 + 0.01, u0 + 0.25, u0 + 0.5)],
          });
        }
        break;
      }
      // trims
      // (de koffiekamer: lime green doors and frames)
      const green = door.kind === "green";
      const trim = door.kind === "fire" ? sp(L.WHITE, [0.3, 0.32, 0.33]) : green ? sp(L.WHITE, [0.42, 0.7, 0.08]) : sp(L.WHITE, [0.55, 0.52, 0.48]);
      sbox(-w / 2 - 0.06, -w / 2, T - 0.02, T + 0.001, 0, dh + 0.06, trim);
      sbox(w / 2, w / 2 + 0.06, T - 0.02, T + 0.001, 0, dh + 0.06, trim);
      sbox(-w / 2, w / 2, T - 0.02, T + 0.001, dh, dh + 0.06, trim);
      if (door.owner === i) {
        const dspec: Spec = door.kind === "fire" ? { layer: L.DOOR_STEEL, uv: [0, 0, 1, 1] } : green ? sp(L.WHITE, [0.48, 0.76, 0.1]) : { layer: L.DOOR_WOOD, uv: [0, 0, 1, 1] };
        const edge = green ? sp(L.WHITE, [0.36, 0.6, 0.06]) : DARKTRIM;
        const leaves = door.kind === "double" || green ? [[-w / 2, 0, -1], [0, w / 2, 1]] : [[-w / 2, w / 2, 1]];
        for (const [la, lb, hinge] of leaves as [number, number, number][]) {
          const lw = lb - la;
          if (door.kind === "glass") {
            if (!door.open) {
              sbox(la, lb, -0.025, 0.025, 0, dh, ALU, undefined, undefined, b);
              b.glass(pt(la + 0.06, 0, 0.1), [along[0] * (lw - 0.12), 0, along[2] * (lw - 0.12)], [0, dh - 0.2, 0], [0.75, 0.86, 0.86, 0.2]);
            } else {
              const hs = hinge > 0 ? lb : la;
              sbox(hs - hinge * 0.05, hs, T + 0.02, T + lw, 0, dh, ALU);
            }
            continue;
          }
          if (!door.open) {
            sbox(la + 0.005, lb - 0.005, -0.022, 0.022, 0, dh - 0.01, edge, dspec, dspec);
            const hx = hinge > 0 ? la + 0.1 : lb - 0.1;
            sbox(hx - 0.06, hx + 0.06, -0.06, 0.06, 1.0, 1.035, STEELS);
            seg(la, lb, -0.03, 0.03);
          } else {
            const hs = hinge > 0 ? lb : la;
            const sa = hinge > 0 ? hs - 0.045 : hs + 0.005;
            sbox(sa, sa + 0.04, T + 0.02, T + lw, 0, dh - 0.01, edge, undefined, undefined, b, dspec);
          }
        }
      }
      break;
    }
    case SK.GLASS: {
      const door = side.door!;
      if (door.owner !== i) break;
      const top = h;
      const fr = ALU;
      const e = half - T - 0.05;
      sbox(-half, -e, -T - 0.01, T + 0.01, 0, top, fr);
      sbox(e, half, -T - 0.01, T + 0.01, 0, top, fr);
      sbox(-e, e, -0.04, 0.04, 0, 0.1, fr);
      sbox(-e, e, -0.04, 0.04, top - 0.08, top, fr);
      const hasDoor = door.w > 0;
      for (const m of [-0.5, 0.5]) sbox(m - 0.03, m + 0.03, -0.04, 0.04, 0.1, top - 0.08, fr);
      const G: [number, number, number, number] = [0.72, 0.84, 0.86, 0.14];
      const FROST: [number, number, number, number] = [0.9, 0.95, 0.96, 0.5];
      const pane = (a0: number, a1: number, ya: number, yb: number) => {
        b.glass(pt(a0, 0, ya), [along[0] * (a1 - a0), 0, along[2] * (a1 - a0)], [0, yb - ya, 0], G);
        if (ya < 1.0 && yb > 1.35) b.glass(pt(a0, -0.004, 1.0), [along[0] * (a1 - a0), 0, along[2] * (a1 - a0)], [0, 0.35, 0], FROST);
      };
      pane(-e, -0.53, 0.1, top - 0.08);
      pane(0.53, e, 0.1, top - 0.08);
      if (!hasDoor) pane(-0.47, 0.47, 0.1, top - 0.08);
      else {
        sbox(-0.47, 0.47, -0.04, 0.04, DOOR_H, DOOR_H + 0.06, fr);
        pane(-0.47, 0.47, DOOR_H + 0.06, top - 0.08);
        if (!door.open) {
          sbox(-0.47, 0.47, -0.025, 0.025, 0, 0.08, fr);
          pane(-0.44, 0.44, 0.1, DOOR_H - 0.04);
          sbox(0.3, 0.34, -0.08, 0.08, 0.9, 1.1, STEELS);
        } else {
          sbox(0.41, 0.46, T + 0.02, T + 0.95, 0, DOOR_H - 0.02, fr);
        }
      }
      if (hasDoor && door.open) {
        seg(-half, -0.5, -0.06, 0.06);
        seg(0.5, half, -0.06, 0.06);
      } else seg(-half, half, -0.06, 0.06);
      break;
    }
    case SK.WINDOW: {
      if (p.st.mid || p.st.special === "park") {
        // de middengang: floor-to-ceiling glass, slim mullions, a low wooden rail
        const mull = sp(L.WHITE, [0.2, 0.2, 0.21]);
        const e0 = -half, e1 = half;
        for (const m of [e0, -0.75 + 0.0, 0.75, e1]) sbox(Math.max(e0, m - 0.03), Math.min(e1, m + 0.03), 0.0, 0.08, 0, h, mull);
        sbox(e0, e1, 0.0, 0.08, 0, 0.1, mull);
        sbox(e0, e1, 0.0, 0.1, h - 0.12, h, mull);
        sbox(e0, e1, 0.1, 0.2, 0.86, 0.94, sp(L.WOOD_FLOOR, [0.85, 0.65, 0.42]));
        b.glass(pt(e0, 0.04, 0.1), [along[0] * (e1 - e0), 0, along[2] * (e1 - e0)], [0, h - 0.22, 0], [0.75, 0.85, 0.88, 0.07]);
        seg(e0, e1, 0, 0.12);
        break;
      }
      const wa = -1.1, wb = 1.1, sill = 0.9, head = Math.min(2.35, h - 0.2);
      face(s0, wa, 0, h);
      face(wb, s1, 0, h);
      face(wa, wb, 0, sill);
      face(wa, wb, head, h);
      jamb(wa, sill, head, 1);
      jamb(wb, sill, head, -1);
      hslab(wa, wb, T, 0, head, false, wall);
      sbox(wa - 0.05, wb + 0.05, -0.0, T + 0.07, sill - 0.035, sill, sp(L.WHITE, [0.8, 0.8, 0.78]));
      const fr = sp(L.WHITE, [0.25, 0.25, 0.26]);
      sbox(wa, wb, 0.02, 0.08, head - 0.05, head, fr);
      sbox(wa, wa + 0.05, 0.02, 0.08, sill, head, fr);
      sbox(wb - 0.05, wb, 0.02, 0.08, sill, head, fr);
      sbox(-0.03, 0.03, 0.02, 0.08, sill, head, fr);
      b.glass(pt(wa, 0.05, sill), [along[0] * (wb - wa), 0, along[2] * (wb - wa)], [0, head - sill, 0], [0.7, 0.8, 0.86, 0.1]);
      base(s0, wa);
      base(wb, s1);
      seg(s0, s1);
      break;
    }
    case SK.RAIL: {
      const ak = p.st.atrium?.kind;
      if (ak === "marconi" && p.zone[i] === 1) {
        // the gallery of Studio Marconi: glass panels between steel posts, open where the stair lands
        const gs = gardenStair(p.st)!;
        b.vrect(axisX, plane(0), A(-half), A(half), y0 - (H - CEIL), y0, Dn, sp(L.PANELS, [0.9, 0.9, 0.9]), 0, y0);
        const segs: [number, number][] = [];
        if (axisX === gs.alongX && Math.abs(plane(0) - gs.b) < 0.01) {
          const g0 = (gs.pc - gs.half - 0.08 - ca) * Pc, g1 = (gs.pc + gs.half + 0.08 - ca) * Pc;
          const lo = Math.min(g0, g1), hi = Math.max(g0, g1);
          if (lo > -half) segs.push([-half, lo]);
          if (hi < half) segs.push([hi, half]);
        } else segs.push([-half, half]);
        const post = sp(L.STEEL, [0.8, 0.8, 0.82]);
        for (const [a0, a1] of segs) {
          for (let m = a0 + 0.04; m <= a1; m += Math.max(0.6, (a1 - a0) / Math.max(1, Math.round((a1 - a0) / 1.0)))) sbox(m - 0.02, m + 0.02, 0.02, 0.06, 0, 1.05, post);
          sbox(a0, a1, 0.0, 0.08, 1.02, 1.07, post);
          b.glass(pt(a0, 0.04, 0.08), [along[0] * (a1 - a0), 0, along[2] * (a1 - a0)], [0, 0.9, 0], [0.8, 0.88, 0.9, 0.16]);
          seg(a0, a1, 0, 0.1);
        }
        break;
      }
      if (ak && TALL.has(ak)) {
        // a window from the corridor down into the sporthal (or the tower, the studios, Marconi)
        face(s0, s1, 0, 0.95);
        face(s0, s1, h - 0.15, h);
        const fr = sp(L.WHITE, [0.25, 0.25, 0.26]);
        sbox(s0, s1, 0.02, 0.1, 0.95, 1.0, fr);
        for (const m of [-1.45, 0, 1.45]) sbox(m - 0.03, m + 0.03, 0.02, 0.1, 1.0, h - 0.15, fr);
        b.glass(pt(-half, 0.06, 1.0), [along[0] * CELL, 0, along[2] * CELL], [0, h - 1.15, 0], [0.7, 0.8, 0.85, 0.1]);
        base(s0, s1);
        seg(s0, s1);
        break;
      }
      const gs = gardenStair(p.st);
      b.vrect(axisX, plane(0), A(-half), A(half), y0 - (H - CEIL), y0, Dn, sp(L.PLASTER, [0.85, 0.85, 0.83]), 0, y0);
      if (!gs) {
        const rs = BLACKSTEEL;
        for (const m of [-1.45, -0.5, 0.5, 1.45]) sbox(m - 0.025, m + 0.025, 0.03, 0.08, 0, 1.05, rs);
        sbox(-half, half, 0.02, 0.09, 1.02, 1.07, rs);
        for (const y of [0.3, 0.55, 0.8]) sbox(-half, half, 0.045, 0.065, y, y + 0.02, rs);
        seg(-half, half, 0, 0.1);
        break;
      }
      // plantentuin: white parapet, steel posts, dark handrail; open where the stair lands
      const segs: [number, number][] = [];
      const topEdge = f === gs.f0 + 1 && axisX === gs.alongX && Math.abs(plane(0) - gs.b) < 0.01;
      if (topEdge) {
        const g0 = (gs.pc - gs.half - 0.08 - ca) * Pc, g1 = (gs.pc + gs.half + 0.08 - ca) * Pc;
        const lo = Math.min(g0, g1), hi = Math.max(g0, g1);
        if (lo > -half) segs.push([-half, lo]);
        if (hi < half) segs.push([hi, half]);
      } else segs.push([-half, half]);
      const white = sp(L.PLASTER, [0.95, 0.95, 0.93]);
      for (const [a0, a1] of segs) {
        sbox(a0, a1, 0, 0.12, 0, 0.92, white);
        sbox(a0, a1, -0.01, 0.13, 0.92, 0.95, sp(L.STEEL, [0.8, 0.8, 0.82]));
        for (let m = a0 + 0.1; m < a1; m += 0.9) sbox(m - 0.015, m + 0.015, 0.05, 0.08, 0.95, 1.12, sp(L.STEEL, [0.85, 0.86, 0.88]));
        sbox(a0, a1, 0.03, 0.1, 1.1, 1.16, sp(L.WHITE, [0.12, 0.1, 0.09]));
        seg(a0, a1, 0, 0.13);
      }
      break;
    }
  }
}

function numberSpec(f: number, emit: RGB): Spec {
  const n = f - FLOOR_MIN;
  const u0 = (n % 4) / 4, v0 = 1 - (Math.floor(n / 4) + 1) / 4;
  return { layer: L.NUMBERS, emit, uv: [u0, v0, u0 + 0.25, v0 + 0.25] };
}

function buildStair(b: Builder, p: Plan) {
  const sf = stairFrame(p.cx, p.cz)!;
  const f = p.f;
  const y0 = f * H;
  const D3: V3 = [sf.Dx, 0, sf.Dz], P3: V3 = [sf.Px, 0, sf.Pz];
  const W = (u: number, v: number, y: number): V3 => [sf.ox + sf.Dx * u + sf.Px * v, y0 + y, sf.oz + sf.Dz * u + sf.Pz * v];
  const cellFor = (u: number) => (u < CELL ? b.cell(sf.ax, sf.az) : b.cell(sf.ax + sf.Dx, sf.az + sf.Dz));
  const box = (u0: number, u1: number, v0: number, v1: number, ya: number, yb: number, s: Parameters<Builder["obox"]>[5]) => {
    cellFor((u0 + u1) / 2);
    b.obox(W((u0 + u1) / 2, (v0 + v1) / 2, (ya + yb) / 2), D3, UP, P3, [(u1 - u0) / 2, (yb - ya) / 2, (v1 - v0) / 2], s);
  };
  const solid = (u0: number, u1: number, v0: number, v1: number) => {
    const a = W(u0, v0, 0), c = W(u1, v1, 0);
    b.solid(a[0], a[2], c[0], c[2]);
  };
  const rail = (u0: number, ya: number, u1: number, yb: number, v: number, s: Spec) => {
    const du = u1 - u0, dy = yb - ya;
    const len = Math.hypot(du, dy);
    const a: V3 = [(sf.Dx * du) / len, dy / len, (sf.Dz * du) / len];
    const ay: V3 = [(-sf.Dx * dy) / len, du / len, (-sf.Dz * dy) / len];
    cellFor((u0 + u1) / 2);
    b.obox(W((u0 + u1) / 2, v, (ya + yb) / 2), a, ay, P3, [len / 2, 0.03, 0.035], s);
  };
  const U0 = T, U1 = ST_U1, U2 = ST_U2, U3 = 2 * CELL - T, V0 = T, VM = ST_VM, V1 = CELL - T;
  const top = f === FLOOR_MAX, bottom = f === FLOOR_MIN;
  const LINO = sp(L.LINO);
  const UNDER = sp(L.PLASTER, [0.85, 0.85, 0.83]);
  const NOSE = sp(L.STEEL, [0.9, 0.9, 0.9]);
  const WOODR = sp(L.WOOD_FLOOR, [0.7, 0.45, 0.28]);
  const BAL = sp(L.WHITE, [0.85, 0.85, 0.83]);
  const n = 11, r = ST_HALF / n, run = (U2 - U1) / n;

  box(0, U1, 0, CELL, -0.22, 0, { all: UNDER, py: LINO });
  if (bottom) box(U1, 2 * CELL, 0, CELL, -0.22, 0, { all: UNDER, py: sp(L.CONCRETE, [0.6, 0.6, 0.6]) });
  if (!top) {
    for (let s = 0; s < n; s++) {
      const ua = U1 + s * run, yt = (s + 1) * r;
      box(ua, ua + run, V0, VM - 0.03, yt - r - 0.14, yt, { all: UNDER, py: LINO });
      box(ua, ua + 0.045, V0, VM - 0.03, yt - 0.025, yt + 0.004, NOSE);
    }
    box(U2, 2 * CELL, 0, CELL, ST_HALF - 0.22, ST_HALF, { all: UNDER, py: LINO });
    for (let s = 0; s < n; s++) {
      const ub = U2 - s * run, yt = ST_HALF + (s + 1) * r;
      box(ub - run, ub, VM + 0.03, V1, yt - r - 0.14, yt, { all: UNDER, py: LINO });
      box(ub - 0.045, ub, VM + 0.03, V1, yt - 0.025, yt + 0.004, NOSE);
    }
    rail(U1 - 0.1, 0.92, U2, ST_HALF + 0.92, VM - 0.06, WOODR);
    rail(U2, ST_HALF + 0.92, U1 - 0.1, H + 0.92, VM + 0.06, WOODR);
    for (let k = 0; k < 6; k++) {
      const u = U1 + ((k + 0.5) / 6) * (U2 - U1);
      const y1 = ((u - U1) / (U2 - U1)) * ST_HALF;
      box(u - 0.015, u + 0.015, VM - 0.075, VM - 0.045, y1, y1 + 0.92, BAL);
      const y2 = ST_HALF + ((U2 - u) / (U2 - U1)) * ST_HALF;
      box(u - 0.015, u + 0.015, VM + 0.045, VM + 0.075, y2, y2 + 0.92, BAL);
    }
    // the white steel post at the turn
    box(U2 - 0.03, U2 + 0.03, VM - 0.08, VM + 0.08, 0, ST_HALF + 0.95, BAL);
    solid(U1 - 0.1, U2, VM - 0.08, VM + 0.08);
  } else {
    // roof level: guard rail over the flight below, housing ceiling and roof cap
    box(U1 - 0.03, U1 + 0.03, V0, VM + 0.05, 0.98, 1.04, BLACKSTEEL);
    for (const v of [0.3, 0.8, 1.3]) box(U1 - 0.02, U1 + 0.02, v - 0.02, v + 0.02, 0, 1.0, BLACKSTEEL);
    solid(U1 - 0.05, U1 + 0.05, 0, VM + 0.05);
    box(-T, 2 * CELL + T, -T, CELL + T, CEIL, 2.9, { all: sp(L.CONCRETE, [0.7, 0.72, 0.75]), ny: sp(L.PLASTER, [0.85, 0.85, 0.83]) });
  }
  if (bottom) {
    box(U1 - 0.05, U1, VM, V1, 0, ST_HALF, sp(L.PLASTER, [0.8, 0.8, 0.78]));
    solid(U1 - 0.05, U1, VM, V1);
  }
  // painted floor number on the landing wall
  // now and then the landing insists on a floor that isn't this one
  const odd = f > FLOOR_MIN && f < FLOOR_MAX && hash(502, f, p.cx, p.cz) % 100 < 8;
  const n2 = odd ? [14, 15, (hash(503, f, p.cx, p.cz) % 13)][hash(504, f, p.cx, p.cz) % 3]! : f - FLOOR_MIN;
  const u0 = (n2 % 4) / 4, v0 = 1 - (Math.floor(n2 / 4) + 1) / 4;
  box(0.35, 1.05, V0, V0 + 0.012, 1.15, 1.85, { all: sp(L.WHITE, [0.9, 0.9, 0.88]), pz: { layer: L.NUMBERS, uv: [u0, v0, u0 + 0.25, v0 + 0.25] } });
}

// Elevator car interior dressing (mirror, rail) - called per ELEV cell.
export function buildCarInterior(b: Builder, gx: number, gz: number, y0: number, d: number) {
  const back = d; // wall opposite the door, seen from inside the car
  const cxw = (gx + 0.5) * CELL, czw = (gz + 0.5) * CELL;
  const nx = DX[back]!, nz = DZ[back]!;
  const px = DX[(back + 1) % 4]!, pz = DZ[(back + 1) % 4]!;
  const wx = cxw + nx * (CELL / 2 - T - 0.01), wz = czw + nz * (CELL / 2 - T - 0.01);
  b.cell(gx, gz);
  b.obox([wx, y0 + 1.5, wz], [px, 0, pz], UP, [nx, 0, nz], [1.1, 0.7, 0.005], { all: sp(L.STEEL, [1.3, 1.35, 1.4]) });
  b.obox([wx - nx * 0.06, y0 + 0.95, wz - nz * 0.06], [px, 0, pz], UP, [nx, 0, nz], [1.2, 0.025, 0.025], STEELS);
}

// Courtyard facades + ground, independent of floor.
export function buildExterior(cx: number, cz: number): Built | null {
  const st = getStructure(cx, cz);
  if (st.mid || st.special === "park") return buildMidExterior(cx, cz);
  const c = st.court;
  if (!c) return null;
  const b = new Builder(new LightCtx(0, cx, cz, "outdoor"));
  const X0 = (cx * CH + c.x0) * CELL, X1 = (cx * CH + c.x1 + 1) * CELL;
  const Z0 = (cz * CH + c.z0) * CELL, Z1 = (cz * CH + c.z1 + 1) * CELL;
  const top = FLOOR_MAX * H;
  b.cell(cx * CH + c.x0, cz * CH + c.z0);
  const fac = (x: number) => ({ layer: L.FACADE, uv: [0, 0, 0, 0] as [number, number, number, number], x });
  const wallZ = (z: number, n: number) => {
    const s = fac(0);
    s.uv = [X0 / CELL, 0, X1 / CELL, top / H];
    b.vrect(false, z, X0, X1, 0, top, n, s, 0);
  };
  const wallX = (x: number, n: number) => {
    const s = fac(0);
    s.uv = [Z0 / CELL, 0, Z1 / CELL, top / H];
    b.vrect(true, x, Z0, Z1, 0, top, n, s, 0);
  };
  wallZ(Z0, 1);
  wallZ(Z1, -1);
  wallX(X0, 1);
  wallX(X1, -1);
  b.hrect(X0, Z0, X1, Z1, 0, true, sp(L.GRASS), 0);
  b.hrect(X0, Z0, X1, Z0 + 0.6, 0.01, true, sp(L.GRAVEL), 0);
  b.hrect(X0, Z1 - 0.6, X1, Z1, 0.01, true, sp(L.GRAVEL), 0);
  return b.finish();
}

// The floating stair of the plantentuin: open glass-blue treads between two
// dark steel stringers, handrails on posts.
function buildGardenStair(b: Builder, g: GardenStair, cx: number, cz: number) {
  const y0 = g.f0 * H;
  const P = (s: number, lat: number, y: number): V3 => (g.alongX ? [s, y0 + y, g.pc + lat] : [g.pc + lat, y0 + y, s]);
  const ax: V3 = g.alongX ? [1, 0, 0] : [0, 0, 1];
  const lx: V3 = g.alongX ? [0, 0, 1] : [1, 0, 0];
  const cellOf = (s: number) => {
    const p = P(s, 0, 0);
    b.cell(Math.floor(p[0] / CELL), Math.floor(p[2] / CELL));
  };
  const beam = (s0: number, y0b: number, s1: number, y1b: number, lat: number, hw: number, hh: number, spec: Spec) => {
    const ds = s1 - s0, dy = y1b - y0b, len = Math.hypot(ds, dy);
    const a: V3 = [(ax[0] * ds) / len, dy / len, (ax[2] * ds) / len];
    const up: V3 = [(-ax[0] * dy) / len, ds / len, (-ax[2] * dy) / len];
    cellOf((s0 + s1) / 2);
    const c = P((s0 + s1) / 2, lat, (y0b + y1b) / 2);
    b.obox(c, a, up, lx, [len / 2, hh, hw], spec);
  };
  const n = 20, rise = H / n, run = g.run / n;
  const marconi = getStructure(cx, cz).atrium?.kind === "marconi";
  const tread = marconi ? sp(L.STEEL, [0.7, 0.72, 0.75]) : sp(L.WHITE, [0.55, 0.78, 0.82]);
  const steel = sp(L.WHITE, [0.1, 0.09, 0.09]);
  for (let i = 0; i < n; i++) {
    const s0 = g.sb + i * run;
    cellOf(s0 + run / 2);
    const c = P(s0 + run / 2, 0, (i + 1) * rise - 0.025);
    b.obox(c, ax, UP, lx, [run / 2 + 0.01, 0.025, g.half], { all: tread });
  }
  for (const side of [-1, 1]) {
    beam(g.sb, -0.2, g.b, H - 0.15, side * (g.half + 0.04), 0.03, 0.14, steel);
    beam(g.sb - 0.1, 1.0, g.b, H + 1.0, side * (g.half + 0.06), 0.025, 0.03, steel);
    for (let k = 0; k <= 5; k++) {
      const s = g.sb + 0.3 + (k / 5) * (g.run - 0.6);
      const y = ((s - g.sb) / g.run) * H;
      cellOf(s);
      b.obox(P(s, side * (g.half + 0.06), y + 0.5), ax, UP, lx, [0.012, 0.5, 0.012], { all: sp(L.STEEL, [0.85, 0.86, 0.88]) });
    }
  }
}

// Outside the middengang / parkeertoren: grass, the facades of the buildings
// around the gap, and every floor of the glass links and the parking deck.
function buildMidExterior(cx: number, cz: number): Built {
  const st = getStructure(cx, cz);
  const b = new Builder(new LightCtx(0, cx, cz, "outdoor"));
  const X0 = cx * CHUNK, Z0 = cz * CHUNK;
  const top = FLOOR_MAX * H;
  const dk = st.deck;
  const isDeck = (x: number, z: number) => !!dk && x >= dk.x0 && x <= dk.x1 && z >= dk.z0 && z <= dk.z1;
  const solid = (x: number, z: number) => x >= 0 && z >= 0 && x < CH && z < CH && (st.corr[z * CH + x] === 1 || isDeck(x, z));
  const slab = sp(L.CONCRETE, [0.82, 0.82, 0.8]);
  b.cell(cx * CH, cz * CH);
  for (let z = 0; z < CH; z++)
    for (let x = 0; x < CH; x++) {
      const gx = X0 + x * CELL, gz = Z0 + z * CELL;
      if (!solid(x, z)) {
        b.hrect(gx, gz, gx + CELL, gz + CELL, 0, true, sp(L.GRASS), 0);
        continue;
      }
      if (st.mid && MID_FLOOR > 0) {
        // the middengang is a bridge: grass underneath, and a concrete pillar every other cell
        b.hrect(gx, gz, gx + CELL, gz + CELL, 0, true, sp(L.GRASS), 0);
        const row = st.corr[z * CH + x - 1] || st.corr[z * CH + x + 1]; // part of the long run (east-west)
        const long = z === 5 || z === 6;
        if (long ? z === 5 && ((cx * CH + x) & 1) === 0 : ((cz * CH + z) & 1) === 0 && !row) {
          const px = long ? gx + CELL / 2 : gx + CELL / 2, pz = long ? gz + CELL : gz + CELL / 2;
          b.aabox(px - 0.35, 0, pz - 0.35, px + 0.35, MID_FLOOR * H - (H - CEIL) + 0.02, pz + 0.35, { all: slab, py: null, ny: null }, 1.5);
        }
      }
      const deck = isDeck(x, z);
      // slab band per floor, filling the plenum between one ceiling and the next floor
      // (the middengang is a single-storey bridge: its floor and its roof)
      for (let f = 1; f <= FLOOR_MAX; f++)
        if (!st.mid || f === MID_FLOOR || f === MID_FLOOR + 1) b.aabox(gx, f * H - (deck ? 1.0 : H - CEIL) + 0.02, gz, gx + CELL, f * H - 0.03, gz + CELL, { all: slab }, 0);
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d]!, nz = z + DZ[d]!;
        if (nx < 0 || nz < 0 || nx >= CH || nz >= CH || solid(nx, nz)) continue;
        const axisX = d % 2 === 0;
        const px = axisX ? gx + (DX[d]! > 0 ? CELL : 0) : gx;
        const pz = axisX ? gz : gz + (DZ[d]! > 0 ? CELL : 0);
        const out = 0.03 * (axisX ? DX[d]! : DZ[d]!);
        for (let f = 0; f < FLOOR_MAX; f++) {
          if (st.mid && f !== MID_FLOOR) continue;
          const y0 = f * H;
          if (deck) {
            // parapet of the open parking deck
            if (axisX) b.aabox(px + out - 0.1, y0, pz, px + out + 0.1, y0 + 1.1, pz + CELL, slab, 0);
            else b.aabox(px, y0, pz + out - 0.1, px + CELL, y0 + 1.1, pz + out + 0.1, slab, 0);
            continue;
          }
          // the curtain wall seen from outside (loaded floors draw their own on top)
          if (axisX) b.glass([px + out, y0 + 0.1, pz], [0, 0, CELL], [0, CEIL - 0.2, 0], [0.7, 0.8, 0.85, 0.1]);
          else b.glass([px, y0 + 0.1, pz + out], [CELL, 0, 0], [0, CEIL - 0.2, 0], [0.7, 0.8, 0.85, 0.1]);
          for (const t of [0, 0.5, 1]) {
            const cx2 = axisX ? px + out : px + t * CELL, cz2 = axisX ? pz + t * CELL : pz + out;
            b.aabox(cx2 - 0.035, y0, cz2 - 0.035, cx2 + 0.035, y0 + CEIL, cz2 + 0.035, sp(L.WHITE, [0.2, 0.2, 0.21]), 0);
          }
        }
      }
    }
  // facades of the buildings around the open gap, one cell at a time
  for (let k = 0; k < CH; k++)
    for (const [x, z, d] of [[k, 0, 3], [k, CH - 1, 1], [0, k, 2], [CH - 1, k, 0]] as const) {
      if (st.mid && d % 2 === 0) continue; // the middengang continues east and west
      // where a link of the middengang meets the building, the facade only opens on that floor
      const spans: [number, number][] = !solid(x, z) ? [[0, top]] : st.mid ? [[0, MID_FLOOR * H], [(MID_FLOOR + 1) * H, top]] : [];
      const gx = X0 + x * CELL, gz = Z0 + z * CELL;
      for (const [ya, yb] of spans) {
        const fac = (a0: number, a1: number) => ({ layer: L.FACADE, uv: [a0 / CELL, ya / H, a1 / CELL, yb / H] as [number, number, number, number] });
        if (d === 3) b.vrect(false, gz, gx, gx + CELL, ya, yb, 1, fac(gx, gx + CELL), 0);
        else if (d === 1) b.vrect(false, gz + CELL, gx, gx + CELL, ya, yb, -1, fac(gx, gx + CELL), 0);
        else if (d === 2) b.vrect(true, gx, gz, gz + CELL, ya, yb, 1, fac(gz, gz + CELL), 0);
        else b.vrect(true, gx + CELL, gz, gz + CELL, ya, yb, -1, fac(gz, gz + CELL), 0);
      }
    }
  return b.finish();
}

// De sporthal: glulam arches carrying a barrel vault over the whole court,
// glowing slatted windows in the gable ends, a long ventilation duct.
function buildHall(b: Builder, p: Plan) {
  const a = p.st.atrium!;
  const y0 = a.f0 * H;
  const X0 = (p.cx * CH + a.x0 - 1) * CELL + T, X1 = (p.cx * CH + a.x1 + 2) * CELL - T;
  const Z0 = (p.cz * CH + a.z0 - 1) * CELL + T, Z1 = (p.cz * CH + a.z1 + 2) * CELL - T;
  const spring = CEIL, apex = (a.f1 - a.f0) * H + CEIL - 0.25;
  const span = X1 - X0, cxm = (X0 + X1) / 2, len = Z1 - Z0;
  const N = 18;
  const arc = (t: number): [number, number] => [cxm - Math.cos(Math.PI * t) * span / 2, spring + Math.sin(Math.PI * t) * (apex - spring)];
  const cellAt = (x: number, z: number) => b.cell(Math.floor(Math.min(X1 - 0.1, Math.max(X0 + 0.1, x)) / CELL), Math.floor(Math.min(Z1 - 0.1, Math.max(Z0 + 0.1, z)) / CELL));
  const skin = sp(L.CEILTILE, [0.78, 0.8, 0.8]);
  const wood = sp(L.WOOD_FLOOR, [0.75, 0.5, 0.3]);
  for (let i = 0; i < N; i++) {
    const [xa, ya] = arc(i / N), [xb, yb] = arc((i + 1) / N);
    const dx = xb - xa, dy = yb - ya, l = Math.hypot(dx, dy);
    const n: V3 = [dy / l, -dx / l, 0];
    // vault skin, in lengths so the light can vary along it
    for (let z = Z0; z < Z1 - 0.01; z += CELL) {
      const z2 = Math.min(Z1, z + CELL);
      cellAt((xa + xb) / 2, (z + z2) / 2);
      b.quad([xa, y0 + ya, z], [0, 0, z2 - z], [dx, dy, 0], n, skin, 1.5, [z / 2.4, 0, z2 / 2.4, l / 2.4]);
    }
    // glulam arches every 3 m
    for (let z = Z0 + 1.5; z < Z1; z += CELL) {
      cellAt((xa + xb) / 2, z);
      b.obox([(xa + xb) / 2 + n[0] * 0.2, y0 + (ya + yb) / 2 + n[1] * 0.2, z], [dx / l, dy / l, 0], n, [0, 0, 1], [l / 2 + 0.02, 0.2, 0.11], { all: wood });
    }
    // gable ends: slatted windows glowing with daylight
    for (const [zz, nz] of [[Z0, 1], [Z1, -1]] as const) {
      cellAt((xa + xb) / 2, zz + nz * 1.5);
      const u = (x: number) => (x - X0) / span, v = (y: number) => (y - spring) / (apex - spring);
      b.quad4([[xa, y0 + spring, zz], [xb, y0 + spring, zz], [xb, y0 + yb, zz], [xa, y0 + ya, zz]], [[u(xa), 0], [u(xb), 0], [u(xb), v(yb)], [u(xa), v(ya)]], [0, 0, nz], { layer: L.SLATWIN, emit: [1.05, 0.95, 0.8] });
    }
  }
  // big ventilation duct along the hall
  cellAt(cxm, (Z0 + Z1) / 2);
  const dx = cxm - span * 0.28;
  b.geom(DUCT, dx, y0 + spring + (apex - spring) * 0.55, (Z0 + Z1) / 2, 0, 0.42, len, 0.42, sp(L.STEEL, [0.62, 0.64, 0.66]), Math.PI / 2);
  // band between the ring walls and the vault on the long sides
  for (const [xx, nx] of [[X0, 1], [X1, -1]] as const) {
    cellAt(xx + nx * 1.5, (Z0 + Z1) / 2);
    b.vrect(true, xx, Z0, Z1, y0 + spring - 0.05, y0 + spring + 0.4, nx, sp(L.WOOD_FLOOR, [0.55, 0.38, 0.24]), 3, y0);
  }
}

// --- the tall spaces: de decorstraat, Studio Marconi, De Toren -----------------

const CYL32 = new CylinderGeometry(1, 1, 1, 32, 1, true);
const CYLS = new CylinderGeometry(1, 1, 1, 16, 1);
const CONE_SHADE = new CylinderGeometry(0.25, 1, 1, 16, 1, true);

function buildTall(b: Builder, p: Plan) {
  const a = p.st.atrium!;
  const y0 = a.f0 * H, top = tallTop(a, H, CEIL);
  const X0 = (p.cx * CH + a.x0 - 1) * CELL + T, X1 = (p.cx * CH + a.x1 + 2) * CELL - T;
  const Z0 = (p.cz * CH + a.z0 - 1) * CELL + T, Z1 = (p.cz * CH + a.z1 + 2) * CELL - T;
  const at = (x: number, z: number) => b.cell(Math.floor(Math.min(X1 - 0.1, Math.max(X0 + 0.1, x)) / CELL), Math.floor(Math.min(Z1 - 0.1, Math.max(Z0 + 0.1, z)) / CELL));
  // the ceiling, one cell at a time for the light
  const ceiling = (spec: Spec, sub = 1.5) => {
    for (let z = Z0; z < Z1 - 0.01; z += CELL)
      for (let x = X0; x < X1 - 0.01; x += CELL) {
        at(x + 1, z + 1);
        b.hrect(x, z, Math.min(X1, x + CELL), Math.min(Z1, z + CELL), y0 + top, false, spec, sub);
      }
  };
  if (a.kind === "decor") {
    ceiling(sp(L.CEILMETAL, [0.45, 0.46, 0.48]));
    // lintels over the openings into the studios, the big roller door at the end of the street
    const za = (p.cz * CH + 5) * CELL, zb = (p.cz * CH + 7) * CELL;
    for (const xw of [(p.cx * CH + 5) * CELL, (p.cx * CH + 7) * CELL]) {
      at(xw, za + 1);
      b.aabox(xw - T, y0 + 5.2, za, xw + T, y0 + top, zb, { all: sp(L.BRICK_DOTS, [0.72, 0.72, 0.72]), ny: sp(L.WHITE, [0.2, 0.2, 0.22]) });
      b.aabox(xw - T - 0.03, y0 + 5.05, za, xw + T + 0.03, y0 + 5.2, zb, sp(L.WHITE, [0.85, 0.7, 0.1]));
    }
    const xg0 = (p.cx * CH + 6) * CELL + 0.1, xg1 = (p.cx * CH + 7) * CELL - T - 0.05;
    at(xg0 + 1, Z1 - 1);
    b.vrect(true, Z1 - 0.02, xg0, xg1, y0, y0 + 4.6, -1, { layer: L.ROLLER, uv: [0, 0, 1, 1] }, 0, y0);
    b.aabox(xg0 - 0.1, y0 + 4.6, Z1 - 0.5, xg1 + 0.1, y0 + 5.0, Z1 - 0.02, sp(L.STEEL, [0.6, 0.62, 0.65]));
    // a lane for the lorries
    for (const xl of [(p.cx * CH + 5) * CELL + 0.6, (p.cx * CH + 7) * CELL - 0.6]) {
      at(xl, (Z0 + Z1) / 2);
      b.hrect(xl - 0.06, Z0 + 0.3, xl + 0.06, Z1 - 0.3, y0 + 0.004, true, sp(L.WHITE, [0.9, 0.75, 0.1]), 0);
    }
    return;
  }
  if (a.kind === "marconi") {
    ceiling(sp(L.SLATWIN, [0.75, 0.62, 0.48]), 1.5);
    // the underside of the gallery
    const gx0 = (p.cx * CH + a.x0 - 1) * CELL + T, gx1 = (p.cx * CH + a.x0) * CELL;
    const gz0 = (p.cz * CH + a.z0 + 4) * CELL, gz1 = Z1;
    for (let z = gz0; z < gz1 - 0.01; z += CELL) {
      at(gx0 + 1, z + 1);
      b.hrect(gx0, z, gx1, Math.min(gz1, z + CELL), y0 + H - 0.02, false, sp(L.PLASTER, [0.8, 0.78, 0.74]), 1);
    }
    return;
  }
  if (a.kind === "bos") return buildBos(b, p, at, ceiling);
  if (a.kind === "bareel") return buildBareel(b, p, at, ceiling);
  // De Toren: a painted sky overhead, a grid of lights, the tower, its stair, its deck
  ceiling({ layer: L.WHITE, emit: [0.3, 0.46, 0.72] }, 0);
  const t = towerSpec(p.st, H, CEIL)!;
  const tx = t.x, tz = t.z, ty = t.y0;
  const conc = sp(L.CONCRETE, [0.88, 0.88, 0.86]);
  const inner = sp(L.CONCRETE, [0.7, 0.7, 0.68]);
  const dark = sp(L.CONCRETE, [0.55, 0.57, 0.6]);
  const white = sp(L.WHITE, [0.92, 0.92, 0.9]);
  const steel = sp(L.STEEL, [0.8, 0.82, 0.85]);
  const cellAtR = (r: number, ang: number) => at(tx + Math.cos(ang) * r, tz + Math.sin(ang) * r);
  const P = (r: number, ang: number, y: number): V3 => [tx + Math.cos(ang) * r, ty + y, tz + Math.sin(ang) * r];
  // a plinth round the foot of the shaft
  at(tx, tz);
  b.geom(shell(t.rWall + 0.35, 0, TWO_PI, false), tx, ty + 0.12, tz, 0, 1, 0.24, 1, sp(L.CONCRETE, [0.7, 0.7, 0.68]));
  // the shaft, hollow, in lengths (for the light); the lowest one has the door in it
  const shaftTop = t.deck - 1.6;
  const [da, db] = t.door;
  for (let y = 0; y < shaftTop; y += 3) {
    const hgt = Math.min(3, shaftTop - y);
    const gap = y === 0;
    const ts0 = gap ? Math.PI / 2 - da : 0, tl = gap ? TWO_PI - (db - da) : TWO_PI;
    for (let k = 0; k < 4; k++) cellAtR(t.rWall + 0.4, (k * Math.PI) / 2 + 0.3);
    b.geom(shell(t.rWall, ts0, tl, false), tx, ty + y + hgt / 2, tz, 0, 1, hgt, 1, conc);
    cellAtR(1.2, y * 0.7);
    b.geom(shell(t.rWall - 0.1, ts0, tl, true), tx, ty + y + hgt / 2, tz, 0, 1, hgt, 1, inner);
  }
  // the door: jambs, a lintel, the wall above it, a lamp over it
  for (const ang of [da, db]) {
    cellAtR(t.rWall + 0.5, ang);
    const f = new Frame(...P(t.rWall - 0.05, ang, 0), Math.atan2(Math.cos(ang), Math.sin(ang)));
    fbox(b, f, 0, 0, 0, 0.12, 2.3, 0.22, dark);
  }
  cellAtR(t.rWall + 0.5, (da + db) / 2);
  b.geom(shell(t.rWall + 0.01, Math.PI / 2 - db, db - da, false), tx, ty + 2.3 + 0.35, tz, 0, 1, 0.7, 1, conc);
  b.geom(shell(t.rWall - 0.11, Math.PI / 2 - db, db - da, true), tx, ty + 2.3 + 0.35, tz, 0, 1, 0.7, 1, inner);
  {
    const ang = (da + db) / 2, f = new Frame(...P(t.rWall + 0.05, ang, 2.45), Math.atan2(Math.cos(ang), Math.sin(ang)));
    fbox(b, f, 0, 0, 0.05, 0.3, 0.1, 0.1, { layer: L.WHITE, emit: [1.6, 1.4, 1.0] });
  }
  // lamps on the inside of the shaft, all the way up
  for (let y = 2.2; y < t.deck; y += 2.6) {
    const ang = y * 1.3;
    cellAtR(1.5, ang);
    const f = new Frame(...P(t.rWall - 0.13, ang, y), Math.atan2(-Math.cos(ang), -Math.sin(ang)));
    fbox(b, f, 0, 0, 0, 0.3, 0.14, 0.08, { all: sp(L.WHITE, [0.3, 0.3, 0.32]), pz: { layer: L.WHITE, emit: [1.6, 1.5, 1.2] } });
  }
  // the newel, up to the deck
  at(tx + 0.4, tz);
  b.geom(CYLS, tx, ty + t.deck / 2, tz, 0, t.rNewel, t.deck, t.rNewel, steel);
  // the saucer: a thick disc round the shaft, the deck on top
  const R = t.rSaucer, sy = ty + t.deck - 1.6;
  at(tx + R - 0.4, tz);
  b.geom(CYL32, tx, sy + 0.8, tz, 0, R, 1.6, R, dark);
  b.geom(CYL32, tx, sy + 0.25, tz, 0, R + 0.1, 0.5, R + 0.1, white);
  cellAtR(1.2, 0);
  b.geom(shell(t.rWall - 0.1, 0, TWO_PI, true), tx, sy + 0.8, tz, 0, 1, 1.6, 1, inner);
  b.geom(new RingGeometry(t.rWall / (R + 0.1), 1, 40, 1), tx, sy, tz, 0, R + 0.1, R + 0.1, 1, conc, Math.PI / 2);
  const deckS = sp(L.CONCRETE, [0.75, 0.75, 0.72]);
  b.geom(new RingGeometry(t.rWall / R, 1, 44, 1), tx, ty + t.deck, tz, 0, R, R, 1, deckS, -Math.PI / 2);
  // inside the rim, open where the stair comes up (ring angle θ is world angle -θ once laid flat)
  const [ha, hb] = t.hatch;
  const well = new RingGeometry(t.rNewel / t.rWall, 1, 32, 1, -(ha + TWO_PI), TWO_PI - (hb - ha));
  b.geom(well, tx, ty + t.deck, tz, 0, t.rWall, t.rWall, 1, deckS, -Math.PI / 2);
  // windows round the saucer, lit
  for (let k = 0; k < 32; k++) {
    const ang = (k / 32) * TWO_PI;
    cellAtR(R + 0.2, ang);
    const f = new Frame(...P(R + 0.02, ang, t.deck - 0.65), Math.atan2(Math.cos(ang), Math.sin(ang)));
    fbox(b, f, 0, 0, 0, 0.6, 0.35, 0.02, { layer: L.WHITE, emit: [1.1, 1.0, 0.8] });
  }
  // the dishes round the rim, the mast, the red light
  for (let k = 0; k < 6; k++) {
    const ang = (k / 6) * TWO_PI + 0.3;
    cellAtR(R - 0.6, ang);
    b.geom(CYLS, ...P(R - 0.8, ang, t.deck + 0.55), -ang, 0.42, 0.18, 0.42, white, Math.PI / 2);
  }
  at(tx + 0.5, tz);
  b.geom(CYLS, tx, ty + t.deck + 2.6, tz, 0, 0.22, 5.2, 0.22, steel);
  b.geom(CYLS, tx, ty + t.deck + 5.35, tz, 0, 0.12, 0.3, 0.12, { layer: L.WHITE, emit: [2.2, 0.15, 0.08] });
  // a railing round the deck, and round the hatch
  for (let k = 0; k < 48; k++) {
    const a0 = (k / 48) * TWO_PI, a1 = ((k + 1) / 48) * TWO_PI;
    cellAtR(t.rDeck, a0);
    const p0 = P(t.rDeck + 0.08, a0, t.deck);
    b.geom(CYLS, p0[0], p0[1] + 0.55, p0[2], 0, 0.025, 1.1, 0.025, steel);
    rod(b, P(t.rDeck + 0.08, a0, t.deck + 1.08), P(t.rDeck + 0.08, a1, t.deck + 1.08), 0.03, steel);
  }
  for (let k = 0; k <= 8; k++) {
    const a0 = ha + ((hb - ha) * k) / 8, a1 = ha + ((hb - ha) * (k + 1)) / 8;
    cellAtR(t.rOut, a0);
    b.geom(CYLS, ...P(t.rOut + 0.1, a0, t.deck + 0.55), 0, 0.02, 1.1, 0.02, steel);
    if (k < 8) rod(b, P(t.rOut + 0.1, a0, t.deck + 1.08), P(t.rOut + 0.1, a1, t.deck + 1.08), 0.03, steel);
  }
  // the spiral stair inside the shaft: treads round the newel, a handrail on the wall
  const turns = t.deck / t.rise, steps = Math.round(turns * 17), dphi = (turns * TWO_PI) / steps;
  const tread = sp(L.STEEL, [0.62, 0.64, 0.68]);
  const rm = (t.rIn + t.rOut) / 2, w = t.rOut - t.rIn + 0.1;
  for (let s = 0; s < steps; s++) {
    const ph = db + (s + 0.5) * dphi, h = ((s + 1) / steps) * t.deck;
    cellAtR(rm, ph);
    const c = Math.cos(ph), sn = Math.sin(ph);
    b.obox(P(rm, ph, h - 0.03), [c, 0, sn], UP, [-sn, 0, c], [w / 2, 0.03, (rm * dphi) / 2 + 0.04], tread);
    const n0 = db + s * dphi, n1 = db + (s + 1) * dphi, h0 = (s / steps) * t.deck;
    rod(b, P(t.rOut + 0.02, n0, h0 + 0.95), P(t.rOut + 0.02, n1, h + 0.95), 0.035, BLACKSTEEL);
  }
  // cables holding it up: from the mast to the corners of the ceiling
  for (const [cx, cz] of [[X0 + 1, Z0 + 1], [X1 - 1, Z0 + 1], [X0 + 1, Z1 - 1], [X1 - 1, Z1 - 1]]) {
    at((cx! + tx) / 2, (cz! + tz) / 2);
    rod(b, [tx, ty + t.deck + 4.6, tz], [cx!, ty + top - 0.05, cz!], 0.02, BLACKSTEEL);
  }
}

// a flat rectangle facing up, cut along the cell grid so each piece gets its own light
function flat(b: Builder, at: (x: number, z: number) => void, x0: number, z0: number, x1: number, z1: number, y: number, spec: Spec) {
  for (let z = z0; z < z1 - 1e-3; z = Math.min(z1, (Math.floor(z / CELL) + 1) * CELL))
    for (let x = x0; x < x1 - 1e-3; x = Math.min(x1, (Math.floor(x / CELL) + 1) * CELL)) {
      const xe = Math.min(x1, (Math.floor(x / CELL) + 1) * CELL), ze = Math.min(z1, (Math.floor(z / CELL) + 1) * CELL);
      at((x + xe) / 2, (z + ze) / 2);
      b.hrect(x, z, xe, ze, y, true, spec, 0);
    }
}

// De bareel: the road through two barriers under a steel canopy, a hedge across,
// and the guard's booth you have to walk through. Signs, lights, markings.
function buildBareel(b: Builder, p: Plan, at: (x: number, z: number) => void, ceiling: (spec: Spec, sub?: number) => void) {
  const a = p.st.atrium!, B = BAREEL;
  const ox = p.cx * CH * CELL, oz = p.cz * CH * CELL, y0 = a.f0 * H;
  const X0 = ox + (a.x0 - 1) * CELL + T, X1 = ox + (a.x1 + 2) * CELL - T;
  const Z0 = oz + (a.z0 - 1) * CELL + T, Z1 = oz + (a.z1 + 2) * CELL - T;
  const X = (v: number) => ox + v, Z = (v: number) => oz + v;
  const mid = Z(B.mid);
  const tile = (x0: number, z0: number, x1: number, z1: number, y: number, spec: Spec) => flat(b, at, x0, z0, x1, z1, y, spec);
  const box = (x0: number, y0_: number, z0: number, x1: number, y1: number, z1: number, s: Parameters<Builder["aabox"]>[6], solid = false) => {
    at((x0 + x1) / 2, (z0 + z1) / 2);
    b.aabox(x0, y0_, z0, x1, y1, z1, s, 0);
    if (solid) b.solid(x0, z0, x1, z1);
  };
  ceiling({ layer: L.WHITE, emit: [1.15, 1.3, 1.5] }, 0);

  // the road, the island, the pavement, the bike lane
  const asphalt = sp(L.CONCRETE, [0.3, 0.3, 0.32]);
  tile(X(B.laneA[0]), Z0, X(B.laneB[1]), Z1, y0 + 0.005, asphalt);
  const paving = sp(L.CONCRETE, [0.78, 0.76, 0.72]);
  tile(X(B.walk[0]), Z0, X(B.walk[1]), Z(B.booth.z0), y0 + 0.006, paving);
  tile(X(B.walk[0]), Z(B.booth.z1), X(B.walk[1]), Z1, y0 + 0.006, paving);
  tile(X(B.laneB[1]), Z(B.bike[0]), X1, Z(B.bike[1]), y0 + 0.008, sp(L.CONCRETE, [0.78, 0.2, 0.18]));
  const white = sp(L.WHITE, [0.92, 0.92, 0.9]);
  const paint = (x0: number, z0: number, x1: number, z1: number) => tile(X(x0), Z(z0), X(x1), Z(z1), y0 + 0.011, white);
  // edge lines, dashed; stop lines before the booms; arrows; a zebra crossing inside
  for (let z = 3.4; z < 32.6; z += 2) {
    paint(B.laneA[0] + 0.15, z, B.laneA[0] + 0.27, z + 1);
    paint(B.laneB[1] - 0.27, z, B.laneB[1] - 0.15, z + 1);
  }
  paint(B.laneA[0] + 0.3, B.mid - 1.3, B.island[0] - 0.1, B.mid - 1.0);
  paint(B.island[1] + 0.1, B.mid + 1.0, B.laneB[1] - 0.3, B.mid + 1.3);
  for (let k = 0; k < 5; k++) {
    paint(B.laneA[0] + 0.3 + k * 0.72, B.mid - 2.0, B.laneA[0] + 0.62 + k * 0.72, B.mid - 1.7);
    paint(B.laneB[0] + 0.3 + k * 0.72, B.mid + 1.7, B.laneB[0] + 0.62 + k * 0.72, B.mid + 2.0);
  }
  const arrow = (xc: number, zc: number, dir: number) => {
    paint(xc - 0.09, zc - 1.2, xc + 0.09, zc + 1.2);
    for (let k = 0; k < 5; k++) {
      const zz = zc + dir * (1.2 + k * 0.14), w = 0.55 - k * 0.11;
      paint(xc - w, Math.min(zz, zz + dir * 0.14), xc + w, Math.max(zz, zz + dir * 0.14));
    }
  };
  arrow((B.laneA[0] + B.island[0]) / 2, 8, 1);
  arrow((B.laneA[0] + B.island[0]) / 2, 27, 1);
  arrow((B.laneB[0] + B.laneB[1]) / 2, 9, -1);
  arrow((B.laneB[0] + B.laneB[1]) / 2, 28, -1);
  for (let x = B.laneA[0] + 0.3; x < B.laneB[1] - 0.3; x += 1.0) if (x + 0.5 < B.island[0] || x > B.island[1]) paint(x, 24.5, x + 0.5, 27.0);

  // the island: a kerb with a hedge on it
  const kerb = sp(L.CONCRETE, [0.72, 0.72, 0.7]);
  const hedge = { all: sp(L.FOLIAGE, [0.42, 0.62, 0.34]), ny: null };
  box(X(B.island[0]), y0, Z(13.6), X(B.island[1]), y0 + 0.15, Z(22.4), { all: kerb, ny: null }, true);
  box(X(B.island[0]) + 0.12, y0 + 0.15, Z(14.8), X(B.island[1]) - 0.12, y0 + 0.95, Z(B.mid - 0.35), hedge);
  box(X(B.island[0]) + 0.12, y0 + 0.15, Z(B.mid + 0.35), X(B.island[1]) - 0.12, y0 + 0.95, Z(21.2), hedge);
  // the hedge across: from the wall to the road, from the road to the booth, from the booth to the wall
  for (const [x0, x1] of [[X0, X(B.laneA[0])], [X(B.laneB[1]), X(B.booth.x0)], [X(B.booth.x1), X1]] as const)
    box(x0, y0, mid - 0.45, x1, y0 + 1.25, mid + 0.45, hedge, true);

  // the booms: an orange housing on the island side, a traffic light facing the cars that come
  // up to it. The arms and the lamps move, so they're built on the main thread (bareel.ts).
  const housing = { all: sp(L.WHITE, [0.95, 0.5, 0.08]), py: sp(L.WHITE, [0.9, 0.9, 0.88]) };
  for (const bm of bareelBooms(ox, oz, y0)) {
    box(bm.hx - 0.18, y0, bm.hz - 0.18, bm.hx + 0.18, y0 + 1.05, bm.hz + 0.18, housing, true);
    const { tx, tz } = bm;
    box(tx - 0.05, y0, tz - 0.05, tx + 0.05, y0 + 2.3, tz + 0.05, sp(L.WHITE, [0.1, 0.1, 0.1]), true);
    box(tx - 0.13, y0 + 2.0, tz - 0.1, tx + 0.13, y0 + 2.75, tz + 0.1, sp(L.WHITE, [0.06, 0.06, 0.06]));
  }
  // high-bay lamps hanging from the sky, and lamps in the canopy
  for (const [lx, lz] of bareelLamps()) {
    const x = X(lx), z = Z(lz), ly = y0 + tallTop(a, H, CEIL) - 1.6;
    at(x, z);
    b.aabox(x - 0.015, ly, z - 0.015, x + 0.015, y0 + tallTop(a, H, CEIL), z + 0.015, sp(L.WHITE, [0.1, 0.1, 0.1]), 0);
    b.geom(CONE_SHADE, x, ly - 0.2, z, 0, 0.55, 0.4, 0.55, sp(L.STEEL, [0.55, 0.57, 0.6]));
    b.geom(CYLS, x, ly - 0.41, z, 0, 0.42, 0.02, 0.42, { layer: L.WHITE, emit: [2.4, 2.3, 2.0] });
  }
  for (const [lx, lz] of bareelCanopyLamps()) {
    const x = X(lx), z = Z(lz), ly = y0 + B.canopy.y - 0.8;
    at(x, z);
    b.aabox(x - 0.35, ly - 0.06, z - 0.35, x + 0.35, ly, z + 0.35, { all: sp(L.WHITE, [0.2, 0.2, 0.2]), ny: { layer: L.WHITE, emit: [2.2, 2.0, 1.7] } }, 0);
  }

  // the booth: brick, a band of windows all round, a flat roof; a door in front and one at the back
  const bo = B.booth;
  const brick = sp(L.BRICK, [0.62, 0.44, 0.38]);
  const bx0 = X(bo.x0), bx1 = X(bo.x1), bz0 = Z(bo.z0), bz1 = Z(bo.z1), th = 0.2;
  const sill = 1.0, head = 2.25;
  const wallX = (x0: number, x1: number, z0: number, z1: number, door: boolean) => {
    // a length of wall running along x, with its window band
    box(x0, y0, z0, x1, y0 + (door ? 0 : sill), z1, brick);
    if (!door) {
      box(x0, y0 + head, z0, x1, y0 + bo.h, z1, brick);
      const n = Math.max(1, Math.round((x1 - x0) / 1.2));
      for (let k = 0; k <= n; k++) {
        const x = x0 + ((x1 - x0) * k) / n;
        box(x - 0.03, y0 + sill, z0 + 0.05, x + 0.03, y0 + head, z1 - 0.05, sp(L.WHITE, [0.25, 0.2, 0.18]));
      }
      at((x0 + x1) / 2, (z0 + z1) / 2);
      b.glass([x0, y0 + sill, (z0 + z1) / 2], [x1 - x0, 0, 0], [0, head - sill, 0], [0.55, 0.62, 0.66, 0.22]);
    } else box(x0, y0 + 2.15, z0, x1, y0 + bo.h, z1, brick);
    if (!door) b.solid(x0, z0, x1, z1);
  };
  for (const [z0, z1] of [[bz0, bz0 + th], [bz1 - th, bz1]] as const) {
    wallX(bx0, X(bo.door[0]), z0, z1, false);
    wallX(X(bo.door[0]), X(bo.door[1]), z0, z1, true);
    wallX(X(bo.door[1]), bx1, z0, z1, false);
  }
  for (const [x0, x1] of [[bx0, bx0 + th], [bx1 - th, bx1]] as const) {
    box(x0, y0, bz0 + th, x1, y0 + sill, bz1 - th, brick);
    box(x0, y0 + head, bz0 + th, x1, y0 + bo.h, bz1 - th, brick);
    for (const z of [bz0 + th + 0.03, (bz0 + bz1) / 2, bz1 - th - 0.03]) box(x0 + 0.05, y0 + sill, z - 0.03, x1 - 0.05, y0 + head, z + 0.03, sp(L.WHITE, [0.25, 0.2, 0.18]));
    at((x0 + x1) / 2, (bz0 + bz1) / 2);
    b.glass([(x0 + x1) / 2, y0 + sill, bz0 + th], [0, 0, bz1 - bz0 - 2 * th], [0, head - sill, 0], [0.55, 0.62, 0.66, 0.22]);
    b.solid(x0, bz0, x1, bz1);
  }
  // the roof, its beige fascia, the floor and ceiling inside
  box(bx0 - 0.25, y0 + bo.h, bz0 - 0.25, bx1 + 0.25, y0 + bo.h + 0.12, bz1 + 0.25, sp(L.CONCRETE, [0.6, 0.6, 0.6]));
  box(bx0 - 0.3, y0 + bo.h + 0.12, bz0 - 0.3, bx1 + 0.3, y0 + bo.h + 0.55, bz1 + 0.3, { all: sp(L.PLASTER, [0.78, 0.66, 0.52]), ny: sp(L.WHITE, [0.7, 0.7, 0.68]) });
  tile(bx0 + th, bz0 + th, bx1 - th, bz1 - th, y0 + 0.012, sp(L.LINO, [0.7, 0.66, 0.6]));

  // the canopy: a dark roof on a steel space frame, four slender columns
  const cn = B.canopy;
  const frame = sp(L.WHITE, [0.2, 0.15, 0.12]);
  const cy = y0 + cn.y;
  for (let z = Z(cn.z0); z < Z(cn.z1) - 0.01; z += CELL)
    for (let x = X(cn.x0); x < X(cn.x1) - 0.01; x += CELL) {
      const xe = Math.min(X(cn.x1), x + CELL), ze = Math.min(Z(cn.z1), z + CELL);
      at((x + xe) / 2, (z + ze) / 2);
      b.aabox(x, cy, z, xe, cy + 0.3, ze, { all: sp(L.WHITE, [0.26, 0.24, 0.22]), ny: sp(L.WHITE, [0.32, 0.3, 0.28]) }, 0);
    }
  const step = 2.4, nx = Math.round((cn.x1 - cn.x0) / step), nz = Math.round((cn.z1 - cn.z0) / step);
  const sx = (cn.x1 - cn.x0) / nx, sz = (cn.z1 - cn.z0) / nz, drop = 0.75;
  const top = (i: number, j: number): V3 => [X(cn.x0 + i * sx), cy - 0.02, Z(cn.z0 + j * sz)];
  const bot = (i: number, j: number): V3 => [X(cn.x0 + (i + 0.5) * sx), cy - drop, Z(cn.z0 + (j + 0.5) * sz)];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const q = bot(i, j);
      at(q[0], q[2]);
      for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) rod(b, q, top(i + di, j + dj), 0.05, frame);
      if (i + 1 < nx) rod(b, q, bot(i + 1, j), 0.05, frame);
      if (j + 1 < nz) rod(b, q, bot(i, j + 1), 0.05, frame);
    }
  for (let i = 0; i <= nx; i++) { at(X(cn.x0 + i * sx), Z(cn.z0) + 1); rod(b, top(i, 0), top(i, nz), 0.06, frame); }
  for (let j = 0; j <= nz; j++) { at(X(cn.x0) + 1, Z(cn.z0 + j * sz)); rod(b, top(0, j), top(nx, j), 0.06, frame); }
  for (const [x, z] of B.columns) {
    at(X(x), Z(z));
    b.geom(CYLS, X(x), y0 + cn.y / 2, Z(z), 0, 0.13, cn.y, 0.13, sp(L.WHITE, [0.62, 0.62, 0.64]));
    b.solid(X(x) - 0.15, Z(z) - 0.15, X(x) + 0.15, Z(z) + 0.15);
  }

  // signs: no entry on the island, the blue board inside, the booth sign, the one for people on foot
  {
    const nx_ = X((B.island[0] + B.island[1]) / 2), nz_ = Z(13.9);
    box(nx_ - 0.04, y0 + 0.15, nz_ - 0.04, nx_ + 0.04, y0 + 2.2, nz_ + 0.04, sp(L.WHITE, [0.55, 0.56, 0.58]));
    at(nx_, nz_);
    b.geom(CYLS, nx_, y0 + 1.9, nz_ - 0.07, 0, 0.36, 0.03, 0.36, sp(L.WHITE, [0.82, 0.08, 0.06]), Math.PI / 2);
    box(nx_ - 0.26, y0 + 1.84, nz_ - 0.1, nx_ + 0.26, y0 + 1.96, nz_ - 0.085, white);
  }
  const board = X(B.laneA[0] - 0.9), bzz = Z(24.0);
  for (const dx of [-0.4, 0.4]) box(board + dx - 0.04, y0, bzz - 0.04, board + dx + 0.04, y0 + 0.9, bzz + 0.04, sp(L.WHITE, [0.55, 0.56, 0.58]), true);
  box(board - 0.5, y0 + 0.9, bzz - 0.05, board + 0.5, y0 + 2.9, bzz + 0.03, { all: sp(L.WHITE, [0.12, 0.3, 0.6]), nz: { layer: L.BAREEL, uv: [0, 0, 0.5, 1] } });
  const sx_ = X((bo.door[0] + bo.door[1]) / 2 + 0.9);
  box(sx_ - 0.6, y0 + 2.15, bz0 - 0.34, sx_ + 0.6, y0 + 2.75, bz0 - 0.3, { all: sp(L.WHITE, [0.9, 0.9, 0.88]), nz: { layer: L.BAREEL, uv: [0.5, 0.5, 1, 1] } });
  const px_ = X(B.walk[0] - 0.4), pz_ = Z(11.5);
  box(px_ - 0.04, y0, pz_ - 0.04, px_ + 0.04, y0 + 1.5, pz_ + 0.04, sp(L.WHITE, [0.55, 0.56, 0.58]), true);
  box(px_ - 0.35, y0 + 1.5, pz_ - 0.07, px_ + 0.35, y0 + 2.2, pz_ - 0.04, { all: sp(L.WHITE, [0.12, 0.3, 0.6]), nz: { layer: L.BAREEL, uv: [0.5, 0, 1, 0.5] } });
}

// Het VRT-bos: a painted sky, a gravel path through the trees, a clay tennis
// court behind a fence. The trees themselves are props (see furnish).
function buildBos(b: Builder, p: Plan, at: (x: number, z: number) => void, ceiling: (spec: Spec, sub?: number) => void) {
  const s = bosSpec(p.st, H, CEIL)!;
  const y0 = s.y0, c = s.court;
  ceiling({ layer: L.WHITE, emit: [0.8, 0.95, 1.15] }, 0);
  // the sun, painted on the sky
  at(s.X0 + 6, s.Z0 + 7);
  b.geom(CYLS, s.X0 + 6, y0 + s.top - 0.04, s.Z0 + 7, 0, 1.4, 0.04, 1.4, { layer: L.WHITE, emit: [2.4, 2.2, 1.7] });
  const tile = (x0: number, z0: number, x1: number, z1: number, y: number, spec: Spec) => flat(b, at, x0, z0, x1, z1, y, spec);
  // the path, in short lengths following its bends, and a spur to the gate of the court
  const gravel = sp(L.GRAVEL, [0.72, 0.62, 0.48]);
  for (let z = s.Z0; z < s.Z1 - 1e-3; z += 0.5) {
    const x = s.pathX(z + 0.25);
    tile(x - 0.85, z, x + 0.85, Math.min(s.Z1, z + 0.5), y0 + 0.006, gravel);
  }
  tile(s.pathX(c.cz) + 0.85, c.cz - 0.8, c.x0, c.cz + 0.8, y0 + 0.006, gravel);
  // the court: red clay, white lines (23.77 x 10.97, singles 8.23, service lines 6.40 from the net)
  tile(c.x0, c.z0, c.x1, c.z1, y0 + 0.008, sp(L.CONCRETE, [1.05, 0.52, 0.32]));
  const line = sp(L.WHITE, [0.95, 0.95, 0.92]);
  const lw = 0.05, hl = 23.77 / 2, hd = 10.97 / 2, hs = 8.23 / 2, sv = 6.4;
  const ln = (x0: number, z0: number, x1: number, z1: number) => tile(c.cx + x0, c.cz + z0, c.cx + x1, c.cz + z1, y0 + 0.011, line);
  for (const sx of [-1, 1]) {
    ln(sx * hd - lw, -hl, sx * hd + lw, hl);
    ln(sx * hs - lw, -hl, sx * hs + lw, hl);
    ln(-hd, sx * hl - lw, hd, sx * hl + lw);
    ln(-hs, sx * sv - lw, hs, sx * sv + lw);
  }
  ln(-lw, -sv, lw, sv);
  for (const sz of [-1, 1]) ln(-lw, sz * hl - (sz > 0 ? 0.2 : 0), lw, sz * hl + (sz < 0 ? 0.2 : 0));
  // the net: posts, a sagging mesh, the white band on top
  const post = sp(L.WHITE, [0.12, 0.28, 0.16]);
  const px = hd + 0.914;
  for (const sx of [-1, 1]) {
    at(c.cx + sx * px, c.cz);
    b.aabox(c.cx + sx * px - 0.05, y0, c.cz - 0.05, c.cx + sx * px + 0.05, y0 + 1.07, c.cz + 0.05, post, 0);
  }
  for (const [a0, a1] of [[-px, 0], [0, px]] as const) {
    at(c.cx + (a0 + a1) / 2, c.cz);
    b.glass([c.cx + a0, y0 + 0.02, c.cz], [a1 - a0, 0, 0], [0, 0.95, 0], [0.04, 0.05, 0.05, 0.55]);
    const top0 = a0 === 0 ? 0.914 : 1.07, top1 = a0 === 0 ? 1.07 : 0.914;
    rod(b, [c.cx + a0, y0 + top0 - 0.03, c.cz], [c.cx + a1, y0 + top1 - 0.03, c.cz], 0.06, line);
  }
  // the fence round the court: green posts, a top rail, chain-link; a gate on the west side
  const fh = 3.2, gate = 0.8;
  const mesh: [number, number, number, number] = [0.08, 0.16, 0.1, 0.32];
  const sides: [number, number, number, number][] = [
    [c.x0, c.z0, c.x1, c.z0], [c.x1, c.z0, c.x1, c.z1], [c.x0, c.z1, c.x1, c.z1],
    [c.x0, c.z0, c.x0, c.cz - gate], [c.x0, c.cz + gate, c.x0, c.z1],
  ];
  for (const [xa, za, xb, zb] of sides) {
    const len = Math.hypot(xb - xa, zb - za), n = Math.max(1, Math.round(len / 2.5));
    for (let k = 0; k <= n; k++) {
      const x = xa + ((xb - xa) * k) / n, z = za + ((zb - za) * k) / n;
      at(x, z);
      b.aabox(x - 0.04, y0, z - 0.04, x + 0.04, y0 + fh, z + 0.04, post, 0);
      if (k < n) {
        const x2 = xa + ((xb - xa) * (k + 1)) / n, z2 = za + ((zb - za) * (k + 1)) / n;
        rod(b, [x, y0 + fh - 0.03, z], [x2, y0 + fh - 0.03, z2], 0.05, post);
        rod(b, [x, y0 + 0.08, z], [x2, y0 + 0.08, z2], 0.04, post);
        b.glass([x, y0 + 0.05, z], [x2 - x, 0, z2 - z], [0, fh - 0.1, 0], mesh);
      }
    }
    b.solid(Math.min(xa, xb) - 0.06, Math.min(za, zb) - 0.06, Math.max(xa, xb) + 0.06, Math.max(za, zb) + 0.06);
  }
  // a windscreen along both ends, dark green, with the name on it
  for (const z of [c.z0 + 0.05, c.z1 - 0.05]) {
    at(c.cx, z);
    const n = z < c.cz ? 1 : -1;
    b.vrect(false, z, c.x0 + 0.1, c.x1 - 0.1, y0 + 0.1, y0 + 1.9, n, sp(L.FABRIC, [0.1, 0.24, 0.14]), 0, y0);
    b.vrect(false, z - n * 0.01, c.x0 + 0.1, c.x1 - 0.1, y0 + 0.1, y0 + 1.9, -n, sp(L.FABRIC, [0.1, 0.24, 0.14]), 0, y0);
  }
}

const TWO_PI = Math.PI * 2;
// a length of cylinder wall (height 1, scale y to taste), seen from outside or from inside
const shells = new Map<string, BufferGeometry>();
function shell(r: number, thetaStart: number, thetaLength: number, inside: boolean) {
  const key = `${r}:${thetaStart}:${thetaLength}:${inside}`;
  let g = shells.get(key);
  if (g) return g;
  g = new CylinderGeometry(r, r, 1, 40, 1, true, thetaStart, thetaLength).toNonIndexed() as BufferGeometry;
  if (inside) {
    const pos = g.getAttribute("position"), nor = g.getAttribute("normal"), uv = g.getAttribute("uv");
    for (let i = 0; i < pos.count; i += 3)
      for (const a of [pos, nor, uv])
        for (let c = 0; c < a.itemSize; c++) {
          const tmp = a.getComponent(i + 1, c);
          a.setComponent(i + 1, c, a.getComponent(i + 2, c));
          a.setComponent(i + 2, c, tmp);
        }
    for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
  }
  shells.set(key, g);
  return g;
}

// a thin bar from p0 to p1
function rod(b: Builder, p0: V3, p1: V3, th: number, s: Spec) {
  const d: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const l = Math.hypot(d[0], d[1], d[2]);
  const ax: V3 = [d[0] / l, d[1] / l, d[2] / l];
  let ref: V3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const az: V3 = [ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]];
  const al = Math.hypot(az[0], az[1], az[2]);
  ref = [az[0] / al, az[1] / al, az[2] / al];
  const ay: V3 = [ref[1] * ax[2] - ref[2] * ax[1], ref[2] * ax[0] - ref[0] * ax[2], ref[0] * ax[1] - ref[1] * ax[0]];
  b.obox([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], ax, ay, ref, [l / 2, th / 2, th / 2], s);
}

// De gang naar de parking: thick block walls inside every cell of the route,
// so the corridor is only 1.8 m wide. Open sides get an arm, closed sides a wall.
function buildSnake(b: Builder, p: Plan) {
  const y0 = p.f * H, hh = 2.5, w = SNAKE_HALF, e = CELL / 2;
  const wall = sp(L.BLOCKWALL);
  for (let i = 0; i < CH * CH; i++) {
    if (p.kind[i] !== K.CORR) continue;
    const gx = p.cx * CH + (i % CH), gz = p.cz * CH + ((i / CH) | 0);
    const cx = (gx + 0.5) * CELL, cz = (gz + 0.5) * CELL;
    b.cell(gx, gz);
    const open = [0, 1, 2, 3].map((d) => {
      const k = sideAt(p.f, gx, gz, d).sk;
      return k === SK.OPEN || k === SK.DOOR;
    });
    const box = (x0: number, z0: number, x1: number, z1: number) => {
      b.aabox(cx + x0, y0, cz + z0, cx + x1, y0 + hh, cz + z1, { all: wall, py: null, ny: null }, 1);
      b.solid(cx + x0, cz + z0, cx + x1, cz + z1);
    };
    // the four corners, always
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx < 0 ? -e : w, sz < 0 ? -e : w, sx < 0 ? -w : e, sz < 0 ? -w : e);
    // a wall across every side the route doesn't go through
    if (!open[0]) box(w, -w, e, w);
    if (!open[2]) box(-e, -w, -w, w);
    if (!open[1]) box(-w, w, w, e);
    if (!open[3]) box(-w, -e, w, -w);
  }
}

// A cell of a doorgang: the walls reach down to its lower floor, and in front
// of each of its two doors four steps come down, as wide as the cell.
function buildPassageCell(b: Builder, p: Plan, r: NonNullable<Plan["rooms"][number]>, i: number, gx: number, gz: number, y0: number, s: Surf) {
  const cx = (gx + 0.5) * CELL, cz = (gz + 0.5) * CELL, half = CELL / 2;
  const lo = y0 - PASS_DROP;
  for (let d = 0; d < 4; d++) {
    const sk = sideAt(p.f, gx, gz, d).sk;
    if (sk === SK.OPEN) continue;
    const axisX = d % 2 === 0, Dn = axisX ? DX[d]! : DZ[d]!;
    const plane = (axisX ? cx : cz) + Dn * (half - T);
    const a = axisX ? cz : cx;
    b.vrect(axisX, plane, a - half, a + half, lo, y0, -Dn, s.wall, 1.0, lo);
  }
  // the steps: in front of the doors
  const tread = sp(L.TILEDARK, [0.9, 0.9, 0.92]), nose = sp(L.STEEL, [0.8, 0.8, 0.82]);
  for (const d of r.pass!) {
    if (!p.sides.get(i * 4 + d)?.door) continue;
    const axisX = d % 2 === 0, Dn = axisX ? DX[d]! : DZ[d]!;
    const wall = (axisX ? cx : cz) + Dn * (half - T);
    const a = axisX ? cz : cx;
    for (let k = 0; k < 4; k++) {
      const u0 = wall - Dn * k * PASS_RUN, u1 = wall - Dn * (k + 1) * PASS_RUN, top = y0 - (k + 1) * 0.15;
      const [ua, ub] = u0 < u1 ? [u0, u1] : [u1, u0];
      if (axisX) b.aabox(ua, lo, a - half, ub, top, a + half, { all: tread, ny: null }, 1);
      else b.aabox(a - half, lo, ua, a + half, top, ub, { all: tread, ny: null }, 1);
      // a steel nosing on the edge of each step
      const n = wall - Dn * (k + 1) * PASS_RUN;
      if (axisX) b.aabox(Math.min(n, n + Dn * 0.03), top - 0.02, a - half, Math.max(n, n + Dn * 0.03), top + 0.004, a + half, { all: nose, ny: null }, 0);
      else b.aabox(a - half, top - 0.02, Math.min(n, n + Dn * 0.03), a + half, top + 0.004, Math.max(n, n + Dn * 0.03), { all: nose, ny: null }, 0);
    }
  }
}
