# Next session prompt: Dead Embers

Open a new Claude Code session in `C:\Users\computerh\Desktop\Dead Embers` and say "read NEXT-SESSION-PROMPT.md and continue". Everything below the line is the brief.

---

## Progress log, session of 2026-10-07 (read this first if the session was cut off)
The computer may restart or lose internet mid-session (another session shares it). Every step below is committed locally as soon as it's done; this log is updated in the same commit. `git log --oneline origin/main..main` shows what isn't pushed yet.

**Osama's decision for this session: code first, one full browser run.** Build everything below with `node build.js` + `node test.js` only. Then run the whole browser suite plus `balance` **once**, one check at a time in the background at BelowNormal priority, with logs in `C:\Users\computerh\de-checks\` (outside the repo; survives a restart). Push only after the suite passes. If a run was cut off by a restart, rerun just the checks without an `OK`/exit-0 line in their log.

Status (✅ committed, ⏳ in progress, ☐ not started):
- ✅ 1a. Snow footprints (`world.js`, InstancedMesh ring buffer, dog paw prints)
- ✅ 1b. No ambient spawns in closed districts: `spotNear` (moments.js), `waveSpawnPoint` (combat.js), plus an assert in `biomes.js`
- ✅ 1c. Draw-call assert (<180) in `biomes.js`
- ✅ 1d. Playthrough flake: a guard for container-search encounters during scripted steps; let the `lock` minigame finish under `sim()`
- ✅ 1e. (issue #2) `question` issue: real-phone FPS (needs internet)
- ✅ 2a. Weapon wear · ✅ 2b. Act bosses · ✅ 2c. Night haul · ✅ 2d. Dog fetch (key R)
- ✅ 3. Docs: README, API.md, scheduled-task SKILL.md
- ⏳ 4. Full browser run + balance tuning
- ☐ 5. Push, confirm Pages, final update of this file

---

You're continuing work on **Dead Embers**, my browser 3D zombie survival RPG (Three.js r159, one self-contained HTML page). The live game is https://osamaals.github.io/dead-embers/ and the repo is `OsamaAls/dead-embers`; GitHub Pages serves `index.html` from `main`.

## Read first
1. `README.md` covers the features, controls, file layout and checks.
2. `src/API.md` is the contract between every file. §4 covers the checks and the in-page test harness `tools/harness.js`.
3. `git log --oneline -20` shows what the last sessions did.

Run `git pull` first. Then check the open issues with `gh issue list --repo OsamaAls/dead-embers`, fold in any pending requests, and comment on and close each one you handle. Issue #1 is the pinned "Start here" guide; leave it open.

A scheduled task, `dead-embers-github-input`, also does this twice a week. Its instructions are in `C:\Users\computerh\.claude\scheduled-tasks\dead-embers-github-input\SKILL.md`; keep it in sync when the build or checks change.

## How I want you to work
- **Questions:** decide for yourself, and note the decision in the commit. Ask me only when it really matters. If something truly needs me while I'm away, open an issue labelled `question` and keep going.
- **Commits:** commit in small steps and push to `main` when the game is playable, without waiting for review. Git identity: `OsamaAls` / `302768611+OsamaAls@users.noreply.github.com`. Never commit my personal email.
- **Go easy on the laptop.** It's an i7-8565U with 16 GB that throttles, and it froze once during a session.
  - `node build.js` and `node test.js` are light; use them freely.
  - Headless checks (`node tools/browser-check.js ...`) launch Microsoft Edge with SwiftShader. Each one takes **10–18 minutes** here and pins the CPU.
  - Run them **one at a time**, never in parallel, at low priority: in PowerShell, `(Get-Process -Id $PID).PriorityClass = 'BelowNormal'` before running `node`.
  - Before each check, look at the load: `(Get-Counter '\Processor(_Total)\% Processor Time','\PhysicalDisk(_Total)\% Disk Time' -SampleInterval 2 -MaxSamples 2).CounterSamples | % { "{0}: {1:N0}" -f $_.Path, $_.CookedValue }`. If CPU is over 60% or disk over 50%, wait.
  - **Ask me before browser work that adds up to more than ~15 minutes.** The full suite is about 2 hours; I may want to run it while I'm away.
  - At the end, make sure no `msedge --headless` processes are left. `browser-check.js` now kills its browser on exit; before that fix, killed runs left orphans.
  - Run long checks in the background and send the output to a file. A foreground run that times out loses its output.
- **Agents:** subagents are fine for code work. Run one heavy job at a time, and tell subagents not to run browser checks. Give each agent its own files (a worktree), and allow only targeted edits in shared files.
- **Line endings:** repo files are LF. Python on this machine writes CRLF unless you use `newline=''`, so check `tr -cd '\r' < file | wc -c` is 0 before committing. Don't put Windows paths with `\U` inside Python strings in a heredoc; they break.
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
Built and pushed earlier:
- **World:** a 112×84 map with seven biomes and story gates, weather that changes gameplay, seasons that follow the acts, and contextual nature.
- **Endings:** a final stand that's winnable and honest, plus eight more ways the last night can end, each with epilogues.
- **Story:** eight character arcs, and about 120 encounters.
- **Combat:** keyboard-only play with lock-on, mouse aim snapping, sneak attacks and bottle lures.
- **UI:** a polished UI.
- **Presentation:** a backstory intro that plays once, cutscenes, animations, and condition-driven ambient sound.
- **Persistence and helpers:** companions (a dog or a survivor) and multiple saved worlds.

**Committed on `main` but NOT pushed yet** (session of 2026-10-06; `main` is 4–5 commits ahead of `origin`):
- **`89a96d0` Interaction props:**
  - `placeProps` (`engine.js`, at the end of `genWorld`, with its own random stream) places:
    - notes on the walls of story places and Old Town
    - about 30 bodies, on roads by the wrecks and indoors
    - 7 hand pumps (parks, the farm yard, the allotments, the campsite), solid `T_DECO`
    - beds, couches and cots in homes
  - Old saves keep their exact map. `test.js` pins this with a layout hash for three seeds.
  - `world.js` builds the meshes (in the merged chunks, so no extra draw calls) and adds `World3D.setBodySearched`.
  - Crows (one InstancedMesh) settle on outdoor bodies by day and flee when you come close. `World3D.crowsNear` lets the ambience caw from the real birds.
  - Pumps give clean water. Story places have their own wall lines in `CONTENT.placeNotes`.
  - `tools/scenarios/companions.js` plays every prop and passes.
- **`50ea73b` (merged) Content:**
  - 20 biome encounters: docks, flooded quarter, Elm Row, the woods and the pass.
  - The first frost and first snow are now story scenes with short cutscenes.
  - Winter radio lines say the pass will close.
  - Mara names the Ranger Station in `radio_fixed`. The forest gate opens only after that scene has played (`G.seenScenes.radio_fixed`).
- **`b9af358`:**
  - `__skipTo(2)` marks the radio scene as seen.
  - New `tools/scenarios/balance.js` (measurements only; never run yet).
- **Small fixes:**
  - `FLORA.STREET` was undefined, so boulevard trees had no street model.
  - A minigame result now dismisses on a key press.
  - The harness `unblock()` closes panels and finished minigames.
  - `browser-check.js` waits longer for Edge and kills it on every exit.

Browser checks on this code:
- **Passed:** default, `--mobile`, `playthrough`, `companions`.
- **Not run yet:** `cinematic`, `endings`, `biomes`, `keyboard` (+ `--mobile`), `worlds`.

## Still to do (in order)
1. **Verify and push what's committed.**
   - Run the not-yet-run checks one at a time (ask me first; it's over 15 minutes in total).
   - Look at the screenshots at desktop and phone width.
   - Push `main`, then confirm the live Pages build.
2. **Finish the balance playtest.** Travel is already measured in Node, and nothing needs tuning there:
   - The longest trip from the bunker is Pier 3, 27 minutes each way. A round trip costs at most about 2 hunger and 3 thirst.
   - The bus quest needs about 2 game hours of walking inside its 12 days, so it's easily reachable.

   Still to measure, in the browser: `node tools/browser-check.js --scenario tools/scenarios/balance.js` (about 15–25 min; ask first). It covers:
   - ambient zombie density per biome, by day and by night
   - winter cold, with and without a coat
   - the final stand matrix with `defendBot`: ready yards should win, weak yards should be about a coin flip; `BAL_N=10` for more runs

   Tune only where the numbers miss, and put before/after numbers in the commit.
3. **Small polish:**
   - **Snow footprints:**
     - An InstancedMesh ring buffer of about 160 prints, which is one draw call.
     - Prints are laid on outdoor snow while `snowCover > 0.3`, and fade over about 90 s.
     - The dog leaves paw prints.
   - **Ambient zombies across the river in closed districts:**
     - `findSpot` in `combat.js` already checks `districtOpen`.
     - Check `spotNear` in `moments.js`, `waveSpawnPoint` and room zombies.
     - Add a scenario assert.
   - **Performance:**
     - Assert draw calls under ~180 per view in `biomes.js`.
     - Real-phone FPS can't be measured here, so open a `question` issue asking me to report it from the live link.
   - **Flaky mobile playthrough:**
     - The harness half is fixed.
     - Still to do: stop the random encounter from container searches during the scripted steps in `playthrough.js`. Only field rolls are off today, via `G.encTimer`.
     - A `lock` minigame's timer can't run under `sim()`, because requestAnimationFrame is stubbed.
4. **Four more features** (I chose: build all four, one commit each, each unlocking gradually and playable by keyboard):
   - **Weapon wear, which never breaks:**
     - `G.wear[id]` runs from 100 down to 0 per weapon type (the pack is counts, not instances).
     - Melee hits wear the weapon; shots wear guns more slowly.
     - Damage is ×(0.6 + 0.4·cond/100) in `playerHitDamage`.
     - Repair rows appear in the Craft tab once the workbench exists, and cost scrap.
     - A condition pip shows only once wear has started, plus one hint below 60.
   - **A named boss per act:**
     - New `ENEMIES` entries with a `scale` override, a unique tint and guaranteed loot.

     | Act | Boss | Lair |
     |---|---|---|
     | 1 | brute-shaped | hospital |
     | 2 | bloater-shaped | Cold Store (docks) |
     | 3 | snow-crusted brute | Wrecked Convoy (pass) |

     - Each spawns once, when you enter its lair during its act, with a short intro.
     - The kill writes a journal line, and the epilogue mentions it.
   - **Nightly scavenging score:**
     - Track items found, their value, and kills from dusk to dawn.
     - The morning summary shows "Last night's haul: N, worth V (best B)", with `G.best.haul`.
     - It appears only after the first night run.
   - **Dog fetch:**
     - A new key (check which keys are free in `ui.js`) plus a touch button.
     - The dog fetches one item from the nearest unsearched container within 12 tiles, with a 90 s cooldown.
     - It unlocks after a day of following.
     - Test it in `companions.js`.
5. **Docs:**
   - **README:** the props, pump water, the balance scenario, and any new keys.
   - **API.md:**
     - §2: document `placeProps`, the prop shapes, `setBodySearched`, `crowsNear` and `placeNotes`.
     - It still says `W=64, H=48`; it's 112×84.
     - §4: list the `balance` scenario.
   - **Scheduled task:** keep the `SKILL.md` above in sync.

## Done means
- Every check passes with no page errors:
  - `node build.js` and `node test.js`
  - `node tools/browser-check.js`, plus `--mobile`
  - the scenarios `playthrough`, `keyboard` (also `--mobile`), `endings`, `worlds`, `companions`, `biomes` and `cinematic`
  - each check run one at a time, with my OK on timing
- You looked at the screenshots at desktop and phone width.
- README, API.md and the scheduled task's SKILL.md match the code.
- Everything is pushed to `main`, and the live Pages build is confirmed.
- Issues are replied to and closed.
- No headless Edge or helper processes are left running.
