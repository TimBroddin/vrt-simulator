// One canvas drives every LED clock in the building: real local time, blinking colon.
import * as THREE from "three";

export class ClockFace {
  canvas = document.createElement("canvas");
  tex: THREE.CanvasTexture;
  private last = "";

  constructor() {
    this.canvas.width = 256;
    this.canvas.height = 96;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.flipY = true;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.update(true);
  }

  update(force = false) {
    const d = new Date();
    const colon = d.getMilliseconds() < 500;
    const txt = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    const key = txt + colon;
    if (key === this.last && !force) return;
    this.last = key;
    const g = this.canvas.getContext("2d")!;
    g.fillStyle = "#050303";
    g.fillRect(0, 0, 256, 96);
    g.font = "700 72px 'DS-Digital', 'SF Mono', ui-monospace, Menlo, monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    // unlit segments, then the lit digits
    g.fillStyle = "rgba(255,40,20,0.08)";
    g.fillText("88:88", 128, 52);
    g.fillStyle = "#ff2a14";
    g.shadowColor = "#ff2a14";
    g.shadowBlur = 10;
    g.fillText(colon ? txt : txt.replace(":", " "), 128, 52);
    g.shadowBlur = 0;
    this.tex.needsUpdate = true;
  }
}
