import * as THREE from "three";
import { CELL, CH, DX, DZ, FLOOR_MAX, FLOOR_MIN, H, floorName, isRtbf } from "./config";
import { K, RT, SK, anomalyAt, cellLabel, getPlan, getStructure, sideAt, stairFrame } from "./layout";
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
import { ClockFace } from "./clockface";
import { GhostRadio } from "./radio";
import { LiveTV } from "./live";
import { track, trackOnce } from "./analytics";
import { Quests } from "./quests";

const params = new URLSearchParams(location.search);
const seedParam = params.get("seed");
const seed = seedParam ? (/^\d+$/.test(seedParam) ? Number(seedParam) : hash(...[...seedParam].map((c) => c.charCodeAt(0)))) : (Math.random() * 1e6) | 0;
setSeed(seed);
const startFloor = params.has("floor") ? Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, Number(params.get("floor")))) : 3 + (seed % 7);
const debug = params.has("debug");
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
          if (p.kind[i] !== K.CORR || p.zone[i]) continue;
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
const sp = spawn(startFloor);
player.pos.set(sp.x, startFloor * H, sp.z);
player.viewY = player.pos.y;
player.yaw = sp.yaw;

// --- surfaces for footsteps and acoustics
function surfaceAt(f: number, gx: number, gz: number): { s: Surface; wet: number } {
  const cx = Math.floor(gx / CH), cz = Math.floor(gz / CH);
  const p = getPlan(f, cx, cz);
  const i = (gz - cz * CH) * CH + (gx - cx * CH);
  switch (p.kind[i]) {
    case K.CORR:
      if (p.zone[i] && p.st.atrium?.kind === "garden") return p.zone[i] === 2 ? { s: "tile", wet: 0.6 } : { s: "carpet", wet: 0.4 };
      if (p.zone[i] === 1 || p.zone[i] === 2) return { s: "wood", wet: 0.55 };
      return p.style === 0 ? { s: "tile", wet: 0.5 } : { s: "carpet", wet: 0.28 };
    case K.ROOM: {
      if (anomalyAt(f, gx, gz) === "flooded") return { s: "wet", wet: 0.7 };
      const t = p.rooms[p.room[i]!]!.type;
      if (t === RT.BATH || t === RT.SERVER || t === RT.CANTEEN) return { s: "tile", wet: 0.35 };
      if (t === RT.STORAGE || t === RT.ARCHIVE || t === RT.DOCK) return { s: "concrete", wet: 0.3 };
      if (t === RT.STUDIO || t === RT.KETNET || t === RT.SPORZA || t === RT.SET) return { s: "wood", wet: 0.12 };
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
const live = new LiveTV(mat.uniforms);
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
scene.add(quests.root);
quests.onFinish = (secs) => {
  $("endtime").textContent = `${Math.floor(secs / 60)} min ${String(Math.floor(secs % 60)).padStart(2, "0")} s`;
  $("endcard").classList.add("show");
};
$("endcard").addEventListener("click", () => $("endcard").classList.remove("show"));

player.onStep = (run) => {
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
document.addEventListener("keydown", (e) => {
  player.keys.add(e.code);
  if (!locked) return;
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
  if (e.code === "KeyE") interact = true;
  if (e.code === "Tab") {
    e.preventDefault();
    quests.cycle();
  }
  if (e.code === "KeyF") lampTarget = lampTarget ? 0 : 1;
  if (e.code === "KeyN") sound.setMuted(!sound.muted);
  if (e.code === "KeyM") {
    minimap.toggle();
    if (minimap.visible) track("minimap_opened", { device: "desktop" });
  }
  if (e.code === "KeyP") photoRequested = true;
  if (e.code === "KeyH") {
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
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  $("overlay").classList.toggle("hidden", locked);
  if (!locked && started) {
    $("overlay").classList.add("paused");
    player.keys.clear();
  }
});
let playing = false; // touch devices: no pointer lock, the overlay decides
const touchUi = touch
  ? setupTouch(player, {
      use: () => (interact = true),
      quest: () => quests.cycle(),
      lamp: () => (lampTarget = lampTarget ? 0 : 1),
      photo: () => (photoRequested = true),
      map: () => {
        minimap.toggle();
        if (minimap.visible) track("minimap_opened", { device: "touch" });
      },
      pause: () => {
        playing = false;
        touchUi?.reset();
        $("overlay").classList.remove("hidden");
        $("overlay").classList.add("paused");
      },
    })
  : null;
$("overlay").addEventListener("click", () => {
  if (!ready) return;
  if (!started) track("game_start", { seed, floor: startFloor, device: touch ? "touch" : "desktop" });
  sound.start();
  radio.unlock();
  quests.start();
  if (touch) {
    playing = true;
    $("overlay").classList.add("hidden");
  } else canvas.requestPointerLock?.();
  started = true;
});
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
    trackOnce(`floor${f}`, "floor_visited", { floor: f });
    const area = onRoof ? "roof" : f === FLOOR_MIN ? "parking" : /PLANTENTUIN|JARDIN/.test(label) ? "plantentuin" : label === "MIDDENGANG" ? "middengang"
      : label === "ATRIUM" ? "atrium" : STATIONS.some((st) => st.label === label) ? "radio" : /^STUDIO/.test(label) ? "studio" : /REGIE|RÉGIE/.test(label) ? "regie" : /ARCHIEF|ARCHIVES/.test(label) ? "archive"
      : /KANTINE|CANTINE/.test(label) ? "canteen" : /^KETNET/.test(label) ? "ketnet" : /^SPORZA/.test(label) ? "sporza" : /^DECOR/.test(label) ? "tvset" : "";
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
let recT = 0;
let fpsAcc = 0, fpsN = 0;
const fwd = new THREE.Vector3();

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  renderer.info.reset();
  t += dt;
  world.update(player.pos.x, player.pos.z, player.floor);

  if (!ready) {
    const r = world.readyAround(player.pos.x, player.pos.z, player.floor, 1);
    $("loadbar").style.width = `${Math.round(r * 100)}%`;
    if (r >= 1) {
      ready = true;
      $("overlay").classList.add("ready");
    }
  }

  if (ready) {
    const active = locked || playing || api.auto;
    player.update(dt, world, active && !lifts.ride?.phase.startsWith("clos") && !lifts.panelOpen);
    const used = quests.update(dt, interact && active);
    lifts.update(t, dt, interact && !used);
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
  if (ready && (nearT -= dt) <= 0) {
    nearT = 0.4;
    nearStudio = studioNear();
  }
  live.update(dt, started ? (radio.station >= 0 ? radio.station : nearStudio) : -1);
  if (ready) updateEnv(dt);

  if (flickNear > 0 && t - lastFlickBuzz > 0.12 && Math.random() < flickNear * 0.25) {
    lastFlickBuzz = t;
    sound.flickerBuzz(flickNear);
  }

  player.apply(camera, t);
  const fov = 72 - zoom * 42;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 8);
    camera.updateProjectionMatrix();
  }
  camera.getWorldDirection(fwd);
  const u = mat.uniforms;
  u.time!.value = t;
  clockFace.update();
  u.lampOn!.value += (lampTarget - u.lampOn!.value) * Math.min(1, dt * 10);
  u.lampPos!.value.copy(camera.position).addScaledVector(fwd, -0.1);
  u.lampPos!.value.y -= 0.15;
  u.lampDir!.value.copy(fwd);
  sky.position.copy(camera.position);
  tower.position.set(camera.position.x + 430, -30, camera.position.z - 330);

  if (ready) minimap.draw(player.floor, player.pos.x, player.pos.z, player.yaw, quests.activeTarget());
  post.cam.uniforms.time!.value = t;
  post.cam.uniforms.glitch!.value = lifts.ride?.phase === "moving" ? 0.15 + Math.random() * 0.1 : Math.random() < 0.002 ? 0.6 : 0;
  post.composer.render(dt);
  if (photoRequested) {
    // read the canvas right after rendering, before the browser clears it
    photoRequested = false;
    const gx = Math.floor(player.pos.x / CELL), gz = Math.floor(player.pos.z / CELL);
    track("photo_taken", { floor: player.floor, location: cellLabel(player.floor, gx, gz) });
    takePhoto(renderer.domElement, { hud: hudOn, tc: timecode(recT), floor: floorName(player.floor, isRtbf(Math.floor(gz / CH))), loc: cellLabel(player.floor, gx, gz) });
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
    $("prompt").textContent = quests.prompt || lifts.prompt;
    const disp = lifts.display;
    $("liftdisp").style.display = disp !== null ? "" : "none";
    if (disp !== null) $("liftnum").textContent = disp === String(FLOOR_MAX) ? "D" : disp;
    $("lamp").classList.toggle("on", lampTarget > 0);
    $("zoom").textContent = zoom > 0.02 ? `${(1 + zoom * 3).toFixed(1)}×` : "";
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

// expose for automation / debugging
const api = { player, world, camera, lifts, sound, quests, minimap, radio, live, auto: false, setLamp: (v: number) => (lampTarget = v), press: () => (interact = true), stairFrame, getStructure, getPlan, getFurnished };
(window as any).__vrt = api;
if (debug) $("debug").style.display = "block";
frame();
