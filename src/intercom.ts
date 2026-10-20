// Your voice. Hold V (or MIC) and the ones near you hear you, out loud: on your
// floor, within VOICE_NEAR, from the side you're on, softer further away. At the
// desk in a radio studio it's the intercom instead: everyone in your world hears
// you over the building's speakers, after the bing-bong. Your microphone goes out
// in bits of a tenth of a second, 8 kHz μ-law (a phone line, which is about what
// an old intercom sounds like anyway), over the room's socket as binary frames
// (see voice() in protocol.ts). The intercom comes in band-passed, overdriven a
// little and sent through the corridors' reverb, with a bit of hiss while the
// line is open.
import type { Sound } from "./audio";
import { VOICE_NEAR, VOICE_RATE } from "./protocol";

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
// someone talking near you: their own volume and side
interface Talker extends Speaker {
  gain: GainNode;
  pan: StereoPannerNode;
}
type At = { x: number; y: number; z: number };
// 1 close by, nothing at VOICE_NEAR (or off your floor)
const loudness = (me: At, o: At) => (Math.abs(o.y - me.y) < 2 ? Math.max(0, 1 - Math.hypot(o.x - me.x, o.z - me.z) / VOICE_NEAR) ** 1.5 : 0);

export class Intercom {
  talking = false;
  voices = false; // someone else is on, the intercom or nearby
  near = false; // (main sets it) at a desk with microphones
  send: (ulaw: Uint8Array, kind: 1 | 2) => boolean = () => false;
  where: (id: string) => At | null = () => null; // (main sets it) where someone is, if they're in your world
  audience: () => number = () => 0; // (main sets it) how many are within earshot
  onNote: (text: string) => void = () => {};
  onStart: (name: string) => void = () => {}; // someone else came on the intercom
  private el = document.getElementById("intercom")!;
  private shown = "";
  private mic: MediaStream | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private tap: AudioWorkletNode | null = null;
  private own: AudioContext | null = null; // (when the microphone needs a context of its own)
  private rate = 48000; // the microphone's context's sample rate
  private loaded = new WeakSet<BaseAudioContext>();
  private asking = false;
  private idle = 0;
  private pos = 0; // (resampling) where the next 8 kHz sample falls in the input
  private out = new Uint8Array(FRAME);
  private n = 0;
  private kind: 1 | 2 = 2; // what you're talking on: the intercom, or out loud
  private speakers = new Map<string, Speaker>();
  private talkers = new Map<string, Talker>();
  private bus: GainNode | null = null;
  private hiss: GainNode | null = null;

  constructor(private sound: Sound) {}

