// Floor-plan generation. Phase 1 ("plan") decides what every cell is: corridor,
// room, stairwell, elevator, atrium void, courtyard... It never looks at other
// chunks, so neighbours can be queried freely without recursion.
import { CELL, CH, DX, DZ, FLOOR_MAX, FLOOR_MIN } from "./config";
import { Rng, floorDiv, hash, mod } from "./rng";

export const K = {
  SOLID: 0,
  CORR: 1,
  ROOM: 2,
  STAIR: 3,
  ELEV: 4,
  VOID: 5,
  COURT: 6,
  GARAGE: 7,
  ROOF: 8,
} as const;

export const RT = {
  OFFICE: 0,
  MEETING: 1,
  BATH: 2,
  STORAGE: 3,
  SERVER: 4,
  STUDIO: 5,
  CANTEEN: 6,
  ARCHIVE: 7,
  REGIE: 8,
  EMPTY: 9,
  EDIT: 10,
} as const;

export const ROOM_LABEL = [
  "KANTOOR",
  "VERGADERZAAL",
  "SANITAIR",
  "BERGING",
  "SERVERLOKAAL",
  "STUDIO",
  "KANTINE",
  "ARCHIEF",
  "REGIE",
  "LEEG LOKAAL",
  "MONTAGE",
];

// Side kinds
export const SK = {
  NONE: -1,
  OPEN: 0,
  WALL: 1,
  DOOR: 2,
  GLASS: 3,
  WINDOW: 4,
  RAIL: 5,
  PARAPET: 6,
} as const;

export interface Door {
  kind: "door" | "double" | "glass" | "fire" | "elev";
  open: boolean;
  owner: number; // local cell index whose side draws the leaf
  w: number;
}

export interface Side {
  sk: number;
  door?: Door;
}

export interface Room {
  id: number;
  type: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  cells: number[];
  dark: boolean;
  glass: boolean;
  num: number;
}

export interface Structure {
  cx: number;
  cz: number;
  corr: Uint8Array;
  stair: null | { c: number; a: number; b: number; d: number };
  elevs: { c: number; e: number; d: number }[];
  atrium: null | { x0: number; z0: number; x1: number; z1: number; f0: number; f1: number };
  court: null | { x0: number; z0: number; x1: number; z1: number };
  style: number;
}

export interface Plan {
  f: number;
  cx: number;
  cz: number;
  st: Structure;
  kind: Uint8Array;
  room: Int16Array;
  zone: Uint8Array; // 1 gallery ring, 2 lobby under atrium, 3 spur
  rooms: Room[];
  sides: Map<number, Side>;
  style: number;
  dark: boolean;
}

export const idx = (x: number, z: number) => z * CH + x;
const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < CH && z < CH;
const inner = (x: number, z: number) => x >= 1 && z >= 1 && x < CH - 1 && z < CH - 1;

// ---------------------------------------------------------------------------
// Floor-independent structure: corridor spine, cores, atria, light wells.

const G = 3;
function rowInfo(cz: number, grp: number) {
  const h = hash(11, cz, grp);
  return { z: 3 + (h % (CH - 7)), w: (h >>> 8) % 100 < 22 ? 2 : 1 };
}
function colInfo(cx: number, grp: number) {
  const h = hash(12, cx, grp);
  return { x: 3 + (h % (CH - 7)), w: (h >>> 8) % 100 < 22 ? 2 : 1 };
}
const xGroup = (cx: number, cz: number) => floorDiv(cx + (hash(13, cz) % G), G);
const zGroup = (cx: number, cz: number) => floorDiv(cz + (hash(14, cx) % G), G);

const structCache = new Map<string, Structure>();

export function getStructure(cx: number, cz: number): Structure {
  const key = cx + "," + cz;
  let s = structCache.get(key);
  if (s) return s;
  s = makeStructure(cx, cz);
  if (structCache.size > 4000) structCache.clear();
  structCache.set(key, s);
  return s;
}

