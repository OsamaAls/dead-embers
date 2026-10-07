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
/* Logical grid: W x H tiles. In 3D, tile (x,y) maps to world (x*TILE, 0, y*TILE); +x east, +y (world +z) south.
   One connected seeded world of seven biomes (WORLD.biome per tile, index into BIOMES):
     oldtown  the city core (x 22..84, y 18..59): bunker, Tollmen camp, every act-1 target, the bus depot.
     docks    east of the river (x >= 88): cranes, shipping containers, warehouses, the harbour. Gated: collapsed bridge (y 38).
     suburbs  west (x < 22, y >= 28): houses with fenced yards and garages.
     forest   north-west (Kessler Woods + hills): ranger station, hunting stand, old campsite. Gated: rockfall on the forest road (x 34).
     farm     south (x 22..61, y >= 60): Teodor's farm, silos, hedged fields.
     flooded  south-east (x 62..84, y >= 60): shallow water streets (T_SHALLOW slows you), sunken houses, stilt walkways.
     pass     north (x 44..84, y < 17): the road to Haven climbing into snow, Checkpoint Echo. Gated: Tollmen toll barrier (x 58).
   Gated biomes stay sealed (stone wall, cliffs, the river) until openDistrict(id) swaps WORLD.gates[id].tiles back. */
const W = 112, H = 84, TILE = 2;
const T_GRASS = 0, T_ROAD = 1, T_WALL = 3, T_DOOR = 4, T_TREE = 5, T_WATER = 6, T_BRIDGE = 7, T_RUBBLE = 8, T_CAR = 9, T_YARD = 10, T_FIELD = 11, T_ROOF = 12, T_FLOOR = 13, T_PROP = 14,
  T_SHALLOW = 15, T_BUSH = 16, T_GATE = 17, T_DECO = 18, T_ROCK = 19, T_PATH = 20, T_FENCE = 21, T_PLANK = 22;
/* T_SHALLOW: knee-deep water, walkable at moveMul 0.6. T_BUSH: dense bush, walkable, hides a crouching player (inBush).
   T_GATE: story blocker (WORLD.gates). T_DECO: solid outdoor prop listed in WORLD.decos (containers, silos, cranes legs, logs...).
   T_ROCK: boulder / cliff / old stone wall (WORLD.flora says which). T_PATH: dirt trail. T_FENCE: garden fence. T_PLANK: boardwalk / pier. */
const SOLID = new Set([T_WALL, T_TREE, T_WATER, T_CAR, T_ROOF, T_PROP, T_GATE, T_DECO, T_ROCK, T_FENCE]);
/* WORLD.flora per tile: why a plant (or rock) is there, read by World3D. Non-solid entries are decoration only. */
const FLORA = { SAPLING: 1, YOUNG: 2, OLD: 3, WILLOW: 4, REED: 5, HEDGE: 6, FLOWERS: 7, FERN: 8, BIRCH: 9, DEAD: 10, CROP: 11, SUNKROAD: 12, STONEWALL: 13, CLIFF: 14, SNOWPINE: 15, STREET: 16 };
/* Old Town grid (2-tile roads). */
const ROADS_Y = [18, 28, 38, 48, 58], ROADS_X = [22, 34, 46, 58, 70, 82];
const BLOCKS_X = [[24, 33], [36, 45], [48, 57], [60, 69], [72, 81]], BLOCKS_Y = [[20, 27], [30, 37], [40, 47], [50, 57]];
const BLOCK_PLAN = {
  '0,0': 'radiotower', '1,0': 'hospital', '2,0': 'street', '3,0': 'police', '4,0': 'park',
  '0,1': 'apartments', '1,1': 'supermarket', '2,1': 'shelter', '3,1': 'apartments', '4,1': 'street',
  '0,2': 'park', '1,2': 'gas', '2,2': 'street', '3,2': 'electronics', '4,2': 'factory',
  '0,3': 'depot', '1,3': 'street', '2,3': 'supermarket', '3,3': 'tollcamp', '4,3': 'gas',
};
const RIVER_X = [85, 86, 87];
const BIOMES = ['oldtown', 'docks', 'suburbs', 'forest', 'farm', 'flooded', 'pass'];
/* LOCS type used for encounters / danger outside the Old Town blocks */
const BIOME_LOC = { oldtown: 'street', docks: 'docks', suburbs: 'suburbs', forest: 'forest', farm: 'farm', flooded: 'flooded', pass: 'pass' };
/* biome -> gate id that must be open before it can be entered (flag G.flags['open_' + id]) */
const GATE_OF = { forest: 'forest', docks: 'docks', pass: 'pass' };
function biomeOf(x, y) {
  if (x >= 88) return 'docks';
  if (x >= 85) return y < 18 ? 'pass' : y >= 60 ? 'flooded' : 'oldtown';
  if (y < 18) return x >= 44 ? 'pass' : 'forest';
  if (x < 22) return y < 28 ? 'forest' : 'suburbs';
  if (y >= 60) return x >= 62 ? 'flooded' : 'farm';
  return 'oldtown';
}
/* WORLD = {tiles, biome, flora, pois:{"x,y":{x,y,type,label,outdoor?}}, roofs:[{x,y,w,h,type,poi,closed?}] (building footprints incl. walls),
   containers:[{id,x,y,kind,loc,poi}], decos:[{x,y,w,h,kind,...}], fires:[{x,y,kind}], gates:{id:{kind,x0,y0,x1,y1,tiles:[[x,y,under]]}},
   shelterRect, bunker:{x,y,w,h}, hatch:{x,y}, bus:{x,y}, gate:{x,y} (Tollmen camp gate), camp:{x0,y0,x1,y1}} */
let WORLD = null;

