// De plattegrond: a misty map of what's around you, drawn from the floor plans.
// You see about 100 m, and one floor up or down; beyond that it's fog. Click to
// set a waypoint, or pick a place from the list and it finds the nearest one in sight.
import { CELL, CH, CHUNK, FLOOR_MAX, FLOOR_MIN, MID_CZ, MID_FLOOR, floorName, isRtbf } from "./config";
import { K, RT, SK, cellLabel, getPlan, getStructure, mazeAt, messFloors, radioStation, roomLabel, setIsThuis, type Plan, type Room, type Structure } from "./layout";
import { paintCells, waysIn } from "./minimap";
import { liftIcon, phoneIcon, stairIcon } from "./mapicons";
import { STATIONS } from "./stations";

const PX = 8; // tile pixels per cell
export const SIGHT = 100; // metres you can see on the map
const inSight = (px: number, pz: number, pf: number, x: number, z: number, f: number) => Math.hypot(x - px, z - pz) <= SIGHT && Math.abs(f - pf) <= 1;
const TILE = CH * PX;

// someone else walking round (see visitors.ts)
export interface Person {
  name: string;
  x: number;
  z: number;
  f: number;
}
export const PERSON_COL = "#ffd23f";

export interface Pin {
  x: number;
  z: number;
  f: number;
  col: string;
  label: string;
  icon?: "phone"; // (drawn as the icon, without a label)
}

export interface Waypoint {
  x: number;
  z: number;
  f: number;
  label: string;
}

interface Mark {
  x: number;
  z: number;
  label: string;
  tier: number; // 0 always shown, 1 when zoomed in, 2 when zoomed in a lot
}

// Where you can find something, and how much it costs to get there.
interface Found {
  x: number;
  z: number;
  f: number;
}

function roomCenter(p: Plan, r: Room) {
  return { x: (p.cx * CH + (r.x0 + r.x1 + 1) / 2) * CELL, z: (p.cz * CH + (r.z0 + r.z1 + 1) / 2) * CELL };
}

// a room you can actually get into: at least one open door
function enterable(p: Plan, r: Room) {
  for (const i of r.cells)
    for (let d = 0; d < 4; d++) {
      const s = p.sides.get(i * 4 + d);
      if (s?.sk === SK.DOOR && s.door?.open) return true;
    }
  return false;
}

const TIER: Partial<Record<number, number>> = {
  [RT.MESS]: 0, [RT.KETNET]: 1, [RT.SPORZA]: 1, [RT.SET]: 1, [RT.RADIO]: 1, [RT.COSTUME]: 1, [RT.VIPBAR]: 1, [RT.VIPRESTO]: 1, [RT.KOFFIE]: 1, [RT.DPC]: 1, [RT.JOURNAAL]: 1, [RT.WEER]: 1, [RT.VOS]: 1, [RT.BIKES]: 1, [RT.SHOWER]: 2, [RT.PERS]: 1, [RT.LAB]: 1, [RT.TIKTAK]: 1,
  [RT.CEO]: 1, [RT.DOCK]: 1, [RT.SECURITY]: 1, [RT.TOOTS]: 1, [RT.CANTEEN]: 2, [RT.STUDIO]: 2, [RT.DRESSING]: 2, [RT.LOUNGE]: 2,
};

function atriumName(a: NonNullable<Structure["atrium"]>, fr: boolean) {
  if (a.kind === "decor") return fr ? "RUE DES DÉCORS" : "DECORSTRAAT";
  if (a.kind === "marconi") return "STUDIO MARCONI";
  if (a.kind === "tower") return fr ? "LA TOUR" : "DE TOREN";
  if (a.kind === "bos") return fr ? "LE BOIS" : "VRT-BOS";
  if (a.kind === "bareel") return fr ? "LA BARRIÈRE" : "DE BAREEL";
  return a.kind === "hall" ? (fr ? "SALLE DE SPORT" : "SPORTHAL") : a.kind === "props" ? (fr ? "ACCESSOIRES" : "REKWISIETEN") : a.kind === "garden" ? (fr ? "JARDIN INTÉRIEUR" : "PLANTENTUIN") : "ATRIUM";
}

