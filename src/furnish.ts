// Phase 2: lights and props. Only reads phase-1 plans (own + neighbours).
import { CEIL, CELL, CH, DOOR_H, DX, DZ, FLOOR_MAX, FLOOR_MIN, H, MID_CZ, SNAKE_HALF, T, isRtbf } from "./config";
import { K, PASS_DROP, RT, SK, TALL, gardenStair, getPlan, idx, mazeAt, radioStation, roomAnomaly, setIsThuis, sideAt, stairFrame, tallTop, towerSpec, bosSpec, BAREEL, bareelLamps, bareelCanopyLamps, vosHill, isParkLane, PARK_Z0, PARK_Z1, type Plan, type Room } from "./layout";
import { Rng, hash } from "./rng";
import { ART, pickArt } from "./art";
import { Builder, LightCtx } from "./builder";
import { buildProp } from "./props";

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

// things hung on (or stood against) corridor walls
const WALL_DECOR = new Set(["poster", "tv", "notice", "clock", "art", "extinguisher", "hosebox", "bench", "plant", "cooler", "bin", "vending", "fakedoor", "tinydoor", "blackwindow"]);

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
    if (mazeAt(f, p.st)) furnishSnake(p, rng, { light, prop, center, wallPoint, wallDirs, hasDoor, deadP, flickP, y0, hangArt });
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
      // (the parking is empty: the one car left on it is a drivable one, see src/cars.ts)
      const row = ((c.gz % 4) + 4) % 4;
      if (row === 0 && c.gx % 5 === 0 && rng.chance(0.5)) prop("pipe", c.x, y0 + 2.35, c.z, 0, c.gx, c.gz);
      if (((c.gx % 6) + 6) % 6 === 3 && ((c.gz % 4) + 4) % 4 === 3 && hash(81, c.gx, c.gz) % 100 < 45)
        prop("cctv", c.x, y0 + 2.45, c.z, (hash(82, c.gx, c.gz) % 628) / 100, c.gx, c.gz, 30, 0);
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
  if (mazeAt(f, p.st)) {
    furnishSnake(p, rng, { light, prop, center, wallPoint, wallDirs, hasDoor, deadP, flickP, y0, hangArt });
    return { plan: p, lights, props };
  }
  const style = p.style;
  const atr = p.st.atrium;
  const inAtrium = atr && f >= atr.f0 && f <= atr.f1;

  for (let i = 0; i < CH * CH; i++) {
    const k = p.kind[i];
    const c = center(i);
    if (k === K.VOID || (k === K.CORR && p.zone[i] === 2)) {
      if (inAtrium && (atr!.kind === "lobby" || atr!.kind === "garden")) {
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
          if (r && (r.type === RT.STUDIO || r.type === RT.KETNET || r.type === RT.SPORZA || r.type === RT.SET || r.type === RT.JOURNAAL || r.type === RT.WEER)) {
            const on = rng.chance(0.5);
            prop("onair", wp.wx, y0 + DOOR_H + 0.32, wp.wz, faceRot(d), c.gx, c.gz, on ? 1 : 0);
            if (on) light(wp.wx - DX[d]! * 0.4, y0 + DOOR_H + 0.3, wp.wz - DZ[d]! * 0.4, RED, 0.6, 3.5, c.gx, c.gz, null);
          } else if (r && r.type === RT.RADIO && !rtbf) {
            // lights up whenever the ghost radio plays this station
            prop("onair", wp.wx, y0 + DOOR_H + 0.32, wp.wz, faceRot(d), c.gx, c.gz, 0, 1 + radioStation(p, r));
          }
          if (r) {
            const sign = signFor(r.type);
            const off = (s.door.w / 2 + 0.35) * (rng.chance(0.5) ? 1 : -1);
            if (sign >= 0) {
              const sp = wallPoint(i, d, -0.01, off);
              prop("sign", sp.wx, y0 + 1.55, sp.wz, faceRot(d), c.gx, c.gz, sign, rtbf ? 1 : 0);
            }
            // de koffiekamer: its sign on one side of the door, the price list on the other
            if (r.type === RT.KOFFIE) {
              const sp = wallPoint(i, d, -0.01, off);
              prop("ksign", sp.wx, y0 + 1.6, sp.wz, faceRot(d), c.gx, c.gz, 0, rtbf ? 1 : 0);
              const pp = wallPoint(i, d, -0.01, -off * 1.1);
              prop("prijslijst", pp.wx, y0 + 1.2, pp.wz, faceRot(d), c.gx, c.gz);
            }
            if (r.type === RT.DPC) {
              const sp = wallPoint(i, d, -0.01, off);
              prop("dpcsign", sp.wx, y0 + 1.55, sp.wz, faceRot(d), c.gx, c.gz, 0, rtbf ? 1 : 0);
            }
            if (r.type === RT.SHOWER || r.type === RT.BIKES || r.type === RT.VOS) {
              const sp = wallPoint(i, d, -0.01, off);
              prop("nwssign", sp.wx, y0 + 1.55, sp.wz, faceRot(d), c.gx, c.gz, r.type === RT.SHOWER ? 0 : r.type === RT.BIKES ? 1 : 2, rtbf ? 1 : 0);
            }
            if (r.type === RT.PERS || r.type === RT.LAB || r.type === RT.TIKTAK) {
              const sp = wallPoint(i, d, -0.01, off);
              prop("r3sign", sp.wx, y0 + 1.55, sp.wz, faceRot(d), c.gx, c.gz, r.type === RT.PERS ? 0 : r.type === RT.LAB ? 1 : 2, rtbf ? 1 : 0);
            }
            // a star for the guest, a nameplate for the CEO, a board for the restaurant
            const plaque = r.type === RT.DRESSING ? 7 : r.type === RT.CEO ? 3 : r.type === RT.VIPRESTO ? 4 : -1;
            if (plaque >= 0) {
              const pp = wallPoint(i, d, -0.01, -off);
              prop("plaque", pp.wx, y0 + (plaque === 4 ? 1.25 : 1.5), pp.wz, faceRot(d), c.gx, c.gz, plaque, plaque === 4 ? 1 : 0);
            }
          }
        } else if (other === K.CORR && s.door.kind === "double" && p.st.atrium?.kind === "props" && inAtrium && !p.zone[i]) {
          const sp = wallPoint(i, d, -0.01, s.door.w / 2 + 0.4);
          prop("sign", sp.wx, y0 + 1.55, sp.wz, faceRot(d), c.gx, c.gz, 9, rtbf ? 1 : 0);
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
      // the rekwisieten: shelving along every wall, upstairs and down
      if (inAtrium && atr!.kind === "props" && p.zone[i]) {
        if (rng.chance(0.8)) prop("shelf", wp.wx, y0, wp.wz, rot, c.gx, c.gz, rng.int(0, 99));
        continue;
      }
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
      else if (r < 0.26) prop("poster", wp.wx, y0 + 1.5, wp.wz, rot, c.gx, c.gz, rtbf ? rng.int(8, 11) : vrtPoster(rng.int(0, 19)));
      else if (r < 0.29) prop("clock", wp.wx, y0 + 2.2, wp.wz, rot, c.gx, c.gz);
      else if (r < 0.33) prop("bench", wp.wx, y0, wp.wz, rot, c.gx, c.gz);
      else if (r < 0.36) prop("plant", wp.wx, y0, wp.wz, rot, c.gx, c.gz);
      else if (r < 0.38) prop("cooler", wp.wx, y0, wp.wz, rot, c.gx, c.gz);
      else if (r < 0.41) prop("notice", wp.wx, y0 + 1.45, wp.wz, rot, c.gx, c.gz);
      else if (r < 0.44 || (p.zone[i] === 1 && r < 0.55)) {
        const scr = rtbf ? rng.int(0, 3) : rng.int(0, 7);
        prop("tv", wp.wx, y0 + 1.9, wp.wz, rot, c.gx, c.gz, scr);
        if (scr !== 3) light(wp.wx - DX[d]! * 0.5, y0 + 1.8, wp.wz - DZ[d]! * 0.5, COOL, 0.35, 3, c.gx, c.gz, null);
      } else if (r < 0.46) prop("bin", wp.wx, y0, wp.wz, rot, c.gx, c.gz);
      else if (r < 0.475) prop("vending", wp.wx, y0, wp.wz, rot, c.gx, c.gz, rng.int(0, 1));
      else if (r < 0.482 && !rtbf) {
        // de vakbond was here
        const pp = wallPoint(i, d, 0.35);
        prop("pop", pp.wx, y0, pp.wz, rot, c.gx, c.gz, rng.int(0, 99));
      }
    }
    // security cameras where a corridor run ends, looking down it
    for (let d = 0; d < 4; d++) {
      if (sd[d]!.sk !== SK.WALL || sd[(d + 2) % 4]!.sk !== SK.OPEN || p.zone[i] === 1) continue;
      if (hash(79, f, c.gx, c.gz, d) % 100 >= 30) continue;
      const wp = wallPoint(i, d, 0.1, 1.05);
      prop("cctv", wp.wx, y0 + CEIL - 0.12, wp.wz, faceRot(d), c.gx, c.gz, 22, 0);
    }
    // the footbridges to the parkeertoren: diagonal steel braces in every bay
    if (p.st.special === "park")
      for (let d = 0; d < 4; d++)
        if (sd[d]!.sk === SK.WINDOW) {
          const wp = wallPoint(i, d, 0.1);
          prop("brace", wp.wx, y0, wp.wz, faceRot(d), c.gx, c.gz, (c.gx + c.gz) & 1);
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

  // De sporthal: the court, the goals, the lonely ball, the lights high up.
  if (inAtrium && atr!.kind === "hall" && f === atr!.f0) {
    const X0 = (gx0 + atr!.x0 - 1) * CELL, X1 = (gx0 + atr!.x1 + 2) * CELL;
    const Z0 = (gz0 + atr!.z0 - 1) * CELL, Z1 = (gz0 + atr!.z1 + 2) * CELL;
    const mx = (X0 + X1) / 2, mz = (Z0 + Z1) / 2;
    const cellOf = (x: number, z: number) => [Math.floor(x / CELL), Math.floor(z / CELL)] as const;
    const top = (atr!.f1 - atr!.f0) * H + CEIL - 1.6;
    for (let z = Z0 + 4; z < Z1 - 2; z += 6)
      for (const x of [mx - 6.5, mx, mx + 6.5]) {
        const [gx, gz] = cellOf(x, z);
        light(x, y0 + top - (x === mx ? 0 : 1.2), z, [0.92, 1.0, 0.9], 1.9, 13, gx, gz, "tube", { rot: Math.PI / 2, dead: rng.chance(0.12), flick: rng.chance(0.08) });
      }
    for (const [z, s] of [[Z0 + 1.5, 1], [Z1 - 1.5, -1]] as const) {
      for (const x of [mx - 6, mx, mx + 6]) {
        const [gx, gz] = cellOf(x, z);
        light(x, y0 + 5, z + s, [1.0, 0.9, 0.72], 1.4, 12, gx, gz, null);
      }
      const [gx, gz] = cellOf(mx, z + s * 1.5);
      prop("goal", mx, y0, z + s * 1.6, s > 0 ? 0 : Math.PI, gx, gz);
    }
    const [bgx, bgz] = cellOf(mx, mz);
    prop("ball", mx + rng.range(-3, 3), y0, mz + rng.range(-3, 3), 0, bgx, bgz);
    for (let k = 0; k < 6; k++) prop("cone", mx + rng.range(-7, 7), y0, mz + rng.range(-10, 10), 0, bgx, bgz);
    const [hgx, hgz] = cellOf(X1 - 1, mz);
    prop("hoop", X1 - 0.2, y0, mz, -Math.PI / 2, hgx, hgz);
    const [wgx, wgz] = cellOf(X0 + 1, mz);
    for (let k = -2; k <= 2; k++) prop("wallbars", X0 + 0.02, y0, mz + k * 1.05, Math.PI / 2, wgx, wgz);
    prop("bench", X0 + 0.1, y0, mz - 6, Math.PI / 2, wgx, wgz);
    prop("bench", X0 + 0.1, y0, mz + 6, Math.PI / 2, wgx, wgz);
    prop("mats", X1 - 1.2, y0, Z0 + 3.5, 0.3, ...cellOf(X1 - 1.2, Z0 + 3.5));
    prop("cctv", X0 + T + 0.3, y0 + 2.45, Z0 + T + 0.3, Math.atan2(mx - X0, mz - Z0), ...cellOf(X0 + 1, Z0 + 1), 16, 0);
    // banners hung from the vault along the long sides, Hec Leemans' mural high on
    // one gable end (above the goal), a big Sporza banner on the other
    const bt = y0 + 5.2;
    prop("banner", X0 + T + 1.3, bt, mz - 6, Math.PI / 2, ...cellOf(X0 + 1.5, mz - 6), rtbf ? 1 : 3);
    prop("banner", X0 + T + 1.3, bt, mz + 6, Math.PI / 2, ...cellOf(X0 + 1.5, mz + 6), 2);
    prop("banner", X1 - T - 1.3, bt, mz - 6, -Math.PI / 2, ...cellOf(X1 - 1.5, mz - 6), rtbf ? 2 : 0);
    prop("banner", X1 - T - 1.3, bt, mz + 6, -Math.PI / 2, ...cellOf(X1 - 1.5, mz + 6), 1);
    if (!rtbf) {
      prop("hallmural", mx, y0 + 3.1, Z0 + T + 0.3, 0, ...cellOf(mx, Z0 + 1.5));
      light(mx, y0 + 4.5, Z0 + 5, WARM, 1.2, 11, ...cellOf(mx, Z0 + 5), null);
      prop("bigbanner", mx, y0 + 6.2, Z1 - T - 0.3, Math.PI, ...cellOf(mx, Z1 - 1.5));
      // the Kampioenen shirts on a rack by the bench
      prop("shirtrack", X0 + 0.9, y0, mz - 8.3, Math.PI / 2, ...cellOf(X0 + 0.9, mz - 8.3));
    }
  }

  // De rekwisieten: rows of tall racks under a steel deck, big props in the aisles,
  // a lending counter by the doors. Upstairs it's a gallery looking down on it.
  if (inAtrium && atr!.kind === "props" && f === atr!.f0) {
    const X0 = (gx0 + atr!.x0) * CELL, X1 = (gx0 + atr!.x1 + 1) * CELL;
    const Z0 = (gz0 + atr!.z0) * CELL;
    const cellOf = (x: number, z: number) => [Math.floor(x / CELL), Math.floor(z / CELL)] as const;
    for (let i = 0; i < CH * CH; i++) {
      if (p.zone[i] !== 2) continue;
      const c = center(i);
      if (((c.gx + c.gz) & 1) === 0) light(c.x, y0 + H + CEIL - 0.08, c.z, [0.95, 1.0, 0.9], 1.8, 10, c.gx, c.gz, "tube", { rot: Math.PI / 2, dead: rng.chance(0.12), flick: rng.chance(0.08) });
    }
    for (let k = 0; k < 4; k++)
      for (let j = 0; j < 5; j++) {
        const x = X0 + 3.6 + j * 2.7, z = Z0 + 3.5 + k * 5.5;
        prop("palletrack", x, y0, z, 0, ...cellOf(x, z), rng.int(0, 999));
      }
    const spots = [[X0 + 1.0, Z0 + 6.2], [X1 - 1.0, Z0 + 11.7], [X0 + 1.0, Z0 + 17.2], [X1 - 1.0, Z0 + 1.2], [X0 + 1.0, Z0 + 1.2], [X1 - 1.0, Z0 + 22.4]];
    // a camera hanging from the deck over the corner of the racks
    prop("cctv", X0 + 0.4, y0 + H + CEIL - 0.25, Z0 + 0.4, Math.atan2(1, 2.2), ...cellOf(X0 + 1, Z0 + 1), 42, 0);
    spots.forEach(([x, z], k) => prop("bigprop", x!, y0, z!, rng.range(0, 6.28), ...cellOf(x!, z!), (k + rng.int(0, 5)) % 6));
    // the counter, just inside the doors on one side
    const ci = idx(atr!.x1 - 1, atr!.z0 - 1);
    const cw = wallDirs(ci);
    if (cw.length) {
      const wp = wallPoint(ci, cw[0]!);
      prop("lendcounter", wp.wx, y0, wp.wz, faceRot(cw[0]!), wp.gx, wp.gz, 2);
      light(wp.wx - DX[cw[0]!]! * 1.2, y0 + 2.3, wp.wz - DZ[cw[0]!]! * 1.2, WARM, 0.8, 4, wp.gx, wp.gz, null);
    }
  }

  if (inAtrium && f === atr!.f0 && TALL.has(atr!.kind) && atr!.kind !== "hall") furnishTall(p, rng, { light, prop, center, wallPoint, wallDirs, hasDoor, deadP, flickP, y0, hangArt });

  // De parkeertoren: an open deck, daylight from all sides, the ramps in two lanes,
  // the stairwell, the bays painted on the floor.
  if (p.st.special === "park" && f < FLOOR_MAX) {
    const isLane = (lx: number, lz: number) => isParkLane(p.st, lx, lz);
    for (let i = 0; i < CH * CH; i++) {
      if (p.kind[i] !== K.GARAGE) continue;
      const lx = i % CH, lz = (i / CH) | 0;
      if (isLane(lx, lz)) continue;
      const c = center(i);
      // (no pillars: the aisles are for driving)
      if (c.gx % 2 === 0 && c.gz % 2 === 0) light(c.x, y0 + 2.45, c.z, [0.9, 1.0, 0.88], 1.3, 8, c.gx, c.gz, "tube", { dead: rng.chance(0.3), flick: rng.chance(0.12) });
      for (let d = 0; d < 4; d++)
        if (sideAt(f, c.gx, c.gz, d).sk === SK.PARAPET) {
          const wp = wallPoint(i, d, 0.8);
          light(wp.wx, y0 + 1.8, wp.wz, DAY, 1.1, 8, c.gx, c.gz, null);
        }
    }
    // (the bays are empty: one car on every floor, a drivable one, see src/cars.ts)
  }

  // Plantentuin: planters with trees along the floating stair, two info screens.
  const gs = gardenStair(p.st);
  if (inAtrium && f === atr!.f0 && gs && atr!.kind === "garden") {
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
  if (inAtrium && f === atr!.f0 && !gs && atr!.kind === "lobby") {
    const mx = (gx0 + (atr!.x0 + atr!.x1 + 1) / 2) * CELL;
    const mz = (gz0 + (atr!.z0 + atr!.z1 + 1) / 2) * CELL;
    prop("tree", mx, y0, mz, 0, gx0 + atr!.x0, gz0 + atr!.z0);
    // big NWS wall graphic on a ring wall (and once, De Kampioenen)
    let mural = rtbf;
    for (let z = atr!.z0 - 1; z <= atr!.z1 + 1; z++)
      for (let x = atr!.x0 - 1; x <= atr!.x1 + 1; x++) {
        const i = idx(x, z);
        const wd = wallDirs(i);
        if (wd.length && rng.chance(0.35)) {
          const wp = wallPoint(i, wd[0]!, -0.01);
          const rot = faceRot(wd[0]!);
          // the graphic takes the whole wall: take down what was hung there
          for (let k = props.length - 1; k >= 0; k--) {
            const q = props[k]!;
            if (WALL_DECOR.has(q.t) && Math.abs(q.rot - rot) < 1e-6 && Math.abs(q.x - wp.wx) + Math.abs(q.z - wp.wz) < 1.7) props.splice(k, 1);
          }
          const m = !mural && rng.chance(0.3);
          if (m) mural = true;
          prop(m ? "mural" : "nwswall", wp.wx, y0, wp.wz, rot, wp.gx, wp.gz);
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

  keepDoorsClear(p, props);
  return { plan: p, lights, props };
}

// --- every door must stay usable ------------------------------------------------

// The floor-plan footprint of a prop: its collision boxes (x0, z0, x1, z1 ...),
// found by building it once into a scratch builder (unlit, so it's cheap).
// (made on first use: builder.ts imports this module, so it isn't ready at load time)
let scratch: LightCtx | null = null;
export function propSolids(pr: Prop): number[] {
  scratch ??= new LightCtx(0, 0, 0, "outdoor");
  const b = new Builder(scratch);
  buildProp(b, pr);
  return b.boxes;
}

// the space just inside each door of the rooms in this chunk, both sides
export function doorZones(p: Plan): number[] {
  const out: number[] = [];
  const DEPTH = 1.3;
  for (let i = 0; i < CH * CH; i++) {
    if (p.kind[i] !== K.ROOM) continue;
    const gx = p.cx * CH + (i % CH), gz = p.cz * CH + ((i / CH) | 0);
    const cx = (gx + 0.5) * CELL, cz = (gz + 0.5) * CELL;
    for (let d = 0; d < 4; d++) {
      const s = sideAt(p.f, gx, gz, d);
      const w = s.door?.w ?? 0;
      if (!(s.sk === SK.DOOR || (s.sk === SK.GLASS && w > 0))) continue;
      const hw = w / 2 + 0.2;
      const px = cx + DX[d]! * CELL / 2, pz = cz + DZ[d]! * CELL / 2; // the middle of the door
      const ix = -DX[d]!, iz = -DZ[d]!; // into this cell
      const ax = Math.abs(DZ[d]!), az = Math.abs(DX[d]!); // along the wall
      const x0 = px + Math.min(0, ix * DEPTH) - ax * hw, x1 = px + Math.max(0, ix * DEPTH) + ax * hw;
      const z0 = pz + Math.min(0, iz * DEPTH) - az * hw, z1 = pz + Math.max(0, iz * DEPTH) + az * hw;
      out.push(x0, z0, x1, z1);
    }
  }
  return out;
}

const overlaps = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i += 4)
    for (let j = 0; j < b.length; j += 4)
      if (a[i]! < b[j + 2]! && a[i + 2]! > b[j]! && a[i + 1]! < b[j + 3]! && a[i + 3]! > b[j + 1]!) return true;
  return false;
};

// props that reach far from where they stand
const BIG = new Set(["nwsdesk", "bikerack", "laadbikes", "seatrow", "persdesk", "labdesk", "labround", "tiktakhuis", "tvset", "tribune", "talkset", "blokkenset", "lorry", "stage", "chairfield", "mtable", "vipbar", "radiodesk", "kdesk", "sdesk", "newsdesk", "ceodesk", "palletrack", "counter", "stairsup", "pooltable", "kwall", "kcounter", "koven", "koffiebar", "kfridge", "bigtafel"]);

// Drop anything whose footprint lands in a doorway, so every room can be entered.
function keepDoorsClear(p: Plan, props: Prop[]) {
  const zones = doorZones(p);
  if (!zones.length) return;
  for (let k = props.length - 1; k >= 0; k--) {
    const pr = props[k]!;
    // only what stands near a door can block it
    const r = BIG.has(pr.t) ? 10 : 4;
    let near = false;
    for (let j = 0; j < zones.length && !near; j += 4) near = Math.abs(pr.x - (zones[j]! + zones[j + 2]!) / 2) < r && Math.abs(pr.z - (zones[j + 1]! + zones[j + 3]!) / 2) < r;
    if (!near) continue;
    const s = propSolids(pr);
    if (s.length && overlaps(s, zones)) props.splice(k, 1);
  }
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
    case RT.RADIO: case RT.KETNET: case RT.SPORZA: case RT.SET: case RT.JOURNAAL: case RT.WEER: return 2;
    // the SIGNS2 atlas (8 +)
    case RT.COSTUME: return 8;
    case RT.DRESSING: return 10;
    case RT.VIPBAR: return 11;
    case RT.VIPRESTO: return 12;
    case RT.CEO: return 13;
    case RT.DOCK: return 14;
    case RT.SECURITY: return 15;
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
    } else if (an === "poppen") {
      // a room full of them: 77 poppen voor 77 collega's, all facing the door
      panelLights(FLUO, 0.9, 1, "panel", true);
      const door = cells.find((i) => hasDoor(i)) ?? cells[0]!;
      const dq = center(door);
      const x0 = (p.cx * CH + room.x0) * CELL, z0 = (p.cz * CH + room.z0) * CELL;
      const W = w * CELL, D = d * CELL;
      let n = 0;
      for (let z = z0 + 0.6; z < z0 + D - 0.4 && n < 77; z += 0.85)
        for (let x = x0 + 0.55; x < x0 + W - 0.4 && n < 77; x += 0.72) {
          const jx = x + rng.range(-0.1, 0.1), jz = z + rng.range(-0.1, 0.1);
          if (Math.hypot(jx - dq.x, jz - dq.z) < 1.3) continue;
          prop("pop", jx, y0, jz, Math.atan2(dq.x - jx, dq.z - jz) + rng.range(-0.15, 0.15), Math.floor(jx / CELL), Math.floor(jz / CELL), n++);
        }
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

  roomCamera(p, room, c, perimeter, roomCenter);
  if (room.type === RT.KOFFIE) return furnishKoffie(p, room, rng, c);
  if (room.type === RT.DPC) return furnishDpc(p, room, rng, c, perimeter, roomCenter);
  if (room.type === RT.SHOWER) return furnishShowers(p, room, rng, c, perimeter, roomCenter);
  if (room.type === RT.BIKES) return furnishBikes(p, room, rng, c, perimeter, roomCenter);
  if (room.type === RT.JOURNAAL) return furnishJournaal(p, room, rng, c, perimeter, roomCenter);
  if (room.type === RT.WEER) return furnishWeer(p, room, rng, c, perimeter, roomCenter);
  if (room.type === RT.VOS) return furnishVos(p, room, rng, c, perimeter, roomCenter);
  if (room.type === RT.PERS) return furnishPers(p, room, rng, c, perimeter, roomCenter);
  if (room.type === RT.LAB) return furnishLab(p, room, rng, c, perimeter, roomCenter);
  if (room.type === RT.TIKTAK) return furnishTiktak(p, room, rng, c, perimeter, roomCenter);
  if (room.type === RT.TOOTS && !isRtbf(p.cz)) return furnishToots(p, room, rng, c, perimeter, roomCenter);
  if (furnishService(p, room, rng, c, perimeter, roomCenter)) return;
  const brand = room.type === RT.KETNET || room.type === RT.SPORZA || room.type === RT.SET || room.type === RT.TOOTS;
  if (brand && !isRtbf(p.cz)) return furnishBrandStudio(p, room, rng, c, perimeter, roomCenter);
  // on the RTBF side the brand studios are ordinary studios
  switch (brand ? RT.STUDIO : room.type) {
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
        const scr = rng.int(0, 7);
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
    case RT.RADIO:
      furnishRadio(p, room, rng, c, perimeter, roomCenter);
      break;
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
      // an old Ketnet poster from 1997, still up
      if (perimeter.length && !isRtbf(p.cz) && rng.chance(0.5)) {
        const [i, dd] = rng.pick(perimeter);
        const wp = wallPoint(i, dd);
        prop("poster", wp.wx, y0 + 1.5, wp.wz, faceRot(dd), wp.gx, wp.gz, 22);
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
    case RT.PASSAGE: {
      // a doorgang: down four steps, through, and up again; sometimes someone put desks here
      const lo = y0 - PASS_DROP;
      const [da, db] = room.pass!;
      const edge = (lx: number, lz: number, dd: number) => (dd === 0 ? lx === room.x1 : dd === 2 ? lx === room.x0 : dd === 1 ? lz === room.z1 : lz === room.z0);
      const desks = w * d >= 3 && rng.chance(0.55);
      // the way through stays clear: nothing in line with a door
      const lanes: [number, number][] = [];
      for (const i of cells) for (const dd of [da, db]) if (p.sides.get(i * 4 + dd)?.door) lanes.push([i, dd]);
      const inLane = (lx: number, lz: number) => lanes.some(([i, dd]) => (dd % 2 === 0 ? lz === ((i / CH) | 0) : lx === i % CH));
      cells.forEach((i, n) => {
        const q = center(i);
        const lx = i % CH, lz = (i / CH) | 0;
        if (n % 2 === 0) light(q.x, y0 + CEIL - 0.03, q.z, FLUO, 1.0, 7, q.gx, q.gz, "panel", { rot, dead: dead(), flick: flick() });
        if (edge(lx, lz, da) || edge(lx, lz, db)) return;
        if (desks && !inLane(lx, lz) && rng.chance(0.8)) prop("desks", q.x, lo, q.z, rot, q.gx, q.gz, rng.int(0, 99));
        for (const dd of wallDirs(i)) {
          if (dd === da || dd === db) continue;
          const wp = wallPoint(i, dd);
          const r = rng.next();
          if (r < 0.2) prop("cabinet", wp.wx, lo, wp.wz, faceRot(dd), q.gx, q.gz);
          else if (r < 0.3) prop("plant", wp.wx, lo, wp.wz, faceRot(dd), q.gx, q.gz);
          else if (r < 0.42) c.hangArt(wp.wx, wp.wz, dd, q.gx, q.gz, false);
        }
      });
      break;
    }
    case RT.EMPTY: {
      panelLights(FLUO, 1.0, 2);
      if (rng.chance(0.5)) prop("chair", roomCenter.x, y0, roomCenter.z, rng.range(0, 6.28), g0.gx, g0.gz);
      break;
    }
    case RT.MESS: {
      // De Mess: rows of tables, green pillars, the counter, a flag
      for (const i of cells) {
        const lx = i % CH, lz = (i / CH) | 0;
        const q = center(i);
        light(q.x, y0 + CEIL - 0.02, q.z, WARM, 1.05, 7, q.gx, q.gz, null);
        prop("downlights", q.x, y0 + CEIL, q.z, 0, q.gx, q.gz);
        if (lx % 3 === 0 && lz % 3 === 0) prop("gpillar", q.x, y0, q.z, 0, q.gx, q.gz);
        else if (lz > 1 && !hasDoor(i)) prop("messtable", q.x, y0, q.z, rng.chance(0.5) ? 0 : Math.PI / 2, q.gx, q.gz, rng.int(0, 99));
        if (lz === 1 && lx >= 2 && lx <= CH - 3) {
          const wp = wallPoint(i, 3);
          prop("counter", wp.wx, y0, wp.wz, faceRot(3), q.gx, q.gz, lx);
          if (lx === 6) prop("flag", q.x, y0 + CEIL, q.z + 1.2, 0, q.gx, q.gz);
        }
      }
      for (const [i, dd] of perimeter) {
        const lz = (i / CH) | 0;
        if (lz === 1 && dd === 3) continue;
        if (rng.chance(0.35)) {
          const wp = wallPoint(i, dd, -0.01);
          prop("greenwall", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.chance(0.4) ? 1 : 0);
        }
      }
      break;
    }
    case RT.LOUNGE: {
      // the pool table corner
      panelLights(WARM, 1.1, 1);
      prop("pooltable", roomCenter.x, y0, roomCenter.z, rot, g0.gx, g0.gz, rng.int(0, 99));
      const ps = rng.shuffle([...perimeter]);
      const uses = ["dartboard", "chalkboard", "plantshelf", "stools"];
      ps.slice(0, 4).forEach(([i, dd], k) => {
        const wp = wallPoint(i, dd);
        prop(uses[k]!, wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 99));
      });
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

// the VRT posters: sheets 1-2 and 4-6 (sheet 3 is the RTBF's)
const vrtPoster = (k: number) => (k < 8 ? k : k + 4);

type Perimeter = [number, number][];

// the wall with the longest run, and its pieces in order along it
function mainWall(p: Plan, perimeter: Perimeter) {
  const byDir = [0, 0, 0, 0];
  for (const [, dd] of perimeter) byDir[dd]!++;
  const bd = byDir.indexOf(Math.max(...byDir));
  const pieces = perimeter.filter(([, dd]) => dd === bd).sort((a, b) => (bd % 2 === 0 ? a[0] - b[0] : (a[0] % CH) - (b[0] % CH)));
  // the longest perpendicular run too (green screens, monitor walls)
  const sd = byDir[(bd + 1) % 4]! >= byDir[(bd + 3) % 4]! ? (bd + 1) % 4 : (bd + 3) % 4;
  const side = perimeter.filter(([, dd]) => dd === sd);
  return { bd, pieces, sd, side };
}

// A radio studio: the station's logo behind the host, foam on the walls, a desk
// with microphones on arms, and an ON AIR light that follows the ghost radio.
function furnishRadio(p: Plan, room: Room, rng: Rng, c: Ctx, perimeter: Perimeter, rc: { x: number; z: number }) {
  const { light, prop, wallPoint, center, y0 } = c;
  const rtbf = isRtbf(p.cz);
  const st = radioStation(p, room);
  const w = room.x1 - room.x0 + 1, d = room.z1 - room.z0 + 1;
  const rot = w >= d ? 0 : Math.PI / 2;
  for (const i of room.cells) {
    const q = center(i);
    light(q.x, y0 + CEIL - 0.03, q.z, WARM, 0.8, 6, q.gx, q.gz, "panel", { rot, dead: room.dark && rng.chance(0.6), flick: rng.chance(c.flickP) });
  }
  if (!perimeter.length) return;
  const { bd, pieces } = mainWall(p, perimeter);
  const mid = pieces[Math.floor(pieces.length / 2)]!;
  const lp = wallPoint(mid[0], bd, -0.01);
  prop("radiologo", lp.wx, y0, lp.wz, faceRot(bd), lp.gx, lp.gz, rtbf ? 5 : st, rtbf ? 0 : 1 + st);
  light(lp.wx - DX[bd]! * 1.2, y0 + 2.2, lp.wz - DZ[bd]! * 1.2, WARM, 0.8, 5, lp.gx, lp.gz, null);
  // Studio Brussel hangs De Tijdloze on a second wall
  const others = perimeter.filter(([i, dd]) => !(i === mid[0] && dd === bd));
  rng.shuffle(others);
  others.forEach(([i, dd], k) => {
    const wp = wallPoint(i, dd, -0.01);
    if (k === 0 && st === 3 && !rtbf) prop("radiologo", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, 6, 0);
    else if (rng.chance(0.75)) prop("foam", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 99));
  });
  // the desk: host between the logo and the desk, guests across
  const depth = (bd % 2 === 0 ? w : d) * CELL;
  const off = Math.min(2.2, depth / 2);
  const ex = lp.wx - DX[bd]! * off, ez = lp.wz - DZ[bd]! * off;
  const gx = Math.floor(ex / CELL), gz = Math.floor(ez / CELL);
  prop("radiodesk", ex, y0, ez, faceRot(bd), gx, gz, rng.int(0, 99), rtbf ? 0 : 1 + st);
  light(ex, y0 + 2.3, ez, WARM, room.dark ? 0.6 : 1.0, 4.5, gx, gz, null);
}

// Ketnet, Sporza and the TV sets: big studios with a brand wall and cameras.
function furnishBrandStudio(p: Plan, room: Room, rng: Rng, c: Ctx, perimeter: Perimeter, rc: { x: number; z: number }) {
  const { light, prop, wallPoint, center, y0 } = c;
  const w = room.x1 - room.x0 + 1, d = room.z1 - room.z0 + 1;
  if (!perimeter.length) return;
  const { bd, pieces, sd, side } = mainWall(p, perimeter);
  const depth = (bd % 2 === 0 ? w : d) * CELL, len = (bd % 2 === 0 ? d : w) * CELL;
  const ix = -DX[bd]!, iz = -DZ[bd]!; // into the room
  const wx = rc.x - ix * (depth / 2 - T), wz = rc.z - iz * (depth / 2 - T); // middle of the main wall
  const r0 = faceRot(bd);
  const at = (lx: number, lz: number) => {
    const x = wx + lx * Math.cos(r0) + lz * Math.sin(r0), z = wz - lx * Math.sin(r0) + lz * Math.cos(r0);
    return { x, z, gx: Math.floor(x / CELL), gz: Math.floor(z / CELL) };
  };
  // lighting rigs under the ceiling (not over the set: the set has its own lamps)
  const setW = Math.min(len - 2.6, 8.4), setD = Math.max(2.4, Math.min(depth - 5.6, 3.8));
  for (const i of room.cells) {
    const q = center(i);
    const lx = (q.x - wx) * Math.cos(r0) - (q.z - wz) * Math.sin(r0), lz = (q.x - wx) * Math.sin(r0) + (q.z - wz) * Math.cos(r0);
    if (room.type === RT.SET && Math.abs(lx) < setW / 2 + 1.4 && lz < 1.2 + setD + 1.4) continue;
    prop("rig", q.x, y0 + 3.0, q.z, 0, q.gx, q.gz);
  }
  const cams = (dist: number) => {
    for (let k = -1; k <= 1; k++) {
      const q = at(k * 1.9, dist);
      prop("camera", q.x, y0, q.z, r0 + Math.PI + k * 0.25, q.gx, q.gz, k === 0 && rng.chance(0.5) ? 1 : 0);
    }
  };
  const dim = room.dark ? 0.45 : 1;

  if (room.type === RT.SET) {
    // a café built inside the studio, open towards the cameras, bare plywood behind
    const thuis = setIsThuis(p, room);
    const W = setW, D = setD;
    prop("tvset", wx, y0, wz, r0, Math.floor(wx / CELL), Math.floor(wz / CELL), W, (thuis ? 0 : 1) + 2 * Math.round(D * 10));
    for (const lx of [-W / 3, 0, W / 3]) {
      const q = at(lx, 1.2 + D * 0.55);
      light(q.x, y0 + 2.6, q.z, [1.0, 0.78, 0.5], 1.4 * dim, 6, q.gx, q.gz, null);
    }
    const f = at(0, 1.2 + D + 1.6);
    light(f.x, y0 + 3.0, f.z, [0.9, 0.92, 1.0], 1.1 * dim, 7, f.gx, f.gz, null);
    // the dark gap behind the set, one work light
    const b = at(W / 2 - 0.4, 0.6);
    light(b.x, y0 + 2.4, b.z, WARM, 0.8, 5, b.gx, b.gz, "bulb", { flick: rng.chance(0.5) });
    cams(1.2 + D + 2.4);
    const ch = at(W / 2 + 0.4, 1.2 + D + 3.6);
    prop("chair", ch.x, y0, ch.z, r0 + Math.PI + 0.5, ch.gx, ch.gz);
    return;
  }

  const ketnet = room.type === RT.KETNET;
  const midK = Math.floor(pieces.length / 2);
  pieces.forEach(([i], k) => {
    const wp = wallPoint(i, bd, -0.01);
    prop("brandwall", wp.wx, y0, wp.wz, r0, wp.gx, wp.gz, ketnet ? 0 : 1, k === midK ? 1 : 0);
    light(wp.wx + ix * 1.0, y0 + 2.2, wp.wz + iz * 1.0, ketnet ? [0.8, 0.9, 1.0] : [0.85, 1.0, 0.9], 0.7 * dim, 6, wp.gx, wp.gz, null);
  });
  const e = at(0, 2.2);
  prop(ketnet ? "kdesk" : "sdesk", e.x, y0, e.z, r0, e.gx, e.gz);
  const top = at(0, 3.4);
  light(top.x, y0 + 2.7, top.z, WARM, 1.2 * dim, 6, top.gx, top.gz, null);
  cams(5.8 < depth - 1.5 ? 5.8 : depth - 1.8);
  if (ketnet) {
    // a green screen on a side wall, bean bags, and colour everywhere
    side.forEach(([i, dd]) => {
      const wp = wallPoint(i, dd, -0.01);
      prop("greenscreen", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz);
    });
    for (let k = 0; k < 5; k++) {
      const q = at(rng.range(-len / 2 + 1.2, len / 2 - 1.2), rng.range(3.2, depth - 1.2));
      if (Math.abs(q.x - top.x) + Math.abs(q.z - top.z) < 1.8) continue;
      prop("beanbag", q.x, y0, q.z, rng.range(0, 6.28), q.gx, q.gz, k);
    }
    for (const [lx, col] of [[-len / 3, [1.0, 0.35, 0.7]], [len / 3, [0.35, 1.0, 0.6]]] as const) {
      const q = at(lx, 2.5);
      light(q.x, y0 + 2.8, q.z, col, 0.9 * dim, 6, q.gx, q.gz, null);
    }
  } else {
    // monitors with the match on a side wall
    side.slice(0, 2).forEach(([i, dd]) => {
      const wp = wallPoint(i, dd);
      prop("monwall", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 99), 1);
      light(wp.wx - DX[dd]! * 1.0, y0 + 1.6, wp.wz - DZ[dd]! * 1.0, [0.8, 1.0, 0.85], 0.6 * dim, 5, wp.gx, wp.gz, null);
    });
  }
}

// De koffiekamer. Along the wall with the doors: the broodjesbar, 6 by 6 m in
// one corner, walled off (in through a poortje from its own door, past the
// fridges to the counter, the ovens behind it; out through another poortje),
// and the three coffee machines against its wall. Away from the doors: high
// tables and low round ones, the big round table, the vending machines, TVs
// and a red LED clock. s runs along the door wall away from the broodjesbar,
// t into the room from it.
function furnishKoffie(p: Plan, room: Room, rng: Rng, c: Ctx) {
  const { light, prop, y0 } = c;
  const X0 = (p.cx * CH + room.x0) * CELL, X1 = (p.cx * CH + room.x1 + 1) * CELL;
  const Z0 = (p.cz * CH + room.z0) * CELL, Z1 = (p.cz * CH + room.z1 + 1) * CELL;
  const k = room.koffie ?? { d: 3, shop: -1, end: 0 };
  const d = k.d, alongX = d % 2 === 1;
  const vx = -DX[d]!, vz = -DZ[d]!;
  const ax = alongX ? (k.end ? -1 : 1) : 0, az = alongX ? 0 : k.end ? -1 : 1;
  const ox = alongX ? (k.end ? X1 : X0) : d === 0 ? X1 : X0;
  const oz = alongX ? (d === 1 ? Z1 : Z0) : k.end ? Z1 : Z0;
  const L = alongX ? X1 - X0 : Z1 - Z0, D = alongX ? Z1 - Z0 : X1 - X0;
  const at = (s: number, t: number) => {
    const x = ox + ax * s + vx * t, z = oz + az * s + vz * t;
    return { x, z, gx: Math.floor(x / CELL), gz: Math.floor(z / CELL) };
  };
  const put = (t: string, s: number, tt: number, rot: number, a = 0, b = 0, y = 0) => {
    const q = at(s, tt);
    prop(t, q.x, y0 + y, q.z, rot, q.gx, q.gz, a, b);
  };
  const lamp = (s: number, t: number, col: readonly number[], int: number, fix: string | null, y = CEIL - 0.02) => {
    const q = at(s, t);
    light(q.x, y0 + y, q.z, col, int, 7, q.gx, q.gz, fix, { rot: Math.atan2(vx, vz), dead: room.dark && rng.chance(0.5), flick: rng.chance(c.flickP) });
  };
  const IN = Math.atan2(vx, vz), OUT = Math.atan2(-vx, -vz), ALONG = Math.atan2(ax, az), BACK = Math.atan2(-ax, -az);
  const S = 2 * CELL; // the broodjesbar is two cells square
  const sOf = (i: number) => {
    const q = c.center(i);
    return (q.x - ox) * ax + (q.z - oz) * az;
  };

  // the broodjesbar: its walls (a gap for the way out), fridges, counter, ovens
  put("kwall", S, (T + 2.0) / 2, ALONG, Math.round((2.0 - T) * 100));
  put("kwall", S, (3.1 + S + 0.06) / 2, ALONG, Math.round((S + 0.06 - 3.1) * 100));
  put("kwall", (T + S + 0.06) / 2, S, IN, Math.round((S + 0.06 - T) * 100));
  put("kfridge", T, 2.8, ALONG, 3);
  put("kcounter", (T + S - 0.06) / 2, 4.3, OUT, Math.round((S - 0.06 - T) * 100));
  put("koven", (T + S - 0.06) / 2, S - 0.06, OUT, Math.round((S - 0.3 - T) * 100));
  if (k.shop >= 0) put("poortje", sOf(k.shop), 1.9, IN, 0, 0);
  put("poortje", S, 2.55, ALONG, 0, 1);
  for (const [s, t] of [[1.5, 1.5], [4.5, 1.5], [1.5, 4.5], [4.5, 4.5]] as const) lamp(s, t, FLUO, 1.05, "strip");
  lamp(3, 3.6, WARM, 0.5, null, 1.4);

  // the coffee machines, against the outside of the broodjesbar
  put("koffiebar", S + 0.06, 4.6, ALONG);
  lamp(S + 1.2, 4.6, WARM, 0.45, null, 1.6);

  // the way in: a green patch in the floor inside the other door
  const doors = room.cells.filter((i) => p.sides.get(i * 4 + d)?.door && i !== k.shop).map(sOf);
  const sA = doors.length ? doors[doors.length - 1]! : L - CELL / 2;
  put("kgreen", sA, 1.4, IN, 260, 240);

  // tables away from the doors, the big one in the middle at the back
  const cells = room.cells.map((i) => ({ i, s: sOf(i), t: (() => { const q = c.center(i); return (q.x - ox) * vx + (q.z - oz) * vz; })() }));
  const back = cells.filter((q) => q.t > D - CELL && q.s > S);
  const big = back.length ? back.reduce((a, b) => (Math.abs(b.s - (S + L) / 2) < Math.abs(a.s - (S + L) / 2) ? b : a)) : null;
  for (const q of cells) {
    if (q.s < S && q.t < S) continue;
    lamp(q.s, q.t, FLUO, 1.1, "strip");
    if (q.t < CELL && Math.abs(q.s - sA) < 2.6) continue; // the way in
    if (q.s > S && q.s < S + CELL && q.t > CELL && q.t < S + 1) continue; // the queue for the coffee
    if (q.s > L - CELL && q.t > D - CELL) continue; // the vending machines
    const js = rng.range(-0.3, 0.3), jt = rng.range(-0.3, 0.3);
    if (q === big) put("bigtafel", q.s, q.t, rng.range(0, 6.28), rng.int(0, 999));
    else if (q.t < CELL) { if (rng.chance(0.6)) put("cocktail", q.s + js, q.t + jt, rng.range(-0.2, 0.2) + IN, rng.int(0, 999)); }
    else put(rng.chance(0.55) ? "cocktail" : "lowround", q.s + js, q.t + jt, rng.range(-0.2, 0.2) + IN, rng.int(0, 999));
  }

  // the vending machines in the far corner, TVs and the clock on the back wall
  put("cokefridge", L - T, D - 0.6, BACK);
  put("vending", L - T, D - 1.6, BACK, 0);
  put("vending", L - T, D - 2.6, BACK, 1);
  lamp(L - 1.0, D - 1.6, COOL, 0.55, null, 1.3);
  put("tv", S + (L - S) * 0.28, D - T, OUT, 4 + rng.int(0, 3), 0, 2.0);
  put("tv", S + (L - S) * 0.78, D - T, OUT, rng.pick([1, 4, 5]), 0, 2.0);
  put("ledclock", S + (L - S) * 0.53, D - T, OUT, 0, 0, 2.2);
}

// Het DPC, where the computer nerds are. The live ticket dashboards along the
// longest wall (a red LED clock above them), the Red Hat flag across from them,
// desks with two screens each, a stand-up corner with the sprint board on wheels
// and a dashboard on a stand, posters, and a giant Tux in a corner on beanbags.
function furnishDpc(p: Plan, room: Room, rng: Rng, c: Ctx, perimeter: Perimeter, rc: { x: number; z: number }) {
  const { light, prop, center, wallPoint, wallDirs, hasDoor, y0 } = c;
  const w = room.x1 - room.x0 + 1, d = room.z1 - room.z0 + 1;
  const rot = w >= d ? 0 : Math.PI / 2;
  const cells = room.cells;
  // cool panels, a lot of them off: they like it dim in here
  for (const i of cells) {
    const q = center(i);
    light(q.x, y0 + CEIL - 0.03, q.z, COOL, 1.0, 7, q.gx, q.gz, "panel", { rot, dead: rng.chance(room.dark ? 0.75 : 0.35), flick: rng.chance(c.flickP) });
  }
  if (!perimeter.length) return;
  const { bd, pieces } = mainWall(p, perimeter);
  const used = new Set<string>();
  const use = (i: number, dd: number) => used.add(i + ":" + dd);

  // the dashboards: up to three pieces of the main wall, the middle ones; whiteboards on the rest
  const m0 = Math.max(0, Math.floor((pieces.length - 3) / 2));
  pieces.forEach(([i], k) => {
    const wp = wallPoint(i, bd);
    use(i, bd);
    if (k >= m0 && k < m0 + 3) {
      prop("dashwall", wp.wx, y0, wp.wz, faceRot(bd), wp.gx, wp.gz, (2 * k) % 4, (2 * k + 1) % 4);
      light(wp.wx - DX[bd]! * 1.0, y0 + 1.9, wp.wz - DZ[bd]! * 1.0, [0.7, 0.8, 1.0], 0.55, 5, wp.gx, wp.gz, null);
      if (k === m0 + Math.min(1, pieces.length - 1 - m0)) prop("ledclock", wp.wx, y0 + 2.36, wp.wz, faceRot(bd), wp.gx, wp.gz);
    } else prop("dpcboard", wp.wx, y0 + 1.55, wp.wz, faceRot(bd), wp.gx, wp.gz, k % 2);
  });

  // the Red Hat flag across from them (or on whatever wall there is)
  const ob = (bd + 2) % 4;
  const across = perimeter.filter(([, dd]) => dd === ob);
  const flagAt = across.length ? across[Math.floor(across.length / 2)]! : perimeter.find(([i, dd]) => !used.has(i + ":" + dd));
  if (flagAt) {
    const [i, dd] = flagAt;
    const wp = wallPoint(i, dd);
    prop("redhat", wp.wx, y0 + 0.95, wp.wz, faceRot(dd), wp.gx, wp.gz);
    light(wp.wx - DX[dd]! * 1.3, y0 + 2.45, wp.wz - DZ[dd]! * 1.3, WARM, 0.65, 4.5, wp.gx, wp.gz, null);
    use(i, dd);
  }

  // Tux in a corner without a door, on beanbags, looking into the room
  const free = cells.filter((i) => !hasDoor(i));
  const corners = free.filter((i) => wallDirs(i).length >= 2);
  const tc = corners.length ? rng.pick(corners) : free.find((i) => wallDirs(i).length) ?? -1;
  if (tc >= 0) {
    const q = center(tc);
    const wd = wallDirs(tc);
    const [d1, d2] = [wd[0]!, wd[1] ?? wd[0]!];
    const off = CELL / 2 - T - 0.62;
    const tx = q.x + (DX[d1]! + (d2 !== d1 ? DX[d2]! : 0)) * off, tz = q.z + (DZ[d1]! + (d2 !== d1 ? DZ[d2]! : 0)) * off;
    const face = Math.atan2(rc.x - tx, rc.z - tz);
    prop("tux", tx, y0, tz, face + rng.range(-0.2, 0.2), q.gx, q.gz, 100);
    for (const s of [-1, 1]) {
      const a = face + s * 0.9;
      const bx = tx + Math.sin(a) * 1.05, bz = tz + Math.cos(a) * 1.05;
      prop("beanbag", bx, y0, bz, Math.atan2(rc.x - bx, rc.z - bz), Math.floor(bx / CELL), Math.floor(bz / CELL), rng.int(0, 4));
    }
    light(tx + Math.sin(face) * 1.2, y0 + 2.2, tz + Math.cos(face) * 1.2, WARM, 0.5, 4, q.gx, q.gz, null);
    for (const dd of wd) use(tc, dd);
  }

  // the stand-up corner: the sprint board on wheels and a dashboard on a stand, by a
  // wall (in the middle of one; in a corner there's only room for the board)
  const edges = free.filter((i) => i !== tc && wallDirs(i).some((dd) => !used.has(i + ":" + dd)));
  const mids = edges.filter((i) => wallDirs(i).length === 1);
  const su = mids.length ? rng.pick(mids) : edges.length ? rng.pick(edges) : -1;
  if (su >= 0) {
    const wd = wallDirs(su).find((dd) => !used.has(su + ":" + dd))!;
    if (wallDirs(su).length === 1) {
      const kb = wallPoint(su, wd, 0.5, -0.5);
      prop("kanban", kb.wx, y0, kb.wz, faceRot(wd), kb.gx, kb.gz, rng.int(0, 1));
      const ds = wallPoint(su, wd, 0.55, 1.1);
      prop("dashstand", ds.wx, y0, ds.wz, faceRot(wd) - 0.35, ds.gx, ds.gz, rng.int(0, 3));
    } else {
      // away from the other wall
      const along = wallDirs(su).includes((wd + 1) % 4) ? -0.35 : 0.35;
      const kb = wallPoint(su, wd, 0.5, along);
      prop("kanban", kb.wx, y0, kb.wz, faceRot(wd), kb.gx, kb.gz, rng.int(0, 1));
    }
    for (const dd of wallDirs(su)) use(su, dd);
  }

  // desks everywhere else, the screens glowing blue
  cells.forEach((i, n) => {
    if (i === tc || i === su || hasDoor(i)) return;
    const q = center(i);
    if (!rng.chance(0.9)) return;
    prop("devdesk", q.x, y0, q.z, rot, q.gx, q.gz, rng.int(0, 999));
    if (n % 2 === 0) light(q.x, y0 + 1.15, q.z, [0.45, 0.6, 1.0], 0.35, 3.5, q.gx, q.gz, null, { flick: rng.chance(0.1) });
  });

  // posters and boards on the walls that are left, now and then a plant nobody waters
  const posters = rng.shuffle([0, 1, 2, 3, 4, 5]);
  for (const [i, dd] of rng.shuffle(perimeter.filter(([i, dd]) => !used.has(i + ":" + dd)))) {
    const wp = wallPoint(i, dd);
    const r = rng.next();
    if (r < 0.45 && posters.length) prop("dpcposter", wp.wx, y0 + 1.6, wp.wz, faceRot(dd), wp.gx, wp.gz, posters.pop()!);
    else if (r < 0.6) prop("dpcboard", wp.wx, y0 + 1.55, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 1));
    else if (r < 0.7) prop("plant", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz);
    else if (r < 0.78) prop("cabinet", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz);
  }
}

// Lay out a room from its main wall: (lx, lz) is lx along the wall from its
// middle and lz into the room. Also its depth and length, and the facing.
function wallFrame(p: Plan, room: Room, bd: number, rc: { x: number; z: number }) {
  const w = room.x1 - room.x0 + 1, d = room.z1 - room.z0 + 1;
  const depth = (bd % 2 === 0 ? w : d) * CELL, len = (bd % 2 === 0 ? d : w) * CELL;
  const ix = -DX[bd]!, iz = -DZ[bd]!;
  const wx = rc.x - ix * (depth / 2 - T), wz = rc.z - iz * (depth / 2 - T);
  const r0 = faceRot(bd);
  const at = (lx: number, lz: number) => {
    const x = wx + lx * Math.cos(r0) + lz * Math.sin(r0), z = wz - lx * Math.sin(r0) + lz * Math.cos(r0);
    return { x, z, gx: Math.floor(x / CELL), gz: Math.floor(z / CELL) };
  };
  return { at, depth, len, r0 };
}

// De douches: two tiled bays to every piece of wall, a bench down the middle,
// towels on hooks by the door, and one shower somebody left running.
function furnishShowers(p: Plan, room: Room, rng: Rng, c: Ctx, perimeter: Perimeter, rc: { x: number; z: number }) {
  const { light, prop, center, wallPoint, hasDoor, y0 } = c;
  const w = room.x1 - room.x0 + 1, d = room.z1 - room.z0 + 1;
  const rot = w >= d ? 0 : Math.PI / 2;
  for (const i of room.cells) {
    const q = center(i);
    light(q.x, y0 + CEIL - 0.03, q.z, [0.9, 1.0, 1.0], 1.25, 7, q.gx, q.gz, "panel", { rot, dead: rng.chance(room.dark ? 0.5 : c.deadP), flick: rng.chance(c.flickP * 1.5) });
  }
  // one wall to a cell (the bays would run into each other in a corner); towels where there's a door
  const bays: [number, number][] = [];
  const done = new Set<number>();
  for (const [i, dd] of rng.shuffle([...perimeter])) {
    const wp = wallPoint(i, dd);
    if (hasDoor(i) || done.has(i)) {
      if (!done.has(i)) prop("towels", wp.wx, y0 + 1.55, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 99));
      done.add(i);
      continue;
    }
    done.add(i);
    bays.push([i, dd]);
  }
  const running = bays.length ? rng.int(0, bays.length - 1) : -1;
  bays.forEach(([i, dd], n) => {
    const wp = wallPoint(i, dd);
    prop("showers", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 99), n === running ? 1 : 0);
    if (n !== running) return;
    // the water on the floor, spreading out of the bay
    const pd = (dd + 1) % 4, wet = wallPoint(i, dd, 0.9, -0.71);
    prop("puddle", wet.wx, y0, wet.wz, rng.range(0, 3), wet.gx, wet.gz, 0.9);
    prop("puddle", wet.wx - DX[dd]! * 0.9 + DX[pd]! * 0.3, y0, wet.wz - DZ[dd]! * 0.9 + DZ[pd]! * 0.3, rng.range(0, 3), wet.gx, wet.gz, 0.6);
  });
  // the bench down the middle, if there's room between the bays
  if (Math.min(w, d) >= 2) {
    const g = center(room.cells[0]!);
    prop("showerbench", rc.x, y0, rc.z, rot, g.gx, g.gz, Math.round(Math.min(2.4, (Math.max(w, d) - 1) * CELL * 0.6) * 100));
  }
  // and a puddle or two anyway
  for (const i of room.cells) {
    if (!rng.chance(0.3)) continue;
    const q = center(i);
    prop("puddle", q.x + rng.range(-0.6, 0.6), y0, q.z + rng.range(-0.6, 0.6), rng.range(0, 3), q.gx, q.gz, rng.range(0.4, 0.8));
  }
}

// De fietsenstalling: e-bikes nose in at the chargers along the main wall, under
// the LAADPUNT sign, and rows of bike racks with aisles around them; a pump.
function furnishBikes(p: Plan, room: Room, rng: Rng, c: Ctx, perimeter: Perimeter, rc: { x: number; z: number }) {
  const { light, prop, center, wallPoint, y0 } = c;
  const w = room.x1 - room.x0 + 1, d = room.z1 - room.z0 + 1;
  for (const i of room.cells) {
    const q = center(i);
    light(q.x, y0 + CEIL - 0.06, q.z, COOL, 1.05, 7, q.gx, q.gz, "tube", { rot: w >= d ? 0 : Math.PI / 2, dead: rng.chance(room.dark ? 0.6 : c.deadP + 0.1), flick: rng.chance(c.flickP * 1.5) });
  }
  if (!perimeter.length) return;
  const { bd, pieces } = mainWall(p, perimeter);
  pieces.forEach(([i]) => {
    const wp = wallPoint(i, bd);
    prop("laadbikes", wp.wx, y0, wp.wz, faceRot(bd), wp.gx, wp.gz, rng.int(0, 99));
  });
  const mid = pieces[Math.floor(pieces.length / 2)]!;
  const sp = wallPoint(mid[0], bd, -0.01);
  prop("laadsign", sp.wx, y0 + 1.9, sp.wz, faceRot(bd), sp.gx, sp.gz);
  light(sp.wx - DX[bd]! * 0.5, y0 + 2.2, sp.wz - DZ[bd]! * 0.5, [0.6, 1.0, 0.7], 0.35, 3, sp.gx, sp.gz, null);
  // rows of racks along the main wall, an aisle at both ends
  const { at, depth, len, r0 } = wallFrame(p, room, bd, rc);
  for (let lz = 4.0; lz < depth - 1.6; lz += 3.0)
    for (let lx = -len / 2 + CELL * 1.5; lx < len / 2 - CELL; lx += CELL) {
      const q = at(lx, lz);
      prop("bikerack", q.x, y0, q.z, r0, q.gx, q.gz, rng.int(0, 99));
    }
  // a pump on the far wall, a few bikes left on their own
  const far = perimeter.filter(([, dd]) => dd === (bd + 2) % 4);
  if (far.length) {
    const [i, dd] = rng.pick(far);
    const wp = wallPoint(i, dd, 0, rng.range(-0.8, 0.8));
    prop("bikepump", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz);
  }
  // more chargers on the side walls, now and then (not in the corners with the main wall)
  const side = perimeter.filter(([i, dd]) => dd % 2 !== bd % 2 && !c.wallDirs(i).includes(bd));
  for (const [i, dd] of side) {
    if (!rng.chance(0.25)) continue;
    const wp = wallPoint(i, dd);
    prop("laadbikes", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 99));
  }
}

// De journaalstudio: the LED wall with Brussels at dusk, two tall blue panels in
// front of it (one with the anchor's name), the low curved desk with light under
// it, a standing table, the big triangle lamp. Nobody at the desk.
function furnishJournaal(p: Plan, room: Room, rng: Rng, c: Ctx, perimeter: Perimeter, rc: { x: number; z: number }) {
  const { light, prop, center, wallPoint, y0 } = c;
  const rtbf = isRtbf(p.cz);
  if (!perimeter.length) return;
  const { bd, pieces, side } = mainWall(p, perimeter);
  const { at, depth, len, r0 } = wallFrame(p, room, bd, rc);
  const dim = room.dark ? 0.55 : 1;
  pieces.forEach(([i], k) => {
    const wp = wallPoint(i, bd, -0.01);
    prop("ledwall", wp.wx, y0, wp.wz, r0, wp.gx, wp.gz, k);
    light(wp.wx - DX[bd]! * 1.2, y0 + 1.8, wp.wz - DZ[bd]! * 1.2, [0.45, 0.65, 1.0], 0.75 * dim, 6, wp.gx, wp.gz, null);
  });
  // the LED wall goes round the corner on one side
  side.forEach(([i, dd], k) => {
    const wp = wallPoint(i, dd, -0.01);
    prop("ledwall", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, k + 1);
  });
  for (const [lx, a] of [[-len * 0.24, 0], [len * 0.18, 1]] as const) {
    const q = at(lx, 0.45);
    prop("nwspanel", q.x, y0, q.z, r0, q.gx, q.gz, a, rtbf ? 1 : 0);
  }
  // the anchor's spot (empty), the desk round behind
  const D = Math.min(depth * 0.45, 4.4);
  const a = at(0, D);
  prop("nwsdesk", a.x, y0, a.z, r0, a.gx, a.gz);
  const t = at(1.25, D - 0.9);
  prop("nwstable", t.x, y0, t.z, r0, t.gx, t.gz);
  prop("nwslamp", a.x, y0 + 2.45, a.z, r0, a.gx, a.gz);
  light(a.x, y0 + 2.3, a.z, [0.9, 0.95, 1.0], 1.0 * dim, 6, a.gx, a.gz, null);
  // the key light on the anchor's spot, from the cameras
  const k = at(0, D + 2.2);
  light(k.x, y0 + 2.6, k.z, [1.0, 0.92, 0.82], 1.2 * dim, 6, k.gx, k.gz, null);
  const camZ = Math.min(D + 3.6, depth - 1.1);
  for (let n = -1; n <= 1; n++) {
    const q = at(n * 2.0, camZ);
    prop("camera", q.x, y0, q.z, r0 + Math.PI + n * 0.3, q.gx, q.gz, n === 0 && rng.chance(0.7) ? 1 : 0);
  }
  // rigs under the ceiling, not over the lamp
  for (const i of room.cells) {
    const q = center(i);
    if (Math.hypot(q.x - a.x, q.z - a.z) < 2.6) continue;
    prop("rig", q.x, y0 + 3.0, q.z, 0, q.gx, q.gz);
  }
}

// De weerstudio: green key, everything green. The cove at the foot of the main
// wall, the presenter's mark, a camera, two return monitors with the weather
// map, two softboxes, and the weatherman's desk on the far wall.
function furnishWeer(p: Plan, room: Room, rng: Rng, c: Ctx, perimeter: Perimeter, rc: { x: number; z: number }) {
  const { light, prop, wallPoint, y0 } = c;
  if (!perimeter.length) return;
  const { bd, pieces } = mainWall(p, perimeter);
  const { at, depth, len, r0 } = wallFrame(p, room, bd, rc);
  const dim = room.dark ? 0.5 : 1;
  // a key studio wants flat, even light: panels everywhere, all on
  room.cells.forEach((i, n) => {
    const q = c.center(i);
    light(q.x, y0 + 3.27, q.z, [0.95, 0.97, 1.0], 1.0 * dim, 7, q.gx, q.gz, "panel", { rot: n % 2 ? 0 : Math.PI / 2 });
  });
  for (const [i] of pieces) {
    const wp = wallPoint(i, bd);
    prop("cove", wp.wx, y0, wp.wz, r0, wp.gx, wp.gz);
  }
  const m = at(0, Math.min(1.4, depth * 0.3));
  prop("tapex", m.x, y0, m.z, rng.range(-0.3, 0.3), m.gx, m.gz);
  const camZ = Math.max(2.6, Math.min(depth - 1.0, 4.4));
  const cam = at(0, camZ);
  prop("camera", cam.x, y0, cam.z, r0 + Math.PI, cam.gx, cam.gz, rng.chance(0.6) ? 1 : 0);
  for (const s of [-1, 1]) {
    if (len < 4) break;
    const q = at(s * Math.min(1.3, len / 2 - 0.6), camZ - 0.6);
    prop("weermon", q.x, y0, q.z, r0 + Math.PI - s * 0.25, q.gx, q.gz);
    const b = at(s * Math.min(len / 2 - 0.8, 2.4), Math.min(2.2, depth / 2));
    prop("softbox", b.x, y0, b.z, Math.atan2(m.x - b.x, m.z - b.z), b.gx, b.gz);
    light(b.x + (m.x - b.x) * 0.3, y0 + 2.0, b.z + (m.z - b.z) * 0.3, [1.0, 0.98, 0.94], 1.1 * dim, 6, b.gx, b.gz, null);
  }
  light(m.x, y0 + 2.9, m.z, [0.95, 1.0, 0.95], 0.8 * dim, 6, m.gx, m.gz, null);
  // the desk, if there's a far wall far enough away
  const far = perimeter.filter(([, dd]) => dd === (bd + 2) % 4);
  if (far.length && depth >= 6) {
    const [i, dd] = far[Math.floor(far.length / 2)]!;
    const wp = wallPoint(i, dd);
    prop("weerdesk", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz);
    light(wp.wx - DX[dd]! * 0.8, y0 + 1.3, wp.wz - DZ[dd]! * 0.8, [0.5, 0.7, 1.0], 0.4, 3.5, wp.gx, wp.gz, null);
  }
}

// Het vossenhol, where the VRT foxes live: grassy hills under an office ceiling,
// bright white light, white panelled walls. Foxes everywhere (standing,
// sitting, asleep, nose in the grass), dry bushes, the hole they're named for,
// and a water trough.
function furnishVos(p: Plan, room: Room, rng: Rng, c: Ctx, perimeter: Perimeter, rc: { x: number; z: number }) {
  const { light, prop, center, wallPoint, hasDoor, y0 } = c;
  const X0 = (p.cx * CH + room.x0) * CELL, X1 = (p.cx * CH + room.x1 + 1) * CELL;
  const Z0 = (p.cz * CH + room.z0) * CELL, Z1 = (p.cz * CH + room.z1 + 1) * CELL;
  const cells = room.cells;
  cells.forEach((i, n) => {
    const q = center(i);
    for (const o of [-0.75, 0.75]) light(q.x + o, y0 + 3.3 - 0.03, q.z, [0.94, 0.98, 1.0], 0.85, 7, q.gx, q.gz, "panel", { rot: n % 2 ? 0 : Math.PI / 2, flick: rng.chance(0.03) });
  });
  const ground = (x: number, z: number) => y0 + vosHill(p, room, x, z);
  const spot = (m: number) => {
    const x = rng.range(X0 + m, X1 - m), z = rng.range(Z0 + m, Z1 - m);
    return { x, z, y: ground(x, z), gx: Math.floor(x / CELL), gz: Math.floor(z / CELL) };
  };
  const taken: [number, number, number][] = [];
  const free = (x: number, z: number, r: number) => taken.every(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) > r + tr);
  // keep the doors clear
  for (const i of cells) if (hasDoor(i)) {
    const q = center(i);
    taken.push([q.x, q.z, 1.6]);
  }
  // the top of the hill: the highest of a few spots
  let best = spot(2.5);
  for (let k = 0; k < 14; k++) {
    const s = spot(2.5);
    if (s.y > best.y && free(s.x, s.z, 0.6)) best = s;
  }
  // het vossenhol: on the side of a hill, looking downhill
  for (let k = 0; k < 30; k++) {
    const s = spot(2.2);
    const h = s.y - y0;
    if (h < 0.35 || h > 0.9 || !free(s.x, s.z, 1.0)) continue;
    const gx = ground(s.x + 0.2, s.z) - ground(s.x - 0.2, s.z), gz = ground(s.x, s.z + 0.2) - ground(s.x, s.z - 0.2);
    prop("burrow", s.x, s.y - 0.05, s.z, Math.atan2(-gx, -gz), s.gx, s.gz);
    taken.push([s.x, s.z, 0.8]);
    // two cubs by the hole
    for (let n = 0; n < 2; n++) {
      const a = Math.atan2(-gx, -gz) + rng.range(-0.8, 0.8), r = rng.range(0.8, 1.2);
      const x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r;
      prop("fox", x, ground(x, z), z, rng.range(0, 6.28), Math.floor(x / CELL), Math.floor(z / CELL), rng.pick([1, 2, 3]), 0);
      taken.push([x, z, 0.35]);
    }
    break;
  }
  // foxes
  const nFox = Math.round(cells.length * 0.9);
  for (let n = 0, tries = 0; n < nFox && tries < nFox * 6; tries++) {
    const s = spot(0.8);
    if (!free(s.x, s.z, 0.4)) continue;
    // most of them look the same way, like a herd
    const face = rng.chance(0.6) ? Math.atan2(rc.x - X0, rc.z - Z0) + rng.range(-0.7, 0.7) : rng.range(0, 6.28);
    prop("fox", s.x, s.y, s.z, face, s.gx, s.gz, rng.weighted([[0, 4], [1, 3], [2, 2], [3, 3]]), rng.chance(0.07) ? 10 : rng.int(0, 9));
    taken.push([s.x, s.z, 0.4]);
    n++;
  }
  // a few together on the top of the hill, all looking the same way
  for (let n = 0; n < 3; n++) {
    const a = rng.range(0, 6.28), r = rng.range(0.8, 1.4);
    const x = best.x + Math.sin(a) * r, z = best.z + Math.cos(a) * r;
    if (!free(x, z, 0.3) || x < X0 + 0.8 || x > X1 - 0.8 || z < Z0 + 0.8 || z > Z1 - 0.8) continue;
    prop("fox", x, ground(x, z), z, Math.atan2(rc.x - X0, rc.z - Z0) + rng.range(-0.3, 0.3), Math.floor(x / CELL), Math.floor(z / CELL), rng.pick([0, 1]), rng.int(0, 9));
    taken.push([x, z, 0.35]);
  }
  // dry bushes, mostly at the foot of the hills
  for (let n = 0, tries = 0; n < Math.round(cells.length * 0.4) && tries < 60; tries++) {
    const s = spot(1.0);
    if (s.y - y0 > 0.5 || !free(s.x, s.z, 0.6)) continue;
    prop("shrub", s.x, s.y, s.z, rng.range(0, 6.28), s.gx, s.gz, rng.int(0, 99));
    taken.push([s.x, s.z, 0.5]);
    n++;
  }
  // on the walls: a tall vent, a hatch, the plaque by a door, the trough
  const ps = rng.shuffle(perimeter.filter(([i]) => !hasDoor(i)));
  const items = ["wallvent", "trough", "hatch", "wallvent"];
  ps.slice(0, items.length).forEach(([i, dd], k) => {
    const wp = wallPoint(i, dd, 0, rng.range(-0.6, 0.6));
    prop(items[k]!, wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz);
  });
  const dc = perimeter.find(([i]) => hasDoor(i));
  if (dc) {
    const wp = wallPoint(dc[0], dc[1], -0.01, 0.9);
    prop("vosplaque", wp.wx, y0 + 1.5, wp.wz, faceRot(dc[1]), wp.gx, wp.gz);
  }
}

