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
/* Logical grid: W x H tiles. In 3D, tile (x,y) maps to world (x*TILE, 0, y*TILE); +x east, +y (world +z) south. */
const W = 64, H = 48, TILE = 2;
const T_GRASS = 0, T_ROAD = 1, T_WALL = 3, T_DOOR = 4, T_TREE = 5, T_WATER = 6, T_BRIDGE = 7, T_RUBBLE = 8, T_CAR = 9, T_YARD = 10, T_FIELD = 11, T_ROOF = 12, T_FLOOR = 13, T_PROP = 14;
const SOLID = new Set([T_WALL, T_TREE, T_WATER, T_CAR, T_ROOF, T_PROP]);
const ROADS_Y = [4, 14, 24, 34, 44], ROADS_X = [4, 16, 28, 40, 52];
const BLOCKS_X = [[6, 15], [18, 27], [30, 39], [42, 48], [54, 63]], BLOCKS_Y = [[6, 13], [16, 23], [26, 33], [36, 43]];
const BLOCK_PLAN = {
  '0,0': 'radiotower', '1,0': 'hospital', '2,0': 'street', '3,0': 'police', '4,0': 'military',
  '0,1': 'apartments', '1,1': 'supermarket', '2,1': 'shelter', '3,1': 'apartments', '4,1': 'forest',
  '0,2': 'factory', '1,2': 'gas', '2,2': 'farm', '3,2': 'electronics', '4,2': 'forest',
  '0,3': 'depot', '1,3': 'street', '2,3': 'supermarket', '3,3': 'gas', '4,3': 'tollcamp',
};
const RIVER_X = [50, 51];
/* WORLD = {tiles, pois:{"x,y":{x,y,type,label,outdoor?}}, roofs:[{x,y,w,h,type,poi,closed?}] (building footprints incl. walls),
   containers:[{id,x,y,kind,loc,poi}], shelterRect, bunker:{x,y,w,h}, hatch:{x,y}, bus:{x,y}, gate:{x,y}} */
let WORLD = null;

