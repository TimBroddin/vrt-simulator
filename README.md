# VRT Simulator

A liminal walking sim through an endless, procedurally generated version of the old VRT building on the Reyerslaan. Built with three.js and Bun.

```bash
bun install
bun run dev     # http://localhost:3000
bun run build   # static site in dist/
```

URL options: `?seed=1234` (same building every time), `?floor=7` (start floor; the default is 0, the ground floor), `?debug` (fps / chunk stats).

On phones and tablets: left thumb walks (push far to run), right thumb looks, plus buttons for E, QUEST, LAMP, FOTO, KAART (the plattegrond) and pause. Play in landscape.

Controls: WASD / ZQSD to walk, Shift to run, mouse to look, E to use things (lifts, quest items), Tab to switch quests, M for the map (plattegrond), K for the minimap, F for the camera lamp, P for a photo, scroll to zoom, N to mute, H to hide the HUD.

## De plattegrond

M (or KAART) opens a misty map of what's around you, turned so the way you're facing is up, drawn from the floor plans: about 100 m, and one floor up or down (`SIGHT` in `src/worldmap.ts`). Beyond that it's fog. Drag to pan, scroll or pinch to zoom, pick a floor on the right. Click a spot to set a waypoint, or pick a place from the list (Sporthal, De Mess, Studio Brussel, Kabinet CEO, ...) and it finds the nearest one in sight. Places out of sight aren't on the list at all. The waypoint shows up on the minimap and as a line at the bottom of the screen: the direction and distance, or on another floor, how many floors up or down and the nearest stairs or lift. See `src/worldmap.ts`.

## Quests

Quests arrive one by one while you wander. Only the active quest counts: pick up another quest's object and you get "telt niet". The signal meter and beeps get stronger as you get closer.

Ben Crabbé's lunchbox, Tom Waes' shoelace, Jan Becaus (who wanders off every few minutes), Felice's ghost and the chairs, flushing every toilet in one of the bathrooms ("geen kak in de toiletten"), Frank Deboosere's umbrella (on the roof), the Journaal prompter stick, the Karrewiet microphone, Frank from Thuis' garage keys (in the parking), a misfiled Pano tape from 1987, Peter Van de Veire's headphones (in an MNM studio), Michel Wuyts' koersboekje (on a Sporza desk), Boma's worst (in De Mess or a canteen), the CEO's spine (on a boardroom table), Karen François' badge (in the VIP-bar, where else) and the intern's badge.

Add a quest by adding an entry to `ITEMS` in `src/quests.ts`. Progress is saved per seed in localStorage.

## How it works

- `layout.ts` generates the building on an infinite grid of 36 m chunks. The corridor spine, stairwells, lift banks, atria and courtyards don't change between floors. Room layouts change per floor. Floor -1 is the parking garage and floor 12 is the roof.
- `furnish.ts` places the lights and props: offices, studios with ON AIR lights, control rooms with monitor walls, the tape archive, the canteen, blue-tiled toilets, and more.
- `chunk.ts` / `props.ts` / `builder.ts` build the geometry in a worker pool. Lighting is baked into the vertices, with occlusion checked cell by cell, so hundreds of fluorescent tubes (some flickering) cost nothing at runtime.
- `textures.ts` paints every surface on a canvas and packs them into one texture array, so the whole world renders with a single material.
- `audio.ts` synthesises all sound: 50 Hz mains hum, ventilation, footsteps that change with the surface, the lift, distant phones and footsteps, and occasional Dutch PA announcements via speech synthesis.

## Art

29 wall works from the VRT collection, currently at auction at Bernaerts ("VRT & XX/XXI", lots 300–442), hang in corridors, atrium galleries, offices, meeting rooms and canteens. Each one has a picture light and a museum label with its lot number. The catalogue is in `src/art.ts` and the images are in `src/art/`. Images come from the auction listing.

## VRT brands

Some studios belong to a brand: a Ketnet studio (LED wall with the K, a green screen, bean bags), a Sporza studio (desk, LED wall, a monitor wall showing the match) and TV sets built inside a studio: Bar Madam from Thuis or the café of FC De Kampioenen, with raw plywood, braces and sandbags behind the flats. Some edit suites are radio studios of Radio 1, Radio 2, Klara, Studio Brussel or MNM. When the ghost radio plays a station, that station's ON AIR lights come on all over the building, and its logo flashes up in the HUD.

Hec Leemans' Kampioenen mural hangs on the gable end of the sporthal (and sometimes in a lobby), with Sporza and Kampioenen banners under the vault and the green-and-yellow shirts on a rack. Corridor posters and TV idents cover Ketnet, Sporza, Thuis, De Kampioenen, De Tijdloze, Radio 2, MNM and Klara.

