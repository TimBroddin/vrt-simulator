// Floor-plan generation. Phase 1 ("plan") decides what every cell is: corridor,
// room, stairwell, elevator, atrium void, courtyard... It never looks at other
// chunks, so neighbours can be queried freely without recursion.
import { CELL, CH, DX, DZ, FLOOR_MAX, FLOOR_MIN, MID_CZ, MID_FLOOR, T } from "./config";
import { Rng, floorDiv, hash, mod } from "./rng";
import { STATIONS } from "./stations";

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
  MESS: 11,
  LOUNGE: 12,
  RADIO: 13, // a radio studio of one of the stations
  KETNET: 14,
  SPORZA: 15,
  SET: 16, // a TV set built inside a studio: Bar Madam (Thuis) or Café De Kampioenen
  COSTUME: 17, // de kostuumdienst
  DRESSING: 18, // kleedkamers
  VIPBAR: 19,
  VIPRESTO: 20,
  CEO: 21,
  DOCK: 22, // laadperrons, on the ground floor
  SECURITY: 23, // de bewaking: the camera feeds
  TOOTS: 24, // Studio Toots: a small Marconi
  PASSAGE: 25, // een doorgang: steps down from one corridor, steps up to another
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
  "DE MESS",
  "ONTSPANNING",
  "RADIOSTUDIO",
  "KETNET",
  "SPORZA",
  "DECOR",
  "KOSTUUMDIENST",
  "KLEEDKAMER",
  "VIP-BAR",
  "VIP-RESTAURANT",
  "KABINET CEO",
  "LAADPERRON",
  "BEWAKING",
  "STUDIO TOOTS",
  "DE CAMPING",
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
  pass?: [number, number]; // a doorgang: the two walls with a door, a few steps up to each
}

export interface Structure {
  cx: number;
  cz: number;
  corr: Uint8Array;
  stair: null | { c: number; a: number; b: number; d: number };
  elevs: { c: number; e: number; d: number }[];
  atrium: null | { x0: number; z0: number; x1: number; z1: number; f0: number; f1: number; kind: AtriumKind };
  court: null | { x0: number; z0: number; x1: number; z1: number };
  style: number;
  mid?: boolean; // de middengang
  special?: Special; // a whole chunk given over to one big place
  deck?: { x0: number; z0: number; x1: number; z1: number }; // parkeertoren deck
}

export type Special = "sport" | "mess" | "park" | "props" | "decor" | "marconi" | "tower" | "bos" | "bareel";
export type AtriumKind = "lobby" | "garden" | "hall" | "props" | "decor" | "marconi" | "tower" | "bos" | "bareel";
// the tall spaces: one volume from the floor of f0 to the ceiling of f1
export const TALL = new Set<AtriumKind>(["hall", "decor", "marconi", "tower", "bos", "bareel"]);
// height of a tall space, from its floor to its ceiling
export const tallTop = (a: { f0: number; f1: number }, H: number, CEIL: number) => (a.f1 - a.f0) * H + CEIL;
// Studio Marconi: the gallery runs along its west side, from this row on
export const marconiGallery = (a: { x0: number; z0: number }, x: number, z: number) => x === a.x0 - 1 && z >= a.z0 + 4;

// Where the big places are: one of each near the start, then scattered around.
const FIXED: Record<string, Special> = { "-2,1": "sport", "2,0": "mess", "0,2": "park", "2,2": "props", "-2,3": "decor", "3,1": "marconi", "0,4": "tower", "3,3": "bos", "1,1": "bareel" };
function rawSpecial(cx: number, cz: number): Special | null {
  if (cz <= MID_CZ) return null;
  const f = FIXED[`${cx},${cz}`];
  if (f) return f;
  if (Math.max(Math.abs(cx), Math.abs(cz)) <= 1) return null;
  const h = hash(71, cx, cz) % 1000;
  return h < 55 ? "sport" : h < 110 ? "mess" : h < 135 ? "park" : h < 165 ? "props" : h < 185 ? "decor" : h < 205 ? "marconi" : h < 215 ? "tower" : h < 227 ? "bos" : h < 236 ? "bareel" : null;
}
function specialFor(cx: number, cz: number): Special | null {
  const s = rawSpecial(cx, cz);
  if (!s || FIXED[`${cx},${cz}`]) return s;
  // never two big places side by side
  for (const [ox, oz] of [[-1, 0], [0, -1], [1, 0], [0, 1]] as const) if (FIXED[`${cx + ox},${cz + oz}`]) return null;
  if (rawSpecial(cx - 1, cz) || rawSpecial(cx, cz - 1)) return null;
  return s;
}

