// Warp: the nearest place of a kind, on any floor and far beyond what the map
// shows, and somewhere to stand there (not in a desk, not in a wall). For the
// warp menu in the debug console.
import { CEIL, CELL, CH, CHUNK, DX, DZ, FLOOR_MAX, FLOOR_MIN, H, MID_CZ, MID_FLOOR, T } from "./config";
import { K, SK, getPlan, getStructure, idx, kindAt, mazeAt, passageOffset, sideAt, towerSpec, type Plan, type Room, type Structure } from "./layout";
import { getFurnished, propSolids } from "./furnish";
import { placeAt, roomPlace } from "./places";
import { floorDiv } from "./rng";

export interface WarpSpot {
  f: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface Cand {
  f: number;
  x: number;
  z: number;
  yaw: number;
  exact?: number; // stand exactly here, at this height (the top of De Toren)
}

// the yaw that looks along (vx, vz)
const facing = (vx: number, vz: number) => Math.atan2(-vx, -vz);
const cellCenter = (cx: number, cz: number, lx: number, lz: number) => ({ x: (cx * CH + lx + 0.5) * CELL, z: (cz * CH + lz + 0.5) * CELL });
const ROOM_FLOORS = Array.from({ length: FLOOR_MAX }, (_, k) => k);

// Best first over the blocks around (px, pz), ring by ring, until no ring can beat the best.
function search(px: number, pz: number, pf: number, R: number, visit: (cx: number, cz: number) => Cand[]): Cand | null {
  const cx0 = floorDiv(px, CHUNK), cz0 = floorDiv(pz, CHUNK);
  let best: Cand | null = null, bc = Infinity;
  for (let r = 0; r <= R; r++) {
    if (best && (r - 1) * CHUNK > bc) break;
    for (let cz = cz0 - r; cz <= cz0 + r; cz++)
      for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
        if (Math.max(Math.abs(cx - cx0), Math.abs(cz - cz0)) !== r) continue;
        for (const c of visit(cx, cz)) {
          const cost = Math.hypot(c.x - px, c.z - pz) + Math.abs(c.f - pf) * 12;
          if (cost < bc) { bc = cost; best = c; }
        }
      }
  }
  return best;
}

// Just inside a room's door (open ones first), looking in. Props never stand there.
function doorSpot(p: Plan, r: Room): Cand {
  let best: Cand | null = null;
  for (const i of r.cells)
    for (let d = 0; d < 4; d++) {
      const s = p.sides.get(i * 4 + d);
      if (!s?.door || s.door.w <= 0) continue;
      const c = cellCenter(p.cx, p.cz, i % CH, (i / CH) | 0);
      const cand = { f: p.f, x: c.x + DX[d]! * (CELL / 2 - T - 0.9), z: c.z + DZ[d]! * (CELL / 2 - T - 0.9), yaw: facing(-DX[d]!, -DZ[d]!) };
      if (s.door.open) return cand;
      best ??= cand;
    }
  if (best) return best;
  const c = cellCenter(p.cx, p.cz, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
  return { f: p.f, ...c, yaw: 0 };
}

// Just inside the double doors of a hall (the sporthal, De Toren, het bos...), looking in.
function hallDoors(st: Structure): Cand[] {
  const a = st.atrium!;
  const p = getPlan(a.f0, st.cx, st.cz);
  const out: Cand[] = [];
  for (let z = a.z0 - 1; z <= a.z1 + 1; z++)
    for (let x = a.x0 - 1; x <= a.x1 + 1; x++)
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d]!, nz = z + DZ[d]!;
        if (nx >= a.x0 - 1 && nx <= a.x1 + 1 && nz >= a.z0 - 1 && nz <= a.z1 + 1) continue;
        if (p.sides.get(idx(x, z) * 4 + d)?.door?.kind !== "double") continue;
        const c = cellCenter(st.cx, st.cz, x, z);
        out.push({ f: a.f0, x: c.x + DX[d]! * (CELL / 2 - T - 1.3), z: c.z + DZ[d]! * (CELL / 2 - T - 1.3), yaw: facing(-DX[d]!, -DZ[d]!) });
      }
  return out;
}

