// The lifts: call them, step in, press E, and they take you wherever they want.
import { CELL, FLOOR_MAX, FLOOR_MIN, H } from "./config";
import type { Player } from "./player";
import type { Sound } from "./audio";
import type { ElevRT, World } from "./world";

interface Call {
  openAt: number;
  closeAt: number;
  dinged: boolean;
}

interface Ride {
  phase: "closing" | "moving" | "arrive";
  gx: number;
  gz: number;
  from: number;
  to: number;
  t: number;
  dur: number;
  shown: number;
}

export class Lifts {
  calls = new Map<string, Call>();
  ride: Ride | null = null;
  prompt = "";
  display: string | null = null;

  constructor(private world: World, private player: Player, private sound: Sound) {}

  private near(): { e: ElevRT; d: number; inCar: boolean } | null {
    const p = this.player.pos;
    const f = this.player.floor;
    const gx = Math.floor(p.x / CELL), gz = Math.floor(p.z / CELL);
    let best: { e: ElevRT; d: number; inCar: boolean } | null = null;
    for (const e of this.world.elevators.values()) {
      if (e.f !== f) continue;
      const inCar = e.gx === gx && e.gz === gz;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if ((inCar || d < 1.9) && (!best || d < best.d)) best = { e, d, inCar };
    }
    return best;
  }

  update(t: number, dt: number, interact: boolean) {
    const w = this.world;
    // animate doors
    for (const e of w.elevators.values()) {
      const c = this.calls.get(e.id);
      let target = 0;
      if (c) {
        if (t >= c.openAt && !c.dinged) {
          c.dinged = true;
          if (e.f === this.player.floor && Math.hypot(e.x - this.player.pos.x, e.z - this.player.pos.z) < 20) {
            this.sound.ding(0.8);
            this.sound.doors();
          }
        }
        // hold the doors while someone stands in the doorway
        if (t > c.closeAt - 0.4 && t < c.closeAt && Math.hypot(e.x - this.player.pos.x, e.z - this.player.pos.z) < 0.55 && e.f === this.player.floor) c.closeAt = t + 1.5;
        target = t >= c.openAt && t < c.closeAt ? 1 : 0;
        if (t > c.closeAt + 3) this.calls.delete(e.id);
      }
      const prev = e.open;
      e.open += Math.max(-dt * 1.3, Math.min(dt * 1.3, target - e.open));
      if (prev !== e.open) {
        const o = e.open * 0.56;
        e.panels[0]!.position.set(-e.px * o, 0, -e.pz * o);
        e.panels[1]!.position.set(e.px * o, 0, e.pz * o);
      }
    }

    const n = this.near();
    this.prompt = "";
    if (!this.ride && n) {
      if (n.inCar && n.e.open > 0.8) this.prompt = "E · RIJDEN";
      else if (!n.inCar && n.e.open < 0.5 && !this.calls.has(n.e.id)) this.prompt = "E · LIFT ROEPEN";
      if (interact) {
        if (n.inCar && n.e.open > 0.5) {
          this.calls.set(n.e.id, { openAt: t - 1, closeAt: t, dinged: true });
          this.sound.doors();
          this.ride = { phase: "closing", gx: n.e.gx, gz: n.e.gz, from: n.e.f, to: n.e.f, t: 0, dur: 0, shown: n.e.f };
        } else if (!n.inCar && !this.calls.has(n.e.id)) {
          const openAt = t + 1.2 + Math.random() * 2.5;
          this.calls.set(n.e.id, { openAt, closeAt: openAt + 7, dinged: false });
        }
      }
    }

    const r = this.ride;
    this.display = null;
    if (!r) return;
    r.t += dt;
    const car = w.elevators.get(`${r.from}:${r.gx},${r.gz}`);
    if (r.phase === "closing") {
      this.display = String(r.from);
      if (!car || car.open < 0.02) {
        let to = r.from;
        while (to === r.from) to = FLOOR_MIN + Math.floor(Math.random() * (FLOOR_MAX - FLOOR_MIN));
        r.to = to;
        r.phase = "moving";
        r.t = 0;
        r.dur = 2.2 + Math.abs(to - r.from) * 0.5;
        this.sound.motor(true);
        w.ensure(to, this.player.pos.x, this.player.pos.z);
      }
    } else if (r.phase === "moving") {
      const k = Math.min(1, r.t / r.dur);
      const s = k * k * (3 - 2 * k);
      r.shown = Math.round(r.from + (r.to - r.from) * s);
      // the display sometimes shows floors that do not exist
      this.display = Math.random() < 0.004 ? "13" : String(r.shown);
      this.player.shake = Math.min(1, 0.4 + Math.sin(k * Math.PI));
      w.ensure(r.to, this.player.pos.x, this.player.pos.z);
      if (k >= 1 && w.readyAround(this.player.pos.x, this.player.pos.z, r.to, 0) >= 1) {
        const dy = (r.to - r.from) * H;
        this.player.pos.y += dy;
        this.player.viewY += dy;
        this.sound.motor(false);
        r.phase = "arrive";
        r.t = 0;
      }
    } else {
      this.display = String(r.to);
      const id = `${r.to}:${r.gx},${r.gz}`;
      if (w.elevators.has(id) && r.t > 0.4) {
        this.calls.set(id, { openAt: t + 0.2, closeAt: t + 8, dinged: false });
        this.ride = null;
      }
    }
  }
}
