/* ===================== MAIN: boot, loop, glue ===================== */
/* Real seconds -> game minutes. Outside: 1s = 1 game minute (a day of light is ~13 real minutes). */
const TIME_SCALE = 1;
const Game = {
  running: false, dead: false, Q: [], showing: false, wave: false, timeAcc: 0, saveTimer: 0,
  target: null, hold: 0, lastTarget: '', fps: 60,
};

function wireHooks() {
  Hooks.log = (msg, cls) => { if (cls === 'story' || cls === 'good' && /Level up|joined|Built|Found the/.test(msg)) UI.toast(msg, cls); };
  Hooks.queue = q => Game.Q.push(q);
  Hooks.onDeath = () => { Game.dead = true; };
  Hooks.flash = k => UI.flash(k);
  Hooks.levelUp = () => { UI.levelUp(); SFX.play('levelup'); gesture('cheer'); World3D.burst && World3D.burst(G.p.x, G.p.y, 0xe8742c, 18, 1.2); };
  Hooks.toast = (t, c) => UI.toast(t, c);
  Hooks.hint = t => UI.hint(t);
  Hooks.unlock = k => UI.onUnlock && UI.onUnlock(k);
  Hooks.spawnFight = (ids, opts) => Combat.spawnFight(ids, opts);
  Hooks.openTrader = () => Game.Q.unshift({ type: 'trader' });
  Hooks.hordeStart = () => startHorde();
  Hooks.finalWave = () => true;
  Hooks.gateOpened = id => { if (typeof Cine !== 'undefined' && Cine.has && Cine.has('gate_' + id)) Game.Q.push({ type: 'cine', id: 'gate_' + id }); }; // a district opens: short cutscene
}

/* ---------- start / continue ---------- */
function startWorld() {
  World3D.build(); World3D.refreshShelter();
  Combat.reset();
  R.follow(G.p.x, G.p.y, G.p.face || 0, true);
  Game.running = true; Game.dead = false; Game.Q = []; Game.showing = false; Game.wave = false; Game.timeAcc = 0; Game.final = null;
  G.atShelter = inShelter(G.p.x, G.p.y); G.isNight = isNight();
  for (const id in G.cont) World3D.setContainerOpened(id, containerState({ id }) === 'empty');
}
Game.newGame = function (name, bg, attrs, worldName) {
  newGame(name || 'Survivor', bg || 'scavenger', attrs || { str: 4, end: 4, per: 4, cha: 4, agi: 4, int: 4 }, worldName);
  startWorld();
  G.seenScenes.intro = true;
  Game.Q.push({ type: 'scene', id: 'intro' });
  saveGame(true);
  /* the backstory intro plays once per browser, before the cold open (pump waits while Cine.active) */
  if (typeof Cine !== 'undefined' && Cine.autoIntro && !Cine.introSeen()) Cine.intro();
};
Game.continueGame = function () { if (!loadGame()) return false; startWorld(); return true; };
/* load one saved world from the title's Worlds list (ended worlds are memorials and do not load) */
Game.loadWorld = function (id) { if (!loadWorld(id)) return false; startWorld(); return true; };
Game.quit = function () { saveGame(true); Game.running = false; Combat.clear(); UI.title(); };

