// Multiplayer: everyone is in one room (a Durable Object in production, the dev
// server locally): where everyone is, what they're called, what they say, the
// jobs the phones hand out, and everyone's money (earned on jobs, spent on food).
//
// client → room: { t: "n", n, s, k, r? }      my name, in world s, my key k (sent when you start; counts as joining;
//                                              r: I started over, so back to the starting money)
//                { t: "p", s, x, y, z, a }     where I am (s: the world's seed, a: yaw)
//                { t: "x" }                    I'm not in the building (the hall at the end)
//                { t: "c", m }                 a chat message
//                { t: "up", j }                I picked up the phone for job j
//                { t: "st", j, i }             I did step i of job j (a chair, a toilet)
//                { t: "dn", j }                I finished job j
//                { t: "dr" }                   I'm off my job (out of time, warped)
//                { t: "buy", f }               I'm buying food f (see FOOD in jobs.ts)
//                { t: "dood" }                 I starved (half my money goes to the ambulance)
//                "ping"                        keepalive (answered "pong")
// room → client: { t: "hi", id, all }          you're id; everyone already here
//                { t: "j", id, n, s }          someone came in
//                { t: "p", id, s, x, y, z, a }
//                { t: "x", id }                not in the building
//                { t: "c", id, m }             someone said something
//                { t: "bye", id }              left
//                { t: "jobs", now, jobs, top, pts }   (to you, after "n") the open jobs, the best, your score, the room's clock
//                { t: "ring", job }            a new job (its phone rings from job.at)
//                { t: "gone", j }              nobody managed job j: the caller hung up
//                { t: "up", id, j }            someone picked up job j
//                { t: "st", id, j, i }         someone did step i of job j
//                { t: "won", id, n, j, q, pay, pts, top }  someone won job j (pts: their money now)
//                { t: "paid", f, pts }         (to you) bought f; pts: your money now
//                { t: "broke", f, pts }        (to you) not enough money for f
//                { t: "dood", lost, pts }      (to you) the ambulance took `lost`
//                { t: "rip", id }              someone starved
//                { t: "top", top }             the board changed (someone spent, or died)
import { FOOD, JOBS, JOB_TTL_MS, OPEN_JOBS, RING_AFTER_MS, START_MONEY, payOf } from "./jobs";

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
// a job: its number (also its variant: where the thing is), which job, which phone, when it rings, the steps done
export interface Job {
  j: number;
  q: string;
  ph: number;
  at: number;
  st: number[];
}
export interface Top {
  n: string;
  pts: number;
}
export type ToRoom =
  | { t: "n"; n: string; s: number; k: string; r?: 1 }
  | ({ t: "p" } & Pos)
  | { t: "x" }
  | { t: "c"; m: string }
  | { t: "up"; j: number }
  | { t: "st"; j: number; i: number }
  | { t: "dn"; j: number }
  | { t: "dr" }
  | { t: "buy"; f: string }
  | { t: "dood" };
export type FromRoom =
  | { t: "hi"; id: string; all: Who[] }
  | { t: "j"; id: string; n: string; s: number }
  | ({ t: "p"; id: string } & Pos)
  | { t: "x"; id: string }
  | { t: "c"; id: string; m: string }
  | { t: "bye"; id: string }
  | { t: "jobs"; now: number; jobs: Job[]; top: Top[]; pts: number }
  | { t: "ring"; job: Job }
  | { t: "gone"; j: number }
  | { t: "up"; id: string; j: number }
  | { t: "st"; id: string; j: number; i: number }
  | { t: "won"; id: string; n: string; j: number; q: string; pay: number; pts: number; top: Top[] }
  | { t: "paid"; f: string; pts: number }
  | { t: "broke"; f: string; pts: number }
  | { t: "dood"; lost: number; pts: number }
  | { t: "rip"; id: string }
  | { t: "top"; top: Top[] };

export const MAX_PLAYERS = 100;
export const MIN_GAP_MS = 80; // position updates closer together than this are dropped (clients send 5 a second)
export const CHAT_GAP_MS = 700; // and chat messages
export const NAME_MAX = 20;
export const CHAT_MAX = 140;
export const MAX_STEPS = 64;
const TOP_N = 5;
const MAX_SCORES = 1000;

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown, lim: number) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim;
const seedOk = (v: unknown) => Number.isInteger(v) && num(v, 2 ** 32);
const jobOk = (v: unknown) => Number.isInteger(v) && (v as number) > 0 && (v as number) < 2 ** 31;
// text as typed: no control characters, single spaces, not too long
export const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim().slice(0, max) : "");

