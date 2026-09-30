// The end. When every quest is done the floor gives way and you drop into a hall
// under the building: the entrance of DPG Media (VTM) on the Medialaan, indoors
// under a painted sky, with the flags, the hedges and the sign on the lawn.
// Ten steps in, you've finished the game.
// The hall is built on first use with ordinary three.js materials and lights;
// while you're in it the building is hidden and this is the only thing drawn.
import * as THREE from "three";
import type { Sound, Surface } from "./audio";
import type { Ground, Player } from "./player";

type Phase = "off" | "shake" | "fall" | "drop" | "walk" | "done";

const W = 60, Z0 = -70, Z1 = 36, TOP = 30; // the hall: x -W..W, z Z0..Z1, TOP high
const SPAWN = { x: -5, z: 6, yaw: -0.35 };
const DROP = 22; // you come in through the painted sky, this high
const STEPS = 10;
const G = 9.8;

type Box = [number, number, number, number];
type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

function canvasTex(w: number, h: number, draw: Draw, repeat = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, amt: number) {
  const d = g.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    for (let c = 0; c < 3; c++) d.data[i + c] = d.data[i + c]! + n;
  }
  g.putImageData(d, 0, 0);
}

// box UVs in metres (divided by `scale`), so one repeating texture fits any size
function metreUV(geo: THREE.BufferGeometry, scale: number) {
  const p = geo.attributes.position!, n = geo.attributes.normal!, uv = geo.attributes.uv!;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [u, v] = ax > 0.5 ? [p.getZ(i), p.getY(i)] : ay > 0.5 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv.setXY(i, u / scale, v / scale);
  }
  return geo;
}

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const BARS = ["#f39200", "#e5352c", "#d8207f", "#7b3f98"];

// "dpg" with "media" above it and the four coloured bars
function drawLogo(g: CanvasRenderingContext2D, x: number, y: number, s: number, ink: string) {
  g.fillStyle = ink;
  g.textBaseline = "alphabetic";
  g.font = `700 ${s}px ${FONT}`;
  g.fillText("dpg", x, y);
  const wd = g.measureText("dpg").width;
  g.font = `600 ${s * 0.36}px ${FONT}`;
  g.fillText("media", x + wd * 0.46, y - s * 0.62);
  const bx = x + wd * 0.46 + g.measureText("media").width + s * 0.06;
  const hs = [0.34, 0.5, 0.66, 0.46];
  BARS.forEach((c, k) => {
    g.fillStyle = c;
    const bw = s * 0.1, bh = s * hs[k]!;
    g.fillRect(bx + k * bw * 1.3, y - s * 0.6 - bh * 0.5, bw, bh);
  });
}

const FLAGS: { top: string; bot: string; text: string; font: string; size: number }[] = [
  { top: "#77717f", bot: "#4c4754", text: "Willy", font: `italic 700 {s}px Georgia, serif`, size: 96 },
  { top: "#4f9ce6", bot: "#2b6ec2", text: "Joe", font: `900 {s}px ${FONT}`, size: 112 },
  { top: "#ef5a4f", bot: "#c93838", text: "Q", font: `900 {s}px ${FONT}`, size: 170 },
  { top: "#f2536a", bot: "#b875b8", text: "vtm", font: `900 {s}px ${FONT}`, size: 118 },
  { top: "#6d5bb0", bot: "#443887", text: "vtm2", font: `900 {s}px ${FONT}`, size: 90 },
  { top: "#e2607c", bot: "#9c4a8e", text: "vtm3", font: `900 {s}px ${FONT}`, size: 90 },
  { top: "#5a4a9e", bot: "#3a2f78", text: "vtm4", font: `900 {s}px ${FONT}`, size: 90 },
];

export class Finale implements Ground {
  root = new THREE.Group();
  phase: Phase = "off";
  steps = 0;
  fade = 1; // for the camcorder pass: 0 black .. 1 picture
  glitch = 0;
  onEnter = () => {}; // the hall takes the building's place
  onDone = () => {}; // ten steps in
  private t = 0;
  private vy = 0;
  private built = false;
  private boxes: Box[] = [];
  private lawns: Box[] = [];
  private flags: { geo: THREE.BufferGeometry; base: Float32Array; k: number }[] = [];

