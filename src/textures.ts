// Every surface is painted procedurally on a canvas, then packed into one
// texture array so the whole building renders with a single material.
import * as THREE from "three";
import { FLOOR_MAX, FLOOR_MIN } from "./config";
import { ART } from "./art";
import { ART0, DPC_PX, KOFFIE_PX, L, LABEL0, LAYER_COUNT, NWS_PX, R3_PX } from "./layers";
import type { LogoName } from "./logoImages";
import { Rng } from "./rng";

const S = 512;
type Ctx = CanvasRenderingContext2D;
const rng = new Rng(9001);
const R = () => rng.next();
const FONT = `"Helvetica Neue", Helvetica, Arial, sans-serif`;
const MARKER = "Marker Felt, Comic Sans MS, cursive";
let IMG: Partial<Record<LogoName, HTMLImageElement | null>> = {};

function fill(c: Ctx, col: string) {
  c.fillStyle = col;
  c.fillRect(0, 0, S, S);
}

function noise(c: Ctx, amt: number, mono = true, x = 0, y = 0, w = S, h = S) {
  const img = c.getImageData(x, y, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * amt;
    if (mono) {
      d[i] = d[i]! + n; d[i + 1] = d[i + 1]! + n; d[i + 2] = d[i + 2]! + n;
    } else {
      d[i] = d[i]! + n; d[i + 1] = d[i + 1]! + (R() - 0.5) * amt; d[i + 2] = d[i + 2]! + (R() - 0.5) * amt;
    }
  }
  c.putImageData(img, x, y);
}

function blotches(c: Ctx, n: number, col: string, rmin: number, rmax: number, alpha: number) {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const x = R() * S, y = R() * S, r = rmin + R() * (rmax - rmin);
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      c.beginPath();
      c.ellipse(x + ox!, y + oy!, r, r * (0.6 + R() * 0.8), R() * 3, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

function speckle(c: Ctx, n: number, cols: string[], smin: number, smax: number, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    c.fillStyle = cols[(R() * cols.length) | 0]!;
    const s = smin + R() * (smax - smin);
    c.fillRect(R() * S, R() * S, s, s);
  }
  c.restore();
}

// draw content designed for a w:h aspect into the square canvas
function aspect(c: Ctx, ratio: number, fn: (w: number, h: number) => void, x = 0, y = 0, w = S, h = S) {
  c.save();
  c.translate(x, y);
  const vh = w / ratio;
  c.scale(1, h / vh);
  fn(w, vh);
  c.restore();
}

function text(c: Ctx, t: string, x: number, y: number, size: number, col: string, weight = "800", align: CanvasTextAlign = "center", family = FONT) {
  c.fillStyle = col;
  c.font = `${weight} ${size}px ${family}`;
  c.textAlign = align;
  c.textBaseline = "middle";
  c.fillText(t, x, y);
}

function vrtLogo(c: Ctx, x: number, y: number, s: number, col = "#ff2e7e", txt = "#fff") {
  // a rounded "drop" with the pointy corner top right
  c.save();
  c.translate(x, y);
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(0, -s);
  c.lineTo(s, -s);
  c.lineTo(s, 0);
  c.arc(0, 0, s, 0, Math.PI * 1.5, false);
  c.closePath();
  c.fill();
  text(c, "vrt", 0, s * 0.02, s * 0.95, txt, "700");
  c.restore();
}

function tiles(c: Ctx, n: number, grout: string, cols: string[], gw: number) {
  const t = S / n;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      c.fillStyle = cols[(R() * cols.length) | 0]!;
      c.fillRect(i * t, j * t, t, t);
    }
  c.fillStyle = grout;
  for (let k = 0; k <= n; k++) {
    c.fillRect(k * t - gw / 2, 0, gw, S);
    c.fillRect(0, k * t - gw / 2, S, gw);
  }
}

