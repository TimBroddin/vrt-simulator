// The Cloudflare Worker: the static site, plus /ws, the one room everyone is in.
// The room is a Durable Object using the hibernation API, so it isn't billed
// while nobody's moving. Each socket keeps its state (id, name, last position,
// its job) in its attachment, which survives hibernation; each world's jobs and
// scores are in the object's storage, read back when it wakes up.
import { DurableObject } from "cloudflare:workers";
import { MAX_PLAYERS, fresh, freshWorld, handle, parseToRoom, peersOf, route, voice, who, type FromRoom, type State, type WorldState } from "../src/protocol";

interface Env {
  ASSETS: Fetcher;
  LOBBY: DurableObjectNamespace<Lobby>;
}

export class Lobby extends DurableObject<Env> {
  private worlds = new Map<number, WorldState>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // (keepalives are answered without waking the room)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  override async fetch(req: Request) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("websocket only", { status: 426 });
    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= MAX_PLAYERS) return new Response("vol", { status: 503 });
    const { 0: client, 1: server } = new WebSocketPair();
    const st = fresh();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(st);
    const all = sockets.map((ws) => ws.deserializeAttachment() as State).filter((o) => o.n || o.pos).map(who);
    server.send(JSON.stringify({ t: "hi", id: st.id, all } satisfies FromRoom));
    return new Response(null, { status: 101, webSocket: client });
  }

  private async world(s: number) {
    let w = this.worlds.get(s);
    if (!w) {
      w = (await this.ctx.storage.get<WorldState>(`w:${s}`)) ?? freshWorld();
      this.worlds.set(s, w);
    }
    return w;
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return this.intercom(ws, raw);
    const m = parseToRoom(raw);
    if (!m) return;
    const st = ws.deserializeAttachment() as State;
    // (positions and chat don't need the world)
    const s = m.t === "n" ? m.s : st.s;
    const w = s !== null && m.t !== "p" && m.t !== "c" && m.t !== "x" ? await this.world(s) : null;
    const rev = w?.rev;
    const out = handle(st, m, Date.now(), w);
    ws.serializeAttachment(st);
    if (w && w.rev !== rev) this.ctx.storage.put(`w:${s}`, w);
    route(out, ws, this.ctx.getWebSockets(), (x) => x.deserializeAttachment() as State | null, (x, msg) => {
      try {
        x.send(msg);
      } catch {}
    });
  }

  // a bit of someone's voice, straight on to the others in their world
  private intercom(ws: WebSocket, raw: ArrayBuffer) {
    const st = ws.deserializeAttachment() as State | null;
    const out = st && voice(st, raw, Date.now());
    if (!st) return;
    ws.serializeAttachment(st);
    if (!out) return;
    for (const x of peersOf(ws, this.ctx.getWebSockets(), (o) => o.deserializeAttachment() as State | null))
      try {
        x.send(out);
      } catch {}
  }

  override async webSocketClose(ws: WebSocket, code: number) {
    this.gone(ws);
    try {
      ws.close(code === 1005 ? 1000 : code);
    } catch {}
  }

  override async webSocketError(ws: WebSocket) {
    this.gone(ws);
  }

  private gone(ws: WebSocket) {
    const st = ws.deserializeAttachment() as State | null;
    if (st) route([{ to: "others", m: { t: "bye", id: st.id } }], ws, this.ctx.getWebSockets(), () => null, (x, msg) => {
      try {
        x.send(msg);
      } catch {}
    });
  }
}

export default {
  fetch(req, env) {
    if (new URL(req.url).pathname === "/ws") return env.LOBBY.get(env.LOBBY.idFromName("lobby")).fetch(req);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
