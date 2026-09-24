// Quests: find the right thing for the right person. Everything exists in the
// building from the start, but only the active quest's object counts.
import * as THREE from "three";
import { IcosahedronGeometry } from "three";
import { CELL, CH, DX, DZ, FLOOR_MAX, FLOOR_MIN, H, floorName } from "./config";
import { Builder, Frame, LightCtx, fbox, type RGB, type Spec } from "./builder";
import { getFurnished } from "./furnish";
import { K, ROOM_LABEL, RT, cellLabel, getPlan, idx, roomAnomaly, type Plan, type Room } from "./layout";
import { L } from "./layers";
import { chair } from "./props";
import { Rng, getSeed, hash } from "./rng";
import type { Sound } from "./audio";
import type { Player } from "./player";
import type { World } from "./world";
import { track } from "./analytics";

type QId = string;

interface Spot {
  f: number;
  x: number;
  z: number;
  y: number;
  gx: number;
  gz: number;
  rot: number;
  label: string;
}

interface Quest {
  id: QId;
  title: string;
  goal: string;
  item: string;
  doneText: string;
  launchAt: number;
  launched: boolean;
  done: boolean;
  hint: () => string;
  target: () => { x: number; z: number; f: number } | null;
}

interface Obj {
  quest: QId;
  f: number;
  mesh: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  label: string;
  use: () => void;
  alive: boolean;
}

interface Chair {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  fromRot: number;
  to: THREE.Vector3;
  toRot: number;
  k: number; // 0 pulled out .. 1 pushed in
  target: number;
}

const sp = (layer: number, tint?: RGB, emit?: RGB): Spec => ({ layer, tint, emit });
const SKIN: Spec = sp(L.WHITE, [0.86, 0.68, 0.58]);

const lc = (s: string) => s.toLowerCase().replace(/\b([a-h])(\d)\b/, (_, a: string, b: string) => a.toUpperCase() + b);

const floorsNear = (f0: number) => {
  const out: number[] = [];
  for (let f = 0; f < FLOOR_MAX; f++) if (Math.abs(f - f0) <= 4) out.push(f);
  return out;
};

function roomReachable(p: Plan, r: Room) {
  for (const i of r.cells)
    for (let d = 0; d < 4; d++) {
      const s = p.sides.get(i * 4 + d);
      if (!s?.door || !s.door.open || s.door.w <= 0) continue;
      const x = (i % CH) + DX[d]!, z = ((i / CH) | 0) + DZ[d]!;
      if (x >= 0 && z >= 0 && x < CH && z < CH && p.kind[idx(x, z)] === K.CORR) return true;
    }
  return false;
}

function findRooms(types: number[], floors: number[], cx0: number, cz0: number, R: number, ok: (p: Plan, r: Room) => boolean = () => true) {
  const out: { p: Plan; r: Room }[] = [];
  for (const f of floors)
    for (let cz = cz0 - R; cz <= cz0 + R; cz++)
      for (let cx = cx0 - R; cx <= cx0 + R; cx++) {
        const p = getPlan(f, cx, cz);
        for (const r of p.rooms)
          if (types.includes(r.type) && p.kind[r.cells[0]!] === K.ROOM && roomReachable(p, r) && ok(p, r)) out.push({ p, r });
      }
  return out;
}

function roomCenter(p: Plan, r: Room) {
  return {
    x: (p.cx * CH + (r.x0 + r.x1 + 1) / 2) * CELL,
    z: (p.cz * CH + (r.z0 + r.z1 + 1) / 2) * CELL,
  };
}

// A person made of boxes, standing at the frame origin, facing +z.
function person(b: Builder, fr: Frame, suit: RGB, hair: RGB, tie: RGB, glasses: boolean) {
  const S = sp(L.CARPET_GREY, suit);
  const shoe = sp(L.WHITE, [0.05, 0.05, 0.05]);
  for (const x of [-0.1, 0.1]) {
    fbox(b, fr, x, 0, 0.03, 0.11, 0.08, 0.28, shoe);
    fbox(b, fr, x, 0.08, 0, 0.14, 0.8, 0.16, S);
    fbox(b, fr, x * 2.8, 0.86, 0, 0.1, 0.62, 0.13, S);
    fbox(b, fr, x * 2.8, 0.76, 0.01, 0.08, 0.1, 0.09, SKIN);
  }
  fbox(b, fr, 0, 0.86, 0, 0.44, 0.62, 0.24, S);
  fbox(b, fr, 0, 1.2, 0.121, 0.13, 0.28, 0.005, sp(L.WHITE, [0.92, 0.92, 0.9]));
  fbox(b, fr, 0, 1.12, 0.124, 0.05, 0.34, 0.005, sp(L.WHITE, tie));
  fbox(b, fr, 0, 1.48, 0, 0.1, 0.08, 0.1, SKIN);
  fbox(b, fr, 0, 1.55, 0, 0.2, 0.25, 0.22, SKIN);
  fbox(b, fr, 0, 1.74, -0.015, 0.22, 0.08, 0.24, sp(L.CARPET_GREY, hair));
  fbox(b, fr, 0, 1.56, -0.1, 0.22, 0.2, 0.04, sp(L.CARPET_GREY, hair));
  if (glasses) fbox(b, fr, 0, 1.64, 0.112, 0.19, 0.035, 0.01, sp(L.WHITE, [0.05, 0.05, 0.05]));
}


interface ItemDef {
  id: string;
  title: string;
  goal: string;
  item: string; // "telt niet" wording
  short: string; // prompt label
  done: string;
  hint: (where: string) => string;
  place: "rooms" | "garage" | "roof" | "corridor";
  types?: number[];
  fallback?: number[];
  surface?: "table" | "floor";
  model: (b: Builder, fr: Frame) => void;
}