function seeded(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function genWorld(seed) {
  const R = seeded(seed), ri = (a, b) => Math.floor(R() * (b - a + 1)) + a;
  const N = W * H, tiles = new Uint8Array(N).fill(T_GRASS), biome = new Uint8Array(N), flora = new Uint8Array(N);
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const set = (x, y, t) => { if (inb(x, y)) tiles[y * W + x] = t; };
  const get = (x, y) => inb(x, y) ? tiles[y * W + x] : T_WALL;
  const fl = (x, y, v) => { if (inb(x, y)) flora[y * W + x] = v; };
  const bio = (x, y) => inb(x, y) ? BIOMES[biome[y * W + x]] : null;
  const fill = (x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, t); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) biome[y * W + x] = BIOMES.indexOf(biomeOf(x, y));
  const pois = {}, roofs = [], containers = [], decos = [], fires = [], gates = {}, noPath = new Set(), keep = new Uint8Array(N), parks = [];
  let cid = 0, shelterRect = null, bunker = null, hatch = null, bus = null, gate = null, camp = null;
  const addPoi = (x, y, type, label, outdoor, np) => { const k = x + ',' + y; pois[k] = { x, y, type, label: label || LOCS[type].n }; if (outdoor) pois[k].outdoor = true; else set(x, y, T_DOOR); if (np) noPath.add(k); return k; };
  const addCont = (x, y, kind, loc, poi) => { set(x, y, T_PROP); containers.push({ id: 'c' + (cid++), x, y, kind, loc, poi }); };
  const addDeco = (x, y, w, h, kind, o) => {
    const d = Object.assign({ x, y, w, h, kind }, o || {});
    if (d.legs) for (const [a, b] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) set(a, b, T_DECO); else fill(x, y, x + w - 1, y + h - 1, T_DECO);
    decos.push(d); return d;
  };
  const isFree = (x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y) !== (t == null ? T_GRASS : t) || keep[y * W + x]) return false; return true; };
  const reserve = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inb(x, y)) keep[y * W + x] = 1; };
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
      while (q.length) { const [x, y] = q.pop(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + a, ny = y + b, k = nx + ',' + ny; if (!seen.has(k) && (get(nx, ny) === T_FLOOR || get(nx, ny) === T_SHALLOW)) { seen.add(k); q.push([nx, ny]); } } }
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
    reserve(x0, y0, x1, y1);
    return key;
  };
  /* closed outbuilding (no interior): garages */
  const addShed = (x0, y0, x1, y1, type) => { fill(x0, y0, x1, y1, T_ROOF); roofs.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, type, closed: true }); reserve(x0, y0, x1, y1); };
  /* a wiggly 4-connected trail */
  const trail = (ax, ay, bx, by, t) => {
    let x = ax, y = ay, n = 0; set(x, y, t); keep[y * W + x] = 1;
    while ((x !== bx || y !== by) && n++ < 500) {
      const dx = bx - x, dy = by - y;
      if (dx && (!dy || R() < Math.abs(dx) / (Math.abs(dx) + Math.abs(dy)))) x += Math.sign(dx); else y += Math.sign(dy);
      if (get(x, y) === T_GRASS || get(x, y) === T_SHALLOW) set(x, y, t); keep[y * W + x] = 1;
    }
  };
  const clearing = (cx, cy, r) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (inb(x, y) && (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1) keep[y * W + x] = 1; };
  /* a free grass neighbour of (x,y) (for stashes beside outdoor POIs) */
  const sideTile = (x, y) => [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]].map(([a, b]) => [x + a, y + b]).find(([a, b]) => get(a, b) === T_GRASS);
  /* ---- city park: crossing paths, tree clumps round them, a pond in the low corner, hedges on the edge ---- */
  const park = (x0, y0, x1, y1) => {
    parks.push({ x0, y0, x1, y1 });
    const cx = x0 + ((x1 - x0) >> 1), cy = y0 + ((y1 - y0) >> 1);
    for (let x = x0; x <= x1; x++) set(x, cy, T_PATH);
    for (let y = y0; y <= y1; y++) set(cx, y, T_PATH);
    const quads = [[x0, y0, cx - 1, cy - 1], [cx + 1, y0, x1, cy - 1], [x0, cy + 1, cx - 1, y1], [cx + 1, cy + 1, x1, y1]], pq = ri(0, 3);
    quads.forEach(([a0, b0, a1, b1], i) => {
      if (i === pq) {
        const pw = Math.max(1, Math.min(3, a1 - a0 - 1)), ph = Math.max(1, Math.min(2, b1 - b0 - 1)), px = a0 + 1, py = b0 + 1;
        fill(px, py, px + pw - 1, py + ph - 1, T_WATER);
        for (let y = py - 1; y <= py + ph; y++) for (let x = px - 1; x <= px + pw; x++) if (get(x, y) === T_GRASS && R() < 0.7) fl(x, y, FLORA.REED);
      } else {
        const mx = (a0 + a1) / 2 + (R() - 0.5), my = (b0 + b1) / 2 + (R() - 0.5);
        for (let y = b0; y <= b1; y++) for (let x = a0; x <= a1; x++) {
          if (get(x, y) !== T_GRASS) continue;
          const d = Math.hypot(x - mx, y - my);
          if (d < 1.3 && R() < 0.85) { set(x, y, T_TREE); fl(x, y, R() < 0.3 ? FLORA.BIRCH : FLORA.OLD); }
          else if (d < 2.4 && R() < 0.35) set(x, y, T_BUSH);
          else if (R() < 0.2) fl(x, y, FLORA.FLOWERS);
        }
      }
    });
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x === x0 || x === x1 || y === y0 || y === y1) && get(x, y) === T_GRASS && R() < 0.5) { set(x, y, T_BUSH); fl(x, y, FLORA.HEDGE); }
    reserve(x0, y0, x1, y1);
  };
  /* a collapsed house: broken brick walls, the front fallen in, rubble floor with saplings pushing through */
  const ruin = (a0, b0, a1, b1) => {
    for (let y = b0; y <= b1; y++) for (let x = a0; x <= a1; x++) {
      const edge = x === a0 || x === a1 || y === b0 || y === b1, corner = (x === a0 || x === a1) && (y === b0 || y === b1);
      if (!edge) { set(x, y, T_RUBBLE); if (R() < 0.6) fl(x, y, FLORA.SAPLING); continue; }
      if (corner || (y !== b1 && R() < 0.72)) set(x, y, T_WALL); else { set(x, y, T_RUBBLE); if (R() < 0.3) fl(x, y, FLORA.SAPLING); }
    }
    if (R() < 0.55) { const x = ri(a0 + 1, a1 - 1), y = b0 + 1; set(x, y, T_TREE); fl(x, y, FLORA.YOUNG); }
  };
  /* a field with a hedgerow round it; gaps in the middle of each side let the tracks in */
  const field = (x0, y0, x1, y1) => {
    const mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (get(x, y) !== T_GRASS) continue;
      const edge = x === x0 || x === x1 || y === y0 || y === y1, gap = Math.abs(x - mx) <= 1 && (y === y0 || y === y1) || Math.abs(y - my) <= 0 && (x === x0 || x === x1);
      if (edge) { if (!gap && R() < 0.88) { set(x, y, T_BUSH); fl(x, y, FLORA.HEDGE); } }
      else { set(x, y, T_FIELD); if (R() < 0.6) fl(x, y, FLORA.CROP); }
    }
    reserve(x0, y0, x1, y1);
  };
  /* stacked shipping containers (3x1) in rows with aisles */
  const containerYard = (x0, y0, x1, y1, loc, key, ground) => {
    for (let y = y0 + 1; y <= y1 - 1; y += 2) for (let x = x0 + 1; x + 2 <= x1 - 1; x += 4) {
      if (R() < 0.82 && isFree(x, y, x + 2, y, ground)) addDeco(x, y, 3, 1, 'container', { stack: ri(1, 3), c: ri(0, 5) });
      else if (R() < 0.5 && get(x + 1, y) === (ground == null ? T_GRASS : ground)) addCont(x + 1, y, 'crate', loc, key);
    }
  };
  const R2 = (x0, y0, x1, y1, t) => fill(x0, y0, x1, y1, t == null ? T_ROAD : t);

  /* ================= roads ================= */
  R2(24, 72, 61, 73, T_PATH);                                   // field track
  for (const y of ROADS_Y) R2(22, y, 84, y + 1);
  for (const x of ROADS_X) R2(x, 18, x + 1, 59);
  R2(22, 60, 23, 83); R2(34, 60, 35, 83); R2(46, 60, 47, 71, T_PATH); R2(46, 74, 47, 83, T_PATH);
  R2(70, 60, 71, 83); R2(82, 60, 83, 83);                       // into the Flooded Quarter (flooded below)
  for (const y of [28, 38, 48, 58, 68, 78]) R2(0, y, 23, y + 1);  // Elm Row
  R2(10, 28, 11, 83);
  R2(88, 0, 89, 83); R2(100, 0, 101, 59);                       // docks quay + yard road
  for (const y of [10, 28, 38, 48, 58]) R2(88, y, 111, y + 1);
  R2(58, 10, 59, 17); R2(58, 10, 75, 11); R2(74, 0, 75, 11);    // the pass road, up to the top edge (Haven)
  R2(34, 4, 35, 17, T_PATH);                                    // the forest road
  for (let y = 0; y < H; y++) for (const x of RIVER_X) set(x, y, (y === 38 || y === 39) ? T_BRIDGE : T_WATER);

  /* ================= Old Town ================= */
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
      reserve(x0, y0, x1, y1);
    } else if (type === 'park') park(x0, y0, x1, y1);
    else if (type === 'tollcamp') {
      for (let x = x0 + 1; x <= x1 - 1; x++) { set(x, y0 + 1, T_WALL); set(x, y1 - 1, T_WALL); }
      for (let y = y0 + 1; y <= y1 - 1; y++) { set(x0 + 1, y, T_WALL); set(x1 - 1, y, T_WALL); }
      for (let y = y0 + 2; y <= y1 - 2; y++) for (let x = x0 + 2; x <= x1 - 2; x++) set(x, y, T_YARD);
      for (let y = y0 + 2; y <= y0 + 4; y++) for (let x = x0 + 3; x <= x1 - 3; x++) set(x, y, T_ROOF);
      roofs.push({ x: x0 + 3, y: y0 + 2, w: bw - 6, h: 3, type: 'tollcamp', closed: true });
      gate = { x: x0 + Math.floor(bw / 2), y: y1 - 1 };
      camp = { x0, y0, x1, y1 };
      addPoi(gate.x, gate.y, 'tollcamp');
      reserve(x0, y0, x1, y1);
    } else if (type === 'street') {
      scatter(8, T_RUBBLE);
      addBuilding(x0 + 1, y0 + 1, x0 + 5, y0 + 4, 'street', 'Wrecked Shop', 3);
      ruin(x0 + 6, y0 + 1, x1, y0 + 4);
      const rx = x0 + ri(2, bw - 3), ry = y1 - 1;
      const key = addPoi(rx, ry + 1, 'street', 'Rubble Pile', true);
      addCont(rx, ry, 'rubble', 'street', key);
      if ([T_GRASS, T_RUBBLE].includes(get(rx + 2, ry - 1))) addCont(rx + 2, ry - 1, 'rubble', 'street', key);
      for (let i = 0; i < 3; i++) { const x = ri(x0 + 6, x1), y = y0 + 5; if ([T_GRASS, T_RUBBLE].includes(get(x, y)) && [T_GRASS, T_RUBBLE].includes(get(x, y + 1)) && get(x - 1, y) !== T_PROP && get(x + 1, y) !== T_PROP) addCont(x, y, 'crate', 'street', key); }
    } else {
      const mx = type === 'radiotower' ? 3 : 1;
      const n = (LOCS[type].searches || 4) + 1;
      addBuilding(x0 + mx, y0 + 1, x1 - mx, y1 - 1, type, null, n);
      if (type === 'depot') bus = { x: x1 - 2, y: y1 };
      scatter(3, T_RUBBLE);
    }
  }
  /* weeds and saplings take the rubble */
  for (let y = 18; y < 60; y++) for (let x = 22; x < 85; x++) if (get(x, y) === T_RUBBLE && !flora[y * W + x] && R() < 0.3) fl(x, y, FLORA.SAPLING);

  /* ================= Elm Row (suburbs) ================= */
  const SUB_X = [[0, 9], [12, 21]], SUB_Y = [[30, 37], [40, 47], [50, 57], [60, 67], [70, 77]];
  const HOUSE_NAMES = ['Blue House', 'Corner House', 'The Hendersons\'', 'Yellow House', 'No. 14', 'No. 22', 'Brick House', 'The Okoyes\'', 'Grey House', 'No. 9'];
  const parkAt = ri(0, SUB_Y.length - 1) * 2 + ri(0, 1);
  SUB_Y.forEach(([y0, y1], j) => SUB_X.forEach(([x0, x1], i) => {
    if (j * 2 + i === parkAt) { park(x0, y0, x1, y1); return; }
    /* house with a fenced front yard, detached garage on the side */
    const key = addBuilding(x0 + 1, y0 + 1, x0 + 6, y0 + 5, 'house', HOUSE_NAMES[(j * 2 + i) % HOUSE_NAMES.length], 3), dx = x0 + 3;
    addShed(x0 + 7, y0 + 2, x1, y0 + 5, 'garage');
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      if (!edge || get(x, y) !== T_GRASS) continue;
      if (y === y1 && (x === dx || x === x0 + 8)) continue;          // front gate + driveway
      set(x, y, T_FENCE);
    }
    addCont(x0 + 8, y0 + 6, 'toolbox', 'garage', key);
    if (R() < 0.6) { set(x0 + 1, y0 + 6, T_TREE); fl(x0 + 1, y0 + 6, R() < 0.5 ? FLORA.BIRCH : FLORA.YOUNG); }
    if (R() < 0.7) for (const x of [x0 + 5, x0 + 6]) if (get(x, y0 + 6) === T_GRASS) { set(x, y0 + 6, T_BUSH); fl(x, y0 + 6, FLORA.HEDGE); }
    if (R() < 0.4) fl(x0 + 2, y0 + 6, FLORA.FLOWERS);
  }));
  /* allotments at the bottom of Elm Row */
  for (const [x0, x1] of SUB_X) {
    for (let x = x0; x <= x1; x++) if (get(x, 83) === T_GRASS) { set(x, 83, T_BUSH); fl(x, 83, FLORA.HEDGE); }
    for (let x = x0 + 1; x + 2 <= x1 - 1; x += 4) for (let y = 80; y <= 81; y++) for (let k = 0; k < 3; k++) { set(x + k, y, T_FIELD); fl(x + k, y, FLORA.CROP); }
  }

  /* ================= Farmland ================= */
  field(24, 60, 33, 71); field(36, 60, 45, 71); field(24, 74, 33, 83); field(36, 74, 45, 83); field(48, 74, 61, 83);
  fill(48, 60, 61, 71, T_YARD);
  addBuilding(53, 61, 60, 66, 'farm', 'Teodor\'s Farm', 4);
  addBuilding(48, 62, 52, 66, 'house', 'Farmhouse', 2);
  addDeco(57, 68, 2, 2, 'silo'); addDeco(59, 68, 2, 2, 'silo');
  for (const [x, y] of [[49, 68], [49, 69], [52, 70], [54, 68]]) if (get(x, y) === T_YARD) addDeco(x, y, 1, 1, 'hay');
  reserve(48, 60, 61, 71);

  /* ================= Flooded Quarter ================= */
  for (let y = 60; y < H; y++) for (let x = 62; x <= 84; x++) { const t = get(x, y); if (t === T_GRASS || t === T_ROAD) { if (t === T_ROAD) fl(x, y, FLORA.SUNKROAD); set(x, y, T_SHALLOW); } }
  for (const [a, b, c, d] of [[63, 61, 68, 65], [73, 61, 80, 65], [63, 72, 68, 76], [73, 72, 79, 76]]) addBuilding(a, b, c, d, 'flooded', 'Sunken House', 3);
  for (let x = 62; x <= 84; x++) if (get(x, 68) === T_SHALLOW) set(x, 68, T_PLANK);             // stilt walkway
  for (let y = 66; y <= 80; y++) if (get(66, y) === T_SHALLOW) set(66, y, T_PLANK);
  for (let y = 77; y <= 83; y++) if (get(76, y) === T_SHALLOW) set(76, y, T_PLANK);
  for (const [x, y] of [[64, 80], [79, 80], [72, 66]]) if (isFree(x, y, x + 1, y + 1, T_SHALLOW)) fill(x, y, x + 1, y + 1, T_WATER);
  addDeco(70, 79, 2, 1, 'boat');
  for (let y = 60; y < H; y++) for (let x = 62; x <= 84; x++) if (get(x, y) === T_SHALLOW && !flora[y * W + x]) {
    const nearDry = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => get(x + a, y + b) === T_WALL);
    if (R() < (nearDry ? 0.35 : 0.05)) fl(x, y, FLORA.REED); else if (R() < 0.02) { set(x, y, T_TREE); fl(x, y, FLORA.DEAD); }
  }

  /* ================= Docks ================= */
  {
    const yardKey = addPoi(95, 27, 'docks', 'Container Yard', true);
    addDeco(91, 13, 4, 6, 'crane', { legs: true });
    containerYard(90, 12, 99, 26, 'docks', yardKey);
    addBuilding(103, 13, 110, 25, 'warehouse', 'Flooded Warehouse', 5);
    for (let y = 14; y <= 18; y++) for (let x = 104; x <= 109; x++) if (get(x, y) === T_FLOOR) set(x, y, T_SHALLOW);
    addBuilding(91, 31, 98, 36, 'docks', 'Harbour Office', 4);
    containerYard(102, 30, 111, 37, 'docks', yardKey);
    addBuilding(91, 41, 98, 46, 'warehouse', 'Cold Store', 4);
    const fuelKey = addPoi(106, 47, 'docks', 'Fuel Jetty', true);
    addDeco(103, 41, 3, 3, 'tank'); addDeco(107, 41, 3, 3, 'tank');
    addCont(110, 46, 'crate', 'docks', fuelKey);
    addBuilding(91, 51, 97, 56, 'docks', 'Net Loft', 3);
    addDeco(103, 51, 4, 6, 'crane', { legs: true });
    containerYard(102, 50, 111, 57, 'docks', fuelKey);
    containerYard(90, 0, 99, 9, 'docks', yardKey);
    addDeco(103, 2, 3, 3, 'tank'); addDeco(107, 5, 3, 3, 'tank');
    /* harbour: apron, basin, piers, moored boats */
    fill(90, 60, 99, 83, T_YARD);
    fill(102, 60, 111, 83, T_WATER);
    for (const y of [66, 67]) for (let x = 100; x <= 109; x++) set(x, y, T_PLANK);
    for (const y of [76, 77]) for (let x = 100; x <= 109; x++) set(x, y, T_PLANK);
    const pier = addPoi(108, 67, 'docks', 'Pier 3', true, true); addCont(109, 66, 'nets', 'docks', pier);
    addDeco(104, 70, 3, 1, 'boat'); addDeco(103, 80, 4, 1, 'boat'); addDeco(106, 63, 2, 1, 'boat');
    addDeco(93, 76, 4, 6, 'crane', { legs: true });
    containerYard(90, 61, 99, 74, 'docks', pier, T_YARD);
    reserve(88, 0, 111, 83);
  }

  /* ================= Kessler Woods (forest + hills) ================= */
  const forestT = (x, y) => bio(x, y) === 'forest';
  addBuilding(8, 4, 15, 9, 'ranger', 'Ranger Station', 4); clearing(11, 7, 6);
  trail(11, 10, 33, 12, T_PATH);
  trail(11, 11, 6, 23, T_PATH); clearing(6, 23, 2);
  const hs = addPoi(6, 23, 'forest', 'Hunting Stand', true, true);
  { const s = sideTile(6, 23) || [7, 22]; addCont(s[0], s[1], 'stash', 'forest', hs); }
  if (get(7, 24) === T_GRASS) addDeco(7, 24, 1, 1, 'stand');
  trail(35, 6, 40, 5, T_PATH); clearing(40, 5, 2);
  const oc = addPoi(40, 5, 'forest', 'Old Campsite', true, true);
  { const s = sideTile(40, 5) || [41, 4]; addCont(s[0], s[1], 'stash', 'forest', oc); }
  fires.push({ x: 39.5, y: 6.5, kind: 'camp' }, { x: 13.5, y: 11.5, kind: 'camp' });
  if (isFree(23, 6, 25, 7)) { fill(23, 6, 25, 7, T_WATER); for (let y = 5; y <= 8; y++) for (let x = 22; x <= 26; x++) if (get(x, y) === T_GRASS && R() < 0.6) fl(x, y, FLORA.REED); clearing(24, 6, 2); }
  /* distance from anything open (trails, clearings, the forest edge): the woods thicken from saplings to old trees */
  {
    const D = new Uint8Array(N).fill(255), q = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!forestT(x, y)) continue;
      const open = get(x, y) !== T_GRASS || keep[y * W + x] || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inb(x + a, y + b) && !forestT(x + a, y + b));
      if (open) { D[y * W + x] = 0; q.push(y * W + x); }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + a, ny = y + b, j = ny * W + nx; if (inb(nx, ny) && forestT(nx, ny) && D[j] > D[i] + 1) { D[j] = D[i] + 1; q.push(j); } }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!forestT(x, y) || get(x, y) !== T_GRASS || keep[y * W + x]) continue;
      const d = D[y * W + x], r = R(), hill = y < 9 || x < 5;
      if (d <= 1) { if (r < 0.22) set(x, y, T_BUSH); else if (r < 0.5) fl(x, y, FLORA.FERN); else if (r < 0.6) fl(x, y, FLORA.FLOWERS); }
      else if (d === 2) { if (r < 0.22) { set(x, y, T_TREE); fl(x, y, FLORA.YOUNG); } else if (r < 0.55) fl(x, y, FLORA.SAPLING); else if (r < 0.7) fl(x, y, FLORA.FERN); }
      else if (d === 3) { if (r < 0.42) { set(x, y, T_TREE); fl(x, y, R() < 0.5 ? FLORA.YOUNG : FLORA.OLD); } else if (r < 0.6) fl(x, y, FLORA.FERN); else if (r < 0.66) set(x, y, T_BUSH); }
      else {
        if (hill && r < 0.07) { set(x, y, T_ROCK); for (const [a, b] of [[1, 0], [0, 1]]) if (R() < 0.5 && get(x + a, y + b) === T_GRASS && !keep[(y + b) * W + x + a]) set(x + a, y + b, T_ROCK); }
        else if (r < 0.6) { set(x, y, T_TREE); fl(x, y, vnoiseCell(x, y, seed) > 0.72 ? FLORA.BIRCH : FLORA.OLD); }
        else if (r < 0.63 && get(x + 1, y) === T_GRASS && !keep[y * W + x + 1]) addDeco(x, y, 2, 1, 'log');
        else if (r < 0.8) fl(x, y, FLORA.FERN);
      }
    }
  }

  /* ================= Northern Pass ================= */
  addBuilding(61, 2, 70, 8, 'military', null, LOCS.military.searches + 1);
  addBuilding(47, 3, 53, 7, 'pass', 'Avalanche Hut', 3);
  trail(50, 8, 57, 10, T_PATH);
  const cv = addPoi(66, 12, 'pass', 'Wrecked Convoy', true, true);
  { const s = [67, 12]; if (get(s[0], s[1]) === T_GRASS) addCont(s[0], s[1], 'crate', 'pass', cv); }
  reserve(64, 12, 69, 13);
  for (const x of [61, 64, 69, 72]) { const y = R() < 0.5 ? 10 : 11; if (get(x, y) === T_ROAD) { set(x, y, T_CAR); if (R() < 0.6) containers.push({ id: 'c' + (cid++), x, y, kind: 'trunk', loc: 'pass', poi: cv }); } }
  {
    const nearOpen = (x, y, r) => { for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { const t = get(x + a, y + b); if (t === T_ROAD || t === T_PATH || t === T_WALL || t === T_DOOR || t === T_CAR || keep[(y + b) * W + x + a] && inb(x + a, y + b)) return true; } return false; };
    for (let y = 0; y < 17; y++) for (let x = 44; x <= 84; x++) {
      if (get(x, y) !== T_GRASS || keep[y * W + x]) continue;
      if (nearOpen(x, y, 1)) { if (R() < 0.08) { set(x, y, T_ROCK); fl(x, y, FLORA.CLIFF); } continue; }
      const r = R();
      if (r < 0.3) { set(x, y, T_ROCK); fl(x, y, FLORA.CLIFF); } else if (r < 0.44) { set(x, y, T_TREE); fl(x, y, FLORA.SNOWPINE); }
    }
  }

  /* ================= the river banks ================= */
  for (const [y, label] of [[24, 'Fishing Pier'], [44, 'River Dock'], [74, 'Ferry Landing']]) { set(84, y, y >= 60 ? T_PLANK : T_GRASS); const key = addPoi(84, y, 'river', label, true); addCont(84, y - 1, 'nets', 'river', key); }
  for (let y = 18; y < H; y++) {
    const t = get(84, y), pierNear = [24, 44, 74].some(p => Math.abs(p - y) <= 2) || ROADS_Y.some(r => y >= r - 1 && y <= r + 2);
    if (t === T_GRASS && !pierNear && y % 5 === 2 && R() < 0.85) { set(84, y, T_TREE); fl(84, y, FLORA.WILLOW); }
    else if ((t === T_GRASS || t === T_SHALLOW) && !flora[y * W + 84] && R() < 0.65) fl(84, y, FLORA.REED);
  }

  /* ================= boulevard trees: planted every 4 tiles on the kerbs of the main avenue (y 38) and Market Street (x 46) ================= */
  {
    const plant = (x, y) => {
      if (get(x, y) !== T_GRASS || keep[y * W + x] || bio(x, y) !== 'oldtown') return;
      for (const [a, b] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0, 2], [0, -2]]) { const t = get(x + a, y + b); if (t === T_DOOR || t === T_PROP) return; }
      if (Object.values(pois).some(p => p.x === x && Math.abs(p.y - y) <= 3)) return;
      set(x, y, T_TREE); fl(x, y, FLORA.STREET);
    };
    for (let x = 24; x <= 81; x += 4) { plant(x, 37); plant(x + 2, 40); }
    for (let y = 20; y <= 57; y += 4) { plant(45, y); plant(48, y + 2); }
  }

  /* ================= cars ================= */
  const nearGate = (x, y) => Math.abs(x - 34.5) + Math.abs(y - 16.5) < 4 || Math.abs(x - 58.5) + Math.abs(y - 16.5) < 4 || Math.abs(x - 86) + Math.abs(y - 38.5) < 6;
  for (let i = 0; i < 150; i++) {
    const x = ri(0, W - 1), y = ri(0, H - 1), b = bio(x, y);
    if (get(x, y) !== T_ROAD || b === 'pass' || b === 'forest' || nearGate(x, y) || (x >= 44 && x <= 62 && y >= 26 && y <= 42)) continue;
    let crowd = false; for (let oy = -1; oy <= 1 && !crowd; oy++) for (let ox = -1; ox <= 1; ox++) if (get(x + ox, y + oy) === T_CAR) { crowd = true; break; }
    if (crowd) continue;
    set(x, y, T_CAR);
    if (R() < 0.45) containers.push({ id: 'c' + (cid++), x, y, kind: 'trunk', loc: b === 'docks' ? 'docks' : b === 'suburbs' ? 'suburbs' : 'street', poi: null });
  }
  const clearCar = (x, y) => { if (get(x, y) === T_CAR) { set(x, y, T_ROAD); const ci = containers.findIndex(c => c.x === x && c.y === y); if (ci >= 0) containers.splice(ci, 1); } };
  for (const k in pois) { const p = pois[k]; for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) clearCar(p.x + dx, p.y + dy); }
  /* a clear path from every south-facing door (and outdoor POI) down to the next road, never across a district border */
  const walkway = t => t === T_ROAD || t === T_BRIDGE || t === T_PATH || t === T_PLANK || t === T_SHALLOW || t === T_YARD;
  for (const k in pois) {
    const p = pois[k]; if (p.type === 'shelter' || noPath.has(k)) continue;
    const pb = bio(p.x, p.y);
    for (let y = p.y + 1; y < H; y++) { const t = get(p.x, y); if (walkway(t) || bio(p.x, y) !== pb) break; if (t === T_CAR) clearCar(p.x, y); else if (SOLID.has(t)) { set(p.x, y, T_GRASS); fl(p.x, y, 0); } }
  }
  if (bus) for (let x = bus.x - 1; x <= bus.x + 1; x++) { clearCar(x, bus.y); clearCar(x, bus.y + 1); }

  /* ================= story gates + the seals round the gated districts ================= */
  const addGate = (id, kind, x0, y0, x1, y1) => { const g = gates[id] = { id, kind, x0, y0, x1, y1, tiles: [] }; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { g.tiles.push([x, y, get(x, y)]); set(x, y, T_GATE); fl(x, y, 0); } };
  addGate('forest', 'rubble', 34, 16, 35, 17);
  addGate('pass', 'toll', 58, 16, 59, 17);
  addGate('docks', 'bridge', 85, 38, 87, 39);
  const seal = (x0, y0, x1, y1, f) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y) !== T_GATE) { if (get(x, y) === T_PROP) continue; set(x, y, T_ROCK); fl(x, y, f); } };
  seal(22, 17, 43, 17, FLORA.STONEWALL); seal(21, 17, 21, 27, FLORA.STONEWALL); seal(0, 27, 20, 27, FLORA.STONEWALL);
  seal(43, 0, 43, 16, FLORA.CLIFF); seal(44, 17, 84, 17, FLORA.CLIFF);

  /* ================= fires: barrels where people warmed their hands, camp fires in the woods ================= */
  {
    const spots = [];
    for (let by = 0; by < 4; by++) for (let bx = 0; bx < 5; bx++) {
      if (!['street', 'depot', 'factory', 'gas'].includes(BLOCK_PLAN[bx + ',' + by])) continue;
      const [x0, x1] = BLOCKS_X[bx], [y0, y1] = BLOCKS_Y[by];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y) === T_GRASS && get(x, y + 1) === T_ROAD) spots.push([x, y]);
    }
    for (let i = 0; i < 5 && spots.length; i++) { const [x, y] = spots.splice(Math.floor(R() * spots.length), 1)[0]; fires.push({ x: x + 0.5, y: y + 0.35, kind: 'barrel' }); }
    const more = (x0, y0, x1, y1, n, ok) => { const s = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (ok(get(x, y)) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => get(x + a, y + b) === T_ROAD)) s.push([x, y]); for (let i = 0; i < n && s.length; i++) { const [x, y] = s.splice(Math.floor(R() * s.length), 1)[0]; fires.push({ x: x + 0.5, y: y + 0.5, kind: 'barrel' }); } };
    more(90, 0, 111, 59, 2, t => t === T_GRASS || t === T_YARD);
    more(60, 12, 72, 13, 1, t => t === T_GRASS);
    more(48, 60, 61, 71, 1, t => t === T_YARD);
  }

  const w = { tiles, biome, flora, pois, roofs, containers, decos, fires, gates, shelterRect, bunker, hatch, bus, gate, camp };
  Object.assign(w, placeProps(seed, w, parks));
  return w;
}
/* Interaction props: notes on walls by story places, bodies in streets and buildings, hand pumps in parks and farms, beds and couches in homes.
   Placed after everything else from their own random stream, so the layout, container ids and old saves never shift.
   notes [{x,y,fx,fy,place?,i}] (fx,fy points at the wall), bodies [{x,y,in,r}], pumps [{x,y,under}] (tile becomes T_DECO), beds [{x,y,kind,fx,fy}] (walkable). */