// De perszaal: rows of blue fold-down seats facing the front, an aisle along
// one wall and a wide one along the windows (their blinds down). At the front
// the wood-panelled wall, the speakers' desk and the roll-up banner. A white
// ceiling full of small downlights, the raised middle edged in blue, projectors.
function furnishPers(p: Plan, room: Room, rng: Rng, c: Ctx, perimeter: Perimeter, rc: { x: number; z: number }) {
  const { light, prop, center, wallPoint, y0 } = c;
  const HP = 3.0;
  const dim = room.dark ? 0.55 : 1;
  for (const i of room.cells) {
    const q = center(i);
    prop("downlights", q.x, y0 + HP, q.z, 0, q.gx, q.gz);
    light(q.x, y0 + HP - 0.1, q.z, [1.0, 0.93, 0.82], 0.95 * dim, 7, q.gx, q.gz, null);
  }
  if (!perimeter.length) return;
  const { bd, pieces, sd, side } = mainWall(p, perimeter);
  const { at, depth, len, r0 } = wallFrame(p, room, bd, rc);
  // which way along the front the windows are: +1 or -1 in lx
  const ws = DX[sd]! * Math.cos(r0) - DZ[sd]! * Math.sin(r0) > 0 ? 1 : -1;
  for (const [i] of pieces) {
    const wp = wallPoint(i, bd, -0.01);
    prop("woodpanel", wp.wx, y0, wp.wz, r0, wp.gx, wp.gz, Math.round(HP * 100));
  }
  for (const [i, dd] of side) {
    const wp = wallPoint(i, dd);
    prop("blindwindow", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz);
  }
  // the front: the desk on the window side, the banner in the corner, a speaker on the wall
  const dq = at(ws * (len / 2 - 2.9), 1.5);
  prop("persdesk", dq.x, y0, dq.z, r0, dq.gx, dq.gz);
  light(dq.x, y0 + 2.4, dq.z, WARM, 0.8 * dim, 4.5, dq.gx, dq.gz, null);
  const rq = at(ws * (len / 2 - 0.75), 0.7);
  prop("rollup", rq.x, y0, rq.z, r0 - ws * 0.35, rq.gx, rq.gz);
  const sq = at(ws * (len / 2 - 1.6), -0.0);
  prop("wallspeaker", sq.x, y0 + 1.75, sq.z, r0, sq.gx, sq.gz);
  // the seats: a narrow aisle on the far side, a wide one by the windows; blocks of five at most
  const x0 = -ws * (len / 2 - 1.0), x1 = ws * (len / 2 - 2.3);
  const pitch = 0.56, nSeats = Math.max(1, Math.floor(Math.abs(x1 - x0) / pitch));
  for (let lz = 3.0; lz < depth - 1.3; lz += 0.95) {
    for (let k = 0; k < nSeats; k += 5) {
      const n = Math.min(5, nSeats - k);
      const mid = Math.min(x0, x1) + (k + n / 2) * pitch;
      const q = at(mid, lz);
      prop("seatrow", q.x, y0, q.z, r0, q.gx, q.gz, n);
    }
  }
  // the ceiling: the raised middle, two projectors
  const cq = at(0, depth / 2);
  prop("coffer", cq.x, y0 + HP, cq.z, r0, cq.gx, cq.gz, Math.round((len - 3) * 100), Math.round((depth - 3) * 100));
  for (const lz of [depth * 0.45, depth - 1.6]) {
    const q = at(0, lz);
    prop("projector", q.x, y0 + HP, q.z, r0, q.gx, q.gz);
  }
  // the booth window at the back
  const back = perimeter.filter(([i, dd]) => dd === (bd + 2) % 4 && !c.hasDoor(i));
  if (back.length) {
    const [i, dd] = back[Math.floor(back.length / 2)]!;
    const wp = wallPoint(i, dd, -0.01);
    prop("boothwindow", wp.wx, y0 + 1.6, wp.wz, faceRot(dd), wp.gx, wp.gz);
  }
}

