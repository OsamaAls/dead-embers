/* ===================== ENGINE ===================== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function chance(p) { return Math.random() < p; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function wpick(list, wf) { const tot = list.reduce((s, x) => s + wf(x), 0); let r = Math.random() * tot; for (const x of list) { r -= wf(x); if (r <= 0) return x; } return list[list.length - 1]; }
function itemName(id) { return (ITEMS[id] && ITEMS[id].n) || id; }
const CONTENT_ = () => window.CONTENT || { story: {}, lore: [], radio: [], names: { first: ['Sam'], last: ['Doe'] }, barks: {}, shelterEvents: [] };

let G = null;
const Hooks = { log: () => {}, refresh: () => {}, queue: () => {}, onDeath: () => {} };

/* ---------- World generation (deterministic from seed) ---------- */
const W = 64, H = 48;
const T_GRASS = 0, T_ROAD = 1, T_WALL = 3, T_DOOR = 4, T_TREE = 5, T_WATER = 6, T_BRIDGE = 7, T_RUBBLE = 8, T_CAR = 9, T_YARD = 10, T_FIELD = 11, T_ROOF = 12;
const SOLID = new Set([T_WALL, T_TREE, T_WATER, T_CAR, T_ROOF]);
const ROADS_Y = [4, 14, 24, 34, 44], ROADS_X = [4, 16, 28, 40, 52];
const BLOCKS_X = [[6, 15], [18, 27], [30, 39], [42, 48], [54, 63]], BLOCKS_Y = [[6, 13], [16, 23], [26, 33], [36, 43]];
const BLOCK_PLAN = {
  '0,0': 'radiotower', '1,0': 'hospital', '2,0': 'street', '3,0': 'police', '4,0': 'military',
  '0,1': 'apartments', '1,1': 'supermarket', '2,1': 'shelter', '3,1': 'apartments', '4,1': 'forest',
  '0,2': 'factory', '1,2': 'gas', '2,2': 'farm', '3,2': 'electronics', '4,2': 'forest',
  '0,3': 'depot', '1,3': 'street', '2,3': 'supermarket', '3,3': 'gas', '4,3': 'tollcamp',
};
const RIVER_X = [44, 45, 46];
let WORLD = null; // {tiles: Uint8Array, pois: {key:{type,x,y,label}}, shelterRect, roofs:[]}

function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function genWorld(seed) {
  const R = seeded(seed), ri = (a, b) => Math.floor(R() * (b - a + 1)) + a;
  const tiles = new Uint8Array(W * H).fill(T_GRASS);
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = t; };
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T_WALL : tiles[y * W + x];
  for (const y of ROADS_Y) for (let x = 0; x < W; x++) { set(x, y, T_ROAD); set(x, y + 1, T_ROAD); }
  for (const x of ROADS_X) for (let y = 0; y < H; y++) { set(x, y, T_ROAD); set(x + 1, y, T_ROAD); }
  // river runs N-S between block columns 3 and 4, replacing road x=52? no: river at 47..49 inside col3 east margin
  const pois = {}, roofs = [];
  const addPoi = (x, y, type, label) => { pois[x + ',' + y] = { x, y, type, label: label || LOCS[type].n }; set(x, y, T_DOOR); };
  let shelterRect = null;
  for (let by = 0; by < 4; by++) for (let bx = 0; bx < 5; bx++) {
    const [x0, x1] = BLOCKS_X[bx], [y0, y1] = BLOCKS_Y[by];
    const type = BLOCK_PLAN[bx + ',' + by];
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const scatter = (n, t) => { for (let i = 0; i < n; i++) { const x = ri(x0, x1), y = ri(y0, y1); if (get(x, y) === T_GRASS) set(x, y, t); } };
    if (type === 'shelter') {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, T_YARD);
      shelterRect = { x0, y0, x1, y1 };
      addPoi(x0 + 4, y0 + 3, 'shelter');
    } else if (type === 'forest') {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (R() < 0.42) set(x, y, T_TREE);
      const px = ri(x0 + 2, x1 - 2), py = ri(y0 + 2, y1 - 2);
      for (let y = py - 1; y <= py + 1; y++) for (let x = px - 1; x <= px + 1; x++) set(x, y, T_GRASS);
      for (let x = px; x <= x1 + 1; x++) if (get(x, py) === T_TREE) set(x, py, T_GRASS);
      addPoi(px, py, 'forest', 'Hunting Stand');
    } else if (type === 'farm') {
      for (let y = y0 + 1; y <= y1 - 1; y++) for (let x = x0 + 1; x <= x0 + 5; x++) set(x, y, T_FIELD);
      const rx0 = x1 - 3, ry0 = y0 + 1; for (let y = ry0; y <= ry0 + 3; y++) for (let x = rx0; x <= rx0 + 2; x++) set(x, y, T_ROOF);
      roofs.push({ x: rx0, y: ry0, w: 3, h: 4, type });
      addPoi(rx0 + 1, ry0 + 4, 'farm', 'Barn');
      scatter(4, T_TREE);
    } else if (type === 'tollcamp') {
      for (let x = x0 + 1; x <= x1 - 1; x++) { set(x, y0 + 1, T_WALL); set(x, y1 - 1, T_WALL); }
      for (let y = y0 + 1; y <= y1 - 1; y++) { set(x0 + 1, y, T_WALL); set(x1 - 1, y, T_WALL); }
      for (let y = y0 + 2; y <= y1 - 2; y++) for (let x = x0 + 2; x <= x1 - 2; x++) set(x, y, T_ROOF);
      roofs.push({ x: x0 + 2, y: y0 + 2, w: bw - 4, h: bh - 4, type });
      addPoi(x0 + Math.floor(bw / 2), y1 - 1, 'tollcamp');
    } else if (type === 'street') {
      scatter(10, T_RUBBLE); scatter(5, T_CAR); scatter(4, T_TREE);
      const sx0 = x0 + 1, sy0 = y0 + 1; for (let y = sy0; y <= sy0 + 2; y++) for (let x = sx0; x <= sx0 + 3; x++) set(x, y, T_ROOF);
      roofs.push({ x: sx0, y: sy0, w: 4, h: 3, type: 'ruin' });
      addPoi(x0 + ri(2, bw - 3), y1, 'street', 'Rubble Pile'); addPoi(x1, y0 + ri(4, bh - 2), 'street', 'Wrecked Shop');
    } else {
      const mx = type === 'radiotower' ? 3 : 1, my = 1;
      const rx0 = x0 + mx, rx1 = x1 - mx, ry0 = y0 + my, ry1 = y1 - 2;
      for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) set(x, y, T_ROOF);
      roofs.push({ x: rx0, y: ry0, w: rx1 - rx0 + 1, h: ry1 - ry0 + 1, type });
      addPoi(Math.floor((rx0 + rx1) / 2), ry1 + 1, type);
      // second entrance for big buildings
      if (bw >= 10 && (type === 'apartments' || type === 'supermarket' || type === 'factory')) { /* single door is enough */ }
      scatter(3, T_RUBBLE); scatter(2, T_CAR);
    }
  }
  // river: vertical band east of column 3 blocks (x 47..49) -> actually between ROADS_X[4]=52 and block col4 start. Use x=52..53 road? keep road; place river at x 56..57 in col 4? We put forest/military/tollcamp east, river at x=50..51 (inside col3 east edge)
  for (let y = 0; y < H; y++) for (const x of [50, 51]) { const t = get(x, y); if (t === T_ROAD) set(x, y, T_BRIDGE); else if (t !== T_DOOR) set(x, y, T_WATER); }
  // river dock POI
  addPoi(49, 30, 'river', 'River Dock');
  addPoi(49, 10, 'river', 'Fishing Pier');
  // cars on roads
  for (let i = 0; i < 26; i++) { const x = ri(0, W - 1), y = ri(0, H - 1); if (get(x, y) === T_ROAD && !(x >= 26 && x <= 42 && y >= 12 && y <= 26)) set(x, y, T_CAR); }
  // ensure every door has a walkable approach
  for (const k in pois) { const p = pois[k]; for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const t = get(p.x + dx, p.y + dy); if (t === T_CAR) set(p.x + dx, p.y + dy, T_ROAD); } }
  return { tiles, pois, roofs, shelterRect };
}
function tileAt(x, y) { if (x < 0 || y < 0 || x >= W || y >= H) return T_WALL; return WORLD.tiles[y * W + x]; }
function solidAt(x, y) { return SOLID.has(tileAt(Math.floor(x), Math.floor(y))); }
function inShelter(x, y) { const r = WORLD.shelterRect; return x >= r.x0 && x <= r.x1 + 1 && y >= r.y0 && y <= r.y1 + 1; }
function districtAt(x, y) {
  let bx = BLOCKS_X.findIndex(([a, b]) => x >= a - 2 && x <= b + 1), by = BLOCKS_Y.findIndex(([a, b]) => y >= a - 2 && y <= b + 1);
  if (bx < 0) bx = clamp(Math.round(x / 12), 0, 4); if (by < 0) by = clamp(Math.round(y / 11), 0, 3);
  return BLOCK_PLAN[bx + ',' + by] || 'street';
}

