// The jobs the phones hand out, as far as the room needs to know them: which
// there are and what they pay (your money is your score). Who calls, what they
// say and where the thing is are in quests.ts (the room never builds the building).
// And what the food costs, so the room can take the money.
export const JOBS: readonly { id: string; pay: number }[] = [
  { id: "ben", pay: 100 },
  { id: "tom", pay: 120 },
  { id: "frank", pay: 150 },
  { id: "thuis", pay: 150 },
  { id: "pano", pay: 120 },
  { id: "peter", pay: 120 },
  { id: "michel", pay: 120 },
  { id: "boma", pay: 100 },
  { id: "ceo", pay: 150 },
  { id: "karen", pay: 120 },
  { id: "koffie", pay: 100 },
  { id: "jan", pay: 200 },
  { id: "felice", pay: 180 },
  { id: "kak", pay: 180 },
];
export const payOf = (q: string) => JOBS.find((d) => d.id === q)?.pay ?? 100;

export const OPEN_JOBS = 3; // phones ringing at once, per world
export const RING_AFTER_MS = 20_000; // when a job is won, the next phone rings this much later
export const JOB_TTL_MS = 20 * 60_000; // nobody managed: the caller hangs up and someone else rings
export const TARGET = 1000; // money on hand: reach it and the floor gives way
export const START_MONEY = 50; // (a few meals, or a few dagschotels)
export const JAN_EVERY_MS = 150_000; // Jan Becaus wanders off this often (the same for everyone)

// what's for sale (by where you buy it, see food.ts): the price and the health it gives back
export const FOOD: Record<string, { name: string; price: number; hp: number }> = {
  water: { name: "Water", price: 0, hp: 3 },
  koffie: { name: "Koffie", price: 2, hp: 10 },
  snoep: { name: "Snoepreep", price: 4, hp: 20 },
  broodje: { name: "Broodje", price: 7, hp: 45 },
  dagschotel: { name: "Dagschotel", price: 12, hp: 80 },
};
// a full stomach: less than half of it still fits (you can eat it anyway, but you might get sick, see food.ts)
export const tooFull = (hp: number, food: string) => 100 - hp < FOOD[food]!.hp / 2;
