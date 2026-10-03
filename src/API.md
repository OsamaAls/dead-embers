# Dead Embers — content API (contract between engine and content files)

Game: zombie-apocalypse survival strategy RPG, single HTML page, vanilla JS (ES2019, no modules, no imports).
Setting: city of **Ardent Vale**, 14 months after the **Grey Fever** outbreak turned most people into the dead.
Player wakes in a half-collapsed **metro maintenance bunker** (the shelter). A looping radio broadcast speaks of
**Haven**, a safe zone beyond the northern mountains. Raider gang **the Tollmen**, led by **the Warden**, extort
survivors. Act 3: a **great horde** migrates toward the city; player must flee by bus to Haven, hold the shelter, or ally with the Warden.
Tone: grim, grounded, human, occasional dark humor. Short punchy prose (2–5 sentences per text). No gore porn.

## Globals available to content functions (all defined by engine)
- `G` — game state. Useful fields:
  - `G.day` (1+), `G.hour` (0–23), `G.isNight` (bool, 20:00–06:00)
  - `G.p` player: `{name, attr:{str,end,per,cha,agi,int} (1–10), hp, maxHp, sta, maxSta, hunger, thirst, morale}` (vitals 0–100; hunger/thirst = 100 means full)
  - `G.survivors` — array of `{id,name,trait,skills:{farm,scav,build,med,combat},hp,morale,job}`
  - `G.locType` — current location type string (see below), `G.atShelter` bool
  - `G.flags` — object for story/encounter flags
- `rnd(min,max)` → int inclusive. `chance(p)` → bool, p in 0..1. `pick(arr)` → random element.
- `give(id, qty)` → adds item, returns label like "+2 Canned Food".
- `take(id, qty)` → bool (removes if available). `has(id, qty=1)` → bool.
- `hurt(n, cause)`, `heal(n)`, `tire(n)` (drain stamina), `rest(n)` (restore stamina), `feed(n)`, `drink(n)`, `addMorale(n)` (player morale; also used for shelter mood)
- `xp(n)` award experience (typical: 5–30)
- `addNoise(n)` — raises zombie attention (1–3 typical)
- `bite()` — zombie bite; engine rolls infection
- `setStatus(name, value)` — statuses: `'bleeding'` (hours), `'sick'` (hours), `'injured'` (hours)
- `flag(k)` → value, `setFlag(k, v)`
- `journal(title, text)` — add journal entry
- `fight(enemyIds, opts)` — queue a combat that starts after the result text is shown. `enemyIds` array of enemy ids.
  `opts` optional: `{ onWin: () => string, noFlee: bool }`. onWin may give loot and returns extra text.
- `recruit(opts)` → survivor. opts optional partial `{name, trait, skills}`; returns the new survivor object (or null if shelter refuses).
- `randomSurvivor()` → a survivor or null. `killSurvivor(s, cause)`.
- `damageBuilding()` → returns name of building damaged or null.
- `openTrader()` — queue the trade screen after the result text.
- `passTime(hours)`
- `itemName(id)`

## Item ids (use ONLY these)
food: `canned` (Canned Food), `rawmeat` (Raw Meat, can make sick), `veg` (Vegetables), `meal` (Cooked Meal), `snack` (Snack Bar)
water: `dirtywater` (Dirty Water, can make sick), `water` (Clean Water)
materials: `wood`, `scrap` (Scrap Metal), `cloth`, `parts` (Components), `fuel`, `chem` (Chemicals)
medical: `bandage`, `medkit`, `antibiotics`, `painkillers`, `serum` (experimental cure, very rare)
weapons: `knife`, `pipe`, `bat`, `machete`, `axe`, `crossbow`, `pistol`, `shotgun`
ammo: `bolts`, `ammo` (pistol), `shells` (shotgun)
gear: `backpack`, `boots`, `vest` (armor)
trade/misc: `cigs` (Cigarettes — barter currency), `batteries`
story: `radio_coil`, `radio_antenna`, `radio_cell`, `engine_parts`, `haven_map`

## Enemy ids (use ONLY these)
`walker`, `runner`, `bloater`, `screamer`, `brute`, `zdog` (infected dog), `raider`, `tollman`, `warden`

## Location types (G.locType)
`shelter`, `street`, `supermarket`, `hospital`, `police`, `gas`, `factory`, `farm`, `river`, `forest`,
`apartments`, `electronics`, `radiotower`, `military`, `depot`, `tollcamp`
Special pseudo-location for encounters: `'travel'` (happens while moving between tiles).

## Encounter / event schema
```js
{
  id: 'unique_id',
  title: 'Short Title',
  where: ['travel','supermarket'],   // location types where it can fire; 'any' = anywhere outdoors; 'shelter' = shelter night events
  weight: 10,                         // relative frequency (5 rare – 20 common)
  minDay: 1,                          // optional
  night: true,                        // optional: true = only at night, false = only day, omit = both
  once: true,                         // optional: only ever fires once
  cond: () => bool,                   // optional extra condition
  text: 'string' | () => 'string',
  choices: [
    {
      label: 'Swing the pipe',
      req: () => has('pipe'),         // optional: hide/disable choice if false
      reqText: 'Needs a pipe',        // optional label shown when req fails
      check: { attr: 'agi', diff: 5 },// optional stat check; chance shown to player:
                                      //   ~60% when attr == diff, ±9% per point, clamped 5–95%
      success: () => 'result text',   // runs if no check, or check passed. Do effects inside (give/hurt/etc.)
      fail: () => 'result text',      // runs if check failed
    },
  ],
}
```
Every encounter should have 2–4 choices, at least one always available (no req). Result functions MUST return a string.
Mix of combat (`fight([...])`), stat checks, item trade-offs, moral choices, recruitment (`recruit()`), loot.
