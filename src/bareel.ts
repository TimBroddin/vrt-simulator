// De bareel: now and then a boom goes up, as if a car came through, stays up a
// while and comes down again. The traffic light by it is green while it's up.
// The arms and the lamps are built here, on the main thread, for the bareels
// near you; while an arm is down it blocks the lane.
import * as THREE from "three";
import { CELL, CHUNK, H } from "./config";
import { Builder, LightCtx, type Built, type Spec } from "./builder";
import { bareelBooms, getStructure } from "./layout";
import { L } from "./layers";
import type { Sound } from "./audio";
import type { Player } from "./player";
import type { World } from "./world";

const RISE = 2.2; // seconds to go up (or down)
const DISC = new THREE.CylinderGeometry(1, 1, 1, 16, 1);

interface Boom {
  arm: THREE.Mesh;
  red: [THREE.Mesh, THREE.Mesh]; // on, off
  green: [THREE.Mesh, THREE.Mesh];
  block: { f: number; box: [number, number, number, number] };
  f: number;
  x: number;
  z: number;
  up: number; // 0 down, 1 up
  state: "down" | "rising" | "up" | "falling";
  wait: number;
}

export class Bareels {
  private sites = new Map<string, Boom[]>();
  private scanT = 0;

  constructor(private scene: THREE.Scene, private mat: THREE.Material, private world: World, private player: Player, private sound: Sound) {}

  private mesh(b: Built) {
    const m = new THREE.Mesh(this.world.geometry(b), this.mat);
    m.frustumCulled = false;
    this.scene.add(m);
    return m;
  }

  private build(key: string, cx: number, cz: number, f: number) {
    const ox = cx * CHUNK, oz = cz * CHUNK, y0 = f * H;
    const ctx = new LightCtx(f, cx, cz);
    const booms = bareelBooms(ox, oz, y0).map((bm): Boom => {
      // the arm, round its hinge, pointing -x: red and white lengths
      const b = new Builder(ctx);
      b.ox = bm.hx; b.oy = bm.hy; b.oz = bm.hz;
      b.cell(Math.floor((bm.hx - bm.len / 2) / CELL), Math.floor(bm.hz / CELL));
      const n = Math.round((bm.len - 0.2) / 0.5);
      for (let k = 0; k < n; k++) {
        const u0 = 0.2 + (k * (bm.len - 0.2)) / n, u1 = 0.2 + ((k + 1) * (bm.len - 0.2)) / n;
        b.aabox(-u1, -0.05, -0.05, -u0, 0.05, 0.05, { layer: L.WHITE, tint: k % 2 ? [0.92, 0.92, 0.9] : [0.8, 0.08, 0.06] });
      }
      b.aabox(-0.25, -0.09, -0.09, 0.12, 0.09, 0.09, { layer: L.WHITE, tint: [0.3, 0.3, 0.32] });
      const arm = this.mesh(b.finish());
      arm.position.set(bm.hx, bm.hy, bm.hz);
      // the lamps of the traffic light, lit and unlit
      const lamp = (y: number, spec: Spec) => {
        const lb = new Builder(ctx);
        lb.cell(Math.floor(bm.tx / CELL), Math.floor(bm.tz / CELL));
        lb.geom(DISC, bm.tx, y0 + y, bm.tz + bm.face * 0.1, 0, 0.08, 0.02, 0.08, spec, Math.PI / 2);
        return this.mesh(lb.finish());
      };
      const red: [THREE.Mesh, THREE.Mesh] = [lamp(2.55, { layer: L.WHITE, emit: [2.2, 0.2, 0.1] }), lamp(2.55, { layer: L.WHITE, tint: [0.18, 0.04, 0.03] })];
      const green: [THREE.Mesh, THREE.Mesh] = [lamp(2.22, { layer: L.WHITE, emit: [0.2, 2.0, 0.6] }), lamp(2.22, { layer: L.WHITE, tint: [0.04, 0.14, 0.06] })];
      const block = { f, box: [bm.hx - bm.len, bm.hz - 0.12, bm.hx, bm.hz + 0.12] as [number, number, number, number] };
      this.world.extraBoxes.push(block);
      return { arm, red, green, block, f, x: bm.hx - bm.len / 2, z: bm.hz, up: 0, state: "down", wait: 3 + Math.random() * 12 };
    });
    this.sites.set(key, booms);
  }

  private drop(key: string) {
    for (const bm of this.sites.get(key) ?? []) {
      for (const m of [bm.arm, ...bm.red, ...bm.green]) {
        this.scene.remove(m);
        m.geometry.dispose();
      }
      const i = this.world.extraBoxes.indexOf(bm.block);
      if (i >= 0) this.world.extraBoxes.splice(i, 1);
    }
    this.sites.delete(key);
  }

  update(dt: number) {
    const P = this.player.pos;
    // which bareels are near (a chunk or two away, whatever floor it's on)
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 1;
      const cx0 = Math.floor(P.x / CHUNK), cz0 = Math.floor(P.z / CHUNK);
      const want = new Set<string>();
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const cx = cx0 + dx, cz = cz0 + dz;
          const a = getStructure(cx, cz).atrium;
          if (a?.kind !== "bareel" || !this.world.isReady(a.f0, cx, cz)) continue;
          const key = `${cx},${cz}`;
          want.add(key);
          if (!this.sites.has(key)) this.build(key, cx, cz, a.f0);
        }
      for (const key of [...this.sites.keys()]) if (!want.has(key)) this.drop(key);
    }
    for (const booms of this.sites.values())
      for (const bm of booms) {
        const near = bm.f === this.player.floor ? Math.hypot(bm.x - P.x, bm.z - P.z) : 99;
        if (bm.state === "down" || bm.state === "up") {
          if ((bm.wait -= dt) <= 0) {
            bm.state = bm.state === "down" ? "rising" : "falling";
            if (near < 30) this.sound.boom(Math.max(0.15, 1 - near / 30));
          }
        } else {
          bm.up = Math.min(1, Math.max(0, bm.up + (bm.state === "rising" ? dt : -dt) / RISE));
          if (bm.state === "rising" && bm.up >= 1) { bm.state = "up"; bm.wait = 3.5 + Math.random() * 3; }
          if (bm.state === "falling" && bm.up <= 0) { bm.state = "down"; bm.wait = 8 + Math.random() * 18; }
        }
        // eased, up to nearly vertical
        const e = bm.up * bm.up * (3 - 2 * bm.up);
        bm.arm.rotation.z = -e * 1.45;
        const go = bm.state === "up";
        bm.red[0].visible = !go; bm.red[1].visible = go;
        bm.green[0].visible = go; bm.green[1].visible = !go;
        // the arm blocks the lane unless it's (mostly) up
        bm.block.f = bm.up > 0.6 ? -999 : bm.f;
      }
  }
}
