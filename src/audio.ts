// All sound is synthesised: 50 Hz mains hum, ventilation, footsteps, the lift,
// and the occasional thing happening somewhere else in the building.
export type Surface = "carpet" | "tile" | "concrete" | "stair" | "wood" | "metal" | "wet";

export interface Env {
  roof: boolean;
  garage: boolean;
  light: number; // 0..1 how lit the surroundings are (drives hum)
  wet: number; // reverb amount
}

const PA_LINES = [
  "Studio vijf, stand-by alstublieft.",
  "Het journaal begint over vijf minuten.",
  "Regie twee, we zijn live over dertig seconden.",
  "Er is nog koffie in de kantine.",
  "Terzake, iedereen naar studio drie.",
  "Dit is een test van het omroepsysteem.",
  "Gelieve niet te lopen in de gangen.",
  "Wie de lift naar verdieping dertien neemt, meldt zich aan het onthaal.",
  "Het gebouw sluit om negentien uur.",
  "Er is niemand meer in het gebouw.",
  "Studio één, de uitzending is afgelopen. Dank u wel.",
];

export class Sound {
  ctx: AudioContext | null = null;
  master!: GainNode;
  dry!: GainNode;
  wetSend!: GainNode;
  noise!: AudioBuffer;
  humGain!: GainNode;
  ventGain!: GainNode;
  windGain!: GainNode;
  windFilter!: BiquadFilterNode;
  cityGain!: GainNode;
  motorGain!: GainNode;
  muted = false;
  nextEvent = 20;
  nextPA = 70;
  t = 0;
  env: Env = { roof: false, garage: false, light: 0.5, wet: 0.3 };

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    const rev = ctx.createConvolver();
    rev.buffer = this.impulse(2.8, 2.2);
    this.wetSend = ctx.createGain();
    this.wetSend.gain.value = 0.3;
    this.wetSend.connect(rev).connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // mains hum
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.0;
    this.humGain.connect(this.dry);
    for (const [f, g, type] of [[50, 0.5, "sine"], [100, 0.35, "sine"], [150, 0.12, "sine"], [100, 0.05, "sawtooth"]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f + (Math.random() - 0.5) * 0.3;
      const gg = ctx.createGain();
      gg.gain.value = g;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      o.connect(lp).connect(gg).connect(this.humGain);
      o.start();
    }
    const hiss = this.loopNoise();
    const hbp = ctx.createBiquadFilter();
    hbp.type = "bandpass";
    hbp.frequency.value = 6000;
    hbp.Q.value = 0.7;
    const hg = ctx.createGain();
    hg.gain.value = 0.05;
    hiss.connect(hbp).connect(hg).connect(this.humGain);

    // ventilation rumble
    this.ventGain = ctx.createGain();
    this.ventGain.gain.value = 0.22;
    const vent = this.loopNoise();
    const vlp = ctx.createBiquadFilter();
    vlp.type = "lowpass";
    vlp.frequency.value = 160;
    vent.connect(vlp).connect(this.ventGain).connect(this.dry);

    // wind + distant city for the roof
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.6;
    this.loopNoise().connect(this.windFilter).connect(this.windGain).connect(this.dry);
    this.cityGain = ctx.createGain();
    this.cityGain.gain.value = 0;
    const clp = ctx.createBiquadFilter();
    clp.type = "lowpass";
    clp.frequency.value = 220;
    this.loopNoise().connect(clp).connect(this.cityGain).connect(this.dry);

    // lift motor
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    const mo = ctx.createOscillator();
    mo.type = "sawtooth";
    mo.frequency.value = 46;
    const mlp = ctx.createBiquadFilter();
    mlp.type = "lowpass";
    mlp.frequency.value = 180;
    mo.connect(mlp).connect(this.motorGain).connect(this.dry);
    mo.start();
    const mn = this.loopNoise();
    const mnl = ctx.createBiquadFilter();
    mnl.type = "lowpass";
    mnl.frequency.value = 400;
    const mng = ctx.createGain();
    mng.gain.value = 0.4;
    mn.connect(mnl).connect(mng).connect(this.motorGain);
  }

