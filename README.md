# Dead Embers

A 2D top-down zombie survival RPG that runs in the browser. You walk a ruined city, scavenge, survive story-driven encounters, recruit survivors and build up a metro bunker before the great horde arrives.

**Play online:** https://osamaals.github.io/dead-embers/

**Play locally:** open `index.html` (or `Dead Embers.html`) in any browser, or run `node serve.js` and visit http://localhost:8765.

## How to give input

Everything about this game is driven from this repo's issues.

- **Requests, bugs and ideas:** open an issue with the `input` label. One topic per issue is easiest.
- **Questions from Claude:** issues labelled `question`. Answer in a comment; Claude reads the replies before working.
- When an issue is done, Claude comments with what changed and closes it.

## Project layout

| Path | What it is |
|---|---|
| `src/shell.html` | Page markup and all CSS |
| `src/data.js` | Items, enemies, locations, buildings, recipes, backgrounds, traits |
| `src/engine.js` | Game state, world generation, survival, shelter, fights, story, save/load |
| `src/ui.js` | Canvas rendering, input, zombies, every modal screen |
| `src/content.js` | Story scenes, lore notes, radio broadcasts, names, survivor barks, shelter events |
| `src/encounters.js` | Random outdoor encounters |
| `src/arcs.js` | Multi-part character story arcs |
| `src/API.md` | The contract content files use to talk to the engine |
| `build.js` | Bundles everything into `index.html`, `Dead Embers.html` and `artifact/dead-embers.html` |

Build with `node build.js`.