/* ---------- encounter queue ---------- */
function encText(enc) { try { return fmtName(typeof enc.text === 'function' ? enc.text() : enc.text); } catch (e) { return ''; } }
function pump() {
  if (Game.showing || !Game.Q.length || UI.blocking() || cineOn() || Game.dead) return;
  const q = Game.Q[0];
  // physical encounters wait until the current fight or moment is over; story can interrupt anything but a moment
  if ((q.type === 'enc' && (Moments.active || Combat.inFight())) || (q.type !== 'end' && Moments.active)) return;
  Game.Q.shift(); Game.showing = true;
  const done = line => { Game.showing = false; if (line) UI.toast(line); };
  switch (q.type) {
    case 'scene': cineThen(q.id, () => UI.scene(q.id, done)); break;
    case 'summary': UI.summary(q, done); break;
    case 'final': UI.final(done); break;
    case 'end': cineThen(q.id, () => UI.end(q.id)); break;
    case 'cine': cineThen(q.id, () => done()); break;
    case 'trader': UI.barter(null, done); break;
    case 'enc': runEncounter(q.enc, done); break;
    default: done();
  }
}
const cineOn = () => typeof Cine !== 'undefined' && Cine.active;
/* play CUTSCENES[id] once per world (Cine marks G.seenCine), then go on */
function cineThen(id, then) { if (typeof Cine !== 'undefined' && Cine.has && Cine.has(id)) Cine.cutscene(id, then); else then(); }
function runEncounter(enc, done) {
  G.seenEnc[enc.id] = true;
  if (enc.play) {
    UI.banner(enc.title, encText(enc));
    Game.showing = false; // moments play out in the world; Moments.active holds back further encounters
    let e2 = enc;
    if (enc.play.type === 'rescue' && typeof Cine !== 'undefined' && Cine.has && Cine.has('first_rescue')) {
      const pl = enc.play, win = pl.onWin;
      e2 = Object.assign({}, enc, { play: Object.assign({}, pl, { onWin: () => { const r = win ? win() : ''; Game.Q.unshift({ type: 'cine', id: 'first_rescue' }); return r; } }) });
    }
    Moments.start(e2, line => { if (line) UI.toast(line); });
    return;
  }
  UI.encounter(enc, done);
}

/* ---------- interaction (E) ---------- */
function interactTarget() {
  const p = G.p, out = [];
  const d2 = (x, y) => (x - p.x) ** 2 + (y - p.y) ** 2;
  const drop = Combat.nearestDrop(p.x, p.y, 1.3);
  if (drop) out.push({ key: 'drop' + drop.uid, d: d2(drop.x, drop.y), label: `Pick up ${itemName(drop.id)}${drop.qty > 1 ? ' ×' + drop.qty : ''}`, time: 0, act: () => { Combat.pickupDrop(drop); gesture(ITEMS[drop.id] && ITEMS[drop.id].c === 'weapon' ? 'inspect' : 'pickup'); } });
  const c = containerNear(p.x, p.y, 1.45);
  if (c) {
    const st = containerState(c), K = CONTAINERS[c.kind];
    if (st === 'empty') out.push({ key: c.id, d: d2(c.x + 0.5, c.y + 0.5) + 0.2, label: `${K.n} (searched)`, time: -1 });
    else out.push({ key: c.id, d: d2(c.x + 0.5, c.y + 0.5), label: `Search ${K.n}`, time: searchTime(c), hl: ['container', c.id], act: () => openContainer(c) });
  }
  const h = WORLD.hatch;
  if (d2(h.x + 0.5, h.y + 0.5) < 1.6 * 1.6) out.push({ key: 'hatch', d: d2(h.x + 0.5, h.y + 0.5), label: 'Enter the bunker', time: 0, act: () => UI.open('shelter') });
  const g = WORLD.gate;
  if (g && d2(g.x + 0.5, g.y + 0.5) < 1.8 * 1.8) out.push({ key: 'gate', d: d2(g.x + 0.5, g.y + 0.5), label: 'Hail the Tollmen gate', time: 0, act: () => UI.open('tollcamp') });
  const b = WORLD.bus;
  if (b && G.flags.q_bus && !G.flags.bus_ready && d2(b.x + 0.5, b.y + 0.5) < 2.2 * 2.2) {
    if (canRepairBus()) out.push({ key: 'bus', d: d2(b.x + 0.5, b.y + 0.5), label: 'Repair the bus', time: 5, act: () => { repairBus(); SFX.play('build'); } });
    else out.push({ key: 'bus', d: d2(b.x + 0.5, b.y + 0.5), label: 'Bus: needs Engine Parts + 6 Fuel', time: -1 });
  }
  for (const t of extraTargets(p, d2)) out.push(t);
  if (G.atShelter && isUnlocked('build')) {
    for (const k in BUILDINGS) {
      const B = BUILDINGS[k]; if (B.hidden && !(k === 'radio' && G.flags.q_radio)) continue;
      if (bl(k) >= B.max) continue;
      const s = slotCentre(k), dd = d2(s.x, s.y); if (dd > 1.7 * 1.7) continue;
      const chk = canBuild(k), cost = buildCost(k);
      const costTxt = cost ? Object.keys(cost).map(r => `${cost[r]} ${itemName(r)}`).join(', ') : '';
      out.push({ key: 'build' + k, d: dd, label: chk.ok ? `Build ${bl(k) ? bName(k) + ' ' + (bl(k) + 1) : B.n} · ${costTxt}` : `${B.n}: ${chk.why} (${costTxt})`, time: chk.ok ? 2.5 : -1, hl: ['slot', k],
        act: () => { if (build(k)) { World3D.refreshShelter(); SFX.play('build'); UI.toast(`Built ${bName(k)}`, 'good'); } } });
    }
  }
  out.sort((a, b2) => a.d - b2.d);
  return out[0] || null;
}
function openContainer(c) {
  const r = searchContainer(c);
  World3D.setContainerOpened(c.id, true); SFX.play('open'); Combat.noise(G.p.x, G.p.y, 3);
  if (r.empty) UI.toast('Nothing left.', 'dim');
  for (const l of r.loot) UI.toast(l, /left behind|pack full/.test(l) ? 'warn' : 'loot');
  if (!r.empty && !r.loot.length) UI.toast('Nothing useful.', 'dim');
  if (r.lore) UI.toast(r.lore.short ? `${r.lore.title}: ${r.lore.short}` : `Note found: ${r.lore.title} (journal)`, 'story');
  if (r.enc) Game.Q.push({ type: 'enc', enc: r.enc });
  /* a helper with an eye for scavenging finds a little extra when they are close */
  const cc = Combat.companion;
  if (cc && cc.kind === 'survivor' && cc.mode !== 'downed' && !r.empty && Math.hypot(cc.x - G.p.x, cc.y - G.p.y) < 4) { const b = companionScavBonus(c); if (b) UI.toast(cc.name + ' turns up ' + b.replace(/^\+\d+ /, ''), 'loot'); }
}
/* a one-off player gesture (Actors.GESTURES): cheer on level-up, pickup / inspect a new weapon */
function gesture(name) { const pl = typeof Combat !== 'undefined' && Combat.player; if (pl && pl.anim && !Combat.inFight()) pl.anim(name); }
/* everything else E can do: revive or talk to people, siphon wrecks, fill bottles, cook at fires, barricade doors,
   rest on searched furniture, listen to the bunker radio, and (when world.js provides them) notes, bodies, pumps and beds */