const painters: Record<number, (c: Ctx) => void> = {
  [L.BRICK]: (c) => {
    fill(c, "#d9d7cf");
    const bw = 74, bh = 23.3; // ~29 x 9 cm at 2 m / 512 px
    for (let row = 0; row < 22; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let k = -1; k < 8; k++) {
        const v = 222 + (R() - 0.5) * 16;
        c.fillStyle = `rgb(${v},${v - 1},${v - 6})`;
        c.fillRect(k * bw + off + 2, row * bh + 2, bw - 4, bh - 4);
      }
    }
    noise(c, 22);
    blotches(c, 30, "#b8b4a8", 4, 20, 0.08);
  },
  [L.PLASTER]: (c) => {
    fill(c, "#e6e4de");
    blotches(c, 60, "#cfcbc0", 20, 80, 0.06);
    noise(c, 10);
  },
  [L.WOODSLAT]: (c) => {
    fill(c, "#2a1c12");
    const n = 22, w = S / n;
    for (let k = 0; k < n; k++) {
      const r = 150 + R() * 40, g = 100 + R() * 25, b = 60 + R() * 15;
      c.fillStyle = `rgb(${r},${g},${b})`;
      c.fillRect(k * w + 3, 0, w - 6, S);
      c.globalAlpha = 0.15;
      for (let y = 0; y < S; y += 3) {
        c.fillStyle = R() > 0.5 ? "#000" : "#fff";
        c.fillRect(k * w + 3, y, w - 6, 1);
      }
      c.globalAlpha = 1;
    }
    noise(c, 14);
  },
  [L.CEILTILE]: (c) => {
    fill(c, "#dcdbd5");
    speckle(c, 5000, ["#9c9a92", "#b5b3aa", "#c5c3bb"], 1, 3, 0.7);
    noise(c, 8);
    c.fillStyle = "#8e8d88";
    for (let k = 0; k <= 4; k++) {
      c.fillRect(k * 128 - 2, 0, 4, S);
      c.fillRect(0, k * 128 - 2, S, 4);
    }
  },
  [L.CEILMETAL]: (c) => {
    fill(c, "#b9bab8");
    const n = 16, w = S / n;
    for (let k = 0; k < n; k++) {
      const v = 205 + R() * 12;
      c.fillStyle = `rgb(${v},${v},${v - 2})`;
      c.fillRect(0, k * w + 3, S, w - 6);
    }
    noise(c, 8);
  },
  [L.TILEDARK]: (c) => {
    tiles(c, 4, "#1a1918", ["#3a3531", "#35302c", "#3d3834"], 4);
    speckle(c, 7000, ["#57504a", "#231f1c", "#6e675e", "#2c2824"], 1, 3, 0.8);
    noise(c, 10);
  },
  [L.CARPET_FLECK]: (c) => {
    fill(c, "#2c2f36");
    noise(c, 30, false);
    const cols = ["#2d6b8f", "#4b8f4c", "#a8453a", "#c49a3c", "#5a5fa8", "#1f1f24", "#6d7078"];
    c.save();
    for (let i = 0; i < 2600; i++) {
      c.globalAlpha = 0.35 + R() * 0.4;
      c.fillStyle = cols[(R() * cols.length) | 0]!;
      c.fillRect(R() * S, R() * S, 4 + R() * 30, 2 + R() * 2);
    }
    c.restore();
    noise(c, 20);
  },
  [L.CARPET_BLUE]: (c) => {
    fill(c, "#3a475f");
    noise(c, 40, false);
    speckle(c, 3000, ["#2c3648", "#56647c"], 1, 3, 0.6);
  },
  [L.CARPET_GREY]: (c) => {
    fill(c, "#4b4c50");
    noise(c, 44);
    speckle(c, 3000, ["#35363a", "#6a6b70"], 1, 3, 0.5);
  },
  [L.LINO]: (c) => {
    fill(c, "#6e3f2f");
    blotches(c, 80, "#5a3124", 10, 40, 0.18);
    speckle(c, 5000, ["#8a5a45", "#4e2a1f"], 1, 2, 0.6);
    noise(c, 10);
  },
  [L.CONCRETE]: (c) => {
    fill(c, "#8f8e8a");
    blotches(c, 120, "#6f6e6a", 10, 60, 0.12);
    blotches(c, 80, "#a8a7a2", 10, 50, 0.12);
    noise(c, 26);
    c.fillStyle = "rgba(40,40,40,0.18)";
    c.fillRect(0, 255, S, 2);
    c.fillRect(255, 0, 2, S);
  },
  [L.TILE_BLUE]: (c) => {
    tiles(c, 12, "#e3e6e8", ["#4f86bf", "#4a80b9", "#5690c9", "#4d84bd"], 3);
    noise(c, 8);
  },
  [L.TILE_SMALL]: (c) => {
    tiles(c, 12, "#8d8f8f", ["#c9cbca", "#c3c5c4", "#cfd1d0"], 3);
    noise(c, 8);
  },
  [L.BRICK_DOTS]: (c) => {
    fill(c, "#6d6558");
    const bw = 128, bh = 32; // stacked glazed brick
    for (let r = 0; r < 16; r++)
      for (let k = 0; k < 4; k++) {
        const v = (R() - 0.5) * 10;
        c.fillStyle = `rgb(${218 + v},${207 + v},${178 + v})`;
        c.fillRect(k * bw + 2, r * bh + 2, bw - 4, bh - 4);
      }
    // black dotted band at 1.2 m (v = 0.6)
    c.fillStyle = "#151515";
    const y = S * (1 - 1.2 / 2);
    for (let x = 12; x < S; x += 25.6) {
      c.beginPath();
      c.arc(x, y, 6, 0, Math.PI * 2);
      c.fill();
    }
    noise(c, 10);
  },
  [L.WOOD_FLOOR]: (c) => {
    fill(c, "#b89266");
    const pw = S / 8;
    for (let k = 0; k < 8; k++) {
      const off = R() * S;
      for (let y = -S; y < S; y += 180 + R() * 160) {
        const v = (R() - 0.5) * 30;
        c.fillStyle = `rgb(${190 + v},${150 + v},${105 + v})`;
        c.fillRect(k * pw + 1, y + off, pw - 2, 400);
        c.fillStyle = "#6e5236";
        c.fillRect(k * pw, y + off, pw, 2);
      }
    }
    c.globalAlpha = 0.1;
    for (let i = 0; i < 400; i++) {
      c.fillStyle = R() > 0.5 ? "#4a321c" : "#e8c79a";
      c.fillRect(R() * S, R() * S, 1, 20 + R() * 60);
    }
    c.globalAlpha = 1;
    noise(c, 10);
  },
  [L.BLACK]: (c) => {
    fill(c, "#18181a");
    noise(c, 10);
  },
  [L.STEEL]: (c) => {
    fill(c, "#a4a8ad");
    const img = c.getImageData(0, 0, S, S);
    for (let y = 0; y < S; y++) {
      let v = (R() - 0.5) * 18;
      for (let x = 0; x < S; x++) {
        v += (R() - 0.5) * 4;
        v *= 0.97;
        const i = (y * S + x) * 4;
        img.data[i] = img.data[i]! + v; img.data[i + 1] = img.data[i + 1]! + v; img.data[i + 2] = img.data[i + 2]! + v;
      }
    }
    c.putImageData(img, 0, 0);
  },
  [L.DOOR_WOOD]: (c) => {
    fill(c, "#8a5a36");
    c.globalAlpha = 0.25;
    for (let i = 0; i < 300; i++) {
      c.strokeStyle = R() > 0.5 ? "#5e3a20" : "#b07a4c";
      c.lineWidth = 1 + R() * 2;
      c.beginPath();
      const x = R() * S;
      c.moveTo(x, 0);
      c.bezierCurveTo(x + R() * 20 - 10, S * 0.3, x + R() * 20 - 10, S * 0.6, x + R() * 10 - 5, S);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.fillStyle = "#9aa0a6";
    c.fillRect(0, S - 40, S, 40);
    noise(c, 10);
  },
  [L.DOOR_STEEL]: (c) => {
    fill(c, "#8f9a93");
    noise(c, 8);
    c.fillStyle = "#3a4440";
    c.fillRect(S * 0.35, S * 0.18, S * 0.3, S * 0.2);
    c.strokeStyle = "#8c9790";
    c.lineWidth = 2;
    for (let k = 1; k < 6; k++) {
      c.beginPath(); c.moveTo(S * 0.35 + (k * S * 0.3) / 6, S * 0.18); c.lineTo(S * 0.35 + (k * S * 0.3) / 6, S * 0.38); c.stroke();
      c.beginPath(); c.moveTo(S * 0.35, S * 0.18 + (k * S * 0.2) / 6); c.lineTo(S * 0.65, S * 0.18 + (k * S * 0.2) / 6); c.stroke();
    }
    c.fillStyle = "#b3261e";
    c.fillRect(S * 0.3, S * 0.46, S * 0.4, S * 0.06);
    aspect(c, 1.1 / 2.1, (w, h) => text(c, "BRANDDEUR", w / 2, h * 0.49, 34, "#fff", "700"), 0, 0);
    c.fillStyle = "#555e59";
    c.fillRect(S * 0.08, S * 0.55, S * 0.84, S * 0.03);
  },
  [L.ELEV_DOOR]: (c) => {
    painters[L.STEEL]!(c);
    // left car: big pink swoosh; right car: purple
    c.save();
    c.beginPath(); c.rect(0, 0, S / 2, S); c.clip();
    c.fillStyle = "#ff2e7e";
    c.beginPath();
    c.moveTo(-40, S * 0.15);
    c.bezierCurveTo(S * 0.2, S * 0.2, S * 0.45, S * 0.55, S * 0.5, S * 1.1);
    c.lineTo(S * 0.18, S * 1.1);
    c.bezierCurveTo(S * 0.12, S * 0.7, 0, S * 0.5, -40, S * 0.5);
    c.fill();
    aspect(c, 0.55 / 2.1, (w, h) => vrtLogo(c, w * 0.6, h * 0.08, w * 0.22), 0, 0, S / 2, S);
    c.restore();
    c.save();
    c.beginPath(); c.rect(S / 2, 0, S / 2, S); c.clip();
    c.fillStyle = "#6c3cd8";
    c.beginPath();
    c.ellipse(S * 0.62, S * 1.05, S * 0.5, S * 0.32, -0.3, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.fillStyle = "#6d7176";
    c.fillRect(S / 4 - 1, 0, 2, S);
    c.fillRect((S * 3) / 4 - 1, 0, 2, S);
  },
  [L.LIGHTPANEL]: (c) => {
    fill(c, "#f4f6f4");
    c.fillStyle = "#d3d6d4";
    for (let k = 1; k < 4; k++) c.fillRect((k * S) / 4 - 2, 0, 4, S);
    for (let k = 1; k < 8; k++) c.fillRect(0, (k * S) / 8 - 2, S, 4);
    c.strokeStyle = "#a6a9a7";
    c.lineWidth = 16;
    c.strokeRect(0, 0, S, S);
  },
  [L.EXIT]: (c) => {
    fill(c, "#0f9d4c");
    aspect(c, 0.4 / 0.16, (w, h) => {
      c.fillStyle = "#fff";
      // running man
      const x = w * 0.22, y = h * 0.5, s = h * 0.34;
      c.beginPath(); c.arc(x + s * 0.3, y - s * 0.95, s * 0.2, 0, 7); c.fill();
      c.lineWidth = s * 0.22; c.lineCap = "round"; c.strokeStyle = "#fff";
      c.beginPath(); c.moveTo(x + s * 0.2, y - s * 0.6); c.lineTo(x - s * 0.1, y + s * 0.1); c.stroke();
      c.beginPath(); c.moveTo(x - s * 0.1, y + s * 0.1); c.lineTo(x + s * 0.35, y + s * 0.45); c.lineTo(x + s * 0.2, y + s * 0.9); c.stroke();
      c.beginPath(); c.moveTo(x - s * 0.1, y + s * 0.1); c.lineTo(x - s * 0.45, y + s * 0.5); c.lineTo(x - s * 0.8, y + s * 0.45); c.stroke();
      c.beginPath(); c.moveTo(x + s * 0.15, y - s * 0.45); c.lineTo(x + s * 0.6, y - s * 0.2); c.moveTo(x + s * 0.1, y - s * 0.45); c.lineTo(x - s * 0.4, y - s * 0.4); c.stroke();
      // door
      c.fillStyle = "#fff";
      c.fillRect(w * 0.36, h * 0.15, w * 0.1, h * 0.7);
      c.fillStyle = "#0f9d4c";
      c.fillRect(w * 0.375, h * 0.2, w * 0.07, h * 0.65);
      // arrow
      c.fillStyle = "#fff";
      c.beginPath();
      c.moveTo(w * 0.58, h * 0.42); c.lineTo(w * 0.8, h * 0.42); c.lineTo(w * 0.8, h * 0.28); c.lineTo(w * 0.94, h * 0.5);
      c.lineTo(w * 0.8, h * 0.72); c.lineTo(w * 0.8, h * 0.58); c.lineTo(w * 0.58, h * 0.58);
      c.fill();
    });
  },
  [L.TV_BARS]: (c) => {
    aspect(c, 16 / 9, (w, h) => {
      const bars = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
      bars.forEach((col, k) => { c.fillStyle = col; c.fillRect((k * w) / 7, 0, w / 7 + 1, h * 0.68); });
      const low = ["#0000c0", "#131313", "#c000c0", "#131313", "#00c0c0", "#131313", "#c0c0c0"];
      low.forEach((col, k) => { c.fillStyle = col; c.fillRect((k * w) / 7, h * 0.68, w / 7 + 1, h * 0.08); });
      const g = ["#00214c", "#ffffff", "#32006a", "#131313", "#090909", "#131313", "#1d1d1d"];
      g.forEach((col, k) => { c.fillStyle = col; c.fillRect((k * w) / 7, h * 0.76, w / 7 + 1, h * 0.24); });
      c.fillStyle = "#111";
      c.fillRect(w * 0.34, h * 0.26, w * 0.32, h * 0.2);
      text(c, "VRT 1", w * 0.5, h * 0.36, h * 0.12, "#fff", "700");
    });
  },
  [L.TV_GEDULD]: (c) => {
    aspect(c, 16 / 9, (w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#15407a");
      g.addColorStop(1, "#0a1d3d");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "rgba(255,255,255,0.25)";
      c.lineWidth = 2;
      for (let k = 0; k < 9; k++) { c.beginPath(); c.arc(w / 2, h / 2, 20 + k * 22, 0, 7); c.stroke(); }
      c.fillStyle = "#f2f2f2";
      c.fillRect(w * 0.15, h * 0.36, w * 0.7, h * 0.28);
      text(c, "EVEN GEDULD", w / 2, h * 0.47, h * 0.12, "#0a1d3d", "800");
      text(c, "A.U.B.", w / 2, h * 0.58, h * 0.06, "#0a1d3d", "700");
      vrtLogo(c, w * 0.88, h * 0.14, h * 0.07);
    });
  },
  [L.NOISE]: (c) => {
    fill(c, "#6c6c6c");
    noise(c, 200);
    c.globalAlpha = 0.25;
    for (let y = 0; y < S; y += 4) { c.fillStyle = R() > 0.5 ? "#000" : "#fff"; c.fillRect(0, y, S, 2); }
    c.globalAlpha = 1;
  },
  [L.POSTERS1]: (c) => posters(c, [
    ["HET JOURNAAL", "#0b1f4a", "#ffffff", "19:00", "ELKE AVOND"],
    ["TERZAKE", "#1c1c1c", "#ff3b3b", "20:35", "DE DAG ONTLEED"],
    ["DE AFSPRAAK", "#f2e6d0", "#101010", "22:25", "OP CANVAS"],
    ["KARREWIET", "#ffd400", "#1a1a1a", "18:50", "NIEUWS VOOR KINDEREN"],
  ]),
  [L.POSTERS2]: (c) => {
    posters(c, [
      ["PANO", "#101418", "#c7f0ff", "WOENSDAG", "ONDERZOEKSJOURNALISTIEK"],
      ["DE ZEVENDE DAG", "#e9e2d6", "#233d8c", "ZONDAG 11:00", "POLITIEK DEBAT"],
    ]);
    brandPosters(c, [
      { title: "", bg: "#1b1b1b", fg: "#ffffff", time: "100.6 FM", sub: "LIFE IS MUSIC", logo: "stubru", big: true },
      { title: "", bg: "#f1eee6", fg: "#1a1636", time: "EN NU", sub: "HET NIEUWS VAN HET UUR", logo: "radio1", big: true },
    ], 2);
  },
  [L.POSTERS3]: (c) =>
    posters(c, [
      ["LE JT", "#0b2a5b", "#ffffff", "19H30", "LA UNE · RTBF"],
      ["LE JARDIN EXTRAORDINAIRE", "#2f5d2a", "#f4f0d8", "DIMANCHE", "DEPUIS 1965"],
      ["VIVACITÉ", "#f05a28", "#ffffff", "EN DIRECT", "RADIO RTBF"],
      ["CLASSIC 21", "#111111", "#e8c547", "ROCK", "RADIO RTBF"],
    ], rtbfLogo),
  [L.SIGNS_FR]: (c) => {
    const labels = ["TOILETTES", "ARCHIVES", "STUDIO", "RÉGIE", "CANTINE", "SERVEURS", "MONTAGE", "RÉUNION"];
    labels.forEach((t, n) => {
      const x = (n % 2) * 256, y = Math.floor(n / 2) * 128;
      c.fillStyle = "#2b2d31";
      c.fillRect(x, y, 256, 128);
      c.fillStyle = "#1a64c8";
      c.fillRect(x, y, 14, 128);
      text(c, t, x + 135, y + 64, t.length > 9 ? 25 : 34, "#f5f5f5", "700");
    });
  },
  [L.SIGNS2]: (c) => serviceSigns(c, ["KOSTUUMS", "REKWISIETEN", "KLEEDKAMER", "VIP-BAR", "VIP-RESTO", "DIRECTIE", "LAADPERRON", "BEWAKING"], "#ff2e7e"),
  [L.SIGNS2_FR]: (c) => serviceSigns(c, ["COSTUMES", "ACCESSOIRES", "LOGE", "BAR VIP", "RESTO VIP", "DIRECTION", "QUAI", "SÉCURITÉ"], "#1a64c8"),
  [L.PLAQUES]: (c) => {
    const cell = (k: number, fn: (w: number, h: number) => void) => aspect(c, 2, fn, (k % 2) * 256, Math.floor(k / 2) * 128, 256, 128);
    const board = (bg: string, line: string, t1: string, t2: string, fg: string) => (w: number, h: number) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.strokeStyle = line; c.lineWidth = 4; c.strokeRect(6, 6, w - 12, h - 12);
      text(c, t1, w / 2, h * 0.4, h * 0.3, fg, "900");
      text(c, t2, w / 2, h * 0.72, h * 0.13, fg, "700");
    };
    cell(0, (w, h) => {
      c.fillStyle = "#12060e"; c.fillRect(0, 0, w, h);
      c.shadowColor = "#ffc34d"; c.shadowBlur = 18;
      text(c, "VIP", w / 2, h * 0.52, h * 0.72, "#ffe2a0", "italic 800", "center", "Didot, Georgia, serif");
      c.shadowBlur = 0;
    });
    cell(1, board("#1b1b1f", "#ff2e7e", "UITLEEN", "KOSTUUMDIENST · NR. TREKKEN", "#f5f5f5"));
    cell(2, board("#1b1b1f", "#ffb000", "UITLEEN", "REKWISIETEN · BON VERPLICHT", "#f5f5f5"));
    cell(3, (w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#e8cf8a"); g.addColorStop(1, "#a88840");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      text(c, "GEDELEGEERD BESTUURDER", w / 2, h * 0.42, h * 0.15, "#2a1d08", "800", "center", "Georgia, serif");
      text(c, "niet storen", w / 2, h * 0.7, h * 0.12, "#2a1d08", "italic 500", "center", "Georgia, serif");
    });
    cell(4, board("#0f0f10", "#c9a24a", "RESTAURANT VIP", "RESERVATIES · ENKEL MET BADGE", "#e8cf8a"));
    cell(5, board("#f2c200", "#111", "PERRON 1", "LAADPERRON · MAX 3,5 T", "#111"));
    cell(6, board("#f2c200", "#111", "PERRON 2", "LAADPERRON · MAX 3,5 T", "#111"));
    cell(7, (w, h) => {
      c.fillStyle = "#1c2a5c"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#f2c94c";
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? h * 0.18 : h * 0.4;
        c.lineTo(w * 0.22 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
      }
      c.fill();
      text(c, "GAST", w * 0.62, h * 0.4, h * 0.26, "#f2c94c", "900");
      text(c, "graag kloppen", w * 0.62, h * 0.7, h * 0.13, "#f2c94c", "600");
    });
  },
  [L.ROLLER]: (c) => {
    // corrugated steel slats, a yellow bottom rail, grime
    fill(c, "#8e9297");
    for (let y = 0; y < S; y += 16) {
      c.fillStyle = "#a3a7ac"; c.fillRect(0, y, S, 7);
      c.fillStyle = "#6c7075"; c.fillRect(0, y + 13, S, 3);
    }
    blotches(c, 30, "#5a5040", 10, 40, 0.12);
    c.fillStyle = "#e0b000"; c.fillRect(0, S - 26, S, 26);
    c.fillStyle = "#222"; for (let x = 0; x < S; x += 40) { c.beginPath(); c.moveTo(x, S); c.lineTo(x + 20, S - 26); c.lineTo(x + 34, S - 26); c.lineTo(x + 14, S); c.fill(); }
    text(c, "VRIJ HOUDEN", S / 2, S * 0.62, 34, "#d8202a", "900");
    noise(c, 14);
  },
  [L.HAZARD]: (c) => {
    fill(c, "#f2c200");
    c.fillStyle = "#161616";
    for (let k = -S; k < S * 2; k += 128) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + 64, 0); c.lineTo(k + 64 - S, S); c.lineTo(k - S, S); c.fill(); }
    noise(c, 16);
  },
  [L.PANELS]: (c) => {
    // Marconi: big warm acoustic panels with dark seams, a grey band
    fill(c, "#3a2a1e");
    const rows = [[0, 150, "#c9906a"], [150, 110, "#6f6a70"], [260, 252, "#c48a62"]] as const;
    for (const [y, h, col] of rows)
      for (let k = 0; k < 2; k++) {
        const v = (R() - 0.5) * 12;
        c.fillStyle = col;
        c.fillRect(k * 256 + 3, y + 3, 250, h - 6);
        c.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 230 : 0},${v > 0 ? 200 : 0},0.06)`;
        c.fillRect(k * 256 + 3, y + 3, 250, h - 6);
      }
    c.globalAlpha = 0.12;
    for (let i = 0; i < 1500; i++) { c.fillStyle = R() > 0.5 ? "#000" : "#fff"; c.fillRect(R() * S, R() * S, 1.5, 1.5); }
    c.globalAlpha = 1;
    noise(c, 8);
  },
  [L.CYC]: (c) => {
    // De Toren: a painted sky, the Brussels skyline at the bottom, a seam where two backdrops meet
    const g = c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, "#3f6fb0");
    g.addColorStop(0.55, "#8db4de");
    g.addColorStop(0.9, "#dfe9f0");
    g.addColorStop(1, "#f1ece0");
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    // painted clouds, tileable
    for (let i = 0; i < 14; i++) {
      const x = R() * S, y = 40 + R() * S * 0.62, w = 60 + R() * 120;
      for (const ox of [-S, 0, S])
        for (let k = 0; k < 6; k++) {
          c.fillStyle = `rgba(255,255,255,${0.35 + R() * 0.3})`;
          c.beginPath();
          c.ellipse(x + ox + (k - 3) * w * 0.18, y + (R() - 0.5) * 10, w * (0.2 + R() * 0.15), w * 0.1, 0, 0, 7);
          c.fill();
        }
    }
    // the skyline: blocks, a cathedral, the Atomium, far away
    c.fillStyle = "#7b8a99";
    let x = 0;
    while (x < S) {
      const w = 8 + R() * 22, h = 6 + R() * 22;
      c.fillRect(x, S - 14 - h, w, h + 14);
      x += w;
    }
    c.fillStyle = "#6c7a88";
    c.fillRect(120, S - 52, 10, 40); c.fillRect(140, S - 52, 10, 40);
    c.beginPath(); c.moveTo(118, S - 52); c.lineTo(125, S - 66); c.lineTo(132, S - 52); c.fill();
    c.beginPath(); c.moveTo(138, S - 52); c.lineTo(145, S - 66); c.lineTo(152, S - 52); c.fill();
    c.strokeStyle = "#6c7a88"; c.lineWidth = 2;
    for (const [ax, ay] of [[380, S - 60], [370, S - 48], [390, S - 48], [380, S - 36], [372, S - 58], [388, S - 58]]) { c.beginPath(); c.arc(ax!, ay!, 4, 0, 7); c.fillStyle = "#6c7a88"; c.fill(); }
    c.beginPath(); c.moveTo(380, S - 60); c.lineTo(380, S - 20); c.stroke();
    // the seam and a crease
    c.fillStyle = "rgba(40,50,70,0.25)";
    c.fillRect(S - 3, 0, 3, S);
    c.fillStyle = "rgba(255,255,255,0.08)";
    c.fillRect(S * 0.37, 0, 6, S);
    noise(c, 6);
  },
  [L.BAREEL]: (c) => {
    // left half: the tall blue board by the road
    c.fillStyle = "#1c4f9c"; c.fillRect(0, 0, 256, 512);
    c.strokeStyle = "#fff"; c.lineWidth = 6; c.strokeRect(8, 8, 240, 496);
    text(c, "WELKOM BIJ", 128, 44, 30, "#fff", "800");
    text(c, "DE VRT", 128, 80, 34, "#fff", "900");
    const panel = (y: number, draw: () => void) => {
      c.fillStyle = "#fff"; c.fillRect(34, y, 188, 92);
      c.save(); c.translate(128, y + 46); draw(); c.restore();
    };
    const tri = () => {
      c.beginPath(); c.moveTo(0, -36); c.lineTo(38, 30); c.lineTo(-38, 30); c.closePath();
      c.fillStyle = "#fff"; c.fill(); c.strokeStyle = "#d61f1f"; c.lineWidth = 7; c.stroke();
    };
    panel(116, () => { c.beginPath(); c.arc(0, 0, 36, 0, 7); c.fillStyle = "#fff"; c.fill(); c.strokeStyle = "#d61f1f"; c.lineWidth = 8; c.stroke(); text(c, "20", 0, 2, 30, "#111", "900"); });
    panel(216, () => { tri(); text(c, "!", 0, 6, 34, "#111", "900"); });
    panel(316, () => { tri(); c.fillStyle = "#111"; c.fillRect(-14, 4, 28, 8); c.fillRect(-4, -12, 8, 24); });
    c.fillStyle = "#fff"; c.fillRect(34, 420, 60, 60);
    text(c, "P", 64, 452, 52, "#1c4f9c", "900");
    text(c, "BEZOEKERS", 170, 440, 18, "#fff", "800");
    text(c, "→ ONTHAAL", 170, 464, 18, "#fff", "800");
    // right top: over the booth door
    c.fillStyle = "#f2efe8"; c.fillRect(256, 0, 256, 256);
    c.fillStyle = "#ff2e7e"; c.fillRect(256, 0, 256, 18);
    text(c, "ONTHAAL", 384, 90, 44, "#1a1a1a", "900");
    text(c, "BADGE TONEN", 384, 150, 26, "#1a1a1a", "800");
    text(c, "PRÉSENTEZ VOTRE BADGE", 384, 196, 16, "#555", "700");
    // right bottom: for people on foot
    c.fillStyle = "#1c4f9c"; c.fillRect(256, 256, 256, 256);
    c.strokeStyle = "#fff"; c.lineWidth = 6; c.strokeRect(266, 266, 236, 236);
    text(c, "VOETGANGERS", 384, 330, 30, "#fff", "900");
    text(c, "VIA HET ONTHAAL", 384, 372, 24, "#fff", "800");
    text(c, "→", 384, 440, 80, "#fff", "900");
  },
  [L.SHOWSIGN]: (c) => {
    const cell = (k: number, fn: (w: number, h: number) => void) => aspect(c, 2, fn, (k % 2) * 256, Math.floor(k / 2) * 128, 256, 128);
    for (const [k, n] of [[0, "5"], [1, "3"]] as const)
      cell(k, (w, h) => {
        c.fillStyle = "#15161a"; c.fillRect(0, 0, w, h);
        text(c, "STUDIO", w * 0.3, h * 0.5, h * 0.24, "#f2f2f2", "800");
        text(c, n, w * 0.75, h * 0.52, h * 0.85, "#ffd21f", "900");
      });
    cell(2, (w, h) => {
      c.fillStyle = "#200404"; c.fillRect(0, 0, w, h);
      text(c, "APPLAUS", w / 2, h * 0.54, h * 0.52, "#ff3a26", "900");
    });
    cell(3, (w, h) => {
      c.fillStyle = "#200404"; c.fillRect(0, 0, w, h);
      text(c, "OPNAME · STILTE", w / 2, h * 0.54, h * 0.28, "#ff3a26", "900");
    });
    cell(4, (w, h) => {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#161b3a"); g.addColorStop(1, "#6b2a5a");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      text(c, "VAN GILS", w / 2, h * 0.38, h * 0.3, "#fff", "900");
      text(c, "& GASTEN", w / 2, h * 0.7, h * 0.22, "#ffcf5a", "800");
    });
    cell(5, (w, h) => {
      c.fillStyle = "#0d0d12"; c.fillRect(0, 0, w, h);
      const cols = ["#e23a2e", "#f5c518", "#2e8be2", "#3cc45a", "#a04de0", "#f07f1f"];
      "BLOKKEN".split("").forEach((ch, k) => {
        c.fillStyle = cols[k % cols.length]!;
        c.fillRect(8 + k * (w - 16) / 7 + 2, h * 0.22, (w - 16) / 7 - 4, h * 0.56);
        text(c, ch, 8 + (k + 0.5) * (w - 16) / 7, h * 0.52, h * 0.4, "#fff", "900");
      });
    });
    cell(6, (w, h) => {
      c.fillStyle = "#c48a62"; c.fillRect(0, 0, w, h);
      text(c, "STUDIO", w / 2, h * 0.32, h * 0.18, "#2a1a10", "700");
      text(c, "MARCONI", w / 2, h * 0.64, h * 0.34, "#2a1a10", "900");
    });
    cell(7, (w, h) => {
      c.fillStyle = "#6f6a70"; c.fillRect(0, 0, w, h);
      text(c, "STUDIO", w / 2, h * 0.32, h * 0.18, "#f4eee6", "700");
      text(c, "TOOTS", w / 2, h * 0.64, h * 0.38, "#f4eee6", "900");
    });
  },
  [L.FLATS]: (c) => {
    // four painted decor flats: a city at night, a forest, a living room, a castle
    aspect(c, 1, (w, h) => {
      c.fillStyle = "#101a3a"; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { c.fillStyle = "#fff"; c.fillRect(R() * w, R() * h * 0.5, 1.5, 1.5); }
      let x = 0;
      while (x < w) { const bw = 20 + R() * 30, bh = 60 + R() * 120; c.fillStyle = "#1c2a55"; c.fillRect(x, h - bh, bw, bh); for (let y = h - bh + 8; y < h - 6; y += 12) for (let xx = x + 4; xx < x + bw - 6; xx += 9) if (R() < 0.5) { c.fillStyle = "#ffd76a"; c.fillRect(xx, y, 4, 6); } x += bw + 2; }
    }, 0, 0, 256, 256);
    aspect(c, 1, (w, h) => {
      c.fillStyle = "#a9d4e6"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#3f7a3a"; c.fillRect(0, h * 0.7, w, h * 0.3);
      for (let i = 0; i < 9; i++) { const x = R() * w; c.fillStyle = "#5a3a22"; c.fillRect(x - 4, h * 0.45, 8, h * 0.3); c.fillStyle = R() > 0.5 ? "#2f6e2e" : "#3b8a3a"; c.beginPath(); c.arc(x, h * 0.42, 22 + R() * 14, 0, 7); c.fill(); }
    }, 256, 0, 256, 256);
    aspect(c, 1, (w, h) => {
      c.fillStyle = "#d9c9a0"; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 24) { c.fillStyle = "rgba(140,90,60,0.25)"; c.fillRect(x, 0, 10, h); }
      c.fillStyle = "#6b4a2e"; c.fillRect(0, h * 0.82, w, h * 0.18);
      c.fillStyle = "#ffffff"; c.fillRect(w * 0.35, h * 0.2, w * 0.3, h * 0.35);
      c.fillStyle = "#8fb7d9"; c.fillRect(w * 0.37, h * 0.22, w * 0.26, h * 0.31);
      c.fillStyle = "#b03a3a"; c.fillRect(w * 0.1, h * 0.6, w * 0.8, h * 0.22);
    }, 0, 256, 256, 256);
    aspect(c, 1, (w, h) => {
      c.fillStyle = "#e8d6a8"; c.fillRect(0, 0, w, h);
      c.fillStyle = "#9a9486";
      c.fillRect(w * 0.15, h * 0.35, w * 0.7, h * 0.65);
      for (const x of [0.1, 0.4, 0.7]) { c.fillRect(w * x, h * 0.2, w * 0.2, h * 0.8); for (let k = 0; k < 3; k++) c.fillRect(w * x + k * w * 0.075, h * 0.15, w * 0.05, h * 0.06); }
      c.fillStyle = "#3a2a1a"; c.beginPath(); c.arc(w * 0.5, h * 0.8, w * 0.1, Math.PI, 0); c.fill(); c.fillRect(w * 0.4, h * 0.8, w * 0.2, h * 0.2);
    }, 256, 256, 256, 256);
    noise(c, 8);
  },
  [L.BLOCKWALL]: (c) => {
    // painted concrete blocks (39 x 19 cm), a dark band along the bottom, scuffs
    fill(c, "#e9e5d8");
    const bw = S / 6.4, bh = S / 13;
    c.fillStyle = "#c9c4b4";
    for (let r = 0; r < 14; r++) {
      const y = r * bh;
      c.fillRect(0, y, S, 2);
      const off = r % 2 ? bw / 2 : 0;
      for (let x = -bw + off; x < S; x += bw) c.fillRect(x, y, 2, bh);
    }
    blotches(c, 30, "#d6d0bf", 10, 40, 0.25);
    // the band: ~0.8 m of dark grey paint, a bit uneven at the top
    const band = S * (1 - 0.8 / 2.5);
    c.fillStyle = "#2c2d30";
    c.fillRect(0, band, S, S - band);
    c.fillStyle = "rgba(44,45,48,0.5)";
    for (let x = 0; x < S; x += 6) c.fillRect(x, band - R() * 3, 6, 3);
    c.globalAlpha = 0.18;
    for (let i = 0; i < 25; i++) { c.fillStyle = R() > 0.5 ? "#6b6a64" : "#fff"; c.fillRect(R() * S, band - 20 + R() * 30, 20 + R() * 60, 2 + R() * 3); }
    c.globalAlpha = 1;
    noise(c, 10);
  },
  [L.STENCIL]: (c) => {
    // stencilled on the wall: the way to the parking, and how far you've come
    c.clearRect(0, 0, S, S);
    const labels = ["→ PARKING", "→ NERGENS", "50 M", "100 M", "150 M", "200 M", "NIET ROKEN", "250 M"];
    labels.forEach((t, k) => {
      const x = (k % 2) * 256, y = Math.floor(k / 2) * 128;
      text(c, t, x + 128, y + 66, t.length > 8 ? 34 : 56, k === 6 ? "#b3261e" : "#2a2b2e", "900", "center", "Impact, 'Arial Black', sans-serif");
    });
  },
  [L.MIDSIGN]: (c) => {
    // two hanging direction signs, each 1.9 x 0.32 m (top half / bottom half of the texture)
    for (const [row, left, right] of [[0, "← RTBF · RÉGIES · PARKING", "VRT · STUDIO TV · PERS →"], [1, "← RTBF", "VRT · RESTAURANT →"]] as const) {
      const y0 = row * 256;
      c.fillStyle = "#f3f3f0";
      c.fillRect(0, y0, S, 256);
      aspect(c, 1.9 / 0.32, (w, h) => {
        c.fillStyle = "#1c1c1c";
        c.fillRect(0, 0, w, h * 0.12);
        text(c, left, w * 0.05, h * 0.58, h * 0.3, "#1a64c8", "700", "left");
        text(c, right, w * 0.95, h * 0.58, h * 0.3, "#222", "700", "right");
        c.fillStyle = "#0f9d4c";
        c.fillRect(w * 0.49, h * 0.35, h * 0.34, h * 0.34);
      }, 0, y0, S, 256);
    }
  },
  [L.SPORTFLOOR]: (c) => {
    // the whole hall floor: 24 x 30 m, court lines in white, blue and yellow
    fill(c, "#2c6a50");
    noise(c, 12);
    const u = (m: number) => (m / 24) * S, v = (m: number) => (m / 30) * S;
    c.fillStyle = "#29604a";
    c.fillRect(u(3), v(3), u(18), v(24));
    c.lineWidth = 3;
    c.strokeStyle = "#e8e8e0";
    c.strokeRect(u(3), v(3), u(18), v(24));
    c.beginPath(); c.moveTo(u(3), v(15)); c.lineTo(u(21), v(15)); c.stroke();
    c.beginPath(); c.ellipse(u(12), v(15), u(2), v(2), 0, 0, 7); c.stroke();
    for (const [y, dir] of [[3, 1], [27, -1]] as const) {
      c.beginPath(); c.ellipse(u(12), v(y), u(6), v(6), 0, dir > 0 ? 0 : Math.PI, dir > 0 ? Math.PI : Math.PI * 2); c.stroke();
      c.setLineDash([10, 8]);
      c.beginPath(); c.ellipse(u(12), v(y), u(9), v(9), 0, dir > 0 ? 0 : Math.PI, dir > 0 ? Math.PI : Math.PI * 2); c.stroke();
      c.setLineDash([]);
    }
    c.lineWidth = 2;
    c.strokeStyle = "#5aa0e0";
    c.strokeRect(u(6), v(8), u(12), v(14));
    c.beginPath(); c.moveTo(u(6), v(15)); c.lineTo(u(18), v(15)); c.stroke();
    c.strokeStyle = "#e8c43a";
    c.strokeRect(u(4.5), v(5), u(15), v(20));
    c.beginPath(); c.moveTo(u(12), v(5)); c.lineTo(u(12), v(25)); c.stroke();
  },
  [L.SLATWIN]: (c) => {
    // tall windows behind wooden slats, lit by the afternoon
    const g = c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, "#fff6dc");
    g.addColorStop(0.7, "#ffe6b0");
    g.addColorStop(1, "#b8c890");
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    blotches(c, 20, "#6e8a4a", 20, 60, 0.25);
    for (let x = 0; x < S; x += 22) {
      c.fillStyle = "#6a4426";
      c.fillRect(x, 0, 12, S);
      c.fillStyle = "rgba(255,210,140,0.6)";
      c.fillRect(x + 11, 0, 2, S);
    }
    c.fillStyle = "#4e321c";
    for (let y = S * 0.2; y < S; y += S * 0.28) c.fillRect(0, y, S, 8);
  },
  [L.DARTBOARD]: (c) => {
    c.clearRect(0, 0, S, S);
    const r = 250;
    for (let k = 0; k < 20; k++) {
      const a0 = (k / 20) * Math.PI * 2, a1 = ((k + 1) / 20) * Math.PI * 2;
      for (const [r0, r1, cols] of [[0, r, ["#111", "#eee6cc"]], [r * 0.58, r * 0.64, ["#c01818", "#1a8a3a"]], [r * 0.92, r, ["#c01818", "#1a8a3a"]]] as const) {
        c.fillStyle = cols[k % 2]!;
        c.beginPath();
        c.arc(256, 256, r1, a0, a1);
        c.arc(256, 256, r0, a1, a0, true);
        c.fill();
      }
    }
    c.fillStyle = "#1a8a3a"; c.beginPath(); c.arc(256, 256, 22, 0, 7); c.fill();
    c.fillStyle = "#c01818"; c.beginPath(); c.arc(256, 256, 10, 0, 7); c.fill();
  },
  [L.CHALK]: (c) => {
    fill(c, "#1d2a24");
    noise(c, 10);
    c.globalAlpha = 0.15;
    c.fillStyle = "#ddd";
    for (let i = 0; i < 30; i++) c.fillRect(R() * S, R() * S, 40 + R() * 120, 6 + R() * 10);
    c.globalAlpha = 0.85;
    aspect(c, 1.5 / 1.1, (w, h) => {
      text(c, "POOL · VRT vs RTBF", w / 2, h * 0.18, 30, "#eee", "600", "center", "Marker Felt, Comic Sans MS, cursive");
      text(c, "Tim  ||||  ||", 60, h * 0.42, 26, "#eee", "500", "left", "Marker Felt, Comic Sans MS, cursive");
      text(c, "Jan  |||||  |||", 60, h * 0.58, 26, "#eee", "500", "left", "Marker Felt, Comic Sans MS, cursive");
      text(c, "winnaar betaalt koffie", 60, h * 0.8, 22, "#f0d060", "500", "left", "Marker Felt, Comic Sans MS, cursive");
    });
    c.globalAlpha = 1;
  },
  [L.NUMBERS]: (c) => {
    fill(c, "#f0efe9");
    for (let n = 0; n < 16; n++) {
      const f = n + FLOOR_MIN;
      const x = (n % 4) * 128 + 64, y = Math.floor(n / 4) * 128 + 64;
      const label = n === 14 ? "13" : n === 15 ? "?" : f === FLOOR_MAX ? "DAK" : String(f);
      text(c, label, x, y + 4, label.length > 2 ? 44 : 92, "#141414", "800");
    }
  },
  [L.SIGNS]: (c) => {
    const labels = ["TOILETTEN", "ARCHIEF", "STUDIO", "REGIE", "KANTINE", "SERVER", "MONTAGE", "VERGADERZAAL"];
    labels.forEach((t, n) => {
      const x = (n % 2) * 256, y = Math.floor(n / 2) * 128;
      c.fillStyle = "#2b2d31";
      c.fillRect(x, y, 256, 128);
      c.fillStyle = "#ff2e7e";
      c.fillRect(x, y, 14, 128);
      text(c, t, x + 135, y + 64, t.length > 9 ? 25 : 34, "#f5f5f5", "700");
    });
  },
  [L.FACADE]: (c) => {
    fill(c, "#c9c4b8");
    blotches(c, 60, "#8f8a80", 10, 50, 0.15);
    // two deep window modules per 3 m, one storey per texture height
    for (let k = 0; k < 2; k++) {
      const x = k * 256 + 28, y = 90, w = 200, h = 250;
      c.fillStyle = "#8d887d";
      c.fillRect(x - 12, y - 12, w + 24, h + 24);
      const lit = R() < 0.25;
      const g = c.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, lit ? "#e8c98a" : "#3b4a57");
      g.addColorStop(1, lit ? "#9c7a45" : "#1b242b");
      c.fillStyle = g;
      c.fillRect(x, y, w, h);
      if (R() < 0.5) {
        c.fillStyle = "rgba(210,210,200,0.8)";
        c.fillRect(x, y, w, h * (0.2 + R() * 0.5));
      }
      c.fillStyle = "#5c5a55";
      c.fillRect(x + w / 2 - 3, y, 6, h);
      c.fillStyle = "#e1ddd2";
      c.fillRect(x - 12, y + h + 6, w + 24, 10);
    }
    c.fillStyle = "#a9a497";
    c.fillRect(0, 0, S, 24);
    noise(c, 16);
  },
  [L.GRASS]: (c) => {
    fill(c, "#4b5a2c");
    blotches(c, 200, "#6b7a32", 4, 18, 0.5);
    blotches(c, 150, "#8a5a3a", 3, 12, 0.35);
    blotches(c, 120, "#9a9a3a", 3, 10, 0.35);
    noise(c, 30, false);
  },
  [L.ROOF]: (c) => {
    fill(c, "#3d3e40");
    blotches(c, 60, "#2d2e30", 20, 80, 0.3);
    for (let i = 0; i < 14; i++) {
      c.save();
      c.globalAlpha = 0.16;
      c.fillStyle = "#56702c";
      const x = R() * S, y = R() * S;
      for (let k = 0; k < 40; k++) {
        c.beginPath();
        c.arc(x + (R() - 0.5) * 120, y + (R() - 0.5) * 60, 3 + R() * 14, 0, 7);
        c.fill();
      }
      c.restore();
    }
    noise(c, 22);
    c.fillStyle = "rgba(20,20,20,0.5)";
    for (let k = 0; k < 4; k++) c.fillRect(0, k * 128, S, 3);
  },
  [L.FABRIC]: (c) => {
    fill(c, "#c8baa0");
    for (let y = 0; y < S; y += 4) { c.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.05})`; c.fillRect(0, y, S, 2); }
    for (let x = 0; x < S; x += 4) { c.fillStyle = `rgba(255,255,255,${0.04 + R() * 0.04})`; c.fillRect(x, 0, 2, S); }
    noise(c, 10);
  },
  [L.WHITE]: (c) => {
    fill(c, "#ebebea");
    noise(c, 8);
  },
  [L.SCREEN]: (c) => {
    const g = c.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, "#1a2027");
    g.addColorStop(0.45, "#0b0e12");
    g.addColorStop(0.5, "#20262e");
    g.addColorStop(1, "#07090b");
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
  },
  [L.LEDS]: (c) => {
    fill(c, "#0c0d0f");
    for (let y = 8; y < S; y += 32) {
      c.fillStyle = "#1c1e22";
      c.fillRect(8, y, S - 16, 24);
      for (let x = 24; x < S - 24; x += 18) {
        if (R() < 0.45) continue;
        c.fillStyle = ["#27ff6a", "#ffb020", "#3a8bff", "#27ff6a", "#ff3a3a"][(R() * 5) | 0]!;
        c.fillRect(x, y + 8, 5, 5);
      }
    }
  },
  [L.TAPES]: (c) => {
    fill(c, "#2a2a2c");
    const rowH = S / 3;
    for (let r = 0; r < 3; r++) {
      const y = r * rowH;
      c.fillStyle = "#6d6f73";
      c.fillRect(0, y + rowH - 14, S, 14);
      let x = 4;
      while (x < S - 20) {
        const w = 18 + R() * 10;
        const h = rowH * (0.6 + R() * 0.2);
        c.fillStyle = ["#111", "#1d1d22", "#23324f", "#2b2b2b", "#443a2e"][(R() * 5) | 0]!;
        c.fillRect(x, y + rowH - 14 - h, w - 2, h);
        c.fillStyle = R() < 0.8 ? "#e8e4d6" : "#f0c23c";
        c.fillRect(x + 3, y + rowH - 14 - h * 0.8, w - 8, h * 0.45);
        x += w;
        if (R() < 0.04) x += 30 + R() * 50;
      }
    }
    noise(c, 10);
  },
  [L.FOLIAGE]: (c) => {
    c.clearRect(0, 0, S, S);
    for (let i = 0; i < 520; i++) {
      const x = R() * S, y = R() * S;
      const g = 90 + R() * 90;
      c.fillStyle = `rgb(${30 + R() * 40},${g},${30 + R() * 30})`;
      c.save();
      c.translate(x, y);
      c.rotate(R() * 7);
      c.beginPath();
      c.ellipse(0, 0, 8 + R() * 16, 4 + R() * 6, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  },
  [L.CLOCK]: (c) => {
    c.clearRect(0, 0, S, S);
    c.fillStyle = "#f7f7f4";
    c.beginPath(); c.arc(256, 256, 250, 0, 7); c.fill();
    c.fillStyle = "#111";
    for (let k = 0; k < 60; k++) {
      c.save();
      c.translate(256, 256);
      c.rotate((k / 60) * Math.PI * 2);
      if (k % 5 === 0) c.fillRect(-9, -235, 18, 58);
      else c.fillRect(-3, -235, 6, 20);
      c.restore();
    }
    // frozen at 19:00, the news hour
    const hand = (a: number, len: number, w: number, col = "#111") => {
      c.save(); c.translate(256, 256); c.rotate(a); c.fillStyle = col; c.fillRect(-w / 2, -len, w, len + 40); c.restore();
    };
    hand((7 / 12) * Math.PI * 2, 150, 22);
    hand(0, 215, 16);
    hand(0.2, 210, 5, "#c01818");
  },
  [L.WHITEBOARD]: (c) => {
    fill(c, "#f4f5f3");
    noise(c, 5);
    c.globalAlpha = 0.18;
    c.fillStyle = "#555";
    for (let i = 0; i < 20; i++) c.fillRect(R() * S, R() * S, 60 + R() * 120, 3 + R() * 6);
    c.globalAlpha = 0.85;
    aspect(c, 1.6, (w, h) => {
      text(c, "RUNDOWN 19:00", 30, h * 0.15, 30, "#1b3fa0", "600", "left", "Marker Felt, Comic Sans MS, cursive");
      const items = ["opening", "binnenland", "weer?", "sport", "????", "slot"];
      items.forEach((t, k) => text(c, `${k + 1}. ${t}`, 40, h * 0.3 + k * 36, 22, k === 4 ? "#b01818" : "#1b3fa0", "500", "left", "Marker Felt, Comic Sans MS, cursive"));
      c.strokeStyle = "#b01818"; c.lineWidth = 3;
      c.beginPath(); c.arc(w * 0.72, h * 0.55, 60, 0, 7); c.stroke();
      text(c, "STUDIO 5", w * 0.72, h * 0.55, 22, "#b01818", "600", "center", "Marker Felt, Comic Sans MS, cursive");
    });
    c.globalAlpha = 1;
  },
  [L.NWSWALL]: (c) => {
    fill(c, "#0d1a3d");
    const lines = ["NWS.NWS.", "KARREWIET", "PANO", "HET JOURNAAL", "DE OCHTEND", "TERZAKE", "DE AFSPRAAK", "ZEVENDE DAG"];
    lines.forEach((t, k) => text(c, t, 36, 48 + k * 58, 50, k === 0 ? "#ff2e7e" : "#f2f2f2", "800", "left"));
  },
  [L.FROSTED]: (c) => {
    const g = c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, "#f5f8fb");
    g.addColorStop(1, "#d6dde4");
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    noise(c, 10);
    c.fillStyle = "rgba(90,100,110,0.55)";
    c.fillRect(S / 2 - 5, 0, 10, S);
    c.fillRect(0, S / 2 - 5, S, 10);
    c.strokeStyle = "rgba(60,65,70,0.8)";
    c.lineWidth = 18;
    c.strokeRect(0, 0, S, S);
  },
  [L.VRT_LOGO]: (c) => {
    fill(c, "#f0f0f0");
    vrtLogo(c, S / 2, S / 2 + 20, 130);
  },
  [L.DESK_BUTTONS]: (c) => {
    fill(c, "#1a1b1e");
    for (let x = 12; x < S; x += 24) {
      c.fillStyle = "#2b2c30";
      c.fillRect(x, 20, 16, S - 40);
      for (let y = 30; y < S * 0.5; y += 26) {
        c.fillStyle = R() < 0.15 ? "#ff3b30" : R() < 0.2 ? "#ffcc00" : R() < 0.3 ? "#34c759" : "#55575c";
        c.fillRect(x + 2, y, 12, 12);
      }
      c.fillStyle = "#c8c8c8";
      c.fillRect(x + 3, S * 0.55 + R() * S * 0.3, 10, 18);
    }
  },
  [L.GRAVEL]: (c) => {
    fill(c, "#77746d");
    speckle(c, 9000, ["#5d5a54", "#96928a", "#a8a49b", "#4a4843"], 2, 6, 0.9);
    noise(c, 20);
  },
  [L.VENDING]: (c) => {
    // left half: drinks, right half: snacks
    c.fillStyle = "#b8141d"; c.fillRect(0, 0, 256, S);
    c.fillStyle = "#101418"; c.fillRect(20, 40, 216, 330);
    for (let r = 0; r < 5; r++)
      for (let k = 0; k < 6; k++) {
        c.fillStyle = ["#e33", "#ddd", "#2a2", "#fc3", "#36f"][(r + k) % 5]!;
        c.fillRect(30 + k * 34, 52 + r * 62, 22, 48);
      }
    c.fillStyle = "#222"; c.fillRect(60, 400, 140, 60);
    c.fillStyle = "#2a3b66"; c.fillRect(256, 0, 256, S);
    c.fillStyle = "#cfe3ff"; c.fillRect(276, 40, 170, 390);
    for (let r = 0; r < 6; r++)
      for (let k = 0; k < 4; k++) {
        c.fillStyle = ["#f5a623", "#d0021b", "#7ed321", "#4a90e2", "#9b59b6"][(r * 3 + k) % 5]!;
        c.fillRect(286 + k * 40, 52 + r * 62, 30, 40);
      }
    c.fillStyle = "#111"; c.fillRect(460, 120, 36, 140);
  },
  [L.KOFFIE]: (c) => koffieSheet(c),
  [L.DPC]: (c) => dpcSheet(c),
  [L.NWS]: (c) => nwsSheet(c),
  [L.SKYLINE]: (c) => skyline(c),
  [L.R3]: (c) => r3Sheet(c),
  [L.WPANEL]: (c) => {
    // het vossenhol: white panels, 1.2 m each, the seams a shade darker
    fill(c, "#efefeb");
    blotches(c, 20, "#e2e3df", 30, 90, 0.25);
    for (let x = 0; x < S; x += 128) {
      fillRect(c, x, 0, 3, S, "#c3c4bf");
      fillRect(c, x + 3, 0, 1, S, "#fafaf8");
    }
    noise(c, 4);
  },
  [L.SPRINT]: (c) => {
    sprintBoard(c);
    dpcPosters(c, 0);
  },
  [L.BURNDOWN]: (c) => {
    burndownBoard(c);
    dpcPosters(c, 3);
  },
  [L.ONAIR]: (c) => {
    fill(c, "#2a0303");
    aspect(c, 0.6 / 0.18, (w, h) => text(c, "ON AIR", w / 2, h / 2 + 4, h * 0.62, "#ff2a1a", "900"));
  },
  [L.PUDDLE]: (c) => {
    c.clearRect(0, 0, S, S);
    const g = c.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, "#5e6874");
    g.addColorStop(1, "#1d2226");
    c.fillStyle = g;
    c.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const r = 170 + Math.sin(a * 3 + 1) * 40 + Math.sin(a * 5) * 25;
      const x = 256 + Math.cos(a) * r, y = 256 + Math.sin(a) * r;
      if (k) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.fill();
  },
  [L.POSTERS4]: (c) => brandPosters(c, [
    { title: "GALAXY PARK", bg: "#0f1a44", fg: "#6ee7a0", time: "ELKE WEEKDAG", sub: "DE REEKS OP KETNET", logo: "ketnet" },
    { title: "#LIKEME", bg: "#ff4fa3", fg: "#ffffff", time: "OP KETNET", sub: "DE REEKS · DE MUSICAL", logo: "ketnet" },
    { title: "RONDE VAN VLAANDEREN", bg: "#111111", fg: "#ffe600", time: "ZONDAG · LIVE", sub: "DE HOOGMIS VAN DE KOERS", logo: "sporza", panel: "#ffffff" },
    { title: "RODE DUIVELS", bg: "#c8102e", fg: "#ffffff", time: "20:45 · VRT 1", sub: "LIVE MET COMMENTAAR", logo: "sporza", panel: "#ffffff" },
  ]),
  [L.POSTERS5]: (c) => brandPosters(c, [
    { title: "", bg: "#f2f2ef", fg: "#111111", time: "OUDEJAARSDAG", sub: "DE TIJDLOZE 100 · STUDIO BRUSSEL", logo: "tijdloze", big: true },
    { title: "", bg: "#2a1c12", fg: "#f3dca8", time: "VRT 1", sub: "ELKE WEEKDAG · SINDS 1995", logo: "thuis", big: true },
    { title: "", bg: "#1f7a34", fg: "#ffd21f", time: "ZATERDAG", sub: "DE HERHALING · SEIZOEN 1", logo: "kampsign", big: true },
    { title: "", bg: "#2b0f3a", fg: "#ffe94a", time: "NON-STOP", sub: "DE GROOTSTE HITS", logo: "mnm", big: true },
  ]),
  [L.POSTERS6]: (c) => brandPosters(c, [
    { title: "", bg: "#ffffff", fg: "#e8504a", time: "ELKE ZOMER", sub: "DE ZOMERHIT", logo: "radio2", big: true },
    { title: "DE WARMSTE WEEK", bg: "#ff5a1f", fg: "#ffffff", time: "DECEMBER", sub: "SAMEN VOOR HET GOEDE DOEL", logo: "stubru" },
    { title: "", bg: "#3a4bb0", fg: "#ffb04a", time: "1 DEC 1997", sub: "HET NIEUWE KINDERNET", logo: "ketnet97", big: true },
    { title: "", bg: "#f4f4f2", fg: "#111111", time: "89.5 FM", sub: "KLASSIEK · JAZZ · WERELD", logo: "klara", big: true },
  ]),
  [L.RADIOWALL]: (c) => {
    // eight 2:1 panels: the five stations, the RTBF, De Tijdloze, De Warmste Week
    const cells: [string, LogoName | null, string][] = [
      ["#f1eee6", "radio1", ""], ["#ffffff", "radio2", ""], ["#f4f4f2", "klara", ""], ["#161616", "stubru", ""],
      ["#2b0f3a", "mnm", ""], ["#1a64c8", null, "LA PREMIÈRE"], ["#f2f2ef", "tijdloze", ""], ["#ff5a1f", null, "DE WARMSTE WEEK"],
    ];
    cells.forEach(([bg, lg, t], k) => {
      const x = (k % 2) * 256, y = Math.floor(k / 2) * 128;
      c.fillStyle = bg;
      c.fillRect(x, y, 256, 128);
      if (lg) logo(c, lg, x + 20, y + 12, 216, 104);
      else text(c, t, x + 128, y + 64, t.length > 12 ? 22 : 30, "#fff", "900");
    });
  },
  [L.KETNETWALL]: (c) => {
    // left half: the pattern that repeats along the wall; right half: the big K
    for (const half of [0, 1]) {
      aspect(c, 2.98 / 3.2, (w, h) => {
        c.fillStyle = "#0f1a44";
        c.fillRect(0, 0, w, h);
        const cols = ["#6ee7a0", "#ff4fa3", "#ffb000", "#39a0ff", "#ffffff"];
        const r = new Rng(77 + half);
        for (let k = 0; k < 16; k++) {
          c.fillStyle = cols[k % cols.length]!;
          c.globalAlpha = 0.9;
          const x = r.next() * w, y = r.next() * h, s = 10 + r.next() * 28;
          c.save();
          c.translate(x, y);
          c.rotate(r.next() * 6);
          if (k % 3 === 0) { c.beginPath(); c.arc(0, 0, s * 0.6, 0, 7); c.fill(); }
          else if (k % 3 === 1) c.fillRect(-s / 2, -s / 6, s, s / 3);
          else { c.beginPath(); c.moveTo(0, -s / 2); c.lineTo(s / 2, s / 2); c.lineTo(-s / 2, s / 2); c.fill(); }
          c.restore();
        }
        c.globalAlpha = 1;
        c.fillStyle = "#6ee7a0";
        c.fillRect(0, h * 0.9, w, h * 0.1);
        if (half) logo(c, "ketnet", w * 0.12, h * 0.1, w * 0.76, h * 0.72, "KETNET");
      }, half * 256, 0, 256, S);
    }
  },
  [L.SPORZAWALL]: (c) => {
    for (const half of [0, 1]) {
      aspect(c, 2.98 / 3.2, (w, h) => {
        const g = c.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, "#0d1512");
        g.addColorStop(1, "#16241d");
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        // pitch lines and speed stripes
        c.strokeStyle = "rgba(90,220,120,0.35)";
        c.lineWidth = 3;
        for (let k = -4; k < 10; k++) { c.beginPath(); c.moveTo(k * 50, h); c.lineTo(k * 50 + h * 0.6, 0); c.stroke(); }
        c.fillStyle = "#3ccf6a";
        c.fillRect(0, h * 0.86, w, h * 0.03);
        if (half) {
          c.fillStyle = "#f4f4f2";
          c.fillRect(w * 0.08, h * 0.3, w * 0.84, h * 0.3);
          logo(c, "sporza", w * 0.14, h * 0.33, w * 0.72, h * 0.24, "sporza");
          text(c, "LIVE", w * 0.5, h * 0.72, h * 0.07, "#3ccf6a", "900");
        }
      }, half * 256, 0, 256, S);
    }
  },
  [L.IDENTS]: (c) => {
    const ids: [string, LogoName, string][] = [["#0f1a44", "ketnet", ""], ["#f4f4f2", "sporza", "#3ccf6a"], ["#ffffff", "vrt1", ""], ["#0e4f4a", "canvas", ""]];
    ids.forEach(([bg, lg, bar], k) => {
      aspect(c, 16 / 9, (w, h) => {
        c.fillStyle = bg;
        c.fillRect(0, 0, w, h);
        logo(c, lg, w * 0.25, h * 0.14, w * 0.5, h * 0.66);
        if (bar) { c.fillStyle = bar; c.fillRect(0, h * 0.9, w, h * 0.1); }
      }, (k % 2) * 256, Math.floor(k / 2) * 256, 256, 256);
    });
  },
  [L.KAMPWALL]: (c) => {
    fill(c, "#6aa33a");
    logo(c, "kampwall", 0, 0, S, S);
  },
  [L.SETSIGNS]: (c) => {
    // 0: the Kampioenen scarf sign, 1: Bar Madam in neon, 2: Boma Worst enamel, 3: the stencil on the back of a flat
    c.fillStyle = "#e9dcc0";
    c.fillRect(0, 0, 256, 256);
    aspect(c, 1.88, (w, h) => logo(c, "kampsign", 0, 0, w, h, "F.C. DE KAMPIOENEN"), 0, 0, 256, 256);
    aspect(c, 2.4, (w, h) => {
      c.fillStyle = "#1a0d14";
      c.fillRect(0, 0, w, h);
      c.shadowColor = "#ff4fa3";
      c.shadowBlur = 14;
      text(c, "Bar Madam", w / 2, h * 0.47, h * 0.5, "#ffd0ea", "italic 700", "center", "Snell Roundhand, Brush Script MT, Georgia, serif");
      c.shadowBlur = 0;
      c.strokeStyle = "#ff4fa3";
      c.lineWidth = 3;
      c.strokeRect(8, 8, w - 16, h - 16);
    }, 256, 0, 256, 256);
    aspect(c, 2.2, (w, h) => {
      c.fillStyle = "#c8141e";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#f7f2e6";
      c.fillRect(6, 6, w - 12, h - 12);
      c.fillStyle = "#c8141e";
      c.fillRect(12, 12, w - 24, h - 24);
      text(c, "BOMA", w / 2, h * 0.42, h * 0.44, "#ffd21f", "900");
      text(c, "WORST · VLEESWAREN", w / 2, h * 0.76, h * 0.13, "#f7f2e6", "800");
    }, 0, 256, 256, 256);
    aspect(c, 2.4, (w, h) => {
      c.fillStyle = "#c9a878";
      c.fillRect(0, 0, w, h);
      text(c, "VRT DECOR", w * 0.06, h * 0.32, h * 0.2, "#1a1a1a", "900", "left", "Courier New, monospace");
      text(c, "NIET VERPLAATSEN", w * 0.06, h * 0.58, h * 0.14, "#1a1a1a", "700", "left", "Courier New, monospace");
      text(c, "STUDIO 5 · FLAT 12", w * 0.06, h * 0.8, h * 0.12, "#8a1010", "700", "left", "Courier New, monospace");
    }, 256, 256, 256, 256);
    noise(c, 8);
  },
  [L.PLYWOOD]: (c) => {
    fill(c, "#c9a878");
    c.globalAlpha = 0.18;
    for (let i = 0; i < 220; i++) {
      c.strokeStyle = R() > 0.5 ? "#8a6a40" : "#e6c99a";
      c.lineWidth = 1 + R() * 3;
      const y = R() * S;
      c.beginPath();
      c.moveTo(0, y);
      c.bezierCurveTo(S * 0.3, y + R() * 16 - 8, S * 0.6, y + R() * 16 - 8, S, y);
      c.stroke();
    }
    c.globalAlpha = 1;
    // sheet seams and screw rows
    c.fillStyle = "#6b5232";
    c.fillRect(0, 0, 4, S);
    c.fillRect(0, S / 2 - 2, S, 4);
    for (let y = 16; y < S; y += 40) { c.fillRect(10, y, 3, 3); c.fillRect(S - 14, y, 3, 3); }
    noise(c, 12);
  },
  [L.WALLPAPER]: (c) => {
    fill(c, "#e8dcc4");
    for (let x = 0; x < S; x += 64) {
      c.fillStyle = "rgba(120,90,50,0.16)";
      c.fillRect(x, 0, 22, S);
    }
    c.fillStyle = "rgba(110,80,40,0.22)";
    for (let y = 32; y < S; y += 128)
      for (let x = 43; x < S; x += 128)
        for (const [ox, oy] of [[0, 0], [64, 64]]) {
          c.save();
          c.translate(x + ox!, y + oy!);
          for (let k = 0; k < 4; k++) { c.rotate(Math.PI / 2); c.beginPath(); c.ellipse(0, 10, 5, 12, 0, 0, 7); c.fill(); }
          c.restore();
        }
    noise(c, 10);
  },
  [L.MISC]: (c) => {
    // 0: a Kampioenen shirt, green and yellow, BOMA on the chest
    aspect(c, 0.62 / 0.72, (w, h) => {
      for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? "#ffd21f" : "#1f8a3a"; c.fillRect((k * w) / 8, 0, w / 8 + 1, h); }
      c.fillStyle = "#1f8a3a";
      c.fillRect(0, 0, w, h * 0.08);
      c.fillStyle = "#ffffff";
      c.fillRect(w * 0.18, h * 0.3, w * 0.64, h * 0.2);
      text(c, "BOMA", w / 2, h * 0.4, h * 0.14, "#c8141e", "900");
    }, 0, 0, 256, 256);
    // 1: Michel Wuyts' koersboekje
    aspect(c, 0.15 / 0.21, (w, h) => {
      c.fillStyle = "#1c2f6e";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#e9e3cf";
      c.fillRect(w * 0.1, h * 0.22, w * 0.8, h * 0.4);
      text(c, "KOERS", w / 2, h * 0.34, h * 0.08, "#1c2f6e", "900");
      text(c, "Michel", w / 2, h * 0.5, h * 0.08, "#b01818", "600", "center", MARKER);
      for (let y = 0; y < h; y += h / 14) { c.fillStyle = "#999"; c.fillRect(0, y, w * 0.05, h / 40); }
    }, 256, 0, 256, 256);
    // 2: the front of the Sporza desk
    aspect(c, 2.6 / 0.95, (w, h) => {
      c.fillStyle = "#111512";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#3ccf6a";
      c.fillRect(0, h * 0.82, w, h * 0.06);
      c.fillStyle = "#f4f4f2";
      c.fillRect(w * 0.3, h * 0.2, w * 0.4, h * 0.45);
      logo(c, "sporza", w * 0.32, h * 0.24, w * 0.36, h * 0.37, "sporza");
    }, 0, 256, 256, 256);
    // 3: the bottles behind the bar
    fillRect(c, 256, 256, 256, 256, "#2a1810");
    for (let r = 0; r < 3; r++) {
      c.fillStyle = "#6b4a2e";
      c.fillRect(256, 256 + r * 85 + 78, 256, 7);
      for (let k = 0; k < 12; k++) {
        const x = 262 + k * 20.5, hgt = 42 + R() * 28, y = 256 + r * 85 + 78 - hgt;
        c.fillStyle = ["#2e6b2a", "#7a2a18", "#d8b050", "#e8e8e0", "#3a2a6a", "#b86a18"][(R() * 6) | 0]!;
        c.fillRect(x, y + hgt * 0.35, 14, hgt * 0.65);
        c.fillRect(x + 4, y, 6, hgt * 0.4);
        c.fillStyle = "rgba(255,255,255,0.35)";
        c.fillRect(x + 2, y + hgt * 0.45, 2, hgt * 0.4);
      }
    }
  },
  [L.BANNERS]: (c) => {
    const rows: [string, (w: number, h: number) => void][] = [
      ["#f4f4f2", (w, h) => { logo(c, "sporza", w * 0.3, h * 0.12, w * 0.4, h * 0.7, "sporza"); c.fillStyle = "#3ccf6a"; c.fillRect(0, h * 0.88, w, h * 0.12); }],
      ["#111111", (w, h) => { c.fillStyle = "#ffe600"; c.fillRect(0, 0, h * 0.5, h); c.fillRect(w - h * 0.5, 0, h * 0.5, h); text(c, "RONDE VAN VLAANDEREN", w / 2, h / 2 + 2, h * 0.42, "#ffe600", "900"); }],
      ["#c8102e", (w, h) => { text(c, "ALLEZ LES DIABLES · RODE DUIVELS", w / 2, h / 2 + 2, h * 0.36, "#ffffff", "900"); c.fillStyle = "#111"; c.fillRect(0, 0, w, h * 0.08); c.fillStyle = "#ffe600"; c.fillRect(0, h * 0.92, w, h * 0.08); }],
      ["#1f8a3a", (w, h) => { for (let k = 0; k < 16; k++) if (k % 2) { c.fillStyle = "#ffd21f"; c.fillRect((k * w) / 16, 0, w / 16, h * 0.14); c.fillRect((k * w) / 16, h * 0.86, w / 16, h * 0.14); } text(c, "F.C. DE KAMPIOENEN", w / 2, h / 2 + 2, h * 0.42, "#ffd21f", "900"); }],
    ];
    rows.forEach(([bg, fn], k) => {
      fillRect(c, 0, k * 128, S, 128, bg);
      aspect(c, 4, fn, 0, k * 128, S, 128);
    });
  },
};

