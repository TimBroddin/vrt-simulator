// Autosave: where you are in which world, the quests' clock, the pedometer.
// Quest progress is kept per world by the quests themselves, the places you've
// found across all worlds.
export interface Save {
  v: 1;
  seed: number;
  of: number; // the floor the world started on (quest items are placed around it)
  f: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  steps: number;
  meters: number;
  elapsed: number; // seconds on the quests' clock
  active: string | null;
  rec: number;
  at: number; // when it was saved
  where: string;
}

const KEY = "vrt-save";

export function loadSave(): Save | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return s && s.v === 1 && Number.isFinite(s.x) ? (s as Save) : null;
  } catch {
    return null;
  }
}

export function writeSave(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

export function clearSave(seed: number) {
  localStorage.removeItem(KEY);
  localStorage.removeItem(`vrt-quests-${seed}`);
}

export function ago(at: number) {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return "net";
  if (m < 60) return `${m} min geleden`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} uur geleden`;
  const d = Math.round(h / 24);
  return d === 1 ? "gisteren" : `${d} dagen geleden`;
}