// the first corridor cell (not a gallery, not a maze) in a block, looking along it
function corridorIn(f: number, cx: number, cz: number): Cand | null {
  const p = getPlan(f, cx, cz);
  if (mazeAt(f, p.st)) return null;
  for (let i = 0; i < CH * CH; i++) {
    if (p.kind[i] !== K.CORR || p.zone[i]) continue;
    const c = cellCenter(cx, cz, i % CH, (i / CH) | 0);
    for (let d = 0; d < 4; d++)
      if (sideAt(f, Math.floor(c.x / CELL), Math.floor(c.z / CELL), d).sk === SK.OPEN) return { f, ...c, yaw: facing(DX[d]!, DZ[d]!) };
  }
  return null;
}

const clampF = (f: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, f));

// Where a place is (roughly): the best candidate for it around you.
function locate(id: string, px: number, pz: number, pf: number): Cand | null {
  const atrium = (kinds: string[], spot: (st: Structure) => Cand[], R = 12) =>
    search(px, pz, pf, R, (cx, cz) => {
      const st = getStructure(cx, cz);
      return st.atrium && kinds.includes(st.atrium.kind) ? spot(st) : [];
    });
  const fl = clampF(pf, 0, FLOOR_MAX - 1);
  switch (id) {
    case "middengang": {
      const cx = floorDiv(px, CHUNK);
      return { f: MID_FLOOR, x: (cx * CH + 6.5) * CELL, z: (MID_CZ * CH + 6) * CELL, yaw: facing(1, 0) };
    }
    case "rtbf": {
      const cx0 = floorDiv(px, CHUNK);
      for (const dz of [0, -1, -2])
        for (const dx of [0, 1, -1, 2, -2]) {
          const c = corridorIn(fl, cx0 + dx, MID_CZ - 1 + dz);
          if (c) return c;
        }
      return null;
    }
    case "dak":
    case "parking":
      return search(px, pz, pf, 6, (cx, cz) => {
        const st = getStructure(cx, cz), s = st.stair;
        const f = id === "dak" ? FLOOR_MAX : FLOOR_MIN;
        if (!s || st.mid || st.special === "park" || mazeAt(f, st)) return [];
        // in front of the stairwell door, back to it
        return [{ f, ...cellCenter(cx, cz, s.c % CH, (s.c / CH) | 0), yaw: facing(-DX[s.d]!, -DZ[s.d]!) }];
      });
    case "gangparking":
    case "gangnergens":
      return search(px, pz, pf, 8, (cx, cz) => {
        const st = getStructure(cx, cz);
        const out: Cand[] = [];
        for (const f of id === "gangparking" ? [FLOOR_MIN] : ROOM_FLOORS) {
          const m = mazeAt(f, st);
          if (!m || m.parking !== (id === "gangparking")) continue;
          // at its start, looking down it
          const [a, b] = [m.path[0]!, m.path[1] ?? m.path[0]!];
          const c = cellCenter(cx, cz, a % CH, (a / CH) | 0);
          out.push({ f, ...c, yaw: facing((b % CH) - (a % CH), ((b / CH) | 0) - ((a / CH) | 0)) });
        }
        return out;
      });
    case "parkeertoren":
      // (in an aisle, clear of the parked cars)
      return search(px, pz, pf, 8, (cx, cz) => { const st = getStructure(cx, cz); return st.special === "park" ? [{ f: fl, ...cellCenter(cx, cz, st.park === "e" ? 4 : 7, 6), yaw: 0 }] : []; });
    case "plantentuin":
    case "atrium":
      return atrium([id === "plantentuin" ? "garden" : "lobby"], (st) => {
        const a = st.atrium!;
        // on the gallery along one side, looking out over it
        return [{ f: clampF(pf, a.f0, a.f1), ...cellCenter(st.cx, st.cz, a.x0 - 1, Math.floor((a.z0 + a.z1) / 2)), yaw: facing(1, 0) }];
      });
    case "studio5":
    case "studio3":
      return atrium(["decor"], (st) => {
        const five = id === "studio5";
        return [{ f: st.atrium!.f0, ...cellCenter(st.cx, st.cz, five ? 2 : 9, 6), yaw: facing(five ? 1 : -1, 0) }];
      });
    case "torentop":
      return atrium(["tower"], (st) => {
        const t = towerSpec(st, H, CEIL)!;
        const y = t.y0 + t.deck;
        return [{ f: Math.floor((y + 0.7) / H), x: t.x + 3.1, z: t.z, yaw: facing(1, 0), exact: y }];
      });
  }
  const halls: Record<string, string> = { sporthal: "hall", rekwisieten: "props", decorstraat: "decor", marconi: "marconi", toren: "tower", bos: "bos", bareel: "bareel" };
  if (halls[id]) return atrium([halls[id]!], hallDoors);
  // everything else is a kind of room
  return search(px, pz, pf, 6, (cx, cz) => {
    const out: Cand[] = [];
    for (const f of ROOM_FLOORS) {
      const p = getPlan(f, cx, cz);
      for (const r of p.rooms) if (p.kind[r.cells[0]!] === K.ROOM && roomPlace(p, r) === id) out.push(doorSpot(p, r));
    }
    return out;
  });
}