// Het oude creative lab: a very long room (see makePlan), purple carpet, a slatted
// metal ceiling with beams across. From end to end: a whiteboard on the blue wall,
// a round table, the long white desks, a round table, the other whiteboard.
// White lockers and plants along one side.
function furnishLab(p: Plan, room: Room, rng: Rng, c: Ctx, perimeter: Perimeter, rc: { x: number; z: number }) {
  const { light, prop, center, wallPoint, y0 } = c;
  const w = room.x1 - room.x0 + 1, d = room.z1 - room.z0 + 1;
  const alongX = w >= d;
  const L0 = (alongX ? w : d) * CELL, W0 = (alongX ? d : w) * CELL;
  for (const i of room.cells) {
    const q = center(i);
    light(q.x, y0 + CEIL - 0.03, q.z, FLUO, 1.1, 7, q.gx, q.gz, "strip", { rot: alongX ? 0 : Math.PI / 2, dead: rng.chance(room.dark ? 0.5 : c.deadP), flick: rng.chance(c.flickP) });
  }
  // the beams across, one every cell
  for (let k = 1; k < L0 / CELL; k++) {
    const u = -L0 / 2 + k * CELL;
    const x = rc.x + (alongX ? u : 0), z = rc.z + (alongX ? 0 : u);
    prop("ceilbeam", x, y0 + CEIL, z, alongX ? Math.PI / 2 : 0, Math.floor(x / CELL), Math.floor(z / CELL), Math.round(W0 * 100));
  }
  // both end walls blue, a whiteboard full of post-its on each, a low cabinet under it
  const ends = alongX ? [0, 2] : [1, 3];
  for (const dd of ends) {
    const ps = perimeter.filter(([, e]) => e === dd);
    ps.forEach(([i], k) => {
      const wp = wallPoint(i, dd, -0.01);
      prop("bluewall", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz);
      if (k === Math.floor(ps.length / 2)) {
        prop("dpcboard", wp.wx, y0 + 1.6, wp.wz, faceRot(dd), wp.gx, wp.gz, dd === ends[0] ? 0 : 1);
        const cb = wallPoint(i, dd);
        prop("cabinet", cb.wx, y0, cb.wz, faceRot(dd), cb.gx, cb.gz);
      }
    });
  }
  // from one end to the other: a round table, the long desks, a round table
  const { at, r0 } = wallFrame(p, room, ends[0]!, rc);
  // an end that's all doors gets a whiteboard on wheels, a little way in, and the round table moves up
  const inset = [0, 0];
  [[ends[0]!, 1.9, r0], [ends[1]!, L0 - 1.9, r0 + Math.PI]].forEach(([dd, lz, rot], k) => {
    if (perimeter.some(([, e]) => e === dd)) return;
    const q = at(0, lz!);
    prop("kanban", q.x, y0, q.z, rot!, q.gx, q.gz, k);
    inset[k] = 1.2;
  });
  for (const lz of [2.4 + inset[0]!, L0 - 2.4 - inset[1]!]) {
    const q = at(0, lz);
    prop("labround", q.x, y0, q.z, rng.range(0, 6.28), q.gx, q.gz, rng.int(0, 99));
  }
  const n = Math.floor((L0 - 8.4 - inset[0]! - inset[1]!) / CELL);
  for (let k = 0; k < n; k++) {
    const q = at(0, (L0 + inset[0]! - inset[1]!) / 2 + (k - (n - 1) / 2) * CELL);
    prop("labdesk", q.x, y0, q.z, faceRot(ends[0]!) + Math.PI / 2, q.gx, q.gz, rng.int(0, 99));
  }
  // one long side: lockers and plants; the other: a whiteboard, a fridge, posters
  // (the lockers on the long side with the most wall)
  const sides = alongX ? [1, 3] : [0, 2];
  const wallOn = (dd: number) => perimeter.filter(([i, e]) => e === dd && !c.hasDoor(i)).length;
  const lockSide = wallOn(sides[0]!) >= wallOn(sides[1]!) ? sides[0]! : sides[1]!;
  for (const [i, dd] of perimeter) {
    if (ends.includes(dd)) continue;
    if (c.hasDoor(i)) continue;
    const wp = wallPoint(i, dd);
    const r = rng.next();
    if (dd === lockSide) {
      if (r < 0.7) prop("labkast", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 99));
      else prop("labplant", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 99));
    } else if (r < 0.25) prop("whiteboard", wp.wx, y0 + 1.4, wp.wz, faceRot(dd), wp.gx, wp.gz);
    else if (r < 0.4) prop("cokefridge", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz);
    else if (r < 0.6) prop("labplant", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 99));
    else if (r < 0.75) c.hangArt(wp.wx, wp.wz, dd, wp.gx, wp.gz, false);
  }
}

