// The intercom: at the desk in a radio studio, hold V (or MIC) and everyone in
// your world hears you over the building's speakers, after the bing-bong. Your microphone goes out in bits of
// a tenth of a second, 8 kHz μ-law (a phone line, which is about what an old
// intercom sounds like anyway), over the room's socket as binary frames (see
// voice() in protocol.ts). What comes in is band-passed, overdriven a little and
// sent through the corridors' reverb, with a bit of hiss while the line is open.
import type { Sound } from "./audio";
import { VOICE_RATE } from "./protocol";

const FRAME = VOICE_RATE / 10; // bytes in one frame (0.1 s)
const JITTER = 0.15; // s of voice held back, so a late frame doesn't break it up
const GAP = 2; // s of silence before a new bing-bong
const MIC_IDLE = 20; // s after letting go before the microphone is switched off

// (the samples, in batches of 1024, to the main thread)
const TAP = `registerProcessor("intercom-tap", class extends AudioWorkletProcessor {
  constructor() { super(); this.b = new Float32Array(1024); this.n = 0; }
  process(ins) {
    const c = ins[0] && ins[0][0];
    if (c) for (let i = 0; i < c.length; i++) {
      this.b[this.n++] = c[i];
      if (this.n === this.b.length) { this.port.postMessage(this.b.slice()); this.n = 0; }
    }
    return true;
  }
});`;

// G.711 μ-law: -1..1 to a byte and back
export function ulawEnc(x: number) {
  let s = Math.round(Math.max(-1, Math.min(1, x)) * 32767);
  const sign = s < 0 ? 0x80 : 0;
  s = Math.min(32635, Math.abs(s)) + 0x84;
  let exp = 7;
  for (let m = 0x4000; (s & m) === 0 && exp > 0; m >>= 1) exp--;
  return ~(sign | (exp << 4) | ((s >> (exp + 3)) & 0x0f)) & 0xff;
}
export function ulawDec(u: number) {
  u = ~u & 0xff;
  const exp = (u >> 4) & 7;
  const s = ((((u & 0x0f) << 3) + 0x84) << exp) - 0x84;
  return (u & 0x80 ? -s : s) / 32768;
}

interface Speaker {
  name: string;
  next: number; // (audio clock) where the next bit goes
}

export class Intercom {
  talking = false;
  near = false; // (main sets it) at a desk with microphones
  send: (ulaw: Uint8Array) => boolean = () => false;
  onNote: (text: string) => void = () => {};
  onStart: (name: string) => void = () => {}; // someone else came on
  private el = document.getElementById("intercom")!;
  private shown = "";
  private mic: MediaStream | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private tap: AudioWorkletNode | null = null;
  private loaded = false;
  private asking = false;
  private idle = 0;
  private pos = 0; // (resampling) where the next 8 kHz sample falls in the input
  private out = new Uint8Array(FRAME);
  private n = 0;
  private speakers = new Map<string, Speaker>();
  private bus: GainNode | null = null;
  private hiss: GainNode | null = null;

  constructor(private sound: Sound) {}

  // V down: the microphone on (asked for the first time), the bing-bong
  async press() {
    if (this.talking || this.asking) return;
    const ctx = this.sound.ctx;
    if (!ctx) return;
    if (!this.near) return this.onNote("Geen microfoon hier: de intercom is in de radiostudio's");
    if (!navigator.mediaDevices?.getUserMedia || !ctx.audioWorklet) return this.onNote("Geen microfoon in deze browser");
    this.talking = true;
    this.idle = 0;
    this.sound.bingBong();
    if (!this.mic) {
      this.asking = true;
      try {
        if (!this.loaded) {
          const url = URL.createObjectURL(new Blob([TAP], { type: "text/javascript" }));
          await ctx.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);
          this.loaded = true;
        }
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (e) {
        this.talking = false;
        this.onNote((e as Error)?.name === "NotAllowedError" ? "Geen microfoon: niet toegestaan" : "Geen microfoon gevonden");
        return;
      } finally {
        this.asking = false;
      }
      this.src = ctx.createMediaStreamSource(this.mic);
      // (nothing above 3.4 kHz: it would only fold back down at 8 kHz)
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3400;
      this.tap = new AudioWorkletNode(ctx, "intercom-tap");
      this.tap.port.onmessage = (e) => this.capture(e.data as Float32Array);
      const sink = ctx.createGain();
      sink.gain.value = 0;
      this.src.connect(lp).connect(this.tap).connect(sink).connect(ctx.destination);
    }
  }

