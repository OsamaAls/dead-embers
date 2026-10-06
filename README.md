# Dead Embers

A 3D zombie survival RPG that runs in the browser. You walk a ruined city, fight and loot by hand, survive story encounters, recruit survivors and build up a metro bunker before the great horde arrives.

- **A world that changes with the story.** Seven biomes: Old Town, the Elm Row suburbs, Kessler Woods and the hills, farmland, the Flooded Quarter, the Docks and the Northern Pass. The woods, the docks and the pass are blocked until the story opens them. Rain, fog and snow change how the dead hear, see and move. The seasons run from autumn to the first snow, and the last night is a snowstorm.
- **Many endings.** Haven by bus, the Convoy with Sgt. Vance's escort, holding the bunker, an alliance with the Warden, storming the Tollmen camp, broadcasting Dr. Okafor's formula from KVAL, the Choir's bells, or walking north alone. Each one adds epilogue lines that depend on the people you helped or failed.
- **Eight character arcs:** Eli, Dr. Okafor, Marcus, the Choir, the Relay, Teodor, Rosa the lamplighter and Sgt. Ada Vance. There are around a hundred encounters, played as moments (rescues, screamers, collapses, locks, races, trades) or short decisions.
- **A backstory intro and cutscenes.** The intro plays once; replay it from the title or the menu. Story beats and endings have short cutscenes you can skip.
- **Companions.** A dog (Biscuit, or a stray you feed) or a survivor can follow you on runs.
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
- Pack: I. Journal: Tab. Character: B. Map: M. Swap weapon: Q. Companion stay / follow: H. Menu: Esc.
- Saves: several worlds side by side. Continue, Worlds (load or delete; fallen and finished worlds stay as memorials) and New world on the title; Save now and Save as new world in the menu (Esc).
- Zoom: wheel.
- On phones: a virtual joystick plus on-screen buttons.

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
| `src/cinematic.js` | Cutscene player (`Cine`): the backstory intro, story and ending cutscenes |
| `src/ambience.js` | Procedural ambient sound (`Ambience`), driven by what is near the player |
| `src/ui.js` | HUD, dialogue, panels, touch controls, minigames, sound |
| `src/main.js` | Boot, game loop, interaction and glue |
| `src/API.md` | The contracts between all of the above. Read this before changing anything. |
| `vendor/three.min.js` | Three.js r159 (MIT), bundled into the page by the build |
| `build.js` | Bundles everything into `index.html`, `Dead Embers.html` and `artifact/dead-embers.html` |
| `test.js` | Headless checks: every encounter and callback, item/enemy ids, world reachability, 14 simulated days, save/load |
| `tools/browser-check.js` | Headless Edge/Chrome smoke test: loads the built page, plays a scenario, reports page errors, saves screenshots |
| `tools/scenarios/` | Browser-check scenarios: `playthrough.js` (end-to-end route), `endings.js` (every ending), `keyboard.js` (no mouse), `worlds.js`, `companions.js`, `biomes.js`, `cinematic.js`, `world.js`, `combat.js`, `ui.js` |
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
node tools/browser-check.js --scenario tools/scenarios/biomes.js       # each biome, weather and season (screenshots)
node tools/browser-check.js --scenario tools/scenarios/cinematic.js    # intro once, cutscenes, animations, ambience
```

`test.js` checks the rules and every piece of content headless. `browser-check.js` loads the built page in headless Edge or Chrome, reports page errors and saves screenshots. The playthrough scenario plays the whole core route (search, fights, building, moments, a decision, sleep, a horde night, an ending) and fails on any broken step. `tools/harness.js` is the in-page test harness it uses; see `src/API.md` §4.
