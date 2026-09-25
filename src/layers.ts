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
  POSTERS4: 56,
  POSTERS5: 57,
  RADIOWALL: 58, // 2 x 4 station panels, 2:1 each
  KETNETWALL: 59,
  SPORZAWALL: 60,
  IDENTS: 61, // 2 x 2 channel idents, 16:9 each
  KAMPWALL: 62, // Hec Leemans' Kampioenen mural
  SETSIGNS: 63, // 2 x 2 signs for the TV sets
  PLYWOOD: 64,
  WALLPAPER: 65,
  MISC: 66, // 2 x 2: Kampioenen shirt, scarf, koersboekje, Boma label
  BANNERS: 67, // 4 hall banners, 4:1 each
  POSTERS6: 68,
  SIGNS2: 69, // door signs for the services, 2 x 4
  SIGNS2_FR: 70,
  PLAQUES: 71, // 2 x 4: VIP neon, counters, the CEO's nameplate, dock numbers, a star
  ROLLER: 72, // a loading-dock roller door
  HAZARD: 73, // yellow and black stripes
  CCTV: 74, // the security camera feeds, 3 x 2, sampled from a render target
  PANELS: 75, // Marconi: warm wooden acoustic panels
  CYC: 76, // De Toren: the painted sky, horizon at the bottom
  SHOWSIGN: 77, // 2 x 4: studio numbers, APPLAUS, show logos, Marconi, Toots
  FLATS: 78, // 2 x 2 painted decor flats
  BLOCKWALL: 79, // de gang naar de parking: painted concrete blocks, a dark band at the bottom
  STENCIL: 80, // 2 x 4 stencilled wall markings, on transparent
} as const;

// artworks and their museum labels (8 labels per layer) follow the painted layers
export const ART0 = 81;
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
SCALE[L.PLYWOOD] = 2.4;
SCALE[L.WALLPAPER] = 1.2;
SCALE[L.HAZARD] = 0.8;
SCALE[L.PANELS] = 2.4;
SCALE[L.BLOCKWALL] = 2.5; // one wall height: the band stays at the bottom
SCALE[L.CYC] = 6 * 3.6 + 2.7; // one sky from the floor to the ceiling of De Toren
