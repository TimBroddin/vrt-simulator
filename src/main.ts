import * as THREE from "three";
import { CELL, CH, DX, DZ, FLOOR_MAX, FLOOR_MIN, H, floorName, isRtbf } from "./config";
import { K, RT, SK, anomalyAt, cellLabel, getPlan, getStructure, mazeAt, sideAt, stairFrame } from "./layout";
import { getFurnished } from "./furnish";
import { hash, setSeed } from "./rng";
import { makeTextureArray } from "./textures";
import { makeGlassMaterial, makeSky, makeTower, makeWorldMaterial } from "./materials";
import { World } from "./world";
import { Player } from "./player";
import { Sound, type Surface } from "./audio";
import { Lifts } from "./lifts";
import { makePost } from "./post";
import { ART_URLS } from "./artImages";
import { LOGO_URLS, type LogoName } from "./logoImages";
import { STATIONS } from "./stations";
import { isTouch, setupTouch } from "./touch";
import { takePhoto } from "./photo";
import { Minimap } from "./minimap";
import { WorldMap, nearestWay } from "./worldmap";
import { ClockFace } from "./clockface";
import { Dashboard } from "./dashboard";
import { DevConsole, WarpMenu, isConsoleKey } from "./devconsole";
import { findWarp, warpNear, type WarpSpot } from "./warp";
import { GhostRadio } from "./radio";
import { LiveTV } from "./live";
import { CCTV } from "./cctv";
import { WeerCam } from "./weer";
import { Cars } from "./cars";
import { Bareels } from "./bareel";
import { PLACES, Places, placeAt } from "./places";
import { layPostcards } from "./postcards";
import { track, trackOnce } from "./analytics";
import { Quests } from "./quests";
import { Finale } from "./finale";
import { ago, clearSave, loadSave, writeSave } from "./save";
import { Visitors } from "./visitors";
import { Chat } from "./chat";
import { NAME_MAX, clean } from "./protocol";

const params = new URLSearchParams(location.search);
const seedParam = params.get("seed");
const seedFromParam = seedParam ? (/^\d+$/.test(seedParam) ? Number(seedParam) : hash(...[...seedParam].map((c) => c.charCodeAt(0)))) : null;
// everyone shares one world (so you meet the others), unless the URL asks for another
const WORLD = 1953;
// continue where you were, unless the URL asks for another world or floor
const saved = loadSave();
const resume = saved && !params.has("floor") && (seedFromParam === null || seedFromParam === saved.seed) ? saved : null;
const seed = seedFromParam ?? resume?.seed ?? WORLD;
setSeed(seed);
const startFloor = params.has("floor") ? Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, Number(params.get("floor")))) : resume ? resume.of : 0;
let debug = params.has("debug");
const touch = isTouch() || params.has("touch");
if (touch) document.body.classList.add("touch");

const $ = (id: string) => document.getElementById(id)!;

// --- renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(touch ? 1 : Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.info.autoReset = false;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 2000);
const loadImg = (u: string) =>
  new Promise<HTMLImageElement | null>((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = u;
  });
const [artImgs, logoImgs] = await Promise.all([
  Promise.all(ART_URLS.map(loadImg)),
  Promise.all(Object.entries(LOGO_URLS).map(async ([k, u]) => [k, await loadImg(u)] as const)).then((e) => Object.fromEntries(e) as Record<LogoName, HTMLImageElement | null>),
]);
const atlas = makeTextureArray(renderer, artImgs, logoImgs, touch ? 256 : 512);
const mat = makeWorldMaterial(atlas);
const glassMat = makeGlassMaterial(mat);
const clockFace = new ClockFace();
mat.uniforms.clockTex!.value = clockFace.tex;
const dash = new Dashboard();
mat.uniforms.dashTex!.value = dash.tex;
const workerUrl = (document.querySelector('meta[name="worker"]') as HTMLMetaElement | null)?.content || "/worker.js";
const world = new World(workerUrl, seed, mat, glassMat, touch ? 1 : 2);
scene.add(world.root);
const sky = makeSky();
scene.add(sky);
const tower = makeTower();
scene.add(tower);
const post = makePost(renderer, scene, camera);
post.setSize(window.innerWidth, window.innerHeight);

const player = new Player();
const sound = new Sound();
const lifts = new Lifts(world, player, sound);

// --- spawn in a straight stretch of corridor near the origin
function spawn(f: number) {
  for (let r = 0; r < 4; r++)
    for (let cz = -r; cz <= r; cz++)
      for (let cx = -r; cx <= r; cx++) {
        const p = getPlan(f, cx, cz);
        let best = -1, bd = 1e9;
        for (let i = 0; i < CH * CH; i++) {
          if (p.kind[i] !== K.CORR || p.zone[i] || mazeAt(f, p.st)) continue;
          const x = i % CH, z = (i / CH) | 0;
          const d = Math.hypot(x - CH / 2, z - CH / 2);
          if (d < bd) { bd = d; best = i; }
        }
        if (best < 0) continue;
        const gx = cx * CH + (best % CH), gz = cz * CH + ((best / CH) | 0);
        let yaw = 0;
        for (let d = 0; d < 4; d++)
          if (sideAt(f, gx, gz, d).sk === SK.OPEN) { yaw = Math.atan2(-DX[d]!, -DZ[d]!); break; }
        return { x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL, yaw };
      }
  return { x: 1.5, z: 1.5, yaw: 0 };
}
// (everyone starts here: a little apart, so you don't all stand in each other)
const sp = spawn(startFloor);
player.pos.set(sp.x + (Math.random() - 0.5) * 1.2, startFloor * H, sp.z + (Math.random() - 0.5) * 1.2);
player.viewY = player.pos.y;
player.yaw = sp.yaw;

