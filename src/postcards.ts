// Postkaarten: screenshots from the building, lying around the start screen.
import bewaking from "./postcards/bewaking.jpg";
import kampioenen from "./postcards/kampioenen.jpg";
import parking from "./postcards/parking.jpg";
import plantentuin from "./postcards/plantentuin.jpg";
import poppen from "./postcards/poppen.jpg";
import sporthal from "./postcards/sporthal.jpg";
import stoelen from "./postcards/stoelen.jpg";
import toren from "./postcards/toren.jpg";

const CARDS: [string, string][] = [
  [toren, "De Toren"],
  [sporthal, "De sporthal"],
  [poppen, "De kamer vol poppen"],
  [plantentuin, "De plantentuin"],
  [kampioenen, "Café De Kampioenen"],
  [parking, "De gang naar de parking"],
  [bewaking, "De bewaking"],
  [stoelen, "Een leeg lokaal"],
];

export function layPostcards(el: HTMLElement) {
  const tilt = [-7, 4, -3, 6, 5, -6, 3, -4];
  el.innerHTML =
    `<div class="pc-col left"><div class="pc-head">POSTKAARTEN UIT DE VRT SIMULATOR</div>` +
    CARDS.slice(0, 4).map(([src, t], k) => card(src, t, tilt[k]!)).join("") +
    `</div><div class="pc-col right">` +
    CARDS.slice(4).map(([src, t], k) => card(src, t, tilt[k + 4]!)).join("") +
    `</div>`;
}

const card = (src: string, text: string, deg: number) =>
  `<figure class="pc" style="--r:${deg}deg"><img src="${src}" alt="" /><figcaption>${text}</figcaption><i class="stamp"></i></figure>`;
