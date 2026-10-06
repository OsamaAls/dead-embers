/* Headless checks: node test.js  (exit code 1 on any failure)
   Loads the game rules (data, content, encounters, arcs, engine) in a vm without THREE or a DOM. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const errors = [];
const fail = (where, e) => { errors.push(where + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); };
const store = {};
const ctx = {
  console, Math, JSON, Date, Object, Array, String, Number, Set, Map, Uint8Array, Error, parseInt, parseFloat, isNaN,
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
const src = ['data.js', 'content.js', 'encounters.js', 'arcs.js', 'engine.js'].map(f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8')).join('\n;\n');
vm.runInContext(src + `
;window.__T = { get G() { return G; }, get WORLD() { return WORLD; }, Hooks, PENDING, newGame, dailyTick, allEncounters, advance, ITEMS, ENEMIES, LOCS, CONTAINERS, W, H, SOLID, genWorld,
  searchContainer, containerState, objectiveInfo, finalOptions, chooseFinal, saveGame, loadGame, onKill, resolveHorde, weaponProfile, enemyHitsPlayer, give,
  BIOMES, GATE_OF, openGateTiles, gateCheck, weatherTick, seasonNow, hearMul, sightMul, zSpeedMul, moveMul, T_SHALLOW,
  serialize, listWorlds, loadWorld, deleteWorld, forkWorld, markEnded, hasSave, lastWorldId, recruit, adoptDog, setCompanion, clearCompanion, companionInfo,
  companionHurt, companionCarry, carryCap, hordeWaveSize, barDoor, unbarDoor, doorBlocked, hitDoorBar, siphonCar, fillBottle, cookAt, cookOption, radioBroadcast,
  maybeRequest, requestOf, deliverRequest, chatSurvivor, giftSurvivor, survivorMood, setJob, jobChoices, T_DOOR, T_CAR,
  weaponCond, wearWeapon, repairCost, repairWeapon, playerHitDamage, actNow, bossHere, bossMet, BOSS_LAIR, buildingAt, endingEpilogue };`, ctx);
const T = ctx.__T;
const queued = [];
T.Hooks.queue = q => queued.push(q);

/* ---- id checks: every fight/give in content uses real ids ---- */
const contentSrc = ['content.js', 'encounters.js', 'arcs.js'].map(f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8')).join('\n');
for (const m of contentSrc.matchAll(/\b(?:give|take|has|count)\(\s*'([a-z_]+)'/g)) if (!T.ITEMS[m[1]]) fail('item id', m[1]);
for (const m of contentSrc.matchAll(/\b(?:fight|FG)\(\s*\[([^\]]*)\]/g)) for (const id of m[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean)) if (!T.ENEMIES[id]) fail('enemy id', id);

/* ---- a fresh game per callback so state never leaks ---- */
const fresh = () => { T.newGame('Test', 'soldier', { str: 4, end: 4, per: 4, cha: 4, agi: 4, int: 4 }); T.G.atShelter = false; T.G.p.hp = 9999; };
const PLAY_TYPES = ['horde', 'rescue', 'screamer', 'dodge', 'lock', 'race', 'barter'];
fresh();
const encs = T.allEncounters();
if (encs.length < 60) fail('encounters', 'only ' + encs.length + ' encounters loaded');
const ids = new Set();
for (const e of encs) {
  if (ids.has(e.id)) fail(e.id, 'duplicate id'); ids.add(e.id);
  try { fresh(); const t = typeof e.text === 'function' ? e.text() : e.text; if (typeof t !== 'string' || !t) fail(e.id, 'text() did not return a string'); } catch (err) { fail(e.id + '.text', err); }
  if (e.play) {
    if (!PLAY_TYPES.includes(e.play.type)) fail(e.id, 'unknown play type ' + e.play.type);
    for (const id of (e.play.foes || [])) if (!T.ENEMIES[id]) fail(e.id, 'play foe ' + id);
    for (const k of ['onWin', 'onLose']) if (e.play[k]) { try { fresh(); const r = e.play[k](); if (typeof r !== 'string') fail(e.id, `play.${k} must return a string`); } catch (err) { fail(e.id + '.play.' + k, err); } }
  }
  if (!e.play && !(e.choices && e.choices.length)) fail(e.id, 'needs play or choices');
  (e.choices || []).forEach((c, i) => {
    for (const k of ['success', 'fail']) if (c[k]) {
      try {
        fresh(); T.PENDING.fight = null;
        const r = c[k]();
        if (typeof r !== 'string') fail(`${e.id}.choice${i}.${k}`, 'must return a string, got ' + typeof r);
        const pf = T.PENDING.fight;
        if (pf && pf.opts) for (const cb of ['onWin', 'onLose', 'onFlee']) if (pf.opts[cb]) { const s = pf.opts[cb](); if (s != null && typeof s !== 'string') fail(`${e.id}.choice${i}.${cb}`, 'must return a string'); }
      } catch (err) { fail(`${e.id}.choice${i}.${k}`, err); }
    }
    try { if (c.req) c.req(); } catch (err) { fail(`${e.id}.choice${i}.req`, err); }
  });
}

/* ---- world: reachability from the bunker over many seeds, with the story gates closed and then all open ----
   Closed: every POI, container and the bus outside the gated biomes (docks, forest, pass) is reachable, the act-1 targets are there,
   and nothing inside a gated biome is (the seals hold). Open (openGateTiles on every gate): everything is reachable. */
for (let seed = 1; seed <= 25; seed++) {
  try {
    const w = T.genWorld(seed * 7919), Wn = T.W, Hn = T.H;
    const gated = (x, y) => !!T.GATE_OF[T.BIOMES[w.biome[y * Wn + x]]];
    const flood = () => {
      const solid = (x, y) => x < 0 || y < 0 || x >= Wn || y >= Hn || T.SOLID.has(w.tiles[y * Wn + x]);
      const seen = new Uint8Array(Wn * Hn), start = [w.hatch.x, w.hatch.y + 1], q = [start];
      seen[start[1] * Wn + start[0]] = 1;
      while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!solid(nx, ny) && !seen[ny * Wn + nx]) { seen[ny * Wn + nx] = 1; q.push([nx, ny]); } } }
      return (x, y) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < Wn && ny < Hn && seen[ny * Wn + nx]; });
    };
    for (const phase of ['closed', 'open']) {
      if (phase === 'open') for (const id in w.gates) T.openGateTiles(w, id);
      const reach = flood(), tag = 'world seed ' + seed + ' (' + phase + ')';
      for (const k in w.pois) { const p = w.pois[k], g = gated(p.x, p.y); if (phase === 'open' || !g) { if (!reach(p.x, p.y)) fail(tag, 'unreachable poi ' + p.label + ' ' + k); } else if (reach(p.x, p.y)) fail(tag, 'gated poi reachable early ' + p.label + ' ' + k); }
      for (const c of w.containers) if ((phase === 'open' || !gated(c.x, c.y)) && !reach(c.x, c.y)) fail(tag, `unreachable container ${c.kind} ${c.x},${c.y} (${c.loc})`);
      if (!w.bus || !reach(w.bus.x, w.bus.y)) fail(tag, 'bus unreachable');
      if (phase === 'closed') for (const t of ['supermarket', 'apartments', 'electronics', 'radiotower', 'police', 'depot', 'gas', 'hospital', 'tollcamp']) if (!Object.values(w.pois).some(p => p.type === t && !gated(p.x, p.y) && reach(p.x, p.y))) fail(tag, 'no reachable act-1 ' + t);
    }
    for (const b of T.BIOMES) if (!w.biome.includes(T.BIOMES.indexOf(b))) fail('world seed ' + seed, 'missing biome ' + b);
  } catch (err) { fail('world', err); }
}
/* ---- interaction props: notes on walls, bodies and beds on walkable tiles, pumps reachable; placing them never shifts the map ---- */
for (let seed = 1; seed <= 25; seed++) {
  try {
    const w = T.genWorld(seed * 7919), Wn = T.W, tag = 'props seed ' + seed, t = (x, y) => w.tiles[y * Wn + x];
    if (w.notes.length < 10 || w.bodies.length < 15 || w.pumps.length < 5 || w.beds.length < 15) fail(tag, `too few props: ${w.notes.length} notes, ${w.bodies.length} bodies, ${w.pumps.length} pumps, ${w.beds.length} beds`);
    const seen = new Set();
    for (const [kind, list] of [['note', w.notes], ['body', w.bodies], ['bed', w.beds]]) for (const o of list) {
      if (T.SOLID.has(t(o.x, o.y)) || t(o.x, o.y) === T.T_DOOR) fail(tag, `${kind} on a solid tile ${o.x},${o.y}`);
      if (seen.has(o.x + ',' + o.y)) fail(tag, `two props on ${o.x},${o.y}`); seen.add(o.x + ',' + o.y);
    }
    for (const n of w.notes) if (t(n.x + n.fx, n.y + n.fy) !== 3 /* T_WALL */) fail(tag, `note ${n.x},${n.y} not facing a wall`);
    for (const b of w.beds) if (!['bed', 'couch', 'cot'].includes(b.kind)) fail(tag, 'bed kind ' + b.kind);
    const flood = () => {
      const solid = (x, y) => x < 0 || y < 0 || x >= Wn || y >= T.H || T.SOLID.has(w.tiles[y * Wn + x]);
      const sn = new Uint8Array(Wn * T.H), q = [[w.hatch.x, w.hatch.y + 1]]; sn[(w.hatch.y + 1) * Wn + w.hatch.x] = 1;
      while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!solid(nx, ny) && !sn[ny * Wn + nx]) { sn[ny * Wn + nx] = 1; q.push([nx, ny]); } } }
      return sn;
    };
    for (const id in w.gates) T.openGateTiles(w, id);
    const sn = flood();
    for (const p of w.pumps) if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => sn[(p.y + b) * Wn + p.x + a])) fail(tag, `pump ${p.x},${p.y} unreachable`);
    for (const b of w.bodies) if (!sn[b.y * Wn + b.x]) fail(tag, `body ${b.x},${b.y} unreachable`);
  } catch (err) { fail('props', err); }
}
{
  /* recorded before the props existed: the layout, containers, POIs and buildings of these seeds must never change (old saves load onto them) */
  const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
  for (const [seed, want] of [[7919, '9f6bcbf4'], [123456, '5d67c14d'], [987654321, 'f4b93318']]) {
    const w = T.genWorld(seed), under = {}; for (const p of w.pumps) under[p.y * T.W + p.x] = p.under;
    let s = ''; for (let i = 0; i < w.tiles.length; i++) s += String.fromCharCode(65 + (under[i] != null ? under[i] : w.tiles[i]));
    const got = fnv(s + JSON.stringify(w.containers) + JSON.stringify(w.pois) + JSON.stringify(w.roofs));
    if (got !== want) fail('world stability', `seed ${seed} layout changed (${got}): old saves would load onto a different map`);
  }
}
/* gates open on their story beats */
try {
  fresh(); const f = T.G.flags;
  if (T.G.flags.open_forest || T.G.flags.open_docks || T.G.flags.open_pass) fail('gates', 'open at start');
  f.radio_built = true; T.gateCheck(); if (f.open_forest) fail('gates', 'forest opened before the radio_fixed scene');
  T.G.seenScenes.radio_fixed = true; T.gateCheck(); if (!f.open_forest) fail('gates', 'forest did not open after the radio');
  f.marcus_3 = true; T.gateCheck(); if (!f.open_docks) fail('gates', 'docks did not open after marcus_3');
  f.q_bus = true; T.G.hordeDay = T.G.day + 12; T.gateCheck(); if (!f.open_pass) fail('gates', 'pass did not open with the bus quest');
  if (T.SOLID.has(T.WORLD.tiles[T.WORLD.gates.pass.y0 * T.W + T.WORLD.gates.pass.x0])) fail('gates', 'pass gate tiles still solid');
  for (let h = 0; h < 30; h++) T.weatherTick();
  if (T.seasonNow() !== 'winter') fail('season', 'not winter with the bus quest');
  T.G.day = T.G.hordeDay; T.weatherTick(); if (T.G.weather !== 'snow' || !T.G.storm) fail('weather', 'last night is not a snowstorm');
  T.G.weather = 'rain'; if (T.hearMul(T.G.p.x, T.G.p.y) !== 0.6) fail('weather', 'rain hearing');
  T.G.weather = 'fog'; if (T.sightMul(T.G.p.x, T.G.p.y) !== 0.6) fail('weather', 'fog sight');
  T.G.weather = 'snow'; if (T.zSpeedMul(T.G.p.x, T.G.p.y) !== 0.85) fail('weather', 'snow speed');
  const sh = Object.keys(T.WORLD.tiles).find(i => T.WORLD.tiles[i] === T.T_SHALLOW); if (sh == null || T.moveMul(sh % T.W + 0.5, Math.floor(sh / T.W) + 0.5) > 0.7) fail('tiles', 'shallow water does not slow');
  if (T.ITEMS.coat.c !== 'gear') fail('items', 'coat');
} catch (err) { fail('gates', err); }

