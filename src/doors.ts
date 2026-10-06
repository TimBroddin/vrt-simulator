// Closed doors: walk up to one, E opens it. The chunk with it is built again
// (the leaf, the way through, the light coming out); opened doors are kept,
// per world.
import { CELL, DX, DZ } from "./config";
import { SK, isOpen, sideAt } from "./layout";
import type { Sound } from "./audio";
import type { Player } from "./player";
import type { World } from "./world";

const REACH = 1.7; // m, to the middle of the door

export class Doors {
  prompt = "";
  private key: string;
  private list: [number, number, number, number][] = []; // f, gx, gz, d

  constructor(private world: World, private player: Player, private sound: Sound, seed: number) {
    this.key = `vrt-deuren-${seed}`;
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) ?? "[]");
      if (Array.isArray(saved)) for (const [f, gx, gz, d] of saved) if ([f, gx, gz, d].every(Number.isInteger)) this.open(f, gx, gz, d, false);
    } catch {}
  }

  private open(f: number, gx: number, gz: number, d: number, save = true) {
    this.world.openDoor(f, gx, gz, d);
    this.list.push([f, gx, gz, d]);
    if (save)
      try {
        localStorage.setItem(this.key, JSON.stringify(this.list));
      } catch {}
  }

  // the closed door in front of you, if there's one in reach
  private facing() {
    const P = this.player.pos, f = this.player.floor;
    const gx0 = Math.floor(P.x / CELL), gz0 = Math.floor(P.z / CELL);
    const fx = -Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
    let best: { gx: number; gz: number; d: number } | null = null, bd = REACH;
    for (let gz = gz0 - 1; gz <= gz0 + 1; gz++)
      for (let gx = gx0 - 1; gx <= gx0 + 1; gx++)
        for (let d = 0; d < 4; d++) {
          const s = sideAt(f, gx, gz, d), door = s.door;
          if (!door || door.kind === "elev" || door.w <= 0 || (s.sk !== SK.DOOR && s.sk !== SK.GLASS) || isOpen(door)) continue;
          const x = (gx + 0.5 + DX[d]! * 0.5) * CELL, z = (gz + 0.5 + DZ[d]! * 0.5) * CELL;
          const dx = x - P.x, dz = z - P.z, dist = Math.hypot(dx, dz);
          // (close by, and more or less the way you're looking)
          if (dist >= bd || (dist > 0.6 && (dx * fx + dz * fz) / dist < 0.45)) continue;
          bd = dist;
          best = { gx, gz, d };
        }
    return best;
  }

  // returns true when it used the E press
  update(use: boolean): boolean {
    const door = this.facing();
    this.prompt = door ? "E · DEUR OPENEN" : "";
    if (!door || !use) return false;
    this.open(this.player.floor, door.gx, door.gz, door.d);
    this.sound.creak();
    this.prompt = "";
    return true;
  }
}
