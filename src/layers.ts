import { ART } from "./art";

// Texture array layers, shared by the worker (geometry) and main thread (drawing).
export const L = {
  BRICK: 0,
  PLASTER: 1,
  WOODSLAT: 2,
  CEILTILE: 3,
  CEILMETAL: 4,
  TILEDARK: 5,
  CARPET_FLECK: 6,
  CARPET_BLUE: 7,
  LINO: 8,
  CONCRETE: 9,
  TILE_BLUE: 10,
  BRICK_DOTS: 11,
  WOOD_FLOOR: 12,
  BLACK: 13,
  STEEL: 14,
  DOOR_WOOD: 15,
  DOOR_STEEL: 16,
  ELEV_DOOR: 17,
  LIGHTPANEL: 18,
  EXIT: 19,
  TV_BARS: 20,
  TV_GEDULD: 21,
  POSTERS1: 22,
  POSTERS2: 23,
  NUMBERS: 24,
  SIGNS: 25,
  FACADE: 26,
  GRASS: 27,
  ROOF: 28,
  FABRIC: 29,
  WHITE: 30,
  SCREEN: 31,
  LEDS: 32,
  TAPES: 33,
  FOLIAGE: 34,
  CLOCK: 35,
  WHITEBOARD: 36,
  NWSWALL: 37,
  FROSTED: 38,
  CARPET_GREY: 39,
  TILE_SMALL: 40,
  VRT_LOGO: 41,
  DESK_BUTTONS: 42,
  GRAVEL: 43,
  NOISE: 44,
  VENDING: 45,
  ONAIR: 46,
  PUDDLE: 47,
  POSTERS3: 48,
  SIGNS_FR: 49,
  MIDSIGN: 50,
  DIGITAL: 51, // live LED clock face, sampled from a separate canvas texture
  SPORTFLOOR: 52,
  SLATWIN: 53,
  DARTBOARD: 54,
  CHALK: 55,
} as const;

// artworks and their museum labels (8 labels per layer) follow the painted layers
export const ART0 = 56;
export const LABEL0 = ART0 + ART.length;
export const LAYER_COUNT = LABEL0 + Math.ceil(ART.length / 8);

// Metres covered by one repeat of each tiling texture (0 = explicit UVs).
export const SCALE: number[] = new Array(LAYER_COUNT).fill(1);
SCALE[L.BRICK] = 2.0;
SCALE[L.PLASTER] = 3.0;
SCALE[L.WOODSLAT] = 1.5;
SCALE[L.CEILTILE] = 2.4;
SCALE[L.CEILMETAL] = 1.5;
SCALE[L.TILEDARK] = 2.4;
SCALE[L.CARPET_FLECK] = 2.0;
SCALE[L.CARPET_BLUE] = 2.0;
SCALE[L.CARPET_GREY] = 2.0;
SCALE[L.LINO] = 1.5;
SCALE[L.CONCRETE] = 4.0;
SCALE[L.TILE_BLUE] = 1.2;
SCALE[L.TILE_SMALL] = 1.2;
SCALE[L.BRICK_DOTS] = 2.0;
SCALE[L.WOOD_FLOOR] = 2.0;
SCALE[L.BLACK] = 2.0;
SCALE[L.STEEL] = 1.2;
SCALE[L.GRASS] = 3.0;
SCALE[L.ROOF] = 5.0;
SCALE[L.FABRIC] = 1.0;
SCALE[L.WHITE] = 1.0;
SCALE[L.GRAVEL] = 2.0;
SCALE[L.TAPES] = 1.2;
SCALE[L.LEDS] = 0.6;