// De Mess is on the ground floor, and once more somewhere higher up.
export function messFloors(st: Structure) {
  return st.special === "mess" ? [0, 3 + (hash(73, st.cx, st.cz >= MID_CZ ? st.cz : 2 * MID_CZ - st.cz) % 7)] : [];
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
  s = cz === MID_CZ ? makeMidStructure(cx) : cz < MID_CZ ? mirrorStructure(getStructure(cx, 2 * MID_CZ - cz), cz) : specialFor(cx, cz) ? makeSpecialStructure(cx, cz, specialFor(cx, cz)!) : makeStructure(cx, cz);
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
  if (rng.chance(0.4)) {
    // a lobby (square, red bench and tree) or a plantentuin (long, planters, glass roof, floating stair)
    const garden = rng.chance(0.68);
    for (let t = 0; t < 70 && !atrium; t++) {
      // try long ones first, fall back to shorter strips so they nearly always fit
      const long = garden ? [6, 6, 5, 5, 4][Math.min(4, Math.floor(t / 14))]! : 0;
      const alongX = rng.chance(0.5);
      const w = garden ? (alongX ? long : 2) : rng.int(2, 3), d = garden ? (alongX ? 2 : long) : rng.int(2, 3);
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
        const f0 = garden ? rng.int(0, 7) : rng.int(0, 4);
        const f1 = Math.min(FLOOR_MAX - 1, f0 + rng.int(garden ? 3 : 2, 6));
        atrium = { x0, z0, x1, z1, f0, f1, kind: garden ? "garden" : "lobby" };
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
  if (f <= FLOOR_MIN || f >= FLOOR_MAX || cz === MID_CZ) return false;
  if (cz < MID_CZ) cz = 2 * MID_CZ - cz;
  return hash(41, f, cxEdge, cz) % 100 < 8;
}
export function edgeClosedZ(f: number, cx: number, czEdge: number) {
  if (f <= FLOOR_MIN || f >= FLOOR_MAX || czEdge === MID_CZ || czEdge === MID_CZ + 1) return false;
  if (czEdge < MID_CZ) czEdge = 2 * MID_CZ - czEdge + 1;
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
  if (cz < MID_CZ) return mirrorPlan(getPlan(f, cx, 2 * MID_CZ - cz), cz);
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
  if (st.mid) {
    // the glass corridor and its links, on one floor; open air everywhere else
    for (let i = 0; i < CH * CH; i++) p.kind[i] = st.corr[i] && f === MID_FLOOR ? K.CORR : K.COURT;
    return p;
  }
  if (st.special === "park") {
    // glass footbridges to an open parking deck, stacked all the way up
    const dk = st.deck!;
    for (let i = 0; i < CH * CH; i++) {
      const x = i % CH, z = (i / CH) | 0;
      const deck = x >= dk.x0 && x <= dk.x1 && z >= dk.z0 && z <= dk.z1;
      p.kind[i] = f === FLOOR_MAX ? (deck || st.corr[i] ? K.ROOF : K.COURT) : deck ? K.GARAGE : st.corr[i] ? K.CORR : K.COURT;
    }
    return p;
  }
  if (f === FLOOR_MAX) return planRoof(p);
  if (isNergens(f, st)) {
    planMaze(p, nergensPath(f, st), false);
    return p;
  }

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
        } else if (TALL.has(a.kind) && !(a.kind === "marconi" && f > a.f0 && marconiGallery(a, x, z))) {
          // the sporthal and the other tall spaces: one volume, several storeys high
          kind[i] = f === a.f0 ? K.CORR : K.VOID;
          zone[i] = 2;
        } else if (a.kind === "marconi") {
          // the gallery of Studio Marconi
          kind[i] = K.CORR;
          zone[i] = 1;
        } else {
          if (kind[i] !== K.CORR) zone[i] = 1;
          kind[i] = K.CORR;
          if (!zone[i]) zone[i] = 1;
        }
      }
  }

  const free = (x: number, z: number) => inside(x, z) && kind[idx(x, z)] === K.SOLID;

  // Sporthal entrances: solid walls to the corridor, with a pair of double doors
  if (a && ((TALL.has(a.kind) && f === a.f0) || (a.kind === "props" && f >= a.f0 && f <= a.f1))) {
    const doors: [number, number][] = [];
    for (let z = a.z0 - 1; z <= a.z1 + 1; z++)
      for (let x = a.x0 - 1; x <= a.x1 + 1; x++)
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d]!, nz = z + DZ[d]!;
          const inHall = nx >= a.x0 - 1 && nx <= a.x1 + 1 && nz >= a.z0 - 1 && nz <= a.z1 + 1;
          if (inHall || !inside(nx, nz) || kind[idx(nx, nz)] !== K.CORR) continue;
          const i = idx(x, z);
          p.sides.set(i * 4 + d, { sk: SK.WALL });
          p.sides.set(idx(nx, nz) * 4 + ((d + 2) % 4), { sk: SK.WALL });
          if (x === Math.floor((a.x0 + a.x1) / 2)) doors.push([i, d]);
        }
    for (const [i, d] of doors) setDoor(p, i, d, { kind: "double", open: true, owner: i, w: 1.8 });
    // de decorstraat: walls between the street and studios 5 and 3, open where the decors roll in
    if (a.kind === "decor")
      for (let z = a.z0 - 1; z <= a.z1 + 1; z++) {
        if (z === 5 || z === 6) continue;
        for (const [xa, d] of [[4, 0], [7, 2]] as const) {
          const ia = idx(xa, z), ib = idx(xa + DX[d]!, z);
          p.sides.set(ia * 4 + d, { sk: SK.WALL });
          p.sides.set(ib * 4 + ((d + 2) % 4), { sk: SK.WALL });
        }
      }
  }

  // De Mess: the whole inside of the chunk is one enormous canteen
  if (st.special === "mess" && messFloors(st).includes(f)) {
    const room: Room = { id: 0, type: RT.MESS, x0: 1, z0: 1, x1: CH - 2, z1: CH - 2, cells: [], dark: false, glass: false, num: 1 };
    for (let z = 1; z < CH - 1; z++)
      for (let x = 1; x < CH - 1; x++) {
        const i = idx(x, z);
        if (kind[i] !== K.SOLID) continue;
        kind[i] = K.ROOM;
        p.room[i] = 0;
        room.cells.push(i);
      }
    p.rooms.push(room);
    for (const [x, z, d] of [[5, 1, 3], [6, CH - 2, 1], [1, 6, 2], [CH - 2, 5, 0]] as const)
      setDoor(p, idx(x, z), d, { kind: "double", open: true, owner: idx(x, z), w: 1.8 });
  }

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
        room.type = rng.weighted([[RT.OFFICE, 30], [RT.MEETING, 20], [RT.BATH, 12], [RT.ARCHIVE, 8], [RT.EDIT, 10], [RT.REGIE, 6], [RT.EMPTY, 8], [RT.SERVER, 6], [RT.LOUNGE, 5]]);
      else if (area >= 2)
        room.type = rng.weighted([[RT.BATH, 20], [RT.MEETING, 18], [RT.STORAGE, 14], [RT.SERVER, 12], [RT.EDIT, 14], [RT.OFFICE, 12], [RT.LOUNGE, 3]]);
      else room.type = rng.weighted([[RT.STORAGE, 40], [RT.SERVER, 20], [RT.BATH, 15], [RT.EDIT, 10]]);
      room.type = brandRoom(room.type, area, hash(56, f, cx, cz, id) % 100);
      room.type = serviceRoom(room.type, area, mn, f, hash(58, f, cx, cz, id) % 100);
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
        // (not onto the floor of a tall space: that's a hall, not a corridor)
        if (inside(nx, nz) && kind[idx(nx, nz)] === K.CORR && zone[idx(nx, nz)] !== 2) cands.push([i, d]);
      }
    }
    if (!cands.length) continue;
    connected.add(room.id);
    const t = room.type;
    const big = t === RT.STUDIO || t === RT.CANTEEN || t === RT.MESS || t === RT.KETNET || t === RT.SPORZA || t === RT.SET || t === RT.TOOTS || t === RT.COSTUME || t === RT.VIPRESTO || t === RT.DOCK;
    if (t === RT.MESS) continue; // its doors were placed above
    const openP = t === RT.STORAGE || t === RT.SERVER ? 0.45 : t === RT.BATH ? 0.9 : 0.78;
    // (rooms converted from offices, meetings and edit suites make the same draw, so the rest of the floor stays the same)
    const glassDraw = (t === RT.OFFICE || t === RT.MEETING || t === RT.EDIT || t === RT.RADIO || t === RT.COSTUME || t === RT.DRESSING || t === RT.CEO) && rng.chance(0.35);
    room.glass = glassDraw && t !== RT.DRESSING;
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
  makePassages(p);
  return p;
}

