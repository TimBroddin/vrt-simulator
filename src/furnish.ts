// Phase 2: lights and props. Only reads phase-1 plans (own + neighbours).
import { CEIL, CELL, CH, DOOR_H, DX, DZ, FLOOR_MAX, FLOOR_MIN, H, MID_CZ, T } from "./config";
import { K, RT, SK, gardenStair, getPlan, idx, roomAnomaly, sideAt, stairFrame, type Plan, type Room } from "./layout";
import { Rng, hash } from "./rng";
import { ART, pickArt } from "./art";

export interface Light {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  range: number;
  flick: number; // 0 = steady, otherwise phase
  on: boolean;
  gx: number;
  gz: number;
  fix: string | null;
  rot: number;
}

export interface Prop {
  t: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  gx: number;
  gz: number;
  a: number;
  b: number;
}

export interface Furnished {
  plan: Plan;
  lights: Light[];
  props: Prop[];
}

const FLUO: [number, number, number] = [1.0, 0.96, 0.84];
const COOL: [number, number, number] = [0.84, 0.94, 1.0];
const DAY: [number, number, number] = [0.8, 0.88, 1.0];
const WARM: [number, number, number] = [1.0, 0.8, 0.58];
const GREEN: [number, number, number] = [0.25, 1.0, 0.5];
const BLUE: [number, number, number] = [0.35, 0.55, 1.0];
const RED: [number, number, number] = [1.0, 0.15, 0.1];

const cache = new Map<string, Furnished>();

export function getFurnished(f: number, cx: number, cz: number): Furnished {
  const key = f + ":" + cx + "," + cz;
  let r = cache.get(key);
  if (r) return r;
  r = furnish(getPlan(f, cx, cz));
  cache.set(key, r);
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return r;
}

export const faceRot = (d: number) => Math.atan2(-DX[d]!, -DZ[d]!);

