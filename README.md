# VRT Simulator

A liminal walking sim through an endless, procedurally generated version of the old VRT building on the Reyerslaan. Built with three.js and Bun.

```bash
bun install
bun run dev     # http://localhost:3000
bun run build   # static site in dist/
```

URL options: `?seed=1234` (another building; without it everyone is in the same one, world 1953), `?floor=7` (start floor; the default is 0, the ground floor), `?debug` (fps / chunk stats).

## De debug console

The key left of 1 (`` ` `` or `²`) opens a console at the top of the screen. `help` lists the commands (`pos`, `seed`, `fps`, `wie`, `uitleg`, `plekken`, `clear`, `exit`), but not all of them: `warp` opens the warp menu. It lists every plek (and the nearest ringing phone); type to filter, ↑↓ and Enter (or click) to go. It finds the nearest one on any floor, well beyond what the plattegrond shows, and puts you just inside its door, clear of the furniture. `warp sport` opens the menu already filtered. Warping while you're on a job forfeits it ("Gewarpt: telt niet"). See `src/devconsole.ts` and `src/warp.ts`. Not on phones and tablets (no keyboard).

On phones and tablets: left thumb walks (push far to run), right thumb looks, plus buttons for E, LAMP, FOTO, KAART (the plattegrond) and pause. Play in landscape.

The HUD also has a pedometer: the steps you've taken and how far you've walked.

The game saves itself every few seconds (the world, where you are, your health, the pedometer) and continues there next time; your money is kept by the room; OPNIEUW BEGINNEN on the start or pause screen starts over, back at the start of the shared world. The places you've found are kept either way. See `src/save.ts`.

Controls: WASD / ZQSD to walk, Shift to run, mouse to look, E to use things (lifts, phones, quest items, food, closed doors), M for the map (plattegrond), K for the minimap (heading up, about 33 m to the rim, with ticks that turn with you and north on the rim; what's off the map sits on the rim with a chevron pointing the way), F for the camera lamp, P for a photo, C to chat, V (hold, at a radio studio's desk) for the intercom, X to skip the tutorial, scroll to zoom, N to mute, H to hide the HUD.

## Your first day

The first time you play, five short cards on the left walk you through it: walking and looking, picking up a ringing phone (the green icon), the job and the plattegrond, money, health and food, doors and chat. Each one goes when you've done what it says (or after a while). X skips them (a tap on phones and tablets); `uitleg` in the console shows them again. See `src/tutorial.ts`.

## Doors

Some doors are closed. Walk up to one and E opens it: its chunk is built again, so the leaf swings open, you can walk through, and the light from the room spills out. The doors you opened are kept per world (OPNIEUW BEGINNEN closes them again). They're kept apart from the plan's own open doors, which decide where quest items go, so opening one never moves an item. See `src/doors.ts` and `openDoor` in `src/layout.ts`.

## Loading

The button on the start screen is the loading bar: the script, de kunst ophangen (the art and logos, and the generation worker, downloaded once for all its threads), de muren schilderen (the texture array), de gangen bouwen (the chunks around you), then BINNENGAAN.

## Multiplayer

Everyone is in one room and, unless the URL picks another seed, in one world, the same building, starting in the same corridor. You see the others walking around as camera operators, on your floor, within 60 m. Positions go round 5 times a second while you move, nothing while you stand still.

The start screen asks your name on a visitor's badge (a random one is filled in, like "Stagiair 42"; whatever you pick is remembered). The HUD shows how many others are in the building, bottom left, with a feed of who came in, who left, what they said, who picked up a phone, who won and who starved. C opens a line to chat with everyone in your world (Enter sends, Esc closes). The others are yellow dots on the minimap (on your floor) and on the plattegrond (in sight, with their names); the plattegrond also lists everyone under ANDEREN, and clicking a name sets a waypoint to where they are. In the console, `wie` tells you how many others there are.

In a radio studio, at the desk with the microphones (within 2 m, `MIC_REACH` in `src/main.ts`), hold V (or MIC on phones and tablets, which only shows up there) for the intercom: after the bing-bong, everyone in your world hears you over the building's speakers, thin and a bit overdriven, echoing down the corridor, with the line's hiss. Walk away from the desk and you're cut off. The HUD shows who's on, and the feed who came on. The browser asks for the microphone the first time; it's switched off again 20 seconds after you let go. Your voice goes out as 8 kHz μ-law in tenths of a second, as binary frames over the same socket; the room puts the speaker's id in front and passes it on to the others in your world, no faster than anyone can talk (`voice()` in `src/protocol.ts`). See `src/intercom.ts`.

In production the room is a Cloudflare Durable Object (`server/index.ts`, bound in `wrangler.jsonc`), using the hibernation API, so it isn't billed while nobody moves. With `bun run dev`, the dev server in `index.ts` plays the room. Both speak the protocol in `src/protocol.ts` and share its room logic (tested in `src/protocol.test.ts`: `bun test`); each world's jobs and everyone's money are in the Durable Object's storage (the dev server keeps them in memory); the client is `src/visitors.ts`, the feed and chat line `src/chat.ts`. `bun run deploy` builds and deploys the Worker.

## De plattegrond

M (or KAART) opens a misty map of what's around you, turned so the way you're facing is up, drawn from the floor plans: about 100 m, and one floor up or down (`SIGHT` in `src/worldmap.ts`). Beyond that it's fog. Drag to pan, scroll or pinch to zoom, pick a floor on the right. Stairwells (an amber square with steps), lift banks (a pink one with ▲▼) and food (an orange disc: a drop for the water cooler, a candy for the vending machine, a cup for koffie, a broodje, fork and knife for the dagschotel; one per counter or machine) have an icon, here and on the minimap (`waysIn` in `src/minimap.ts`, the icons in `src/mapicons.ts`). Click a spot to set a waypoint, or pick a place from the list (Sporthal, De Mess, Studio Brussel, Kabinet CEO, ...) and it finds the nearest one in sight. Places out of sight aren't on the list at all. The waypoint shows up on the minimap and as a line at the bottom of the screen: the direction and distance, or on another floor, how many floors up or down and the nearest stairs or lift. See `src/worldmap.ts`.

## Quests

Quests work like the jobs in GTA 2. Old internal phones hang on the corridor walls (`wallphone` in `src/furnish.ts`, placed by hash on bare walls so nothing else moves). Three jobs are open at a time, and each rings on one phone on every floor (around the start), so wherever you are there's a phone for each job: you hear the nearest one on your floor ringing (louder as you come closer, from the side it's on), and only the ones on your floor are shown: a ringing phone icon on the minimap and the plattegrond (no labels: the icon says it), and the HUD lists them with their distance. Walk up and E picks up: the caller tells you what they've lost (read out by the browser's Dutch voice, with subtitles), and the clock starts, worked out from how far away the thing is. Run out of time and it's "OPDRACHT MISLUKT"; go back to a ringing phone to try again. One job at a time: while you're on one, the other phones won't let you pick up, and picking up another job's thing gets "telt niet". The signal meter and beeps get stronger as you get closer.

Everyone in the world races for the same jobs. Anyone can pick up a ringing phone, and the phone keeps ringing until the job is won: the first to finish gets the money, and for everyone else on it the job is over ("TE LAAT · Iemand was je voor"). For the chairs and the toilets everyone's pushes and flushes count, and whoever does the last one wins. Twenty seconds later another phone rings, for another job, with its thing somewhere new (the job's number is its variant, so it's in the same spot for everyone). Jan Becaus walks on every two and a half minutes, on the room's clock, so he's in the same spot for everyone too. A job nobody manages in 20 minutes is hung up and another phone rings. The room decides all of this (`src/protocol.ts`); the jobs and what they pay are in `src/jobs.ts`.

Ben Crabbé's lunchbox, Tom Waes' shoelace, Jan Becaus (who wanders off every few minutes), Felice's ghost and the chairs, flushing every toilet in one of the bathrooms ("geen kak in de toiletten"), Frank Deboosere's umbrella (on the roof), Frank from Thuis' garage keys (in the parking), a misfiled Pano tape from 1987, Peter Van de Veire's socks (in an MNM studio), Michel Wuyts' koersboekje (on a Sporza desk), Boma's worst (in De Mess or a canteen), the CEO's spine (on a boardroom table), Karen François' badge (in the VIP-bar, where else) and the coffee cup of the intern who's been looking for the coffee machine since 2019.

Add a quest by adding an entry to `ITEMS` in `src/quests.ts` (with who calls and what they say) and to `JOBS` in `src/jobs.ts` (what it pays). The top three are in the HUD under the jobs.

## Geld en honger

Your money is your score, like in GTA 2: jobs pay it, food costs it, and having € 1000 on hand is what ends the game. You start with € 50, and OPNIEUW BEGINNEN puts you back there (the room hears it on your next join). The room keeps it per world, under a key your browser makes up the first time (`vrt-key`), and it takes the money when you buy something, so the prices (`FOOD` in `src/jobs.ts`) can't be changed in the browser.

Your health drops while you play: from full to nothing in twelve minutes of walking, twice as fast when you run, not while the game is paused. At 30 you're hungry (a toast, a growling stomach, the bar turns red and blinks), at 10 about to faint. Food brings it back: water from the coolers in the corridors (free, once a minute), a koffie at the coffee machines in de koffiekamer (€ 2), a snoepreep from a vending machine (€ 4), a broodje at the broodjesbar (€ 7), the dagschotel at the counter in De Mess (€ 12). Walk up and E. You can always keep eating, but on a full stomach (less than half of it still fits: a koffie above 95, a dagschotel above 60) the prompt warns you ("je zit al vol"), and one time in two you get sick from it. Water never hurts.

One dagschotel in three goes wrong (and so can stuffing yourself): eight seconds later "Oei… die dagschotel", JE BENT ZIEK, and your health goes ten times as fast (a minute from full) until you find a toilet. The screen turns green at the edges, your stomach keeps rumbling, your card says ZIEK and the nearest toilet is on the minimap. At a toilet stall E ("Naar het toilet", only when you're sick) and you're cured; what you lost stays lost. A toilet comes before everything else then, even the dirty ones of the "geen kak" job.

At zero you're dead: the screen goes red (DOOD), you lose your job, the ambulance costs half your money, and a few seconds later you wake up at the entrance with full health. The others read in the feed that you starved.

Your card, bottom right (top right on phones), shows your name, your health and your money; the badge on the pause screen too. See `src/food.ts`.

## Het einde

When you have € 1000 on hand (`TARGET` in `src/jobs.ts`), the floor shakes, cracks, and you fall through it into a giant hall under the building: the entrance of DPG Media (VTM) on the Medialaan, indoors under a painted sky, with the glass front, the dpg media logo, the row of flags (Willy, Joe, Q, vtm, ...), the clipped hedges, the sign on the lawn and the arrow on the bricks. Ten steps in: "Proficiat! Je hebt VRT simulator uitgespeeld". See `src/finale.ts`.

To test it without winning all those jobs: open `?finale` (e.g. `http://localhost:3000/?finale`) and click to start; the floor gives way after 1.5 s. From the console, `__vrt.finale.start()` does the same at any moment. Enough money but never in the hall (say, the tab closed mid-fall): you go there as soon as the room tells you how much you have. After the hall, you just keep playing.

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

**Het DPC** (some big offices, also by hash): where the computer nerds are. Along the longest wall a row of big screens with the live ticket dashboards (open tickets, incidents coming in, the status of VRT MAX, Sporza, the radio streams..., days without an incident: never many) under a red LED clock. Across from them the Red Hat flag. Desks with two screens each (code, a terminal, Grafana, a pipeline), glowing keyboards, energy drinks, rubber ducks, hoodies over the chairs; some desks are standing desks. A stand-up corner with the sprint board on wheels (the burndown and the retro on the back) and a dashboard on a stand, posters ("It works on my machine", "Nooit deployen op vrijdag", RTFM...), and in a corner, on two beanbags, a giant Tux. The dashboards are one live canvas (`src/dashboard.ts`), only redrawn while you're near one. See `furnishDpc` in `src/furnish.ts`.

**De koffiekamer** (some canteens, also by hash): two lime green double doors, with the sign and the "Prijslijst koffiekamer" next to them in the corridor. One door leads into the broodjesbar, a walled-off corner of 6 by 6 m: in through a poortje, tall fridges with drinks and salads, the counter with the fillings under glass, the ovens and panini grills behind it with the menu above, and out through another poortje. Against its outside wall stand the three coffee machines, at table height, with an orange mat in front of each. Away from the doors: high cocktail tables with green and yellow stools, low round tables, one big round table, the Coca-Cola fridge and two vending machines, TVs and a red LED clock, under a slatted metal ceiling. See `furnishKoffie` in `src/furnish.ts`; the doors are placed by `koffieDoors` in `src/layout.ts`.

**De journaalstudio** (some studios, by hash): the LED wall with Brussels at dusk (the Reyers tower on the left, the Atomium on the right), going round the corner; two tall blue panels in front of it, one with the anchor's name on it; the low desk curving round behind the anchor's spot with a strip of light underneath, a standing table that glows, the big rounded-triangle lamp overhead, and nobody at the desk. Three cameras. See `furnishJournaal` in `src/furnish.ts`.

**De weerstudio** (some edit suites, by hash): green key, everything green, with a cove at the foot of the main wall and a cross of tape where the presenter stands. A camera, two return monitors showing the weather map (Belgium, sun and clouds, a shower in the Ardennes) with the studio camera keyed over it: stand on the mark and you see yourself on the monitors, in front of the map (`src/weer.ts`, rendered like the bewaking's feeds), two softboxes, and the weatherman's desk on the far wall. See `furnishWeer`.

**De douches** (some bathrooms): tiled bays along the walls, a slatted bench down the middle, towels on hooks by the door, puddles, and one shower somebody left running. **De fietsenstalling** (some empty rooms and archives on the ground floor): e-bikes nose in at the chargers along the main wall under the LAADPUNT sign, cables to their batteries and green lights when they're charging; rows of bike racks with aisles around them, and a bicycle repair point.

**Het vossenhol** (some big empty rooms, by hash): where the VRT foxes live, after the goat room in Severance. White panelled walls, a bright office ceiling, and under it grassy hills you can walk over (the height is `vosHill` in `src/layout.ts`; the grass is built in `buildHillCell` in `src/chunk.ts`). Foxes everywhere, standing, sitting, asleep or nose in the grass, mostly facing the same way; dry bushes at the foot of the hills, the hole itself on the side of one with two cubs by it, a water trough, a tall vent and a hatch. See `furnishVos`.

**De perszaal** (some big offices): rows of blue fold-down auditorium seats with wooden armrests, a narrow aisle along one wall and a wide one along the windows, their dark blinds down above the reddish radiator covers. At the front the wood-panelled wall with a speaker, the speakers' desk in cherry wood (a laptop, a screen, a row of water bottles, a chair pushed back) and the green VRT roll-up banner. Grey carpet, lilac fabric on the walls, a white ceiling full of small downlights with the raised middle edged in blue, two projectors, and the window of the projection booth at the back. See `furnishPers`.

**Het oude creative lab**: now and then a strip two cells wide is laid out as long as the free space goes (18 to 30 m), its doors on the long sides. Purple carpet, a slatted metal ceiling with beams across and long strip lights. From end to end: the blue wall with a whiteboard full of post-its, a round table with four chairs, the long white desks (white screens and black ones, white table lamps, cables everywhere, mugs, the odd paper hat), another round table, the other whiteboard (on wheels, if that end is all doors). White lockers and big plants along the long side with the most wall. See `furnishLab`, and the strip in `makePlan` (`src/layout.ts`): unlike the other rooms it changes the floor plan around it.

**Het Tiktak-huis** (some big empty rooms): the cardboard house from Tik Tak, life size, against the main wall: the clock tower in the middle with its pointed red roof and the clock with the hand, two wings with red roofs and green-striped curtains in the arches. Cardboard sheep in front, little wooden tower clocks, and a glass case with Tik Tak boxes and books. See `furnishTiktak`.

The door signs, the name panel, and the weather map are on one sheet (`NWS_PX` in `src/layers.ts`); the perszaal, the lab and Tik Tak have their own (`R3_PX`).

## Big places

Like the sporthal and the rekwisieten, these fill a whole block, and the first one of each is near the start:

- **De Decorstraat**: a street inside the building, 6 m wide and two storeys high, where a lorry fits. Decor flats lean against both walls, a lorry is parked in it, and it opens straight into **Studio 5** and **Studio 3**: audience studios with a tribune, an APPLAUS sign, a lighting grid, cameras, and a set (Van Gils & gasten, Blokken).
- **Studio Marconi**: an event space two storeys high, with warm wooden acoustic panels, a gallery behind a glass balustrade reached by a steel stair, a stage, a truss with spots, a projector, bistro chairs. **Studio Toots** is a smaller Marconi, one storey, among the rooms.
- **De Toren**: the Reyers tower indoors, in a hall seven storeys high. The floor is fake grass, the walls and ceiling are a painted sky with the city along the bottom, there's a studio sun on the wall, film lights, plywood trees, and cables holding the tower up. The shaft is hollow: go in through the door at its foot and climb the spiral stair inside, up through the saucer onto the deck on top. The corridors on the floors around it have windows onto it. See `towerSpec` in `src/layout.ts`.
- **Het VRT-bos**: the wood behind the building, indoors, four storeys high under a painted sky: beeches, birches and a few pines, a gravel path from door to door with benches and lampposts, and a red clay tennis court behind a green fence, with a net, an umpire's chair and floodlights. See `bosSpec` in `src/layout.ts`.
- **Station Meiser**: line 26 in its cutting, indoors under a painted sky: two tracks down between two platforms, coming out of a brick tunnel at each end. The station building on the south side has its orange, yellow and grey tiles and a train mural along the bottom, a roof reaching out over the platform and a passage through it from the south door; the retaining wall and the cabin on the north platform are covered in graffiti. Catenary, the MEISER boards, benches, lampposts, a vending machine on each platform. Stairs climb the north wall to a landing by the east portal and a door to the Meiserplein that stays shut. You can't step onto the tracks. Every two and a half minutes a lit train comes out of one tunnel, brakes, stops at the platform for 25 seconds with its doors open, and goes into the other, one way and then the other; it runs on the clock, so everyone sees the same train (`src/trains.ts`; it's only drawn between the tunnel mouths, with a clip box on its own copy of the world material). On the platform the prompt says when the next one comes; stand by an open door and E gets you in: it takes you home to Mortsel (see below). One is near the start. See `MEISER` in `src/layout.ts` and `buildMeiser` in `src/chunk.ts`.
- **De bareel**: the gate at the entrance, indoors under a painted sky: a road with red and white barriers under the steel space-frame canopy (now and then one goes up for a while and its light turns green, see `src/bareel.ts`), high-bay lamps hanging from the sky, traffic lights, a no-entry sign, the blue WELKOM BIJ DE VRT board, a red bike lane. A hedge runs across; on foot the only way through is the brick guard's booth, past the desk and the monitor wall (live camera feeds). One is right next to the start. See `BAREEL` in `src/layout.ts`.
- **De parkeertoren**: takes two blocks: an open parking deck of about 66 by 30 m on every floor, reached over glass footbridges, daylight from all sides, 6 m aisles at both ends. Two ramp lanes, 6 m wide, one in each half, take turns: the ramp of each floor climbs to the next through an opening in its slab (yellow railings round it), so you go up one, along the whole end aisle and up the other, all the way to the roof. A stairwell by the west parapet connects every floor, from the parking below to the roof. The bays are painted on the floor, but empty: the only car on each floor is one you can drive. See `parkLane`, `parkGround` and `specialFor` in `src/layout.ts` and `buildParkLane` in `src/chunk.ts`.
- **"De camping"** (doorgangen): now and then a room links two corridors. You go down four steps into it, through (sometimes past desks), and up four steps into the next corridor. See `makePassages` in `src/layout.ts`.

## Thuis in Mortsel

Get on a train at Meiser and you get off at Mortsel-Oude-God, in the evening: a place of its own, indoors under a painted sky like the finale's hall (the building is hidden while you're there). Down in the cutting, partly under the Stadsplein: two platforms with their red pavers and yellow line, white walls under a strip light, the ribbed concrete overhead, the blue "Mortsel - Oude God" boards, glass shelters, graffiti along the platform edges, and the train you came on pulling out towards Antwerpen, into the tunnel at the open end. Stairs along the walls lead up into the glass station building of 1974 (red benches, the ticket machine, Brandstof at the back) under its big flat canopy on a steel space frame, "Mortsel-Oude-God" on the fascia, "nmbs" on the concrete block. Out on the Stadsplein: bike racks, the blue B, a post box, the Stadhuis; across the Statielei (tram 15 waiting at its stop, rails and wires) on the zebra crossing to number 1 Prins Leopoldlei, the light brick corner block with brown bands and balconies where the Prins Leopoldlei and the Floralaan meet, rows of houses down both streets, a few parked cars. The bells by the door: 1/1 to 1/6.

