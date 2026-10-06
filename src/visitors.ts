// The others: everyone else walking round the building, each with a camera on
// their shoulder. One room for everybody (see protocol.ts); you only see the
// ones in your world, on your floor, nearby, and only hear (joins, leaves, chat)
// from the ones in your world. Positions come in 5 times a second and are
// smoothed in between; nothing is sent while you stand still.
import * as THREE from "three";
import { CHUNK, H } from "./config";
import { Builder, LightCtx, type Spec } from "./builder";
import { L } from "./layers";
import { floorDiv, hash } from "./rng";
import { CHAT_MAX, NAME_MAX, clean, type FromRoom, type Pos, type ToRoom, type Who } from "./protocol";
import type { World } from "./world";

const SEND_EVERY = 0.2;
const SIGHT = 60; // m (the fog has them long before that)
const HIP = 0.9;
const BALL = new THREE.SphereGeometry(1, 10, 8);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
const SHIRTS: [number, number, number][] = [
  [0.07, 0.07, 0.08], [0.12, 0.16, 0.3], [0.45, 0.08, 0.07], [0.5, 0.5, 0.48],
  [0.15, 0.28, 0.18], [0.55, 0.42, 0.2], [0.3, 0.12, 0.3], [0.62, 0.6, 0.55],
];
const SKIN: [number, number, number][] = [[0.78, 0.6, 0.5], [0.62, 0.45, 0.34], [0.42, 0.29, 0.2], [0.85, 0.7, 0.6]];

interface Other {
  id: string;
  n: string | null;
  s: number | null; // their world
  target: THREE.Vector3 | null; // (null: not in the building, or not started yet)
  ta: number;
  pos: THREE.Vector3; // where they're drawn
  a: number;
  speed: number;
  phase: number;
  mesh?: THREE.Group;
}

// a camera operator, feet at y = 0, facing +z (the legs are separate, to swing)
function body(b: Builder, id: string) {
  const h = hash(77, ...[...id].map((c) => c.charCodeAt(0)));
  const shirt: Spec = { layer: L.FABRIC, tint: SHIRTS[h % SHIRTS.length]! };
  const skin: Spec = { layer: L.WHITE, tint: SKIN[(h >> 4) % SKIN.length]! };
  const hair: Spec = { layer: L.FABRIC, tint: [0.09, 0.07, 0.06] };
  const dark: Spec = { layer: L.WHITE, tint: [0.05, 0.05, 0.055] };
  const jeans: Spec = { layer: L.FABRIC, tint: [0.14, 0.17, 0.24] };
  b.aabox(-0.19, 0.84, -0.1, 0.19, 0.95, 0.1, jeans); // the hips
  b.aabox(-0.2, 0.95, -0.11, 0.2, 1.44, 0.11, shirt);
  b.aabox(-0.05, 1.44, -0.05, 0.05, 1.5, 0.05, skin);
  b.geom(BALL, 0, 1.61, 0, 0, 0.1, 0.12, 0.11, skin);
  b.geom(BALL, 0, 1.655, -0.035, 0, 0.105, 0.1, 0.1, hair); // (set back, so the face shows)
  // the left arm (+x: facing +z, that's the left) hangs, the right one holds the camera on the shoulder
  b.aabox(0.2, 0.98, -0.05, 0.28, 1.42, 0.05, shirt);
  b.aabox(0.205, 0.88, -0.04, 0.275, 0.98, 0.04, skin);
  b.aabox(-0.28, 1.2, -0.05, -0.2, 1.42, 0.05, shirt);
  b.aabox(-0.28, 1.2, 0.05, -0.2, 1.27, 0.26, shirt);
  b.aabox(-0.27, 1.27, 0.19, -0.21, 1.4, 0.26, skin);
  b.aabox(-0.26, 1.44, -0.24, -0.1, 1.62, 0.24, dark); // the camera
  b.geom(CYL, -0.18, 1.53, 0.33, 0, 0.055, 0.18, 0.055, dark, Math.PI / 2);
  b.aabox(-0.24, 1.62, 0.12, -0.12, 1.66, 0.2, { layer: L.WHITE, emit: [1.2, 1.15, 1] }); // its lamp
  b.aabox(-0.23, 1.63, -0.2, -0.2, 1.65, -0.17, { layer: L.WHITE, emit: [1.4, 0.06, 0.04] }); // REC
}

