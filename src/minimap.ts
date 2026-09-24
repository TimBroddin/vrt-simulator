// Heading-up minimap of the current floor. The 3x3 chunks around you are
// drawn once into an offscreen canvas, then rotated every frame.
import { CELL, CH, CHUNK, DX, DZ } from "./config";
import { K, SK, getPlan, sideAt } from "./layout";

const PX = 9; // pixels per cell in the offscreen map

const FILL: Record<number, string> = {
  [K.CORR]: "#c9c9c1",
  [K.ROOM]: "#6d7078",
  [K.STAIR]: "#e0b84a",
  [K.ELEV]: "#ff2e7e",
  [K.VOID]: "#2b3440",
  [K.COURT]: "#3f5a33",
  [K.GARAGE]: "#8a8a85",
  [K.ROOF]: "#77787a",
};

export class Minimap {
  el: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  off = document.createElement("canvas");
  og: CanvasRenderingContext2D;
  key = "";
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
    const gx0 = (pcx - 1) * CH, gz0 = (pcz - 1) * CH;
    for (let dz = 0; dz < CH * 3; dz++)
      for (let dx = 0; dx < CH * 3; dx++) {
        const gx = gx0 + dx, gz = gz0 + dz;
        const cx = Math.floor(gx / CH), cz = Math.floor(gz / CH);
        const p = getPlan(f, cx, cz);
        const k = p.kind[(gz - cz * CH) * CH + (gx - cx * CH)]!;
        const col = FILL[k];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(dx * PX, dz * PX, PX, PX);
        // walls, doors, glass
        for (let d = 0; d < 4; d++) {
          const s = sideAt(f, gx, gz, d);
          if (s.sk === SK.OPEN || s.sk === SK.NONE || s.sk === SK.DOOR) continue;
          g.fillStyle = s.sk === SK.GLASS || s.sk === SK.WINDOW ? "#8fd3ff" : s.sk === SK.RAIL ? "#d8d8d8" : "#111";
          const x = dx * PX, y = dz * PX;
          if (DX[d] === 1) g.fillRect(x + PX - 1.5, y, 1.5, PX);
          else if (DX[d] === -1) g.fillRect(x, y, 1.5, PX);
          else if (DZ[d] === 1) g.fillRect(x, y + PX - 1.5, PX, 1.5);
          else g.fillRect(x, y, PX, 1.5);
        }
      }
  }

  draw(f: number, x: number, z: number, yaw: number, target: { x: number; z: number; f: number } | null) {
    if (!this.visible) return;
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    const key = `${f}:${pcx},${pcz}`;
    if (key !== this.key) {
      this.key = key;
      this.build(f, pcx, pcz);
    }
    const g = this.g;
    const W = this.el.width, R = W / 2;
    const s = PX / CELL;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath();
    g.arc(R, R, R - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = "rgba(8,9,11,0.78)";
    g.fillRect(0, 0, W, W);
    g.translate(R, R);
    g.rotate(yaw);
    g.globalAlpha = 0.92;
    g.drawImage(this.off, -(x - this.ox) * s, -(z - this.oz) * s);
    g.restore();
    // ring + you
    g.strokeStyle = "rgba(255,255,255,0.6)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(R, R, R - 2, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(R, R - 13);
    g.lineTo(R + 9, R + 9);
    g.lineTo(R, R + 4);
    g.lineTo(R - 9, R + 9);
    g.closePath();
    g.fill();
    // active quest
    if (target) {
      const dx = (target.x - x) * s, dz = (target.z - z) * s;
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      let mx = dx * c - dz * sn, my = dx * sn + dz * c;
      const len = Math.hypot(mx, my), lim = R - 16;
      if (len > lim) {
        mx *= lim / len;
        my *= lim / len;
      }
      g.fillStyle = "#ff2e7e";
      g.beginPath();
      g.arc(R + mx, R + my, 8, 0, Math.PI * 2);
      g.fill();
      if (target.f !== f) {
        g.font = "700 17px ui-monospace, Menlo, monospace";
        g.textAlign = "center";
        g.fillText(`${target.f > f ? "▲" : "▼"}${Math.abs(target.f - f)}`, R + mx, R + my - 14);
      }
    }
    // north
    const nx = Math.sin(yaw) * (R - 14), ny = -Math.cos(yaw) * (R - 14);
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.font = "700 15px ui-monospace, Menlo, monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("N", R + nx, R + ny);
  }
}
