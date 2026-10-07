// Touch controls: left thumb walks (virtual stick), right thumb looks, buttons for the rest.
import type { Player } from "./player";

export const isTouch = () => matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 0 && "ontouchstart" in window);

export interface TouchActions {
  use: () => void;
  lamp: () => void;
  pause: () => void;
  photo: () => void;
  map: () => void;
}

export function setupTouch(player: Player, actions: TouchActions) {
  const root = document.getElementById("touch")!;
  root.style.display = "";
  const base = document.getElementById("stick")!;
  const knob = document.getElementById("knob")!;
  let stickId: number | null = null;
  let lookId: number | null = null;
  let ox = 0, oy = 0, lx = 0, ly = 0;
  const R = 56;

  const setStick = (dx: number, dy: number) => {
    const len = Math.hypot(dx, dy);
    const k = len > R ? R / len : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const mag = Math.min(1, len / R);
    const nx = len > 1e-3 ? dx / len : 0, ny = len > 1e-3 ? dy / len : 0;
    const dead = mag < 0.12 ? 0 : (mag - 0.12) / 0.88;
    player.analog.x = nx * dead;
    player.analog.z = ny * dead;
    player.analog.run = mag > 0.97;
  };

  root.addEventListener(
    "touchstart",
    (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if ((t.target as HTMLElement).closest(".tbtn")) continue;
        if (t.clientX < window.innerWidth * 0.45 && stickId === null) {
          stickId = t.identifier;
          ox = t.clientX;
          oy = t.clientY;
          base.style.display = "block";
          base.style.left = `${ox}px`;
          base.style.top = `${oy}px`;
          setStick(0, 0);
        } else if (lookId === null) {
          lookId = t.identifier;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
      e.preventDefault();
    },
    { passive: false },
  );
  root.addEventListener(
    "touchmove",
    (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === stickId) setStick(t.clientX - ox, t.clientY - oy);
        else if (t.identifier === lookId) {
          player.look((t.clientX - lx) * 2.4, (t.clientY - ly) * 2.4);
          lx = t.clientX;
          ly = t.clientY;
        }
      }
      e.preventDefault();
    },
    { passive: false },
  );
  const end = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickId) {
        stickId = null;
        base.style.display = "none";
        setStick(0, 0);
      } else if (t.identifier === lookId) lookId = null;
    }
  };
  root.addEventListener("touchend", end);
  root.addEventListener("touchcancel", end);

  const btn = (id: string, fn: () => void) => {
    const el = document.getElementById(id)!;
    el.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add("down");
        fn();
      },
      { passive: false },
    );
    el.addEventListener("touchend", () => el.classList.remove("down"));
  };
  btn("t-use", actions.use);
  btn("t-lamp", actions.lamp);
  btn("t-pause", actions.pause);
  btn("t-photo", actions.photo);
  btn("t-map", actions.map);

  return {
    reset() {
      stickId = lookId = null;
      base.style.display = "none";
      setStick(0, 0);
    },
  };
}