/* ---------- New game ---------- */
function newGame(name, bgId, attrs) {
  const bg = BACKGROUNDS[bgId];
  const a = Object.assign({}, attrs);
  for (const k in bg.bonus) a[k] = (a[k] || 0) + bg.bonus[k];
  const seed = Math.floor(Math.random() * 1e9);
  G = {
    v: 1, seed, day: 1, hour: 7, minute: 0,
    p: { name, bg: bgId, attr: a, hp: 100, maxHp: 100, sta: 0, maxSta: 0, hunger: 80, thirst: 70, morale: 60, inf: 0, xp: 0, level: 1, points: 0, weapon: null, x: 0, y: 0, status: {} },
    pack: {}, store: { canned: 2, water: 2, wood: 3 },
    survivors: [], buildings: {}, flags: {}, seenEnc: {}, seenScenes: {}, journal: [], loreRead: [], log: [],
    locs: {}, fog: '', noise: 0, stepsToEnc: rnd(40, 70), nextId: 1, hordeDay: 0, stats: { kills: 0, searches: 0, encounters: 0, recruited: 0 },
  };
  WORLD = genWorld(seed);
  const sp = Object.values(WORLD.pois).find(p => p.type === 'shelter');
  G.p.x = sp.x + 0.5; G.p.y = sp.y + 1.5;
  for (const k in bg.items) G.pack[k] = (G.pack[k] || 0) + bg.items[k];
  const w = Object.keys(G.pack).find(k => ITEMS[k].c === 'weapon'); G.p.weapon = w || null;
  for (const k in WORLD.pois) { const p = WORLD.pois[k]; const L = LOCS[p.type]; if (L.searches) G.locs[k] = { left: L.searches, max: L.searches, visited: false }; }
  initFog();
  recalc(); G.p.sta = G.p.maxSta;
  return G;
}
function initFog() { G._fog = new Uint8Array(W * H); if (G.fog) for (let i = 0; i < G.fog.length && i < W * H; i++) G._fog[i] = G.fog.charCodeAt(i) - 48; }
function revealAround(cx, cy, r) {
  const f = G._fog, r2 = r * r;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) f[y * W + x] = 1;
  }
}

/* ---------- Derived stats ---------- */
function A(k) { return G.p.attr[k] || 1; }
function carryCap() { return 18 + A('str') * 3 + (G.pack.backpack ? 15 : 0); }
function packWeight() { let w = 0; for (const k in G.pack) w += (ITEMS[k] ? ITEMS[k].w : 0) * G.pack[k]; return Math.round(w * 10) / 10; }
function recalc() {
  const p = G.p;
  p.maxSta = 60 + A('end') * 8 - (p.status.injured ? 20 : 0);
  if (p.hunger < 15 || p.thirst < 15) p.maxSta = Math.floor(p.maxSta * 0.6);
  p.sta = clamp(p.sta, 0, p.maxSta);
  p.maxHp = 95 + p.level * 5;
  p.hp = clamp(p.hp, 0, p.maxHp);
}
function xpNeed() { return 40 + G.p.level * 30; }
function weaponOf() { const w = G.p.weapon; return (w && G.pack[w]) ? w : null; }

