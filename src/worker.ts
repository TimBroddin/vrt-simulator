// Chunk generation worker: layout + geometry + baked lighting off the main thread.
import { buildChunk, buildExterior } from "./chunk";
import { setSeed } from "./rng";
import { openDoor } from "./layout";

type Msg = { type: "init"; seed: number } | { type: "open"; f: number; gx: number; gz: number; d: number } | { type: "chunk"; key: string; f: number; cx: number; cz: number } | { type: "ext"; key: string; cx: number; cz: number };

const transfers = (b: { [k: string]: any }) =>
  Object.values(b).filter((v) => ArrayBuffer.isView(v)).map((v) => (v as ArrayBufferView).buffer as ArrayBuffer);

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.type === "init") {
    setSeed(m.seed);
    return;
  }
  // a door you opened (before the chunk with it is built again)
  if (m.type === "open") return openDoor(m.f, m.gx, m.gz, m.d);
  const t0 = performance.now();
  if (m.type === "chunk") {
    const { built, elevs } = buildChunk(m.f, m.cx, m.cz);
    const tr = [...transfers(built)];
    for (const el of elevs) for (const p of el.panels) tr.push(...transfers(p));
    (self as any).postMessage({ type: "chunk", key: m.key, f: m.f, cx: m.cx, cz: m.cz, built, elevs, ms: performance.now() - t0 }, tr);
  } else {
    const built = buildExterior(m.cx, m.cz);
    (self as any).postMessage({ type: "ext", key: m.key, cx: m.cx, cz: m.cz, built }, built ? transfers(built) : []);
  }
};
