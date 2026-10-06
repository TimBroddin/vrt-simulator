// The ticket dashboards in het DPC: one canvas drives every screen, 2 x 2 panels
// (the tickets, the incidents, the status of the services, the sprint). Tickets
// come in, services go red, someone closes something. Only redrawn while you're
// near one.
import * as THREE from "three";

const W = 1024, H = 592, PW = W / 2, PH = H / 2;
const MONO = `"SF Mono", ui-monospace, Menlo, Consolas, monospace`;
const SANS = `"Helvetica Neue", Helvetica, Arial, sans-serif`;

const TITLES = [
  "VRT MAX: ondertitels lopen 3 s achter",
  "Thuis: aflevering 6000 laadt niet",
  "Karrewiet-feed toont nieuws uit 1997",
  "Koffiemachine: HTTP 418 I'm a teapot",
  "Printer gang B3: PC LOAD LETTER",
  "Prompter studio 5 toont lorem ipsum",
  "SSO-login Sporza draait in een lus",
  "Wifi in de middengang valt weg",
  "Radio 2: jingle speelt twee keer",
  "Tijdloze: stemknop doet niets",
  "Ketnet-app bevriest bij Ketnetband",
  "Wachtwoord vergeten (alweer)",
  "Teletekst p. 888 is leeg",
  "Lift B blijft hangen op verdieping 7",
  "Badge van Karen werkt niet",
  "VPN: 'het internet is weg'",
  "Deploy van vrijdag 17u terugdraaien",
  "Klara-stream ruist",
  "MNM-playlist: enkel Peter Van de Veire",
  "Iemand zit vast in de gang naar nergens",
  "Excel met de planning is corrupt",
  "Grafana toont dit dashboard",
  "Pop van de vakbond in het serverlokaal",
  "Certificaat vervalt vandaag",
  "Ondertitels staan in het Klingon",
  "Het weerbericht staat op 19:00",
];
const SERVICES = ["VRT MAX", "VRT NWS", "Sporza", "Ketnet", "Radio 1", "Radio 2", "Klara", "StuBru", "MNM", "VRT-profiel", "Ondertitels", "CDN"];
const WHO = ["TB", "JV", "SM", "KD", "AL", "FV", "NP", "EH"];
const WHO_COL = ["#e5484d", "#3e63dd", "#30a46c", "#8e4ec6", "#f76b15", "#12a594", "#d6409f", "#978365"];
const PRIO = ["", "#ff4d4f", "#ff9f1a", "#e6c700", "#5b8cff"];
const STATE = ["OK", "TRAAG", "STORING"];
const STATE_COL = ["#3fb950", "#d29922", "#f85149"];

interface Ticket {
  id: number;
  p: number;
  title: string;
  status: string;
  who: number;
  at: number; // when it came in (s)
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[(Math.random() * a.length) | 0]!;

export class Dashboard {
  canvas = document.createElement("canvas");
  tex: THREE.CanvasTexture;
  active = false; // someone is near a screen
  private g: CanvasRenderingContext2D;
  private t = 0;
  private redraw = 0;
  private nextTicket = 4;
  private nextMove = 3;
  private nextFlip = 20;
  private seq = 1480;
  private tickets: Ticket[] = [];
  private open = 137;
  private doing = 23;
  private blocked = 4;
  private done = 12;
  private hist: number[] = [];
  private lat: number[] = [];
  private state = SERVICES.map(() => 0);
  private calm = 95; // seconds without an incident (one "day" is half a minute here)
  private build = 48213;
  private buildOk = true;
  private deploys = 9;

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.flipY = true;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.generateMipmaps = true;
    for (let k = 0; k < 7; k++) this.ticket(-k * 40 - rnd(0, 30), k < 2 ? 0 : 0.7);
    for (let k = 0; k < 60; k++) this.hist.push(this.open + Math.round(Math.sin(k * 0.3) * 6 + rnd(-3, 3)));
    for (let k = 0; k < 90; k++) this.lat.push(rnd(80, 140));
    this.draw();
  }

  private ticket(at: number, oldP = 0) {
    const p = Math.random() < 0.12 ? 1 : Math.random() < 0.35 ? 2 : Math.random() < 0.6 ? 3 : 4;
    this.tickets.unshift({ id: this.seq++, p, title: pick(TITLES), status: Math.random() < oldP ? pick(["BEZIG", "WACHT", "BEZIG"]) : "NIEUW", who: (Math.random() * WHO.length) | 0, at });
    this.tickets.length = Math.min(this.tickets.length, 7);
  }