function extraTargets(p, d2) {
  const out = [], fx = Math.floor(p.x), fy = Math.floor(p.y), fight = Combat.inFight(), cc = Combat.companion;
  const pt = (x, y) => ({ x: x + 0.5, y: y + 0.5 });
  if (cc && cc.mode === 'downed' && d2(cc.x, cc.y) < 1.7 * 1.7) out.push({ key: 'revive', d: -1, label: `Help ${cc.name} up`, time: 2, act: () => { if (Combat.reviveCompanion()) SFX.play('good'); } });
  if (!fight) {
    for (const s of Combat.survivors) { const dd = d2(s.x, s.y); if (dd < 1.35 * 1.35 && s.ref) out.push({ key: 'talk' + s.id, d: dd + 0.1, label: `Talk to ${s.ref.name}`, time: 0, act: () => UI.talk(s.ref) }); }
    const cs = cc && cc.kind === 'survivor' && cc.mode !== 'downed' ? companionSurvivor() : null;
    if (cs && d2(cc.x, cc.y) < 1.3 * 1.3) out.push({ key: 'talkc', d: d2(cc.x, cc.y) + 0.35, label: `Talk to ${cs.name}`, time: 0, act: () => UI.talk(cs) });
  }
  let car = null, water = null, door = null;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const tx = fx + ox, ty = fy + oy, t = tileAt(tx, ty), dd = d2(tx + 0.5, ty + 0.5);
    if (t === T_CAR && dd < 1.5 * 1.5 && !carSiphoned(tx, ty) && (!car || dd < car.d)) car = { tx, ty, d: dd };
    if ((t === T_WATER || t === T_SHALLOW) && dd < 1.6 * 1.6 && (!water || dd < water.d)) water = { tx, ty, d: dd };
    if (t === T_DOOR && dd < 1.45 * 1.45 && buildingAt(tx + 0.5, ty + 0.5) >= 0 && !inShelter(tx + 0.5, ty + 0.5) && (!door || dd < door.d)) door = { tx, ty, d: dd };
  }
  if (car && !fight) out.push({ key: `car${car.tx},${car.ty}`, d: car.d + 0.3, label: has('hose') ? 'Siphon fuel (hose)' : 'Siphon fuel from the wreck', time: 3, hl: ['point', pt(car.tx, car.ty)],
    act: () => { const r = siphonCar(car.tx, car.ty); Combat.noise(G.p.x, G.p.y, 4); UI.toast(r.text, r.ok ? 'loot' : 'dim'); SFX.play(r.ok ? 'pickup' : 'ui'); if (!r.ok && !has('hose')) hintOnce('hose', 'A Siphon Hose gets fuel out of every wreck. Look in garages and gas stations.'); } });
  const pump = propNear(WORLD.pumps, p.x, p.y, 1.4);
  if ((water || pump) && G.pack.bottle > 0 && !fight) out.push({ key: 'water', d: (pump ? d2(pump.x + 0.5, pump.y + 0.5) : water.d) + 0.5, label: pump ? 'Pump clean water into a bottle' : 'Fill a bottle with dirty water', time: 1.5,
    hl: pump ? ['point', pt(pump.x, pump.y)] : undefined,
    act: () => { const l = fillBottle(!!pump); if (l && pump) Combat.noise(G.p.x, G.p.y, 2); UI.toast(l ? l + (pump ? '' : ' (boil it at a fire)') : 'No room in your pack.', l ? 'loot' : 'warn'); SFX.play(l ? 'pickup' : 'bad'); } });
  const cook = cookOption();
  if (cook && !fight) {
    let fire = null, fd = 1.9 * 1.9;
    for (const f of WORLD.fires || []) { const dd = d2(f.x, f.y); if (dd < fd) { fd = dd; fire = f; } }
    const kit = G.atShelter && bl('kitchen') ? slotCentre('kitchen') : null, kd = kit ? d2(kit.x, kit.y) : 99;
    if (fire || kd < 1.6 * 1.6) out.push({ key: 'cook', d: fire ? fd : kd - 0.2, label: `${cook.label} ${fire ? 'at the fire' : 'on the stove'}`, time: 2.5,
      act: () => { const l = cookAt(); if (l) { UI.toast(l, 'loot'); SFX.play('pickup'); } } });
  }
  if (door) {
    const bar = doorBarred(door.tx, door.ty), inWay = [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].some(([a, b]) => Math.floor(p.x + a) === door.tx && Math.floor(p.y + b) === door.ty);
    if (bar) out.push({ key: 'door', d: door.d + 0.2, label: 'Take down the barricade', time: 1.5, hl: ['point', pt(door.tx, door.ty)],
      act: () => { if (unbarDoor(door.tx, door.ty)) { SFX.play('build'); UI.toast('Barricade down. +1 Wood back', 'dim'); if (World3D.setDoorBar) World3D.setDoorBar(door.tx, door.ty, false); } } });
    else if ((G.pack.wood || 0) >= 2) out.push({ key: 'door', d: door.d + 0.6, label: inWay ? 'Step out of the doorway to barricade it' : 'Barricade the door · 2 Wood', time: inWay ? -1 : 2.5, hl: ['point', pt(door.tx, door.ty)],
      act: () => { if (barDoor(door.tx, door.ty)) { SFX.play('build'); Combat.noise(G.p.x, G.p.y, 3); UI.toast('Door barricaded. Nothing gets through for a while.', 'good'); hintOnce('doorbar', 'Barricaded doors hold the dead back for a few seconds each. E again to take it down.'); if (World3D.setDoorBar) World3D.setDoorBar(door.tx, door.ty, true); } } });
  }
  /* rest an hour on searched furniture (or a bed) inside a building: heals a little, risks an ambush */
  if (!fight && !G.atShelter && indoors(p.x, p.y)) {
    const c = containerNear(p.x, p.y, 1.45), bed = propNear(WORLD.beds, p.x, p.y, 1.4);
    const spot = bed || (c && containerState(c) === 'empty' ? c : null);
    if (spot) out.push({ key: 'rest', d: d2(spot.x + 0.5, spot.y + 0.5) + 0.1, label: bed ? (bed.kind === 'couch' ? 'Rest on the couch an hour' : bed.kind === 'cot' ? 'Rest on the cot an hour' : 'Sleep in the bed an hour') : 'Rest here an hour', time: 1.5,
      hl: bed ? ['point', pt(bed.x, bed.y)] : undefined,
      act: () => { UI.flash('sleep'); const enc = restOutside(); heal(6); UI.toast('An hour of shallow sleep. +6 HP', 'dim'); if (enc) { UI.toast('Something wakes you.', 'warn'); Game.Q.push({ type: 'enc', enc }); } } });
  }
  if (G.atShelter && bl('radio')) { const r = slotCentre('radio'), dd = d2(r.x, r.y); if (dd < 1.6 * 1.6) out.push({ key: 'radio', d: dd, label: 'Listen to the radio', time: 0, act: () => UI.radio() }); }
  const note = propNear(WORLD.notes, p.x, p.y, 1.4);
  if (note) out.push({ key: `note${note.x},${note.y}`, d: d2(note.x + 0.5, note.y + 0.5) + 0.2, label: 'Read the writing', time: 0, hl: ['point', pt(note.x, note.y)], act: () => UI.toast(readNote(note), 'story') });
  const body = propNear(WORLD.bodies, p.x, p.y, 1.4);
  if (body && !(G.bodies && G.bodies[body.x + ',' + body.y]) && !fight) out.push({ key: `body${body.x},${body.y}`, d: d2(body.x + 0.5, body.y + 0.5), label: 'Search the body', time: 2, hl: ['point', pt(body.x, body.y)],
    act: () => { const l = searchBody(body); for (const x of l) UI.toast(x, 'loot'); if (!l.length) UI.toast('Nothing on them.', 'dim'); Combat.noise(G.p.x, G.p.y, 2); if (World3D.setBodySearched) World3D.setBodySearched(body, true); } });
  return out;
}
/* the player kneels and rummages (or hammers) while E is held; stops when released or done */
function holdAnim(name) {
  const pl = typeof Combat !== 'undefined' && Combat.player; if (!pl || !pl.anim) return;
  if (name) { if (Game.holdAnim !== name) { Game.holdAnim = name; pl.anim(name); } }
  else if (Game.holdAnim) { Game.holdAnim = null; pl.anim('stop'); }
}
function updateInteraction(dt) {
  const t = interactTarget();
  const key = t ? t.key : '';
  if (key !== Game.lastTarget) { holdAnim(null); Game.hold = 0; Game.lastTarget = key; World3D.highlight(t && t.hl ? t.hl[0] : null, t && t.hl ? t.hl[1] : null); }
  if (!t) { UI.prompt(null); return; }
  if (t.time < 0) { UI.prompt(t.label, null); INPUT.interactPressed = false; return; }
  if (t.time === 0) {
    UI.prompt('E  ' + t.label, null);
    if (INPUT.interactPressed) { INPUT.interactPressed = false; t.act(); }
    return;
  }
  if (t.hl && t.hl[0] === 'container') hintOnce('search', 'Hold E to search. Perception makes it faster.');
  if (INPUT.interact) {
    Game.hold += dt;
    if (Math.floor(Game.hold * 4) !== Math.floor((Game.hold - dt) * 4)) SFX.play('step');
    UI.prompt('Hold E  ' + t.label, Math.min(1, Game.hold / t.time));
    holdAnim(/^(build|bus|door)/.test(t.key) ? 'hammer' : 'search');
    if (Game.hold >= t.time) { Game.hold = 0; INPUT.interactPressed = false; holdAnim(null); t.act(); Game.lastTarget = ''; }
  } else { Game.hold = Math.max(0, Game.hold - dt * 2); holdAnim(null); UI.prompt('Hold E  ' + t.label, Game.hold > 0 ? Game.hold / t.time : null); }
  INPUT.interactPressed = false;
}