// Doorgangen: now and then a room between two corridors is a few steps lower,
// with a door on each side. Only plain rooms that already have one door onto a
// corridor and could have one on the opposite wall. By hash: the plan stays the same.
export const PASS_DROP = 0.6; // four steps of 15 cm
export const PASS_RUN = 0.28; // each tread
function makePassages(p: Plan) {
  for (const room of p.rooms) {
    const t = room.type;
    if ((t !== RT.OFFICE && t !== RT.EMPTY && t !== RT.MEETING) || room.glass || p.kind[room.cells[0]!] !== K.ROOM) continue;
    if (hash(90, p.f, p.cx, p.cz, room.id) % 100 >= 50) continue;
    // its doors so far (all onto corridors), and the walls a door could go in
    const doors: [number, number][] = [];
    const cands: [number, number][] = [];
    let ok = true;
    for (const i of room.cells) {
      const x = i % CH, z = (i / CH) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d]!, nz = z + DZ[d]!;
        if (!inside(nx, nz)) continue;
        const s = p.sides.get(i * 4 + d);
        const corr = p.kind[idx(nx, nz)] === K.CORR && !p.zone[idx(nx, nz)];
        if (s?.door) {
          if (!corr || s.sk !== SK.DOOR) ok = false;
          doors.push([i, d]);
        } else if (corr && s?.sk !== SK.GLASS) cands.push([i, d]);
      }
    }
    if (!ok || !doors.length) continue;
    const dirs = [...new Set(doors.map(([, d]) => d))];
    if (dirs.length > 2) continue;
    const [di, dd] = doors[0]!;
    // the other way out: the wall across if it can be, else another one on a corridor
    let od = dirs.find((d) => d !== dd);
    if (od === undefined) {
      const ways = [(dd + 2) % 4, (dd + 1) % 4, (dd + 3) % 4].filter((d) => cands.some(([, c]) => c === d));
      if (!ways.length) continue;
      od = ways[0]!;
      // the new door as close to opposite the first one as it gets
      const other = cands.filter(([, d]) => d === od);
      const ax = od % 2 === 0;
      const key = (i: number) => (ax ? Math.abs(((i / CH) | 0) - ((di / CH) | 0)) : Math.abs((i % CH) - (di % CH)));
      other.sort((a, b) => key(a[0]) - key(b[0]));
      const [oi] = other[0]!;
      setDoor(p, oi, od, { kind: "door", open: true, owner: oi, w: 1.0 });
    }
    for (const [i, d] of doors) p.sides.get(i * 4 + d)!.door!.open = true;
    room.type = RT.PASSAGE;
    room.dark = false;
    room.pass = [dd, od];
  }
}

// How far below the floor you are standing at (x, z) in a doorgang, or 0.
export function passageOffset(f: number, x: number, z: number): number {
  const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
  const cx = floorDiv(gx, CH), cz = floorDiv(gz, CH);
  const p = getPlan(f, cx, cz);
  const i = idx(gx - cx * CH, gz - cz * CH);
  const ri = p.room[i]!;
  if (ri < 0) return 0;
  const r = p.rooms[ri]!;
  if (!r.pass) return 0;
  let h = -PASS_DROP;
  for (const d of r.pass) {
    // the steps only come down in front of a door
    if (!p.sides.get(i * 4 + d)?.door) continue;
    // distance from the wall with the door, into the room
    const wall = d === 0 ? (cx * CH + r.x1 + 1) * CELL - T : d === 2 ? (cx * CH + r.x0) * CELL + T : d === 1 ? (cz * CH + r.z1 + 1) * CELL - T : (cz * CH + r.z0) * CELL + T;
    const u = d % 2 === 0 ? Math.abs(wall - x) : Math.abs(wall - z);
    const k = Math.floor(u / PASS_RUN);
    if (k < 4) h = Math.max(h, -(k + 1) * 0.15);
  }
  return h;
}

// Some studios became the studio of a VRT brand, some edit suites a radio
// studio. Decided by hash, so the random stream (and the floor plan) is unchanged.
function brandRoom(t: number, area: number, h: number): number {
  if (t === RT.STUDIO) return h < 18 ? RT.KETNET : h < 36 ? RT.SPORZA : h < 62 ? RT.SET : h < 74 ? RT.TOOTS : t;
  if (t === RT.EDIT && area >= 4) return h < 45 ? RT.RADIO : t;
  return t;
}

// The building's services: the kostuumdienst, kleedkamers, the VIP bar and
// restaurant, the CEO (top floors only) and the loading docks (ground floor).
// Also by hash, and only from types that keep the random stream the same.
function serviceRoom(t: number, area: number, mn: number, f: number, h: number): number {
  const big = area >= 9 && mn >= 3;
  if (t === RT.OFFICE && big) return h < 9 ? RT.COSTUME : f >= 9 && h < 20 ? RT.CEO : t;
  if (t === RT.OFFICE && area >= 4) return h < 7 ? RT.DRESSING : f >= 9 && h < 13 ? RT.CEO : t;
  if (t === RT.MEETING && area >= 4) return h < 12 ? RT.DRESSING : t;
  if (t === RT.CANTEEN) return h < 35 ? RT.VIPRESTO : t;
  if (t === RT.LOUNGE) return h < 45 ? RT.VIPBAR : t;
  if (t === RT.EMPTY && big) return f === 0 && h < 45 ? RT.DOCK : h < 12 ? RT.VIPBAR : t;
  if (t === RT.ARCHIVE && big && f === 0) return h < 40 ? RT.DOCK : t;
  if ((t === RT.REGIE || t === RT.SERVER) && area >= 4) return h >= 90 ? RT.SECURITY : t;
  return t;
}