/* ---------- Content API ---------- */
function log(msg, cls) { G.log.push({ t: `D${G.day} ${String(G.hour).padStart(2, '0')}:00`, msg, cls: cls || '' }); if (G.log.length > 120) G.log.shift(); Hooks.log(msg, cls); }
function give(id, qty) {
  qty = qty == null ? 1 : qty; if (!ITEMS[id] || qty <= 0) return '';
  if (G.atShelter) { G.store[id] = (G.store[id] || 0) + qty; return `+${qty} ${itemName(id)}`; }
  const free = carryCap() - packWeight(), w = ITEMS[id].w || 0;
  let fit = w > 0 ? Math.min(qty, Math.floor(free / w + 1e-9)) : qty;
  if (ITEMS[id].c === 'story') fit = qty;
  if (fit > 0) G.pack[id] = (G.pack[id] || 0) + fit;
  if (ITEMS[id].c === 'weapon' && fit > 0) autoEquip(id);
  if (fit < qty) return fit > 0 ? `+${fit} ${itemName(id)} (pack full, left ${qty - fit})` : `${itemName(id)} left behind (pack full)`;
  return `+${qty} ${itemName(id)}`;
}
function autoEquip(id) { const cur = weaponOf(); if (!cur || avgDmg(id) > avgDmg(cur)) { if (!ITEMS[id].ammo || G.pack[ITEMS[id].ammo]) G.p.weapon = id; else if (!cur) G.p.weapon = id; } }
function avgDmg(id) { const d = ITEMS[id] && ITEMS[id].dmg; return d ? (d[0] + d[1]) / 2 : 2; }
function has(id, qty) { qty = qty == null ? 1 : qty; return ((G.pack[id] || 0) + (G.atShelter ? (G.store[id] || 0) : 0)) >= qty; }
function take(id, qty, storeFirst) {
  qty = qty == null ? 1 : qty; if (!has(id, qty)) return false;
  const order = storeFirst ? ['store', 'pack'] : ['pack', 'store'];
  for (const where of order) { if (where === 'store' && !G.atShelter) continue; const bag = G[where]; const n = Math.min(bag[id] || 0, qty); if (n > 0) { bag[id] -= n; qty -= n; if (!bag[id]) delete bag[id]; } }
  if (G.p.weapon && !G.pack[G.p.weapon]) G.p.weapon = Object.keys(G.pack).find(k => ITEMS[k].c === 'weapon') || null;
  return true;
}
function count(id) { return (G.pack[id] || 0) + (G.atShelter ? (G.store[id] || 0) : 0); }
function hurt(n, cause) {
  n = Math.max(0, Math.round(n)); G.p.hp -= n; if (n > 0) Hooks.flash && Hooks.flash('hurt');
  if (G.p.hp <= 0) { G.p.hp = 0; G.deathCause = cause || 'your wounds'; Hooks.onDeath(); }
  return `-${n} HP`;
}
function heal(n) { G.p.hp = clamp(G.p.hp + Math.round(n), 0, G.p.maxHp); return `+${Math.round(n)} HP`; }
function tire(n) { G.p.sta = clamp(G.p.sta - n, 0, G.p.maxSta); return `-${n} stamina`; }
function rest(n) { G.p.sta = clamp(G.p.sta + n, 0, G.p.maxSta); return `+${n} stamina`; }
function feed(n) { G.p.hunger = clamp(G.p.hunger + n, 0, 100); recalc(); return `+${n} food`; }
function drink(n) { G.p.thirst = clamp(G.p.thirst + n, 0, 100); recalc(); return `+${n} water`; }
function addMorale(n) { G.p.morale = clamp(G.p.morale + n, 0, 100); for (const s of G.survivors) s.morale = clamp(s.morale + Math.round(n / 2), 0, 100); return n >= 0 ? `+${n} morale` : `${n} morale`; }
function xp(n) {
  G.p.xp += n;
  while (G.p.xp >= xpNeed()) { G.p.xp -= xpNeed(); G.p.level++; G.p.points++; recalc(); G.p.hp = Math.min(G.p.maxHp, G.p.hp + 10); log(`Level up! You are now level ${G.p.level}. Spend your attribute point.`, 'good'); Hooks.levelUp && Hooks.levelUp(); }
  return `+${n} XP`;
}
function addNoise(n) { G.noise = clamp(G.noise + n, 0, 10); return ''; }
function bite() {
  const vest = G.pack.vest ? 0.6 : 1;
  if (G.p.inf > 0) { G.p.inf = Math.min(100, G.p.inf + 12); log('The bite burns. The fever spreads faster.', 'bad'); return 'The infection spreads.'; }
  if (chance(0.4 * vest)) { G.p.inf = 8; log('You were bitten. The wound is already turning grey. Find antibiotics.', 'bad'); return 'You have been infected.'; }
  log('Teeth scraped skin, but the wound looks clean. Lucky.', 'warn'); return 'The bite did not take.';
}
function setStatus(name, v) { if (v <= 0) delete G.p.status[name]; else G.p.status[name] = Math.max(G.p.status[name] || 0, v); recalc(); return ''; }
function flag(k) { return G.flags[k]; }
function setFlag(k, v) { G.flags[k] = v === undefined ? true : v; return ''; }
function journal(title, text) { G.journal.unshift({ day: G.day, title, text }); log(`Journal: ${title}`, 'story'); return ''; }
let PENDING = { fight: null, trader: false };
function fight(ids, opts) { PENDING.fight = { ids: ids.slice(), opts: opts || {} }; }
function openTrader() { PENDING.trader = true; }
function makeSurvivor(opts) {
  opts = opts || {}; const C = CONTENT_();
  const skills = { farm: rnd(1, 3), scav: rnd(1, 3), build: rnd(1, 3), med: rnd(1, 2), combat: rnd(1, 3) };
  skills[pick(Object.keys(skills))] = rnd(3, 5);
  const s = { id: G.nextId++, name: opts.name || (pick(C.names.first) + ' ' + pick(C.names.last)), trait: (opts.trait && TRAITS[opts.trait]) ? opts.trait : pick(Object.keys(TRAITS)), skills: Object.assign(skills, opts.skills || {}), hp: 100, morale: 60, job: 'idle', joined: G.day };
  if (s.trait === 'medic') s.skills.med = Math.min(5, s.skills.med + 2);
  return s;
}
function recruit(opts) {
  const s = makeSurvivor(opts);
  G.survivors.push(s); G.stats.recruited++;
  log(`${s.name} (${TRAITS[s.trait].n}) joined your shelter.`, 'good');
  if (G.survivors.length > shelterCap()) log('The bunker is overcrowded. Build more bunks.', 'warn');
  return s;
}
function randomSurvivor() { return G.survivors.length ? pick(G.survivors) : null; }
function killSurvivor(s, cause) { if (!s) return ''; const i = G.survivors.indexOf(s); if (i < 0) { const j = G.survivors.findIndex(x => x.id === s.id); if (j < 0) return ''; G.survivors.splice(j, 1); } else G.survivors.splice(i, 1); log(`${s.name} is dead (${cause || 'unknown'}).`, 'bad'); addMorale(-8); return ''; }
function damageBuilding() {
  const built = Object.keys(G.buildings).filter(k => G.buildings[k] > 0 && k !== 'radio');
  if (!built.length) return null;
  const k = built.includes('walls') && chance(0.5) ? 'walls' : pick(built);
  G.buildings[k]--; const name = BUILDINGS[k].n;
  for (const s of G.survivors) if (s.job === k && workerCount(k) > G.buildings[k]) s.job = 'idle';
  log(`${name} was damaged and lost a level.`, 'bad'); return name;
}
function passTime(h) { advance(Math.round(h * 60)); return ''; }