function makeStructure(cx: number, cz: number): Structure {
  const rng = new Rng(hash(21, cx, cz));
  const corr = new Uint8Array(CH * CH);
  const W = rowInfo(cz, xGroup(cx - 1, cz));
  const E = rowInfo(cz, xGroup(cx, cz));
  const N = colInfo(cx, zGroup(cx, cz - 1));
  const S = colInfo(cx, zGroup(cx, cz));
  const hubX = S.x;
  const hubZ = E.z;
  const row = (z: number, w: number, a: number, b: number) => {
    for (let x = Math.min(a, b); x <= Math.max(a, b); x++)
      for (let k = 0; k < w; k++) corr[idx(x, z + k)] = 1;
  };
  const col = (x: number, w: number, a: number, b: number) => {
    for (let z = Math.min(a, b); z <= Math.max(a, b); z++)
      for (let k = 0; k < w; k++) corr[idx(x + k, z)] = 1;
  };
  row(E.z, E.w, hubX, CH - 1);
  col(S.x, S.w, hubZ, CH - 1);
  row(W.z, W.w, 0, hubX);
  col(hubX, S.w, W.z, hubZ);
  col(N.x, N.w, 0, hubZ);
  row(hubZ, E.w, N.x, hubX);

  const reserved = new Uint8Array(CH * CH);
  const free = (x: number, z: number) => inner(x, z) && !corr[idx(x, z)] && !reserved[idx(x, z)];

  const corrCells: number[] = [];
  for (let i = 0; i < CH * CH; i++) if (corr[i]) corrCells.push(i);

  // Stairwell: 1x2 cells sticking out of a corridor.
  let stair: Structure["stair"] = null;
  if (rng.chance(0.62)) {
    for (let t = 0; t < 40 && !stair; t++) {
      const c = rng.pick(corrCells);
      const d = rng.int(0, 3);
      const x = c % CH;
      const z = (c / CH) | 0;
      const ax = x + DX[d]!, az = z + DZ[d]!;
      const bx = x + 2 * DX[d]!, bz = z + 2 * DZ[d]!;
      if (free(ax, az) && free(bx, bz)) {
        stair = { c, a: idx(ax, az), b: idx(bx, bz), d };
        reserved[stair.a] = reserved[stair.b] = 1;
      }
    }
  }

  // Elevator bank: two cars side by side.
  const elevs: Structure["elevs"] = [];
  if (rng.chance(0.4)) {
    for (let t = 0; t < 40 && elevs.length === 0; t++) {
      const c = rng.pick(corrCells);
      const d = rng.int(0, 3);
      const p = (d + 1) % 4;
      const x = c % CH;
      const z = (c / CH) | 0;
      const x2 = x + DX[p]!, z2 = z + DZ[p]!;
      if (!inside(x2, z2) || !corr[idx(x2, z2)]) continue;
      const e1x = x + DX[d]!, e1z = z + DZ[d]!;
      const e2x = x2 + DX[d]!, e2z = z2 + DZ[d]!;
      if (free(e1x, e1z) && free(e2x, e2z)) {
        elevs.push({ c, e: idx(e1x, e1z), d }, { c: idx(x2, z2), e: idx(e2x, e2z), d });
        reserved[idx(e1x, e1z)] = reserved[idx(e2x, e2z)] = 1;
      }
    }
  }

  // Atrium: a multi-storey void with galleries around it.
  let atrium: Structure["atrium"] = null;
  if (rng.chance(0.16)) {
    for (let t = 0; t < 40 && !atrium; t++) {
      const w = rng.int(2, 3), d = rng.int(2, 3);
      const x0 = rng.int(2, CH - 2 - w), z0 = rng.int(2, CH - 2 - d);
      const x1 = x0 + w - 1, z1 = z0 + d - 1;
      let ok = true;
      let touches = false;
      for (let z = z0 - 1; z <= z1 + 1 && ok; z++)
        for (let x = x0 - 1; x <= x1 + 1 && ok; x++) {
          if (!inner(x, z) || reserved[idx(x, z)]) ok = false;
          const isVoid = x >= x0 && x <= x1 && z >= z0 && z <= z1;
          if (isVoid && corr[idx(x, z)]) ok = false;
          if (!isVoid && corr[idx(x, z)]) touches = true;
        }
      if (ok && touches) {
        const f0 = rng.int(0, 4);
        const f1 = Math.min(FLOOR_MAX - 1, f0 + rng.int(2, 6));
        atrium = { x0, z0, x1, z1, f0, f1 };
        for (let z = z0 - 1; z <= z1 + 1; z++)
          for (let x = x0 - 1; x <= x1 + 1; x++) if (!corr[idx(x, z)]) reserved[idx(x, z)] = 1;
      }
    }
  }

  // Light well / courtyard open to the sky.
  let court: Structure["court"] = null;
  if (rng.chance(0.24)) {
    for (let t = 0; t < 40 && !court; t++) {
      const w = rng.int(2, 4), d = rng.int(2, 3);
      const x0 = rng.int(1, CH - 1 - w), z0 = rng.int(1, CH - 1 - d);
      let ok = true;
      for (let z = z0; z < z0 + d && ok; z++)
        for (let x = x0; x < x0 + w && ok; x++) if (!free(x, z)) ok = false;
      if (ok) {
        court = { x0, z0, x1: x0 + w - 1, z1: z0 + d - 1 };
        for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) reserved[idx(x, z)] = 1;
      }
    }
  }

  return { cx, cz, corr, stair, elevs, atrium, court, style: hash(31, cx, cz) % 3 };
}