// Het Tiktak-huis: the cardboard house from Tik Tak, life size, against the main
// wall: the clock tower with its hand, two wings with red roofs and striped
// curtains in the arches. Cardboard sheep in front, little tower clocks, and a
// glass case with boxes and books.
function furnishTiktak(p: Plan, room: Room, rng: Rng, c: Ctx, perimeter: Perimeter, rc: { x: number; z: number }) {
  const { light, prop, center, wallPoint, y0 } = c;
  for (const i of room.cells) {
    const q = center(i);
    light(q.x, y0 + 3.27, q.z, WARM, 1.0, 7, q.gx, q.gz, "panel", { dead: rng.chance(room.dark ? 0.4 : c.deadP * 0.5) });
  }
  if (!perimeter.length) return;
  const { bd } = mainWall(p, perimeter);
  const { at, depth, r0 } = wallFrame(p, room, bd, rc);
  const h = at(0, 0.8);
  prop("tiktakhuis", h.x, y0, h.z, r0, h.gx, h.gz);
  for (const lx of [-2.2, 0, 2.2]) {
    const q = at(lx, 3.4);
    light(q.x, y0 + 2.8, q.z, [1.0, 0.92, 0.8], 0.9, 6, q.gx, q.gz, null);
  }
  // the sheep, grazing in front of it
  const sheep: [number, number][] = [[-1.6, 2.4], [1.2, 2.2], [rng.range(-2.5, 2.5), rng.range(3.4, Math.min(5, depth - 1.5))]];
  sheep.forEach(([lx, lz], k) => {
    const q = at(lx, lz);
    prop("tiksheep", q.x, y0, q.z, r0 + (rng.chance(0.5) ? 0 : Math.PI) + rng.range(-0.3, 0.3), q.gx, q.gz, k % 2);
  });
  const tc = at(rng.range(-1.2, 1.2), 3.0);
  prop("toyclocks", tc.x, y0, tc.z, r0 + rng.range(-0.4, 0.4), tc.gx, tc.gz);
  // the glass case on a side wall
  const side = perimeter.filter(([i, dd]) => dd % 2 !== bd % 2 && !c.hasDoor(i));
  if (side.length) {
    const [i, dd] = rng.pick(side);
    const wp = wallPoint(i, dd);
    prop("tiktakcase", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 99));
    light(wp.wx - DX[dd]! * 0.8, y0 + 2.0, wp.wz - DZ[dd]! * 0.8, WARM, 0.5, 3.5, wp.gx, wp.gz, null);
  }
}