function furnish(p: Plan): Furnished {
  const { f, cx, cz } = p;
  const rng = new Rng(hash(201, f, cx, cz));
  const lights: Light[] = [];
  const props: Prop[] = [];
  const y0 = f * H;
  const dist = Math.hypot(cx, cz);
  const deadP = Math.min(0.45, 0.07 + dist * 0.012);
  const flickP = Math.min(0.22, 0.035 + dist * 0.005);
  const gx0 = cx * CH, gz0 = cz * CH;
  const rtbf = cz < MID_CZ;

  const light = (
    x: number, y: number, z: number, col: readonly number[], int: number, range: number,
    gx: number, gz: number, fix: string | null, opts: { rot?: number; dead?: boolean; flick?: boolean } = {},
  ) => {
    const on = !opts.dead;
    lights.push({
      x, y, z, r: col[0]! * int, g: col[1]! * int, b: col[2]! * int, range,
      flick: on && opts.flick ? 0.1 + rng.next() * 50 : 0, on, gx, gz, fix, rot: opts.rot ?? 0,
    });
  };
  const prop = (t: string, x: number, y: number, z: number, rot: number, gx: number, gz: number, a = 0, b = 0) =>
    props.push({ t, x, y, z, rot, gx, gz, a, b });

  // a work from the VRT collection with its own picture light
  const hangArt = (wx: number, wz: number, d: number, gx: number, gz: number, lamp = true) => {
    if (rtbf) return; // the VRT collection hangs on the VRT side only
    const a = pickArt(rng.next());
    const art = ART[a]!;
    const h = Math.max(1.5, 0.95 + art.h / 2);
    prop("art", wx, y0 + h, wz, faceRot(d), gx, gz, a, lamp ? 1 : 0);
    if (lamp) light(wx - DX[d]! * 0.7, y0 + h + art.h / 2 + 0.1, wz - DZ[d]! * 0.7, WARM, 0.7, 3.4, gx, gz, null);
  };
  const center = (i: number) => {
    const gx = gx0 + (i % CH), gz = gz0 + ((i / CH) | 0);
    return { gx, gz, x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL };
  };
  const wallPoint = (i: number, d: number, inset = 0, along = 0) => {
    const c = center(i);
    const pd = (d + 1) % 4;
    return {
      ...c,
      wx: c.x + DX[d]! * (CELL / 2 - T - inset) + DX[pd]! * along,
      wz: c.z + DZ[d]! * (CELL / 2 - T - inset) + DZ[pd]! * along,
    };
  };
  const sides = (i: number) => {
    const c = center(i);
    return [0, 1, 2, 3].map((d) => sideAt(f, c.gx, c.gz, d));
  };
  const hasDoor = (i: number) => sides(i).some((s) => s.sk === SK.DOOR || (s.sk === SK.GLASS && s.door && s.door.w > 0));
  const wallDirs = (i: number) => sides(i).map((s, d) => (s.sk === SK.WALL ? d : -1)).filter((d) => d >= 0);

  // --- Stairwell lights (every floor band)
  const sf = stairFrame(cx, cz);
  if (sf) {
    const w = (u: number, v: number) => ({ x: sf.ox + sf.Dx * u + sf.Px * v, z: sf.oz + sf.Dz * u + sf.Pz * v });
    const a = w(0.7, 0.2);
    const agx = sf.ax, agz = sf.az;
    const dead = rng.chance(deadP * 0.6);
    light(a.x, y0 + 2.3, a.z, FLUO, 1.1, 6, agx, agz, "bulkhead", { rot: Math.atan2(sf.Px, sf.Pz), dead, flick: rng.chance(flickP) });
    if (f < FLOOR_MAX) {
      const m = w(5.3, 2.8);
      light(m.x, y0 + H / 2 + 2.3, m.z, FLUO, 1.1, 6, agx + sf.Dx, agz + sf.Dz, "bulkhead", {
        rot: Math.atan2(-sf.Px, -sf.Pz), dead: rng.chance(deadP * 0.6), flick: rng.chance(flickP),
      });
    }
  }

  // --- Elevator cars
  if (f !== FLOOR_MAX)
    for (const e of p.st.elevs) {
      const c = center(e.e);
      light(c.x, y0 + 2.38, c.z, WARM, 1.0, 4, c.gx, c.gz, "panel", { rot: 0 });
    }

  if (f === FLOOR_MAX) {
    furnishRoof(p, rng, prop);
    return { plan: p, lights, props };
  }

  if (f === FLOOR_MIN) {
    for (let i = 0; i < CH * CH; i++) {
      if (p.kind[i] !== K.GARAGE) continue;
      const c = center(i);
      if (c.gx % 2 === 0 && c.gz % 2 === 0) {
        light(c.x, y0 + 2.45, c.z, [0.88, 1.0, 0.86], 1.5, 9, c.gx, c.gz, "tube", {
          rot: 0, dead: rng.chance(0.4), flick: rng.chance(0.15),
        });
        // pillar at the cell's NW corner if all four cells around it are open garage
        const cornerOk = [[-1, -1], [0, -1], [-1, 0]].every(([ox, oz]) => kindAtLocal(p, i, ox!, oz!) === K.GARAGE);
        if (cornerOk) prop("pillar", c.gx * CELL, y0, c.gz * CELL, 0, c.gx, c.gz);
      }
      const row = ((c.gz % 4) + 4) % 4;
      const nearCore = [0, 1, 2, 3].some((d) => {
        const k = kindAtLocal(p, i, DX[d]!, DZ[d]!);
        return k === K.STAIR || k === K.ELEV;
      });
      if ((row === 1 || row === 2) && !nearCore && rng.chance(0.42))
        prop("car", c.x + rng.range(-0.2, 0.2), y0, c.z + (row === 1 ? 0.2 : -0.2), row === 1 ? 0 : Math.PI, c.gx, c.gz, rng.int(0, 7));
      if (row === 0 && c.gx % 5 === 0 && rng.chance(0.5)) prop("pipe", c.x, y0 + 2.35, c.z, 0, c.gx, c.gz);
      for (let d = 0; d < 4; d++) {
        const s = sideAt(f, c.gx, c.gz, d);
        if (s.sk === SK.DOOR && s.door?.kind === "fire") {
          const wp = wallPoint(i, d, -0.02);
          prop("exit", wp.wx, y0 + DOOR_H + 0.28, wp.wz, faceRot(d), c.gx, c.gz);
          light(wp.wx - DX[d]! * 0.4, y0 + DOOR_H + 0.2, wp.wz - DZ[d]! * 0.4, GREEN, 0.5, 3, c.gx, c.gz, null);
        }
      }
    }
    return { plan: p, lights, props };
  }

  // --- Office floors
  const style = p.style;
  const atr = p.st.atrium;
  const inAtrium = atr && f >= atr.f0 && f <= atr.f1;

  for (let i = 0; i < CH * CH; i++) {
    const k = p.kind[i];
    const c = center(i);
    if (k === K.VOID || (k === K.CORR && p.zone[i] === 2)) {
      if (inAtrium) {
        const fall = 1 - (atr!.f1 - f) * 0.09;
        light(c.x, y0 + 2.4, c.z, DAY, 0.95 * fall, 7.5, c.gx, c.gz, null);
      }
      continue;
    }
    if (k !== K.CORR) continue;
    const sd = sides(i);
    const axisX = sd[0]!.sk === SK.OPEN || sd[2]!.sk === SK.OPEN;
    if (((c.gx + c.gz) & 1) === 0 || p.zone[i] === 1) {
      const fix = style === 0 ? "strip" : style === 1 ? "panel" : "tube";
      light(c.x, y0 + CEIL - 0.03, c.z, style === 2 ? [0.92, 1.0, 0.9] : FLUO, style === 0 ? 1.05 : 1.2, 7, c.gx, c.gz, fix, {
        rot: axisX ? 0 : Math.PI / 2,
        dead: p.dark ? rng.chance(0.8) : rng.chance(deadP),
        flick: rng.chance(flickP),
      });
    }
    // the studio clocks hang in every hallway (all stopped at 19:00)
    if (p.zone[i] !== 2 && hash(78, f, c.gx, c.gz) % 100 < (p.st.mid ? 30 : 22)) {
      const off = 0.9;
      prop("hangclock", c.x + (axisX ? off : 0), y0 + CEIL, c.z + (axisX ? 0 : off), axisX ? Math.PI / 2 : 0, c.gx, c.gz);
    }
    if (p.st.mid) {
      const lz = (i / CH) | 0;
      if (lz === 5 && ((c.gx % 4) + 4) % 4 === 0) prop("hangsign", c.x, y0 + CEIL, c.z + CELL / 2, Math.PI / 2, c.gx, c.gz, ((c.gx % 8) + 8) % 8 === 0 ? 1 : 0);
      if (lz === 5 && ((c.gx % 4) + 4) % 4 === 2) prop("speaker", c.x, y0 + CEIL - 0.1, c.z - 1.3, 0, c.gx, c.gz);
    }
    const nOpen = sd.filter((s) => s.sk !== SK.WALL).length;
    let used = 0;
    for (let d = 0; d < 4; d++) {
      const s = sd[d]!;
      if (s.sk === SK.DOOR && s.door) {
        const other = kindAtLocal(p, i, DX[d]!, DZ[d]!);
        const wp = wallPoint(i, d, -0.02);
        if (s.door.kind === "fire") {
          prop("exit", wp.wx, y0 + DOOR_H + 0.28, wp.wz, faceRot(d), c.gx, c.gz);
          light(wp.wx - DX[d]! * 0.4, y0 + DOOR_H + 0.2, wp.wz - DZ[d]! * 0.4, GREEN, 0.45, 3, c.gx, c.gz, null);
        } else if (other === K.ROOM) {
          const r = roomAcross(p, i, d);
          if (r && r.type === RT.STUDIO) {
            const on = rng.chance(0.5);
            prop("onair", wp.wx, y0 + DOOR_H + 0.32, wp.wz, faceRot(d), c.gx, c.gz, on ? 1 : 0);
            if (on) light(wp.wx - DX[d]! * 0.4, y0 + DOOR_H + 0.3, wp.wz - DZ[d]! * 0.4, RED, 0.6, 3.5, c.gx, c.gz, null);
          }
          if (r) {
            const sign = signFor(r.type);
            const off = (s.door.w / 2 + 0.35) * (rng.chance(0.5) ? 1 : -1);
            if (sign >= 0) {
              const sp = wallPoint(i, d, -0.01, off);
              prop("sign", sp.wx, y0 + 1.55, sp.wz, faceRot(d), c.gx, c.gz, sign, rtbf ? 1 : 0);
            }
          }
        }
        used |= 1 << d;
      }
    }
    // dead ends get a glowing frosted window
    if (nOpen === 1 && p.zone[i] !== 1) {
      const openD = sd.findIndex((s) => s.sk !== SK.WALL);
      const d = (openD + 2) % 4;
      if (sd[d]!.sk === SK.WALL && rng.chance(0.7)) {
        const wp = wallPoint(i, d, -0.01);
        prop("frosted", wp.wx, y0, wp.wz, faceRot(d), c.gx, c.gz);
        light(wp.wx - DX[d]! * 0.6, y0 + 1.5, wp.wz - DZ[d]! * 0.6, DAY, 1.2, 8, c.gx, c.gz, null);
        used |= 1 << d;
      }
    }
    // wall dressing
    for (let d = 0; d < 4; d++) {
      if (used & (1 << d) || sd[d]!.sk !== SK.WALL) continue;
      const wp = wallPoint(i, d);
      const rot = faceRot(d);
      // architectural oddities: a door onto brick, a door for someone very small, a window onto nothing
      const oddK = 1 + Math.min(2, dist * 0.08);
      const odd = rng.next();
      if (!p.st.mid && p.zone[i] !== 1) {
        if (odd < 0.02 * oddK) { prop("fakedoor", wp.wx, y0, wp.wz, rot, c.gx, c.gz); continue; }
        if (odd < 0.032 * oddK) { prop("tinydoor", wp.wx, y0, wp.wz, rot, c.gx, c.gz, rng.int(0, 1)); continue; }
        if (odd < 0.046 * oddK) { prop("blackwindow", wp.wx, y0, wp.wz, rot, c.gx, c.gz); continue; }
      }
      if (rng.chance(p.zone[i] === 1 ? 0.35 : 0.09)) {
        hangArt(wp.wx, wp.wz, d, c.gx, c.gz);
        continue;
      }
      const r = rng.next();
      if (r < 0.1) prop("extinguisher", wp.wx, y0, wp.wz, rot, c.gx, c.gz);
      else if (r < 0.15) prop("hosebox", wp.wx, y0, wp.wz, rot, c.gx, c.gz);
      else if (r < 0.26) prop("poster", wp.wx, y0 + 1.5, wp.wz, rot, c.gx, c.gz, rtbf ? rng.int(8, 11) : rng.int(0, 7));
      else if (r < 0.29) prop("clock", wp.wx, y0 + 2.2, wp.wz, rot, c.gx, c.gz);
      else if (r < 0.33) prop("bench", wp.wx, y0, wp.wz, rot, c.gx, c.gz);
      else if (r < 0.36) prop("plant", wp.wx, y0, wp.wz, rot, c.gx, c.gz);
      else if (r < 0.38) prop("cooler", wp.wx, y0, wp.wz, rot, c.gx, c.gz);
      else if (r < 0.41) prop("notice", wp.wx, y0 + 1.45, wp.wz, rot, c.gx, c.gz);
      else if (r < 0.44 || (p.zone[i] === 1 && r < 0.55)) {
        const scr = rng.int(0, 3);
        prop("tv", wp.wx, y0 + 1.9, wp.wz, rot, c.gx, c.gz, scr);
        if (scr !== 3) light(wp.wx - DX[d]! * 0.5, y0 + 1.8, wp.wz - DZ[d]! * 0.5, COOL, 0.35, 3, c.gx, c.gz, null);
      } else if (r < 0.46) prop("bin", wp.wx, y0, wp.wz, rot, c.gx, c.gz);
      else if (r < 0.475) prop("vending", wp.wx, y0, wp.wz, rot, c.gx, c.gz, rng.int(0, 1));
    }
    // held-open fire doors at chunk seams
    if ((c.gx === gx0 && sd[2]!.sk === SK.OPEN) || (c.gz === gz0 && sd[3]!.sk === SK.OPEN)) {
      const d = c.gx === gx0 && sd[2]!.sk === SK.OPEN ? 2 : 3;
      if (hash(77, f, c.gx, c.gz) % 100 < 45) prop("firedoor", c.x + DX[d]! * CELL * 0.5, y0, c.z + DZ[d]! * CELL * 0.5, faceRot(d), c.gx, c.gz);
    }
    // windows onto courtyards
    for (let d = 0; d < 4; d++)
      if (sd[d]!.sk === SK.WINDOW) {
        const wp = wallPoint(i, d, 0.7);
        light(wp.wx, y0 + 1.7, wp.wz, DAY, 1.0, 7, c.gx, c.gz, null);
      }
  }

  // Plantentuin: planters with trees along the floating stair, two info screens.
  const gs = gardenStair(p.st);
  if (inAtrium && f === atr!.f0 && gs) {
    for (let z = atr!.z0; z <= atr!.z1; z++)
      for (let x = atr!.x0; x <= atr!.x1; x++) {
        const c = center(idx(x, z));
        const s = gs.alongX ? c.x : c.z, lat = gs.alongX ? c.z : c.x;
        const side = Math.sign(lat - gs.pc) || 1;
        const onStair = s > gs.sb - 1.2;
        // keep a walkway free along the lane and in front of the stair's foot
        const px = gs.alongX ? c.x : gs.pc + side * 1.75;
        const pz = gs.alongX ? gs.pc + side * 1.75 : c.z;
        if (!onStair || rng.chance(0.7)) prop("planter", px, y0, pz, gs.alongX ? 0 : Math.PI / 2, c.gx, c.gz, rng.chance(0.55) ? 1 : 0, rng.int(0, 99));
      }
    const end = gs.sb - 2.6;
    const sx = gs.alongX ? end : gs.pc, sz = gs.alongX ? gs.pc : end;
    const sgx = Math.floor(sx / CELL), sgz = Math.floor(sz / CELL);
    prop("screens", sx, y0, sz, gs.alongX ? -Math.PI / 2 : Math.PI, sgx, sgz);
    light(sx, y0 + 1.6, sz, COOL, 0.5, 4, sgx, sgz, null);
  }

  // Atrium lobby: a tree in a round red bench, like the NWS hall.
  if (inAtrium && f === atr!.f0 && !gs) {
    const mx = (gx0 + (atr!.x0 + atr!.x1 + 1) / 2) * CELL;
    const mz = (gz0 + (atr!.z0 + atr!.z1 + 1) / 2) * CELL;
    prop("tree", mx, y0, mz, 0, gx0 + atr!.x0, gz0 + atr!.z0);
    // big NWS wall graphic on a ring wall
    for (let z = atr!.z0 - 1; z <= atr!.z1 + 1; z++)
      for (let x = atr!.x0 - 1; x <= atr!.x1 + 1; x++) {
        const i = idx(x, z);
        const wd = wallDirs(i);
        if (wd.length && rng.chance(0.35)) {
          const wp = wallPoint(i, wd[0]!, -0.01);
          prop("nwswall", wp.wx, y0, wp.wz, faceRot(wd[0]!), wp.gx, wp.gz);
        }
      }
  }

  // Rooms
  for (const room of p.rooms) {
    if (p.kind[room.cells[0]!] !== K.ROOM) continue;
    furnishRoom(p, room, rng, { light, prop, center, wallPoint, wallDirs, hasDoor, deadP, flickP, y0, hangArt });
  }

  // Windows in rooms
  for (const room of p.rooms)
    for (const i of room.cells) {
      if (p.kind[i] !== K.ROOM) continue;
      const sd = sides(i);
      const c = center(i);
      for (let d = 0; d < 4; d++)
        if (sd[d]!.sk === SK.WINDOW) {
          const wp = wallPoint(i, d, 0.7);
          light(wp.wx, y0 + 1.7, wp.wz, DAY, 1.0, 7, c.gx, c.gz, null);
        }
    }

  return { plan: p, lights, props };
}

