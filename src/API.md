# Dead Embers: contracts between files

Game: zombie-apocalypse survival RPG in **3D** (Three.js r159, bundled from `vendor/three.min.js`, global `THREE`).
It ships as one self-contained HTML page. Plain browser JS (ES2019): no modules, no imports, every file is a classic script sharing the global scope.
Build order (see `build.js`): data, content, encounters, arcs, **engine**, world, actors, render, combat, moments, ui, main.

Setting: **Ardent Vale**, 14 months after the **Grey Fever**. The player lives in a **metro maintenance bunker** (the shelter).
The radio speaks of **Haven** beyond the northern mountains. Raider gang **the Tollmen**, led by **the Warden**, extort survivors.
In Act 3 a great horde comes: flee by bus to Haven, hold the bunker, or ally with the Warden.
Tone: grim, grounded, human, some dark humour. **Short text**: 1–2 lines per beat. No gore for its own sake.

---------------------------------------------------------------------------------------------------
## 1. Content API (content.js, encounters.js, arcs.js → engine)

Engine globals content may use: `G` (state; see engine.js `newGame`), `rnd(a,b)`, `chance(p)`, `pick(arr)`,
`give(id,n)` (returns a label like "+2 Canned Food"), `take(id,n)`, `has(id,n)`, `count(id)`, `hurt(n,cause)`, `heal(n)`, `tire(n)`, `rest(n)`,
`feed(n)`, `drink(n)`, `addMorale(n)`, `xp(n)`, `addNoise(n)`, `bite()`, `setStatus('bleeding'|'sick'|'injured', hours)`,
`flag(k)`, `setFlag(k,v)`, `journal(title,text)`, `recruit(opts)`, `randomSurvivor()`, `killSurvivor(s,cause)`,
`damageBuilding()`, `openTrader()`, `passTime(h)`, `itemName(id)`, `fight(ids, opts)`.

**`fight(enemyIds, opts)` spawns real enemies around the player.** Combat is real time. `opts`:
`{ onWin: () => string, onLose: () => string, onFlee: () => string, noFlee: bool }`. All callbacks are optional and return a short line (or '').
`onWin` fires when every enemy of that group is dead. `onFlee` fires if the player gets about 18 tiles from all of them. `onLose` fires if the player dies.
fight() returns `undefined`, so content keeps using `fight([...]) || 'text'` and `FG([...]) && 'text'`.

Item ids, enemy ids and location types: see `src/data.js` (`ITEMS`, `ENEMIES`, `LOCS`). Use ONLY those.

### Encounter schema
```js
{
  id: 'unique_id', title: 'Short Title',
  where: ['travel','supermarket'],   // location types; 'any' = anywhere outdoors; 'shelter' = shelter night events
  weight: 10, minDay: 1, night: true|false, once: true, cond: () => bool,  // all optional except id/title/where
  who: 'Speaker name',               // optional: who is talking (shown in the dialogue box)
  text: 'One or two short lines.' | () => '...',
  // EITHER a gameplay moment (physical things are done by playing) ...
  play: { type: 'horde'|'rescue'|'screamer'|'dodge'|'lock'|'race'|'barter', ...params, onWin: () => 'line', onLose: () => 'line' },
  // ... OR real decisions (moral calls, conversations, recruiting, deals), 2–4 replies:
  choices: [
    { label: 'Short reply', req: () => bool, reqText: 'Needs X',
      check: { attr: 'cha', diff: 5 },          // chance shown to the player: 0.6 + (attr-diff)*0.09, clamped 5–95%
      success: () => 'result line', fail: () => 'result line' },
  ],
}
```
Use `play` for anything physical: fights, rescues, dodging, lockpicking, races, trading. Use `choices` only for real decisions.
A choice may *lead* to a fight (`fight([...])`), e.g. "Refuse to pay" makes the Tollmen attack. You never pick "Fight" and get a narrated result.

### Gameplay moment params (`play`)
| type | params | win when | lose when |
|---|---|---|---|
| `horde` | `foes:[ids]` | all foes dead | player dies (or flees: onLose) |
| `rescue` | `foes:[ids]`, `who:'name'` | foes dead, then walk to the survivor | survivor's HP (100) runs out |
| `screamer` | `time:6` (seconds before the shriek) | screamer dead in time | shriek: spawns `extra:[ids]` (default 3 walkers), adds noise |
| `dodge` | `waves:4`, `dmg:[6,12]` | survive the telegraphed collapse rings without being hit 2+ times | hit twice or more |
| `lock` | `mode:'pick'|'pry'`, `diff:1..10` | minigame success (`pick` = timing ring, AGI/PER widen the window; `pry` = mash, STR) | fail (a loud noise, maybe a fight) |
| `race` | `time:40`, `foes:[ids]` | reach the marker and hold E before time runs out | time runs out |
| `barter` | `stock:{id:qty}` optional | trade screen closed (always "win"; onWin may be '') | never |

