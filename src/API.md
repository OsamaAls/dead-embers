# Dead Embers: contracts between files

Game: zombie-apocalypse survival RPG in **3D** (Three.js r159, bundled from `vendor/three.min.js`, global `THREE`).
It ships as one self-contained HTML page. Plain browser JS (ES2019): no modules, no imports, every file is a classic script sharing the global scope.
Build order (see `build.js`): data, content, encounters, arcs, **engine**, world, actors, render, combat, moments, cinematic, ambience, ui, main.

Setting: **Ardent Vale**, 14 months after the **Grey Fever**. The player lives in a **metro maintenance bunker** (the shelter).
The radio speaks of **Haven** beyond the northern mountains. Raider gang **the Tollmen**, led by **the Warden**, extort survivors.
In Act 3 a great horde comes. The endings are: bus to Haven (the Convoy with Vance alive), hold the bunker, ally with the Warden, storm the Tollmen camp, broadcast Okafor's formula from KVAL, ring the Choir's bells, or walk north alone.
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
haven_coords, horde_warning, first_frost, first_snow, bus_ready, final_choice, end_haven, end_stand, end_stand_fail, end_alliance, end_alliance_fail, death, abandoned`.
weatherTick queues `first_frost` (first late-season morning) and `first_snow` (first snow where the player stands, the pass included); both have short cutscenes.

---------------------------------------------------------------------------------------------------
## 2. Engine (engine.js): pure rules, no THREE, no DOM (it runs headless in `test.js`)

Coordinates are **tiles** (floats). `W=112, H=84`, `TILE=2` world metres per tile. Tile (x,y) → world `(x*TILE, 0, y*TILE)`. +y is world +z (south).
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
Progression: `G.unlocks` keys `needs, build, craft, people, horde, radio, journal, fetch`. `unlock(k)`, `isUnlocked(k)`, `hintOnce(key,text)`.
Objective: `objectiveInfo()` → `{text, target:{x,y}|null}`.
Horde: `G.hordeNight` (tonight), `hordeWaveSize()`, `resolveHorde({held,kills,breaches})`. Endings: `finalOptions()`, `chooseFinal(id)` → ending id | 'wait' | 'wave', `finishStand(held)`.
Encounters: `pickEncounter(type)`, `fieldEncounterRoll(dtSec)`, `checkChance({attr,diff})`, `encEligible`. Shelter: `build(k)`, `canBuild(k)`, `buildCost(k)`, `bl(k)`, `bName(k)`, `sleep()`, `canSleep()`, `eat(id)`.
Trader: `makeTrader()`, `buyPrice(id)`, `sellPrice(id)`, `traderDay()` (the caravan calls at the bunker every 4 days; the radio can call it).
**Saved worlds:** index `localStorage.deadembers_slots` = `[{id,name,bg,pname,day,level,lastPlayed,ended,endId,cause,kills,survivors}]`, each world at `deadembers_world_<id>`.
`G.slot` (current world id, made on the first save), `G.worldName`. `listWorlds()` (most recent first), `lastWorldId()` (most recent continuable), `hasSave()` (any continuable world),
`saveGame(silent)` (writes the slot + index), `loadWorld(id)` (false for ended worlds), `loadGame()` (= last world), `deleteWorld(id)`, `forkWorld(name)` ("save as new world": play on in a new slot),
`markEnded(endId)` (death/ending: the slot becomes a memorial, never deleted; `endGame` and the end screen call it). The old `deadembers_save_v2` migrates once into a slot named after the character.
`newGame(name, bg, attrs, worldName)`.
**Companions:** `G.companion = {kind:'dog'|'survivor', id, name}|null` (one at a time), `G.dog = {name,hp,restUntil,since}` once adopted. `adoptDog(name)` (sets `dog_adopted`; teodor_4 "Share food with Biscuit",
`guard_dog`, and the `stray_pump` → `stray_name` chain call it), `companionReady(kind,id)` → `{ok,why}`, `setCompanion(kind,id)`, `clearCompanion()`, `companionInfo()` → `{kind,id,name,hp,maxHp,s?}`,
`companionHurt(n)` → `ok|home|downed`, `companionHome(why)` (rests until tomorrow, `restUntil`), `companionRevive()`, `companionCarry()` (+8 kg for a helper, in `carryCap()`), `companionScavBonus(container)`,
`companionFights()` (horde waves are ~15% bigger while one is with you: `hordeWaveSize()`).
**Talk:** `survivorMood(s)`, `chatSurvivor(s)` (+morale once a day), `giftItem()`, `giftSurvivor(s)`, `maybeRequest(s)` / `requestOf(s)` / `canDeliver(s)` / `deliverRequest(s)` (`G.requests [{sid,item,qty,day}]`), `jobChoices(s)`, `setJob(s,job)`. Lines: `CONTENT.survivorTalk`.
**Interactions:** doors `G.doorBars[tileIndex]=hp`: `barDoor(tx,ty)` (2 wood), `unbarDoor`, `doorBarred`, `doorBlocked(x,y)` (collision, both ways), `hitDoorBar(tx,ty,dmg)` (~6 s of one zombie), `barredAny()`;
wrecks `siphonCar(tx,ty)` / `carSiphoned` (`G.siphoned`, once per car; `hose` item always works, else 40%); `fillBottle()` (bottle → dirty water); `cookOption()` / `cookAt()` (fires and the kitchen: boil, meat, stew);
`restOutside()` (+ main heals 6); `radioBroadcast()` → `{lines, trader}` (`CONTENT.radio`, `CONTENT.radioHints`).
**Props** (`placeProps(seed, w, parks)`, called last in `genWorld` with its own random stream, so old saves keep their exact map; `test.js` pins the layout of three seeds):
`WORLD.notes [{x,y,fx,fy,place,i}]` (writing on a wall facing fx,fy; `place` = a story place, whose lines come from `CONTENT.placeNotes[place]`, else `CONTENT.graffiti[i]`),
`WORLD.bodies [{x,y,in,r}]` (about 30, on roads by wrecks and indoors; `G.bodies['x,y']` = day searched), `WORLD.pumps [{x,y,under}]` (7 hand pumps, solid `T_DECO`: a bottle → clean water),
`WORLD.beds [{x,y,kind,fx,fy}]` (bed / couch / cot in homes). `propNear(list,x,y,r)`, `readNote(n)`, `searchBody(b)`.
**Weapon wear:** `G.wear[id]` 100..0 per weapon type. `weaponCond(id)`, `wearWeapon(id, amt)` (`WEAR_MELEE` 1 per connecting swing, `WEAR_SHOT` 0.4 per shot; hint below 60),
`playerHitDamage` scales by ×(0.6+0.4·cond/100), never breaks. `repairCost(id)` = ceil(missing/25) scrap, `repairWeapon(id)` (workbench ≥1). A type you own none of comes back fresh in `give()`.
**Act bosses:** `actNow()` 1|2|3 (from `radio_built` / `q_bus`, like the seasons). `BOSS_LAIR[id] = {act, type|label, r?, minDay?, journal}` for `orderly` (hospital, day 3+), `butcher` (Cold Store), `sergeant` (Wrecked Convoy, within 5 tiles).
`bossHere(x,y)` → the boss id that should be there now | null; `bossMet(id)` (true the first time: show the intro); `onKill` calls `bossKilled(id)` (journal + toast). `G.bosses[id]` = 'met'|'dead'.
Boss `ENEMIES` entries borrow a kind's `shape` with a bigger `scale`, a `look` (KINDS overrides) and `guar` drops. The `bosses` epilogue names the dead ones.
**The night's haul:** `found(id, qty)` = `give()` for things found out in the world (containers, bodies, pickups, the dog); with kills it adds to `G.haul {items,value,kills}` while `isNight()`.
`dailyTick` opens the dawn summary with the haul (only after a night run) and keeps `G.best.haul` (by value).
**Dog fetch:** `fetchBlock()` → why not (no dog, not unlocked, `FETCH_CD` 90 game min) | null; `fetchTarget(x,y)` (nearest non-empty container within `FETCH_R` 12 not raided today, `G.fetched[id]`);
`dogFetch(c)` → item id (starts the cooldown). Unlock key `fetch`, after a day with the dog (`G.day - G.dog.since >= 1`).

### World, biomes, gates, weather, seasons
- **Map.** `W×H = 112×84`. Biomes (`BIOMES`, `biomeAt(x,y)`): oldtown, suburbs, forest (with the hills), farm, flooded, docks, pass. The river is at x 85–87; Haven's road leaves the top edge at about x 74.
- **New tiles:**
  - Walkable: `T_SHALLOW` (slows ×0.6), `T_BUSH` (a crouching player inside is hidden beyond 2 tiles), `T_PATH`, `T_PLANK`.
  - Solid: `T_GATE`, `T_DECO`, `T_ROCK`, `T_FENCE`.
  - `WORLD.flora`, `decos`, `fires` (engine-placed barrel fires), `gates` and `camp`. New LOCS (each with an `alias` for older encounters): park, docks, warehouse, suburbs, house, garage, ranger, flooded, pass.
- **Story gates.** The forest opens on `radio_built` once the `radio_fixed` scene has been queued (`G.seenScenes.radio_fixed`: Mara names the ranger station there), the docks on `marcus_3` or day 8, and the pass on `q_bus`.
  - `gateCheck()` runs hourly and from `storyCheck`. `openDistrict(id)` sets `open_<id>` and calls `Hooks.gateOpened(id)` if set.
  - `districtOpen(biome)` tells you whether a biome is reachable. Nothing spawns in a closed district: `findSpot` (ambient, reinforcements), `Moments.spotNear` (encounter enemies) and `waveSpawnPoint` all skip it; `biomes.js` checks it.
- **Weather.** `G.weather` is clear, rain, fog or snow, persisting 4–10 h and weighted by season. `G.storm` marks the last-night snowstorm, and `G.snowCover` runs 0..1.
- **Modifiers** (combat reads them): `hearMul` (rain ×0.6), `sightMul` (fog ×0.6), `zSpeedMul` (snow ×0.85), `moveMul`, `coldK` (outdoor snow without a `coat` or `nearFire`: stamina drains and regenerates slowly), `inBush` and `zMix` (zombie mix per biome).
- **Season** (`seasonNow()`, `G.season`) follows the act: autumn → late (radio built) → winter (bus quest).

### Endings
`finalOptions()` lists bus/convoy, stand, ally, and the earned ones:
- `cure`: `radio_built`, `ines_formula` or `ines_joined`, and 3 antibiotics.
- `storm`: `warden_secret` or `tollmen_secret`.
- `choir`: `choir_joined`.
- `alone`: always offered.

`chooseFinal(id)` returns an ending id, `'wait'`, or a played sequence (`'wave' | 'cure' | 'storm'`) that `UI.final` hands to `Game.finalRun(kind)`.
- **Final stand.** `finalWavePlan()` returns `{count, bonus, surges, D, need}`. Defense shrinks the horde and adds barricade HP; the wave comes in 3 surges, everyone fights, and 7 zombies inside at once means overrun.
- **`finishStand(held)`, `finishCure(ok)`, `finishStorm(ok)`** resolve the played sequences.
- **Epilogues.** `endingEpilogue(id)` returns up to 5 lines from `EPILOGUES` (content.js: `{id, cond, line|line(id), endings|null, pri}`).
- **Ending ids:**
  - Bus: `end_haven`, `end_convoy`.
  - Stand: `end_stand`, `end_stand_fail`.
  - Alliance: `end_alliance`, `end_alliance_fail`.
  - Others: `end_cure`, `end_cure_fail`, `end_usurp`, `end_alone`, `end_choir`, `death`, `abandoned`.

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
- Props: notes, bodies, pumps and beds are built into the merged chunks (no extra draw calls). `World3D.setBodySearched(b, on)` darkens a searched body.
  Crows (one InstancedMesh, 18 birds) settle on outdoor bodies near the player by day and lift off when you come within ~5 tiles; `World3D.crowsNear(x,y,r)` lets Ambience caw from the real birds.
- Snow footprints: one InstancedMesh ring of 160 decals laid behind the player (boots) and the dog (paw pairs) on outdoor snow while `G.snowCover > 0.3`.
  The blend multiplies the ground, so they work by day and night; they fill in over 90 s and melt with `R.env.uSnow`.
- How it is drawn: static geometry merged into 32 m chunks (frustum culled); trees, cars, lamps and grass are InstancedMeshes; a material patch does lamp/window glow,
  the roof cutaway for the building you are in (shader discard above a height) and a dithered see-through hole between the camera and the player.

### `Actors`: actors.js (procedural low-poly models + animation)
- `Actors.make(kind, opts)`. kind: `player | survivor | raider | tollman | warden | walker | runner | bloater | screamer | brute | dog`. opts: `{tint, scale, k}` (`k` overrides the kind's look: the act bosses).
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
- `Combat.companion` `{kind,id,name,a,x,y,mode:'follow'|'stay'|'downed',target,sniff,sniffs,warned,bites,hits,pulls,downT}`: follows on the flow field (warps to you past 25 tiles, when stuck, or when you are home), fights what hunts you,
  pulls a grabber off you, takes hits from enemies next to it. Dog: bites (stun 0.8 s), every ~8 s marks the nearest unsearched container within 12 tiles (`World3D.marker('sniff')`), growls and marks zombies that turn aware within 10 tiles.
  Fetch (`INPUT.fetchCmd`: R or the FETCH touch button): `C.companion.fetch = {k, g, f, phase:'go'|'dig'|'back', item}`; a BFS distance field to the container's open side, a short dig
  (`dogFetch`), then home on the normal follow; handed over within 2.2 tiles via `found()` (or dropped at your feet if the pack is full).
- Act bosses: `updateBoss` checks `bossHere()` every 0.5 s and spawns the boss at the far end of the lair building (aware), with `UI.banner(name, intro)` the first time.
  Helper: pistol at combat 4+, else melee; medic heals you after a fight; downed at 0 HP (20 s to revive: `Combat.reviveCompanion()`, main's hold E). `Combat.companionCommand()` / `INPUT.companionCmd` (H) toggles stay/follow.
- Barricaded doors block movement in `hitR`; a chasing zombie at one claws it (`Combat.doorHits`, a world bar shows its HP). Hook: `World3D.setDoorBar(tx,ty,on)` if present.
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
- Keys: WASD/arrows move. Shift sprint. C or Ctrl crouch. Space dodge. Left click or J attacks. H companion stay/follow. E interact (hold to search). I pack. Tab journal. B character. Esc menu. Mouse aims. Wheel zooms.
- `UI.init()`, `UI.update(dt)` refreshes the HUD each frame. It reveals bars progressively: HP and stamina always; hunger and thirst after `unlocks.needs`; survivors after `people`.
- `UI.toast(text,cls)`, `UI.hint(text)` (one-line contextual tip), `UI.banner(title, line)` (encounter one-liner at the top), `UI.prompt(text|null, progress|null)` (the "Hold E to search" bar near the bottom centre).
- `UI.dmgNum(x,y,text,cls)` for floating numbers at tile coords. `UI.flash(kind)`. `UI.vignette()` reacts to low HP, infection and grabs. `UI.levelUp()`.
- `UI.dialogue({ who, lines:[...], choices:[{label, note, disabled, onPick}] })` is the short speaker box, 1–2 lines at a time and 2–4 replies. Stat replies show e.g. "CHA 62%".
- `UI.encounter(enc, done(resultLine))` shows a choice encounter as a dialogue (with checks and req), then a result line, then `done`.
- `UI.scene(id, done)` plays story beats one at a time. `UI.summary(item, done)` is the morning summary. `UI.final(done)` offers the endings via `finalOptions/chooseFinal`. `UI.end(id)` is the end screen.
- `UI.open(panel)` with panel `'pack'|'char'|'journal'|'shelter'|'trader'|'menu'|'map'|'tollcamp'`. `UI.blocking()` → true when anything modal is open (the game pauses).
- Minigames: `UI.lockpick({mode,diff}, done(ok))`, `UI.barter(stock, done)`. Timer: `UI.timer(label, seconds|null)`.
- `UI.title()` is the title screen with Continue, New game (quick start: pick a background, no stat page needed) and Help.
- Title: Continue (last world played), Worlds (`title('worlds')`: load, delete with a confirm step; ended worlds are memorials with their ending or "Fell on day N"), New world (world name + your name + background).
  Menu: Save now, Save as new world. `UI.talk(survivor)` (the talk dialogue), `UI.radio()` (bunker broadcast; calls the caravan on its day). HUD: `#cmp` companion chip (name, mode, HP), `#wx` weather/season,
  touch `#t-comp` (STAY/FOLLOW). The People tab has Take on runs / Leave at home (dog row too). The morning summary adds a radio forecast once the radio is built.
