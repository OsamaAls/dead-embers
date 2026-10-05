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
  Hooks.levelUp = () => { UI.levelUp(); SFX.play('levelup'); };
  Hooks.toast = (t, c) => UI.toast(t, c);
  Hooks.hint = t => UI.hint(t);
  Hooks.unlock = k => UI.onUnlock && UI.onUnlock(k);
  Hooks.spawnFight = (ids, opts) => Combat.spawnFight(ids, opts);
  Hooks.openTrader = () => Game.Q.unshift({ type: 'trader' });
  Hooks.hordeStart = () => startHorde();
  Hooks.finalWave = () => true;
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
Game.newGame = function (name, bg, attrs) {
  newGame(name || 'Survivor', bg || 'scavenger', attrs || { str: 4, end: 4, per: 4, cha: 4, agi: 4, int: 4 });
  startWorld();
  G.seenScenes.intro = true;
  Game.Q.push({ type: 'scene', id: 'intro' });
  saveGame(true);
};
Game.continueGame = function () { if (!loadGame()) return false; startWorld(); return true; };
Game.quit = function () { saveGame(true); Game.running = false; Combat.clear(); UI.title(); };

/* ---------- encounter queue ---------- */
function encText(enc) { try { return fmtName(typeof enc.text === 'function' ? enc.text() : enc.text); } catch (e) { return ''; } }
function pump() {
  if (Game.showing || !Game.Q.length || UI.blocking() || Game.dead) return;
  const q = Game.Q[0];
  // physical encounters wait until the current fight or moment is over; story can interrupt anything but a moment
  if ((q.type === 'enc' && (Moments.active || Combat.inFight())) || (q.type !== 'end' && Moments.active)) return;
  Game.Q.shift(); Game.showing = true;
  const done = line => { Game.showing = false; if (line) UI.toast(line); };
  switch (q.type) {
    case 'scene': UI.scene(q.id, done); break;
    case 'summary': UI.summary(q, done); break;
    case 'final': UI.final(done); break;
    case 'end': UI.end(q.id); break;
    case 'trader': UI.barter(null, done); break;
    case 'enc': runEncounter(q.enc, done); break;
    default: done();
  }
}
function runEncounter(enc, done) {
  G.seenEnc[enc.id] = true;
  if (enc.play) {
    UI.banner(enc.title, encText(enc));
    Game.showing = false; // moments play out in the world; Moments.active holds back further encounters
    Moments.start(enc, line => { if (line) UI.toast(line); });
    return;
  }
  UI.encounter(enc, done);
}

/* ---------- interaction (E) ---------- */
function interactTarget() {
  const p = G.p, out = [];
  const d2 = (x, y) => (x - p.x) ** 2 + (y - p.y) ** 2;
  const drop = Combat.nearestDrop(p.x, p.y, 1.3);
  if (drop) out.push({ key: 'drop' + drop.uid, d: d2(drop.x, drop.y), label: `Pick up ${itemName(drop.id)}${drop.qty > 1 ? ' ×' + drop.qty : ''}`, time: 0, act: () => Combat.pickupDrop(drop) });
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
}
function updateInteraction(dt) {
  const t = interactTarget();
  const key = t ? t.key : '';
  if (key !== Game.lastTarget) { Game.hold = 0; Game.lastTarget = key; World3D.highlight(t && t.hl ? t.hl[0] : null, t && t.hl ? t.hl[1] : null); }
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
    if (Game.hold >= t.time) { Game.hold = 0; INPUT.interactPressed = false; t.act(); Game.lastTarget = ''; }
  } else { Game.hold = Math.max(0, Game.hold - dt * 2); UI.prompt('Hold E  ' + t.label, Game.hold > 0 ? Game.hold / t.time : null); }
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
    const blocked = UI.blocking();
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
    if (Game.dead && !Game.deathShown) { Game.deathShown = true; Combat.clear(); try { localStorage.removeItem(SAVE_KEY); } catch (e) { } const endId = Game.final && Game.final.kind === 'cure' ? finishCure(false) : 'death'; Game.final = null; setTimeout(() => UI.end(endId), 900); }
    World3D.update(dt, G.p.x, G.p.y);
    R.setTime(G.hour, G.minute + Game.timeAcc);
    R.setFlashlight(G.isNight || indoors(G.p.x, G.p.y), G.p.x, G.p.y, G.p.face || 0);
    R.follow(G.p.x, G.p.y, G.p.face || 0);
    R.update(dt);
    UI.update(dt);
    R.render();
  } else if (R.renderer) { R.update(dt); R.render(); }
  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
function boot() {
  wireHooks();
  R.init(document.getElementById('view'));
  UI.init();
  Combat.init();
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