// door signs, like SIGNS: 8 labels on dark plates with a coloured edge
function serviceSigns(c: Ctx, labels: string[], edge: string) {
  labels.forEach((t, n) => {
    const x = (n % 2) * 256, y = Math.floor(n / 2) * 128;
    c.fillStyle = "#2b2d31";
    c.fillRect(x, y, 256, 128);
    c.fillStyle = edge;
    c.fillRect(x, y, 14, 128);
    text(c, t, x + 135, y + 64, t.length > 9 ? 25 : 32, "#f5f5f5", "700");
  });
}

function rtbfLogo(c: Ctx, x: number, y: number, s: number) {
  c.fillStyle = "#1a64c8";
  c.fillRect(x - s * 1.6, y - s * 0.7, s * 3.2, s * 1.4);
  text(c, "rtbf", x, y + 1, s * 1.1, "#fff", "800");
}

function posters(c: Ctx, list: [string, string, string, string, string][], logo: (c: Ctx, x: number, y: number, s: number) => void = vrtLogo) {
  list.forEach(([title, bg, fg, time, sub], q) => {
    const x = (q % 2) * 256, y = q < 2 ? 0 : 256;
    aspect(c, 0.64 / 0.9, (w, h) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = fg;
      c.globalAlpha = 0.18;
      c.beginPath(); c.arc(w * 0.75, h * 0.35, w * 0.45, 0, 7); c.fill();
      c.globalAlpha = 1;
      const words = title.split(" ");
      words.forEach((wd, k) => text(c, wd, 16, h * 0.5 + k * 40 - (words.length - 1) * 20, wd.length > 8 ? 30 : 40, fg, "900", "left"));
      text(c, sub, 16, h * 0.82, 11, fg, "600", "left");
      text(c, time, 16, h * 0.9, 18, fg, "800", "left");
      logo(c, w - 30, 30, 16);
    }, x, y, 256, 256);
  });
}