const DARKS = sp(L.WHITE, [0.05, 0.05, 0.05]);
const BLOB = new IcosahedronGeometry(1, 1);
const glow = (c: RGB): Spec => ({ layer: L.WHITE, emit: c });

const ITEMS: ItemDef[] = [
  {
    id: "ben", title: "Ben Crabbé is zijn brooddoos vergeten", goal: "Zoek de brooddoos van Ben", item: "de brooddoos van Ben Crabbé", short: "Brooddoos",
    done: "Ben Crabbé heeft zijn brooddoos terug. Smakelijk!", hint: (w) => `Hij at in een ${w}`,
    place: "rooms", types: [RT.CANTEEN], fallback: [RT.MEETING], surface: "table",
    model: (b, fr) => {
      fbox(b, fr, 0, 0, 0, 0.24, 0.07, 0.17, sp(L.WHITE, [0.92, 0.92, 0.88]));
      fbox(b, fr, 0, 0.07, 0, 0.25, 0.03, 0.18, sp(L.WHITE, [0.85, 0.1, 0.12]));
      fbox(b, fr, 0, 0.1, 0, 0.12, 0.004, 0.07, sp(L.WHITE, [1, 1, 1]));
    },
  },
  {
    id: "tom", title: "Tom Waes geraakt niet thuis: zijn veter is los", goal: "Zoek een nieuwe veter voor Tom", item: "de veter van Tom Waes", short: "Veter",
    done: "Tom Waes strikt zijn veter en vertrekt. Eindelijk naar huis.", hint: (w) => `Er zou een veter liggen in een ${w}`,
    place: "rooms", types: [RT.STORAGE], fallback: [RT.ARCHIVE, RT.SERVER], surface: "floor",
    model: (b, fr) => {
      const lace = glow([0.55, 0.55, 0.52]);
      let x = -0.18, z = 0;
      for (let k = 0; k < 9; k++) {
        const nx = x + 0.05, nz = Math.sin(k * 1.3) * 0.06;
        const len = Math.hypot(nx - x, nz - z);
        fbox(b, new Frame(...fr.p((x + nx) / 2, 0, (z + nz) / 2), fr.rot + Math.atan2(nx - x, nz - z)), 0, 0.003, 0, 0.012, 0.01, len + 0.01, lace);
        x = nx;
        z = nz;
      }
      fbox(b, fr, -0.2, 0.003, 0, 0.04, 0.012, 0.012, DARKS);
      fbox(b, fr, x + 0.02, 0.003, z, 0.04, 0.012, 0.012, DARKS);
    },
  },
  {
    id: "frank", title: "Frank Deboosere voorspelt regen en is zijn paraplu kwijt", goal: "Zoek de paraplu van Frank Deboosere", item: "de paraplu van Frank Deboosere", short: "Paraplu",
    done: "Frank Deboosere heeft zijn paraplu. Morgen: zwaarbewolkt, af en toe liminaal.", hint: () => "Hij stond het weer te bekijken. Op het dak, natuurlijk.",
    place: "roof",
    model: (b, fr) => {
      fbox(b, fr, 0, 0.03, 0, 0.02, 0.02, 0.95, DARKS);
      fbox(b, fr, 0, 0.02, 0.15, 0.09, 0.08, 0.55, sp(L.WHITE, [0.1, 0.18, 0.5]));
      fbox(b, fr, 0, 0.02, -0.5, 0.03, 0.03, 0.12, sp(L.WOOD_FLOOR, [0.5, 0.3, 0.18]));
      fbox(b, fr, 0.05, 0.02, -0.56, 0.1, 0.03, 0.03, sp(L.WOOD_FLOOR, [0.5, 0.3, 0.18]));
    },
  },
  {
    id: "prompter", title: "Het Journaal begint zo, maar de prompterstick is weg", goal: "Zoek de USB-stick met de prompter", item: "de prompterstick van Het Journaal", short: "USB-stick",
    done: "De prompter loopt weer. Goedenavond, dames en heren.", hint: (w) => `Waarschijnlijk blijven liggen in de ${w}`,
    place: "rooms", types: [RT.REGIE], fallback: [RT.EDIT, RT.STUDIO], surface: "floor",
    model: (b, fr) => {
      fbox(b, fr, 0, 0, 0, 0.07, 0.018, 0.024, sp(L.WHITE, [0.1, 0.1, 0.12]));
      fbox(b, fr, 0.045, 0.004, 0, 0.02, 0.01, 0.016, sp(L.STEEL));
      fbox(b, fr, -0.02, 0.019, 0, 0.006, 0.002, 0.006, glow([0.2, 1.4, 0.4]));
      for (let k = 0; k < 6; k++) fbox(b, fr, -0.06 - k * 0.04, 0.002, Math.sin(k) * 0.03, 0.04, 0.006, 0.012, glow([0.7, 0.08, 0.1]));
    },
  },
  {
    id: "karrewiet", title: "De Karrewiet-reporter is haar microfoon kwijt", goal: "Zoek de gele Karrewiet-microfoon", item: "de microfoon van Karrewiet", short: "Microfoon",
    done: "De microfoon is terug. Karrewiet kan draaien!", hint: (w) => `Laatst gebruikt in ${w}`,
    place: "rooms", types: [RT.STUDIO], fallback: [RT.REGIE, RT.EDIT], surface: "floor",
    model: (b, fr) => {
      fbox(b, fr, 0, 0.02, 0, 0.035, 0.035, 0.2, DARKS);
      fbox(b, fr, 0, 0.012, 0.12, 0.055, 0.055, 0.06, sp(L.STEEL, [0.7, 0.7, 0.72]));
      fbox(b, fr, 0, 0.01, 0.06, 0.07, 0.06, 0.06, glow([0.95, 0.8, 0.05]));
    },
  },
  {
    id: "thuis", title: "Frank uit Thuis vindt zijn garagesleutels niet", goal: "Zoek de sleutels van de garage", item: "de garagesleutels van Frank", short: "Sleutelbos",
    done: "Frank kan zijn garage weer open doen. Volgende week in Thuis: nog meer drama.", hint: () => "Ergens in de parking, op -1",
    place: "garage",
    model: (b, fr) => {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        fbox(b, new Frame(...fr.p(Math.cos(a) * 0.025, 0, Math.sin(a) * 0.025), fr.rot - a), 0, 0.002, 0, 0.004, 0.004, 0.022, sp(L.STEEL));
      }
      fbox(b, fr, 0.07, 0.002, 0, 0.08, 0.005, 0.02, glow([0.75, 0.72, 0.6]));
      fbox(b, fr, 0.06, 0.002, 0.03, 0.07, 0.005, 0.018, glow([0.7, 0.6, 0.35]));
      fbox(b, fr, -0.06, 0.002, 0, 0.05, 0.006, 0.035, glow([0.9, 0.35, 0.05]));
    },
  },
  {
    id: "pano", title: "Een Pano-tape uit 1987 is verkeerd gearchiveerd", goal: "Zoek de cassette 'PANO 1987'", item: "de Pano-tape uit 1987", short: "Cassette PANO 1987",
    done: "De tape staat terug op zijn plaats. Niemand zal ooit weten wat erop stond.", hint: (w) => `Ergens tussen de rekken, ${w}`,
    place: "rooms", types: [RT.ARCHIVE], fallback: [RT.STORAGE], surface: "floor",
    model: (b, fr) => {
      fbox(b, fr, 0, 0, 0, 0.25, 0.03, 0.15, DARKS);
      fbox(b, fr, 0, 0.03, 0, 0.16, 0.002, 0.07, glow([0.85, 0.82, 0.7]));
      fbox(b, fr, -0.04, 0.032, 0, 0.05, 0.002, 0.03, glow([0.8, 0.1, 0.1]));
    },
  },
  {
    id: "peter", title: "Peter Van de Veire is zijn koptelefoon kwijt", goal: "Zoek de koptelefoon van Peter", item: "de koptelefoon van Peter Van de Veire", short: "Koptelefoon",
    done: "Peter heeft zijn koptelefoon terug. MNM zendt weer uit.", hint: (w) => `Hij monteerde iets in een ${w}`,
    place: "rooms", types: [RT.EDIT], fallback: [RT.OFFICE, RT.MEETING], surface: "table",
    model: (b, fr) => {
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * Math.PI;
        fbox(b, fr, Math.cos(a) * 0.09, 0.005 + Math.sin(a) * 0.004, Math.sin(a) * 0.09 - 0.04, 0.03, 0.012, 0.03, sp(L.WHITE, [0.1, 0.1, 0.1]));
      }
      for (const x of [-0.09, 0.09]) fbox(b, fr, x, 0, -0.04, 0.05, 0.07, 0.08, glow([0.1, 0.55, 0.3]));
    },
  },
  {
    id: "badge", title: "De nieuwe stagiair is zijn badge kwijt", goal: "Zoek de badge van de stagiair", item: "de badge van de stagiair", short: "Badge",
    done: "De stagiair kan weer binnen. Welkom bij de VRT, voor de derde keer.", hint: (w) => `Hij verdwaalde in ${w}`,
    place: "corridor",
    model: (b, fr) => {
      fbox(b, fr, 0, 0, 0, 0.09, 0.004, 0.056, glow([0.8, 0.8, 0.78]));
      fbox(b, fr, 0, 0.004, -0.018, 0.09, 0.001, 0.014, glow([1.1, 0.2, 0.5]));
      for (let k = 0; k < 7; k++) fbox(b, fr, Math.sin(k * 0.9) * 0.05, 0.001, 0.05 + k * 0.035, 0.012, 0.003, 0.04, sp(L.WHITE, [0.1, 0.1, 0.12]));
    },
  },
];

