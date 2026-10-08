// Home. Step into a train at Meiser and it takes you to Mortsel-Oude-God: the
// platforms down in the cutting, partly under the Stadsplein, with their white
// walls, strip lights and the blue name boards; the stairs up into the glass
// station building of 1974 under its big steel canopy; the Stadsplein, the
// Statielei with tram 15, and on the corner of the Prins Leopoldlei and the
// Floralaan, number 1. Indoors under a painted sky, like everything else.
// It's evening when you get there. Go in at number 1 and you sleep (bus 6, at
// the top); in the morning the train to Brussel stops at perron 1 and takes you
// back to Meiser, to work.
// Built on first use with ordinary three.js materials and lights; while you're
// here the building is hidden and this is the only thing drawn (like finale.ts).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Sound, Surface } from "./audio";
import type { Ground, Player } from "./player";
import type { World } from "./world";
import { canvasTex, metreUV, speckle } from "./finale";
import { RAIL, TRAIN_DOORS, TRAIN_LEN, Train } from "./trains";

// --- the plan, in metres: x east, z south (north is -z), the street at y = 0
const W = 48, Z0 = -106, Z1 = 64, TOP = 26; // the hall
export const PY = -6.2; // the platforms
const TB = PY - 0.85; // the track bed
const RX = 9.5; // the walls of the railway, x = ±RX
const TRK = 2.25; // the tracks, x = ±TRK (west: to Antwerpen, east: to Brussel)
const EDGE = 4.5; // the platform edges, x = ±EDGE
const PZ = [-68, 6] as const; // the platforms
const COVER = -38; // south of this the railway runs under the square and the street
const PORTAL = -100; // the tunnel to the north
const DARK = PZ[1] + 3; // and the dark to the south
const ST = { x0: 7.2, x1: RX, top: -33, bot: -21 }; // the stairs, one on each side (mirrored), up to the north
const STOP = -31; // the middle of a train at the platform
const PAV = { x0: -12, x1: 12, z0: -37, z1: -19, h: 3.4 }; // the glass station building
const CAN = { x0: -22, x1: 22, z0: -44, z1: -14, y: 4.3 }; // its canopy (the space frame under y + 1.1)
const ROAD = [2.5, 12.5] as const; // the Statielei (pavements on both sides, to z = 0 and z = 15)
const SOUTH = 15.5; // the houses on the south side of the Statielei
// number 1: its front on the corner, the Prins Leopoldlei going off to the south-west, the Floralaan to the south-east
const A: P2 = [-4.5, 18], B: P2 = [4.5, 18];
const DW = norm([-0.65, 0.76]), DE = norm([0.64, 0.77]);
const NW = norm([-DW[1], DW[0]]), NE = norm([DE[1], -DE[0]]); // the faces' outward normals
export const DOOR = { x: 0, z: A[1] }; // the front door
const HOME_H = 12.1; // ground floor and three floors above it

type P2 = [number, number];
function norm(v: P2): P2 {
  const l = Math.hypot(v[0], v[1]);
  return [v[0] / l, v[1] / l];
}
const along = (p: P2, d: P2, t: number): P2 => [p[0] + d[0] * t, p[1] + d[1] * t];

// --- where you can stand: the street (minus the cutting and the stairwells), the platforms, the stairs
type Rect = [number, number, number, number]; // x0, z0, x1, z1
const HOLES: Rect[] = [[-RX, PORTAL, RX, COVER], [-ST.x1, ST.top, -ST.x0, ST.bot], [ST.x0, ST.top, ST.x1, ST.bot]];
const inR = (r: Rect, x: number, z: number) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
const stairH = (z: number) => PY * Math.min(1, Math.max(0, (z - ST.top) / (ST.bot - ST.top)));

// The height of the ground under (x, z) for feet at y, or null (a wall, the tracks, a drop).
export function mortselGround(x: number, z: number, y: number): number | null {
  let best: number | null = null;
  const take = (h: number) => {
    if (Math.abs(h - y) <= 0.45 && (best === null || Math.abs(h - y) < Math.abs(best - y))) best = h;
  };
  if (x > -W + 0.5 && x < W - 0.5 && z > Z0 + 0.5 && z < Z1 - 0.5 && !HOLES.some((r) => inR(r, x, z))) take(0);
  // (under the stairs it's solid: on the platform you'd always be closer to the floor than to the next step)
  const stair = Math.abs(x) >= ST.x0 && Math.abs(x) <= ST.x1 && z >= ST.top && z <= ST.bot;
  if (stair) take(stairH(z));
  else if (Math.abs(x) >= EDGE && Math.abs(x) <= RX && z >= PZ[0] && z <= PZ[1]) take(PY);
  return best;
}

// rectangle minus holes, as rectangles (for the floors)
function cut(r: Rect, holes: Rect[]): Rect[] {
  const xs = [...new Set([r[0], r[2], ...holes.flatMap((h) => [h[0], h[2]]).filter((v) => v > r[0] && v < r[2])])].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i]!, xb = xs[i + 1]!, xm = (xa + xb) / 2;
    const hs = holes.filter((h) => xm > h[0] && xm < h[2] && h[3] > r[1] && h[1] < r[3]);
    const zs = [...new Set([r[1], r[3], ...hs.flatMap((h) => [h[1], h[3]]).filter((v) => v > r[1] && v < r[3])])].sort((a, b) => a - b);
    for (let j = 0; j < zs.length - 1; j++) {
      const zm = (zs[j]! + zs[j + 1]!) / 2;
      if (!hs.some((h) => zm > h[1] && zm < h[3])) out.push([xa, zs[j]!, xb, zs[j + 1]!]);
    }
  }
  return out;
}

// a seeded random, so the street is the same every time
function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const NMBS = "#0b2d6b";

type Phase = "off" | "out" | "ride" | "arrive" | "evening" | "sleep" | "night" | "morning" | "leave" | "rideback" | "back";
type Box = { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number };
type Spot = { x: number; y: number; z: number; yaw: number };
type Run = { mode: "in" | "stopped" | "out" | "gone"; t: number; north: boolean };

export class Mortsel implements Ground {
  root = new THREE.Group();
  phase: Phase = "off";
  fade = 1; // 0 black .. 1 picture
  prompt = "";
  day = 1;
  onEnter = () => {}; // this takes the building's place
  onSlept = (_day: number) => {}; // the next morning
  onLeave = () => {}; // back at Meiser
  onBig: (text: string, sub: string) => void = () => {};
  onToast: (title: string, body: string) => void = () => {};
  private t = 0;
  private built = false;
  private boxes: Box[] = [];
  private from: Spot = { x: 0, y: 0, z: 0, yaw: 0 };
  private train: Train | null = null;
  private run: Run = { mode: "gone", t: 0, north: true };
  private called = false; // the morning train is on its way
  private sky: { mat: THREE.MeshBasicMaterial[]; eve: THREE.Texture[]; morn: THREE.Texture[] } | null = null;
  private lights: { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; lamps: THREE.PointLight[] } | null = null;
  private glow: THREE.MeshLambertMaterial[] = []; // lit windows and lamps: on in the evening
  private boards: { mat: THREE.MeshLambertMaterial; eve: THREE.Texture; morn: THREE.Texture }[] = [];

  constructor(private player: Player, private sound: Sound, private world: World, private shadows: boolean) {
    this.root.visible = false;
    this.day = Number(localStorage.getItem("vrt-dag")) || 1;
  }

  get active() {
    return this.phase !== "off" && this.phase !== "back";
  }
  // you're here (not on the way, not back yet)
  get here() {
    return this.phase !== "off" && this.phase !== "out" && this.phase !== "ride" && this.phase !== "back";
  }
  get walking() {
    return this.phase === "arrive" || this.phase === "evening" || this.phase === "morning";
  }

  // in a train at Meiser: you get off at Mortsel-Oude-God (and come back here)
  board(from: Spot) {
    if (this.phase !== "off" && this.phase !== "back") return;
    this.from = from;
    this.go("out");
    this.sound.trainDoors(0.8, 0);
    if (!this.built) this.build();
  }

  private go(p: Phase) {
    this.phase = p;
    this.t = 0;
  }

  surface(x: number, z: number): Surface {
    const y = this.player.pos.y;
    if (y < -0.3) return Math.abs(x) >= ST.x0 && z >= ST.top && z <= ST.bot && y > PY + 0.2 ? "stair" : "concrete";
    if (inR([PAV.x0, PAV.z0, PAV.x1, PAV.z1], x, z)) return "tile";
    return "concrete";
  }

  // what the HUD says: where, and the address
  where(): [string, string] {
    const P = this.player.pos;
    if (P.y < -0.3) return [P.x < 0 ? "PERRON 2 · ANTWERPEN" : "PERRON 1 · BRUSSEL", "STATION MORTSEL-OUDE-GOD"];
    if (inR([CAN.x0, CAN.z0, CAN.x1, PAV.z1], P.x, P.z)) return ["STATION MORTSEL-OUDE-GOD", "STADSPLEIN 5"];
    if (P.z < 0) return ["STADSPLEIN", "STADSPLEIN"];
    if (Math.hypot(P.x - DOOR.x, P.z - DOOR.z) < 6) return ["PRINS LEOPOLDLEI 1", "PRINS LEOPOLDLEI 1"];
    if (P.z < SOUTH) return ["STATIELEI", "STATIELEI"];
    return P.x < 0 ? ["PRINS LEOPOLDLEI", "PRINS LEOPOLDLEI"] : ["FLORALAAN", "FLORALAAN"];
  }