/* ---------- horde nights & the final stand ---------- */
function startHorde() {
  if (Game.wave || G.hordeResult) return;
  Game.wave = true;
  UI.banner('Horde night', 'They are here. Hold the barricades.');
  SFX.play('scream');
  Combat.startWave(hordeWaveSize(), res => {
    Game.wave = false;
    const lines = resolveHorde(res);
    if (lines[0]) UI.toast(lines[0].msg, lines[0].cls);
    World3D.refreshShelter(); saveGame(true);
  });
}
/* an open outdoor tile centre near (x,y), at least minD tiles away (for placing the player in final sequences) */
function openSpot(x, y, minD, maxD) {
  let best = null, bd = 1e9;
  for (let ty = 1; ty < H - 1; ty++) for (let tx = 1; tx < W - 1; tx++) {
    const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y); if (d < minD || d > maxD) continue;
    if (solidAt(tx + 0.5, ty + 0.5) || indoors(tx + 0.5, ty + 0.5) || inShelter(tx + 0.5, ty + 0.5)) continue;
    const t = tileAt(tx, ty), sc = Math.abs(d - (minD + maxD) / 2) + (t === T_ROAD ? 0 : 1.5);
    if (sc < bd) { bd = sc; best = { x: tx + 0.5, y: ty + 0.5 }; }
  }
  return best || { x, y: y + minD };
}
function placePlayer(pt) { G.p.x = pt.x; G.p.y = pt.y; G.p.hp = G.p.maxHp; G.p.sta = G.p.maxSta; G.atShelter = inShelter(pt.x, pt.y); R.follow(G.p.x, G.p.y, G.p.face || 0, true); }