// Which station a radio studio belongs to, or which series a set is for.
// Mirrored on the RTBF side, like everything else.
export function roomVariant(p: Plan, r: Room, n: number) {
  return hash(57, p.f, p.cx, p.cz >= MID_CZ ? p.cz : 2 * MID_CZ - p.cz, r.id) % n;
}
export const radioStation = (p: Plan, r: Room) => roomVariant(p, r, STATIONS.length);
export const setIsThuis = (p: Plan, r: Room) => roomVariant(p, r, 2) === 0;

// The HUD name of a room.
export function roomLabel(p: Plan, r: Room): string {
  if (p.cz < MID_CZ) {
    if (r.type === RT.STUDIO || r.type === RT.KETNET || r.type === RT.SPORZA || r.type === RT.SET) return "STUDIO " + r.num;
    if (r.type === RT.TOOTS) return "STUDIO TOOTS";
    if (r.type === RT.PASSAGE) return "LE CAMPING";
    if (r.type === RT.RADIO) return "STUDIO RADIO";
    if (r.type === RT.DRESSING) return "LOGE " + r.num;
    return ROOM_LABEL_FR[r.type]!;
  }
  switch (r.type) {
    case RT.STUDIO: return "STUDIO " + r.num;
    case RT.RADIO: return STATIONS[radioStation(p, r)]!.label;
    case RT.KETNET: return "KETNET · STUDIO " + r.num;
    case RT.SPORZA: return "SPORZA · STUDIO " + r.num;
    case RT.SET: return setIsThuis(p, r) ? "DECOR THUIS" : "DECOR DE KAMPIOENEN";
    case RT.DRESSING: return "KLEEDKAMER " + r.num;
  }
  return ROOM_LABEL[r.type]!;
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
  if (isSnake(st)) planMaze(p, snakePath(st), true);
  return p;
}

// De gang naar de parking: in some blocks floor -1 isn't parking but one long
// narrow corridor twisting through the whole block like a maze, but with only one
// way: no side turnings, from the foot of the stairwell to the parking next door.
// Only in blocks with a stairwell and no lifts or light well, never two side by side.
export function isSnake(st: Structure) {
  if (st.special || st.mid || st.cz <= MID_CZ || !st.stair || st.elevs.length || st.court || ((st.cx + st.cz) & 1) !== 0 || hash(84, st.cx, st.cz) % 100 >= 45) return false;
  // it has to be worth the walk
  return snakePath(st).length >= 60;
}

// is the cell next door (in block cx, cz) plain parking?
function parkingAt(cx: number, cz: number, lx: number, lz: number) {
  const st = getStructure(cx, cz), i = idx(lx, lz);
  const c = st.court;
  if (c && lx >= c.x0 && lx <= c.x1 && lz >= c.z0 && lz <= c.z1) return false;
  if (st.stair && (i === st.stair.a || i === st.stair.b)) return false;
  return !st.elevs.some((e) => e.e === i);
}

const snakeCache = new WeakMap<Structure, number[]>();

// A long self-avoiding walk that keeps turning, from `start`, avoiding `blocked`;
// cut off at the last cell where exitOK (if given). The longest of many tries.
function mazeWalk(start: number, blocked: number[], seed: number, exitOK?: (i: number) => boolean): number[] {
  const rng = new Rng(seed);
  let best: number[] = [];
  for (let attempt = 0; attempt < 90; attempt++) {
    const seen = new Uint8Array(CH * CH);
    for (const b of blocked) seen[b] = 1;
    const path = [start];
    seen[start] = 1;
    let lastD = -1, run = 0;
    const greed = 0.45 + rng.next() * 0.45;
    for (;;) {
      const i = path[path.length - 1]!, x = i % CH, z = (i / CH) | 0;
      const opts: { d: number; j: number; on: number }[] = [];
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d]!, nz = z + DZ[d]!;
        if (nx < 0 || nz < 0 || nx >= CH || nz >= CH || seen[idx(nx, nz)]) continue;
        let on = 0;
        for (let e = 0; e < 4; e++) {
          const mx = nx + DX[e]!, mz = nz + DZ[e]!;
          if (mx >= 0 && mz >= 0 && mx < CH && mz < CH && !seen[idx(mx, mz)] && idx(mx, mz) !== i) on++;
        }
        opts.push({ d, j: idx(nx, nz), on });
      }
      if (!opts.length) break;
      // don't run straight for long: it's a maze, not a corridor
      let pool = run >= 2 ? opts.filter((o) => o.d !== lastD) : opts;
      if (!pool.length) pool = opts;
      let pick: (typeof opts)[number];
      if (rng.next() < greed) {
        // Warnsdorff: the tightest spot first, so the walk doesn't box itself in
        const m = Math.min(...pool.map((o) => o.on));
        pick = rng.pick(pool.filter((o) => o.on === m));
      } else pick = rng.pick(pool);
      run = pick.d === lastD ? run + 1 : 0;
      lastD = pick.d;
      path.push(pick.j);
      seen[pick.j] = 1;
    }
    let k = path.length - 1;
    if (exitOK) while (k > 0 && !exitOK(path[k]!)) k--;
    if (k > best.length - 1) best = path.slice(0, k + 1);
  }
  return best;
}

// The route to the parking, from the foot of the stairs to the way out, as local cell indices.
export function snakePath(st: Structure): number[] {
  const hit = snakeCache.get(st);
  if (hit) return hit;
  const s = st.stair!;
  const exitOK = (i: number) => {
    const x = i % CH, z = (i / CH) | 0;
    return (x === 0 && parkingAt(st.cx - 1, st.cz, CH - 1, z)) || (x === CH - 1 && parkingAt(st.cx + 1, st.cz, 0, z)) ||
      (z === 0 && parkingAt(st.cx, st.cz - 1, x, CH - 1)) || (z === CH - 1 && parkingAt(st.cx, st.cz + 1, x, 0));
  };
  const best = mazeWalk(s.c, [s.a, s.b], hash(86, st.cx, st.cz), exitOK);
  snakeCache.set(st, best);
  return best;
}

// De gang naar nergens: rarely, a whole block on an office floor is the same maze,
// entered from one corridor, and it just ends. Blocks without stairs, lifts, light
// well or atrium; never two side by side.
export function isNergens(f: number, st: Structure) {
  if (f < 0 || f >= FLOOR_MAX || st.special || st.mid || st.cz <= MID_CZ || st.stair || st.elevs.length || st.court || st.atrium) return false;
  return ((st.cx + st.cz + f) & 1) === 0 && hash(87, f, st.cx, st.cz) % 1000 < 35;
}