function kindAtLocal(p: Plan, i: number, ox: number, oz: number) {
  const x = (i % CH) + ox, z = ((i / CH) | 0) + oz;
  if (x >= 0 && z >= 0 && x < CH && z < CH) return p.kind[idx(x, z)]!;
  const gx = p.cx * CH + x, gz = p.cz * CH + z;
  const cx = Math.floor(gx / CH), cz = Math.floor(gz / CH);
  const q = getPlan(p.f, cx, cz);
  return q.kind[idx(gx - cx * CH, gz - cz * CH)]!;
}

function roomAcross(p: Plan, i: number, d: number): Room | null {
  const x = (i % CH) + DX[d]!, z = ((i / CH) | 0) + DZ[d]!;
  if (x < 0 || z < 0 || x >= CH || z >= CH) return null;
  const r = p.room[idx(x, z)]!;
  return r >= 0 ? p.rooms[r]! : null;
}

// index into the SIGNS atlas
function signFor(t: number) {
  switch (t) {
    case RT.BATH: return 0;
    case RT.ARCHIVE: return 1;
    case RT.STUDIO: return 2;
    case RT.REGIE: return 3;
    case RT.CANTEEN: return 4;
    case RT.SERVER: return 5;
    case RT.EDIT: return 6;
    case RT.MEETING: return 7;
  }
  return -1;
}

