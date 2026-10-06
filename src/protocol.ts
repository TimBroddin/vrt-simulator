// Multiplayer: everyone is in one room (a Durable Object in production, the dev
// server locally): where everyone is, what they're called, and what they say.
//
// client → room: { t: "n", n, s }             my name, in world s (sent when you start; counts as joining)
//                { t: "p", s, x, y, z, a }     where I am (s: the world's seed, a: yaw)
//                { t: "x" }                    I'm not in the building (the hall at the end)
//                { t: "c", m }                 a chat message
//                "ping"                        keepalive (answered "pong")
// room → client: { t: "hi", id, all }          you're id; everyone already here
//                { t: "j", id, n, s }          someone came in
//                { t: "p", id, s, x, y, z, a }
//                { t: "x", id }                not in the building
//                { t: "c", id, m }             someone said something
//                { t: "bye", id }              left

export interface Pos {
  s: number;
  x: number;
  y: number;
  z: number;
  a: number;
}
export interface Who {
  id: string;
  n: string | null; // (null until they've started)
  s: number | null;
  pos: Pos | null;
}
export type ToRoom = { t: "n"; n: string; s: number } | ({ t: "p" } & Pos) | { t: "x" } | { t: "c"; m: string };
export type FromRoom =
  | { t: "hi"; id: string; all: Who[] }
  | { t: "j"; id: string; n: string; s: number }
  | ({ t: "p"; id: string } & Pos)
  | { t: "x"; id: string }
  | { t: "c"; id: string; m: string }
  | { t: "bye"; id: string };

export const MAX_PLAYERS = 100;
export const MIN_GAP_MS = 80; // position updates closer together than this are dropped (clients send 5 a second)
export const CHAT_GAP_MS = 700; // and chat messages
export const NAME_MAX = 20;
export const CHAT_MAX = 140;

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown, lim: number) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim;
const seedOk = (v: unknown) => Number.isInteger(v) && num(v, 2 ** 32);
// text as typed: no control characters, single spaces, not too long
export const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim().slice(0, max) : "");

export type Parsed = { t: "p"; pos: Pos } | { t: "n"; n: string; s: number } | { t: "x" } | { t: "c"; m: string };

// what a client sent, checked; null for anything else
export function parseToRoom(raw: string | ArrayBuffer): Parsed | null {
  if (typeof raw !== "string" || raw.length > 600) return null;
  let m: any;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  switch (m?.t) {
    case "x":
      return { t: "x" };
    case "n": {
      const n = clean(m.n, NAME_MAX);
      return n && seedOk(m.s) ? { t: "n", n, s: m.s } : null;
    }
    case "c": {
      const c = clean(m.m, CHAT_MAX);
      return c ? { t: "c", m: c } : null;
    }
    case "p":
      if (!seedOk(m.s) || !num(m.x, 1e6) || !num(m.y, 100) || !num(m.z, 1e6) || !num(m.a, 1e3)) return null;
      return { t: "p", pos: { s: m.s, x: r2(m.x), y: r2(m.y), z: r2(m.z), a: r2(m.a) } };
  }
  return null;
}

// The room's side, the same for the Durable Object and the dev server: what a
// message does to the sender's state, and what goes out to the others (null: nothing).
export interface State extends Who {
  at: number; // last position update
  ct: number; // last chat message
}
export function handle(st: State, m: Parsed, now: number): FromRoom | null {
  switch (m.t) {
    case "p":
      if (now - st.at < MIN_GAP_MS) return null;
      st.at = now;
      st.pos = m.pos;
      return { t: "p", id: st.id, ...m.pos };
    case "x":
      st.pos = null;
      return { t: "x", id: st.id };
    case "n":
      if (st.n === m.n && st.s === m.s) return null;
      st.n = m.n;
      st.s = m.s;
      return { t: "j", id: st.id, n: m.n, s: m.s };
    case "c":
      if (!st.n || now - st.ct < CHAT_GAP_MS) return null;
      st.ct = now;
      return { t: "c", id: st.id, m: m.m };
  }
}
export const fresh = (): State => ({ id: crypto.randomUUID().slice(0, 8), n: null, s: null, pos: null, at: 0, ct: 0 });
export const who = (st: State): Who => ({ id: st.id, n: st.n, s: st.s, pos: st.pos });
