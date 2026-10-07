// Heading-up minimap of the current floor. The 3x3 chunks around you are
// drawn once into an offscreen canvas, then rotated every frame.
import { CELL, CH, CHUNK, DX, DZ } from "./config";
import { K, SK, getPlan, sideAt } from "./layout";
import { dot, foodIcon, liftIcon, phoneIcon, stairIcon, toiletIcon } from "./mapicons";
import { getFurnished } from "./furnish";
import { PROP_FOOD } from "./food";

const PX = 15; // pixels per cell in the offscreen map (sharp enough for a retina minimap)

export const FILL: Record<number, string> = {
  [K.CORR]: "#c9c9c1",
  [K.ROOM]: "#6d7078",
  [K.STAIR]: "#e0b84a",
  [K.ELEV]: "#ff2e7e",
  [K.VOID]: "#2b3440",
  [K.COURT]: "#3f5a33",
  [K.GARAGE]: "#8a8a85",
  [K.ROOF]: "#77787a",
};

// Paint an n x n block of cells (floor f, starting at grid gx0, gz0) at px pixels per cell.
export function paintCells(g: CanvasRenderingContext2D, f: number, gx0: number, gz0: number, n: number, px: number) {
  const lw = Math.max(1, px / 6);
  for (let dz = 0; dz < n; dz++)
    for (let dx = 0; dx < n; dx++) {
      const gx = gx0 + dx, gz = gz0 + dz;
      const cx = Math.floor(gx / CH), cz = Math.floor(gz / CH);
      const p = getPlan(f, cx, cz);
      const k = p.kind[(gz - cz * CH) * CH + (gx - cx * CH)]!;
      const col = FILL[k];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(dx * px, dz * px, px, px);
      // walls, doors, glass
      for (let d = 0; d < 4; d++) {
        const s = sideAt(f, gx, gz, d);
        if (s.sk === SK.OPEN || s.sk === SK.NONE || s.sk === SK.DOOR) continue;
        g.fillStyle = s.sk === SK.GLASS || s.sk === SK.WINDOW ? "#8fd3ff" : s.sk === SK.RAIL ? "#d8d8d8" : "#111";
        const x = dx * px, y = dz * px;
        if (DX[d] === 1) g.fillRect(x + px - lw, y, lw, px);
        else if (DX[d] === -1) g.fillRect(x, y, lw, px);
        else if (DZ[d] === 1) g.fillRect(x, y + px - lw, px, lw);
        else g.fillRect(x, y, px, lw);
      }
    }
}

// The stairwells and lift banks on a chunk-floor, one per group of their
// cells, at its middle (for the icons on the minimap and the plattegrond).
export interface Way {
  x: number;
  z: number;
  kind: "stair" | "lift";
}
const waysCache = new Map<string, Way[]>();
export function waysIn(f: number, cx: number, cz: number): Way[] {
  const key = `${f}:${cx},${cz}`;
  let out = waysCache.get(key);
  if (out) return out;
  out = [];
  const p = getPlan(f, cx, cz), seen = new Uint8Array(CH * CH);
  for (let i0 = 0; i0 < CH * CH; i0++) {
    const k = p.kind[i0];
    if (seen[i0] || (k !== K.STAIR && k !== K.ELEV)) continue;
    // (the cells of this one, by flood fill)
    let sx = 0, sz = 0, n = 0;
    const stack = [i0];
    seen[i0] = 1;
    while (stack.length) {
      const i = stack.pop()!, x = i % CH, z = (i / CH) | 0;
      sx += x;
      sz += z;
      n++;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d]!, nz = z + DZ[d]!, j = nz * CH + nx;
        if (nx < 0 || nz < 0 || nx >= CH || nz >= CH || seen[j] || p.kind[j] !== k) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    out.push({ x: (cx * CH + sx / n + 0.5) * CELL, z: (cz * CH + sz / n + 0.5) * CELL, kind: k === K.STAIR ? "stair" : "lift" });
  }
  waysCache.set(key, out);
  if (waysCache.size > 3000) waysCache.delete(waysCache.keys().next().value!);
  return out;
}

