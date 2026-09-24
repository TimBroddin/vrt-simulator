// The lifts: call them, step in, press E, and they take you wherever they want.
import { CELL, FLOOR_MAX, FLOOR_MIN, H } from "./config";
import type { Player } from "./player";
import type { Sound } from "./audio";
import type { ElevRT, World } from "./world";
import { track } from "./analytics";

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
  want: number;
}

export class Lifts {
  calls = new Map<string, Call>();
  ride: Ride | null = null;
  prompt = "";
  display: string | null = null;
  // floor selection panel inside the car
  panel: { e: ElevRT; sel: number } | null = null;
  private panelEl = document.getElementById("liftpanel")!;
  private panelKey = "";

  constructor(private world: World, private player: Player, private sound: Sound) {
    // buttons (tappable on touch screens)
    const grid = this.panelEl.querySelector(".lp-buttons")!;
    for (let f = FLOOR_MAX - 1; f >= FLOOR_MIN; f--) {
      const b = document.createElement("div");
      b.className = "lp-btn";
      b.dataset.f = String(f);
      b.textContent = f === FLOOR_MIN ? "P" : String(f);
      const go = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.panel) return;
        this.panel.sel = f;
        this.panelInput("go");
      };
      b.addEventListener("touchstart", go, { passive: false });
      b.addEventListener("click", go);
      grid.appendChild(b);
    }
  }

  get panelOpen() {
    return !!this.panel;
  }

  // "up" / "down" / "go" / "close" or a floor number
  panelInput(a: "up" | "down" | "go" | "close" | number) {
    const p = this.panel;
    if (!p) return;
    if (a === "close") {
      this.panel = null;
    } else if (a === "up") p.sel = Math.min(FLOOR_MAX - 1, p.sel + 1);
    else if (a === "down") p.sel = Math.max(FLOOR_MIN, p.sel - 1);
    else if (typeof a === "number") p.sel = Math.max(FLOOR_MIN, Math.min(FLOOR_MAX - 1, a));
    else if (a === "go") {
      if (p.sel === p.e.f) {
        this.panel = null;
        return;
      }
      this.sound.beep(0.6);
      this.calls.set(p.e.id, { openAt: -1, closeAt: 0, dinged: true });
      this.sound.doors();
      this.ride = { phase: "closing", gx: p.e.gx, gz: p.e.gz, from: p.e.f, to: p.e.f, t: 0, dur: 0, shown: p.e.f, want: p.sel };
      this.panel = null;
    }
    if (a !== "go") this.sound.beep(0.2);
  }

  private renderPanel() {
    const p = this.panel;
    const key = p ? `${p.e.f}:${p.sel}` : "";
    if (key === this.panelKey) return;
    this.panelKey = key;
    this.panelEl.style.display = p ? "" : "none";
    if (!p) return;
    for (const b of Array.from(this.panelEl.querySelectorAll<HTMLElement>(".lp-btn"))) {
      const f = Number(b.dataset.f);
      b.classList.toggle("sel", f === p.sel);
      b.classList.toggle("cur", f === p.e.f);
    }
  }

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
      if (n.inCar && n.e.open > 0.8 && !this.panel) this.prompt = "E · KIES VERDIEPING";
      else if (!n.inCar && n.e.open < 0.5 && !this.calls.has(n.e.id)) this.prompt = "E · LIFT ROEPEN";
      if (interact) {
        if (n.inCar && n.e.open > 0.5) {
          if (this.panel) this.panelInput("go");
          else {
            this.panel = { e: n.e, sel: n.e.f };
            // keep the doors open while choosing
            const c = this.calls.get(n.e.id);
            if (c) c.closeAt = Math.max(c.closeAt, t + 30);
          }
        } else if (!n.inCar && !this.calls.has(n.e.id)) {
          const openAt = t + 1.2 + Math.random() * 2.5;
          this.calls.set(n.e.id, { openAt, closeAt: openAt + 7, dinged: false });
        }
      }
    }

    // the panel only makes sense while standing in an open car
    if (this.panel) {
      const inCar = n?.inCar && n.e === this.panel.e;
      if (!inCar || this.panel.e.open < 0.3 || this.ride) this.panel = null;
    }
    this.renderPanel();

    const r = this.ride;
    this.display = null;
    if (!r) return;
    r.t += dt;
    const car = w.elevators.get(`${r.from}:${r.gx},${r.gz}`);
    if (r.phase === "closing") {
      this.display = String(r.from);
      if (!car || car.open < 0.02) {
        let to = r.want;
        // now and then the lift has a mind of its own
        if (Math.random() < 0.05) while (to === r.from || to === r.want) to = FLOOR_MIN + Math.floor(Math.random() * (FLOOR_MAX - FLOOR_MIN));
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
        track("lift_ride", { from: r.from, chosen: r.want, arrived: r.to, glitch: r.to !== r.want });
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
