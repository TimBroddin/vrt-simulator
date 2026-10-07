import { describe, expect, test } from "bun:test";
import { FOOD, JOB_TTL_MS, OPEN_JOBS, RING_AFTER_MS, START_MONEY, payOf } from "./jobs";
import { VOICE_MAX, VOICE_RATE, fresh, freshWorld, handle, parseToRoom, peersOf, route, voice, type FromRoom, type Parsed, type Send, type State, type WorldState } from "./protocol";
import { ulawDec, ulawEnc } from "./intercom";

// a fixed sequence of "random" numbers, so the deals are the same every run
const seq = () => {
  let k = 0;
  return () => ((k++ * 0.37) % 1);
};
const join = (st: State, w: WorldState, now: number, n = "Bode 12", k = "abcdefgh12", r = false) =>
  handle(st, { t: "n", n, s: 1953, k, r }, now, w, seq());
const msgs = (out: Send[], to?: Send["to"]) => out.filter((o) => !to || o.to === to).map((o) => o.m);
const of = <T extends FromRoom["t"]>(out: Send[], t: T) => msgs(out).filter((m): m is Extract<FromRoom, { t: T }> => m.t === t);

describe("joining", () => {
  test("the first one in deals the jobs, ringing at once", () => {
    const w = freshWorld(), a = fresh();
    const out = join(a, w, 1000);
    expect(w.jobs).toHaveLength(OPEN_JOBS);
    expect(new Set(w.jobs.map((j) => j.q)).size).toBe(OPEN_JOBS);
    expect(w.jobs.every((j) => j.at === 1000)).toBe(true);
    const mine = of(out, "jobs")[0]!;
    expect(mine.jobs).toEqual(w.jobs);
    expect(mine.now).toBe(1000);
    expect(mine.pts).toBe(START_MONEY);
  });

  test("the next one gets the same jobs", () => {
    const w = freshWorld(), a = fresh(), b = fresh();
    join(a, w, 1000);
    const before = structuredClone(w.jobs);
    const out = join(b, w, 2000, "Grimeur 7", "zyxwvuts98");
    expect(w.jobs).toEqual(before);
    expect(of(out, "jobs")[0]!.jobs).toEqual(before);
    expect(of(out, "ring")).toHaveLength(0);
  });

  test("without a world (nothing to deal) it's just the name", () => {
    const a = fresh();
    const out = handle(a, { t: "n", n: "X", s: 5, k: null, r: false }, 0, null);
    expect(msgs(out)).toEqual([{ t: "j", id: a.id, n: "X", s: 5 }]);
  });
});