const NOTE_PLACES = { depot: 'depot', radiotower: 'radiotower', hospital: 'hospital', police: 'police', ranger: 'ranger', military: 'military' };
function placeProps(seed, w, parks) {
  const P = seeded((seed ^ 0x9e0b1e5) >>> 0), tl = w.tiles;
  const get = (x, y) => x >= 0 && y >= 0 && x < W && y < H ? tl[y * W + x] : T_WALL, bio = (x, y) => BIOMES[w.biome[y * W + x]];
  const N4 = [[0, 1], [1, 0], [-1, 0], [0, -1]], used = new Set(), K = (x, y) => x + ',' + y;
  const pickOut = a => a.splice(Math.floor(P() * a.length), 1)[0];
  const near = (x, y, r, f) => { for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) if (f(get(x + a, y + b), x + a, y + b)) return true; return false; };
  const walk = t => !SOLID.has(t) && t !== T_DOOR && t !== T_BRIDGE;
  const doorNear = (x, y, r) => near(x, y, r, t => t === T_DOOR);
  const contNear = (x, y) => near(x, y, 1, t => t === T_PROP || t === T_CAR);
  const notes = [], bodies = [], pumps = [], beds = [];
  /* ---- notes: one on an outside wall of each story place (two at the bunker), plus a few on Old Town walls ---- */
  const wallSpots = (x0, y0, x1, y1) => {
    const out = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (get(x, y) !== T_WALL) continue;
      for (const [a, b] of N4) {
        const ox = x + a, oy = y + b; if (ox >= x0 && ox <= x1 && oy >= y0 && oy <= y1) continue;
        const t = get(ox, oy);
        if (!walk(t) || t === T_SHALLOW || doorNear(ox, oy, 1) || used.has(K(ox, oy))) continue;
        out.push({ x: ox, y: oy, fx: -a, fy: -b, south: b === 1 });
      }
    }
    const s = out.filter(o => o.south); return s.length ? s : out;
  };
  const addNote = (spots, place) => { if (!spots.length) return; const o = pickOut(spots); used.add(K(o.x, o.y)); notes.push({ x: o.x, y: o.y, fx: o.fx, fy: o.fy, place, i: Math.floor(P() * 8) }); };
  const rectOf = r => [r.x, r.y, r.x + r.w - 1, r.y + r.h - 1];
  if (w.bunker) { const b = w.bunker; for (let i = 0; i < 2; i++) addNote(wallSpots(b.x, b.y, b.x + b.w - 1, b.y + b.h - 1), 'shelter'); }
  const sunk = w.roofs.filter(r => r.type === 'flooded');
  for (const r of w.roofs) {
    if (r.closed) continue;
    const label = w.pois[r.poi] && w.pois[r.poi].label;
    const place = NOTE_PLACES[r.type] || (label === 'Harbour Office' ? 'harbour' : r === sunk[(seed >>> 3) % (sunk.length || 1)] ? 'flooded' : null);
    if (place) addNote(wallSpots(...rectOf(r)), place);
  }
  if (w.camp) { const c = w.camp; addNote(wallSpots(c.x0 + 1, c.y0 + 1, c.x1 - 1, c.y1 - 1), 'tollcamp'); }
  const town = w.roofs.filter(r => !r.closed && ['street', 'apartments', 'supermarket', 'gas', 'electronics', 'factory'].includes(r.type));
  for (let i = 0; i < 6 && town.length; i++) addNote(wallSpots(...rectOf(pickOut(town))), null);
  /* ---- bodies: on the roads among the wrecks (never by the bunker), and indoors where people holed up ---- */
  const sr = w.shelterRect, scx = sr ? (sr.x0 + sr.x1) / 2 : 0, scy = sr ? (sr.y0 + sr.y1) / 2 : 0;
  const spaced = (x, y, d) => bodies.every(b => Math.abs(b.x - x) + Math.abs(b.y - y) >= d);
  const road = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (get(x, y) !== T_ROAD || !['oldtown', 'suburbs', 'docks'].includes(bio(x, y))) continue;
    if (Math.hypot(x - scx, y - scy) < 11 || doorNear(x, y, 2) || !near(x, y, 2, t => t === T_CAR) || near(x, y, 1, (t, a, b) => w.pois[K(a, b)])) continue;
    road.push([x, y]);
  }
  for (let n = 0; n < 16 && road.length;) { const [x, y] = pickOut(road); if (!spaced(x, y, 7)) continue; used.add(K(x, y)); bodies.push({ x, y, in: false, r: Math.floor(P() * 4) }); n++; }
  for (const [x, y] of [[65, 13], [68, 13], [63, 11]]) if (walk(get(x, y)) && !used.has(K(x, y)) && P() < 0.7) { used.add(K(x, y)); bodies.push({ x, y, in: false, r: Math.floor(P() * 4) }); }
  const INDOOR = { apartments: 0.8, hospital: 1, police: 0.8, flooded: 0.6, military: 1, supermarket: 0.5, street: 0.5, house: 0.25, docks: 0.5, warehouse: 0.5 };
  for (const r of w.roofs) {
    if (r.closed || !(P() < (INDOOR[r.type] || 0))) continue;
    const c = [];
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) if ((get(x, y) === T_FLOOR || get(x, y) === T_SHALLOW) && !doorNear(x, y, 1) && !contNear(x, y) && !used.has(K(x, y))) c.push([x, y]);
    if (c.length) { const [x, y] = pickOut(c); used.add(K(x, y)); bodies.push({ x, y, in: true, r: Math.floor(P() * 4) }); }
  }
  /* ---- hand pumps: one in every park, two in Teodor's yard, one at the allotments, one at the old campsite ---- */
  const pumpOK = (x, y) => {
    if (![T_GRASS, T_YARD].includes(get(x, y)) || used.has(K(x, y)) || doorNear(x, y, 1) || near(x, y, 1, t => t === T_PROP || t === T_DECO || t === T_CAR)) return false;
    /* the walkable neighbours must stay joined round the pump (a 5x5 flood without its tile) */
    const nb = N4.map(([a, b]) => [x + a, y + b]).filter(([a, b]) => walk(get(a, b)));
    if (nb.length < 2) return false;
    const seen = new Set([K(nb[0][0], nb[0][1])]), q = [nb[0]];
    while (q.length) {
      const [a, b] = q.pop();
      for (const [da, db] of N4) { const na = a + da, nb2 = b + db, k = K(na, nb2); if (Math.abs(na - x) > 2 || Math.abs(nb2 - y) > 2 || (na === x && nb2 === y) || seen.has(k) || !walk(get(na, nb2))) continue; seen.add(k); q.push([na, nb2]); }
    }
    return nb.every(([a, b]) => seen.has(K(a, b)));
  };
  const addPump = cands => { while (cands.length) { const [x, y] = pickOut(cands); if (!pumpOK(x, y)) continue; used.add(K(x, y)); pumps.push({ x, y, under: get(x, y) }); tl[y * W + x] = T_DECO; return; } };
  const area = (x0, y0, x1, y1, ok) => { const c = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (ok(x, y)) c.push([x, y]); return c; };
  for (const p of parks) addPump(area(p.x0, p.y0, p.x1, p.y1, (x, y) => get(x, y) === T_GRASS && N4.some(([a, b]) => get(x + a, y + b) === T_PATH)));
  for (let i = 0; i < 2; i++) addPump(area(48, 67, 61, 71, (x, y) => get(x, y) === T_YARD && pumps.every(p => Math.abs(p.x - x) + Math.abs(p.y - y) >= 5)));
  addPump(area(0, 79, 21, 82, (x, y) => get(x, y) === T_GRASS && N4.some(([a, b]) => get(x + a, y + b) === T_FIELD)));
  addPump(area(37, 3, 43, 8, (x, y) => get(x, y) === T_GRASS && Math.hypot(x - 40, y - 5) < 3.2));
  /* ---- beds and couches against the walls of homes (walkable: you lie down on them) ---- */
  const HOME = { house: ['bed', 'couch'], apartments: ['bed', 'bed', 'couch'], flooded: ['bed'], ranger: ['bed', 'bed'], pass: ['bed'], military: ['cot', 'cot'] };
  for (const r of w.roofs) {
    const kinds = HOME[r.type]; if (r.closed || !kinds) continue;
    for (const kind of kinds) {
      if (kind === 'couch' && P() < 0.4) continue;
      const c = [];
      for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        if (get(x, y) !== T_FLOOR || used.has(K(x, y)) || doorNear(x, y, 1) || get(x, y + 1) === T_DOOR || get(x, y + 2) === T_DOOR) continue;
        if (get(x - 1, y) === T_WALL && get(x + 1, y) === T_WALL || get(x, y - 1) === T_WALL && get(x, y + 1) === T_WALL) continue;   // a gap in a partition
        const f = [[0, -1], [-1, 0], [1, 0]].find(([a, b]) => get(x + a, y + b) === T_WALL); if (f) c.push([x, y, f]);
      }
      if (!c.length) break;
      const [x, y, f] = pickOut(c); used.add(K(x, y)); beds.push({ x, y, kind, fx: f[0], fy: f[1] });
    }
  }
  return { notes, bodies, pumps, beds };
}
/* smooth per-cell noise for generation (birch groves, etc.) */
function vnoiseCell(x, y, seed) { const h = (a, b) => { let t = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + (seed | 0)) | 0; t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; }; const fx = x / 5, fy = y / 5, ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy; return h(ix, iy) * (1 - u) * (1 - v) + h(ix + 1, iy) * u * (1 - v) + h(ix, iy + 1) * (1 - u) * v + h(ix + 1, iy + 1) * u * v; }
function tileAt(x, y) { if (x < 0 || y < 0 || x >= W || y >= H) return T_WALL; return WORLD.tiles[y * W + x]; }
function solidAt(x, y) { return SOLID.has(tileAt(Math.floor(x), Math.floor(y))); }
function inShelter(x, y) { const r = WORLD.shelterRect; return x >= r.x0 && x <= r.x1 + 1 && y >= r.y0 && y <= r.y1 + 1; }
/* Biome id at a tile point ('oldtown' | 'docks' | 'suburbs' | 'forest' | 'farm' | 'flooded' | 'pass'). */
function biomeAt(x, y) { const fx = Math.floor(x), fy = Math.floor(y); if (!WORLD || !WORLD.biome || fx < 0 || fy < 0 || fx >= W || fy >= H) return biomeOf(clamp(fx, 0, W - 1), clamp(fy, 0, H - 1)); return BIOMES[WORLD.biome[fy * W + fx]]; }
/* LOCS type for encounters and ambient danger: the Old Town block type, else the biome's type. */
function districtAt(x, y) {
  const b = biomeAt(x, y);
  if (b !== 'oldtown') return BIOME_LOC[b] || 'street';
  let bx = BLOCKS_X.findIndex(([a, c]) => x >= a - 2 && x <= c + 1), by = BLOCKS_Y.findIndex(([a, c]) => y >= a - 2 && y <= c + 1);
  if (bx < 0) bx = clamp(Math.round((x - 28.5) / 12), 0, 4); if (by < 0) by = clamp(Math.round((y - 24) / 10), 0, 3);
  return BLOCK_PLAN[bx + ',' + by] || 'street';
}
/* The stamina you can get back while cold: 60% of max in the snow, 40% in the storm (coldK 1 / 1.5); all of it when warm. */
function coldCap(k) { return G.p.maxSta * (1 - 0.4 * Math.min(1.5, k || 0)); }
/* Is a biome (or the biome under a POI) open to walk into? Gated ones need G.flags['open_' + gate]. */
function districtOpen(b) { const g = GATE_OF[b]; return !g || !!(G && G.flags && G.flags['open_' + g]); }
function poiOpen(p) { return districtOpen(biomeAt(p.x + 0.5, p.y + 0.5)); }
/* Index into WORLD.roofs of the building whose footprint contains (x,y), or -1. */
function buildingAt(x, y) { const fx = Math.floor(x), fy = Math.floor(y); return WORLD.roofs.findIndex(r => fx >= r.x && fx < r.x + r.w && fy >= r.y && fy < r.y + r.h); }
function indoors(x, y) { const t = tileAt(Math.floor(x), Math.floor(y)); return t === T_FLOOR || (t === T_DOOR || t === T_SHALLOW) && buildingAt(x, y) >= 0; }
function poiNear(x, y, r) { let best = null, bd = r * r; for (const k in WORLD.pois) { const p = WORLD.pois[k], d = (p.x + 0.5 - x) ** 2 + (p.y + 0.5 - y) ** 2; if (d <= bd) { bd = d; best = Object.assign({ key: k }, p); } } return best; }
/* Nearest POI of a type. Prefers ones you can walk to now (open districts); falls back to any. */
function nearestPoi(type, x, y) {
  let best = null, bd = Infinity, alt = null, ad = Infinity;
  for (const k in WORLD.pois) { const p = WORLD.pois[k]; if (p.type !== type) continue; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (poiOpen(p)) { if (d < bd) { bd = d; best = p; } } else if (d < ad) { ad = d; alt = p; } }
  return best || alt;
}