  update(dt: number, use: boolean) {
    this.t += dt;
    const P = this.player, t = this.t;
    this.prompt = "";
    switch (this.phase) {
      case "out": // the doors close behind you, the picture goes
        this.fade = Math.max(0, 1 - t / 1.1);
        if (t > 1.2) {
          this.go("ride");
          this.sound.train(0.5, 0, 0, false);
          this.onBig("VOLGENDE HALTE", "Mortsel-Oude-God");
        }
        break;
      case "ride":
        this.fade = 0;
        if (t > 3.4) this.arrive();
        break;
      case "arrive":
        this.fade = Math.min(1, t / 1.4);
        if (t > 0.6 && t - dt <= 0.6) this.sound.say("Mortsel-Oude-God.", 1, 0.95);
        if (t > 1.6) {
          this.go("evening");
          this.onToast("MORTSEL-OUDE-GOD", "Naar huis: de trap op, de Statielei over, Prins Leopoldlei 1.");
        }
        break;
      case "sleep": // in at the door, the picture goes
        this.fade = Math.max(0, 1 - t / 1.2);
        if (t > 1.3) {
          this.go("night");
          this.onBig("SLAAPWEL", "Prins Leopoldlei 1 bus 6");
        }
        break;
      case "night":
        this.fade = 0;
        if (t > 3.4 && t - dt <= 3.4) {
          this.day++;
          localStorage.setItem("vrt-dag", String(this.day));
          this.onBig(`DAG ${this.day}`, "de volgende ochtend");
          this.sound.alarm();
        }
        if (t > 4.8) this.wake();
        break;
      case "morning":
        this.fade = Math.min(1, t / 1.6);
        if (t > 1.8 && t - dt <= 1.8) this.onToast("GOEIEMORGEN", "Tijd om te werken. De trein naar Brussel stopt aan perron 1.");
        // the train to Brussel comes as you go into the station
        if (!this.called && (P.pos.y < -0.5 || inR([PAV.x0, PAV.z0, PAV.x1, PAV.z1], P.pos.x, P.pos.z))) {
          this.called = true;
          this.run = { mode: "in", t: 0, north: false };
          this.sound.bingBong();
          setTimeout(() => this.sound.say("Spoor 1. De trein naar Brussel-Zuid, via Meiser, komt binnen.", 1, 0.95), 1200);
        }
        break;
      case "leave":
        this.fade = Math.max(0, 1 - t / 1.1);
        if (t > 1.2) {
          this.go("rideback");
          this.sound.train(0.5, 0, 0, false);
          this.onBig("VOLGENDE HALTE", "Meiser");
        }
        break;
      case "rideback":
        this.fade = 0;
        if (t > 3.4) this.back();
        break;
      case "back":
        this.fade = Math.min(1, t / 1.2);
        if (t > 1.3) this.phase = "off";
        break;
    }
    if (this.here) this.moveTrain(dt);
    if (!this.walking) return;
    // the front door
    const P2 = P.pos, atDoor = P2.y > -0.3 && Math.abs(P2.x - DOOR.x) < 1.6 && P2.z < DOOR.z && P2.z > DOOR.z - 2;
    if (atDoor) {
      if (this.phase === "evening") {
        this.prompt = "E · NAAR BINNEN · slapen";
        if (use) {
          this.sound.frontDoor();
          this.go("sleep");
        }
      } else this.prompt = "Uitgeslapen. Naar je werk: de trein aan perron 1";
      return;
    }
    if (P2.y > PY + 0.5) return;
    // on a platform
    if (this.phase === "evening") {
      this.prompt = "Geen treinen meer vandaag · ga slapen: Prins Leopoldlei 1";
      return;
    }
    if (this.run.mode !== "stopped" || this.run.t < 1.5) {
      if (this.phase === "morning") this.prompt = P2.x > 0 ? "De trein naar Brussel komt binnen" : "De trein naar Brussel: perron 1, aan de overkant";
      return;
    }
    const tz = STOP - TRAIN_LEN / 2;
    if (P2.x > EDGE && P2.x < EDGE + 2.2 && TRAIN_DOORS.some((d) => Math.abs(tz + d - P2.z) < 1.3)) {
      this.prompt = "E · INSTAPPEN · trein naar Brussel-Zuid, via Meiser";
      if (use) {
        this.sound.trainDoors(0.8, 0);
        this.go("leave");
      }
    }
  }

  // off the train, on perron 2, in the evening; the train goes on to Antwerpen
  private arrive() {
    this.root.visible = true;
    this.setTime(false);
    this.onEnter();
    const P = this.player;
    P.pos.set(-5.3, PY, STOP + TRAIN_LEN / 2 - TRAIN_DOORS[2]!);
    P.viewY = PY;
    P.vx = P.vz = 0;
    P.yaw = Math.PI - 0.5;
    P.pitch = 0;
    P.keys.clear();
    this.run = { mode: "stopped", t: 1.5, north: true };
    this.called = false;
    this.go("arrive");
  }

  // the next morning, outside the front door
  private wake() {
    this.setTime(true);
    const P = this.player;
    P.pos.set(DOOR.x, 0, DOOR.z - 1.2);
    P.viewY = 0;
    P.vx = P.vz = 0;
    P.yaw = 0;
    P.pitch = 0.05;
    P.keys.clear();
    this.run = { mode: "gone", t: 0, north: false };
    this.called = false;
    this.onSlept(this.day);
    this.go("morning");
  }

  // off the train at Meiser, where you got on
  private back() {
    this.root.visible = false;
    this.run = { mode: "gone", t: 0, north: false };
    const P = this.player, f = this.from;
    P.pos.set(f.x, f.y, f.z);
    P.viewY = f.y;
    P.vx = P.vz = 0;
    P.yaw = f.yaw;
    P.pitch = 0;
    P.keys.clear();
    this.go("back");
    this.onLeave();
  }

  // the train in the station: in from the tunnel, stopped, and out again
  private moveTrain(dt: number) {
    const tr = this.train;
    if (!tr) return;
    const r = this.run, ACC = 1.2;
    r.t += dt;
    const north = r.north, dir = north ? -1 : 1; // the way it's going, in z
    let s = 0; // past the stop
    if (r.mode === "in") {
      const run = Math.abs((north ? DARK : PORTAL) - STOP) + 2 + TRAIN_LEN / 2, T = Math.sqrt((2 * run) / ACC);
      if (r.t >= T) {
        r.mode = "stopped";
        r.t = 0;
      } else s = -run + ACC * T * r.t - (ACC * r.t * r.t) / 2;
      if (r.t > T - 3 && r.t - dt <= T - 3) this.sound.brake(0.8, 0);
    } else if (r.mode === "out") {
      s = (ACC * r.t * r.t) / 2;
      if (s > 140) r.mode = "gone";
    }
    // (the one you came on goes on to Antwerpen; the morning one waits for you)
    if (r.mode === "stopped" && north && r.t > 4.5) {
      r.mode = "out";
      r.t = 0;
      this.sound.train(0.7, 0, 0, false);
    }
    if (r.mode === "stopped" && north && r.t > 2 && r.t - dt <= 2) this.sound.trainDoors(0.9, -0.3);
    if (r.mode === "stopped" && !north && r.t > 1.5 && r.t - dt <= 1.5) this.sound.ding(0.6, 0.3);
    const m = tr.mesh;
    m.visible = r.mode !== "gone";
    if (!m.visible) return;
    const zc = STOP + dir * s;
    m.rotation.y = north ? Math.PI / 2 : -Math.PI / 2;
    m.position.set(north ? -TRK : TRK, TB + RAIL, zc - dir * TRAIN_LEN / 2);
    tr.doors(r.mode !== "stopped" ? 0 : north ? Math.max(0, Math.min(1, 3 - r.t)) : Math.max(0, Math.min(1, r.t - 1.5)));
  }

  // evening or morning: the sky, the sun, the lamps and the lit windows
  private setTime(morning: boolean) {
    const s = this.sky, l = this.lights;
    if (!s || !l) return;
    s.mat.forEach((m, i) => {
      m.map = (morning ? s.morn : s.eve)[i]!;
      m.needsUpdate = true;
    });
    l.hemi.color.set(morning ? 0xdfe8f5 : 0x6c7aa8);
    l.hemi.groundColor.set(morning ? 0x948c7e : 0x2c2622);
    l.hemi.intensity = morning ? 2.1 : 0.75;
    l.sun.color.set(morning ? 0xfff0da : 0xff9a5c);
    l.sun.intensity = morning ? 2.2 : 0.9;
    l.sun.position.set(morning ? 50 : -60, morning ? 38 : 16, morning ? -25 : 12);
    for (const p of l.lamps) p.visible = !morning;
    for (const m of this.glow) m.emissiveIntensity = morning ? 0.08 : 1;
    for (const b of this.boards) {
      b.mat.map = morning ? b.morn : b.eve;
      b.mat.emissiveMap = b.mat.map;
      b.mat.needsUpdate = true;
    }
  }

  // --- Ground, for the player
  boxesNear(_f: number, x: number, z: number, r: number, out: number[]) {
    out.length = 0;
    const y = this.player.pos.y;
    for (const b of this.boxes)
      if (b.x0 < x + r && b.x1 > x - r && b.z0 < z + r && b.z1 > z - r && b.y0 < y + 1.7 && b.y1 > y + 0.3) out.push(b.x0, b.z0, b.x1, b.z1);
    return out;
  }

  groundAt(x: number, z: number, y: number) {
    return mortselGround(x, z, y);
  }