/* ---------- Time ---------- */
function advance(minutes, opts) {
  opts = opts || {};
  G.minute += minutes;
  while (G.minute >= 60) { G.minute -= 60; tickHour(opts); if (G.p.hp <= 0) return; }
}
function isNight() { return G.hour >= 20 || G.hour < 6; }
function tickHour(opts) {
  const p = G.p, e = A('end');
  G.hour = (G.hour + 1) % 24;
  G.isNight = isNight();
  const sleepMul = opts.sleep ? 0.5 : 1, sick = p.status.sick ? 1.5 : 1;
  p.hunger = clamp(p.hunger - 2.1 * (1 - e * 0.03) * sleepMul * sick, 0, 100);
  p.thirst = clamp(p.thirst - 2.9 * (1 - e * 0.03) * sleepMul * sick, 0, 100);
  if (p.hunger <= 0) hurt(2, 'starvation');
  if (p.thirst <= 0) hurt(3, 'dehydration');
  if (p.status.bleeding) hurt(1, 'blood loss');
  if (p.status.sick) hurt(0.5 > Math.random() ? 1 : 0, 'sickness');
  if (p.inf > 0) {
    const slow = (G.atShelter && G.buildings.infirmary && G.survivors.some(s => s.job === 'infirmary')) ? 0.5 : 1;
    p.inf = Math.min(100, p.inf + 1.1 * slow);
    if (p.inf >= 50) hurt(1, 'the Grey Fever');
    if (p.inf >= 100) { G.deathCause = 'the Grey Fever. You turned'; p.hp = 0; Hooks.onDeath(); return; }
  }
  for (const k in p.status) { p.status[k]--; if (p.status[k] <= 0) delete p.status[k]; }
  G.noise = Math.max(0, G.noise - 0.5);
  recalc();
  if (G.hour === 20) storyCheck();
  if (G.hour === 6) dailyTick();
}

/* ---------- Shelter ---------- */
function bl(k) { return G.buildings[k] || 0; }
function shelterCap() { return 2 + bl('bed') * 2; }
function workerCount(k) { return G.survivors.filter(s => s.job === k).length; }
function costMul() { return clamp(1 - (A('int') - 3) * 0.04, 0.7, 1.1); }
function buildCost(k) {
  const b = BUILDINGS[k], lv = bl(k); if (lv >= b.max) return null;
  const c = Object.assign({}, b.cost[lv]);
  for (const r in c) if (ITEMS[r].c !== 'story') c[r] = Math.max(1, Math.round(c[r] * costMul()));
  return c;
}
function canBuild(k) {
  const b = BUILDINGS[k], c = buildCost(k); if (!c) return { ok: false, why: 'Max level' };
  if (b.req) for (const r in b.req) if (bl(r) < b.req[r]) return { ok: false, why: `Needs ${BUILDINGS[r].n} ${b.req[r]}` };
  for (const r in c) if (!has(r, c[r])) return { ok: false, why: 'Missing materials' };
  return { ok: true };
}
function build(k) {
  const chk = canBuild(k); if (!chk.ok) return false;
  const c = buildCost(k); for (const r in c) take(r, c[r], true);
  G.buildings[k] = bl(k) + 1; advance(120); tire(10); xp(15);
  log(`Built ${bName(k)}.`, 'good');
  if (k === 'radio') { setFlag('radio_built'); queueScene('radio_fixed'); }
  return true;
}
function bName(k) { const b = BUILDINGS[k]; return b.lvNames ? b.lvNames[Math.max(0, bl(k) - 1)] : b.n; }
function eff(s, skill) {
  let m = 1 + ((s.skills[skill] || 1) - 1) * 0.25;
  if (s.trait === 'hardworker' || s.trait === 'grumpy') m *= 1.3; if (s.trait === 'lazy') m *= 0.7;
  if (s.morale < 30) m *= 0.6; if (s.hp < 40) m *= 0.5;
  return m;
}
function defense() {
  let d = bl('walls') * 12 + bl('tower') * 6;
  for (const s of G.survivors) {
    if (s.job === 'guard' || s.job === 'tower') { let g = 4 + s.skills.combat * 3 + (s.trait === 'brave' || s.trait === 'steady' ? 2 : 0) - (s.trait === 'scared' ? 3 : 0); if (s.job === 'tower') g *= 2; d += g * (s.hp < 40 ? 0.5 : 1); }
  }
  if (G.atShelter) d += 6 + Math.round(weaponOf() ? avgDmg(weaponOf()) / 2 : 0);
  return Math.round(d);
}
function hordeStrength() { return 10 + G.day * 3; }

