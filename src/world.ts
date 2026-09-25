// Streams chunk-floors in and out around the player using a worker pool, and
// answers physical queries (collision boxes, ground height).
import * as THREE from "three";
import { CEIL, CELL, CH, FLOOR_MAX, FLOOR_MIN, H, ST_HALF, ST_U1, ST_U2, ST_VM } from "./config";
import type { Built } from "./builder";
import type { ElevOut } from "./chunk";
import { K, gardenRampY, gardenStair, getStructure, kindAt, stairFrame, towerGround, towerSpec } from "./layout";
import { floorDiv } from "./rng";

export interface ElevRT {
  id: string;
  f: number;
  gx: number;
  gz: number;
  x: number;
  z: number;
  px: number;
  pz: number;
  d: number;
  open: number;
  panels: THREE.Mesh[];
}

interface Rec {
  key: string;
  f: number;
  cx: number;
  cz: number;
  ready: boolean;
  group?: THREE.Group;
  boxes?: Float32Array;
  elevs: ElevRT[];
}

type Job = { key: string; kind: "chunk" | "ext"; f: number; cx: number; cz: number; pri: number };

const ck = (f: number, cx: number, cz: number) => `${f}:${cx},${cz}`;

export class World {
  recs = new Map<string, Rec>();
  exts = new Map<string, { ready: boolean; mesh?: THREE.Mesh }>();
  root = new THREE.Group();
  workers: Worker[] = [];
  busy: (Job | null)[] = [];
  queue: Job[] = [];
  lastKey = "";
  elevators = new Map<string, ElevRT>();
  extraBoxes: { f: number; box: [number, number, number, number] }[] = [];
  onChunkMs: (ms: number) => void = () => {};