// Corridor edges can be walled off on a given floor (dead ends).
export function edgeClosedX(f: number, cxEdge: number, cz: number) {
  if (f <= FLOOR_MIN || f >= FLOOR_MAX) return false;
  return hash(41, f, cxEdge, cz) % 100 < 8;
}
export function edgeClosedZ(f: number, cx: number, czEdge: number) {
  if (f <= FLOOR_MIN || f >= FLOOR_MAX) return false;
  return hash(42, f, cx, czEdge) % 100 < 8;
}

// ---------------------------------------------------------------------------
// Per-floor plan

const planCache = new Map<string, Plan>();

export function getPlan(f: number, cx: number, cz: number): Plan {
  const key = f + ":" + cx + "," + cz;
  let p = planCache.get(key);
  if (p) {
    // refresh LRU position
    planCache.delete(key);
    planCache.set(key, p);
    return p;
  }
  p = makePlan(f, cx, cz);
  planCache.set(key, p);
  if (planCache.size > 600) {
    const first = planCache.keys().next().value!;
    planCache.delete(first);
  }
  return p;
}

function setDoor(p: Plan, a: number, d: number, door: Door, sk: number = SK.DOOR) {
  const ax = a % CH, az = (a / CH) | 0;
  const b = idx(ax + DX[d]!, az + DZ[d]!);
  p.sides.set(a * 4 + d, { sk, door });
  p.sides.set(b * 4 + ((d + 2) % 4), { sk, door });
}