// Security cameras in the rooms worth watching (the one in the bewaking watches the bewaking).
const CAM_CHANCE: Partial<Record<number, number>> = {
  [RT.SECURITY]: 100, [RT.MESS]: 100, [RT.DOCK]: 80, [RT.SET]: 60, [RT.VIPBAR]: 60, [RT.STUDIO]: 45, [RT.KETNET]: 50, [RT.SPORZA]: 50,
  [RT.CANTEEN]: 50, [RT.KOFFIE]: 50, [RT.DPC]: 40, [RT.TOOTS]: 60, [RT.COSTUME]: 50, [RT.VIPRESTO]: 50, [RT.SERVER]: 50, [RT.CEO]: 40, [RT.LOUNGE]: 40, [RT.ARCHIVE]: 35, [RT.RADIO]: 35,
  [RT.JOURNAAL]: 60, [RT.WEER]: 30, [RT.BIKES]: 70, [RT.VOS]: 100, [RT.PERS]: 70, [RT.LAB]: 40, [RT.TIKTAK]: 60,
};
function roomCamera(p: Plan, room: Room, c: Ctx, perimeter: Perimeter, rc: { x: number; z: number }) {
  const chance = CAM_CHANCE[room.type];
  if (!chance || !perimeter.length) return;
  const h = hash(80, p.f, p.cx, p.cz, room.id);
  if (h % 100 >= chance) return;
  // high in a corner, looking into the room
  const corners = perimeter.filter(([i]) => c.wallDirs(i).length >= 2);
  const [i, dd] = (corners.length ? corners : perimeter)[(h >>> 8) % (corners.length || perimeter.length)]!;
  const pd = (dd + 1) % 4;
  const q = c.center(i);
  const side = c.wallDirs(i).includes(pd) ? 1 : -1;
  const wp = c.wallPoint(i, dd, 0.12, side * 1.15);
  const dist = Math.hypot(rc.x - wp.wx, rc.z - wp.wz);
  const tall = room.type === RT.STUDIO || room.type === RT.KETNET || room.type === RT.SPORZA || room.type === RT.SET || room.type === RT.JOURNAAL || room.type === RT.WEER || room.type === RT.VOS || room.type === RT.TIKTAK;
  c.prop("cctv", wp.wx, c.y0 + (tall ? 3.1 : CEIL - 0.12), wp.wz, Math.atan2(rc.x - wp.wx, rc.z - wp.wz), q.gx, q.gz, Math.round(Math.atan2(tall ? 1.9 : 1.5, Math.max(1.5, dist)) * 100), room.type === RT.SECURITY ? 1 : 0);
}

