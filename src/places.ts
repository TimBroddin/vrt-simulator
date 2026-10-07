// Plekken: the places worth finding. Walk into one and it's yours; the list is
// kept in the browser across worlds (they're in every building), so you collect
// them over many visits.
import { CEIL, CELL, CH, FLOOR_MAX, FLOOR_MIN, H, MID_CZ } from "./config";
import { K, RT, getPlan, mazeAt, radioStation, roomAnomaly, setIsThuis, towerSpec, type Plan, type Room } from "./layout";
import { STATIONS } from "./stations";

export const PLACES: { id: string; name: string }[] = [
  { id: "middengang", name: "De middengang" },
  { id: "rtbf", name: "De RTBF" },
  { id: "dak", name: "Het dak" },
  { id: "parking", name: "De parking" },
  { id: "gangparking", name: "De gang naar de parking" },
  { id: "gangnergens", name: "De gang naar nergens" },
  { id: "parkeertoren", name: "De parkeertoren" },
  { id: "plantentuin", name: "Een plantentuin" },
  { id: "atrium", name: "Een atrium" },
  { id: "sporthal", name: "De sporthal" },
  { id: "mess", name: "De Mess" },
  { id: "rekwisieten", name: "De rekwisieten" },
  { id: "decorstraat", name: "De decorstraat" },
  { id: "studio5", name: "Studio 5" },
  { id: "studio3", name: "Studio 3" },
  { id: "marconi", name: "Studio Marconi" },
  { id: "toots", name: "Studio Toots" },
  { id: "toren", name: "De Toren" },
  { id: "torentop", name: "Boven op De Toren" },
  { id: "bos", name: "Het VRT-bos" },
  { id: "bareel", name: "De bareel" },
  { id: "meiser", name: "Station Meiser" },
  { id: "nieuwsstudio", name: "Een nieuwsstudio" },
  { id: "journaal", name: "De journaalstudio" },
  { id: "weer", name: "De weerstudio" },
  { id: "ketnet", name: "De Ketnet-studio" },
  { id: "sporza", name: "De Sporza-studio" },
  { id: "thuis", name: "Het decor van Thuis" },
  { id: "kampioenen", name: "Het decor van De Kampioenen" },
  ...STATIONS.map((st) => ({ id: `radio-${st.logo}`, name: `De studio van ${st.name}` })),
  { id: "regie", name: "Een regie" },
  { id: "bewaking", name: "De bewaking" },
  { id: "archief", name: "Het archief" },
  { id: "doorgang", name: "De camping" },
  { id: "kantine", name: "Een kantine" },
  { id: "koffiekamer", name: "De koffiekamer" },
  { id: "dpc", name: "Het DPC" },
  { id: "douches", name: "De douches" },
  { id: "fietsen", name: "De fietsenstalling" },
  { id: "vossenhol", name: "Het vossenhol" },
  { id: "perszaal", name: "De perszaal" },
  { id: "creativelab", name: "Het oude creative lab" },
  { id: "tiktak", name: "Het Tiktak-huis" },
  { id: "kostuums", name: "De kostuumdienst" },
  { id: "kleedkamer", name: "Een kleedkamer" },
  { id: "vipbar", name: "De VIP-bar" },
  { id: "viprestaurant", name: "Het VIP-restaurant" },
  { id: "ceo", name: "Het kabinet van de CEO" },
  { id: "laadperron", name: "Het laadperron" },
  { id: "pool", name: "De pooltafel" },
  { id: "poppen", name: "De kamer vol poppen" },
  { id: "stoelen", name: "De kamer vol stoelen" },
  { id: "onderwater", name: "Een kamer onder water" },
  { id: "plafond", name: "Een kantoor op het plafond" },
  { id: "trap", name: "Een trap naar het plafond" },
];