  // V down: the microphone on (asked for the first time); at the desk, the bing-bong
  async press() {
    if (this.talking || this.asking) return;
    const ctx = this.sound.ctx;
    if (!ctx) return;
    if (!navigator.mediaDevices?.getUserMedia || !ctx.audioWorklet) return this.onNote("Geen microfoon in deze browser");
    this.talking = true;
    this.idle = 0;
    this.kind = this.near ? 1 : 2;
    if (this.kind === 1) this.sound.bingBong();
    if (!this.mic) {
      this.asking = true;
      try {
        await this.module(ctx);
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (e) {
        this.talking = false;
        this.asking = false;
        this.onNote((e as Error)?.name === "NotAllowedError" ? "Geen microfoon: niet toegestaan" : "Geen microfoon gevonden");
        return;
      }
      try {
        this.wire(ctx, this.mic);
      } catch {
        // (Firefox won't take a microphone at another rate than the speakers: a context of its own, at the microphone's)
        try {
          const rate = this.mic.getAudioTracks()[0]?.getSettings().sampleRate;
          this.own = new AudioContext(rate ? { sampleRate: rate } : {});
          await this.module(this.own);
          this.wire(this.own, this.mic);
        } catch {
          this.off();
          this.talking = false;
          this.onNote("De microfoon werkt niet in deze browser");
        }
      }
      this.asking = false;
    }
  }

  private async module(ctx: BaseAudioContext) {
    if (this.loaded.has(ctx)) return;
    const url = URL.createObjectURL(new Blob([TAP], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    this.loaded.add(ctx);
  }

  // the microphone into the tap
  private wire(ctx: AudioContext, mic: MediaStream) {
    const src = ctx.createMediaStreamSource(mic);
    // (nothing above 3.4 kHz: it would only fold back down at 8 kHz)
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3400;
    const tap = new AudioWorkletNode(ctx, "intercom-tap");
    tap.port.onmessage = (e) => this.capture(e.data as Float32Array);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    src.connect(lp).connect(tap).connect(sink).connect(ctx.destination);
    this.src = src;
    this.tap = tap;
    this.rate = ctx.sampleRate;
  }

  // the microphone off (the browser stops showing it)
  private off() {
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.src?.disconnect();
    this.tap?.disconnect();
    void this.own?.close();
    this.mic = this.src = this.tap = this.own = null;
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
    const step = this.rate / VOICE_RATE;
    let p = this.pos;
    for (; p < b.length; p += step) {
      this.out[this.n++] = ulawEnc(b[Math.floor(p)]!);
      if (this.n === FRAME) this.flush();
    }
    this.pos = p - b.length;
  }

  private flush() {
    if (!this.n) return;
    if (!this.send(this.out.slice(0, this.n), this.kind) && this.talking) {
      this.talking = false;
      this.onNote("Niet verbonden: niemand hoort je");
    }
    this.n = 0;
  }

  // a bit of someone else's voice (kind 1: on the intercom, 2: out loud)
  hear(id: string, name: string, ulaw: Uint8Array, kind: 1 | 2) {
    const ctx = this.sound.ctx;
    if (!ctx || !ulaw.length) return;
    if (kind === 2) return this.nearby(ctx, id, name, ulaw);
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
    this.play(ctx, sp, ulaw, this.bus!);
  }

  // someone talking near you: straight into the room, from where they stand
  private nearby(ctx: AudioContext, id: string, name: string, ulaw: Uint8Array) {
    const now = ctx.currentTime;
    let t = this.talkers.get(id);
    if (!t) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      gain.connect(pan).connect(this.sound.dry);
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      pan.connect(wet).connect(this.sound.wetSend);
      t = { name, next: now, gain, pan };
      this.talkers.set(id, t);
    }
    t.name = name;
    if (t.next < now + 0.03) t.next = now + JITTER;
    this.play(ctx, t, ulaw, t.gain);
  }

  private play(ctx: AudioContext, sp: Speaker, ulaw: Uint8Array, to: AudioNode) {
    const buf = ctx.createBuffer(1, ulaw.length, VOICE_RATE);
    const d = buf.getChannelData(0);
    for (let i = 0; i < ulaw.length; i++) d[i] = ulawDec(ulaw[i]!);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.connect(to);
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

  // me: where you are and which way you look (null: not in the building)
  update(dt: number, me: { pos: At; yaw: number } | null) {
    const ctx = this.sound.ctx;
    if (!ctx) return;
    // (walked away from the desk: still talking, but only out loud)
    if (this.talking && this.kind === 1 && !this.near) {
      this.flush();
      this.kind = 2;
      this.onNote("Van de intercom: alleen wie in de buurt is hoort je nog");
    }
    const now = ctx.currentTime;
    const on: string[] = [];
    for (const [id, sp] of this.speakers) {
      if (now - sp.next > GAP) this.speakers.delete(id);
      else if (sp.next > now - 0.2) on.push(sp.name);
    }
    // the ones talking near you: louder as you come closer, from the side they're on
    const loud: string[] = [];
    for (const [id, t] of this.talkers) {
      if (now - t.next > GAP) {
        t.gain.disconnect();
        t.pan.disconnect();
        this.talkers.delete(id);
        continue;
      }
      const o = this.where(id);
      const g = me && o ? loudness(me.pos, o) : 0;
      t.gain.gain.setTargetAtTime(g * 1.6, now, 0.05);
      if (me && o) {
        const dx = o.x - me.pos.x, dz = o.z - me.pos.z, len = Math.max(0.01, Math.hypot(dx, dz));
        // (right next to you it's in the middle, further off it's to one side)
        t.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, (dx * Math.cos(me.yaw) - dz * Math.sin(me.yaw)) / len)) * Math.min(1, len / 2), now, 0.05);
      }
      if (t.next > now - 0.2) loud.push(t.name);
    }
    this.hiss?.gain.setTargetAtTime(on.length ? 0.02 : 0, now, 0.08);
    // (the microphone off a while after you let go, so the browser stops showing it)
    if (this.mic && !this.talking && !this.asking && (this.idle += dt) > MIC_IDLE) this.off();
    this.voices = on.length > 0 || loud.length > 0;
    const mine = this.kind === 1 ? "OP DE INTERCOM" : this.audience() ? "JE PRAAT" : "JE PRAAT · NIEMAND IN DE BUURT";
    const txt = this.talking ? (this.asking ? "MICROFOON…" : mine) : on.length ? on.join(", ") : loud.length ? `${loud.join(", ")} ${loud.length > 1 ? "praten" : "praat"}` : "";
    const near = !this.talking && !on.length && loud.length > 0;
    const key = `${this.talking}|${near}|${txt}`;
    if (key === this.shown) return;
    this.shown = key;
    this.el.textContent = txt;
    this.el.classList.toggle("me", this.talking);
    this.el.classList.toggle("near", near);
  }
}