### Story scenes (content.js `story`)
`{ title, beats: [{ who: 'Mara' | '' , line: 'One short line.' }, ...] , paras: [...] }`. Keep 1–4 beats, each under ~110 characters.
`paras` keeps the long, optional version, which goes to the journal. Scene ids: `intro, first_night, radio_found, radio_fixed, tollmen_demand,
haven_coords, horde_warning, bus_ready, final_choice, end_haven, end_stand, end_stand_fail, end_alliance, end_alliance_fail, death, abandoned`.

---------------------------------------------------------------------------------------------------
## 2. Engine (engine.js): pure rules, no THREE, no DOM (it runs headless in `test.js`)

Coordinates are **tiles** (floats). `W=64, H=48`, `TILE=2` world metres per tile. Tile (x,y) → world `(x*TILE, 0, y*TILE)`. +y is world +z (south).
`WORLD = { tiles:Uint8Array, pois, roofs, containers, shelterRect, bunker, hatch, bus, gate }` (see engine.js `genWorld`).
- tiles: `T_GRASS, T_ROAD, T_WALL, T_DOOR, T_TREE, T_WATER, T_BRIDGE, T_RUBBLE, T_CAR, T_YARD, T_FIELD, T_ROOF (solid closed building), T_FLOOR (walkable interior), T_PROP (solid furniture/container)`.
  `SOLID` set; `tileAt(x,y)`, `solidAt(x,y)`.
- `roofs[]`: building footprints `{x,y,w,h,type,poi,closed?}` (walls are the outer ring of the footprint; doors are T_DOOR on the south wall).
  `buildingAt(x,y)` gives a roof index or -1. `indoors(x,y)`.
- `containers[]`: `{id,x,y,kind,loc,poi}`, one solid prop tile each. `CONTAINERS[kind]` has n/t/r/cats.
  `containerNear(x,y,r)`, `containerState(c)` ('full'|'refilled'|'empty'), `searchTime(c)` (seconds to hold), `searchContainer(c)` → `{loot:[labels], empty, story, lore, enc}`.
- Shelter: `shelterRect`, `bunker {x,y,w,h}` (solid block), `hatch {x,y}` (door: E opens the bunker panel), `BUILD_SLOTS[k]` relative footprints, `slotCentre(k)`.
  `WORLD.bus` sits outside the depot (repair with `canRepairBus()` / `repairBus()`). `WORLD.gate` is the Tollmen gate (E opens the Warden dialogue).
- `poiNear(x,y,r)`, `nearestPoi(type,x,y)`, `districtAt(x,y)`, `inShelter(x,y)`.

Player state: `G.p` `{x,y,face,hp,maxHp,sta,maxSta,hunger,thirst,morale,inf,status,attr,weapon,level,xp,points}`. Time: `G.day, G.hour, G.minute, G.isNight`. `advance(minutes)`.
Combat rules (numbers only): `weaponProfile()` → `{id, ranged, dmg, reach|rng, wind, cd, sta, arc, spread, pellets, ammo, noise}`; `playerHitDamage(prof)`; `useAmmo(prof)`;
`moveSpeed('walk'|'sprint'|'crouch')` tiles/s; `sprintCost()` stamina/s; `DODGE_COST`; `enemyHitsPlayer(enemyId, mult)` (applies armour, bites, bleeding);
`onKill(enemyId)` → drops `[{id,qty}]` (counts the kill, gives XP); `pickup(id,qty)` → label; `zombieTypes()` (the types unlocked so far); `ENEMIES[id].spd/sense/reach/lunge/grab/shape/scale/rng/cd`.
Progression: `G.unlocks` keys `needs, build, craft, people, horde, radio, journal`. `unlock(k)`, `isUnlocked(k)`, `hintOnce(key,text)`.
Objective: `objectiveInfo()` → `{text, target:{x,y}|null}`.
Horde: `G.hordeNight` (tonight), `hordeWaveSize()`, `resolveHorde({held,kills,breaches})`. Endings: `finalOptions()`, `chooseFinal(id)` → ending id | 'wait' | 'wave', `finishStand(held)`.
Encounters: `pickEncounter(type)`, `fieldEncounterRoll(dtSec)`, `checkChance({attr,diff})`, `encEligible`. Shelter: `build(k)`, `canBuild(k)`, `buildCost(k)`, `bl(k)`, `bName(k)`, `sleep()`, `canSleep()`, `eat(id)`.
Trader: `makeTrader()`, `buyPrice(id)`, `sellPrice(id)`. Save: `saveGame`, `loadGame`, `hasSave`, `hasOldSave`.