function makePlan(f: number, cx: number, cz: number): Plan {
  const st = getStructure(cx, cz);
  const p: Plan = {
    f,
    cx,
    cz,
    st,
    kind: new Uint8Array(CH * CH),
    room: new Int16Array(CH * CH).fill(-1),
    zone: new Uint8Array(CH * CH),
    rooms: [],
    sides: new Map(),
    style: (st.style + (hash(32, cx, cz, floorDiv(f, 4)) % 5 === 0 ? 1 : 0)) % 3,
    dark: false,
  };
  const rng = new Rng(hash(101, f, cx, cz));
  const dist = Math.hypot(cx, cz);
  p.dark = rng.chance(Math.min(0.35, 0.1 + dist * 0.01));

  if (f === FLOOR_MIN) return planGarage(p);
  if (f === FLOOR_MAX) return planRoof(p);

  const { kind, zone } = p;
  for (let i = 0; i < CH * CH; i++) if (st.corr[i]) kind[i] = K.CORR;
  if (st.stair) {
    kind[st.stair.a] = kind[st.stair.b] = K.STAIR;
    setDoor(p, st.stair.c, st.stair.d, { kind: "fire", open: true, owner: st.stair.a, w: 1.1 });
  }
  for (const e of st.elevs) {
    kind[e.e] = K.ELEV;
    setDoor(p, e.c, e.d, { kind: "elev", open: false, owner: e.c, w: 1.1 });
  }
  if (st.court) {
    const c = st.court;
    for (let z = c.z0; z <= c.z1; z++) for (let x = c.x0; x <= c.x1; x++) kind[idx(x, z)] = K.COURT;
  }
  const a = st.atrium;
  if (a && f >= a.f0 && f <= a.f1) {
    for (let z = a.z0 - 1; z <= a.z1 + 1; z++)
      for (let x = a.x0 - 1; x <= a.x1 + 1; x++) {
        const i = idx(x, z);
        const isVoid = x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1;
        if (isVoid) {
          kind[i] = f === a.f0 ? K.CORR : K.VOID;
          zone[i] = 2;
        } else {
          if (kind[i] !== K.CORR) zone[i] = 1;
          kind[i] = K.CORR;
          if (!zone[i]) zone[i] = 1;
        }
      }
  }

  const free = (x: number, z: number) => inside(x, z) && kind[idx(x, z)] === K.SOLID;

  // Spur corridors differ per floor.
  const nSpur = rng.int(0, 2);
  for (let s = 0; s < nSpur; s++) {
    const cands: number[] = [];
    for (let i = 0; i < CH * CH; i++) if (kind[i] === K.CORR && !zone[i]) cands.push(i);
    if (!cands.length) break;
    const c = rng.pick(cands);
    const d = rng.int(0, 3);
    const len = rng.int(2, 5);
    let x = c % CH, z = (c / CH) | 0;
    for (let k = 0; k < len; k++) {
      x += DX[d]!;
      z += DZ[d]!;
      if (!inner(x, z) || !free(x, z)) break;
      kind[idx(x, z)] = K.CORR;
      zone[idx(x, z)] = 3;
    }
  }

  // Rooms: greedy rectangles over the free cells.
  const wW: [number, number][] = [[1, 1], [2, 3], [3, 4], [4, 3], [5, 1]];
  for (let z = 0; z < CH; z++)
    for (let x = 0; x < CH; x++) {
      if (!free(x, z) || p.room[idx(x, z)]! >= 0) continue;
      const tw = rng.weighted(wW), td = rng.weighted(wW);
      let w = 1;
      while (w < tw && free(x + w, z) && p.room[idx(x + w, z)]! < 0) w++;
      let d = 1;
      outer: while (d < td) {
        for (let k = 0; k < w; k++) if (!free(x + k, z + d) || p.room[idx(x + k, z + d)]! >= 0) break outer;
        d++;
      }
      const id = p.rooms.length;
      const room: Room = { id, type: 0, x0: x, z0: z, x1: x + w - 1, z1: z + d - 1, cells: [], dark: false, glass: false, num: 0 };
      for (let zz = z; zz < z + d; zz++)
        for (let xx = x; xx < x + w; xx++) {
          const i = idx(xx, zz);
          p.room[i] = id;
          kind[i] = K.ROOM;
          room.cells.push(i);
        }
      const area = w * d, mn = Math.min(w, d);
      if (area >= 9 && mn >= 3)
        room.type = rng.weighted([[RT.OFFICE, 40], [RT.CANTEEN, 10], [RT.STUDIO, 14], [RT.ARCHIVE, 10], [RT.EMPTY, 12], [RT.REGIE, 8]]);
      else if (area >= 4)
        room.type = rng.weighted([[RT.OFFICE, 30], [RT.MEETING, 20], [RT.BATH, 12], [RT.ARCHIVE, 8], [RT.EDIT, 10], [RT.REGIE, 6], [RT.EMPTY, 8], [RT.SERVER, 6]]);
      else if (area >= 2)
        room.type = rng.weighted([[RT.BATH, 20], [RT.MEETING, 18], [RT.STORAGE, 14], [RT.SERVER, 12], [RT.EDIT, 14], [RT.OFFICE, 12]]);
      else room.type = rng.weighted([[RT.STORAGE, 40], [RT.SERVER, 20], [RT.BATH, 15], [RT.EDIT, 10]]);
      room.dark = rng.chance(room.type === RT.REGIE || room.type === RT.STUDIO ? 0.6 : 0.22 + Math.min(0.3, dist * 0.01));
      room.num = 1 + (hash(55, f, cx, cz, id) % 9);
      p.rooms.push(room);
    }

  // Doors to corridors, then chain unreachable rooms through neighbours.
  const connected = new Set<number>();
  for (const room of p.rooms) {
    const cands: [number, number][] = [];
    for (const i of room.cells) {
      const x = i % CH, z = (i / CH) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d]!, nz = z + DZ[d]!;
        if (inside(nx, nz) && kind[idx(nx, nz)] === K.CORR) cands.push([i, d]);
      }
    }
    if (!cands.length) continue;
    connected.add(room.id);
    const t = room.type;
    const big = t === RT.STUDIO || t === RT.CANTEEN;
    const openP = t === RT.STORAGE || t === RT.SERVER ? 0.45 : t === RT.BATH ? 0.9 : 0.78;
    room.glass = (t === RT.OFFICE || t === RT.MEETING || t === RT.EDIT) && rng.chance(0.35);
    const nDoors = room.cells.length >= 6 && rng.chance(0.4) ? 2 : 1;
    rng.shuffle(cands);
    const used = new Set<number>();
    for (let n = 0; n < nDoors && n < cands.length; n++) {
      const [i, d] = cands[n]!;
      if (used.has(i)) continue;
      used.add(i);
      const glassDoor = room.glass;
      setDoor(
        p,
        i,
        d,
        { kind: glassDoor ? "glass" : big ? "double" : "door", open: rng.chance(openP), owner: i, w: big ? 1.8 : 1.0 },
        glassDoor ? SK.GLASS : SK.DOOR,
      );
    }
    if (room.glass) {
      for (const [i, d] of cands) if (!p.sides.has(i * 4 + d)) setDoor(p, i, d, { kind: "glass", open: false, owner: i, w: 0 }, SK.GLASS);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const room of p.rooms) {
      if (connected.has(room.id)) continue;
      const cands: [number, number][] = [];
      for (const i of room.cells) {
        const x = i % CH, z = (i / CH) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d]!, nz = z + DZ[d]!;
          if (!inside(nx, nz)) continue;
          const r = p.room[idx(nx, nz)]!;
          if (r >= 0 && r !== room.id && connected.has(r)) cands.push([i, d]);
        }
      }
      if (!cands.length) continue;
      const [i, d] = rng.pick(cands);
      setDoor(p, i, d, { kind: "door", open: rng.chance(0.8), owner: i, w: 1.0 });
      connected.add(room.id);
      changed = true;
    }
  }
  for (const room of p.rooms)
    if (!connected.has(room.id))
      for (const i of room.cells) {
        kind[i] = K.SOLID;
        p.room[i] = -1;
      }
  return p;
}