function fillRect(c: Ctx, x: number, y: number, w: number, h: number, col: string) {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
}

// an image fitted (contained and centred) into a box, or a text fallback while missing
function logo(c: Ctx, name: LogoName, x: number, y: number, w: number, h: number, fallback = "") {
  const img = IMG[name];
  if (!img) {
    if (fallback) text(c, fallback, x + w / 2, y + h / 2, Math.min(h * 0.5, (w / fallback.length) * 1.6), "#ccc", "900");
    return;
  }
  const k = Math.min(w / img.width, h / img.height);
  const dw = img.width * k, dh = img.height * k;
  c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

interface BrandPoster { title: string; bg: string; fg: string; time: string; sub: string; logo: LogoName; big?: boolean; panel?: string }

// Posters with a real brand logo: big and centred, or a smaller logo over a title.
function brandPosters(c: Ctx, list: BrandPoster[], first = 0) {
  list.forEach((p, n) => {
    const q = first + n;
    const x = (q % 2) * 256, y = q < 2 ? 0 : 256;
    aspect(c, 0.64 / 0.9, (w, h) => {
      c.fillStyle = p.bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = p.fg;
      c.globalAlpha = 0.12;
      c.beginPath(); c.arc(w * 0.8, h * 0.75, w * 0.5, 0, 7); c.fill();
      c.globalAlpha = 1;
      const lh = p.big ? h * 0.5 : h * 0.24;
      if (p.panel) fillRect(c, 12, 14, w - 24, lh + 8, p.panel);
      logo(c, p.logo, 18, 18, w - 36, lh, p.title);
      if (p.title) {
        const words = p.title.split(" ");
        const top = p.big ? h * 0.66 : h * 0.44;
        words.forEach((wd, k) => text(c, wd, 16, top + k * 36, wd.length > 9 ? 25 : wd.length > 6 ? 32 : 38, p.fg, "900", "left"));
      }
      text(c, p.sub, 16, h * 0.84, p.sub.length > 26 ? 9 : 11, p.fg, "600", "left");
      text(c, p.time, 16, h * 0.92, 18, p.fg, "800", "left");
      vrtLogo(c, w - 24, h - 24, 11);
    }, x, y, 256, 256);
  });
}

// Museum labels for the auctioned works, 8 per layer (2 x 4).
function labels(c: Ctx, first: number) {
  fill(c, "#e9e6df");
  for (let k = 0; k < 8; k++) {
    const a = ART[first + k];
    if (!a) break;
    const x = (k % 2) * 256, y = Math.floor(k / 2) * 128;
    c.fillStyle = "#f6f4ef";
    c.fillRect(x + 3, y + 3, 250, 122);
    text(c, `LOT ${a.lot}`, x + 14, y + 20, 13, "#ff2e7e", "700", "left");
    const artist = a.artist.length > 26 ? a.artist.slice(0, 25) + "…" : a.artist;
    text(c, artist, x + 14, y + 44, artist.length > 20 ? 14 : 17, "#111", "800", "left");
    const title = a.title.length > 30 ? a.title.slice(0, 29) + "…" : a.title;
    text(c, title, x + 14, y + 68, 15, "#333", "italic 500", "left");
    text(c, "Collectie VRT", x + 14, y + 96, 12, "#777", "600", "left");
    text(c, "veiling Bernaerts", x + 14, y + 112, 12, "#777", "600", "left");
  }
}

// De koffiekamer, on one sheet (see KOFFIE_PX): door signs, the price list by
// the door, the broodjesbar's display and menu, the fridge, the Coca-Cola
// fridge, a coffee machine, the orange mat with the cup, the poortjes' IN and UIT.
function koffieSheet(c: Ctx) {
  const K = KOFFIE_PX;
  const box = (k: keyof typeof K) => { const [x0, y0, x1, y1] = K[k]; return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  // door signs, like the other services', with a lime edge
  for (const [k, t, edge] of [["sign", "KOFFIEKAMER", "#7ac70c"], ["signFr", "CAFÉTÉRIA", "#1a64c8"]] as const) {
    const b = box(k);
    fillRect(c, b.x, b.y, b.w, b.h, "#2b2d31");
    fillRect(c, b.x, b.y, 14, b.h, edge);
    text(c, t, b.x + 135, b.y + 64, 27, "#f5f5f5", "700");
  }
  // "Prijslijst koffiekamer": an A4 behind plastic, taped to the wall
  {
    const b = box("prices");
    fillRect(c, b.x, b.y, b.w, b.h, "#f4f4ee");
    text(c, "Prijslijst koffiekamer", b.x + b.w / 2, b.y + 14, 12, "#222", "700");
    fillRect(c, b.x + 8, b.y + 24, b.w - 16, 12, "#6fb52c");
    text(c, "WARME DRANKEN", b.x + b.w / 2, b.y + 30, 8, "#fff", "700");
    const rows: [string, string][] = [
      ["Koffie", "0,80"], ["Espresso", "0,80"], ["Cappuccino", "1,20"], ["Latte macchiato", "1,40"], ["Thee", "0,80"], ["Chocomelk", "1,20"], ["Soep van de dag", "1,50"],
      ["", ""], ["Broodje kaas", "2,60"], ["Broodje hesp", "2,60"], ["Broodje kip curry", "3,10"], ["Broodje martino", "3,10"], ["Panini", "3,50"], ["Croque monsieur", "3,20"], ["Slaatje", "4,80"],
    ];
    rows.forEach(([n, pr], k) => {
      const y = b.y + 46 + k * 10;
      if (!n) { fillRect(c, b.x + 8, y - 4, b.w - 16, 9, "#6fb52c"); text(c, "BROODJESBAR", b.x + b.w / 2, y, 8, "#fff", "700"); return; }
      text(c, n, b.x + 10, y, 8, "#333", "500", "left");
      text(c, `€ ${pr}`, b.x + b.w - 10, y, 8, "#333", "600", "right");
    });
    // the drinks in the fridges, with pictures
    const dy = b.y + 200;
    ["#d8342c", "#e9a52a", "#c43", "#2b7de0", "#9ad"].forEach((col, k) => fillRect(c, b.x + 12 + k * 28, dy - 16, 10, 22, col));
    text(c, "€ 1,40 · € 1,00", b.x + b.w / 2, dy + 14, 9, "#c21", "800");
    noise(c, 6, true, b.x, b.y, b.w, b.h);
  }
  // the broodjesbar's display: trays of fillings under glass
  {
    const b = box("display");
    fillRect(c, b.x, b.y, b.w, b.h, "#cfd6d9");
    const fills = ["#f3d34a", "#f2a7a0", "#f6e7a6", "#e7a93b", "#d9c7a4", "#6aa84f", "#d6453b", "#f0e6d0", "#b4583a", "#8fc15a", "#f3d34a", "#e9b0a8"];
    const n = 6;
    for (let r = 0; r < 2; r++)
      for (let k = 0; k < n; k++) {
        const x = b.x + 8 + k * ((b.w - 16) / n), y = b.y + 12 + r * 48;
        fillRect(c, x, y, (b.w - 16) / n - 8, 40, "#aab3b7");
        c.fillStyle = fills[(r * n + k) % fills.length]!;
        c.beginPath();
        c.ellipse(x + ((b.w - 16) / n - 8) / 2, y + 22, 20, 13, 0, 0, 7);
        c.fill();
      }
    noise(c, 10, false, b.x, b.y, b.w, b.h);
  }
  // the menu above the ovens
  {
    const b = box("menu");
    fillRect(c, b.x, b.y, b.w, b.h, "#161a17");
    fillRect(c, b.x, b.y, b.w, 26, "#6fb52c");
    text(c, "BROODJES · PANINI · CROQUES", b.x + b.w / 2, b.y + 14, 16, "#fff", "800");
    [["Broodje van de week", "3,40"], ["Croque monsieur", "3,20"], ["Panini mozzarella", "3,50"], ["Croque Hawaï", "3,40"], ["Kip curry", "3,10"], ["Martino", "3,10"]].forEach(([n, pr], k) => {
      const x = b.x + 14 + (k % 2) * (b.w / 2), y = b.y + 42 + Math.floor(k / 2) * 24;
      text(c, n!, x, y, 13, "#f2efe6", "500", "left", MARKER);
      text(c, pr!, x + b.w / 2 - 34, y, 13, "#f6d24a", "700", "right", MARKER);
    });
  }
  // a fridge: glass door, bottles and salad bowls
  {
    const b = box("fridge");
    fillRect(c, b.x, b.y, b.w, b.h, "#1c2226");
    fillRect(c, b.x + 5, b.y + 12, b.w - 10, b.h - 20, "#dfeaf0");
    for (let r = 0; r < 5; r++) {
      const y = b.y + 16 + r * 28;
      fillRect(c, b.x + 5, y + 24, b.w - 10, 2, "#9aa4a8");
      for (let k = 0; k < 4; k++) {
        const col = r < 2 ? ["#d8342c", "#2b7de0", "#e9a52a", "#5bb04a"][(k + r) % 4]! : r < 4 ? ["#7fbf4d", "#f1e0b0", "#e05a3a"][(k + r) % 3]! : "#9fd3ef";
        if (r < 2 || r === 4) fillRect(c, b.x + 8 + k * 13, y + 4, 8, 20, col);
        else { c.fillStyle = col; c.beginPath(); c.ellipse(b.x + 13 + k * 13, y + 18, 6, 5, 0, 0, 7); c.fill(); }
      }
    }
    text(c, "FRIS", b.x + b.w / 2, b.y + 6, 9, "#fff", "700");
  }
  // the Coca-Cola fridge
  {
    const b = box("coke");
    fillRect(c, b.x, b.y, b.w, b.h, "#c8101e");
    fillRect(c, b.x + 8, b.y + 30, b.w - 16, b.h - 44, "#e8eef0");
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) fillRect(c, b.x + 12 + k * 15, b.y + 36 + r * 28, 9, 22, r === 3 ? "#e8e8e8" : "#b3121c");
    c.save();
    c.translate(b.x + b.w / 2, b.y + 17);
    c.rotate(-0.08);
    text(c, "Coca-Cola", 0, 0, 17, "#fff", "italic 700", "center", "Georgia, serif");
    c.restore();
  }
  // a coffee machine: black, a little screen, a grid of buttons, the spout
  {
    const b = box("machine");
    fillRect(c, b.x, b.y, b.w, b.h, "#141516");
    fillRect(c, b.x + 10, b.y + 12, b.w - 20, 26, "#1f6fa8");
    text(c, "Kies uw drank", b.x + b.w / 2, b.y + 25, 10, "#dff", "600");
    for (let r = 0; r < 3; r++)
      for (let k = 0; k < 3; k++) {
        fillRect(c, b.x + 14 + k * 32, b.y + 48 + r * 20, 26, 14, "#3b3d40");
        fillRect(c, b.x + 16 + k * 32, b.y + 50 + r * 20, 6, 10, ["#8b5a2b", "#c9a27a", "#e8dcc8"][(r + k) % 3]!);
      }
    fillRect(c, b.x + 30, b.y + 112, b.w - 60, 40, "#050505");
    fillRect(c, b.x + b.w / 2 - 6, b.y + 112, 12, 8, "#777");
  }
  // the orange mat with the cup
  {
    const b = box("mat");
    fillRect(c, b.x, b.y, b.w, b.h, "#d9622b");
    c.strokeStyle = "#f08a52";
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(b.x + 34, b.y + 44); c.lineTo(b.x + 42, b.y + 96); c.lineTo(b.x + 82, b.y + 96); c.lineTo(b.x + 90, b.y + 44); c.closePath();
    c.stroke();
    c.beginPath(); c.arc(b.x + 96, b.y + 66, 13, -1.3, 1.3); c.stroke();
    c.beginPath(); c.moveTo(b.x + 26, b.y + 104); c.lineTo(b.x + 100, b.y + 104); c.stroke();
    noise(c, 14, true, b.x, b.y, b.w, b.h);
  }
  // the poortjes
  for (const [k, t] of [["in", "→ IN"], ["out", "UIT →"]] as const) {
    const b = box(k);
    fillRect(c, b.x, b.y, b.w, b.h, "#1b1d1f");
    text(c, t, b.x + b.w / 2, b.y + b.h / 2, 30, k === "in" ? "#5fe07c" : "#ff5a4a", "800");
  }
}

// Het DPC, on one sheet (see DPC_PX): door signs, the Red Hat flag, and what's
// on the screens on the desks (an editor, a terminal, a graph, a pipeline).
function dpcSheet(c: Ctx) {
  const K = DPC_PX;
  const box = (k: keyof typeof K) => { const [x0, y0, x1, y1] = K[k]; return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  // door signs, like the other services', with a red edge
  for (const [k, t, size, edge] of [["sign", "DPC", 44, "#ee0000"], ["signFr", "INFORMATIQUE", 25, "#1a64c8"]] as const) {
    const b = box(k);
    fillRect(c, b.x, b.y, b.w, b.h, "#2b2d31");
    fillRect(c, b.x, b.y, 14, b.h, edge);
    text(c, t, b.x + 135, b.y + 60, size, "#f5f5f5", "800");
    text(c, "</>", b.x + 135, b.y + 102, 16, "#8a8d93", "700", "center", "ui-monospace, Menlo, monospace");
  }
  // the Red Hat flag: the hat in white on red, the name beside it
  {
    const b = box("flag");
    fillRect(c, b.x, b.y, b.w, b.h, "#e00");
    c.save();
    c.translate(b.x + 128, b.y + 146);
    c.scale(84, 84);
    const crown = () => {
      c.beginPath();
      c.moveTo(-0.62, 0.02);
      c.bezierCurveTo(-0.66, -0.42, -0.5, -0.74, -0.22, -0.72);
      c.bezierCurveTo(-0.08, -0.71, -0.04, -0.6, 0.05, -0.6);
      c.bezierCurveTo(0.16, -0.6, 0.22, -0.76, 0.42, -0.72);
      c.bezierCurveTo(0.62, -0.66, 0.7, -0.3, 0.66, 0.02);
      c.closePath();
    };
    c.fillStyle = "#fff";
    crown();
    c.fill();
    // the brim: a swoop, wider on the left
    c.beginPath();
    c.moveTo(-1.08, -0.06);
    c.bezierCurveTo(-1.02, 0.34, 0.4, 0.42, 1.0, 0.04);
    c.bezierCurveTo(1.06, 0.0, 0.98, -0.06, 0.86, -0.02);
    c.bezierCurveTo(0.3, 0.16, -0.6, 0.14, -0.96, -0.1);
    c.closePath();
    c.fill();
    // the band
    c.save();
    crown();
    c.clip();
    c.fillStyle = "#1a1a1a";
    c.fillRect(-1, -0.2, 2, 0.17);
    c.restore();
    c.restore();
    text(c, "Red Hat", b.x + 232, b.y + 132, 72, "#fff", "700", "left");
    c.fillStyle = "rgba(0,0,0,0.12)";
    for (let k = 0; k < 7; k++) c.fillRect(b.x + 30 + k * 72, b.y, 2, b.h); // creases
    noise(c, 10, true, b.x, b.y, b.w, b.h);
  }
  // the screens, painted for a 16:10 monitor
  const screen = (k: keyof typeof K, fn: (w: number, h: number) => void) => {
    const b = box(k);
    aspect(c, 1.65, fn, b.x, b.y, b.w, b.h);
  };
  screen("code", (w, h) => {
    fillRect(c, 0, 0, w, h, "#1e1f24");
    fillRect(c, 0, 0, w, 7, "#2b2d33");
    fillRect(c, 4, 1, 26, 6, "#1e1f24");
    fillRect(c, 0, 7, 12, h - 7, "#24262c");
    const cols = ["#c678dd", "#61afef", "#98c379", "#e5c07b", "#abb2bf", "#abb2bf", "#56b6c2", "#5c6370"];
    for (let y = 11, n = 0; y < h - 2; y += 4.4, n++) {
      fillRect(c, 3, y, 5, 2, "#4b4f58");
      let x = 16 + [0, 6, 12, 12, 6, 12, 18, 6][n % 8]!;
      for (let t = 0; t < 1 + ((n * 7) % 4) && x < w - 8; t++) {
        const len = 6 + ((n * 13 + t * 5) % 22);
        fillRect(c, x, y, len, 2, cols[(n + t * 3) % cols.length]!);
        x += len + 3;
      }
    }
    fillRect(c, 46, 31, 1.2, 3, "#fff");
  });
  screen("term", (w, h) => {
    fillRect(c, 0, 0, w, h, "#0b0d0c");
    for (let y = 5, n = 0; y < h - 4; y += 5, n++) {
      const prompt = n % 4 === 0;
      if (prompt) fillRect(c, 4, y, 4, 2.4, "#58e06f");
      fillRect(c, prompt ? 11 : 4, y, 14 + ((n * 37) % 70), 2.4, prompt ? "#d8f8dc" : n % 7 === 3 ? "#ff6b5e" : "#58e06f");
    }
    fillRect(c, 11, h - 8, 4, 3, "#d8f8dc");
  });
  screen("graph", (w, h) => {
    fillRect(c, 0, 0, w, h, "#111217");
    for (const [x0, y0, pw, ph, col] of [[3, 3, w / 2 - 4.5, h / 2 - 4.5, "#73bf69"], [w / 2 + 1.5, 3, w / 2 - 4.5, h / 2 - 4.5, "#f2cc0c"], [3, h / 2 + 1.5, w - 6, h / 2 - 4.5, "#5794f2"]] as const) {
      fillRect(c, x0, y0, pw, ph, "#181b1f");
      c.strokeStyle = "#262a30";
      c.lineWidth = 0.5;
      for (let k = 1; k < 4; k++) {
        c.beginPath(); c.moveTo(x0, y0 + (ph * k) / 4); c.lineTo(x0 + pw, y0 + (ph * k) / 4); c.stroke();
      }
      c.strokeStyle = col;
      c.lineWidth = 1.2;
      c.beginPath();
      for (let k = 0; k <= 30; k++) {
        const v = 0.5 + 0.3 * Math.sin(k * 0.5 + x0) + (R() - 0.5) * 0.3;
        c.lineTo(x0 + (pw * k) / 30, y0 + ph * (1 - Math.max(0.05, Math.min(0.95, v))));
      }
      c.stroke();
    }
  });
  screen("deploy", (w, h) => {
    fillRect(c, 0, 0, w, h, "#f6f7f9");
    fillRect(c, 0, 0, w, 8, "#fc6d26");
    for (let r = 0; r < 6; r++) {
      const y = 13 + r * 10;
      fillRect(c, 4, y, 22, 6, "#c9ccd1");
      for (let k = 0; k < 4; k++) {
        const failed = r === 1 && k === 3, running = r === 0 && k === 3;
        c.fillStyle = failed ? "#dd2b0e" : running ? "#1f75cb" : "#108548";
        c.beginPath(); c.arc(36 + k * 22, y + 3, 3, 0, 7); c.fill();
        if (k < 3) fillRect(c, 39 + k * 22, y + 2.5, 16, 1, "#c9ccd1");
      }
    }
  });
}

// The NWS sheet: door signs for the douches, the fietsenstalling and het
// vossenhol, the charging point sign, the anchor's name panel, the weather map
// on the return monitors, the plaque in het vossenhol.
function nwsSheet(c: Ctx) {
  const K = NWS_PX;
  const box = (k: keyof typeof K) => { const [x0, y0, x1, y1] = K[k]; return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  // door signs, like the other services' (at half the size: 128 x 64)
  for (const [k, t, edge] of [
    ["shower", "DOUCHES", "#2a9ad6"], ["showerFr", "DOUCHES", "#1a64c8"],
    ["bikes", "FIETSENSTALLING", "#7ac70c"], ["bikesFr", "PARKING VÉLOS", "#1a64c8"],
    ["vos", "VOSSENHOL", "#e2711d"], ["vosFr", "TERRIER", "#1a64c8"],
  ] as const) {
    const b = box(k);
    fillRect(c, b.x, b.y, b.w, b.h, "#2b2d31");
    fillRect(c, b.x, b.y, 7, b.h, edge);
    text(c, t, b.x + 68, b.y + 33, t.length > 11 ? 11 : t.length > 8 ? 14 : 17, "#f5f5f5", "700");
  }
  // LAADPUNT E-BIKES: white on green, a bolt and a plug
  {
    const b = box("laad");
    fillRect(c, b.x, b.y, b.w, b.h, "#1d8a3c");
    fillRect(c, b.x + 4, b.y + 4, b.w - 8, b.h - 8, "#21a046");
    c.fillStyle = "#ffe14a";
    c.beginPath();
    for (const [x, y] of [[30, 8], [16, 34], [27, 34], [20, 56], [40, 26], [29, 26], [36, 8]]) c.lineTo(b.x + x!, b.y + y!);
    c.closePath();
    c.fill();
    text(c, "LAADPUNT", b.x + 148, b.y + 23, 24, "#fff", "800");
    text(c, "E-BIKES · enkel voor personeel", b.x + 148, b.y + 46, 12, "#e6f6e9", "600");
  }
  // the anchor's name panel: a tall blue panel, lighter at the top, the name in white
  for (const [k, l1, l2] of [["name", "Wim", "De Vilder"], ["nameFr", "Le JT", "19h30"]] as const) {
    const b = box(k);
    aspect(c, 1.3 / 3.0, (w, h) => {
      const g = c.createLinearGradient(0, 0, w * 0.6, h);
      g.addColorStop(0, "#5aa0f0");
      g.addColorStop(0.45, "#2f6fd8");
      g.addColorStop(1, "#1846a8");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.fillStyle = "rgba(255,255,255,0.05)";
      c.beginPath(); c.ellipse(w * 1.05, h * 0.7, w * 0.9, h * 0.5, 0, 0, 7); c.fill();
      text(c, l1, w * 0.1, h * 0.3, w * 0.17, "#fff", "300", "left");
      text(c, l2, w * 0.1, h * 0.36, w * 0.17, "#fff", "300", "left");
    }, b.x, b.y, b.w, b.h);
  }
  // a plain blue panel, the same blue
  {
    const b = box("panel");
    const g = c.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    g.addColorStop(0, "#4b92ea");
    g.addColorStop(1, "#1d4fb0");
    c.fillStyle = g;
    c.fillRect(b.x, b.y, b.w, b.h);
  }
  // the weather map: Belgium in green on a blue sea, sun and clouds, temperatures
  {
    const b = box("weer");
    aspect(c, 16 / 9, (w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#2a6fc4");
      g.addColorStop(1, "#174f99");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // (lon, lat) along the border, clockwise from De Panne
      const BE = [
        [2.55, 51.09], [3.37, 51.37], [3.85, 51.21], [4.25, 51.37], [4.53, 51.48], [4.78, 51.43], [5.03, 51.48], [5.24, 51.31], [5.56, 51.27], [5.85, 51.15], [5.64, 50.85],
        [5.69, 50.76], [6.02, 50.75], [6.27, 50.63], [6.4, 50.33], [6.14, 50.13], [5.97, 50.17], [5.75, 49.98], [5.82, 49.55], [5.47, 49.5], [4.85, 49.79], [4.87, 50.15],
        [4.43, 49.94], [4.15, 50.0], [4.23, 50.27], [3.71, 50.35], [3.29, 50.53], [3.06, 50.78], [2.62, 50.8],
      ];
      const px = (lon: number) => w * 0.16 + (lon - 2.5) * h * 0.235, py = (lat: number) => h * 0.08 + (51.55 - lat) * h * 0.37;
      c.fillStyle = "#3d9a3a";
      c.beginPath();
      for (const [lon, lat] of BE) c.lineTo(px(lon!), py(lat!));
      c.closePath();
      c.fill();
      c.strokeStyle = "#cfe8c4";
      c.lineWidth = 1.2;
      c.stroke();
      const sun = (x: number, y: number, r: number) => {
        c.fillStyle = "#ffd21f";
        c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
        c.strokeStyle = "#ffd21f"; c.lineWidth = r * 0.25;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          c.beginPath(); c.moveTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3); c.lineTo(x + Math.cos(a) * r * 1.7, y + Math.sin(a) * r * 1.7); c.stroke();
        }
      };
      const cloud = (x: number, y: number, r: number, col = "#f4f6f8") => {
        c.fillStyle = col;
        for (const [ox, oy, rr] of [[-0.7, 0.2, 0.6], [0, -0.15, 0.85], [0.75, 0.2, 0.6]]) { c.beginPath(); c.arc(x + ox! * r, y + oy! * r, rr! * r, 0, 7); c.fill(); }
        c.fillRect(x - r * 0.7, y + r * 0.1, r * 1.45, r * 0.7);
      };
      sun(px(3.3), py(51.15), 9);
      cloud(px(3.6), py(51.0), 9);
      sun(px(4.4), py(50.95), 8);
      cloud(px(5.4), py(51.05), 10);
      cloud(px(5.5), py(50.25), 10, "#c9ced4");
      c.strokeStyle = "#7fc4ff"; c.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(px(5.3) + k * 5, py(50.12)); c.lineTo(px(5.3) + k * 5 - 3, py(50.0)); c.stroke(); }
      for (const [t, lon, lat] of [["17°", 2.95, 51.0], ["19°", 4.4, 51.2], ["20°", 4.35, 50.72], ["18°", 5.55, 50.62], ["14°", 5.75, 49.9], ["19°", 3.75, 50.62]] as const) {
        text(c, t, px(lon) + 1, py(lat) + 1, 13, "rgba(0,0,0,0.5)", "800");
        text(c, t, px(lon), py(lat), 13, "#fff", "800");
      }
      fillRect(c, 0, h - 18, w, 18, "rgba(5,20,50,0.85)");
      text(c, "HET WEER", 10, h - 9, 10, "#fff", "800", "left");
      text(c, "MORGEN · zon en wolken, later een bui in de Ardennen", w - 8, h - 9, 7, "#cfe0f5", "500", "right");
    }, b.x, b.y, b.w, b.h);
  }
  // in het vossenhol, by the door
  {
    const b = box("plaque");
    fillRect(c, b.x, b.y, b.w, b.h, "#e9ebe7");
    fillRect(c, b.x + 4, b.y + 4, b.w - 8, b.h - 8, "#f6f7f4");
    text(c, "VOSSENHOL", b.x + b.w / 2, b.y + 24, 22, "#1f5d57", "700");
    text(c, "Afdeling Vossenwelzijn · VRT", b.x + b.w / 2, b.y + 44, 9.5, "#3b6f69", "500");
  }
}