The brand rooms are chosen by hash (`brandRoom` in `src/layout.ts`), so existing seeds keep their floor plans. The logos are in `src/logos/`, from Wikimedia Commons (public domain / CC0). The two Kampioenen photos are CC BY-SA: the mural by Ferran Cornellà (CC BY-SA 3.0) and the café sign by Druyts.t (CC BY-SA 4.0).

## Behind the scenes

The rekwisieten fill a warehouse two storeys high: rows of tall pallet racks full of props (stacked chairs, lamps, statues, rolled carpets, a throne, a giant die), a lending counter by the doors, and a gallery upstairs looking down over it all. The first one is next to the start, the rest are scattered like the sporthallen.

Among the rooms: the kostuumdienst (rails of costumes, mannequins, hats, a lending counter), kleedkamers with mirrors framed in bulbs and a star on the door, a VIP bar (backlit bottles, a velvet rope), a VIP restaurant (round tables, chandeliers, a wine wall), the CEO's office on the top floors, and loading docks on the ground floor with roller doors, one of them half open onto daylight that isn't there. These rooms are converted by hash in `serviceRoom` (`src/layout.ts`), so existing floor plans stay the same.

## Big places

Like the sporthal and the rekwisieten, these fill a whole block, and the first one of each is near the start:

- **De Decorstraat**: a street inside the building, 6 m wide and two storeys high, where a lorry fits. Decor flats lean against both walls, a lorry is parked in it, and it opens straight into **Studio 5** and **Studio 3**: audience studios with a tribune, an APPLAUS sign, a lighting grid, cameras, and a set (Van Gils & gasten, Blokken).
- **Studio Marconi**: an event space two storeys high, with warm wooden acoustic panels, a gallery behind a glass balustrade reached by a steel stair, a stage, a truss with spots, a projector, bistro chairs. **Studio Toots** is a smaller Marconi, one storey, among the rooms.
- **De Toren**: the Reyers tower indoors, in a hall seven storeys high. The floor is fake grass, the walls and ceiling are a painted sky with the city along the bottom, there's a studio sun on the wall, film lights, plywood trees, and cables holding the tower up. The shaft is hollow: go in through the door at its foot and climb the spiral stair inside, up through the saucer onto the deck on top. The corridors on the floors around it have windows onto it. See `towerSpec` in `src/layout.ts`.

## De gang naar de parking, and de gang naar nergens

In some blocks floor -1 isn't parking but one narrow corridor (1.8 m) twisting through the whole block like a maze, but with only one way: no side turnings, from the foot of the stairwell to the parking next door, often 300 m or more. Where the route passes itself there's a wall in between. Painted concrete blocks with a dark band along the bottom, a concrete floor, a low ceiling full of pipes (the red one is for the sprinklers), round lamps on the walls, and the distance stencilled on the wall. Rarely, a whole block on an office floor is the same maze: de gang naar nergens. It starts at a corridor and simply ends, and someone from the vakbond is waiting there. See `mazeAt` in `src/layout.ts`.

## De poppen van de vakbond

Flat figures cut out of MDF, standing in a block of pine, placed around the building by the vakbond ("77 poppen voor 77 collega's"). Now and then one stands against a corridor wall, and very rarely a meeting room or an empty room is full of them, all facing the door.

## Plekken and postkaarten

About 45 places are worth finding: the big places, every kind of room, each radio studio, the strange rooms, the top of De Toren. Walk into one and it's yours ("PLEK ONTDEKT"); the count is under the quests and the pause screen lists them all, the ones you haven't found blanked out. They're kept in the browser across worlds. See `src/places.ts`. The start screen has postcards from the building (`src/postcards/`).

## De bewaking

Some control rooms and server rooms are the bewaking: a wall of monitors, a desk with a joystick and a logbook, a key cabinet. Security cameras hang at the ends of corridors and in the corners of studios, canteens, De Mess, the docks, the sporthal, the rekwisieten and the parking. When you're near a bewaking, six cameras around it (on its floor and the ones above and below) are rendered live into the monitors, one feed per frame, with timestamps and the camera's location. The bewaking's own camera shows the bewaking. You're on the feeds too: someone with a camera on their shoulder. See `src/cctv.ts`.

## De middengang and the RTBF

Just north of the start, a glass corridor (de middengang) runs east–west through the whole building on the first floor, like the real one over the street. On every other floor the gap between the two is open air, and the corridors end in windows onto it. Glass links branch off to both sides over an open-air gap. South of it is the VRT. North of it is the RTBF: the same building mirrored, with French labels, RTBF posters and no VRT art. The middengang row is `MID_CZ` in `src/config.ts`.