function dailyTick() {
  G.day++;
  const R = []; // summary lines
  const P = (msg, cls) => R.push({ msg, cls: cls || '' });
  const saveAt = G.atShelter; G.atShelter = true; // production goes to storage
  // passive
  if (bl('rain')) { give('dirtywater', 3 * bl('rain')); P(`Rain collector: +${3 * bl('rain')} Dirty Water`); }
  // jobs
  const jobsOut = {};
  const add = (id, n) => { if (n > 0) { give(id, n); jobsOut[id] = (jobsOut[id] || 0) + n; } };
  for (const s of G.survivors) {
    const j = s.job;
    if (j === 'garden') add('veg', Math.round(3 * eff(s, 'farm') * (1 + bl('garden') * 0.2)));
    else if (j === 'woodshop') add('wood', Math.round(4 * eff(s, 'build')));
    else if (j === 'forge') { add('scrap', Math.round(3 * eff(s, 'build'))); if (chance(0.4)) add('parts', 1); }
    else if (j === 'purifier') { const n = Math.min(G.store.dirtywater || 0, Math.round(4 * eff(s, 'build'))); if (n) { G.store.dirtywater -= n; if (!G.store.dirtywater) delete G.store.dirtywater; add('water', n); } }
    else if (j === 'kitchen') {
      let n = Math.round(3 * eff(s, 'farm'));
      while (n > 0 && (G.store.rawmeat || 0) > 0) { G.store.rawmeat--; if (!G.store.rawmeat) delete G.store.rawmeat; add('meal', 1); n--; }
      while (n > 0 && (G.store.veg || 0) >= 2) { G.store.veg -= 2; if (!G.store.veg) delete G.store.veg; add('meal', 1); n--; }
    } else if (j === 'scavenge') {
      const risk = 0.06 + G.day * 0.003 - (s.trait === 'brave' ? 0.02 : 0);
      if (chance(risk)) { s.hp -= rnd(20, 45); P(`${s.name} came back hurt from a scavenging run.`, 'bad'); }
      const n = Math.round((2 + s.skills.scav) * (s.trait === 'scavenger' ? 1.4 : 1) * eff(s, 'scav') / (1 + (s.skills.scav - 1) * 0.25));
      for (let i = 0; i < n; i++) add(pick(['wood', 'wood', 'scrap', 'scrap', 'cloth', 'canned', 'dirtywater', 'parts', 'cigs', 'chem', 'bandage']), 1);
    } else if (j === 'infirmary') {
      for (const o of G.survivors) o.hp = Math.min(100, o.hp + Math.round(12 * eff(s, 'med')));
    }
  }
  const outStr = Object.keys(jobsOut).map(k => `+${jobsOut[k]} ${itemName(k)}`).join(', ');
  if (outStr) P(`Work done: ${outStr}`, 'good');
  // consumption
  let hungry = 0, thirsty = 0;
  for (const s of [...G.survivors]) {
    const need = s.trait === 'glutton' ? 2 : 1;
    let fed = 0;
    for (let i = 0; i < need; i++) {
      if (take('meal', 1, true)) fed++; else if (take('canned', 1, true)) fed++; else if (take('veg', 2, true)) fed++; else if (take('snack', 2, true)) fed++; else if (take('rawmeat', 1, true)) { fed++; if (chance(0.25)) s.hp -= 10; } else if (take('veg', 1, true)) fed += 0.5;
    }
    let wat = take('water', 1, true) ? 1 : (take('dirtywater', 1, true) ? (chance(0.15) ? (s.hp -= 12, 1) : 1) : 0);
    if (fed < need) { hungry++; s.hp -= 15; s.morale -= 15; } else { s.hp = Math.min(100, s.hp + 8); s.morale += 3; }
    if (!wat) { thirsty++; s.hp -= 20; s.morale -= 15; }
    if (G.survivors.length > shelterCap()) s.morale -= 5;
    if (s.trait === 'sickly' && chance(0.1)) s.hp -= 10;
    if (s.trait === 'grateful') s.morale += 4;
  }
  const cheer = G.survivors.filter(s => s.trait === 'cheerful').length - G.survivors.filter(s => s.trait === 'grumpy').length * 0.5;
  for (const s of G.survivors) s.morale = clamp(s.morale + Math.round(cheer * 3 + (A('cha') - 4)), 0, 100);
  if (hungry) P(`${hungry} survivor(s) went hungry.`, 'bad');
  if (thirsty) P(`${thirsty} survivor(s) had no water.`, 'bad');
  for (const s of [...G.survivors]) {
    if (s.hp <= 0) { killSurvivor(s, 'starvation and wounds'); P(`${s.name} died in the night.`, 'bad'); }
    else if (s.morale < 15 && s.trait !== 'loyal' && chance(0.4)) { G.survivors.splice(G.survivors.indexOf(s), 1); P(`${s.name} lost hope and left during the night.`, 'bad'); log(`${s.name} left the shelter.`, 'bad'); }
  }
  // horde night
  if (G.day % 5 === 0 || (G.hordeDay && G.day > G.hordeDay - 3 && G.day < G.hordeDay && chance(0.5))) {
    const S = hordeStrength() + rnd(0, 10), D = defense();
    if (D >= S) { P(`HORDE NIGHT: ${Math.round(S / 3)} dead hit the shelter. Defense ${D} vs ${S}. The line held.`, 'good'); xp(20); addMorale(5); G.stats.kills += Math.round(S / 4); }
    else {
      P(`HORDE NIGHT: Defense ${D} vs ${S}. They broke through.`, 'bad');
      const b1 = damageBuilding(); if (b1) P(`${b1} was wrecked.`, 'bad');
      if (S - D > 12) { const b2 = damageBuilding(); if (b2) P(`${b2} was wrecked.`, 'bad'); }
      for (const s of G.survivors) if (chance(0.3)) s.hp -= rnd(15, 35);
      if (S - D > 15 && G.survivors.length) { const v = pick(G.survivors); killSurvivor(v, 'the horde'); P(`${v.name} was dragged into the dark.`, 'bad'); }
      for (const f of ['canned', 'veg', 'meal']) if (G.store[f]) G.store[f] = Math.floor(G.store[f] * 0.7);
      if (saveAt) { hurt(rnd(8, 20), 'the horde'); if (chance(0.3)) bite(); }
      addMorale(-10);
    }
  } else if (bl('tower') && (G.day + 1) % 5 === 0) P('Watchtower: a horde is gathering. It will hit tonight.', 'warn');
  // world regen
  if (G.day % 2 === 0) for (const k in G.locs) G.locs[k].left = Math.min(G.locs[k].max, G.locs[k].left + 1);
  // player morale
  const pm = (G.survivors.length ? 2 : -4) + (G.p.hunger < 20 ? -5 : 0) + (G.p.thirst < 20 ? -5 : 0);
  G.p.morale = clamp(G.p.morale + pm, 0, 100);
  G.atShelter = saveAt;
  // radio
  let radio = null; const C = CONTENT_();
  if (G.flags.radio_built && C.radio.length) radio = C.radio[(G.day - 1) % C.radio.length];
  Hooks.queue({ type: 'summary', lines: R, radio, day: G.day });
  if (saveAt && G.day > 1 && C.shelterEvents.length && chance(0.45)) { const ev = pickEncounter('shelter'); if (ev) Hooks.queue({ type: 'enc', enc: ev }); }
  storyCheck();
  if (G.p.morale <= 0) { G.endScene = 'abandoned'; Hooks.queue({ type: 'end', id: 'abandoned' }); }
  saveGame(true);
}