// Somewhere near (x, z) you can stand: on a floor, clear of the walls and of
// everything in the room, and (if id is given) still in that place.
export function settle(f: number, x: number, z: number, id: string | null, rMax = 4): { x: number; z: number } | null {
  const solids: number[] = [];
  const reach = rMax + 4;
  for (let cz = floorDiv(z - reach, CHUNK); cz <= floorDiv(z + reach, CHUNK); cz++)
    for (let cx = floorDiv(x - reach, CHUNK); cx <= floorDiv(x + reach, CHUNK); cx++)
      for (const pr of getFurnished(f, cx, cz).props) if (Math.abs(pr.x - x) < reach && Math.abs(pr.z - z) < reach) solids.push(...propSolids(pr));
  const R = 0.38, m = T + R;
  const ok = (qx: number, qz: number) => {
    const gx = Math.floor(qx / CELL), gz = Math.floor(qz / CELL);
    const k = kindAt(f, gx, gz);
    if (k !== K.CORR && k !== K.ROOM && k !== K.GARAGE && k !== K.ROOF) return false;
    const fx = qx - gx * CELL, fz = qz - gz * CELL;
    if ((fx > CELL - m && sideAt(f, gx, gz, 0).sk !== SK.OPEN) || (fz > CELL - m && sideAt(f, gx, gz, 1).sk !== SK.OPEN)) return false;
    if ((fx < m && sideAt(f, gx, gz, 2).sk !== SK.OPEN) || (fz < m && sideAt(f, gx, gz, 3).sk !== SK.OPEN)) return false;
    for (let i = 0; i < solids.length; i += 4)
      if (qx > solids[i]! - R && qx < solids[i + 2]! + R && qz > solids[i + 1]! - R && qz < solids[i + 3]! + R) return false;
    return !id || placeAt(f, qx, qz, f * H) === id;
  };
  for (let r = 0; r <= rMax; r += 0.25) {
    const n = r ? Math.ceil((2 * Math.PI * r) / 0.25) : 1;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r;
      if (ok(qx, qz)) return { x: qx, z: qz };
    }
  }
  return null;
}

// feet height on a walkable spot (the doorgangen are a few steps down)
function feet(f: number, x: number, z: number) {
  return f * H + (kindAt(f, Math.floor(x / CELL), Math.floor(z / CELL)) === K.ROOM ? passageOffset(f, x, z) : 0);
}

// The nearest `id` (a place from PLACES) from where you are, and where to stand.
export function findWarp(id: string, px: number, pz: number, pf: number): WarpSpot | null {
  const c = locate(id, px, pz, pf);
  if (!c) return null;
  if (c.exact !== undefined) return { f: c.f, x: c.x, y: c.exact, z: c.z, yaw: c.yaw };
  const s = settle(c.f, c.x, c.z, id) ?? settle(c.f, c.x, c.z, null);
  return s && { f: c.f, x: s.x, y: feet(c.f, s.x, s.z), z: s.z, yaw: c.yaw };
}

// Somewhere to stand near a point (the active quest), looking at it.
export function warpNear(f: number, x: number, z: number): WarpSpot | null {
  const s = settle(f, x, z, null, 5);
  if (!s) return null;
  const dx = x - s.x, dz = z - s.z;
  return { f, x: s.x, y: feet(f, s.x, s.z), z: s.z, yaw: Math.hypot(dx, dz) > 0.2 ? facing(dx, dz) : 0 };
}
