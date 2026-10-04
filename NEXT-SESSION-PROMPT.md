# Next session prompt: Dead Embers 3D

Copy everything below the line into a new Claude Code session opened in `C:\Users\computerh\Desktop\Dead Embers`.

---

You're continuing work on **Dead Embers**, my browser zombie survival RPG. It's currently a 2D top-down canvas game. I want you to rebuild it as a **3D game** with real gameplay instead of menus and walls of text.

## Where things are
- **Local repo:** `C:\Users\computerh\Desktop\Dead Embers`. GitHub: `OsamaAls/dead-embers` (public).
- **Live game:** https://osamaals.github.io/dead-embers/ (GitHub Pages serves `index.html` from `main`).
- **Code layout:**
  - `src/` holds shell.html (markup + CSS), data.js, engine.js, ui.js, content.js (story, lore, radio, names, shelter events), encounters.js, arcs.js (character story arcs) and API.md (the content ↔ engine contract).
  - `node build.js` bundles everything into `index.html`, `Dead Embers.html` and `artifact/dead-embers.html`.
- **Who else touches the repo:** my friend Abdulaziz Bukhari posts design input as GitHub issues.
  - A desktop scheduled task, `dead-embers-github-input`, merges those issues twice a week (Sunday and Wednesday at 10:00). It works in `C:\Users\computerh\dead-embers` and its instructions are in `C:\Users\computerh\.claude\scheduled-tasks\dead-embers-github-input\SKILL.md`.
  - Run `git pull` first.
  - Read the open issues (`gh issue list --repo OsamaAls/dead-embers`) and fold any pending requests into this rebuild. Comment and close them like the task would.

## How I want you to work
- Don't ask me questions. Use your judgement, decide, and note the decision in the commit or an issue comment. If something truly needs my input, open a GitHub issue labelled `question` and keep going with your best guess.
- Always merge. Commit in small steps and push to `main` when the game is in a playable state, without waiting for review. Use the git identity `OsamaAls` / `302768611+OsamaAls@users.noreply.github.com`. Never commit my personal email.
- Run agents in parallel where it helps, for example 3D world, combat, UI/onboarding and content conversion.
- When the architecture changes, update `README.md`, `src/API.md` and the scheduled task's SKILL.md so the issue-merging task still knows how to build and verify the game.

## What to build

### 1. Make it 3D
- Use **Three.js**, loaded as one pinned script from cdnjs (or bundled), so the game stays a self-contained page that works on GitHub Pages and as a single HTML file. No build server needed to play.
- Use a third-person or angled top-down camera that follows the player, with smooth camera motion and a scroll-wheel or pinch zoom.
- Make the art low-poly and procedural, matching the current mood: ash, rust, ember orange, grey-green dead.
  - City: blocks, streets, wrecked cars, lamp posts, a river with bridges, forest edges, the metro bunker.
  - Use instanced meshes, fog for draw distance, and one shadow-casting light.
  - Make day and night a real lighting change. At night the player carries a flashlight or lantern cone.
- Give buildings walkable interiors, or at least an entered space with lootable props. They should be places you go into, not doors that open a menu.
- Use simple procedural humanoid models for player, zombies and survivors, with distinct silhouettes per zombie type (walker, runner, bloater, screamer, brute, infected dog). Basic animation: walk bob, attack lunge, hit flash, death fall.
- It must run smoothly on a mid-range laptop and be playable on a phone, with a virtual joystick and action buttons.

### 2. Gameplay instead of choices
Anything that is physically "doing something" should be done by playing, not picked from a list.
- **Combat is real-time.** Click or press a key to swing a melee weapon. Weapons have reach, wind-up and stamina cost, and guns use aim, ammo and noise. Zombies chase, lunge and grab, so you dodge and back off. Kill them by fighting, never by choosing "Fight".
- **Loot comes from what you do.** Killed enemies drop items you walk over or press E to pick up. Raiders drop their weapons and ammo.
- **Searching means opening things.** Open cabinets, crates, fridges and car trunks in the world, each with a short hold-to-search progress bar. Perception affects speed and what you find. Remove the single "Search" button.
- **Many current encounters become small gameplay moments.** Examples:
  - Silence the screamer before it finishes its shriek: reach it in time or shoot it.
  - Rescue a survivor by actually clearing the zombies around them.
  - The collapsing floor is a timed dodge.
  - The locked safe is a quick lockpick or crowbar minigame.
  - The supply drop is a race against a horde.
  - The trader is a barter screen with items you move across.
- **Keep choices for real decisions only:** moral calls, conversations, recruiting, the Warden, and the endings. Present those as short dialogue with a speaker, one or two lines at a time, and 2 to 4 replies. Stat-based replies show the stat and roughly how likely they are to work.
- **Stealth matters.** Crouching makes less noise, sprinting and gunfire draw zombies, and zombies have a visible awareness indicator.

### 3. Make it incremental, not overwhelming
Right now, starting the game hits you with long, unclear walls of text. Fix that.
- **Cold open in under 10 seconds of reading.** At most two short lines, then the player is moving. Teach by doing:
  - a one-line contextual prompt the first time each thing matters, such as "Hold E to search" or "Hunger is dropping. Eat something".
  - No help page on start, though one can stay in the menu.
- **Reveal systems progressively.**
  - Start with health and stamina only.
  - Show hunger and thirst once they start to matter.
  - Unlock shelter building after the first loot run.
  - Show survivors and jobs after the first rescue.
  - Introduce horde nights with a warning the day before.
  - Bring in the radio and story quest once the basics are learned.
  - Unlock buildings, recipes and zombie types over the first few days.
- **Keep text short everywhere.**
  - Story beats: 1 to 3 short lines at a time, using speaker portraits or names, environmental storytelling (notes on walls, radio voice-over, graffiti) and objective markers in the world.
  - Long lore stays optional in the journal.
  - Rewrite the existing story and encounter content into this shorter, punchier form instead of deleting it.
- **Give clear goals.** Show one current objective, with a world marker and compass or minimap arrow, and short-term goals that chain naturally. The player should always know the next step without reading paragraphs.
- **Give feedback.** Damage numbers or hit flashes, pickup toasts, a screen-edge vignette for low health or infection, sounds if cheap (Web Audio, started after the first click), and a satisfying level-up moment.

### 4. Keep what works
Keep these as data and systems, adapted to 3D:
- survival stats (health, stamina, hunger, thirst, morale, infection, bleeding/sickness),
- the six attributes (STR carry and melee, END stamina, PER loot and spotting, CHA talking and trade, AGI speed and dodge, INT crafting and building),
- shelter buildings that appear physically around the bunker, survivors with jobs who visibly work, crafting,
- the three acts, the endings, the six character arcs (Eli, Dr. Okafor, Marcus, the Choir, the Relay, Teodor), the Tollmen and the Warden, horde nights, saving in localStorage.

## Done means
- I open https://osamaals.github.io/dead-embers/ and within 30 seconds I'm walking a 3D city with a clear goal and almost no reading.
- I fight and loot by playing, not by clicking choices.
- Systems unlock gradually over the first in-game days.
- The full story can still be finished.
- You played it yourself in the browser pane, with no console errors, at desktop and phone width.
- Everything is pushed to `main`, README and API.md are updated, and the scheduled task's SKILL.md matches the new build and verify steps.
- You've replied to and closed any GitHub issues you handled.