/* ---- containers, combat rules, objectives ---- */
try {
  fresh(); let got = 0;
  for (const c of T.WORLD.containers.slice(0, 40)) { const r = T.searchContainer(c); got += r.loot.length; if (T.containerState(c) !== 'empty') fail('container', 'not marked empty'); }
  if (!got) fail('containers', 'no loot from 40 containers');
  for (const id in T.ENEMIES) { T.onKill(id); T.enemyHitsPlayer(id); }
  T.weaponProfile();
  fresh(); const o = T.objectiveInfo(); if (!o.text || !o.target) fail('objective', 'first objective needs text and target');
} catch (err) { fail('rules', err); }

/* ---- weapon wear: hits soften with wear, never break, scrap repairs at the bench, a new find is fresh ---- */
try {
  fresh(); T.G.pack.machete = 1; T.G.p.weapon = 'machete'; T.G.p.sta = 100;
  const prof = T.weaponProfile(), avg = n => { let s = 0; for (let i = 0; i < 400; i++) s += T.playerHitDamage(prof); return s / 400; };
  const fresh0 = avg(); for (let i = 0; i < 150; i++) T.wearWeapon('machete', 1);
  if (T.weaponCond('machete') !== 0) fail('wear', 'machete should be at 0, is ' + T.weaponCond('machete'));
  const worn = avg(); if (!(worn < fresh0 * 0.7 && worn > fresh0 * 0.5)) fail('wear', `worn damage ${worn} vs fresh ${fresh0}`);
  if (!T.G.hints.wear) fail('wear', 'no hint below 60');
  if (T.repairWeapon('machete')) fail('wear', 'repaired without a workbench');
  T.G.buildings.bench = 1; T.G.atShelter = true; T.G.store.scrap = 3;
  if (T.repairCost('machete') !== 4 || T.repairWeapon('machete')) fail('wear', 'repair needs 4 scrap');
  T.G.store.scrap = 4; if (!T.repairWeapon('machete') || T.weaponCond('machete') !== 100 || T.G.store.scrap) fail('wear', 'repair failed');
  delete T.G.pack.axe; delete T.G.store.axe; T.wearWeapon('axe', 30); T.give('axe', 1); if (T.weaponCond('axe') !== 100) fail('wear', 'a new find should be fresh');
  T.G.atShelter = false;
} catch (err) { fail('wear', err); }