  // what to show at the desk
  prompt(touch: boolean) {
    return this.near && !this.talking ? `${touch ? "MIC" : "V"} INGEDRUKT · INTERCOM` : "";
  }

  // V up: whatever's left goes out
  release() {
    if (!this.talking) return;
    this.talking = false;
    this.flush();
    this.pos = 0;
  }

  private capture(b: Float32Array) {
    if (!this.talking) return;
    const step = this.sound.ctx!.sampleRate / VOICE_RATE;
    let p = this.pos;
    for (; p < b.length; p += step) {
      this.out[this.n++] = ulawEnc(b[Math.floor(p)]!);
      if (this.n === FRAME) this.flush();
    }
    this.pos = p - b.length;
  }

  private flush() {
    if (!this.n) return;
    if (!this.send(this.out.slice(0, this.n)) && this.talking) {
      this.talking = false;
      this.onNote("Niet verbonden: niemand hoort je");
    }
    this.n = 0;
  }

  // a bit of someone else's voice
  hear(id: string, name: string, ulaw: Uint8Array) {
    const ctx = this.sound.ctx;
    if (!ctx || !ulaw.length) return;
    this.chain(ctx);
    const now = ctx.currentTime;
    let sp = this.speakers.get(id);
    if (!sp || now - sp.next > GAP) {
      // (a new announcement: the bing-bong first)
      sp = { name, next: now + 0.75 };
      this.speakers.set(id, sp);
      this.sound.bingBong();
      this.onStart(name);
    }
    sp.name = name;
    if (sp.next < now + 0.03) sp.next = now + JITTER;
    const buf = ctx.createBuffer(1, ulaw.length, VOICE_RATE);
    const d = buf.getChannelData(0);
    for (let i = 0; i < ulaw.length; i++) d[i] = ulawDec(ulaw[i]!);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.connect(this.bus!);
    s.start(sp.next);
    sp.next += buf.duration;
  }

  // the speakers in the ceiling: thin, a little overdriven, echoing down the corridor
  private chain(ctx: AudioContext) {
    if (this.bus) return;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1.4;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 380;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    const drive = ctx.createWaveShaper();
    const curve = new Float32Array(257);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / 128) - 1) * 2.2) / Math.tanh(2.2);
    drive.curve = curve;
    const out = ctx.createGain();
    out.gain.value = 0.5;
    this.bus.connect(hp).connect(lp).connect(drive).connect(out);
    out.connect(this.sound.dry);
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    out.connect(wet).connect(this.sound.wetSend);
    // the line's hiss, while someone's on
    const n = ctx.createBufferSource();
    n.buffer = this.sound.noise;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2500;
    bp.Q.value = 0.8;
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    n.connect(bp).connect(this.hiss).connect(out);
    n.start();
  }

  update(dt: number) {
    const ctx = this.sound.ctx;
    if (!ctx) return;
    if (this.talking && !this.near) {
      this.release();
      this.onNote("Te ver van de microfoon");
    }
    const now = ctx.currentTime;
    const on: string[] = [];
    for (const [id, sp] of this.speakers) {
      if (now - sp.next > GAP) this.speakers.delete(id);
      else if (sp.next > now - 0.2) on.push(sp.name);
    }
    this.hiss?.gain.setTargetAtTime(on.length ? 0.02 : 0, now, 0.08);
    // (the microphone off a while after you let go, so the browser stops showing it)
    if (this.mic && !this.talking && !this.asking && (this.idle += dt) > MIC_IDLE) {
      for (const t of this.mic.getTracks()) t.stop();
      this.src?.disconnect();
      this.tap?.disconnect();
      this.mic = this.src = this.tap = null;
    }
    const txt = this.talking ? (this.asking ? "MICROFOON…" : "OP DE INTERCOM") : on.length ? on.join(", ") : "";
    const key = `${this.talking}|${txt}`;
    if (key === this.shown) return;
    this.shown = key;
    this.el.textContent = txt;
    this.el.classList.toggle("me", this.talking);
  }
}