// The R3 sheet: door signs for de perszaal, het creative lab and het
// Tiktak-huis; the roll-up banner; for Tik Tak the
// sheep, the clock, the striped curtains in the arches, the red roof and a box.
function r3Sheet(c: Ctx) {
  const K = R3_PX;
  const box = (k: keyof typeof K) => { const [x0, y0, x1, y1] = K[k]; return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  c.clearRect(0, 0, S, S);
  for (const [k, t, edge] of [
    ["pers", "PERSZAAL", "#e8326e"], ["persFr", "SALLE DE PRESSE", "#1a64c8"],
    ["lab", "CREATIVE LAB", "#7b4fd6"], ["labFr", "CREATIVE LAB", "#1a64c8"],
    ["tiktak", "TIK TAK", "#e2a21d"], ["tiktakFr", "TIC TAC", "#1a64c8"],
  ] as const) {
    const b = box(k);
    fillRect(c, b.x, b.y, b.w, b.h, "#2b2d31");
    fillRect(c, b.x, b.y, 7, b.h, edge);
    text(c, t, b.x + 68, b.y + 33, t.length > 11 ? 11 : t.length > 8 ? 14 : 17, "#f5f5f5", "700");
  }
  // a Tik Tak box: dark blue, the yellow title
  {
    const b = box("box");
    fillRect(c, b.x, b.y, b.w, b.h, "#2a2f9a");
    c.fillStyle = "#4a52d8";
    c.beginPath(); c.arc(b.x + 96, b.y + 18, 26, 0, 7); c.fill();
    text(c, "TIK", b.x + 40, b.y + 26, 24, "#ffd21a", "900");
    text(c, "TAK", b.x + 84, b.y + 46, 24, "#ffd21a", "900");
  }
  // the roll-up banner in de perszaal: white, the logo in a green circle (drawn for 0.85 x 2 m)
  {
    const b = box("rollup");
    aspect(c, 0.85 / 2.0, (w, h) => {
      fillRect(c, 0, 0, w, h, "#f4f5f2");
      c.fillStyle = "#5fd13a";
      c.beginPath(); c.arc(w * 0.62, h * 0.25, w * 0.3, 0, 7); c.fill();
      text(c, "vrt", w * 0.62, h * 0.255, w * 0.24, "#fff", "700");
      fillRect(c, 0, h * 0.94, w, h * 0.06, "#d9dbd6");
    }, b.x, b.y, b.w, b.h);
  }
  // the sheep, cut out of cardboard: a cloud of wool, the head, two legs
  for (const [k, head] of [["sheep", "#8f8f8c"], ["sheepBlack", "#222"]] as const) {
    const b = box(k);
    c.save();
    c.translate(b.x, b.y);
    c.fillStyle = "#4a4643";
    c.fillRect(150, 92, 16, 34);
    c.fillStyle = head;
    c.fillRect(72, 92, 16, 34);
    c.fillStyle = "#b8b6b1";
    c.beginPath(); c.ellipse(140, 64, 82, 40, 0, 0, 7); c.fill();
    for (let n = 0; n < 22; n++) {
      const a = (n / 22) * Math.PI * 2;
      c.fillStyle = n % 2 ? "#c9c7c2" : "#d6d4cf";
      c.beginPath(); c.arc(140 + Math.cos(a) * 70, 64 + Math.sin(a) * 32, 15, 0, 7); c.fill();
    }
    c.fillStyle = "#d9d7d2";
    c.beginPath(); c.ellipse(140, 62, 70, 30, 0, 0, 7); c.fill();
    c.strokeStyle = "#c3c1bc"; c.lineWidth = 2;
    for (let n = 0; n < 16; n++) { c.beginPath(); c.arc(90 + (n % 8) * 15, 50 + Math.floor(n / 8) * 22, 7, 0, 7); c.stroke(); }
    // the head, pointing down to the grass
    c.fillStyle = head;
    c.beginPath(); c.moveTo(78, 40); c.quadraticCurveTo(30, 52, 12, 92); c.quadraticCurveTo(26, 100, 44, 88); c.quadraticCurveTo(66, 74, 86, 66); c.closePath(); c.fill();
    c.beginPath(); c.ellipse(70, 46, 16, 7, -0.5, 0, 7); c.fill();
    c.fillStyle = "#111"; c.beginPath(); c.arc(42, 66, 3, 0, 7); c.fill();
    c.restore();
  }
  // the clock on the tower: a black flower of four round petals, a cardboard middle
  {
    const b = box("clock");
    const cx = b.x + 64, cy = b.y + 64;
    fillRect(c, b.x, b.y, b.w, b.h, "#cf9a54");
    c.fillStyle = "#f0e9dc"; c.beginPath(); c.arc(cx, cy, 58, 0, 7); c.fill();
    c.strokeStyle = "#111"; c.lineWidth = 3; c.stroke();
    c.fillStyle = "#111";
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      c.beginPath(); c.arc(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, 22, 0, 7); c.fill();
    }
    c.fillStyle = "#d8b27c"; c.beginPath(); c.arc(cx, cy, 20, 0, 7); c.fill();
    noise(c, 10, true, b.x, b.y, b.w, b.h);
  }
  // a doorway: an arch with green and yellow stripes, a dark cut edge, nothing around it
  {
    const b = box("curtain");
    c.save();
    c.beginPath();
    c.moveTo(b.x + 4, b.y + b.h);
    c.lineTo(b.x + 4, b.y + 64);
    c.arc(b.x + 64, b.y + 64, 60, Math.PI, 0);
    c.lineTo(b.x + 124, b.y + b.h);
    c.closePath();
    c.fillStyle = "#3b4a25";
    c.fill();
    c.clip();
    for (let x = 0; x < 128; x += 14) {
      fillRect(c, b.x + x + 8, b.y, 7, b.h, "#2f6a2c");
      fillRect(c, b.x + x + 15, b.y, 7, b.h, "#b8c46a");
    }
    c.strokeStyle = "#3a2f22"; c.lineWidth = 8; c.stroke();
    c.restore();
  }
  // the roof: red, ribbed
  {
    const b = box("roof");
    fillRect(c, b.x, b.y, b.w, b.h, "#d9452c");
    for (let x = 0; x < b.w; x += 12) {
      fillRect(c, b.x + x, b.y, 3, b.h, "#b8331f");
      fillRect(c, b.x + x + 3, b.y, 1, b.h, "#ee6a50");
    }
    noise(c, 8, true, b.x, b.y, b.w, b.h);
  }
}