/* ---------- Actions ---------- */
function eat(id) {
  const it = ITEMS[id]; if (!it || !take(id, 1)) return;
  const e = it.eat || {}, u = it.use || {}; const out = [];
  if (e.hunger) out.push(feed(e.hunger)); if (e.thirst) out.push(drink(e.thirst));
  if (e.sta) out.push(rest(e.sta)); if (e.morale) out.push(addMorale(e.morale));
  if (e.sick && chance(e.sick * (G.flags.iron_gut ? 0.5 : 1))) { setStatus('sick', 18); out.push('you feel sick'); }
  const medMul = 1 + (A('int') - 3) * 0.06;
  if (u.hp) out.push(heal(u.hp * medMul)); if (u.sta) out.push(rest(u.sta));
  if (u.cure) for (const c of u.cure) delete G.p.status[c];
  if (u.infect) { if (G.p.inf > 0) { G.p.inf = Math.max(0, G.p.inf + u.infect); out.push(G.p.inf === 0 ? 'infection cured' : 'infection slowed'); } }
  recalc();
  log(`Used ${it.n}: ${out.filter(Boolean).join(', ')}`);
}
function searchLoc(key) {
  const poi = WORLD.pois[key], L = LOCS[poi.type], st = G.locs[key];
  if (G.p.sta < 10) return { text: 'You are too exhausted to search. Rest or eat something.' };
  advance(90); tire(10); G.stats.searches++; st.visited = true;
  if (G.p.hp <= 0) return { text: '' };
  const depleted = st.left <= 0;
  if (!depleted) st.left--;
  const per = A('per');
  let rolls = Math.round((2 + rnd(0, 2)) * (1 + per * 0.12) * (G.isNight ? 1.25 : 1) * (depleted ? 0.3 : 1));
  const got = {};
  for (let i = 0; i < rolls; i++) { const e = wpick(L.loot, x => x[1]); got[e[0]] = (got[e[0]] || 0) + rnd(e[2], e[3]); }
  if (L.rare && !depleted && chance(0.04 + per * 0.015)) { const r = pick(L.rare); got[r] = (got[r] || 0) + 1; }
  const out = [];
  for (const k in got) out.push(give(k, got[k]));
  // story items
  const sItem = storyItemHere(poi.type);
  if (sItem && (st.storyTries = (st.storyTries || 0) + 1) && (st.storyTries >= 2 || chance(0.5))) { out.push(give(sItem, 1)); setFlag('got_' + sItem.replace('radio_', '')); log(`Found the ${itemName(sItem)}!`, 'story'); xp(20); }
  // lore
  let lore = null; const C = CONTENT_();
  const unread = C.lore.map((l, i) => i).filter(i => !G.loreRead.includes(i));
  if (unread.length && chance(0.16)) { const i = pick(unread); G.loreRead.push(i); lore = C.lore[i]; journal(lore.title, lore.text); }
  xp(4); addNoise(1);
  let text = depleted ? 'This place is picked clean. You scrape together a little.' : pick(['You work through the rooms carefully.', 'You search every drawer and shelf.', 'You move quietly, checking corners.', 'You pry open what you can.']);
  // encounter
  let enc = null;
  const p = 0.14 + L.danger * 0.05 + (G.isNight ? 0.08 : 0) + G.noise * 0.02;
  if (chance(p)) enc = pickEncounter(poi.type);
  return { text, loot: out.filter(Boolean), lore, enc };
}
function storyItemHere(type) {
  const L = LOCS[type]; if (!L.story) return null;
  for (const it of L.story) {
    if (has(it) || G.store[it] || G.pack[it]) continue;
    if (it.startsWith('radio_') && G.flags.q_radio && !G.flags.radio_built && !(it === 'radio_coil' && G.flags.got_coil) && !(it === 'radio_cell' && G.flags.got_cell) && !(it === 'radio_antenna' && G.flags.got_antenna)) return it;
    if ((it === 'engine_parts' || it === 'haven_map') && G.flags.q_bus && !G.flags['got_' + it] && !G.flags.bus_ready) return it;
  }
  return null;
}
function sleep() {
  const b = bl('bed');
  let hours = G.hour >= 18 ? (24 - G.hour + 7) : G.hour < 7 ? 7 - G.hour : 8;
  advance(hours * 60, { sleep: true });
  if (G.p.hp <= 0) return;
  G.p.sta = Math.round(G.p.maxSta * clamp(0.6 + b * 0.14, 0, 1));
  heal(8 + b * 5); addMorale(b ? 2 : -2);
  log(`You slept ${hours} hours${b ? ' in a bunk' : ' on cold concrete'}.`);
}
function restOutside() { advance(60); rest(12 + Math.round(A('end'))); return chance(0.12 + (G.isNight ? 0.1 : 0)) ? pickEncounter(districtAt(G.p.x, G.p.y)) : null; }

