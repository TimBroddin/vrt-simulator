// World dimensions (meters). The building is an infinite grid of cells.
export const CELL = 3; // one grid cell
export const CH = 12; // cells per chunk side
export const CHUNK = CELL * CH;
export const H = 3.6; // floor-to-floor height
export const CEIL = 2.7; // suspended ceiling height
export const T = 0.12; // half wall thickness (each cell draws its own inset face)
export const DOOR_H = 2.1;
export const EYE = 1.62;

// De middengang: a band of chunks along z between the VRT (south) and its
// mirror twin, the RTBF (north).
export const MID_CZ = -1;
export const SNAKE_HALF = 0.9; // de gang naar de parking is 1.8 m wide
export const MID_FLOOR = 0; // the only floor with a middengang; elsewhere the gap is open air
export const isRtbf = (cz: number) => cz < MID_CZ;

export const FLOOR_MIN = -1; // parking garage
export const FLOOR_MAX = 12; // roof

// Stair frame (u runs away from the corridor, v across the two lanes)
export const ST_U1 = 1.4;
export const ST_U2 = 4.6;
export const ST_VM = 1.5;
export const ST_HALF = H / 2;

export const DX = [1, 0, -1, 0];
export const DZ = [0, 1, 0, -1];

export function floorName(f: number, fr = false): string {
  if (fr) {
    if (f === FLOOR_MAX) return "TOIT";
    if (f === FLOOR_MIN) return "PARKING -1";
    if (f === 0) return "REZ-DE-CHAUSSÉE";
    return `ÉTAGE ${f}`;
  }
  if (f === FLOOR_MAX) return "DAK";
  if (f === FLOOR_MIN) return "PARKING -1";
  if (f === 0) return "GELIJKVLOERS";
  return `VERDIEPING ${f}`;
}
