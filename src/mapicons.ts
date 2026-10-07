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
