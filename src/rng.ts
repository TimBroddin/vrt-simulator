let SEED = 0x5eed;
export function setSeed(s: number) {
  SEED = s >>> 0;
}
export function getSeed() {
  return SEED;
}

export function hash(...n: number[]): number {
  let h = (0x811c9dc5 ^ SEED) >>> 0;
  for (let i = 0; i < n.length; i++) {
    h = Math.imul(h ^ (n[i]! | 0), 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

export class Rng {
  s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(a: number, b: number) {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  range(a: number, b: number) {
    return a + this.next() * (b - a);
  }
  chance(p: number) {
    return this.next() < p;
  }
  pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.next() * a.length)]!;
  }
  weighted<T>(items: readonly [T, number][]): T {
    let total = 0;
    for (const [, w] of items) total += w;
    let r = this.next() * total;
    for (const [v, w] of items) {
      r -= w;
      if (r <= 0) return v;
    }
    return items[items.length - 1]![0];
  }
  shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }
}

export const floorDiv = (a: number, b: number) => Math.floor(a / b);
export const mod = (a: number, b: number) => ((a % b) + b) % b;
