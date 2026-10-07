# Next session prompt: Dead Embers

Open a new Claude Code session in `C:\Users\computerh\Desktop\Dead Embers` and say "read NEXT-SESSION-PROMPT.md and continue". Everything below the line is the brief.

---

## Progress log: phone UX session (2026-10-07)
The plan is at `C:/Users/computerh/.claude/plans/the-game-has-a-elegant-stardust.md`.

Osama's phone feedback:
- the HUD is crowded;
- objectives don't say how to do them;
- USE is always lit;
- too much pops up at once;
- events have no one in the world.

Phases:
- [x] **1. Landscape phone HUD.**
  - Portrait shows a "turn your phone" card.
  - Buttons appear only when they do something.
  - `tools/scenarios/layout.js` checks for overlaps at four sizes.
  - `--mobile` is now 844x390.
- [x] **2. Prompts on the object, and fewer of them.**
  - The prompt floats over the thing it's about and can be tapped.
  - Wrecks offer fuel only with a hose.
  - Doors offer a barricade only at night or with the dead near.
  - Searched boxes say nothing.
- [x] **3. Objectives that say how.**
  - `objectiveInfo().how`.
  - "Find water" means water in your pack: FreshMart's shelves, then a pump.
  - Material steps name a building that has the materials.
- [x] **4. One notice at a time.**
  - One queue for hints and unlock cards; it waits behind dialogues and fights.
  - Journal entries light the Log button instead of toasting.
- [x] **5. Every event is physical** (`src/places.js`).
  - People, the dead and props stand in fitting places.
  - Arc people wait at their homes.
  - Visitors come to the gate.
  - The dog stays in the yard when left home.
- [x] **6. Checks and docs.**
  - New checks: `layout.js` and `events.js`. `test.js` places every event in five worlds.
  - README, API.md and the scheduled task's SKILL.md are updated.
  - The suite runner (`de-checks/run.ps1`) includes the new checks.

## If a session gets cut off
The computer may restart or lose internet mid-session (another session shares it). Commit every step locally as soon as it's done and keep a short progress log at the top of this file in the same commit. `git log --oneline origin/main..main` shows what isn't pushed yet.

The browser-check runner is `C:\Users\computerh\de-checks\run.ps1` (outside the repo; `pwsh -File` it with no arguments for the whole suite, or name checks: `run.ps1 companions balance`). It runs one check at a time at BelowNormal priority, waits for CPU < 60% and disk < 50%, writes `<name>.log` and `<name>.exit`, writes `<name>.ok` on a pass and skips checks that already have one (delete the `.ok` files to rerun). `status.txt` there is its log.

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
  - Headless checks (`node tools/browser-check.js ...`) launch Microsoft Edge with SwiftShader. On 2026-10-07 they took 1–13 minutes each (default/mobile under 1, balance with BAL_N=10 about 13); the whole suite about 45 minutes. They still pin the CPU.
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
Everything is pushed to `main` and live.

The phone UX session (2026-10-07, afternoon) reworked how the game teaches and shows things. See the progress log above, `src/API.md` (§1 "Where an event happens", §3 `Places`) and `src/places.js`. In short:
- **Phones** are landscape-only, with a thumb-arc HUD.
- **Prompts** float on objects, and there are far fewer of them.
- **Objectives** have a "how" line.
- **Notices** come one at a time.
- **Every event** stands somewhere you can see it.

The morning session (2026-10-07) added:
- **Snow footprints:**
  - Boot prints behind you and paw pairs behind the dog, on outdoor snow.
  - One InstancedMesh ring of 160 decals, filling in over 90 s.
- **No spawns past closed gates:** `spotNear` (moments.js) and `waveSpawnPoint` (combat.js) skip closed districts, as `findSpot` already did.
- **`biomes.js` assertions:** nothing spawns past a closed gate, and every view stays under 180 draw calls (the busiest was 67).
- **Weapon wear:**
  - Weapons wear with use but never break; damage scales ×0.6–1.0 with condition.
  - Repairs cost scrap at the workbench.
  - A HUD pip appears once wear starts.
- **Act bosses** (`BOSS_LAIR`), each with guaranteed drops, a journal line and an epilogue line:
  - The Orderly in the hospital (from day 3).
  - The Butcher in the Cold Store.
  - The Sergeant at the Wrecked Convoy.
- **The night's haul:** the dawn summary reports what a night run brought in, against your best.
- **Dog fetch:**
  - R, or the FETCH touch button.
  - Unlocks after a day together.
  - Brings one item from the nearest container within 12 tiles; 90 s cooldown.
- **Cold that bites:** without a coat, stamina refills only to 60% in the snow (40% in the storm).
- **Final stand tuning:** measured on day 20, ready yards win 10/10 and weak yards about half (5/9 fought).
- **Fixes:**
  - The lock minigame runs on the game loop, so it works under `sim()`.
  - Container searches respect `G.encTimer = 1e9` in scenarios.
- **Scenario fixes:**
  - `companions.js` pins its world seed, and its bite step disables grabs.
  - `balance.js` resets through the title screen and plays the stand on day 20.
  - `playthrough.js` logs why the rescue step stays open.
- **Docs:** README, API.md and the scheduled task's SKILL.md are up to date.

All checks pass (2026-10-07):
- `node build.js` and `node test.js`.
- `default` and `--mobile`.
- `playthrough`, `keyboard` (also `--mobile`), `endings`, `worlds`, `companions`, `biomes`, `cinematic` and `balance`.

Known flake: in `playthrough`, the rescue step can stay open if the gun-fight bot burned most of its ammo first. It failed once in four runs. The step now prints `why` (enemies left and their distance, ammo, distance to the survivor) when it fails.

## Still to do
0. **Ask Osama how the phone build feels now.**
   - Landscape layout, reachable buttons, the floating prompt.
   - Whether "Find water" and the other first-day steps are clear.
   - Whether events read as happening somewhere.
   - Tune from his answer: arc homes and how often events roll (`fieldEncounterRoll`, `PLACE` in places.js).
1. **Issue #2 (phone FPS):**
   - Read Osama's answer.
   - If a view is slow on the phone, cut draw calls or triangles there. `biomes.js` prints calls, triangles and FPS per view.
2. **New issues:** handle any new issues (labels `input` / `question`). Leave #1 open.
3. **Ideas, only if there's nothing else:**
   - Show the boss's name on its lock-on bar.
   - Let the dog fetch from a body as well as a container.
   - A journal page listing your best haul and the bosses you've put down.


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