// where the corridors of the blocks around arrive on this block's edge
function portals(st: Structure) {
  const out: number[] = [];
  for (let i = 0; i < CH * CH; i++) {
    const x = i % CH, z = (i / CH) | 0;
    if (st.corr[i] && (x === 0 || z === 0 || x === CH - 1 || z === CH - 1)) out.push(i);
  }
  return out;
}

const nergensCache = new Map<string, number[]>();
export function nergensPath(f: number, st: Structure): number[] {
  const key = `${f}:${st.cx},${st.cz}`;
  const hit = nergensCache.get(key);
  if (hit) return hit;
  const ps = portals(st);
  const start = ps[hash(88, f, st.cx, st.cz) % ps.length]!;
  // the other corridors arriving here run into a wall
  const path = mazeWalk(start, ps.filter((i) => i !== start), hash(89, f, st.cx, st.cz));
  if (nergensCache.size > 200) nergensCache.clear();
  nergensCache.set(key, path);
  return path;
}

// The maze on this floor of this block, if there is one (mirrored on the RTBF side).
export function mazeAt(f: number, st: Structure): { path: number[]; parking: boolean } | null {
  if (st.cz < MID_CZ) {
    const m = mazeAt(f, getStructure(st.cx, 2 * MID_CZ - st.cz));
    return m && { path: m.path.map(mi), parking: m.parking };
  }
  if (f === FLOOR_MIN) return isSnake(st) ? { path: snakePath(st), parking: true } : null;
  return isNergens(f, st) ? { path: nergensPath(f, st), parking: false } : null;
}