function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function genWorld(seed) {
  const R = seeded(seed), ri = (a, b) => Math.floor(R() * (b - a + 1)) + a;
  const tiles = new Uint8Array(W * H).fill(T_GRASS);
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = t; };
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T_WALL : tiles[y * W + x];
  for (const y of ROADS_Y) for (let x = 0; x < W; x++) { set(x, y, T_ROAD); set(x, y + 1, T_ROAD); }
  for (const x of ROADS_X) for (let y = 0; y < H; y++) { set(x, y, T_ROAD); set(x + 1, y, T_ROAD); }
  const pois = {}, roofs = [], containers = [];
  let cid = 0, shelterRect = null, bunker = null, hatch = null, bus = null, gate = null;
  const addPoi = (x, y, type, label, outdoor) => { const k = x + ',' + y; pois[k] = { x, y, type, label: label || LOCS[type].n }; if (outdoor) pois[k].outdoor = true; else set(x, y, T_DOOR); return k; };
  const addCont = (x, y, kind, loc, poi) => { set(x, y, T_PROP); containers.push({ id: 'c' + (cid++), x, y, kind, loc, poi }); };
  /* A walled building with a walkable floor, one door on the south wall, optional partition, wall-side containers. */
  const addBuilding = (x0, y0, x1, y1, type, label, nCont) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, (x === x0 || x === x1 || y === y0 || y === y1) ? T_WALL : T_FLOOR);
    const dx = Math.floor((x0 + x1) / 2);
    const key = addPoi(dx, y1, type, label);
    const w = x1 - x0 + 1;
    let px = null, gapY = null;
    if (w >= 8) {
      px = x0 + Math.floor(w / 2); if (px === dx) px++;
      gapY = ri(y0 + 1, y1 - 1);
      for (let y = y0 + 1; y < y1; y++) if (y !== gapY) set(px, y, T_WALL);
    }
    roofs.push({ x: x0, y: y0, w, h: y1 - y0 + 1, type, poi: key });
    const kinds = CONT_KINDS[type] || ['crate'];
    const cand = [];
    for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) {
      if (get(x, y) !== T_FLOOR) continue;
      if (Math.abs(x - dx) <= 1 && y >= y1 - 2) continue;
      if (px !== null && Math.abs(x - px) <= 1 && Math.abs(y - gapY) <= 1) continue;
      const touch = get(x - 1, y) === T_WALL || get(x + 1, y) === T_WALL || get(x, y - 1) === T_WALL;
      if (touch) cand.push([x, y]);
    }
    /* every floor tile and every container must stay reachable from inside the door */
    const interiorOK = () => {
      const seen = new Set([dx + ',' + (y1 - 1)]), q = [[dx, y1 - 1]];
      while (q.length) { const [x, y] = q.pop(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + a, ny = y + b, k = nx + ',' + ny; if (!seen.has(k) && get(nx, ny) === T_FLOOR) { seen.add(k); q.push([nx, ny]); } } }
      for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) {
        const t = get(x, y);
        if (t === T_FLOOR && !seen.has(x + ',' + y)) return false;
        if (t === T_PROP && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => seen.has((x + a) + ',' + (y + b)))) return false;
      }
      return true;
    };
    let placed = 0;
    while (placed < nCont && cand.length) {
      const j = Math.floor(R() * cand.length), [x, y] = cand.splice(j, 1)[0];
      set(x, y, T_PROP);
      if (!interiorOK()) { set(x, y, T_FLOOR); continue; }
      set(x, y, T_FLOOR); addCont(x, y, kinds[placed % kinds.length], type, key); placed++;
    }
    return key;
  };
  for (let by = 0; by < 4; by++) for (let bx = 0; bx < 5; bx++) {
    const [x0, x1] = BLOCKS_X[bx], [y0, y1] = BLOCKS_Y[by];
    const type = BLOCK_PLAN[bx + ',' + by];
    const bw = x1 - x0 + 1;
    const scatter = (n, t) => { for (let i = 0; i < n; i++) { const x = ri(x0, x1), y = ri(y0, y1); if (get(x, y) === T_GRASS) set(x, y, t); } };
    if (type === 'shelter') {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, T_YARD);
      shelterRect = { x0, y0, x1, y1 };
      bunker = { x: x0 + 3, y: y0, w: 3, h: 2 };
      for (let y = y0; y < y0 + 2; y++) for (let x = x0 + 3; x < x0 + 6; x++) set(x, y, T_WALL);
      hatch = { x: x0 + 4, y: y0 + 2 };
      addPoi(hatch.x, hatch.y, 'shelter');
    } else if (type === 'forest') {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (R() < 0.42) set(x, y, T_TREE);
      const px = ri(x0 + 2, x1 - 2), py = ri(y0 + 2, y1 - 2);
      for (let y = py - 1; y <= py + 1; y++) for (let x = px - 1; x <= px + 1; x++) set(x, y, T_GRASS);
      for (let x = px; x <= x1 + 1; x++) if (get(x, py) === T_TREE) set(x, py, T_GRASS);
      const key = addPoi(px, py, 'forest', 'Hunting Stand', true);
      addCont(px, py - 1, 'stash', 'forest', key);
    } else if (type === 'farm') {
      for (let y = y0 + 1; y <= y1 - 1; y++) for (let x = x0 + 1; x <= x0 + 4; x++) set(x, y, T_FIELD);
      addBuilding(x1 - 4, y0 + 1, x1, y0 + 5, 'farm', 'Barn', 4);
      scatter(4, T_TREE);
    } else if (type === 'tollcamp') {
      for (let x = x0 + 1; x <= x1 - 1; x++) { set(x, y0 + 1, T_WALL); set(x, y1 - 1, T_WALL); }
      for (let y = y0 + 1; y <= y1 - 1; y++) { set(x0 + 1, y, T_WALL); set(x1 - 1, y, T_WALL); }
      for (let y = y0 + 2; y <= y1 - 2; y++) for (let x = x0 + 2; x <= x1 - 2; x++) set(x, y, T_YARD);
      for (let y = y0 + 2; y <= y0 + 4; y++) for (let x = x0 + 3; x <= x1 - 3; x++) set(x, y, T_ROOF);
      roofs.push({ x: x0 + 3, y: y0 + 2, w: bw - 6, h: 3, type: 'tollcamp', closed: true });
      gate = { x: x0 + Math.floor(bw / 2), y: y1 - 1 };
      addPoi(gate.x, gate.y, 'tollcamp');
    } else if (type === 'street') {
      scatter(10, T_RUBBLE); scatter(4, T_TREE);
      addBuilding(x0 + 1, y0 + 1, x0 + 5, y0 + 4, 'street', 'Wrecked Shop', 3);
      const rx = x0 + ri(2, bw - 3), ry = y1 - 1;
      const key = addPoi(rx, ry + 1, 'street', 'Rubble Pile', true);
      addCont(rx, ry, 'rubble', 'street', key);
      if ([T_GRASS, T_RUBBLE].includes(get(rx + 2, ry - 1))) addCont(rx + 2, ry - 1, 'rubble', 'street', key);
      for (let i = 0; i < 4; i++) { const x = ri(x0 + 7, x1), y = ri(y0, y1 - 2); if ([T_GRASS, T_RUBBLE].includes(get(x, y))) addCont(x, y, 'crate', 'street', key); }
    } else {
      const mx = type === 'radiotower' ? 3 : 1;
      const n = (LOCS[type].searches || 4) + 1;
      addBuilding(x0 + mx, y0 + 1, x1 - mx, y1 - 1, type, null, n);
      if (type === 'depot') bus = { x: x1 - 2, y: y1 };
      scatter(3, T_RUBBLE);
    }
  }
  for (let y = 0; y < H; y++) for (const x of RIVER_X) { const t = get(x, y); if (t === T_ROAD) set(x, y, T_BRIDGE); else set(x, y, T_WATER); }
  for (const [y, label] of [[30, 'River Dock'], [10, 'Fishing Pier']]) { set(49, y, T_GRASS); const key = addPoi(49, y, 'river', label, true); addCont(49, y - 1, 'nets', 'river', key); }
  for (let i = 0; i < 26; i++) {
    const x = ri(0, W - 1), y = ri(0, H - 1);
    if (get(x, y) !== T_ROAD || (x >= 26 && x <= 42 && y >= 12 && y <= 26)) continue;
    set(x, y, T_CAR);
    if (R() < 0.45) containers.push({ id: 'c' + (cid++), x, y, kind: 'trunk', loc: 'street', poi: null });
  }
  const clearCar = (x, y) => { if (get(x, y) === T_CAR) { set(x, y, T_ROAD); const ci = containers.findIndex(c => c.x === x && c.y === y); if (ci >= 0) containers.splice(ci, 1); } };
  for (const k in pois) { const p = pois[k]; for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) clearCar(p.x + dx, p.y + dy); }
  /* a clear path from every south-facing door (and outdoor POI) down to the next road */
  for (const k in pois) {
    const p = pois[k]; if (p.type === 'shelter') continue;
    for (let y = p.y + 1; y < H; y++) { const t = get(p.x, y); if (t === T_ROAD || t === T_BRIDGE) break; if (t === T_CAR) clearCar(p.x, y); else if (SOLID.has(t)) set(p.x, y, T_GRASS); }
  }
  if (bus) for (let x = bus.x - 1; x <= bus.x + 1; x++) { clearCar(x, bus.y); clearCar(x, bus.y + 1); }
  return { tiles, pois, roofs, containers, shelterRect, bunker, hatch, bus, gate };
}
function tileAt(x, y) { if (x < 0 || y < 0 || x >= W || y >= H) return T_WALL; return WORLD.tiles[y * W + x]; }
function solidAt(x, y) { return SOLID.has(tileAt(Math.floor(x), Math.floor(y))); }
function inShelter(x, y) { const r = WORLD.shelterRect; return x >= r.x0 && x <= r.x1 + 1 && y >= r.y0 && y <= r.y1 + 1; }
function districtAt(x, y) {
  let bx = BLOCKS_X.findIndex(([a, b]) => x >= a - 2 && x <= b + 1), by = BLOCKS_Y.findIndex(([a, b]) => y >= a - 2 && y <= b + 1);
  if (bx < 0) bx = clamp(Math.round(x / 12), 0, 4); if (by < 0) by = clamp(Math.round(y / 11), 0, 3);
  return BLOCK_PLAN[bx + ',' + by] || 'street';
}
/* Index into WORLD.roofs of the building whose footprint contains (x,y), or -1. */
function buildingAt(x, y) { const fx = Math.floor(x), fy = Math.floor(y); return WORLD.roofs.findIndex(r => fx >= r.x && fx < r.x + r.w && fy >= r.y && fy < r.y + r.h); }
function indoors(x, y) { const t = tileAt(Math.floor(x), Math.floor(y)); return t === T_FLOOR || t === T_DOOR && buildingAt(x, y) >= 0; }
function poiNear(x, y, r) { let best = null, bd = r * r; for (const k in WORLD.pois) { const p = WORLD.pois[k], d = (p.x + 0.5 - x) ** 2 + (p.y + 0.5 - y) ** 2; if (d <= bd) { bd = d; best = Object.assign({ key: k }, p); } } return best; }
function nearestPoi(type, x, y) { let best = null, bd = Infinity; for (const k in WORLD.pois) { const p = WORLD.pois[k]; if (p.type !== type) continue; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } } return best; }