**Hooks** (engine → browser layers; main.js wires them): `Hooks.log(msg,cls)`, `Hooks.queue(item)` (item.type: scene|enc|summary|final|end),
`Hooks.onDeath()`, `Hooks.flash(kind)`, `Hooks.levelUp()`, `Hooks.toast(text,cls)`, `Hooks.hint(text)`, `Hooks.unlock(key)`,
`Hooks.spawnFight(ids,opts)`, `Hooks.openTrader()`, `Hooks.hordeStart(strength)`, `Hooks.finalWave()`.

---------------------------------------------------------------------------------------------------
## 3. Browser layers (each is a global object; only main.js wires them together)

### `R`: render.js (renderer, camera, light)
- `R.init(parentEl)` creates the WebGLRenderer, scene and camera. Pixel ratio is capped at 1.5 (1 on touch devices). One shadow-casting directional light, hemisphere fill and fog.
- `R.scene`, `R.camera`, `R.renderer`.
- `R.toWorld(x,y,h=0)` → `THREE.Vector3` from tile coords. `R.screenToTile(sx,sy)` → `{x,y}` on the ground plane, or null. `R.tileToScreen(x,y,h)` → `{x,y,on}` in CSS px.
- `R.follow(x,y,face)` sets the camera target. `R.zoom(delta)` uses the wheel or pinch. `R.shake(amount)`.
- `R.setTime(hour, minute)` drives the day/night lighting curve. `R.setFlashlight(on, x, y, face)` is the cone light at night.
- `R.update(dt)` smooths the camera and lighting. `R.render()`.
- Also: `R.pinch(scale)`, `R.nightK` (0 day..1 night, `R.dayK`), `R.time`, `R.touch`, `R.camDist`, `R.flashK`, `R.lookTarget`.

### `World3D`: world.js (static city from WORLD)
- `World3D.build()` builds everything from `WORLD` into `R.scene` with instanced meshes: roads, walls, roofs, props, trees, cars, river, bridges, lamps, fields, the bunker, the yard, the Tollmen camp and the bus.
- `World3D.update(dt, px, py)` runs the roof and upper-wall cutaway for the building the player is in. It also fades walls between camera and player.
- `World3D.containerMesh(id)` → `Object3D|null`. `World3D.setContainerOpened(id, bool)` shows a searched container as opened or dim.
- `World3D.refreshShelter()` rebuilds yard structures from `G.buildings`: bunks, garden, workbench, barricade ring, tower, radio mast and so on, plus a ghost "build here" marker on each unlocked, unbuilt slot.
- `World3D.highlight(kind, id|null)` outlines or glows the current interactable.
- `World3D.barricade` exposes the barricade ring geometry info for horde waves: `{x0,y0,x1,y1}` in tiles.
- Also: `World3D.setObjective({x,y}|false|null)` (the beacon follows `objectiveInfo()` automatically; null = automatic), `World3D.marker(key, {x,y}|null, hex)` (extra ground beacon for moments),
  `World3D.highlight('point', {x,y})`, `barricade.level`, `heightAt(i)`, `cutBuilding`, `fires`.
- How it is drawn: static geometry merged into 32 m chunks (frustum culled); trees, cars, lamps and grass are InstancedMeshes; a material patch does lamp/window glow,
  the roof cutaway for the building you are in (shader discard above a height) and a dithered see-through hole between the camera and the player.

### `Actors`: actors.js (procedural low-poly models + animation)
- `Actors.make(kind, opts)`. kind: `player | survivor | raider | tollman | warden | walker | runner | bloater | screamer | brute | dog`. opts: `{tint}`.
  Returns `{ root:THREE.Group, anim(name), update(dt, speed), flash(), die(), setAware(v|null), setCarry(itemId|null), dispose() }`.
  anim names: `idle, walk, run, crouch, attack, lunge, shoot, hit, die, work, scream`. Each zombie type has a distinct silhouette.
  Also: `anim('attack', {wind})` stretches the wind-up; extra anims `roll` (dodge), `grab`, `held`; `actor.aiming`; `Actors.itemMesh(id)` (pickup model); `Actors.night` (eyes glow).