interface Ctx {
  light: (x: number, y: number, z: number, col: readonly number[], int: number, range: number, gx: number, gz: number, fix: string | null, opts?: { rot?: number; dead?: boolean; flick?: boolean }) => void;
  prop: (t: string, x: number, y: number, z: number, rot: number, gx: number, gz: number, a?: number, b?: number) => void;
  center: (i: number) => { gx: number; gz: number; x: number; z: number };
  wallPoint: (i: number, d: number, inset?: number, along?: number) => { gx: number; gz: number; x: number; z: number; wx: number; wz: number };
  wallDirs: (i: number) => number[];
  hasDoor: (i: number) => boolean;
  deadP: number;
  flickP: number;
  y0: number;
  hangArt: (wx: number, wz: number, d: number, gx: number, gz: number, lamp?: boolean) => void;
}

function furnishRoom(p: Plan, room: Room, rng: Rng, c: Ctx) {
  const { light, prop, center, wallPoint, wallDirs, hasDoor, y0 } = c;
  const w = room.x1 - room.x0 + 1, d = room.z1 - room.z0 + 1;
  const alongX = w >= d;
  const rot = alongX ? 0 : Math.PI / 2;
  const dead = () => room.dark || rng.chance(c.deadP);
  const flick = () => rng.chance(c.flickP);
  const cells = room.cells;
  const panelLights = (col: readonly number[], int: number, every = 1, fix = "panel", alwaysOn = false) => {
    cells.forEach((i, n) => {
      if (n % every) return;
      const q = center(i);
      light(q.x, y0 + CEIL - 0.03, q.z, col, int, 7, q.gx, q.gz, fix, { rot, dead: alwaysOn ? false : dead(), flick: flick() });
    });
  };
  const roomCenter = {
    x: ((p.cx * CH + room.x0 + p.cx * CH + room.x1 + 1) / 2) * CELL,
    z: ((p.cz * CH + room.z0 + p.cz * CH + room.z1 + 1) / 2) * CELL,
  };
  const g0 = center(cells[0]!);
  const an = roomAnomaly(p, room);
  if (an && an !== "upside") {
    const lw = (alongX ? w : d) * CELL, ld = (alongX ? d : w) * CELL;
    if (an === "low") {
      // lights further and further apart
      cells.forEach((i, n) => {
        if (n % 2) return;
        const q = center(i);
        light(q.x, y0 + 1.99, q.z, FLUO, 0.8, 5, q.gx, q.gz, "panel", { rot, dead: rng.chance(0.25 + n * 0.08), flick: rng.chance(0.3) });
      });
    } else if (an === "chairs") {
      panelLights(FLUO, 1.0, 1, "panel", true);
      prop("chairfield", roomCenter.x, y0, roomCenter.z, rot, g0.gx, g0.gz, lw - 1.4, ld - 1.4);
    } else if (an === "stairs") {
      panelLights(FLUO, 1.1, 1, "panel", true);
      prop("stairsup", roomCenter.x, y0, roomCenter.z, rot + (rng.chance(0.5) ? Math.PI : 0), g0.gx, g0.gz);
    } else if (an === "flooded") {
      for (const i of cells) {
        const q = center(i);
        const off = rng.chance(0.3);
        prop("water", q.x, y0, q.z, rot, q.gx, q.gz, off ? 0 : 1);
        light(q.x, y0 + CEIL - 0.1, q.z, [0.8, 0.95, 1.0], 1.0, 5.5, q.gx, q.gz, "tube", { rot, dead: off, flick: rng.chance(0.3) });
      }
    }
    return;
  }
  // Walls along the room perimeter, used for big wall items.
  const perimeter: [number, number][] = [];
  for (const i of cells) for (const dd of wallDirs(i)) perimeter.push([i, dd]);

  switch (room.type) {
    case RT.OFFICE: {
      panelLights(COOL, 1.15, 1, "panel");
      for (const i of cells) {
        const q = center(i);
        if (!hasDoor(i) && rng.chance(0.85)) prop(an === "upside" ? "upside" : "desks", q.x, y0, q.z, rot, q.gx, q.gz, rng.int(0, 99));
        for (const dd of wallDirs(i)) {
          const r = rng.next();
          const wp = wallPoint(i, dd);
          if (r < 0.18) prop("cabinet", wp.wx, y0, wp.wz, faceRot(dd), q.gx, q.gz);
          else if (r < 0.26) prop("plant", wp.wx, y0, wp.wz, faceRot(dd), q.gx, q.gz);
          else if (r < 0.3) prop("whiteboard", wp.wx, y0 + 1.4, wp.wz, faceRot(dd), q.gx, q.gz);
          else if (r < 0.33) prop("clock", wp.wx, y0 + 2.2, wp.wz, faceRot(dd), q.gx, q.gz);
          else if (r < 0.45) c.hangArt(wp.wx, wp.wz, dd, q.gx, q.gz, false);
        }
      }
      break;
    }
    case RT.MEETING: {
      panelLights(COOL, 1.1, 1);
      const lx = Math.max(1.2, Math.min(5, (alongX ? w : d) * CELL - 2.4));
      const lz = Math.max(0.9, Math.min(1.6, (alongX ? d : w) * CELL - 2.4));
      prop("mtable", roomCenter.x, y0, roomCenter.z, rot, g0.gx, g0.gz, lx, lz);
      if (perimeter.length) {
        const [i, dd] = rng.pick(perimeter);
        const wp = wallPoint(i, dd);
        const scr = rng.int(0, 3);
        prop("tv", wp.wx, y0 + 1.5, wp.wz, faceRot(dd), wp.gx, wp.gz, scr);
        if (scr !== 3) light(wp.wx - DX[dd]! * 0.6, y0 + 1.5, wp.wz - DZ[dd]! * 0.6, COOL, 0.45, 4, wp.gx, wp.gz, null);
        const [j, d2] = rng.pick(perimeter);
        if (j !== i || d2 !== dd) {
          const wq = wallPoint(j, d2);
          if (rng.chance(0.5)) prop("whiteboard", wq.wx, y0 + 1.4, wq.wz, faceRot(d2), wq.gx, wq.gz);
          else c.hangArt(wq.wx, wq.wz, d2, wq.gx, wq.gz, false);
        }
      }
      break;
    }
    case RT.BATH: {
      panelLights([0.9, 1.0, 1.0], 1.3, 1);
      for (const i of cells) {
        const wd = wallDirs(i);
        if (!wd.length) continue;
        const dd = rng.pick(wd);
        const wp = wallPoint(i, dd);
        prop(rng.chance(0.5) ? "stalls" : "sinks", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz);
      }
      break;
    }
    case RT.STORAGE: {
      for (const i of cells) {
        const q = center(i);
        light(q.x, y0 + CEIL - 0.1, q.z, WARM, 0.8, 5, q.gx, q.gz, "bulb", { dead: rng.chance(0.4), flick: flick() });
        for (const dd of wallDirs(i)) if (rng.chance(0.7)) {
          const wp = wallPoint(i, dd);
          prop("shelf", wp.wx, y0, wp.wz, faceRot(dd), q.gx, q.gz, rng.int(0, 99));
        }
      }
      break;
    }
    case RT.SERVER: {
      for (const i of cells) {
        const q = center(i);
        prop("racks", q.x, y0, q.z, rot, q.gx, q.gz, rng.int(0, 99));
        light(q.x, y0 + 1.2, q.z, BLUE, 0.5, 4, q.gx, q.gz, null, { flick: rng.chance(0.2) });
        light(q.x, y0 + CEIL - 0.03, q.z, COOL, 0.9, 6, q.gx, q.gz, "tube", { rot, dead: rng.chance(0.6) });
      }
      break;
    }
    case RT.STUDIO: {
      // backdrop on the longest wall run, desk in front of it, cameras facing.
      const byDir = [0, 0, 0, 0];
      for (const [, dd] of perimeter) byDir[dd]!++;
      const bd = byDir.indexOf(Math.max(...byDir));
      for (const [i, dd] of perimeter) if (dd === bd) {
        const wp = wallPoint(i, dd, -0.01);
        prop("backdrop", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, room.num % 2);
        light(wp.wx - DX[dd]! * 0.8, y0 + 1.8, wp.wz - DZ[dd]! * 0.8, [0.6, 0.75, 1.0], room.dark ? 0.35 : 0.7, 7, wp.gx, wp.gz, null);
      }
      const dx = -DX[bd]!, dz = -DZ[bd]!;
      const depth = (bd % 2 === 0 ? w : d) * CELL;
      const ex = roomCenter.x - dx * (depth / 2 - 2.2);
      const ez = roomCenter.z - dz * (depth / 2 - 2.2);
      prop("newsdesk", ex, y0, ez, Math.atan2(dx, dz), g0.gx, g0.gz);
      if (!room.dark) light(ex + dx * 1.2, y0 + 2.6, ez + dz * 1.2, WARM, 1.3, 6, g0.gx, g0.gz, null);
      for (let k = -1; k <= 1; k++) {
        const px = ex + dx * 3.6 + dz * k * 1.8, pz = ez + dz * 3.6 - dx * k * 1.8;
        prop("camera", px, y0, pz, Math.atan2(-dx, -dz) + k * -0.25, g0.gx, g0.gz, k === 0 && rng.chance(0.5) ? 1 : 0);
      }
      for (const i of cells) {
        const q = center(i);
        prop("rig", q.x, y0 + 3.0, q.z, 0, q.gx, q.gz);
      }
      break;
    }
    case RT.CANTEEN: {
      panelLights(WARM, 1.2, 1);
      for (const i of cells) {
        const q = center(i);
        if (!hasDoor(i)) prop("ctable", q.x, y0, q.z, rot, q.gx, q.gz, rng.int(0, 99));
      }
      let vend = 0;
      const taken = new Set<string>();
      for (const [i, dd] of rng.shuffle([...perimeter])) {
        if (vend >= 2) break;
        taken.add(i + ":" + dd);
        const wp = wallPoint(i, dd);
        prop("vending", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, vend);
        light(wp.wx - DX[dd]! * 0.7, y0 + 1.3, wp.wz - DZ[dd]! * 0.7, COOL, 0.5, 3.5, wp.gx, wp.gz, null);
        vend++;
      }
      for (const [i, dd] of perimeter)
        if (!taken.has(i + ":" + dd) && rng.chance(0.2)) {
          const wp = wallPoint(i, dd);
          c.hangArt(wp.wx, wp.wz, dd, wp.gx, wp.gz, false);
        }
      break;
    }
    case RT.ARCHIVE: {
      for (const i of cells) {
        const q = center(i);
        if (!hasDoor(i)) prop("tapes", q.x, y0, q.z, rot, q.gx, q.gz, rng.int(0, 99));
        light(q.x, y0 + CEIL - 0.05, q.z, [0.95, 1.0, 0.85], 1.0, 6, q.gx, q.gz, "tube", { rot, dead: rng.chance(0.45), flick: flick() });
      }
      break;
    }
    case RT.REGIE: {
      const byDir = [0, 0, 0, 0];
      for (const [, dd] of perimeter) byDir[dd]!++;
      const bd = byDir.indexOf(Math.max(...byDir));
      for (const [i, dd] of perimeter) if (dd === bd) {
        const wp = wallPoint(i, dd);
        prop("monwall", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 99));
        light(wp.wx - DX[dd]! * 1.0, y0 + 1.6, wp.wz - DZ[dd]! * 1.0, COOL, 0.75, 6, wp.gx, wp.gz, null, { flick: rng.chance(0.15) });
        const dp = wallPoint(i, dd, 1.5);
        prop("mixdesk", dp.wx, y0, dp.wz, faceRot(dd), wp.gx, wp.gz);
      }
      panelLights(WARM, 0.7, 2, "panel");
      break;
    }
    case RT.EMPTY: {
      panelLights(FLUO, 1.0, 2);
      if (rng.chance(0.5)) prop("chair", roomCenter.x, y0, roomCenter.z, rng.range(0, 6.28), g0.gx, g0.gz);
      break;
    }
    case RT.EDIT: {
      cells.forEach((i) => {
        const q = center(i);
        light(q.x, y0 + CEIL - 0.1, q.z, WARM, 0.75, 5, q.gx, q.gz, "bulb", { dead: dead(), flick: flick() });
      });
      const ps = rng.shuffle([...perimeter]);
      if (ps[0]) {
        const wp = wallPoint(ps[0][0], ps[0][1]);
        prop("editdesk", wp.wx, y0, wp.wz, faceRot(ps[0][1]), wp.gx, wp.gz);
        light(wp.wx - DX[ps[0][1]]! * 0.6, y0 + 1.2, wp.wz - DZ[ps[0][1]]! * 0.6, BLUE, 0.4, 3, wp.gx, wp.gz, null);
      }
      if (ps[1] && (ps[1][0] !== ps[0]![0] || cells.length === 1)) {
        const wp = wallPoint(ps[1][0], ps[1][1]);
        prop("sofa", wp.wx, y0, wp.wz, faceRot(ps[1][1]), wp.gx, wp.gz);
      }
      break;
    }
  }
}