// The building's services. Returns false for the types it doesn't handle.
function furnishService(p: Plan, room: Room, rng: Rng, c: Ctx, perimeter: Perimeter, rc: { x: number; z: number }): boolean {
  const t = room.type;
  if (t !== RT.COSTUME && t !== RT.DRESSING && t !== RT.VIPBAR && t !== RT.VIPRESTO && t !== RT.CEO && t !== RT.DOCK && t !== RT.SECURITY) return false;
  const { light, prop, center, wallPoint, hasDoor, y0 } = c;
  const w = room.x1 - room.x0 + 1, d = room.z1 - room.z0 + 1;
  const rot = w >= d ? 0 : Math.PI / 2;
  const cells = room.cells;
  const lights = (col: readonly number[], int: number, fix: string | null = "panel", every = 1, y = CEIL - 0.03) =>
    cells.forEach((i, n) => {
      if (n % every) return;
      const q = center(i);
      light(q.x, y0 + y, q.z, col, int, 7, q.gx, q.gz, fix, { rot, dead: room.dark && rng.chance(0.55), flick: rng.chance(c.flickP) });
    });
  // which side of a cell has a door
  const doorDir = (i: number) => {
    const q = center(i);
    for (let dd = 0; dd < 4; dd++) if (sideAt(p.f, q.gx, q.gz, dd).sk === SK.DOOR) return dd;
    return -1;
  };
  if (!perimeter.length) return true;
  const { bd, pieces, side } = mainWall(p, perimeter);
  const mid = Math.floor(pieces.length / 2);
  const others = rng.shuffle(perimeter.filter(([, dd]) => dd !== bd));

  switch (t) {
    case RT.COSTUME: {
      // de kostuumdienst: rails of costumes, mannequins, hats, the lending counter
      lights(FLUO, 1.15);
      const dc = cells.find((i) => hasDoor(i) && c.wallDirs(i).length) ?? perimeter[0]![0];
      const cd = c.wallDirs(dc)[0] ?? perimeter[0]![1];
      const cp = wallPoint(dc, cd);
      prop("lendcounter", cp.wx, y0, cp.wz, faceRot(cd), cp.gx, cp.gz, 1);
      let n = 0;
      for (const i of cells) {
        if (i === dc || hasDoor(i)) continue;
        const q = center(i);
        if (rng.chance(0.18)) prop("mannequin", q.x + rng.range(-0.4, 0.4), y0, q.z + rng.range(-0.4, 0.4), rng.range(0, 6.28), q.gx, q.gz, n++);
        else prop("rail", q.x, y0, q.z, rot, q.gx, q.gz, rng.int(0, 999));
      }
      const uses = ["hatshelf", "mirror", "sewing", "hatshelf", "mirror"];
      others.filter(([i]) => i !== dc).slice(0, uses.length).forEach(([i, dd], k) => {
        const wp = wallPoint(i, dd);
        prop(uses[k]!, wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 99));
      });
      pieces.forEach(([i], k) => {
        if (i === dc || k % 2) return;
        const wp = wallPoint(i, bd, 0.42);
        prop("rail", wp.wx, y0, wp.wz, faceRot(bd), wp.gx, wp.gz, rng.int(0, 999));
      });
      break;
    }
    case RT.DRESSING: {
      // mirrors framed in bulbs along one wall, a rail with the outfit, a sofa, flowers
      lights(WARM, 0.85);
      pieces.forEach(([i]) => {
        const wp = wallPoint(i, bd);
        prop("vanity", wp.wx, y0, wp.wz, faceRot(bd), wp.gx, wp.gz, rng.int(0, 99));
        light(wp.wx - DX[bd]! * 0.7, y0 + 1.5, wp.wz - DZ[bd]! * 0.7, [1.0, 0.86, 0.66], 0.9, 4, wp.gx, wp.gz, null);
      });
      const uses = ["rail", "sofa", "plant", "clock"];
      others.slice(0, uses.length).forEach(([i, dd], k) => {
        const wp = wallPoint(i, dd, uses[k] === "rail" ? 0.42 : 0);
        prop(uses[k]!, wp.wx, uses[k] === "clock" ? y0 + 2.2 : y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 999));
      });
      if (cells.length >= 4) prop("flowers", rc.x, y0, rc.z, rng.range(0, 6), center(cells[0]!).gx, center(cells[0]!).gz);
      break;
    }
    case RT.VIPBAR: {
      // dark, purple, a backlit bar and lounge corners; a velvet rope at the door
      lights(WARM, 0.5, "bulb", 1, CEIL - 0.1);
      const depth = (bd % 2 === 0 ? w : d) * CELL;
      // in a narrow room there's only space for the shelves: no counter, no stools
      const short = depth < 6 ? 1 : 0;
      pieces.forEach(([i], k) => {
        const wp = wallPoint(i, bd);
        prop("vipbar", wp.wx, y0, wp.wz, faceRot(bd), wp.gx, wp.gz, k === mid ? 1 : 0, short);
        light(wp.wx - DX[bd]! * 1.6, y0 + 2.2, wp.wz - DZ[bd]! * 1.6, [1.0, 0.7, 0.45], 0.9, 4.5, wp.gx, wp.gz, null);
      });
      for (const i of cells) {
        const q = center(i);
        const nearBar = (q.x - rc.x) * DX[bd]! + (q.z - rc.z) * DZ[bd]! > depth / 2 - (short ? 1.2 : 2.9);
        if (hasDoor(i)) {
          const dd = doorDir(i);
          if (dd >= 0) {
            const pd = (dd + 1) % 4;
            prop("rope", q.x - DX[dd]! * 0.3 + DX[pd]! * 0.75, y0, q.z - DZ[dd]! * 0.3 + DZ[pd]! * 0.75, faceRot(pd), q.gx, q.gz);
          }
        } else if (!nearBar && rng.chance(0.8)) prop("lounge", q.x, y0, q.z, rng.pick([0, Math.PI / 2]), q.gx, q.gz, rng.int(0, 99));
        if (rng.chance(0.5)) light(q.x, y0 + 1.2, q.z, [0.7, 0.35, 1.0], 0.5, 4, q.gx, q.gz, null);
      }
      break;
    }
    case RT.VIPRESTO: {
      // round tables in white linen, chandeliers, a wine wall, the maître d's lectern
      lights([1.0, 0.85, 0.62], 1.05, "chandelier", 1, CEIL - 0.05);
      for (const i of cells) {
        const q = center(i);
        if (hasDoor(i)) {
          const dd = doorDir(i);
          if (dd >= 0) {
            const pd = (dd + 1) % 4;
            prop("lectern", q.x - DX[dd]! * 0.4 + DX[pd]! * 0.95, y0, q.z - DZ[dd]! * 0.4 + DZ[pd]! * 0.95, faceRot(dd) + Math.PI, q.gx, q.gz);
          }
          continue;
        }
        prop("rtable", q.x + rng.range(-0.25, 0.25), y0, q.z + rng.range(-0.25, 0.25), rng.range(0, 6.28), q.gx, q.gz, rng.int(0, 999));
      }
      pieces.forEach(([i], k) => {
        const wp = wallPoint(i, bd);
        if (k % 2 === 0) prop("winerack", wp.wx, y0, wp.wz, faceRot(bd), wp.gx, wp.gz, rng.int(0, 99));
        else c.hangArt(wp.wx, wp.wz, bd, wp.gx, wp.gz, true);
      });
      break;
    }
    case RT.CEO: {
      // a big desk in front of the VRT logo, bookcases, a sofa corner, a flag
      lights(WARM, 1.05);
      const depth = (bd % 2 === 0 ? w : d) * CELL;
      const [mi] = pieces[mid]!;
      const lp = wallPoint(mi, bd, -0.01);
      prop("vrtframe", lp.wx, y0, lp.wz, faceRot(bd), lp.gx, lp.gz);
      const off = Math.min(1.9, depth / 2 - 0.2);
      const ex = lp.wx - DX[bd]! * off, ez = lp.wz - DZ[bd]! * off;
      prop("ceodesk", ex, y0, ez, faceRot(bd), Math.floor(ex / CELL), Math.floor(ez / CELL), rng.int(0, 99));
      light(ex, y0 + 2.3, ez, WARM, 0.9, 4.5, Math.floor(ex / CELL), Math.floor(ez / CELL), null);
      pieces.forEach(([i], k) => {
        if (k === mid) return;
        const wp = wallPoint(i, bd);
        prop("bookcase", wp.wx, y0, wp.wz, faceRot(bd), wp.gx, wp.gz, rng.int(0, 999));
      });
      const uses = ["sofa", "bookcase", "cflag", "plant", "art"];
      others.slice(0, uses.length).forEach(([i, dd], k) => {
        const wp = wallPoint(i, dd);
        if (uses[k] === "art") c.hangArt(wp.wx, wp.wz, dd, wp.gx, wp.gz, true);
        else prop(uses[k]!, wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 999));
      });
      break;
    }
    case RT.SECURITY: {
      // de bewaking: a wall of camera feeds, the desk in front of it, keys and lockers
      lights(COOL, 0.5);
      pieces.forEach(([i], k) => {
        const wp = wallPoint(i, bd);
        prop("cctvwall", wp.wx, y0, wp.wz, faceRot(bd), wp.gx, wp.gz, k === mid ? 0 : 1 + k, room.id);
        light(wp.wx - DX[bd]! * 1.0, y0 + 1.5, wp.wz - DZ[bd]! * 1.0, [0.7, 0.9, 0.8], 0.75, 5, wp.gx, wp.gz, null);
      });
      const [mi] = pieces[mid]!;
      const dp = wallPoint(mi, bd, 1.3);
      prop("secdesk", dp.wx, y0, dp.wz, faceRot(bd), dp.gx, dp.gz, rng.int(0, 99));
      const uses = ["keybox", "lockers", "notice", "clock", "lockers"];
      others.slice(0, uses.length).forEach(([i, dd], k) => {
        const u = uses[k]!;
        const wp = wallPoint(i, dd);
        prop(u, wp.wx, y0 + (u === "notice" ? 1.45 : u === "clock" ? 2.2 : 0), wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 99));
      });
      break;
    }
    case RT.DOCK: {
      // roller doors onto nothing, one of them half open onto daylight; pallets, flight cases, a forklift
      lights([0.95, 1.0, 0.88], 1.2, "tube");
      pieces.forEach(([i], k) => {
        const wp = wallPoint(i, bd, -0.01);
        const open = k === mid;
        if (k % 2 === mid % 2) {
          prop("rollerdoor", wp.wx, y0, wp.wz, faceRot(bd), wp.gx, wp.gz, k, open ? 1 : 0);
          if (open) light(wp.wx - DX[bd]! * 0.6, y0 + 0.4, wp.wz - DZ[bd]! * 0.6, DAY, 1.4, 7, wp.gx, wp.gz, null);
        } else prop("shelf", wp.wx, y0, wp.wz, faceRot(bd), wp.gx, wp.gz, rng.int(0, 99));
      });
      let fork = false;
      for (const i of cells) {
        if (hasDoor(i)) continue;
        const q = center(i);
        const r = rng.next();
        if (!fork && r < 0.25) {
          fork = true;
          prop("forklift", q.x, y0, q.z, rng.range(0, 6.28), q.gx, q.gz);
        } else if (r < 0.6) prop("pallet", q.x + rng.range(-0.4, 0.4), y0, q.z + rng.range(-0.4, 0.4), rng.range(-0.2, 0.2) + rot, q.gx, q.gz, rng.int(0, 999));
        else if (r < 0.8) prop("flightcase", q.x + rng.range(-0.5, 0.5), y0, q.z + rng.range(-0.5, 0.5), rng.range(0, 6.28), q.gx, q.gz, rng.int(0, 999));
        else if (r < 0.9) prop("palletjack", q.x, y0, q.z, rng.range(0, 6.28), q.gx, q.gz);
      }
      side.slice(0, 2).forEach(([i, dd]) => {
        const wp = wallPoint(i, dd);
        prop("shelf", wp.wx, y0, wp.wz, faceRot(dd), wp.gx, wp.gz, rng.int(0, 99));
      });
      break;
    }
  }
  return true;
}

