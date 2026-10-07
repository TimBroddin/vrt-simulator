// Hunger: your health drops while you play (twice as fast when you run), and
// the food in the building brings it back, for money. Your money is your score,
// kept by the room, so every broodje puts the end a little further away. One
// dagschotel in three makes you sick, and so can stuffing yourself: your health
// goes fast until you find a toilet. At zero you're dead: the room takes half your money for the ambulance,
// and you wake up at the entrance.
import { CELL, CH } from "./config";
import { Frame } from "./builder";
import { getFurnished, type Prop } from "./furnish";
import { FOOD, tooFull } from "./jobs";
import { track } from "./analytics";
import type { FromRoom, ToRoom } from "./protocol";
import type { Player } from "./player";
import type { Sound } from "./audio";

const EMPTY_S = 12 * 60; // seconds of walking from full to nothing
const SICK_EMPTY_S = 65; // and while you're sick
const SICK_ODDS = 1 / 3; // a dagschotel that goes wrong
const STUFFED_ODDS = 1 / 2; // eating on a full stomach (water never hurts)
const SICK_AFTER = 8; // s: it takes a moment to sink in
const WATER_EVERY = 60; // s: the cooler's free, but only so often
const LOW = 30, FAINT = 10;
export const TOILET_COL = "#c9a26b"; // (the nearest toilet on the minimap, when you're sick)

interface Spot {
  food: string; // (or "toilet")
  f: number;
  x: number;
  y: number;
  z: number;
}

// what's sold at which prop (for the icons on the maps)
export const PROP_FOOD: Record<string, string> = { cooler: "water", vending: "snoep", koffiebar: "koffie", kcounter: "broodje", counter: "dagschotel" };

// where you buy what, in front of each prop (local: x along it, y up, z out from it)
function spotsOf(pr: Prop, f: number): Spot[] {
  const fr = new Frame(pr.x, pr.y, pr.z, pr.rot);
  const at = (food: string, pts: [number, number, number][]) =>
    pts.map(([x, y, z]) => {
      const p = fr.p(x, y, z);
      return { food, f, x: p[0], y: p[1], z: p[2] };
    });
  switch (pr.t) {
    case "cooler":
      return at("water", [[0, 1.0, 0.36]]);
    case "vending":
      return at("snoep", [[0, 1.1, 0.85]]);
    case "koffiebar":
      return at("koffie", [[-0.9, 1.2, 0.6], [0, 1.2, 0.6], [0.9, 1.2, 0.6]]);
    case "kcounter": {
      const len = pr.a / 100, out: [number, number, number][] = [];
      for (let x = -len / 2 + 0.5; x <= len / 2 - 0.5; x += 1) out.push([x, 1.0, 0.4]);
      return at("broodje", out);
    }
    case "counter":
      return at("dagschotel", [[-1, 1.0, 0.85], [0, 1.0, 0.85], [1, 1.0, 0.85]]);
    case "stalls":
      return at("toilet", [[-0.475, 0.462, 0.28], [0.475, 0.462, 0.28]]);
  }
  return [];
}

export class Food {
  hp: number;
  sick: boolean;
  cause: "dagschotel" | "vol" = "dagschotel"; // (what made you sick)
  prompt = "";
  dead = false; // (from the moment you drop until you wake up)
  // the room: send a message (false if there's no line), your money now, the money changed, you died
  send: (m: ToRoom) => boolean = () => false;
  money: () => number = () => 0;
  onMoney: (pts: number) => void = () => {};
  onDeath: () => void = () => {};
  toast: (title: string, body?: string, kind?: string) => void = () => {};
  big: (text: string, kind: "ok" | "bad" | "new", sub?: string) => void = () => {};
  private spots: Spot[] = [];
  private spotsKey = "";
  private pending: { food: string; at: number } | null = null; // waiting for the till
  private waterAt = -Infinity;
  private warned = 0; // 1: hungry, 2: about to faint
  private growlT = 0;
  private sickAt = 0; // (it's on its way)
  private t = 0;

  constructor(private player: Player, private sound: Sound, hp: number, sick: boolean) {
    this.hp = Math.max(1, Math.min(100, hp));
    this.sick = sick;
    this.warned = this.hp < FAINT ? 2 : this.hp < LOW ? 1 : 0;
  }

  // playing: the clock runs (not paused, not in a menu, not falling into the hall)
  update(dt: number, interact: boolean, playing: boolean): boolean {
    this.t += dt;
    const P = this.player;
    if (this.pending && this.t - this.pending.at > 5) this.pending = null;

    if (playing && !this.dead) {
      if (this.sickAt && this.t >= this.sickAt) {
        this.sickAt = 0;
        this.sick = true;
        this.toast("OEI", this.cause === "vol" ? "Dat was er één te veel…" : "Die dagschotel…", "bad");
        this.big("JE BENT ZIEK", "bad", "ZOEK EEN TOILET");
        this.sound.growl();
        track("got_sick", { hp: Math.round(this.hp), cause: this.cause });
      }
      const run = P.running && P.speed > 2.5 ? 2 : 1;
      this.hp = Math.max(0, this.hp - (100 / (this.sick ? SICK_EMPTY_S : EMPTY_S)) * run * dt);
      // (being sick, you know what to do)
      if (this.hp < LOW && this.warned < 1 && !this.sick) {
        this.warned = 1;
        this.toast("JE HEBT HONGER", "Zoek iets te eten: een automaat, de koffiekamer, De Mess.", "bad");
        this.sound.growl();
        track("hunger_warning", { hp: LOW });
      }
      if (this.hp < FAINT && this.warned < 2 && !this.sick) {
        this.warned = 2;
        this.toast("JE VALT BIJNA FLAUW", "Eten. Nu.", "bad");
        track("hunger_warning", { hp: FAINT });
      }
      if ((this.sick || this.hp < LOW) && (this.growlT -= dt) <= 0) {
        this.growlT = this.sick ? 4 + Math.random() * 3 : 15 + this.hp;
        this.sound.growl();
      }
      if (this.hp <= 0) {
        this.dead = true;
        this.pending = null;
        this.send({ t: "dood" });
        track("died", { money: this.money() });
        this.onDeath();
      }
    }

    // the food around you (the chunks you're in and next to, on your floor)
    const f = P.floor, cx = Math.floor(P.pos.x / (CH * CELL)), cz = Math.floor(P.pos.z / (CH * CELL));
    const key = `${f}:${cx},${cz}`;
    if (key !== this.spotsKey) {
      this.spotsKey = key;
      this.spots = [];
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) for (const pr of getFurnished(f, cx + dx, cz + dz).props) this.spots.push(...spotsOf(pr, f));
    }

