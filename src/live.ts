// Live TV: the radio stations' studio cameras (visual radio, plain HLS) on the
// screens in the building. One stream at a time, only when it's worth it: the
// station the ghost radio is playing, or the radio studio you're standing near.
import * as THREE from "three";
import Hls from "hls.js/light";
import { STATIONS } from "./stations";

export class LiveTV {
  video: HTMLVideoElement;
  tex: THREE.VideoTexture;
  station = -1; // what's loaded
  ready = false; // frames are coming in
  private hls: Hls | null = null;
  private idle = 0;
  private failed = new Map<number, number>(); // station -> retry after (s)
  private t = 0;

  constructor(private uniforms: Record<string, THREE.IUniform>) {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true; // the sound comes from the ghost radio
    v.playsInline = true;
    v.autoplay = true;
    this.video = v;
    this.tex = new THREE.VideoTexture(v);
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    uniforms.liveTex!.value = this.tex;
    v.addEventListener("playing", () => (this.ready = true));
    v.addEventListener("waiting", () => (this.ready = false));
  }

  // want: the station to show, or -1
  update(dt: number, want: number) {
    this.t += dt;
    if (want >= 0 && (this.failed.get(want) ?? 0) > this.t) want = -1;
    if (want >= 0 && want !== this.station) this.load(want);
    // keep the last stream a little while after you walk away
    if (want < 0 && this.station >= 0 && (this.idle += dt) > 25) this.stop();
    if (want >= 0) this.idle = 0;
    this.uniforms.liveOn!.value = this.ready && this.video.readyState >= 2 ? 1 : 0;
    this.uniforms.liveStation!.value = this.station;
  }

  private load(k: number) {
    this.stop();
    this.station = k;
    const url = STATIONS[k]!.video;
    const v = this.video;
    const fail = () => {
      if (this.station !== k) return;
      this.failed.set(k, this.t + 120);
      this.stop();
    };
    if (Hls.isSupported()) {
      // the smallest rendition is plenty for a screen across the room
      const hls = new Hls({ startLevel: 0, capLevelToPlayerSize: false, maxBufferLength: 8, backBufferLength: 0, liveSyncDurationCount: 3 });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        hls.autoLevelCapping = 0;
        v.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_: unknown, d: { fatal: boolean }) => d.fatal && fail());
      hls.loadSource(url);
      hls.attachMedia(v);
      this.hls = hls;
    } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = url;
      v.onerror = fail;
      v.play().catch(() => {});
    } else fail();
  }

  stop() {
    this.ready = false;
    this.station = -1;
    this.idle = 0;
    this.hls?.destroy();
    this.hls = null;
    this.video.onerror = null;
    this.video.removeAttribute("src");
    this.video.load();
  }
}