describe("a job", () => {
  const setup = () => {
    const w = freshWorld(), a = fresh(), b = fresh();
    join(a, w, 1000, "Bode 12", "keyofaaaaa");
    join(b, w, 1000, "Grimeur 7", "keyofbbbbb");
    return { w, a, b, job: w.jobs[0]! };
  };

  test("picking up tells the others, and puts you on it", () => {
    const { w, a, job } = setup();
    const out = handle(a, { t: "up", j: job.j }, 2000, w);
    expect(a.job).toBe(job.j);
    expect(out).toEqual([{ to: "peers", m: { t: "up", id: a.id, j: job.j } }]);
  });

  test("a phone that isn't ringing yet can't be picked up", () => {
    const { w, a, job } = setup();
    job.at = 10_000;
    expect(handle(a, { t: "up", j: job.j }, 2000, w)).toEqual([]);
    expect(a.job).toBeNull();
  });

  test("finishing without picking up counts for nothing", () => {
    const { w, a, job } = setup();
    expect(handle(a, { t: "dn", j: job.j }, 2000, w)).toEqual([]);
    expect(w.jobs).toContain(job);
  });

  test("the first to finish wins: the money, the board, and a new phone a little later", () => {
    const { w, a, b, job } = setup();
    handle(a, { t: "up", j: job.j }, 2000, w);
    handle(b, { t: "up", j: job.j }, 2000, w);
    const out = handle(a, { t: "dn", j: job.j }, 5000, w, seq());
    const won = of(out, "won")[0]!;
    const pay = payOf(job.q);
    expect(won).toMatchObject({ id: a.id, n: "Bode 12", j: job.j, q: job.q, pay, pts: START_MONEY + pay });
    expect(won.top).toEqual([{ n: "Bode 12", pts: START_MONEY + pay }, { n: "Grimeur 7", pts: START_MONEY }]);
    expect(w.scores.keyofaaaaa).toEqual({ n: "Bode 12", pts: START_MONEY + pay, wins: 1 });
    expect(w.jobs.find((x) => x.j === job.j)).toBeUndefined();
    const ring = of(out, "ring");
    expect(ring).toHaveLength(1);
    expect(ring[0]!.job.at).toBe(5000 + RING_AFTER_MS);
    expect(ring[0]!.job.q).not.toBe(job.q);
    expect(w.jobs).toHaveLength(OPEN_JOBS);
    expect(out.every((o) => o.to === "world")).toBe(true);
    expect(a.job).toBeNull();
    // too late: it's gone
    expect(handle(b, { t: "dn", j: job.j }, 5100, w)).toEqual([]);
    expect(w.scores.keyofbbbbb).toEqual({ n: "Grimeur 7", pts: START_MONEY, wins: 0 });
  });

  test("scores add up and come back when you join again", () => {
    const { w, a } = setup();
    let total = START_MONEY;
    for (let k = 0; k < 2; k++) {
      const job = w.jobs[0]!;
      job.at = 0;
      handle(a, { t: "up", j: job.j }, 10_000, w);
      handle(a, { t: "dn", j: job.j }, 10_000, w);
      total += payOf(job.q);
    }
    expect(w.scores.keyofaaaaa!.pts).toBe(total);
    const again = fresh();
    const out = join(again, w, 20_000, "Bode 12", "keyofaaaaa");
    expect(of(out, "jobs")[0]!.pts).toBe(total);
  });

  test("steps are kept once, and only from someone on the job", () => {
    const { w, a, b, job } = setup();
    expect(handle(b, { t: "st", j: job.j, i: 2 }, 2000, w)).toEqual([]);
    handle(a, { t: "up", j: job.j }, 2000, w);
    expect(msgs(handle(a, { t: "st", j: job.j, i: 2 }, 2000, w))).toEqual([{ t: "st", id: a.id, j: job.j, i: 2 }]);
    expect(handle(a, { t: "st", j: job.j, i: 2 }, 2100, w)).toEqual([]);
    expect(job.st).toEqual([2]);
  });

  test("dropping a job takes you off it", () => {
    const { w, a, job } = setup();
    handle(a, { t: "up", j: job.j }, 2000, w);
    handle(a, { t: "dr" }, 3000, w);
    expect(handle(a, { t: "dn", j: job.j }, 3000, w)).toEqual([]);
  });

  test("a job nobody manages is hung up, and another phone rings", () => {
    const { w, a, job } = setup();
    const later = 1000 + JOB_TTL_MS + 1;
    const out = handle(a, { t: "up", j: w.jobs[1]!.j }, later, w, seq());
    const gone = of(out, "gone").map((g) => g.j);
    expect(gone).toContain(job.j);
    expect(gone).toHaveLength(OPEN_JOBS);
    expect(of(out, "ring")).toHaveLength(OPEN_JOBS);
    expect(w.jobs.every((x) => x.at === later + RING_AFTER_MS)).toBe(true);
  });

  test("the rev goes up when something worth saving changes", () => {
    const { w, a, job } = setup();
    const r = w.rev;
    handle(a, { t: "up", j: job.j }, 2000, w);
    expect(w.rev).toBe(r);
    handle(a, { t: "st", j: job.j, i: 0 }, 2000, w);
    expect(w.rev).toBeGreaterThan(r);
  });
});