export type Parsed =
  | { t: "p"; pos: Pos }
  | { t: "n"; n: string; s: number; k: string | null; r: boolean }
  | { t: "x" }
  | { t: "c"; m: string }
  | { t: "up"; j: number }
  | { t: "st"; j: number; i: number }
  | { t: "dn"; j: number }
  | { t: "dr" }
  | { t: "buy"; f: string }
  | { t: "dood" };

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
    case "dr":
      return { t: "dr" };
    case "dood":
      return { t: "dood" };
    case "buy":
      return typeof m.f === "string" && Object.hasOwn(FOOD, m.f) ? { t: "buy", f: m.f } : null;
    case "n": {
      const n = clean(m.n, NAME_MAX);
      // (a key is what your score is kept under; without one you still play, just not for the board)
      const k = typeof m.k === "string" && /^[a-z0-9]{8,40}$/i.test(m.k) ? m.k : null;
      return n && seedOk(m.s) ? { t: "n", n, s: m.s, k, r: m.r === 1 } : null;
    }
    case "c": {
      const c = clean(m.m, CHAT_MAX);
      return c ? { t: "c", m: c } : null;
    }
    case "p":
      if (!seedOk(m.s) || !num(m.x, 1e6) || !num(m.y, 100) || !num(m.z, 1e6) || !num(m.a, 1e3)) return null;
      return { t: "p", pos: { s: m.s, x: r2(m.x), y: r2(m.y), z: r2(m.z), a: r2(m.a) } };
    case "up":
    case "dn":
      return jobOk(m.j) ? { t: m.t, j: m.j } : null;
    case "st":
      return jobOk(m.j) && Number.isInteger(m.i) && m.i >= 0 && m.i < MAX_STEPS ? { t: "st", j: m.j, i: m.i } : null;
  }
  return null;
}

// --- the jobs, per world ----------------------------------------------------------

export interface Score {
  n: string;
  pts: number;
  wins: number;
}
export interface WorldState {
  seq: number; // jobs dealt so far (the last one's number)
  jobs: Job[];
  scores: Record<string, Score>; // by player key (pts: their money)
  rev: number; // goes up with every change (the room saves it then)
}
export const freshWorld = (): WorldState => ({ seq: 0, jobs: [], scores: {}, rev: 0 });

export function topOf(w: WorldState): Top[] {
  return Object.values(w.scores)
    .sort((a, b) => b.pts - a.pts)
    .slice(0, TOP_N)
    .map((s) => ({ n: s.n, pts: s.pts }));
}

// fill up to OPEN_JOBS, ringing `delay` ms from now; never the job just won (`not`) if there's another
function deal(w: WorldState, now: number, delay: number, rnd: () => number, not?: string): Job[] {
  const out: Job[] = [];
  while (w.jobs.length < OPEN_JOBS) {
    const open = new Set(w.jobs.map((x) => x.q));
    let free = JOBS.filter((d) => !open.has(d.id) && d.id !== not);
    if (!free.length) free = JOBS.filter((d) => !open.has(d.id));
    if (!free.length) break;
    const d = free[Math.floor(rnd() * free.length)]!;
    const job: Job = { j: ++w.seq, q: d.id, ph: Math.floor(rnd() * 2 ** 31), at: now + delay, st: [] };
    w.jobs.push(job);
    out.push(job);
    w.rev++;
  }
  return out;
}

// jobs nobody managed in time make room for new ones
function tidy(w: WorldState, now: number, rnd: () => number): FromRoom[] {
  const old = w.jobs.filter((x) => now - x.at > JOB_TTL_MS);
  if (!old.length) return [];
  w.jobs = w.jobs.filter((x) => !old.includes(x));
  w.rev++;
  return [...old.map((x): FromRoom => ({ t: "gone", j: x.j })), ...deal(w, now, RING_AFTER_MS, rnd).map((job): FromRoom => ({ t: "ring", job }))];
}

// --- the room ---------------------------------------------------------------------

