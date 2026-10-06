// De weerstudio: when you're near its return monitors, the studio camera is
// rendered from the live world (every other frame, into two targets in turn), and the monitors key out
// the green and show the weather map behind whatever is left. Stand on the
// mark and you're the weatherman.
import * as THREE from "three";
import { CHUNK } from "./config";
import { getFurnished } from "./furnish";
import { makeFigure } from "./cctv";
import type { Player } from "./player";
import type { World } from "./world";

const W = 512, H = 288;
const FIGURE = 2; // render layer only the studio camera sees

export class WeerCam {
  // two: the monitors show one while the other is drawn (the world material can't sample what it renders into)
  private rts = [0, 1].map(() => new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }));
  private read = 0;
  private cam = new THREE.PerspectiveCamera(36, W / H, 0.1, 30);
  private figure: THREE.Mesh;
  private key = "";
  private scanT = 0;
  private skip = 0;
  active = false;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private mat: THREE.ShaderMaterial, world: World, private player: Player, private slow = false) {
    mat.uniforms.weerTex!.value = this.rts[0]!.texture;
    this.cam.layers.enable(FIGURE);
    // a little brighter than on the security cameras: the studio is lit
    this.figure = makeFigure(scene, mat, world, FIGURE, 0.9);
  }

  // the studio camera of the weerstudio you're near: the camera closest to its return monitors
  private find() {
    const P = this.player.pos, f = this.player.floor;
    const cx0 = Math.floor(P.x / CHUNK), cz0 = Math.floor(P.z / CHUNK);
    let mon: { x: number; z: number; k: string } | null = null, bd = 14;
    const cams: { x: number; y: number; z: number; rot: number }[] = [];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++)
        for (const p of getFurnished(f, cx0 + dx, cz0 + dz).props) {
          if (p.t === "camera") cams.push(p);
          if (p.t !== "weermon") continue;
          const d = Math.hypot(p.x - P.x, p.z - P.z);
          if (d < bd) { bd = d; mon = { x: p.x, z: p.z, k: `${f}:${Math.round(p.x)},${Math.round(p.z)}` }; }
        }
    if (!mon) return null;
    let cam = null, cd = 4;
    for (const c of cams) {
      const d = Math.hypot(c.x - mon.x, c.z - mon.z);
      if (d < cd) { cd = d; cam = c; }
    }
    return cam ? { cam, key: mon.k } : null;
  }

  update(dt: number) {
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 0.5;
      const r = this.find();
      const key = r ? r.key : "";
      if (key !== this.key) {
        this.key = key;
        this.active = !!r;
        this.mat.uniforms.weerOn!.value = r ? 1 : 0;
        if (r) {
          // just in front of the lens, looking at the green wall
          const { cam: c } = r;
          const fx = Math.sin(c.rot), fz = Math.cos(c.rot);
          this.cam.position.set(c.x + fx * 0.65, c.y + 1.49, c.z + fz * 0.65);
          this.cam.lookAt(this.cam.position.x + fx, this.cam.position.y - 0.12, this.cam.position.z + fz);
        }
      }
    }
    if (!this.active) return;
    const P = this.player;
    this.figure.position.set(P.pos.x, P.pos.y, P.pos.z);
    this.figure.rotation.y = P.yaw + Math.PI;
    if ((this.skip = (this.skip + 1) % (this.slow ? 3 : 2)) !== 0) return;
    const r = this.renderer;
    r.setRenderTarget(this.rts[1 - this.read]!);
    r.render(this.scene, this.cam);
    r.setRenderTarget(null);
    this.read = 1 - this.read;
    this.mat.uniforms.weerTex!.value = this.rts[this.read]!.texture;
  }
}
