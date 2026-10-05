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
  searchContainer, containerState, objectiveInfo, finalOptions, chooseFinal, saveGame, loadGame, onKill, resolveHorde, weaponProfile, enemyHitsPlayer, give };`, ctx);
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

/* ---- world: every door, container and the bus is reachable from the bunker, over many seeds ---- */
for (let seed = 1; seed <= 25; seed++) {
  try {
    const w = T.genWorld(seed * 7919), Wn = T.W, Hn = T.H;
    const solid = (x, y) => x < 0 || y < 0 || x >= Wn || y >= Hn || T.SOLID.has(w.tiles[y * Wn + x]);
    const seen = new Uint8Array(Wn * Hn), start = [w.hatch.x, w.hatch.y + 1], q = [start];
    seen[start[1] * Wn + start[0]] = 1;
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!solid(nx, ny) && !seen[ny * Wn + nx]) { seen[ny * Wn + nx] = 1; q.push([nx, ny]); } } }
    const reach = (x, y) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < Wn && ny < Hn && seen[ny * Wn + nx]; });
    for (const k in w.pois) if (!reach(w.pois[k].x, w.pois[k].y)) fail('world seed ' + seed, 'unreachable poi ' + w.pois[k].label + ' ' + k);
    for (const c of w.containers) if (!reach(c.x, c.y)) fail('world seed ' + seed, `unreachable container ${c.kind} ${c.x},${c.y} (${c.loc})`);
    if (!w.bus || !reach(w.bus.x, w.bus.y)) fail('world seed ' + seed, 'bus unreachable');
  } catch (err) { fail('world', err); }
}

/* ---- containers, combat rules, objectives ---- */
try {
  fresh(); let got = 0;
  for (const c of T.WORLD.containers.slice(0, 40)) { const r = T.searchContainer(c); got += r.loot.length; if (T.containerState(c) !== 'empty') fail('container', 'not marked empty'); }
  if (!got) fail('containers', 'no loot from 40 containers');
  for (const id in T.ENEMIES) { T.onKill(id); T.enemyHitsPlayer(id); }
  T.weaponProfile();
  fresh(); const o = T.objectiveInfo(); if (!o.text || !o.target) fail('objective', 'first objective needs text and target');
} catch (err) { fail('rules', err); }

/* ---- 14 days of time: horde nights (unfought), act gates, endings, save/load ---- */
try {
  fresh(); T.G.p.hp = 100; T.give('canned', 30); T.give('water', 30);
  for (let d = 0; d < 14; d++) { T.G.p.hp = 100; T.G.p.hunger = 80; T.G.p.thirst = 80; T.G.p.inf = 0; T.advance(24 * 60); }
  if (T.G.day < 14) fail('time', 'day did not advance: ' + T.G.day);
  if (!T.G.unlocks.horde) fail('unlocks', 'horde never unlocked');
  T.resolveHorde({ held: true, kills: 5 }); T.resolveHorde({ held: false, kills: 1, breaches: 3 });
  T.G.flags.warden_met = true; T.finalOptions(); T.chooseFinal('ally');
  if (!T.saveGame(true) || !T.loadGame()) fail('save', 'save/load failed');
} catch (err) { fail('days', err); }

if (errors.length) { console.log('FAIL (' + errors.length + ')\n' + errors.slice(0, 60).join('\n')); process.exit(1); }
console.log(`OK: ${encs.length} encounters, ${T.WORLD.containers.length} containers, 25 seeds reachable, 14 days simulated.`);