// Where there's food on a chunk-floor: one per counter, cooler or machine.
export interface FoodPlace {
  x: number;
  z: number;
  food: string;
}
const foodCache = new Map<string, FoodPlace[]>();
export function foodIn(f: number, cx: number, cz: number): FoodPlace[] {
  const key = `${f}:${cx},${cz}`;
  let out = foodCache.get(key);
  if (!out) {
    // (a counter is a row of pieces, a canteen has a few: the same food close together is one icon, in their middle)
    const groups: (FoodPlace & { n: number })[] = [];
    for (const pr of getFurnished(f, cx, cz).props) {
      const food = PROP_FOOD[pr.t];
      if (!food) continue;
      const gr = groups.find((o) => o.food === food && Math.hypot(o.x - pr.x, o.z - pr.z) < 12);
      if (!gr) groups.push({ x: pr.x, z: pr.z, food, n: 1 });
      else {
        gr.x = (gr.x * gr.n + pr.x) / (gr.n + 1);
        gr.z = (gr.z * gr.n + pr.z) / (gr.n + 1);
        gr.n++;
      }
    }
    out = groups.map(({ x, z, food }) => ({ x, z, food }));
    foodCache.set(key, out);
    if (foodCache.size > 3000) foodCache.delete(foodCache.keys().next().value!);
  }
  return out;
}

export interface MapTarget {
  x: number;
  z: number;
  f: number;
  col: string;
  r?: number; // dot size (default 5)
  near?: boolean; // only when it's on your floor and on the map (the others), not pinned to the edge
  icon?: "phone" | "toilet";
}

const RANGE = 33; // m from you to the rim

export class Minimap {
  el: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  off = document.createElement("canvas");
  og: CanvasRenderingContext2D;
  key = "";
  ways: Way[] = [];
  food: FoodPlace[] = [];
  ox = 0;
  oz = 0;
  constructor(public visible = true) {
    this.el = document.getElementById("minimap") as HTMLCanvasElement;
    this.el.style.display = visible ? "block" : "none";
    this.g = this.el.getContext("2d")!;
    this.off.width = this.off.height = CH * 3 * PX;
    this.og = this.off.getContext("2d")!;
  }

  toggle() {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? "block" : "none";
  }

