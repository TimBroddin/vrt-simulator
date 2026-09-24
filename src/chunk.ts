// Turns a furnished plan into geometry: floors, ceilings, walls with openings,
// stairwells, elevator cars and the courtyard facades.
import { CEIL, CELL, CH, DOOR_H, DX, DZ, FLOOR_MAX, FLOOR_MIN, H, ST_HALF, ST_U1, ST_U2, ST_VM, T } from "./config";
import { Builder, LightCtx, UP, type Built, type RGB, type Spec, type V3 } from "./builder";
import { getFurnished } from "./furnish";
import { K, RT, SK, gardenStair, getStructure, kindAt, sideAt, stairFrame, type GardenStair, type Plan } from "./layout";
import { L } from "./layers";
import { buildFixture, buildProp } from "./props";

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
      switch (r.type) {
        case RT.OFFICE: return { floor: sp(L.CARPET_BLUE), ceil: sp(L.CEILMETAL), wall: sp(L.PLASTER), h: CEIL, base: true };
        case RT.MEETING: return { floor: sp(L.CARPET_GREY), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER, [0.95, 0.93, 0.88]), h: CEIL, base: true };
        case RT.BATH: return { floor: sp(L.TILE_SMALL), ceil: sp(L.CEILTILE), wall: sp(L.TILE_BLUE), h: CEIL, base: false };
        case RT.STORAGE: return { floor: sp(L.CONCRETE, [0.8, 0.8, 0.78]), ceil: sp(L.CONCRETE), wall: sp(L.PLASTER, [0.75, 0.75, 0.72]), h: CEIL, base: false };
        case RT.SERVER: return { floor: sp(L.TILE_SMALL, [0.7, 0.72, 0.75]), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER, [0.8, 0.82, 0.85]), h: CEIL, base: false };
        case RT.STUDIO: return { floor: sp(L.BLACK, [0.9, 0.9, 0.9]), ceil: sp(L.BLACK, [0.6, 0.6, 0.6]), wall: sp(L.BLACK), h: 3.3, base: false };
        case RT.CANTEEN: return { floor: sp(L.TILEDARK, [1.1, 1.05, 1.0]), ceil: sp(L.CEILTILE), wall: sp(L.PLASTER, [0.95, 0.9, 0.82]), h: CEIL, base: true };
        case RT.ARCHIVE: return { floor: sp(L.CONCRETE), ceil: sp(L.CONCRETE, [0.8, 0.8, 0.8]), wall: sp(L.BRICK, [0.8, 0.8, 0.78]), h: CEIL, base: false };
        case RT.REGIE: return { floor: sp(L.CARPET_GREY, [0.6, 0.6, 0.65]), ceil: sp(L.BLACK), wall: sp(L.BLACK, [1.4, 1.4, 1.45]), h: CEIL, base: false };
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
    } else if (f === a.f1) {
      b.hrect(x0, z0, x1, z1, y0 + CEIL + 0.01, false, { layer: L.FROSTED, emit: [1.45, 1.5, 1.58], uv: [0, 0, 1, 1] }, 0);
      b.aabox(x0, y0 + CEIL - 0.08, z0 + 1.45, x1, y0 + CEIL, z0 + 1.55, DARKTRIM);
      b.aabox(x0 + 1.45, y0 + CEIL - 0.08, z0, x0 + 1.55, y0 + CEIL, z1, DARKTRIM);
    }
    return;
  }
  const s = surf(p, i);
  if (k !== K.STAIR) {
    b.hrect(x0, z0, x1, z1, y0, true, s.floor);
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
      const trim = door.kind === "fire" ? sp(L.WHITE, [0.3, 0.32, 0.33]) : sp(L.WHITE, [0.55, 0.52, 0.48]);
      sbox(-w / 2 - 0.06, -w / 2, T - 0.02, T + 0.001, 0, dh + 0.06, trim);
      sbox(w / 2, w / 2 + 0.06, T - 0.02, T + 0.001, 0, dh + 0.06, trim);
      sbox(-w / 2, w / 2, T - 0.02, T + 0.001, dh, dh + 0.06, trim);
      if (door.owner === i) {
        const dspec: Spec = door.kind === "fire" ? { layer: L.DOOR_STEEL, uv: [0, 0, 1, 1] } : { layer: L.DOOR_WOOD, uv: [0, 0, 1, 1] };
        const edge = DARKTRIM;
        const leaves = door.kind === "double" ? [[-w / 2, 0, -1], [0, w / 2, 1]] : [[-w / 2, w / 2, 1]];
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
  const n2 = f - FLOOR_MIN;
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
  const tread = sp(L.WHITE, [0.55, 0.78, 0.82]);
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
  void cx;
  void cz;
}
