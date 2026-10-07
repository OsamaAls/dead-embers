/* ===================== PLACES: every event happens somewhere you can see =====================
   An event no longer pops up as a dialogue out of nowhere. When one is rolled (out on a run, while searching, while resting, or at
   the bunker), it is put somewhere that fits it: a bitten woman in a doorway, a stray under the hand pump, a trader on the road
   ahead, a locked safe in the back of the shop you are searching, a stranger at the yard gate. You see the person, animal or thing
   (they wave, call out, make a sound) and walk up to it; E (USE) starts the event, or for the dead, getting close does.
   People from the story arcs (Eli, Dr. Okafor, Marcus, Teodor, ...) wait at their own place and are there whenever their next step is.

   Pure part (also loaded by test.js, no THREE):
     placeSpec(enc)                 how an event shows up: {at, actor, n, pose, engage, r, verb, lure, after, prop, home, ...}
     placeFor(enc, px, py, ctx)     a spot {x, y, face, kind} for it near the player (ctx: {src, bi, x, y}), or null
     npcHome(group)                 the fixed spot where an arc's person waits, or null
     homeEventsNear(x, y)           [{enc, group, spot}] arc steps waiting at homes within reach
     subject(k)                     the survivor a bunker event is about (pinned in G.flags[k] until they leave)
   Runtime (browser):
     Places.offer(enc, ctx) -> bool   put the event in the world (false: no room for it here; nothing happened)
     Places.update(dt)  Places.targets(p, d2)  Places.emitters(px, py)  Places.pins()  Places.busy(src)  Places.reset()
     Places.live                      the events standing in the world now
     Places.spawn(id, ctx)            dev / scenario helper: place an event by id */

/* ---------- what each event looks like (only the ones the defaults get wrong) ----------
   at: road | car | door:<types> | inside:<types> | wall | body | pump | water | fire | field | trail | planks | bridge | deco:<kind>
       | poi:<label> | tollgate | gate | fence | hatch | yard | follow | here
   actor: survivor | kid | raider | tollman | dog | zombies | none   (n: how many; foes for the dead come from play.foes)
   pose: stand | sit | work | chat | still (zombies) | feed (zombies)   engage: E | near | zone (r tiles)
   after (by choice index): leave | stay | die | home | gone      prop: a small thing to look at (PROPS in the runtime) */
