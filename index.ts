// Dev server: serves the HTML app, a separately bundled generation worker, and
// /ws, the room everyone is in (in production that's a Durable Object, see server/index.ts).
import index from "./src/index.html";
import { MAX_PLAYERS, fresh, handle, parseToRoom, who, type FromRoom, type State } from "./src/protocol";

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
const say = (m: FromRoom) => server.publish("room", JSON.stringify(m));

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
      ws.subscribe("room");
    },
    message(ws, raw) {
      if (raw === "ping") return void ws.send("pong");
      const m = parseToRoom(typeof raw === "string" ? raw : "");
      const out = m && handle(ws.data, m, Date.now());
      if (out) ws.publish("room", JSON.stringify(out)); // (publish skips the sender)
    },
    close(ws) {
      room.delete(ws);
      say({ t: "bye", id: ws.data.id });
    },
  },
  development: { hmr: false, console: true },
});

console.log(`VRT Simulator → ${server.url}`);