/* ---------- Encounters ---------- */
function allEncounters() { return [].concat(window.ENCOUNTERS || [], window.ARC_ENCOUNTERS || [], CONTENT_().shelterEvents || []); }
function encEligible(e, type, ignoreWhere) {
  if (!ignoreWhere) {
    const w = e.where || ['any'];
    if (type === 'shelter') { if (!w.includes('shelter')) return false; }
    else if (!(w.includes(type) || w.includes('any') || (type === 'travel-any' && w.includes('travel')))) return false;
  }
  if (e.minDay && G.day < e.minDay) return false;
  if (e.night === true && !G.isNight) return false;
  if (e.night === false && G.isNight) return false;
  if (e.once && G.seenEnc[e.id]) return false;
  if (e.cond) { try { if (!e.cond()) return false; } catch (err) { return false; } }
  return true;
}
function pickEncounter(type) {
  const all = allEncounters();
  let pool = all.filter(e => encEligible(e, type));
  if (type !== 'shelter' && type !== 'travel') {
    // mix location-specific with travel/any; boost exact matches
    pool = pool.concat(all.filter(e => (e.where || []).includes('travel') && !pool.includes(e) && encEligible(e, 'travel')));
  }
  if (!pool.length) return null;
  return wpick(pool, e => (e.weight || 10) * ((e.where || []).includes(type) ? 2 : 1) * (G.seenEnc[e.id] ? 0.5 : 1));
}
function encById(id) { return allEncounters().find(e => e.id === id); }
function checkChance(c) { return clamp(0.6 + (A(c.attr) - c.diff) * 0.09, 0.05, 0.95); }

/* ---------- Fights (quick, narrated) ---------- */
function fightOdds(ids, mode) {
  const w = weaponOf(); const ranged = w && ITEMS[w].ammo;
  let P = (w ? avgDmg(w) : 2.5) + A('str') * (ranged ? 0.3 : 1) + A('agi') * 0.7 + G.p.level + (G.p.sta / 30) + (G.p.hp / 25);
  if (mode === 'shoot') P *= 1.7;
  const E = ids.reduce((s, id) => s + ENEMIES[id].hp / 3 + (ENEMIES[id].dmg[0] + ENEMIES[id].dmg[1]) / 2, 0);
  return clamp(P / (P + E * 0.9), 0.1, 0.95);
}
function fleeChance(ids) { const worst = Math.min(...ids.map(i => ENEMIES[i].flee)); return clamp(worst * (0.55 + A('agi') * 0.06) * (G.p.sta > 15 ? 1 : 0.6), 0.05, 0.95); }
function resolveFight(ids, mode) {
  const lines = [], foes = ids.map(id => ({ id, e: ENEMIES[id], hp: ENEMIES[id].hp }));
  let w = weaponOf(); const it = w ? ITEMS[w] : null;
  const shooting = mode === 'shoot' && it && it.ammo && G.pack[it.ammo];
  const meleeW = shooting ? null : (it && !it.ammo ? w : (Object.keys(G.pack).filter(k => ITEMS[k].c === 'weapon' && !ITEMS[k].ammo).sort((a, b) => avgDmg(b) - avgDmg(a))[0] || null));
  const armor = G.pack.vest ? 3 : 0;
  let dmgTaken = 0, bitten = false, gassed = false, kills = 0, round = 0;
  while (foes.some(f => f.hp > 0) && round < 14 && G.p.hp - dmgTaken > 0) {
    round++;
    const target = foes.find(f => f.hp > 0);
    const hitC = 0.72 + A('agi') * 0.02;
    if (chance(hitC)) {
      let d;
      if (shooting) { d = rnd(it.dmg[0], it.dmg[1]); G.pack[it.ammo]--; if (!G.pack[it.ammo]) delete G.pack[it.ammo]; addNoise(it.noise); }
      else { const md = meleeW ? ITEMS[meleeW].dmg : [2, 4]; d = rnd(md[0], md[1]) + Math.round(A('str') * 0.6); if (G.p.sta < 5) d = Math.round(d * 0.6); }
      target.hp -= d;
      const wn = shooting ? it.n : (meleeW ? ITEMS[meleeW].n : 'bare fists');
      if (target.hp <= 0) {
        kills++; lines.push(`You drop the ${target.e.n} with your ${wn}.`);
        if (target.e.gas && !shooting) { gassed = true; lines.push('It bursts. Green gas fills your lungs.'); }
        if (shooting && it.aoe) { const t2 = foes.find(f => f.hp > 0); if (t2) { t2.hp -= Math.round(d / 2); lines.push(`The spread tears into the ${t2.e.n} behind it.`); if (t2.hp <= 0) kills++; } }
      } else if (round <= 3) lines.push(`You hit the ${target.e.n} with your ${wn}.`);
      if (!shooting && !G.pack.ammo) tire(3); else tire(2);
    } else if (round <= 4) lines.push(`You swing and miss the ${target.e.n}.`);
    // screamer
    const sc = foes.find(f => f.hp > 0 && f.e.scream);
    if (sc && chance(0.35) && foes.length < 7) { foes.push({ id: 'walker', e: ENEMIES.walker, hp: ENEMIES.walker.hp }); lines.push('The Screamer shrieks. Another walker stumbles in.'); addNoise(2); }
    // enemies attack
    for (const f of foes) {
      if (f.hp <= 0) continue;
      if (chance(f.e.acc - A('agi') * 0.025)) {
        const d = Math.max(1, rnd(f.e.dmg[0], f.e.dmg[1]) - armor); dmgTaken += d;
        if (f.e.z && chance(G.pack.vest ? 0.05 : 0.1)) bitten = true;
      }
    }
  }
  const won = !foes.some(f => f.hp > 0);
  G.stats.kills += kills;
  lines.push(won ? `It's over. You took ${dmgTaken} damage.` : `You are overwhelmed.`);
  hurt(dmgTaken, 'a fight with ' + ENEMIES[ids[0]].n.toLowerCase() + 's');
  if (G.p.hp <= 0) return { won: false, lines, dead: true };
  if (!won) { const extra = ''; lines.push('You break away and run, bleeding.'); setStatus('bleeding', 4); }
  if (dmgTaken > 20 && chance(0.4)) { setStatus('bleeding', 5); lines.push('You are bleeding.'); }
  if (gassed) setStatus('sick', 16);
  if (bitten) lines.push(bite());
  const loot = [];
  if (won) {
    const xpg = foes.reduce((s, f) => s + f.e.xp, 0); xp(xpg);
    for (const f of foes) if (f.e.loot && chance(0.7)) { const l = pick(f.e.loot); loot.push(give(l[0], rnd(1, l[1]))); }
  }
  return { won, lines, loot: loot.filter(Boolean) };
}