function landmarks(f: number, cx: number, cz: number): Mark[] {
  const st = getStructure(cx, cz), p = getPlan(f, cx, cz), fr = isRtbf(cz);
  const out: Mark[] = [];
  const at = (lx: number, lz: number) => ({ x: (cx * CH + lx) * CELL, z: (cz * CH + lz) * CELL });
  if (st.mid && f === MID_FLOOR && cx % 3 === 0) out.push({ ...at(6, 6), label: "MIDDENGANG", tier: 0 });
  const a = st.atrium;
  if (a && f >= a.f0 && f <= a.f1) out.push({ ...at((a.x0 + a.x1 + 1) / 2, (a.z0 + a.z1 + 1) / 2), label: atriumName(a, fr), tier: a.kind === "lobby" || a.kind === "garden" ? 1 : 0 });
  if (st.special === "park" && f >= 0 && f < FLOOR_MAX) out.push({ ...at(6, 6), label: fr ? "PARKING-TOUR" : "PARKEERTOREN", tier: 0 });
  const mz = mazeAt(f, st);
  if (mz) out.push({ ...at((mz.path[0]! % CH) + 0.5, ((mz.path[0]! / CH) | 0) + 0.5), label: mz.parking ? (fr ? "VERS LE PARKING" : "GANG NAAR DE PARKING") : fr ? "VERS NULLE PART" : "GANG NAAR NERGENS", tier: 0 });
  for (const r of p.rooms) {
    const tier = TIER[r.type];
    if (tier === undefined || p.kind[r.cells[0]!] !== K.ROOM) continue;
    out.push({ ...roomCenter(p, r), label: roomLabel(p, r), tier });
  }
  return out;
}

// --- destinations -------------------------------------------------------------

type Finder = (px: number, pz: number, pf: number) => Found | null;

// out of sight costs everything: the map only knows what's around you
const cost = (px: number, pz: number, pf: number, f: Found) => (inSight(px, pz, pf, f.x, f.z, f.f) ? Math.hypot(f.x - px, f.z - pz) + Math.abs(f.f - pf) * 18 : Infinity);

// search the structures around you (cheap: no floor plans)
function structFinder(pick: (st: Structure, pf: number) => Found | null, R = 4): Finder {
  return (px, pz, pf) => {
    const cx0 = Math.floor(px / CHUNK), cz0 = Math.floor(pz / CHUNK);
    let best: Found | null = null, bc = Infinity;
    for (let cz = cz0 - R; cz <= cz0 + R; cz++)
      for (let cx = cx0 - R; cx <= cx0 + R; cx++) {
        const f = pick(getStructure(cx, cz), pf);
        if (!f) continue;
        const c = cost(px, pz, pf, f);
        if (c < bc) { bc = c; best = f; }
      }
    return best;
  };
}

const atriumOf = (kind: string) => structFinder((st, pf) => {
  const a = st.atrium;
  if (!a || a.kind !== kind) return null;
  return { x: (st.cx * CH + (a.x0 + a.x1 + 1) / 2) * CELL, z: (st.cz * CH + (a.z0 + a.z1 + 1) / 2) * CELL, f: Math.max(a.f0, Math.min(kind === "props" || kind === "garden" || kind === "lobby" ? a.f1 : a.f0, pf)) };
});

// search the rooms on the floors around you, nearest floors first
function roomFinder(ok: (p: Plan, r: Room) => boolean, floors: number[] = [], R = 3): Finder {
  return (px, pz, pf) => {
    const cx0 = Math.floor(px / CHUNK), cz0 = Math.floor(pz / CHUNK);
    const fl = (floors.length ? floors : Array.from({ length: FLOOR_MAX }, (_, k) => k)).filter((f) => Math.abs(f - pf) <= 1);
    for (const r of [R]) {
      let best: Found | null = null, bc = Infinity;
      for (const f of fl)
        for (let cz = cz0 - r; cz <= cz0 + r; cz++)
          for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
            const p = getPlan(f, cx, cz);
            for (const room of p.rooms) {
              if (p.kind[room.cells[0]!] !== K.ROOM || !ok(p, room) || !enterable(p, room)) continue;
              const found = { ...roomCenter(p, room), f };
              const c = cost(px, pz, pf, found);
              if (c < bc) { bc = c; best = found; }
            }
          }
      if (best) return best;
    }
    return null;
  };
}
const ofType = (t: number, floors?: number[]) => roomFinder((_, r) => r.type === t, floors);