/* ---- act bosses: each lair is found, a boss only in its act, gone once dead, guaranteed loot, journal + epilogue ---- */
try {
  fresh(); T.G.day = 5; const W_ = T.WORLD, at = {};
  for (let i = 0; i < W_.roofs.length; i++) { const r = W_.roofs[i]; for (let y = r.y + 1; y < r.y + r.h - 1 && !at[i]; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) { const b = T.bossHere(x + 0.5, y + 0.5); if (b) { at[i] = b; break; } } }
  const found = Object.values(at); if (!found.includes('orderly')) fail('boss', 'no hospital lair for the Orderly');
  if (found.some(b => b !== 'orderly')) fail('boss', 'act 1 lair holds ' + found);
  T.G.flags.radio_built = true; if (T.actNow() !== 2) fail('boss', 'act 2');
  const cs = W_.roofs.find(r => W_.pois[r.poi] && W_.pois[r.poi].label === 'Cold Store');
  let csAt = null; if (cs) for (let y = cs.y + 1; y < cs.y + cs.h - 1 && !csAt; y++) for (let x = cs.x + 1; x < cs.x + cs.w - 1; x++) if (T.bossHere(x + 0.5, y + 0.5) === 'butcher') { csAt = [x + 0.5, y + 0.5]; break; }
  if (!csAt) fail('boss', 'no Butcher in the Cold Store in act 2');
  T.G.flags.q_bus = true; const cv = Object.values(W_.pois).find(p => p.label === 'Wrecked Convoy');
  if (T.bossHere(cv.x + 0.5, cv.y + 2.5) !== 'sergeant') fail('boss', 'no Sergeant at the convoy in act 3');
  if (csAt && T.bossHere(...csAt)) fail('boss', 'the Butcher outlived act 2');
  if (!T.bossMet('sergeant') || T.bossMet('sergeant')) fail('boss', 'intro should show once');
  const d = T.onKill('sergeant'); if (!d.some(x => x.id === 'fuel' && x.qty === 2) || !d.some(x => x.id === 'coat')) fail('boss', 'guaranteed loot ' + JSON.stringify(d));
  if (T.G.bosses.sergeant !== 'dead' || T.bossHere(cv.x + 0.5, cv.y + 2.5)) fail('boss', 'dead boss came back');
  if (!T.G.journal.some(j => j.title === 'The Sergeant')) fail('boss', 'no journal line');
  const ep = T.endingEpilogue('end_stand'); if (!JSON.stringify(ep).includes('Sergeant')) fail('boss', 'epilogue does not mention it: ' + JSON.stringify(ep));
} catch (err) { fail('boss', err); }

