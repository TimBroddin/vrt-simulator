// Camcorder stills: grab the rendered frame, stamp the OSD on it, save as PNG.
export interface PhotoInfo {
  hud: boolean;
  tc: string;
  floor: string;
  loc: string;
}

export async function takePhoto(src: HTMLCanvasElement, info: PhotoInfo) {
  const w = src.width, h = src.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  if (info.hud) {
    const k = h / 720;
    const m = 28 * k, b = 34 * k;
    g.strokeStyle = "rgba(255,255,255,0.8)";
    g.lineWidth = 2 * k;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]] as const) {
      g.beginPath();
      g.moveTo(x, y + sy * b);
      g.lineTo(x, y);
      g.lineTo(x + sx * b, y);
      g.stroke();
    }
    const font = (px: number, weight = "600") => `${weight} ${px * k}px "SF Mono", ui-monospace, Menlo, monospace`;
    g.shadowColor = "#000";
    g.shadowBlur = 3 * k;
    g.textBaseline = "middle";
    g.font = font(15);
    g.fillStyle = "#ff2a1a";
    g.fillText("●", 52 * k, 52 * k);
    g.fillStyle = "#f4f4f0";
    g.fillText(`REC  ${info.tc}`, 72 * k, 52 * k);
    g.textAlign = "right";
    g.fillText("REYERSLAAN 52", w - 52 * k, 58 * k);
    const lw = g.measureText("REYERSLAAN 52").width;
    g.shadowBlur = 0;
    g.fillStyle = "#ff2e7e";
    const cx = w - 52 * k - lw - 25 * k, cy = 58 * k, r = 15 * k;
    g.beginPath();
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r, cy - r);
    g.lineTo(cx + r, cy);
    g.arc(cx, cy, r, 0, Math.PI * 1.5);
    g.fill();
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.font = `700 ${13 * k}px "Helvetica Neue", Arial, sans-serif`;
    g.fillText("vrt", cx, cy + 1 * k);
    g.shadowBlur = 3 * k;
    g.textAlign = "left";
    g.fillStyle = "#f4f4f0";
    g.font = font(18);
    g.fillText(info.floor, 52 * k, h - 76 * k);
    g.font = font(15);
    g.globalAlpha = 0.75;
    g.fillText(info.loc, 52 * k, h - 52 * k);
    g.globalAlpha = 1;
  }
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
  if (!blob) return;
  const name = `vrt-simulator-${info.floor.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}.png`;
  const file = new File([blob], name, { type: "image/png" });
  // phones: share sheet (save to photos); desktop: download
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "VRT Simulator" });
      return;
    } catch {
      /* fall back to download */
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