E at the front door and you go in and sleep: SLAAPWEL, DAG 2 (the days are counted, `vrt-dag`), the alarm, and the next morning you're outside the door again, rested (full health, and cured if a dagschotel got you). Go back into the station and the train to Brussel comes in on perron 1 and waits for you; E at a door and you're back on the platform at Meiser where you got on, ready for work. Before you've slept there are no more trains. Going home forfeits the job you were on; nothing gets hungry and nothing is saved while you're away (reload and you're back on the platform at Meiser). Once you've been there, `warp` lists the station and the house too: picking one takes the train. See `src/mortsel.ts`; the layout follows OpenStreetMap, squeezed.

## Auto's

The only cars in the building are ones you can drive: one on every floor of the parkeertoren, roof included (in the middle aisle of the west half on even floors, the east half on odd ones), and one in an aisle of the parking on -1 in every block. Walk up to one and press E (INSTAPPEN); W/S is gas and brake (hold S when stopped to reverse), A/D steers, the mouse looks round from the driver's seat (the cabin is hollow: the dashboard with its dials and the radio lit, a steering wheel that turns as you steer, tinted glass all round, the doors, the seats, the mirror and the sun visors), E gets you out again once you've stopped (on the driver's side, or wherever there's room). On a phone the left thumb drives and the E button gets in and out. Cars only go where cars go: the parking decks, the ramps of the parkeertoren (all the way to the roof) and the roofs; they bump into walls, pillars and railings. The engine is synthesised like the rest. Where you leave a car is kept, per world. See `src/cars.ts`.

## De gang naar de parking, and de gang naar nergens

In some blocks floor -1 isn't parking but one narrow corridor (1.8 m) twisting through the whole block like a maze, but with only one way: no side turnings, from the foot of the stairwell to the parking next door, often 300 m or more. Where the route passes itself there's a wall in between. Painted concrete blocks with a dark band along the bottom, a concrete floor, a low ceiling full of pipes (the red one is for the sprinklers), round lamps on the walls, and the distance stencilled on the wall. Rarely, a whole block on an office floor is the same maze: de gang naar nergens. It starts at a corridor and simply ends, and someone from the vakbond is waiting there. See `mazeAt` in `src/layout.ts`.

## De poppen van de vakbond

Flat figures cut out of MDF, standing in a block of pine, placed around the building by the vakbond ("77 poppen voor 77 collega's"). Now and then one stands against a corridor wall, and very rarely a meeting room or an empty room is full of them, all facing the door.

## Plekken and postkaarten

About 50 places are worth finding: the big places, every kind of room, each radio studio, the strange rooms, the top of De Toren. Walk into one and it's yours ("PLEK ONTDEKT"); the count is under the quests and the pause screen lists them all, the ones you haven't found blanked out. They're kept in the browser across worlds. See `src/places.ts`. The start screen has postcards from the building (`src/postcards/`).

## De bewaking

Some control rooms and server rooms are the bewaking: a wall of monitors, a desk with a joystick and a logbook, a key cabinet. Security cameras hang at the ends of corridors and in the corners of studios, canteens, De Mess, the docks, the sporthal, the rekwisieten and the parking. When you're near a bewaking, six cameras around it (on its floor and the ones above and below) are rendered live into the monitors, one feed per frame, with timestamps and the camera's location. The bewaking's own camera shows the bewaking. You're on the feeds too: someone with a camera on their shoulder. See `src/cctv.ts`.

## De middengang and the RTBF

Just north of the start, a glass corridor (de middengang) runs east–west through the whole building on the first floor, like the real one over the street. On every other floor the gap between the two is open air, and the corridors end in windows onto it. Glass links branch off to both sides over an open-air gap. South of it is the VRT. North of it is the RTBF: the same building mirrored, with French labels, RTBF posters and no VRT art. The middengang row is `MID_CZ` in `src/config.ts`.