// one leg, hanging from the hip at y = 0
function leg(b: Builder) {
  b.aabox(-0.075, -HIP + 0.08, -0.08, 0.075, 0, 0.08, { layer: L.FABRIC, tint: [0.14, 0.17, 0.24] });
  b.aabox(-0.075, -HIP, -0.09, 0.075, -HIP + 0.08, 0.16, { layer: L.WHITE, tint: [0.04, 0.04, 0.045] });
}

export class Visitors {
  root = new THREE.Group();
  others = new Map<string, Other>();
  name: string | null = null; // (set when you start)
  onJoin: (name: string) => void = () => {};
  onLeave: (name: string) => void = () => {};
  onChat: (name: string, text: string) => void = () => {};
  private ws: WebSocket | null = null;
  private retry = 1;
  private sendT = 0;
  private pingT = 0;
  private sent: Pos | null = null;
  private sentGone = false;
  private legGeo: THREE.BufferGeometry | null = null;

  constructor(private world: World, private seed: number, private url: string) {
    this.connect();
  }

  // the others in your world
  get count() {
    let n = 0;
    for (const o of this.others.values()) if (o.n && o.s === this.seed) n++;
    return n;
  }

  // the others in your world, in the building, for the maps
  people(): { name: string; x: number; z: number; f: number }[] {
    const out = [];
    for (const o of this.others.values())
      if (o.n && o.s === this.seed && o.target) out.push({ name: o.n, x: o.pos.x, z: o.pos.z, f: Math.floor((o.pos.y + 0.7) / H) });
    return out;
  }

  // you come in, under this name
  join(name: string) {
    this.name = clean(name, NAME_MAX) || "Bezoeker";
    this.send({ t: "n", n: this.name, s: this.seed });
  }

  // say something to everyone in your world; false if there's nobody to hear it
  say(text: string) {
    const m = clean(text, CHAT_MAX);
    if (!m || !this.name || this.ws?.readyState !== WebSocket.OPEN) return false;
    this.send({ t: "c", m });
    return true;
  }