  private build(f: number, pcx: number, pcz: number) {
    const g = this.og;
    g.clearRect(0, 0, this.off.width, this.off.height);
    this.ox = (pcx - 1) * CHUNK;
    this.oz = (pcz - 1) * CHUNK;
    paintCells(g, f, (pcx - 1) * CH, (pcz - 1) * CH, CH * 3, PX);
    this.ways = [];
    this.food = [];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        this.ways.push(...waysIn(f, pcx + dx, pcz + dz));
        this.food.push(...foodIn(f, pcx + dx, pcz + dz));
      }
  }

  draw(f: number, x: number, z: number, yaw: number, targets: MapTarget[]) {
    if (!this.visible) return;
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    const key = `${f}:${pcx},${pcz}`;
    if (key !== this.key) {
      this.key = key;
      this.build(f, pcx, pcz);
    }
    // (as sharp as the screen: the canvas follows its size on the page)
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const L = this.el.clientWidth || 140, size = Math.round(L * dpr);
    if (this.el.width !== size) this.el.width = this.el.height = size;
    // (the dial sits a little in, so north on the rim fits)
    const IN = 8, g = this.g, R = L / 2 - IN, s = (R - 4) / RANGE, t = performance.now() / 1000;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, L, L);
    g.translate(IN, IN);
    g.save();
    g.beginPath();
    g.arc(R, R, R - 1, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "rgba(8,9,11,0.82)";
    g.fillRect(0, 0, L, L);
    // the floor, turned so the way you're facing is up
    g.save();
    g.translate(R, R);
    g.rotate(yaw);
    g.scale(s / (PX / CELL), s / (PX / CELL));
    g.globalAlpha = 0.95;
    g.drawImage(this.off, -(x - this.ox) * (PX / CELL), -(z - this.oz) * (PX / CELL));
    g.restore();
    // what you're looking at
    const cone = g.createRadialGradient(R, R, 0, R, R, R * 0.85);
    cone.addColorStop(0, "rgba(255,255,255,0.22)");
    cone.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = cone;
    g.beginPath();
    g.moveTo(R, R);
    g.arc(R, R, R, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
    g.closePath();
    g.fill();
    // the edge fades out
    const vig = g.createRadialGradient(R, R, R * 0.55, R, R, R);
    vig.addColorStop(0, "rgba(8,9,11,0)");
    vig.addColorStop(1, "rgba(8,9,11,0.7)");
    g.fillStyle = vig;
    g.fillRect(0, 0, L, L);
    // the stairs and the lifts, upright
    const c0 = Math.cos(yaw), s0 = Math.sin(yaw);
    for (const w of this.ways) {
      const dx = (w.x - x) * s, dz = (w.z - z) * s;
      const mx = dx * c0 - dz * s0, my = dx * s0 + dz * c0;
      if (Math.hypot(mx, my) > R - 8) continue;
      (w.kind === "stair" ? stairIcon : liftIcon)(g, R + mx, R + my, 5.5);
    }
    // and the food
    for (const p of this.food) {
      const dx = (p.x - x) * s, dz = (p.z - z) * s;
      const mx = dx * c0 - dz * s0, my = dx * s0 + dz * c0;
      if (Math.hypot(mx, my) > R - 8) continue;
      foodIcon(g, R + mx, R + my, 6, p.food);
    }
    g.restore();

    // the bezel: a ring, ticks every 30 degrees (turning with you), north on the rim
    g.strokeStyle = "rgba(255,255,255,0.75)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(R, R, R - 1, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = yaw + (i * Math.PI) / 6, long = i % 3 === 0;
      const sx = Math.sin(a), sy = -Math.cos(a);
      g.strokeStyle = `rgba(255,255,255,${long ? 0.7 : 0.35})`;
      g.lineWidth = long ? 1.5 : 1;
      g.beginPath();
      g.moveTo(R + sx * (R - (long ? 7 : 5)), R + sy * (R - (long ? 7 : 5)));
      g.lineTo(R + sx * (R - 2), R + sy * (R - 2));
      g.stroke();
    }

    // the others, the phones or your job, the waypoint
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const order = [...targets].sort((a, b) => Number(!!a.near) - Number(!!b.near)).reverse(); // (the others underneath)
    for (const tg of order) {
      const dx = (tg.x - x) * s, dz = (tg.z - z) * s;
      let mx = dx * c - dz * sn, my = dx * sn + dz * c;
      const len = Math.hypot(mx, my), lim = R - 13;
      if (tg.near && (tg.f !== f || len > lim)) continue;
      const out = len > lim;
      if (out) {
        // on the rim, with a chevron pointing the way
        mx *= lim / len;
        my *= lim / len;
        const ux = mx / lim, uy = my / lim, px = R + ux * (R - 4), py = R + uy * (R - 4);
        g.fillStyle = tg.col;
        g.beginPath();
        g.moveTo(px + ux * 3, py + uy * 3);
        g.lineTo(px - uy * 4 - ux * 2, py + ux * 4 - uy * 2);
        g.lineTo(px + uy * 4 - ux * 2, py - ux * 4 - uy * 2);
        g.closePath();
        g.fill();
      }
      const X = R + mx, Y = R + my;
      if (tg.icon === "phone") phoneIcon(g, X, Y, out ? 6 : 7.5, tg.col, t, !out);
      else if (tg.icon === "toilet") toiletIcon(g, X, Y, out ? 6 : 7.5, tg.col);
      else dot(g, X, Y, (tg.r ?? 5) * (out ? 0.85 : 1), tg.col);
      if (tg.f !== f) {
        g.font = "700 9px ui-monospace, Menlo, monospace";
        g.textAlign = "center";
        g.textBaseline = "bottom";
        g.fillStyle = "#fff";
        g.fillText(`${tg.f > f ? "▲" : "▼"}${Math.abs(tg.f - f)}`, X, Y - 8);
      }
    }

    // you
    g.fillStyle = "#fff";
    g.strokeStyle = "#0b0c0e";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(R, R - 8);
    g.lineTo(R + 5.5, R + 6);
    g.lineTo(R, R + 3);
    g.lineTo(R - 5.5, R + 6);
    g.closePath();
    g.stroke();
    g.fill();

    // north
    const nx = R + Math.sin(yaw) * (R - 1), ny = R - Math.cos(yaw) * (R - 1);
    g.fillStyle = "#ff2e7e";
    g.strokeStyle = "#0b0c0e";
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(nx, ny, 7, 0, 7);
    g.fill();
    g.stroke();
    g.fillStyle = "#fff";
    g.font = "800 9px ui-monospace, Menlo, monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("N", nx, ny + 0.5);
  }
}
