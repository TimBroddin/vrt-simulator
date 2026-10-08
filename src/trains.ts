// The trains through station Meiser. Every two and a half minutes a lit train
// comes out of one tunnel, stops at the platform with its doors open, and goes
// into the other, one way and then the other. It runs on the clock, so everyone
// sees the same one. It's only drawn between the tunnel mouths (a clip box on its
// own material), so it comes out of the dark and goes back into it. Step in
// while the doors are open (E) and it takes you to Mortsel-Oude-God (mortsel.ts).
import * as THREE from "three";
import { CHUNK, H } from "./config";
import { Builder, LightCtx, type Spec } from "./builder";
import { L } from "./layers";
import { MEISER, getStructure } from "./layout";
import { floorDiv, hash } from "./rng";
import type { Sound } from "./audio";
import type { Player } from "./player";
import type { World } from "./world";

const CAR = 19.5, GAP = 0.6, CARS = 3, NOSE = 0.9;
export const TRAIN_LEN = CARS * CAR + (CARS - 1) * GAP + 2 * NOSE;
const LEN = TRAIN_LEN;
const EVERY = 150; // s between trains, at each station
export const RAIL = 0.41; // the top of the rails above the track bed
const ACC = 1.2; // m/s², braking and pulling away
const DWELL = 25; // s at the platform
const MID = (MEISER.portal[0] + MEISER.portal[1]) / 2; // where the middle of the train stops
const RUN = MID - MEISER.portal[0] + 2 + LEN / 2; // from just inside the tunnel to the stop
const BRAKE = Math.sqrt((2 * RUN) / ACC); // s, coming in (and going out)
const OPEN = [BRAKE + 1.5, BRAKE + DWELL - 3] as const; // the doors are open in between
const WHEEL = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
const sp = (layer: number, tint?: [number, number, number], emit?: [number, number, number]): Spec => ({ layer, tint, emit });
// the doors along one side, in the train's own x (from the back): two to a car
export const TRAIN_DOORS = Array.from({ length: CARS }, (_, k) => [0.25, 0.75].map((t) => NOSE + k * (CAR + GAP) + CAR * t)).flat();

const white = sp(L.WHITE, [0.9, 0.9, 0.88]), dark = sp(L.WHITE, [0.12, 0.12, 0.13]), grey = sp(L.WHITE, [0.5, 0.52, 0.55]);
const yellow = sp(L.WHITE, [0.95, 0.74, 0.1]), blue = sp(L.WHITE, [0.1, 0.25, 0.6]);
const lit = sp(L.WHITE, undefined, [0.92, 0.88, 0.72]); // the empty train, lit inside