// the nearest cell of a kind on one floor
function cellFinder(kind: number, floor: (pf: number) => number, R = 1): Finder {
  return (px, pz, pf) => {
    const f = floor(pf);
    const cx0 = Math.floor(px / CHUNK), cz0 = Math.floor(pz / CHUNK);
    let best: Found | null = null, bc = Infinity;
    for (let cz = cz0 - R; cz <= cz0 + R; cz++)
      for (let cx = cx0 - R; cx <= cx0 + R; cx++) {
        const p = getPlan(f, cx, cz);
        for (let i = 0; i < CH * CH; i++) {
          if (p.kind[i] !== kind) continue;
          const found = { x: (cx * CH + (i % CH) + 0.5) * CELL, z: (cz * CH + ((i / CH) | 0) + 0.5) * CELL, f };
          const c = cost(px, pz, pf, found);
          if (c < bc) { bc = c; best = found; }
        }
      }
    return best;
  };
}

const DESTS: { group: string; items: { name: string; find: Finder }[] }[] = [
  {
    group: "PLEKKEN",
    items: [
      { name: "Sporthal", find: atriumOf("hall") },
      { name: "Rekwisieten", find: atriumOf("props") },
      { name: "De Toren", find: atriumOf("tower") },
      { name: "Het VRT-bos", find: atriumOf("bos") },
      { name: "De bareel", find: atriumOf("bareel") },
      { name: "Decorstraat", find: atriumOf("decor") },
      { name: "Studio Marconi", find: atriumOf("marconi") },
      { name: "De Mess", find: structFinder((st, pf) => {
        const fs = messFloors(st);
        if (!fs.length) return null;
        return { x: (st.cx * CH + 6) * CELL, z: (st.cz * CH + 6) * CELL, f: fs.reduce((a, b) => (Math.abs(b - pf) < Math.abs(a - pf) ? b : a)) };
      }) },
      { name: "Parkeertoren", find: structFinder((st, pf) => (st.special === "park" ? { x: (st.cx * CH + 6) * CELL, z: (st.cz * CH + 6) * CELL, f: Math.max(0, Math.min(FLOOR_MAX - 1, pf)) } : null)) },
      { name: "Plantentuin", find: atriumOf("garden") },
      { name: "Middengang", find: (px, pz, pf) => {
        const m = { x: px, z: (MID_CZ * CH + 6) * CELL, f: MID_FLOOR };
        return inSight(px, pz, pf, m.x, m.z, m.f) ? m : null;
      } },
      { name: "Parking", find: cellFinder(K.GARAGE, () => FLOOR_MIN) },
      { name: "Gang naar de parking", find: structFinder((st) => {
        const m = mazeAt(FLOOR_MIN, st);
        return m ? { x: (st.cx * CH + (m.path[0]! % CH) + 0.5) * CELL, z: (st.cz * CH + ((m.path[0]! / CH) | 0) + 0.5) * CELL, f: FLOOR_MIN } : null;
      }) },
      { name: "Gang naar nergens", find: structFinder((st, pf) => {
        for (const f of [pf, pf - 1, pf + 1]) {
          const m = f >= 0 ? mazeAt(f, st) : null;
          if (m && !m.parking) return { x: (st.cx * CH + (m.path[0]! % CH) + 0.5) * CELL, z: (st.cz * CH + ((m.path[0]! / CH) | 0) + 0.5) * CELL, f };
        }
        return null;
      }) },
      { name: "Dak", find: cellFinder(K.ROOF, () => FLOOR_MAX) },
    ],
  },
  {
    group: "STUDIO'S",
    items: [
      { name: "Ketnet", find: ofType(RT.KETNET) },
      { name: "Sporza", find: ofType(RT.SPORZA) },
      { name: "Decor Thuis", find: roomFinder((p, r) => r.type === RT.SET && setIsThuis(p, r)) },
      { name: "Decor De Kampioenen", find: roomFinder((p, r) => r.type === RT.SET && !setIsThuis(p, r)) },
      { name: "Studio Toots", find: ofType(RT.TOOTS) },
      { name: "Nieuwsstudio", find: ofType(RT.STUDIO) },
      { name: "Journaalstudio", find: ofType(RT.JOURNAAL) },
      { name: "Weerstudio", find: ofType(RT.WEER) },
    ],
  },
  {
    group: "RADIO",
    items: STATIONS.map((st, k) => ({ name: st.name, find: roomFinder((p, r) => r.type === RT.RADIO && radioStation(p, r) === k) })),
  },
  {
    group: "ACHTER DE SCHERMEN",
    items: [
      { name: "Kostuumdienst", find: ofType(RT.COSTUME) },
      { name: "Kleedkamer", find: ofType(RT.DRESSING) },
      { name: "VIP-bar", find: ofType(RT.VIPBAR) },
      { name: "VIP-restaurant", find: ofType(RT.VIPRESTO) },
      { name: "Kabinet CEO", find: ofType(RT.CEO, [9, 10, 11]) },
      { name: "Laadperron", find: ofType(RT.DOCK, [0]) },
      { name: "Bewaking", find: ofType(RT.SECURITY) },
      { name: "Koffiekamer", find: ofType(RT.KOFFIE) },
      { name: "DPC", find: ofType(RT.DPC) },
      { name: "Douches", find: ofType(RT.SHOWER) },
      { name: "Fietsenstalling", find: ofType(RT.BIKES, [0]) },
      { name: "Vossenhol", find: ofType(RT.VOS) },
      { name: "Perszaal", find: ofType(RT.PERS) },
      { name: "Creative lab", find: ofType(RT.LAB) },
      { name: "Tiktak-huis", find: ofType(RT.TIKTAK) },
      { name: "Kantine", find: ofType(RT.CANTEEN) },
    ],
  },
];