  get online() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private connect() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 1;
      this.sent = null;
      this.sentGone = false;
      if (this.name) this.send({ t: "n", n: this.name, s: this.seed });
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== "string" || e.data === "pong") return;
      try {
        this.receive(JSON.parse(e.data) as FromRoom);
      } catch {}
    };
    // (on any trouble: try again, waiting longer each time, up to a minute)
    ws.onclose = () => {
      this.ws = null;
      for (const id of [...this.others.keys()]) this.drop(id);
      setTimeout(() => this.connect(), this.retry * 1000 * (0.5 + Math.random()));
      this.retry = Math.min(60, this.retry * 2);
    };
  }

  private send(m: ToRoom) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private receive(m: FromRoom) {
    switch (m.t) {
      case "hi":
        // (everyone already here: no "came in" for them)
        for (const id of [...this.others.keys()]) this.drop(id);
        for (const w of m.all) this.add(w);
        break;
      case "j": {
        const o = this.others.get(m.id) ?? this.add({ id: m.id, n: null, s: null, pos: null });
        const was = o.n && o.s === this.seed;
        o.n = m.n;
        o.s = m.s;
        if (!was && m.s === this.seed) this.onJoin(m.n);
        break;
      }
      case "p": {
        const o = this.others.get(m.id) ?? this.add({ id: m.id, n: null, s: m.s, pos: null });
        o.s = m.s;
        if (!o.target) {
          o.target = new THREE.Vector3(m.x, m.y, m.z);
          o.pos.copy(o.target);
          o.a = m.a;
        } else o.target.set(m.x, m.y, m.z);
        o.ta = m.a;
        break;
      }
      case "x": {
        const o = this.others.get(m.id);
        if (o) o.target = null;
        break;
      }
      case "c": {
        const o = this.others.get(m.id);
        if (o?.n && o.s === this.seed) this.onChat(o.n, m.m);
        break;
      }
      case "bye": {
        const o = this.others.get(m.id);
        if (o?.n && o.s === this.seed) this.onLeave(o.n);
        this.drop(m.id);
        break;
      }
    }
  }

  private add(w: Who) {
    const o: Other = { id: w.id, n: w.n, s: w.s, target: null, ta: 0, pos: new THREE.Vector3(), a: 0, speed: 0, phase: 0 };
    if (w.pos) {
      o.target = new THREE.Vector3(w.pos.x, w.pos.y, w.pos.z);
      o.pos.copy(o.target);
      o.a = o.ta = w.pos.a;
      o.s = w.pos.s;
    }
    this.others.set(w.id, o);
    return o;
  }

  private drop(id: string) {
    const o = this.others.get(id);
    if (o?.mesh) {
      this.root.remove(o.mesh);
      (o.mesh.children[0] as THREE.Mesh).geometry.dispose();
    }
    this.others.delete(id);
  }

  private built(fn: (b: Builder) => void) {
    const b = new Builder(new LightCtx(0, 0, 0, "outdoor"));
    fn(b);
    const built = b.finish();
    for (let i = 0; i < built.light.length; i++) built.light[i]! *= 0.6;
    return this.world.geometry(built);
  }

  private makeMesh(o: Other) {
    const g = new THREE.Group();
    const bm = new THREE.Mesh(this.built((b) => body(b, o.id)), this.world.mat);
    bm.frustumCulled = false;
    g.add(bm);
    this.legGeo ??= this.built(leg);
    for (const x of [-0.1, 0.1]) {
      const l = new THREE.Mesh(this.legGeo, this.world.mat);
      l.frustumCulled = false;
      l.position.set(x, HIP, 0);
      g.add(l);
    }
    this.root.add(g);
    o.mesh = g;
  }

  // me: where you are (yaw in a), or null when you're not in the building
  update(dt: number, me: Pos | null) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      if ((this.pingT -= dt) <= 0) {
        this.pingT = 30;
        this.ws.send("ping");
      }
      this.sendT -= dt;
      if (!me) {
        if (!this.sentGone) this.send({ t: "x" });
        this.sentGone = true;
        this.sent = null;
      } else if (this.sendT <= 0) {
        const s = this.sent, a = Math.atan2(Math.sin(me.a), Math.cos(me.a));
        if (!s || Math.hypot(me.x - s.x, me.y - s.y, me.z - s.z) > 0.03 || Math.abs(Math.atan2(Math.sin(a - s.a), Math.cos(a - s.a))) > 0.03) {
          this.sent = { s: me.s, x: me.x, y: me.y, z: me.z, a };
          this.send({ t: "p", ...this.sent });
          this.sentGone = false;
          this.sendT = SEND_EVERY;
        }
      }
    }

    const k = 1 - Math.exp(-dt * 10);
    for (const o of this.others.values()) {
      if (!o.target) {
        if (o.mesh) o.mesh.visible = false;
        continue;
      }
      const before = o.pos.clone();
      if (o.target.distanceTo(o.pos) > 4) o.pos.copy(o.target); // (a warp, or a lift ride)
      else o.pos.lerp(o.target, k);
      const da = o.ta - o.a;
      o.a += Math.atan2(Math.sin(da), Math.cos(da)) * k;
      const moved = Math.hypot(o.pos.x - before.x, o.pos.z - before.z);
      o.speed += (moved / Math.max(dt, 1e-3) - o.speed) * Math.min(1, dt * 6);
      o.phase += moved * 4.5; // (a step is about 70 cm)
      const f = Math.floor((o.pos.y + 0.7) / H);
      const show = !!me && o.s === this.seed && Math.abs(o.pos.y - me.y) < 2 && Math.hypot(o.pos.x - me.x, o.pos.z - me.z) < SIGHT && this.world.isReady(f, floorDiv(o.pos.x, CHUNK), floorDiv(o.pos.z, CHUNK));
      if (show && !o.mesh) this.makeMesh(o);
      if (!o.mesh) continue;
      o.mesh.visible = show;
      if (!show) continue;
      const swing = Math.sin(o.phase) * Math.min(0.5, o.speed * 0.3);
      o.mesh.position.set(o.pos.x, o.pos.y + Math.abs(Math.cos(o.phase)) * Math.min(0.03, o.speed * 0.01), o.pos.z);
      o.mesh.rotation.y = o.a + Math.PI; // (the player looks down -z)
      o.mesh.children[1]!.rotation.x = swing;
      o.mesh.children[2]!.rotation.x = -swing;
    }
  }
}
