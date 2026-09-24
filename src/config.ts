// World dimensions (meters). The building is an infinite grid of cells.
export const CELL = 3; // one grid cell
export const CH = 12; // cells per chunk side
export const CHUNK = CELL * CH;
export const H = 3.6; // floor-to-floor height
export const CEIL = 2.7; // suspended ceiling height
export const T = 0.12; // half wall thickness (each cell draws its own inset face)
export const DOOR_H = 2.1;
export const EYE = 1.62;

export const FLOOR_MIN = -1; // parking garage
export const FLOOR_MAX = 12; // roof

// Stair frame (u runs away from the corridor, v across the two lanes)
export const ST_U1 = 1.4;
export const ST_U2 = 4.6;
export const ST_VM = 1.5;
export const ST_HALF = H / 2;

export const DX = [1, 0, -1, 0];
export const DZ = [0, 1, 0, -1];

export function floorName(f: number): string {
  if (f === FLOOR_MAX) return "DAK";
  if (f === FLOOR_MIN) return "PARKING -1";
  if (f === 0) return "GELIJKVLOERS";
  return `VERDIEPING ${f}`;
}
