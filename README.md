# Dead Embers

A 3D zombie survival RPG that runs in the browser. You walk a ruined city, fight and loot by hand, survive story encounters, recruit survivors and build up a metro bunker before the great horde arrives.

- **A world that changes with the story.** Seven biomes: Old Town, the Elm Row suburbs, Kessler Woods and the hills, farmland, the Flooded Quarter, the Docks and the Northern Pass. The woods, the docks and the pass are blocked until the story opens them. Rain, fog and snow change how the dead hear, see and move. The seasons run from autumn to the first snow, and the last night is a snowstorm.
- **Many endings.** Haven by bus, the Convoy with Sgt. Vance's escort, holding the bunker, an alliance with the Warden, storming the Tollmen camp, broadcasting Dr. Okafor's formula from KVAL, the Choir's bells, or walking north alone. Each one adds epilogue lines that depend on the people you helped or failed.
- **Eight character arcs:** Eli, Dr. Okafor, Marcus, the Choir, the Relay, Teodor, Rosa the lamplighter and Sgt. Ada Vance. There are around a hundred encounters, played as moments (rescues, screamers, collapses, locks, races, trades) or short decisions.
- **Every event happens somewhere you can see.**
  - The bitten woman sits in a doorway and calls out.
  - The dead stand on the road ahead.
  - The safe is at the back of the shop you're searching.
  - A stranger walks up to the yard gate.
  - The arc people wait at their own places.

  Walk up and press E (USE) to start it.
- **A backstory intro and cutscenes.** The intro plays once; replay it from the title or the menu. Story beats and endings have short cutscenes you can skip.
- **Companions.** A dog (Biscuit, or a stray you feed) or a survivor can follow you on runs. After a day together the dog fetches for you.
- **Bosses.** Each act has one named dead waiting in its lair: the Orderly in the hospital, the Butcher in the docks' Cold Store, the Sergeant at the Wrecked Convoy. Each guards a guaranteed drop and earns a journal line and an epilogue mention.
- **A world you can touch.** Notes on the walls, bodies to search (crows settle on them by day), hand pumps for clean water, and beds and couches to rest on. Snow keeps your footprints, and the dog's, for a minute or so.
- **Weapons wear** with use but never break; a worn one hits softer. Repair with scrap at the workbench.
- **Night runs pay.** Dawn reports what the night brought in, against your best haul.
- **Several saved worlds** side by side.
- **Quiet ambient sound** that comes only from what is actually around you. There is no music.

**Play online:** https://osamaals.github.io/dead-embers/

**Play locally:** open `index.html` (or `Dead Embers.html`) in any browser, or run `node serve.js` and visit http://localhost:8765. Everything, including Three.js, is inside that one HTML file.

**Controls:**
- Move: WASD. Sprint: Shift. Crouch: C. Dodge: Space.
- Attack: click or J. Interact or search (hold): E. Throw a bottle (lure): G.
- Aim:
  - With a mouse, point at a body and the aim snaps to it.
  - With the keyboard only, lock-on picks the target. F cycles targets, Shift+F clears the lock.
  - The game switches between the two on its own, and every screen works with the keyboard alone.
- Hit an unaware zombie for triple damage.
- **Weapons** (there are eight: knife, lead pipe, nail bat, machete, fire axe, crossbow, pistol, shotgun).
  - Click or tap the weapon name to see every weapon you carry, then pick one.
  - Keys 1–4 pick directly. Q cycles.
  - The Ex-Soldier starts with a pistol and a knife.
- Pack: I. Journal: Tab. Character: B. Map: M. Companion stay / follow: H. Dog, fetch: R. Menu: Esc.
- Saves: several worlds side by side. Continue, Worlds (load or delete; fallen and finished worlds stay as memorials) and New world on the title; Save now and Save as new world in the menu (Esc).
- Zoom: wheel.
- **On phones: played sideways.**
  - A floating joystick on the left.
  - Buttons in an arc under the right thumb. USE, TARGET, THROW and FETCH show only when they do something.
  - The prompt floats over the thing itself, and you can tap it.
  - Tap the companion's name to make them stay or follow.

## How to give input

Everything about this game is driven from this repo's issues.

- **Requests, bugs and ideas:** open an issue with the `input` label. One topic per issue is easiest.
- **Questions from Claude:** issues labelled `question`. Answer in a comment; Claude reads the replies before working.
- When an issue is done, Claude comments with what changed and closes it.

## Project layout