// One train, from x = 0 (the back) to x = LEN (the front), the rails at y = 0.
// The door leaves are apart (doorLeaves), so they can slide open.
function trainModel(b: Builder) {
  for (let k = 0; k < CARS; k++) {
    const x0 = NOSE + k * (CAR + GAP), x1 = x0 + CAR;
    b.aabox(x0, 0.95, -1.45, x1, 3.85, 1.45, { all: white, ny: null });
    b.aabox(x0 + 0.5, 0.55, -1.36, x1 - 0.5, 0.95, 1.36, dark);
    b.aabox(x0, 1.12, -1.456, x1, 1.36, 1.456, { all: blue, py: null, ny: null });
    b.aabox(x0 + 0.8, 1.8, -1.458, x1 - 0.8, 2.6, 1.458, { all: lit, py: null, ny: null });
    for (let x = x0 + 0.8; x <= x1 - 0.7; x += 2.4) b.aabox(x - 0.07, 1.8, -1.462, x + 0.07, 2.6, 1.462, { all: dark, py: null, ny: null });
    for (const t of [0.25, 0.75]) {
      const xc = x0 + CAR * t;
      // the doorway: lit inside, a yellow frame round it (the leaves are on their own)
      b.aabox(xc - 0.8, 0.98, -1.459, xc + 0.8, 3.12, 1.459, { all: yellow, py: null, ny: null });
      b.aabox(xc - 0.7, 1.0, -1.461, xc + 0.7, 3.05, 1.461, { all: sp(L.WHITE, undefined, [0.62, 0.6, 0.52]), py: null, ny: null });
    }
    // the roof and what's on it
    b.aabox(x0 + 0.2, 3.85, -1.28, x1 - 0.2, 4.05, 1.28, grey);
    b.aabox(x0 + 4, 4.05, -0.8, x0 + 8, 4.4, 0.8, grey);
    // the bogies
    for (const xb of [x0 + 3.2, x1 - 3.2]) {
      b.aabox(xb - 1.3, 0.3, -1.15, xb + 1.3, 0.75, 1.15, dark);
      for (const dx of [-0.9, 0.9]) for (const z of [-0.72, 0.72]) b.geom(WHEEL, xb + dx, 0.42, z, 0, 0.42, 0.12, 0.42, dark, Math.PI / 2);
    }
    // the bellows to the next car
    if (k < CARS - 1) b.aabox(x1, 1.0, -1.1, x1 + GAP, 3.6, 1.1, dark);
    // a pantograph on the middle car, up against the wire
    if (k === 1) {
      const xm = x0 + CAR / 2;
      b.aabox(xm - 0.8, 4.05, -0.5, xm + 0.8, 4.2, 0.5, dark);
      for (const s of [-1, 1]) {
        b.obox([xm + s * 0.35, 4.6, 0], [Math.cos(0.9 * s), Math.sin(0.9), 0], [-Math.sin(0.9) * s, Math.cos(0.9), 0], [0, 0, 1], [0.6, 0.03, 0.03], dark);
      }
      b.aabox(xm - 0.05, 4.95, -0.9, xm + 0.05, 5.0, 0.9, dark);
    }
  }
  // the two cabs: yellow, a dark windscreen, white lights and red ones
  for (const [xa, xb, s] of [[0, NOSE, -1], [LEN - NOSE, LEN, 1]] as const) {
    b.aabox(xa, 0.95, -1.42, xb, 3.3, 1.42, yellow);
    const xf = s > 0 ? xb : xa;
    b.aabox(Math.min(xf, xf - s * 0.02), 2.2, -1.2, Math.max(xf, xf - s * 0.02) + (s > 0 ? 0.01 : 0), 3.1, 1.2, dark);
    for (const z of [-0.95, 0.95]) {
      b.aabox(Math.min(xf, xf + s * 0.02), 1.25, z - 0.17, Math.max(xf, xf + s * 0.02), 1.45, z - 0.02, sp(L.WHITE, undefined, [2.2, 2.1, 1.8]));
      b.aabox(Math.min(xf, xf + s * 0.02), 1.25, z + 0.02, Math.max(xf, xf + s * 0.02), 1.45, z + 0.17, sp(L.WHITE, undefined, [1.8, 0.1, 0.06]));
    }
    b.aabox(xa, 3.3, -1.3, xb, 3.85, 1.3, white);
  }
}

// The leaves of every door on both sides, the ones that slide back (s = -1) or forward (s = 1).
function doorLeaves(b: Builder, s: number) {
  for (const xc of TRAIN_DOORS) {
    const xa = s < 0 ? xc - 0.7 : xc + 0.01, xb = s < 0 ? xc - 0.01 : xc + 0.7;
    b.aabox(xa, 1.0, -1.466, xb, 3.05, 1.466, { all: yellow, py: null, ny: null });
    b.aabox(xa + 0.1, 1.95, -1.47, xb - 0.1, 2.7, 1.47, { all: lit, py: null, ny: null });
  }
}

const geos = new WeakMap<World, THREE.BufferGeometry[]>();
function trainGeos(world: World) {
  let g = geos.get(world);
  if (g) return g;
  g = [trainModel, (b: Builder) => doorLeaves(b, -1), (b: Builder) => doorLeaves(b, 1)].map((make) => {
    const b = new Builder(new LightCtx(0, 0, 0, "outdoor"));
    make(b);
    const built = b.finish();
    for (let i = 0; i < built.light.length; i++) built.light[i]! *= 0.75;
    return world.geometry(built);
  });
  geos.set(world, g);
  return g;
}