/* ---------- Story gates (districts that open with the story) ---------- */
const GATE_INFO = {
  forest: { title: 'Kessler Woods', toast: 'The forest road is clear. Kessler Woods is open.', text: 'The voice on the radio named the ranger station in Kessler Woods. Someone has dragged the rockfall off the forest road. The woods are open north of the old wall.' },
  docks: { title: 'The Docks', toast: 'Planks across the broken bridge. The Docks are open.', text: 'The fallen span of the river bridge has been bridged with scaffold planks. The Docks lie open across the water: cranes, containers, and whatever nests in the warehouses.' },
  pass: { title: 'The Northern Pass', toast: 'The Tollmen barrier is down. The Pass is open.', text: 'The Tollmen pulled their barrier off the north road. The way into the Northern Pass and Checkpoint Echo is open, and the snow is coming.' },
};
/* Restore a gate's original tiles in a world object (no flags, no messages). Used by openDistrict, load and tests. */
function openGateTiles(world, id) { const g = world && world.gates && world.gates[id]; if (!g) return false; for (const [x, y, t] of g.tiles) world.tiles[y * W + x] = t; g.open = true; return true; }
/* Open a story-gated district: removes the blocking tiles, sets G.flags['open_' + id], journals it and toasts. World3D rebuilds the props. */
function openDistrict(id) {
  if (!G || !WORLD || !WORLD.gates || !WORLD.gates[id] || G.flags['open_' + id]) return false;
  openGateTiles(WORLD, id); G.flags['open_' + id] = true;
  const I = GATE_INFO[id];
  if (I) { journal(I.title, I.text); Hooks.toast && Hooks.toast(I.toast, 'story'); }
  Hooks.gateOpened && Hooks.gateOpened(id);
  return true;
}
function applyGates() { if (WORLD && WORLD.gates && G) for (const id in WORLD.gates) if (G.flags['open_' + id]) openGateTiles(WORLD, id); }
/* Story triggers: woods after the radio (once radio_fixed, where Mara names the ranger station, has played), docks after Marcus's route (or day 8), the pass with the bus quest. */
function gateCheck() {
  if (!G || !WORLD) return;
  const f = G.flags;
  if (f.radio_built && G.seenScenes && G.seenScenes.radio_fixed) openDistrict('forest');
  if (f.marcus_3 || G.day >= 8) openDistrict('docks');
  if (f.q_bus) openDistrict('pass');
}
/* The closed gate within r tiles of (x,y), for "the way is blocked" hints: {id, kind, x, y} | null */
function gateNear(x, y, r) {
  if (!WORLD || !WORLD.gates) return null;
  for (const id in WORLD.gates) { const g = WORLD.gates[id]; if (g.open || (G && G.flags['open_' + id])) continue; const cx = (g.x0 + g.x1 + 1) / 2, cy = (g.y0 + g.y1 + 1) / 2; if (Math.hypot(cx - x, cy - y) <= r) return { id, kind: g.kind, x: cx, y: cy }; }
  return null;
}