const ROOMS: Partial<Record<number, string>> = {
  [RT.MESS]: "mess", [RT.STUDIO]: "nieuwsstudio", [RT.KETNET]: "ketnet", [RT.SPORZA]: "sporza", [RT.TOOTS]: "toots",
  [RT.REGIE]: "regie", [RT.SECURITY]: "bewaking", [RT.ARCHIVE]: "archief", [RT.CANTEEN]: "kantine", [RT.KOFFIE]: "koffiekamer", [RT.DPC]: "dpc", [RT.COSTUME]: "kostuums",
  [RT.DRESSING]: "kleedkamer", [RT.VIPBAR]: "vipbar", [RT.VIPRESTO]: "viprestaurant", [RT.CEO]: "ceo", [RT.DOCK]: "laadperron", [RT.LOUNGE]: "pool", [RT.PASSAGE]: "doorgang",
  [RT.JOURNAAL]: "journaal", [RT.WEER]: "weer", [RT.SHOWER]: "douches", [RT.BIKES]: "fietsen", [RT.VOS]: "vossenhol",
  [RT.PERS]: "perszaal", [RT.LAB]: "creativelab", [RT.TIKTAK]: "tiktak",
};
const ODD: Record<string, string> = { poppen: "poppen", chairs: "stoelen", flooded: "onderwater", upside: "plafond", stairs: "trap" };

// Which place is here (feet at y), if any.
export function placeAt(f: number, x: number, z: number, y: number): string | null {
  const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
  const cx = Math.floor(gx / CH), cz = Math.floor(gz / CH);
  const p = getPlan(f, cx, cz), i = (gz - cz * CH) * CH + (gx - cx * CH), k = p.kind[i];
  const st = p.st, a = st.atrium;
  const t = towerSpec(st, H, CEIL);
  if (t && y > t.y0 + t.deck - 0.5 && Math.hypot(x - t.x, z - t.z) < t.rDeck + 0.3) return "torentop";
  if (k === K.ROOF) return "dak";
  const maze = mazeAt(f, st);
  if (k === K.CORR && maze) return maze.parking ? "gangparking" : "gangnergens";
  if (st.mid && k === K.CORR) return "middengang";
  if (st.special === "park") return "parkeertoren";
  if (f === FLOOR_MIN && k === K.GARAGE) return "parking";
  if (a && f >= a.f0 && f <= a.f1 && (p.zone[i] === 1 || p.zone[i] === 2)) {
    if (a.kind === "decor") {
      const lx = i % CH;
      return lx <= 4 ? "studio5" : lx >= 7 ? "studio3" : "decorstraat";
    }
    const m: Record<string, string> = { hall: "sporthal", props: "rekwisieten", marconi: "marconi", tower: "toren", bos: "bos", bareel: "bareel", meiser: "meiser", garden: "plantentuin", lobby: "atrium" };
    return m[a.kind] ?? null;
  }
  if (k === K.ROOM) {
    const id = roomPlace(p, p.rooms[p.room[i]!]!);
    if (id) return id;
  }
  if (cz < MID_CZ && f > FLOOR_MIN && f < FLOOR_MAX) return "rtbf";
  return null;
}

// Which place a room is, if any.
export function roomPlace(p: Plan, r: Room): string | null {
  const an = roomAnomaly(p, r);
  if (an && ODD[an]) return ODD[an]!;
  if (r.type === RT.SET) return setIsThuis(p, r) ? "thuis" : "kampioenen";
  if (r.type === RT.RADIO) return `radio-${STATIONS[radioStation(p, r)]!.logo}`;
  return ROOMS[r.type] ?? null;
}

const KEY = "vrt-plekken";

export class Places {
  found: Set<string>;
  onFound: (id: string, name: string) => void = () => {};
  constructor() {
    let saved: string[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    } catch {}
    this.found = new Set(saved.filter((id) => PLACES.some((p) => p.id === id)));
  }
  visit(id: string | null) {
    if (!id || this.found.has(id)) return;
    this.found.add(id);
    localStorage.setItem(KEY, JSON.stringify([...this.found]));
    this.onFound(id, PLACES.find((p) => p.id === id)?.name ?? id);
  }
  get count() {
    return `${this.found.size}/${PLACES.length}`;
  }
  // the list for the pause screen: found ones named, the rest blanked out
  render(el: HTMLElement) {
    el.innerHTML =
      `<div class="pl-head">PLEKKEN <b>${this.count}</b> ontdekt</div><ul>` +
      PLACES.map((p) => (this.found.has(p.id) ? `<li class="on">${p.name}</li>` : `<li>${p.name.replace(/[^\s]/g, "·")}</li>`)).join("") +
      "</ul>";
  }
}