### `Combat`: combat.js (everything that moves)
- `Combat.init()`, `Combat.reset()`, `Combat.update(dt)` (call only while unpaused).
- `Combat.player` is the player actor. It reads `INPUT` (from ui.js) and writes `G.p.x/y/face`. Movement modes: walk, sprint, crouch, dodge roll. Collision uses `solidAt` with radius 0.3.
- Melee uses `weaponProfile()` reach, wind-up, cooldown, stamina and arc. Guns use aim (`INPUT.aimX/aimY` → `R.screenToTile`), ammo via `useAmmo`, noise and spread.
- Enemies have awareness (0..1 meter, shown above their head), wander, investigate noise, chase, lunge and grab. A grab is broken by mashing attack or E.
  Type behaviours: runner sprint, bloater gas cloud on death, screamer shriek that summons, brute knockback, dog packs. Raiders and Tollmen shoot and keep distance.
- `Combat.spawnFight(ids, opts)` spawns a group 8–12 tiles away on walkable tiles, already aware, and runs the opts callbacks (see §1).
- Ambient population: zombies of `zombieTypes()` spawn out of sight near the player and despawn far away. Density rises with night, district danger (`LOCS[type].danger`) and `G.noise`. None spawn inside the shelter rect (except horde waves).
- `Combat.noise(x,y,radius)` alerts enemies in range. Sprinting, gunfire and searching make noise; crouching halves detection.
- Drops: `Combat.drop(x,y,id,qty)` creates a pickup. Walking over food, ammo or materials picks them up automatically; weapons and gear need E. Uses `pickup()`.
- `Combat.startWave(count, onEnd({held,kills,breaches}))` runs a horde-night wave. Zombies come from the yard edges and hit the barricade ring (HP from `bl('walls')`). Guards (`job==='guard'|'tower'`) shoot from the yard.
- `Combat.survivors` are shelter NPCs that walk to their job slot and loop a work animation. They are visible only near the shelter.
- `Combat.nearestDrop(x,y,r)` → `{uid,x,y,id,qty}|null`, `Combat.pickupDrop(drop)`, `Combat.enemiesNear(x,y,r)`, `Combat.inFight()` (true while any aware enemy is chasing within ~14 tiles, or a wave/fight group is alive), `Combat.clear()`.
- UI-facing state: `Combat.grabbed`, `grabNeed/grabMash`, `dodging`, `barricadeHp/barricadeMax` (0/0 when no wave), `aware`, `threat` (0..1), `wave`.
- Extras: `spawnAt(id,x,y,{aware,screamTime})`, `kill(e)`, `despawn(e)`, `hurtEnemy(e,n,opts)`. `spawnFight` opts may carry `screamTime` and `at:{x,y}`.
- Pathing: enemies follow a BFS flow field from the player over walkable tiles (refreshed 4x/s). Horde-wave zombies far from the ring follow it too,
  and `walkTo` slides along one axis before detouring, so nobody jams in one-tile gaps.

### `Moments`: moments.js (encounter `play` runner)
- `Moments.start(enc, done(resultLine))` runs `enc.play`, calling `onWin`/`onLose` and then `done` with the line. It uses Combat for spawns, UI for overlays (`UI.lockpick`, `UI.barter`, `UI.timer`) and R/World3D for markers.
- `Moments.active` (bool), `Moments.update(dt)`.
- Also: `Moments.abort()` (silent end on title/end/death), `Moments.target` (`{x,y,label}` the HUD arrow points at during a moment).