  constructor(private player: Player, private sound: Sound, private shadows: boolean) {
    this.root.visible = false;
  }

  get active() {
    return this.phase !== "off";
  }
  // you're in the hall (or on your way down into it)
  get inHall() {
    return this.phase === "drop" || this.phase === "walk" || this.phase === "done";
  }
  get walking() {
    return this.phase === "walk" || this.phase === "done";
  }

  start() {
    if (this.phase !== "off") return;
    this.phase = "shake";
    this.t = 0;
    this.sound.rumble();
    if (!this.built) this.build();
  }

  // a footstep in the hall
  step() {
    if (this.phase !== "walk") return;
    if (++this.steps >= STEPS) {
      this.phase = "done";
      this.t = 0;
    }
  }

  surface(x: number, z: number): Surface {
    return this.lawns.some((b) => x > b[0] && x < b[2] && z > b[1] && z < b[3]) ? "carpet" : "concrete";
  }

  update(dt: number) {
    this.t += dt;
    const P = this.player;
    if (this.flags.length && this.root.visible) this.wave();
    switch (this.phase) {
      case "shake":
        // the floor trembles, then cracks
        P.shake = Math.min(2.5, 0.6 + this.t * 1.4);
        this.glitch = Math.min(0.5, this.t * 0.3);
        if (this.t > 1.6) {
          this.phase = "fall";
          this.t = 0;
          this.vy = 0;
          this.sound.crack();
        }
        break;
      case "fall":
        this.vy -= G * dt;
        P.pos.y += this.vy * dt;
        P.viewY = P.pos.y;
        P.pitch += (-0.9 - P.pitch) * Math.min(1, dt * 2);
        this.glitch = 0.5 + this.t * 0.6;
        this.fade = Math.max(0, 1 - this.t / 0.8);
        if (this.t > 1.1) {
          this.root.visible = true;
          this.onEnter();
          P.pos.set(SPAWN.x, DROP, SPAWN.z);
          P.viewY = DROP;
          P.vx = P.vz = 0;
          P.yaw = SPAWN.yaw;
          P.pitch = -0.7;
          P.keys.clear();
          this.phase = "drop";
          this.t = 0;
          this.vy = -3;
        }
        break;
      case "drop":
        this.vy -= G * dt;
        P.pos.y = Math.max(0, P.pos.y + this.vy * dt);
        P.viewY = P.pos.y;
        P.pitch += (-0.05 - P.pitch) * Math.min(1, dt * 1.2);
        this.fade = Math.min(1, this.t / 0.7);
        this.glitch = Math.max(0, 0.4 - this.t * 0.3);
        if (P.pos.y <= 0) {
          this.phase = "walk";
          this.t = 0;
          this.fade = 1;
          this.glitch = 0;
          P.shake = 1.4;
          this.sound.land();
          this.sound.say("Welkom op de Medialaan.", 1, 0.9);
        }
        break;
      case "done":
        if (this.t > 0.8 && this.t - dt <= 0.8) this.onDone();
        break;
    }
  }

  // --- Ground, for the player
  boxesNear(_f: number, x: number, z: number, r: number, out: number[]) {
    out.length = 0;
    for (const b of this.boxes) if (b[0] < x + r && b[2] > x - r && b[1] < z + r && b[3] > z - r) out.push(...b);
    return out;
  }

  groundAt(x: number, z: number) {
    return x > -W + 0.6 && x < W - 0.6 && z > Z0 + 0.6 && z < Z1 - 0.6 ? 0 : null;
  }

  private wave() {
    for (const f of this.flags) {
      const p = f.geo.attributes.position!;
      for (let i = 0; i < p.count; i++) {
        const x = f.base[i * 3]!, y = f.base[i * 3 + 1]!;
        const u = x / 1.4;
        p.setZ(i, Math.sin(this.t * 2.3 + u * 4.5 + y * 0.35 - f.k * 0.8) * 0.2 * (0.15 + u));
      }
      p.needsUpdate = true;
      f.geo.computeVertexNormals();
    }
  }