const PLACE = {
  /* the dead */
  walker_pack: { at: 'road', mood: 'shuffle' }, lone_runner: { at: 'wall', r: 9 }, brute_block: { at: 'car', r: 11 },
  zdog_pack: { at: 'road' }, corpse_pile: { at: 'body', mood: 'feed', r: 8 }, night_stalkers: { at: 'road', mood: 'still', r: 8 },
  farm_scarecrows: { at: 'field', mood: 'still', r: 7 }, bloater_corridor: { at: 'inside', r: 7 }, elm_pack: { at: 'road' },
  woods_pack: { at: 'trail' }, pass_whiteout: { at: 'road', r: 9 }, pirate_dj: { at: 'car', actor: 'survivor', n: 1, prop: 'speaker', r: 13, verb: null, lure: 'Live and undead-free!' },
  bridge_screamer: { at: 'bridge', r: 13 }, mall_screamer: { at: 'inside', r: 9 }, screamer_cry: { at: 'road', r: 11 },
  /* rescues: the person is there, with the dead around them */
  surrounded_survivor: { at: 'car', r: 14 }, rooftop_kid: { at: 'car', actor: 'kid', r: 14 }, pinned_scav: { at: 'inside', pose: 'sit', prop: 'shelf', r: 10 },
  carrying_mother: { at: 'road', r: 14 }, dock_crane: { at: 'deco:crane', r: 14 }, flood_roof: { at: 'door:flooded', r: 14 },
  woods_snare: { at: 'trail', r: 13 }, teodor_2: { r: 14, prop: 'smoke' }, vance_3: { verb: 'Go with Vance', engage: 'E' },
  /* hazards you walk into, and things to pry, pick or reach */
  collapsing_floor: { at: 'inside', prop: 'crates', verb: 'Climb to the crates' }, stair_collapse: { at: 'inside', prop: 'dust', engage: 'zone', r: 1.7 },
  catwalk: { at: 'inside', prop: 'toolbox', verb: 'Cross to the toolbox' }, ceiling_fall: { at: 'inside', prop: 'tiles', verb: 'Look under the tiles' },
  hidden_stash: { at: 'wall', prop: 'brick', verb: 'Pry the loose brick' }, locked_safe: { at: 'inside', prop: 'safe', verb: 'Crack the safe' },
  abandoned_car: { at: 'car', prop: 'none', verb: 'Pry the trunk' }, pharmacy_shelf: { at: 'inside', prop: 'shutter', verb: 'Force the shutter' },
  gas_siphon: { at: 'wall', prop: 'pump', verb: 'Work the old hand pump' }, gun_locker: { at: 'inside', prop: 'locker', verb: 'Open the gun locker' },
  hospital_cage: { at: 'inside', prop: 'cage', verb: 'Pick the cage lock' }, dock_stacks: { at: 'deco:container', prop: 'crates', verb: 'Check the leaning stack' },
  flood_planks: { at: 'planks', prop: 'none', engage: 'zone', r: 1.6 }, elm_garage: { at: 'door:house', prop: 'shutter', verb: 'Pry the garage door' },
  ranger_cabinet: { at: 'poi:Ranger Station', prop: 'locker', verb: 'Open the chained cabinet' }, pass_avalanche: { at: 'road', prop: 'none', engage: 'zone', r: 2.2 },
  pass_tailgate: { at: 'poi:Wrecked Convoy', prop: 'none', verb: 'Force the tailgate' },
  /* races that start from something you can see (the rest happen where you are) */
  supply_drop: { at: 'road', prop: 'chute', engage: 'near', r: 16 }, church_bell: { at: 'inside', prop: 'bell', verb: 'Look at the tins' },
  closing_gate: { at: 'door:military', prop: 'shutter', engage: 'near', r: 10 }, flood_boat: { at: 'deco:boat', prop: 'none', verb: 'Take the boat' },
  dock_tide: { at: 'inside', prop: 'none', engage: 'zone', r: 2.2 }, rosa_1: { verb: 'Walk Rosa to the next lamp' },
  /* traders */
  wandering_trader: { at: 'road', pose: 'sit', prop: 'cart' }, kids_stall: { at: 'road', actor: 'kid', n: 2, prop: 'trolley' },
  pharmacist: { at: 'door:hospital,apartments', prop: 'case' }, tollmen_sutler: { at: 'tollgate', actor: 'tollman', prop: 'crates' },
  /* people */
  bitten_stranger: { at: 'door:apartments,hospital,supermarket,street', pose: 'sit', k: { fore: 0xe8e2d4 }, tint: 0x7a5a6a, lure: 'Help me… or finish it.', after: ['stay', 'die', 'stay'] },
  wounded_stranger: { at: 'car', pose: 'sit', lure: 'Hey. Over here.', after: ['home', 'leave', 'leave'] },
  lost_kids: { at: 'car', actor: 'kid', n: 2, pose: 'sit', verb: 'Talk to the kids', lure: '' },
  hospital_doctor: { tint: 0xd8d4c8, verb: 'Knock on the door' },
  raider_ambush: { at: 'car', actor: 'raider', n: 3, prop: 'wire', engage: 'near', r: 6, lure: 'Everything you got.' },
  toll_collector: { at: 'road', actor: 'tollman', engage: 'near', r: 5, lure: 'Everyone pays.' },
  radio_hermit: { prop: 'radio', verb: 'Talk to the hermit' }, ruin_wedding: { at: 'road', n: 3, verb: 'Talk to the groom' },
  map_girl: { at: 'road', actor: 'kid' }, brothers_car: { at: 'car', n: 2, pose: 'chat', verb: 'Talk to the brothers', lure: '' },
  flood_raft: { at: 'water', n: 2, prop: 'raft', verb: 'Hail the raft' }, dock_angler: { pose: 'sit', verb: 'Sit with the angler', daily: 0.5 },
  elm_boarded: { prop: 'boards', verb: 'Call out to the house', lure: 'Far enough.' }, pass_left_behind: { pose: 'sit', verb: 'Talk to the man in the snow' },
  guard_dog: { at: 'body', actor: 'dog', tint: 0x3a2e22, pose: 'sit', verb: 'Approach the dog', lure: '', snd: 'growl', after: ['leave', 'stay', 'stay', 'stay'] },
  stray_pump: { actor: 'dog', tint: 0x8a5a32, pose: 'sit', verb: 'Approach the stray', lure: '', snd: 'whine' },
  stray_name: { at: 'follow', actor: 'dog', tint: 0x8a5a32, verb: 'Name the stray', lure: '', after: ['leave', 'leave', 'leave', 'leave'] },
  /* things to look at */
  mirror_message: { at: 'inside', prop: 'mirror', verb: 'Read the mirror' }, river_fishing: { at: 'water', prop: 'ripples', verb: 'Watch the water' },
  forest_snare: { at: 'trail', prop: 'tracks', verb: 'Look at the tracks' }, pharmacy_note: { at: 'inside', prop: 'note', verb: 'Read the note' },
  wind_chimes: { at: 'wall', prop: 'chimes', verb: 'Listen to the chimes', snd: 'ping' }, elm_kids_room: { at: 'inside', prop: 'rabbit', verb: 'Look at the rabbit' },
  woods_campfire: { at: 'fire', prop: 'tins', verb: 'Sit by the fire' },
  /* arcs: the person waits at home (npcHome); props and verbs per step */
  eli_1: { actor: 'kid', verb: 'Go after the boy', lure: '', snd: 'creak' }, eli_2: { actor: 'none', prop: 'trap', verb: 'Look at the cup and spoon' },
  eli_3: { actor: 'kid', pose: 'sit' }, eli_4: { at: 'yard', actor: 'none', prop: 'none', name: 'Eli', verb: 'Talk to Eli' },
  ines_1: { prop: 'boards', tint: 0xd8d4c8 }, ines_2: { tint: 0xd8d4c8, verb: 'Knock for Dr. Okafor' }, ines_3: { tint: 0xd8d4c8, prop: 'vial' }, ines_4: { tint: 0xd8d4c8, prop: 'cage', verb: 'Open the drug cage' },
  marcus_1: { actor: 'tollman', pose: 'sit', lure: 'Not here to hurt you.' }, marcus_2: { actor: 'tollman', pose: 'sit' }, marcus_3: { actor: 'tollman', pose: 'sit' }, marcus_3b: { at: 'gate', actor: 'tollman' },
  choir_1: { n: 2, tint: 0x2a2622, prop: 'lantern', verb: 'Watch the singers', snd: 'ping' }, choir_2: { tint: 0x2a2622, prop: 'lantern' }, choir_3: { n: 2, tint: 0x2a2622, prop: 'lantern', verb: 'Go down to the cellar' },
  relay_1: { actor: 'none', prop: 'ledger', verb: 'Read the ledger' }, relay_2: { actor: 'none', prop: 'radio', verb: 'Answer the radio', snd: 'crackle' }, relay_3: { actor: 'none', prop: 'ledger', verb: 'Read the last page' },
  teodor_1: { lure: "That's far enough." }, teodor_3: {}, teodor_4: { actor: 'dog', tint: 0x8a6a4a, prop: 'grave', verb: 'Go to Biscuit' },
  rosa_2: { prop: 'ladder' }, rosa_3: { verb: 'Talk to Rosa' },
  vance_1: { tint: 0x55603a, prop: 'shutter', verb: 'Help with the door' }, vance_2: { tint: 0x55603a, pose: 'sit' }, vance_4: { tint: 0x55603a },
  /* the bunker */
  sh_scratching: { at: 'fence', r: 12 }, sh_fence: { at: 'fence', r: 12 }, sh_screamer: { at: 'fence', r: 13 },
  sh_turning: { at: 'yard', actor: 'none', prop: 'none', subject: '_turning', pose: 'sit', verb: 'Check on {s}' }, sh_theft: { at: 'yard', actor: 'none', prop: 'none', subject: '_thief', pose: 'sit', verb: 'Talk to {s}' },
  sh_birthday: { at: 'yard', actor: 'none', prop: 'none', subject: '_bday', verb: 'Go to {s}' }, sh_outbreak: { at: 'yard', actor: 'none', prop: 'cot', subject: '_sick', verb: 'Check on the sick' },
  sh_stories: { at: 'yard', actor: 'none', prop: 'lantern', subject: '_story', verb: 'Join the circle' }, sh_rats: { at: 'hatch', actor: 'none', prop: 'sacks', verb: 'Look at the sacks', snd: 'creak' },
  sh_fire: { at: 'hatch', actor: 'none', prop: 'smoke', verb: 'Put out the fire' }, sh_pipe: { at: 'hatch', actor: 'none', prop: 'spray', verb: 'Shut the valve' },
  sh_newcomer: { at: 'gate' }, sh_trader: { at: 'gate', n: 2, prop: 'cart' }, sh_tribute: { at: 'gate', actor: 'tollman' },
  sh_dog: { at: 'gate', actor: 'dog', tint: 0x8a5a32, pose: 'sit', verb: 'Go to the dog', lure: '', after: ['leave', 'home', 'leave'] },
};
/* arcs and fixed people: they wait at a home instead of turning up at random */
const ARC_GROUPS = ['eli', 'ines', 'marcus', 'choir', 'relay', 'teodor', 'rosa', 'vance'];
const HOME_ONE = { hospital_doctor: 'doctor', radio_hermit: 'hermit', elm_boarded: 'no14', pass_left_behind: 'convoy', dock_angler: 'pier', stray_pump: 'stray' };
const INDOOR = ['apartments', 'hospital', 'supermarket', 'factory', 'police', 'electronics', 'gas', 'depot', 'military', 'radiotower', 'warehouse', 'house', 'ranger'];
function homeOf(e) {
  const m = /^([a-z]+)_/.exec(e.id); if (m && ARC_GROUPS.includes(m[1]) && !(PLACE[e.id] && PLACE[e.id].at)) return m[1];
  return HOME_ONE[e.id] || null;
}
/* "Teodor", "Dr. Okafor", "Marcus Hale" stay names; "Bitten woman", "Peddler", "The Hermit" become "the bitten woman" ... */
const GENERIC_WHO = /^(Peddler|Stranger|Caravan|Tollman|Raider|Trapper|Survivor)$/;
function whoName(who) {
  if (!who) return '';
  const bare = who.replace(/^(Dr|Sgt)\. /, '');
  return /^[A-Z][a-z]+( [A-Z][a-z]+)*$/.test(bare) && !GENERIC_WHO.test(who) ? who : 'the ' + who.replace(/^The /, '').replace(/^[A-Z]/, c => c.toLowerCase());
}
/* how an event shows up in the world (cached on the event) */
function placeSpec(e) {
  if (e._ps) return e._ps;
  const o = PLACE[e.id] || {}, pl = e.play, w = e.where || ['any'], who = e.who || '', type = pl ? pl.type : 'talk';
  const inTypes = w.filter(t => INDOOR.includes(t));
  const s = { home: homeOf(e), n: 1, pose: 'stand', engage: 'E', r: 1.8, after: null, prop: null, k: null, tint: null };
  if (w.includes('shelter')) s.at = /Stranger|Tollman|Caravan/.test(who) ? 'gate' : 'yard';
  else if (type === 'race' && !o.at) s.at = 'here';
  else s.at = inTypes.length && inTypes.length === w.filter(t => t !== 'any').length ? (who && type !== 'horde' && type !== 'screamer' ? 'door:' : 'inside:') + inTypes.join(',') : 'road';
  if (type === 'horde' || type === 'screamer') { s.actor = 'zombies'; s.engage = 'near'; s.r = 10; }
  else if (type === 'rescue') { s.actor = 'survivor'; s.engage = 'near'; s.r = 14; }
  else if (type === 'dodge') { s.actor = 'none'; s.prop = 'crates'; s.engage = 'zone'; s.r = 1.7; }
  else if (type === 'lock') { s.actor = 'none'; s.prop = 'safe'; }
  else if (type === 'barter') { s.actor = /Tollm/.test(who) ? 'tollman' : /Kid/.test(who) ? 'kid' : 'survivor'; s.prop = 'crates'; }
  else if (who) s.actor = /Tollman/.test(who) ? 'tollman' : /Raider/.test(who) ? 'raider' : /Girl|Kid|Boy/.test(who) ? 'kid' : /Voice|Haven Relay/.test(who) ? 'none' : 'survivor';
  else s.actor = 'none';
  if (s.actor === 'none' && !s.prop && type === 'talk') s.prop = 'crates';
  Object.assign(s, o);
  if (s.actor === 'raider' && !o.n) s.n = 3;
  s.foes = s.actor === 'zombies' ? ((pl && pl.foes && pl.foes.length ? pl.foes : type === 'screamer' ? ['screamer'] : ['walker', 'walker', 'walker'])) : null;
  if (type === 'rescue' && !s.foes) s.foes = (pl.foes && pl.foes.length ? pl.foes : ['walker', 'walker', 'walker']);
  if (s.verb === undefined) s.verb = type === 'barter' ? `Trade with ${whoName(who) || 'them'}` : s.actor === 'dog' ? 'Approach the dog' : who ? `Talk to ${whoName(who)}` : s.prop ? 'Look closer' : 'Look';
  /* what they call out: the first line of what they say, cut short */
  if (s.lure === undefined) { const t = typeof e.text === 'string' ? e.text : '', m = /^"([^"]+)"/.exec(t); const l = m ? m[1].split(/(?<=[.!?])\s/)[0] : ''; s.lure = l.length > 36 ? l.slice(0, 33).replace(/\s\S*$/, '') + '…' : l; }
  e._ps = s; return s;
}

