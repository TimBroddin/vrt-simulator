// Cars you can drive: the only cars in the building. One on every floor of the
// parkeertoren (in the west half on even floors, the east half on odd ones, the
// roof too), and one in an aisle of the parking below, in every block. E gets in (and out, once it's
// stopped); W/S gas and brake or reverse, A/D steer, the mouse looks round from
// the driver's seat. They go where cars go: the parking decks, the ramps, the
// roof. Where you leave one is kept, per world.
import * as THREE from "three";
import { CELL, CH, CHUNK, EYE, FLOOR_MAX, FLOOR_MIN, H } from "./config";
import { TorusGeometry } from "three";
import { Builder, LightCtx, type Spec, type V3 } from "./builder";
import { K, getPlan, getStructure, kindAt } from "./layout";
import { L } from "./layers";
import { hash, floorDiv } from "./rng";
import type { Sound } from "./audio";
import type { Player } from "./player";
import type { World } from "./world";

const WHEELBASE = 2.6, MAX_STEER = 0.62;
const TOP = 7.5, BACK = 3; // m/s: a parking speed, give or take
const CIRCLES = [-1.4, 0, 1.4], R = 0.9; // the body, for bumping into things
const SEAT = { x: 0.42, y: 1.16, z: -0.45 }; // the driver's eyes: left of the middle, a bit back
const WHEEL = { x: 0.42, y: 0.9, z: 0.24 }; // the steering wheel, in front of the driver
const RIM = new TorusGeometry(0.17, 0.02, 6, 24); // in the xy plane, facing the driver
const DIAL = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
const TYRE_CYL = new THREE.CylinderGeometry(1, 1, 1, 18, 1);
const PAINT: [number, number, number][] = [
  [0.75, 0.75, 0.74], [0.08, 0.08, 0.09], [0.5, 0.06, 0.05], [0.12, 0.18, 0.35],
  [0.4, 0.42, 0.44], [0.85, 0.85, 0.82], [0.2, 0.3, 0.2], [0.6, 0.5, 0.2],
];
const KNOB = new THREE.SphereGeometry(1, 8, 6);
const DRIVE = new Set<number>([K.GARAGE, K.ROOF, K.VOID]); // (the voids are the parkeertoren's ramps)

interface Car {
  key: string;
  x: number;
  y: number;
  z: number;
  rot: number; // the nose points (sin rot, cos rot)
  color: number;
  pitch: number;
  mesh?: THREE.Mesh;
}