  constructor(workerUrl: string, seed: number, public mat: THREE.ShaderMaterial, public glassMat: THREE.ShaderMaterial, public radius = 2) {
    const n = radius < 2 ? 2 : Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(workerUrl, { type: "module" });
      w.postMessage({ type: "init", seed });
      w.onmessage = (e) => this.onResult(i, e.data);
      this.workers.push(w);
      this.busy.push(null);
    }
  }

  geometry(b: Built) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(b.pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(b.uv, 2));
    g.setAttribute("layer", new THREE.BufferAttribute(b.layer, 1));
    g.setAttribute("light", new THREE.BufferAttribute(b.light, 3));
    g.setAttribute("flick", new THREE.BufferAttribute(b.flick, 2));
    g.setIndex(new THREE.BufferAttribute(b.index, 1));
    g.computeBoundingSphere();
    return g;
  }

  private glassGeometry(b: Built) {
    if (!b.gpos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(b.gpos, 3));
    g.setAttribute("rgba", new THREE.BufferAttribute(b.gcol, 4));
    g.setIndex(new THREE.BufferAttribute(b.gindex, 1));
    g.computeBoundingSphere();
    return g;
  }

  private onResult(wi: number, m: any) {
    this.busy[wi] = null;
    if (m.type === "chunk") {
      this.onChunkMs(m.ms);
      const rec = this.recs.get(m.key);
      if (!rec) return; // unloaded while building
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(this.geometry(m.built), this.mat);
      group.add(mesh);
      const gg = this.glassGeometry(m.built);
      if (gg) {
        const gm = new THREE.Mesh(gg, this.glassMat);
        gm.renderOrder = 2;
        group.add(gm);
      }
      for (const e of m.elevs as ElevOut[]) {
        const panels = e.panels.map((p) => {
          const pm = new THREE.Mesh(this.geometry(p), this.mat);
          group.add(pm);
          return pm;
        });
        const id = ck(m.f, e.gx, e.gz);
        const rt: ElevRT = { id, f: m.f, gx: e.gx, gz: e.gz, x: e.x, z: e.z, px: e.px, pz: e.pz, d: e.d, open: 0, panels };
        const prev = this.elevators.get(id);
        if (prev) rt.open = prev.open;
        this.elevators.set(id, rt);
        rec.elevs.push(rt);
      }
      rec.group = group;
      rec.boxes = m.built.boxes;
      rec.ready = true;
      this.root.add(group);
    } else if (m.type === "ext") {
      const e = this.exts.get(m.key);
      if (!e) return;
      e.ready = true;
      if (m.built) {
        e.mesh = new THREE.Mesh(this.geometry(m.built), this.mat);
        const gg = this.glassGeometry(m.built);
        if (gg) {
          const gm = new THREE.Mesh(gg, this.glassMat);
          gm.renderOrder = 2;
          e.mesh.add(gm);
        }
        this.root.add(e.mesh);
      }
    }
    this.pump();
  }

  private pump() {
    for (let i = 0; i < this.workers.length; i++) {
      if (this.busy[i] || !this.queue.length) continue;
      const job = this.queue.shift()!;
      this.busy[i] = job;
      if (job.kind === "chunk") this.workers[i]!.postMessage({ type: "chunk", key: job.key, f: job.f, cx: job.cx, cz: job.cz });
      else this.workers[i]!.postMessage({ type: "ext", key: job.key, cx: job.cx, cz: job.cz });
    }
  }

  // Decide what should be loaded around (x, z) on floor f.
  update(x: number, z: number, f: number, force = false) {
    const pcx = floorDiv(x, CH * CELL), pcz = floorDiv(z, CH * CELL);
    const key = `${f}:${pcx},${pcz}`;
    if (key === this.lastKey && !force) {
      this.pump();
      return;
    }
    this.lastKey = key;
    const want = new Map<string, Job>();
    const add = (ff: number, cx: number, cz: number, pri: number) => {
      if (ff < FLOOR_MIN || ff > FLOOR_MAX) return;
      const k = ck(ff, cx, cz);
      const cur = want.get(k);
      if (!cur || cur.pri > pri) want.set(k, { key: k, kind: "chunk", f: ff, cx, cz, pri });
    };
    const R = this.radius;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dz));
        const cx = pcx + dx, cz = pcz + dz;
        add(f, cx, cz, d + Math.hypot(dx, dz) * 0.01);
        if (d <= 1) {
          add(f - 1, cx, cz, d + 1.5);
          add(f + 1, cx, cz, d + 1.5);
          const a = getStructure(cx, cz).atrium;
          if (a && f >= a.f0 && f <= a.f1) for (let ff = a.f0; ff <= a.f1; ff++) add(ff, cx, cz, d + 2 + Math.abs(ff - f) * 0.3);
        }
      }
    const wantExt = new Map<string, Job>();
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        const st = getStructure(cx, cz);
        if (st.court || st.mid || st.special === "park") wantExt.set(`${cx},${cz}`, { key: `${cx},${cz}`, kind: "ext", f: 0, cx, cz, pri: Math.max(Math.abs(dx), Math.abs(dz)) + 0.5 });
      }

    // unload what is well outside the wanted set
    for (const [k, rec] of this.recs) {
      if (want.has(k)) continue;
      const far = Math.max(Math.abs(rec.cx - pcx), Math.abs(rec.cz - pcz)) > R + 1 || Math.abs(rec.f - f) > 2;
      const atr = getStructure(rec.cx, rec.cz).atrium;
      const keepAtr = atr && f >= atr.f0 && f <= atr.f1 && rec.f >= atr.f0 && rec.f <= atr.f1 && Math.max(Math.abs(rec.cx - pcx), Math.abs(rec.cz - pcz)) <= 2;
      if (far && !keepAtr) this.unload(k, rec);
    }
    for (const [k, e] of this.exts)
      if (!wantExt.has(k)) {
        const [cx, cz] = k.split(",").map(Number);
        if (Math.max(Math.abs(cx! - pcx), Math.abs(cz! - pcz)) > 3) {
          if (e.mesh) {
            this.root.remove(e.mesh);
            e.mesh.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
          }
          this.exts.delete(k);
        }
      }

    const jobs: Job[] = [];
    for (const [k, j] of want)
      if (!this.recs.has(k)) {
        this.recs.set(k, { key: k, f: j.f, cx: j.cx, cz: j.cz, ready: false, elevs: [] });
        jobs.push(j);
      } else if (!this.recs.get(k)!.ready) jobs.push(j);
    for (const [k, j] of wantExt)
      if (!this.exts.has(k)) {
        this.exts.set(k, { ready: false });
        jobs.push(j);
      } else if (!this.exts.get(k)!.ready) jobs.push(j);
    const inFlight = new Set(this.busy.filter(Boolean).map((j) => j!.kind + j!.key));
    this.queue = jobs.filter((j) => !inFlight.has(j.kind + j.key)).sort((a, b) => a.pri - b.pri);
    this.pump();
  }

  // Make sure a floor is being built around (x, z) without unloading anything.
  ensure(f: number, x: number, z: number) {
    const pcx = floorDiv(x, CH * CELL), pcz = floorDiv(z, CH * CELL);
    let added = false;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = ck(f, pcx + dx, pcz + dz);
        if (this.recs.has(k)) continue;
        this.recs.set(k, { key: k, f, cx: pcx + dx, cz: pcz + dz, ready: false, elevs: [] });
        this.queue.unshift({ key: k, kind: "chunk", f, cx: pcx + dx, cz: pcz + dz, pri: -1 });
        added = true;
      }
    if (added) this.pump();
  }

  private unload(k: string, rec: Rec) {
    if (rec.group) {
      this.root.remove(rec.group);
      rec.group.traverse((o) => {
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      });
    }
    for (const e of rec.elevs) this.elevators.delete(e.id);
    this.recs.delete(k);
  }

  isReady(f: number, cx: number, cz: number) {
    return !!this.recs.get(ck(f, cx, cz))?.ready;
  }

  readyAround(x: number, z: number, f: number, r = 1) {
    const pcx = floorDiv(x, CH * CELL), pcz = floorDiv(z, CH * CELL);
    let total = 0, ready = 0;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        total++;
        if (this.isReady(f, pcx + dx, pcz + dz)) ready++;
      }
    return ready / total;
  }

  // Collision boxes near a point on a floor (x0, z0, x1, z1 quadruples).
  boxesNear(f: number, x: number, z: number, r: number, out: number[]) {
    out.length = 0;
    for (const e of this.extraBoxes)
      if (e.f === f && e.box[0] < x + r && e.box[2] > x - r && e.box[1] < z + r && e.box[3] > z - r) out.push(...e.box);
    const c0x = floorDiv(x - r - 1, CH * CELL), c1x = floorDiv(x + r + 1, CH * CELL);
    const c0z = floorDiv(z - r - 1, CH * CELL), c1z = floorDiv(z + r + 1, CH * CELL);
    for (let cz = c0z; cz <= c1z; cz++)
      for (let cx = c0x; cx <= c1x; cx++) {
        const rec = this.recs.get(ck(f, cx, cz));
        if (!rec?.boxes) continue;
        const b = rec.boxes;
        for (let i = 0; i < b.length; i += 4)
          if (b[i]! < x + r && b[i + 2]! > x - r && b[i + 1]! < z + r && b[i + 3]! > z - r) out.push(b[i]!, b[i + 1]!, b[i + 2]!, b[i + 3]!);
        for (const e of rec.elevs)
          if (e.open < 0.85 && Math.abs(e.x - x) < r + 1 && Math.abs(e.z - z) < r + 1) {
            const hw = 0.6;
            out.push(e.x - Math.abs(e.px) * hw - 0.05, e.z - Math.abs(e.pz) * hw - 0.05, e.x + Math.abs(e.px) * hw + 0.05, e.z + Math.abs(e.pz) * hw + 0.05);
          }
      }
    return out;
  }

  // Ground height under (x, z) for a body whose feet are at y, or null if
  // the spot is not walkable (unloaded, void, too big a step).
  groundAt(x: number, z: number, y: number): number | null {
    const f = Math.floor((y + 0.3) / H);
    if (f < FLOOR_MIN || f > FLOOR_MAX) return null;
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
    const cx = floorDiv(gx, CH), cz = floorDiv(gz, CH);
    if (!this.isReady(f, cx, cz)) return null;
    // the floating stair in a plantentuin
    const gs = gardenStair(getStructure(cx, cz));
    if (gs) {
      const ry = gardenRampY(gs, x, z, H);
      if (ry !== null && y > gs.f0 * H - 0.5 && y < (gs.f0 + 1) * H + 0.5) {
        const flat = gs.f0 * H;
        const cands = [ry];
        // walking underneath is only possible where there is headroom
        if (ry - flat < 0.45 || ry - flat > 2.1) cands.push(flat);
        let best: number | null = null;
        // prefer stepping onto the stair over staying on the floor below it
        for (const c of cands) if (Math.abs(c - y) < 0.45 && (best === null || c > best)) best = c;
        return best;
      }
    }
    // the spiral stair of De Toren
    const ts = towerSpec(getStructure(cx, cz), H, CEIL);
    if (ts && y >= ts.y0 - 0.5 && y <= ts.y0 + ts.deck + 0.5) {
      const tg = towerGround(ts, x, z, y);
      if (tg !== undefined) return tg;
    }
    const k = kindAt(f, gx, gz);
    if (k === K.STAIR) {
      const sf = stairFrame(cx, cz)!;
      const u = (x - sf.ox) * sf.Dx + (z - sf.oz) * sf.Dz;
      const v = (x - sf.ox) * sf.Px + (z - sf.oz) * sf.Pz;
      let best: number | null = null;
      for (let kk = f - 1; kk <= f + 1; kk++) {
        if (kk < FLOOR_MIN || kk > FLOOR_MAX) continue;
        const b = kk * H;
        let c: number | null = null;
        if (u < ST_U1) c = b;
        else if (kk < FLOOR_MAX) {
          if (u > ST_U2) c = b + ST_HALF;
          else if (v < ST_VM) c = b + ((u - ST_U1) / (ST_U2 - ST_U1)) * ST_HALF;
          else c = b + ST_HALF + ((ST_U2 - u) / (ST_U2 - ST_U1)) * ST_HALF;
        }
        if (c === null) continue;
        if (Math.abs(c - y) < 0.45 && (best === null || Math.abs(c - y) < Math.abs(best - y))) best = c;
      }
      return best;
    }
    if (k === K.CORR || k === K.ROOM || k === K.ELEV || k === K.GARAGE || k === K.ROOF) {
      const g = f * H;
      return Math.abs(g - y) < 0.45 ? g : null;
    }
    return null;
  }
}