// --- surfaces for footsteps and acoustics
function surfaceAt(f: number, gx: number, gz: number): { s: Surface; wet: number } {
  const cx = Math.floor(gx / CH), cz = Math.floor(gz / CH);
  const p = getPlan(f, cx, cz);
  const i = (gz - cz * CH) * CH + (gx - cx * CH);
  switch (p.kind[i]) {
    case K.CORR:
      if (mazeAt(f, p.st)) return { s: "concrete", wet: 0.85 };
      if (p.zone[i] && p.st.atrium?.kind === "garden") return p.zone[i] === 2 ? { s: "tile", wet: 0.6 } : { s: "carpet", wet: 0.4 };
      if (p.zone[i] === 1 || p.zone[i] === 2) return { s: "wood", wet: 0.55 };
      return p.style === 0 ? { s: "tile", wet: 0.5 } : { s: "carpet", wet: 0.28 };
    case K.ROOM: {
      if (anomalyAt(f, gx, gz) === "flooded") return { s: "wet", wet: 0.7 };
      const t = p.rooms[p.room[i]!]!.type;
      if (t === RT.SHOWER) return { s: "wet", wet: 0.6 };
      if (t === RT.BATH || t === RT.SERVER || t === RT.CANTEEN || t === RT.KOFFIE) return { s: "tile", wet: 0.35 };
      if (t === RT.STORAGE || t === RT.ARCHIVE || t === RT.DOCK || t === RT.BIKES) return { s: "concrete", wet: 0.3 };
      if (t === RT.STUDIO || t === RT.KETNET || t === RT.SPORZA || t === RT.SET || t === RT.JOURNAAL || t === RT.WEER || t === RT.TIKTAK) return { s: "wood", wet: 0.12 };
      return { s: "carpet", wet: 0.15 };
    }
    case K.STAIR: return { s: "stair", wet: 0.7 };
    case K.ELEV: return { s: "metal", wet: 0.1 };
    case K.GARAGE: return { s: "concrete", wet: 0.8 };
    case K.ROOF: return { s: "wet", wet: 0.04 };
  }
  return { s: "concrete", wet: 0.3 };
}