export class Quests {
  quests: Quest[] = [];
  objs: Obj[] = [];
  active: QId | null = null;
  t = 0;
  running = false;
  prompt = "";
  root = new THREE.Group();
  chairs: Chair[] = [];
  chairSpot: Spot | null = null;
  toiletSpot: Spot | null = null;
  toilets: { mesh: THREE.Mesh; x: number; y: number; z: number; nx: number; nz: number; flushed: boolean; k: number }[] = [];
  flyT = 0;
  ghost: THREE.Mesh | null = null;
  ghostMat = new THREE.MeshBasicMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
  ghostTimer = 35;
  ghostPulls = 0;
  jan: { spot: Spot; obj: Obj | null; timer: number } | null = null;
  beepT = 0;
  toasts: HTMLElement;
  startedAt = 0;
  finished = false;
  onFinish: (secs: number) => void = () => {};
  private store: string;

  constructor(private world: World, private player: Player, private sound: Sound, private startFloor: number) {
    this.toasts = document.getElementById("toasts")!;
    this.store = `vrt-quests-${getSeed()}`;
    const saved = new Set<string>(JSON.parse(localStorage.getItem(this.store) ?? "[]"));
    const cx0 = Math.floor(player.pos.x / (CH * CELL)), cz0 = Math.floor(player.pos.z / (CH * CELL));

    const chairs = this.placeChairs(cx0, cz0);
    this.chairSpot = chairs;
    const loos = this.placeToilets(cx0, cz0);
    this.toiletSpot = loos?.spot ?? null;
    const janSpot = this.pickJanSpot(cx0, cz0, startFloor, new Rng(hash(901, 1)));
    this.jan = { spot: janSpot, obj: null, timer: 150 };

    const where = (s: Spot | null) => (s ? `${s.label}, ${floorName(s.f).toLowerCase()}` : "ergens in het gebouw");
    const items = ITEMS.map((d, k) => ({ d, spot: this.placeItem(d, cx0, cz0, k) }));
    const launch = [2, 25, 55, 85, 120, 160, 200, 240, 285, 330, 375];
    const special: Quest[] = [
      {
        id: "jan", title: "Jan Becaus is weer kwijt", goal: "Vind Jan Becaus", item: "Jan Becaus",
        doneText: "Jan Becaus is terecht. Hij wou gewoon nog eens langs de nieuwsdienst.", launchAt: 0, launched: false, done: false,
        hint: () => `Laatst gezien: ${where(this.jan!.spot)}. Hij blijft niet lang op één plek.`,
        target: () => this.jan!.spot,
      },
      {
        id: "felice", title: "Het spook van Felice dwaalt weer rond", goal: "Schuif alle stoelen onder de tafel", item: "de stoelen van Felice",
        doneText: "Alle stoelen staan netjes. Felice kan weer rusten.", launchAt: 0, launched: false, done: false,
        hint: () => `${where(chairs)} · ${this.chairs.filter((c) => c.target === 1).length}/${this.chairs.length} stoelen`,
        target: () => chairs,
      },
      {
        id: "kak", title: "Geen kak in de toiletten", goal: "Trek alle toiletten door", item: "de vuile toiletten",
        doneText: "Alles doorgetrokken. Het sanitair is weer presentabel.", launchAt: 0, launched: false, done: false,
        hint: () => `Iemand heeft niet doorgetrokken. ${where(this.toiletSpot)} · ${this.toilets.filter((t) => t.flushed).length}/${this.toilets.length}`,
        target: () => this.toiletSpot,
      },
    ];
    const itemQuests: Quest[] = items.map(({ d, spot }) => ({
      id: d.id, title: d.title, goal: d.goal, item: d.item, doneText: d.done, launchAt: 0, launched: false, done: false,
      hint: () => d.hint(where(spot)), target: () => spot,
    }));
    // order: Ben, Tom, Jan, Felice, the toilets, then the rest
    this.quests = [itemQuests[0]!, itemQuests[1]!, special[0]!, special[1]!, ...(loos ? [special[2]!] : []), ...itemQuests.slice(2)];
    this.quests.forEach((q, k) => (q.launchAt = launch[k] ?? 375 + (k - 10) * 45));
    for (const q of this.quests) if (saved.has(q.id)) q.done = true;
    for (const { d, spot } of items) if (spot) this.addItem(d.id, spot, d.short, d.model);
    if (chairs) this.buildChairs(chairs);
    if (loos) this.buildToilets(loos.spot, loos.seats);
    this.spawnJan();
  }

