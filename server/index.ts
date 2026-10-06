// The Cloudflare Worker: the static site, plus /ws, the one room everyone is in.
// The room is a Durable Object using the hibernation API, so it isn't billed
// while nobody's moving. Each socket keeps its state (id, name, last position)
// in its attachment, which survives hibernation.
import { DurableObject } from "cloudflare:workers";
import { MAX_PLAYERS, fresh, handle, parseToRoom, who, type FromRoom, type State } from "../src/protocol";

interface Env {
  ASSETS: Fetcher;
  LOBBY: DurableObjectNamespace<Lobby>;
}

export class Lobby extends DurableObject<Env> {
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

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const m = parseToRoom(raw);
    if (!m) return;
    const st = ws.deserializeAttachment() as State;
    const out = handle(st, m, Date.now());
    if (!out) return;
    ws.serializeAttachment(st);
    this.broadcast(ws, out);
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
    if (st) this.broadcast(ws, { t: "bye", id: st.id });
  }

  private broadcast(from: WebSocket, msg: FromRoom) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === from) continue;
      try {
        ws.send(s);
      } catch {}
    }
  }
}

export default {
  fetch(req, env) {
    if (new URL(req.url).pathname === "/ws") return env.LOBBY.get(env.LOBBY.idFromName("lobby")).fetch(req);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