  private impulse(sec: number, decay: number) {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
        d[i] = lp * Math.pow(1 - i / n, decay) * (i < 200 ? i / 200 : 1);
      }
    }
    return b;
  }

  private loopNoise() {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    s.start(0, Math.random() * 1.5);
    return s;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
    if (m) speechSynthesis?.cancel();
  }

  setEnv(e: Env) {
    this.env = e;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const indoor = e.roof ? 0 : 1;
    this.humGain.gain.setTargetAtTime(indoor * (0.012 + e.light * 0.05), t, 0.4);
    this.ventGain.gain.setTargetAtTime(e.roof ? 0.02 : e.garage ? 0.35 : 0.2, t, 0.8);
    this.windGain.gain.setTargetAtTime(e.roof ? 0.28 : 0, t, 0.8);
    this.cityGain.gain.setTargetAtTime(e.roof ? 0.3 : 0.03, t, 0.8);
    this.wetSend.gain.setTargetAtTime(e.wet, t, 0.3);
  }

  private burst(dur: number, filterType: BiquadFilterType, freq: number, q: number, gain: number, when = 0, pan = 0, wet = 1) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(f).connect(g).connect(p);
    p.connect(this.dry);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      p.connect(w).connect(this.wetSend);
    }
    s.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, when = 0, type: OscillatorType = "sine", pan = 0, wet = 1) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p);
    p.connect(this.dry);
    const w = ctx.createGain();
    w.gain.value = wet;
    p.connect(w).connect(this.wetSend);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  footstep(s: Surface, run: boolean, vol = 1, pan = 0, wet = 1) {
    if (!this.ctx || this.muted) return;
    const v = (run ? 1.25 : 1) * vol * (0.85 + Math.random() * 0.3);
    const j = 1 + (Math.random() - 0.5) * 0.15;
    this.tone(70 * j, 0.06, 0.25 * v, 0, "sine", pan, wet * 0.3);
    switch (s) {
      case "carpet":
        this.burst(0.09, "lowpass", 420 * j, 0.7, 0.35 * v, 0, pan, wet * 0.2);
        break;
      case "tile":
        this.burst(0.07, "bandpass", 2600 * j, 1.1, 0.5 * v, 0, pan, wet);
        this.burst(0.03, "highpass", 5000, 0.7, 0.25 * v, 0.01, pan, wet);
        break;
      case "concrete":
        this.burst(0.09, "bandpass", 1300 * j, 0.8, 0.5 * v, 0, pan, wet);
        break;
      case "stair":
        this.burst(0.07, "bandpass", 1800 * j, 1.2, 0.45 * v, 0, pan, wet);
        this.tone(2400 * j, 0.05, 0.05 * v, 0.005, "triangle", pan, wet);
        break;
      case "wood":
        this.burst(0.1, "bandpass", 750 * j, 1.0, 0.5 * v, 0, pan, wet);
        break;
      case "metal":
        this.burst(0.08, "bandpass", 3200 * j, 2.0, 0.35 * v, 0, pan, wet);
        this.tone(1250 * j, 0.12, 0.03 * v, 0, "triangle", pan, wet);
        break;
      case "wet":
        this.burst(0.18, "highpass", 1600 * j, 0.5, 0.3 * v, 0, pan, wet * 0.2);
        this.burst(0.08, "bandpass", 700 * j, 1.0, 0.25 * v, 0.02, pan, wet * 0.2);
        break;
    }
  }

  ding(vol = 1, pan = 0) {
    if (!this.ctx) return;
    this.tone(1318, 1.4, 0.12 * vol, 0, "sine", pan);
    this.tone(1046, 1.8, 0.12 * vol, 0.28, "sine", pan);
  }

  doors() {
    if (!this.ctx) return;
    this.burst(0.9, "bandpass", 380, 0.9, 0.12, 0, 0, 0.3);
    this.tone(90, 0.4, 0.05, 0.6);
  }

  motor(on: boolean) {
    if (!this.ctx) return;
    this.motorGain.gain.setTargetAtTime(on ? 0.12 : 0, this.ctx.currentTime, on ? 0.6 : 0.3);
  }

  chime() {
    if (!this.ctx) return;
    [659, 523, 392].forEach((f, k) => this.tone(f, 1.6, 0.08, k * 0.45, "sine", 0, 1.5));
  }

  success() {
    if (!this.ctx) return;
    [523, 659, 784, 1046].forEach((f, k) => this.tone(f, 0.9, 0.07, k * 0.11, "triangle", 0, 0.8));
  }

  wrong() {
    if (!this.ctx) return;
    this.tone(180, 0.35, 0.08, 0, "square", 0, 0.2);
    this.tone(150, 0.45, 0.08, 0.16, "square", 0, 0.2);
  }

  scrape() {
    if (!this.ctx) return;
    this.burst(0.45, "bandpass", 900, 3, 0.25, 0, 0, 0.6);
    this.burst(0.3, "bandpass", 1500, 6, 0.1, 0.05, 0, 0.6);
  }

  creak(pan = 0) {
    if (!this.ctx) return;
    for (let i = 0; i < 8; i++) this.burst(0.09, "bandpass", 500 + Math.random() * 500, 12, 0.08, i * 0.07, pan, 2);
  }

  beep(k: number) {
    if (!this.ctx || this.muted) return;
    this.tone(1800 + k * 600, 0.05, 0.02 + k * 0.02, 0, "sine", 0, 0.1);
  }

  say(text: string, pitch = 0.9, rate = 0.95) {
    if (this.muted || !("speechSynthesis" in window)) return;
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("nl"));
    if (!voices.length) return;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voices.find((v) => v.lang.toLowerCase() === "nl-be") ?? voices[0]!;
    u.lang = u.voice.lang;
    u.pitch = pitch;
    u.rate = rate;
    u.volume = 0.6;
    speechSynthesis.speak(u);
  }

  flickerBuzz(amount: number) {
    if (!this.ctx || amount <= 0) return;
    this.burst(0.04 + Math.random() * 0.06, "bandpass", 100 + Math.random() * 20, 8, 0.25 * amount, 0, 0, 0.1);
  }

  // Things that happen somewhere else.
  private distantEvent() {
    const pan = Math.random() * 2 - 1;
    const r = Math.random();
    if (this.env.roof) {
      this.tone(420 + Math.random() * 300, 0.8, 0.02, 0, "sine", pan);
      return;
    }
    if (r < 0.3) {
      // someone walking, far away
      const n = 6 + Math.floor(Math.random() * 10);
      const surf: Surface = Math.random() < 0.5 ? "tile" : "concrete";
      for (let k = 0; k < n; k++) {
        const vol = 0.12 * Math.sin(((k + 1) / (n + 1)) * Math.PI);
        setTimeout(() => this.footstep(surf, false, vol, pan * (1 - k / n) + (k / n) * -pan * 0.3, 2.5), k * 520 + Math.random() * 40);
      }
    } else if (r < 0.5) {
      this.burst(0.5, "lowpass", 140, 0.8, 0.6, 0, pan, 3);
      this.burst(0.15, "bandpass", 600, 1, 0.12, 0, pan, 3);
    } else if (r < 0.65) {
      this.ding(0.25, pan);
    } else if (r < 0.8) {
      // a phone, ringing in an empty office
      for (let k = 0; k < 3; k++)
        for (let i = 0; i < 18; i++) this.tone(i % 2 ? 1100 : 1400, 0.05, 0.018, k * 3 + i * 0.055, "square", pan, 1.2);
    } else {
      // muffled television
      for (let i = 0; i < 14; i++) this.burst(0.18 + Math.random() * 0.2, "bandpass", 300 + Math.random() * 900, 3, 0.05, i * 0.22 + Math.random() * 0.1, pan, 1.5);
    }
  }

  private announce() {
    if (!("speechSynthesis" in window)) return;
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("nl"));
    if (!voices.length) return;
    this.chime();
    const u = new SpeechSynthesisUtterance(PA_LINES[Math.floor(Math.random() * PA_LINES.length)]!);
    u.voice = voices.find((v) => v.lang.toLowerCase() === "nl-be") ?? voices[0]!;
    u.lang = u.voice.lang;
    u.rate = 0.86;
    u.pitch = 0.85;
    u.volume = 0.3;
    setTimeout(() => !this.muted && speechSynthesis.speak(u), 1800);
  }

  update(dt: number) {
    if (!this.ctx || this.muted) return;
    this.t += dt;
    if (this.windGain.gain.value > 0.01) this.windFilter.frequency.setTargetAtTime(350 + Math.sin(this.t * 0.3) * 200 + Math.sin(this.t * 1.7) * 80, this.ctx.currentTime, 0.5);
    this.nextEvent -= dt;
    if (this.nextEvent <= 0) {
      this.nextEvent = 18 + Math.random() * 35;
      this.distantEvent();
    }
    this.nextPA -= dt;
    if (this.nextPA <= 0) {
      this.nextPA = 110 + Math.random() * 120;
      if (!this.env.roof) this.announce();
    }
  }
}
