// Rybbit custom events (stats.titans.sh). Safe no-ops when the script is blocked.
type Props = Record<string, string | number | boolean>;

const seen = new Set<string>();
const debug = new URLSearchParams(location.search).has("debug");

export function track(name: string, props: Props = {}) {
  if (debug) console.log("[track]", name, props);
  try {
    (window as any).rybbit?.event?.(name, props);
  } catch {
    /* analytics must never break the game */
  }
}

// only the first time per session
export function trackOnce(key: string, name: string, props: Props = {}) {
  if (seen.has(key)) return;
  seen.add(key);
  track(name, props);
}