// A train with its own copy of the world material, drawn only inside the clip box.
// mesh.position is the back of the train on the rails; it runs along its own +x.
export class Train {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  private leaves: THREE.Mesh[];
  private open = 0;
  constructor(world: World, clipMin: THREE.Vector3, clipMax: THREE.Vector3, fog?: { color: THREE.Color; density: number }) {
    const [body, back, fwd] = trainGeos(world);
    this.mat = (world.mat as THREE.ShaderMaterial).clone();
    this.mat.uniforms = {
      ...world.mat.uniforms,
      clipMin: { value: clipMin },
      clipMax: { value: clipMax },
      ...(fog ? { fogColor: { value: fog.color }, fogDensity: { value: fog.density } } : {}),
    };
    this.mesh = new THREE.Mesh(body, this.mat);
    this.mesh.frustumCulled = false;
    this.leaves = [back!, fwd!].map((g) => {
      const m = new THREE.Mesh(g, this.mat);
      m.frustumCulled = false;
      this.mesh.add(m);
      return m;
    });
  }
  // 0 shut .. 1 open
  doors(k: number) {
    if (k === this.open) return;
    this.open = k;
    this.leaves[0]!.position.x = -0.68 * k;
    this.leaves[1]!.position.x = 0.68 * k;
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mat.dispose();
  }
}

interface Station {
  key: string;
  ox: number;
  oz: number;
  y0: number;
  phase: number; // (each station runs on its own offset)
  train: Train;
  heard: number; // the last sound it played (train number * 10 + which)
  east: boolean; // which way the one in the station goes
  u: number; // seconds into its turn
}

export class Trains {
  private stations = new Map<string, Station>();
  private scanT = 0;
  prompt = "";
  onBoard: (x: number, y: number, z: number, yaw: number) => void = () => {};

  constructor(private scene: THREE.Scene, private world: World, private player: Player, private sound: Sound) {}

