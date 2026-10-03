/* ===================== UI / RENDER ===================== */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cv = $('#cv'), ctx = cv.getContext('2d'), mm = $('#mm'), mctx = mm.getContext('2d');
let TS = 32, DPR = 1, VW = 0, VH = 0;
const UI = { q: [], open: false, keys: {}, target: null, sprint: false, lastDoor: null, zombies: [], survSprites: {}, invuln: 0, minuteAcc: 0, spawnT: 0, tickerT: 0, running: false, tab: {} };

/* ---------- Canvas sizing ---------- */
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  VW = cv.clientWidth; VH = cv.clientHeight;
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  TS = VW < 720 ? 26 : 32;
}
window.addEventListener('resize', resize);

/* ---------- Input ---------- */
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  UI.keys[e.key.toLowerCase()] = true;
  if (UI.open || !G || !UI.running) return;
  const k = e.key.toLowerCase();
  if (k === 'i') openPack(); else if (k === 'j') openJournal(); else if (k === 'c') openChar(); else if (k === 'r') doRest();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
});
window.addEventListener('keyup', e => { UI.keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { UI.keys = {}; });
cv.addEventListener('pointerdown', e => {
  if (UI.open || !G) return;
  const r = cv.getBoundingClientRect();
  const cam = camera();
  UI.target = { x: (e.clientX - r.left) / TS + cam.x, y: (e.clientY - r.top) / TS + cam.y };
});
$('#b-sprint').onclick = () => { UI.sprint = !UI.sprint; $('#b-sprint').classList.toggle('on', UI.sprint); };
$('#b-pack').onclick = () => openPack();
$('#b-char').onclick = () => openChar();
$('#b-journal').onclick = () => openJournal();
$('#b-rest').onclick = () => doRest();
$('#b-menu').onclick = () => openMenu();

/* ---------- Hooks from engine ---------- */
Hooks.log = (msg, cls) => {
  const t = $('#ticker'); const d = document.createElement('div'); d.className = cls || ''; d.textContent = msg; t.appendChild(d);
  while (t.children.length > 4) t.removeChild(t.firstChild);
};
Hooks.queue = item => { UI.q.push(item); if (!UI.open) nextModal(); };
Hooks.onDeath = () => { if (G.dead) return; G.dead = true; UI.q = [{ type: 'end', id: 'death' }]; };
Hooks.flash = () => { const f = $('#flash'); f.style.opacity = 1; setTimeout(() => f.style.opacity = 0, 250); };
Hooks.levelUp = () => {};

/* ---------- Modal system ---------- */
function showModal(html, wide) { const m = $('#modal'); m.className = wide ? 'wide' : ''; m.innerHTML = html; $('#modal-wrap').hidden = false; UI.open = true; m.scrollTop = 0; const b = m.querySelector('.btn, .choice:not(:disabled)'); if (b) setTimeout(() => b.focus({ preventScroll: true }), 30); }
function closeModal() { $('#modal-wrap').hidden = true; UI.open = false; UI.invuln = 1.6; UI.keys = {}; refreshHUD(); storyCheck(); nextModal(); }
function nextModal() {
  if (UI.open) return;
  if (G && G.dead && !(UI.q[0] && UI.q[0].type === 'end')) UI.q = [{ type: 'end', id: 'death' }];
  const it = UI.q.shift(); if (!it) return;
  if (it.type === 'scene') showScene(it.id);
  else if (it.type === 'enc') showEnc(it.enc);
  else if (it.type === 'summary') showSummary(it);
  else if (it.type === 'final') showFinal();
  else if (it.type === 'end') showEnd(it.id);
  else if (it.type === 'fight') showFight(it.ids, it.opts, it.intro);
  else if (it.type === 'trader') showTrader();
  else if (it.type === 'fn') it.fn();
}
function bind(sel, fn) { const m = $('#modal'); m.querySelectorAll(sel).forEach(el => el.addEventListener('click', e => fn(el, e))); }
function fmtName(s) { return String(s).replace(/\{name\}/g, G ? G.p.name : 'Survivor'); }

/* ---------- Snapshots for showing consequences ---------- */
function snap() { return { hp: G.p.hp, sta: G.p.sta, hunger: G.p.hunger, thirst: G.p.thirst, morale: G.p.morale, inf: G.p.inf, items: Object.assign({}, G.pack), store: Object.assign({}, G.store), surv: G.survivors.length, xp: G.p.xp + G.p.level * 1000 }; }
function deltaChips(a) {
  const b = snap(), out = [];
  const d = (k, lab, cls) => { const v = Math.round(b[k] - a[k]); if (v) out.push(`<span class="chip ${v > 0 ? (cls === 'inv' ? 'bad' : 'good') : (cls === 'inv' ? 'good' : 'bad')}">${v > 0 ? '+' : ''}${v} ${lab}</span>`); };
  d('hp', 'HP'); d('sta', 'Stamina'); d('hunger', 'Food'); d('thirst', 'Water'); d('morale', 'Morale'); d('inf', 'Infection', 'inv'); d('surv', 'Survivor');
  const keys = new Set([...Object.keys(a.items), ...Object.keys(b.items), ...Object.keys(a.store), ...Object.keys(b.store)]);
  for (const k of keys) { const v = ((b.items[k] || 0) + (b.store[k] || 0)) - ((a.items[k] || 0) + (a.store[k] || 0)); if (v) out.push(`<span class="chip ${v > 0 ? 'good' : 'warn'}">${v > 0 ? '+' : ''}${v} ${esc(itemName(k))}</span>`); }
  return out.length ? `<div class="deltas">${out.join('')}</div>` : '';
}

/* ---------- Story scenes ---------- */
function showScene(id) {
  const sc = CONTENT_().story[id] || { title: id, paras: [] };
  showModal(`<div class="eyebrow">Day ${G.day} · ${sceneEyebrow(id)}</div><h2>${esc(fmtName(sc.title))}</h2>
    <div class="prose">${sc.paras.map(p => `<p>${esc(fmtName(p))}</p>`).join('')}</div>
    <div class="row end"><button class="btn" id="m-ok">Continue</button></div>`);
  bind('#m-ok', () => closeModal());
  log(`Story: ${sc.title}`, 'story');
}
function sceneEyebrow(id) { return ({ intro: 'Prologue', first_night: 'Act I · Survive', radio_found: 'Act I · Survive', radio_fixed: 'Act II · Signal', tollmen_demand: 'Act II · Signal', haven_coords: 'Act III · Exodus', horde_warning: 'Act III · Exodus', bus_ready: 'Act III · Exodus', final_choice: 'Act III · The Last Night' })[id] || 'Story'; }

/* ---------- Encounters ---------- */
function safe(fn, fallback) { try { const r = fn(); return r; } catch (e) { console.error(e); return fallback; } }
function showEnc(enc) {
  G.seenEnc[enc.id] = (G.seenEnc[enc.id] || 0) + 1; G.stats.encounters++;
  const text = typeof enc.text === 'function' ? safe(enc.text, '...') : enc.text;
  const choices = enc.choices.map((c, i) => {
    const ok = !c.req || safe(c.req, false);
    let odds = '';
    if (c.check) { const p = Math.round(checkChance(c.check) * 100); odds = `<span class="odds ${p >= 70 ? 'hi' : p < 40 ? 'lo' : ''}">${c.check.attr.toUpperCase()} check · <b>${p}%</b></span>`; }
    if (!ok) odds = `<span class="odds">${esc(c.reqText || 'Unavailable')}</span>`;
    return `<button class="choice" data-i="${i}" ${ok ? '' : 'disabled'}><span>${esc(c.label)}</span>${odds}</button>`;
  }).join('');
  const where = G.atShelter ? 'The bunker' : (UI.curPoi ? UI.curPoi.label : LOCS[districtAt(G.p.x, G.p.y)].n);
  showModal(`<div class="eyebrow">Encounter · ${esc(where)} · ${G.isNight ? 'Night' : 'Day'}</div><h2>${esc(enc.title)}</h2>
    <div class="prose"><p>${esc(fmtName(text))}</p></div><div class="choices">${choices}</div>`);
  bind('.choice', el => {
    const c = enc.choices[+el.dataset.i];
    const before = snap(); PENDING = { fight: null, trader: false };
    let pass = true, p = null;
    if (c.check) { p = checkChance(c.check); pass = Math.random() < p; }
    let res = safe(pass ? (c.success || (() => '')) : (c.fail || c.success || (() => '')), 'Something went wrong.');
    if (typeof res !== 'string') res = '';
    xp(3);
    const tag = c.check ? `<div class="result-tag ${pass ? 'ok' : 'no'}">${pass ? 'SUCCESS' : 'FAILED'} · ${Math.round(p * 100)}%</div>` : '';
    showModal(`<div class="eyebrow">Encounter · ${esc(enc.title)}</div><h2>${esc(c.label)}</h2>${tag}
      <div class="prose"><p>${esc(fmtName(res))}</p></div>${deltaChips(before)}
      <div class="row end"><button class="btn" id="m-ok">${PENDING.fight ? 'Fight' : PENDING.trader ? 'Trade' : 'Continue'}</button></div>`);
    bind('#m-ok', () => {
      if (G.dead) return closeModal();
      if (PENDING.fight) { const f = PENDING.fight; PENDING.fight = null; UI.q.unshift({ type: 'fight', ids: f.ids, opts: f.opts }); }
      else if (PENDING.trader) { PENDING.trader = false; UI.q.unshift({ type: 'trader' }); }
      closeModal();
    });
    refreshHUD();
  });
}

/* ---------- Quick fights ---------- */
function showFight(ids, opts, intro) {
  opts = opts || {};
  const w = weaponOf(), it = w ? ITEMS[w] : null;
  const canShoot = it && it.ammo && G.pack[it.ammo];
  const anyGun = Object.keys(G.pack).find(k => ITEMS[k].ammo && G.pack[ITEMS[k].ammo]);
  if (!canShoot && anyGun) G.p.weapon = anyGun;
  const gun = G.p.weapon && ITEMS[G.p.weapon].ammo && G.pack[ITEMS[G.p.weapon].ammo] ? G.p.weapon : null;
  const human = ids.every(i => !ENEMIES[i].z);
  const counts = {}; ids.forEach(i => counts[i] = (counts[i] || 0) + 1);
  const foes = Object.keys(counts).map(i => `<div class="foe"><b>${esc(ENEMIES[i].n)}${counts[i] > 1 ? ' ×' + counts[i] : ''}</b><span class="muted">${esc(ENEMIES[i].desc || '')}</span></div>`).join('');
  const pc = (p) => `<span class="odds ${p >= 0.7 ? 'hi' : p < 0.4 ? 'lo' : ''}"><b>${Math.round(p * 100)}%</b></span>`;
  const melee = Object.keys(G.pack).filter(k => ITEMS[k].c === 'weapon' && !ITEMS[k].ammo).sort((a, b) => avgDmg(b) - avgDmg(a))[0];
  let html = `<div class="eyebrow">Fight · Day ${G.day}</div><h2>${human ? 'Ambush' : 'The dead are on you'}</h2>
    ${intro ? `<div class="prose"><p>${esc(intro)}</p></div>` : ''}<div class="list" style="gap:6px">${foes}</div><div class="choices">
    <button class="choice" data-a="melee"><span>Fight with ${esc(melee ? ITEMS[melee].n : 'your bare hands')}</span>${pc(fightOdds(ids, 'melee'))}</button>`;
  if (gun) html += `<button class="choice" data-a="shoot"><span>Shoot (${esc(ITEMS[gun].n)}, ${G.pack[ITEMS[gun].ammo]} ${esc(itemName(ITEMS[gun].ammo))}${ITEMS[gun].noise ? ', loud' : ''})</span>${pc(fightOdds(ids, 'shoot'))}</button>`;
  if (human) html += `<button class="choice" data-a="talk"><span>Talk them down</span><span class="odds">CHA check · <b>${Math.round(checkChance({ attr: 'cha', diff: 6 + ids.length - 1 }) * 100)}%</b></span></button>`;
  if (!opts.noFlee) html += `<button class="choice" data-a="flee"><span>Run for it</span>${pc(fleeChance(ids))}</button>`;
  html += `</div><p class="muted mono" style="margin-top:12px">Odds include your weapon, STR, AGI, health and stamina.</p>`;
  showModal(html);
  bind('.choice', el => {
    const a = el.dataset.a, before = snap();
    if (a === 'flee') {
      if (chance(fleeChance(ids))) { tire(8); addNoise(1); return fightResult('You got away', ['You break line of sight and keep running until your lungs burn.'], before); }
      hurt(rnd(4, 9), 'a failed escape'); if (G.dead) return closeModal();
      return showFight(ids, Object.assign({}, opts, { noFlee: true }), 'You stumble. They are on you. No running now.');
    }
    if (a === 'talk') {
      if (chance(checkChance({ attr: 'cha', diff: 6 + ids.length - 1 }))) { xp(10); return fightResult('Talked down', ['You keep your voice level and your hands visible. After a long moment, they lower their weapons and back off.'], before); }
      return showFight(ids, Object.assign({}, opts), 'They laugh at you. Then they charge.');
    }
    const r = resolveFight(ids, a === 'shoot' ? 'shoot' : 'melee');
    if (r.dead) return closeModal();
    let extra = '';
    if (r.won && opts.onWin) { const t = safe(opts.onWin, ''); if (typeof t === 'string') extra = t; }
    fightResult(r.won ? 'Victory' : 'Driven off', r.lines.concat(extra ? [extra] : []), before);
  });
}
function fightResult(title, lines, before) {
  showModal(`<div class="eyebrow">Fight · Aftermath</div><h2>${esc(title)}</h2><ul class="narr">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>${deltaChips(before)}
    <div class="row end"><button class="btn" id="m-ok">Continue</button></div>`);
  bind('#m-ok', () => { if (PENDING.trader) { PENDING.trader = false; UI.q.unshift({ type: 'trader' }); } closeModal(); });
  refreshHUD();
}

/* ---------- Zombie contact ---------- */
const ZMAP = { walker: ['walker_pack', 'corpse_pile', 'horde_edge', 'night_stalkers'], runner: ['lone_runner'], bloater: ['bloater_corridor'], screamer: ['screamer_cry'], brute: ['brute_block'], zdog: ['zdog_pack'] };
function zombieContact(z) {
  const near = UI.zombies.filter(o => o !== z && Math.hypot(o.x - z.x, o.y - z.y) < 2.2);
  UI.zombies = UI.zombies.filter(o => o !== z && !near.includes(o));
  const cands = (ZMAP[z.type] || []).map(encById).filter(e => e && encEligible(e, 'x', true));
  if (cands.length && chance(0.5)) return Hooks.queue({ type: 'enc', enc: pick(cands) });
  const ids = [z.type].concat(near.map(n => n.type)).slice(0, 4);
  const intro = { walker: 'A walker lurches out from behind a wreck, jaw working.', runner: 'Footsteps. Fast ones. A runner is sprinting straight at you.', bloater: 'A swollen bloater waddles into your path, skin stretched and glistening.', screamer: 'A pale screamer opens its mouth wide. You have seconds.', brute: 'The ground shakes. A brute turns its head toward you.', zdog: 'Snarling from the alley. An infected dog, ribs showing, comes low and fast.' }[z.type];
  Hooks.queue({ type: 'fight', ids, opts: {}, intro: intro + (near.length ? ` ${near.length} more follow it.` : '') });
}

/* ---------- Location card ---------- */
function openLocation(key) {
  const poi = WORLD.pois[key], L = LOCS[poi.type];
  UI.curPoi = poi;
  if (poi.type === 'shelter') return openShelter();
  if (poi.type === 'tollcamp') return openTollcamp();
  const st = G.locs[key];
  const pips = '■'.repeat(L.danger) + '□'.repeat(4 - L.danger);
  const stLabel = st.left <= 0 ? 'Picked clean' : `${st.left}/${st.max} good searches left`;
  const sItem = storyItemHere(poi.type);
  let extra = '';
  if (poi.type === 'depot' && G.flags.q_bus && !G.flags.bus_ready) {
    const ok = G.pack.engine_parts && (G.pack.fuel || 0) >= 6;
    extra = `<button class="choice" id="l-bus" ${ok ? '' : 'disabled'}><span>Repair the school bus (4h)</span><span class="odds">${ok ? '<b>Ready</b>' : 'Carry Engine Parts + 6 Fuel'}</span></button>`;
  }
  showModal(`<div class="eyebrow">${esc(L.n)} · Danger ${pips} · ${G.isNight ? 'Night (more loot, more dead)' : 'Day'}</div><h2>${esc(poi.label)}</h2>
    <div class="prose"><p>${esc(L.desc)}</p></div>
    <p class="mono muted">${stLabel}${sItem ? ' · <span style="color:var(--ember-2)">Something you need may be here</span>' : ''}</p>
    <div class="choices">
      <button class="choice" id="l-search"><span>Search the place (1.5h, -10 stamina)</span><span class="odds">PER ${A('per')}</span></button>
      ${extra}
      <button class="choice" id="l-rest"><span>Rest a while (1h)</span><span class="odds">Some risk</span></button>
      <button class="choice" id="l-leave"><span>Leave</span></button>
    </div>`);
  bind('#l-search', () => doSearch(key));
  bind('#l-rest', () => { const before = snap(); const e = restOutside(); if (e) { UI.q.unshift({ type: 'enc', enc: e }); return closeModal(); } refreshHUD(); openLocation(key); });
  bind('#l-leave', () => { UI.curPoi = null; closeModal(); });
  bind('#l-bus', () => { if (repairBus()) closeModal(); });
}
function doSearch(key) {
  const before = snap();
  const r = searchLoc(key);
  if (G.dead) return closeModal();
  refreshHUD();
  showModal(`<div class="eyebrow">${esc(WORLD.pois[key].label)} · Search</div><h2>${r.loot && r.loot.length ? 'You find' : 'Not much'}</h2>
    <div class="prose"><p>${esc(r.text)}</p></div>
    ${r.loot && r.loot.length ? `<div class="deltas">${r.loot.map(l => `<span class="chip ${/left behind|pack full/.test(l) ? 'warn' : 'good'}">${esc(l)}</span>`).join('')}</div>` : ''}
    ${r.lore ? `<h3>Note: ${esc(r.lore.title)}</h3><div class="prose"><p><i>${esc(r.lore.text)}</i></p></div>` : ''}
    ${r.enc ? `<p style="color:var(--blood);font-weight:600;margin-top:14px">You hear something close.</p>` : ''}
    <div class="row end">${r.enc ? '<button class="btn" id="m-enc">Face it</button>' : '<button class="btn ghost" id="m-leave">Leave</button><button class="btn" id="m-again">Search again</button>'}</div>`);
  bind('#m-enc', () => { UI.q.unshift({ type: 'enc', enc: r.enc }); closeModal(); });
  bind('#m-again', () => doSearch(key));
  bind('#m-leave', () => { UI.curPoi = null; closeModal(); });
}

/* ---------- Tollmen camp ---------- */
function openTollcamp() {
  const f = G.flags, before = snap();
  showModal(`<div class="eyebrow">Tollmen Camp · Neutral ground</div><h2>The Warden's Gate</h2>
    <div class="prose"><p>${f.warden_met ? 'The gate guards recognize you. Somewhere inside, the Warden is writing in his ledger.' : 'Two men with shotguns watch you from a tower of welded car doors. A black flag snaps above them. "State your business."'}</p></div>
    <div class="choices">
      <button class="choice" id="t-talk"><span>${f.warden_met ? 'Speak with the Warden' : 'Ask to see the Warden'}</span></button>
      <button class="choice" id="t-pay" ${has('cigs', 10) || has('canned', 4) ? '' : 'disabled'}><span>Pay tribute (10 Cigarettes or 4 Canned Food)</span><span class="odds">Tribute paid: <b>${f.tribute || 0}</b></span></button>
      <button class="choice" id="t-trade"><span>Trade at the camp market</span></button>
      <button class="choice" id="t-leave"><span>Leave</span></button>
    </div>`);
  bind('#t-talk', () => {
    const first = !f.warden_met; f.warden_met = true; xp(first ? 15 : 0);
    const lines = first
      ? ['The Warden is older than you expected. Grey crew cut, reading glasses, a ledger thick as a brick.', '"Everyone pays. Pay, and my boys leave you be. Don\'t, and I write you in red." He taps the page.', f.q_bus ? '"I hear the big one is coming. Funny. Even I can\'t tax the dead."' : '"Come back when you have something worth my time."']
      : [f.q_bus ? '"The horde will be here soon. You have walls. I have guns. Think about that."' : '"Still breathing. Good. Breathing people pay."', f.warden_secret ? 'You think about what Marcus told you. The Warden does not know you know.' : ''];
    showModal(`<div class="eyebrow">The Warden</div><h2>The Ledger</h2><div class="prose">${lines.filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('')}</div><div class="row end"><button class="btn" id="m-ok">Back</button></div>`);
    bind('#m-ok', openTollcamp);
  });
  bind('#t-pay', () => { if (!take('cigs', 10)) take('canned', 4); f.tribute = (f.tribute || 0) + 1; log('You paid tribute to the Tollmen.', 'warn'); openTollcamp(); });
  bind('#t-trade', () => { UI.q.unshift({ type: 'fn', fn: openTollcamp }); UI.q.unshift({ type: 'trader' }); closeModal(); });
  bind('#t-leave', () => closeModal());
}

/* ---------- Shelter ---------- */
function openShelter(tab) {
  tab = tab || UI.tab.shelter || 'base'; UI.tab.shelter = tab;
  const tabs = [['base', 'Bunker'], ['build', 'Build'], ['people', `People (${G.survivors.length})`], ['store', 'Storage'], ['craft', 'Craft']];
  let body = '';
  if (tab === 'base') body = shelterBase();
  else if (tab === 'build') body = shelterBuild();
  else if (tab === 'people') body = shelterPeople();
  else if (tab === 'store') body = shelterStore();
  else if (tab === 'craft') body = shelterCraft();
  showModal(`<div class="eyebrow">Metro Bunker · Line 3 Maintenance · Day ${G.day}, ${String(G.hour).padStart(2, '0')}:${String(G.minute).padStart(2, '0')}</div><h2>Home</h2>
    <div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${k === tab ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}</div>${body}
    <div class="row end"><button class="btn ghost" id="s-close">Head outside</button></div>`, true);
  bind('.tab', el => openShelter(el.dataset.t));
  bind('#s-close', () => { UI.curPoi = null; closeModal(); });
  wireShelter(tab);
}
function shelterBase() {
  const nextHorde = 5 - (G.day % 5), D = defense(), S = hordeStrength() + 5;
  const f = G.flags;
  let leave = '';
  if (f.bus_ready && has('haven_map')) leave = `<button class="btn" id="s-leave">Load the bus and leave for Haven</button>`;
  return `<div class="two">
    <div><h3 style="margin-top:0">Status</h3>
      <div class="li"><span class="nm">Defense</span><b class="mono">${D}</b></div>
      <div class="li"><span class="nm">Next horde night ${bl('tower') ? '' : '<span class="muted">(build a watchtower for warnings)</span>'}</span><b class="mono">${nextHorde === 5 ? 'tonight?' : 'in ' + nextHorde + ' days'} · ~${S}</b></div>
      <div class="li"><span class="nm">Beds</span><b class="mono">${G.survivors.length + 1}/${shelterCap() + 1}</b></div>
      <div class="li"><span class="nm">Food in storage</span><b class="mono">${(G.store.meal || 0) + (G.store.canned || 0) + Math.floor((G.store.veg || 0) / 2)} rations</b></div>
      <div class="li"><span class="nm">Water in storage</span><b class="mono">${G.store.water || 0} clean · ${G.store.dirtywater || 0} dirty</b></div>
      ${G.flags.q_bus ? `<div class="li"><span class="nm" style="color:var(--blood)">The great horde</span><b class="mono">${G.hordeDay - G.day} days</b></div>` : ''}
    </div>
    <div><h3 style="margin-top:0">Rest</h3>
      <p class="muted">Sleep until morning. Bunks restore more stamina and health. Each dawn, your people work, eat and drink.</p>
      <div class="row"><button class="btn" id="s-sleep">${G.hour >= 18 || G.hour < 7 ? "Sleep until 07:00" : "Sleep 8 hours"}</button><button class="btn ghost" id="s-wait">Wait 2 hours</button></div>
      <h3>Supplies</h3><div class="row"><button class="btn ghost sm" id="s-unload">Unload pack into storage</button><button class="btn ghost sm" id="s-eat">Eat &amp; drink from storage</button></div>
      ${leave ? `<h3>Exodus</h3>${leave}` : ''}
    </div></div>`;
}
function costHtml(c) { return `<div class="cost">${Object.keys(c).map(r => `<span class="${has(r, c[r]) ? '' : 'miss'}">${c[r]} ${esc(itemName(r))} <i class="muted">(${count(r)})</i></span>`).join('')}</div>`; }
function shelterBuild() {
  return `<div class="grid">${Object.keys(BUILDINGS).filter(k => !BUILDINGS[k].hidden || (k === 'radio' && G.flags.q_radio)).map(k => {
    const b = BUILDINGS[k], lv = bl(k), c = buildCost(k), chk = canBuild(k);
    return `<div class="card"><div class="row" style="justify-content:space-between"><h4>${esc(lv ? bName(k) : (b.lvNames ? b.lvNames[0] : b.n))}</h4><span class="lv">LV ${lv}/${b.max}</span></div>
      <div class="muted" style="font-size:13px">${esc(b.desc)}${b.workers ? ` Worker slots: ${lv}.` : ''}</div>
      ${c ? costHtml(c) : '<span class="muted mono">Fully built</span>'}
      ${c ? `<button class="btn sm" data-b="${k}" ${chk.ok ? '' : 'disabled'}>${lv ? 'Upgrade' : 'Build'} (2h)</button>${chk.ok ? '' : `<span class="mono muted">${esc(chk.why)}</span>`}` : ''}</div>`;
  }).join('')}</div>`;
}
function jobOptions(s) {
  const opts = [['idle', 'Idle'], ['guard', 'Guard (+defense)'], ['scavenge', 'Scavenge runs']];
  for (const k in BUILDINGS) if (BUILDINGS[k].workers && bl(k)) opts.push([k, `${BUILDINGS[k].n} (${workerCount(k)}/${bl(k)})`]);
  return opts.map(([k, n]) => `<option value="${k}" ${s.job === k ? 'selected' : ''} ${k !== s.job && BUILDINGS[k] && workerCount(k) >= bl(k) ? 'disabled' : ''}>${esc(n)}</option>`).join('');
}
function shelterPeople() {
  if (!G.survivors.length) return `<p class="muted">Nobody else lives here yet. Survivors out in the city can be talked into joining. Charisma helps.</p>`;
  const C = CONTENT_();
  return `<div class="grid">${G.survivors.map(s => {
    const mood = s.morale < 25 ? 'lowmorale' : s.morale > 75 ? 'happy' : s.trait;
    const bark = (C.barks[mood] || C.barks[s.trait] || [''])[s.id % 3] || '';
    const best = Object.keys(s.skills).sort((a, b) => s.skills[b] - s.skills[a])[0];
    return `<div class="card"><div class="row" style="justify-content:space-between"><h4>${esc(s.name)}</h4><span class="lv">${esc(TRAITS[s.trait].n)}</span></div>
      <div class="mono muted">Farm ${s.skills.farm} · Scav ${s.skills.scav} · Build ${s.skills.build} · Med ${s.skills.med} · Fight ${s.skills.combat}</div>
      <div class="row mono"><span>HP</span><div class="meter" style="flex:1"><i style="width:${s.hp}%;background:var(--blood)"></i></div><span>Mood</span><div class="meter" style="flex:1"><i style="width:${s.morale}%"></i></div></div>
      ${bark ? `<div class="muted" style="font-style:italic;font-size:13px">"${esc(bark)}"</div>` : ''}
      <label class="mono muted">Job (best at ${best}) <select data-s="${s.id}" id="job-${s.id}">${jobOptions(s)}</select></label></div>`;
  }).join('')}</div>`;
}
function shelterStore() {
  const rows = (bag, dir) => {
    const ks = Object.keys(bag).filter(k => bag[k] > 0).sort((a, b) => (ITEMS[a].c + a).localeCompare(ITEMS[b].c + b));
    if (!ks.length) return '<p class="muted">Empty.</p>';
    let cat = '', h = '';
    for (const k of ks) { if (ITEMS[k].c !== cat) { cat = ITEMS[k].c; h += `<div class="cat">${CAT_LABEL[cat]}</div>`; } h += `<div class="li"><span class="nm">${esc(itemName(k))}</span><span class="q">${bag[k]}</span><button class="btn ghost sm" data-mv="${dir}" data-k="${k}" data-n="1">${dir === 'in' ? 'Store' : 'Take'} 1</button><button class="btn ghost sm" data-mv="${dir}" data-k="${k}" data-n="all">All</button></div>`; }
    return h;
  };
  return `<div class="two"><div><h3 style="margin-top:0">Your pack <span class="mono muted">${packWeight()}/${carryCap()} kg</span></h3>${rows(G.pack, 'in')}</div><div><h3 style="margin-top:0">Storage</h3>${rows(G.store, 'out')}</div></div>`;
}
function shelterCraft() {
  const wb = bl('bench');
  return `<p class="muted">Workbench level ${wb}. Intellect ${A('int')}. Crafted items go to storage.</p><div class="grid">${RECIPES.map((r, i) => {
    const lock = r.bench > wb ? `Needs Workbench ${r.bench}` : r.int > A('int') ? `Needs Intellect ${r.int}` : '';
    const ok = !lock && Object.keys(r.in).every(k => has(k, r.in[k]));
    return `<div class="card"><h4>${esc(r.label || itemName(r.out))}${r.q > 1 ? ' ×' + r.q : ''}</h4>${ITEMS[r.out].desc ? `<div class="muted" style="font-size:13px">${esc(ITEMS[r.out].desc)}</div>` : ''}${ITEMS[r.out].dmg ? `<div class="mono muted">Damage ${ITEMS[r.out].dmg.join('–')}</div>` : ''}
      ${costHtml(r.in)}<button class="btn sm" data-r="${i}" ${ok ? '' : 'disabled'}>Craft (1h)</button>${lock ? `<span class="mono muted">${lock}</span>` : ''}</div>`;
  }).join('')}</div>`;
}
function wireShelter(tab) {
  bind('#s-sleep', () => { sleep(); refreshHUD(); if (G.dead) return closeModal(); UI.q.push({ type: 'fn', fn: () => openShelter('base') }); closeModal(); });
  bind('#s-wait', () => { advance(120); refreshHUD(); if (G.dead) return closeModal(); if (UI.q.length) { UI.q.push({ type: 'fn', fn: () => openShelter('base') }); closeModal(); } else openShelter('base'); });
  bind('#s-unload', () => { for (const k of Object.keys(G.pack)) { const c = ITEMS[k].c; if (['mat', 'misc', 'story'].includes(c) || (['food', 'water'].includes(c) && G.pack[k] > 2)) { const n = ['food', 'water'].includes(c) ? G.pack[k] - 2 : G.pack[k]; G.store[k] = (G.store[k] || 0) + n; G.pack[k] -= n; if (!G.pack[k]) delete G.pack[k]; } } log('Unloaded your pack into storage.'); openShelter('base'); });
  bind('#s-eat', () => {
    let n = 0;
    while (G.p.hunger < 75 && n < 4) { const f = ['meal', 'canned', 'veg', 'snack'].find(k => has(k)); if (!f) break; eat(f); n++; }
    n = 0; while (G.p.thirst < 75 && n < 4) { const w = ['water', 'dirtywater'].find(k => has(k)); if (!w) break; eat(w); n++; }
    refreshHUD(); openShelter('base');
  });
  bind('#s-leave', () => { UI.q.unshift({ type: 'final' }); closeModal(); });
  bind('[data-b]', el => { if (build(el.dataset.b)) { refreshHUD(); if (UI.q.length) { UI.q.push({ type: 'fn', fn: () => openShelter('build') }); closeModal(); } else openShelter('build'); } });
  bind('[data-r]', el => { const r = RECIPES[+el.dataset.r]; for (const k in r.in) take(k, r.in[k], true); give(r.out, r.q); advance(60); xp(5); log(`Crafted ${r.q} ${itemName(r.out)}.`, 'good'); openShelter('craft'); });
  bind('[data-mv]', el => { const k = el.dataset.k, from = el.dataset.mv === 'in' ? G.pack : G.store, to = el.dataset.mv === 'in' ? G.store : G.pack; const n = el.dataset.n === 'all' ? from[k] : 1; from[k] -= n; to[k] = (to[k] || 0) + n; if (!from[k]) delete from[k]; if (ITEMS[k].c === 'weapon' && to === G.pack) autoEquip(k); if (G.p.weapon && !G.pack[G.p.weapon]) G.p.weapon = Object.keys(G.pack).find(x => ITEMS[x].c === 'weapon') || null; openShelter('store'); });
  $('#modal').querySelectorAll('select[data-s]').forEach(sel => sel.addEventListener('change', () => { const s = G.survivors.find(x => x.id === +sel.dataset.s); s.job = sel.value; log(`${s.name} is now on ${sel.value === 'idle' ? 'rest' : (BUILDINGS[sel.value] ? BUILDINGS[sel.value].n : sel.value)}.`); openShelter('people'); }));
}

/* ---------- Pack ---------- */
function openPack() {
  const ks = Object.keys(G.pack).sort((a, b) => (ITEMS[a].c + a).localeCompare(ITEMS[b].c + b));
  let cat = '', h = '';
  for (const k of ks) {
    const it = ITEMS[k];
    if (it.c !== cat) { cat = it.c; h += `<div class="cat">${CAT_LABEL[cat]}</div>`; }
    let act = '';
    if (it.eat || it.use) act = `<button class="btn sm" data-use="${k}">${it.eat ? (it.c === 'water' ? 'Drink' : 'Eat') : 'Use'}</button>`;
    if (it.c === 'weapon') act = G.p.weapon === k ? '<span class="chip good">Equipped</span>' : `<button class="btn ghost sm" data-eq="${k}">Equip</button>`;
    const info = it.dmg ? ` <span class="mono muted">dmg ${it.dmg.join('–')}${it.ammo ? ', uses ' + itemName(it.ammo) : ''}</span>` : it.desc ? ` <span class="mono muted">${esc(it.desc)}</span>` : '';
    h += `<div class="li"><span class="nm">${esc(it.n)}${info}</span><span class="q">×${G.pack[k]}</span>${act}${it.c !== 'story' ? `<button class="btn ghost sm" data-drop="${k}" title="Drop one">Drop</button>` : ''}</div>`;
  }
  const w = packWeight(), cap = carryCap();
  showModal(`<div class="eyebrow">Pack · Strength ${A('str')}${G.pack.backpack ? ' · Backpack' : ''}</div><h2>What you carry</h2>
    <div class="row mono"><span>${w} / ${cap} kg</span><div class="meter" style="flex:1"><i style="width:${Math.min(100, w / cap * 100)}%"></i></div></div>
    <p class="muted" style="font-size:13px">When the pack is full, loot gets left behind. Strength and a backpack let you carry more. At the bunker you can also use stored supplies.</p>
    ${h || '<p class="muted">Empty.</p>'}<div class="row end"><button class="btn" id="m-ok">Close</button></div>`);
  bind('[data-use]', el => { eat(el.dataset.use); refreshHUD(); openPack(); });
  bind('[data-eq]', el => { G.p.weapon = el.dataset.eq; openPack(); });
  bind('[data-drop]', el => { take(el.dataset.drop, 1); openPack(); });
  bind('#m-ok', () => closeModal());
}

/* ---------- Character ---------- */
function openChar() {
  const p = G.p;
  showModal(`<div class="eyebrow">${esc(BACKGROUNDS[p.bg].n)} · Level ${p.level}</div><h2>${esc(p.name)}</h2>
    <div class="row mono"><span>XP ${p.xp}/${xpNeed()}</span><div class="meter" style="flex:1"><i style="width:${p.xp / xpNeed() * 100}%"></i></div></div>
    ${p.points ? `<p style="color:var(--ember-2);font-weight:600">${p.points} attribute point${p.points > 1 ? 's' : ''} to spend.</p>` : ''}
    ${Object.keys(ATTRS).map(k => `<div class="attr-row"><b>${ATTRS[k].n}</b><span class="muted" style="font-size:13px">${ATTRS[k].d}</span><div class="stepper"><span class="v">${A(k)}</span>${p.points && A(k) < 10 ? `<button data-up="${k}" aria-label="Raise ${ATTRS[k].n}">+</button>` : ''}</div></div>`).join('')}
    <h3>Record</h3><p class="mono muted">Days survived ${G.day} · Dead put down ${G.stats.kills} · Searches ${G.stats.searches} · Encounters ${G.stats.encounters} · Recruited ${G.stats.recruited}</p>
    <div class="row end"><button class="btn" id="m-ok">Close</button></div>`);
  bind('[data-up]', el => { p.attr[el.dataset.up]++; p.points--; recalc(); refreshHUD(); openChar(); });
  bind('#m-ok', () => closeModal());
}

/* ---------- Journal ---------- */
function openJournal() {
  showModal(`<div class="eyebrow">Journal · Day ${G.day}</div><h2>Field notes</h2>
    <div class="card" style="border-color:var(--ember)"><b class="mono" style="color:var(--ember)">CURRENT OBJECTIVE</b><div>${esc(objective())}</div></div>
    ${G.journal.map(j => `<h3>${esc(j.title)} <span class="mono muted">Day ${j.day}</span></h3><div class="prose"><p>${esc(j.text)}</p></div>`).join('') || '<p class="muted">Nothing written yet.</p>'}
    <h3>Recent events</h3><div class="mono muted">${G.log.slice(-14).reverse().map(l => `<div>${esc(l.t)} · ${esc(l.msg)}</div>`).join('')}</div>
    <div class="row end"><button class="btn" id="m-ok">Close</button></div>`);
  bind('#m-ok', () => closeModal());
}

/* ---------- Day summary ---------- */
function showSummary(it) {
  showModal(`<div class="eyebrow">Dawn · Day ${it.day}</div><h2>${it.day % 5 === 0 ? 'After the horde' : 'Another morning'}</h2>
    ${it.lines.length ? it.lines.map(l => `<div class="sumline ${l.cls}">${esc(l.msg)}</div>`).join('') : '<p class="muted">A quiet night. Nobody else lives here to report anything.</p>'}
    ${it.radio ? `<div class="radio">RADIO · ${esc(it.radio)}</div>` : ''}
    <div class="row end"><button class="btn" id="m-ok">Begin the day</button></div>`);
  bind('#m-ok', () => closeModal());
}

/* ---------- Trader ---------- */
function showTrader(tr) {
  tr = tr || UI.trader || (UI.trader = makeTrader());
  const mine = {}; for (const k in G.pack) mine[k] = G.pack[k]; if (G.atShelter) for (const k in G.store) mine[k] = (mine[k] || 0) + G.store[k];
  const sellable = Object.keys(mine).filter(k => ITEMS[k].v > 0 && ITEMS[k].c !== 'story');
  showModal(`<div class="eyebrow">Trader · Charisma ${A('cha')} sets the prices</div><h2>Barter</h2>
    <p>Credit: <b class="mono" style="color:var(--ember-2);font-size:18px">${tr.credit}</b> <span class="muted">· Sell to earn credit, then spend it. Leftover credit is lost when you leave.</span></p>
    <div class="two"><div><h3 style="margin-top:0">Sell yours</h3>${sellable.map(k => `<div class="li"><span class="nm">${esc(itemName(k))}</span><span class="q">×${mine[k]}</span><button class="btn ghost sm" data-sell="${k}">+${sellPrice(k)}</button></div>`).join('') || '<p class="muted">Nothing to sell.</p>'}</div>
    <div><h3 style="margin-top:0">Their goods</h3>${Object.keys(tr.stock).filter(k => tr.stock[k] > 0).map(k => `<div class="li"><span class="nm">${esc(itemName(k))}</span><span class="q">×${tr.stock[k]}</span><button class="btn sm" data-buy="${k}" ${tr.credit >= buyPrice(k) ? '' : 'disabled'}>-${buyPrice(k)}</button></div>`).join('') || '<p class="muted">Sold out.</p>'}</div></div>
    <div class="row end"><button class="btn" id="m-ok">Done trading</button></div>`, true);
  bind('[data-sell]', el => { const k = el.dataset.sell; if (take(k, 1)) { tr.credit += sellPrice(k); } showTrader(tr); });
  bind('[data-buy]', el => { const k = el.dataset.buy; tr.credit -= buyPrice(k); tr.stock[k]--; give(k, 1); showTrader(tr); });
  bind('#m-ok', () => { UI.trader = null; closeModal(); });
}

/* ---------- Final choice & endings ---------- */
function showFinal() {
  G.flags.final = true;
  const sc = CONTENT_().story.final_choice || { title: 'The Last Night', paras: [] };
  const f = G.flags, D = defense() + G.survivors.length * 4, need = 60 + G.day * 2.5;
  const canBus = f.bus_ready && has('haven_map');
  const allyDiff = Math.max(3, 7 - (f.warden_secret ? 2 : 0) - (f.warden_trust ? 2 : 0) - (f.tollmen_secret ? 1 : 0) - Math.min(3, f.tribute || 0) - (G.survivors.length >= 6 ? 1 : 0));
  G.seenScenes.final_choice = true;
  showModal(`<div class="eyebrow">Act III · The Last Night</div><h2>${esc(fmtName(sc.title))}</h2>
    <div class="prose">${sc.paras.map(p => `<p>${esc(fmtName(p))}</p>`).join('')}</div>
    <div class="choices">
      <button class="choice" id="f-bus" ${canBus ? '' : 'disabled'}><span>Load everyone onto the bus and drive north to Haven</span><span class="odds">${canBus ? '<b>Bus ready</b>' : 'Needs a repaired bus and the route map'}</span></button>
      <button class="choice" id="f-stand"><span>Stay. Hold the bunker against the great horde.</span><span class="odds">Defense <b>${D}</b> vs ~${need}</span></button>
      <button class="choice" id="f-ally" ${f.warden_met ? '' : 'disabled'}><span>Go to the Warden. Propose an alliance.</span><span class="odds">${f.warden_met ? `CHA check · <b>${Math.round(checkChance({ attr: 'cha', diff: allyDiff }) * 100)}%</b>` : 'You never met the Warden'}</span></button>
      ${G.day < G.hordeDay ? '<button class="choice" id="f-wait"><span>Not yet. There is still time.</span></button>' : ''}
    </div>`);
  bind('#f-bus', () => { G.endScene = 'end_haven'; showEnd('end_haven'); });
  bind('#f-stand', () => { const ok = D + rnd(-10, 15) >= need; showEnd(ok ? 'end_stand' : 'end_stand_fail'); });
  bind('#f-ally', () => { const ok = chance(checkChance({ attr: 'cha', diff: allyDiff })); showEnd(ok ? 'end_alliance' : 'end_alliance_fail'); });
  bind('#f-wait', () => { G.flags.final = false; closeModal(); });
}
function showEnd(id) {
  const sc = CONTENT_().story[id] || { title: 'The End', paras: [] };
  const good = ['end_haven', 'end_stand', 'end_alliance'].includes(id);
  UI.running = false;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  showModal(`<div class="eyebrow">${good ? 'Ending' : 'Game over'} · Day ${G.day}</div><h2>${esc(fmtName(sc.title))}</h2>
    <div class="prose">${sc.paras.map(p => `<p>${esc(fmtName(p))}</p>`).join('')}</div>
    ${id === 'death' && G.deathCause ? `<p class="mono muted">Killed by ${esc(G.deathCause)}.</p>` : ''}
    <h3>Your story</h3><p class="mono muted">${esc(G.p.name)}, ${esc(BACKGROUNDS[G.p.bg].n)}, level ${G.p.level} · ${G.day} days · ${G.survivors.length} survivors with you · ${G.stats.kills} dead put down · ${G.stats.encounters} encounters · ${Object.keys(G.seenEnc).length} unique</p>
    <div class="row end"><button class="btn" id="m-new">New game</button></div>`);
  bind('#m-new', () => { $('#modal-wrap').hidden = true; UI.open = false; UI.q = []; G = null; showTitle(); });
}

/* ---------- Menu ---------- */
function openMenu() {
  showModal(`<div class="eyebrow">Menu</div><h2>Paused</h2><div class="choices">
    <button class="choice" id="mn-save"><span>Save game</span><span class="odds">Autosaves every dawn</span></button>
    <button class="choice" id="mn-help"><span>How to play</span></button>
    <button class="choice" id="mn-quit"><span>Quit to title</span></button>
    <button class="choice" id="mn-back"><span>Back to the game</span></button></div>`);
  bind('#mn-save', () => { saveGame(); closeModal(); });
  bind('#mn-help', () => showHelp());
  bind('#mn-quit', () => { saveGame(true); $('#modal-wrap').hidden = true; UI.open = false; UI.running = false; showTitle(); });
  bind('#mn-back', () => closeModal());
}
function showHelp() {
  showModal(`<div class="eyebrow">Field manual</div><h2>How to stay alive</h2><div class="prose">
    <p><b>Move</b> with WASD or the arrow keys, or tap or click where you want to walk. Hold Shift (or toggle Sprint) to run. Running burns stamina.</p>
    <p><b>Walk into doors</b> to enter buildings and search them. Searching costs time and stamina. Perception decides how much you find. Night searches pay more and risk more.</p>
    <p><b>The dead</b> wander the streets. Avoid them or face them. Every encounter is a choice, and your attributes set the odds.</p>
    <p><b>Watch your body.</b> Food and water drain every hour. A bite can infect you, and infection kills in about three days without antibiotics.</p>
    <p><b>The bunker</b> is your base. Build there, store loot, sleep, and give jobs to survivors you recruit. Every fifth night a horde attacks, so keep your defenses up.</p>
    <p><b>Follow the story</b> in your Journal. The objective at the top always tells you what to do next.</p></div>
    <div class="row end"><button class="btn" id="m-ok">Got it</button></div>`);
  bind('#m-ok', () => closeModal());
}
function doRest() {
  if (UI.open || !G) return;
  if (G.atShelter) { const k = Object.keys(WORLD.pois).find(k => WORLD.pois[k].type === 'shelter'); return openLocation(k); }
  const before = snap(); const e = restOutside(); refreshHUD();
  if (e) { log('Something found you while you rested.', 'bad'); Hooks.queue({ type: 'enc', enc: e }); }
  else log(`You rest for an hour in a doorway. ${G.isNight ? 'Every sound is a threat.' : ''}`);
}

/* ---------- HUD ---------- */
function bar(lab, v, max, color) { return `<span class="lab">${lab}</span><span class="bar"><i style="transform:scaleX(${clamp(v / max, 0, 1)});background:${color}"></i></span><span class="num">${Math.round(v)}</span>`; }
function refreshHUD() {
  if (!G) return;
  const p = G.p;
  $('#vitals').innerHTML = bar('HP', p.hp, p.maxHp, 'var(--blood)') + bar('STA', p.sta, p.maxSta, 'var(--ember)') + bar('FOOD', p.hunger, 100, 'var(--warn)') + bar('WATER', p.thirst, 100, 'var(--water)') + (p.inf > 0 ? bar('FEVER', p.inf, 100, 'var(--fever)') : bar('MOOD', p.morale, 100, 'var(--good)'));
  const tod = G.isNight ? 'NIGHT' : G.hour < 9 ? 'DAWN' : G.hour >= 18 ? 'DUSK' : 'DAY';
  $('#clock').innerHTML = `DAY ${G.day} · ${String(G.hour).padStart(2, '0')}:${String(G.minute).padStart(2, '0')}<small>${tod}</small>`;
  const chips = [];
  if (p.inf > 0) chips.push(`<span class="chip fever">Infected ${Math.round(p.inf)}%</span>`);
  if (p.status.bleeding) chips.push('<span class="chip bad">Bleeding</span>');
  if (p.status.sick) chips.push('<span class="chip fever">Sick</span>');
  if (p.status.injured) chips.push('<span class="chip bad">Injured</span>');
  if (p.hunger < 15) chips.push('<span class="chip bad">Starving</span>'); else if (p.hunger < 30) chips.push('<span class="chip warn">Hungry</span>');
  if (p.thirst < 15) chips.push('<span class="chip bad">Dehydrated</span>'); else if (p.thirst < 30) chips.push('<span class="chip warn">Thirsty</span>');
  if (p.sta < 10) chips.push('<span class="chip warn">Exhausted</span>');
  if (G.noise >= 4) chips.push('<span class="chip warn">Noisy</span>');
  if (p.points) chips.push(`<span class="chip good">+${p.points} point</span>`);
  if (packWeight() >= carryCap() - 0.5) chips.push('<span class="chip warn">Pack full</span>');
  $('#chips').innerHTML = chips.join('');
  $('#objective').innerHTML = `<b>Objective</b>${esc(objective())}`;
  $('#b-char').classList.toggle('alert', !!p.points);
  $('#b-rest').firstChild.textContent = G.atShelter ? 'Bunker' : 'Rest';
}

/* ---------- World update ---------- */
function camera() { return { x: G.p.x - VW / TS / 2, y: G.p.y - VH / TS / 2 }; }
function tryMove(o, dx, dy, r, isZ) {
  const nx = o.x + dx, ny = o.y + dy;
  const blocked = (x, y) => solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r) || (isZ && inShelter(x, y));
  let moved = 0;
  if (!blocked(nx, o.y)) { o.x = nx; moved += Math.abs(dx); }
  if (!blocked(o.x, ny)) { o.y = ny; moved += Math.abs(dy); }
  return moved;
}
function update(dt) {
  if (!G || UI.open || !UI.running || G.dead) return;
  const p = G.p;
  let mx = 0, my = 0, k = UI.keys;
  if (k.w || k.arrowup) my -= 1; if (k.s || k.arrowdown) my += 1; if (k.a || k.arrowleft) mx -= 1; if (k.d || k.arrowright) mx += 1;
  if (mx || my) UI.target = null;
  else if (UI.target) { const dx = UI.target.x - p.x, dy = UI.target.y - p.y, d = Math.hypot(dx, dy); if (d < 0.15) UI.target = null; else { mx = dx / d; my = dy / d; } }
  const sprint = (k.shift || UI.sprint) && p.sta > 1;
  if (mx || my) {
    const len = Math.hypot(mx, my); mx /= len; my /= len;
    const spd = (sprint ? 6.2 : 3.6) * (p.sta <= 0 ? 0.65 : 1) * (1 + (A('agi') - 3) * 0.03);
    const moved = tryMove(p, mx * spd * dt, my * spd * dt, 0.28);
    if (moved === 0 && UI.target) UI.target = null;
    p.face = Math.atan2(my, mx);
    const tilesMoved = moved;
    UI.minuteAcc += tilesMoved * 2.4;
    const drain = (sprint ? 1.1 : 0.12) * (G.pack.boots ? 0.7 : 1) * (1 - A('end') * 0.03) * tilesMoved;
    p.sta = Math.max(0, p.sta - drain);
    if (sprint) G.noise = Math.min(10, G.noise + 0.03 * tilesMoved);
    if (!G.atShelter) { UI.stepAcc = (UI.stepAcc || 0) + tilesMoved; if (UI.stepAcc >= 1) { G.stepsToEnc -= Math.floor(UI.stepAcc); UI.stepAcc %= 1; } }
    p.moving = true;
  } else p.moving = false;
  if (UI.minuteAcc >= 1) { const m = Math.floor(UI.minuteAcc); UI.minuteAcc -= m; advance(m); if (G.dead) { nextModal(); return; } }
  // tile triggers
  const tx = Math.floor(p.x), ty = Math.floor(p.y), key = tx + ',' + ty;
  G.atShelter = inShelter(p.x, p.y);
  revealAround(p.x, p.y, visRadius());
  if (WORLD.pois[key]) { if (UI.lastDoor !== key) { UI.lastDoor = key; UI.target = null; openLocation(key); return; } }
  else UI.lastDoor = null;
  // random travel encounter
  if (G.stepsToEnc <= 0) { G.stepsToEnc = rnd(45, 80); if (!G.atShelter && chance(0.65)) { const e = pickEncounter(districtAt(p.x, p.y)); if (e) { UI.target = null; Hooks.queue({ type: 'enc', enc: e }); return; } } }
  // zombies
  updateZombies(dt);
  UI.invuln = Math.max(0, UI.invuln - dt);
  UI.hudT = (UI.hudT || 0) + dt; if (UI.hudT > 0.25) { UI.hudT = 0; refreshHUD(); }
}
function visRadius() { const h = G.hour + G.minute / 60; const night = isNight(); return (night ? 5 : (h < 7 || h > 19 ? 7 : 9)) + A('per') * 0.25; }
const ZSPD = { walker: 1.5, runner: 4.6, bloater: 1.1, screamer: 2.2, brute: 1.6, zdog: 4.9 };
function zTarget() { const n = isNight() ? 1 : 0; return Math.min(30, Math.round(6 + G.day * 0.8 + n * 8 + G.noise)); }
function spawnZombie() {
  for (let tries = 0; tries < 12; tries++) {
    const ang = Math.random() * Math.PI * 2, d = 11 + Math.random() * 8;
    const x = G.p.x + Math.cos(ang) * d, y = G.p.y + Math.sin(ang) * d;
    if (x < 1 || y < 1 || x > W - 1 || y > H - 1 || solidAt(x, y) || inShelter(x, y)) continue;
    const dl = LOCS[districtAt(x, y)].danger || 1;
    const types = [['walker', 60], ['zdog', G.day >= 2 ? 9 : 0], ['runner', G.day >= 2 ? 8 + dl * 2 : 0], ['screamer', G.day >= 3 ? 7 : 0], ['bloater', G.day >= 3 ? 6 : 0], ['brute', G.day >= 5 ? 3 + dl : 0]];
    const t = wpick(types, x => x[1])[0];
    UI.zombies.push({ x, y, type: t, dir: Math.random() * 6.28, wt: 0, chase: false, ph: Math.random() * 6 });
    return;
  }
}
function updateZombies(dt) {
  UI.spawnT -= dt; if (UI.spawnT <= 0) { UI.spawnT = 0.7; if (UI.zombies.length < zTarget()) spawnZombie(); }
  const p = G.p, det = 5 + (isNight() ? 2 : 0) + G.noise * 0.45 - (p.moving ? 0 : 1.5);
  UI.zombies = UI.zombies.filter(z => Math.hypot(z.x - p.x, z.y - p.y) < 26);
  for (const z of UI.zombies) {
    const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy);
    z.ph += dt * 4;
    if (d < det && !G.atShelter) z.chase = true; else if (d > det + 6 || G.atShelter) z.chase = false;
    let spd = ZSPD[z.type] * (z.chase ? 1 : 0.35);
    if (z.chase) { z.dir = Math.atan2(dy, dx); }
    else { z.wt -= dt; if (z.wt <= 0) { z.wt = 1 + Math.random() * 3; z.dir = Math.random() * 6.28; if (Math.random() < 0.3) spd = 0; } }
    const m = tryMove(z, Math.cos(z.dir) * spd * dt, Math.sin(z.dir) * spd * dt, 0.3, true);
    if (m === 0 && !z.chase) z.wt = 0;
    if (d < 0.7 && UI.invuln <= 0 && !G.atShelter) { UI.target = null; zombieContact(z); return; }
  }
}