  // --- placement ------------------------------------------------------------

  private placeItem(d: ItemDef, cx0: number, cz0: number, k: number): Spot | null {
    const rng = new Rng(hash(920, k));
    const floors = floorsNear(this.startFloor);
    const cellSpot = (f: number, gx: number, gz: number, label: string): Spot => ({
      f, x: (gx + 0.5) * CELL + rng.range(-0.5, 0.5), z: (gz + 0.5) * CELL + rng.range(-0.5, 0.5), y: f * H, gx, gz, rot: rng.range(0, 6.28), label,
    });
    const openCells = (f: number, kind: number, R: number) => {
      const out: { gx: number; gz: number }[] = [];
      for (let cz = cz0 - R; cz <= cz0 + R; cz++)
        for (let cx = cx0 - R; cx <= cx0 + R; cx++) {
          const p = getPlan(f, cx, cz);
          const fur = getFurnished(f, cx, cz);
          const busy = new Set(fur.props.filter((pr) => pr.t !== "puddle").map((pr) => pr.gx + "," + pr.gz));
          for (let i = 0; i < CH * CH; i++) {
            if (p.kind[i] !== kind || (kind === K.CORR && p.zone[i])) continue;
            const gx = cx * CH + (i % CH), gz = cz * CH + ((i / CH) | 0);
            if (kind !== K.CORR && busy.has(gx + "," + gz)) continue;
            out.push({ gx, gz });
          }
        }
      return out;
    };
    if (d.place === "garage" || d.place === "roof") {
      const f = d.place === "garage" ? FLOOR_MIN : FLOOR_MAX;
      const c = openCells(f, d.place === "garage" ? K.GARAGE : K.ROOF, 2);
      if (!c.length) return null;
      const q = rng.pick(c);
      return cellSpot(f, q.gx, q.gz, d.place === "garage" ? "de parking" : "het dak");
    }
    if (d.place === "corridor") {
      const f = rng.pick(floors);
      const c = openCells(f, K.CORR, 2);
      if (!c.length) return null;
      const q = rng.pick(c);
      return cellSpot(f, q.gx, q.gz, lc(cellLabel(f, q.gx, q.gz)));
    }
    let c = findRooms(d.types!, floors, cx0, cz0, 2);
    if (!c.length && d.fallback) c = findRooms(d.fallback, floors, cx0, cz0, 2);
    if (!c.length) c = findRooms(d.types!.concat(d.fallback ?? []), floors, cx0, cz0, 3);
    if (!c.length) return null;
    const { p, r } = rng.pick(c);
    const label = r.type === RT.STUDIO ? `studio ${r.num}` : ROOM_LABEL[r.type]!.toLowerCase();
    if (d.surface === "table") {
      const fur = getFurnished(p.f, p.cx, p.cz);
      const inRoom = (gx: number, gz: number) => p.room[idx(gx - p.cx * CH, gz - p.cz * CH)] === r.id;
      const tops: Record<string, [number, number, number]> = { ctable: [0.745, 0, 0.8], mtable: [0.76, 0, 0.6], desks: [0.735, 0.55, 0.5], editdesk: [0.74, 0.55, 0.6], newsdesk: [0.97, -0.1, 0.9] };
      const tables = fur.props.filter((pr) => tops[pr.t] && inRoom(pr.gx, pr.gz));
      if (tables.length) {
        const t = rng.pick(tables);
        const [y, lz, span] = tops[t.t]!;
        const lx = rng.range(-span, span);
        const x = t.x + Math.cos(t.rot) * lx + Math.sin(t.rot) * lz, z = t.z - Math.sin(t.rot) * lx + Math.cos(t.rot) * lz;
        return { f: p.f, x, z, y: p.f * H + y, gx: t.gx, gz: t.gz, rot: rng.range(0, 6.28), label };
      }
    }
    const i = rng.pick(r.cells);
    return cellSpot(p.f, p.cx * CH + (i % CH), p.cz * CH + ((i / CH) | 0), label);
  }