const quests = new Quests(world, player, sound, startFloor);
// (the quests are placed around where the world started; then back to where you were)
if (resume) {
  player.pos.set(resume.x, resume.y, resume.z);
  player.viewY = resume.y;
  player.yaw = resume.yaw;
  player.pitch = resume.pitch;
  quests.restore(resume.elapsed, resume.active);
}
const radio = new GhostRadio(sound);
// the station on the air: its studios light up ON AIR, and its logo flashes up in the HUD
let stationTimer = 0;
radio.onStation = (k) => {
  mat.uniforms.radioStation!.value = k;
  if (k < 0) return $("station").classList.remove("show");
  const st = STATIONS[k]!;
  ($("stationlogo") as HTMLImageElement).src = LOGO_URLS[st.logo];
  $("stationname").textContent = st.name.toUpperCase();
  $("station").classList.add("show");
  clearTimeout(stationTimer);
  stationTimer = window.setTimeout(() => $("station").classList.remove("show"), 6000);
};
// on phones and tablets the map starts closed (KAART opens it)
const minimap = new Minimap(!touch);
const worldmap = new WorldMap();
const live = new LiveTV(mat.uniforms);
const cctv = new CCTV(renderer, scene, mat, world, player, touch);
const weer = new WeerCam(renderer, scene, mat, world, player, touch);
const cars = new Cars(scene, mat, world, player, sound, seed);
const bareels = new Bareels(scene, mat, world, player, sound);
// the others walking round
const visitors = new Visitors(world, seed, `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
scene.add(visitors.root);
// who came in, who left, what they said; C to say something
const chat = new Chat();
visitors.onJoin = (n) => chat.line("join", " kwam binnen", n);
visitors.onLeave = (n) => chat.line("leave", " is vertrokken", n);
visitors.onChat = (n, m) => chat.line("chat", m, n);
chat.onSend = (m) => {
  if (visitors.say(m)) chat.line("me", m, visitors.name!);
  else chat.line("note", visitors.online ? "Niets verstuurd" : "Niet verbonden: niemand hoort je");
};
let othersShown = "";
function showOthers() {
  const n = visitors.count, on = visitors.online;
  const key = `${n}${on}`;
  if (key === othersShown) return;
  othersShown = key;
  const txt = !on ? "" : n ? `${n} ${n === 1 ? "ANDER" : "ANDEREN"} IN HET GEBOUW` : "ALLEEN IN HET GEBOUW";
  $("anderen").textContent = txt;
  $("anderen").classList.toggle("some", n > 0);
  $("binnen").textContent = !on ? "" : n ? `${n} ${n === 1 ? "ander is" : "anderen zijn"} al binnen` : "nog niemand binnen";
  $("binnen").classList.toggle("some", n > 0);
}

// --- your visitor's badge: the name the others see
const ROLES = ["Stagiair", "Cameraman", "Klankman", "Scripte", "Floormanager", "Grimeur", "Lichtman", "Monteur", "Bode", "Regisseur", "Weerman", "Nieuwslezer"];
const nameIn = $("name") as HTMLInputElement;
nameIn.maxLength = NAME_MAX;
nameIn.value = localStorage.getItem("vrt-naam") || `${ROLES[(Math.random() * ROLES.length) | 0]} ${10 + ((Math.random() * 90) | 0)}`;
// the barcode follows the name
function barcode() {
  const t = nameIn.value || "?";
  let h = 2166136261, x = 0;
  const stops: string[] = [];
  for (let i = 0; x < 200; i++) {
    h = Math.imul(h ^ t.charCodeAt(i % t.length) ^ i, 16777619);
    const w = 1 + ((h >>> 0) % 4);
    if (i % 2 === 0) stops.push(`#121316 ${x}px ${x + w}px`, `transparent ${x + w}px`);
    x += w;
  }
  $("b-code").style.backgroundImage = `linear-gradient(90deg, ${stops.join(", ")})`;
  $("b-code").style.backgroundSize = `${x}px 100%`;
}
barcode();
nameIn.addEventListener("input", barcode);
// (typing a name doesn't walk you round; Enter goes in)
nameIn.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.code === "Enter" || e.code === "NumpadEnter") begin();
});
nameIn.addEventListener("keyup", (e) => e.stopPropagation());
const today = new Date();
$("b-date").textContent = `${String(today.getDate()).padStart(2, "0")}.${String(today.getMonth() + 1).padStart(2, "0")}.${today.getFullYear()}`;
// plekken: the places you've found, kept across visits
const places = new Places();
$("plekken").textContent = `PLEKKEN ${places.count}`;
places.onFound = (id, name) => {
  $("plekken").textContent = `PLEKKEN ${places.count}`;
  $("plekken").classList.remove("new");
  void $("plekken").offsetWidth;
  $("plekken").classList.add("new");
  quests.toast("PLEK ONTDEKT", `${name} · ${places.count}`, "new");
  sound.chime();
  track("place_found", { place: id, found: places.found.size });
};
places.render($("places"));
layPostcards($("postcards"));
// the radio studio you're standing near (checked a few times a second)
let nearStudio = -1, nearT = 0;
function studioNear(): number {
  const f = player.floor, cx = Math.floor(player.pos.x / (CH * CELL)), cz = Math.floor(player.pos.z / (CH * CELL));
  let best = -1, bd = 14;
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++)
      for (const p of getFurnished(f, cx + dx, cz + dz).props) {
        if (p.t !== "radiologo" || !p.b) continue;
        const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
        if (d < bd) { bd = d; best = p.b - 1; }
      }
  return best;
}
// a ticket dashboard in sight: they only run while someone can see them
function dashNear(): boolean {
  const f = player.floor, cx = Math.floor(player.pos.x / (CH * CELL)), cz = Math.floor(player.pos.z / (CH * CELL));
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++)
      for (const p of getFurnished(f, cx + dx, cz + dz).props)
        if ((p.t === "dashwall" || p.t === "dashstand") && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 30) return true;
  return false;
}
scene.add(quests.root);
// the end: all quests done, the floor gives way, and ten steps later you've finished the game
const finale = new Finale(player, sound, !touch);
scene.add(finale.root);
const doneKey = `vrt-uitgespeeld-${seed}`;
let finishSecs = 0;
quests.onFinish = (secs) => {
  finishSecs = secs;
  finale.start();
};
finale.onEnter = () => {
  // the building is gone: only the hall is drawn
  for (const c of scene.children) if (c !== finale.root) c.visible = false;
  renderer.shadowMap.enabled = !touch;
  document.body.classList.add("finale");
  touchUi?.reset();
  if (worldmap.waypoint) worldmap.setWaypoint(null, "finale");
  sound.setEnv({ roof: false, garage: false, light: 0.3, wet: 0.9 });
  $("loc").textContent = "DPG MEDIA";
  $("floor").textContent = "VILVOORDE";
  $("addr").textContent = "MEDIALAAN 1";
  $("logo").textContent = "dpg";
  $("logo").classList.remove("rtbf");
  track("finale_reached", { seconds: Math.round(finishSecs) });
};
finale.onDone = () => {
  $("endtime").textContent = `${Math.floor(finishSecs / 60)} min ${String(Math.floor(finishSecs % 60)).padStart(2, "0")} s`;
  $("endsteps").textContent = `${steps.toLocaleString("nl-BE")} stappen`;
  $("endcard").classList.add("show");
  sound.success();
  localStorage.setItem(doneKey, "1");
  track("game_completed", { seconds: Math.round(finishSecs), steps, meters: Math.round(pedMeters) });
  if (!touch) document.exitPointerLock?.();
};
$("endcard").addEventListener("click", () => $("endcard").classList.remove("show"));