// The LED wall of de journaalstudio: Brussels at dusk in blue, plain blue below.
// Tiles across: the skyline wraps.
function skyline(c: Ctx) {
  const g = c.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, "#0d2f86");
  g.addColorStop(0.35, "#3477d8");
  g.addColorStop(0.55, "#8cc2f2");
  g.addColorStop(0.58, "#4f8fe0");
  g.addColorStop(1, "#1a4cc0");
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  // thin clouds
  for (let i = 0; i < 9; i++) {
    const x = R() * S, y = 60 + R() * 170, w = 60 + R() * 110;
    for (const ox of [-S, 0, S]) {
      c.fillStyle = `rgba(220,235,255,${0.12 + R() * 0.12})`;
      c.beginPath(); c.ellipse(x + ox, y, w, 6 + R() * 6, 0, 0, 7); c.fill();
    }
  }
  // the city: rows of blocks, further ones paler, lit windows
  const H0 = S * 0.56;
  for (const [far, col, hmin, hmax] of [[1, "#6d9fe0", 6, 26], [0, "#3a6cc4", 8, 44]] as const) {
    let x = 0;
    while (x < S) {
      const w = 6 + R() * 18, h = hmin + R() * (hmax - hmin);
      c.fillStyle = col;
      c.fillRect(x, H0 - h + far * 6, w, h + 80);
      if (!far) for (let wy = H0 - h + 4; wy < H0 + 60; wy += 5) for (let wx = x + 2; wx < x + w - 2; wx += 4) if (R() < 0.3) fillRect(c, wx, wy, 2, 2, R() < 0.5 ? "#ffe9b0" : "#cfe6ff");
      x += w;
    }
  }
  // the Reyers tower on the left, the Atomium on the right
  c.fillStyle = "#2c5bb0";
  fillRect(c, 96, H0 - 120, 6, 120, "#2c5bb0");
  c.beginPath(); c.ellipse(99, H0 - 100, 16, 5, 0, 0, 7); c.fill();
  fillRect(c, 98, H0 - 150, 2, 30, "#2c5bb0");
  for (const [ax, ay] of [[380, H0 - 64], [368, H0 - 50], [392, H0 - 50], [380, H0 - 36], [370, H0 - 62], [390, H0 - 62]]) { c.beginPath(); c.arc(ax!, ay!, 5, 0, 7); c.fill(); }
  fillRect(c, 379, H0 - 64, 2, 64, "#2c5bb0");
  // the ground below the city, then the plain lower half of the screens
  fillRect(c, 0, H0 + 40, S, S - H0 - 40, "#2457c8");
  const g2 = c.createLinearGradient(0, H0 + 40, 0, S);
  g2.addColorStop(0, "rgba(120,180,255,0.35)");
  g2.addColorStop(1, "rgba(10,30,120,0.4)");
  c.fillStyle = g2;
  c.fillRect(0, H0 + 40, S, S - H0 - 40);
  // the seams between the LED tiles
  c.fillStyle = "rgba(0,8,30,0.35)";
  for (let k = 0; k < S; k += 64) {
    c.fillRect(k, 0, 1.5, S);
    c.fillRect(0, k, S, 1.5);
  }
}