  private placeToilets(cx0: number, cz0: number) {
    const rng = new Rng(hash(915, 1));
    const floors = floorsNear(this.startFloor);
    const withStalls = (p: Plan, r: Room) =>
      getFurnished(p.f, p.cx, p.cz).props.some((pr) => pr.t === "stalls" && p.room[idx(pr.gx - p.cx * CH, pr.gz - p.cz * CH)] === r.id);
    let c = findRooms([RT.BATH], floors, cx0, cz0, 2, withStalls);
    if (!c.length) c = findRooms([RT.BATH], floors, cx0, cz0, 3, withStalls);
    if (!c.length) return null;
    const { p, r } = rng.pick(c);
    const seats: { x: number; y: number; z: number; nx: number; nz: number }[] = [];
    for (const pr of getFurnished(p.f, p.cx, p.cz).props) {
      if (pr.t !== "stalls" || p.room[idx(pr.gx - p.cx * CH, pr.gz - p.cz * CH)] !== r.id) continue;
      const fr = new Frame(pr.x, pr.y, pr.z, pr.rot);
      for (const x of [-0.475, 0.475]) {
        const w = fr.p(x, 0.462, 0.28);
        seats.push({ x: w[0], y: w[1], z: w[2], nx: fr.s, nz: fr.c });
      }
    }
    const m = roomCenter(p, r);
    const spot: Spot = { f: p.f, x: m.x, z: m.z, y: p.f * H, gx: Math.floor(m.x / CELL), gz: Math.floor(m.z / CELL), rot: 0, label: "sanitair" };
    return { spot, seats };
  }

  private buildToilets(s: Spot, seats: { x: number; y: number; z: number; nx: number; nz: number }[]) {
    const done = this.quests.find((q) => q.id === "kak")?.done;
    if (done) return;
    const rng = new Rng(hash(916, 1));
    for (const seat of seats) {
      const spot: Spot = { ...s, x: seat.x, y: seat.y, z: seat.z, rot: rng.range(0, 6.28) };
      const mesh = this.build(spot, (b) => {
        // the water, and what floats in it
        b.hrect(-0.14, -0.17, 0.14, 0.17, 0.002, true, sp(L.PUDDLE, [0.55, 0.45, 0.25]), 0);
        const brown = sp(L.WHITE, [0.34, 0.2, 0.08]);
        const n = rng.int(2, 4);
        for (let k = 0; k < n; k++) {
          const r = 0.06 - k * 0.012;
          b.geom(BLOB, rng.range(-0.03, 0.03), 0.02 + k * 0.035, rng.range(-0.03, 0.03), rng.range(0, 6), r * 1.2, r * 0.7, r, brown);
        }
      });
      this.toilets.push({ mesh, x: seat.x, y: seat.y, z: seat.z, nx: seat.nx, nz: seat.nz, flushed: false, k: 0 });
    }
  }

  private placeChairs(cx0: number, cz0: number): Spot | null {
    const rng = new Rng(hash(913, 1));
    const floors = floorsNear(this.startFloor);
    const noChair = (p: Plan, r: Room) => {
      if (r.x1 - r.x0 < 1 || r.z1 - r.z0 < 1 || roomAnomaly(p, r)) return false;
      const fur = getFurnished(p.f, p.cx, p.cz);
      return !fur.props.some((pr) => pr.t === "chair" && p.room[idx(pr.gx - p.cx * CH, pr.gz - p.cz * CH)] === r.id);
    };
    let c = findRooms([RT.EMPTY], floors, cx0, cz0, 2, noChair);
    if (!c.length) c = findRooms([RT.EMPTY], floors, cx0, cz0, 3, noChair);
    if (!c.length) return null;
    const { p, r } = rng.pick(c);
    const m = roomCenter(p, r);
    const w = r.x1 - r.x0 + 1, d = r.z1 - r.z0 + 1;
    return { f: p.f, x: m.x, z: m.z, y: p.f * H, gx: Math.floor(m.x / CELL), gz: Math.floor(m.z / CELL), rot: w >= d ? 0 : Math.PI / 2, label: "leeg lokaal" };
  }

  private pickJanSpot(cx0: number, cz0: number, fNear: number, rng: Rng): Spot {
    for (let tries = 0; tries < 60; tries++) {
      const f = Math.max(0, Math.min(FLOOR_MAX - 1, fNear + rng.int(-3, 3)));
      const cx = cx0 + rng.int(-2, 2), cz = cz0 + rng.int(-2, 2);
      const p = getPlan(f, cx, cz);
      const cells: number[] = [];
      for (let i = 0; i < CH * CH; i++) if (p.kind[i] === K.CORR && !p.zone[i]) cells.push(i);
      const studios = p.rooms.filter((r) => (r.type === RT.STUDIO || r.type === RT.REGIE || r.type === RT.CANTEEN) && p.kind[r.cells[0]!] === K.ROOM && roomReachable(p, r));
      if (studios.length && rng.chance(0.35)) {
        const r = rng.pick(studios);
        const m = roomCenter(p, r);
        const gx = Math.floor(m.x / CELL), gz = Math.floor(m.z / CELL);
        return { f, x: m.x + 0.6, z: m.z + 0.6, y: f * H, gx, gz, rot: rng.range(0, 6.28), label: lc(cellLabel(f, gx, gz)) };
      }
      if (!cells.length) continue;
      const i = rng.pick(cells);
      const gx = cx * CH + (i % CH), gz = cz * CH + ((i / CH) | 0);
      return { f, x: (gx + 0.5) * CELL + rng.range(-0.4, 0.4), z: (gz + 0.5) * CELL + rng.range(-0.4, 0.4), y: f * H, gx, gz, rot: rng.range(0, 6.28), label: lc(cellLabel(f, gx, gz)) };
    }
    return { f: fNear, x: this.player.pos.x, z: this.player.pos.z, y: fNear * H, gx: 0, gz: 0, rot: 0, label: "gang" };
  }