// The car, inside and out. Car space: +z is forward, the driver sits at +x, the
// ground is y = 0. The cabin is hollow: from the driver's seat you see the
// dashboard, the bonnet through the windscreen, the doors, the seats.
function carModel(b: Builder, paint: Spec) {
  const dark: Spec = { layer: L.WHITE, tint: [0.06, 0.06, 0.065] };
  const plastic: Spec = { layer: L.WHITE, tint: [0.16, 0.16, 0.17] };
  const softTop: Spec = { layer: L.FABRIC, tint: [0.2, 0.2, 0.21] };
  const carpet: Spec = { layer: L.CARPET_GREY, tint: [0.35, 0.35, 0.37] };
  const cloth: Spec = { layer: L.FABRIC, tint: [0.26, 0.26, 0.3] };
  const lining: Spec = { layer: L.FABRIC, tint: [0.72, 0.7, 0.66] };
  const chrome: Spec = { layer: L.STEEL, tint: [0.9, 0.9, 0.92] };
  // --- the body: the floor, the sides (door cards inside), the bonnet, the boot
  b.aabox(-0.86, 0.26, -2.05, 0.86, 0.38, 2.05, { all: dark, py: carpet });
  for (const s of [-1, 1]) {
    // the side, with arches over the wheels
    const xa = s > 0 ? 0.85 : -0.89, xb = s > 0 ? 0.89 : -0.85, side = { all: paint, [s > 0 ? "nx" : "px"]: plastic };
    for (const [za, zb, ya] of [[-2.05, -1.68, 0.3], [-1.68, -0.96, 0.68], [-0.96, 0.96, 0.3], [0.96, 1.68, 0.68], [1.68, 2.05, 0.3]] as const) b.aabox(xa, ya, za, xb, 0.95, zb, side);
    b.aabox(s > 0 ? 0.84 : -0.9, 0.95, -1.4, s > 0 ? 0.9 : -0.84, 0.975, 0.95, dark); // the window line
    b.aabox(s > 0 ? 0.78 : -0.85, 0.7, -0.75, s > 0 ? 0.85 : -0.78, 0.76, 0.5, plastic); // armrest
    b.aabox(s > 0 ? 0.835 : -0.85, 0.8, 0.25, s > 0 ? 0.85 : -0.835, 0.84, 0.4, chrome); // door handle
  }
  b.aabox(-0.85, 0.38, 0.95, 0.85, 0.8, 2.05, paint);
  b.obox([0, 0.86, 1.5], [1, 0, 0], [0, 0.995, 0.1], [0, -0.1, 0.995], [0.87, 0.04, 0.56], paint); // the bonnet, sloping down
  b.aabox(-0.85, 0.38, -2.05, 0.85, 0.92, -1.35, paint); // the boot
  // bumpers, grille, lights
  b.aabox(-0.89, 0.27, 2.02, 0.89, 0.46, 2.13, plastic);
  b.aabox(-0.89, 0.27, -2.13, 0.89, 0.46, -2.02, plastic);
  b.aabox(-0.42, 0.52, 2.04, 0.42, 0.74, 2.07, dark);
  for (const s of [-1, 1]) {
    b.aabox(s * 0.52 - 0.17, 0.6, 2.04, s * 0.52 + 0.17, 0.74, 2.08, { layer: L.WHITE, emit: [1.3, 1.3, 1.2] });
    b.aabox(s * 0.62 - 0.17, 0.66, -2.08, s * 0.62 + 0.17, 0.8, -2.04, { layer: L.WHITE, emit: [0.8, 0.07, 0.05] });
  }
  // the wheels: tyres, hubcaps
  for (const x of [-0.79, 0.79])
    for (const z of [-1.32, 1.32]) {
      b.geom(TYRE_CYL, x, 0.32, z, Math.PI / 2, 0.32, 0.22, 0.32, dark, Math.PI / 2);
      b.geom(TYRE_CYL, x + Math.sign(x) * 0.115, 0.32, z, Math.PI / 2, 0.2, 0.01, 0.2, chrome, Math.PI / 2);
    }
  // --- the cabin: pillars, roof, mirrors (the windows are glass)
  for (const s of [-1, 1]) {
    bar(b, [s * 0.84, 0.96, 0.93], [s * 0.76, 1.42, 0.33], 0.07, paint); // A
    b.aabox(s > 0 ? 0.79 : -0.86, 0.96, -0.48, s > 0 ? 0.86 : -0.79, 1.42, -0.36, paint); // B
    bar(b, [s * 0.84, 0.96, -1.38], [s * 0.76, 1.42, -1.16], 0.11, paint); // C
    b.aabox(s * 0.97 - 0.07, 0.95, 0.72, s * 0.97 + 0.07, 1.06, 0.8, { all: paint, nz: { layer: L.WHITE, tint: [0.45, 0.5, 0.55] } }); // wing mirror
    bar(b, [s * 0.88, 0.99, 0.78], [s * 0.92, 0.99, 0.77], 0.03, dark);
  }
  b.aabox(-0.8, 1.42, -1.22, 0.8, 1.47, 0.36, { all: paint, ny: lining });
  b.glass([-0.82, 0.96, 0.94], [1.64, 0, 0], [0, 0.47, -0.6], [0.55, 0.65, 0.72, 0.1]); // windscreen
  b.glass([-0.82, 0.96, -1.37], [1.64, 0, 0], [0, 0.47, 0.2], [0.55, 0.65, 0.72, 0.14]);
  for (const s of [-1, 1]) {
    b.glass([s * 0.86, 0.97, -0.36], [0, 0, 1.0], [0, 0.45, 0], [0.55, 0.65, 0.72, 0.08]);
    b.glass([s * 0.86, 0.97, -1.3], [0, 0, 0.82], [0, 0.45, 0], [0.55, 0.65, 0.72, 0.08]);
  }
  // --- inside: the dashboard, the dials, the console, the radio
  b.aabox(-0.84, 0.55, 0.6, 0.84, 0.86, 0.95, { all: plastic, py: softTop });
  b.obox([0, 0.9, 0.79], [1, 0, 0], [0, 0.96, -0.28], [0, 0.28, 0.96], [0.84, 0.045, 0.19], softTop); // the top, curving up to the glass
  b.aabox(-0.66, 0.66, 0.595, -0.16, 0.8, 0.6, { layer: L.WHITE, tint: [0.2, 0.2, 0.21] }); // glovebox
  for (const x of [-0.12, 0.12]) b.aabox(x - 0.07, 0.8, 0.592, x + 0.07, 0.84, 0.6, dark); // vents
  b.aabox(-0.12, 0.68, 0.593, 0.12, 0.77, 0.6, { layer: L.WHITE, emit: [0.12, 0.28, 0.42] }); // the radio
  b.aabox(0.2, 0.84, 0.5, 0.62, 0.99, 0.72, { all: dark, py: softTop }); // over the dials
  for (const [x, col] of [[0.33, [0.75, 0.5, 0.22]], [0.49, [0.5, 0.62, 0.8]]] as const) {
    b.geom(DIAL, x, 0.915, 0.497, 0, 0.055, 0.004, 0.055, { layer: L.WHITE, emit: col }, Math.PI / 2);
    b.obox([x + 0.015, 0.93, 0.493], [0.6, 0.8, 0], [-0.8, 0.6, 0], [0, 0, 1], [0.004, 0.035, 0.002], { layer: L.WHITE, emit: [1.4, 0.3, 0.1] }); // needle
  }
  b.aabox(-0.13, 0.38, -0.05, 0.13, 0.6, 0.6, { all: plastic, py: dark }); // console
  bar(b, [0, 0.6, 0.2], [0, 0.76, 0.14], 0.025, dark);
  b.geom(KNOB, 0, 0.78, 0.13, 0, 0.035, 0.035, 0.035, dark);
  bar(b, [WHEEL.x, 0.8, 0.52], [WHEEL.x, WHEEL.y - 0.02, WHEEL.z + 0.06], 0.07, dark); // steering column
  // the mirror, the sun visors
  b.aabox(-0.11, 1.28, 0.27, 0.11, 1.34, 0.3, { all: dark, pz: { layer: L.WHITE, tint: [0.4, 0.45, 0.5] } });
  bar(b, [0, 1.42, 0.3], [0, 1.33, 0.285], 0.02, dark);
  for (const x of [-0.4, 0.4]) b.aabox(x - 0.26, 1.385, 0.12, x + 0.26, 1.41, 0.34, lining);
  // the seats, the back seat
  for (const x of [-0.42, 0.42]) {
    b.aabox(x - 0.26, 0.5, -0.78, x + 0.26, 0.64, -0.2, cloth);
    b.obox([x, 0.95, -0.86], [1, 0, 0], [0, 0.98, -0.2], [0, 0.2, 0.98], [0.26, 0.32, 0.07], cloth);
    b.aabox(x - 0.13, 1.27, -0.98, x + 0.13, 1.42, -0.88, cloth);
  }
  b.aabox(-0.8, 0.5, -1.35, 0.8, 0.64, -1.0, cloth);
  b.obox([0, 0.92, -1.34], [1, 0, 0], [0, 0.97, -0.25], [0, 0.25, 0.97], [0.8, 0.3, 0.06], cloth);
}