/* ---------- Render ---------- */
const COL = { grass: '#27301f', grass2: '#2c3624', road: '#2b2a28', line: '#5a5444', bridge: '#5a4632', water: '#17323f', water2: '#1f4252', tree: '#1c3a1e', tree2: '#2c5530', rubble: '#4b443c', yard: '#36302a', field: '#3d3220', field2: '#4f6b2a', fog: '#0b0a09' };
const ROOF = { supermarket: '#5d4a3a', hospital: '#6d6a63', police: '#3c4558', gas: '#6b3a2a', factory: '#4a4640', apartments: '#544b5c', electronics: '#3e5250', radiotower: '#4f3d3a', military: '#4a5136', depot: '#5c5030', tollcamp: '#3a2a26', farm: '#6b3b2a', ruin: '#3e3a35' };
function draw(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = COL.fog; ctx.fillRect(0, 0, VW, VH);
  if (!G || !WORLD) return;
  const cam = camera();
  const x0 = Math.floor(cam.x), y0 = Math.floor(cam.y), x1 = Math.ceil(cam.x + VW / TS), y1 = Math.ceil(cam.y + VH / TS);
  const sx = x => (x - cam.x) * TS, sy = y => (y - cam.y) * TS;
  const fog = G._fog, vr = visRadius(), vr2 = vr * vr;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (!fog[y * W + x]) continue;
    const tt = WORLD.tiles[y * W + x], X = sx(x), Y = sy(y);
    drawTile(tt, x, y, X, Y, t);
  }
  // roofs + labels
  for (const r of WORLD.roofs) {
    if (!fog[r.y * W + r.x] && !fog[(r.y + r.h - 1) * W + r.x + r.w - 1]) continue;
    const X = sx(r.x), Y = sy(r.y), w = r.w * TS, h = r.h * TS;
    if (X > VW || Y > VH || X + w < 0 || Y + h < 0) continue;
    ctx.fillStyle = ROOF[r.type] || '#444'; ctx.fillRect(X, Y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 3; ctx.strokeRect(X + 1.5, Y + 1.5, w - 3, h - 3);
    ctx.fillStyle = 'rgba(255,255,255,.04)'; for (let i = 0; i < r.h; i++) ctx.fillRect(X + 4, Y + i * TS + TS / 2, w - 8, 2);
    if (r.type === 'radiotower') { ctx.strokeStyle = '#9a8a7a'; ctx.lineWidth = 2; ctx.beginPath(); const cx = X + w / 2; ctx.moveTo(cx - 10, Y + h - 6); ctx.lineTo(cx, Y + 6); ctx.lineTo(cx + 10, Y + h - 6); ctx.stroke(); ctx.fillStyle = (Math.floor(t / 600) % 2 && G.flags.radio_built) ? '#e33' : '#422'; ctx.beginPath(); ctx.arc(cx, Y + 6, 3, 0, 7); ctx.fill(); }
    if (r.type !== 'ruin') { const L = LOCS[r.type]; ctx.font = `800 ${Math.max(11, TS * 0.42)}px 'Big Shoulders Stencil Display', Impact, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(235,225,206,.78)'; ctx.fillText((L ? L.n : r.type).toUpperCase(), X + w / 2, Y + h / 2 + 5); }
  }
  // POI markers
  for (const k in WORLD.pois) {
    const po = WORLD.pois[k]; if (!fog[po.y * W + po.x]) continue;
    const X = sx(po.x), Y = sy(po.y); if (X < -40 || Y < -40 || X > VW + 40 || Y > VH + 40) continue;
    const st = G.locs[k], quest = storyItemHere(po.type) || (po.type === 'depot' && G.flags.q_bus && !G.flags.bus_ready);
    ctx.fillStyle = '#0d0b09'; ctx.fillRect(X + 5, Y + 4, TS - 10, TS - 6);
    ctx.strokeStyle = quest ? '#f3a15a' : (st && st.left <= 0 ? '#5a5047' : '#e8742c'); ctx.lineWidth = 2; ctx.strokeRect(X + 5, Y + 4, TS - 10, TS - 6);
    ctx.font = `${TS * 0.5}px serif`; ctx.textAlign = 'center'; ctx.fillText(LOCS[po.type].icon, X + TS / 2, Y + TS * 0.72);
    if (quest) { const b = Math.sin(t / 200) * 3; ctx.fillStyle = '#f3a15a'; ctx.beginPath(); ctx.moveTo(X + TS / 2, Y - 14 + b); ctx.lineTo(X + TS / 2 + 6, Y - 6 + b); ctx.lineTo(X + TS / 2, Y + 2 + b); ctx.lineTo(X + TS / 2 - 6, Y - 6 + b); ctx.fill(); }
    if (po.type === 'street' || po.type === 'river' || po.type === 'forest' || po.type === 'farm') { ctx.font = `600 10px 'IBM Plex Mono', monospace`; ctx.fillStyle = 'rgba(235,225,206,.75)'; ctx.fillText(po.label, X + TS / 2, Y - 4); }
  }
  drawShelter(sx, sy, t);
  // zombies
  for (const z of UI.zombies) { const X = sx(z.x), Y = sy(z.y); if (X < -30 || Y < -30 || X > VW + 30 || Y > VH + 30) continue; if (!fog[Math.floor(z.y) * W + Math.floor(z.x)]) continue; const dd = (z.x - G.p.x) ** 2 + (z.y - G.p.y) ** 2; if (dd > vr2 * 1.1) continue; drawZombie(z, X, Y, t); }
  // player
  drawPlayer(sx(G.p.x), sy(G.p.y), t);
  // remembered-but-not-visible dimming
  const g = ctx.createRadialGradient(sx(G.p.x), sy(G.p.y), vr * TS * 0.55, sx(G.p.x), sy(G.p.y), vr * TS);
  const h = G.hour + G.minute / 60;
  const dark = isNight() ? 0.86 : (h < 7 ? 0.6 : h > 19 ? 0.55 : h > 17.5 ? 0.3 : 0.18);
  g.addColorStop(0, 'rgba(6,8,14,0)'); g.addColorStop(1, `rgba(6,8,14,${Math.max(0.55, dark)})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  if (isNight()) { ctx.fillStyle = 'rgba(10,14,30,.25)'; ctx.fillRect(0, 0, VW, VH); }
  else if (h > 17.5 || h < 7.5) { ctx.fillStyle = 'rgba(232,116,44,.08)'; ctx.fillRect(0, 0, VW, VH); }
  // target marker
  if (UI.target) { ctx.strokeStyle = 'rgba(243,161,90,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(UI.target.x), sy(UI.target.y), 6 + Math.sin(t / 150) * 2, 0, 7); ctx.stroke(); }
}
function hash(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }
function drawTile(tt, x, y, X, Y, t) {
  const r = hash(x, y);
  switch (tt) {
    case T_GRASS: ctx.fillStyle = r < 0.5 ? COL.grass : COL.grass2; ctx.fillRect(X, Y, TS + 1, TS + 1); if (r > 0.85) { ctx.fillStyle = '#3a4529'; ctx.fillRect(X + r * 20, Y + (1 - r) * 20, 3, 3); } break;
    case T_ROAD: case T_CAR: ctx.fillStyle = COL.road; ctx.fillRect(X, Y, TS + 1, TS + 1);
      if (r > 0.92) { ctx.fillStyle = '#211f1d'; ctx.beginPath(); ctx.arc(X + TS * r, Y + TS / 2, TS * 0.18, 0, 7); ctx.fill(); }
      if (ROADS_Y.includes(y) && x % 3 === 0) { ctx.fillStyle = COL.line; ctx.fillRect(X + 4, Y + TS - 1, TS * 0.5, 2); }
      if (ROADS_X.includes(x) && y % 3 === 0) { ctx.fillStyle = COL.line; ctx.fillRect(X + TS - 1, Y + 4, 2, TS * 0.5); }
      if (tt === T_CAR) { const c = ['#6b3a2a', '#3c4a55', '#5a5a52', '#4f3b2f'][Math.floor(r * 4)]; const hor = r < 0.5; ctx.fillStyle = c; if (hor) ctx.fillRect(X + 2, Y + 7, TS - 4, TS - 14); else ctx.fillRect(X + 7, Y + 2, TS - 14, TS - 4); ctx.fillStyle = 'rgba(20,30,35,.8)'; if (hor) ctx.fillRect(X + TS * 0.55, Y + 9, TS * 0.22, TS - 18); else ctx.fillRect(X + 9, Y + TS * 0.25, TS - 18, TS * 0.22); }
      break;
    case T_BRIDGE: ctx.fillStyle = COL.bridge; ctx.fillRect(X, Y, TS + 1, TS + 1); ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 4; i++) ctx.fillRect(X, Y + i * TS / 4, TS, 1); break;
    case T_WATER: ctx.fillStyle = COL.water; ctx.fillRect(X, Y, TS + 1, TS + 1); ctx.fillStyle = COL.water2; ctx.fillRect(X + ((t / 60 + r * 30) % TS), Y + r * TS * 0.8, 8, 2); break;
    case T_TREE: ctx.fillStyle = COL.grass; ctx.fillRect(X, Y, TS + 1, TS + 1); ctx.fillStyle = COL.tree; ctx.beginPath(); ctx.arc(X + TS / 2, Y + TS / 2, TS * 0.48, 0, 7); ctx.fill(); ctx.fillStyle = COL.tree2; ctx.beginPath(); ctx.arc(X + TS * 0.42, Y + TS * 0.4, TS * 0.26, 0, 7); ctx.fill(); break;
    case T_RUBBLE: ctx.fillStyle = COL.grass2; ctx.fillRect(X, Y, TS + 1, TS + 1); ctx.fillStyle = COL.rubble; for (let i = 0; i < 4; i++) { const a = hash(x + i, y - i); ctx.fillRect(X + a * (TS - 8), Y + hash(x - i, y + i) * (TS - 8), 6 + a * 4, 4 + a * 3); } break;
    case T_YARD: ctx.fillStyle = COL.yard; ctx.fillRect(X, Y, TS + 1, TS + 1); ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.strokeRect(X + .5, Y + .5, TS, TS); break;
    case T_FIELD: ctx.fillStyle = COL.field; ctx.fillRect(X, Y, TS + 1, TS + 1); ctx.fillStyle = COL.field2; for (let i = 0; i < 3; i++) ctx.fillRect(X + 3, Y + 5 + i * 10, TS - 6, 3); break;
    case T_WALL: ctx.fillStyle = '#4a3a30'; ctx.fillRect(X, Y, TS + 1, TS + 1); ctx.fillStyle = '#5c4a3c'; ctx.fillRect(X + 2, Y + 2, TS - 4, TS / 2 - 3); break;
    case T_DOOR: ctx.fillStyle = COL.road; ctx.fillRect(X, Y, TS + 1, TS + 1); break;
    case T_ROOF: break;
  }
}
const SLOTS = { bed: [1, 1, 2, 1.2], rain: [8, 1, 1, 1], garden: [1, 5, 3, 2], bench: [6, 3, 1.4, 0.9], purifier: [8, 3, 1, 1], kitchen: [6, 5, 1.4, 1], woodshop: [8, 5, 1.4, 1.2], forge: [1, 3, 1.4, 1], infirmary: [4, 5.6, 1.6, 1.2], tower: [9, 0, 1, 1], radio: [5.4, 2.1, 0.6, 0.8] };
function drawShelter(sx, sy, t) {
  const r = WORLD.shelterRect; const X0 = sx(r.x0), Y0 = sy(r.y0);
  if (X0 > VW || Y0 > VH || sx(r.x1 + 1) < 0 || sy(r.y1 + 1) < 0) return;
  const T = TS;
  for (const k in SLOTS) {
    const lv = bl(k); if (!lv) continue;
    const [x, y, w, h] = SLOTS[k]; const X = X0 + x * T, Y = Y0 + y * T;
    ctx.save();
    if (k === 'garden') { ctx.fillStyle = '#3d2f1e'; ctx.fillRect(X, Y, w * T, h * T); ctx.fillStyle = '#6a9a3a'; for (let i = 0; i < 4 + lv * 2; i++) ctx.fillRect(X + 4 + (i % 6) * (w * T - 8) / 6, Y + 6 + Math.floor(i / 6) * 18, 6, 6 + Math.sin(t / 500 + i) * 1.5); }
    else if (k === 'rain') { ctx.fillStyle = '#3c5a6a'; ctx.beginPath(); ctx.arc(X + T / 2, Y + T / 2, T * 0.38, 0, 7); ctx.fill(); ctx.strokeStyle = '#8fb5c8'; ctx.lineWidth = 2; ctx.stroke(); }
    else if (k === 'tower') { ctx.fillStyle = '#5c4532'; ctx.fillRect(X, Y, T, T); ctx.strokeStyle = '#2a1e15'; ctx.lineWidth = 2; ctx.strokeRect(X + 3, Y + 3, T - 6, T - 6); ctx.beginPath(); ctx.moveTo(X + 3, Y + 3); ctx.lineTo(X + T - 3, Y + T - 3); ctx.moveTo(X + T - 3, Y + 3); ctx.lineTo(X + 3, Y + T - 3); ctx.stroke(); }
    else if (k === 'radio') { ctx.strokeStyle = '#b8a890'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X + 6, Y + h * T); ctx.lineTo(X + 6, Y); ctx.stroke(); if (Math.floor(t / 500) % 2) { ctx.fillStyle = '#e33'; ctx.beginPath(); ctx.arc(X + 6, Y, 3, 0, 7); ctx.fill(); } }
    else if (k === 'infirmary') { ctx.fillStyle = '#c8c0b0'; ctx.beginPath(); ctx.moveTo(X, Y + h * T); ctx.lineTo(X + w * T / 2, Y); ctx.lineTo(X + w * T, Y + h * T); ctx.fill(); ctx.fillStyle = '#7a2a22'; ctx.fillRect(X + w * T / 2 - 2, Y + h * T * 0.45, 4, 10); }
    else { const c = { bed: '#5a4636', bench: '#6b5238', purifier: '#4a6070', kitchen: '#5a3a2e', woodshop: '#6b5030', forge: '#4a4440' }[k] || '#555'; ctx.fillStyle = c; ctx.fillRect(X, Y, w * T, h * T); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2; ctx.strokeRect(X + 1, Y + 1, w * T - 2, h * T - 2); if (k === 'forge') { ctx.fillStyle = `rgba(232,116,44,${0.5 + Math.sin(t / 200) * 0.3})`; ctx.fillRect(X + w * T - 10, Y + 4, 6, 6); } }
    ctx.font = `600 9px 'IBM Plex Mono', monospace`; ctx.fillStyle = 'rgba(235,225,206,.7)'; ctx.textAlign = 'left'; if (k !== 'radio') ctx.fillText(BUILDINGS[k].n.toUpperCase() + (lv > 1 ? ' ' + lv : ''), X, Y - 2);
    ctx.restore();
  }
  // walls
  const wl = bl('walls');
  if (wl) {
    ctx.strokeStyle = ['#7a5a3a', '#7d7d78', '#a8a29a'][wl - 1]; ctx.lineWidth = 3 + wl * 2; ctx.setLineDash(wl === 1 ? [10, 6] : wl === 2 ? [4, 3] : []);
    const pad = 2; const L = X0 + pad, Tp = Y0 + pad, R = sx(r.x1 + 1) - pad, B = sy(r.y1 + 1) - pad;
    ctx.beginPath(); ctx.moveTo(L + T * 3.5, B); ctx.lineTo(L, B); ctx.lineTo(L, Tp); ctx.lineTo(R, Tp); ctx.lineTo(R, B); ctx.lineTo(L + T * 5.5, B); ctx.stroke(); ctx.setLineDash([]);
  }
  // fire barrel near hatch
  const hx = X0 + 3.3 * T, hy = Y0 + 2.6 * T; ctx.fillStyle = '#3a2a20'; ctx.beginPath(); ctx.arc(hx, hy, 6, 0, 7); ctx.fill();
  const fl = 0.6 + Math.sin(t / 90) * 0.2 + Math.sin(t / 37) * 0.1; const fg = ctx.createRadialGradient(hx, hy, 0, hx, hy, T * 2.5); fg.addColorStop(0, `rgba(243,140,60,${0.35 * fl})`); fg.addColorStop(1, 'rgba(243,140,60,0)'); ctx.fillStyle = fg; ctx.fillRect(hx - T * 3, hy - T * 3, T * 6, T * 6);
  ctx.fillStyle = `rgba(255,170,80,${fl})`; ctx.beginPath(); ctx.arc(hx, hy - 2, 3.5, 0, 7); ctx.fill();
  // bus
  if (G.flags.bus_ready) { const bx = X0 + 6 * T, by = Y0 + 6.6 * T; ctx.fillStyle = '#d9a425'; ctx.fillRect(bx, by, T * 3.2, T * 1.1); ctx.fillStyle = '#20282e'; for (let i = 0; i < 5; i++) ctx.fillRect(bx + 6 + i * T * 0.6, by + 4, T * 0.4, T * 0.4); }
  // survivors
  G.survivors.forEach((s, i) => {
    let sp = UI.survSprites[s.id];
    const slot = SLOTS[s.job] || (s.job === 'guard' ? [r.x1 - r.x0 - 0.5, (i % 4) * 2 + 0.5, 0, 0] : s.job === 'scavenge' ? null : [3 + (i % 3), 2 + (i % 2), 1, 1]);
    if (!slot) return;
    const tx = r.x0 + slot[0] + slot[2] / 2 + Math.sin(t / 3000 + i) * 0.6, ty = r.y0 + slot[1] + slot[3] + 0.3;
    if (!sp) sp = UI.survSprites[s.id] = { x: tx, y: ty };
    sp.x += (tx - sp.x) * 0.02; sp.y += (ty - sp.y) * 0.02;
    const X = sx(sp.x), Y = sy(sp.y);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(X, Y + 6, 7, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#b9a98f'; ctx.beginPath(); ctx.arc(X, Y, 6, 0, 7); ctx.fill(); ctx.fillStyle = '#e6d6bb'; ctx.beginPath(); ctx.arc(X, Y - 3, 3.5, 0, 7); ctx.fill();
    ctx.font = `600 9px 'IBM Plex Mono', monospace`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(235,225,206,.8)'; ctx.fillText(s.name.split(' ')[0], X, Y - 10);
  });
}
function drawZombie(z, X, Y, t) {
  const big = z.type === 'brute' ? 1.6 : z.type === 'bloater' ? 1.35 : z.type === 'zdog' ? 0.8 : 1;
  const col = { walker: '#6e7a5a', runner: '#7a6a5a', bloater: '#8a9a4a', screamer: '#a8a898', brute: '#5a5a48', zdog: '#5c4a3a' }[z.type];
  const wob = Math.sin(z.ph) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(X, Y + 7 * big, 8 * big, 3 * big, 0, 0, 7); ctx.fill();
  if (z.type === 'zdog') { ctx.fillStyle = col; ctx.save(); ctx.translate(X, Y); ctx.rotate(z.dir); ctx.fillRect(-8, -3.5, 16, 7); ctx.fillRect(6, -3, 5, 6); ctx.restore(); }
  else {
    ctx.strokeStyle = col; ctx.lineWidth = 3 * big; ctx.beginPath();
    ctx.moveTo(X + Math.cos(z.dir - 0.4) * 4, Y + Math.sin(z.dir - 0.4) * 4); ctx.lineTo(X + Math.cos(z.dir - 0.2) * 12 * big, Y + Math.sin(z.dir - 0.2) * 12 * big + wob);
    ctx.moveTo(X + Math.cos(z.dir + 0.4) * 4, Y + Math.sin(z.dir + 0.4) * 4); ctx.lineTo(X + Math.cos(z.dir + 0.2) * 12 * big, Y + Math.sin(z.dir + 0.2) * 12 * big - wob); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X, Y, 7 * big, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(X, Y, 7 * big, 0.5, 2.6); ctx.fill();
  }
  if (z.chase) { ctx.fillStyle = z.type === 'runner' ? '#ff4030' : '#d0402e'; ctx.beginPath(); ctx.arc(X + Math.cos(z.dir) * 4 * big, Y + Math.sin(z.dir) * 4 * big, 1.8, 0, 7); ctx.fill(); }
  if (z.type === 'screamer' && z.chase) { ctx.strokeStyle = `rgba(220,220,200,${0.3 + Math.sin(t / 80) * 0.2})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X, Y, 14 + (t / 30) % 12, 0, 7); ctx.stroke(); }
}
function drawPlayer(X, Y, t) {
  const f = G.p.face || 0, bob = G.p.moving ? Math.sin(t / 90) * 1.2 : 0;
  const lg = ctx.createRadialGradient(X, Y, 0, X, Y, TS * 3); lg.addColorStop(0, 'rgba(243,161,90,.16)'); lg.addColorStop(1, 'rgba(243,161,90,0)'); ctx.fillStyle = lg; ctx.fillRect(X - TS * 3, Y - TS * 3, TS * 6, TS * 6);
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(X, Y + 8, 9, 3.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#4a3a2a'; ctx.beginPath(); ctx.arc(X - Math.cos(f) * 5, Y - Math.sin(f) * 5 + bob, 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#d8c8a8'; ctx.beginPath(); ctx.arc(X, Y + bob, 8, 0, 7); ctx.fill();
  ctx.strokeStyle = '#e8742c'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#2a2018'; ctx.beginPath(); ctx.arc(X + Math.cos(f) * 4, Y + Math.sin(f) * 4 + bob, 2.4, 0, 7); ctx.fill();
  if (UI.invuln > 0 && Math.floor(t / 100) % 2) { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(X, Y, 12, 0, 7); ctx.stroke(); }
}
function drawMinimap() {
  if (!G || !WORLD) return;
  const s = 160 / W, fog = G._fog;
  if (!UI.mmT || performance.now() - UI.mmT > 500) {
    UI.mmT = performance.now();
    const img = mctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      let c = [11, 10, 9];
      if (fog[i]) { const tt = WORLD.tiles[i]; c = tt === T_ROAD || tt === T_CAR || tt === T_DOOR ? [70, 66, 60] : tt === T_WATER ? [30, 70, 90] : tt === T_BRIDGE ? [90, 70, 50] : tt === T_TREE ? [28, 60, 30] : tt === T_ROOF || tt === T_WALL ? [100, 80, 66] : tt === T_YARD ? [120, 80, 50] : tt === T_FIELD ? [80, 90, 40] : [40, 50, 32]; }
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
    UI.mmImg = img;
  }
  const off = UI.mmOff || (UI.mmOff = document.createElement('canvas')); off.width = W; off.height = H; off.getContext('2d').putImageData(UI.mmImg, 0, 0);
  mctx.imageSmoothingEnabled = false; mctx.drawImage(off, 0, 0, 160, 120);
  for (const k in WORLD.pois) { const p = WORLD.pois[k]; const q = storyItemHere(p.type) || (p.type === 'depot' && G.flags.q_bus && !G.flags.bus_ready); if (!fog[p.y * W + p.x] && !q) continue; mctx.fillStyle = q ? '#f3a15a' : '#e8742c'; mctx.fillRect(p.x * s - 1.5, p.y * s - 1.5, q ? 4 : 3, q ? 4 : 3); }
  mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(G.p.x * s, G.p.y * s, 2.5, 0, 7); mctx.fill();
}

/* ---------- Loop ---------- */
let lastT = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0); lastT = t;
  update(dt); draw(t); if (G && UI.running) drawMinimap();
  requestAnimationFrame(loop);
}

/* ---------- Title & creation ---------- */
function showTitle() {
  $('#title').hidden = false;
  const b = $('#title-btns');
  b.innerHTML = (hasSave() ? '<button class="btn" id="t-cont">Continue</button>' : '') + `<button class="btn ${hasSave() ? 'ghost' : ''}" id="t-new">New game</button>`;
  if ($('#t-cont')) $('#t-cont').onclick = () => { if (loadGame()) { $('#title').hidden = true; startPlay(); } };
  $('#t-new').onclick = () => showCreate();
}
function showCreate() {
  const C = CONTENT_();
  const st = { name: pick(C.names.first || ['Sam']), bg: 'scavenger', a: { str: 3, end: 3, per: 3, cha: 3, agi: 3, int: 3 }, pts: 8 };
  const render = () => {
    const bgB = BACKGROUNDS[st.bg].bonus;
    $('#title').hidden = true;
    showModal(`<div class="eyebrow">New survivor</div><h2>Who were you before?</h2>
      <label class="mono muted" for="c-name">Name</label><input type="text" id="c-name" maxlength="20" value="${esc(st.name)}">
      <h3>Background</h3><div class="grid">${Object.keys(BACKGROUNDS).map(k => { const b = BACKGROUNDS[k]; return `<button class="card ${k === st.bg ? 'sel' : ''}" data-bg="${k}" style="text-align:left"><h4>${b.n}</h4><span class="muted" style="font-size:13px">${b.desc}</span><span class="mono" style="color:var(--ember)">${Object.keys(b.bonus).map(a => `+${b.bonus[a]} ${a.toUpperCase()}`).join(' ')}</span><span class="mono muted">${Object.keys(b.items).map(i => itemName(i)).join(', ')}</span></button>`; }).join('')}</div>
      <h3>Attributes <span class="mono muted">${st.pts} points left</span></h3>
      ${Object.keys(ATTRS).map(k => `<div class="attr-row"><b>${ATTRS[k].n}</b><span class="muted" style="font-size:13px">${ATTRS[k].d}</span><div class="stepper"><button data-dn="${k}" aria-label="Lower">−</button><span class="v">${st.a[k] + (bgB[k] || 0)}</span><button data-up="${k}" aria-label="Raise">+</button></div></div>`).join('')}
      <div class="row end"><button class="btn ghost" id="c-back">Back</button><button class="btn" id="c-go">Descend into the bunker</button></div>`, true);
    $('#c-name').addEventListener('input', e => st.name = e.target.value);
    bind('[data-bg]', el => { st.bg = el.dataset.bg; render(); });
    bind('[data-up]', el => { const k = el.dataset.up; if (st.pts > 0 && st.a[k] < 9) { st.a[k]++; st.pts--; render(); } });
    bind('[data-dn]', el => { const k = el.dataset.dn; if (st.a[k] > 1) { st.a[k]--; st.pts++; render(); } });
    bind('#c-back', () => { $('#modal-wrap').hidden = true; UI.open = false; showTitle(); });
    bind('#c-go', () => {
      newGame((st.name || 'Survivor').trim().slice(0, 20) || 'Survivor', st.bg, st.a);
      $('#modal-wrap').hidden = true; UI.open = false;
      startPlay(); G.seenScenes.intro = true; Hooks.queue({ type: 'scene', id: 'intro' });
      Hooks.queue({ type: 'fn', fn: showHelp });
    });
  };
  render();
}
function startPlay() {
  UI.running = true; UI.zombies = []; UI.survSprites = {}; UI.q = UI.q || []; UI.lastDoor = Math.floor(G.p.x) + ',' + Math.floor(G.p.y);
  G.atShelter = inShelter(G.p.x, G.p.y); G.isNight = isNight();
  revealAround(G.p.x, G.p.y, visRadius());
  $('#ticker').innerHTML = '';
  refreshHUD();
}
function initEmbers() { const e = $('#embers'); let h = ''; for (let i = 0; i < 28; i++) h += `<i style="left:${Math.random() * 100}%;--dx:${(Math.random() - 0.5) * 120}px;animation-duration:${6 + Math.random() * 8}s;animation-delay:${-Math.random() * 10}s;opacity:${0.4 + Math.random() * 0.6}"></i>`; e.innerHTML = h; }

/* ---------- Boot ---------- */
function boot(data) {
  resize(); initEmbers();
  if (data && data.save) { try { loadFrom(data.save); $('#title').hidden = true; startPlay(); } catch (e) { showTitle(); } }
  else showTitle();
  requestAnimationFrame(loop);
}
if (window.claude && window.claude.hot) { try { window.claude.hot.snapshot(() => (G && UI.running && !G.dead ? { save: serialize() } : {})); } catch (e) {} }
window.claude && window.claude.hot && window.claude.hot.ready ? window.claude.hot.ready(boot) : boot((window.claude && window.claude.hot && window.claude.hot.data) || {});
