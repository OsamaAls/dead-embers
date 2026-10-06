# Next session prompt: Dead Embers

Copy everything below the line into a new Claude Code session opened in `C:\Users\computerh\Desktop\Dead Embers`.

---

You're continuing work on **Dead Embers**, my browser 3D zombie survival RPG (Three.js r159, one self-contained HTML page). The live game is https://osamaals.github.io/dead-embers/ and the repo is `OsamaAls/dead-embers`; GitHub Pages serves `index.html` from `main`.

## Read first
1. `README.md` covers the features, controls, file layout and checks.
2. `src/API.md` is the contract between every file. §4 covers the checks and the in-page test harness `tools/harness.js`.
3. `git log --oneline -20` shows what the last sessions did.

Run `git pull` first. Then check the open issues with `gh issue list --repo OsamaAls/dead-embers`, fold in any pending requests, and comment on and close each one you handle. A scheduled task, `dead-embers-github-input`, also does this twice a week. Its instructions are in `C:\Users\computerh\.claude\scheduled-tasks\dead-embers-github-input\SKILL.md`; keep it in sync when the build or checks change.

## How I want you to work
- **Don't ask me questions.** Decide, and note the decision in the commit. If something truly needs me, open an issue labelled `question` and keep going.
- **Commits:** commit in small steps and push to `main` when the game is playable, without waiting for review. Git identity: `OsamaAls` / `302768611+OsamaAls@users.noreply.github.com`. Never commit my personal email.
- **Agents:** run them in parallel where it helps. Give each agent its own files, and allow only targeted edits in shared files.
- **Line endings:** repo files are LF. Python on this machine writes CRLF unless you use `newline=''`, so check `tr -cd '\r' < file | wc -c` is 0 before committing.
- **Testing:** the in-app Browser pane is usually hidden, which pauses `requestAnimationFrame`. Load the harness with `fetch('tools/harness.js').then(r=>r.text()).then(eval)` and step the game with `sim(seconds)`. For pictures, use headless `node tools/browser-check.js --shots <dir>` and Read the PNGs.
- **Design rules:**
  - Anything physical is played, not picked from a list.
  - Text stays short.
  - Systems unlock gradually.
  - Keyboard-only play must keep working.
  - Ambient sound comes only from things actually near the player; never use generic beds and never add music.
  - Nature is placed for a reason, not scattered.
  - No thick one-sided accent borders in the UI.

## Where things stand
Built and pushed:
- **World:** a 112×84 map with seven biomes and story gates, weather that changes gameplay, seasons that follow the acts, and contextual nature.
- **Endings:** a final stand that's winnable and honest, plus eight more ways the last night can end, each with epilogues.
- **Story:** eight character arcs and about 100 encounters.
- **Combat:** keyboard-only play with lock-on, mouse aim snapping, sneak attacks and bottle lures.
- **UI:** a polished UI.
- **Presentation:** a backstory intro that plays once, cutscenes, more animations, and condition-driven ambient sound.
- **Persistence and helpers:** companions (a dog or a survivor) and multiple saved worlds.

## Still to do (suggested order)
1. **Interaction props in the world.** The engine already supports `WORLD.notes`, `WORLD.bodies`, `WORLD.pumps` and `WORLD.beds` (see API.md §2 interactions) and `main.js` interacts with them. `genWorld` and `world.js` don't place any yet. Place them where they make sense:
   - graffiti and notes on walls near story places
   - bodies in streets and buildings, with crows near them
   - water pumps in parks and farms
   - beds and couches inside houses and apartments

   Then add the meshes, and confirm `tools/scenarios/companions.js` covers them.
2. **Content for the new world.** Write biome-specific encounters for the docks, flooded quarter, suburbs, forest and pass. Replace the placeholder "first frost" and "first snow" journal and toast beats with proper short story scenes. Have the radio name the ranger station before the forest gate opens.
3. **Playtest balance across a whole run with the bigger map.**
   - Travel time, hunger and thirst pacing, ambient zombie density per biome, and cold in winter.
   - Whether the 12-day bus quest is reachable.
   - Keep the final stand matrix in line: ready yards should win and weak yards should be about a coin flip. The `defendBot` in `tools/harness.js` covers this, and the method is in git log for commit "Winnable final stand…".
4. **Small polish left over:**
   - snow footprints
   - ambient zombies across the river in closed districts (already blocked from spawning, but double-check)
   - performance on a real phone (draw calls stay under ~180; check FPS)
   - the mobile playthrough is sometimes flaky on a random search encounter
5. **More ideas I suggested earlier but didn't build:**
   - weapon durability and repairs at the workbench
   - a named boss zombie per act
   - a nightly scavenging score
   - a dog command to fetch an item

## Done means
- Every check passes with no page errors:
  - `node build.js` and `node test.js`
  - `node tools/browser-check.js`, plus `--mobile`
  - the scenarios `playthrough`, `keyboard` (also `--mobile`), `endings`, `worlds`, `companions`, `biomes` and `cinematic`
- You looked at the screenshots at desktop and phone width.
- README, API.md and the scheduled task's SKILL.md match the code.
- Everything is pushed to `main`, and the live Pages build is confirmed.
- Issues are replied to and closed.