describe("money", () => {
  const setup = () => {
    const w = freshWorld(), a = fresh(), b = fresh();
    join(a, w, 1000, "Bode 12", "keyofaaaaa");
    join(b, w, 1000, "Grimeur 7", "keyofbbbbb");
    return { w, a, b };
  };

  test("food costs money, and only what you have", () => {
    const { w, a } = setup();
    const out = handle(a, { t: "buy", f: "broodje" }, 2000, w);
    const left = START_MONEY - FOOD.broodje!.price;
    expect(of(out, "paid")).toEqual([{ t: "paid", f: "broodje", pts: left }]);
    expect(w.scores.keyofaaaaa!.pts).toBe(left);
    // dagschotels until there isn't enough for another
    const price = FOOD.dagschotel!.price, n = Math.floor(left / price);
    for (let k = 0; k < n; k++) expect(of(handle(a, { t: "buy", f: "dagschotel" }, 2000, w), "paid")).toHaveLength(1);
    expect(w.scores.keyofaaaaa!.pts).toBe(left - n * price);
    const broke = handle(a, { t: "buy", f: "dagschotel" }, 2000, w);
    expect(broke).toEqual([{ to: "me", m: { t: "broke", f: "dagschotel", pts: left - n * price } }]);
  });

  test("when the board changes, the world hears it", () => {
    const { w, a } = setup();
    // (Bode 12 joined first: ahead of Grimeur 7 on the same money; a koffie puts him behind)
    const out = handle(a, { t: "buy", f: "koffie" }, 2000, w);
    expect(of(out, "top")[0]!.top).toEqual([{ n: "Grimeur 7", pts: START_MONEY }, { n: "Bode 12", pts: START_MONEY - 2 }]);
    expect(out.find((o) => o.m.t === "top")!.to).toBe("world");
  });

  test("starving costs half your money and your job, and the others hear of it", () => {
    const { w, a } = setup();
    const job = w.jobs[0]!;
    handle(a, { t: "up", j: job.j }, 2000, w);
    handle(a, { t: "dn", j: job.j }, 2000, w);
    const before = w.scores.keyofaaaaa!.pts;
    const next = w.jobs[0]!;
    next.at = 0;
    handle(a, { t: "up", j: next.j }, 3000, w);
    const out = handle(a, { t: "dood" }, 3000, w);
    expect(of(out, "dood")).toEqual([{ t: "dood", lost: Math.floor(before / 2), pts: before - Math.floor(before / 2) }]);
    expect(out).toContainEqual({ to: "peers", m: { t: "rip", id: a.id } });
    expect(handle(a, { t: "dn", j: next.j }, 3000, w)).toEqual([]);
  });

  test("starting over puts you back at the starting money (and the board hears it)", () => {
    const { w, a } = setup();
    const job = w.jobs[0]!;
    handle(a, { t: "up", j: job.j }, 2000, w);
    handle(a, { t: "dn", j: job.j }, 2000, w);
    expect(w.scores.keyofaaaaa!.pts).toBeGreaterThan(START_MONEY);
    const again = fresh();
    const out = join(again, w, 3000, "Bode 12", "keyofaaaaa", true);
    expect(w.scores.keyofaaaaa).toEqual({ n: "Bode 12", pts: START_MONEY, wins: 0 });
    expect(of(out, "jobs")[0]!.pts).toBe(START_MONEY);
    expect(out.find((o) => o.m.t === "top")?.to).toBe("peers");
    // (a plain reconnect keeps it)
    handle(a, { t: "buy", f: "koffie" }, 4000, w);
    join(fresh(), w, 5000, "Bode 12", "keyofaaaaa");
    expect(w.scores.keyofaaaaa!.pts).toBe(START_MONEY - FOOD.koffie!.price);
  });

  test("you can't buy before you've come in", () => {
    const w = freshWorld(), a = fresh();
    expect(handle(a, { t: "buy", f: "koffie" }, 0, w)).toEqual([]);
  });
});

