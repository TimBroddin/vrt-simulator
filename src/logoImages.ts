// VRT brand logos and two photos of De Kampioenen, painted into texture layers
// (main thread only). Logos from Wikimedia Commons (public domain / CC0); the
// Kampioenen photos are CC BY-SA (see the credits on the start screen).
import canvas from "./logos/canvas.png";
import kampsign from "./logos/kampsign.jpg";
import kampwall from "./logos/kampwall.jpg";
import ketnet from "./logos/ketnet.png";
import ketnet97 from "./logos/ketnet97.png";
import klara from "./logos/klara.png";
import mnm from "./logos/mnm.png";
import radio1 from "./logos/radio1.png";
import radio2 from "./logos/radio2.png";
import sporza from "./logos/sporza.png";
import stubru from "./logos/stubru.png";
import thuis from "./logos/thuis.png";
import tijdloze from "./logos/tijdloze.png";
import vrt1 from "./logos/vrt1.png";

export const LOGO_URLS = { canvas, kampsign, kampwall, ketnet, ketnet97, klara, mnm, radio1, radio2, sporza, stubru, thuis, tijdloze, vrt1 };
export type LogoName = keyof typeof LOGO_URLS;