    this.prompt = "";
    if (this.dead) return false;
    const eyeY = P.pos.y + 1.6, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    let best: Spot | null = null, bd = Infinity;
    for (const s of this.spots) {
      // (the toilets only matter when you need one)
      if (s.food === "toilet" && !this.sick) continue;
      const dx = s.x - P.pos.x, dz = s.z - P.pos.z;
      const d = Math.hypot(dx, s.y - eyeY, dz);
      if (d > (s.food === "toilet" ? 2.5 : 1.8) || d > bd) continue;
      if ((dx * fx + dz * fz) / Math.max(0.01, Math.hypot(dx, dz)) < 0.35 && d > 0.7) continue;
      bd = d;
      best = s;
    }
    if (!best) return false;
    if (best.food === "toilet") {
      this.prompt = "E · Naar het toilet";
      if (!interact) return false;
      this.relief();
      return true;
    }
    const it = FOOD[best.food]!;
    // (you can always eat; on a full stomach, you're warned)
    const full = it.price && tooFull(this.hp, best.food) ? " · je zit al vol" : "";
    this.prompt = `E · ${it.name} (${it.price ? `€${it.price}` : "gratis"})${full}`;
    if (!interact) return false;
    this.buy(best.food);
    return true;
  }

  private buy(food: string) {
    const it = FOOD[food]!;
    if (this.pending) return;
    if (!it.price) {
      if (this.t - this.waterAt < WATER_EVERY) return this.toast("GEEN DORST", "Straks nog eens.");
      this.waterAt = this.t;
      return this.eat(food);
    }
    if (this.money() < it.price) {
      this.sound.wrong();
      return this.toast("TE WEINIG GELD", `${it.name}: €${it.price}. Doe eerst een opdracht.`, "bad");
    }
    if (!this.send({ t: "buy", f: food })) {
      this.sound.wrong();
      return this.toast("GEEN VERBINDING", "De kassa werkt niet.", "bad");
    }
    this.pending = { food, at: this.t };
  }

  private eat(food: string) {
    const it = FOOD[food]!;
    const was = this.hp, stuffed = !!it.price && tooFull(was, food);
    this.hp = Math.min(100, this.hp + it.hp);
    this.warned = this.hp < FAINT ? 2 : this.hp < LOW ? 1 : 0;
    this.sound.eat();
    this.toast(it.name.toUpperCase(), `+${Math.round(this.hp - was)} gezondheid${it.price ? ` · −€${it.price}` : ""}`, "ok");
    track("food_bought", { food, price: it.price, hp: Math.round(this.hp) });
    if (this.sick || this.sickAt) return;
    if (food === "dagschotel" && Math.random() < SICK_ODDS) this.cause = "dagschotel";
    else if (stuffed && Math.random() < STUFFED_ODDS) this.cause = "vol";
    else return;
    this.sickAt = this.t + SICK_AFTER;
  }

  // a toilet, at last
  private relief() {
    this.sick = false;
    this.sound.flush();
    this.toast("OPGELUCHT", "Je voelt je al een stuk beter.", "ok");
    track("toilet_relief", { hp: Math.round(this.hp) });
  }

  // the nearest toilet on your floor, for the minimap (only when you need one)
  toilet() {
    if (!this.sick) return null;
    const P = this.player;
    let best: Spot | null = null, bd = Infinity;
    for (const s of this.spots) {
      if (s.food !== "toilet") continue;
      const d = Math.hypot(s.x - P.pos.x, s.z - P.pos.z);
      if (d < bd) [bd, best] = [d, s];
    }
    return best;
  }

  // what the room says about your money
  receive(m: FromRoom) {
    if (m.t === "paid") {
      this.pending = null;
      this.onMoney(m.pts);
      this.eat(m.f);
    } else if (m.t === "broke") {
      this.pending = null;
      this.onMoney(m.pts);
      this.sound.wrong();
      this.toast("TE WEINIG GELD", `${FOOD[m.f]?.name ?? "Dat"} is te duur.`, "bad");
    } else if (m.t === "dood") {
      this.onMoney(m.pts);
      if (m.lost) this.toast("DE AMBULANCE", `Rekening: €${m.lost}.`, "bad");
    }
  }

  // awake again, at the entrance
  revive() {
    this.dead = false;
    this.hp = 100;
    this.warned = 0;
    this.sick = false;
    this.sickAt = 0;
  }
}