// The room's side, the same for the Durable Object and the dev server: what a
// message does to the sender's state and its world's, and who hears about it.
export interface State extends Who {
  k: string | null; // player key (the score's)
  job: number | null; // the job they picked up
  at: number; // last position update
  ct: number; // last chat message
}
// others: everyone else in the room (they filter by world themselves); world: everyone
// in the sender's world, the sender too; peers: the others in it; me: the sender
export interface Send {
  to: "others" | "world" | "peers" | "me";
  m: FromRoom;
}
// w: the sender's world (for "n", the one they join), or null if they're in none yet
export function handle(st: State, m: Parsed, now: number, w: WorldState | null, rnd: () => number = Math.random): Send[] {
  switch (m.t) {
    case "p":
      if (now - st.at < MIN_GAP_MS) return [];
      st.at = now;
      st.pos = m.pos;
      return [{ to: "others", m: { t: "p", id: st.id, ...m.pos } }];
    case "x":
      st.pos = null;
      return [{ to: "others", m: { t: "x", id: st.id } }];
    case "c":
      if (!st.n || now - st.ct < CHAT_GAP_MS) return [];
      st.ct = now;
      return [{ to: "others", m: { t: "c", id: st.id, m: m.m } }];
    case "n": {
      const out: Send[] = [];
      if (st.n !== m.n || st.s !== m.s) out.push({ to: "others", m: { t: "j", id: st.id, n: m.n, s: m.s } });
      if (st.s !== m.s) st.job = null;
      st.n = m.n;
      st.s = m.s;
      st.k = m.k;
      if (!w) return out;
      for (const x of tidy(w, now, rnd)) out.push({ to: "peers", m: x });
      for (const job of deal(w, now, 0, rnd)) out.push({ to: "peers", m: { t: "ring", job } });
      // (new here, or starting over: a little money to start with)
      const before = JSON.stringify(topOf(w));
      let sc = st.k ? w.scores[st.k] : undefined;
      if (st.k && (!sc || m.r)) {
        sc = w.scores[st.k] = { n: st.n, pts: START_MONEY, wins: 0 };
        prune(w, st.k);
        w.rev++;
      }
      if (sc && sc.n !== st.n) {
        sc.n = st.n;
        w.rev++;
      }
      const top = topOf(w);
      if (JSON.stringify(top) !== before) out.push({ to: "peers", m: { t: "top", top } });
      out.push({ to: "me", m: { t: "jobs", now, jobs: w.jobs, top, pts: sc?.pts ?? 0 } });
      return out;
    }
    case "dr":
      st.job = null;
      return [];
  }
  // the jobs and the money: only for someone who's come in
  if (!w || !st.n) return [];
  if (m.t === "buy" || m.t === "dood") return spend(st, m, w);
  const out: Send[] = tidy(w, now, rnd).map((x) => ({ to: "world", m: x }));
  const job = w.jobs.find((x) => x.j === m.j);
  switch (m.t) {
    case "up":
      // (a second of slack for the clocks)
      if (!job || now < job.at - 1000) return out;
      st.job = m.j;
      out.push({ to: "peers", m: { t: "up", id: st.id, j: m.j } });
      return out;
    case "st":
      if (!job || st.job !== m.j || job.st.includes(m.i)) return out;
      job.st.push(m.i);
      w.rev++;
      out.push({ to: "peers", m: { t: "st", id: st.id, j: m.j, i: m.i } });
      return out;
    case "dn": {
      if (!job || st.job !== m.j) return out;
      st.job = null;
      w.jobs = w.jobs.filter((x) => x !== job);
      const pay = payOf(job.q);
      let pts = pay;
      if (st.k) {
        const sc = (w.scores[st.k] ??= { n: st.n, pts: 0, wins: 0 });
        sc.n = st.n;
        sc.pts += pay;
        sc.wins++;
        pts = sc.pts;
        prune(w, st.k);
      }
      w.rev++;
      out.push({ to: "world", m: { t: "won", id: st.id, n: st.n, j: job.j, q: job.q, pay, pts, top: topOf(w) } });
      for (const next of deal(w, now, RING_AFTER_MS, rnd, job.q)) out.push({ to: "world", m: { t: "ring", job: next } });
      return out;
    }
  }
}

// buying food, and the ambulance: money out (never below zero), and the board if it changed
function spend(st: State, m: { t: "buy"; f: string } | { t: "dood" }, w: WorldState): Send[] {
  const sc = st.k ? w.scores[st.k] : undefined;
  const before = JSON.stringify(topOf(w));
  const out: Send[] = [];
  if (m.t === "buy") {
    const price = FOOD[m.f]!.price;
    if (!sc || sc.pts < price) return [{ to: "me", m: { t: "broke", f: m.f, pts: sc?.pts ?? 0 } }];
    sc.pts -= price;
    out.push({ to: "me", m: { t: "paid", f: m.f, pts: sc.pts } });
  } else {
    st.job = null;
    const lost = sc ? Math.floor(sc.pts / 2) : 0;
    if (sc) sc.pts -= lost;
    out.push({ to: "me", m: { t: "dood", lost, pts: sc?.pts ?? 0 } }, { to: "peers", m: { t: "rip", id: st.id } });
  }
  w.rev++;
  const top = topOf(w);
  if (JSON.stringify(top) !== before) out.push({ to: "world", m: { t: "top", top } });
  return out;
}

// (the board only needs the best; a thousand visitors' worth is plenty)
function prune(w: WorldState, keep: string) {
  const keys = Object.keys(w.scores).filter((k) => k !== keep);
  if (keys.length < MAX_SCORES) return;
  keys.sort((a, b) => w.scores[a]!.pts - w.scores[b]!.pts);
  for (const k of keys.slice(0, keys.length - MAX_SCORES + 1)) delete w.scores[k];
}

// Hand out what handle() returned. `all` is everyone connected (the sender too).
export function route<T>(sends: Send[], me: T, all: Iterable<T>, stOf: (x: T) => State | null, send: (x: T, msg: string) => void) {
  if (!sends.length) return;
  const mine = stOf(me);
  for (const { to, m } of sends) {
    const s = JSON.stringify(m);
    if (to === "me") {
      send(me, s);
      continue;
    }
    for (const x of all) {
      if (x === me && to !== "world") continue;
      if (to === "others") send(x, s);
      else if (mine?.s != null && stOf(x)?.s === mine.s) send(x, s);
    }
  }
}

export const fresh = (): State => ({ id: crypto.randomUUID().slice(0, 8), n: null, s: null, pos: null, k: null, job: null, at: 0, ct: 0 });
export const who = (st: State): Who => ({ id: st.id, n: st.n, s: st.s, pos: st.pos });