// whiteboard: wiped a hundred times, never quite clean (the top 512 x 320 of the layer)
function boardBase(c: Ctx) {
  fillRect(c, 0, 0, S, 320, "#f4f5f3");
  noise(c, 5, true, 0, 0, S, 320);
  c.save();
  c.globalAlpha = 0.14;
  c.fillStyle = "#556";
  for (let i = 0; i < 18; i++) c.fillRect(R() * S, R() * 300, 50 + R() * 120, 3 + R() * 6);
  c.restore();
}

// a post-it, a little crooked, a ticket number and a few scribbles on it
function postit(c: Ctx, x: number, y: number, col: string, id: string, w = 44, h = 38) {
  c.save();
  c.translate(x + w / 2, y + h / 2);
  c.rotate((R() - 0.5) * 0.14);
  c.fillStyle = "rgba(0,0,0,0.12)";
  c.fillRect(-w / 2 + 2, -h / 2 + 2, w, h);
  c.fillStyle = col;
  c.fillRect(-w / 2, -h / 2, w, h);
  text(c, id, -w / 2 + 3, -h / 2 + 7, 7, "#333", "700", "left", MARKER);
  c.strokeStyle = "#444";
  c.lineWidth = 1.3;
  for (let k = 0; k < 2 + ((R() * 2) | 0); k++) {
    c.beginPath();
    c.moveTo(-w / 2 + 4, -h / 2 + 16 + k * 6);
    for (let x2 = -w / 2 + 4; x2 < w / 2 - 4 - R() * 12; x2 += 3) c.lineTo(x2, -h / 2 + 16 + k * 6 + (R() - 0.5) * 2.4);
    c.stroke();
  }
  c.restore();
}