  // --- the hall
  private build() {
    this.built = true;
    const R = this.root;
    const lam = (map: THREE.Texture | null, color = 0xffffff) => new THREE.MeshLambertMaterial({ map, color });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, cast = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = cast && this.shadows;
      m.receiveShadow = this.shadows;
      R.add(m);
      return m;
    };
    // an axis-aligned block from (x0, y0, z0) to (x1, y1, z1), solid unless told otherwise
    const block = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: THREE.Material, scale = 2, solid = true) => {
      if (solid) this.boxes.push([x0, z0, x1, z1]);
      return add(metreUV(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), scale), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    };
    const pole = (x: number, z: number, h: number, r: number, mat: THREE.Material) => {
      this.boxes.push([x - r - 0.05, z - r - 0.05, x + r + 0.05, z + r + 0.05]);
      return add(new THREE.CylinderGeometry(r, r, h, 10), mat, x, h / 2, z);
    };

    // light: a hazy sun through the painted sky, and the lamps
    const hemi = new THREE.HemisphereLight(0xdde6f2, 0x6b665c, 1.5);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.position.set(-30, 45, 25);
    sun.target.position.set(0, 0, -10);
    if (this.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera;
      c.left = -60; c.right = 60; c.top = 55; c.bottom = -55; c.near = 1; c.far = 140;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.04;
    }
    R.add(hemi, sun, sun.target);

    // materials
    const brick = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#6c655c";
      g.fillRect(0, 0, w, h);
      const bw = 64, bh = 32;
      for (let r = 0; r < h / bh; r++)
        for (let c = -1; c < w / bw + 1; c++) {
          const v = 128 + (Math.random() - 0.5) * 34, warm = Math.random() * 12;
          g.fillStyle = `rgb(${v + warm},${v + warm * 0.5 - 4},${v - 12})`;
          g.fillRect(c * bw + (r % 2) * (bw / 2) + 2, r * bh + 2, bw - 4, bh - 4);
        }
      speckle(g, w, h, 18);
    }, true);
    const grass = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#5f8a36";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `hsl(${88 + Math.random() * 18},${40 + Math.random() * 20}%,${26 + Math.random() * 18}%)`;
        g.fillRect(Math.random() * w, Math.random() * h, 1.5, 3 + Math.random() * 3);
      }
    }, true);
    const hedgeT = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#2e4a22";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1800; i++) {
        g.fillStyle = `hsl(${85 + Math.random() * 25},${35 + Math.random() * 20}%,${14 + Math.random() * 22}%)`;
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, 1.5 + Math.random() * 3, 0, 7);
        g.fill();
      }
    }, true);
    const clad = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = "#c9ccce";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 8);
      g.fillStyle = "rgba(90,95,100,0.55)";
      for (let y = 0; y < h; y += 102) g.fillRect(0, y, w, 3); // 0.8 m panels
      g.fillStyle = "rgba(90,95,100,0.3)";
      g.fillRect(0, 0, 2, h);
    }, true);
    const glassT = canvasTex(256, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#8ea6bd");
      gr.addColorStop(0.45, "#4e6275");
      gr.addColorStop(0.7, "#2c3a44");
      gr.addColorStop(1, "#1b2228");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      // trees reflected in it
      for (let i = 0; i < 30; i++) {
        g.fillStyle = `rgba(${40 + Math.random() * 30},${60 + Math.random() * 30},${40},0.35)`;
        g.beginPath();
        g.arc(Math.random() * w, h * (0.52 + Math.random() * 0.12), 12 + Math.random() * 20, 0, 7);
        g.fill();
      }
      g.fillStyle = "#b8bcc0";
      g.fillRect(0, 0, 6, h); // mullion
      g.fillRect(0, h * 0.33, w, 5); // transom
    }, true);
    const concrete = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#9c9a95";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 22);
    }, true);
    const steel = lam(null, 0xb7bcc0);
    const dark = lam(null, 0x2a2c2e);
    const hedge = lam(hedgeT);
    const grassM = lam(grass);

    // the floor, the lawns
    const floorG = new THREE.PlaneGeometry(2 * W, Z1 - Z0).rotateX(-Math.PI / 2);
    metreUV(floorG, 2);
    add(floorG, lam(brick), 0, 0, (Z0 + Z1) / 2, false);
    const lawn = (x0: number, z0: number, x1: number, z1: number) => {
      this.lawns.push([x0, z0, x1, z1]);
      block(x0 - 0.12, 0, z0 - 0.12, x1 + 0.12, 0.1, z1 + 0.12, lam(concrete), 2, false).castShadow = false;
      block(x0, 0.1, z0, x1, 0.12, z1, grassM, 2.5, false).castShadow = false;
    };
    lawn(2, -32, W - 1, -2);
    lawn(-W + 1, -30, -30, 12);
    lawn(-W + 1, -60, -48, -30);

    // the building: a long grey block, a lower glass front on the left, the entrance
    block(-47, 0, -58, 16, 13, -34, lam(clad), 4);
    block(-47.2, 12.6, -58.2, 16.2, 13.4, -33.8, lam(null, 0x8d9296), 2, false);
    block(16, 0, -58, 30, 8, -40, lam(clad), 4);
    block(-41, 0, -34, -11, 7.4, -29, lam(glassT), 3);
    block(-41.2, 7.4, -34, -10.8, 7.8, -28.8, steel, 2, false);
    block(-41.3, 0, -29.2, -40.8, 7.4, -28.8, steel, 2, false);
    block(-11.2, 0, -29.2, -10.7, 7.4, -28.8, steel, 2, false);
    // the revolving door, under a canopy, and a step up to it
    const door = new THREE.MeshLambertMaterial({ color: 0x1e262c, transparent: true, opacity: 0.8 });
    add(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 20, 1, true), door, -26, 1.3, -28.2);
    add(new THREE.CylinderGeometry(1.5, 1.5, 0.3, 20), steel, -26, 2.75, -28.2);
    this.boxes.push([-27.5, -29.7, -24.5, -28.9]);
    block(-30, 3.1, -29, -22, 3.35, -26, dark, 2, false);
    block(-44, 0, -29, -9, 0.14, -27, lam(concrete), 2, false).castShadow = false;
    // the logo on the grey block
    const logoTex = canvasTex(1024, 384, (g) => drawLogo(g, 30, 330, 250, "#3a3b3e"));
    const logo = add(new THREE.PlaneGeometry(14, 5.3), new THREE.MeshLambertMaterial({ map: logoTex, transparent: true, alphaTest: 0.1 }), -1, 9, -33.97, false);
    logo.receiveShadow = false;

    // the island with the big clipped hedge, a cone, an orange post
    block(-15, 0, -23, -1, 0.4, -12, lam(concrete), 2);
    block(-14.6, 0.4, -22.6, -1.4, 1.3, -12.4, hedge, 1.5, false);
    add(new THREE.SphereGeometry(1, 24, 14), hedge, -7.5, 1.4, -17.5).scale.set(5.8, 1.6, 4.2);
    add(new THREE.SphereGeometry(1, 16, 12), hedge, -16.5, 1.5, -25).scale.set(1, 1.5, 1);
    this.boxes.push([-17.6, -26.1, -15.4, -23.9]);
    pole(-2.4, -11, 2.4, 0.09, lam(null, 0xff6a1a));
    // hedges on the lawn, low hedges along the building
    block(3, 0, -32, W - 1, 1.2, -30.6, hedge, 1.5);
    block(8, 0, -6, 15, 1.4, -3, hedge, 1.5);
    block(22, 0, -9, 42, 1.1, -7.6, hedge, 1.5);
    block(-9, 0, -30.5, 1, 0.9, -29, hedge, 1.5);

    // the flags
    this.flags = [];
    FLAGS.forEach((fl, k) => {
      const x = 5 + k * 6.6, z = -24 + k * 2.4, h = 12.5 + (k % 2) * 0.4;
      pole(x, z, h, 0.07, steel);
      add(new THREE.BoxGeometry(1.5, 0.05, 0.05), steel, x + 0.75, h - 0.3, z, false);
      const tex = canvasTex(256, 840, (g, w, hh) => {
        const gr = g.createLinearGradient(0, 0, w * 0.3, hh);
        gr.addColorStop(0, fl.top);
        gr.addColorStop(1, fl.bot);
        g.fillStyle = gr;
        g.fillRect(0, 0, w, hh);
        g.fillStyle = "rgba(255,255,255,0.92)";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = fl.font.replace("{s}", String(fl.size));
        g.fillText(fl.text, w / 2, 190);
        g.font = `600 22px ${FONT}`;
        g.fillStyle = "rgba(255,255,255,0.6)";
        g.fillText(fl.text === "Q" ? "music" : fl.text.toLowerCase().replace(/\d/, "") + ".be", w / 2, 740);
      });
      const geo = new THREE.PlaneGeometry(1.4, 4.6, 10, 14).translate(0.7, -2.3, 0);
      const m = add(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }), x + 0.08, h - 0.32, z);
      m.receiveShadow = false;
      this.flags.push({ geo, base: Float32Array.from(geo.attributes.position!.array), k });
    });

    // the dpg media sign on the lawn
    const signTex = canvasTex(1024, 384, (g, w, h) => {
      g.fillStyle = "#f2f2f0";
      g.fillRect(0, 0, w, h);
      drawLogo(g, 150, 300, 230, "#242528");
    });
    const white = lam(null, 0xededeb);
    add(new THREE.BoxGeometry(8, 3, 0.8), [white, white, white, white, lam(signTex), white], 32, 1.6, -4.8);
    this.boxes.push([28, -5.2, 36, -4.4]);

    // the blue sign, the bollards, no entry, a lamppost
    const blueTex = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = "#1f5fb4";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#fff";
      g.lineWidth = 8;
      g.strokeRect(14, 14, w - 28, h - 28);
      g.fillStyle = "#fff";
      g.textAlign = "center";
      g.font = `700 64px ${FONT}`;
      g.fillText("KLEURT JE DAG", w / 2, 130);
      g.font = `600 30px ${FONT}`;
      g.fillText("PLEIN →", w / 2, 190);
    });
    pole(-6.2, -25, 3.3, 0.05, steel);
    pole(-3.8, -25, 3.3, 0.05, steel);
    add(new THREE.BoxGeometry(3, 1.4, 0.08), [steel, steel, steel, steel, lam(blueTex), steel], -5, 2.6, -25);
    for (const [x, z] of [[-19, -4], [-19.5, 1], [-12, -10], [-24, -8]] as const) pole(x, z, 1, 0.12, steel);
    pole(6, -1.2, 2.5, 0.04, steel);
    const noEntry = canvasTex(128, 128, (g) => {
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(64, 64, 63, 0, 7);
      g.fill();
      g.fillStyle = "#d52b1e";
      g.beginPath();
      g.arc(64, 64, 56, 0, 7);
      g.fill();
      g.fillStyle = "#fff";
      g.fillRect(24, 54, 80, 20);
    });
    add(new THREE.CircleGeometry(0.34, 24), new THREE.MeshLambertMaterial({ map: noEntry, side: THREE.DoubleSide }), 6, 2.3, -1.15, false);
    pole(-28, 3, 9, 0.11, lam(null, 0x9ea3a6));
    add(new THREE.BoxGeometry(0.5, 0.25, 1.4), dark, -28, 8.9, 2.4, false);

    // the arrow painted on the bricks
    const arrow = canvasTex(256, 256, (g) => {
      g.fillStyle = "rgba(225,225,220,0.85)";
      g.beginPath();
      g.arc(128, 128, 124, 0, 7);
      g.fill();
      g.fillStyle = "#38393b";
      g.beginPath();
      g.moveTo(40, 128);
      g.lineTo(120, 70);
      g.lineTo(120, 106);
      g.lineTo(212, 106);
      g.lineTo(212, 150);
      g.lineTo(120, 150);
      g.lineTo(120, 186);
      g.closePath();
      g.fill();
    });
    const am = new THREE.MeshLambertMaterial({ map: arrow, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    add(new THREE.CircleGeometry(2.6, 40).rotateX(-Math.PI / 2), am, -14, 0.01, -3, false).scale.set(1.4, 1, 1);

    // a tree turning red on the left lawn
    add(new THREE.CylinderGeometry(0.22, 0.3, 4.2, 8), lam(null, 0x4a3a2c), -42, 2.1, -8);
    this.boxes.push([-42.4, -8.4, -41.6, -7.6]);
    for (const [dx, dy, dz, r, c] of [[0, 5.2, 0, 2.6, 0x8a4a2e], [1.3, 4.4, 0.8, 1.9, 0x9a6a36], [-1.2, 4.6, -0.6, 2, 0x6e5a2e], [0.2, 6.6, -0.3, 1.6, 0xa0522d]] as const) {
      const leaves = new THREE.MeshLambertMaterial({ color: c, flatShading: true });
      add(new THREE.IcosahedronGeometry(r, 1), leaves, -42 + dx, dy, -8 + dz);
    }

    // the hall itself: walls and ceiling painted as sky, trees and a car park along the bottom
    const wallTex = canvasTex(2048, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#6f98cf");
      gr.addColorStop(0.72, "#c9d8e6");
      gr.addColorStop(0.8, "#dfe6ea");
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const cx = Math.random() * w, cy = 40 + Math.random() * h * 0.45;
        for (let k = 0; k < 7; k++) {
          g.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.3})`;
          g.beginPath();
          g.ellipse(cx + (Math.random() - 0.5) * 120, cy + (Math.random() - 0.5) * 24, 30 + Math.random() * 60, 12 + Math.random() * 18, 0, 0, 7);
          g.fill();
        }
      }
      // the tree line
      for (let x = 0; x < w; x += 5) {
        const th = 50 + Math.sin(x * 0.013) * 18 + Math.random() * 22;
        g.fillStyle = `hsl(${80 + Math.random() * 30},${25 + Math.random() * 15}%,${22 + Math.random() * 12}%)`;
        g.fillRect(x, h * 0.84 - th, 6, th + 4);
      }
      for (let x = 0; x < w; x += 70 + Math.random() * 90) {
        g.strokeStyle = "rgba(60,50,45,0.6)";
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x, h * 0.84);
        g.lineTo(x + (Math.random() - 0.5) * 10, h * 0.84 - 90 - Math.random() * 40);
        g.stroke();
      }
      // parked cars, a fence, the ground
      g.fillStyle = "#8e9396";
      g.fillRect(0, h * 0.84, w, h * 0.16);
      for (let x = 0; x < w; x += 26 + Math.random() * 14) {
        g.fillStyle = `hsl(${Math.random() * 360},${Math.random() * 20}%,${35 + Math.random() * 45}%)`;
        g.fillRect(x, h * 0.84 - 10, 22, 12);
      }
      g.fillStyle = "rgba(50,55,50,0.5)";
      for (let x = 0; x < w; x += 4) g.fillRect(x, h * 0.8, 1, h * 0.05);
      g.fillRect(0, h * 0.8, w, 2);
    });
    const ceilTex = canvasTex(1024, 1024, (g, w, h) => {
      g.fillStyle = "#7ea3d6";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        const cx = Math.random() * w, cy = Math.random() * h;
        for (let k = 0; k < 8; k++) {
          g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.4})`;
          g.beginPath();
          g.ellipse(cx + (Math.random() - 0.5) * 140, cy + (Math.random() - 0.5) * 60, 40 + Math.random() * 60, 25 + Math.random() * 40, Math.random() * 3, 0, 7);
          g.fill();
        }
      }
    });
    const paint = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, color: new THREE.Color(0.92, 0.92, 0.92), side: THREE.BackSide, fog: false });
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const wall = paint(wallTex);
    add(new THREE.BoxGeometry(2 * W, TOP, Z1 - Z0), [wall, wall, paint(ceilTex), hidden, wall, wall], 0, TOP / 2, (Z0 + Z1) / 2, false).receiveShadow = false;

    // high-bay lamps hanging from the sky
    const lampPos: [number, number][] = [];
    for (let x = -48; x <= 48; x += 24) for (let z = -60; z <= 30; z += 22) lampPos.push([x, z]);
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
      const im = new THREE.InstancedMesh(geo, mat, lampPos.length);
      const m = new THREE.Matrix4();
      lampPos.forEach(([x, z], i) => im.setMatrixAt(i, m.makeTranslation(x, y, z)));
      R.add(im);
    };
    inst(new THREE.CylinderGeometry(0.015, 0.015, 5), dark, TOP - 2.5);
    inst(new THREE.CylinderGeometry(0.25, 0.6, 0.5, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x3a3c3e, side: THREE.DoubleSide }), TOP - 5.2);
    inst(new THREE.CircleGeometry(0.55, 16).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.35, 2.2) }), TOP - 5.44);
  }
}