/* ---------- New game ---------- */
function newGame(name, bgId, attrs) {
  const bg = BACKGROUNDS[bgId];
  const a = Object.assign({}, attrs);
  for (const k in bg.bonus) a[k] = (a[k] || 0) + bg.bonus[k];
  const seed = Math.floor(Math.random() * 1e9);
  G = {
    v: 2, seed, day: 1, hour: 7, minute: 0,
    p: { name, bg: bgId, attr: a, hp: 100, maxHp: 100, sta: 0, maxSta: 0, hunger: 80, thirst: 70, morale: 60, inf: 0, xp: 0, level: 1, points: 0, weapon: null, x: 0, y: 0, face: 0, status: {} },
    pack: {}, store: { canned: 2, water: 2, wood: 3 },
    survivors: [], buildings: {}, flags: {}, seenEnc: {}, seenScenes: {}, journal: [], loreRead: [], log: [],
    locs: {}, cont: {}, unlocks: {}, hints: {}, fog: '', noise: 0, encTimer: rnd(70, 110), nextId: 1, hordeDay: 0, hordeNight: false, hordeResult: null,
    stats: { kills: 0, searches: 0, encounters: 0, recruited: 0 },
  };
  WORLD = genWorld(seed);
  G.p.x = WORLD.hatch.x + 0.5; G.p.y = WORLD.hatch.y + 1.5;
  for (const k in bg.items) G.pack[k] = (G.pack[k] || 0) + bg.items[k];
  const w = Object.keys(G.pack).find(k => ITEMS[k].c === 'weapon'); G.p.weapon = w || null;
  for (const k in WORLD.pois) G.locs[k] = { visited: false };
  initFog();
  recalc(); G.p.sta = G.p.maxSta;
  const intro = CONTENT_().story.intro; if (intro) journal(intro.title, storyText(intro));
  return G;
}
/* Long-form text of a scene for the journal (scenes may have beats[] and/or paras[]). */
function storyText(sc) { return fmtName((sc.paras && sc.paras.length ? sc.paras : (sc.beats || []).map(b => (b.who ? b.who + ': ' : '') + b.line)).join('\n\n')); }
function fmtName(s) { return String(s || '').replace(/\{name\}/g, G ? G.p.name : 'you'); }
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
/* fight() spawns real enemies around the player (Hooks.spawnFight, provided by combat.js).
   opts: {onWin:()=>string, onLose:()=>string, onFlee:()=>string, noFlee:bool}. Returns undefined on purpose:
   content uses `fight(...) || 'text'`. Headless (no hook) it is recorded in PENDING for tests. */
