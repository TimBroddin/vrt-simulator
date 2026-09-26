import * as THREE from "three";
import { EYE, H } from "./config";
import type { World } from "./world";

const R = 0.3;

export class Player {
  pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  vx = 0;
  vz = 0;
  viewY = 0; // smoothed feet height for the camera
  phase = 0;
  bob = 0;
  keys = new Set<string>();
  analog = { x: 0, z: 0, run: false };
  running = false;
  speed = 0;
  shake = 0;
  onStep: (run: boolean) => void = () => {};
  private buf: number[] = [];

  get floor() {
    // (+0.7: the doorgangen are 60 cm below their floor)
    return Math.floor((this.pos.y + 0.7) / H);
  }

  look(dx: number, dy: number) {
    this.yaw -= dx * 0.0022;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * 0.0022));
  }

  private resolve(world: World, x: number, z: number): [number, number] {
    const b = world.boxesNear(this.floor, x, z, 1.2, this.buf);
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (let i = 0; i < b.length; i += 4) {
        const x0 = b[i]!, z0 = b[i + 1]!, x1 = b[i + 2]!, z1 = b[i + 3]!;
        const cx = Math.max(x0, Math.min(x, x1)), cz = Math.max(z0, Math.min(z, z1));
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        moved = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          x += (dx / d) * (R - d);
          z += (dz / d) * (R - d);
        } else {
          // centre inside the box: leave along the shallowest axis
          const pl = x - x0, pr = x1 - x, pu = z - z0, pd = z1 - z;
          const m = Math.min(pl, pr, pu, pd);
          if (m === pl) x = x0 - R;
          else if (m === pr) x = x1 + R;
          else if (m === pu) z = z0 - R;
          else z = z1 + R;
        }
      }
      if (!moved) break;
    }
    return [x, z];
  }

  private tryMove(world: World, nx: number, nz: number) {
    const [x, z] = this.resolve(world, nx, nz);
    const g = world.groundAt(x, z, this.pos.y);
    if (g === null) return false;
    this.pos.x = x;
    this.pos.z = z;
    this.pos.y = g;
    return true;
  }

  update(dt: number, world: World, active: boolean) {
    let fx = 0, fz = 0;
    if (active) {
      const k = this.keys;
      if (k.has("KeyW") || k.has("ArrowUp")) fz -= 1;
      if (k.has("KeyS") || k.has("ArrowDown")) fz += 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) fx -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) fx += 1;
      fx += this.analog.x;
      fz += this.analog.z;
    }
    this.running = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || (active && this.analog.run);
    const len = Math.hypot(fx, fz);
    const sp = (this.running ? 3.6 : 1.9) * Math.min(1, len);
    let tx = 0, tz = 0;
    if (len > 0) {
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      const lx = (fx / len) * sp, lz = (fz / len) * sp;
      tx = lx * c + lz * s;
      tz = -lx * s + lz * c;
    }
    const a = Math.min(1, dt * 9);
    this.vx += (tx - this.vx) * a;
    this.vz += (tz - this.vz) * a;
    const dx = this.vx * dt, dz = this.vz * dt;
    const ox = this.pos.x, oz = this.pos.z;
    if (Math.abs(dx) + Math.abs(dz) > 1e-6) {
      if (!this.tryMove(world, ox + dx, oz + dz)) if (!this.tryMove(world, ox + dx, oz)) this.tryMove(world, ox, oz + dz);
    } else {
      // keep resolving so closing doors push us out
      this.tryMove(world, ox, oz);
    }
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    this.speed = moved / Math.max(dt, 1e-4);
    if (moved > 0.0005) {
      const stride = this.running ? 1.6 : 1.25;
      const prev = this.phase;
      this.phase += (moved / stride) * Math.PI * 2;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI)) this.onStep(this.running);
    }
    const bobAmp = Math.min(1, this.speed / 2) * (this.running ? 0.05 : 0.032);
    this.bob += (Math.sin(this.phase) * bobAmp - this.bob) * Math.min(1, dt * 12);
    const dy = this.pos.y - this.viewY;
    this.viewY += Math.abs(dy) > 2 ? dy : dy * Math.min(1, dt * 14);
    this.shake = Math.max(0, this.shake - dt * 0.5);
  }

  apply(cam: THREE.PerspectiveCamera, t: number) {
    const sh = this.shake;
    cam.position.set(
      this.pos.x + (sh ? Math.sin(t * 37) * 0.006 * sh : 0),
      this.viewY + EYE + this.bob + (sh ? Math.sin(t * 53) * 0.01 * sh : 0),
      this.pos.z,
    );
    cam.rotation.set(this.pitch, this.yaw, Math.cos(this.phase * 0.5) * this.bob * 0.15, "YXZ");
  }
}