  update(dt: number) {
    this.t += dt;
    if (!this.active) return;
    this.calm += dt;
    if ((this.nextTicket -= dt) <= 0) {
      this.nextTicket = rnd(5, 13);
      this.ticket(this.t);
      this.open++;
    }
    if ((this.nextMove -= dt) <= 0) {
      // someone picks one up, someone closes one, sometimes it's stuck
      this.nextMove = rnd(2.5, 7);
      const r = Math.random();
      if (r < 0.4 && this.open > 90) { this.open--; this.doing++; }
      else if (r < 0.8 && this.doing > 8) { this.doing--; this.done++; this.open -= Math.random() < 0.3 ? 1 : 0; }
      else if (r < 0.9) this.blocked = Math.max(1, this.blocked + (Math.random() < 0.5 ? 1 : -1));
      else { this.deploys++; this.build++; this.buildOk = Math.random() < 0.8; }
      const tk = this.tickets.find((x) => x.status !== "OPGELOST" && this.t - x.at > 6);
      if (tk) tk.status = tk.status === "NIEUW" ? "BEZIG" : tk.status === "BEZIG" ? pick(["OPGELOST", "WACHT", "OPGELOST"]) : "BEZIG";
    }
    if ((this.nextFlip -= dt) <= 0) {
      // a service gets slow, or goes down (and that's an incident), or recovers
      this.nextFlip = rnd(12, 30);
      const k = (Math.random() * SERVICES.length) | 0;
      const was = this.state[k]!;
      const now = was ? 0 : Math.random() < 0.3 ? 2 : 1;
      this.state[k] = now;
      if (now === 2) {
        this.calm = 0;
        this.tickets.unshift({ id: this.seq++, p: 1, title: `Storing: ${SERVICES[k]} onbereikbaar`, status: "NIEUW", who: (Math.random() * WHO.length) | 0, at: this.t });
        this.tickets.length = Math.min(this.tickets.length, 7);
        this.open++;
      }
    }
    if ((this.redraw -= dt) > 0) return;
    this.redraw = 0.5;
    this.hist.push(this.open);
    if (this.hist.length > 60) this.hist.shift();
    const bad = this.state.reduce((a, s) => a + s, 0);
    this.lat.push(rnd(70, 130) + bad * rnd(30, 90) + (Math.random() < 0.05 ? 220 : 0));
    if (this.lat.length > 90) this.lat.shift();
    this.draw();
  }

  // --- drawing
  private text(t: string, x: number, y: number, size: number, col: string, weight = "600", align: CanvasTextAlign = "left", font = SANS) {
    const g = this.g;
    g.fillStyle = col;
    g.font = `${weight} ${size}px ${font}`;
    g.textAlign = align;
    g.textBaseline = "middle";
    g.fillText(t, x, y);
  }

