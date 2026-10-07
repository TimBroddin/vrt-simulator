// Icons for the minimap and the plattegrond, drawn on a canvas.

// an old handset, in a 24 x 24 box
const HANDSET = new Path2D(
  "M5 4.5c1.6-1 3.2-.6 4 .8l1.2 2.2c.5.9.2 2-.6 2.6l-1.3.9c.9 2 2.6 3.7 4.6 4.6l.9-1.3c.6-.8 1.7-1.1 2.6-.6l2.2 1.2c1.4.8 1.8 2.4.8 4-1 1.6-2.8 2.4-4.6 1.9C9.7 19.4 4.6 14.3 3.2 9.1 2.7 7.3 3.4 5.5 5 4.5z",
);

// A ringing phone: a disc with the handset, rocking, and rings going out (t: seconds).
export function phoneIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, t: number, ringing = true) {
  if (ringing)
    for (const k of [0, 0.5]) {
      const p = (t * 0.7 + k) % 1;
      g.globalAlpha = (1 - p) * 0.75;
      g.strokeStyle = col;
      g.lineWidth = Math.max(1, r * 0.14);
      g.beginPath();
      g.arc(x, y, r * (1 + p * 1.3), 0, 7);
      g.stroke();
    }
  g.globalAlpha = 1;
  g.fillStyle = col;
  g.strokeStyle = "#0b0c0e";
  g.lineWidth = Math.max(1.2, r * 0.16);
  g.beginPath();
  g.arc(x, y, r, 0, 7);
  g.fill();
  g.stroke();
  // (it rocks in bursts, like a bell)
  const burst = ringing && t % 1.2 < 0.6 ? Math.sin(t * 42) * 0.22 : 0;
  g.save();
  g.translate(x, y);
  g.rotate(burst);
  const k = (r * 1.25) / 24;
  g.scale(k, k);
  g.translate(-12, -12);
  g.fillStyle = "#0b0c0e";
  g.fill(HANDSET);
  g.restore();
}

// a dot with a dark edge, so it reads on the light corridors
export function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  g.fillStyle = col;
  g.strokeStyle = "#0b0c0e";
  g.lineWidth = Math.max(1, r * 0.35);
  g.beginPath();
  g.arc(x, y, r, 0, 7);
  g.stroke();
  g.fill();
}

function badge(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  g.fillStyle = col;
  g.strokeStyle = "#0b0c0e";
  g.lineWidth = Math.max(1.2, r * 0.18);
  g.beginPath();
  g.roundRect(x - r, y - r, r * 2, r * 2, r * 0.35);
  g.fill();
  g.stroke();
}

// Stairs: an amber square with steps going up (the colour of the stairs on the map).
export function stairIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  badge(g, x, y, r, "#e0b84a");
  const u = r * 0.42;
  g.strokeStyle = "#0b0c0e";
  g.lineWidth = Math.max(1.3, r * 0.2);
  g.lineJoin = "miter";
  g.beginPath();
  g.moveTo(x - u * 1.5, y + u * 1.5);
  g.lineTo(x - u * 0.5, y + u * 1.5);
  g.lineTo(x - u * 0.5, y + u * 0.5);
  g.lineTo(x + u * 0.5, y + u * 0.5);
  g.lineTo(x + u * 0.5, y - u * 0.5);
  g.lineTo(x + u * 1.5, y - u * 0.5);
  g.lineTo(x + u * 1.5, y - u * 1.5);
  g.stroke();
}

// A lift: a pink square with the up and down buttons (the colour of the lifts on the map).
export function liftIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  badge(g, x, y, r, "#ff2e7e");
  const w = r * 0.42, h = r * 0.4, gap = r * 0.14;
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(x, y - gap - h);
  g.lineTo(x + w, y - gap);
  g.lineTo(x - w, y - gap);
  g.closePath();
  g.moveTo(x, y + gap + h);
  g.lineTo(x + w, y + gap);
  g.lineTo(x - w, y + gap);
  g.closePath();
  g.fill();
}

// Food: an orange disc with what's sold there (24 x 24 glyphs)
export const FOOD_COL = "#ff8a3d";
const FOOD_GLYPH: Record<string, Path2D> = {
  water: new Path2D("M12 3c-3 4.5-6.5 8-6.5 11.5a6.5 6.5 0 0 0 13 0C18.5 11 15 7.5 12 3z"),
  koffie: new Path2D("M4.5 8h12v5.5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM16.5 9.5h1.3a3 3 0 0 1 0 6h-1.6v-2h1.6a1 1 0 0 0 0-2h-1.3z"),
  snoep: new Path2D("M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0zM8.6 12L3 8.2v7.6zM15.4 12L21 8.2v7.6z"),
  broodje: new Path2D("M3.5 12.5C3.5 8.8 7.3 6.5 12 6.5s8.5 2.3 8.5 6zM3.5 14h17v1.8h-17zM4.5 17.2h15a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"),
  dagschotel: new Path2D("M6 3h1.2v5h1V3h1.2v5h1V3h1.2v6a2.4 2.4 0 0 1-1.8 2.3V21H8.4v-9.7A2.4 2.4 0 0 1 6 9zM15 3c2.4.8 3.6 3.8 3.6 8H17v10h-2z"),
};
export function foodIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number, food: string) {
  g.fillStyle = FOOD_COL;
  g.strokeStyle = "#0b0c0e";
  g.lineWidth = Math.max(1.2, r * 0.16);
  g.beginPath();
  g.arc(x, y, r, 0, 7);
  g.fill();
  g.stroke();
  const glyph = FOOD_GLYPH[food];
  if (!glyph) return;
  g.save();
  g.translate(x, y);
  const k = (r * 1.3) / 24;
  g.scale(k, k);
  g.translate(-12, -12);
  g.fillStyle = "#0b0c0e";
  g.fill(glyph, "evenodd");
  g.restore();
}

// A toilet (when you need one): a brown square with WC on it.
export function toiletIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  badge(g, x, y, r, col);
  g.fillStyle = "#0b0c0e";
  g.font = `800 ${Math.round(r * 0.95)}px ui-monospace, Menlo, monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("WC", x, y + r * 0.06);
}