function furnishRoof(p: Plan, rng: Rng, prop: Ctx["prop"]) {
  const y0 = p.f * H;
  for (let i = 0; i < CH * CH; i++) {
    if (p.kind[i] !== K.ROOF) continue;
    const gx = p.cx * CH + (i % CH), gz = p.cz * CH + ((i / CH) | 0);
    const x = (gx + 0.5) * CELL, z = (gz + 0.5) * CELL;
    let near = false;
    for (let d = 0; d < 4; d++) if (sideAt(p.f, gx, gz, d).sk !== SK.OPEN) near = true;
    const r = rng.next();
    if (!near && r < 0.05) prop("hvac", x, y0, z, rng.int(0, 1) * Math.PI / 2, gx, gz);
    else if (!near && r < 0.07) prop("antenna", x + rng.range(-1, 1), y0, z + rng.range(-1, 1), 0, gx, gz, rng.int(8, 16));
    else if (!near && r < 0.1) prop("dish", x, y0, z, rng.range(0, 6.28), gx, gz);
    else if (r < 0.14) prop("vent", x + rng.range(-1, 1), y0, z + rng.range(-1, 1), 0, gx, gz);
    if (rng.chance(0.3)) prop("puddle", x + rng.range(-0.8, 0.8), y0, z + rng.range(-0.8, 0.8), rng.range(0, 3), gx, gz, rng.range(0.6, 1.4));
    if (rng.chance(0.004)) prop("chair", x, y0, z, rng.range(0, 6.28), gx, gz);
  }
}