// --- de decorstraat, Studio Marconi, De Toren ---------------------------------

function furnishTall(p: Plan, rng: Rng, c: Ctx) {
  const a = p.st.atrium!;
  const { light, prop, y0 } = c;
  const top = tallTop(a, H, CEIL);
  const gx0 = p.cx * CH, gz0 = p.cz * CH;
  const W = (lx: number, lz: number) => ({ x: (gx0 + lx) * CELL, z: (gz0 + lz) * CELL, gx: gx0 + Math.floor(lx), gz: gz0 + Math.floor(lz) });

  if (a.kind === "decor") {
    // the street: high lights, the lorry, decor flats against both walls
    for (let lz = 1; lz <= 10; lz += 2) {
      const q = W(6, lz + 0.5);
      light(q.x, y0 + top - 0.3, q.z, [0.95, 1.0, 0.9], 1.7, 11, q.gx, q.gz, "tube", { rot: Math.PI / 2, dead: rng.chance(0.1), flick: rng.chance(0.1) });
    }
    const lo = W(6, 8.6);
    prop("lorry", lo.x, y0, lo.z, Math.PI, lo.gx, lo.gz, rng.int(0, 9));
    for (const [lx, rot] of [[5.06, Math.PI / 2], [6.94, -Math.PI / 2]] as const)
      for (const lz of [1.5, 2.6, 3.8, 7.3, 8.4, 9.5]) {
        const q = W(lx, lz);
        prop(rng.chance(0.75) ? "flat" : rng.chance(0.5) ? "blokjes" : "flightcase", q.x, y0, q.z, rot, q.gx, q.gz, rng.int(0, 999));
      }
    // over the openings: which studio, and whether they're recording
    for (const [lx, rot, n] of [[5.04, Math.PI / 2, 0], [6.96, -Math.PI / 2, 1]] as const) {
      const q = W(lx, 6);
      prop("showsign", q.x, y0 + 5.9, q.z, rot, q.gx, q.gz, n, 0);
      const on = rng.chance(0.6);
      const r = W(lx, 7.5);
      prop("showsign", r.x, y0 + 4.2, r.z, rot, r.gx, r.gz, 3, on ? 1 : 0);
      if (on) light(r.x + Math.sin(rot) * 0.6, y0 + 4.2, r.z + Math.cos(rot) * 0.6, [1.0, 0.2, 0.1], 0.6, 4, r.gx, r.gz, null);
    }
    // studio 5 (west) and studio 3 (east): the audience at the north end, the set at the south end
    for (const [x0, show] of [[1, 5], [7, 3]] as const) {
      const cx = x0 + 2;
      for (let lz = 1; lz <= 10; lz++)
        for (let lx = x0; lx < x0 + 4; lx += 2) {
          const q = W(lx + 1, lz + 0.5);
          prop("rig", q.x, y0 + top - 0.35, q.z, 0, q.gx, q.gz);
        }
      const tr = W(cx, 1.05);
      prop("tribune", tr.x, y0, tr.z, 0, tr.gx, tr.gz, rng.int(0, 99));
      // house lights over the audience and down the studio, bright on the set
      for (let lz = 1.5; lz <= 9.5; lz += 2)
        for (const lx of [cx - 1.1, cx + 1.1]) {
          const q = W(lx, lz);
          light(q.x, y0 + 3.9, q.z, [1.0, 0.88, 0.72], lz < 4 ? 1.7 : 1.3, 10, q.gx, q.gz, null);
        }
      const st = W(cx, 10.98);
      prop(show === 5 ? "talkset" : "blokkenset", st.x, y0, st.z, Math.PI, st.gx, st.gz, rng.int(0, 99));
      for (const lx of [cx - 1.4, cx, cx + 1.4]) {
        const q = W(lx, 8.8);
        light(q.x, y0 + 3.6, q.z, [1.0, 0.92, 0.8], 2.0, 10, q.gx, q.gz, null);
      }
      const ap = W(cx, 7.4);
      prop("showsign", ap.x, y0 + 4.4, ap.z, 0, ap.gx, ap.gz, 2, 1);
      for (let k = -1; k <= 1; k++) {
        const q = W(cx + k * 1.1, 6.6 - Math.abs(k) * 0.3);
        prop("camera", q.x, y0, q.z, k * 0.25, q.gx, q.gz, k === 0 ? 1 : 0);
      }
    }
    return;
  }

  if (a.kind === "marconi") {
    // the room: stage at the north end, chairs, a truss with spots, a projector, a lectern
    for (let lz = 2; lz <= 10; lz++)
      for (let lx = 3; lx <= 9; lx += 2) {
        const q = W(lx + 0.5, lz + 0.5);
        prop("downlights", q.x, y0 + top, q.z, 0, q.gx, q.gz);
        light(q.x, y0 + top - 0.2, q.z, [1.0, 0.86, 0.66], 1.0, 9, q.gx, q.gz, null);
      }
    const stg = W(6.5, 2.1);
    prop("stage", stg.x, y0, stg.z, 0, stg.gx, stg.gz, 11, 4.2);
    const ht = W(8.2, 3.3);
    prop("hightable", ht.x, y0 + 0.6, ht.z, rng.range(0, 6), ht.gx, ht.gz, 1);
    const le = W(5.2, 4.9);
    prop("lectern", le.x, y0, le.z, 0, le.gx, le.gz);
    const scr = W(6.5, 2.0);
    prop("projscreen", scr.x, y0 + 4.7, scr.z, 0, scr.gx, scr.gz, 6, 2.9);
    const tr1 = W(6.5, 5.6);
    prop("truss", tr1.x, y0 + top - 1.1, tr1.z, 0, tr1.gx, tr1.gz, 12, rng.int(0, 99));
    const tr2 = W(4.6, 8.2);
    prop("truss", tr2.x, y0 + top - 1.4, tr2.z, 0.35, tr2.gx, tr2.gz, 7, rng.int(0, 99));
    for (let k = 0; k < 16; k++) {
      const q = W(rng.range(4, 9.2), rng.range(5.5, 10.2));
      prop("bistro", q.x, y0, q.z, Math.PI + rng.range(-0.5, 0.5), q.gx, q.gz, rng.int(0, 99));
    }
    // a tall window onto nothing, the name on the wall by the door
    const tw = W(9.9, 6);
    prop("tallwindow", tw.x, y0, tw.z, -Math.PI / 2, tw.gx, tw.gz, 5.2);
    light(tw.x - 0.8, y0 + 2.5, tw.z, DAY, 1.3, 9, tw.gx, tw.gz, null);
    const sg = W(4.2, 10.94);
    prop("showsign", sg.x, y0 + 2.2, sg.z, Math.PI, sg.gx, sg.gz, 6, 0);
    return;
  }

  if (a.kind === "bos") return furnishBos(p, rng, c);
  if (a.kind === "bareel") return furnishBareel(p, rng, c);

  // De Toren: the model in the middle, a park round it, a sun on the wall, film lights
  const t = towerSpec(p.st, H, CEIL)!;
  for (const [ang, r, hgt, int] of [[0.4, 7, 20, 1.7], [2.2, 7.5, 21, 1.6], [3.9, 7, 19, 1.6], [5.3, 7.5, 22, 1.7], [1.3, 8, 12, 1.2], [4.6, 8, 12, 1.2], [0.2, 6, 7, 1.0], [3.1, 6, 7, 1.0], [0, 1.2, 4, 0.7], [2, 1.2, 9, 0.7], [4, 1.2, 14, 0.7]] as const) {
    const x = t.x + Math.cos(ang) * r, z = t.z + Math.sin(ang) * r;
    light(x, y0 + hgt, z, [1.0, 0.96, 0.86], int, 14, Math.floor(x / CELL), Math.floor(z / CELL), null);
  }
  for (let lz = 1.5; lz <= 10; lz += 3)
    for (let lx = 2.5; lx <= 9.5; lx += 3.5) {
      const q = W(lx, lz);
      light(q.x, y0 + 2.8, q.z, [0.9, 0.95, 1.0], 0.8, 8, q.gx, q.gz, null);
    }
  const sun = W(9.95, 5.5);
  prop("sunlamp", sun.x, y0 + 15, sun.z, -Math.PI / 2, sun.gx, sun.gz);
  light(sun.x - 2, y0 + 15, sun.z, [1.0, 0.92, 0.72], 2.0, 14, sun.gx, sun.gz, null);
  // fake trees, benches, lampposts, film lights on the tower, a wind machine
  const ring = (ang: number, r: number) => {
    const x = t.x + Math.cos(ang) * r, z = t.z + Math.sin(ang) * r;
    return { x, z, gx: Math.floor(x / CELL), gz: Math.floor(z / CELL) };
  };
  for (let k = 0; k < 9; k++) {
    const q = ring(k * 0.7 + rng.range(-0.2, 0.2), rng.range(8.2, 10.8));
    prop("cutout", q.x, y0, q.z, rng.range(0, 6.28), q.gx, q.gz, rng.int(0, 99));
  }
  for (let k = 0; k < 4; k++) {
    const ang = k * 1.57 + 0.8, q = ring(ang, 6.4);
    prop("parkbench", q.x, y0, q.z, Math.atan2(t.x - q.x, t.z - q.z), q.gx, q.gz);
    const l = ring(ang + 0.3, 6.9);
    prop("lamppost", l.x, y0, l.z, 0, l.gx, l.gz);
    light(l.x, y0 + 3.3, l.z, [1.0, 0.85, 0.6], 0.6, 5, l.gx, l.gz, null);
  }
  for (const ang of [0.9, 2.6, 4.2, 5.8]) {
    const q = ring(ang, 9.3);
    prop("filmlight", q.x, y0, q.z, Math.atan2(t.x - q.x, t.z - q.z), q.gx, q.gz, 55);
  }
  const wf = ring(3.5, 10);
  prop("windfan", wf.x, y0, wf.z, Math.atan2(t.x - wf.x, t.z - wf.z), wf.gx, wf.gz);
}

