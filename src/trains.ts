// The trains through station Meiser. Every two and a half minutes an empty
// train comes out of one tunnel and goes into the other without stopping, one
// way and then the other. It runs on the clock, so everyone sees the same one.
// It's only drawn between the tunnel mouths (a clip box on its own material),
// so it comes out of the dark and goes back into it.
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
const LEN = CARS * CAR + (CARS - 1) * GAP + 2 * NOSE;
const EVERY = 150; // s between trains, at each station
const SPEED = 11; // m/s, about 40 km/h
const RAIL = 0.41; // the top of the rails above the track bed
const WHEEL = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
const sp = (layer: number, tint?: [number, number, number], emit?: [number, number, number]): Spec => ({ layer, tint, emit });

// One train, from x = 0 (the back) to x = LEN (the front), the rails at y = 0.
function trainModel(b: Builder) {
  const white = sp(L.WHITE, [0.9, 0.9, 0.88]), dark = sp(L.WHITE, [0.12, 0.12, 0.13]), grey = sp(L.WHITE, [0.5, 0.52, 0.55]);
  const yellow = sp(L.WHITE, [0.95, 0.74, 0.1]), blue = sp(L.WHITE, [0.1, 0.25, 0.6]);
  const lit = sp(L.WHITE, undefined, [0.92, 0.88, 0.72]); // the empty train, lit inside
  for (let k = 0; k < CARS; k++) {
    const x0 = NOSE + k * (CAR + GAP), x1 = x0 + CAR;
    b.aabox(x0, 0.95, -1.45, x1, 3.85, 1.45, { all: white, ny: null });
    b.aabox(x0 + 0.5, 0.55, -1.36, x1 - 0.5, 0.95, 1.36, dark);
    b.aabox(x0, 1.12, -1.456, x1, 1.36, 1.456, { all: blue, py: null, ny: null });
    b.aabox(x0 + 0.8, 1.8, -1.458, x1 - 0.8, 2.6, 1.458, { all: lit, py: null, ny: null });
    for (let x = x0 + 0.8; x <= x1 - 0.7; x += 2.4) b.aabox(x - 0.07, 1.8, -1.462, x + 0.07, 2.6, 1.462, { all: dark, py: null, ny: null });
    for (const t of [0.25, 0.75]) {
      const xc = x0 + CAR * t;
      b.aabox(xc - 0.72, 1.0, -1.464, xc + 0.72, 3.05, 1.464, { all: yellow, py: null, ny: null });
      b.aabox(xc - 0.56, 1.95, -1.468, xc + 0.56, 2.7, 1.468, { all: lit, py: null, ny: null });
      b.aabox(xc - 0.015, 1.0, -1.47, xc + 0.015, 3.05, 1.47, { all: dark, py: null, ny: null });
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

interface Station {
  key: string;
  ox: number;
  oz: number;
  y0: number;
  phase: number; // (each station runs on its own offset)
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  announced: number; // the train it played the sound for
}

export class Trains {
  private geo: THREE.BufferGeometry | null = null;
  private stations = new Map<string, Station>();
  private scanT = 0;

  constructor(private scene: THREE.Scene, private world: World, private player: Player, private sound: Sound) {}

  private model() {
    if (this.geo) return this.geo;
    const b = new Builder(new LightCtx(0, 0, 0, "outdoor"));
    trainModel(b);
    const built = b.finish();
    for (let i = 0; i < built.light.length; i++) built.light[i]! *= 0.75;
    return (this.geo = this.world.geometry(built));
  }

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
        // its own material, sharing everything with the world's but the clip box: the trench, between the portals
        const mat = (this.world.mat as THREE.ShaderMaterial).clone();
        mat.uniforms = {
          ...this.world.mat.uniforms,
          clipMin: { value: new THREE.Vector3(ox + MEISER.portal[0], y0 - MEISER.depth - 0.5, oz + MEISER.trench[0]) },
          clipMax: { value: new THREE.Vector3(ox + MEISER.portal[1], y0 + 30, oz + MEISER.trench[1]) },
        };
        const mesh = new THREE.Mesh(this.model(), mat);
        mesh.frustumCulled = false;
        mesh.visible = false;
        this.scene.add(mesh);
        this.stations.set(key, { key, ox, oz, y0, phase: hash(911, st.cx, st.cz) % EVERY, mesh, mat, announced: -1 });
      }
    for (const [k, s] of this.stations)
      if (!want.has(k)) {
        this.scene.remove(s.mesh);
        s.mat.dispose();
        this.stations.delete(k);
      }
  }

  update(dt: number) {
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 1;
      this.scan();
    }
    const now = Date.now() / 1000, P = this.player.pos;
    const span = MEISER.portal[1] - MEISER.portal[0] + LEN + 4, dur = span / SPEED;
    for (const s of this.stations.values()) {
      const t = now + s.phase, k = Math.floor(t / EVERY), u = t - k * EVERY;
      const east = k % 2 === 0;
      // the horn and the rumble, a moment before it comes out of the tunnel
      if (u > EVERY - 2 && s.announced !== k + 1) {
        s.announced = k + 1;
        const cx = s.ox + 18, cz = s.oz + 16.5, d = Math.hypot(cx - P.x, cz - P.z);
        const vol = Math.max(0, 1 - d / 70) * (Math.abs(s.y0 - P.y) < 3 ? 1 : 0.4);
        const yaw = this.player.yaw, ang = Math.atan2(cx - P.x, cz - P.z);
        this.sound.train(vol, Math.max(-0.8, Math.min(0.8, -Math.sin(ang - yaw + Math.PI) * 0.8)), 2);
      }
      const on = u < dur;
      s.mesh.visible = on;
      if (!on) continue;
      // the front, from just inside one tunnel to past the other end
      const z = s.oz + MEISER.tracks[east ? 0 : 1], y = s.y0 - MEISER.depth + RAIL;
      if (east) {
        s.mesh.rotation.y = 0;
        s.mesh.position.set(s.ox + MEISER.portal[0] - 2 + u * SPEED - LEN, y, z);
      } else {
        s.mesh.rotation.y = Math.PI;
        s.mesh.position.set(s.ox + MEISER.portal[1] + 2 - u * SPEED + LEN, y, z);
      }
    }
  }

  // (for testing: the next train comes now)
  now(key?: string) {
    const t = Date.now() / 1000;
    for (const s of this.stations.values())
      if (!key || s.key === key) {
        s.phase = ((-t % (EVERY * 2)) + EVERY * 2) % (EVERY * 2);
        s.announced = -1;
      }
  }
}