  // --- the place
  private build() {
    this.built = true;
    const R = this.root;
    const statics = new THREE.Group(); // merged by material at the end
    const lam = (map: THREE.Texture | null, color = 0xffffff, o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ map, color, ...o });
    // underground: lit by the strip lights whatever the time
    const low = (map: THREE.Texture | null, color = 0xffffff, k = 0.6) => lam(map, color, { emissive: new THREE.Color(color).multiplyScalar(k), emissiveMap: map });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, parent: THREE.Object3D = statics) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = this.shadows;
      parent.add(m);
      return m;
    };
    const solid = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => this.boxes.push({ x0, z0, x1, z1, y0, y1 });
    const block = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material | THREE.Material[], scale = 2, hit = true) => {
      if (hit) solid(x0, z0, x1, z1, y0, y1);
      return add(metreUV(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), scale), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    };
    const floor = (r: Rect, y: number, mat: THREE.Material, scale = 2) => {
      const g = new THREE.PlaneGeometry(r[2] - r[0], r[3] - r[1]).rotateX(-Math.PI / 2);
      const uv = g.attributes.uv!, p = g.attributes.position!;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + (r[0] + r[2]) / 2) / scale, (p.getZ(i) + (r[1] + r[3]) / 2) / scale);
      add(g, mat, (r[0] + r[2]) / 2, y, (r[1] + r[3]) / 2);
    };
    // a wall from p to q, solid along the line (in steps if it's at an angle)
    const wallHit = (p: P2, q: P2, y0: number, y1: number) => {
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.5));
      if (p[0] === q[0] || p[1] === q[1]) return solid(Math.min(p[0], q[0]) - 0.05, Math.min(p[1], q[1]) - 0.05, Math.max(p[0], q[0]) + 0.05, Math.max(p[1], q[1]) + 0.05, y0, y1);
      for (let i = 0; i <= n; i++) {
        const x = p[0] + ((q[0] - p[0]) * i) / n, z = p[1] + ((q[1] - p[1]) * i) / n;
        solid(x - 0.25, z - 0.25, x + 0.25, z + 0.25, y0, y1);
      }
    };
    // a facade from p to q, facing n, h high, with a body d deep behind it
    const front = (p: P2, q: P2, n: P2, h: number, mat: THREE.Material, body: THREE.Material, d = 10) => {
      const a = Math.atan2(n[0], n[1]), right: P2 = [Math.cos(a), -Math.sin(a)];
      if ((q[0] - p[0]) * right[0] + (q[1] - p[1]) * right[1] < 0) [p, q] = [q, p];
      const w = Math.hypot(q[0] - p[0], q[1] - p[1]), mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
      add(new THREE.PlaneGeometry(w, h), mat, mx + n[0] * 0.02, h / 2, mz + n[1] * 0.02).rotation.y = a;
      add(new THREE.BoxGeometry(w, h, d), body, mx - (n[0] * d) / 2, h / 2, mz - (n[1] * d) / 2).rotation.y = a;
      wallHit(p, q, 0, h);
    };

    // light: a low sun through the painted sky, the sky itself, the lamps
    const hemi = new THREE.HemisphereLight(0x6c7aa8, 0x2c2622, 0.75);
    const sun = new THREE.DirectionalLight(0xff9a5c, 0.9);
    sun.target.position.set(0, 0, -20);
    if (this.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera;
      c.left = -95; c.right = 95; c.top = 95; c.bottom = -95; c.near = 1; c.far = 220;
      sun.shadow.bias = -0.0008;
      sun.shadow.normalBias = 0.05;
    }
    R.add(hemi, sun, sun.target);
    const lamps: THREE.PointLight[] = [];
    const lamp = (x: number, y: number, z: number, c: number, i: number, d: number) => {
      const p = new THREE.PointLight(c, i, d, 1.2);
      p.position.set(x, y, z);
      R.add(p);
      return p;
    };
    // the strip lights down on the platforms (always on), the street lamps by the house (evenings)
    for (const z of [-58, -40, -22, -4]) lamp(0, PY + 4, z, 0xeef3ff, 22, 30);
    lamps.push(lamp(-7, 6, 13, 0xffc27a, 14, 26), lamp(7, 6, 13, 0xffc27a, 14, 26), lamp(0, 2.5, A[1] - 0.6, 0xffd29a, 5, 9), lamp(0, 3.6, -26, 0xffd9a0, 8, 22));
    this.lights = { hemi, sun, lamps };

    // --- textures
    const pavers = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#8f8d88";
      g.fillRect(0, 0, w, h);
      const s = 64; // 30 cm tiles
      for (let y = 0; y < h; y += s)
        for (let x = 0; x < w; x += s) {
          const v = 140 + (Math.random() - 0.5) * 22;
          g.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
          g.fillRect(x + 1.5, y + 1.5, s - 3, s - 3);
        }
      speckle(g, w, h, 16);
    }, true);
    const clinker = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#2c2d30";
      g.fillRect(0, 0, w, h);
      const bw = 64, bh = 26;
      for (let r = 0; r < h / bh; r++)
        for (let c = -1; c < w / bw + 1; c++) {
          const v = 70 + (Math.random() - 0.5) * 26;
          g.fillStyle = `rgb(${v},${v + 1},${v + 5})`;
          g.fillRect(c * bw + (r % 2) * (bw / 2) + 2, r * bh + 2, bw - 4, bh - 4);
        }
      speckle(g, w, h, 14);
    }, true);
    const asphalt = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#3b3c3e";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 26);
    }, true);
    const grass = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#4f6e31";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2400; i++) {
        g.fillStyle = `hsl(${85 + Math.random() * 20},${35 + Math.random() * 20}%,${22 + Math.random() * 16}%)`;
        g.fillRect(Math.random() * w, Math.random() * h, 1.5, 3 + Math.random() * 3);
      }
    }, true);
    const concrete = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#97948e";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(60,58,55,0.18)";
      for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 2); // the shuttering
      speckle(g, w, h, 20);
    }, true);
    const platformT = canvasTex(512, 512, (g, w, h) => {
      // red-brown pavers in rows, with lighter bands
      g.fillStyle = "#5d3f36";
      g.fillRect(0, 0, w, h);
      const bw = 42, bh = 21;
      for (let r = 0; r < h / bh; r++)
        for (let c = -1; c < w / bw + 1; c++) {
          const band = Math.floor(r / 6) % 3 === 1;
          const v = (Math.random() - 0.5) * 18;
          g.fillStyle = band ? `rgb(${150 + v},${132 + v},${120 + v})` : `rgb(${128 + v},${78 + v},${64 + v})`;
          g.fillRect(c * bw + (r % 2) * (bw / 2) + 1.5, r * bh + 1.5, bw - 3, bh - 3);
        }
      speckle(g, w, h, 12);
    }, true);
    const whiteWall = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#e9e8e2";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 8);
      g.fillStyle = "rgba(120,115,100,0.08)";
      for (let i = 0; i < 30; i++) g.fillRect(Math.random() * w, h - Math.random() * 60, 2 + Math.random() * 30, 60);
    }, true);
    const ballast = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#4a4743";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1800; i++) {
        const v = 50 + Math.random() * 70;
        g.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 0, 7);
        g.fill();
      }
    }, true);
    const graffiti = canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = "#a6a39c";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 18);
      for (let x = 0; x < w; x += 128) {
        g.fillStyle = "rgba(60,58,55,0.4)";
        g.fillRect(x, 0, 2, h);
      }
      const tags = ["SUMO", "SRKS⇢512", "BAZE", "NYC", "ZUP 305", "KOEN", "OUDE GOD", "AW 2640"];
      const cols = ["#2b3a8f", "#9c2b2b", "#1d1d1d", "#d0d0d0", "#2c6e3a"];
      for (let i = 0; i < 9; i++) {
        g.save();
        g.translate(30 + Math.random() * (w - 160), 70 + Math.random() * 40);
        g.rotate((Math.random() - 0.5) * 0.12);
        g.font = `italic 800 ${34 + Math.random() * 26}px ${FONT}`;
        g.strokeStyle = cols[i % cols.length]!;
        g.lineWidth = 3;
        g.strokeText(tags[i % tags.length]!, 0, 0);
        g.restore();
      }
    }, true);
    // the blue name board
    const nameTex = canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = NMBS;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#fff";
      g.lineWidth = 7;
      g.strokeRect(12, 12, w - 24, h - 24);
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `700 70px ${FONT}`;
      g.fillText("Mortsel - Oude God", w / 2, h / 2 + 4);
    });
    const numTex = (n: string) =>
      canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = "#1d5fc6";
        g.fillRect(0, 0, w, h);
        g.strokeStyle = "#fff";
        g.lineWidth = 6;
        g.strokeRect(8, 8, w - 16, h - 16);
        g.fillStyle = "#fff";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = `700 86px ${FONT}`;
        g.fillText(n, w / 2, h / 2 + 4);
      });
    // the departures: nothing more tonight, the train to Brussel in the morning
    const board = (lines: [string, string, string][]) =>
      canvasTex(512, 256, (g, w, h) => {
        g.fillStyle = "#0a1630";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#ffd23c";
        g.font = `700 22px ${FONT}`;
        g.fillText("VERTREK · DÉPART", 18, 34);
        g.font = `600 26px ${FONT}`;
        lines.forEach(([a, b, c], i) => {
          g.fillStyle = "#fff";
          g.fillText(a, 18, 84 + i * 50);
          g.fillText(b, 110, 84 + i * 50);
          g.fillStyle = "#ffd23c";
          g.fillText(c, w - 60, 84 + i * 50);
        });
      });
    const boardEve = board([["--:--", "Geen treinen meer", ""], ["", "Goede nacht", ""]]);
    const boardMorn = board([["07:42", "Brussel-Zuid", "1"], ["", "via Meiser", ""], ["07:51", "Antwerpen-C.", "2"]]);

    // --- the street level: pavement everywhere but the cutting and the stairwells
    const pave = lam(pavers);
    for (const r of cut([-W, Z0, W, Z1], HOLES)) floor(r, 0, pave, 2.4);
    const over = (r: Rect, y: number, mat: THREE.Material, scale = 2) => {
      for (const c of cut(r, HOLES)) floor(c, y, mat, scale);
    };
    over([CAN.x0 - 4, CAN.z1, CAN.x1 + 4, 0], 0.004, lam(clinker), 2.5); // the Stadsplein
    over([PAV.x0, PAV.z0, PAV.x1, PAV.z1], 0.006, lam(pavers, 0xd8d2c4), 1.2); // inside the station
    over([-W, ROAD[0], W, ROAD[1]], 0.008, lam(asphalt), 4); // the Statielei
    // the grass along the cutting, north of the square
    const grassM = lam(grass);
    over([-W, Z0, -RX - 2, -50], 0.005, grassM, 3);
    over([RX + 2, Z0, 24, -50], 0.005, grassM, 3);
    // the Prins Leopoldlei and the Floralaan: asphalt between the pavements, at an angle
    const asphaltM = lam(asphalt);
    for (const [p, d, n] of [[A, DW, NW], [B, DE, NE]] as const) {
      const c = along(along(p, n, 5.6), d, 33);
      const g = new THREE.PlaneGeometry(7, 70).rotateX(-Math.PI / 2);
      const m = add(metreUV(g, 4), asphaltM, c[0], 0.009, c[1]);
      m.rotation.y = Math.atan2(d[0], d[1]);
    }
    // the zebra crossing to number 1
    const zebra = lam(null, 0xe8e8e2);
    for (let z = ROAD[0] + 0.5; z < ROAD[1] - 0.4; z += 1) block(-2.2, 0.011, z, 2.2, 0.013, z + 0.5, zebra, 2, false).castShadow = false;
    // the tram rails in the Statielei, both ways
    const steel = lam(null, 0x9a9da0);
    for (const zc of [5.3, 9.7]) for (const dz of [-0.72, 0.72]) block(-W, 0.009, zc + dz - 0.04, W, 0.02, zc + dz + 0.04, steel, 2, false).castShadow = false;

    // --- the cutting and the tunnel under the square
    const wallM = low(whiteWall, 0xdedcd6, 0.55);
        const outConc = lam(concrete);
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -RX - 0.4 : RX, x1 = s < 0 ? -RX : RX + 0.4;
      // the walls: white along the platforms under the square, concrete in the open
      block(x0, TB, COVER, x1, -0.6, DARK, wallM, 2);
      block(x0, TB, PORTAL, x1, 0, COVER, outConc, 3);
      // the railing on top, in the open
      for (let z = PORTAL; z < COVER; z += 2) block(x0 + 0.15 * s, 0, z, x1 + 0.15 * s, 1.05, z + 0.06, steel, 2, false);
      block(Math.min(x0, x1 + 0.3 * s), 1.0, PORTAL, Math.max(x0, x1 + 0.3 * s), 1.08, COVER, steel, 2, false);
      solid(s < 0 ? -RX - 0.7 : RX, PORTAL, s < 0 ? -RX : RX + 0.7, COVER, -1, 1.1);
      // the strip light, and the dark band of cables above it
      block(Math.min(s * (RX - 0.05), s * (RX - 0.12)), PY + 3.1, Math.max(COVER, PZ[0]), Math.max(s * (RX - 0.05), s * (RX - 0.12)), PY + 3.22, PZ[1], lam(null, 0xffffff, { emissive: new THREE.Color(1.6, 1.6, 1.55) }), 2, false);
      block(Math.min(s * (RX - 0.02), s * (RX - 0.2)), PY + 4.0, COVER, Math.max(s * (RX - 0.02), s * (RX - 0.2)), PY + 4.25, DARK, low(null, 0x3a3b3d, 0.2), 2, false);
    }
    // the ribbed underside of the square
    const under = low(concrete, 0x8a8782, 0.55);
    for (const r of cut([-RX, COVER, RX, DARK], HOLES)) block(r[0], -0.6, r[1], r[2], -0.006, r[3], under, 3, false);
    const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.45, 0.32), under, Math.ceil((DARK - COVER) / 1.4));
    for (let i = 0, z = COVER + 0.7; z < DARK; z += 1.4, i++) {
      const w = z > ST.top && z < ST.bot ? 2 * ST.x0 : 2 * RX;
      ribs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(0, -0.82, z).scale(new THREE.Vector3(w, 1, 1)));
    }
    R.add(ribs);
    // the dark at either end: the tunnel north (a portal in the open cutting) and the tunnel south
    const black = new THREE.MeshBasicMaterial({ color: 0x050505 });
    block(-RX, TB, DARK, RX, -0.3, DARK + 0.4, black, 2, false);
    block(-RX, TB, PORTAL - 0.6, -4.6, 0, PORTAL, outConc, 3, false);
    block(4.6, TB, PORTAL - 0.6, RX, 0, PORTAL, outConc, 3, false);
    block(-4.6, TB + 5.6, PORTAL - 0.6, 4.6, 0, PORTAL, outConc, 3, false);
    block(-4.6, TB, PORTAL - 6, 4.6, TB + 5.6, PORTAL - 5.6, black, 2, false);
    block(-4.9, TB, PORTAL - 6, -4.6, TB + 5.9, PORTAL - 0.6, black, 2, false);
    block(4.6, TB, PORTAL - 6, 4.9, TB + 5.9, PORTAL - 0.6, black, 2, false);
    block(-4.9, TB + 5.6, PORTAL - 6, 4.9, -0.01, PORTAL - 0.6, black, 2, false);
    block(-RX, 1.0, PORTAL - 0.1, RX, 1.08, PORTAL, steel, 2, false);
    for (let x = -RX; x <= RX; x += 2) block(x - 0.03, 0, PORTAL - 0.1, x + 0.03, 1.05, PORTAL, steel, 2, false);
    solid(-RX, PORTAL - 0.7, RX, PORTAL, -1, 1.1);
    // the track bed, the sleepers, the rails, the wire
    floor([-RX, PORTAL - 6, RX, DARK], TB, low(ballast, 0x8a8680, 0.4), 1.5);
    const sleeperG = new THREE.BoxGeometry(2.6, 0.16, 0.24);
    const n = Math.floor((DARK - PORTAL) / 0.62);
    const sleepers = new THREE.InstancedMesh(sleeperG, low(concrete, 0x77736c, 0.2), n * 2);
    for (let i = 0; i < n; i++) for (const [k, x] of [[0, -TRK], [1, TRK]] as const) sleepers.setMatrixAt(i * 2 + k, new THREE.Matrix4().makeTranslation(x, TB + 0.1, PORTAL + i * 0.62));
    sleepers.receiveShadow = this.shadows;
    R.add(sleepers);
    const railM = low(null, 0x8c8f93, 0.3);
    for (const x of [-TRK, TRK]) for (const dx of [-0.72, 0.72]) block(x + dx - 0.04, TB + 0.18, PORTAL - 6, x + dx + 0.04, TB + RAIL, DARK, railM, 2, false);
    const wireM = lam(null, 0x2a2a2a);
    for (const x of [-TRK, TRK]) block(x - 0.015, TB + 5.4, PORTAL - 6, x + 0.015, TB + 5.43, DARK, wireM, 2, false).castShadow = false;
    // the masts of the wire, in the open
    for (let z = PORTAL + 6; z < COVER; z += 18)
      for (const s of [-1, 1]) {
        block(s * RX - 0.12 - (s > 0 ? 0.25 : 0), TB, z - 0.12, s * RX + 0.12 - (s > 0 ? 0.25 : 0) + (s < 0 ? 0.25 : 0), TB + 6.3, z + 0.12, steel, 2, false);
        block(Math.min(s * RX, s * 1.2), TB + 5.9, z - 0.05, Math.max(s * RX, s * 1.2), TB + 6.05, z + 0.05, steel, 2, false);
      }

    // --- the platforms
    const platM = low(platformT, 0xd8c8c0, 0.7), edgeM = low(graffiti, 0xc0bdb6, 0.5), line = low(null, 0xe8c21a, 0.5);
    for (const s of [-1, 1]) {
      const xe = s * EDGE, xw = s * RX, xa = Math.min(xe, xw), xb = Math.max(xe, xw);
      const m = block(xa, TB, PZ[0], xb, PY, PZ[1], [edgeM, edgeM, platM, platM, edgeM, edgeM], 2, false);
      // (the graffiti on the face to the track, in long stretches)
      const uv = m.geometry.attributes.uv!, nrm = m.geometry.attributes.normal!, pos = m.geometry.attributes.position!;
      for (let i = 0; i < uv.count; i++) if (Math.abs(nrm.getX(i)) > 0.5) uv.setXY(i, (pos.getZ(i) * -Math.sign(nrm.getX(i))) / 8, (pos.getY(i) + (PY - TB) / 2) / (PY - TB));
      solid(xe - 0.05, PZ[0], xe + 0.05, PZ[1], TB, PY + 2); // (the edge: you can't go onto the tracks)
      block(Math.min(xe + s * 0.45, xe + s * 0.6), PY + 0.002, PZ[0], Math.max(xe + s * 0.45, xe + s * 0.6), PY + 0.004, PZ[1], line, 2, false).castShadow = false;
      // the ends of the platforms
      solid(xa, PZ[1], xb, PZ[1] + 0.3, PY - 1, PY + 2);
      solid(xa, PZ[0] - 0.3, xb, PZ[0], PY - 1, PY + 2);
      block(xa, PY, PZ[1] - 0.1, xb, PY + 1.1, PZ[1], steel, 2, false);
      block(xa, PY, PZ[0], xb, PY + 1.1, PZ[0] + 0.1, steel, 2, false);
      // the name boards, the numbers, a bench every so often, two glass shelters
      const nameM = lam(nameTex, 0xffffff, { emissive: new THREE.Color(0.35, 0.35, 0.35), emissiveMap: nameTex });
      const numM = lam(numTex(s < 0 ? "2" : "1"), 0xffffff, { emissive: new THREE.Color(0.3, 0.3, 0.3) });
      for (let z = PZ[0] + 8; z < PZ[1] - 4; z += 16) {
        const sign = add(new THREE.PlaneGeometry(2.6, 0.33), nameM, s * (RX - 0.03), PY + 2.55, z);
        sign.rotation.y = -s * Math.PI / 2;
        const num = add(new THREE.PlaneGeometry(0.5, 0.5), numM, s * (RX - 0.03), PY + 2.55, z + 6);
        num.rotation.y = -s * Math.PI / 2;
      }
      const glass = new THREE.MeshLambertMaterial({ color: 0xbfd2da, transparent: true, opacity: 0.28, emissive: new THREE.Color(0.08, 0.1, 0.11), depthWrite: false });
      const frame = low(null, 0x2b2e33, 0.2);
      for (const z0 of [-60, -10]) {
        const xa2 = s < 0 ? -RX + 0.3 : RX - 2.1, xb2 = xa2 + 1.8;
        block(xa2, PY, z0, xb2, PY + 0.35, z0 + 4, low(concrete, 0xb4b0a8, 0.3));
        block(xa2, PY + 0.35, z0, xb2, PY + 2.45, z0 + 4, glass, 2, false).renderOrder = 3;
        block(xa2 - 0.05, PY + 2.45, z0 - 0.05, xb2 + 0.05, PY + 2.6, z0 + 4.05, frame, 2, false);
        for (const zz of [z0, z0 + 4]) for (const xx of [xa2, xb2]) block(xx - 0.04, PY + 0.35, zz - 0.04, xx + 0.04, PY + 2.45, zz + 0.04, frame, 2, false);
        block(xa2 + 0.3, PY + 2.2, z0 + 0.3, xb2 - 0.3, PY + 2.25, z0 + 3.7, lam(null, 0xffffff, { emissive: new THREE.Color(1.3, 1.3, 1.25) }), 2, false);
      }
      for (const z of [-48, -30, -2]) {
        const bx = s * (RX - 0.55);
        block(bx - 0.25, PY + 0.42, z - 0.9, bx + 0.25, PY + 0.48, z + 0.9, frame);
        block(Math.min(bx + s * 0.22, bx + s * 0.28), PY + 0.48, z - 0.9, Math.max(bx + s * 0.22, bx + s * 0.28), PY + 0.95, z + 0.9, frame, 2, false);
        for (const dz of [-0.8, 0.8]) block(bx - 0.03, PY, z + dz - 0.03, bx + 0.03, PY + 0.42, z + dz + 0.03, frame, 2, false);
      }
      // an electrical cabinet, a departures screen
      block(s * (RX - 0.35) - 0.3, PY, -18.5, s * (RX - 0.35) + 0.3, PY + 1.7, -17.5, low(null, 0xd6d6d2, 0.35));
      const bm = new THREE.MeshLambertMaterial({ map: boardEve, emissive: 0xffffff, emissiveMap: boardEve, emissiveIntensity: 0.9 });
      this.boards.push({ mat: bm, eve: boardEve, morn: boardMorn });
      const scr = add(new THREE.PlaneGeometry(1.4, 0.7), bm, s * (RX - 0.04), PY + 2.3, -40);
      scr.rotation.y = -s * Math.PI / 2;
    }
    // the stairs, along the walls, up into the station building
    const stepM = low(concrete, 0xb8b4ac, 0.5), nose = low(null, 0xe8c21a, 0.4);
    const steps = 34, run = (ST.bot - ST.top) / steps;
    for (const s of [-1, 1]) {
      const xa = s < 0 ? -ST.x1 : ST.x0, xb = s < 0 ? -ST.x0 : ST.x1;
      for (let i = 0; i < steps; i++) {
        const z0 = ST.top + i * run, h = stairH(z0 + run);
        block(xa, PY, z0, xb, Math.max(h, PY + 0.02), z0 + run, stepM, 2, false);
        block(xa, h - 0.01, z0 + run - 0.04, xb, h + 0.005, z0 + run, nose, 2, false).castShadow = false;
      }
      // the side of the stairs, the handrail, the glass round the stairwell up top
      const xi = s < 0 ? -ST.x0 : ST.x0;
      solid(Math.min(xi, xi - s * 0.15), ST.top, Math.max(xi, xi - s * 0.15), ST.bot - 0.3, PY - 0.5, 1.1);
      // (and at platform level, no way in under the top of the stairs)
      solid(Math.min(s * RX, xi), ST.top - 0.3, Math.max(s * RX, xi), ST.top, PY - 0.5, PY + 2);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, Math.hypot(ST.bot - ST.top, PY), 8), steel);
      rail.position.set(xi - s * 0.08, PY / 2 + 0.95, (ST.top + ST.bot) / 2);
      rail.rotation.x = Math.atan2(ST.top - ST.bot, -PY);
      statics.add(rail);
      const glassUp = new THREE.MeshLambertMaterial({ color: 0xcfe0e6, transparent: true, opacity: 0.25, depthWrite: false });
      block(Math.min(xi, xi - s * 0.04), -0.6, ST.top, Math.max(xi, xi - s * 0.04), 1.05, ST.bot, glassUp, 2, false).renderOrder = 3;
      block(xa, -0.6, ST.bot, xb, 1.05, ST.bot + 0.04, glassUp, 2, false).renderOrder = 3;
      block(Math.min(s * RX, s * (RX + 0.04)), -0.6, ST.top, Math.max(s * RX, s * (RX + 0.04)), 1.05, ST.bot, glassUp, 2, false).renderOrder = 3;
      solid(xa, ST.bot, xb, ST.bot + 0.15, -0.6, 1.1);
      solid(Math.min(s * RX, s * (RX + 0.15)), ST.top, Math.max(s * RX, s * (RX + 0.15)), ST.bot, -0.6, 1.1);
      block(Math.min(xi, xi - s * 0.06), 1.0, ST.top, Math.max(xi, xi - s * 0.06), 1.08, ST.bot, steel, 2, false);
      // where it goes
      const dirTex = canvasTex(512, 128, (g, w, h) => {
        g.fillStyle = NMBS;
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#fff";
        g.font = `700 54px ${FONT}`;
        g.fillText(s < 0 ? "2" : "1", 24, 84);
        g.font = `600 40px ${FONT}`;
        g.fillText(s < 0 ? "Antwerpen ↓" : "Brussel ↓", 90, 82);
      });
      const dm = add(new THREE.PlaneGeometry(1.8, 0.45), lam(dirTex, 0xffffff, { emissive: new THREE.Color(0.25, 0.25, 0.25), emissiveMap: dirTex }), (xa + xb) / 2, 2.6, ST.top - 0.02);
      dm.rotation.y = Math.PI;
      block(xa + 0.3, 2.82, ST.top - 0.06, xa + 0.34, PAV.h, ST.top - 0.02, steel, 2, false);
      block(xb - 0.34, 2.82, ST.top - 0.06, xb - 0.3, PAV.h, ST.top - 0.02, steel, 2, false);
    }

    // --- the station building: a glass box under a big flat canopy on a steel space frame
    const frameM = lam(null, 0x8c4a20);
    const glassM = new THREE.MeshLambertMaterial({ color: 0x9fb4bd, transparent: true, opacity: 0.32, emissive: new THREE.Color(0.12, 0.09, 0.05), depthWrite: false });
    this.glow.push(glassM);
    const P = PAV;
    // the glass walls, with the doors in the middle of the front
    const pane = (x0: number, z0: number, x1: number, z1: number) => {
      block(x0, 0, z0, x1, P.h, z1, glassM, 2, false).renderOrder = 3;
      solid(x0, z0, x1, z1, 0, P.h);
      const len = Math.max(x1 - x0, z1 - z0), nn = Math.round(len / 1.8);
      for (let i = 0; i <= nn; i++) {
        const k = i / nn;
        if (x1 - x0 > z1 - z0) block(x0 + (x1 - x0) * k - 0.05, 0, z0 - 0.03, x0 + (x1 - x0) * k + 0.05, P.h, z1 + 0.03, frameM, 2, false);
        else block(x0 - 0.03, 0, z0 + (z1 - z0) * k - 0.05, x1 + 0.03, P.h, z0 + (z1 - z0) * k + 0.05, frameM, 2, false);
      }
      block(x0 - 0.04, 2.2, z0 - 0.04, x1 + 0.04, 2.3, z1 + 0.04, frameM, 2, false);
    };
    pane(P.x0, P.z1 - 0.06, -1.6, P.z1);
    pane(1.6, P.z1 - 0.06, P.x1, P.z1);
    pane(P.x0, P.z0, P.x1, P.z0 + 0.06);
    pane(P.x0, P.z0, P.x0 + 0.06, P.z1);
    pane(P.x1 - 0.06, P.z0, P.x1, P.z1);
    block(-1.6, 2.4, P.z1 - 0.06, 1.6, P.h, P.z1, frameM, 2, false);
    // the doors stand open
    for (const s of [-1, 1]) block(s * 1.6 - (s > 0 ? 0.06 : -0.0), 0, P.z1, s * 1.6 + (s < 0 ? 0.06 : 0), 2.35, P.z1 + 0.9, glassM, 2, false).renderOrder = 3;
    // its ceiling, lit
    block(P.x0, P.h, P.z0, P.x1, P.h + 0.25, P.z1, lam(null, 0x3a3532), 2, false);
    for (let x = P.x0 + 3; x < P.x1 - 2; x += 6) for (const z of [-34, -28, -22]) block(x - 0.6, P.h - 0.03, z - 0.6, x + 0.6, P.h, z + 0.6, lam(null, 0xffffff, { emissive: new THREE.Color(1.5, 1.35, 1.1) }), 2, false).castShadow = false;
    // red benches inside, the ticket machine, a café counter (Brandstof), the departures
    const red = lam(null, 0xb3261e);
    for (const [x, z] of [[-4.5, -22.5], [4.5, -22.5], [-4.5, -26.5], [4.5, -26.5]] as const) {
      block(x - 1.4, 0.42, z - 0.25, x + 1.4, 0.48, z + 0.25, red);
      block(x - 1.4, 0.48, z + 0.2, x + 1.4, 0.95, z + 0.26, red, 2, false);
      for (const dx of [-1.2, 1.2]) block(x + dx - 0.03, 0, z - 0.03, x + dx + 0.03, 0.42, z + 0.03, steel, 2, false);
    }
    block(-3.5, 0, -36.4, 3.5, 1.1, -35.6, lam(null, 0x5a3a26));
    block(-3.6, 1.1, -36.5, 3.6, 1.16, -35.5, lam(null, 0xd8d2c8), 2, false);
    const cafeTex = canvasTex(512, 128, (g, w, h) => {
      g.fillStyle = "#151515";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#f2b03a";
      g.textAlign = "center";
      g.font = `800 64px ${FONT}`;
      g.fillText("BRANDSTOF", w / 2, 86);
    });
    const cafe = lam(cafeTex, 0xffffff, { emissive: 0xffffff, emissiveMap: cafeTex });
    this.glow.push(cafe);
    add(new THREE.PlaneGeometry(3, 0.75), cafe, 0, 2.8, P.z0 + 0.1);
    const bm = new THREE.MeshLambertMaterial({ map: boardEve, emissive: 0xffffff, emissiveMap: boardEve, emissiveIntensity: 0.9 });
    this.boards.push({ mat: bm, eve: boardEve, morn: boardMorn });
    add(new THREE.PlaneGeometry(1.6, 0.8), bm, -6, 2.6, P.z0 + 0.1);
    add(new THREE.PlaneGeometry(1.6, 0.8), bm, 6, 2.6, P.z0 + 0.1);
    block(-11.4, 0, -21.4, -10.6, 1.75, -20.6, lam(null, 0x1f5fb0)); // tickets
    // the two concrete blocks either side, "nmbs" on one
    const raw = lam(concrete, 0xc8c4bb);
    block(-19, 0, -31, -14, 3.0, -20, raw, 3);
    block(14, 0, -31, 19, 3.0, -20, raw, 3);
    const nmbsTex = canvasTex(512, 160, (g, w, h) => {
      g.fillStyle = "#c8c4bb";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 12);
      g.fillStyle = "#2a2a2c";
      g.font = `700 92px ${FONT}`;
      g.fillText("nmbs", 120, 112);
    });
    add(new THREE.PlaneGeometry(3.6, 1.1), lam(nmbsTex), 16.5, 2.0, -19.98);
    // the canopy: the fascia with the name all round, the space frame under it, eight columns
    const fasciaT = canvasTex(2048, 64, (g, w, h) => {
      g.fillStyle = "#c9cbcc";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(90,95,100,0.4)";
      for (let x = 0; x < w; x += 128) g.fillRect(x, 0, 2, h);
      g.fillStyle = "#5c6064";
      g.textAlign = "center";
      g.font = `700 44px ${FONT}`;
      g.fillText("Mortsel-Oude-God", w / 2, 47);
    });
    const plain = lam(null, 0xc9cbcc);
    const fascia = lam(fasciaT, 0xffffff, { emissive: new THREE.Color(0.3, 0.3, 0.3), emissiveMap: fasciaT });
    const roofTop = lam(null, 0x4a4b4d), roofUnder = lam(null, 0x3c3e42);
    block(CAN.x0, CAN.y + 1.1, CAN.z0, CAN.x1, CAN.y + 1.9, CAN.z1, [plain, plain, roofTop, roofUnder, fascia, plain], 2, false);
    const frameG = new THREE.BoxGeometry(0.07, 0.07, 1);
    const darkSteel = lam(null, 0x2d3034);
    const mats: THREE.Matrix4[] = [];
    const strut = (a: THREE.Vector3, b: THREE.Vector3) => {
      const d = b.clone().sub(a), m = new THREE.Matrix4();
      m.lookAt(a, b, new THREE.Vector3(0, 1, 0).cross(d).lengthSq() < 1e-6 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
      m.scale(new THREE.Vector3(1, 1, d.length()));
      m.setPosition(a.clone().add(b).multiplyScalar(0.5));
      mats.push(m);
    };
    const G = 2.4, yb = CAN.y, yt = CAN.y + 1.1;
    for (let x = CAN.x0 + G / 2; x <= CAN.x1 - G / 2 + 0.01; x += G)
      for (let z = CAN.z0 + G / 2; z <= CAN.z1 - G / 2 + 0.01; z += G) {
        const b = new THREE.Vector3(x, yb, z);
        if (x + G <= CAN.x1 - G / 2 + 0.01) strut(b, new THREE.Vector3(x + G, yb, z));
        if (z + G <= CAN.z1 - G / 2 + 0.01) strut(b, new THREE.Vector3(x, yb, z + G));
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) strut(b, new THREE.Vector3(x + (dx! * G) / 2, yt, z + (dz! * G) / 2));
      }
    const frame = new THREE.InstancedMesh(frameG, darkSteel, mats.length);
    mats.forEach((m, i) => frame.setMatrixAt(i, m));
    frame.castShadow = this.shadows;
    R.add(frame);
    for (const x of [-16.6, 16.6]) for (const z of [-41, -17]) {
      add(new THREE.CylinderGeometry(0.16, 0.16, CAN.y, 12), darkSteel, x, CAN.y / 2, z);
      solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0, CAN.y);
    }
    // the blue B on its column, a red post box, bikes racks, lamps, a few trees, a bench
    add(new THREE.CylinderGeometry(0.22, 0.22, 3.2, 16), lam(null, 0x1f5fb0), -13, 1.6, -16.5);
    solid(-13.3, -16.8, -12.7, -16.2, 0, 3.2);
    const bTex = canvasTex(128, 128, (g) => {
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(64, 64, 62, 0, 7);
      g.fill();
      g.fillStyle = "#1f5fb0";
      g.beginPath();
      g.arc(64, 64, 52, 0, 7);
      g.fill();
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.font = `700 80px ${FONT}`;
      g.fillText("B", 64, 92);
    });
    const bDisc = add(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 24), [lam(null, 0xffffff), lam(bTex), lam(bTex)], -13, 3.45, -16.5);
    bDisc.rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.22, 0.22, 1.25, 14), lam(null, 0xd8261c), 20.5, 0.62, -11);
    solid(20.2, -11.3, 20.8, -10.7, 0, 1.3);
    const rack = lam(null, 0x8a8d90);
    for (let x = -23; x <= -14; x += 1.0) {
      block(x - 0.03, 0, -9, x + 0.03, 0.8, -8.94, rack, 2, false);
      block(x - 0.03, 0, -8.06, x + 0.03, 0.8, -8.0, rack, 2, false);
      block(x - 0.03, 0.78, -9, x + 0.03, 0.84, -8.0, rack, 2, false);
    }
    solid(-23.2, -9.1, -13.8, -7.9, 0, 0.9);
    const postLamp = (x: number, z: number, h = 6) => {
      add(new THREE.CylinderGeometry(0.07, 0.1, h, 8), darkSteel, x, h / 2, z);
      solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 0, h);
      const head = lam(null, 0x333333, { emissive: new THREE.Color(1.8, 1.6, 1.2) });
      this.glow.push(head);
      block(x - 0.5, h - 0.05, z - 0.15, x + 0.5, h + 0.08, z + 0.15, head, 2, false);
    };
    for (const x of [-30, -10, 10, 30]) postLamp(x, 1.2);
    for (const x of [-24, -7, 7, 24]) postLamp(x, 13.8);
    postLamp(-8, -6);
    postLamp(8, -6);
    const trunk = lam(null, 0x6e6457), leaves = [0x3d5a2a, 0x4a6a2f, 0x56702f].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
    const tree = (x: number, z: number, s = 1) => {
      add(new THREE.CylinderGeometry(0.18 * s, 0.26 * s, 5 * s, 8), trunk, x, 2.5 * s, z);
      solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0, 4);
      const rr = rand(Math.round(x * 31 + z * 17));
      for (let k = 0; k < 4; k++) add(new THREE.IcosahedronGeometry((1.6 + rr() * 1.2) * s, 1), leaves[k % 3]!, x + (rr() - 0.5) * 2.4 * s, (5.2 + rr() * 2.2) * s, z + (rr() - 0.5) * 2.4 * s);
    };
    for (const x of [-42, -34, -26, 24, 32, 40]) tree(x, 1.2);
    for (const [x, z] of [[-28, -60], [-20, -80], [-36, -92], [20, -62], [17, -88], [-30, -40], [30, -96]] as const) tree(x, z, 1.25);

    // the Stadhuis to the east of the square
    const hallT = canvasTex(1024, 512, (g, w, h) => {
      g.fillStyle = "#b9b3a6";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 10);
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 14; c++) {
          g.fillStyle = "#2c3238";
          g.fillRect(20 + c * 72, 70 + r * 150, 52, 88);
          g.fillStyle = "rgba(255,210,150,0.0)";
        }
      g.fillStyle = "#3a3d40";
      g.font = `700 46px ${FONT}`;
      g.fillText("STADHUIS MORTSEL", 30, 50);
    });
    const hallM = lam(hallT, 0xffffff, { emissive: new THREE.Color(0.12, 0.1, 0.07), emissiveMap: hallT });
    this.glow.push(hallM);
    const hallBody = lam(null, 0xa9a397);
    block(27, 0, -70, 47, 11, -6, [hallBody, hallBody, roofTop, hallBody, hallBody, hallBody], 3);
    add(new THREE.PlaneGeometry(64, 11), hallM, 26.98, 5.5, -38).rotation.y = -Math.PI / 2;

    // --- the tram stop and a tram on line 15, waiting
    const tramT = canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = "#f2f2ee";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#1f2226";
      for (let x = 20; x < w - 20; x += 64) g.fillRect(x, 22, 52, 50);
      g.fillStyle = "#ffd200";
      g.fillRect(0, 84, w, 10);
      g.fillStyle = "#5a5e63";
      g.fillRect(0, 98, w, 30);
    });
    const tramM = lam(tramT, 0xffffff, { emissive: new THREE.Color(0.15, 0.15, 0.13), emissiveMap: tramT });
    this.glow.push(tramM);
    const tramWhite = lam(null, 0xf0f0ec);
    block(14, 0.25, 4.0, 44, 3.4, 6.6, [tramWhite, tramWhite, tramWhite, lam(null, 0x2a2a2a), tramM, tramM], 2);
    const destT = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = "#111";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#ffb000";
      g.font = `700 36px monospace`;
      g.fillText("15 Boechout", 8, 44);
    });
    const dest = lam(destT, 0xffffff, { emissive: 0xffffff, emissiveMap: destT });
    add(new THREE.PlaneGeometry(1.8, 0.4), dest, 13.98, 2.9, 5.3).rotation.y = -Math.PI / 2;
    // the pole for the overhead wire, along the south pavement
    for (const x of [-40, -20, 20, 40]) {
      block(x - 0.1, 0, 14.0, x + 0.1, 7, 14.2, darkSteel);
      block(x - 0.03, 6.4, 5.3, x + 0.03, 6.46, 14.0, darkSteel, 2, false);
    }
    for (const z of [5.3, 9.7]) block(-W, 6.0, z - 0.015, W, 6.03, z + 0.015, wireM, 2, false).castShadow = false;
    const halteT = canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = "#ffd200";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#222";
      g.font = `800 28px ${FONT}`;
      g.fillText("De Lijn", 14, 44);
      g.font = `700 20px ${FONT}`;
      g.fillText("Station", 14, 100);
      g.fillText("Oude God", 14, 126);
      g.font = `800 52px ${FONT}`;
      g.fillText("15", 30, 210);
    });
    block(46 - 0.05, 0, 1.0, 46 + 0.05, 2.4, 1.1, darkSteel);
    add(new THREE.PlaneGeometry(0.5, 1.0), lam(halteT), 46, 2.9, 1.12);
    add(new THREE.PlaneGeometry(0.5, 1.0), lam(halteT), 46, 2.9, 0.98).rotation.y = Math.PI;

    // --- the houses
    const houseTex = (r: () => number, w: number, h: number, floors: number, brick: string, trim: string, door: boolean) => {
      const px = 24;
      const draw = (lit: boolean) =>
        canvasTex(Math.round(w * px), Math.round(h * px), (g, cw, ch) => {
          g.fillStyle = lit ? "#000" : brick;
          g.fillRect(0, 0, cw, ch);
          if (!lit) {
            // the bricks
            g.fillStyle = "rgba(0,0,0,0.12)";
            for (let y = 0; y < ch; y += 3) g.fillRect(0, y, cw, 1);
            speckle(g, cw, ch, 16);
            g.fillStyle = trim;
            g.fillRect(0, 0, cw, 0.35 * px);
          }
          const fh = h / floors;
          const bays = Math.max(2, Math.round(w / 2.6));
          for (let f = 0; f < floors; f++) {
            const y0 = ch - (f + 1) * fh * px;
            for (let b = 0; b < bays; b++) {
              if (f === 0 && door && b === 0) {
                if (!lit) {
                  g.fillStyle = "#3a2a1e";
                  g.fillRect((w / bays) * px * 0.25, ch - 2.3 * px, 1.0 * px, 2.3 * px);
                }
                continue;
              }
              const wx = (b + 0.5) * (w / bays) * px, ww = Math.min(1.5, (w / bays) * 0.62) * px, wh = fh * 0.55 * px;
              const on = r() < 0.32;
              if (lit) {
                if (on) {
                  g.fillStyle = r() < 0.5 ? "#ffcf8a" : "#fff0c8";
                  g.fillRect(wx - ww / 2, y0 + fh * px * 0.2, ww, wh);
                }
              } else {
                g.fillStyle = trim;
                g.fillRect(wx - ww / 2 - 4, y0 + fh * px * 0.2 - 4, ww + 8, wh + 10);
                g.fillStyle = "#24292e";
                g.fillRect(wx - ww / 2, y0 + fh * px * 0.2, ww, wh);
                g.fillStyle = "rgba(255,255,255,0.08)";
                g.fillRect(wx - ww / 2, y0 + fh * px * 0.2, ww, wh * 0.4);
                g.fillStyle = trim;
                g.fillRect(wx - 2, y0 + fh * px * 0.2, 4, wh);
              }
            }
          }
        });
      return [draw(false), draw(true)] as const;
    };
    const BRICKS = [["#8a3b2a", "#e8e2d6"], ["#5e4030", "#d8d0c0"], ["#c2a46a", "#4a3a2a"], ["#e6e1d6", "#3a3a3a"], ["#7e7a74", "#efefea"], ["#9c5a3c", "#f0ebe0"]];
    const roofs = [lam(null, 0x3a3634), lam(null, 0x55463c), lam(null, 0x4a4a4c)];
    // a row of houses from p along d (facing n), until `len` metres
    const row = (p: P2, d: P2, n: P2, len: number, seed: number) => {
      const r = rand(seed);
      let t = 0;
      while (t < len - 2) {
        const w = Math.min(len - t, 5.5 + r() * 3), floors = 2 + Math.floor(r() * 2.4), h = floors * 2.9 + 0.6;
        const [c0, c1] = BRICKS[Math.floor(r() * BRICKS.length)]!;
        const [map, lit] = houseTex(r, w, h, floors, c0!, c1!, true);
        const m = lam(map, 0xffffff, { emissive: 0xffffff, emissiveMap: lit });
        this.glow.push(m);
        front(along(p, d, t), along(p, d, t + w), n, h, m, roofs[Math.floor(r() * roofs.length)]!, 9);
        t += w;
      }
    };
    // the south side of the Statielei, either side of the corner
    const cw = along(along(A, NW, 11), DW, (SOUTH - (A[1] + NW[1] * 11)) / DW[1]); // where the west block turns the corner
    const ce = along(along(B, NE, 11), DE, (SOUTH - (B[1] + NE[1] * 11)) / DE[1]);
    row([-W + 0.4, SOUTH], [1, 0], [0, -1], cw[0] + W - 0.4, 11);
    row([ce[0], SOUTH], [1, 0], [0, -1], W - 0.4 - ce[0], 12);
    row(cw, DW, [-NW[0], -NW[1]], (-W + 0.6 - cw[0]) / DW[0], 13);
    row(ce, DE, [-NE[0], -NE[1]], (W - 0.6 - ce[0]) / DE[0], 14);
    // the north side of the Statielei, west of the square
    row([-W + 0.4, -6], [1, 0], [0, 1], W - 0.4 - 26, 15);
    solid(-W, -16, -26, -6, 0, 12);
    // behind number 1, down both streets
    row(along(A, DW, 16), DW, NW, (Z1 - 0.6 - A[1]) / DW[1] - 16, 16);
    row(along(B, DE, 22), DE, NE, (Z1 - 0.6 - B[1]) / DE[1] - 22, 17);
    // a few cars parked along them
    const carCols = [0x8e1b1b, 0x1d3e6e, 0xd9d9d4, 0x2a2a2a, 0x5f6a6f];
    const car = (c: P2, d: P2, k: number) => {
      const body = lam(null, carCols[k % carCols.length]!), glassC = lam(null, 0x1e2328);
      const g = new THREE.Group();
      const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
        const o = new THREE.Mesh(geo, m);
        o.position.set(x, y, z);
        g.add(o);
      };
      part(new THREE.BoxGeometry(1.8, 0.7, 4.3), body, 0, 0.6, 0);
      part(new THREE.BoxGeometry(1.6, 0.55, 2.2), glassC, 0, 1.2, -0.2);
      for (const [x, z] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]] as const) part(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12).rotateZ(Math.PI / 2), darkSteel, x, 0.32, z);
      g.position.set(c[0], 0, c[1]);
      g.rotation.y = Math.atan2(d[0], d[1]);
      g.traverse((o) => (o.castShadow = o.receiveShadow = this.shadows));
      statics.add(g);
      wallHit(along(c, d, -2), along(c, d, 2), 0, 1.5);
    };
    car(along(along(A, NW, 3.2), DW, 26), DW, 0);
    car(along(along(A, NW, 3.2), DW, 34), DW, 1);
    car(along(along(B, NE, 3.2), DE, 30), DE, 2);
    car(along(along(A, NW, 8), DW, 20), DW, 3);
    car(along(along(B, NE, 8), DE, 16), DE, 4);

    // --- number 1: the corner, four storeys, light brick with brown bands, the front door on the corner
    const homeTex = (w: number, entrance: boolean, lit: boolean) =>
      canvasTex(Math.round(w * 40), Math.round(HOME_H * 40), (g, cw2, ch) => {
        const px = 40;
        g.fillStyle = lit ? "#000" : "#d9c8a0";
        g.fillRect(0, 0, cw2, ch);
        if (!lit) {
          g.fillStyle = "rgba(0,0,0,0.08)";
          for (let y = 0; y < ch; y += 3) g.fillRect(0, y, cw2, 1);
          speckle(g, cw2, ch, 12);
          // the ground floor in dark brick, a band of brown under every row of windows
          g.fillStyle = "#4e3a2c";
          g.fillRect(0, ch - 3.4 * px, cw2, 3.4 * px);
          for (let f = 0; f < 3; f++) {
            g.fillStyle = "#6b4a32";
            g.fillRect(0, ch - (3.4 + f * 2.9) * px - 0.9 * px, cw2, 0.9 * px);
          }
          g.fillStyle = "#cfc6b4";
          g.fillRect(0, 0, cw2, 0.3 * px);
        }
        const bays = Math.max(1, Math.round(w / 3));
        for (let f = 0; f < 3; f++) {
          const y = ch - (3.4 + (f + 1) * 2.9) * px + 0.35 * px;
          for (let b = 0; b < bays; b++) {
            const x = ((b + 0.5) * w * px) / bays, ww = Math.min(2.2, (w / bays) * 0.7) * px, wh = 1.65 * px;
            // (bus 6, top floor on the corner: nobody home yet)
            const on = !(entrance && f === 2) && (Math.sin(b * 12.9898 + f * 78.233 + w) * 43758.5453) % 1 > 0.1;
            if (lit) {
              if (on) {
                g.fillStyle = "#ffd59a";
                g.fillRect(x - ww / 2, y, ww, wh);
              }
              continue;
            }
            g.fillStyle = "#e8e4dc";
            g.fillRect(x - ww / 2 - 4, y - 4, ww + 8, wh + 8);
            g.fillStyle = "#252a2f";
            g.fillRect(x - ww / 2, y, ww, wh);
            g.fillStyle = "#e8e4dc";
            g.fillRect(x - 2, y, 4, wh);
            g.fillRect(x - ww / 2, y + wh * 0.3, ww, 3);
          }
        }
        if (lit) return;
        if (entrance) {
          // the front door with its number, the bells and letterboxes beside it
          const dx = cw2 / 2;
          g.fillStyle = "#cfd2d4";
          g.fillRect(dx - 0.75 * px, ch - 2.6 * px, 1.5 * px, 2.6 * px);
          g.fillStyle = "#1c2328";
          g.fillRect(dx - 0.65 * px, ch - 2.5 * px, 1.3 * px, 2.5 * px);
          g.fillStyle = "#f2f2f0";
          g.font = `700 ${0.42 * px}px ${FONT}`;
          g.textAlign = "center";
          g.fillText("1", dx, ch - 2.75 * px);
          for (const s of [-1, 1]) {
            g.fillStyle = "#2a3036";
            g.fillRect(dx + s * 2.3 * px - 0.8 * px, ch - 2.4 * px, 1.6 * px, 1.6 * px);
          }
        } else {
          // shop windows and a garage door
          for (let x = 0.6; x < w - 2; x += 3.4) {
            g.fillStyle = "#2a3036";
            g.fillRect(x * px, ch - 2.8 * px, 2.8 * px, 2.2 * px);
          }
        }
      });
    const hw = (w: number, entrance = false) => {
      const m = lam(homeTex(w, entrance, false), 0xffffff, { emissive: 0xffffff, emissiveMap: homeTex(w, entrance, true) });
      this.glow.push(m);
      return m;
    };
    const homeBody = lam(null, 0xcbbb95);
    front(A, B, [0, -1], HOME_H, hw(9, true), homeBody, 14);
    front(A, along(A, DW, 16), NW, HOME_H, hw(16), homeBody, 10);
    front(B, along(B, DE, 22), NE, HOME_H, hw(22), homeBody, 10);
    // the roof over the wedge
    const roof = new THREE.Shape([A, B, along(B, DE, 22), along(along(B, DE, 22), [-NE[0], -NE[1]], 10), along(along(A, DW, 16), [-NW[0], -NW[1]], 10), along(A, DW, 16)].map(([x, z]) => new THREE.Vector2(x, -z)));
    const roofG = new THREE.ShapeGeometry(roof).rotateX(-Math.PI / 2);
    add(roofG, lam(null, 0x4a4746), 0, HOME_H + 0.02, 0);
    // balconies on the corner, the canopy over the door
    const balc = lam(null, 0xe6e2da), balRail = lam(null, 0x3a3d40);
    for (let f = 0; f < 3; f++) {
      const y = 3.4 + f * 2.9;
      for (const s of [-1, 1]) {
        block(s * 2.3 - 1.4, y - 0.15, A[1] - 1.2, s * 2.3 + 1.4, y, A[1], balc, 2, false);
        block(s * 2.3 - 1.4, y, A[1] - 1.22, s * 2.3 + 1.4, y + 1.0, A[1] - 1.16, balRail, 2, false);
      }
    }
    block(-1.4, 2.75, A[1] - 0.9, 1.4, 2.88, A[1], balc, 2, false);
    // the bells: six buttons, six names, bus 6 is yours
    const bellTex = canvasTex(256, 420, (g, w, h) => {
      g.fillStyle = "#b9bdc0";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#2a2e32";
      g.fillRect(14, 14, w - 28, 70);
      g.fillStyle = "#3a3f44";
      for (let i = 0; i < 40; i++) g.fillRect(30 + (i % 10) * 20, 26 + Math.floor(i / 10) * 13, 10, 6);
      const names = ["VERMEULEN", "PEETERS", "JANSSENS", "DE SMET", "MAES", "BRODDIN"];
      names.forEach((nm, i) => {
        const y = 100 + i * 52;
        g.fillStyle = "#f4f2ea";
        g.fillRect(20, y, 160, 38);
        g.fillStyle = "#222";
        g.font = `600 17px ${FONT}`;
        g.fillText(`1/${i + 1}  ${nm}`, 28, y + 25);
        g.fillStyle = "#777";
        g.beginPath();
        g.arc(212, y + 19, 14, 0, 7);
        g.fill();
        g.fillStyle = i === 5 ? "#ffcc55" : "#ddd";
        g.beginPath();
        g.arc(212, y + 19, 9, 0, 7);
        g.fill();
      });
    });
    add(new THREE.PlaneGeometry(0.3, 0.5), lam(bellTex, 0xffffff, { emissive: new THREE.Color(0.25, 0.25, 0.25), emissiveMap: bellTex }), -1.1, 1.45, A[1] - 0.03).rotation.y = Math.PI;
    const doorLamp = lam(null, 0x333333, { emissive: new THREE.Color(2, 1.7, 1.2) });
    this.glow.push(doorLamp);
    block(-0.15, 2.55, A[1] - 0.12, 0.15, 2.7, A[1], doorLamp, 2, false);

    // --- the hall: walls and ceiling painted as sky, the rooftops of Mortsel along the bottom
    const skyWall = (morning: boolean) =>
      canvasTex(2048, 512, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        if (morning) {
          gr.addColorStop(0, "#7fa6d6");
          gr.addColorStop(0.6, "#cfdcea");
          gr.addColorStop(0.8, "#f4e4cf");
        } else {
          gr.addColorStop(0, "#1b2450");
          gr.addColorStop(0.45, "#5a4a7a");
          gr.addColorStop(0.7, "#d27a52");
          gr.addColorStop(0.82, "#f2b06a");
        }
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 20; i++) {
          const cx = Math.random() * w, cy = 40 + Math.random() * h * 0.4;
          for (let k = 0; k < 6; k++) {
            g.fillStyle = morning ? `rgba(255,255,255,${0.3 + Math.random() * 0.3})` : `rgba(${200 + Math.random() * 40},${110 + Math.random() * 40},${120},${0.18 + Math.random() * 0.2})`;
            g.beginPath();
            g.ellipse(cx + (Math.random() - 0.5) * 120, cy + (Math.random() - 0.5) * 20, 30 + Math.random() * 60, 8 + Math.random() * 14, 0, 0, 7);
            g.fill();
          }
        }
        // rooftops, chimneys, trees, a church tower, lit windows in the evening
        const base = h * 0.86;
        for (let x = 0; x < w; ) {
          const bw = 30 + Math.random() * 50, bh = 40 + Math.random() * 60;
          g.fillStyle = morning ? `hsl(20,${10 + Math.random() * 10}%,${48 + Math.random() * 12}%)` : `hsl(250,${15 + Math.random() * 10}%,${12 + Math.random() * 8}%)`;
          g.beginPath();
          g.moveTo(x, base);
          g.lineTo(x, base - bh);
          if (Math.random() < 0.6) g.lineTo(x + bw / 2, base - bh - 18);
          g.lineTo(x + bw, base - bh);
          g.lineTo(x + bw, base);
          g.fill();
          if (Math.random() < 0.4) g.fillRect(x + bw * 0.7, base - bh - 16, 6, 18);
          if (!morning)
            for (let k = 0; k < 4; k++)
              if (Math.random() < 0.45) {
                g.fillStyle = "#ffcf7a";
                g.fillRect(x + 6 + Math.random() * (bw - 14), base - bh + 10 + Math.random() * (bh - 22), 5, 7);
              }
          x += bw + Math.random() * 6;
        }
        for (let x = 0; x < w; x += 60 + Math.random() * 140) {
          g.fillStyle = morning ? "rgba(60,80,50,0.9)" : "rgba(15,18,30,0.95)";
          g.beginPath();
          g.ellipse(x, base - 70, 26 + Math.random() * 20, 40 + Math.random() * 20, 0, 0, 7);
          g.fill();
        }
        const tx = w * 0.62;
        g.fillStyle = morning ? "#7c6f66" : "#141628";
        g.fillRect(tx, base - 190, 26, 190);
        g.beginPath();
        g.moveTo(tx - 4, base - 190);
        g.lineTo(tx + 13, base - 260);
        g.lineTo(tx + 30, base - 190);
        g.fill();
        g.fillStyle = morning ? "#6e6c66" : "#24262c";
        g.fillRect(0, base, w, h - base);
      });
    const skyCeil = (morning: boolean) =>
      canvasTex(1024, 1024, (g, w, h) => {
        g.fillStyle = morning ? "#86acdb" : "#141b3e";
        g.fillRect(0, 0, w, h);
        if (!morning)
          for (let i = 0; i < 160; i++) {
            g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`;
            g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
          }
        for (let i = 0; i < 26; i++) {
          const cx = Math.random() * w, cy = Math.random() * h;
          for (let k = 0; k < 7; k++) {
            g.fillStyle = morning ? `rgba(255,255,255,${0.3 + Math.random() * 0.4})` : `rgba(80,70,120,${0.15 + Math.random() * 0.2})`;
            g.beginPath();
            g.ellipse(cx + (Math.random() - 0.5) * 140, cy + (Math.random() - 0.5) * 60, 40 + Math.random() * 60, 25 + Math.random() * 40, Math.random() * 3, 0, 7);
            g.fill();
          }
        }
      });
    const eve = [skyWall(false), skyCeil(false)], morn = [skyWall(true), skyCeil(true)];
    const paint = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, color: new THREE.Color(0.95, 0.95, 0.95), side: THREE.BackSide, fog: false });
    const wallS = paint(eve[0]!), ceilS = paint(eve[1]!);
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const sky = new THREE.Mesh(new THREE.BoxGeometry(2 * W, TOP, Z1 - Z0), [wallS, wallS, ceilS, hidden, wallS, wallS]);
    sky.position.set(0, TOP / 2, (Z0 + Z1) / 2);
    R.add(sky);
    this.sky = { mat: [wallS, ceilS], eve, morn };
    for (const x of [-W, W]) solid(x - 1, Z0, x + (x < 0 ? 0.5 : 1), Z1, -20, 40);
    for (const z of [Z0, Z1]) solid(-W, z - 1, W, z + (z < 0 ? 0.5 : 1), -20, 40);

    // --- one mesh per material for everything that doesn't move
    statics.updateMatrixWorld(true);
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const keep: THREE.Object3D[] = [];
    statics.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) {
        if (o instanceof THREE.Mesh) keep.push(o);
        return;
      }
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (!g.index) return keep.push(o);
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
      if (!g.attributes.uv) return keep.push(o);
      const l = byMat.get(o.material);
      if (l) l.push(g);
      else byMat.set(o.material, [g]);
    });
    for (const [m, gs] of byMat) {
      const g = mergeGeometries(gs);
      if (!g) continue;
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = this.shadows && !(m as THREE.MeshLambertMaterial).transparent;
      mesh.receiveShadow = this.shadows;
      if ((m as THREE.MeshLambertMaterial).transparent) mesh.renderOrder = 3;
      R.add(mesh);
    }
    for (const o of keep) R.attach(o);

    // the train, drawn only inside the railway
    this.train = new Train(this.world, new THREE.Vector3(-RX, TB - 0.5, PORTAL), new THREE.Vector3(RX, 8, DARK), { color: new THREE.Color(0.02, 0.022, 0.024), density: 0.004 });
    this.train.mesh.visible = false;
    R.add(this.train.mesh);
    this.setTime(false);
  }
}