### `UI`: ui.js + shell.html (DOM HUD, panels, input, audio)
- `INPUT` global: `{mx,my}` (move, -1..1; WASD, arrows or the virtual joystick), `sprint, crouch, attack` (held), `attackPressed, dodgePressed, interactPressed` (edges; whoever handles one sets it false), `interact` (held), `aimX, aimY` (screen px or null), `touch` (bool).
- Keys: WASD/arrows move. Shift sprint. C or Ctrl crouch. Space dodge. Left click or J attacks. E interact (hold to search). I pack. Tab journal. B character. Esc menu. Mouse aims. Wheel zooms.
- `UI.init()`, `UI.update(dt)` refreshes the HUD each frame. It reveals bars progressively: HP and stamina always; hunger and thirst after `unlocks.needs`; survivors after `people`.
- `UI.toast(text,cls)`, `UI.hint(text)` (one-line contextual tip), `UI.banner(title, line)` (encounter one-liner at the top), `UI.prompt(text|null, progress|null)` (the "Hold E to search" bar near the bottom centre).
- `UI.dmgNum(x,y,text,cls)` for floating numbers at tile coords. `UI.flash(kind)`. `UI.vignette()` reacts to low HP, infection and grabs. `UI.levelUp()`.
- `UI.dialogue({ who, lines:[...], choices:[{label, note, disabled, onPick}] })` is the short speaker box, 1–2 lines at a time and 2–4 replies. Stat replies show e.g. "CHA 62%".
- `UI.encounter(enc, done(resultLine))` shows a choice encounter as a dialogue (with checks and req), then a result line, then `done`.
- `UI.scene(id, done)` plays story beats one at a time. `UI.summary(item, done)` is the morning summary. `UI.final(done)` offers the endings via `finalOptions/chooseFinal`. `UI.end(id)` is the end screen.
- `UI.open(panel)` with panel `'pack'|'char'|'journal'|'shelter'|'trader'|'menu'|'map'|'tollcamp'`. `UI.blocking()` → true when anything modal is open (the game pauses).
- Minigames: `UI.lockpick({mode,diff}, done(ok))`, `UI.barter(stock, done)`. Timer: `UI.timer(label, seconds|null)`.
- `UI.title()` is the title screen with Continue, New game (quick start: pick a background, no stat page needed) and Help.
- `SFX.play(name)` is Web Audio synth, started after the first input: `swing, hit, shoot, shotgun, hurt, pickup, open, build, levelup, scream, groan, step, ui`.
- Also: `SFX.unlock()`, `SFX.toggle(on?)`, `UI.momentPrompt(text,progress)`, `UI.worldBar(key,x,y,frac,label)`, `UI.tollcamp()` (sets `G.flags.warden_met`),
  `UI.swapWeapon()` (Q), `UI.spendPoint(attr)`, `UI.craft(i)`. Dialogue `lines` may be strings or `{who,line}` beats; a visible choice picks on the first click even mid-typewriter.

### `main.js`: boot + loop + glue
It wires Hooks, runs the game loop, advances time (1 real second = 1 game minute outside, faster indoors at the shelter when sleeping), handles interaction (containers, drops, hatch, gate, build markers, bus), the encounter queue, horde nights, death and saving.

---------------------------------------------------------------------------------------------------
## 4. Checks (run all of them after any change)

1. `node build.js` regenerates `index.html`, `Dead Embers.html` and `artifact/dead-embers.html` (Three.js inlined).
2. `node test.js` (headless, no browser): every encounter, choice and `play` callback, item/enemy ids, world reachability, 14 simulated days, save/load. Must print `OK`.
3. `node tools/browser-check.js` and `node tools/browser-check.js --mobile`: headless Edge/Chrome (SwiftShader) loads the built page, plays a short scenario,
   prints page errors (there must be none) and saves screenshots (`--shots dir`) you can open and look at.
4. `node tools/browser-check.js --scenario tools/scenarios/playthrough.js`: the end-to-end route (cold open, walk to the objective, hold-E search, melee and gun
   fights, build, screamer and rescue moments, a decision, sleep to day 2, a horde night, the Haven ending). Prints `STEP name: ok|FAIL` and exits 1 on any FAIL.
   Other scenarios: `tools/scenarios/world.js` (city/lighting shots), `combat.js` (actor lineup, fights), `ui.js` (every panel, minigame and moment).
- `tools/harness.js` is the in-page harness those scenarios use (never bundled). In any running page: `fetch('tools/harness.js').then(r=>r.text()).then(eval)`, then
  `sim(sec, ctl)` steps the game deterministically at 20 fps without drawing, `goto(x,y)` walks there by BFS, `fightBot(ids, gun)`, `searchNearest()`, `holdE(sec)`, `state()`.
  Use it in the Browser pane too: a hidden pane pauses requestAnimationFrame, so drive the loop with `sim()` instead of waiting.
- Dev console: `__skipTo(2)` (radio built) and `__skipTo(3)` (last night) jump the story forward.