// the pedometer: every footstep you hear, and how far you've walked
let steps = resume?.steps ?? 0, pedMeters = resume?.meters ?? 0;
let stepsShown = "";
player.onStep = (run) => {
  steps++;
  if (finale.walking) {
    sound.footstep(finale.surface(player.pos.x, player.pos.z), run);
    return finale.step();
  }
  const gx = Math.floor(player.pos.x / CELL), gz = Math.floor(player.pos.z / CELL);
  sound.footstep(surfaceAt(player.floor, gx, gz).s, run);
};

// --- input
let locked = false;
let started = false;
let interact = false;
let lampTarget = 0;
let photoRequested = false;
let playSecs = 0;
let walked = 0;
let lastDigit = -1;
let lastDigitT = 0;
let hudOn = true;
let zoom = 0;
const canvas = renderer.domElement;
// Shortcuts follow the letter on the key (M is next to L on AZERTY); walking
// follows the key's position (WASD / ZQSD). Non-Latin layouts fall back to position.
const letter = (e: KeyboardEvent, l: string) => (/^[a-z]$/i.test(e.key) ? e.key.toLowerCase() === l : e.code === `Key${l.toUpperCase()}`);
document.addEventListener("keydown", (e) => {
  if (dev.open || warpMenu.open || chat.open) return; // they take the keys themselves
  if (worldmap.open) {
    if (letter(e, "m") || e.code === "Escape") closeMap();
    return;
  }
  player.keys.add(e.code);
  if (!locked) return;
  if (isConsoleKey(e)) {
    e.preventDefault();
    return openDev();
  }
  if (lifts.panelOpen) {
    // choosing a floor: the lift panel takes the keys
    const k = e.code;
    if (k === "ArrowUp" || k === "KeyW") lifts.panelInput("up");
    else if (k === "ArrowDown" || k === "KeyS") lifts.panelInput("down");
    else if (k === "KeyE" || k === "Enter" || k === "NumpadEnter") lifts.panelInput("go");
    else if (k === "Backspace") lifts.panelInput("close");
    else if (k === "Minus" || k === "NumpadSubtract") lifts.panelInput(-1);
    else if (/^(Digit|Numpad)\d$/.test(k)) {
      const d = Number(k.slice(-1));
      // "1" then "0"/"1" quickly = 10/11
      const now = performance.now();
      if (lastDigit === 1 && now - lastDigitT < 900 && d <= 1) lifts.panelInput(10 + d);
      else lifts.panelInput(d);
      lastDigit = d;
      lastDigitT = now;
    }
    player.keys.clear();
    return;
  }
  if (letter(e, "e")) interact = true;
  if (e.code === "Tab") {
    e.preventDefault();
    quests.cycle();
  }
  if (letter(e, "f")) lampTarget = lampTarget ? 0 : 1;
  if (letter(e, "n")) sound.setMuted(!sound.muted);
  if (letter(e, "m")) openMap();
  if (letter(e, "k")) {
    minimap.toggle();
    if (minimap.visible) track("minimap_opened", { device: "desktop" });
  }
  if (letter(e, "p")) photoRequested = true;
  if (letter(e, "c")) {
    e.preventDefault();
    openChat();
  }
  if (letter(e, "h")) {
    hudOn = !hudOn;
    $("hud").style.display = hudOn ? "" : "none";
  }
});
document.addEventListener("keyup", (e) => {
  player.keys.delete(e.code);
  if (locked && lifts.panelOpen) e.preventDefault();
});
window.addEventListener("blur", () => player.keys.clear());
document.addEventListener("mousemove", (e) => {
  if (locked) player.look(e.movementX, e.movementY);
});
document.addEventListener("wheel", (e) => {
  if (locked && lifts.panelOpen) return lifts.panelInput(e.deltaY < 0 ? "up" : "down");
  if (locked) zoom = Math.max(0, Math.min(1, zoom + e.deltaY * -0.001));
});
// the plattegrond, the console and the warp menu free the mouse without pausing
const menuOpen = () => worldmap.open || dev.open || warpMenu.open || chat.open;
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  $("overlay").classList.toggle("hidden", locked || menuOpen());
  if (!locked && started && !menuOpen()) {
    places.render($("places"));
    $("overlay").classList.add("paused");
    player.keys.clear();
  }
});
// the lock can be refused right after leaving it (Esc): fall back to the pause card
document.addEventListener("pointerlockerror", () => {
  if (!started || menuOpen()) return;
  $("overlay").classList.remove("hidden");
  $("overlay").classList.add("paused");
});

// --- chat (C): the mouse is freed while you type, like the console
function openChat() {
  if (chat.open || !started || worldmap.open) return;
  player.keys.clear();
  touchUi?.reset();
  chat.show();
  if (!touch) document.exitPointerLock?.();
}
chat.onClose = relock;

// --- de plattegrond
function openMap() {
  if (worldmap.open || !started || finale.active) return;
  player.keys.clear();
  touchUi?.reset();
  worldmap.show(player.pos.x, player.pos.z, player.floor, player.yaw, quests.activeTarget());
  track("worldmap_opened", { device: touch ? "touch" : "desktop" });
  if (!touch) document.exitPointerLock?.();
}
function closeMap() {
  if (!worldmap.open) return;
  worldmap.hide();
  relock();
}
// back to walking around (if the lock is refused, the pause card)
function relock() {
  if (touch) return;
  const r = canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
  r?.catch?.(() => {
    $("overlay").classList.remove("hidden");
    $("overlay").classList.add("paused");
  });
}
worldmap.onClose = closeMap;
worldmap.onMinimap = () => minimap.toggle();
worldmap.onChange = (w, how) => {
  if (w) track("waypoint_set", { how, label: w.label, floor: w.f });
};

