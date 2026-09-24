// Works from the VRT art collection, auctioned at Bernaerts (VRT & XX/XXI, lots 300-442).
// w/h in metres; the in-situ tile panels by Paul Van Hoeydonck hung in the Reyers building.
export interface Artwork {
  lot: number;
  artist: string;
  title: string;
  w: number;
  h: number;
  frame: "wood" | "alu" | "steel" | "none";
  weight: number;
}

export const ART: Artwork[] = [
  { lot: 304, artist: "KRIS GEYSENS", title: "'Studie n°2', 1972/73", w: 1.2, h: 1.0, frame: "wood", weight: 1 },
  { lot: 305, artist: "KRIS GEYSENS", title: "'Studie n°18', 1972/73", w: 1.2, h: 1.0, frame: "wood", weight: 1 },
  { lot: 306, artist: "GEORGES COLLIGNON (1923-2002)", title: "'Compositie 4', 1977", w: 2.2, h: 0.75, frame: "none", weight: 1 },
  { lot: 307, artist: "GEORGES COLLIGNON (1923-2002)", title: "'Compositie 3', 1977", w: 2.2, h: 0.75, frame: "none", weight: 1 },
  { lot: 308, artist: "GEORGES COLLIGNON (1923-2002)", title: "'Compositie 2', 1977", w: 1.8, h: 0.94, frame: "none", weight: 1 },
  { lot: 309, artist: "GEORGES COLLIGNON (1923-2002)", title: "'Compositie 1', 1977", w: 1.8, h: 0.93, frame: "none", weight: 1 },
  { lot: 310, artist: "JAN VAN COILLIE (1929-1970)", title: "Zonder titel", w: 2.0, h: 0.72, frame: "wood", weight: 1 },
  { lot: 311, artist: "PAUL VAN HOEYDONCK (1925-2025) / KORAMIC", title: "Tegelpaneel, 112 tegels (in situ)", w: 2.6, h: 1.18, frame: "steel", weight: 2.5 },
  { lot: 312, artist: "PAUL VAN HOEYDONCK (1925-2025)", title: "Tegelpaneel, 112 tegels (in situ)", w: 2.6, h: 1.18, frame: "steel", weight: 2.5 },
  { lot: 313, artist: "PAUL VAN HOEYDONCK (1925-2025)", title: "Tegelpaneel, 1972 (in situ)", w: 2.6, h: 1.19, frame: "steel", weight: 2.5 },
  { lot: 314, artist: "JAN COX (1919-1980)", title: "'Vormen van de Aarde', 1979", w: 1.3, h: 1.3, frame: "wood", weight: 1 },
  { lot: 315, artist: "JAN COX (1919-1980)", title: "'Phoenix Arizona', 1976", w: 2.0, h: 0.85, frame: "wood", weight: 1 },
  { lot: 316, artist: "JAN BURSSENS (1925-2002)", title: "'Het beloofde land', 1962", w: 1.5, h: 1.0, frame: "wood", weight: 1 },
  { lot: 317, artist: "KAREL DIERICKX (1940-2014)", title: "'Paviljoen', 1980", w: 1.3, h: 1.3, frame: "none", weight: 1 },
  { lot: 318, artist: "PIERRE VLERICK (1923-1999)", title: "'Doll', 1975", w: 1.3, h: 1.08, frame: "wood", weight: 1 },
  { lot: 319, artist: "GODFRIED VERVISCH (°1930)", title: "'Strand', 1965", w: 1.3, h: 0.97, frame: "wood", weight: 1 },
  { lot: 322, artist: "MARTIN BAEYENS (°1943)", title: "'Reflecties XV Doorway II'", w: 1.2, h: 1.16, frame: "alu", weight: 1 },
  { lot: 324, artist: "POL MARA (1920-1998)", title: "'Euphorie', 1978", w: 0.88, h: 1.3, frame: "alu", weight: 1 },
  { lot: 325, artist: "POL MARA (1920-1998)", title: "'Crazy time', 1978", w: 1.08, h: 1.3, frame: "alu", weight: 1 },
  { lot: 326, artist: "POL MARA (1920-1998)", title: "'Ik zou willen dansen soms', 1978", w: 1.08, h: 1.3, frame: "alu", weight: 1 },
  { lot: 327, artist: "POL MARA (1920-1998)", title: "'Cabaret', 1978", w: 1.08, h: 1.3, frame: "alu", weight: 1 },
  { lot: 328, artist: "POL MARA (1920-1998)", title: "'Color-session', 1978", w: 1.08, h: 1.3, frame: "alu", weight: 1 },
  { lot: 329, artist: "POL MARA (1920-1998)", title: "'Fiesta', 1977", w: 0.88, h: 1.3, frame: "alu", weight: 1 },
  { lot: 330, artist: "HUGO HEYRMAN (°1942)", title: "'Multiversum', 1977", w: 2.0, h: 0.86, frame: "wood", weight: 1 },
  { lot: 340, artist: "CARLITOS SGARBI", title: "'Groen-zwart-wit', 1962", w: 1.1, h: 1.2, frame: "wood", weight: 1 },
  { lot: 342, artist: "MARTHE DONAS (1885-1967)", title: "'Abstraction XI', 1959", w: 1.05, h: 1.2, frame: "wood", weight: 1 },
  { lot: 347, artist: "RENÉ GUIETTE (1893-1976)", title: "'Séjour', 1961", w: 0.64, h: 1.3, frame: "wood", weight: 1 },
  { lot: 356, artist: "MARCEL MAYER (1918-2011)", title: "Zonder titel, 1969", w: 0.73, h: 1.2, frame: "wood", weight: 1 },
  { lot: 357, artist: "BRAM BOGART (1921-2012)", title: "'Les Amis II', 1961", w: 0.66, h: 1.15, frame: "none", weight: 1 },
];

// pick an artwork deterministically, favouring the in-situ panels
const TOTAL = ART.reduce((s, a) => s + a.weight, 0);
export function pickArt(r: number): number {
  let x = r * TOTAL;
  for (let i = 0; i < ART.length; i++) {
    x -= ART[i]!.weight;
    if (x <= 0) return i;
  }
  return ART.length - 1;
}