/* ---------- finding a spot ---------- */
/* BFS path length from the player's tile (cached for that tile) */
let PD_ = { key: '', d: null };
function pathDistFrom(px, py) {
  const sx = Math.floor(px), sy = Math.floor(py), key = sx + ',' + sy + ',' + (WORLD && WORLD.tiles ? WORLD.tiles.length : 0) + ',' + (G ? G.day : 0);
  if (PD_.key === key && PD_.w === WORLD) return PD_.d;
  const d = new Int16Array(W * H).fill(-1); if (sx < 0 || sy < 0 || sx >= W || sy >= H) return d;
  const q = [sy * W + sx]; d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], cx = i % W, cy = (i / W) | 0; if (d[i] > 60) continue;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + a, ny = cy + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx; if (d[j] >= 0 || SOLID.has(WORLD.tiles[j])) continue;
      d[j] = d[i] + 1; q.push(j);
    }
  }
  PD_ = { key, d, w: WORLD }; return d;
}
const walkable = (x, y) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1 && !SOLID.has(tileAt(x, y)) && tileAt(x, y) !== T_WATER;
const openHere = (x, y) => typeof districtOpen !== 'function' || districtOpen(biomeAt(x + 0.5, y + 0.5));
/* the best tile around (px,py) for which ok(x,y) holds: rmin..rmax away, reachable, open, in front of the player if possible */
function scanSpot(px, py, rmin, rmax, ok, o) {
  o = o || {}; const pd = pathDistFrom(px, py), f = G && G.p ? G.p.face || 0 : 0, fx = Math.sin(f), fy = Math.cos(f);
  let best = null, bs = Infinity;
  const x0 = Math.max(1, Math.floor(px - rmax)), x1 = Math.min(W - 2, Math.ceil(px + rmax)), y0 = Math.max(1, Math.floor(py - rmax)), y1 = Math.min(H - 2, Math.ceil(py + rmax));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - px, dy = y + 0.5 - py, d = Math.hypot(dx, dy); if (d < rmin || d > rmax) continue;
    if (!walkable(x, y) || !ok(x, y)) continue;
    if (!o.shelter && inShelter(x + 0.5, y + 0.5)) continue;
    if (!openHere(x, y)) continue;
    const pdv = pd[y * W + x]; if (pdv < 0 || pdv > (o.maxPath || 44)) continue;
    const fwd = d > 0 ? (dx * fx + dy * fy) / d : 1;
    const sc = Math.abs(d - (o.want || (rmin + rmax) / 2)) * 0.35 + (o.anyDir ? 0 : (1 - fwd) * 3) + (pdv - d) * 0.15 + Math.random() * 1.2;
    if (sc < bs) { bs = sc; best = { x: x + 0.5, y: y + 0.5 }; }
  }
  if (best) best.face = Math.atan2(px - best.x, py - best.y);
  return best;
}
const nb4 = [[0, 1], [1, 0], [-1, 0], [0, -1]];
const besideTile = (x, y, ok) => { for (const [a, b] of nb4) if (walkable(x + a, y + b) && (!ok || ok(x + a, y + b))) return { x: x + a + 0.5, y: y + b + 0.5 }; return null; };
const outdoorTile = (x, y) => !indoors(x + 0.5, y + 0.5) && tileAt(x, y) !== T_SHALLOW;
/* the walkable tile just outside a building's door */
function doorSpot(q) { return besideTile(q.x, q.y, (x, y) => !indoors(x + 0.5, y + 0.5)); }
function nearestOf(list, px, py, rmax, spotOf) {
  let best = null, bd = rmax;
  for (const q of list) { const s = spotOf(q); if (!s || !openHere(Math.floor(s.x), Math.floor(s.y))) continue; const d = Math.hypot(s.x - px, s.y - py); if (d < bd && d > 3.5) { bd = d; best = s; } }
  if (best) best.face = Math.atan2(px - best.x, py - best.y);
  return best;
}
function placeFor(e, px, py, ctx) {
  ctx = ctx || {}; const s = placeSpec(e);
  if (s.home) { const h = npcHome(s.home); return h ? Object.assign({}, h, { kind: 'home' }) : null; }
  const [kind, arg] = s.at.split(':'), types = arg ? arg.split(',') : [];
  let r = null;
  const roadish = (x, y) => outdoorTile(x, y);
  switch (kind) {
    case 'here': return null;
    case 'road': r = scanSpot(px, py, 8, 16, roadish) || scanSpot(px, py, 5, 20, roadish, { anyDir: true }); break;
    case 'car': r = scanSpot(px, py, 6, 18, (x, y) => roadish(x, y) && nb4.some(([a, b]) => tileAt(x + a, y + b) === T_CAR)) || scanSpot(px, py, 8, 16, roadish, { anyDir: true }); break;
    case 'wall': r = scanSpot(px, py, 6, 16, (x, y) => roadish(x, y) && nb4.some(([a, b]) => tileAt(x + a, y + b) === T_WALL)) || scanSpot(px, py, 8, 16, roadish, { anyDir: true }); break;
    case 'field': case 'trail': case 'planks': {
      const t = { field: T_FIELD, trail: T_PATH, planks: T_PLANK }[kind];
      r = scanSpot(px, py, 6, 20, (x, y) => tileAt(x, y) === t, { anyDir: true }) || scanSpot(px, py, 8, 16, roadish, { anyDir: true }); break;
    }
    /* the river bridge (rows 38-39 across RIVER_X) and the road just off either end */
    case 'bridge': r = scanSpot(px, py, 6, 22, (x, y) => (y === 38 || y === 39) && Math.abs(x - RIVER_X[1]) <= 5, { anyDir: true }) || scanSpot(px, py, 8, 16, roadish, { anyDir: true }); break;
    case 'water': r = scanSpot(px, py, 5, 20, (x, y) => nb4.some(([a, b]) => tileAt(x + a, y + b) === T_WATER || tileAt(x + a, y + b) === T_SHALLOW), { anyDir: true }); break;
    case 'body': r = nearestOf((WORLD.bodies || []).filter(b => !b.in), px, py, 22, b => besideTile(b.x, b.y, outdoorTile)) || scanSpot(px, py, 8, 16, roadish, { anyDir: true }); break;
    case 'pump': r = nearestOf(WORLD.pumps || [], px, py, 40, q => besideTile(q.x, q.y)); break;
    case 'fire': r = nearestOf(WORLD.fires || [], px, py, 26, f => besideTile(Math.floor(f.x) + 1, Math.floor(f.y)) || besideTile(Math.floor(f.x), Math.floor(f.y))); break;
    case 'deco': r = nearestOf((WORLD.decos || []).filter(d => d.kind === arg), px, py, 30, d => besideTile(d.x, d.y + (d.h || 1), outdoorTile) || besideTile(d.x - 1, d.y, outdoorTile)) || scanSpot(px, py, 6, 18, roadish, { anyDir: true }); break;
    case 'poi': { const q = Object.values(WORLD.pois).find(p => p.label === arg); r = q ? (q.outdoor ? besideTile(q.x, q.y) || { x: q.x + 0.5, y: q.y + 0.5 } : doorSpot(q)) : null; if (r) r.face = Math.atan2(px - r.x, py - r.y); break; }
    case 'door': {
      const qs = Object.values(WORLD.pois).filter(q => !q.outdoor && (!types.length || types.includes(q.type)) && poiOpen(q));
      r = nearestOf(qs, px, py, 28, doorSpot) || scanSpot(px, py, 8, 16, roadish);
      break;
    }
    case 'inside': {
      let bi = ctx.bi != null ? ctx.bi : buildingAt(px, py);
      const okB = i => i >= 0 && WORLD.roofs[i] && !WORLD.roofs[i].closed && (!types.length || types.includes(WORLD.roofs[i].type));
      if (!okB(bi)) { bi = -1; let bd = 26; WORLD.roofs.forEach((rf, i) => { if (!okB(i) || !WORLD.pois[rf.poi] || !poiOpen(WORLD.pois[rf.poi])) return; const d = Math.hypot(rf.x + rf.w / 2 - px, rf.y + rf.h / 2 - py); if (d < bd) { bd = d; bi = i; } }); }
      if (bi >= 0) { const rf = WORLD.roofs[bi]; r = scanSpot(px, py, 2.5, 30, (x, y) => tileAt(x, y) === T_FLOOR && x >= rf.x && x < rf.x + rf.w && y >= rf.y && y < rf.y + rf.h && !containerAt(x, y), { anyDir: true, want: 6 }); }
      if (!r) r = scanSpot(px, py, 8, 16, roadish);
      break;
    }
    case 'tollgate': { const g = WORLD.gate; if (g) r = besideTile(g.x + 2, g.y + 1) || besideTile(g.x - 2, g.y + 1); if (r) r.face = 0; break; }
    case 'gate': { const c = slotCentre('walls'); r = scanSpot(c.x, c.y + 1.5, 0, 2.2, (x, y) => y > WORLD.shelterRect.y1 + 1, { anyDir: true, want: 0.5, maxPath: 999 }); if (r) r.face = Math.PI; break; }
    case 'fence': { const sr = WORLD.shelterRect; r = scanSpot(px, py, 3, 14, (x, y) => (x === sr.x0 - 2 || x === sr.x1 + 3 || y === sr.y0 - 2 || y === sr.y1 + 3) && outdoorTile(x, y), { anyDir: true, maxPath: 999 }); break; }
    case 'hatch': { const h = WORLD.hatch; r = besideTile(h.x - 2, h.y + 1) || besideTile(h.x + 2, h.y + 1) || { x: h.x - 1.5, y: h.y + 1.5 }; r = { x: r.x, y: r.y, face: 0 }; break; } /* beside the hatch, not on its E spot */
    case 'yard': { const h = WORLD.hatch; r = { x: h.x + 0.5, y: h.y + 2, face: 0 }; break; }
    case 'follow': { const f = G.p.face || 0; r = scanSpot(px - Math.sin(f) * 8, py - Math.cos(f) * 8, 0, 4, roadish, { anyDir: true, want: 0 }); break; }
    default: r = scanSpot(px, py, 8, 16, roadish);
  }
  return r ? Object.assign(r, { kind }) : null;
}
function containerAt(x, y) { return (WORLD.containers || []).some(c => c.x === x && c.y === y); }