// Het VRT-bos: trees everywhere but on the path and the court, benches and
// lampposts along the path, floodlights on the court, a sun on the wall.
function furnishBos(p: Plan, rng: Rng, c: Ctx) {
  const { light, prop, y0 } = c;
  const s = bosSpec(p.st, H, CEIL)!, ct = s.court;
  const g = (x: number, z: number) => ({ x, z, gx: Math.floor(x / CELL), gz: Math.floor(z / CELL) });
  // daylight: high soft lights over the whole wood, and the sun
  for (let k = 0; k < 4; k++)
    for (let m = 0; m < 4; m++) {
      const q = g(s.X0 + (s.X1 - s.X0) * (k + 0.5) / 4, s.Z0 + (s.Z1 - s.Z0) * (m + 0.5) / 4);
      light(q.x, y0 + s.top - 2.5, q.z, [1.0, 0.98, 0.92], 2.1, 15, q.gx, q.gz, null);
    }
  const sun = g(s.X0 + 6, s.Z0 + 7);
  light(sun.x, y0 + s.top - 1.2, sun.z, [1.0, 0.9, 0.7], 2.2, 16, sun.gx, sun.gz, null);
  // the trees
  const trees: [number, number][] = [];
  const clear = (x: number, z: number) =>
    Math.abs(x - s.pathX(z)) > 1.7 &&
    !(x > ct.x0 - 1.2 && z > ct.z0 - 1.2 && z < ct.z1 + 1.2) &&
    !(x > s.pathX(ct.cz) && Math.abs(z - ct.cz) < 1.8) &&
    trees.every(([tx, tz]) => Math.hypot(tx - x, tz - z) > 2.4);
  for (let k = 0; k < 400 && trees.length < 46; k++) {
    const x = rng.range(s.X0 + 0.9, s.X1 - 0.9), z = rng.range(s.Z0 + 0.9, s.Z1 - 0.9);
    if (!clear(x, z)) continue;
    trees.push([x, z]);
    const q = g(x, z);
    prop("bostree", x, y0, z, 0, q.gx, q.gz, rng.int(0, 999), rng.chance(0.18) ? 1 : rng.chance(0.15) ? 2 : 0);
  }
  // along the path: benches facing it, lampposts
  for (const t of [0.18, 0.42, 0.66, 0.86]) {
    const z = s.Z0 + (s.Z1 - s.Z0) * t, x = s.pathX(z) - 1.35;
    if (trees.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 1.4)) continue;
    const q = g(x, z);
    prop("parkbench", x, y0, z, Math.PI / 2, q.gx, q.gz);
  }
  for (const t of [0.08, 0.3, 0.54, 0.76, 0.95]) {
    const z = s.Z0 + (s.Z1 - s.Z0) * t, x = s.pathX(z) + 1.2;
    const q = g(x, z);
    prop("lamppost", x, y0, z, 0, q.gx, q.gz);
    light(x, y0 + 3.3, z, [1.0, 0.85, 0.6], 0.6, 5, q.gx, q.gz, null);
  }
  // the court: four floodlight masts, the umpire, a bench for the players, some balls
  for (const [x, z] of [[ct.x0 + 0.25, ct.z0 + 0.25], [ct.x1 - 0.25, ct.z0 + 0.25], [ct.x0 + 0.25, ct.z1 - 0.25], [ct.x1 - 0.25, ct.z1 - 0.25]] as const) {
    const q = g(x, z);
    const rot = Math.atan2(ct.cx - x, ct.cz - z);
    prop("floodmast", x, y0, z, rot, q.gx, q.gz);
    light(x + Math.sin(rot) * 2, y0 + 6.8, z + Math.cos(rot) * 2, [1.0, 0.98, 0.9], 2.0, 13, q.gx, q.gz, null);
  }
  const um = g(ct.cx - 10.97 / 2 - 1.45, ct.cz + 1.0);
  prop("umpire", um.x, y0, um.z, Math.PI / 2, um.gx, um.gz);
  const pb = g(ct.x1 - 0.45, ct.cz + 2.6);
  prop("parkbench", pb.x, y0, pb.z, -Math.PI / 2, pb.gx, pb.gz);
  for (let k = 0; k < 7; k++) {
    const q = g(rng.range(ct.x0 + 0.5, ct.x1 - 0.5), rng.chance(0.5) ? rng.range(ct.z0 + 0.3, ct.z0 + 2) : rng.range(ct.z1 - 2, ct.z1 - 0.3));
    prop("tball", q.x, y0, q.z, 0, q.gx, q.gz);
  }
}

// De bareel: daylight, lamps under the canopy, the guard's monitors and desk in
// the booth (with nobody at it), cameras on the columns, trees, lampposts.
function furnishBareel(p: Plan, rng: Rng, c: Ctx) {
  const { light, prop, y0 } = c;
  const a = p.st.atrium!, B = BAREEL, top = tallTop(a, H, CEIL);
  const ox = p.cx * CH * CELL, oz = p.cz * CH * CELL;
  const g = (lx: number, lz: number) => {
    const x = ox + lx, z = oz + lz;
    return { x, z, gx: Math.floor(x / CELL), gz: Math.floor(z / CELL) };
  };
  // daylight: the high-bay lamps under the sky, and a lower ring to fill in the ground
  for (const [lx, lz] of bareelLamps()) {
    const q = g(lx, lz);
    light(q.x, y0 + top - 2.3, q.z, [1.0, 0.98, 0.94], 2.2, 15, q.gx, q.gz, null);
  }
  for (const [lx, lz] of [[5, 6], [16, 6], [28, 6], [28, 18], [28, 30], [16, 30], [5, 30]] as const) {
    const q = g(lx, lz);
    light(q.x, y0 + 7, q.z, [1.0, 0.97, 0.9], 1.5, 11, q.gx, q.gz, null);
  }
  // under the canopy: a row of lamps in the space frame
  for (const [lx, lz] of bareelCanopyLamps()) {
    const q = g(lx, lz);
    light(q.x, y0 + B.canopy.y - 1.0, q.z, [1.0, 0.92, 0.78], 1.4, 8, q.gx, q.gz, null);
  }
  // in the booth: the monitor wall on the east wall, the desk in front of it, a tube light
  const bo = B.booth, bm = (bo.z0 + bo.z1) / 2;
  const w = g(bo.x1 - 0.2, bm);
  prop("cctvwall", w.x, y0, w.z, -Math.PI / 2, w.gx, w.gz, 0, 0);
  const dk = g(bo.x1 - 0.2 - 1.3, bm);
  prop("secdesk", dk.x, y0, dk.z, -Math.PI / 2, dk.gx, dk.gz, rng.int(0, 99));
  const bl = g((bo.x0 + bo.x1) / 2, bm);
  light(bl.x, y0 + bo.h - 0.1, bl.z, [0.9, 0.97, 1.0], 1.3, 5, bl.gx, bl.gz, "tube", { rot: 0, dead: false, flick: rng.chance(0.3) });
  const bin = g(bo.door[1] + 0.5, bo.z0 - 0.5);
  prop("bin", bin.x, y0, bin.z, 0, bin.gx, bin.gz);
  // cameras on two columns: one on the booms, one on the booth
  const cam = (lx: number, lz: number, tx: number, tz: number, own: number) => {
    const q = g(lx, lz);
    prop("cctv", q.x, y0 + 3.6, q.z, Math.atan2(tx - lx, tz - lz), q.gx, q.gz, 22, own);
  };
  cam(B.columns[2][0] - 0.2, B.columns[2][1], 9, B.mid, 1);
  cam(B.columns[1][0] + 0.2, B.columns[1][1], bo.x0, bo.z1, 0);
  // lampposts along the pavement, cones by the island
  for (const lz of [7, 29]) {
    const q = g(B.walk[1] + 0.6, lz);
    prop("lamppost", q.x, y0, q.z, 0, q.gx, q.gz);
    light(q.x, y0 + 3.3, q.z, [1.0, 0.85, 0.6], 0.7, 5, q.gx, q.gz, null);
  }
  for (let k = 0; k < 3; k++) {
    const q = g(B.island[0] - 0.4 - k * 0.5, 12.6 - k * 0.3);
    prop("cone", q.x, y0, q.z, 0, q.gx, q.gz);
  }
  // trees on the grass, east of the booth and along the west wall
  const trees: [number, number][] = [];
  const free = (x: number, z: number) =>
    !(z > 13.6 && z < 16.4) && Math.abs(z - B.mid) > 1.3 &&
    B.columns.every(([cx_, cz_]) => Math.hypot(cx_ - x, cz_ - z) > 1.2) &&
    trees.every(([tx, tz]) => Math.hypot(tx - x, tz - z) > 2.8);
  for (let k = 0; k < 300 && trees.length < 8; k++) {
    const x = rng.range(B.booth.x1 + 3.5, 32.2), z = rng.range(4, 32);
    if (!free(x, z)) continue;
    trees.push([x, z]);
    const q = g(x, z);
    prop("bostree", q.x, y0, q.z, 0, q.gx, q.gz, rng.int(0, 999), 10);
  }
  for (const lz of [5, 30]) {
    const q = g(4.0, lz + rng.range(-0.6, 0.6));
    prop("bostree", q.x, y0, q.z, 0, q.gx, q.gz, rng.int(0, 999), 10);
  }
}

// Studio Toots: a small Marconi, one storey
function furnishToots(p: Plan, room: Room, rng: Rng, c: Ctx, perimeter: Perimeter, rc: { x: number; z: number }) {
  const { light, prop, center, wallPoint, y0 } = c;
  for (const i of room.cells) {
    const q = center(i);
    prop("downlights", q.x, y0 + 3.3, q.z, 0, q.gx, q.gz);
    light(q.x, y0 + 3.1, q.z, [1.0, 0.86, 0.66], 1.0, 7, q.gx, q.gz, null);
  }
  if (!perimeter.length) return;
  const { bd, pieces } = mainWall(p, perimeter);
  const w = room.x1 - room.x0 + 1, d = room.z1 - room.z0 + 1;
  const len = (bd % 2 === 0 ? d : w) * CELL, depth = (bd % 2 === 0 ? w : d) * CELL;
  const [mi] = pieces[Math.floor(pieces.length / 2)]!;
  const wp = wallPoint(mi, bd);
  const r0 = faceRot(bd), ix = -DX[bd]!, iz = -DZ[bd]!;
  const wx = rc.x - ix * (depth / 2 - T), wz = rc.z - iz * (depth / 2 - T);
  const at = (lx: number, lz: number) => {
    const x = wx + lx * Math.cos(r0) + lz * Math.sin(r0), z = wz - lx * Math.sin(r0) + lz * Math.cos(r0);
    return { x, z, gx: Math.floor(x / CELL), gz: Math.floor(z / CELL) };
  };
  const st = at(0, 1.2);
  prop("stage", st.x, y0, st.z, r0, st.gx, st.gz, Math.min(8, len - 1), 2.4);
  prop("projscreen", wp.wx, y0 + 3.15, wp.wz, r0, wp.gx, wp.gz, 7, 1.9);
  const tr = at(0, Math.min(4.5, depth / 2));
  prop("truss", tr.x, y0 + 3.3 - 0.55, tr.z, r0, tr.gx, tr.gz, Math.min(7, len - 1.5), 1000 + rng.int(0, 99));
  const le = at(len / 4, 3.0);
  prop("lectern", le.x, y0, le.z, r0, le.gx, le.gz);
  for (let k = 0; k < Math.min(14, room.cells.length * 2); k++) {
    const q = at(rng.range(-len / 2 + 0.8, len / 2 - 0.8), rng.range(3.8, depth - 0.8));
    prop("bistro", q.x, y0, q.z, r0 + Math.PI + rng.range(-0.5, 0.5), q.gx, q.gz, rng.int(0, 99));
  }
}

// De gang naar de parking: round lamps on the walls, pipes along the ceiling, the
// distance stencilled on the wall every fifty metres. The walls are the same everywhere.
function furnishSnake(p: Plan, rng: Rng, c: Ctx) {
  const { light, prop, center, y0 } = c;
  const maze = mazeAt(p.f, p.st)!;
  const path = maze.path;
  // a point on the inner (narrow) wall of side d
  const face = (i: number, d: number, off = 0) => {
    const q = center(i);
    return { wx: q.x + DX[d]! * (SNAKE_HALF - off), wz: q.z + DZ[d]! * (SNAKE_HALF - off) };
  };
  path.forEach((i, n) => {
    if (p.kind[i] !== K.CORR) return;
    const q = center(i);
    const sd = [0, 1, 2, 3].map((d) => sideAt(p.f, q.gx, q.gz, d).sk);
    const opens = [0, 1, 2, 3].filter((d) => sd[d] === SK.OPEN || sd[d] === SK.DOOR);
    // pipes along the ceiling, into every arm of the cell
    if (opens.length === 2 && (opens[0]! + 2) % 4 === opens[1]) prop("pipes", q.x, y0 + 2.5, q.z, opens[0]! % 2 === 0 ? Math.PI / 2 : 0, q.gx, q.gz, n, 3.02);
    else for (const d of opens) prop("pipes", q.x + DX[d]! * 0.75, y0 + 2.5, q.z + DZ[d]! * 0.75, d % 2 === 0 ? Math.PI / 2 : 0, q.gx, q.gz, n, 1.5);
    // a lamp every other cell, on whichever wall is there
    const walls = [0, 1, 2, 3].filter((d) => !opens.includes(d));
    if (n % 2 === 0 && walls.length) {
      const d = walls[(n >> 1) % walls.length]!;
      const wp = face(i, d, -0.02);
      light(wp.wx - DX[d]! * 0.12, y0 + 2.12, wp.wz - DZ[d]! * 0.12, [1.0, 0.94, 0.82], 1.35, 7, q.gx, q.gz, "roundlamp", {
        rot: faceRot(d), dead: rng.chance(0.08 + n * 0.002), flick: rng.chance(0.07),
      });
    }
    // the markings: the way at the start, then how far you've come
    const mark = n === 0 ? (maze.parking ? 0 : 1) : n % 17 === 0 && n / 17 <= 5 ? [2, 3, 4, 5, 7][n / 17 - 1]! : n % 23 === 11 ? 6 : -1;
    if (mark >= 0 && walls.length) {
      const d = walls[walls.length - 1]!;
      const wp = face(i, d, 0.012);
      prop("stencil", wp.wx, y0 + 1.45, wp.wz, faceRot(d), q.gx, q.gz, mark);
    } else if (!maze.parking && n === path.length - 1 && walls.length) {
      // where it goes: nowhere. Someone from the vakbond is waiting.
      const d = walls.find((w) => (opens[0]! + 2) % 4 === w) ?? walls[0]!;
      const wp = face(i, d, 0.3);
      prop("pop", wp.wx, y0, wp.wz, faceRot(d), q.gx, q.gz, 0);
      const lp = face(i, d, -0.02);
      light(lp.wx - DX[d]! * 0.12, y0 + 2.2, lp.wz - DZ[d]! * 0.12, [1.0, 0.9, 0.75], 1.1, 5, q.gx, q.gz, "roundlamp", { rot: faceRot(d), flick: true });
    } else if (walls.length && hash(85, q.gx, q.gz) % 100 < 7) {
      const d = walls[0]!;
      const wp = face(i, d);
      prop("extinguisher", wp.wx, y0, wp.wz, faceRot(d), q.gx, q.gz);
    }
  });
}