  // --- objects ----------------------------------------------------------------

  // Geometry built around a local origin, lit as if it stood at the spot.
  private build(s: Spot, fn: (b: Builder, fr: Frame) => void) {
    const cx = Math.floor(s.gx / CH), cz = Math.floor(s.gz / CH);
    const b = new Builder(new LightCtx(s.f, cx, cz)).cell(s.gx, s.gz);
    b.ox = s.x;
    b.oy = s.y;
    b.oz = s.z;
    fn(b, new Frame(0, 0, 0, 0));
    const mesh = new THREE.Mesh(this.world.geometry(b.finish()), this.world.mat);
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.y = s.rot;
    this.root.add(mesh);
    return mesh;
  }

  private addItem(q: QId, s: Spot, label: string, fn: (b: Builder, fr: Frame) => void) {
    if (this.quests.find((x) => x.id === q)?.done) return;
    const mesh = this.build(s, fn);
    const obj: Obj = {
      quest: q, f: s.f, mesh, x: s.x, y: s.y + 0.1, z: s.z, label, alive: true,
      use: () => {
        obj.alive = false;
        this.root.remove(mesh);
        this.complete(q);
      },
    };
    this.objs.push(obj);
  }

  private spawnJan() {
    const j = this.jan!;
    if (j.obj) {
      this.root.remove(j.obj.mesh);
      j.obj.alive = false;
      this.objs = this.objs.filter((o) => o !== j.obj);
      j.obj = null;
    }
    if (this.quests.find((q) => q.id === "jan")?.done) return;
    const mesh = this.build(j.spot, (b, fr) => person(b, fr, [0.13, 0.15, 0.24], [0.9, 0.9, 0.88], [0.55, 0.08, 0.1], true));
    const obj: Obj = {
      quest: "jan", f: j.spot.f, mesh, x: j.spot.x, y: j.spot.y + 1.2, z: j.spot.z, label: "Jan Becaus", alive: true,
      use: () => {
        this.sound.say("Ah, goeiendag! Ik kwam gewoon nog eens kijken hoe het met het nieuws gaat.", 0.8, 0.95);
        obj.alive = false;
        this.complete("jan");
        setTimeout(() => this.root.remove(mesh), 2500);
      },
    };
    j.obj = obj;
    this.objs.push(obj);
  }

  private buildChairs(s: Spot) {
    const rng = new Rng(hash(914, 1));
    const done = this.quests.find((q) => q.id === "felice")?.done;
    // table
    this.build(s, (b, fr) => {
      fbox(b, fr, 0, 0.72, 0, 2.2, 0.04, 0.9, sp(L.WOOD_FLOOR, [0.8, 0.72, 0.62]));
      for (const x of [-1.0, 1.0]) for (const z of [-0.38, 0.38]) fbox(b, fr, x, 0, z, 0.05, 0.72, 0.05, sp(L.WHITE, [0.2, 0.2, 0.22]));
    });
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const ext = (Math.abs(c) * 2.2 + Math.abs(sn) * 0.9) / 2, ezz = (Math.abs(sn) * 2.2 + Math.abs(c) * 0.9) / 2;
    this.world.extraBoxes.push({ f: s.f, box: [s.x - ext, s.z - ezz, s.x + ext, s.z + ezz] });
    const toWorld = (lx: number, lz: number) => new THREE.Vector3(s.x + lx * c + lz * sn, s.y, s.z - lx * sn + lz * c);
    for (const side of [1, -1])
      for (const lx of [-0.7, 0, 0.7]) {
        const toRot = s.rot + (side > 0 ? 0 : Math.PI);
        const to = toWorld(lx, side * 0.55);
        const from = toWorld(lx + rng.range(-0.25, 0.25), side * rng.range(1.05, 1.45));
        const fromRot = toRot + rng.range(-0.7, 0.7);
        const spot: Spot = { ...s, x: from.x, z: from.z, rot: fromRot };
        const mesh = this.build(spot, (b, fr) => chair(b, fr, 0, 0, 0));
        const ch: Chair = { mesh, from, fromRot, to, toRot, k: done ? 1 : 0, target: done ? 1 : 0 };
        this.chairs.push(ch);
        this.placeChair(ch);
      }
    const ghost = new Builder(new LightCtx(s.f, 0, 0, "outdoor"));
    person(ghost, new Frame(0, 0, 0, 0), [1, 1, 1], [1, 1, 1], [1, 1, 1], false);
    this.ghost = new THREE.Mesh(this.world.geometry(ghost.finish()), this.ghostMat);
    this.root.add(this.ghost);
  }

  private placeChair(ch: Chair) {
    const k = ch.k * ch.k * (3 - 2 * ch.k);
    ch.mesh.position.lerpVectors(ch.from, ch.to, k);
    ch.mesh.rotation.y = ch.fromRot + (ch.toRot - ch.fromRot) * k;
  }

  // --- flow -------------------------------------------------------------------

  toast(title: string, body = "", kind = "") {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.innerHTML = `<b>${title}</b>${body ? `<span>${body}</span>` : ""}`;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    setTimeout(() => el.classList.add("out"), 5200);
    setTimeout(() => el.remove(), 6000);
  }

