// Quests, GTA style: the phones in the corridors ring, you pick one up (E), the
// caller tells you what they've lost, and the clock starts. Everyone in the
// world races for the same jobs; the room (protocol.ts) decides who was first.
// A job's thing is placed from the world, the job and its number, so it's in
// the same spot for everyone.
import * as THREE from "three";
import { IcosahedronGeometry } from "three";
import { CELL, CH, DX, DZ, FLOOR_MAX, FLOOR_MIN, H, floorName } from "./config";
import { Builder, Frame, LightCtx, fbox, type RGB, type Spec } from "./builder";
import { getFurnished, propSolids } from "./furnish";
import { K, RT, cellLabel, getPlan, idx, radioStation, roomAnomaly, roomLabel, type Plan, type Room } from "./layout";
import { MNM } from "./stations";
import { L } from "./layers";
import { chair } from "./props";
import { Rng, hash } from "./rng";
import type { Sound } from "./audio";
import type { Player } from "./player";
import type { World } from "./world";
import { track } from "./analytics";
import { JAN_EVERY_MS, TARGET } from "./jobs";
import type { FromRoom, Job, ToRoom, Top } from "./protocol";

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
export function person(b: Builder, fr: Frame, suit: RGB, hair: RGB, tie: RGB, glasses: boolean) {
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


// who's on the phone, and what they say (the browser reads it out)
interface Call {
  caller: string;
  call: string;
  voice: [number, number]; // pitch, rate
}

interface Def extends Call {
  id: string;
  title: string;
  goal: string;
  item: string;
  done: string;
}

interface ItemDef extends Def {
  short: string; // prompt label
  hint: (where: string) => string;
  place: "rooms" | "garage" | "roof" | "corridor";
  types?: number[];
  fallback?: number[];
  only?: (p: Plan, r: Room) => boolean; // preferred rooms among `types`
  surface?: "table" | "floor";
  model: (b: Builder, fr: Frame) => void;
}

const DARKS = sp(L.WHITE, [0.05, 0.05, 0.05]);
const BLOB = new IcosahedronGeometry(1, 1);
const glow = (c: RGB): Spec => ({ layer: L.WHITE, emit: c });

const ITEMS: ItemDef[] = [
  {
    id: "ben", title: "Ben Crabbé is zijn brooddoos vergeten", goal: "Zoek de brooddoos van Ben", item: "de brooddoos van Ben Crabbé", short: "Brooddoos",
    caller: "Ben Crabbé", voice: [1.0, 1.05],
    call: "Met Ben Crabbé. Ik heb mijn brooddoos laten liggen, ergens in een kantine. Mijn boterhammen met choco! Kunt ge die rap gaan halen?",
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
    caller: "Tom Waes", voice: [0.8, 1.1],
    call: "Ja, Tom Waes hier. Mijn veter is los en hij is kapot, en zo geraak ik niet thuis. Er moet er nog eentje liggen in een berging.",
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
    caller: "Frank Deboosere", voice: [0.85, 0.9],
    call: "Frank Deboosere. Ik voorspel regen, en mijn paraplu staat nog op het dak. Haast u: de eerste druppels vallen binnen het uur.",
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
    id: "thuis", title: "Frank uit Thuis vindt zijn garagesleutels niet", goal: "Zoek de sleutels van de garage", item: "de garagesleutels van Frank", short: "Sleutelbos",
    caller: "Frank uit Thuis", voice: [0.7, 0.95],
    call: "Frank hier, van Thuis. Ik vind mijn garagesleutels niet meer. Ze moeten ergens in de parking liggen, op min één.",
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
    caller: "Het archief", voice: [0.6, 0.85],
    call: "Hier het archief. Er is een Pano-tape uit 1987 verkeerd opgeborgen. Niemand mag weten wat erop staat. Vind hem, en stel geen vragen.",
    done: "De tape staat terug op zijn plaats. Niemand zal ooit weten wat erop stond.", hint: (w) => `Ergens tussen de rekken, ${w}`,
    place: "rooms", types: [RT.ARCHIVE], fallback: [RT.STORAGE], surface: "floor",
    model: (b, fr) => {
      fbox(b, fr, 0, 0, 0, 0.25, 0.03, 0.15, DARKS);
      fbox(b, fr, 0, 0.03, 0, 0.16, 0.002, 0.07, glow([0.85, 0.82, 0.7]));
      fbox(b, fr, -0.04, 0.032, 0, 0.05, 0.002, 0.03, glow([0.8, 0.1, 0.1]));
    },
  },
  {
    id: "peter", title: "Peter Van de Veire presenteert op blote voeten: zijn sokken zijn weg", goal: "Zoek de sokken van Peter", item: "de sokken van Peter Van de Veire", short: "Sokken",
    caller: "Peter Van de Veire", voice: [1.25, 1.2],
    call: "Hey hey, Peter Van de Veire! Ik presenteer op blote voeten: mijn sokken liggen nog ergens in een MNM-studio. Help!",
    done: "Peter heeft zijn sokken terug. De MNM-studio ruikt al een stuk beter.", hint: (w) => `Hij trok ze uit tijdens de uitzending: ${w}`,
    place: "rooms", types: [RT.RADIO], only: (p, r) => radioStation(p, r) === MNM, fallback: [RT.EDIT, RT.OFFICE], surface: "floor",
    model: (b, fr) => {
      // two striped socks, one flung a bit further
      for (const [x, z, a] of [[-0.06, 0, 0.3], [0.1, 0.07, -0.9]] as const) {
        const f = new Frame(...fr.p(x, 0, z), fr.rot + a);
        for (let k = 0; k < 5; k++) fbox(b, f, 0, 0, -0.1 + k * 0.04, 0.07, 0.025, 0.04, glow(k % 2 ? [1, 0.85, 0.1] : [0.95, 0.2, 0.45]));
        fbox(b, f, 0.035, 0, 0.1, 0.13, 0.025, 0.06, glow([0.95, 0.2, 0.45]));
      }
    },
  },
  {
    id: "michel", title: "Michel Wuyts is zijn koersboekje kwijt", goal: "Zoek het koersboekje van Michel", item: "het koersboekje van Michel Wuyts", short: "Koersboekje",
    caller: "Michel Wuyts", voice: [0.9, 1.15],
    call: "Michel Wuyts. Mijn koersboekje! Zonder mijn boekje weet ik niet wie er in de aanval zit. Het ligt aan een Sporza-desk.",
    done: "Michel Wuyts heeft zijn boekje terug. Wat een koers, wat een koers!", hint: (w) => `Hij zat aan de desk in ${w}`,
    place: "rooms", types: [RT.SPORZA], fallback: [RT.STUDIO, RT.REGIE], surface: "table",
    model: (b, fr) => {
      fbox(b, fr, 0, 0, 0, 0.15, 0.018, 0.21, { all: sp(L.WHITE, [0.9, 0.88, 0.8]), py: { layer: L.MISC, emit: [0.8, 0.8, 0.8], uv: [0.5, 0.5, 1, 1] } });
      fbox(b, fr, 0.09, 0.012, 0.02, 0.012, 0.004, 0.13, glow([0.9, 0.1, 0.1]));
    },
  },
  {
    id: "boma", title: "Boma zoekt zijn worst", goal: "Zoek de Boma-worst", item: "de Boma-worst", short: "Boma-worst",
    caller: "Boma", voice: [0.6, 0.9],
    call: "Hier Boma. Mijne worst is weg! Allez, die moet ergens in de mess liggen, of in een kantine. Rap!",
    done: "Boma heeft zijn worst terug. Allez, allez, Boma is content!", hint: (w) => `Iemand heeft hem laten liggen in ${w}`,
    place: "rooms", types: [RT.MESS, RT.CANTEEN], fallback: [RT.MEETING], surface: "table",
    model: (b, fr) => {
      // a ring of Boma worst: a bent sausage, tied off, with its yellow label
      const meat = glow([0.6, 0.2, 0.16]);
      for (let k = 0; k < 7; k++) {
        const a = -1.1 + k * 0.37;
        b.geom(BLOB, Math.sin(a) * 0.16, 0.035, Math.cos(a) * 0.16 - 0.1, a, 0.075, 0.036, 0.04, meat);
      }
      for (const a of [-1.2, 1.2]) fbox(b, new Frame(...fr.p(Math.sin(a) * 0.17, 0, Math.cos(a) * 0.17 - 0.1), a), 0, 0.02, 0, 0.02, 0.03, 0.03, glow([0.85, 0.8, 0.65]));
      fbox(b, new Frame(...fr.p(0, 0, 0.06), 0), 0, 0.066, 0, 0.1, 0.004, 0.035, glow([1.0, 0.85, 0.15]));
      fbox(b, new Frame(...fr.p(0, 0, 0.06), 0), 0, 0.071, 0, 0.06, 0.002, 0.02, glow([0.85, 0.08, 0.1]));
    },
  },
  {
    id: "ceo", title: "De CEO is zijn ruggengraat kwijt", goal: "Zoek de ruggengraat van de CEO", item: "de ruggengraat van de CEO", short: "Ruggengraat",
    caller: "De CEO", voice: [0.75, 0.85],
    call: "Hier de CEO. Ik ben mijn ruggengraat kwijt, op een vergadering. Vind hem voor de raad van bestuur het merkt.",
    done: "De CEO heeft zijn ruggengraat terug. Voorlopig.", hint: (w) => `Bij het begin van de vergadering met de EBU over Eurosong had hij hem nog: ${w}`,
    place: "rooms", types: [RT.MEETING], fallback: [RT.OFFICE], surface: "table",
    model: (b, fr) => {
      // a spine lying on the boardroom table: vertebrae and discs, tail to neck
      const bone = glow([0.92, 0.88, 0.76]), shade = glow([0.62, 0.58, 0.48]), disc = glow([0.6, 0.28, 0.26]);
      for (let k = 0; k < 15; k++) {
        const z = -0.26 + k * 0.037, s = 1.3 - k * 0.035, x = Math.sin(k * 0.35) * 0.025;
        fbox(b, fr, x, 0, z, 0.052 * s, 0.036 * s, 0.024, bone);
        fbox(b, fr, x, 0.034 * s, z - 0.004, 0.012, 0.035 * s, 0.03, shade);
        for (const sd of [-1, 1]) fbox(b, fr, x + sd * 0.04 * s, 0.014, z, 0.036 * s, 0.01, 0.01, shade);
        if (k < 14) fbox(b, fr, x, 0.006, z + 0.0185, 0.04 * s, 0.024 * s, 0.013, disc);
      }
    },
  },
  {
    id: "karen", title: "Karen François is haar badge weer kwijt", goal: "Zoek de badge van Karen François", item: "de badge van Karen François", short: "Badge van Karen",
    caller: "Karen François", voice: [1.3, 1.1],
    call: "Hoi, met Karen. Ik ben mijn badge weer kwijt, haha. Waar zou ze nu weer liggen? Waarschijnlijk in de VIP-bar.",
    done: "Karen heeft haar badge terug. Tot de volgende keer, Karen.", hint: (w) => `"Kben mijn badge weer kwijt, haha waar zou ze nu weer liggen" · ${w}`,
    place: "rooms", types: [RT.VIPBAR], fallback: [RT.CANTEEN, RT.LOUNGE], surface: "table",
    model: (b, fr) => {
      // a VRT badge in a pink sleeve, on a blue lanyard coiled beside it
      fbox(b, fr, 0, 0, 0, 0.056, 0.004, 0.09, glow([0.9, 0.9, 0.88]));
      fbox(b, fr, 0, 0.004, 0.025, 0.056, 0.001, 0.03, glow([1.15, 0.18, 0.48]));
      fbox(b, fr, 0, 0.004, -0.015, 0.03, 0.001, 0.036, glow([0.45, 0.45, 0.5]));
      for (let k = 0; k < 10; k++) {
        const a = k * 0.62;
        fbox(b, new Frame(...fr.p(0.07 + Math.cos(a) * 0.045, 0, 0.02 + Math.sin(a) * 0.045), fr.rot + a), 0, 0.001, 0, 0.012, 0.003, 0.035, glow([0.15, 0.3, 0.8]));
      }
    },
  },
  {
    id: "koffie", title: "De stagiair zoekt al sinds 2019 de koffiemachine", goal: "Zoek de koffiebeker van de stagiair", item: "de koffiebeker van de stagiair", short: "Koffiebeker",
    caller: "De stagiair", voice: [1.2, 1.0],
    call: "Euh, hallo? Met de stagiair. Ik zoek al sinds 2019 de koffiemachine, en nu ben ik ook mijn beker kwijt.",
    done: "De stagiair heeft zijn beker terug. Hij stond naast de koffiemachine. Nu nog een contract.", hint: (w) => `Hij zette hem neer om de weg te vragen, in ${w}`,
    place: "rooms", types: [RT.KOFFIE], fallback: [RT.MEETING, RT.OFFICE], surface: "table",
    model: (b, fr) => {
      fbox(b, fr, 0, 0, 0, 0.08, 0.1, 0.08, glow([0.85, 0.85, 0.82]));
      fbox(b, fr, 0, 0.1, 0, 0.068, 0.002, 0.068, sp(L.WHITE, [0.18, 0.1, 0.05]));
      fbox(b, fr, 0, 0.035, 0.0405, 0.08, 0.02, 0.001, glow([1.1, 0.2, 0.5]));
      fbox(b, fr, 0.05, 0.03, 0, 0.02, 0.05, 0.012, glow([0.85, 0.85, 0.82]));
    },
  },
];

// the three that aren't a thing on a table
const SPECIAL: Def[] = [
  {
    id: "jan", title: "Jan Becaus is weer kwijt", goal: "Vind Jan Becaus", item: "Jan Becaus",
    caller: "De nieuwsdienst", voice: [0.9, 1.0],
    call: "Hier de nieuwsdienst. Jan Becaus is weer op wandel in het gebouw. Vind hem voor het journaal begint. Hij blijft nooit lang op één plek.",
    done: "Jan Becaus is terecht. Hij wou gewoon nog eens langs de nieuwsdienst.",
  },
  {
    id: "felice", title: "Het spook van Felice dwaalt weer rond", goal: "Schuif alle stoelen onder de tafel", item: "de stoelen van Felice",
    caller: "Felice", voice: [1.4, 0.75],
    call: "Hoe-oe-oe. Hier Felice. De stoelen staan niet onder de tafel. Schuif ze aan, allemaal, of ik blijf rondspoken.",
    done: "Alle stoelen staan netjes. Felice kan weer rusten.",
  },
  {
    id: "kak", title: "Geen kak in de toiletten", goal: "Trek alle toiletten door", item: "de vuile toiletten",
    caller: "De poetsdienst", voice: [0.95, 1.15],
    call: "Poetsdienst hier. Er heeft weer iemand niet doorgetrokken. Trek alle toiletten door, en rap, voor er bezoek komt.",
    done: "Alles doorgetrokken. Het sanitair is weer presentabel.",
  },
];
const DEFS = new Map<string, Def>([...ITEMS, ...SPECIAL].map((d) => [d.id, d]));

// the jobs are placed around where the world starts (the same for everyone in it)
const ANCHOR_F = 0;
const EARSHOT = 45; // m: how far you hear a phone ring
export const PHONE_COL = "#3ddc84";
const QUEST_COL = "#ff2e7e";

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&${({ "&": "amp", "<": "lt", ">": "gt", '"': "quot" } as Record<string, string>)[c]};`);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface Phone {
  f: number;
  x: number;
  y: number;
  z: number;
  gx: number;
  gz: number;
  rot: number;
  label: string;
}

interface Toilet {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  flushed: boolean;
  k: number;
}

// a job in this world, as built here
interface Live {
  job: Job;
  def: Def;
  spot: Spot | null; // where the thing is (Jan: where he is now; the chairs, the toilets: their room)
  hint: () => string;
  // a job rings on one phone on every floor (the ones within a chunk of the start), each with its call light
  // (built when you come to that floor)
  rings: Map<number, { phone: Phone; lamp: THREE.Mesh } | null>;
  meshes: THREE.Mesh[]; // the rest of what it built (the table, the chairs)
  objs: Obj[];
  chairs: Chair[];
  toilets: Toilet[];
  ghost: THREE.Mesh | null;
  box: { f: number; box: [number, number, number, number] } | null;
  slot: number; // Jan: which of his walks he's on
}

// you, on a job: until when (on the quests' clock), and when you finished it (waiting for the room), 0 if not yet
interface Mine {
  j: number;
  until: number;
  limit: number;
  pending: number;
}

export class Quests {
  live = new Map<number, Live>();
  mine: Mine | null = null;
  pts = 0; // your money (it's your score: the room keeps it)
  wins = 0; // (this visit)
  top: Top[] = [];
  online = false;
  t = 0;
  running = false;
  prompt = "";
  root = new THREE.Group();
  toasts: HTMLElement;
  startedAt = 0;
  finished = false;
  onFinish: (secs: number) => void = () => {};
  // the room: send a job message (false if there's no line), who you are, what the others are called, a line in the feed
  send: (m: ToRoom) => boolean = () => false;
  me: () => string | null = () => null;
  nameOf: (id: string) => string = () => "Iemand";
  onFeed: (who: string, text: string) => void = () => {};
  onCall: (secs: number) => void = () => {}; // (you picked up: someone's talking for this long)
  private clock = 0; // the room's clock minus ours (ms)
  private cx0: number;
  private cz0: number;
  private phones = new Map<number, Phone[]>(); // the wall phones near the start, by floor
  private ghostMat = new THREE.MeshBasicMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
  private beepT = 0;
  private flyT = 0;
  private ringT = 0;
  private bigEl = document.getElementById("big")!;
  private subEl = document.getElementById("sub")!;
  private bigTimer = 0;
  private subTimer = 0;

  constructor(private world: World, private player: Player, private sound: Sound, anchor: { x: number; z: number }) {
    this.toasts = document.getElementById("toasts")!;
    this.cx0 = Math.floor(anchor.x / (CH * CELL));
    this.cz0 = Math.floor(anchor.z / (CH * CELL));
    // (the ground floor now, while loading; the others when you get there)
    this.phonesOn(ANCHOR_F);
  }

  // the wall phones on floor f, within a chunk of the start
  private phonesOn(f: number) {
    let out = this.phones.get(f);
    if (out) return out;
    out = [];
    if (f >= 0 && f < FLOOR_MAX)
      for (let cz = this.cz0 - 1; cz <= this.cz0 + 1; cz++)
        for (let cx = this.cx0 - 1; cx <= this.cx0 + 1; cx++)
          for (const pr of getFurnished(f, cx, cz).props)
            if (pr.t === "wallphone") out.push({ f, x: pr.x, y: pr.y, z: pr.z, gx: pr.gx, gz: pr.gz, rot: pr.rot, label: lc(cellLabel(f, pr.gx, pr.gz)) });
    this.phones.set(f, out);
    return out;
  }

  // a job's phone on floor f (the same one for everyone), with its light; null if there's none there
  // (two jobs can share a phone: picking up takes the oldest)
  private ringOn(l: Live, f: number) {
    if (!l.spot) return null;
    let r = l.rings.get(f);
    if (r !== undefined) return r;
    const list = this.phonesOn(f);
    r = null;
    if (list.length) {
      const phone = list[(l.job.ph + f * 7919) % list.length]!;
      const lamp = this.build(phone, (b, fr) => fbox(b, fr, 0.075, 0.06, 0.074, 0.035, 0.035, 0.012, glow([2.2, 0.15, 0.08])));
      lamp.visible = false;
      r = { phone, lamp };
    }
    l.rings.set(f, r);
    return r;
  }

  private now() {
    return Date.now() + this.clock;
  }

  // --- placement ------------------------------------------------------------

  // the job's number is its variant: every time the job comes back, the thing is somewhere else
  private placeItem(d: ItemDef, v: number): Spot | null {
    const { cx0, cz0 } = this;
    const rng = new Rng(hash(920, v, ...[...d.id].map((c) => c.charCodeAt(0))));
    const floors = floorsNear(ANCHOR_F);
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
    let c = d.only ? findRooms(d.types!, floors, cx0, cz0, 2, d.only) : [];
    if (!c.length) c = findRooms(d.types!, floors, cx0, cz0, 2);
    if (!c.length && d.fallback) c = findRooms(d.fallback, floors, cx0, cz0, 2);
    if (!c.length) c = findRooms(d.types!.concat(d.fallback ?? []), floors, cx0, cz0, 3);
    if (!c.length) return null;
    const { p, r } = rng.pick(c);
    const label = lc(roomLabel(p, r));
    // everything in the way in this chunk (and the room it has to be in)
    const solids = getFurnished(p.f, p.cx, p.cz).props.flatMap((pr) => propSolids(pr));
    const inRoomAt = (x: number, z: number) => {
      const lx = Math.floor(x / CELL) - p.cx * CH, lz = Math.floor(z / CELL) - p.cz * CH;
      if (lx < 0 || lz < 0 || lx >= CH || lz >= CH || p.room[idx(lx, lz)] !== r.id) return false;
      // not against a wall either
      const fx = x / CELL - Math.floor(x / CELL), fz = z / CELL - Math.floor(z / CELL), m = 0.35 / CELL;
      return (fx > m || p.room[idx(Math.max(0, lx - 1), lz)] === r.id) && (fx < 1 - m || p.room[idx(Math.min(CH - 1, lx + 1), lz)] === r.id) &&
        (fz > m || p.room[idx(lx, Math.max(0, lz - 1))] === r.id) && (fz < 1 - m || p.room[idx(lx, Math.min(CH - 1, lz + 1))] === r.id);
    };
    const free = (x: number, z: number) => {
      if (!inRoomAt(x, z)) return false;
      for (let k = 0; k < solids.length; k += 4)
        if (x > solids[k]! - 0.35 && x < solids[k + 2]! + 0.35 && z > solids[k + 1]! - 0.35 && z < solids[k + 3]! + 0.35) return false;
      return true;
    };
    // where you can actually walk in this room: a flood fill from its doors on a 20 cm grid
    const STEP = 0.2, bx0 = (p.cx * CH + r.x0) * CELL, bz0 = (p.cz * CH + r.z0) * CELL;
    const nx = Math.ceil(((r.x1 - r.x0 + 1) * CELL) / STEP), nz = Math.ceil(((r.z1 - r.z0 + 1) * CELL) / STEP);
    const walk = new Uint8Array(nx * nz);
    const queue: number[] = [];
    for (const i of r.cells)
      for (let dd = 0; dd < 4; dd++) {
        const sd = p.sides.get(i * 4 + dd);
        if (!sd?.door || !sd.door.open || sd.door.w <= 0) continue;
        const cxw = (p.cx * CH + (i % CH) + 0.5) * CELL + DX[dd]! * 0.9, czw = (p.cz * CH + ((i / CH) | 0) + 0.5) * CELL + DZ[dd]! * 0.9;
        const gi = Math.floor((cxw - bx0) / STEP), gj = Math.floor((czw - bz0) / STEP);
        if (gi >= 0 && gj >= 0 && gi < nx && gj < nz && !walk[gj * nx + gi] && free(bx0 + (gi + 0.5) * STEP, bz0 + (gj + 0.5) * STEP)) {
          walk[gj * nx + gi] = 1;
          queue.push(gi, gj);
        }
      }
    while (queue.length) {
      const gj = queue.pop()!, gi = queue.pop()!;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const a = gi + di, c = gj + dj;
        if (a < 0 || c < 0 || a >= nx || c >= nz || walk[c * nx + a]) continue;
        walk[c * nx + a] = 2; // tried
        if (!free(bx0 + (a + 0.5) * STEP, bz0 + (c + 0.5) * STEP)) continue;
        walk[c * nx + a] = 1;
        queue.push(a, c);
      }
    }
    // somewhere you can walk to within arm's reach of (x, z)
    const reachable = (x: number, z: number, y: number) => {
      // you pick things up from 1.8 m (eye to the object, 10 cm above where it lies)
      const dy = 1.62 - (y + 0.1), horiz = Math.sqrt(Math.max(0, 1.8 * 1.8 - dy * dy)) - 0.1;
      const i0 = Math.max(0, Math.floor((x - horiz - bx0) / STEP)), i1 = Math.min(nx - 1, Math.floor((x + horiz - bx0) / STEP));
      const j0 = Math.max(0, Math.floor((z - horiz - bz0) / STEP)), j1 = Math.min(nz - 1, Math.floor((z + horiz - bz0) / STEP));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++)
          if (walk[j * nx + i] === 1 && Math.hypot(bx0 + (i + 0.5) * STEP - x, bz0 + (j + 0.5) * STEP - z) <= horiz) return true;
      return false;
    };
    if (d.surface === "table") {
      const fur = getFurnished(p.f, p.cx, p.cz);
      const inRoom = (gx: number, gz: number) => p.room[idx(gx - p.cx * CH, gz - p.cz * CH)] === r.id;
      const tops: Record<string, [number, number, number]> = { ctable: [0.745, 0, 0.8], mtable: [0.76, 0, 0.6], desks: [0.735, 0.55, 0.5], editdesk: [0.74, 0.55, 0.6], newsdesk: [0.97, -0.1, 0.9], messtable: [0.75, 0, 0.35], sdesk: [1.09, 0.05, 0.9], radiodesk: [0.76, 0.3, 0.3], vipbar: [1.1, 1.42, 1.2], lounge: [0.36, 0, 0.35], koffiebar: [0.91, 0.56, 1.2], cocktail: [1.06, 0, 0.25], lowround: [0.75, 0, 0.2], bigtafel: [0.75, 0, 0.55] };
      // (a narrow VIP-bar has no counter)
      const tables = fur.props.filter((pr) => tops[pr.t] && inRoom(pr.gx, pr.gz) && !(pr.t === "vipbar" && pr.b));
      for (let tries = 0; tries < 24 && tables.length; tries++) {
        const t = rng.pick(tables);
        const [y, lz, span] = tops[t.t]!;
        const lx = rng.range(-span, span);
        const x = t.x + Math.cos(t.rot) * lx + Math.sin(t.rot) * lz, z = t.z - Math.sin(t.rot) * lx + Math.cos(t.rot) * lz;
        if (reachable(x, z, y)) return { f: p.f, x, z, y: p.f * H + y, gx: t.gx, gz: t.gz, rot: rng.range(0, 6.28), label };
      }
    }
    // on the floor, but never inside a piece of furniture or out of reach
    let s: Spot | null = null;
    for (let tries = 0; tries < 60; tries++) {
      const i = rng.pick(r.cells);
      const c = cellSpot(p.f, p.cx * CH + (i % CH), p.cz * CH + ((i / CH) | 0), label);
      if (free(c.x, c.z) && reachable(c.x, c.z, 0)) return c;
      s ??= c;
    }
    return s!;
  }

  private placeToilets(v: number) {
    const rng = new Rng(hash(915, v));
    const floors = floorsNear(ANCHOR_F);
    const withStalls = (p: Plan, r: Room) =>
      getFurnished(p.f, p.cx, p.cz).props.some((pr) => pr.t === "stalls" && p.room[idx(pr.gx - p.cx * CH, pr.gz - p.cz * CH)] === r.id);
    let c = findRooms([RT.BATH], floors, this.cx0, this.cz0, 2, withStalls);
    if (!c.length) c = findRooms([RT.BATH], floors, this.cx0, this.cz0, 3, withStalls);
    if (!c.length) return null;
    const { p, r } = rng.pick(c);
    const seats: { x: number; y: number; z: number }[] = [];
    for (const pr of getFurnished(p.f, p.cx, p.cz).props) {
      if (pr.t !== "stalls" || p.room[idx(pr.gx - p.cx * CH, pr.gz - p.cz * CH)] !== r.id) continue;
      const fr = new Frame(pr.x, pr.y, pr.z, pr.rot);
      for (const x of [-0.475, 0.475]) {
        const w = fr.p(x, 0.462, 0.28);
        seats.push({ x: w[0], y: w[1], z: w[2] });
      }
    }
    const m = roomCenter(p, r);
    const spot: Spot = { f: p.f, x: m.x, z: m.z, y: p.f * H, gx: Math.floor(m.x / CELL), gz: Math.floor(m.z / CELL), rot: 0, label: "sanitair" };
    return { spot, seats };
  }

  private placeChairs(v: number): Spot | null {
    const rng = new Rng(hash(913, v));
    const floors = floorsNear(ANCHOR_F);
    const noChair = (p: Plan, r: Room) => {
      if (r.x1 - r.x0 < 1 || r.z1 - r.z0 < 1 || roomAnomaly(p, r)) return false;
      const fur = getFurnished(p.f, p.cx, p.cz);
      return !fur.props.some((pr) => pr.t === "chair" && p.room[idx(pr.gx - p.cx * CH, pr.gz - p.cz * CH)] === r.id);
    };
    let c = findRooms([RT.EMPTY], floors, this.cx0, this.cz0, 2, noChair);
    if (!c.length) c = findRooms([RT.EMPTY], floors, this.cx0, this.cz0, 3, noChair);
    if (!c.length) return null;
    const { p, r } = rng.pick(c);
    const m = roomCenter(p, r);
    const w = r.x1 - r.x0 + 1, d = r.z1 - r.z0 + 1;
    return { f: p.f, x: m.x, z: m.z, y: p.f * H, gx: Math.floor(m.x / CELL), gz: Math.floor(m.z / CELL), rot: w >= d ? 0 : Math.PI / 2, label: "leeg lokaal" };
  }

  // where Jan is on one of his walks (everyone works it out the same way, from the job and the room's clock)
  private pickJanSpot(rng: Rng): Spot {
    for (let tries = 0; tries < 60; tries++) {
      const f = Math.max(0, Math.min(FLOOR_MAX - 1, ANCHOR_F + 1 + rng.int(-3, 3)));
      const cx = this.cx0 + rng.int(-2, 2), cz = this.cz0 + rng.int(-2, 2);
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
    const gx = this.cx0 * CH + CH / 2, gz = this.cz0 * CH + CH / 2;
    return { f: ANCHOR_F, x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL, y: ANCHOR_F * H, gx, gz, rot: 0, label: "gang" };
  }

  // --- objects ----------------------------------------------------------------

  // Geometry built around a local origin, lit as if it stood at the spot.
  private build(s: { f: number; x: number; y: number; z: number; gx: number; gz: number; rot: number }, fn: (b: Builder, fr: Frame) => void) {
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

  private unbuild(m: THREE.Mesh) {
    this.root.remove(m);
    m.geometry.dispose();
  }

  // a job came in: build what it needs, and find its phone
  private add(job: Job) {
    const def = DEFS.get(job.q);
    if (!def || this.live.has(job.j)) return; // (a job this version doesn't know)
    const l: Live = { job, def, spot: null, hint: () => "", rings: new Map(), meshes: [], objs: [], chairs: [], toilets: [], ghost: null, box: null, slot: -1 };
    this.live.set(job.j, l);
    const where = (s: Spot | null) => (s ? `${s.label}, ${floorName(s.f).toLowerCase()}` : "ergens in het gebouw");
    if (job.q === "jan") {
      l.hint = () => `Laatst gezien: ${where(l.spot)}. Hij blijft niet lang op één plek.`;
      this.moveJan(l);
    } else if (job.q === "felice") {
      const s = this.placeChairs(job.j);
      l.spot = s;
      l.hint = () => `${where(s)} · ${l.chairs.filter((c) => c.target === 1).length}/${l.chairs.length} stoelen`;
      if (s) this.buildChairs(l, s);
    } else if (job.q === "kak") {
      const loos = this.placeToilets(job.j);
      l.spot = loos?.spot ?? null;
      l.hint = () => `Iemand heeft niet doorgetrokken. ${where(l.spot)} · ${l.toilets.filter((t) => t.flushed).length}/${l.toilets.length}`;
      if (loos) this.buildToilets(l, loos.spot, loos.seats);
    } else {
      const d = ITEMS.find((x) => x.id === job.q)!;
      const s = this.placeItem(d, job.j);
      l.spot = s;
      l.hint = () => d.hint(where(s));
      if (s) this.addItem(l, s, d.short, d.model);
    }
  }

  private remove(l: Live, linger = 0) {
    this.live.delete(l.job.j);
    const all = [...l.meshes, ...l.objs.map((o) => o.mesh as THREE.Mesh), ...l.chairs.map((c) => c.mesh), ...l.toilets.map((t) => t.mesh)];
    for (const r of l.rings.values()) if (r) this.unbuild(r.lamp);
    if (l.ghost) this.root.remove(l.ghost);
    if (l.box) {
      const i = this.world.extraBoxes.indexOf(l.box);
      if (i >= 0) this.world.extraBoxes.splice(i, 1);
    }
    if (linger) setTimeout(() => all.forEach((m) => this.unbuild(m)), linger);
    else all.forEach((m) => this.unbuild(m));
  }

  private addItem(l: Live, s: Spot, label: string, fn: (b: Builder, fr: Frame) => void) {
    const mesh = this.build(s, fn);
    const obj: Obj = {
      quest: l.job.q, f: s.f, mesh, x: s.x, y: s.y + 0.1, z: s.z, label, alive: true,
      use: () => {
        obj.alive = false;
        this.finish(l);
      },
    };
    l.objs.push(obj);
  }

  // Jan moves on every JAN_EVERY_MS, counted from when the phone first rang
  private moveJan(l: Live) {
    const slot = Math.max(0, Math.floor((this.now() - l.job.at) / JAN_EVERY_MS));
    if (slot === l.slot) return;
    const first = l.slot < 0;
    l.slot = slot;
    for (const o of l.objs) this.unbuild(o.mesh as THREE.Mesh);
    l.objs = [];
    const s = this.pickJanSpot(new Rng(hash(901, l.job.j, slot)));
    l.spot = s;
    const mesh = this.build(s, (b, fr) => person(b, fr, [0.13, 0.15, 0.24], [0.9, 0.9, 0.88], [0.55, 0.08, 0.1], true));
    const obj: Obj = {
      quest: "jan", f: s.f, mesh, x: s.x, y: s.y + 1.2, z: s.z, label: "Jan Becaus", alive: true,
      use: () => {
        this.sound.say("Ah, goeiendag! Ik kwam gewoon nog eens kijken hoe het met het nieuws gaat.", 0.8, 0.95);
        obj.alive = false;
        this.finish(l);
      },
    };
    l.objs.push(obj);
    if (!first && this.mine?.j === l.job.j) this.toast("JAN BECAUS IS WEER OP WANDEL", `Gezien: ${s.label}, ${floorName(s.f).toLowerCase()}`);
  }

  private buildToilets(l: Live, s: Spot, seats: { x: number; y: number; z: number }[]) {
    const rng = new Rng(hash(916, l.job.j));
    seats.forEach((seat, i) => {
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
      const done = l.job.st.includes(i);
      l.toilets.push({ mesh, x: seat.x, y: seat.y, z: seat.z, flushed: done, k: done ? 1 : 0 });
    });
  }

  private buildChairs(l: Live, s: Spot) {
    const rng = new Rng(hash(914, l.job.j));
    // table
    l.meshes.push(this.build(s, (b, fr) => {
      fbox(b, fr, 0, 0.72, 0, 2.2, 0.04, 0.9, sp(L.WOOD_FLOOR, [0.8, 0.72, 0.62]));
      for (const x of [-1.0, 1.0]) for (const z of [-0.38, 0.38]) fbox(b, fr, x, 0, z, 0.05, 0.72, 0.05, sp(L.WHITE, [0.2, 0.2, 0.22]));
    }));
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const ext = (Math.abs(c) * 2.2 + Math.abs(sn) * 0.9) / 2, ezz = (Math.abs(sn) * 2.2 + Math.abs(c) * 0.9) / 2;
    l.box = { f: s.f, box: [s.x - ext, s.z - ezz, s.x + ext, s.z + ezz] };
    this.world.extraBoxes.push(l.box);
    const toWorld = (lx: number, lz: number) => new THREE.Vector3(s.x + lx * c + lz * sn, s.y, s.z - lx * sn + lz * c);
    for (const side of [1, -1])
      for (const lx of [-0.7, 0, 0.7]) {
        const toRot = s.rot + (side > 0 ? 0 : Math.PI);
        const to = toWorld(lx, side * 0.55);
        const from = toWorld(lx + rng.range(-0.25, 0.25), side * rng.range(1.05, 1.45));
        const fromRot = toRot + rng.range(-0.7, 0.7);
        const spot: Spot = { ...s, x: from.x, z: from.z, rot: fromRot };
        const mesh = this.build(spot, (b, fr) => chair(b, fr, 0, 0, 0));
        const done = l.job.st.includes(l.chairs.length) ? 1 : 0;
        const ch: Chair = { mesh, from, fromRot, to, toRot, k: done, target: done };
        l.chairs.push(ch);
        this.placeChair(ch);
      }
    const ghost = new Builder(new LightCtx(s.f, 0, 0, "outdoor"));
    person(ghost, new Frame(0, 0, 0, 0), [1, 1, 1], [1, 1, 1], [1, 1, 1], false);
    l.ghost = new THREE.Mesh(this.world.geometry(ghost.finish()), this.ghostMat);
    this.root.add(l.ghost);
  }

  private placeChair(ch: Chair) {
    const k = ch.k * ch.k * (3 - 2 * ch.k);
    ch.mesh.position.lerpVectors(ch.from, ch.to, k);
    ch.mesh.rotation.y = ch.fromRot + (ch.toRot - ch.fromRot) * k;
  }

  // --- the room -----------------------------------------------------------------

  receive(m: FromRoom) {
    switch (m.t) {
      case "jobs": {
        // (on joining, and again after every reconnect)
        this.clock = m.now - Date.now();
        const ids = new Set(m.jobs.map((x) => x.j));
        for (const l of [...this.live.values()]) if (!ids.has(l.job.j)) this.remove(l);
        for (const job of m.jobs) {
          const l = this.live.get(job.j);
          if (!l) this.add(job);
          else for (const i of job.st) this.step(l, i, false);
        }
        this.pts = m.pts;
        this.top = m.top;
        // a new line knows nothing of your job: tell it again
        if (this.mine && ids.has(this.mine.j)) this.send({ t: "up", j: this.mine.j });
        else if (this.mine) this.mine = null;
        this.reached();
        break;
      }
      case "ring":
        this.add(m.job);
        break;
      case "gone": {
        const l = this.live.get(m.j);
        if (!l) break;
        if (this.mine?.j === m.j) {
          this.mine = null;
          this.sound.wrong();
          this.big("OPGEHANGEN", "bad");
          this.toast("DE BELLER HEEFT INGEHAAKT", "Niemand was op tijd.", "bad");
        }
        this.remove(l);
        break;
      }
      case "up": {
        const l = this.live.get(m.j);
        if (l) this.onFeed(this.nameOf(m.id), `nam op voor ${l.def.caller}`);
        break;
      }
      case "top":
        this.top = m.top;
        break;
      case "rip":
        this.onFeed(this.nameOf(m.id), "is van de honger bezweken");
        break;
      case "st": {
        const l = this.live.get(m.j);
        if (l) this.step(l, m.i, false);
        break;
      }
      case "won": {
        this.top = m.top;
        const l = this.live.get(m.j);
        const me = m.id === this.me();
        if (me) {
          const secs = this.mine ? this.mine.limit - (this.mine.until - this.t) : 0;
          this.mine = null;
          this.pts = m.pts;
          this.wins++;
          this.sound.success();
          this.big("OPDRACHT GESLAAGD", "ok", `+€${m.pay}`);
          if (l) this.toast(l.def.caller.toUpperCase(), l.def.done, "ok");
          track("job_won", { job: m.q, seconds: Math.round(secs), pay: m.pay, total: m.pts });
          this.reached();
        } else {
          this.onFeed(m.n, `won ${l ? `voor ${l.def.caller}` : "een opdracht"} · +€${m.pay}`);
          if (this.mine?.j === m.j) {
            this.mine = null;
            this.sound.wrong();
            this.big("TE LAAT", "bad");
            this.toast("IEMAND WAS JE VOOR", `${esc(m.n)} was sneller.`, "bad");
            track("job_lost", { job: m.q });
          }
        }
        // (Jan stays a moment to finish his sentence)
        if (l) this.remove(l, me && l.job.q === "jan" ? 2500 : 0);
        break;
      }
    }
  }

  // the money reached: the floor gives way (once)
  private reached() {
    if (this.finished || this.pts < TARGET) return;
    this.finished = true;
    track("target_reached", { pts: this.pts, wins: this.wins });
    setTimeout(() => this.onFinish(this.t - this.startedAt), 2500);
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

  // the big letters in the middle, GTA style
  big(text: string, kind: "ok" | "bad" | "new", sub = "") {
    const el = this.bigEl;
    el.className = kind;
    el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ""}`;
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(this.bigTimer);
    this.bigTimer = window.setTimeout(() => el.classList.remove("show"), 3200);
  }

  // what the caller says, under the picture (for when there's no sound, or no Dutch voice)
  private subtitle(who: string, text: string) {
    const el = this.subEl;
    el.innerHTML = `<b>${esc(who)}</b>${esc(text)}`;
    el.classList.add("show");
    clearTimeout(this.subTimer);
    this.subTimer = window.setTimeout(() => el.classList.remove("show"), this.talkSecs(text) * 1000);
  }

  // how long someone takes to say this (about)
  private talkSecs(text: string) {
    return 4 + text.length * 0.055;
  }

  // you answer the phone: the caller tells you what's up, and the clock starts
  private pickUp(l: Live, p: Phone) {
    if (!this.send({ t: "up", j: l.job.j })) {
      this.sound.wrong();
      return this.toast("GEEN VERBINDING", "De lijn is dood.", "bad");
    }
    const s = l.spot!;
    // walking there and back to the stairs, a floor at a time, and some looking around
    const limit = Math.round(60 + (Math.abs(s.x - p.x) + Math.abs(s.z - p.z)) / 1.8 + Math.abs(s.f - p.f) * 25 + (l.job.q === "jan" ? 30 : 0) + (l.chairs.length + l.toilets.length) * 6);
    this.mine = { j: l.job.j, until: this.t + limit, limit, pending: 0 };
    this.sound.pickup();
    this.onCall(this.talkSecs(l.def.call));
    this.sound.say(l.def.call, l.def.voice[0], l.def.voice[1], true);
    this.subtitle(l.def.caller, l.def.call);
    this.big(l.def.title.toUpperCase(), "new");
    track("job_picked_up", { job: l.job.q, limit });
  }

  // you did it: tell the room, and wait for its answer (someone may have been quicker)
  private finish(l: Live) {
    if (this.mine?.j !== l.job.j || this.mine.pending) return;
    this.mine.pending = this.t;
    if (!this.send({ t: "dn", j: l.job.j })) this.fail("Geen verbinding.");
  }

  private fail(why: string) {
    const m = this.mine;
    if (!m) return;
    this.mine = null;
    this.send({ t: "dr" });
    const l = this.live.get(m.j);
    if (l) for (const o of l.objs) o.alive = true;
    this.sound.wrong();
    this.big("OPDRACHT MISLUKT", "bad");
    this.toast("OPDRACHT MISLUKT", why, "bad");
    track("job_failed", { job: l?.job.q ?? "?", why });
  }

  // off the job without finishing it (a warp)
  forfeit(why: string) {
    if (this.mine) this.fail(why);
  }

  // off the job without a word (you dropped dead: the room already knows)
  drop() {
    const l = this.mine && this.live.get(this.mine.j);
    if (l) for (const o of l.objs) o.alive = true;
    this.mine = null;
  }

  private wrong(l: Live) {
    track("quest_wrong_item", { item_of: l.job.q, on_job: this.mine ? 1 : 0 });
    this.sound.wrong();
    this.toast("TELT NIET", this.mine ? "Dit hoort bij een andere opdracht." : "Neem eerst de telefoon op.", "bad");
  }

  // a chair pushed in, a toilet flushed (by you, or by someone else on the job)
  private step(l: Live, i: number, mine: boolean) {
    if (l.job.q === "felice") {
      const ch = l.chairs[i];
      if (!ch || ch.target === 1) return;
      ch.target = 1;
      if (mine || ch.mesh.position.distanceTo(this.player.pos) < 12) this.sound.scrape();
    } else if (l.job.q === "kak") {
      const t = l.toilets[i];
      if (!t || t.flushed) return;
      t.flushed = true;
      if (mine || Math.hypot(t.x - this.player.pos.x, t.z - this.player.pos.z) < 12) this.sound.flush();
    } else return;
    if (!l.job.st.includes(i)) l.job.st.push(i);
    if (!mine) return;
    this.send({ t: "st", j: l.job.j, i });
    if (l.chairs.every((c) => c.target === 1) && l.toilets.every((t) => t.flushed)) this.finish(l);
  }

  // the phones ringing on your floor, for the HUD and the maps
  ringing() {
    const now = this.now(), f = this.player.floor, out: { x: number; z: number; f: number; label: string }[] = [];
    for (const l of this.live.values()) {
      const r = now >= l.job.at && this.ringOn(l, f);
      if (r) out.push({ x: r.phone.x, z: r.phone.z, f, label: l.def.caller });
    }
    return out;
  }

  activeTarget() {
    const l = this.mine && this.live.get(this.mine.j);
    return l?.spot ?? null;
  }

  // what goes on the plattegrond: your job, or the phones
  pins() {
    const t = this.activeTarget();
    if (t) return [{ ...t, col: QUEST_COL, label: "OPDRACHT" }];
    return this.ringing().map((r) => ({ ...r, col: PHONE_COL, label: "", icon: "phone" as const }));
  }

  // and on the minimap
  marks() {
    const t = this.activeTarget();
    if (t) return [{ ...t, col: QUEST_COL }];
    return this.ringing().map((r) => ({ ...r, col: PHONE_COL, icon: "phone" as const }));
  }

  // the nearest phone ringing on your floor (for the warp menu)
  nearestPhone(x: number, z: number) {
    let best: { x: number; z: number; f: number } | null = null, bd = Infinity;
    for (const r of this.ringing()) {
      const d = Math.hypot(r.x - x, r.z - z);
      if (d < bd) [bd, best] = [d, r];
    }
    return best;
  }

  update(dt: number, interact: boolean): boolean {
    this.t += dt;
    const P = this.player;
    const pf = P.floor;
    const now = this.now();
    let consumed = false;
    const ready = (f: number, x: number, z: number) => this.world.isReady(f, Math.floor(x / (CH * CELL)), Math.floor(z / (CH * CELL)));

    // out of time, or no answer from the room
    const mine = this.mine;
    if (mine?.pending && this.t - mine.pending > 6) this.fail("Geen antwoord van het gebouw.");
    else if (mine && !mine.pending && this.t > mine.until) this.fail("De tijd is om.");

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

    let ring: { d: number; x: number; z: number } | null = null;
    for (const l of this.live.values()) {
      const onIt = this.mine?.j === l.job.j && !this.mine.pending;
      // the phone on your floor: rings until someone wins the job (the ones on the other floors are dark)
      for (const [f, r] of l.rings) if (r && f !== pf) r.lamp.visible = false;
      const rg = this.ringOn(l, pf);
      if (rg) {
        const ph = rg.phone, ringing = now >= l.job.at;
        rg.lamp.visible = ringing && Math.floor(this.t * 4) % 2 === 0 && ready(ph.f, ph.x, ph.z);
        if (ringing && this.mine?.j !== l.job.j) {
          const d = Math.hypot(ph.x - P.pos.x, ph.z - P.pos.z);
          if (!ring || d < ring.d) ring = { d, x: ph.x, z: ph.z };
          const hx = ph.x + Math.sin(ph.rot) * 0.1, hz = ph.z + Math.cos(ph.rot) * 0.1;
          if (!this.mine) consider(hx, ph.y - 0.02, hz, ph.f, `E · Opnemen: ${l.def.caller}`, () => this.pickUp(l, ph));
          else consider(hx, ph.y - 0.02, hz, ph.f, "Je bent al met een opdracht bezig", () => this.sound.wrong());
        }
      }
      // Jan walks on (the same for everyone), and turns to look at you
      if (l.job.q === "jan") {
        this.moveJan(l);
        const j = l.objs[0], s = l.spot;
        if (j && s && s.f === pf && Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < 14) {
          const a = Math.atan2(P.pos.x - s.x, P.pos.z - s.z);
          let d = a - j.mesh.rotation.y;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          j.mesh.rotation.y += d * Math.min(1, dt * 2);
        }
      }
      for (const o of l.objs) {
        o.mesh.visible = o.alive && ready(o.f, o.x, o.z);
        if (!o.alive) continue;
        consider(o.x, o.y, o.z, o.f, onIt ? `E · ${o.quest === "jan" ? "Aanspreken" : "Oprapen"}: ${o.label}` : `E · ${o.label}`, () => (onIt ? o.use() : this.wrong(l)), o.quest === "jan" ? 2.4 : 1.8);
      }
      // Felice's ghost drifts around the table
      const cs = l.spot;
      if (l.ghost && cs) {
        const vis = pf === cs.f && ready(cs.f, cs.x, cs.z);
        l.ghost.visible = vis;
        if (vis) {
          const a = this.t * 0.25;
          l.ghost.position.set(cs.x + Math.cos(a) * 2.2, cs.y + 0.1 + Math.sin(this.t * 1.3) * 0.08, cs.z + Math.sin(a) * 2.2);
          l.ghost.rotation.y = -a;
          this.ghostMat.opacity = 0.1 + 0.08 * Math.max(0, Math.sin(this.t * 2.3) * Math.sin(this.t * 0.7 + 1)) + (Math.random() < 0.02 ? 0.1 : 0);
        }
      }
      for (const m of l.meshes) m.visible = !!cs && ready(cs.f, cs.x, cs.z);
      l.chairs.forEach((ch, i) => {
        ch.mesh.visible = !!cs && ready(cs.f, cs.x, cs.z);
        if (ch.k !== ch.target) {
          ch.k += Math.sign(ch.target - ch.k) * Math.min(Math.abs(ch.target - ch.k), dt * 1.8);
          this.placeChair(ch);
        }
        if (ch.target === 1 || !cs) return;
        const p = ch.mesh.position;
        consider(p.x, p.y + 0.5, p.z, cs.f, onIt ? "E · Stoel aanschuiven" : "E · Stoel", () => (onIt ? this.step(l, i, true) : this.wrong(l)));
      });
      if (l.toilets.length && cs) {
        const vis = ready(cs.f, cs.x, cs.z);
        let near = 99;
        l.toilets.forEach((t, i) => {
          t.mesh.visible = vis && t.k < 1;
          if (t.flushed) {
            if (t.k < 1) {
              t.k = Math.min(1, t.k + dt * 0.6);
              t.mesh.scale.setScalar(Math.max(0.01, 1 - t.k));
              t.mesh.rotation.y += dt * 8;
            }
            return;
          }
          if (cs.f === pf) near = Math.min(near, Math.hypot(t.x - P.pos.x, t.z - P.pos.z));
          consider(t.x, t.y, t.z, cs.f, onIt ? "E · Doortrekken" : "E · Toilet", () => (onIt ? this.step(l, i, true) : this.wrong(l)), 2.5);
        });
        // flies
        this.flyT -= dt;
        if (near < 5 && this.flyT <= 0) {
          this.flyT = 1.5 + Math.random() * 3;
          this.sound.fly(1 - near / 5);
        }
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

    // the nearest ringing phone: louder as you come closer, from the side it's on
    this.ringT -= dt;
    const rg = ring as { d: number; x: number; z: number } | null;
    if (rg && this.running && rg.d < EARSHOT && this.ringT <= 0) {
      this.ringT = 3;
      const dx = rg.x - P.pos.x, dz = rg.z - P.pos.z, len = Math.max(0.01, Math.hypot(dx, dz));
      const pan = Math.max(-0.8, Math.min(0.8, (dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw)) / len));
      this.sound.ring(0.15 + 0.85 * (1 - rg.d / EARSHOT) ** 2, pan);
    }

    // signal meter + beeps for your job
    const tgt = this.activeTarget();
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
    this.renderHud(bars);
    return consumed;
  }

  private hudKey = "";
  private renderHud(bars: number) {
    const box = document.getElementById("quest")!;
    if (!this.running) {
      box.style.display = "none";
      return;
    }
    const P = this.player;
    const l = this.mine ? this.live.get(this.mine.j) : undefined;
    const left = this.mine ? Math.max(0, Math.ceil(this.mine.until - this.t)) : 0;
    const phones = l ? [] : this.ringing().map((r) => ({ ...r, d: Math.round(Math.hypot(r.x - P.pos.x, r.z - P.pos.z)) }));
    const key = `${this.online}|${this.mine?.j}|${this.mine?.pending}|${left}|${bars}|${l?.hint()}|${phones.map((p) => `${p.label}${p.d}`).join()}|${this.top.map((s) => s.n + s.pts).join()}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    box.style.display = "";
    const sig = Array.from({ length: 5 }, (_, i) => `<i class="${i < bars ? "on" : ""}"></i>`).join("");
    let head: string;
    if (l)
      head = `<div class="qa"><div class="qt">${l.def.goal}</div><div class="qh">${l.hint()}</div><div class="sig">SIGNAAL ${sig}</div>` +
        `<div class="clock${left <= 15 ? " low" : ""}">${this.mine!.pending ? "…" : mmss(left)}</div></div>`;
    else if (!this.online) head = `<div class="qa"><div class="qt">Geen verbinding</div><div class="qh">De telefoons zijn stil.</div></div>`;
    else if (phones.length)
      head = `<div class="qa ph"><ul>${phones
        .map((p) => `<li>☎ ${p.label} · ${p.d} m</li>`)
        .join("")}</ul></div>`;
    else head = `<div class="qa"><div class="qt">Even geen telefoon</div><div class="qh">Er belt zo meteen iemand.</div></div>`;
    box.innerHTML = head + (this.top.length ? `<ol class="top">${this.top.slice(0, 3).map((s) => `<li>${esc(s.n)} · €${s.pts}</li>`).join("")}</ol>` : "");
  }

  private resumeAt = 0;
  // continuing a saved game: the clock picks up where it was
  restore(elapsed: number) {
    this.resumeAt = Math.max(0, elapsed);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startedAt = this.t - this.resumeAt;
  }
}