/* ---- 14 days of time: horde nights (unfought), act gates, endings, save/load ---- */
try {
  fresh(); T.G.p.hp = 100; T.give('canned', 30); T.give('water', 30);
  for (let d = 0; d < 14; d++) { T.G.p.hp = 100; T.G.p.hunger = 80; T.G.p.thirst = 80; T.G.p.inf = 0; T.advance(24 * 60); }
  if (T.G.day < 14) fail('time', 'day did not advance: ' + T.G.day);
  if (!T.G.unlocks.horde) fail('unlocks', 'horde never unlocked');
  T.resolveHorde({ held: true, kills: 5 }); T.resolveHorde({ held: false, kills: 1, breaches: 3 });
  if (!T.saveGame(true) || !T.loadGame()) fail('save', 'save/load failed');
  T.G.flags.warden_met = true; T.finalOptions(); T.chooseFinal('ally');
  if (T.loadGame() && T.G.flags.ended) fail('save', 'an ended world loaded as continuable');
} catch (err) { fail('days', err); }

/* ---- saved worlds: migration from the v2 save, two slots, fork, ended worlds, delete ---- */
try {
  for (const k in store) delete store[k];
  fresh(); T.G.p.name = 'Mig'; delete T.G.worldName; T.G.day = 6; store.deadembers_save_v2 = T.serialize();
  let ws = T.listWorlds();
  if (ws.length !== 1 || ws[0].name !== 'Mig' || ws[0].day !== 6 || store.deadembers_save_v2) fail('slots', 'v2 save did not migrate: ' + JSON.stringify(ws));
  if (!T.loadGame() || T.G.day !== 6 || T.G.slot !== ws[0].id) fail('slots', 'migrated world does not load');
  const migId = ws[0].id, A4 = { str: 4, end: 4, per: 4, cha: 4, agi: 4, int: 4 };
  T.newGame('Ann', 'soldier', A4, 'World A'); T.G.day = 3; T.G.p.x = 10.5; T.saveGame(true); const idA = T.G.slot;
  T.newGame('Bo', 'medic', A4, 'World B'); T.G.day = 9; T.saveGame(true); const idB = T.G.slot;
  ws = T.listWorlds();
  if (ws.length !== 3 || !idA || !idB || idA === idB) fail('slots', 'expected 3 worlds, got ' + ws.length);
  if (!T.loadWorld(idA) || T.G.day !== 3 || T.G.p.x !== 10.5 || T.G.worldName !== 'World A') fail('slots', 'world A did not load back');
  if (!T.loadWorld(idB) || T.G.day !== 9 || T.G.p.name !== 'Bo') fail('slots', 'world B did not load back');
  T.loadWorld(idA); const idF = T.forkWorld('World A2'); T.G.day = 4; T.saveGame(true);
  if (!idF || idF === idA || T.listWorlds().length !== 4) fail('slots', 'fork did not make a new world');
  if (!T.loadWorld(idA) || T.G.day !== 3) fail('slots', 'fork changed the original');
  T.loadWorld(idB); T.G.p.hp = 0; T.markEnded('death');
  const eb = T.listWorlds().find(w => w.id === idB);
  if (!eb || !eb.ended || eb.endId !== 'death' || T.loadWorld(idB)) fail('slots', 'a dead world is still continuable');
  if (!T.hasSave() || T.lastWorldId() === idB) fail('slots', 'continue should skip the memorial');
  T.deleteWorld(idA);
  if (T.listWorlds().some(w => w.id === idA) || store['deadembers_world_' + idA]) fail('slots', 'delete left the world behind');
  for (const id of [migId, idF]) { T.loadWorld(id); T.chooseFinal('alone'); }
  if (T.hasSave()) fail('slots', 'hasSave with only ended worlds');
} catch (err) { fail('slots', err); }