| Path | What it is |
|---|---|
| `src/shell.html` | Page markup and all CSS (HUD, panels, touch controls) |
| `src/data.js` | Items, weapons, enemies, locations, containers, buildings, recipes, backgrounds, traits |
| `src/content.js` | Story scenes (short beats + long journal text), lore, radio, names, shelter events |
| `src/encounters.js` | Outdoor encounters: gameplay moments (`play`) and real decisions (`choices`) |
| `src/arcs.js` | Multi-part character story arcs |
| `src/engine.js` | Game rules: world grid, survival, shelter, combat numbers, unlocks, objectives, story, save/load (no 3D, testable headless) |
| `src/world.js` | Builds the 3D world from the grid: biomes, nature, interiors, shelter yard, gates, small animations |
| `src/render.js` | Renderer, camera, day/night and weather lighting, rain/snow/leaves, flashlight |
| `src/actors.js` | Procedural low-poly people and zombies with animation |
| `src/combat.js` | Player controller, real-time combat, zombie AI, drops, survivors, horde waves |
| `src/moments.js` | Gameplay moments for encounters (rescues, screamers, collapses, locks, races, barter) |
| `src/places.js` | Where each event happens: people, animals, the dead and props placed in the world, arc people at their homes |
| `src/cinematic.js` | Cutscene player (`Cine`): the backstory intro, story and ending cutscenes |
| `src/ambience.js` | Procedural ambient sound (`Ambience`), driven by what is near the player |
| `src/ui.js` | HUD, dialogue, panels, touch controls, minigames, sound |
| `src/main.js` | Boot, game loop, interaction and glue |
| `src/API.md` | The contracts between all of the above. Read this before changing anything. |
| `vendor/three.min.js` | Three.js r159 (MIT), bundled into the page by the build |
| `build.js` | Bundles everything into `index.html`, `Dead Embers.html` and `artifact/dead-embers.html` |
| `test.js` | Headless checks: every encounter and callback, item/enemy ids, world reachability, 14 simulated days, save/load |
| `tools/browser-check.js` | Headless Edge/Chrome smoke test: loads the built page, plays a scenario, reports page errors, saves screenshots |
| `tools/scenarios/` | Browser-check scenarios: `playthrough.js` (end-to-end route), `endings.js` (every ending), `keyboard.js` (no mouse), `worlds.js`, `companions.js`, `biomes.js`, `cinematic.js`, `layout.js` (phone HUD, `--mobile`), `events.js` (placed events), `firstdays.js` (everything a new player sees in days 1–2, `--mobile`), `balance.js` (measurements, not a pass/fail check), `world.js`, `combat.js`, `ui.js` |
| `tools/harness.js` | In-page test harness (deterministic frames, pathing, bots); never bundled |

## Build and check

```
node build.js
node test.js
node tools/browser-check.js
node tools/browser-check.js --mobile
node tools/browser-check.js --scenario tools/scenarios/playthrough.js
node tools/browser-check.js --scenario tools/scenarios/worlds.js       # saved worlds (also --mobile)
node tools/browser-check.js --scenario tools/scenarios/companions.js   # dog, helper, interactions
node tools/browser-check.js --scenario tools/scenarios/endings.js      # every last-night ending
node tools/browser-check.js --scenario tools/scenarios/keyboard.js     # keyboard only (also --mobile)
node tools/browser-check.js --scenario tools/scenarios/biomes.js       # each biome, weather and season (screenshots); no spawns past closed gates; draw calls < 180
node tools/browser-check.js --scenario tools/scenarios/cinematic.js    # intro once, cutscenes, animations, ambience
node tools/browser-check.js --mobile --scenario tools/scenarios/layout.js   # phone HUD at four landscape sizes: no overlaps, 40 px buttons
node tools/browser-check.js --scenario tools/scenarios/events.js       # events placed in the world, met by walking up (also --mobile)
node tools/browser-check.js --mobile --scenario tools/scenarios/firstdays.js   # the first days as a script: every objective has a how, no keyboard words on touch, no popups from nowhere
node tools/browser-check.js --scenario tools/scenarios/balance.js      # BAL lines: travel, zombie density, cold, the bus quest, the final stand (BAL_N=10 for more stand runs)
```

Each headless check takes several minutes (much longer on a slow laptop) because the browser renders in software. Run them one at a time. A check that stops making progress fails after 30 minutes (`CHECK_TIMEOUT_MIN`).

`test.js` checks the rules and every piece of content headless. `browser-check.js` loads the built page in headless Edge or Chrome, reports page errors and saves screenshots. The playthrough scenario plays the whole core route (search, fights, building, moments, a decision, sleep, a horde night, an ending) and fails on any broken step. `tools/harness.js` is the in-page test harness it uses; see `src/API.md` §4.
