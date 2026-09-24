// Somewhere in the building a radio is on. Every few minutes one of the live
// VRT stations drifts in: band-limited, overdriven, wobbling like old tape,
// drowned in reverb, crackling - then it's gone again.
import type { Sound } from "./audio";
import { STATIONS } from "./stations";

// a short silent WAV, played inside the first tap to unlock the element (iOS)
function silentWav() {
  const n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, "data"); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  let bin = "";
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return "data:audio/wav;base64," + btoa(bin);
}

export class GhostRadio {
  el: HTMLAudioElement | null = null;
  private src: MediaElementAudioSourceNode | null = null;
  private out: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  private next = 10 + Math.random() * 35;
  private until = 0;
  private t = 0;
  private token = 0;
  playing = false;
  enabled = true;
  // index into STATIONS while a stream is audible, -1 otherwise
  station = -1;
  onStation: (station: number) => void = () => {};

  constructor(private sound: Sound) {}

  // must run inside a user gesture: creates and unlocks the audio element
  unlock() {
    const ctx = this.sound.ctx;
    if (!ctx || this.el) return;
    const el = new Audio();
    el.crossOrigin = "anonymous";
    el.preload = "none";
    el.src = silentWav();
    el.play().then(() => el.pause()).catch(() => {});
    this.el = el;

    // radio chain: band-limit -> drive -> wow & flutter -> level -> pan
    this.src = ctx.createMediaElementSource(el);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 380;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    lp.Q.value = 1.4;
    const drive = ctx.createWaveShaper();
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * 3.5);
    drive.curve = curve;
    drive.oversample = "2x";
    const wow = ctx.createDelay(0.1);
    wow.delayTime.value = 0.03;
    for (const [f, depth] of [[0.55, 0.004], [6.3, 0.0007]] as const) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = depth;
      lfo.connect(g).connect(wow.delayTime);
      lfo.start();
    }
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    this.src.connect(hp).connect(lp).connect(drive).connect(wow).connect(this.out).connect(this.pan);
    this.pan.connect(this.sound.dry);
    const send = ctx.createGain();
    send.gain.value = 1.4;
    this.pan.connect(send).connect(this.sound.wetSend);
  }

  play(index = Math.floor(Math.random() * STATIONS.length), secs = 18 + Math.random() * 22) {
    const ctx = this.sound.ctx;
    if (!ctx || !this.el || !this.out || !this.pan || this.playing || this.sound.muted) return;
    this.playing = true;
    this.until = this.t + secs;
    this.pan.pan.value = Math.random() * 1.6 - 0.8;
    this.el.src = STATIONS[index]!.url;
    const token = ++this.token;
    this.el.play().catch(() => this.stop(true));
    const now = ctx.currentTime;
    const vol = 0.22 + Math.random() * 0.12;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(0, now);
    // it fades in once the stream actually starts
    const onPlaying = () => {
      this.el!.removeEventListener("playing", onPlaying);
      if (token !== this.token) return;
      const t = ctx.currentTime;
      this.out!.gain.setValueAtTime(0, t);
      this.out!.gain.linearRampToValueAtTime(vol, t + 3);
      this.sound.tuning();
      if (!this.playing) return;
      this.station = index;
      this.onStation(index);
    };
    this.el.addEventListener("playing", onPlaying);
  }

  stop(now = false) {
    const ctx = this.sound.ctx;
    if (!this.playing || !ctx || !this.el || !this.out) return;
    this.playing = false;
    if (this.station >= 0) {
      this.station = -1;
      this.onStation(-1);
    }
    const t = ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + (now ? 0.05 : 3.5));
    const el = this.el;
    setTimeout(() => {
      if (this.playing) return;
      el.pause();
      el.removeAttribute("src");
      el.load();
    }, now ? 100 : 3800);
  }

  update(dt: number, onRoof: boolean) {
    if (!this.el || !this.enabled) return;
    this.t += dt;
    if (this.playing) {
      // dropouts and crackle while it plays
      if (Math.random() < dt * 1.5) this.sound.crackle();
      if (Math.random() < dt * 0.15 && this.out && this.sound.ctx) {
        const t = this.sound.ctx.currentTime, v = this.out.gain.value;
        this.out.gain.setValueAtTime(v, t);
        this.out.gain.linearRampToValueAtTime(v * 0.15, t + 0.08);
        this.out.gain.linearRampToValueAtTime(v, t + 0.5 + Math.random() * 0.8);
      }
      if (this.t > this.until || onRoof || this.sound.muted) this.stop();
      return;
    }
    this.next -= dt;
    if (this.next <= 0) {
      this.next = 45 + Math.random() * 75;
      if (!onRoof) this.play();
    }
  }
}