- `SFX.play(name)` is Web Audio synth, started after the first input: `swing, hit, shoot, shotgun, hurt, pickup, open, build, levelup, scream, groan, step, ui`.
- Also: `SFX.unlock()`, `SFX.toggle(on?)`, `UI.momentPrompt(text,progress)`, `UI.worldBar(key,x,y,frac,label)`, `UI.tollcamp()` (sets `G.flags.warden_met`),
  `UI.swapWeapon()` (Q), `UI.spendPoint(attr)`, `UI.craft(i)`. Dialogue `lines` may be strings or `{who,line}` beats; a visible choice picks on the first click even mid-typewriter.

### Combat additions
- **Lock-on** (keyboard or touch, when `!INPUT.mouseAim`): `Combat.target` is sticky. **F** (`INPUT.cyclePressed`) cycles targets and **Shift+F** (`INPUT.clearLock`) clears the lock. With the mouse, aim snaps to the enemy whose chest is within ~48 px of the cursor. `UI.lockOn(enemy)` draws the chevron and HP bar.
- **Sneak attacks:** a melee hit on an unaware zombie deals ×3 damage.
- **Bottles:** **G** (`INPUT.throwPressed`) throws a `bottle` up to 8 tiles; it stops at walls and its noise lures zombies.
- **Fight feedback:** a "Clean sweep" XP bonus for a fight won unhurt, and "Double!" / "Triple!" call-outs.
- **Horde waves.** `Combat.startWave(count, onEnd, {bonus, final, surges})`.
  - Overrun: 6 zombies inside the yard at once (7 on the final stand).
  - A wave zombie with no headway for 10 s respawns at an edge, and unreachable stragglers are cleared.
  - Stuck bodies recentre on their tile before detouring.