function planMaze(p: Plan, path: number[], parking: boolean) {
  const { kind } = p;
  const at = new Map<number, number>();
  path.forEach((i, n) => at.set(i, n));
  for (let i = 0; i < CH * CH; i++) if (kind[i] !== K.STAIR) kind[i] = K.SOLID;
  for (const i of path) kind[i] = K.CORR;
  // the last step opens onto the parking next door
  if (parking) kind[path[path.length - 1]!] = K.GARAGE;
  // one way: wherever the route passes itself, there's a wall in between
  for (const [i, n] of at)
    for (let d = 0; d < 4; d++) {
      const x = (i % CH) + DX[d]!, z = ((i / CH) | 0) + DZ[d]!;
      if (x < 0 || z < 0 || x >= CH || z >= CH) continue;
      const j = idx(x, z), m = at.get(j);
      if (m === undefined) continue;
      p.sides.set(i * 4 + d, Math.abs(m - n) === 1 ? OPEN_SIDE : WALL_SIDE);
    }
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
    if (ka === K.ROOF || ka === K.GARAGE) return PARAPET_SIDE;
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
  // the footbridges walk straight onto the parking deck
  if (same && p.st.special === "park" && ((ka === K.CORR && kb === K.GARAGE) || (ka === K.GARAGE && kb === K.CORR))) return OPEN_SIDE;
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
const ROOM_LABEL_FR = ["BUREAU", "SALLE DE RÉUNION", "SANITAIRES", "RÉSERVE", "SALLE DES SERVEURS", "STUDIO", "CANTINE", "ARCHIVES", "RÉGIE", "LOCAL VIDE", "MONTAGE", "LE MESS", "SALLE DE DÉTENTE", "STUDIO RADIO", "STUDIO", "STUDIO", "STUDIO", "COSTUMES", "LOGE", "BAR VIP", "RESTAURANT VIP", "BUREAU DU CEO", "QUAI DE CHARGEMENT", "SÉCURITÉ", "STUDIO TOOTS", "LE CAMPING"];

export function cellLabel(f: number, gx: number, gz: number): string {
  const { p, i } = planAt(f, gx, gz);
  const k = p.kind[i];
  if (p.st.mid && (k === K.CORR || k === K.ROOF)) return "MIDDENGANG";
  if (p.st.special === "park") return k === K.CORR ? (p.cz < MID_CZ ? "PASSERELLE" : "LOOPBRUG") : p.cz < MID_CZ ? "PARKING-TOUR" : "PARKEERTOREN";
  if (p.st.atrium?.kind === "hall" && p.zone[i] === 2) return p.cz < MID_CZ ? "SALLE DE SPORT" : "SPORTHAL";
  if (p.st.atrium?.kind === "props" && (p.zone[i] === 1 || p.zone[i] === 2) && p.f >= p.st.atrium.f0 && p.f <= p.st.atrium.f1) return p.cz < MID_CZ ? "ACCESSOIRES" : "REKWISIETEN";
  const ta = p.st.atrium;
  if (ta && TALL.has(ta.kind) && ta.kind !== "hall" && (p.zone[i] === 1 || p.zone[i] === 2) && p.f >= ta.f0 && p.f <= ta.f1) {
    const fr = p.cz < MID_CZ;
    if (ta.kind === "decor") {
      const x = i % CH;
      return x <= 4 ? "STUDIO 5" : x >= 7 ? "STUDIO 3" : fr ? "RUE DES DÉCORS" : "DECORSTRAAT";
    }
    if (ta.kind === "bos") return fr ? "LE BOIS" : "VRT-BOS";
    if (ta.kind === "bareel") return fr ? "LA BARRIÈRE" : "DE BAREEL";
    return ta.kind === "marconi" ? "STUDIO MARCONI" : fr ? "LA TOUR" : "DE TOREN";
  }
  if (p.cz < MID_CZ) {
    if (k === K.CORR && mazeAt(p.f, p.st)) return mazeAt(p.f, p.st)!.parking ? "COULOIR VERS LE PARKING" : "COULOIR VERS NULLE PART";
    switch (k) {
      case K.CORR:
        if (p.zone[i] === 1 || p.zone[i] === 2) return p.st.atrium?.kind === "garden" ? "JARDIN INTÉRIEUR" : "ATRIUM";
        return "COULOIR " + "ABCDEFGH"[mod(hash(61, p.cx, p.cz), 8)] + (1 + mod(hash(62, p.cx, p.cz), 9));
      case K.ROOM: return roomLabel(p, p.rooms[p.room[i]!]!);
      case K.STAIR: return "ESCALIER";
      case K.ELEV: return "ASCENSEUR";
      case K.GARAGE: return "PARKING";
      case K.ROOF: return "TOIT";
    }
    return "";
  }
  if (k === K.CORR && mazeAt(p.f, p.st)) return mazeAt(p.f, p.st)!.parking ? "GANG NAAR DE PARKING" : "GANG NAAR NERGENS";
  switch (k) {
    case K.CORR:
      if (p.zone[i] === 1 || p.zone[i] === 2) return p.st.atrium?.kind === "garden" ? "PLANTENTUIN" : "ATRIUM";
      return "GANG " + "ABCDEFGH"[mod(hash(61, p.cx, p.cz), 8)] + (1 + mod(hash(62, p.cx, p.cz), 9));
    case K.ROOM: return roomLabel(p, p.rooms[p.room[i]!]!);
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

// The floating stair in a plantentuin: one straight flight along the long axis,
// from the garden floor up to the first gallery. Same on every floor's plan.
export interface GardenStair {
  alongX: boolean;
  b: number; // top edge (world coord along the axis)
  sb: number; // bottom start
  pc: number; // lateral centre
  half: number;
  run: number;
  f0: number;
}

export function gardenStair(st: Structure): GardenStair | null {
  const a = st.atrium;
  if (a && a.kind === "marconi") {
    // a steel stair up the west wall of Studio Marconi, landing on the gallery
    const b = (st.cz * CH + a.z0 + 4) * CELL;
    return { alongX: false, b, sb: b - 6.3, pc: (st.cx * CH + a.x0 - 1) * CELL + 0.95, half: 0.62, run: 6.3, f0: a.f0 };
  }
  if (!a || a.kind !== "garden") return null;
  const alongX = a.x1 - a.x0 > a.z1 - a.z0;
  const X0 = (st.cx * CH + a.x0) * CELL, X1 = (st.cx * CH + a.x1 + 1) * CELL;
  const Z0 = (st.cz * CH + a.z0) * CELL, Z1 = (st.cz * CH + a.z1 + 1) * CELL;
  const run = 6.3;
  const b = alongX ? X1 : Z1;
  return { alongX, b, sb: b - run, pc: alongX ? (Z0 + Z1) / 2 : (X0 + X1) / 2, half: 0.72, run, f0: a.f0 };
}

// Height of the stair under (x, z), or null when not on it.
export function gardenRampY(g: GardenStair, x: number, z: number, H: number): number | null {
  const s = g.alongX ? x : z, lat = g.alongX ? z : x;
  if (Math.abs(lat - g.pc) > g.half || s < g.sb || s > g.b) return null;
  return g.f0 * H + (H * (s - g.sb)) / g.run;
}

// ---------------------------------------------------------------------------
// De middengang and the RTBF twin

function makeMidStructure(cx: number): Structure {
  const corr = new Uint8Array(CH * CH);
  // the long glass corridor
  for (let x = 0; x < CH; x++) corr[idx(x, 5)] = corr[idx(x, 6)] = 1;
  // a glass link to both buildings, lined up with the VRT chunk's north portal
  // (the RTBF chunk is its mirror image, so its south portal sits at the same x)
  const N = colInfo(cx, zGroup(cx, MID_CZ));
  for (let z = 0; z < CH; z++) for (let k = 0; k < N.w; k++) corr[idx(N.x + k, z)] = 1;
  return { cx, cz: MID_CZ, corr, stair: null, elevs: [], atrium: null, court: null, style: 1, mid: true };
}

const mi = (i: number) => idx(i % CH, CH - 1 - ((i / CH) | 0));
const md = (d: number) => (d === 1 ? 3 : d === 3 ? 1 : d);

function mirrorStructure(src: Structure, cz: number): Structure {
  const corr = new Uint8Array(CH * CH);
  for (let i = 0; i < CH * CH; i++) corr[mi(i)] = src.corr[i]!;
  const a = src.atrium;
  const c = src.court;
  return {
    cx: src.cx,
    cz,
    corr,
    stair: src.stair ? { c: mi(src.stair.c), a: mi(src.stair.a), b: mi(src.stair.b), d: md(src.stair.d) } : null,
    elevs: src.elevs.map((e) => ({ c: mi(e.c), e: mi(e.e), d: md(e.d) })),
    atrium: a ? { ...a, z0: CH - 1 - a.z1, z1: CH - 1 - a.z0 } : null,
    court: c ? { ...c, z0: CH - 1 - c.z1, z1: CH - 1 - c.z0 } : null,
    style: src.style,
    special: src.special,
    deck: src.deck ? { ...src.deck, z0: CH - 1 - src.deck.z1, z1: CH - 1 - src.deck.z0 } : undefined,
  };
}

function mirrorPlan(src: Plan, cz: number): Plan {
  const p: Plan = {
    f: src.f,
    cx: src.cx,
    cz,
    st: getStructure(src.cx, cz),
    kind: new Uint8Array(CH * CH),
    room: new Int16Array(CH * CH).fill(-1),
    zone: new Uint8Array(CH * CH),
    rooms: src.rooms.map((r) => ({ ...r, z0: CH - 1 - r.z1, z1: CH - 1 - r.z0, cells: r.cells.map(mi), pass: r.pass && (r.pass.map(md) as [number, number]) })),
    sides: new Map(),
    style: src.style,
    dark: src.dark,
  };
  for (let i = 0; i < CH * CH; i++) {
    const j = mi(i);
    p.kind[j] = src.kind[i]!;
    p.room[j] = src.room[i]!;
    p.zone[j] = src.zone[i]!;
  }
  const doors = new Map<Door, Door>();
  for (const [key, side] of src.sides) {
    const i = Math.floor(key / 4), d = key % 4;
    let door = side.door;
    if (door) {
      if (!doors.has(door)) doors.set(door, { ...door, owner: mi(door.owner) });
      door = doors.get(door);
    }
    p.sides.set(mi(i) * 4 + md(d), { sk: side.sk, door });
  }
  return p;
}

// ---------------------------------------------------------------------------
// Architectural anomalies. Rare, deterministic, and more common the further you
// wander from the start.
export type Anomaly = "" | "low" | "chairs" | "stairs" | "flooded" | "upside" | "poppen";

export function roomAnomaly(p: Plan, r: Room): Anomaly {
  if (p.f <= FLOOR_MIN || p.f >= FLOOR_MAX) return "";
  const h = hash(501, p.f, p.cx, p.cz, r.id) % 1000;
  const k = 1 + Math.min(2, Math.hypot(p.cx, p.cz) * 0.08);
  const w = r.x1 - r.x0 + 1, d = r.z1 - r.z0 + 1;
  if (r.type === RT.EMPTY) {
    if ((w === 1 || d === 1) && Math.max(w, d) >= 3 && h < 500) return "low";
    if (h < 260 * k) return (["chairs", "stairs", "flooded"] as const)[h % 3]!;
  }
  // a room full of poppen: rare
  if ((r.type === RT.EMPTY || r.type === RT.MEETING) && w * d >= 4 && hash(502, p.f, p.cx, p.cz, r.id) % 1000 < 5) return "poppen";
  if (r.type === RT.STORAGE && h < 130 * k) return "flooded";
  if (r.type === RT.OFFICE && h < 45 * k) return "upside";
  return "";
}

export function anomalyAt(f: number, gx: number, gz: number): Anomaly {
  const { p, i } = planAt(f, gx, gz);
  if (p.kind[i] !== K.ROOM) return "";
  return roomAnomaly(p, p.rooms[p.room[i]!]!);
}

// Special chunks: a corridor around the edge (so every neighbour's portal
// connects), and the inside given over to one big place.
function makeSpecialStructure(cx: number, cz: number, kind: Special): Structure {
  const corr = new Uint8Array(CH * CH);
  const base: Structure = { cx, cz, corr, stair: null, elevs: [], atrium: null, court: null, style: 1, special: kind };
  if (kind === "park") {
    const W = rowInfo(cz, xGroup(cx - 1, cz)), E = rowInfo(cz, xGroup(cx, cz));
    const N = colInfo(cx, zGroup(cx, cz - 1)), S = colInfo(cx, zGroup(cx, cz));
    const dk = { x0: 3, z0: 3, x1: CH - 4, z1: CH - 4 };
    for (let x = 0; x < dk.x0; x++) for (let k = 0; k < W.w; k++) corr[idx(x, W.z + k)] = 1;
    for (let x = dk.x1 + 1; x < CH; x++) for (let k = 0; k < E.w; k++) corr[idx(x, E.z + k)] = 1;
    for (let z = 0; z < dk.z0; z++) for (let k = 0; k < N.w; k++) corr[idx(N.x + k, z)] = 1;
    for (let z = dk.z1 + 1; z < CH; z++) for (let k = 0; k < S.w; k++) corr[idx(S.x + k, z)] = 1;
    return { ...base, deck: dk };
  }
  for (let i = 0; i < CH; i++) corr[idx(i, 0)] = corr[idx(i, CH - 1)] = corr[idx(0, i)] = corr[idx(CH - 1, i)] = 1;
  const fixed = !!FIXED[`${cx},${cz}`];
  if (kind === "decor") {
    // de decorstraat between studios 5 and 3, on the ground floor, two storeys high
    base.atrium = { x0: 2, z0: 2, x1: 9, z1: 9, f0: 0, f1: 1, kind: "decor" };
  }
  if (kind === "marconi") {
    // an event space, two storeys, with a gallery; a corridor on the west reaches the gallery
    const f0 = fixed ? 0 : [0, 2, 4][hash(75, cx, cz) % 3]!;
    base.atrium = { x0: 3, z0: 3, x1: 8, z1: 9, f0, f1: f0 + 1, kind: "marconi" };
    corr[idx(1, 8)] = 1;
  }
  if (kind === "tower") {
    // the Reyers tower, indoors, seven storeys high
    const f0 = fixed ? 0 : [0, 2][hash(76, cx, cz) % 2]!;
    base.atrium = { x0: 3, z0: 2, x1: 8, z1: 9, f0, f1: f0 + 6, kind: "tower" };
  }
  if (kind === "bos") {
    // het VRT-bos: trees and a tennis court, indoors, under a painted sky, four storeys high
    const f0 = fixed ? 0 : [0, 1, 3][hash(77, cx, cz) % 3]!;
    base.atrium = { x0: 2, z0: 2, x1: 9, z1: 9, f0, f1: f0 + 3, kind: "bos" };
  }
  if (kind === "bareel") {
    // de bareel: the gate at the entrance, indoors, four storeys high
    const f0 = fixed ? 0 : [0, 0, 3][hash(78, cx, cz) % 3]!;
    base.atrium = { x0: 2, z0: 2, x1: 9, z1: 9, f0, f1: f0 + 3, kind: "bareel" };
  }
  if (kind === "props") {
    // two storeys: racks on the floor, a gallery all around upstairs
    const f0 = FIXED[`${cx},${cz}`] ? 2 : [1, 3, 5, 7][hash(74, cx, cz) % 4]!;
    base.atrium = { x0: 3, z0: 2, x1: 8, z1: 9, f0, f1: f0 + 1, kind: "props" };
  }
  if (kind === "sport") {
    const f0 = FIXED[`${cx},${cz}`] ? 0 : [0, 3, 6, 8][hash(72, cx, cz) % 4]!;
    base.atrium = { x0: 3, z0: 2, x1: 8, z1: 9, f0, f1: f0 + 2, kind: "hall" };
  }
  return base;
}

// Het VRT-bos: world-space layout of the forest and its tennis court. The path
// runs from the north doors to the south doors, bending west round the court.
export interface BosSpec {
  X0: number; Z0: number; X1: number; Z1: number; // inside the walls
  y0: number; top: number;
  court: { x0: number; z0: number; x1: number; z1: number; cx: number; cz: number }; // the fence
  door: number; // x of the doors
  pathX: (z: number) => number;
}
export function bosSpec(st: Structure, H: number, CEIL: number): BosSpec | null {
  const a = st.atrium;
  if (!a || a.kind !== "bos") return null;
  const ox = st.cx * CH * CELL, oz = st.cz * CH * CELL;
  const X0 = ox + (a.x0 - 1) * CELL + T, X1 = ox + (a.x1 + 2) * CELL - T;
  const Z0 = oz + (a.z0 - 1) * CELL + T, Z1 = oz + (a.z1 + 2) * CELL - T;
  const door = ox + (Math.floor((a.x0 + a.x1) / 2) + 0.5) * CELL;
  const court = { x0: ox + 17.8, z0: Z0 + 0.9, x1: X1 - 0.4, z1: Z1 - 0.9, cx: 0, cz: 0 };
  court.cx = (court.x0 + court.x1) / 2;
  court.cz = (court.z0 + court.z1) / 2;
  const pathX = (z: number) => {
    const t = Math.min(1, Math.max(0, (z - Z0) / (Z1 - Z0)));
    return door - 2.6 * Math.sin(Math.PI * t) ** 2 + 0.9 * Math.sin(3 * Math.PI * t) * Math.sin(Math.PI * t);
  };
  return { X0, Z0, X1, Z1, y0: a.f0 * H, top: tallTop(a, H, CEIL), court, door, pathX };
}

// De bareel: in metres from the corner of its chunk. The road runs north-south
// through two barriers; across the middle a hedge, and the only way through on
// foot is the guard's booth. The north half is outside, the south half inside.
export const BAREEL = {
  mid: 18, // the hedge, the booms
  laneA: [5.0, 8.6] as const, // inbound
  island: [8.6, 10.0] as const,
  laneB: [10.0, 13.6] as const, // outbound
  walk: [15.4, 19.2] as const, // the pavement from door to door
  booth: { x0: 17.6, x1: 22.6, z0: 16.4, z1: 19.6, door: [17.9, 19.0] as const, h: 2.7 },
  canopy: { x0: 3.6, x1: 24.2, z0: 13.2, z1: 22.8, y: 5.0 },
  columns: [[4.4, 14.0], [4.4, 22.0], [23.4, 14.0], [23.4, 22.0]] as const,
  bike: [14.6, 15.8] as const, // the red bike lane, across the front of the booth
};

// The two booms: hinge (world), which way the arm points (-x), its length, and
// the traffic light that goes with it (facing -z for the way in, +z for the way out).
export function bareelBooms(ox: number, oz: number, y0: number) {
  const B = BAREEL, mid = oz + B.mid;
  return [
    { hx: ox + B.island[0] + 0.3, hy: y0 + 0.95, hz: mid, len: B.island[0] + 0.3 - B.laneA[0] - 0.05, tx: ox + B.laneA[0] - 0.35, tz: mid - 0.9, face: -1 },
    { hx: ox + B.laneB[1] - 0.3, hy: y0 + 0.95, hz: mid, len: B.laneB[1] - 0.3 - B.laneB[0] - 0.05, tx: ox + B.laneB[1] + 0.35, tz: mid + 0.9, face: 1 },
  ];
}
// high-bay lamps under the sky, 5 x 5; and the lamps in the canopy
export const bareelLamps = () => {
  const out: [number, number][] = [];
  for (let k = 0; k < 5; k++) for (let m = 0; m < 5; m++) out.push([3.1 + 29.8 * (k + 0.5) / 5, 3.1 + 29.8 * (m + 0.5) / 5]);
  return out;
};
export const bareelCanopyLamps = () => {
  const out: [number, number][] = [];
  for (let lx = 5.5; lx < BAREEL.canopy.x1; lx += 4) for (const lz of [15.2, 20.8]) out.push([lx, lz]);
  return out;
};

// ---------------------------------------------------------------------------
// De Toren: the Reyers tower indoors. The shaft is hollow: a door at its foot,
// a spiral stair inside round a steel newel, up through the saucer to a deck on
// top. All in metres, world space.
export interface TowerSpec {
  x: number;
  z: number;
  y0: number; // the floor of the hall
  deck: number; // height of the deck above y0
  rise: number; // metres per turn
  rNewel: number;
  rIn: number; // the stair runs between rIn and rOut
  rOut: number;
  rWall: number; // outside of the shaft
  rSaucer: number;
  rDeck: number; // the deck is walkable out to here
  top: number; // hall height
  door: [number, number]; // angles of the door at the foot of the shaft
  hatch: [number, number]; // angles where the stair comes up through the deck
}

const TWO_PI = Math.PI * 2;
const inArc = (phi: number, [a, b]: [number, number]) => (phi - a + TWO_PI * 4) % TWO_PI < b - a;

export function towerSpec(st: Structure, H: number, CEIL: number): TowerSpec | null {
  const a = st.atrium;
  if (!a || a.kind !== "tower") return null;
  // the stair starts at the door (south) and turns counter-clockwise
  const door: [number, number] = [Math.PI / 2 - 0.42, Math.PI / 2 + 0.42];
  const deck = 16.2, rise = 2.8, end = door[1] + ((deck / rise) % 1) * TWO_PI;
  return {
    x: (st.cx * CH + (a.x0 + a.x1 + 1) / 2) * CELL,
    z: (st.cz * CH + (a.z0 + a.z1 + 1) / 2) * CELL,
    y0: a.f0 * H, deck, rise, rNewel: 0.22, rIn: 0.34, rOut: 1.92, rWall: 2.15, rSaucer: 4.6, rDeck: 4.25,
    top: tallTop(a, H, CEIL),
    door,
    hatch: [end - 2.2, end],
  };
}

// Height of the stair (or the deck) under (x, z) for feet at y. undefined: not
// the tower's business (the plain floor); null: not walkable.
export function towerGround(t: TowerSpec, x: number, z: number, y: number): number | null | undefined {
  const dx = x - t.x, dz = z - t.z, r = Math.hypot(dx, dz);
  if (r > t.rDeck) return undefined;
  const phi = (Math.atan2(dz, dx) + TWO_PI) % TWO_PI;
  const ground = y < t.y0 + 1.2;
  // outside the shaft, on the ground: the plain floor
  if (r > t.rWall + 0.2 && ground) return undefined;
  const cands: number[] = [];
  // the deck on top of the saucer (not over the hatch)
  if (r > t.rNewel + 0.1 && !(r <= t.rOut + 0.1 && inArc(phi, t.hatch))) cands.push(t.y0 + t.deck);
  if (r < t.rIn) {
    // the newel
  } else if (r <= t.rOut) {
    // the spiral: every turn passes over this angle once, measured from the door
    const u = ((phi - t.door[1] + TWO_PI * 2) % TWO_PI) / TWO_PI;
    for (let k = 0; ; k++) {
      const h = (k + u) * t.rise;
      if (h > t.deck) break;
      cands.push(t.y0 + h);
    }
    // the floor inside the shaft, where there's headroom under the stair (or the first steps)
    const first = u * t.rise;
    if (first < 0.45 || first > 2.1) cands.push(t.y0);
  } else if (ground && inArc(phi, t.door)) {
    // the doorway through the shaft wall
    cands.push(t.y0);
  }
  // step onto the stair rather than stay on the floor under it
  let best: number | null = null;
  for (const c of cands) if (Math.abs(c - y) < 0.45 && (best === null || c > best)) best = c;
  return best;
}