  private questOf(id: QId) {
    return this.quests.find((q) => q.id === id)!;
  }

  private complete(id: QId) {
    const q = this.questOf(id);
    q.done = true;
    localStorage.setItem(this.store, JSON.stringify(this.quests.filter((x) => x.done).map((x) => x.id)));
    this.sound.success();
    this.toast("QUEST GEHAALD", q.doneText, "ok");
    const done = this.quests.filter((x) => x.done).length;
    track("quest_completed", { quest: id, seconds: Math.round(this.t - this.startedAt), completed: done });
    if (done === this.quests.length) track("all_quests_completed", { seconds: Math.round(this.t - this.startedAt) });
    if (this.active === id) this.active = null;
    this.pickNext();
    if (this.quests.every((x) => x.done) && !this.finished) {
      this.finished = true;
      setTimeout(() => this.onFinish(this.t - this.startedAt), 2500);
    }
  }

  private pickNext() {
    if (this.active && !this.questOf(this.active).done) return;
    this.active = this.quests.find((q) => q.launched && !q.done)?.id ?? null;
  }

  activeTarget() {
    const q = this.active ? this.questOf(this.active) : null;
    return q?.target() ?? null;
  }

  cycle() {
    const open = this.quests.filter((q) => q.launched && !q.done);
    if (!open.length) return;
    const i = open.findIndex((q) => q.id === this.active);
    this.active = open[(i + 1) % open.length]!.id;
    this.listUntil = this.t + 4;
    this.sound.beep(1);
  }

  private wrong(label: string) {
    const owner = this.quests.find((q) => q.item === label)?.id ?? "?";
    track("quest_wrong_item", { active: this.active ?? "none", item_of: owner });
    this.sound.wrong();
    this.toast("TELT NIET", `Dit hoort bij een andere quest (${label}).`, "bad");
  }