function planGarage(p: Plan): Plan {
  const { st, kind } = p;
  kind.fill(K.GARAGE);
  if (st.court) {
    const c = st.court;
    for (let z = c.z0; z <= c.z1; z++) for (let x = c.x0; x <= c.x1; x++) kind[idx(x, z)] = K.SOLID;
  }
  if (st.stair) {
    kind[st.stair.a] = kind[st.stair.b] = K.STAIR;
    setDoor(p, st.stair.c, st.stair.d, { kind: "fire", open: true, owner: st.stair.a, w: 1.1 });
  }
  for (const e of st.elevs) {
    kind[e.e] = K.ELEV;
    setDoor(p, e.c, e.d, { kind: "elev", open: false, owner: e.c, w: 1.1 });
  }
  return p;
}

function planRoof(p: Plan): Plan {
  const { st, kind } = p;
  kind.fill(K.ROOF);
  if (st.court) {
    const c = st.court;
    for (let z = c.z0; z <= c.z1; z++) for (let x = c.x0; x <= c.x1; x++) kind[idx(x, z)] = K.COURT;
  }
  if (st.stair) {
    kind[st.stair.a] = kind[st.stair.b] = K.STAIR;
    setDoor(p, st.stair.c, st.stair.d, { kind: "fire", open: true, owner: st.stair.a, w: 1.1 });
  }
  for (const e of st.elevs) kind[e.e] = K.SOLID; // lift machine rooms
  return p;
}

// ---------------------------------------------------------------------------
// Global queries (cross-chunk)

export function planAt(f: number, gx: number, gz: number) {
  const cx = floorDiv(gx, CH), cz = floorDiv(gz, CH);
  const p = getPlan(f, cx, cz);
  return { p, i: idx(gx - cx * CH, gz - cz * CH) };
}

export function kindAt(f: number, gx: number, gz: number) {
  const { p, i } = planAt(f, gx, gz);
  return p.kind[i]!;
}

const NONE_SIDE: Side = { sk: SK.NONE };
const OPEN_SIDE: Side = { sk: SK.OPEN };
const WALL_SIDE: Side = { sk: SK.WALL };
const WINDOW_SIDE: Side = { sk: SK.WINDOW };
const RAIL_SIDE: Side = { sk: SK.RAIL };
const PARAPET_SIDE: Side = { sk: SK.PARAPET };