// --- the debug console (` or ², the key left of 1), and the warp menu behind `warp`
const dev = new DevConsole();
const warpMenu = new WarpMenu([{ id: "quest", name: "De actieve quest" }]);
function openDev() {
  if (dev.open || warpMenu.open || worldmap.open || !started || finale.active) return;
  player.keys.clear();
  touchUi?.reset();
  dev.show();
  if (!touch) document.exitPointerLock?.();
}
dev.onClose = () => {
  if (!warpMenu.open) relock();
};
warpMenu.onClose = relock;
dev.add("pos", "waar ben ik", () => {
  const P = player.pos, gx = Math.floor(P.x / CELL), gz = Math.floor(P.z / CELL);
  return `${P.x.toFixed(1)}, ${P.y.toFixed(1)}, ${P.z.toFixed(1)} · ${floorName(player.floor, isRtbf(Math.floor(gz / CH)))} · ${cellLabel(player.floor, gx, gz)} · blok ${Math.floor(gx / CH)},${Math.floor(gz / CH)}`;
});
dev.add("seed", "de wereld", () => `wereld ${seed} · ${location.origin}${location.pathname}?seed=${seed}`);
dev.add("fps", "fps en chunks aan/uit", () => {
  debug = !debug;
  $("debug").style.display = debug ? "block" : "none";
  return debug ? "debug aan" : "debug uit";
});
dev.add("wie", "wie er nog rondloopt", () => {
  const n = visitors.count;
  return n ? `${n} ${n === 1 ? "ander" : "anderen"} in deze wereld` : "niemand anders in deze wereld";
});
dev.add("plekken", "welke plekken nog te vinden zijn", () => {
  const left = PLACES.filter((p) => !places.found.has(p.id)).map((p) => p.name);
  return `${places.count} ontdekt${left.length ? `\nnog te vinden: ${left.join(", ")}` : ""}`;
});
// (not on the list)
dev.add("warp", null, (args) => {
  warpMenu.show(places.found, args.join(" "));
  dev.hide();
});

// Teleport, and stand still until the building around you has loaded.
let warping = false;
function warpTo(s: WarpSpot, label: string) {
  cars.leave(true);
  player.pos.set(s.x, s.y, s.z);
  player.viewY = s.y;
  player.yaw = s.yaw;
  player.pitch = 0;
  player.vx = player.vz = 0;
  warping = true;
  quests.toast("WARP", label, "ok");
}
warpMenu.onPick = (id, name) => {
  if (lifts.ride) return warpMenu.setNote("Niet tijdens een liftrit");
  warpMenu.setNote("Zoeken…");
  // (a moment for the note to show: finding something far away takes a while)
  setTimeout(() => {
    const P = player.pos, q = quests.activeTarget();
    const s = id === "quest" ? q && warpNear(q.f, q.x, q.z) : findWarp(id, P.x, P.z, player.floor);
    if (!s) return warpMenu.setNote(id === "quest" ? "Geen actieve quest" : `${name}: niets gevonden in de buurt`);
    dev.print(`warp → ${name} · ${floorName(s.f)} · ${s.x.toFixed(1)}, ${s.z.toFixed(1)}`);
    warpTo(s, name);
    warpMenu.hide();
  }, 30);
};

// the waypoint line: direction, distance, and the way up or down
let guideT = 0;
let way: ReturnType<typeof nearestWay> = null;
function guide(dt: number) {
  const w = worldmap.waypoint, el = $("waypoint");
  if (!w || !started) return el.classList.remove("show");
  const P = player.pos, df = w.f - player.floor;
  if ((guideT -= dt) <= 0) {
    guideT = 0.5;
    way = df ? nearestWay(player.floor, P.x, P.z) : null;
  }
  let tx = w.x, tz = w.z, txt: string;
  const d = Math.hypot(w.x - P.x, w.z - P.z);
  if (!df) {
    if (d < 2.5) {
      quests.toast("BESTEMMING BEREIKT", w.label, "ok");
      sound.chime();
      worldmap.setWaypoint(null, "arrived");
      return el.classList.remove("show");
    }
    txt = `${w.label} · ${Math.round(d)} m`;
  } else {
    const fl = `${df > 0 ? "↑" : "↓"} ${Math.abs(df)} ${Math.abs(df) === 1 ? "verdieping" : "verdiepingen"}`;
    const dw = way ? Math.hypot(way.x - P.x, way.z - P.z) : 0;
    if (way && dw > 2) {
      tx = way.x;
      tz = way.z;
      txt = `${w.label} · ${fl} · ${way.kind} ${Math.round(dw)} m`;
    } else txt = `${w.label} · ${fl}`;
  }
  const a = Math.atan2(-(tx - P.x), -(tz - P.z)) - player.yaw;
  (el.firstElementChild as HTMLElement).style.transform = `rotate(${-a}rad)`;
  (el.lastElementChild as HTMLElement).textContent = txt;
  el.classList.add("show");
}