describe("parsing", () => {
  test("a name comes with a key, or none if it's no good", () => {
    expect(parseToRoom(JSON.stringify({ t: "n", n: "Bode", s: 1, k: "abcdefgh12" }))).toEqual({ t: "n", n: "Bode", s: 1, k: "abcdefgh12", r: false });
    expect(parseToRoom(JSON.stringify({ t: "n", n: "Bode", s: 1, k: "<script>" }))).toEqual({ t: "n", n: "Bode", s: 1, k: null, r: false });
    expect(parseToRoom(JSON.stringify({ t: "n", n: "Bode", s: 1 }))).toEqual({ t: "n", n: "Bode", s: 1, k: null, r: false });
    expect(parseToRoom(JSON.stringify({ t: "n", n: "Bode", s: 1, k: "abcdefgh12", r: 1 }))).toEqual({ t: "n", n: "Bode", s: 1, k: "abcdefgh12", r: true });
  });

  test("job messages", () => {
    expect(parseToRoom(JSON.stringify({ t: "up", j: 4 }))).toEqual({ t: "up", j: 4 });
    expect(parseToRoom(JSON.stringify({ t: "up", j: -1 }))).toBeNull();
    expect(parseToRoom(JSON.stringify({ t: "dn", j: 1.5 }))).toBeNull();
    expect(parseToRoom(JSON.stringify({ t: "st", j: 4, i: 3 }))).toEqual({ t: "st", j: 4, i: 3 });
    expect(parseToRoom(JSON.stringify({ t: "st", j: 4, i: 99 }))).toBeNull();
    expect(parseToRoom(JSON.stringify({ t: "dr" }))).toEqual({ t: "dr" } as Parsed);
    expect(parseToRoom(JSON.stringify({ t: "buy", f: "broodje" }))).toEqual({ t: "buy", f: "broodje" });
    expect(parseToRoom(JSON.stringify({ t: "buy", f: "kaviaar" }))).toBeNull();
    expect(parseToRoom(JSON.stringify({ t: "buy", f: "toString" }))).toBeNull();
    expect(parseToRoom(JSON.stringify({ t: "dood" }))).toEqual({ t: "dood" });
  });
});

describe("routing", () => {
  test("world and peers stay in the sender's world; others go to everyone else", () => {
    const a = fresh(), b = fresh(), c = fresh();
    a.s = b.s = 1953;
    c.s = 7;
    const got = new Map<State, string[]>([[a, []], [b, []], [c, []]]);
    const send = (x: State, m: string) => got.get(x)!.push(JSON.parse(m).t);
    const all = [a, b, c];
    route([{ to: "world", m: { t: "gone", j: 1 } }], a, all, (x) => x, send);
    route([{ to: "peers", m: { t: "up", id: a.id, j: 1 } }], a, all, (x) => x, send);
    route([{ to: "others", m: { t: "x", id: a.id } }], a, all, (x) => x, send);
    route([{ to: "me", m: { t: "ring", job: { j: 1, q: "ben", ph: 0, at: 0, st: [] } } }], a, all, (x) => x, send);
    expect(got.get(a)).toEqual(["gone", "ring"]);
    expect(got.get(b)).toEqual(["gone", "up", "x"]);
    expect(got.get(c)).toEqual(["x"]);
  });
});

describe("the intercom", () => {
  const frame = (n: number) => new Uint8Array([1, ...new Array(n).fill(0x7f)]);
  const inWorld = (s = 1953) => Object.assign(fresh(), { n: "Bode 12", s });

  test("a frame goes on with the sender's id in front", () => {
    const a = inWorld();
    const out = voice(a, frame(800), 1000)!;
    expect(out[0]).toBe(1);
    expect(new TextDecoder().decode(out.subarray(1, 9))).toBe(a.id);
    expect(out.length).toBe(9 + 800);
    expect(out[9]).toBe(0x7f);
  });

  test("not before you've come in, and nothing that isn't a frame", () => {
    expect(voice(fresh(), frame(10), 0)).toBeNull();
    const a = inWorld();
    expect(voice(a, new Uint8Array([2, 1, 2]), 0)).toBeNull();
    expect(voice(a, new Uint8Array([1]), 0)).toBeNull();
    expect(voice(a, frame(VOICE_MAX + 1), 0)).toBeNull();
  });

  test("no faster than anyone talks", () => {
    const a = inWorld();
    let sent = 0;
    for (let i = 0; i < 100; i++) if (voice(a, frame(800), 1000)) sent++; // (all at once)
    expect(sent).toBe(VOICE_RATE / 800);
    // in real time, it all goes through
    let ok = 0;
    for (let t = 1; t <= 50; t++) if (voice(a, frame(800), 1000 + t * 100)) ok++;
    expect(ok).toBe(50);
  });

  test("only the others in the sender's world hear it", () => {
    const a = inWorld(), b = inWorld(), c = inWorld(7), d = fresh();
    expect([...peersOf(a, [a, b, c, d], (x) => x)]).toEqual([b]);
  });

  test("μ-law gets there and back", () => {
    for (const x of [0, 0.01, -0.2, 0.5, -0.99]) expect(Math.abs(ulawDec(ulawEnc(x)) - x)).toBeLessThan(Math.max(0.002, Math.abs(x) * 0.07));
  });
});
