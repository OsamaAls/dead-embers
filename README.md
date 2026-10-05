# Dead Embers

A 3D zombie survival RPG that runs in the browser. You walk a ruined city, fight and loot by hand, survive story encounters, recruit survivors and build up a metro bunker before the great horde arrives.

**Play online:** https://osamaals.github.io/dead-embers/

**Play locally:** open `index.html` (or `Dead Embers.html`) in any browser, or run `node serve.js` and visit http://localhost:8765. Everything, including Three.js, is inside that one HTML file.

**Controls:**
- Move: WASD. Sprint: Shift. Crouch: C. Dodge: Space.
- Attack: click or J. Aim: mouse. Interact or search (hold): E.
- Pack: I. Journal: Tab. Character: B. Swap weapon: Q.
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
| `src/world.js` | Builds the 3D city from the world grid (instanced meshes, interiors, shelter yard) |
| `src/render.js` | Renderer, camera, day/night lighting, flashlight |
| `src/actors.js` | Procedural low-poly people and zombies with animation |
| `src/combat.js` | Player controller, real-time combat, zombie AI, drops, survivors, horde waves |
| `src/moments.js` | Gameplay moments for encounters (rescues, screamers, collapses, locks, races, barter) |
| `src/ui.js` | HUD, dialogue, panels, touch controls, minigames, sound |
| `src/main.js` | Boot, game loop, interaction and glue |
| `src/API.md` | The contracts between all of the above. Read this before changing anything. |
| `vendor/three.min.js` | Three.js r159 (MIT), bundled into the page by the build |
| `build.js` | Bundles everything into `index.html`, `Dead Embers.html` and `artifact/dead-embers.html` |
| `test.js` | Headless checks: every encounter and callback, item/enemy ids, world reachability, 14 simulated days, save/load |
| `tools/browser-check.js` | Headless Edge/Chrome smoke test: loads the built page, plays a scenario, reports page errors, saves screenshots |
| `tools/scenarios/` | Browser-check scenarios: `playthrough.js` (end-to-end route), `world.js`, `combat.js`, `ui.js` |
| `tools/harness.js` | In-page test harness (deterministic frames, pathing, bots); never bundled |

## Build and check

```
node build.js
node test.js
node tools/browser-check.js
node tools/browser-check.js --mobile
node tools/browser-check.js --scenario tools/scenarios/playthrough.js
```

`test.js` checks the rules and every piece of content headless. `browser-check.js` loads the built page in headless Edge or Chrome, reports page errors and saves screenshots. The playthrough scenario plays the whole core route (search, fights, building, moments, a decision, sleep, a horde night, an ending) and fails on any broken step. `tools/harness.js` is the in-page test harness it uses; see `src/API.md` §4.