/* ---------- homes: where each arc's person waits (fixed per world) ---------- */
function npcHome(g) {
  if (!WORLD) return null;
  const H_ = WORLD._homes || (WORLD._homes = {});
  if (g in H_) return H_[g];
  const hx = WORLD.hatch.x, hy = WORLD.hatch.y, pois = Object.values(WORLD.pois);
  const nearestType = (t, from) => pois.filter(q => q.type === t && !q.outdoor).sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
  const byLabel = l => pois.find(q => q.label === l);
  const at = (q, dx) => { if (!q) return null; const s = q.outdoor ? (besideTile(q.x, q.y) || { x: q.x + 0.5, y: q.y + 0.5 }) : doorSpot(q); if (!s) return null; const x = s.x + (dx || 0); return walkable(Math.floor(x), Math.floor(s.y)) ? { x, y: s.y } : s; };
  const home = { x: hx, y: hy };
  let s = null;
  switch (g) {
    case 'eli': s = at(nearestType('apartments', home), -1); break;
    case 'ines': s = at(nearestType('hospital', home), 1.5); break;
    case 'doctor': s = at(nearestType('hospital', home), -1.5); break;
    case 'relay': s = at(nearestType('radiotower', home)); break;
    case 'hermit': s = at(nearestType('electronics', home)); break;
    case 'vance': s = at(nearestType('military', home)); break;
    case 'teodor': s = at(byLabel("Teodor's Farm") || nearestType('farm', home)); break;
    case 'no14': s = at(byLabel('No. 14') || nearestType('house', home)); break;
    case 'convoy': s = at(byLabel('Wrecked Convoy')); break;
    case 'pier': s = at(byLabel('Pier 3') || byLabel('Fishing Pier')); break;
    case 'rosa': s = at(nearestType('street', home), 2); break;
    case 'stray': { const p = (WORLD.pumps || []).filter(q => !GATE_OF[biomeAt(q.x + 0.5, q.y + 0.5)]).sort((a, b) => Math.hypot(a.x - hx, a.y - hy) - Math.hypot(b.x - hx, b.y - hy))[0]; s = p ? besideTile(p.x, p.y) : null; break; } /* never behind a closed gate */
    case 'choir': { const p = (WORLD.pumps || []).slice().sort((a, b) => Math.hypot(a.x - 28, a.y - 43) - Math.hypot(b.x - 28, b.y - 43))[0]; s = p ? besideTile(p.x + 1, p.y + 1) || besideTile(p.x, p.y) : null; break; }
    case 'marcus': {
      /* the culvert: the west river bank just below the bridge (rows 38-39) */
      const bx = RIVER_X[0];
      for (const [a, b] of [[-1, 41], [-2, 41], [-1, 42], [-2, 42], [-1, 36], [-2, 36], [-3, 41], [-3, 36]]) if (walkable(bx + a, b)) { s = { x: bx + a + 0.5, y: b + 0.5 }; break; }
      break;
    }
  }
  return (H_[g] = s ? { x: s.x, y: s.y, face: 0 } : null);
}
/* arc steps (and fixed people) waiting at a home within reach: the first eligible step of each group */
function homeEventsNear(px, py, reach) {
  const out = [], seen = new Set();
  for (const e of allEncounters()) {
    const s = placeSpec(e), g = s.home; if (!g || seen.has(g)) continue;
    if (!encEligible(e, null, true)) continue;
    if (s.daily && ((G.day * 7919 + e.id.length * 104729) % 100) / 100 >= s.daily) continue;
    seen.add(g);
    const h = npcHome(g); if (!h || !openHere(Math.floor(h.x), Math.floor(h.y))) continue;
    if (Math.hypot(h.x - px, h.y - py) > (reach || 26)) continue;
    out.push({ enc: e, group: g, spot: Object.assign({ kind: 'home' }, h) });
  }
  return out;
}
/* the survivor a bunker event is about: kept in G.flags[k] while they're still here, else a new pick */
function subject(k) {
  const cur = G.flags[k];
  if (cur && G.survivors.some(s => s === cur || (s.id != null && s.id === cur.id))) return G.survivors.find(s => s === cur || (s.id != null && s.id === cur.id));
  const s = randomSurvivor(); G.flags[k] = s; return s;
}