  private panel(px: number, py: number, title: string, accent: string) {
    const g = this.g;
    g.fillStyle = "#0d1117";
    g.fillRect(px, py, PW, PH);
    g.fillStyle = "#161b22";
    g.fillRect(px, py, PW, 36);
    g.fillStyle = accent;
    g.fillRect(px, py, 6, 36);
    this.text(title, px + 18, py + 19, 17, "#e6edf3", "700");
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    this.text(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`, px + PW - 14, py + 19, 14, "#8b949e", "500", "right", MONO);
    g.strokeStyle = "#000";
    g.lineWidth = 4;
    g.strokeRect(px, py, PW, PH);
  }

  private spark(vals: number[], x: number, y: number, w: number, h: number, col: string, lo?: number, hi?: number) {
    const g = this.g;
    const mn = lo ?? Math.min(...vals) - 2, mx = hi ?? Math.max(...vals) + 2;
    const at = (k: number) => [x + (w * k) / (vals.length - 1), y + h - ((vals[k]! - mn) / (mx - mn || 1)) * h] as const;
    g.beginPath();
    g.moveTo(x, y + h);
    vals.forEach((_, k) => g.lineTo(...at(k)));
    g.lineTo(x + w, y + h);
    g.closePath();
    g.fillStyle = col + "33";
    g.fill();
    g.beginPath();
    vals.forEach((_, k) => g.lineTo(...at(k)));
    g.strokeStyle = col;
    g.lineWidth = 2.5;
    g.stroke();
  }

  private draw() {
    const g = this.g;
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);

    // the tickets: four big numbers, the open ones over time
    this.panel(0, 0, "SERVICE DESK · TICKETS", "#3e63dd");
    const tiles: [string, number, string][] = [["OPEN", this.open, "#58a6ff"], ["BEZIG", this.doing, "#e3b341"], ["GEBLOKKEERD", this.blocked, "#f85149"], ["KLAAR VANDAAG", this.done, "#3fb950"]];
    tiles.forEach(([l, n, col], k) => {
      const x = 12 + k * 124, y = 48;
      g.fillStyle = "#161b22";
      g.fillRect(x, y, 116, 110);
      g.fillStyle = col;
      g.fillRect(x, y + 106, 116, 4);
      this.text(String(n), x + 58, y + 52, 50, col, "800", "center");
      this.text(l, x + 58, y + 92, 12, "#8b949e", "700", "center");
    });
    this.text("open tickets · laatste 30 min", 14, 178, 12, "#8b949e", "600");
    this.spark(this.hist, 14, 190, PW - 28, 92, "#58a6ff");

    // the incidents: the newest on top, flashing as it comes in
    const ix = PW;
    this.panel(ix, 0, "INCIDENTEN · LIVE", "#f85149");
    this.tickets.forEach((tk, k) => {
      const y = 44 + k * 35;
      const fresh = this.t - tk.at < 3 && Math.floor(this.t * 4) % 2 === 0;
      g.fillStyle = fresh ? "#3d1d20" : k % 2 ? "#0d1117" : "#11161d";
      g.fillRect(ix + 4, y, PW - 8, 33);
      g.fillStyle = PRIO[tk.p]!;
      g.fillRect(ix + 10, y + 8, 30, 18);
      this.text(`P${tk.p}`, ix + 25, y + 17, 12, "#0d1117", "800", "center");
      this.text(`DPC-${tk.id}`, ix + 48, y + 17, 12, "#8b949e", "600", "left", MONO);
      const title = tk.title.length > 33 ? tk.title.slice(0, 32) + "…" : tk.title;
      this.text(title, ix + 122, y + 17, 13, tk.status === "OPGELOST" ? "#6e7681" : "#e6edf3", "600");
      const sc = tk.status === "NIEUW" ? "#58a6ff" : tk.status === "BEZIG" ? "#e3b341" : tk.status === "WACHT" ? "#a371f7" : "#3fb950";
      this.text(tk.status, ix + PW - 46, y + 17, 10, sc, "800", "right");
      g.fillStyle = WHO_COL[tk.who]!;
      g.beginPath();
      g.arc(ix + PW - 24, y + 17, 11, 0, 7);
      g.fill();
      this.text(WHO[tk.who]!, ix + PW - 24, y + 17, 10, "#fff", "800", "center");
    });

    // the services: green, orange, red; the latency underneath
    const sy = PH;
    this.panel(0, sy, "STATUS · VRT DIGITAAL", "#3fb950");
    SERVICES.forEach((name, k) => {
      const x = 12 + (k % 3) * 164, y = sy + 46 + Math.floor(k / 3) * 40;
      const st = this.state[k]!;
      g.fillStyle = st ? "#1d1a12" : "#161b22";
      if (st === 2) g.fillStyle = Math.floor(this.t * 2) % 2 ? "#3d1d20" : "#2a1416";
      g.fillRect(x, y, 158, 34);
      g.fillStyle = STATE_COL[st]!;
      g.beginPath();
      g.arc(x + 16, y + 17, 7, 0, 7);
      g.fill();
      this.text(name, x + 30, y + 17, 14, "#e6edf3", "600");
      this.text(STATE[st]!, x + 150, y + 17, 10, STATE_COL[st]!, "800", "right");
    });
    this.text("p95 latency (ms)", 14, sy + 216, 12, "#8b949e", "600");
    this.text(`${Math.round(this.lat[this.lat.length - 1]!)} ms`, PW - 14, sy + 216, 12, "#e6edf3", "700", "right", MONO);
    this.spark(this.lat, 14, sy + 228, PW - 28, 56, "#3fb950", 0, 400);

    // the sprint: days without an incident (never many), the build, the deploys
    this.panel(PW, sy, "SPRINT 214 · VRT MAX", "#a371f7");
    const days = Math.floor(this.calm / 30);
    this.text("DAGEN ZONDER INCIDENT", ix + 20, sy + 60, 15, "#8b949e", "700");
    this.text(String(days), ix + 20, sy + 122, 86, days ? "#3fb950" : "#f85149", "800", "left", MONO);
    this.text("deploys vandaag", ix + 300, sy + 62, 13, "#8b949e", "600");
    this.text(String(this.deploys), ix + 300, sy + 96, 36, "#e6edf3", "800", "left", MONO);
    g.fillStyle = this.buildOk ? "#12261e" : "#3d1d20";
    g.fillRect(ix + 296, sy + 124, 200, 34);
    this.text(`build #${this.build} ${this.buildOk ? "✓ geslaagd" : "✗ gefaald"}`, ix + 306, sy + 141, 13, this.buildOk ? "#3fb950" : "#f85149", "700");
    this.text("dag 7 van 10 · 160 van 200 punten over", ix + 20, sy + 196, 13, "#8b949e", "600");
    g.fillStyle = "#161b22";
    g.fillRect(ix + 20, sy + 210, PW - 40, 16);
    g.fillStyle = "#a371f7";
    g.fillRect(ix + 20, sy + 210, (PW - 40) * 0.2, 16);
    g.fillStyle = "#f85149";
    g.fillRect(ix + 20 + (PW - 40) * 0.7, sy + 206, 3, 24);
    this.text("stand-up 9u30 · demo vrijdag · niet deployen op vrijdag", ix + 20, sy + 256, 12, "#6e7681", "600");

    this.tex.needsUpdate = true;
  }
}