/* ---------- Weather + seasons (seasons follow the story acts) ---------- */
/* G.weather 'clear'|'rain'|'fog'|'snow' (G.weatherH hours left), G.season 'autumn' (act 1) | 'late' (act 2) | 'winter' (act 3),
   G.snowCover 0..1 (rises toward the last night), G.storm (the last night's snowstorm). */
const WEATHER_W = { autumn: { clear: 6, rain: 3, fog: 1 }, late: { clear: 4, rain: 2.5, fog: 3.5 }, winter: { clear: 3, snow: 5, fog: 1.5 } };
function seasonNow() { const f = (G && G.flags) || {}; return f.q_bus ? 'winter' : f.radio_built ? 'late' : 'autumn'; }
function weatherInit() { if (!G.weather) { G.weather = 'clear'; G.weatherH = rnd(5, 9); } if (G.snowCover == null) G.snowCover = 0; if (!G.season) G.season = seasonNow(); }
function weatherTick() {
  weatherInit();
  const s = seasonNow();
  if (s !== G.season) { G.season = s; G.weatherH = Math.min(G.weatherH, s === 'winter' ? 1 : 3); }
  if (G.flags.q_bus && G.hordeDay && G.hordeDay - G.day <= 0) { G.weather = 'snow'; G.storm = true; G.weatherH = 12; }
  else {
    G.storm = false;
    if (--G.weatherH <= 0 || (s !== 'winter' && G.weather === 'snow')) { const t = WEATHER_W[s]; G.weather = wpick(Object.keys(t), k => t[k]); G.weatherH = rnd(4, 10); }
  }
  if (s === 'winter') {
    const start = (G.hordeDay || G.day + 12) - 12, prog = clamp((G.day - start + G.hour / 24) / 12, 0, 1), base = 0.12 + 0.68 * prog;
    G.snowCover = G.weather === 'snow' ? Math.min(1, Math.max(G.snowCover, base) + (G.storm ? 0.06 : 0.03)) : Math.max(base, G.snowCover - 0.01);
  } else G.snowCover = Math.max(0, (G.snowCover || 0) - 0.06);
  /* first frost / first snow: short story scenes (cutscene + beats; queueScene journals them). Snow counts wherever the player is, so the always-snowy pass does too. */
  if (s === 'late' && !G.flags.seen_frost && G.hour >= 5 && G.hour <= 9) { G.flags.seen_frost = true; queueScene('first_frost'); }
  if (weatherAt(G.p.x, G.p.y) === 'snow' && !G.flags.seen_snow) { G.flags.seen_snow = true; queueScene('first_snow'); }
  if (coldK(G.p.x, G.p.y) > 0 && !G.atShelter) { tire(4); hintOnce('cold', 'The cold drains your stamina. Stand by a fire, go indoors, or find a Winter Coat.'); }
}
/* Weather where the player (or a noise) is: the pass is always snowing unless it's foggy. */
function weatherAt(x, y) { const w = (G && G.weather) || 'clear'; if (x != null && biomeAt(x, y) === 'pass' && w !== 'fog') return 'snow'; return w; }
/* Modifiers read by combat.js */
function hearMul(x, y) { return weatherAt(x, y) === 'rain' ? 0.6 : 1; }                         // enemy hearing radius
function sightMul(x, y) { const w = weatherAt(x, y); return w === 'fog' ? 0.6 : (w === 'snow' && G && G.storm) ? 0.75 : 1; } // enemy sight range
function zSpeedMul(x, y) { return weatherAt(x, y) === 'snow' ? 0.85 : 1; }                       // zombie move speed
/* Movement multiplier on a tile (player and enemies): knee-deep water slows ~40%, deep snow a little. */
function moveMul(x, y) {
  const t = tileAt(Math.floor(x), Math.floor(y));
  if (t === T_SHALLOW) return 0.6;
  if (G && G.snowCover > 0.7 && (t === T_GRASS || t === T_FIELD || t === T_BUSH) && !indoors(x, y)) return 0.92;
  return 1;
}
function inBush(x, y) { return tileAt(Math.floor(x), Math.floor(y)) === T_BUSH; }
function nearFire(x, y, r) { r = r || 3; for (const f of (WORLD && WORLD.fires) || []) if ((f.x - x) ** 2 + (f.y - y) ** 2 <= r * r) return true; return false; }
/* 0 = warm, 1 = cold (snow outside, no coat, no fire nearby), 1.5 in the storm. Combat slows stamina regen by it. */
function coldK(x, y) {
  if (!G || weatherAt(x, y) !== 'snow' || G.pack.coat || indoors(x, y) || inShelter(x, y) || nearFire(x, y, 3.2)) return 0;
  return G.storm ? 1.5 : 1;
}
/* Ambient zombie mix per biome: weight multipliers for zombieTypes() (docks: bloaters, suburbs: dogs ...). */
const ZMIX = {
  docks: { bloater: 4, walker: 1.2, runner: 0.6 }, suburbs: { zdog: 4, runner: 1.2 }, forest: { zdog: 2, runner: 1.4, walker: 0.7 },
  farm: { zdog: 1.6, walker: 1.2 }, flooded: { bloater: 2.6, walker: 1.4, runner: 0.4 }, pass: { brute: 2.4, runner: 1.6, walker: 0.8 }, oldtown: {},
};
function zMix(x, y) { return ZMIX[biomeAt(x, y)] || {}; }

/* ---------- New game ---------- */
function newGame(name, bgId, attrs, worldName) {
  const bg = BACKGROUNDS[bgId];
  const a = Object.assign({}, attrs);
  for (const k in bg.bonus) a[k] = (a[k] || 0) + bg.bonus[k];
  const seed = Math.floor(Math.random() * 1e9);
  G = {
    v: 2, seed, day: 1, hour: 7, minute: 0,
    p: { name, bg: bgId, attr: a, hp: 100, maxHp: 100, sta: 0, maxSta: 0, hunger: 80, thirst: 70, morale: 60, inf: 0, xp: 0, level: 1, points: 0, weapon: null, x: 0, y: 0, face: 0, status: {} },
    pack: {}, store: { canned: 2, water: 2, wood: 6, cloth: 3 },
    survivors: [], buildings: {}, flags: {}, seenEnc: {}, seenScenes: {}, journal: [], loreRead: [], log: [],
    locs: {}, cont: {}, wear: {}, bosses: {}, haul: null, best: {}, unlocks: {}, hints: {}, fog: '', noise: 0, encTimer: rnd(70, 110), nextId: 1, hordeDay: 0, hordeNight: false, hordeResult: null,
    stats: { kills: 0, searches: 0, encounters: 0, recruited: 0 },
    mapV: 2, weather: 'clear', weatherH: rnd(5, 9), season: 'autumn', snowCover: 0, storm: false,
  };
  WORLD = genWorld(seed);
  G.p.x = WORLD.hatch.x + 0.5; G.p.y = WORLD.hatch.y + 1.5;
  for (const k in bg.items) G.pack[k] = (G.pack[k] || 0) + bg.items[k];
  G.pack.bottle = (G.pack.bottle || 0) + 2;
  const w = Object.keys(G.pack).find(k => ITEMS[k].c === 'weapon'); G.p.weapon = w || null;
  for (const k in WORLD.pois) G.locs[k] = { visited: false };
  initFog();
  recalc(); G.p.sta = G.p.maxSta;
  const intro = CONTENT_().story.intro; if (intro) journal(intro.title, storyText(intro));
  G.worldName = String(worldName || name || 'Ardent Vale').slice(0, 24); G.slot = null; extrasInit();
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
function carryCap() { return 18 + A('str') * 3 + (G.pack.backpack ? 15 : 0) + companionCarry(); }
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
  if (G.wear && G.wear[id] != null && !G.pack[id] && !G.store[id]) delete G.wear[id]; // a newly found weapon is a fresh one
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
  weatherTick(); gateCheck();
  if (G.hour === 22 && G.atShelter && G.day > 1 && !G.hordeNight && chance(0.35)) { const ev = pickEncounter('shelter'); if (ev) Hooks.queue({ type: 'enc', enc: ev, at: 'shelter' }); }
  if (G.hour === 21 && G.hordeNight && !G.hordeResult && !opts.sleep) { if (G.atShelter && Hooks.hordeStart) Hooks.hordeStart(hordeStrength()); }
  if (G.hour === 6) dailyTick();
}

/* ---------- Progressive unlocks & one-time hints ---------- */
/* Keys: needs (hunger/thirst HUD), build, craft, people, horde, radio, journal, map. UI reads G.unlocks[k]. */
function unlock(k) { if (!G || G.unlocks[k]) return false; G.unlocks[k] = G.day; Hooks.unlock && Hooks.unlock(k); return true; }
function isUnlocked(k) { return !!(G && G.unlocks[k]); }
function hintOnce(key, text) { if (!G || G.hints[key]) return false; G.hints[key] = 1; Hooks.hint && Hooks.hint(text, key); return true; }
function checkUnlocks() {
  const p = G.p;
  if (p.hunger < 62 || p.thirst < 58) { if (unlock('needs')) hintOnce('needs', 'Hunger and thirst are dropping. Eat and drink from your pack (I).'); }
  if ((G.stats.searches >= 1 && G.atShelter) || G.day >= 2) { if (unlock('build')) hintOnce('build', 'Walk to a marker in the yard and hold E to build.'); }
  if (bl('bench') || G.day >= 3) unlock('craft');
  if (G.flags.q_radio) unlock('radio');
  if (G.journal.length > 1) unlock('journal');
  if (G.dog && G.companion && G.companion.kind === 'dog' && G.day - G.dog.since >= 1) { if (unlock('fetch')) hintOnce('fetch', `${G.dog.name} trusts you now. R: send them to fetch.`); }
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
/* a companion who fights beside you draws ~15% more of them that night */
function hordeWaveSize() { return clamp(Math.round((Math.round(hordeStrength() / 4) + 2) * (companionFights() ? 1.15 : 1)), 5, 46); }
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
  haulReport(P);
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
  if (saveAt && G.day > 1 && C.shelterEvents.length && chance(0.45)) { const ev = pickEncounter('shelter'); if (ev) Hooks.queue({ type: 'enc', enc: ev, at: 'shelter' }); }
  companionDaily(P);
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
/* the nearest container within r tiles; full: only ones that still have something in them */
function containerNear(x, y, r, full) { let best = null, bd = r * r; for (const c of WORLD.containers) { const d = (c.x + 0.5 - x) ** 2 + (c.y + 0.5 - y) ** 2; if (d <= bd && (!full || containerState(c) !== 'empty')) { bd = d; best = c; } } return best; }
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
  const loot = []; for (const k in got) loot.push(found(k, got[k]));
  let story = storyItemHere(c.loc);
  if (story) { const tries = G.flags['tries_' + story] = (G.flags['tries_' + story] || 0) + 1; if (tries >= 3 || chance(0.4)) { loot.push(give(story, 1)); setFlag('got_' + story.replace('radio_', '')); log(`Found the ${itemName(story)}!`, 'story'); xp(20); } else story = null; }
  let lore = null; const C = CONTENT_();
  const unread = C.lore.map((l, i) => i).filter(i => !G.loreRead.includes(i));
  if (unread.length && chance(0.1)) { const i = pick(unread); G.loreRead.push(i); lore = C.lore[i]; journal(lore.title, lore.text); }
  xp(2); addNoise(0.3);
  let enc = null;
  /* scenarios park the field timer at 1e9 to switch random encounters off; the search roll honours that too */
  if (!(G.encTimer >= 1e6) && chance(0.04 + (L.danger || 0) * 0.015 + (G.isNight ? 0.03 : 0) + G.noise * 0.01)) enc = pickEncounter(c.loc);
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
  if (G.day === 1 && !isUnlocked('build')) return null; // day one: nothing jumps out until the first loot has been brought home
  G.encTimer -= dtSec * (1 + G.noise * 0.08);
  if (G.encTimer > 0) return null;
  G.encTimer = rnd(80, 140);
  if (!chance(0.7)) return null;
  const d = districtAt(G.p.x, G.p.y), e = pickEncounter(d === 'shelter' ? 'street' : d); /* the streets round the yard roll street events */
  if (e) G.stats.encounters++;
  return e;
}