let playing = false; // touch devices: no pointer lock, the overlay decides
const touchUi = touch
  ? setupTouch(player, {
      use: () => (interact = true),
      quest: () => quests.cycle(),
      lamp: () => (lampTarget = lampTarget ? 0 : 1),
      photo: () => (photoRequested = true),
      map: () => (worldmap.open ? closeMap() : openMap()),
      pause: () => {
        places.render($("places"));
        playing = false;
        touchUi?.reset();
        $("overlay").classList.remove("hidden");
        $("overlay").classList.add("paused");
      },
    })
  : null;
$("overlay").addEventListener("click", begin);
function begin() {
  if (!ready) return;
  if (!visitors.name) {
    const n = clean(nameIn.value, NAME_MAX) || nameIn.placeholder || "Bezoeker";
    localStorage.setItem("vrt-naam", n);
    visitors.join(n);
    nameIn.blur();
  }
  if (!started) track("game_start", { seed, floor: startFloor, device: touch ? "touch" : "desktop" });
  sound.start();
  radio.unlock();
  quests.start();
  // ?finale skips to the end; a game that was finished but never reached the hall goes there too
  if (!started && (params.has("finale") || (quests.quests.every((q) => q.done) && !localStorage.getItem(doneKey))))
    setTimeout(() => {
      finishSecs = quests.t - quests.startedAt;
      finale.start();
    }, 1500);
  $("saveinfo").textContent = "Het spel wordt automatisch bewaard";
  if (touch) {
    playing = true;
    $("overlay").classList.add("hidden");
  } else canvas.requestPointerLock?.();
  started = true;
}
$("seed").textContent = String(seed);
($("seedlink") as HTMLAnchorElement).href = `?seed=${seed}`;

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

// --- environment blending
const FOG = {
  indoor: { c: new THREE.Color(0.02, 0.022, 0.024), d: 0.042 },
  garage: { c: new THREE.Color(0.01, 0.011, 0.01), d: 0.05 },
  roof: { c: new THREE.Color(0.74, 0.76, 0.78), d: 0.02 },
};
const fogC = new THREE.Color().copy(FOG.indoor.c);
let fogD = FOG.indoor.d;

let envTimer = 0;
let flickNear = 0;
function updateEnv(dt: number) {
  const f = player.floor;
  const gx = Math.floor(player.pos.x / CELL), gz = Math.floor(player.pos.z / CELL);
  const onRoof = f === FLOOR_MAX && getPlan(f, Math.floor(gx / CH), Math.floor(gz / CH)).kind[((gz % CH) + CH) % CH * CH + (((gx % CH) + CH) % CH)] === K.ROOF;
  const target = onRoof ? FOG.roof : f === FLOOR_MIN ? FOG.garage : FOG.indoor;
  const k = Math.min(1, dt * 1.5);
  fogC.lerp(target.c, k);
  fogD += (target.d - fogD) * k;
  mat.uniforms.fogColor!.value.copy(fogC);
  mat.uniforms.fogDensity!.value = fogD;

  envTimer -= dt;
  if (envTimer > 0) return;
  envTimer = 0.3;
  // how much light is around, and is anything flickering nearby
  let lum = 0;
  flickNear = 0;
  const cx = Math.floor(gx / CH), cz = Math.floor(gz / CH);
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++)
      for (const l of getFurnished(f, cx + dx, cz + dz).lights) {
        if (!l.on) continue;
        const d = Math.hypot(l.x - player.pos.x, l.z - player.pos.z);
        if (d > 7) continue;
        lum += ((l.r + l.g + l.b) / 3) * (1 - d / 7);
        if (l.flick && d < 4.5) flickNear = Math.max(flickNear, 1 - d / 4.5);
      }
  const surf = surfaceAt(f, gx, gz);
  sound.setEnv({ roof: onRoof, garage: f === FLOOR_MIN, light: Math.min(1, lum / 2.5), wet: surf.wet });
  const label = cellLabel(f, gx, gz);
  const fr = isRtbf(Math.floor(gz / CH));
  if (started) {
    places.visit(placeAt(f, player.pos.x, player.pos.z, player.pos.y));
    trackOnce(`floor${f}`, "floor_visited", { floor: f });
    const area = onRoof ? "roof" : f === FLOOR_MIN ? "parking" : /PLANTENTUIN|JARDIN/.test(label) ? "plantentuin" : label === "MIDDENGANG" ? "middengang"
      : label === "ATRIUM" ? "atrium" : STATIONS.some((st) => st.label === label) ? "radio" : /^STUDIO/.test(label) ? "studio" : /REGIE|RÉGIE/.test(label) ? "regie" : /ARCHIEF|ARCHIVES/.test(label) ? "archive"
      : /KANTINE|CANTINE/.test(label) ? "canteen" : /KOFFIEKAMER|CAFÉTÉRIA/.test(label) ? "koffiekamer" : /^DPC$|INFORMATIQUE/.test(label) ? "dpc" : /^KETNET/.test(label) ? "ketnet" : /^SPORZA/.test(label) ? "sporza" : /^DECOR/.test(label) ? "tvset" : /BEWAKING|SÉCURITÉ/.test(label) ? "security" : /DECORSTRAAT|RUE DES/.test(label) ? "decorstraat" : /MARCONI/.test(label) ? "marconi" : /TOOTS/.test(label) ? "toots" : /TOREN|LA TOUR/.test(label) ? "tower" : /VRT-BOS|LE BOIS/.test(label) ? "bos" : /BAREEL|BARRIÈRE/.test(label) ? "bareel" : "";
    if (area) trackOnce(`area:${area}`, "area_discovered", { area });
    if (fr) trackOnce("area:rtbf", "area_discovered", { area: "rtbf" });
  }
  $("loc").textContent = label;
  $("floor").textContent = floorName(f, fr);
  $("addr").textContent = fr ? "BD A. REYERS 52" : "REYERSLAAN 52";
  $("logo").textContent = fr ? "rtbf" : "vrt";
  $("logo").classList.toggle("rtbf", fr);
}