let PENDING = { fight: null, trader: false };
function fight(ids, opts) {
  ids = (ids || []).filter(id => ENEMIES[id]); if (!ids.length) return;
  opts = opts || {};
  if (Hooks.spawnFight) Hooks.spawnFight(ids, opts); else PENDING.fight = { ids, opts };
}
function openTrader() { if (Hooks.openTrader) Hooks.openTrader(); else PENDING.trader = true; }
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
  unlock('people');
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
  checkUnlocks();
  if (G.hour === 20) storyCheck();
  if (G.hour === 22 && G.atShelter && G.day > 1 && !G.hordeNight && chance(0.35)) { const ev = pickEncounter('shelter'); if (ev) Hooks.queue({ type: 'enc', enc: ev }); }
  if (G.hour === 21 && G.hordeNight && !G.hordeResult && !opts.sleep) { if (G.atShelter && Hooks.hordeStart) Hooks.hordeStart(hordeStrength()); }
  if (G.hour === 6) dailyTick();
}

/* ---------- Progressive unlocks & one-time hints ---------- */
/* Keys: needs (hunger/thirst HUD), build, craft, people, horde, radio, journal, map. UI reads G.unlocks[k]. */
function unlock(k) { if (!G || G.unlocks[k]) return false; G.unlocks[k] = G.day; Hooks.unlock && Hooks.unlock(k); return true; }
function isUnlocked(k) { return !!(G && G.unlocks[k]); }
function hintOnce(key, text) { if (!G || G.hints[key]) return false; G.hints[key] = 1; Hooks.hint && Hooks.hint(text); return true; }
function checkUnlocks() {
  const p = G.p;
  if (p.hunger < 62 || p.thirst < 58) { if (unlock('needs')) hintOnce('needs', 'Hunger and thirst are dropping. Eat and drink from your pack (I).'); }
  if ((G.stats.searches >= 1 && G.atShelter) || G.day >= 2) { if (unlock('build')) hintOnce('build', 'Walk to a marker in the yard and hold E to build.'); }
  if (bl('bench') || G.day >= 3) unlock('craft');
  if (G.flags.q_radio) unlock('radio');
  if (G.journal.length > 1) unlock('journal');
}
function zombieTypes() { const out = []; for (const [d, ids] of ZTIERS) if (G.day >= d) out.push(...ids); return out; }

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
/* Zombies in a real-time horde wave: about strength/4, scaled down by barricades. */
function hordeWaveSize() { return clamp(Math.round(hordeStrength() / 4) + 2, 5, 40); }
function hordeDamage(P, gap, present) {
  P(`Horde night: they broke through.`, 'bad');
  const b1 = damageBuilding(); if (b1) P(`${b1} was wrecked.`, 'bad');
  if (gap > 12) { const b2 = damageBuilding(); if (b2) P(`${b2} was wrecked.`, 'bad'); }
  for (const s of G.survivors) if (chance(0.3)) s.hp -= rnd(15, 35);
  if (gap > 15 && G.survivors.length) { const v = pick(G.survivors); killSurvivor(v, 'the horde'); P(`${v.name} was dragged into the dark.`, 'bad'); }
  for (const f of ['canned', 'veg', 'meal']) if (G.store[f]) G.store[f] = Math.floor(G.store[f] * 0.7);
  addMorale(-10);
}
/* Called by combat.js when a real-time horde wave ends. res = {held:bool, kills:int, breaches:int} */
function resolveHorde(res) {
  const lines = [], P = (msg, cls) => lines.push({ msg, cls: cls || '' });
  G.stats.kills += 0; // kills are already counted per enemy by onKill
  if (res.held) { P(`Horde night: you held the bunker. ${res.kills || 0} dead put down.`, 'good'); xp(25); addMorale(6); }
  else hordeDamage(P, 6 + (res.breaches || 0) * 4, true);
  G.hordeResult = { lines };
  return lines;
}

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
  // horde night (the night that just ended). Fought in real time if the player was home (G.hordeResult), else resolved by numbers.
  if (G.hordeNight) {
    const res = G.hordeResult;
    if (res) { for (const l of res.lines || []) P(l.msg, l.cls); }
    else {
      const S = hordeStrength() + rnd(0, 10), D = defense();
      if (D >= S) { P(`Horde night: the line held without you. Defense ${D} vs ${S}.`, 'good'); xp(10); G.stats.kills += Math.round(S / 4); }
      else hordeDamage(P, S - D, false);
    }
  }
  G.hordeNight = (G.day % 5 === 4) || !!(G.hordeDay && G.day > G.hordeDay - 3 && G.day < G.hordeDay && chance(0.5));
  G.hordeResult = null;
  if (G.hordeNight) { unlock('horde'); P('A horde is coming TONIGHT. Be at the bunker by dark.', 'bad'); hintOnce('horde_now', 'Horde tonight. Get back to the bunker before 21:00.'); }
  else if ((G.day + 1) % 5 === 4) { unlock('horde'); P(bl('tower') ? 'Watchtower: the dead are massing. Horde tomorrow night.' : 'The dead are gathering in the north. A horde will hit tomorrow night.', 'warn'); hintOnce('horde_warn', 'A horde hits tomorrow night. Build Barricades and be home by dark.'); }
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
/* ---------- Containers (searching = opening things in the world) ---------- */
function containerById(id) { return WORLD.containers.find(c => c.id === id) || null; }
/* nearest container whose tile centre is within r tiles of (x,y) */
function containerNear(x, y, r) { let best = null, bd = r * r; for (const c of WORLD.containers) { const d = (c.x + 0.5 - x) ** 2 + (c.y + 0.5 - y) ** 2; if (d <= bd) { bd = d; best = c; } } return best; }
/* 'full' (never searched), 'refilled' (searched long ago, some loot again) or 'empty' */
function containerState(c) { const d = G.cont[c.id]; if (d == null) return 'full'; return G.day - d >= CONT_REFILL_DAYS ? 'refilled' : 'empty'; }
/* real seconds to hold E. Perception makes it faster. */
function searchTime(c) { return +(CONTAINERS[c.kind].t * clamp(1.25 - A('per') * 0.06, 0.55, 1.2)).toFixed(2); }
/* Opens a container. Returns {loot:[label], empty:bool, story:itemId|null, lore:{title,text}|null, enc:encounter|null}. */
function searchContainer(c) {
  const K = CONTAINERS[c.kind], L = LOCS[c.loc] || LOCS.street, st = containerState(c);
  G.cont[c.id] = G.day; G.stats.searches++;
  if (c.poi && G.locs[c.poi]) G.locs[c.poi].visited = true;
  advance(10); tire(2);
  if (st === 'empty') return { loot: [], empty: true, story: null, lore: null, enc: null };
  const per = A('per'), pool = (L.loot || []).filter(e => !K.cats || K.cats.includes(ITEMS[e[0]].c));
  const table = pool.length ? pool : (L.loot || LOCS.street.loot);
  const rolls = Math.max(1, Math.round(K.r * (1 + per * 0.08) * (st === 'refilled' ? 0.5 : 1) + (chance(0.3) ? 1 : 0)));
  const got = {};
  for (let i = 0; i < rolls; i++) { const e = wpick(table, x => x[1]); got[e[0]] = (got[e[0]] || 0) + rnd(e[2], e[3]); }
  if (L.rare && st === 'full' && chance(0.025 + per * 0.01)) { const r = pick(L.rare); got[r] = (got[r] || 0) + 1; }
  const loot = []; for (const k in got) loot.push(give(k, got[k]));
  let story = storyItemHere(c.loc);
  if (story) { const tries = G.flags['tries_' + story] = (G.flags['tries_' + story] || 0) + 1; if (tries >= 3 || chance(0.4)) { loot.push(give(story, 1)); setFlag('got_' + story.replace('radio_', '')); log(`Found the ${itemName(story)}!`, 'story'); xp(20); } else story = null; }
  let lore = null; const C = CONTENT_();
  const unread = C.lore.map((l, i) => i).filter(i => !G.loreRead.includes(i));
  if (unread.length && chance(0.1)) { const i = pick(unread); G.loreRead.push(i); lore = C.lore[i]; journal(lore.title, lore.text); }
  xp(2); addNoise(0.3);
  let enc = null;
  if (chance(0.04 + (L.danger || 0) * 0.015 + (G.isNight ? 0.03 : 0) + G.noise * 0.01)) enc = pickEncounter(c.loc);
  if (G.stats.searches === 1) hintOnce('first_loot', 'Loot goes in your pack. Bring it home to the bunker to store and build.');
  return { loot: loot.filter(Boolean), empty: false, story, lore, enc };
}
function storyItemHere(type) {
  const L = LOCS[type]; if (!L || !L.story) return null;
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
/* Can the player sleep now? Not on a horde night before the wave is over. */
function canSleep() { if (G.hordeNight && !G.hordeResult && (G.hour >= 18 || G.hour < 6)) return { ok: false, why: 'The horde is coming. Hold the yard first.' }; return { ok: true }; }
function restOutside() { advance(60); rest(12 + Math.round(A('end'))); return chance(0.12 + (G.isNight ? 0.1 : 0)) ? pickEncounter(districtAt(G.p.x, G.p.y)) : null; }
/* Called by main loop as real time passes outside the shelter. Returns an encounter or null. */
function fieldEncounterRoll(dtSec) {
  if (G.atShelter) return null;
  G.encTimer -= dtSec * (1 + G.noise * 0.08);
  if (G.encTimer > 0) return null;
  G.encTimer = rnd(80, 140);
  if (!chance(0.7)) return null;
  const e = pickEncounter(districtAt(G.p.x, G.p.y));
  if (e) G.stats.encounters++;
  return e;
}

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

/* ---------- Real-time combat rules (combat.js does movement and hit detection; numbers live here) ---------- */
/* The weapon profile the player is using right now (falls back to fists, and to melee when a gun has no ammo). */
function weaponProfile() {
  const w = weaponOf(), it = w ? ITEMS[w] : null;
  if (it && it.ammo && !G.pack[it.ammo]) {
    const melee = Object.keys(G.pack).filter(k => ITEMS[k].c === 'weapon' && !ITEMS[k].ammo).sort((a, b) => avgDmg(b) - avgDmg(a))[0];
    return melee ? Object.assign({ id: melee, ranged: false }, ITEMS[melee]) : Object.assign({ id: null, ranged: false }, WEAPON_FISTS);
  }
  if (!it) return Object.assign({ id: null, ranged: false }, WEAPON_FISTS);
  return Object.assign({ id: w, ranged: !!it.ammo }, it);
}
/* Damage the player deals with one hit (melee adds STR; exhausted swings are weak). */
function playerHitDamage(prof) {
  let d = rnd(prof.dmg[0], prof.dmg[1]);
  if (!prof.ranged) { d += Math.round(A('str') * 0.6); if (G.p.sta < 5) d = Math.round(d * 0.6); }
  return d;
}
/* Spend one round of ammo for the current gun; false if none. Adds noise. */
function useAmmo(prof) { if (!prof.ranged) return true; if (!take(prof.ammo, 1)) return false; addNoise(prof.noise || 0); return true; }
/* Player movement speed in tiles/s. mode: 'walk' | 'sprint' | 'crouch'. */
function moveSpeed(mode) {
  let s = 3.0 + A('agi') * 0.08;
  if (mode === 'sprint') s *= 1.7; else if (mode === 'crouch') s *= 0.5;
  if (packWeight() > carryCap()) s *= 0.6;
  if (G.p.status.injured) s *= 0.85;
  if (mode === 'sprint' && G.pack.boots) s *= 1.05;
  return s;
}
/* Stamina per second while sprinting (boots help); dodge roll cost. */
function sprintCost() { return G.pack.boots ? 7 : 10; }
const DODGE_COST = 15;
/* An enemy hit lands on the player. Applies armour, bites, bleeding. Returns damage dealt. */
function enemyHitsPlayer(enemyId, mult) {
  const e = ENEMIES[enemyId]; let d = rnd(e.dmg[0], e.dmg[1]) * (mult || 1) - (G.pack.vest ? 3 : 0);
  d = Math.max(1, Math.round(d));
  hurt(d, 'a ' + e.n.toLowerCase());
  if (e.z && chance(G.pack.vest ? 0.04 : 0.08)) Hooks.toast && Hooks.toast(bite(), 'bad');
  if (d >= 10 && chance(0.25)) setStatus('bleeding', 4);
  return d;
}
/* An enemy died. Counts the kill, awards XP, returns drops [{id,qty}] to spawn as pickups. */
function onKill(enemyId) {
  const e = ENEMIES[enemyId]; G.stats.kills++; xp(e.xp);
  const drops = [];
  if (e.loot && chance(0.8)) { const l = pick(e.loot); drops.push({ id: l[0], qty: rnd(1, l[1]) }); }
  if (e.drop && chance(enemyId === 'warden' ? 1 : 0.5)) { const w = pick(e.drop); drops.push({ id: w, qty: 1 }); if (ITEMS[w].ammo) drops.push({ id: ITEMS[w].ammo, qty: rnd(2, 6) }); }
  if (e.z && chance(0.22)) drops.push({ id: pick(['cloth', 'cloth', 'cigs', 'snack', 'bandage', 'scrap', 'batteries']), qty: 1 });
  if (e.gas) drops.gas = true;
  return drops;
}
/* Pick up a drop. Returns the toast label. */
function pickup(id, qty) { return give(id, qty); }

/* ---------- Trader ---------- */
function makeTrader() {
  const pool = ['canned', 'water', 'meal', 'bandage', 'medkit', 'antibiotics', 'painkillers', 'ammo', 'shells', 'bolts', 'parts', 'chem', 'fuel', 'cloth', 'scrap', 'machete', 'axe', 'crossbow', 'pistol', 'backpack', 'boots', 'vest', 'batteries'];
  const stock = {}; for (let i = 0; i < 8; i++) { const id = pick(pool); stock[id] = (stock[id] || 0) + (ITEMS[id].c === 'weapon' || ITEMS[id].c === 'gear' ? 1 : rnd(1, 4)); }
  return { stock, credit: 0 };
}
function buyPrice(id) { return Math.max(1, Math.ceil(ITEMS[id].v * (1.6 - A('cha') * 0.06))); }
function sellPrice(id) { return Math.max(1, Math.floor(ITEMS[id].v * (0.35 + A('cha') * 0.04))); }

/* ---------- Story ---------- */
function queueScene(id) { if (G.seenScenes[id]) return; G.seenScenes[id] = true; const sc = CONTENT_().story[id]; if (sc) journal(sc.title, storyText(sc)); Hooks.queue({ type: 'scene', id }); }
function storyCheck() {
  const f = G.flags;
  if ((G.day >= 2 || (G.day === 1 && G.hour >= 20)) && !G.seenScenes.first_night) queueScene('first_night');
  if (G.seenScenes.first_night && G.day >= 2 && !f.q_radio) { f.q_radio = true; unlock('radio'); queueScene('radio_found'); journal('The dead radio', 'The old shortwave needs a coil (Tower Blocks or Volt & Co.), an antenna (KVAL Radio Tower) and a power cell (Precinct 9 or Volt & Co.).'); }
  if (G.day >= 5 && !f.tollmen) { f.tollmen = true; queueScene('tollmen_demand'); }
  if (f.radio_built && !f.q_bus && G.survivors.length >= 4 && bl('walls') >= 1) {
    f.q_bus = true; G.hordeDay = G.day + 12; queueScene('haven_coords');
    journal('Exodus', `The great horde arrives around day ${G.hordeDay}. Find Engine Parts at the Bus Depot, a Haven Route Map at Checkpoint Echo, and 6 Fuel. Then repair the bus at the depot.`);
  }
  if (f.q_bus && G.hordeDay - G.day <= 4 && !G.seenScenes.horde_warning) queueScene('horde_warning');
  if (f.q_bus && G.day >= G.hordeDay && !f.final) { f.final = true; Hooks.queue({ type: 'final' }); }
}
const P_ = p => p ? { x: p.x + 0.5, y: p.y + 0.5 } : null;
/* Current goal: {text, target:{x,y}|null} in tile coords. One short line; the UI draws a marker + compass arrow. */
function objectiveInfo() {
  const f = G.flags, home = P_(WORLD.hatch), me = G.p;
  const near = type => P_(nearestPoi(type, me.x, me.y));
  if (G.hordeNight && !G.hordeResult && !G.atShelter && G.hour >= 12) return { text: 'Horde tonight. Get back to the bunker.', target: home };
  // first-day chain: loot -> bring it home -> bunks -> rain collector
  if (G.stats.searches === 0) return { text: 'Find water. Search FreshMart.', target: near('supermarket') };
  if (!bl('bed')) {
    if (!G.atShelter && !isUnlocked('build')) return { text: 'Bring your loot home to the bunker.', target: home };
    return { text: 'Build Bunks in the bunker yard.', target: slotCentre('bed') };
  }
  if (!bl('rain')) return { text: 'Build a Rain Collector.', target: slotCentre('rain') };
  if (f.q_bus) {
    const left = G.hordeDay - G.day;
    if (f.bus_ready) return { text: `The bus is ready. Horde in ${left} days.`, target: home };
    if (!has('engine_parts') && !G.store.engine_parts && !G.pack.engine_parts) return { text: `Find Engine Parts at the Bus Depot (${left}d).`, target: near('depot') };
    if (!G.pack.haven_map && !G.store.haven_map) return { text: `Find the route map at Checkpoint Echo (${left}d).`, target: near('military') };
    if (count('fuel') < 6) return { text: `Gather Fuel ${count('fuel')}/6 (${left}d).`, target: near('gas') };
    return { text: 'Bring parts and fuel to the bus at the depot.', target: P_(WORLD.bus) };
  }
  if (f.radio_built) {
    if (G.survivors.length < 4) return { text: `Haven wants a community. Survivors ${G.survivors.length}/4.`, target: null };
    return { text: 'Haven wants walls. Build Barricades.', target: slotCentre('walls') };
  }
  if (f.q_radio) {
    const need = ['radio_coil', 'radio_antenna', 'radio_cell'].filter(k => !G.pack[k] && !G.store[k]);
    if (!need.length) return { text: 'Build the Shortwave Radio at the bunker.', target: slotCentre('radio') };
    const where = { radio_coil: ['apartments', 'electronics'], radio_antenna: ['radiotower'], radio_cell: ['police', 'electronics'] }[need[0]];
    const tgt = where.map(near).sort((a, b) => ((a.x - me.x) ** 2 + (a.y - me.y) ** 2) - ((b.x - me.x) ** 2 + (b.y - me.y) ** 2))[0];
    return { text: `Find the ${itemName(need[0])}.`, target: tgt };
  }
  if (G.hour >= 19 || G.hour < 6) return { text: 'Night. Sleep in the bunker.', target: home };
  const pois = Object.keys(WORLD.pois).map(k => Object.assign({ key: k }, WORLD.pois[k])).filter(q => G.locs[q.key] && !G.locs[q.key].visited && LOCS[q.type] && q.type !== 'shelter' && !q.outdoor);
  pois.sort((a, b) => ((a.x - me.x) ** 2 + (a.y - me.y) ** 2) - ((b.x - me.x) ** 2 + (b.y - me.y) ** 2));
  if (pois[0]) return { text: `Scavenge ${pois[0].label || LOCS[pois[0].type].n}.`, target: P_(pois[0]) };
  return { text: 'Scavenge, build, find people.', target: null };
}
function objective() { return objectiveInfo().text; }
/* centre of a shelter build slot in tile coords (walls: the yard gate) */
function slotCentre(k) {
  const r = WORLD.shelterRect;
  if (k === 'walls') return { x: (r.x0 + r.x1 + 1) / 2, y: r.y1 + 0.5 };
  const s = BUILD_SLOTS[k]; return s ? { x: r.x0 + s[0] + s[2] / 2, y: r.y0 + s[1] + s[3] / 2 } : P_(WORLD.hatch);
}
/* Can the bus be repaired here and now (player near WORLD.bus)? */
function canRepairBus() { return !!(G.flags.q_bus && !G.flags.bus_ready && G.pack.engine_parts && (G.pack.fuel || 0) >= 6); }
function repairBus() {
  if (!canRepairBus()) return false;
  take('engine_parts', 1); take('fuel', 6); setFlag('bus_ready'); advance(240); xp(40);
  queueScene('bus_ready'); return true;
}

/* ---------- Endings ---------- */
function allyDiff() { const f = G.flags; return Math.max(3, 7 - (f.warden_secret ? 2 : 0) - (f.warden_trust ? 2 : 0) - (f.tollmen_secret ? 1 : 0) - Math.min(3, f.tribute || 0) - (G.survivors.length >= 6 ? 1 : 0)); }
function standNeed() { return 60 + G.day * 2.5; }
/* Options for the last night: [{id,label,ok,note}] */
function finalOptions() {
  const f = G.flags, D = defense() + G.survivors.length * 4;
  const out = [
    { id: 'bus', label: 'Load everyone on the bus. Drive north to Haven.', ok: !!(f.bus_ready && has('haven_map')), note: f.bus_ready && has('haven_map') ? 'Bus ready' : 'Needs the repaired bus and the route map' },
    { id: 'stand', label: 'Stay. Hold the bunker against the great horde.', ok: true, note: `Defense ${D} vs ~${Math.round(standNeed())}` },
    { id: 'ally', label: 'Go to the Warden. Propose an alliance.', ok: !!f.warden_met, note: f.warden_met ? `CHA · ${Math.round(checkChance({ attr: 'cha', diff: allyDiff() }) * 100)}%` : 'You never met the Warden' },
  ];
  if (G.day < G.hordeDay) out.push({ id: 'wait', label: 'Not yet. There is still time.', ok: true, note: '' });
  return out;
}
/* Resolve a final choice. Returns an ending id ('end_haven', ...), 'wait', or 'wave' (UI should run the final wave
   via Hooks.finalWave and then call finishStand(held)). */
function chooseFinal(id) {
  if (id === 'wait') { G.flags.final = false; return 'wait'; }
  if (id === 'bus') return endGame('end_haven');
  if (id === 'ally') return endGame(chance(checkChance({ attr: 'cha', diff: allyDiff() })) ? 'end_alliance' : 'end_alliance_fail');
  if (id === 'stand') { if (Hooks.finalWave) return 'wave'; return finishStand(defense() + G.survivors.length * 4 + rnd(-10, 15) >= standNeed()); }
  return null;
}
function finishStand(held) { return endGame(held ? 'end_stand' : 'end_stand_fail'); }
function endGame(id) { G.endScene = id; G.flags.ended = id; saveGame(true); return id; }

/* ---------- Save / load ---------- */
const SAVE_KEY = 'deadembers_save_v2', OLD_SAVE_KEY = 'deadembers_save_v1';
function serialize() { let s = ''; for (let i = 0; i < G._fog.length; i++) s += G._fog[i] ? '1' : '0'; G.fog = s; const o = Object.assign({}, G); delete o._fog; return JSON.stringify(o); }
function saveGame(silent) { try { localStorage.setItem(SAVE_KEY, serialize()); if (!silent) log('Game saved.', 'good'); return true; } catch (e) { if (!silent) log('Could not save in this browser.', 'bad'); return false; } }
function hasOldSave() { try { return !localStorage.getItem(SAVE_KEY) && !!localStorage.getItem(OLD_SAVE_KEY); } catch (e) { return false; } }
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function loadFrom(str) { const o = JSON.parse(str); if (!o || o.v !== 2) throw new Error('old save'); G = o; WORLD = genWorld(G.seed); initFog(); recalc(); }
function loadGame() { try { const s = localStorage.getItem(SAVE_KEY); if (!s) return false; loadFrom(s); return true; } catch (e) { return false; } }