/* ---------- Encounters ---------- */
function allEncounters() { return [].concat(window.ENCOUNTERS || [], window.ARC_ENCOUNTERS || [], CONTENT_().shelterEvents || []); }
function encEligible(e, type, ignoreWhere) {
  if (!ignoreWhere) {
    const w = e.where || ['any'];
    if (type === 'shelter') { if (!w.includes('shelter')) return false; }
    else if (!(w.includes(type) || w.includes('any') || (type === 'travel-any' && w.includes('travel')) || (LOCS[type] && LOCS[type].alias && w.includes(LOCS[type].alias)))) return false;
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
  /* people who wait at a home (arcs, the stray) are met there, not rolled */
  if (typeof placeSpec === 'function') pool = pool.filter(e => !placeSpec(e).home);
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
/* Damage the player deals with one hit (melee adds STR; exhausted swings are weak; a worn weapon hits softer). */
function playerHitDamage(prof) {
  let d = rnd(prof.dmg[0], prof.dmg[1]);
  if (!prof.ranged) { d += Math.round(A('str') * 0.6); if (G.p.sta < 5) d = Math.round(d * 0.6); }
  if (prof.id) d = Math.max(1, Math.round(d * (0.6 + 0.4 * weaponCond(prof.id) / 100)));
  return d;
}
/* ---------- weapon wear: condition 100..0 per weapon type (the pack holds counts, so your machetes share one). Never breaks:
   at 0 a weapon still hits for 60%. Melee wears per connecting swing, guns per shot. Repaired with scrap at the workbench. ---------- */
const WEAR_MELEE = 1, WEAR_SHOT = 0.4;
function weaponCond(id) { return id && G.wear && G.wear[id] != null ? G.wear[id] : 100; }
function wearWeapon(id, amt) {
  if (!id || !ITEMS[id] || ITEMS[id].c !== 'weapon') return;
  if (!G.wear) G.wear = {};
  const before = weaponCond(id), now = Math.max(0, +(before - amt).toFixed(2)); G.wear[id] = now;
  if (before >= 60 && now < 60) hintOnce('wear', `Your ${ITEMS[id].n.toLowerCase()} is wearing down. Scrap fixes it at the workbench.`);
}
function repairCost(id) { const miss = 100 - weaponCond(id); return miss < 1 ? 0 : Math.ceil(miss / 25); }
function repairWeapon(id) {
  const n = repairCost(id); if (!n || bl('bench') < 1 || !has('scrap', n)) return false;
  take('scrap', n, true); G.wear[id] = 100; return true;
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
  const e = ENEMIES[enemyId]; G.stats.kills++; xp(e.xp); haulAdd(0, 0, 1);
  const drops = [];
  if (e.loot && chance(0.8)) { const l = pick(e.loot); drops.push({ id: l[0], qty: rnd(1, l[1]) }); }
  if (e.drop && chance(enemyId === 'warden' ? 1 : 0.5)) { const w = pick(e.drop); drops.push({ id: w, qty: 1 }); if (ITEMS[w].ammo) drops.push({ id: ITEMS[w].ammo, qty: rnd(2, 6) }); }
  if (e.z && chance(0.22)) drops.push({ id: pick(['cloth', 'cloth', 'cigs', 'snack', 'bandage', 'scrap', 'batteries']), qty: 1 });
  if (e.gas) drops.gas = true;
  if (e.guar) for (const [id, q] of e.guar) drops.push({ id, qty: q });
  if (BOSS_LAIR[enemyId]) bossKilled(enemyId);
  return drops;
}
/* ---------- act bosses: one named dead per act, waiting in its lair. It shows up when you walk in during its act (and after
   minDay), comes back if you leave and return, and is gone for good once killed or once the act is over. G.bosses[id]: 'met'|'dead'. ---------- */
function actNow() { const f = (G && G.flags) || {}; return f.q_bus ? 3 : f.radio_built ? 2 : 1; }
const BOSS_LAIR = {
  orderly: { act: 1, minDay: 3, type: 'hospital', journal: ['The Orderly', 'It wore whites and walked the ward like it still had patients. I ended its shift.'] },
  butcher: { act: 2, label: 'Cold Store', journal: ['The Butcher', 'Something kept itself fat in the cold store. It burst like the rest of them.'] },
  sergeant: { act: 3, label: 'Wrecked Convoy', r: 5, journal: ['The Sergeant', 'He was still guarding the convoy in the snow. I took his coat. He did not need it.'] },
};
/* The boss whose lair (x,y) is in, if it should be there now; else null. Building lairs count once you're inside. */
function bossHere(x, y) {
  if (!G || !WORLD) return null;
  const act = actNow(), B = G.bosses || {};
  for (const id in BOSS_LAIR) {
    const L = BOSS_LAIR[id]; if (L.act !== act || B[id] === 'dead' || G.day < (L.minDay || 0)) continue;
    if (L.r) { const p = Object.values(WORLD.pois).find(q => q.label === L.label); if (p && Math.hypot(p.x + 0.5 - x, p.y + 0.5 - y) <= L.r) return id; continue; }
    const bi = buildingAt(x, y); if (bi < 0 || !indoors(x, y)) continue;
    const r = WORLD.roofs[bi], p = WORLD.pois[r.poi];
    if (L.type ? r.type === L.type : p && p.label === L.label) return id;
  }
  return null;
}
/* Mark a boss met; true the first time (show the intro). */
function bossMet(id) { if (!G.bosses) G.bosses = {}; if (G.bosses[id]) return false; G.bosses[id] = 'met'; return true; }
function bossKilled(id) {
  if (!G.bosses) G.bosses = {};
  if (G.bosses[id] === 'dead') return;
  G.bosses[id] = 'dead'; const j = BOSS_LAIR[id].journal; journal(j[0], j[1]);
  Hooks.toast && Hooks.toast(`${ENEMIES[id].n} is down.`, 'good');
}
/* Pick up a drop. Returns the toast label. */
function pickup(id, qty) { return found(id, qty); }
/* ---------- the night's haul: what you found (containers, bodies, pickups) and killed between dusk and dawn.
   Dawn reports it when there was a night run, with your best (G.best.haul, by value). ---------- */
function haulAdd(items, value, kills) {
  if (!G || !G.isNight) return;
  const h = G.haul || (G.haul = { items: 0, value: 0, kills: 0 });
  h.items += items; h.value += value; h.kills += kills;
}
/* give() for things found out in the world (counts toward the night's haul) */
function found(id, qty) { qty = qty == null ? 1 : qty; if (ITEMS[id]) haulAdd(qty, (ITEMS[id].v || 0) * qty, 0); return give(id, qty); }
function haulReport(P) {
  const h = G.haul; G.haul = null;
  if (!h || !(h.items || h.kills)) return;
  if (!G.best) G.best = {};
  const best = Math.max(G.best.haul || 0, h.value), rec = h.value > (G.best.haul || 0) && G.best.haul > 0; G.best.haul = best;
  P(`Last night's haul: ${h.items} found, ${h.kills} dead, worth ${h.value}${rec ? ' (a new best)' : ` (best ${best})`}.`, rec ? 'good' : '');
}

/* ---------- Trader ---------- */
function makeTrader() {
  const pool = ['canned', 'water', 'meal', 'bandage', 'medkit', 'antibiotics', 'painkillers', 'ammo', 'shells', 'bolts', 'parts', 'chem', 'fuel', 'cloth', 'scrap', 'machete', 'axe', 'crossbow', 'pistol', 'backpack', 'boots', 'vest', 'batteries', 'coat'];
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
  gateCheck();
}
const P_ = p => p ? { x: p.x + 0.5, y: p.y + 0.5 } : null;
/* Current goal: {text, how, target:{x,y}|null} in tile coords. text is one short line; how (optional) says how to do it, in one more
   short line. The UI draws a marker + compass arrow at the target. Keyboard wording ("hold E"); the UI swaps in USE on touch. */
function objectiveInfo() {
  const f = G.flags, home = P_(WORLD.hatch), me = G.p;
  const near = type => P_(nearestPoi(type, me.x, me.y));
  if (G.hordeNight && !G.hordeResult && !G.atShelter && G.hour >= 12) return { text: 'Horde tonight. Get back to the bunker.', how: 'Be inside the yard before dark.', target: home };
  // first-day chain: water -> bring it home -> bunks -> rain collector
  if (!f.got_water && (G.pack.water || G.pack.dirtywater || G.day > 1 || bl('bed'))) f.got_water = true;
  if (!f.got_water) return waterGoal();
  if (!bl('bed')) {
    if (!G.atShelter && !isUnlocked('build')) return { text: 'Bring it home to the bunker.', how: 'Follow the arrow back to the hatch.', target: home };
    return buildGoal('bed', 'Build Bunks in the yard.');
  }
  if (!bl('rain')) return buildGoal('rain', 'Build a Rain Collector.');
  if (f.q_bus) {
    const left = G.hordeDay - G.day;
    if (f.bus_ready) return { text: `The bus is ready. Horde in ${left} days.`, how: 'Choose how it ends when the horde comes.', target: home };
    if (!has('engine_parts') && !G.store.engine_parts && !G.pack.engine_parts) return { text: `Find Engine Parts (${left}d).`, how: 'Search the Bus Depot.', target: near('depot') };
    if (!G.pack.haven_map && !G.store.haven_map) return { text: `Find the route map (${left}d).`, how: 'Search Checkpoint Echo.', target: near('military') };
    if (count('fuel') < 6) return { text: `Gather Fuel ${count('fuel')}/6 (${left}d).`, how: has('hose') ? 'Gas stations, or hold E at a wreck with your hose.' : 'Gas stations have it. A Siphon Hose drains wrecks.', target: near('gas') };
    return { text: 'Bring parts and fuel to the bus.', how: 'Hold E at the bus in the depot.', target: P_(WORLD.bus) };
  }
  if (f.radio_built) {
    if (G.survivors.length < 4) return { text: `Haven wants a community. Survivors ${G.survivors.length}/4.`, how: 'Help the people you meet out there.', target: null };
    return buildGoal('walls', 'Haven wants walls. Build Barricades.');
  }
  if (f.q_radio) {
    const need = ['radio_coil', 'radio_antenna', 'radio_cell'].filter(k => !G.pack[k] && !G.store[k]);
    if (!need.length) return { text: 'Build the Shortwave Radio.', how: 'Walk to its outline in the yard and hold E.', target: slotCentre('radio') };
    const where = { radio_coil: ['apartments', 'electronics'], radio_antenna: ['radiotower'], radio_cell: ['police', 'electronics'] }[need[0]];
    const tgt = where.map(near).sort((a, b) => ((a.x - me.x) ** 2 + (a.y - me.y) ** 2) - ((b.x - me.x) ** 2 + (b.y - me.y) ** 2))[0];
    return { text: `Find the ${itemName(need[0])}.`, how: `Search ${where.map(t => LOCS[t].n).join(' or ')}.`.replace(/\.\.$/, '.'), target: tgt };
  }
  if (G.hour >= 19 || G.hour < 6) return { text: 'Night. Sleep in the bunker.', how: 'Hold E at the hatch, then Rest.', target: home };
  const nu = nearestUnvisited();
  if (nu) return { text: `Scavenge ${nu.label}.`, how: 'Food, water and building materials. Hold E on shelves and crates.', target: nu };
  return { text: 'Scavenge, build, find people.', how: 'Every building refills after a few days.', target: null };
}
function objective() { return objectiveInfo().text; }
/* "Find water": FreshMart's shelves first (the target moves from its door to the nearest unsearched shelf once you are inside);
   if FreshMart is picked clean, the nearest pump fills the bottles you carry. Done once there is water in your pack. */
function waterGoal() {
  const me = G.p, fm = nearestPoi('supermarket', me.x, me.y);
  const fmKey = fm ? fm.x + ',' + fm.y : null, left = fmKey ? WORLD.containers.filter(c => c.poi === fmKey && containerState(c) !== 'empty') : [];
  if (fm && left.length) {
    const bi = buildingAt(me.x, me.y), inside = bi >= 0 && WORLD.roofs[bi].poi === fmKey && indoors(me.x, me.y);
    if (!inside) return { text: 'Find water.', how: `Search the shelves in ${fm.label}.`, target: P_(fm) };
    const c = left.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    return { text: 'Find water.', how: `Hold E at the ${CONTAINERS[c.kind].n.toLowerCase()} to search it.`, target: P_(c) };
  }
  const pump = (WORLD.pumps || []).filter(q => poiOpen(q)).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
  if (pump && G.pack.bottle > 0) return { text: 'Find water.', how: 'Hold E at the hand pump to fill a bottle.', target: P_(pump) };
  const nu = nearestWith(['water', 'dirtywater']);
  return { text: 'Find water.', how: nu ? `${nu.label} should have some. Hold E to search.` : 'Search anywhere with shelves.', target: nu };
}
/* "Build X" when affordable (how: walk to its outline), otherwise name what is missing and send you somewhere that has it. */
function buildGoal(k, text) {
  const c = buildCost(k) || {}, inv = r => (G.pack[r] || 0) + (G.store[r] || 0);
  const short = Object.keys(c).filter(r => inv(r) < c[r]), miss = short.map(r => `${c[r] - inv(r)} ${itemName(r)}`);
  if (!miss.length) return { text, how: k === 'walls' ? 'Walk to the yard gate and hold E.' : 'Walk to its outline in the yard and hold E.', target: slotCentre(k) };
  const nu = nearestWith(short);
  return { text: `${BUILDINGS[k].n} needs ${miss.join(', ')}.`, how: nu ? `${nu.label} should have some. Hold E to search.` : 'Scavenge and bring it home.', target: nu };
}
/* the nearest open building (not yet searched first) whose loot can hold one of the items */
function nearestWith(items) {
  const me = G.p; let best = null, bd = Infinity;
  for (const k in WORLD.pois) {
    const q = WORLD.pois[k], L = LOCS[q.type];
    if (q.type === 'shelter' || !L || !L.loot || !poiOpen(q) || !L.loot.some(e => items.includes(e[0]))) continue;
    const d = Math.hypot(q.x - me.x, q.y - me.y) + (G.locs[k] && G.locs[k].visited ? 40 : 0);
    if (d < bd) { bd = d; best = q; }
  }
  return best ? Object.assign(P_(best), { label: best.label }) : null;
}
function nearestUnvisited() {
  const me = G.p; let best = null, bd = Infinity;
  for (const k in WORLD.pois) { const q = WORLD.pois[k]; if (q.type === 'shelter' || q.outdoor || !G.locs[k] || G.locs[k].visited || !poiOpen(q)) continue; const d = (q.x - me.x) ** 2 + (q.y - me.y) ** 2; if (d < bd) { bd = d; best = q; } }
  return best ? Object.assign(P_(best), { label: best.label }) : null;
}
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
/* The real-time last stand: defense shrinks the horde and thickens the barricade, so the menu number means something. */
function finalWavePlan() {
  const D = defense() + G.survivors.length * 4, need = standNeed();
  const k = clamp(need / Math.max(1, D), 0.75, 1.8);
  return { count: clamp(Math.round(hordeWaveSize() * 1.5 * k), 12, 50), bonus: Math.round(D), surges: 3, D: Math.round(D), need: Math.round(need) };
}
/* Okafor's formula: from her drug cage (ines_formula) or from working beside her at the bunker (ines_joined); needs the radio */
const canCure = () => !!(G.flags.radio_built && (G.flags.ines_formula || G.flags.ines_joined) && count('antibiotics') >= 3);
const vanceAlive = () => !!(G.flags.vance_ally && G.survivors.some(s => s.name === 'Ada Vance'));
const canStorm = () => !!(G.flags.warden_secret || G.flags.tollmen_secret);
/* Options for the last night: [{id,label,ok,note}]. Story endings only appear once you've earned them. */
function finalOptions() {
  const f = G.flags, plan = finalWavePlan(), busOk = !!(f.bus_ready && has('haven_map'));
  const out = [
    { id: 'bus', label: vanceAlive() ? "Roll north with Vance's escort. Haven." : 'Load everyone on the bus. Drive north to Haven.', ok: busOk, note: busOk ? (vanceAlive() ? 'Bus ready · military escort' : 'Bus ready') : 'Needs the repaired bus and the route map' },
    { id: 'stand', label: 'Stay. Hold the bunker against the great horde.', ok: true, note: `Defense ${plan.D} vs ~${plan.need} · about ${plan.count} of them` },
    { id: 'ally', label: 'Go to the Warden. Propose an alliance.', ok: !!f.warden_met, note: f.warden_met ? `CHA · ${Math.round(checkChance({ attr: 'cha', diff: allyDiff() }) * 100)}%` : 'You never met the Warden' },
  ];
  if (canCure()) out.push({ id: 'cure', label: "Broadcast Okafor's formula from KVAL.", ok: true, note: 'Reach the tower and hold it' });
  if (canStorm()) out.push({ id: 'storm', label: "Storm the Tollmen camp. Take the Warden's chair.", ok: true, note: 'You know his bluff' });
  if (f.choir_joined) out.push({ id: 'choir', label: "Ring the Choir's bells.", ok: true, note: 'The dead stay calm. Someone pays.' });
  out.push({ id: 'alone', label: 'Walk north alone. Leave them all.', ok: true, note: '' });
  if (G.day < G.hordeDay) out.push({ id: 'wait', label: 'Not yet. There is still time.', ok: true, note: '' });
  return out;
}
/* Epilogue lines for an ending, picked from what you did (content.js EPILOGUES: {cond, line, endings, pri}). */
function endingEpilogue(id) {
  const list = (CONTENT_().epilogues || window.EPILOGUES || []);
  const out = [];
  for (const e of list) {
    try {
      if (id === 'death' || id === 'abandoned') { if (!e.endings || !e.endings.includes(id)) continue; }
      else if (e.endings && !e.endings.includes(id)) continue;
      if (e.cond && !e.cond()) continue;
      const line = typeof e.line === 'function' ? e.line(id) : e.line; if (line) out.push({ line: fmtName(line), pri: e.pri || 0 });
    } catch (err) { }
  }
  return out.sort((a, b) => b.pri - a.pri).slice(0, 5).map(o => o.line);
}
/* Resolve a final choice. Returns an ending id ('end_haven', ...), 'wait', or 'wave' (UI should run the final wave
   via Hooks.finalWave and then call finishStand(held)). */
function chooseFinal(id) {
  if (id === 'wait') { G.flags.final = false; return 'wait'; }
  if (id === 'bus') return endGame(vanceAlive() && CONTENT_().story.end_convoy ? 'end_convoy' : 'end_haven');
  if (id === 'alone') return endGame('end_alone');
  if (id === 'choir') return endGame('end_choir');
  if (id === 'cure' || id === 'storm') return Hooks.finalWave ? id : endGame(id === 'cure' ? 'end_cure' : 'end_usurp');
  if (id === 'ally') return endGame(chance(checkChance({ attr: 'cha', diff: allyDiff() })) ? 'end_alliance' : 'end_alliance_fail');
  if (id === 'stand') { if (Hooks.finalWave) return 'wave'; return finishStand(defense() + G.survivors.length * 4 + rnd(-10, 15) >= standNeed()); }
  return null;
}
function finishStand(held) { return endGame(held ? 'end_stand' : 'end_stand_fail'); }
function finishCure(ok) { if (ok) take('antibiotics', 3); return endGame(ok ? 'end_cure' : 'end_cure_fail'); }
function finishStorm(ok) { return ok ? endGame('end_usurp') : null; }
function endGame(id) { G.endScene = id; G.flags.ended = id; saveGame(true); return id; }

/* ---------- Companions: one at a time follows you outside (combat.js moves it and fights with it) ----------
   G.companion = {kind:'dog'|'survivor', id, name} | null. G.dog = {name, hp, restUntil, since} once a dog is adopted.
   A hurt dog or a downed helper goes home and rests until the next day (restUntil); only story choices kill them. */
const DOG_MAX_HP = 60;
function extrasInit() {
  if (!G) return;
  G.requests = G.requests || []; G.doorBars = G.doorBars || {}; G.siphoned = G.siphoned || {}; G.radioN = G.radioN || 0;
  if (G.companion === undefined) G.companion = null;
  recountBars(); companionCheck();
}
function companionSurvivor() { const c = G && G.companion; return c && c.kind === 'survivor' ? (G.survivors.find(s => s.id === c.id) || null) : null; }
function companionCheck() { const c = G && G.companion; if (!c) return; if ((c.kind === 'dog' && !G.dog) || (c.kind === 'survivor' && !companionSurvivor())) G.companion = null; }
/* can this one come along right now? → {ok, why} */
function companionReady(kind, id) {
  if (kind === 'dog') { if (!G.dog) return { ok: false, why: 'No dog' }; if (G.dog.restUntil > G.day) return { ok: false, why: `${G.dog.name} is resting` }; return { ok: true }; }
  const s = G.survivors.find(x => x.id === id); if (!s) return { ok: false, why: 'Gone' };
  if (s.restUntil > G.day) return { ok: false, why: 'Resting after an injury' };
  if (s.hp < 30) return { ok: false, why: 'Too hurt' };
  return { ok: true };
}
function setCompanion(kind, id) {
  const r = companionReady(kind, id); if (!r.ok) return false;
  if (kind === 'dog') G.companion = { kind: 'dog', id: 'dog', name: G.dog.name };
  else { const s = G.survivors.find(x => x.id === id); G.companion = { kind: 'survivor', id: s.id, name: s.name }; }
  hintOnce('companion', `${G.companion.name} comes on runs now. H: stay / follow.`);
  return true;
}
function clearCompanion() { if (G) G.companion = null; return true; }
/* {kind, id, name, hp, maxHp, s?} for the companion out with you, or null */
function companionInfo() {
  companionCheck(); const c = G && G.companion; if (!c) return null;
  if (c.kind === 'dog') return { kind: 'dog', id: 'dog', name: G.dog.name, hp: G.dog.hp, maxHp: DOG_MAX_HP };
  const s = companionSurvivor(); return { kind: 'survivor', id: s.id, name: s.name, hp: s.hp, maxHp: 100, s };
}
function companionFights() { return !!companionInfo(); }
/* a helper carries 8 kg of your loot (the dog carries nothing) */
function companionCarry() { return G && G.companion && G.companion.kind === 'survivor' && companionSurvivor() ? 8 : 0; }
/* damage to the companion. → 'ok' | 'home' (dog whimpers off) | 'downed' (helper at 0 HP: revive within 20 s or they limp home) */
function companionHurt(n) {
  const c = companionInfo(); if (!c) return 'ok';
  if (c.kind === 'dog') { G.dog.hp = Math.max(0, G.dog.hp - n); if (G.dog.hp <= 12) { companionHome('hurt'); return 'home'; } return 'ok'; }
  c.s.hp = Math.max(0, c.s.hp - n); return c.s.hp <= 0 ? 'downed' : 'ok';
}
function companionRevive() { const s = companionSurvivor(); if (!s) return false; s.hp = Math.max(s.hp, 30); xp(6); return true; }
/* the companion leaves for the bunker: rests until tomorrow */
function companionHome(why) {
  const c = companionInfo(); if (!c) return '';
  if (c.kind === 'dog') { G.dog.restUntil = G.day + 1; G.dog.hp = Math.max(G.dog.hp, 20); log(`${c.name} whimpers and limps home to rest.`, 'warn'); }
  else { c.s.hp = Math.max(c.s.hp, 25); if (why !== 'leave') { c.s.restUntil = G.day + 1; log(`${c.name} limps home, hurt.`, 'warn'); } }
  G.companion = null; return c.name;
}
/* ---------- dog fetch (R, unlocked after a day together): the dog runs to the nearest container within FETCH_R tiles that it hasn't
   raided today and brings back one item from it (the container itself stays for you to search). FETCH_CD game minutes (= real
   seconds) between runs. The run itself is in combat.js (updateCompanion). ---------- */
const FETCH_CD = 90, FETCH_R = 12;
const nowMin = () => G.day * 1440 + G.hour * 60 + Math.floor(G.minute || 0);
/* why the dog can't fetch now (a short line), or null */
function fetchBlock() {
  if (!G.dog || !G.companion || G.companion.kind !== 'dog') return 'No dog with you.';
  if (!isUnlocked('fetch')) return `${G.dog.name} doesn't know you well enough yet.`;
  if (G.fetchAt != null && nowMin() - G.fetchAt < FETCH_CD) return `${G.dog.name} is still panting.`;
  return null;
}
function fetchTarget(x, y) {
  let best = null, bd = FETCH_R;
  for (const k of WORLD.containers) {
    if (containerState(k) === 'empty' || (G.fetched && G.fetched[k.id] === G.day) || inShelter(k.x + 0.5, k.y + 0.5)) continue;
    const d = Math.hypot(k.x + 0.5 - x, k.y + 0.5 - y); if (d < bd) { bd = d; best = k; }
  }
  return best;
}
/* the dog has its teeth in container c: starts the cooldown, returns the item id it carries back */
function dogFetch(c) {
  G.fetchAt = nowMin(); (G.fetched || (G.fetched = {}))[c.id] = G.day;
  const K = CONTAINERS[c.kind] || {}, L = LOCS[c.loc] || LOCS.street, pool = (L.loot || []).filter(e => !K.cats || K.cats.includes(ITEMS[e[0]].c));
  return wpick(pool.length ? pool : (L.loot || LOCS.street.loot), x => x[1])[0];
}
function adoptDog(name) {
  setFlag('dog_adopted');
  if (G.dog) return '';
  name = name || 'Dog';
  G.dog = { name, hp: DOG_MAX_HP, restUntil: 0, since: G.day };
  if (!G.companion) G.companion = { kind: 'dog', id: 'dog', name };
  log(`${name} is yours now.`, 'good');
  hintOnce('dog', `${name} follows you on runs and sniffs out loot. H: stay / follow.`);
  return '';
}
function companionDaily(P) {
  if (G.dog) { G.dog.hp = Math.min(DOG_MAX_HP, G.dog.hp + 25); if (G.dog.restUntil === G.day) { P(`${G.dog.name} is back on four feet.`, 'good'); if (!G.companion) G.companion = { kind: 'dog', id: 'dog', name: G.dog.name }; } }
  for (const s of G.survivors) if (s.restUntil === G.day) P(`${s.name} is fit for runs again.`, 'good');
  G.requests = (G.requests || []).filter(r => G.survivors.some(s => s.id === r.sid));
}
/* a helper with scavenging skill turns up a little extra when you search near them */
function companionScavBonus(c) {
  const s = companionSurvivor(); if (!s || !c) return '';
  const sk = (s.skills.scav || 1) + (s.trait === 'scavenger' ? 2 : 0);
  if (!chance(0.1 + sk * 0.08)) return '';
  const L = LOCS[c.loc] || LOCS.street, e = wpick(L.loot || LOCS.street.loot, x => x[1]);
  return give(e[0], 1);
}

/* ---------- Talking to survivors (lines in CONTENT.survivorTalk) ---------- */
const REQ_ITEMS = [['cigs', 4], ['batteries', 2], ['bandage', 2], ['snack', 3], ['cloth', 4], ['chem', 1], ['canned', 2], ['painkillers', 1], ['water', 2], ['parts', 1]];
const REQ_REWARDS = [['ammo', 6], ['medkit', 1], ['parts', 2], ['meal', 2], ['antibiotics', 1], ['scrap', 4], ['bolts', 6]];
const talkLines = () => CONTENT_().survivorTalk || {};
const traitLine = (bank, s) => { const b = bank || {}; const l = b[s.trait] || b.default || ['...']; return fmtName(pick(l)); };
function survivorMood(s) {
  const TL = talkLines(), m = s.morale >= 65 ? 'high' : s.morale < 35 ? 'low' : 'mid';
  if (s.hp < 40 && TL.hurt) return fmtName(pick(TL.hurt));
  return traitLine((TL.mood || {})[m], s);
}
/* "How are you holding up?": a line, and once a day a little morale */
function chatSurvivor(s) { if (s.chatDay !== G.day) { s.chatDay = G.day; s.morale = clamp(s.morale + 4, 0, 100); } return traitLine(talkLines().chat, s); }
function giftItem() { return ['cigs', 'snack', 'canned', 'meal'].find(k => count(k) > 0) || null; }
function giftSurvivor(s) {
  const id = giftItem(); if (!id || !take(id, 1)) return '';
  s.morale = clamp(s.morale + (id === 'meal' ? 12 : 8), 0, 100); addMorale(1);
  return traitLine(talkLines().gift, s).replace(/\{item\}/g, itemName(id).toLowerCase());
}
function requestOf(s) { return (G.requests || []).find(r => r.sid === s.id) || null; }
/* sometimes (once a day each) someone asks for something: {sid, item, qty, day} */
function maybeRequest(s) {
  if (requestOf(s) || s.askDay === G.day) return null;
  s.askDay = G.day; if (!chance(0.45)) return null;
  const [item, qty] = pick(REQ_ITEMS), r = { sid: s.id, item, qty, day: G.day };
  G.requests.push(r); return r;
}
function canDeliver(s) { const r = requestOf(s); return !!(r && has(r.item, r.qty)); }
function deliverRequest(s) {
  const r = requestOf(s); if (!r || !take(r.item, r.qty)) return '';
  G.requests.splice(G.requests.indexOf(r), 1);
  s.morale = clamp(s.morale + 15, 0, 100); xp(15);
  const [id, n] = pick(REQ_REWARDS); return give(id, n);
}
/* job choices for a survivor: [[job, label, ok]] */
function jobChoices(s) {
  const out = [['idle', 'Resting', true], ['guard', 'Guard', true], ['scavenge', 'Scavenge runs', true]];
  for (const k in BUILDINGS) if (BUILDINGS[k].workers && bl(k)) out.push([k, `${BUILDINGS[k].n} ${workerCount(k)}/${bl(k)}`, s.job === k || workerCount(k) < bl(k)]);
  return out;
}
function setJob(s, job) { const o = jobChoices(s).find(j => j[0] === job); if (!o || !o[2]) return false; s.job = job; return true; }

/* ---------- World interactions: doors, wrecks, water, fires, radio ---------- */
/* barricaded doors: G.doorBars[tileIndex] = HP (about 6 s of one zombie clawing at it). Closed both ways. */
const DOOR_BAR_HP = 6;
let BAR_N = 0;
function recountBars() { BAR_N = G && G.doorBars ? Object.keys(G.doorBars).length : 0; }
function barredAny() { return BAR_N > 0; }
function doorBlocked(x, y) { if (!BAR_N || !G) return false; return !!G.doorBars[Math.floor(y) * W + Math.floor(x)]; }
function doorBarred(tx, ty) { return !!(G && G.doorBars && G.doorBars[ty * W + tx]); }
function barDoor(tx, ty) {
  if (tileAt(tx, ty) !== T_DOOR || doorBarred(tx, ty) || !take('wood', 2)) return false;
  G.doorBars[ty * W + tx] = DOOR_BAR_HP; recountBars(); addNoise(0.5); xp(2); return true;
}
function unbarDoor(tx, ty) { if (!doorBarred(tx, ty)) return false; delete G.doorBars[ty * W + tx]; recountBars(); give('wood', 1); return true; }
/* a zombie hits the barricade; true when it breaks */
function hitDoorBar(tx, ty, dmg) {
  const k = ty * W + tx; if (!G.doorBars[k]) return true;
  G.doorBars[k] -= dmg; if (G.doorBars[k] > 0) return false;
  delete G.doorBars[k]; recountBars(); return true;
}
/* wrecked cars (T_CAR): siphon once per car. A hose always works; without one it is a 40% chance. */
function carSiphoned(tx, ty) { return !!(G.siphoned && G.siphoned[ty * W + tx]); }
function siphonCar(tx, ty) {
  if (tileAt(tx, ty) !== T_CAR || carSiphoned(tx, ty)) return { ok: false, text: 'Bone dry.' };
  G.siphoned[ty * W + tx] = G.day; advance(5); addNoise(0.6);
  const hose = has('hose');
  if (!hose && !chance(0.4)) return { ok: false, text: 'Nothing but fumes. A hose would help.' };
  return { ok: true, text: give('fuel', hose ? rnd(1, 2) : 1) };
}
/* an empty bottle filled at the river (dirty) or a hand pump (clean well water) */
function fillBottle(clean) {
  if (!(G.pack.bottle > 0)) return '';
  take('bottle', 1); const l = give(clean ? 'water' : 'dirtywater', 1);
  if (!/^\+/.test(l)) { G.pack.bottle = (G.pack.bottle || 0) + 1; return ''; }
  advance(2); return l;
}
/* what a fire or the kitchen stove can do with what is in your pack */
function cookOption() {
  const pk = G.pack;
  if (pk.dirtywater > 0) return { label: 'Boil Dirty Water', take: ['dirtywater', 1], out: 'water' };
  if (pk.rawmeat > 0) return { label: 'Cook Raw Meat', take: ['rawmeat', 1], out: 'meal' };
  if (pk.veg >= 2) return { label: 'Cook a Stew', take: ['veg', 2], out: 'meal' };
  return null;
}
function cookAt() { const o = cookOption(); if (!o || !take(o.take[0], o.take[1])) return ''; advance(10); xp(2); return give(o.out, 1); }
/* the bunker radio: one broadcast, a hint for where things stand, and when the caravan calls (every 4 days) */
function traderDay() { return G.day + ((2 - (G.day % 4)) + 4) % 4; }
function radioBroadcast() {
  const C = CONTENT_(), lines = [], r = C.radio || [];
  if (r.length) { lines.push(r[(G.radioN || 0) % r.length]); G.radioN = (G.radioN || 0) + 1; }
  const hints = (C.radioHints || []).filter(h => { try { return !h.cond || h.cond(); } catch (e) { return false; } });
  if (hints.length) { const h = pick(hints); lines.push(typeof h.line === 'function' ? h.line() : h.line); }
  const td = traderDay(), here = td === G.day && G.hour >= 8 && G.hour < 19;
  lines.push(here ? 'Caravan: "We\'re at your bunker gate until dusk. Call us on this set."' : `Caravan: next stop at your bunker on day ${td}, 08:00 to dusk.`);
  return { lines: lines.map(fmtName), trader: here };
}
/* interaction props (placeProps): WORLD.notes [{x,y,place?,i,text?}], WORLD.bodies [{x,y,in}], WORLD.pumps [{x,y}], WORLD.beds [{x,y,kind}] */
function propNear(list, x, y, r) { let best = null, bd = r * r; for (const q of list || []) { const d = (q.x + 0.5 - x) ** 2 + (q.y + 0.5 - y) ** 2; if (d <= bd) { bd = d; best = q; } } return best; }
function readNote(n) {
  const CC = CONTENT_(), PN = n.place && CC.placeNotes && CC.placeNotes[n.place], C = PN && PN.length ? PN : CC.graffiti || ['Someone scratched a name here. Then crossed it out.'];
  const i = n.i != null ? n.i : Math.abs((n.x * 31 + n.y * 17) | 0), line = fmtName(n.text || C[i % C.length]);
  G.notesRead = G.notesRead || {}; const k = n.x + ',' + n.y;
  if (!G.notesRead[k]) { G.notesRead[k] = 1; G.journal.unshift({ day: G.day, title: 'Written on a wall', text: line }); xp(2); }
  return line;
}
function searchBody(b) {
  G.bodies = G.bodies || {}; const k = b.x + ',' + b.y; if (G.bodies[k]) return [];
  G.bodies[k] = G.day; advance(4); addNoise(0.2);
  const out = [found(pick(['bandage', 'cigs', 'ammo', 'snack', 'batteries', 'cloth', 'canned', 'painkillers']), 1)];
  if (chance(0.25)) out.push(found(pick(['knife', 'bottle', 'chem']), 1));
  return out.filter(Boolean);
}

/* ---------- Save / load: several saved worlds ----------
   Index localStorage[SLOTS_KEY] = [{id,name,bg,pname,day,level,lastPlayed,ended,endId,cause,kills,survivors}] and each world at
   'deadembers_world_<id>'. G.slot is the current world's id (made on its first save). Death and endings mark the world ended
   (a memorial on the title screen) instead of deleting it. The old single save (deadembers_save_v2) moves once into a slot. */
const SAVE_KEY = 'deadembers_save_v2', OLD_SAVE_KEY = 'deadembers_save_v1', SLOTS_KEY = 'deadembers_slots';
const worldKey = id => 'deadembers_world_' + id;
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function newWorldId() { return Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36); }
function readSlots() { try { const a = JSON.parse(lsGet(SLOTS_KEY) || '[]'); return Array.isArray(a) ? a.filter(w => w && w.id) : []; } catch (e) { return []; } }
function writeSlots(a) { try { localStorage.setItem(SLOTS_KEY, JSON.stringify(a)); return true; } catch (e) { return false; } }
function slotMeta(o, id) {
  const f = o.flags || {}, p = o.p || {}, dead = p.hp <= 0 || f.ended === 'death';
  return { id, name: o.worldName || p.name || 'Ardent Vale', bg: p.bg || '', pname: p.name || '', day: o.day || 1, level: p.level || 1, lastPlayed: Date.now(),
    ended: !!(f.ended || dead), endId: f.ended || (dead ? 'death' : null), cause: o.deathCause || null, kills: (o.stats && o.stats.kills) || 0, survivors: (o.survivors || []).length };
}
function migrateSave() {
  const s = lsGet(SAVE_KEY); if (!s) return null;
  try {
    const o = JSON.parse(s); if (!o || o.v !== 2) return null;
    const id = newWorldId(); o.slot = id;
    localStorage.setItem(worldKey(id), JSON.stringify(o));
    const list = readSlots(); list.push(slotMeta(o, id)); writeSlots(list);
    localStorage.removeItem(SAVE_KEY);
    return id;
  } catch (e) { return null; }
}
/* every saved world, most recently played first */
function listWorlds() { migrateSave(); return readSlots().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0)); }
/* the most recently played world that can still be continued (null if none) */
function lastWorldId() { const w = listWorlds().find(x => !x.ended); return w ? w.id : null; }
function serialize() { let s = ''; for (let i = 0; i < G._fog.length; i++) s += G._fog[i] ? '1' : '0'; G.fog = s; const o = Object.assign({}, G); delete o._fog; return JSON.stringify(o); }
/* writes the current world (G.slot; made on the first save) and refreshes its index entry */
function saveGame(silent) {
  try {
    if (!G) return false;
    if (!G.slot) G.slot = newWorldId();
    localStorage.setItem(worldKey(G.slot), serialize());
    const list = readSlots(), meta = slotMeta(G, G.slot), i = list.findIndex(w => w.id === G.slot);
    if (i >= 0) list[i] = meta; else list.push(meta);
    if (!writeSlots(list)) throw new Error('index');
    if (!silent) log('Game saved.', 'good'); return true;
  } catch (e) { if (!silent) log('Could not save in this browser.', 'bad'); return false; }
}
/* "Save as new world": the current game continues in a fresh slot; the old slot keeps the state it had. */
function forkWorld(name) { if (!G) return null; G.slot = newWorldId(); G.worldName = String(name || ((G.worldName || G.p.name) + ' II')).slice(0, 24); return saveGame(true) ? G.slot : null; }
/* death or an ending: the world stays on the title screen as a memorial and can no longer be continued */
function markEnded(endId) { if (!G) return false; if (!G.flags.ended) G.flags.ended = endId || 'death'; return saveGame(true); }
function deleteWorld(id) { try { localStorage.removeItem(worldKey(id)); } catch (e) { } writeSlots(readSlots().filter(w => w.id !== id)); if (G && G.slot === id) G.slot = null; return true; }
function loadWorld(id) {
  const meta = readSlots().find(w => w.id === id); if (!meta || meta.ended) return false;
  try { const s = lsGet(worldKey(id)); if (!s) return false; loadFrom(s); G.slot = id; return true; } catch (e) { return false; }
}
function hasOldSave() { return !hasSave() && !!lsGet(OLD_SAVE_KEY); }
/* any world that can still be continued */
function hasSave() { return !!lastWorldId(); }
function loadFrom(str) {
  const o = JSON.parse(str); if (!o || o.v !== 2) throw new Error('old save'); G = o; WORLD = genWorld(G.seed);
  /* saves from the 64x48 map: same seed, new world. Start again at the hatch with a fresh map and containers. */
  if (G.mapV !== 2) { G.mapV = 2; G.fog = ''; G.cont = {}; G.locs = {}; for (const k in WORLD.pois) G.locs[k] = { visited: false }; G.p.x = WORLD.hatch.x + 0.5; G.p.y = WORLD.hatch.y + 1.5; }
  applyGates(); initFog(); weatherInit(); recalc(); extrasInit();
}
/* compatibility: load the most recently played world that can continue */
function loadGame() { const id = lastWorldId(); return id ? loadWorld(id) : false; }