/* The last night, played: 'wave' (hold the bunker), 'cure' (reach KVAL and broadcast), 'storm' (take the Tollmen camp).
   Called by UI.final when chooseFinal returns one of these. Returns true if it started something. */
Game.finalRun = function (kind) {
  if (kind === 'wave') { Game.finalWave(); return true; }
  if (kind === 'cure') {
    const t = nearestPoi('radiotower', G.p.x, G.p.y); if (!t) { UI.end(finishCure(true)); return true; }
    const tower = { x: t.x + 0.5, y: t.y + 1.5 };
    placePlayer(openSpot(tower.x, tower.y, 14, 20));
    Game.final = { kind: 'cure', tower, t: 75, hold: 0, spawnT: 2, need: 6 };
    UI.banner("Okafor's formula", 'Reach KVAL. Hold the transmitter until it is sent.');
    World3D.marker && World3D.marker('final', tower, 0x7fd0ff);
    return true;
  }
  if (kind === 'storm') {
    const g = WORLD.gate; placePlayer(openSpot(g.x + 0.5, g.y + 0.5, 6, 9));
    Game.final = { kind: 'storm' };
    UI.banner("The Warden's chair", 'No more tolls. End it tonight.');
    fight(['warden', 'tollman', 'tollman', 'raider'], { noFlee: true, at: { x: g.x + 0.5, y: g.y + 0.5 },
      onWin: () => { Game.final = null; setTimeout(() => UI.end(finishStorm(true)), 1200); return 'The Warden is down. The camp goes quiet.'; } });
    return true;
  }
  return false;
};
Game.finalWave = function () {
  Game.wave = true;
  const plan = finalWavePlan();
  UI.banner('The great horde', `Everything the city has left is coming. About ${plan.count} of them.`);
  placePlayer({ x: WORLD.hatch.x + 0.5, y: WORLD.hatch.y + 1.5 });
  Combat.startWave(plan.count, res => { Game.wave = false; UI.end(finishStand(res.held)); }, { bonus: plan.bonus, final: true, surges: plan.surges });
};
/* per frame while a 'cure' run is on: timer, pressure, hold E at the transmitter */
function updateFinalRun(dt) {
  const F = Game.final; if (!F || F.kind !== 'cure') return;
  F.t -= dt; UI.timer('Broadcast', Math.max(0, F.t));
  F.spawnT -= dt;
  if (F.spawnT <= 0) { F.spawnT = 7; Combat.spawnFight(pick([['walker', 'walker'], ['runner', 'walker'], ['walker', 'walker', 'walker'], ['brute']]), { at: F.tower }); }
  const d = Math.hypot(G.p.x - F.tower.x, G.p.y - F.tower.y);
  if (d < 1.8) {
    if (INPUT.interact) F.hold += dt; else F.hold = Math.max(0, F.hold - dt);
    UI.momentPrompt && UI.momentPrompt(F.hold > 0 ? 'Broadcasting…' : 'Hold E  Send the formula', F.hold / F.need);
    if (F.hold >= F.need) { Game.final = null; UI.timer(null); UI.momentPrompt && UI.momentPrompt(null); World3D.marker && World3D.marker('final', null); UI.toast('The formula goes out on every frequency.', 'good'); setTimeout(() => UI.end(finishCure(true)), 1200); }
  } else if (UI.momentPrompt) UI.momentPrompt(null);
  if (F.t <= 0 && Game.final) { Game.final = null; UI.timer(null); UI.momentPrompt && UI.momentPrompt(null); World3D.marker && World3D.marker('final', null); UI.end(finishCure(false)); }
}