// --- the map ------------------------------------------------------------------

export class WorldMap {
  open = false;
  waypoint: Waypoint | null = null;
  onChange: (w: Waypoint | null, how: string) => void = () => {};
  onClose: () => void = () => {};
  onMinimap: () => void = () => {};
  private el = document.getElementById("worldmap")!;
  private cv = document.getElementById("wm-canvas") as HTMLCanvasElement;
  private g = this.cv.getContext("2d")!;
  private tiles = new Map<string, HTMLCanvasElement>();
  private marks = new Map<string, Mark[]>();
  private f = 0; // floor on view
  private vx = 0; // view centre (m)
  private vz = 0;
  private s = window.innerWidth < 900 ? 2.2 : 3.0; // px per m
  private player = { x: 0, z: 0, f: 0, yaw: 0 };
  private pins: Pin[] = []; // your job, or the ringing phones
  private note = "";
  private found = new Map<string, Found | null>();
  private buttons: { name: string; find: Finder; el: HTMLButtonElement; head: HTMLElement }[] = [];
  private empty = document.createElement("div");
  private peopleHead = document.createElement("div");
  private peopleList = document.createElement("div");
  people: Person[] = []; // (kept up to date while the map is open)

  constructor() {
    const floors = document.getElementById("wm-floors")!;
    for (let f = FLOOR_MAX; f >= FLOOR_MIN; f--) {
      const b = document.createElement("button");
      b.textContent = f === FLOOR_MAX ? "DAK" : f === FLOOR_MIN ? "P" : String(f);
      b.dataset.f = String(f);
      b.onclick = () => this.setFloor(f);
      floors.appendChild(b);
    }
    const list = document.getElementById("wm-list")!;
    // the others first: wherever they are, a waypoint to where they are now
    this.peopleHead.className = "wm-grp";
    this.peopleHead.textContent = "ANDEREN";
    list.append(this.peopleHead, this.peopleList);
    for (const grp of DESTS) {
      const h = document.createElement("div");
      h.className = "wm-grp";
      h.textContent = grp.group;
      list.appendChild(h);
      for (const it of grp.items) {
        const b = document.createElement("button");
        b.textContent = it.name;
        b.onclick = () => this.goTo(it.name);
        list.appendChild(b);
        this.buttons.push({ ...it, el: b, head: h });
      }
    }
    this.empty.className = "wm-empty";
    this.empty.textContent = "Niets bijzonders in zicht. Verder dwalen.";
    list.appendChild(this.empty);
    document.getElementById("wm-close")!.onclick = () => this.onClose();
    document.getElementById("wm-clear")!.onclick = () => this.setWaypoint(null, "clear");
    document.getElementById("wm-mini")!.onclick = () => this.onMinimap();
    document.getElementById("wm-here")!.onclick = () => this.centre();
    this.input();
  }

