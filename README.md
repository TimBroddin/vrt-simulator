# VRT Simulator

A liminal walking sim through an endless, procedurally generated version of the old VRT building on the Reyerslaan. Built with three.js and Bun.

```bash
bun install
bun run dev     # http://localhost:3000
bun run build   # static site in dist/
```

URL options: `?seed=1234` (same building every time), `?floor=7` (start floor), `?debug` (fps / chunk stats).

On phones and tablets: left thumb walks (push far to run), right thumb looks, plus buttons for E, QUEST, LAMP, FOTO, KAART and pause. Play in landscape.

Controls: WASD / ZQSD to walk, Shift to run, mouse to look, E to use things (lifts, quest items), Tab to switch quests, M for the minimap, F for the camera lamp, P for a photo, scroll to zoom, N to mute, H to hide the HUD.

## Quests

Quests arrive one by one while you wander. Only the active quest counts: pick up another quest's object and you get "telt niet". The signal meter and beeps get stronger as you get closer.

Ben Crabbé's lunchbox, Tom Waes' shoelace, Jan Becaus (who wanders off every few minutes), Felice's ghost and the chairs, flushing every toilet in one of the bathrooms ("geen kak in de toiletten"), Frank Deboosere's umbrella (on the roof), the Journaal prompter stick, the Karrewiet microphone, Frank from Thuis' garage keys (in the parking), a misfiled Pano tape from 1987, Peter Van de Veire's headphones and the intern's badge.

Add a quest by adding an entry to `ITEMS` in `src/quests.ts`. Progress is saved per seed in localStorage.

## How it works

- `layout.ts` generates the building on an infinite grid of 36 m chunks. The corridor spine, stairwells, lift banks, atria and courtyards don't change between floors. Room layouts change per floor. Floor -1 is the parking garage and floor 12 is the roof.
- `furnish.ts` places the lights and props: offices, studios with ON AIR lights, control rooms with monitor walls, the tape archive, the canteen, blue-tiled toilets, and more.
- `chunk.ts` / `props.ts` / `builder.ts` build the geometry in a worker pool. Lighting is baked into the vertices, with occlusion checked cell by cell, so hundreds of fluorescent tubes (some flickering) cost nothing at runtime.
- `textures.ts` paints every surface on a canvas and packs them into one texture array, so the whole world renders with a single material.
- `audio.ts` synthesises all sound: 50 Hz mains hum, ventilation, footsteps that change with the surface, the lift, distant phones and footsteps, and occasional Dutch PA announcements via speech synthesis.

## Art

29 wall works from the VRT collection, currently at auction at Bernaerts ("VRT & XX/XXI", lots 300–442), hang in corridors, atrium galleries, offices, meeting rooms and canteens. Each one has a picture light and a museum label with its lot number. The catalogue is in `src/art.ts` and the images are in `src/art/`. Images come from the auction listing.

## De middengang and the RTBF

Just north of the start, a glass corridor (de middengang) runs east–west through the whole building on every floor. Glass links branch off to both sides over an open-air gap. South of it is the VRT. North of it is the RTBF: the same building mirrored, with French labels, RTBF posters and no VRT art. The middengang row is `MID_CZ` in `src/config.ts`.