/* ---------------------------------------------------------------- runtime ---------------------------------------------------------------- */
const Places = (() => {
  const P = { live: [] };
  const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
  const has3D = () => typeof THREE !== 'undefined' && typeof R !== 'undefined' && R && R.scene && typeof Actors !== 'undefined';
  const MAX_HUMANS = 4;
  let uid = 0, homeT = 0, gateNote = 0;

  /* small things to look at: up to three boxes each, shared materials */
  const PROPS = {
    crates: [[0.9, 0.6, 0.7, 0x6b5a40, 0, 0.3, 0], [0.6, 0.45, 0.55, 0x7a6648, 0.1, 0.82, 0]],
    shelf: [[1.4, 0.18, 0.5, 0x5a4a38, 0, 0.35, 0.4], [0.18, 0.8, 0.5, 0x4a3c2e, -0.6, 0.4, 0.4]],
    safe: [[0.7, 0.75, 0.6, 0x3c4246, 0, 0.375, 0], [0.12, 0.12, 0.04, 0xb8b0a0, 0.18, 0.5, 0.31]],
    locker: [[0.7, 1.6, 0.45, 0x47524a, 0, 0.8, 0], [0.04, 0.3, 0.04, 0xb8b0a0, 0.2, 0.9, 0.24]],
    shutter: [[1.6, 1.5, 0.12, 0x6e6a62, 0, 0.75, 0], [1.6, 0.08, 0.14, 0x8a8478, 0, 1.2, 0]],
    cage: [[1.2, 1.4, 0.06, 0x7d7f80, 0, 0.7, 0.4], [0.06, 1.4, 0.8, 0x7d7f80, -0.6, 0.7, 0]],
    brick: [[0.35, 0.18, 0.2, 0xa0563c, 0, 0.9, 0], [0.5, 0.06, 0.06, 0xd8c8a0, 0, 0.75, 0.08]],
    pump: [[0.18, 0.9, 0.18, 0x6a3a26, 0, 0.45, 0], [0.5, 0.08, 0.08, 0x6a3a26, 0.2, 0.9, 0]],
    toolbox: [[0.6, 0.3, 0.3, 0xb03a26, 0, 0.15, 0]], tiles: [[1.2, 0.08, 1.0, 0x9a948a, 0, 0.04, 0], [0.5, 0.06, 0.4, 0xb4ae9e, 0.3, 0.1, 0.2]],
    bell: [[0.4, 0.45, 0.4, 0x8a6a2a, 0, 1.6, 0], [0.7, 0.4, 0.5, 0x7a7a70, 0, 0.2, 0]],
    chute: [[1.1, 0.8, 0.8, 0x5d6b3a, 0, 0.4, 0], [1.6, 0.04, 1.4, 0xd8d0be, 0.4, 0.02, 0.5]],
    speaker: [[0.6, 0.5, 0.4, 0x222222, 0, 1.6, 0]], cart: [[1.2, 0.5, 0.7, 0x5a4632, 0, 0.45, 0], [0.08, 0.5, 0.5, 0x3a2e22, 0.62, 0.25, 0]],
    trolley: [[0.8, 0.5, 0.5, 0x9aa0a4, 0, 0.6, 0], [0.7, 0.04, 0.45, 0x707478, 0, 0.3, 0]], case: [[0.6, 0.35, 0.25, 0x5a3a26, 0, 0.18, 0]],
    wire: [[2.4, 0.03, 0.03, 0xc0b090, 0, 0.25, 0], [0.18, 0.25, 0.18, 0x9aa0a4, 1.2, 0.12, 0]], radio: [[0.6, 0.35, 0.3, 0x3a3a34, 0, 0.75, 0], [0.04, 0.6, 0.04, 0x8a8a80, 0.2, 1.2, 0]],
    mirror: [[0.7, 0.9, 0.05, 0xb8c4c8, 0, 1.3, 0], [0.75, 0.95, 0.03, 0x4a3c2e, 0, 1.3, -0.03]], ripples: [[0.6, 0.02, 0.6, 0xc8d8e0, 0, 0.03, 0]],
    tracks: [[0.2, 0.02, 0.3, 0x3a2e22, 0, 0.02, 0], [0.2, 0.02, 0.3, 0x3a2e22, 0.3, 0.02, 0.5]], note: [[0.5, 0.3, 0.4, 0xc8b890, 0, 0.15, 0], [0.3, 0.02, 0.22, 0xf0e8d0, 0, 0.31, 0]],
    chimes: [[0.04, 1.2, 0.04, 0xb8b0a0, 0, 1.6, 0], [0.04, 0.9, 0.04, 0xb8b0a0, 0.18, 1.7, 0], [0.04, 1.0, 0.04, 0xb8b0a0, -0.18, 1.65, 0]],
    rabbit: [[0.22, 0.3, 0.18, 0xd8d0c4, 0, 0.6, 0], [0.06, 0.18, 0.04, 0xd8d0c4, 0.05, 0.85, 0]], boards: [[1.4, 0.18, 0.06, 0x7a6648, 0, 1.0, 0], [1.4, 0.18, 0.06, 0x6b5a40, 0, 1.4, 0]],
    tins: [[0.14, 0.18, 0.14, 0xb8b0a0, 0, 0.09, 0], [0.14, 0.18, 0.14, 0xa0988a, 0.2, 0.09, 0]], ledger: [[0.9, 0.7, 0.5, 0x5a4632, 0, 0.35, 0], [0.4, 0.06, 0.3, 0x2a3a5a, 0, 0.73, 0]],
    trap: [[0.12, 0.14, 0.12, 0xf0e8d8, 0, 0.07, 0], [0.04, 0.02, 0.3, 0xb8b0a0, 0.1, 0.15, 0]], vial: [[0.9, 0.7, 0.5, 0x5a4632, 0, 0.35, 0], [0.06, 0.16, 0.06, 0xa8e0d8, 0, 0.78, 0]],
    lantern: [[0.18, 0.26, 0.18, 0xffb067, 0, 1.2, 0.3]], grave: [[0.5, 0.8, 0.12, 0x8a8478, 0, 0.4, 0], [0.9, 0.12, 1.4, 0x4a3a2a, 0, 0.06, 0.6]],
    ladder: [[0.06, 2.2, 0.06, 0x7a6648, -0.25, 1.1, 0], [0.06, 2.2, 0.06, 0x7a6648, 0.25, 1.1, 0], [0.5, 0.05, 0.05, 0x7a6648, 0, 1.1, 0]],
    raft: [[1.6, 0.15, 1.2, 0x6b5a40, 0, 0.08, 0]], cot: [[1.6, 0.3, 0.7, 0x5a6a52, 0, 0.3, 0]], sacks: [[0.6, 0.5, 0.45, 0x9a8a68, 0, 0.25, 0], [0.5, 0.4, 0.4, 0x8a7a5a, 0.4, 0.2, 0.2]],
    dust: [], smoke: [], spray: [], none: [],
  };
  const MATS = {};
  const mat = hex => MATS[hex] || (MATS[hex] = new THREE.MeshLambertMaterial({ color: hex, flatShading: true }));
  function makeProp(kind) {
    const g = new THREE.Group(), list = PROPS[kind] || PROPS.crates;
    for (const [w, h, d, c, x, y, z] of list) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.castShadow = true; g.add(m); }
    if (kind === 'lantern' || kind === 'vial') g.children[g.children.length - 1].material = new THREE.MeshBasicMaterial({ color: kind === 'vial' ? 0xa8e0d8 : 0xffc070 }); /* glows without adding a light */
    return g;
  }
  /* a soft pulsing ring on the ground under small things, so they stand out from the clutter */
  function makeRing() {
    const m = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 32), new THREE.MeshBasicMaterial({ color: 0xffb067, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.06; m.renderOrder = 5; return m;
  }
  function disposeObj(o) {
    if (!o) return;
    o.traverse && o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material && !Object.values(MATS).includes(n.material)) (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => m.dispose()); });
    if (o.parent) o.parent.remove(o);
  }
  const humanKinds = { survivor: 1, kid: 1, raider: 1, tollman: 1 };
  const liveHumans = () => P.live.reduce((n, ev) => n + ev.actors.filter(a => a.human).length, 0);

  function spawnActors(ev) {
    const s = ev.spec, out = [];
    if (s.actor === 'none' || s.actor === 'yard' || !s.actor) return out;
    const n = s.actor === 'zombies' ? s.foes.length : Math.max(1, s.n || 1);
    for (let i = 0; i < n; i++) {
      const kind = s.actor === 'zombies' ? s.foes[i] : s.actor === 'kid' ? 'survivor' : s.actor;
      const opts = s.actor === 'dog' ? { friendly: true, tint: s.tint || 0x8a5a32 } : { tint: s.tint || undefined, scale: s.actor === 'kid' ? 0.72 : 1, mood: s.mood || undefined, k: s.k || undefined };
      const a = safe(() => Actors.make(kind, opts), null); if (!a) continue;
      const ang = (i / Math.max(1, n)) * Math.PI * 2 + 0.6, rr = i ? (s.actor === 'zombies' ? 1.3 : 0.9) : 0;
      let x = ev.x + Math.cos(ang) * rr, y = ev.y + Math.sin(ang) * rr; if (solidAt(x, y)) { x = ev.x; y = ev.y; }
      a.root.position.set(x * TILE, 0, y * TILE); a.root.rotation.y = ev.face || 0;
      R.scene.add(a.root);
      const ent = { a, x, y, kind, human: !!humanKinds[s.actor === 'kid' ? 'kid' : s.actor], z: s.actor === 'zombies', dog: s.actor === 'dog' };
      if (ent.z && s.mood) safe(() => a.mood && a.mood(s.mood));
      if (s.pose === 'sit' && !ent.z) safe(() => a.anim('crouch'));
      out.push(ent);
    }
    return out;
  }
  /* put an event in the world at spot */
  function spawn(enc, spot, ctx) {
    if (!has3D()) return null;
    const s = placeSpec(enc);
    const wantH = s.actor in humanKinds || s.actor === 'kid' ? (s.n || 1) : 0;
    if (wantH && liveHumans() + wantH > MAX_HUMANS) return null;
    const ev = { uid: ++uid, id: enc.id, enc, spec: s, x: spot.x, y: spot.y, face: spot.face || 0, src: (ctx && ctx.src) || 'field', state: 'lure', t: 0, far: 0, sayT: 2 + Math.random() * 3, waveT: 1, actors: [], props: [], ring: null };
    if (s.at === 'yard' && s.subject) { /* a bunker happening: it is about one of the people in the yard */
      const drawn = typeof Combat !== 'undefined' ? Combat.survivors.filter(o => o.ref && o.a) : [];
      if (s.subject !== '_story' && s.subject !== '_sick') { if (drawn.length && !(G.flags[s.subject] && drawn.some(o => o.ref === G.flags[s.subject]))) G.flags[s.subject] = drawn[(Math.random() * drawn.length) | 0].ref; subject(s.subject); }
      ev.who = s.subject === '_story' || s.subject === '_sick' ? null : G.flags[s.subject];
      const h = WORLD.hatch; ev.holdAt = { x: h.x - 1.5, y: h.y + 2.6, pose: s.pose }; /* they wait by the bunker wall, clear of the hatch */
    }
    if (s.name) ev.who = G.survivors.find(o => o.name === s.name) || null; /* an arc person who already lives in the yard */
    ev.actors = spawnActors(ev);
    if (s.prop && s.prop !== 'none') {
      const g = makeProp(s.prop), off = ev.actors.length ? 1.0 : 0;
      g.position.set((ev.x + Math.sin(ev.face + 1.2) * off) * TILE, 0, (ev.y + Math.cos(ev.face + 1.2) * off) * TILE); g.rotation.y = ev.face; R.scene.add(g); ev.props.push(g);
    }
    if (!ev.actors.some(a => a.human || a.dog) && s.engage === 'E') { ev.ring = makeRing(); ev.ring.position.set(ev.x * TILE, 0.06, ev.y * TILE); R.scene.add(ev.ring); }
    if (s.at === 'gate') { /* visitors walk up the road to the gate */
      const sx = ev.x, sy = ev.y; ev.walkFrom = { x: sx, y: sy + 7 };
      for (const a of ev.actors) { a.ox = a.x - ev.x; a.oy = a.y - ev.y; a.x = sx + a.ox; a.y = sy + 7 + a.oy; }
      ev.arrive = 1;
      if (gateNote <= 0) { gateNote = 30; safe(() => UI.toast('Someone is at the gate.', 'story')); }
    }
    P.live.push(ev);
    safe(() => hintOnce('placed', 'Something is happening out there. Walk up to it and press E.'));
    return ev;
  }
  /* an event was rolled: find it a place. false = it has nowhere to be (or the slot is taken) */
  P.offer = function (enc, ctx) {
    ctx = ctx || {};
    if (!enc || !G) return false;
    const s = placeSpec(enc);
    if (s.at === 'here' || !has3D()) { Game.Q.push({ type: 'enc', enc }); return true; }
    if (s.home) return false; /* arc people are met at home */
    if (P.busy(ctx.src)) return false;
    const spot = placeFor(enc, G.p.x, G.p.y, ctx);
    if (!spot) return false;
    return !!spawn(enc, spot, ctx);
  };
  const isBunker = src => src === 'shelter';
  P.busy = src => P.live.some(ev => ev.state === 'lure' && !ev.home && (isBunker(ev.src) === isBunker(src)));
  /* a story scene that happens at a place (the Tollmen's demand at the yard gate): people stand there, E plays the scene */
  P.sceneAt = function (id, o) {
    if (!G || !has3D()) return false;
    if (P.live.some(ev => ev.enc.scene === id)) return true;
    const sc = CONTENT_().story[id], enc = { id: 'scene_' + id, title: sc ? sc.title : id, where: ['shelter'], scene: id, text: '' };
    enc._ps = Object.assign({ at: 'gate', n: 1, pose: 'stand', engage: 'E', r: 1.8, after: null, prop: null, k: null, tint: null, keep: true, foes: null }, o);
    const spot = placeFor(enc, G.p.x, G.p.y, {}); if (!spot) return false;
    return !!spawn(enc, spot, { src: 'shelter' });
  };
  /* dev / scenario helper */
  P.spawn = function (id, ctx) {
    const enc = encById(id); if (!enc || !G) return null;
    const s = placeSpec(enc), spot = s.home ? npcHome(s.home) : placeFor(enc, G.p.x, G.p.y, ctx || {});
    if (!spot) return null;
    const ev = spawn(enc, Object.assign({}, spot), Object.assign({ src: s.at === 'gate' || s.at === 'yard' || s.at === 'hatch' || s.at === 'fence' ? 'shelter' : 'field' }, ctx || {}));
    if (ev && s.home) ev.home = s.home;
    return ev;
  };

  /* ---------- engaging ---------- */
  function engage(ev) {
    if (ev.state !== 'lure' || UI.blocking() || Moments.active) return;
    if (!encEligible(ev.enc, null, true)) { leave(ev); return; }
    ev.state = 'engaged';
    const enc = ev.enc, p = G.p;
    if (enc.scene) { Game.Q.unshift({ type: 'scene', id: enc.scene, ready: true }); for (const a of ev.actors) if (a.human) safe(() => a.a.anim('chat')); after(ev, null); return; }
    for (const a of ev.actors) if (a.human) { a.a.root.rotation.y = Math.atan2(p.x - a.x, p.y - a.y); safe(() => a.a.anim('chat')); }
    ev.before = { surv: G.survivors.length, dog: !!G.dog };
    safe(() => UI.say('pl' + ev.uid, null));
    if (enc.play) {
      const place = { x: ev.x, y: ev.y };
      if (enc.play.type === 'rescue') { const h = ev.actors.find(a => a.human); if (h) { place.actor = h.a; ev.actors.splice(ev.actors.indexOf(h), 1); } }
      for (const a of ev.actors.filter(a => a.z)) { disposeActor(a); ev.actors.splice(ev.actors.indexOf(a), 1); } /* the real dead take their places */
      runEncounter(enc, line => { if (line) UI.toast(line); after(ev, null); }, place);
      if (!Moments.active) after(ev, null);
      return;
    }
    /* a choice: remember which, and let a fight start where these people stand */
    const wrapped = Object.assign({}, enc, { choices: (enc.choices || []).map((c, i) => Object.assign({}, c, {
      success: () => { ev.pick = i; return c.success ? c.success() : ''; },
      fail: () => { ev.pick = i; return c.fail ? c.fail() : (c.success ? c.success() : ''); } })) });
    const orig = Hooks.spawnFight;
    Hooks.spawnFight = (ids, o) => {
      ev.fought = true;
      const hostile = ev.actors.filter(a => a.human && (a.kind === 'raider' || a.kind === 'tollman'));
      const spots = hostile.map(a => ({ x: a.x, y: a.y }));
      for (const a of hostile) { disposeActor(a); ev.actors.splice(ev.actors.indexOf(a), 1); }
      while (spots.length < ids.length) spots.push({ x: ev.x + (Math.random() - 0.5) * 3, y: ev.y + (Math.random() - 0.5) * 3 });
      return Combat.spawnFight(ids, Object.assign({}, o, { at: { x: ev.x, y: ev.y }, spots: spots.filter(q => !solidAt(q.x, q.y)) }));
    };
    G.seenEnc[enc.id] = true;
    UI.encounter(wrapped, () => { Hooks.spawnFight = orig; after(ev, ev.pick); });
  }
  function after(ev, pick) {
    if (ev.state === 'after' || ev.state === 'gone') return;
    ev.state = 'after'; ev.t = 0;
    const s = ev.spec, how = s.after && pick != null ? s.after[pick] : null;
    const recruited = ev.before && G.survivors.length > ev.before.surv, adopted = ev.before && !ev.before.dog && !!G.dog;
    for (const a of ev.actors) {
      a.go = how || (recruited && (a.human || a.dog) ? 'home' : adopted && a.dog ? 'gone' : a.z ? 'gone' : 'leave');
      if (a.go === 'die') safe(() => a.a.die());
      if (a.go === 'gone') { disposeActor(a); a.disposed = true; }
      if (a.go === 'stay' || a.go === 'die') a.keep = true;
    }
    ev.actors = ev.actors.filter(a => !a.disposed);
    for (const g of ev.props) { if (typeof World3D !== 'undefined' && World3D.burst) safe(() => World3D.burst(ev.x, ev.y, 0xb8ab98, 10, 0.8)); disposeObj(g); }
    ev.props = [];
    if (ev.ring) { disposeObj(ev.ring); ev.ring = null; }
  }
  function leave(ev) { ev.state = 'after'; for (const a of ev.actors) a.go = a.z ? 'gone' : 'leave'; ev.actors = ev.actors.filter(a => { if (a.go === 'gone') { disposeActor(a); return false; } return true; }); for (const g of ev.props) disposeObj(g); ev.props = []; if (ev.ring) { disposeObj(ev.ring); ev.ring = null; } }
  function disposeActor(a) { safe(() => { if (a.a.dispose) a.a.dispose(); else if (a.a.root.parent) a.a.root.parent.remove(a.a.root); }); }
  function remove(ev) {
    if (ev.held) { ev.held.hold = null; ev.held = null; }
    for (const a of ev.actors) disposeActor(a); for (const g of ev.props) disposeObj(g); if (ev.ring) disposeObj(ev.ring);
    safe(() => UI.say('pl' + ev.uid, null));
    ev.state = 'gone'; P.live.splice(P.live.indexOf(ev), 1);
  }
  const onScreen = (x, y) => safe(() => { const s = R.tileToScreen(x, y, 1); return s.on && s.x > -40 && s.y > -40 && s.x < innerWidth + 40 && s.y < innerHeight + 40; }, false);

  /* ---------- the dog, when it stays home: in the yard, lying by the bunker wall, up and over to you when you come close ---------- */
  let dogH = null;
  function homeDog(dt) {
    const p = G.p, r = WORLD.shelterRect, cx = (r.x0 + r.x1 + 1) / 2, cy = (r.y0 + r.y1 + 1) / 2;
    const want = !!G.dog && !(G.companion && G.companion.kind === 'dog') && Math.hypot(p.x - cx, p.y - cy) < 25;
    if (!want) { if (dogH) { disposeActor(dogH); dogH = null; } return; }
    if (!dogH) { const a = safe(() => Actors.make('dog', { friendly: true, tint: 0x8a5a32 }), null); if (!a) return; R.scene.add(a.root); const h = WORLD.hatch; dogH = { a, x: h.x + 2.5, y: h.y + 1.6, hx: h.x + 2.5, hy: h.y + 1.6 }; safe(() => a.anim('crouch')); }
    const d = Math.hypot(p.x - dogH.x, p.y - dogH.y), resting = G.dog.restUntil > G.day;
    let tx = dogH.hx, ty = dogH.hy;
    if (!resting && d < 6 && inShelter(p.x, p.y)) { tx = p.x + (dogH.x - p.x) / (d || 1) * 1.4; ty = p.y + (dogH.y - p.y) / (d || 1) * 1.4; }
    const dx = tx - dogH.x, dy = ty - dogH.y, dd = Math.hypot(dx, dy); let spd = 0;
    if (dd > 0.2) { const st = Math.min(dd, 2.2 * dt), nx = dogH.x + dx / dd * st, ny = dogH.y + dy / dd * st; if (!solidAt(nx, ny)) { dogH.x = nx; dogH.y = ny; spd = 2.2; } dogH.a.root.rotation.y = Math.atan2(dx, dy); }
    else if (d < 8) dogH.a.root.rotation.y = Math.atan2(p.x - dogH.x, p.y - dogH.y);
    safe(() => dogH.a.anim(spd ? 'walk' : d < 6 && !resting ? 'idle' : 'crouch'));
    dogH.a.root.position.set(dogH.x * TILE, 0, dogH.y * TILE); safe(() => dogH.a.update(dt, spd));
  }
  /* ---------- per frame ---------- */
  P.update = function (dt) {
    if (!G || !has3D()) return;
    const p = G.p;
    homeDog(dt);
    gateNote -= dt;
    /* arc people at their homes, polled twice a second like the bosses */
    homeT -= dt;
    if (homeT <= 0) {
      homeT = 0.5;
      /* at most two of them around you, and none on day one */
      const ready = G.day >= 2; /* day one is for water, home and a bed */
      const homeNear = P.live.filter(ev => ev.home && ev.state === 'lure' && Math.hypot(ev.x - p.x, ev.y - p.y) < 26).length >= 2;
      if (ready && !(G.encTimer >= 1e6) && !Moments.active && !homeNear) for (const h of homeEventsNear(p.x, p.y, 20)) {
        if (P.live.some(ev => ev.home === h.group || ev.id === h.enc.id)) continue;
        if (onScreen(h.spot.x, h.spot.y) && Math.hypot(h.spot.x - p.x, h.spot.y - p.y) < 12) continue; /* never pop in under your nose */
        const ev = spawn(h.enc, h.spot, { src: 'home' }); if (ev) { ev.home = h.group; break; }
      }
    }
    for (const ev of P.live.slice()) {
      ev.t += dt;
      const d = Math.hypot(ev.x - p.x, ev.y - p.y), s = ev.spec;
      /* a bunker happening follows the person it is about */
      if (ev.who) {
        const o = typeof Combat !== 'undefined' && Combat.survivors.find(q => q.ref === ev.who);
        if (o) { ev.x = o.x; ev.y = o.y; if (ev.state === 'lure') { o.hold = ev.holdAt; ev.held = o; } else if (ev.held) { ev.held.hold = null; ev.held = null; } }
        else if (ev.state === 'lure' && ev.t > 90) { remove(ev); continue; } /* they may be out of sight for a while */
      }
      if (ev.state === 'lure') {
        /* visitors walking up to the gate */
        if (ev.arrive) { let moving = false; for (const a of ev.actors) { const tx = ev.x + (a.ox || 0), ty = ev.y + (a.oy || 0); const dx = tx - a.x, dy = ty - a.y, dd = Math.hypot(dx, dy); if (dd > 0.15) { moving = true; const st = Math.min(dd, 1.5 * dt); a.x += dx / dd * st; a.y += dy / dd * st; a.a.root.rotation.y = Math.atan2(dx, dy); a.a.anim && a.a.anim('walk'); } } if (!moving) { ev.arrive = 0; for (const a of ev.actors) { if (s.pose === 'sit') a.a.anim('crouch'); else a.a.anim('idle'); } safe(() => SFX.play('ui')); } }
        else {
          /* they notice you: turn to face you, wave now and then, call out */
          for (const a of ev.actors) if ((a.human || a.dog) && d < 12) a.a.root.rotation.y = Math.atan2(p.x - a.x, p.y - a.y);
          ev.waveT -= dt;
          if (ev.waveT <= 0 && d > 5 && d < 18 && s.pose !== 'sit') { ev.waveT = 6 + Math.random() * 4; const h = ev.actors.find(a => a.human); if (h) safe(() => h.a.anim('wave')); }
        }
        ev.sayT -= dt;
        const line = s.lure;
        if (line && ev.sayT <= 0 && d < 18 && onScreen(ev.x, ev.y)) { ev.sayT = 10 + Math.random() * 4; ev.sayOn = 3.5; }
        if (ev.sayOn > 0) { ev.sayOn -= dt; safe(() => UI.say('pl' + ev.uid, ev.x, ev.y, ev.sayOn > 0 ? '“' + line + '”' : null)); }
        if (ev.ring) { const k = 1 + Math.sin(ev.t * 3) * 0.08; ev.ring.scale.set(k, k, k); ev.ring.material.opacity = 0.35 + Math.sin(ev.t * 3) * 0.15; }
        /* the dead (and hazards) start when you get close */
        if ((s.engage === 'near' || s.engage === 'zone') && d < s.r && !UI.blocking() && !Moments.active) engage(ev);
        /* missed: it drifts off when you go away for a while, or the moment passes */
        if (d > (ev.home ? 28 : 34)) ev.far += dt; else ev.far = 0;
        /* people at home just go back inside when you leave; they're there again next time you pass */
        const stale = !s.keep && ((!ev.home && ev.t > 300) || ev.far > (ev.home ? 6 : 20) || (ev.t > 1 && !encEligible(ev.enc, null, true)));
        if (stale) { if (onScreen(ev.x, ev.y)) leave(ev); else { remove(ev); continue; } }
      } else if (ev.state === 'after') {
        let any = false;
        for (const a of ev.actors) {
          if (a.keep) { if (d > 30) { disposeActor(a); a.disposed = true; } else any = true; continue; }
          const tgt = a.go === 'home' ? { x: WORLD.hatch.x + 0.5, y: WORLD.hatch.y + 1.5 } : { x: a.x + (a.x - p.x), y: a.y + (a.y - p.y) };
          const dx = tgt.x - a.x, dy = tgt.y - a.y, dd = Math.hypot(dx, dy) || 1, st = Math.min(dd, 1.7 * dt);
          const nx = a.x + dx / dd * st, ny = a.y + dy / dd * st;
          if (!solidAt(nx, ny)) { a.x = nx; a.y = ny; } else { const sx = a.x + dy / dd * st, sy = a.y - dx / dd * st; if (!solidAt(sx, sy)) { a.x = sx; a.y = sy; } }
          a.a.root.rotation.y = Math.atan2(dx, dy); safe(() => a.a.anim('walk'));
          if ((ev.t > 4 && !onScreen(a.x, a.y)) || ev.t > 25 || Math.hypot(a.x - p.x, a.y - p.y) > 24) { disposeActor(a); a.disposed = true; } else any = true;
        }
        ev.actors = ev.actors.filter(a => !a.disposed);
        if (!any) { remove(ev); continue; }
      }
      for (const a of ev.actors) { a.a.root.position.set(a.x * TILE, 0, a.y * TILE); safe(() => a.a.update(dt, ev.arrive || (ev.state === 'after' && !a.keep) ? 1.6 : 0)); }
    }
  };
  /* E targets for the events standing nearby (and the dog at home) */
  P.targets = function (p, d2) {
    const out = [];
    if (dogH && G.dog && d2(dogH.x, dogH.y) < 1.7 * 1.7) {
      const n = G.dog.name, take = !G.companion && companionReady('dog').ok;
      out.push({ key: 'homedog', d: d2(dogH.x, dogH.y) + 0.05, at: { x: dogH.x, y: dogH.y, h: 1.2 }, label: take ? `Take ${n} on runs` : `Pet ${n}`, time: 0,
        act: () => { if (take) { setCompanion('dog'); safe(() => SFX.play('good')); } else { safe(() => SFX.play('ui')); if (G.flags.dog_pet !== G.day) { G.flags.dog_pet = G.day; addMorale(1); } safe(() => UI.toast(`${n} leans into your hand.`, 'dim')); } } });
    }
    for (const ev of P.live) {
      if (ev.state !== 'lure' || ev.arrive || ev.spec.engage !== 'E') continue;
      let bx = ev.x, by = ev.y, bd = d2(ev.x, ev.y);
      for (const a of ev.actors) { const dd = d2(a.x, a.y); if (dd < bd) { bd = dd; bx = a.x; by = a.y; } }
      if (bd > 1.9 * 1.9) continue;
      const verb = String(ev.spec.verb || 'Look').replace('{s}', ev.who && ev.who.name ? ev.who.name : 'them');
      /* someone calling for you wins over the rubble they are sitting next to */
      out.push({ key: 'pl' + ev.uid, d: 0.02 + bd * 0.1, pri: 0.8, at: { x: bx, y: by, h: ev.actors.some(a => a.human) ? 2.3 : 1.3 }, label: verb, time: 0, act: () => engage(ev) });
    }
    return out;
  };
  /* sounds from where the event actually is (ambience.js) */
  P.emitters = function (px, py) {
    const out = [];
    for (const ev of P.live) {
      if (ev.state !== 'lure') continue;
      const d = Math.hypot(ev.x - px, ev.y - py); if (d > 18) continue;
      const g = Math.max(0, 1 - d / 18), s = ev.spec;
      const src = s.snd || (ev.actors.some(a => a.z) ? 'moan' : ev.actors.some(a => a.dog) ? 'growl' : ev.actors.filter(a => a.human).length > 1 ? 'murmur' : null);
      if (src) out.push({ key: 'pl:' + ev.uid, src, reason: `${ev.id} at ${d.toFixed(1)}`, x: ev.x, y: ev.y, gain: 0.42 * g, every: src === 'murmur' ? [3, 8] : [5, 12] });
    }
    return out;
  };
  P.pins = () => P.live.filter(ev => ev.state === 'lure').map(ev => ({ x: ev.x, y: ev.y, z: ev.actors.some(a => a.z) }));
  P.reset = function () { for (const ev of P.live.slice()) remove(ev); P.live.length = 0; homeT = 0; if (dogH) { disposeActor(dogH); dogH = null; } };
  return P;
})();