const POSTIT = ["#ffe066", "#ff9fbf", "#a6eb9b", "#9bd8ff", "#ffbe6b"];

function sprintBoard(c: Ctx) {
  boardBase(c);
  const blue = "#1b3fa0", red = "#b01818";
  text(c, "SPRINT 214 · VRT MAX", 16, 22, 24, blue, "600", "left", MARKER);
  text(c, "doel: ondertitels nooit meer te laat", 18, 46, 15, red, "500", "left", MARKER);
  const cols = ["TE DOEN", "BEZIG", "REVIEW", "KLAAR"];
  const cw = (S - 20) / 4;
  c.strokeStyle = "#222";
  c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(10, 78); c.lineTo(S - 10, 80); c.stroke();
  cols.forEach((t, k) => {
    const x = 10 + k * cw;
    text(c, t, x + cw / 2, 68, 15, "#222", "600", "center", MARKER);
    if (k) { c.beginPath(); c.moveTo(x, 58); c.lineTo(x + (R() - 0.5) * 3, 296); c.stroke(); }
  });
  const n = [6, 4, 3, 8];
  let id = 1401;
  n.forEach((m, k) => {
    for (let j = 0; j < m; j++) {
      const x = 14 + k * cw + (j % 2) * 58 + (R() - 0.5) * 6, y = 88 + Math.floor(j / 2) * 50 + (R() - 0.5) * 6;
      postit(c, x, y, POSTIT[(k * 3 + j) % POSTIT.length]!, `DPC-${id + ((j * 37 + k * 11) % 90)}`);
      // whoever's on it
      if (k === 1 || k === 2) {
        c.fillStyle = ["#e33", "#36c", "#3a3", "#c6c"][j % 4]!;
        c.beginPath(); c.arc(x + 42, y + 4, 6, 0, 7); c.fill();
        text(c, ["TB", "JV", "SM", "KD"][j % 4]!, x + 42, y + 4, 6, "#fff", "700");
      }
      if (k === 3) {
        // done: ticked off
        c.strokeStyle = "#1a8a2a"; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x + 30, y + 26); c.lineTo(x + 35, y + 32); c.lineTo(x + 44, y + 18); c.stroke();
        c.strokeStyle = "#222"; c.lineWidth = 2.5;
      }
    }
  });
  text(c, "!!", 10 + cw + cw / 2 + 52, 90, 20, red, "700", "center", MARKER);
  text(c, "stand-up 9u30 · demo vrijdag", 16, 306, 14, blue, "500", "left", MARKER);
}

function burndownBoard(c: Ctx) {
  boardBase(c);
  const blue = "#1b3fa0", red = "#b01818", ink = "#222";
  text(c, "BURNDOWN 214", 16, 22, 22, blue, "600", "left", MARKER);
  // the chart
  const x0 = 34, y0 = 270, w = 270, h = 210;
  c.strokeStyle = ink; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(x0, y0 - h); c.lineTo(x0, y0); c.lineTo(x0 + w, y0); c.stroke();
  for (let d = 0; d <= 10; d++) text(c, String(d), x0 + (w * d) / 10, y0 + 12, 10, ink, "500", "center", MARKER);
  text(c, "punten", x0 - 4, y0 - h - 8, 10, ink, "500", "left", MARKER);
  c.setLineDash([6, 6]); c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(x0, y0 - h + 10); c.lineTo(x0 + w, y0); c.stroke();
  c.setLineDash([]);
  // points left per day: slow, a bump when the scope grew, today far above the line
  const pts = [200, 196, 188, 188, 196, 171, 166, 160];
  const py = (v: number) => y0 - (v / 200) * (h - 10);
  c.strokeStyle = blue; c.lineWidth = 3;
  c.beginPath();
  pts.forEach((v, d) => c.lineTo(x0 + (w * d) / 10, py(v)));
  c.stroke();
  c.fillStyle = red;
  c.beginPath(); c.arc(x0 + (w * 7) / 10, py(160), 5, 0, 7); c.fill();
  text(c, "vandaag", x0 + (w * 7) / 10 + 8, py(160) - 10, 12, red, "500", "left", MARKER);
  text(c, "scope creep!", x0 + 120, y0 - h + 2, 14, red, "600", "left", MARKER);
  c.strokeStyle = red; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x0 + 140, y0 - h + 10); c.lineTo(x0 + (w * 4) / 10 + 3, py(196) - 5); c.stroke();
  // the retro
  const rx = 330;
  c.strokeStyle = ink; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(rx - 10, 12); c.lineTo(rx - 12, 300); c.stroke();
  text(c, "RETRO", rx, 22, 20, blue, "600", "left", MARKER);
  [["goed", "#a6eb9b"], ["beter", "#ffbe6b"], ["acties", "#9bd8ff"]].forEach(([t, col], k) => {
    const y = 48 + k * 80;
    text(c, t!, rx, y, 14, ink, "600", "left", MARKER);
    for (let j = 0; j < 3 - (k === 2 ? 1 : 0); j++) postit(c, rx + j * 54 + (R() - 0.5) * 4, y + 10, col!, "", 46, 36);
  });
  text(c, "velocity 34 · 41 · 29 · ?", rx, 300, 13, blue, "500", "left", MARKER);
}

// the posters on the walls of het DPC, three to a layer, under the board
function dpcPosters(c: Ctx, first: number) {
  const draw: ((x: number, y: number, w: number, h: number) => void)[] = [
    (x, y, w, h) => {
      fillRect(c, x, y, w, h, "#111");
      text(c, "IT WORKS", x + w / 2, y + 40, 22, "#fff", "900");
      text(c, "ON MY", x + w / 2, y + 66, 22, "#fff", "900");
      text(c, "MACHINE", x + w / 2, y + 92, 22, "#fff", "900");
      c.fillStyle = "#2fb84f";
      c.beginPath(); c.arc(x + w / 2, y + 145, 28, 0, 7); c.fill();
      c.strokeStyle = "#fff"; c.lineWidth = 6;
      c.beginPath(); c.moveTo(x + w / 2 - 13, y + 145); c.lineTo(x + w / 2 - 3, y + 156); c.lineTo(x + w / 2 + 15, y + 133); c.stroke();
    },
    (x, y, w, h) => {
      fillRect(c, x, y, w, h, "#1a4fa8");
      c.fillStyle = "#fff";
      c.beginPath(); c.moveTo(x + w / 2, y + 22); c.lineTo(x + w / 2 + 34, y + 52); c.lineTo(x + w / 2 - 34, y + 52); c.closePath(); c.fill();
      c.fillRect(x + w / 2 - 24, y + 52, 48, 34);
      fillRect(c, x + w / 2 - 6, y + 66, 12, 20, "#1a4fa8");
      text(c, "THERE'S NO", x + w / 2, y + 110, 16, "#fff", "800");
      text(c, "PLACE LIKE", x + w / 2, y + 130, 16, "#fff", "800");
      text(c, "127.0.0.1", x + w / 2, y + 160, 24, "#ffd84a", "800", "center", "ui-monospace, Menlo, monospace");
    },
    (x, y, w, h) => {
      fillRect(c, x, y, w, h, "#ffd200");
      // a rocket (a deploy), crossed out
      const rx = x + w / 2, ry = y + 62;
      c.fillStyle = "#111";
      c.beginPath(); c.moveTo(rx, ry - 30); c.quadraticCurveTo(rx + 13, ry - 12, rx + 10, ry + 16); c.lineTo(rx - 10, ry + 16); c.quadraticCurveTo(rx - 13, ry - 12, rx, ry - 30); c.fill();
      c.beginPath(); c.moveTo(rx - 10, ry + 2); c.lineTo(rx - 20, ry + 22); c.lineTo(rx - 10, ry + 16); c.fill();
      c.beginPath(); c.moveTo(rx + 10, ry + 2); c.lineTo(rx + 20, ry + 22); c.lineTo(rx + 10, ry + 16); c.fill();
      c.fillStyle = "#e85d04";
      c.beginPath(); c.moveTo(rx - 6, ry + 18); c.lineTo(rx, ry + 32); c.lineTo(rx + 6, ry + 18); c.fill();
      c.strokeStyle = "#c00"; c.lineWidth = 7;
      c.beginPath(); c.arc(rx, ry, 40, 0, 7); c.stroke();
      c.beginPath(); c.moveTo(rx - 28, ry - 28); c.lineTo(rx + 28, ry + 28); c.stroke();
      text(c, "NOOIT", x + w / 2, y + 124, 20, "#111", "900");
      text(c, "DEPLOYEN", x + w / 2, y + 146, 20, "#111", "900");
      text(c, "OP VRIJDAG", x + w / 2, y + 168, 20, "#c00", "900");
    },
    (x, y, w, h) => {
      fillRect(c, x, y, w, h, "#8fd0f5");
      c.fillStyle = "#fff";
      for (const [ox, oy, r] of [[-26, 58, 22], [0, 46, 30], [28, 58, 22]] as const) { c.beginPath(); c.arc(x + w / 2 + ox, y + oy, r, 0, 7); c.fill(); }
      c.fillRect(x + w / 2 - 48, y + 58, 96, 22);
      text(c, "DE CLOUD IS", x + w / 2, y + 110, 15, "#123", "800");
      text(c, "GEWOON DE", x + w / 2, y + 130, 15, "#123", "800");
      text(c, "COMPUTER VAN", x + w / 2, y + 150, 15, "#123", "800");
      text(c, "IEMAND ANDERS", x + w / 2, y + 170, 15, "#123", "800");
    },
    (x, y, w, h) => {
      fillRect(c, x, y, w, h, "#eee8d8");
      text(c, "RTFM", x + w / 2, y + 74, 58, "#c00", "900");
      fillRect(c, x + 22, y + 108, w - 44, 3, "#222");
      text(c, "lees eerst de", x + w / 2, y + 134, 15, "#222", "600");
      text(c, "handleiding", x + w / 2, y + 154, 15, "#222", "600");
    },
    (x, y, w, h) => {
      fillRect(c, x, y, w, h, "#222a33");
      c.strokeStyle = "#5fe07c"; c.lineWidth = 7;
      c.beginPath(); c.arc(x + w / 2, y + 60, 30, -1.1, 4.25); c.stroke();
      c.beginPath(); c.moveTo(x + w / 2, y + 22); c.lineTo(x + w / 2, y + 58); c.stroke();
      text(c, "AL GEPROBEERD", x + w / 2, y + 116, 15, "#fff", "800");
      text(c, "UIT EN WEER", x + w / 2, y + 138, 15, "#fff", "800");
      text(c, "AAN TE ZETTEN?", x + w / 2, y + 160, 15, "#fff", "800");
    },
  ];
  for (let k = 0; k < 3; k++) {
    const x = k * 171, y = 320, w = 170, h = 192;
    c.save();
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    draw[first + k]!(x, y, w, h);
    c.restore();
    noise(c, 8, true, x, y, w, h);
  }
}

export function makeTextureArray(
  renderer: THREE.WebGLRenderer, art: (HTMLImageElement | null)[], logos: Partial<Record<LogoName, HTMLImageElement | null>>, size = S,
): THREE.DataArrayTexture {
  IMG = logos;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const c = canvas.getContext("2d", { willReadFrequently: true })!;
  const small = document.createElement("canvas");
  small.width = small.height = size;
  const sc = small.getContext("2d", { willReadFrequently: true })!;
  const data = new Uint8Array(size * size * 4 * LAYER_COUNT);
  for (let l = 0; l < LAYER_COUNT; l++) {
    c.save();
    c.globalAlpha = 1;
    c.clearRect(0, 0, S, S);
    c.fillStyle = "#fff";
    c.fillRect(0, 0, S, S);
    const p = painters[l];
    if (p) p(c);
    else if (l >= ART0 && l < LABEL0) {
      const img = art[l - ART0];
      if (img) c.drawImage(img, 0, 0, S, S);
      else fill(c, "#777");
    } else if (l >= LABEL0) labels(c, (l - LABEL0) * 8);
    c.restore();
    let img: Uint8ClampedArray;
    if (size !== S) {
      sc.clearRect(0, 0, size, size);
      sc.drawImage(canvas, 0, 0, size, size);
      img = sc.getImageData(0, 0, size, size).data;
    } else img = c.getImageData(0, 0, S, S).data;
    // flip rows so v = 0 is the bottom of the drawing
    const base = l * size * size * 4;
    for (let y = 0; y < size; y++) data.set(img.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), base + y * size * 4);
  }
  const tex = new THREE.DataArrayTexture(data, size, size, LAYER_COUNT);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}