export function sideAt(f: number, gx: number, gz: number, d: number): Side {
  const cx = floorDiv(gx, CH), cz = floorDiv(gz, CH);
  const p = getPlan(f, cx, cz);
  const lx = gx - cx * CH, lz = gz - cz * CH;
  const la = idx(lx, lz);
  const ka = p.kind[la]!;
  if (ka === K.SOLID || ka === K.VOID || ka === K.COURT) return NONE_SIDE;
  const ex = p.sides.get(la * 4 + d);
  if (ex) return ex;
  const bx = gx + DX[d]!, bz = gz + DZ[d]!;
  const lbx = lx + DX[d]!, lbz = lz + DZ[d]!;
  const same = inside(lbx, lbz);
  let kb: number, pb = p, lb = 0;
  if (same) {
    lb = idx(lbx, lbz);
    kb = p.kind[lb]!;
  } else {
    const q = planAt(f, bx, bz);
    pb = q.p;
    lb = q.i;
    kb = pb.kind[lb]!;
  }
  if (kb === K.COURT) {
    if (ka === K.ROOF) return PARAPET_SIDE;
    if (ka === K.CORR || ka === K.ROOM) return WINDOW_SIDE;
    return WALL_SIDE;
  }
  if (kb === K.VOID) return ka === K.CORR ? RAIL_SIDE : WALL_SIDE;
  if (ka === kb && (ka === K.CORR || ka === K.GARAGE || ka === K.ROOF)) {
    if (same) return OPEN_SIDE;
    if (ka === K.CORR) {
      const closed = d === 0 ? edgeClosedX(f, cx + 1, cz) : d === 2 ? edgeClosedX(f, cx, cz) : d === 1 ? edgeClosedZ(f, cx, cz + 1) : edgeClosedZ(f, cx, cz);
      return closed ? WALL_SIDE : OPEN_SIDE;
    }
    return OPEN_SIDE;
  }
  if (same && ka === K.ROOM && kb === K.ROOM && p.room[la] === p.room[lb]) return OPEN_SIDE;
  if (same && ka === K.STAIR && kb === K.STAIR) return OPEN_SIDE;
  return WALL_SIDE;
}

// Can light (and sight) pass between two adjacent cells?
export function lightPass(f: number, gx: number, gz: number, d: number): boolean {
  const ka = kindAt(f, gx, gz);
  const kb = kindAt(f, gx + DX[d]!, gz + DZ[d]!);
  if (ka === K.SOLID || kb === K.SOLID || ka === K.COURT || kb === K.COURT) return false;
  if (ka === K.VOID || kb === K.VOID) return ka === K.VOID ? kb === K.VOID || kb === K.CORR : ka === K.CORR;
  const s = sideAt(f, gx, gz, d);
  if (s.sk === SK.OPEN || s.sk === SK.GLASS || s.sk === SK.RAIL) return true;
  if (s.sk === SK.DOOR) return !!s.door?.open;
  return false;
}

// Human readable label for a cell (HUD).
export function cellLabel(f: number, gx: number, gz: number): string {
  const { p, i } = planAt(f, gx, gz);
  const k = p.kind[i];
  switch (k) {
    case K.CORR:
      if (p.zone[i] === 1 || p.zone[i] === 2) return "ATRIUM";
      return "GANG " + "ABCDEFGH"[mod(hash(61, p.cx, p.cz), 8)] + (1 + mod(hash(62, p.cx, p.cz), 9));
    case K.ROOM: {
      const r = p.rooms[p.room[i]!]!;
      if (r.type === RT.STUDIO) return "STUDIO " + r.num;
      return ROOM_LABEL[r.type]!;
    }
    case K.STAIR:
      return "TRAPHAL";
    case K.ELEV:
      return "LIFT";
    case K.GARAGE:
      return "PARKING";
    case K.ROOF:
      return "DAK";
  }
  return "";
}

// Stair frame helper. Stairs are identical on every floor.
export function stairFrame(cx: number, cz: number) {
  const st = getStructure(cx, cz).stair;
  if (!st) return null;
  const ax = cx * CH + (st.a % CH), az = cz * CH + ((st.a / CH) | 0);
  const d = st.d, pd = (d + 1) % 4;
  const Dx = DX[d]!, Dz = DZ[d]!, Px = DX[pd]!, Pz = DZ[pd]!;
  // centre of A in world units
  const cxw = (ax + 0.5) * CELL, czw = (az + 0.5) * CELL;
  const ox = cxw - (Dx + Px) * CELL * 0.5;
  const oz = czw - (Dz + Pz) * CELL * 0.5;
  return { ox, oz, Dx, Dz, Px, Pz, ax, az, d };
}