// --- HUD
function timecode(t: number) {
  const fr = Math.floor((t % 1) * 25);
  const s = Math.floor(t) % 60, m = Math.floor(t / 60) % 60, h = Math.floor(t / 3600);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}:${p(fr)}`;
}

// --- loading
let ready = false;
let lastFlickBuzz = 0;
let chunkMs = 0;
world.onChunkMs = (ms) => (chunkMs = chunkMs * 0.9 + ms * 0.1);

let last = performance.now();
let t = 0;
let recT = resume?.rec ?? 0;
let fpsAcc = 0, fpsN = 0;
const fwd = new THREE.Vector3();

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  renderer.info.reset();
  t += dt;
  if (!finale.inHall) world.update(player.pos.x, player.pos.z, player.floor);

  if (!ready) {
    const r = world.readyAround(player.pos.x, player.pos.z, player.floor, 1);
    $("loadbar").style.width = `${Math.round(r * 100)}%`;
    if (r >= 1) {
      ready = true;
      $("overlay").classList.add("ready");
      // a save from before the building changed can put you inside a wall: start over on that floor
      if (resume && world.groundAt(player.pos.x, player.pos.z, player.pos.y) === null) {
        const s = spawn(player.floor);
        player.pos.set(s.x, player.floor * H, s.z);
        player.viewY = player.pos.y;
        player.yaw = s.yaw;
      }
    }
  }

  if (ready) {
    const active = (locked || playing || api.auto) && !menuOpen();
    finale.update(dt);
    if (warping && world.readyAround(player.pos.x, player.pos.z, player.floor, 1) >= 1) warping = false;
    if (finale.walking) player.update(dt, finale, active);
    else if (!finale.active && !warping && !cars.driving) player.update(dt, world, active && !lifts.ride?.phase.startsWith("clos") && !lifts.panelOpen);
    if (active) pedMeters += Math.min(player.speed * dt, 1);
    if (!finale.inHall) {
      if (finale.active) cars.leave(true);
      const inCar = cars.update(dt, interact && !finale.active, active) || !!cars.driving;
      const used = quests.update(dt, interact && active && !finale.active && !inCar);
      lifts.update(t, dt, interact && !used && !inCar && !finale.active);
    }
  }
  interact = false;
  sound.update(dt);
  if (started && (locked || playing)) {
    playSecs += dt;
    walked += Math.min(player.speed * dt, 1);
    for (const m of [5, 15, 30, 60])
      if (playSecs >= m * 60) trackOnce(`play${m}`, "playtime", { minutes: m, meters: Math.round(walked), quests_done: quests.quests.filter((q) => q.done).length });
  }
  radio.update(dt, sound.env.roof);
  if (ready && !finale.inHall && (nearT -= dt) <= 0) {
    nearT = 0.4;
    nearStudio = studioNear();
    dash.active = dashNear();
  }
  live.update(dt, started ? (radio.station >= 0 ? radio.station : nearStudio) : -1);
  if (ready && !finale.inHall) updateEnv(dt);
  if (ready && started && !finale.inHall) cctv.update(dt);
  if (ready && started && !finale.inHall) weer.update(dt);
  if (ready && !finale.inHall) bareels.update(dt);
  showOthers();
  visitors.update(dt, started && ready && !finale.inHall ? { s: seed, x: player.pos.x, y: player.pos.y, z: player.pos.z, a: player.yaw } : null);

  if (flickNear > 0 && t - lastFlickBuzz > 0.12 && Math.random() < flickNear * 0.25) {
    lastFlickBuzz = t;
    sound.flickerBuzz(flickNear);
  }

  player.apply(camera, t);
  cars.apply(camera);
  const fov = 72 - zoom * 42;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 8);
    camera.updateProjectionMatrix();
  }
  camera.getWorldDirection(fwd);
  const u = mat.uniforms;
  u.time!.value = t;
  clockFace.update();
  dash.update(dt);
  u.lampOn!.value += (lampTarget - u.lampOn!.value) * Math.min(1, dt * 10);
  u.lampPos!.value.copy(camera.position).addScaledVector(fwd, -0.1);
  u.lampPos!.value.y -= 0.15;
  u.lampDir!.value.copy(fwd);
  sky.position.copy(camera.position);
  tower.position.set(camera.position.x + 430, -30, camera.position.z - 330);

  if (ready && !finale.inHall) {
    const qt = quests.activeTarget(), wp = worldmap.waypoint;
    minimap.draw(player.floor, player.pos.x, player.pos.z, player.yaw, [...(qt ? [{ ...qt, col: "#ff2e7e" }] : []), ...(wp ? [{ ...wp, col: "#35d6ff" }] : [])]);
    guide(dt);
    worldmap.draw();
  }
  post.cam.uniforms.time!.value = t;
  post.cam.uniforms.glitch!.value = finale.glitch || (lifts.ride?.phase === "moving" ? 0.15 + Math.random() * 0.1 : Math.random() < 0.002 ? 0.6 : 0);
  post.cam.uniforms.fade!.value = finale.fade;
  post.composer.render(dt);
  if (photoRequested) {
    // read the canvas right after rendering, before the browser clears it
    photoRequested = false;
    const gx = Math.floor(player.pos.x / CELL), gz = Math.floor(player.pos.z / CELL);
    const loc = finale.inHall ? "DPG MEDIA" : cellLabel(player.floor, gx, gz);
    track("photo_taken", { floor: player.floor, location: loc });
    takePhoto(renderer.domElement, { hud: hudOn, tc: timecode(recT), floor: finale.inHall ? "MEDIALAAN 1" : floorName(player.floor, isRtbf(Math.floor(gz / CH))), loc });
    sound.shutter();
    const fl = $("flash");
    fl.classList.remove("go");
    void fl.offsetWidth;
    fl.classList.add("go");
  }

  // HUD
  recT += dt;
  if (locked || playing || api.auto) {
    $("tc").textContent = timecode(recT);
    $("rec").style.visibility = Math.floor(t * 1.4) % 2 ? "hidden" : "visible";
    $("prompt").textContent = finale.active ? "" : cars.prompt || quests.prompt || lifts.prompt;
    const disp = lifts.display;
    $("liftdisp").style.display = disp !== null ? "" : "none";
    if (disp !== null) $("liftnum").textContent = disp === String(FLOOR_MAX) ? "D" : disp;
    $("lamp").classList.toggle("on", lampTarget > 0);
    $("zoom").textContent = zoom > 0.02 ? `${(1 + zoom * 3).toFixed(1)}×` : "";
    const ped = `${steps.toLocaleString("nl-BE")} STAPPEN · ${(pedMeters / 1000).toFixed(2).replace(".", ",")} KM`;
    if (ped !== stepsShown) $("stappen").textContent = stepsShown = ped;
  }
  if (debug) {
    fpsAcc += dt;
    fpsN++;
    if (fpsAcc > 0.5) {
      $("debug").textContent = `${Math.round(fpsN / fpsAcc)} fps · ${world.recs.size} chunks · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1000) | 0}k tris · gen ${chunkMs.toFixed(0)}ms · ${player.pos.x.toFixed(1)},${player.pos.y.toFixed(1)},${player.pos.z.toFixed(1)}`;
      fpsAcc = 0;
      fpsN = 0;
    }
  }
}

// --- autosave, every few seconds and when you leave
let restarting = false;
function save() {
  // (not while falling or in the hall: a save keeps you in the building)
  if (!started || !ready || restarting || finale.active) return;
  const P = player.pos, gx = Math.floor(P.x / CELL), gz = Math.floor(P.z / CELL);
  writeSave({
    v: 1, seed, of: startFloor, f: player.floor, x: P.x, y: P.y, z: P.z, yaw: player.yaw, pitch: player.pitch,
    steps, meters: pedMeters, elapsed: quests.t - quests.startedAt, active: quests.active, rec: recT, at: Date.now(),
    where: `${cellLabel(player.floor, gx, gz)} · ${floorName(player.floor, isRtbf(Math.floor(gz / CH))).toLowerCase()}`,
  });
}
setInterval(save, 3000);
addEventListener("pagehide", save);
document.addEventListener("visibilitychange", () => document.hidden && save());
if (resume) {
  $("saveinfo").textContent = `Verder waar je was: ${resume.where} · ${ago(resume.at)}`;
  document.body.classList.add("has-save");
}
let sure = false;
$("restart").addEventListener("click", (e) => {
  e.stopPropagation();
  if (!sure) {
    sure = true;
    $("restart").textContent = "ZEKER? KLIK NOG EENS";
    setTimeout(() => {
      sure = false;
      $("restart").textContent = "OPNIEUW BEGINNEN";
    }, 4000);
    return;
  }
  track("restart", { seed, seconds: Math.round(playSecs) });
  restarting = true;
  clearSave(seed);
  location.href = location.pathname; // back to the start of the shared world
});

// expose for automation / debugging
const api = { player, world, visitors, chat, openChat, camera, lifts, bareels, sound, quests, finale, minimap, worldmap, openMap, closeMap, radio, live, cctv, weer, cars, places, dev, warpMenu, dash, findWarp, warpTo, auto: false, setLamp: (v: number) => (lampTarget = v), press: () => (interact = true), stairFrame, getStructure, getPlan, getFurnished, mazeAt };
(window as any).__vrt = api;
if (debug) $("debug").style.display = "block";
frame();
