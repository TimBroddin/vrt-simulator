// Dev server: serves the HTML app, a separately bundled generation worker, and
// /ws, the room everyone is in (in production that's a Durable Object, see server/index.ts).
import index from "./src/index.html";
import { MAX_PLAYERS, fresh, freshWorld, handle, parseToRoom, route, who, type FromRoom, type State, type WorldState } from "./src/protocol";

async function buildWorker() {
  const r = await Bun.build({ entrypoints: ["./src/worker.ts"], target: "browser", format: "esm", minify: true });
  if (!r.success) {
    console.error(r.logs);
    throw new Error("worker build failed");
  }
  return await r.outputs[0]!.text();
}

const workerJs = await buildWorker();

const room = new Set<Bun.ServerWebSocket<State>>();
// each world's jobs and scores (only while the dev server runs)
const worlds = new Map<number, WorldState>();
const worldOf = (s: number) => worlds.get(s) ?? worlds.set(s, freshWorld()).get(s)!;

const server = Bun.serve<State>({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/": index,
    "/worker.js": () => new Response(workerJs, { headers: { "content-type": "text/javascript" } }),
    "/ws": (req: Request, srv: Bun.Server<State>) => {
      if (room.size >= MAX_PLAYERS) return new Response("vol", { status: 503 });
      if (srv.upgrade(req, { data: fresh() })) return;
      return new Response("websocket only", { status: 426 });
    },
  },
  websocket: {
    open(ws) {
      const all = [...room].map((o) => o.data).filter((o) => o.n || o.pos).map(who);
      ws.send(JSON.stringify({ t: "hi", id: ws.data.id, all } satisfies FromRoom));
      room.add(ws);
    },
    message(ws, raw) {
      if (raw === "ping") return void ws.send("pong");
      const m = parseToRoom(typeof raw === "string" ? raw : "");
      if (!m) return;
      const s = m.t === "n" ? m.s : ws.data.s;
      const out = handle(ws.data, m, Date.now(), s === null ? null : worldOf(s));
      route(out, ws, room, (x) => x.data, (x, msg) => x.send(msg));
    },
    close(ws) {
      room.delete(ws);
      route([{ to: "others", m: { t: "bye", id: ws.data.id } }], ws, room, (x) => x.data, (x, msg) => x.send(msg));
    },
  },
  development: { hmr: false, console: true },
});

console.log(`VRT Simulator → ${server.url}`);