/* ---------- Trader ---------- */
function makeTrader() {
  const pool = ['canned', 'water', 'meal', 'bandage', 'medkit', 'antibiotics', 'painkillers', 'ammo', 'shells', 'bolts', 'parts', 'chem', 'fuel', 'cloth', 'scrap', 'machete', 'axe', 'crossbow', 'pistol', 'backpack', 'boots', 'vest', 'batteries'];
  const stock = {}; for (let i = 0; i < 8; i++) { const id = pick(pool); stock[id] = (stock[id] || 0) + (ITEMS[id].c === 'weapon' || ITEMS[id].c === 'gear' ? 1 : rnd(1, 4)); }
  return { stock, credit: 0 };
}
function buyPrice(id) { return Math.max(1, Math.ceil(ITEMS[id].v * (1.6 - A('cha') * 0.06))); }
function sellPrice(id) { return Math.max(1, Math.floor(ITEMS[id].v * (0.35 + A('cha') * 0.04))); }

/* ---------- Story ---------- */
function queueScene(id) { if (G.seenScenes[id]) return; G.seenScenes[id] = true; Hooks.queue({ type: 'scene', id }); }
function storyCheck() {
  const f = G.flags;
  if ((G.day >= 2 || (G.day === 1 && G.hour >= 20)) && !G.seenScenes.first_night) queueScene('first_night');
  if (G.seenScenes.first_night && G.day >= 2 && !f.q_radio) { f.q_radio = true; queueScene('radio_found'); journal('The dead radio', 'The old shortwave needs a coil (Tower Blocks or Volt & Co.), an antenna (KVAL Radio Tower) and a power cell (Precinct 9 or Volt & Co.).'); }
  if (G.day >= 5 && !f.tollmen) { f.tollmen = true; queueScene('tollmen_demand'); }
  if (f.radio_built && !f.q_bus && G.survivors.length >= 4 && bl('walls') >= 1) {
    f.q_bus = true; G.hordeDay = G.day + 12; queueScene('haven_coords');
    journal('Exodus', `The great horde arrives around day ${G.hordeDay}. Find Engine Parts at the Bus Depot, a Haven Route Map at Checkpoint Echo, and 6 Fuel. Then repair the bus at the depot.`);
  }
  if (f.q_bus && G.hordeDay - G.day <= 4 && !G.seenScenes.horde_warning) queueScene('horde_warning');
  if (f.q_bus && G.day >= G.hordeDay && !f.final) { f.final = true; Hooks.queue({ type: 'final' }); }
}
function objective() {
  const f = G.flags;
  if (f.q_bus) {
    const left = G.hordeDay - G.day;
    if (f.bus_ready) return `The bus is ready. ${left} days until the horde. Leave from the shelter, or prepare to stand.`;
    const need = [];
    if (!has('engine_parts') && !G.store.engine_parts && !G.pack.engine_parts) need.push('Engine Parts (Bus Depot)');
    if (!G.pack.haven_map && !G.store.haven_map) need.push('Route Map (Checkpoint Echo)');
    if (count('fuel') < 6) need.push(`Fuel ${count('fuel')}/6`);
    return `Horde in ${left} days. ` + (need.length ? 'Find: ' + need.join(', ') : 'Bring parts and fuel to the Bus Depot to repair the bus.');
  }
  if (f.radio_built) return `Haven wants proof. Survivors ${G.survivors.length}/4, Barricades ${bl('walls')}/1.`;
  if (f.q_radio) {
    const parts = ['radio_coil', 'radio_antenna', 'radio_cell'].filter(k => !G.pack[k] && !G.store[k]).map(itemName);
    return parts.length ? `Repair the radio. Missing: ${parts.join(', ')}.` : 'You have every part. Build the Shortwave Radio at the shelter.';
  }
  if (!bl('bed') || !bl('rain')) return 'Survive. Scavenge nearby, then build Bunks and a Rain Collector at the bunker.';
  return 'Survive the night. Scavenge, build, find people.';
}
function repairBus() {
  if (!G.pack.engine_parts || (G.pack.fuel || 0) < 6) return false;
  take('engine_parts', 1); take('fuel', 6); setFlag('bus_ready'); advance(240); xp(40);
  queueScene('bus_ready'); return true;
}

/* ---------- Save / load ---------- */
const SAVE_KEY = 'deadembers_save_v1';
function serialize() { let s = ''; for (let i = 0; i < G._fog.length; i++) s += G._fog[i] ? '1' : '0'; G.fog = s; const o = Object.assign({}, G); delete o._fog; return JSON.stringify(o); }
function saveGame(silent) { try { localStorage.setItem(SAVE_KEY, serialize()); if (!silent) log('Game saved.', 'good'); return true; } catch (e) { if (!silent) log('Could not save in this browser.', 'bad'); return false; } }
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function loadFrom(str) { G = JSON.parse(str); WORLD = genWorld(G.seed); initFog(); recalc(); }
function loadGame() { try { const s = localStorage.getItem(SAVE_KEY); if (!s) return false; loadFrom(s); return true; } catch (e) { return false; } }
