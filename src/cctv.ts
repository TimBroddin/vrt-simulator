// De bewaking: when you're near a security room, six cameras around it are
// rendered from the live world into a 3 x 2 atlas, one feed per frame (so each
// runs at a jerky ~10 fps, like the real thing). The monitors sample the atlas
// that was finished last, never the one being drawn. You're on the feeds too.
import * as THREE from "three";
import { CELL, CH, CHUNK, floorName, isRtbf } from "./config";
import { Builder, Frame, LightCtx, fbox } from "./builder";
import { getFurnished, type Prop } from "./furnish";
import { cellLabel } from "./layout";
import { L } from "./layers";
import { person } from "./quests";
import type { Player } from "./player";
import type { World } from "./world";

const FW = 320, FH = 240, N = 6;
const FIGURE = 1; // render layer only the cameras see

interface Feed {
  cam: THREE.PerspectiveCamera;
  label: string;
  floor: string;
}

export class CCTV {
  private rts = [0, 1].map(() => new THREE.WebGLRenderTarget(FW * 3, FH * 2, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }));
  private read = 0;
  private feeds: (Feed | null)[] = [];
  private room = "";
  private next = 0;
  private scanT = 0;
  private labelT = 0;
  private canvas = document.createElement("canvas");
  private labels: THREE.CanvasTexture;
  private figure: THREE.Mesh;
  private skip = 0;
  active = false;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private mat: THREE.ShaderMaterial, private world: World, private player: Player, private slow = false) {
    this.canvas.width = FW * 3;
    this.canvas.height = FH * 2;
    this.labels = new THREE.CanvasTexture(this.canvas);
    this.labels.minFilter = THREE.LinearFilter;
    this.labels.generateMipmaps = false;
    mat.uniforms.cctvTex!.value = this.rts[0]!.texture;
    mat.uniforms.cctvLabels!.value = this.labels;
    this.drawLabels();
    // you, as the cameras see you: someone with a camera on their shoulder
    const b = new Builder(new LightCtx(0, 0, 0, "outdoor"));
    const fr = new Frame(0, 0, 0, 0);
    person(b, fr, [0.18, 0.2, 0.24], [0.25, 0.18, 0.12], [0.18, 0.2, 0.24], false);
    fbox(b, fr, 0.2, 1.46, 0.05, 0.16, 0.2, 0.42, { layer: L.WHITE, tint: [0.1, 0.1, 0.11] });
    fbox(b, fr, 0.2, 1.52, 0.29, 0.1, 0.1, 0.08, { layer: L.WHITE, tint: [0.05, 0.05, 0.05] });
    const built = b.finish();
    for (let i = 0; i < built.light.length; i++) built.light[i]! *= 0.5;
    this.figure = new THREE.Mesh(world.geometry(built), mat);
    this.figure.layers.set(FIGURE);
    this.figure.frustumCulled = false;
    scene.add(this.figure);
  }

  // the monitor wall of the security room you're near, if any
  private nearestRoom(): { key: string; x: number; z: number; f: number } | null {
    const P = this.player.pos, f = this.player.floor;
    const cx0 = Math.floor(P.x / CHUNK), cz0 = Math.floor(P.z / CHUNK);
    let best: { key: string; x: number; z: number; f: number } | null = null, bd = 18;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++)
        for (const p of getFurnished(f, cx0 + dx, cz0 + dz).props) {
          if (p.t !== "cctvwall") continue;
          const d = Math.hypot(p.x - P.x, p.z - P.z);
          if (d < bd) { bd = d; best = { key: `${f}:${cx0 + dx},${cz0 + dz}:${p.b}`, x: p.x, z: p.z, f }; }
        }
    return best;
  }

  private pickFeeds(r: { x: number; z: number; f: number }) {
    const cands: { p: Prop; f: number; score: number }[] = [];
    const cx0 = Math.floor(r.x / CHUNK), cz0 = Math.floor(r.z / CHUNK);
    for (const f of [r.f, r.f - 1, r.f + 1])
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!this.world.isReady(f, cx0 + dx, cz0 + dz)) continue;
          for (const p of getFurnished(f, cx0 + dx, cz0 + dz).props) {
            if (p.t !== "cctv") continue;
            const d = Math.hypot(p.x - r.x, p.z - r.z);
            // its own camera first, then the ones around it; other floors a little later
            cands.push({ p, f, score: p.b && f === r.f && d < 12 ? -1 : d + Math.abs(f - r.f) * 22 });
          }
        }
    cands.sort((a, b) => a.score - b.score);
    const chosen: typeof cands = [];
    for (const c of cands) {
      if (chosen.length >= N) break;
      if (chosen.some((o) => o.f === c.f && Math.hypot(o.p.x - c.p.x, o.p.z - c.p.z) < 5)) continue;
      chosen.push(c);
    }
    this.feeds = Array.from({ length: N }, (_, k) => {
      const c = chosen[k];
      if (!c) return null;
      const { p, f } = c;
      const pitch = p.a / 100;
      const fx = Math.sin(p.rot), fz = Math.cos(p.rot);
      const cam = new THREE.PerspectiveCamera(80, FW / FH, 0.08, 70);
      cam.position.set(p.x + fx * 0.3, p.y - 0.2, p.z + fz * 0.3);
      cam.lookAt(cam.position.x + fx * Math.cos(pitch), cam.position.y - Math.sin(pitch), cam.position.z + fz * Math.cos(pitch));
      cam.layers.enable(FIGURE);
      const gx = Math.floor(cam.position.x / CELL), gz = Math.floor(cam.position.z / CELL);
      return { cam, label: cellLabel(f, gx, gz), floor: floorName(f, isRtbf(Math.floor(gz / CH))) };
    });
    this.next = 0;
    this.drawLabels();
  }

  private drawLabels() {
    const g = this.canvas.getContext("2d")!;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const now = new Date();
    const p2 = (n: number) => String(n).padStart(2, "0");
    const stamp = `${p2(now.getDate())}-${p2(now.getMonth() + 1)}-${now.getFullYear()} ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
    g.textBaseline = "top";
    for (let k = 0; k < N; k++) {
      const x = (k % 3) * FW, y = Math.floor(k / 3) * FH;
      const f = this.feeds[k];
      g.font = "700 15px ui-monospace, Menlo, monospace";
      if (!f || !this.active) {
        g.fillStyle = "#101112";
        g.fillRect(x, y, FW, FH);
        g.fillStyle = "rgba(255,255,255,0.08)";
        for (let i = 0; i < 400; i++) g.fillRect(x + Math.random() * FW, y + Math.random() * FH, 2, 2);
        g.fillStyle = "#cfd8d2";
        g.textAlign = "center";
        g.fillText(this.active ? "GEEN SIGNAAL" : "STAND-BY", x + FW / 2, y + FH / 2 - 8);
        g.textAlign = "left";
        g.fillText(`CAM ${p2(k + 1)}`, x + 10, y + 8);
        continue;
      }
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.fillRect(x + 6, y + 6, g.measureText(`CAM ${p2(k + 1)} ${f.label}`).width + 8, 20);
      g.fillRect(x + 6, y + FH - 26, g.measureText(stamp).width + 8, 20);
      g.fillStyle = "#e8f0ea";
      g.textAlign = "left";
      g.fillText(`CAM ${p2(k + 1)} ${f.label}`, x + 10, y + 9);
      g.fillText(stamp, x + 10, y + FH - 23);
      g.textAlign = "right";
      g.font = "700 12px ui-monospace, Menlo, monospace";
      g.fillText(f.floor, x + FW - 10, y + FH - 21);
      if (now.getSeconds() % 2) {
        g.fillStyle = "#ff3322";
        g.fillText("● REC", x + FW - 10, y + 10);
      }
    }
    this.labels.needsUpdate = true;
  }

  update(dt: number) {
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.6;
      const r = this.nearestRoom();
      const key = r ? r.key : "";
      if (key !== this.room) {
        this.room = key;
        this.active = !!r;
        if (r) this.pickFeeds(r);
        else this.drawLabels();
      }
    }
    if (!this.active) return;
    if ((this.labelT -= dt) <= 0) {
      this.labelT = 1;
      this.drawLabels();
    }
    // you, where the cameras can see you
    const P = this.player;
    this.figure.position.set(P.pos.x, P.pos.y, P.pos.z);
    this.figure.rotation.y = P.yaw + Math.PI;
    if (this.slow && (this.skip ^= 1)) return;
    // one feed per frame into the back buffer; swap when all six are in
    const k = this.next;
    const f = this.feeds[k];
    const rt = this.rts[1 - this.read]!;
    const x = (k % 3) * FW, y = (1 - Math.floor(k / 3)) * FH;
    rt.viewport.set(x, y, FW, FH);
    rt.scissor.set(x, y, FW, FH);
    rt.scissorTest = true;
    const r = this.renderer;
    r.setRenderTarget(rt);
    if (f) r.render(this.scene, f.cam);
    else r.clear();
    r.setRenderTarget(null);
    this.next = (k + 1) % N;
    if (this.next === 0) {
      this.read = 1 - this.read;
      this.mat.uniforms.cctvTex!.value = this.rts[this.read]!.texture;
    }
  }
}