  // the stations around you (on your floor, give or take one)
  private scan() {
    const P = this.player.pos, cx0 = floorDiv(P.x, CHUNK), cz0 = floorDiv(P.z, CHUNK);
    const want = new Set<string>();
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        const st = getStructure(cx0 + dx, cz0 + dz), a = st.atrium;
        if (!a || a.kind !== "meiser" || Math.abs(a.f0 * H - P.y) > H * 1.6) continue;
        const key = `${st.cx},${st.cz}`;
        want.add(key);
        if (this.stations.has(key)) continue;
        const ox = st.cx * CHUNK, oz = st.cz * CHUNK, y0 = a.f0 * H;
        // the trench, between the portals
        const train = new Train(
          this.world,
          new THREE.Vector3(ox + MEISER.portal[0], y0 - MEISER.depth - 0.5, oz + MEISER.trench[0]),
          new THREE.Vector3(ox + MEISER.portal[1], y0 + 30, oz + MEISER.trench[1]),
        );
        train.mesh.visible = false;
        this.scene.add(train.mesh);
        this.stations.set(key, { key, ox, oz, y0, phase: hash(911, st.cx, st.cz) % EVERY, train, heard: -1, east: true, u: EVERY });
      }
    for (const [k, s] of this.stations)
      if (!want.has(k)) {
        s.train.dispose();
        this.stations.delete(k);
      }
  }

  // how far the middle of the train is past the stop, u seconds into its turn (null: in the tunnels)
  private static along(u: number): number | null {
    if (u < BRAKE) return -RUN + ACC * BRAKE * u - (ACC * u * u) / 2;
    if (u < BRAKE + DWELL) return 0;
    const t = u - BRAKE - DWELL;
    return t < BRAKE ? (ACC * t * t) / 2 : null;
  }

  update(dt: number, use = false) {
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 1;
      this.scan();
    }
    const now = Date.now() / 1000, P = this.player.pos;
    this.prompt = "";
    for (const s of this.stations.values()) {
      const t = now + s.phase, k = Math.floor(t / EVERY), u = t - k * EVERY;
      s.east = k % 2 === 0;
      s.u = u;
      // what you hear, from the middle of the station
      const cx = s.ox + MID, cz = s.oz + 16.5, d = Math.hypot(cx - P.x, cz - P.z);
      const vol = Math.max(0, 1 - d / 70) * (Math.abs(s.y0 - P.y) < 3 ? 1 : 0.4);
      const pan = Math.max(-0.8, Math.min(0.8, -Math.sin(Math.atan2(cx - P.x, cz - P.z) - this.player.yaw + Math.PI) * 0.8));
      const hear = (n: number, which: number, play: () => void) => {
        if (s.heard >= n * 10 + which) return;
        s.heard = n * 10 + which;
        if (vol > 0.02) play();
      };
      // the horn and the rumble a moment before it comes out of the tunnel, the brakes, the doors, pulling away
      if (u > EVERY - 2) hear(k + 1, 0, () => this.sound.train(vol, pan, 2));
      else if (u > BRAKE - 3 && u < BRAKE) hear(k, 1, () => this.sound.brake(vol, pan));
      else if (u > OPEN[0] && u < OPEN[0] + 1) hear(k, 2, () => this.sound.ding(vol * 0.6, pan));
      else if (u > OPEN[1] && u < OPEN[1] + 1) hear(k, 3, () => this.sound.trainDoors(vol, pan));
      else if (u > BRAKE + DWELL && u < BRAKE + DWELL + 1) hear(k, 4, () => this.sound.train(vol * 0.8, pan, 0, false));
      const a = Trains.along(u), m = s.train.mesh;
      m.visible = a !== null;
      if (a === null) continue;
      const y = s.y0 - MEISER.depth + RAIL;
      if (s.east) {
        m.rotation.y = 0;
        m.position.set(s.ox + MID + a - LEN / 2, y, s.oz + MEISER.tracks[0]);
      } else {
        m.rotation.y = Math.PI;
        m.position.set(s.ox + MID - a + LEN / 2, y, s.oz + MEISER.tracks[1]);
      }
      const open = Math.max(0, Math.min(1, u - OPEN[0], OPEN[1] - u + 1));
      s.train.doors(open);
      // on the platform: when the next one comes, or the way in
      const lx = P.x - s.ox, lz = P.z - s.oz;
      if (Math.abs(P.y - s.y0) > 0.6 || lx < MEISER.portal[0] || lx > MEISER.portal[1]) continue;
      const north = lz < MEISER.trench[0] + 0.3, south = lz > MEISER.trench[1] - 0.3;
      if (!north && !south) continue;
      if (open > 0.8 && (s.east ? north && lz > MEISER.trench[0] - 2.2 : south && lz < MEISER.trench[1] + 2.2)) {
        const near = TRAIN_DOORS.some((dx) => Math.abs(m.position.x + (s.east ? dx : -dx) - P.x) < 1.3);
        if (near) {
          this.prompt = "E · INSTAPPEN · trein naar Mortsel-Oude-God";
          if (use) {
            // (stand in the doorway, facing out)
            this.onBoard(P.x, P.y, P.z, s.east ? 0 : Math.PI);
            return true;
          }
        }
      }
    }
    if (!this.prompt) this.prompt = this.waitPrompt();
    return false;
  }

  // on a platform at Meiser with no train in: how long until the next one
  private waitPrompt() {
    const P = this.player.pos;
    for (const s of this.stations.values()) {
      const lx = P.x - s.ox, lz = P.z - s.oz;
      if (Math.abs(P.y - s.y0) > 0.6 || lx < MEISER.portal[0] || lx > MEISER.portal[1]) continue;
      if (lz > MEISER.trench[0] + 0.3 && lz < MEISER.trench[1] - 0.3) continue;
      if (lz < 2 || lz > MEISER.build) continue;
      if (s.u < OPEN[1]) return s.u < OPEN[0] ? "De trein naar Mortsel-Oude-God komt binnen" : "Instappen: ga bij een deur staan";
      if (s.u < BRAKE + DWELL + BRAKE) return "Deuren gesloten · volgende trein binnen 2 minuten";
      const left = Math.ceil(EVERY - s.u + BRAKE);
      return `Volgende trein naar Mortsel-Oude-God · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    }
    return "";
  }

  // (for testing: the next train comes now)
  now(key?: string) {
    const t = Date.now() / 1000;
    for (const s of this.stations.values())
      if (!key || s.key === key) {
        s.phase = ((-t % (EVERY * 2)) + EVERY * 2) % (EVERY * 2);
        s.heard = -1;
      }
  }
}