  update(dt: number, interact: boolean): boolean {
    this.t += dt;
    const P = this.player;
    const pf = P.floor;
    let consumed = false;

    if (this.running) {
      for (const q of this.quests)
        if (!q.launched && this.t - this.startedAt >= q.launchAt) {
          q.launched = true;
          if (!q.done) {
            this.sound.chime();
            this.toast("NIEUWE QUEST", q.title, "new");
            this.listUntil = this.t + 5;
          }
          this.pickNext();
        }
    }

    // visibility follows the streamed chunks
    for (const o of this.objs) o.mesh.visible = o.alive && this.world.isReady(o.f, Math.floor(o.x / (CH * CELL)), Math.floor(o.z / (CH * CELL)));
    if (this.toiletSpot) {
      const ready = this.world.isReady(this.toiletSpot.f, Math.floor(this.toiletSpot.x / (CH * CELL)), Math.floor(this.toiletSpot.z / (CH * CELL)));
      for (const t of this.toilets) t.mesh.visible = ready && t.k < 1;
    }

    // Jan wanders off every few minutes (never while you are looking at him)
    const j = this.jan!;
    const janQ = this.questOf("jan");
    if (this.running && !janQ.done) {
      j.timer -= dt;
      const near = j.spot.f === pf && Math.hypot(j.spot.x - P.pos.x, j.spot.z - P.pos.z) < 14;
      if (j.timer <= 0 && !near) {
        j.timer = 140 + Math.random() * 80;
        const cx = Math.floor(P.pos.x / (CH * CELL)), cz = Math.floor(P.pos.z / (CH * CELL));
        j.spot = this.pickJanSpot(cx, cz, Math.max(0, Math.min(FLOOR_MAX - 1, pf)), new Rng((Math.random() * 1e9) | 0));
        this.spawnJan();
        if (janQ.launched) this.toast("JAN BECAUS IS WEER OP WANDEL", `Gezien: ${j.spot.label}, ${floorName(j.spot.f).toLowerCase()}`);
      } else if (j.obj && near) {
        // turn towards you
        const a = Math.atan2(P.pos.x - j.spot.x, P.pos.z - j.spot.z);
        let d = a - j.obj.mesh.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        j.obj.mesh.rotation.y += d * Math.min(1, dt * 2);
      }
    }

    // Felice's ghost drifts around the table and pulls chairs back out
    const cs = this.chairSpot;
    const felQ = this.questOf("felice");
    if (this.ghost && cs) {
      const vis = pf === cs.f && !felQ.done;
      this.ghost.visible = vis;
      if (vis) {
        const a = this.t * 0.25;
        this.ghost.position.set(cs.x + Math.cos(a) * 2.2, cs.y + 0.1 + Math.sin(this.t * 1.3) * 0.08, cs.z + Math.sin(a) * 2.2);
        this.ghost.rotation.y = -a;
        this.ghostMat.opacity = 0.1 + 0.08 * Math.max(0, Math.sin(this.t * 2.3) * Math.sin(this.t * 0.7 + 1)) + (Math.random() < 0.02 ? 0.1 : 0);
      }
      if (this.running && felQ.launched && !felQ.done && this.ghostPulls < 3) {
        this.ghostTimer -= dt;
        const pushed = this.chairs.filter((c) => c.target === 1);
        const far = pushed.filter((c) => Math.hypot(c.to.x - P.pos.x, c.to.z - P.pos.z) > 5 || pf !== cs.f);
        if (this.ghostTimer <= 0 && far.length && pushed.length < this.chairs.length) {
          this.ghostTimer = 40 + Math.random() * 30;
          this.ghostPulls++;
          far[Math.floor(Math.random() * far.length)]!.target = 0;
          if (pf === cs.f && Math.hypot(cs.x - P.pos.x, cs.z - P.pos.z) < 30) {
            this.sound.creak();
            this.toast("ERGENS SCHUIFT EEN STOEL", "Felice is niet tevreden.", "bad");
          }
        }
      }
    }
    for (const ch of this.chairs) {
      if (ch.k === ch.target) continue;
      ch.k += Math.sign(ch.target - ch.k) * Math.min(Math.abs(ch.target - ch.k), dt * 1.8);
      this.placeChair(ch);
    }

    // what can we touch?
    this.prompt = "";
    const cam = P.pos;
    const eyeY = P.pos.y + 1.6;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    let best: { d: number; label: string; action: () => void } | null = null;
    const consider = (x: number, y: number, z: number, f: number, label: string, action: () => void, reach = 1.8) => {
      if (f !== pf) return;
      const dx = x - cam.x, dz = z - cam.z, dy = y - eyeY;
      const d = Math.hypot(dx, dy, dz);
      if (d > reach) return;
      const facing = (dx * fx + dz * fz) / Math.max(0.01, Math.hypot(dx, dz));
      if (facing < 0.35 && d > 0.7) return;
      if (!best || d < best.d) best = { d, label, action };
    };
    for (const o of this.objs) {
      if (!o.alive) continue;
      const isActive = this.active === o.quest;
      consider(o.x, o.y, o.z, o.f, isActive ? `E · ${o.quest === "jan" ? "Aanspreken" : "Oprapen"}: ${o.label}` : `E · ${o.label}`, () => {
        if (this.active === o.quest) o.use();
        else this.wrong(this.questOf(o.quest).item);
      }, o.quest === "jan" ? 2.4 : 1.8);
    }
    if (cs && !felQ.done)
      for (const ch of this.chairs) {
        if (ch.target === 1) continue;
        const p = ch.mesh.position;
        consider(p.x, p.y + 0.5, p.z, cs.f, this.active === "felice" ? "E · Stoel aanschuiven" : "E · Stoel", () => {
          if (this.active !== "felice") return this.wrong(this.questOf("felice").item);
          ch.target = 1;
          this.sound.scrape();
          if (this.chairs.every((c) => c.target === 1)) setTimeout(() => this.chairs.every((c) => c.target === 1) && !felQ.done && this.complete("felice"), 700);
        });
      }
    const kakQ = this.quests.find((x) => x.id === "kak");
    if (kakQ && !kakQ.done && this.toiletSpot) {
      let near = 99;
      for (const t of this.toilets) {
        if (t.flushed) {
          if (t.k < 1) {
            t.k = Math.min(1, t.k + dt * 0.6);
            t.mesh.scale.setScalar(Math.max(0.01, 1 - t.k));
            t.mesh.rotation.y += dt * 8;
            if (t.k >= 1) t.mesh.visible = false;
          }
          continue;
        }
        if (this.toiletSpot.f === pf) near = Math.min(near, Math.hypot(t.x - P.pos.x, t.z - P.pos.z));
        consider(t.x, t.y, t.z, this.toiletSpot.f, this.active === "kak" ? "E · Doortrekken" : "E · Toilet", () => {
          if (this.active !== "kak") return this.wrong(kakQ.item);
          t.flushed = true;
          this.sound.flush();
          if (this.toilets.every((x) => x.flushed)) setTimeout(() => !kakQ.done && this.complete("kak"), 1600);
        }, 2.5);
      }
      // flies
      this.flyT -= dt;
      if (near < 5 && this.flyT <= 0) {
        this.flyT = 1.5 + Math.random() * 3;
        this.sound.fly(1 - near / 5);
      }
    }
    if (best) {
      const b = best as { d: number; label: string; action: () => void };
      this.prompt = b.label;
      if (interact) {
        b.action();
        consumed = true;
      }
    }

    // signal meter + beeps for the active quest
    const q = this.active ? this.questOf(this.active) : null;
    const tgt = q?.target();
    let bars = 0;
    if (tgt) {
      const d = Math.hypot(tgt.x - P.pos.x, tgt.z - P.pos.z) + Math.abs(tgt.f - pf) * 18;
      bars = d < 6 ? 5 : d < 15 ? 4 : d < 30 ? 3 : d < 60 ? 2 : d < 110 ? 1 : 0;
      if (tgt.f === pf && d < 16 && this.running) {
        this.beepT -= dt;
        if (this.beepT <= 0) {
          this.beepT = 0.2 + (d / 16) * 1.3;
          this.sound.beep(1 - d / 16);
        }
      }
    }
    this.renderHud(q, bars);
    return consumed;
  }

  private hudKey = "";
  listUntil = 0;
  private renderHud(q: Quest | null, bars: number) {
    const list = this.quests.filter((x) => x.launched);
    const showList = this.t < this.listUntil;
    const key = `${this.active}|${bars}|${showList}|${list.map((x) => x.id + x.done).join()}|${q?.hint()}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    const box = document.getElementById("quest")!;
    if (!list.length) {
      box.style.display = "none";
      return;
    }
    box.style.display = "";
    const sig = Array.from({ length: 5 }, (_, i) => `<i class="${i < bars ? "on" : ""}"></i>`).join("");
    box.innerHTML =
      (q
        ? `<div class="qa"><div class="qt">${q.goal}</div><div class="qh">${q.hint()}</div><div class="sig">SIGNAAL ${sig}</div></div>`
        : `<div class="qa"><div class="qt">Geen actieve quest</div></div>`) +
      (showList ? `<ul>${list.map((x) => `<li class="${x.done ? "done" : x.id === this.active ? "act" : ""}">${x.done ? "✓" : x.id === this.active ? "▶" : "·"} ${x.title}</li>`).join("")}</ul>` : "") +
      `<div class="qk">${this.quests.filter((x) => x.done).length}/${this.quests.length} gehaald${list.filter((x) => !x.done).length > 1 ? ` · <kbd>TAB</kbd><span class="mob">QUEST</span> andere quest` : ""}</div>`;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startedAt = this.t;
  }
}