### `Cine`: cinematic.js (cutscenes)
- `Cine.play(shots, done)`, `Cine.active` (counted by `UI.blocking()`), `Cine.update(dt)`, `Cine.skip()`, `Cine.next()`.
- **Shot fields:** `{cam:[from,to], look:[from,to], dur, ease, caption:{who,line}, fx:[...], hour, actors:[...], orbit, track, fov, onStart/onUpdate/onEnd}`.
- **Intro:** `Cine.intro(done)` and `Cine.introSeen()` (`localStorage.deadembers_seen_intro`). It plays once on the first new world; "Watch the intro" is on the title and in the menu. `Cine.autoIntro` is false in headless browsers.
- **Cutscenes:** `Cine.cutscene(id, done)` and `Cine.has(id)`, once per world (`G.seenCine`). `CUTSCENES` ids:
  - Story: radio_fixed, tollmen_demand, horde_warning, bus_ready, first_rescue.
  - Gates: gate_forest, gate_docks, gate_pass.
  - Endings: one per ending id, including death.
- **Skipping:** Space/Enter/E/Esc or a tap moves to the next shot. Holding for 0.6 s, or Esc twice, skips the scene.
- **Wiring:** main.js plays the cutscene before story scenes and endings (`UI.end` is wrapped at boot).