// the steering wheel round its middle, facing -z (the driver)
function wheel(b: Builder) {
  const rim: Spec = { layer: L.WHITE, tint: [0.05, 0.05, 0.055] };
  b.geom(RIM, 0, 0, 0, 0, 1, 1, 1, rim);
  for (const a of [Math.PI / 2 + 0.2, Math.PI * 1.5 - 0.2, -0.1]) {
    const x = Math.cos(a) * 0.1, y = -Math.sin(a) * 0.1;
    b.obox([x, y, 0.01], [Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1], [0.09, 0.022, 0.012], rim);
  }
  b.aabox(-0.05, -0.04, -0.01, 0.05, 0.04, 0.05, { all: rim, nz: { layer: L.WHITE, tint: [0.25, 0.25, 0.27] } });
}

// a straight bar between two points (in car space)
function bar(b: Builder, p0: V3, p1: V3, th: number, s: Spec) {
  const d: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const l = Math.hypot(d[0], d[1], d[2]);
  const ax: V3 = [d[0] / l, d[1] / l, d[2] / l];
  let up: V3 = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const k = up[0] * ax[0] + up[1] * ax[1] + up[2] * ax[2];
  up = [up[0] - ax[0] * k, up[1] - ax[1] * k, up[2] - ax[2] * k];
  const ul = Math.hypot(up[0], up[1], up[2]);
  up = [up[0] / ul, up[1] / ul, up[2] / ul];
  const az: V3 = [ax[1] * up[2] - ax[2] * up[1], ax[2] * up[0] - ax[0] * up[2], ax[0] * up[1] - ax[1] * up[0]];
  b.obox([(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], ax, up, az, [l / 2, th / 2, th / 2], s);
}

// where the cars start: the ground floor of a parkeertoren, and some aisles of the parking
function homes(cx: number, cz: number): Car[] {
  const st = getStructure(cx, cz);
  const out: Car[] = [];
  const color = hash(303, cx, cz) % 8;
  // (in the middle aisle of a half of the parkeertoren, nose north)
  if (st.special === "park")
    for (let f = st.park === "e" ? 1 : 0; f <= FLOOR_MAX; f += 2)
      out.push({ key: `p${cx},${cz},${f}`, x: cx * CHUNK + (st.park === "e" ? 12.75 : 22.5), y: f * H, z: (cz * CH + 6.6) * CELL, rot: Math.PI, color: (color + f) % 8, pitch: 0 });
  else if (!st.special) {
    const p = getPlan(FLOOR_MIN, cx, cz);
    const ok = (x: number, z: number) => x >= 0 && x < CH && p.kind[z * CH + x] === K.GARAGE;
    const cands: number[] = [];
    for (let z = 0; z < CH; z++) {
      if ((((cz * CH + z) % 4) + 4) % 4 !== 3) continue; // an aisle
      for (let x = 1; x < CH - 1; x++) if (ok(x - 1, z) && ok(x, z) && ok(x + 1, z)) cands.push(z * CH + x);
    }
    if (cands.length) {
      const i = cands[hash(304, cx, cz) % cands.length]!;
      out.push({ key: `b${cx},${cz}`, x: (cx * CH + (i % CH) + 0.5) * CELL, y: FLOOR_MIN * H, z: (cz * CH + ((i / CH) | 0) + 0.2) * CELL, rot: Math.PI / 2, color, pitch: 0 });
    }
  }
  return out;
}

export class Cars {
  private cars = new Map<string, Car>();
  private scanT = 0;
  private saveT = 0;
  private storeKey: string;
  driving: Car | null = null;
  speed = 0;
  private steer = 0;
  private bumpT = 0;
  prompt = "";

  constructor(private scene: THREE.Scene, private mat: THREE.Material, private world: World, private player: Player, private sound: Sound, seed: number) {
    this.storeKey = `vrt-cars-${seed}`;
    try {
      const saved = JSON.parse(localStorage.getItem(this.storeKey) ?? "{}") as Record<string, Car>;
      for (const [k, c] of Object.entries(saved)) if (Number.isFinite(c.x)) this.cars.set(k, { ...c, key: k, pitch: 0, mesh: undefined });
    } catch {}
  }

  private save() {
    const o: Record<string, Omit<Car, "mesh" | "key" | "pitch">> = {};
    for (const c of this.cars.values()) {
      const home = homes(...this.chunkOf(c.key)).find((h) => h.key === c.key);
      if (home && Math.hypot(home.x - c.x, home.z - c.z) < 0.05 && Math.abs(home.rot - c.rot) < 0.01) continue; // still where it started
      o[c.key] = { x: c.x, y: c.y, z: c.z, rot: c.rot, color: c.color };
    }
    try {
      localStorage.setItem(this.storeKey, JSON.stringify(o));
    } catch {}
  }

  private chunkOf(key: string): [number, number] {
    const [a, b] = key.slice(1).split(",").map(Number); // (p<cx>,<cz>,<f> or b<cx>,<cz>)
    return [a!, b!];
  }

  private built(fn: (b: Builder) => void, k: number) {
    const b = new Builder(new LightCtx(0, 0, 0, "outdoor"));
    fn(b);
    const built = b.finish();
    for (let i = 0; i < built.light.length; i++) built.light[i]! *= k;
    const m = new THREE.Mesh(this.world.geometry(built), this.mat);
    m.frustumCulled = false;
    // the windows
    if (built.gpos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(built.gpos, 3));
      g.setAttribute("rgba", new THREE.BufferAttribute(built.gcol, 4));
      g.setIndex(new THREE.BufferAttribute(built.gindex, 1));
      const gm = new THREE.Mesh(g, this.world.glassMat);
      gm.frustumCulled = false;
      gm.renderOrder = 2;
      m.add(gm);
    }
    return m;
  }

  private makeMesh(c: Car) {
    // the car as parked, and inside it (behind its windows, so only seen from in it) the cockpit
    const m = this.built((b) => carModel(b, { layer: L.WHITE, tint: PAINT[c.color % PAINT.length]! }), 0.6);
    m.rotation.order = "YXZ";
    // the steering wheel, on its own so it can turn
    const w = this.built((b) => wheel(b), 0.45);
    w.position.set(WHEEL.x, WHEEL.y, WHEEL.z);
    w.userData.wheel = true;
    w.rotation.order = "XYZ";
    w.rotation.x = -0.5;
    m.add(w);
    this.scene.add(m);
    c.mesh = m;
    this.place(c);
  }

  private place(c: Car) {
    if (!c.mesh) return;
    c.mesh.position.set(c.x, c.y, c.z);
    c.mesh.rotation.set(-c.pitch, c.rot, 0);
  }

  // where on the ground a point of the car is, if a car can be there (feet at y)
  private groundFor(x: number, z: number, y: number): number | null {
    const g = this.world.groundAt(x, z, y);
    if (g === null) return null;
    const k = kindAt(Math.floor((g + 0.7) / H), Math.floor(x / CELL), Math.floor(z / CELL));
    return DRIVE.has(k) ? g : null;
  }

  // the car at (x, z, rot): its height and pitch, or null if it doesn't fit there
  private fit(c: Car, x: number, z: number, rot: number): { y: number; pitch: number } | null {
    const fx = Math.sin(rot), fz = Math.cos(rot);
    const f = Math.floor((c.y + 0.7) / H);
    const boxes = this.world.boxesNear(f, x, z, 3.5, []);
    const ys: number[] = [];
    for (const o of CIRCLES) {
      const px = x + fx * o, pz = z + fz * o;
      const g = this.groundFor(px, pz, c.y + (o * Math.sin(c.pitch)));
      if (g === null) return null;
      ys.push(g);
      for (let i = 0; i < boxes.length; i += 4) {
        const qx = Math.max(boxes[i]!, Math.min(px, boxes[i + 2]!)), qz = Math.max(boxes[i + 1]!, Math.min(pz, boxes[i + 3]!));
        if ((px - qx) ** 2 + (pz - qz) ** 2 < R * R) return null;
      }
    }
    return { y: ys[1]!, pitch: Math.atan2(ys[2]! - ys[0]!, CIRCLES[2]! - CIRCLES[0]!) };
  }

  private scan() {
    const P = this.player.pos;
    const cx0 = floorDiv(P.x, CHUNK), cz0 = floorDiv(P.z, CHUNK);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++)
        for (const h of homes(cx0 + dx, cz0 + dz)) if (!this.cars.has(h.key)) this.cars.set(h.key, h);
    // meshes for the cars near you, none for the rest
    for (const c of this.cars.values()) {
      const near = Math.hypot(c.x - P.x, c.z - P.z) < 48 && Math.abs(c.y - P.y) < 8;
      if (near && !c.mesh && this.world.isReady(Math.floor((c.y + 0.7) / H), floorDiv(c.x, CHUNK), floorDiv(c.z, CHUNK))) {
        const fit = this.fit(c, c.x, c.z, c.rot);
        if (fit) Object.assign(c, fit);
        this.makeMesh(c);
      } else if (!near && c.mesh && c !== this.driving) {
        this.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        c.mesh = undefined;
      }
    }
  }

  // get in
  private enter(c: Car) {
    this.driving = c;
    this.speed = 0;
    this.steer = 0;
    // keep looking where you were looking, relative to the car
    this.player.yaw = c.rot + Math.PI + 0;
    this.player.pitch = -0.08;
    this.seat();
  }

  // get out, on the driver's side if there's room, else anywhere round it
  leave(force = false) {
    const c = this.driving;
    if (!c) return false;
    if (!force && Math.abs(this.speed) > 0.6) return false;
    const fx = Math.sin(c.rot), fz = Math.cos(c.rot);
    const rx = fz, rz = -fx; // the driver's side (left, looking forward)
    const spots: [number, number][] = [[1.55, 0], [-1.55, 0], [0, 2.9], [0, -2.9], [1.55, 1.2], [-1.55, -1.2]];
    for (const [s, f] of spots) {
      const x = c.x + rx * s + fx * f, z = c.z + rz * s + fz * f;
      const g = this.world.groundAt(x, z, c.y);
      if (g === null) continue;
      const boxes = this.world.boxesNear(Math.floor((g + 0.7) / H), x, z, 1, []);
      let clear = true;
      for (let i = 0; i < boxes.length && clear; i += 4)
        if (x > boxes[i]! - 0.32 && x < boxes[i + 2]! + 0.32 && z > boxes[i + 1]! - 0.32 && z < boxes[i + 3]! + 0.32) clear = false;
      if (!clear) continue;
      this.player.pos.set(x, g, z);
      this.player.viewY = g;
      this.player.vx = this.player.vz = 0;
      this.driving = null;
      this.speed = 0;
      this.sound.engine(0, 0);
      this.save();
      return true;
    }
    if (force) {
      this.driving = null;
      this.sound.engine(0, 0);
      this.save();
      return true;
    }
    return false;
  }

  // you, in the driver's seat
  private seat() {
    const c = this.driving!;
    const fx = Math.sin(c.rot), fz = Math.cos(c.rot);
    const rx = fz, rz = -fx;
    this.player.pos.set(c.x + rx * SEAT.x + fx * SEAT.z, c.y, c.z + rz * SEAT.x + fz * SEAT.z);
    this.player.viewY = c.y + SEAT.y - EYE;
    this.player.vx = this.player.vz = 0;
  }

  // returns true when it used the E press
  update(dt: number, use: boolean, active: boolean): boolean {
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.5;
      this.scan();
    }
    this.bumpT = Math.max(0, this.bumpT - dt);
    const c = this.driving;
    if (!c) {
      this.prompt = "";
      const P = this.player.pos;
      let best: Car | null = null, bd = 2.8;
      for (const o of this.cars.values()) {
        if (!o.mesh || Math.abs(o.y - P.y) > 1) continue;
        const d = Math.hypot(o.x - P.x, o.z - P.z);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) {
        this.prompt = "E · INSTAPPEN";
        if (use && active) {
          this.enter(best);
          return true;
        }
      }
      return false;
    }
    // driving
    const k = this.player.keys, a = this.player.analog;
    let gas = 0, turn = 0;
    if (active) {
      if (k.has("KeyW") || k.has("ArrowUp")) gas += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) gas -= 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) turn += 1;
      if (k.has("KeyD") || k.has("ArrowRight")) turn -= 1;
      gas -= a.z;
      turn -= a.x;
    }
    gas = Math.max(-1, Math.min(1, gas));
    turn = Math.max(-1, Math.min(1, turn));
    // gas, brakes (the other way while still rolling), reverse, rolling to a stop
    if (gas > 0) this.speed += (this.speed < 0 ? 9 : 3.2) * gas * dt;
    else if (gas < 0) this.speed += (this.speed > 0 ? 9 : 2.2) * gas * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 2.2 * dt);
    // the slope pulls a little
    this.speed -= Math.sin(c.pitch) * 3 * dt;
    this.speed = Math.max(-BACK, Math.min(TOP, this.speed));
    this.steer += (turn * MAX_STEER * (1 - Math.min(0.5, Math.abs(this.speed) / 20)) - this.steer) * Math.min(1, dt * 6);
    const drot = (this.speed / WHEELBASE) * Math.tan(this.steer) * dt;
    const step = this.speed * dt;
    const rot = c.rot + drot;
    const nx = c.x + Math.sin(rot) * step, nz = c.z + Math.cos(rot) * step;
    let fit = this.fit(c, nx, nz, rot);
    if (fit) {
      c.x = nx; c.z = nz; c.rot = rot;
    } else if ((fit = this.fit(c, c.x, c.z, rot))) {
      // stopped against something, but the wheels still turn the car a little
      c.rot = rot;
      this.hit();
    } else {
      fit = this.fit(c, c.x, c.z, c.rot);
      this.hit();
    }
    if (fit) {
      c.y += (fit.y - c.y) * Math.min(1, dt * 12);
      c.pitch += (fit.pitch - c.pitch) * Math.min(1, dt * 10);
    }
    this.player.yaw += drot; // the view turns with the car
    this.place(c);
    const w = c.mesh?.children.find((o) => o.userData.wheel);
    if (w) w.rotation.z = this.steer * 2.6;
    this.seat();
    this.player.speed = 0; // (the pedometer counts walking)
    this.sound.engine(1, Math.min(1, Math.abs(this.speed) / TOP * 0.8 + Math.abs(gas) * 0.25));
    this.prompt = Math.abs(this.speed) < 0.6 ? "E · UITSTAPPEN" : "";
    if ((this.saveT -= dt) <= 0) {
      this.saveT = 3;
      this.save();
    }
    if (use && active) {
      this.leave();
      return true;
    }
    return false;
  }

  private hit() {
    if (Math.abs(this.speed) > 1.2 && this.bumpT <= 0) {
      this.sound.bump(Math.abs(this.speed));
      this.player.shake = Math.min(1, Math.abs(this.speed) / 6);
      this.bumpT = 0.4;
    }
    this.speed *= -0.2;
  }

  // the camera in the driver's seat follows the car's pitch too
  apply(cam: THREE.PerspectiveCamera) {
    const c = this.driving;
    if (!c) return;
    cam.rotation.set(this.player.pitch + c.pitch * Math.cos(this.player.yaw - c.rot - Math.PI), this.player.yaw, 0, "YXZ");
  }
}