/* ---- companions, talk, interactions (engine side) ---- */
try {
  fresh(); T.G.p.hp = 100;
  const cap0 = T.carryCap(), wave0 = T.hordeWaveSize();
  T.adoptDog('Biscuit'); const c = T.companionInfo();
  if (!c || c.kind !== 'dog' || c.name !== 'Biscuit' || !T.G.flags.dog_adopted) fail('dog', 'adoption');
  if (T.carryCap() !== cap0) fail('dog', 'the dog should not carry');
  if (T.hordeWaveSize() < wave0) fail('companion', 'horde should not shrink');
  if (T.companionHurt(100) !== 'home' || T.companionInfo() || !(T.G.dog.restUntil > T.G.day)) fail('dog', 'badly hurt dog should go home and rest');
  const s = T.recruit({ name: 'Ada', trait: 'medic' }); s.hp = 100;
  if (!T.setCompanion('survivor', s.id) || T.carryCap() !== cap0 + 8) fail('helper', 'carry +8');
  if (T.companionHurt(150) !== 'downed') fail('helper', 'downed at 0 HP');
  T.clearCompanion(); s.hp = 100;
  if (typeof T.survivorMood(s) !== 'string' || typeof T.chatSurvivor(s) !== 'string') fail('talk', 'lines');
  T.give('cigs', 2); const m0 = s.morale; s.morale = 50; if (!T.giftSurvivor(s) || s.morale <= 50) fail('talk', 'gift ' + m0);
  for (let i = 0; i < 60 && !T.requestOf(s); i++) { s.askDay = -1; T.maybeRequest(s); }
  const rq = T.requestOf(s); if (!rq) fail('talk', 'no request'); else { T.give(rq.item, rq.qty); if (!T.deliverRequest(s) || T.requestOf(s)) fail('talk', 'deliver'); }
  if (!T.setJob(s, 'guard') || s.job !== 'guard' || T.setJob(s, 'garden')) fail('talk', 'jobs');
  /* a door: barricade, blocked, broken by about 6 s of hits */
  const W_ = T.W; let door = null; for (let i = 0; i < T.WORLD.tiles.length && !door; i++) if (T.WORLD.tiles[i] === T.T_DOOR) door = [i % W_, Math.floor(i / W_)];
  T.G.pack.wood = 4;
  if (!T.barDoor(door[0], door[1]) || !T.doorBlocked(door[0] + 0.5, door[1] + 0.5)) fail('door', 'barricade');
  let broke = false; for (let i = 0; i < 4; i++) broke = T.hitDoorBar(door[0], door[1], 1.2); if (broke) fail('door', 'broke too fast');
  for (let i = 0; i < 2; i++) broke = T.hitDoorBar(door[0], door[1], 1.2); if (!broke || T.doorBlocked(door[0] + 0.5, door[1] + 0.5)) fail('door', 'did not break');
  T.barDoor(door[0], door[1]); if (!T.unbarDoor(door[0], door[1]) || T.doorBlocked(door[0] + 0.5, door[1] + 0.5)) fail('door', 'unbar');
  /* a wreck: once per car, a hose always works */
  let car = null; for (let i = 0; i < T.WORLD.tiles.length && !car; i++) if (T.WORLD.tiles[i] === T.T_CAR) car = [i % W_, Math.floor(i / W_)];
  T.G.pack.hose = 1; const f0 = T.G.pack.fuel || 0;
  if (!T.siphonCar(car[0], car[1]).ok || (T.G.pack.fuel || 0) <= f0 || T.siphonCar(car[0], car[1]).ok) fail('siphon', 'hose siphon / once per car');
  /* water and cooking */
  T.G.pack.bottle = 1; delete T.G.pack.dirtywater; if (!T.fillBottle() || T.G.pack.bottle || T.G.pack.dirtywater !== 1) fail('water', 'fill');
  T.G.pack.bottle = 1; const cw = T.G.pack.water || 0; if (!T.fillBottle(true) || T.G.pack.water !== cw + 1) fail('water', 'pump gives clean water');
  if (!T.cookOption() || !T.cookAt() || T.G.pack.dirtywater || !T.G.pack.water) fail('cook', 'boil');
  T.G.pack.rawmeat = 1; if (!/Meal/.test(T.cookAt())) fail('cook', 'meat');
  const rb = T.radioBroadcast(); if (!rb.lines.length || rb.lines.some(l => typeof l !== 'string')) fail('radio', 'broadcast');
} catch (err) { fail('companions', err); }

if (errors.length) { console.log('FAIL (' + errors.length + ')\n' + errors.slice(0, 60).join('\n')); process.exit(1); }
console.log(`OK: ${encs.length} encounters, ${T.WORLD.containers.length} containers, ${T.W}x${T.H} map, 25 seeds reachable (gates closed + open), 14 days simulated, saved worlds + companions ok.`);