  show(px: number, pz: number, pf: number, yaw: number, pins: Pin[]) {
    this.open = true;
    this.el.classList.add("show");
    this.player = { x: px, z: pz, f: pf, yaw };
    this.pins = pins;
    this.note = this.waypoint ? `Bestemming: ${this.waypoint.label}` : "";
    this.s = Math.max(this.s, this.minScale());
    this.centre();
    // only what's in sight from here is on the list
    this.found.clear();
    for (const b of this.buttons) {
      const r = b.find(px, pz, pf);
      this.found.set(b.name, r);
      b.el.hidden = !r;
    }
    for (const b of this.buttons) b.head.hidden = this.buttons.every((o) => o.head !== b.head || o.el.hidden);
    this.empty.hidden = this.buttons.some((b) => !b.el.hidden);
    this.listPeople();
  }

  private listPeople() {
    const P = this.player;
    this.peopleList.replaceChildren();
    const ppl = [...this.people].sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) + Math.abs(a.f - P.f) * 18 - (Math.hypot(b.x - P.x, b.z - P.z) + Math.abs(b.f - P.f) * 18));
    for (const o of ppl) {
      const b = document.createElement("button");
      const df = o.f - P.f;
      b.textContent = `${o.name} · ${Math.round(Math.hypot(o.x - P.x, o.z - P.z))} m${df ? ` · ${df > 0 ? "▲" : "▼"}${Math.abs(df)}` : ""}`;
      b.className = "wm-person";
      b.onclick = () => {
        this.setWaypoint({ x: o.x, z: o.z, f: o.f, label: o.name.toUpperCase() }, "person");
        this.vx = o.x;
        this.vz = o.z;
        this.setFloor(o.f);
      };
      this.peopleList.append(b);
    }
    this.peopleHead.hidden = !ppl.length;
  }

  private minScale() {
    const r = this.cv.getBoundingClientRect();
    return Math.min(r.width || window.innerWidth, r.height || window.innerHeight) / (SIGHT * 2.3);
  }

  hide() {
    this.open = false;
    this.el.classList.remove("show");
  }

  private centre() {
    this.vx = this.player.x;
    this.vz = this.player.z;
    this.setFloor(this.player.f);
  }

  private setFloor(f: number) {
    if (Math.abs(f - this.player.f) > 1) return;
    this.f = f;
    for (const b of document.querySelectorAll<HTMLButtonElement>("#wm-floors button")) {
      const bf = Number(b.dataset.f);
      b.classList.toggle("on", bf === f);
      b.disabled = Math.abs(bf - this.player.f) > 1;
    }
    document.getElementById("wm-floor")!.textContent = floorName(f, isRtbf(Math.floor(this.vz / CHUNK)));
  }

  setWaypoint(w: Waypoint | null, how: string) {
    this.waypoint = w;
    this.note = w ? `Bestemming: ${w.label}` : "";
    this.onChange(w, how);
  }

  private goTo(name: string) {
    const r = this.found.get(name);
    if (!r) {
      this.note = `Geen ${name.toLowerCase()} in zicht`;
      return;
    }
    this.setWaypoint({ ...r, label: name.toUpperCase() }, "list");
    this.vx = r.x;
    this.vz = r.z;
    this.setFloor(r.f);
  }

  // --- input: drag to pan, wheel / pinch to zoom, click / tap to set a waypoint
  private input() {
    const cv = this.cv;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0, pinch = 0;
    cv.addEventListener("pointerdown", (e) => {
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    });
    cv.addEventListener("pointermove", (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch > 0) this.zoomBy(d / pinch);
        pinch = d;
        moved = 99;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      // the map turns with you: screen deltas back into the world
      const c = Math.cos(this.player.yaw), sn = Math.sin(this.player.yaw);
      this.vx -= (dx * c + dy * sn) / this.s;
      this.vz -= (-dx * sn + dy * c) / this.s;
      this.clampView();
    });
    const up = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size || moved > 6) return;
      // a click: set a waypoint where you can walk
      const r = cv.getBoundingClientRect();
      const ux = (e.clientX - r.left - r.width / 2) / this.s, uy = (e.clientY - r.top - r.height / 2) / this.s;
      const c = Math.cos(this.player.yaw), sn = Math.sin(this.player.yaw);
      const x = this.vx + ux * c + uy * sn, z = this.vz - ux * sn + uy * c;
      if (!inSight(this.player.x, this.player.z, this.player.f, x, z, this.f)) {
        this.note = "Te ver: daar zie je niets meer";
        return;
      }
      const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
      const cx = Math.floor(gx / CH), cz = Math.floor(gz / CH);
      const k = getPlan(this.f, cx, cz).kind[(gz - cz * CH) * CH + (gx - cx * CH)];
      if (k === K.SOLID || k === K.VOID || k === K.COURT) {
        this.note = "Daar kan je niet komen";
        return;
      }
      this.setWaypoint({ x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL, f: this.f, label: cellLabel(this.f, gx, gz) }, "map");
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", (e) => pts.delete(e.pointerId));
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoomBy(Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  }

  private zoomBy(k: number) {
    this.s = Math.max(this.minScale(), Math.min(14, this.s * k));
    this.clampView();
  }

  // you can't look further than you can see
  private clampView() {
    const dx = this.vx - this.player.x, dz = this.vz - this.player.z, d = Math.hypot(dx, dz), lim = SIGHT * 0.75;
    if (d > lim) {
      this.vx = this.player.x + (dx * lim) / d;
      this.vz = this.player.z + (dz * lim) / d;
    }
  }

  // --- drawing
  private tile(f: number, cx: number, cz: number) {
    const key = `${f}:${cx},${cz}`;
    let t = this.tiles.get(key);
    if (t) return t;
    t = document.createElement("canvas");
    t.width = t.height = TILE;
    paintCells(t.getContext("2d")!, f, cx * CH, cz * CH, CH, PX);
    this.tiles.set(key, t);
    if (this.tiles.size > 500) this.tiles.delete(this.tiles.keys().next().value!);
    return t;
  }

  private marksOf(f: number, cx: number, cz: number) {
    const key = `${f}:${cx},${cz}`;
    let m = this.marks.get(key);
    if (!m) {
      m = landmarks(f, cx, cz);
      this.marks.set(key, m);
      if (this.marks.size > 2000) this.marks.delete(this.marks.keys().next().value!);
    }
    return m;
  }

  draw() {
    if (!this.open) return;
    const cv = this.cv, g = this.g;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#0b0c0e";
    g.fillRect(0, 0, W, H);
    const s = this.s, f = this.f;
    // heading up: the way you're facing is the top of the screen (like the minimap)
    const P = this.player, rc = Math.cos(P.yaw), rs = Math.sin(P.yaw);
    const scr = (x: number, z: number): [number, number] => {
      const dx = (x - this.vx) * s, dz = (z - this.vz) * s;
      return [W / 2 + dx * rc - dz * rs, H / 2 + dx * rs + dz * rc];
    };
    const reach = Math.hypot(W, H) / 2 / s;
    const cx0 = Math.floor((this.vx - reach) / CHUNK), cx1 = Math.floor((this.vx + reach) / CHUNK);
    const cz0 = Math.floor((this.vz - reach) / CHUNK), cz1 = Math.floor((this.vz + reach) / CHUNK);
    // paint the tiles, a few new ones per frame so panning stays smooth
    let budget = 10;
    g.imageSmoothingEnabled = s * CELL < PX;
    const near = (cx: number, cz: number) => {
      const nx = Math.max(cx * CHUNK, Math.min(P.x, (cx + 1) * CHUNK)), nz = Math.max(cz * CHUNK, Math.min(P.z, (cz + 1) * CHUNK));
      return Math.hypot(nx - P.x, nz - P.z) <= SIGHT;
    };
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(P.yaw);
    for (let cz = cz0; cz <= cz1; cz++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = `${f}:${cx},${cz}`;
        if (!near(cx, cz)) continue;
        if (!this.tiles.has(key) && budget-- <= 0) continue;
        g.drawImage(this.tile(f, cx, cz), (cx * CHUNK - this.vx) * s, (cz * CHUNK - this.vz) * s, CHUNK * s + 0.5, CHUNK * s + 0.5);
      }
    g.restore();
    // the stairs and the lifts, upright, a little bigger as you zoom in
    const ir = Math.max(8, Math.min(13, s * 2.4));
    for (let cz = cz0; cz <= cz1; cz++)
      for (let cx = cx0; cx <= cx1; cx++) {
        if (!this.tiles.has(`${f}:${cx},${cz}`)) continue;
        for (const w of waysIn(f, cx, cz)) {
          if (Math.hypot(w.x - P.x, w.z - P.z) > SIGHT) continue;
          const [X, Y] = scr(w.x, w.z);
          (w.kind === "stair" ? stairIcon : liftIcon)(g, X, Y, ir);
        }
      }
    // landmarks: the big places always, the rest when zoomed in, never on top of each other
    g.textAlign = "center";
    g.textBaseline = "middle";
    const showTier = s >= 7 ? 2 : s >= 3.6 ? 1 : 0;
    const cand: Mark[] = [];
    for (let cz = cz0; cz <= cz1; cz++)
      for (let cx = cx0; cx <= cx1; cx++) {
        if (!this.tiles.has(`${f}:${cx},${cz}`)) continue;
        for (const m of this.marksOf(f, cx, cz)) if (m.tier <= showTier && Math.hypot(m.x - P.x, m.z - P.z) < SIGHT * 0.85) cand.push(m);
      }
    cand.sort((a, b) => a.tier - b.tier);
    const taken: [number, number, number, number][] = [];
    for (const m of cand) {
      const [x, y] = scr(m.x, m.z);
      g.font = m.tier === 0 ? "800 13px ui-monospace, Menlo, monospace" : "700 11px ui-monospace, Menlo, monospace";
      const w = g.measureText(m.label).width + 10;
      const box: [number, number, number, number] = [x - w / 2 - 3, y - 12, x + w / 2 + 3, y + 12];
      if (taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) continue;
      taken.push(box);
      g.fillStyle = m.tier === 0 ? "rgba(255,46,126,0.88)" : "rgba(10,10,12,0.8)";
      g.fillRect(x - w / 2, y - 9, w, 18);
      g.fillStyle = "#fff";
      g.fillText(m.label, x, y + 1);
    }
    // the mist: clear around you, thickening towards the edge of what you can see
    const [fx, fy] = scr(P.x, P.z);
    const fog = g.createRadialGradient(fx, fy, SIGHT * 0.62 * s, fx, fy, SIGHT * s);
    fog.addColorStop(0, "rgba(14,16,19,0)");
    fog.addColorStop(0.6, "rgba(14,16,19,0.75)");
    fog.addColorStop(1, "rgba(14,16,19,1)");
    g.fillStyle = fog;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.06;
    for (let k = 0; k < 7; k++) {
      // slow drifting wisps
      const t = performance.now() / 9000 + k * 1.7;
      const wx = fx + Math.cos(t * (0.6 + k * 0.1)) * SIGHT * 0.7 * s, wy = fy + Math.sin(t * (0.5 + k * 0.13)) * SIGHT * 0.7 * s;
      const r = SIGHT * (0.35 + (k % 3) * 0.12) * s;
      const wg = g.createRadialGradient(wx, wy, 0, wx, wy, r);
      wg.addColorStop(0, "#b8c2cc");
      wg.addColorStop(1, "rgba(184,194,204,0)");
      g.fillStyle = wg;
      g.fillRect(wx - r, wy - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
    // your job or the phones, the waypoint, you
    const pin = (x: number, z: number, pf: number, col: string, label = "") => {
      const [X, Y] = scr(x, z);
      const here = pf === f;
      g.globalAlpha = here ? 1 : 0.55;
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(X, Y);
      g.arc(X, Y - 16, 9, Math.PI * 0.75, Math.PI * 2.25);
      g.closePath();
      g.fill();
      g.fillStyle = "#111";
      g.beginPath();
      g.arc(X, Y - 16, 3.5, 0, 7);
      g.fill();
      g.globalAlpha = 1;
      const txt = here ? label : `${label}${label ? " · " : ""}${pf > f ? "▲" : "▼"}${Math.abs(pf - f)}`;
      if (txt) {
        g.font = "700 12px ui-monospace, Menlo, monospace";
        g.fillStyle = col;
        g.fillText(txt, X, Y - 36);
      }
    };
    // the others in sight, with their names
    g.textAlign = "center";
    g.font = "700 11px ui-monospace, Menlo, monospace";
    for (const o of this.people) {
      if (!inSight(P.x, P.z, P.f, o.x, o.z, o.f) || Math.abs(o.f - f) > 1) continue;
      const [X, Y] = scr(o.x, o.z);
      g.globalAlpha = o.f === f ? 1 : 0.45;
      g.fillStyle = PERSON_COL;
      g.strokeStyle = "#000";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(X, Y, 6, 0, 7);
      g.stroke();
      g.fill();
      g.fillText(o.f === f ? o.name : `${o.name} · ${o.f > f ? "▲" : "▼"}`, X, Y - 13);
    }
    g.globalAlpha = 1;
    const now = performance.now() / 1000;
    for (const q of this.pins) {
      if (!inSight(P.x, P.z, P.f, q.x, q.z, q.f)) continue;
      if (q.icon !== "phone") pin(q.x, q.z, q.f, q.col, q.label);
      else {
        const [X, Y] = scr(q.x, q.z);
        g.globalAlpha = q.f === f ? 1 : 0.45;
        phoneIcon(g, X, Y, 11, q.col, now, q.f === f);
        g.globalAlpha = 1;
      }
    }
    if (this.waypoint) pin(this.waypoint.x, this.waypoint.z, this.waypoint.f, "#35d6ff", this.waypoint.label);
    g.save();
    g.translate(fx, fy);
    g.globalAlpha = P.f === f ? 1 : 0.4;
    g.fillStyle = "#fff";
    g.strokeStyle = "#000";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -14);
    g.lineTo(9, 9);
    g.lineTo(0, 4);
    g.lineTo(-9, 9);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
    g.globalAlpha = 1;
    // north, on the edge of what you can see
    {
      const r = Math.min(SIGHT * s * 0.97, Math.min(W, H) / 2 - 18);
      const nx = fx + rs * r, ny = fy - rc * r;
      g.fillStyle = "rgba(10,10,12,0.8)";
      g.beginPath();
      g.arc(nx, ny, 12, 0, 7);
      g.fill();
      g.fillStyle = "#fff";
      g.font = "800 13px ui-monospace, Menlo, monospace";
      g.textAlign = "center";
      g.fillText("N", nx, ny + 1);
    }
    // scale bar and the note
    const m = [10, 20, 50, 100, 200][[10, 20, 50, 100, 200].findIndex((v) => v * s > 80)] ?? 200;
    g.fillStyle = "rgba(255,255,255,0.8)";
    g.fillRect(24, H - 30, m * s, 3);
    g.font = "600 11px ui-monospace, Menlo, monospace";
    g.textAlign = "left";
    g.fillText(`${m} m`, 24, H - 42);
    document.getElementById("wm-note")!.textContent = this.note;
    document.getElementById("wm-clear")!.style.visibility = this.waypoint ? "visible" : "hidden";
  }
}

// --- guidance -------------------------------------------------------------------

// the nearest stairs or lift on your floor, for a waypoint on another floor
export function nearestWay(f: number, x: number, z: number) {
  const cx0 = Math.floor(x / CHUNK), cz0 = Math.floor(z / CHUNK);
  let best: { x: number; z: number; kind: string } | null = null, bd = Infinity;
  for (let cz = cz0 - 1; cz <= cz0 + 1; cz++)
    for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
      const p = getPlan(f, cx, cz);
      for (let i = 0; i < CH * CH; i++) {
        const k = p.kind[i];
        if (k !== K.STAIR && k !== K.ELEV) continue;
        const wx = (cx * CH + (i % CH) + 0.5) * CELL, wz = (cz * CH + ((i / CH) | 0) + 0.5) * CELL;
        const d = Math.hypot(wx - x, wz - z) + (k === K.ELEV ? 4 : 0);
        if (d < bd) { bd = d; best = { x: wx, z: wz, kind: k === K.STAIR ? "trap" : "lift" }; }
      }
    }
  return best;
}