/* ---------- loop ---------- */
let lastT = 0;
function frame(t) {
  const dt = Math.min(0.05, Math.max(0, (t - (lastT || t)) / 1000)); lastT = t;
  Game.fps = Game.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
  if (Game.running && G) {
    const blocked = UI.blocking() || cineOn();
    if (!blocked && !Game.dead) {
      Combat.update(dt);
      Moments.update(dt);
      updateFinalRun(dt);
      const wasHome = G.atShelter; G.atShelter = inShelter(G.p.x, G.p.y);
      Game.unlockT = (Game.unlockT || 0) + dt; if (wasHome !== G.atShelter || Game.unlockT > 2) { Game.unlockT = 0; checkUnlocks(); }
      Game.timeAcc += dt * TIME_SCALE;
      if (Game.timeAcc >= 1) { const m = Math.floor(Game.timeAcc); Game.timeAcc -= m; advance(m); }
      revealAround(G.p.x, G.p.y, 7);
      if (!Moments.active && !Combat.inFight() && !Game.Q.length) { const e = fieldEncounterRoll(dt); if (e) Game.Q.push({ type: 'enc', enc: e }); }
      updateInteraction(dt);
      if (G.hordeNight && !G.hordeResult && !Game.wave && G.atShelter && (G.hour >= 21 || G.hour < 5)) startHorde();
      Game.saveTimer += dt; if (Game.saveTimer > 60 && !Combat.inFight()) { Game.saveTimer = 0; saveGame(true); }
    } else UI.prompt(null);
    pump();
    if (Game.dead && !Game.deathShown) { Game.deathShown = true; Combat.clear(); const endId = Game.final && Game.final.kind === 'cure' ? finishCure(false) : 'death'; Game.final = null; markEnded(endId); /* the world stays as a memorial */ setTimeout(() => UI.end(endId), 900); }
    const wf = cineOn() ? Cine.worldFocus() : G.p; // during a cutscene: no cutaway / see-through hole around the player
    World3D.update(dt, wf.x, wf.y);
    R.setTime(G.hour, G.minute + Game.timeAcc);
    R.setFlashlight(G.isNight || indoors(G.p.x, G.p.y), G.p.x, G.p.y, G.p.face || 0);
    R.follow(G.p.x, G.p.y, G.p.face || 0);
    R.update(dt);
    if (typeof Cine !== 'undefined') Cine.update(dt); // after R.update: a cutscene owns the camera
    if (typeof Ambience !== 'undefined') Ambience.update(dt);
    UI.update(dt);
    R.render();
  } else if (R.renderer) { R.update(dt); if (typeof Cine !== 'undefined') Cine.update(dt); if (typeof Ambience !== 'undefined') Ambience.update(dt); R.render(); }
  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
function boot() {
  wireHooks();
  R.init(document.getElementById('view'));
  UI.init();
  Combat.init();
  if (typeof Ambience !== 'undefined') Ambience.init();
  /* endings reached outside the queue (final runs, death) get their cutscene first */
  if (typeof Cine !== 'undefined' && !UI.end.__cine) { const end0 = UI.end; UI.end = id => cineThen(id, () => end0(id)); UI.end.__cine = true; }
  UI.title();
  document.addEventListener('visibilitychange', () => { if (document.hidden && Game.running && !Game.dead) saveGame(true); });
  requestAnimationFrame(frame);
}
/* dev helper (console only): jump the story forward to test later acts. __skipTo(2) = radio built; __skipTo(3) = last night. */
window.__skipTo = function (act) {
  if (!G) return;
  give('canned', 10); give('water', 10);
  if (act >= 2) { G.flags.q_radio = true; G.flags.radio_built = true; G.buildings.radio = 1; G.buildings.walls = 1; G.buildings.bed = 2; G.buildings.rain = 1; while (G.survivors.length < 4) recruit(); storyCheck(); }
  if (act >= 3) { G.flags.q_bus = true; G.hordeDay = G.day; G.flags.bus_ready = true; G.pack.haven_map = 1; G.flags.warden_met = true; G.flags.final = false; storyCheck(); }
  World3D.refreshShelter();
  return objective();
};
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot); else boot();