### `Ambience`: ambience.js (no music)
- `init()`, `update(dt)`, `volume` and `setVolume(v)` (slider in the menu), `cue(name)` (cutscene sounds), `debugState()` (sources with reasons) and `scan()`.
- Every sound comes from a scan, every 0.5 s, of what is actually near the player: trees and wind, water, fires, real zombies, survivors, indoors, weather, biome props and time of day. A quiet street is nearly silent.
- **Levels:** the master gain is volume × 0.2. Ambience ducks in cutscenes, dialogue and fights.

### Actors and world animation
- **`Actors.GESTURES`:**
  - Loops: search, hammer, chat.
  - Timed: pickup, eat, drink, bandage, inspect, handshake, wave, cheer, point.
- **Zombies:** `actor.mood('feed'|'sway'|'shuffle'|'turn'|'still'|null)`, `die(variant)` (back, forward or spin-down), and `anim('hit',{hard:true})` for a stagger.
- **World:**
  - `World3D.burst(x, y, hex, n, spread)` makes a dust or ember puff.
  - Container lids swing open.
  - Newly built shelter structures rise out of the ground.
  - `World3D.natureNear(x, y, r)`, `refreshGates()` and `busMesh`.

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
   Other scenarios: `worlds.js` (saved worlds, keys only, with a reload), `companions.js` (dog incl. fetch, helper, talk, siphon, water, cook, door, props), `endings.js`, `keyboard.js`,
   `biomes.js` (every biome/weather/season shot; also no spawns across closed gates and the busiest view under 180 draw calls), `cinematic.js`,
   `balance.js` (not pass/fail: prints `BAL` lines for travel, zombie density per biome by day and night, winter cold with and without a coat, the bus quest and the final stand; `BAL_N=10`), `tools/scenarios/world.js` (city/lighting shots), `combat.js` (actor lineup, fights), `ui.js` (every panel, minigame and moment).
- `tools/harness.js` is the in-page harness those scenarios use (never bundled). In any running page: `fetch('tools/harness.js').then(r=>r.text()).then(eval)`, then
  `sim(sec, ctl)` steps the game deterministically at 20 fps without drawing, `goto(x,y)` walks there by BFS, `fightBot(ids, gun)`, `searchNearest()`, `holdE(sec)`, `state()`.
  Use it in the Browser pane too: a hidden pane pauses requestAnimationFrame, so drive the loop with `sim()` instead of waiting.
- Dev console: `__skipTo(2)` (radio built) and `__skipTo(3)` (last night) jump the story forward.
- Scenario conventions: `G.encTimer = 1e9` turns random encounters off (field rolls and container searches). The lock/pry minigame is ticked from `UI.update`, so it runs under `sim()`.
