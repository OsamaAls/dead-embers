/* ===================== UI: HUD, dialogue, panels, minigames, input (keyboard/mouse/touch), audio =====================
   Public (see API.md §3):
     INPUT                    shared input state (move, sprint, crouch, attack, edges, aim, touch)
     SFX.play(name)           Web Audio synth. Added: SFX.unlock(), SFX.toggle(on?), SFX.on
     $(sel), esc(str)         tiny DOM helpers other files may use
     UI.init(), UI.update(dt), UI.blocking()
     UI.toast(text,cls) UI.hint(text) UI.banner(title,line) UI.prompt(text|null,progress|null)
     UI.dmgNum(x,y,text,cls) UI.flash(kind) UI.vignette() UI.levelUp() UI.onUnlock(key) UI.timer(label,s|null)
     UI.dialogue({who,lines,choices}) UI.encounter(enc,done) UI.scene(id,done) UI.summary(item,done) UI.final(done) UI.end(id)
     UI.open(panel) UI.close() UI.lockpick({mode,diff},done) UI.barter(stock,done) UI.title(step?)
   Added:
     UI.momentPrompt(text|null, progress|null)   bottom prompt owned by Moments (wins over main's UI.prompt)
     UI.worldBar(key, x, y, frac|null, label)     small HP bar over a tile position; UI.worldBar(key, null) removes it
     UI.tollcamp()                                the Warden's gate dialogue (also UI.open('tollcamp'))
     UI.swapWeapon()                              cycle owned weapons (Q / tap the weapon chip)
     UI.spendPoint(attr)                          spend one attribute point (char panel)
     UI.craft(i)                                  craft RECIPES[i] (shelter panel)
     UI.lockOn(enemy|null)                        ember chevron + slim HP bar over the locked target (combat calls it when the lock changes)
     UI.enemyHit(enemy)                           show that enemy's HP bar for ~2 s (also inferred from UI.dmgNum(e.x,e.y,n,'hit'|'crit'))
     UI.reducedMotion                             true when the player prefers reduced motion (combat should skip screen shake)
   Input additions (combat consumes the edges and sets them false):
     INPUT.mouseAim       true while the mouse is in use over the game (moved/clicked); false after ~2.5 s of no mouse movement once a
                          move/attack key is pressed, and always on touch. When it turns false aimX/aimY become null (no stale cursor).
     INPUT.cyclePressed   F: next lock-on target.   INPUT.clearLock: Shift+F, drop the lock.   INPUT.throwPressed: G, throw a bottle.
   Keyboard: every panel, dialogue, title and end screen can be driven with arrows/WASD + E/Enter (+ X drop, 1-6, T trade, Esc).
   Dialogue `lines` may be strings or {who, line} beats. A choice is {label, note, disabled, onPick}. */
const INPUT = { mx: 0, my: 0, sprint: false, crouch: false, attack: false, interact: false, attackPressed: false, dodgePressed: false, interactPressed: false, aimX: null, aimY: null, touch: false, mouseAim: false, cyclePressed: false, clearLock: false, throwPressed: false, companionCmd: false, fetchCmd: false };
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------------------------------------------------------- audio ---------------------------------------------------------------- */
const SFX = (() => {
  let ctx = null, master = null, noise = null, on = true;
  const last = {};
  try { on = localStorage.getItem('deadembers_sound') !== '0'; } catch (e) { }
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try {
        ctx = new AC(); master = ctx.createGain(); master.gain.value = on ? 0.2 : 0; master.connect(ctx.destination);
        const len = Math.floor(ctx.sampleRate * 1.2); noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ctx = null; return; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => { });
  }
  const T = () => ctx.currentTime;
  function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function tone(type, f0, f1, dur, vol, delay, lp) {
    const t = T() + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    let n = o; if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); n = f; }
    env(g, t, 0.005, vol, dur); n.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05); return o;
  }
  function hiss(dur, vol, ftype, f0, f1, delay, q) {
    const t = T() + (delay || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = ftype; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.004, vol, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function vib(o, rate, depth, dur) { const l = ctx.createOscillator(), g = ctx.createGain(); l.frequency.value = rate; g.gain.value = depth; l.connect(g); g.connect(o.frequency); l.start(); l.stop(T() + dur + 0.1); }
  const defs = {
    swing: () => hiss(0.16, 0.35, 'bandpass', 500, 2600, 0, 1.4),
    hit: () => { tone('sine', 140, 45, 0.14, 0.9); hiss(0.07, 0.5, 'lowpass', 1800, 400); },
    shoot: () => { hiss(0.2, 0.9, 'lowpass', 5000, 300); tone('square', 120, 40, 0.1, 0.5, 0, 600); },
    shotgun: () => { hiss(0.42, 1, 'lowpass', 4000, 150); tone('sine', 90, 30, 0.3, 0.9); },
    hurt: () => { tone('sawtooth', 210, 80, 0.2, 0.35, 0, 900); hiss(0.08, 0.3, 'lowpass', 900, 200); },
    pickup: () => { tone('triangle', 660, 660, 0.07, 0.35); tone('triangle', 990, 990, 0.1, 0.3, 0.06); },
    open: () => { const o = tone('square', 70, 55, 0.24, 0.16, 0, 400); vib(o, 28, 18, 0.24); hiss(0.18, 0.2, 'bandpass', 900, 500, 0.02, 3); },
    build: () => { for (let i = 0; i < 3; i++) { tone('sine', 180, 70, 0.08, 0.7, i * 0.13); hiss(0.05, 0.4, 'highpass', 2500, 2500, i * 0.13); } },
    levelup: () => { [440, 554, 659, 880].forEach((f, i) => tone('triangle', f, f, 0.22 + i * 0.05, 0.32, i * 0.09)); tone('sine', 1760, 1760, 0.6, 0.08, 0.36); },
    scream: () => { const o = tone('sawtooth', 700, 1500, 1.1, 0.4, 0, 3200); vib(o, 11, 70, 1.1); hiss(1.0, 0.25, 'bandpass', 2400, 3200, 0, 4); },
    groan: () => { const o = tone('sawtooth', 95, 68, 0.8, 0.3, 0, 420); vib(o, 5, 6, 0.8); },
    step: () => hiss(0.05, 0.12, 'lowpass', 700, 300),
    ui: () => tone('sine', 1250, 1250, 0.035, 0.18),
    good: () => { tone('triangle', 520, 520, 0.08, 0.3); tone('triangle', 780, 780, 0.14, 0.3, 0.08); },
    bad: () => { tone('square', 180, 120, 0.22, 0.18, 0, 700); },
    bark: () => { tone('sawtooth', 420, 260, 0.09, 0.3, 0, 1400); tone('sawtooth', 380, 240, 0.1, 0.26, 0.13, 1300); },
    growl: () => { const o = tone('sawtooth', 110, 90, 0.7, 0.28, 0, 380); vib(o, 22, 9, 0.7); },
    whimper: () => { tone('sine', 900, 1300, 0.22, 0.2); tone('sine', 1200, 700, 0.3, 0.18, 0.24); },
  };
  return {
    get on() { return on; },
    get ctx() { return ctx; }, // shared with Ambience once created
    unlock,
    play(name) {
      if (!ctx || !on || !defs[name]) return;
      const now = ctx.currentTime; if (last[name] && now - last[name] < 0.05) return; last[name] = now;
      try { defs[name](); } catch (e) { }
    },
    toggle(v) {
      on = v == null ? !on : !!v; try { localStorage.setItem('deadembers_sound', on ? '1' : '0'); } catch (e) { }
      if (master) master.gain.value = on ? 0.2 : 0; return on;
    },
  };
})();

/* ---------------------------------------------------------------- UI ---------------------------------------------------------------- */
const UI = (() => {
  const S = {
    dlg: null, panel: null, panelTab: {}, mg: null, title: false, end: false, hudShown: false,
    pr: { t: null, p: null }, mpr: null, prKey: '', hintQ: [], hintCur: null, hintGap: 0, bannerT: 0,
    c: {}, dn: [], timer: null, wbars: {}, mmT: 0, fogT: 0, objText: '', joy: null, pinch: {}, crouchT: false,
    atk: { mouse: false, key: false, touch: false }, barMax: 0,
    nav: {}, mouseT: -99, mx0: null, my0: null, lock: null, ehit: {}, ebars: {}, barLast: null, tsel: 0,
  };
  const RM = safe0(() => matchMedia('(prefers-reduced-motion: reduce)'), null);
  function safe0(f, d) { try { return f(); } catch (e) { return d; } }
  const K = {};
  const now = () => performance.now() / 1000;
  const reducedMotion = () => !!(RM && RM.matches);
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
  const has3D = () => typeof R !== 'undefined' && R && R.camera && R.renderer && typeof R.tileToScreen === 'function';
  const el = id => document.getElementById(id);
  const ATTR_LINES = { str: ['STR', 'Strength', 'Carry weight and melee damage'], end: ['END', 'Endurance', 'Stamina; slower hunger and thirst'], per: ['PER', 'Perception', 'Loot found, search speed, spotting'], cha: ['CHA', 'Charisma', 'Talking, recruiting, trade prices'], agi: ['AGI', 'Agility', 'Move speed and dodging'], int: ['INT', 'Intellect', 'Crafting, building costs, medicine'] };
  const CAT_ORDER = ['weapon', 'ammo', 'food', 'water', 'med', 'gear', 'mat', 'misc', 'story'];
  const UNLOCK_LABEL = { needs: 'Hunger and thirst', build: 'Shelter building', craft: 'Crafting', people: 'Survivors and jobs', horde: 'Horde nights', radio: 'The radio quest', journal: 'Journal and minimap', map: 'Map' };
  const ARCS = [['Eli', 'eli', 4], ['Dr. Ines Okafor', 'ines', 4], ['Marcus Hale', 'marcus', 4, ['marcus_1', 'marcus_2', 'marcus_3', 'marcus_3b']], ['The Choir', 'choir', 3], ['The Relay', 'relay', 3], ['Teodor and Biscuit', 'teodor', 4]];

  /* ---------- text helpers ---------- */
  function sentences(s) { return (String(s || '').match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || []).map(x => x.trim()).filter(Boolean); }
  function firstSentence(s, max) {
    const ss = sentences(s); let out = ss[0] || '';
    if (out.length < 26 && ss[1]) out += ' ' + ss[1];
    max = max || 150; return out.length > max ? out.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : out;
  }
  /* split a long text into pages of at most ~150 chars at sentence boundaries */
  function pages(s, max) {
    max = max || 150; const out = []; let cur = '';
    for (const x of sentences(s)) { if (cur && (cur + ' ' + x).length > max) { out.push(cur); cur = x; } else cur = cur ? cur + ' ' + x : x; }
    if (cur) out.push(cur); return out.length ? out : [''];
  }
  /* empty states: a small line icon, a short title and one line of help */
  const EICON = {
    pack: 'M8 9V7a4 4 0 0 1 8 0v2M5 9h14v11H5zM9 13h6',
    book: 'M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h9',
    note: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5',
    tool: 'M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 0-2-2zM4 20l3-3',
    people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M17 14a5 5 0 0 1 4 6',
    food: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 2-2 6 0 8v10',
  };
  const emptyState = (ic, title, text) => `<div class="emptyst"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${EICON[ic] || EICON.note}"/></svg><b>${esc(title)}</b><span>${esc(text)}</span></div>`;
  const fmt = s => typeof fmtName === 'function' ? fmtName(s) : String(s || '');
  const pad2 = n => String(n).padStart(2, '0');
  const iname = id => typeof itemName === 'function' ? itemName(id) : id;

  /* ---------- blocking / input ---------- */
  function blocking() { return !!(S.dlg || S.panel || S.mg || S.title || S.end || S.portrait || (typeof Cine !== 'undefined' && Cine.active)); }
  function clearInput() {
    for (const k in K) delete K[k];
    INPUT.mx = INPUT.my = 0; INPUT.sprint = INPUT.attack = INPUT.interact = false;
    INPUT.attackPressed = INPUT.dodgePressed = INPUT.interactPressed = false;
    INPUT.cyclePressed = INPUT.clearLock = INPUT.throwPressed = false;
    INPUT.crouch = S.crouchT; S.atk.mouse = S.atk.key = S.atk.touch = false;
    if (S.joy) endJoy();
  }
  function syncBlock() { const b = blocking(); document.body.classList.toggle('blocked', b); if (b) clearInput(); }
  function syncMove() {
    if (S.joy) return;
    INPUT.mx = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0);
    INPUT.my = (K.KeyS || K.ArrowDown ? 1 : 0) - (K.KeyW || K.ArrowUp ? 1 : 0);
    INPUT.sprint = !!(K.ShiftLeft || K.ShiftRight);
    INPUT.crouch = !!(K.KeyC || K.ControlLeft || K.ControlRight) || S.crouchT;
    INPUT.interact = !!K.KeyE || !!S.useHeld;
    INPUT.attack = S.atk.mouse || S.atk.key || S.atk.touch;
  }
  function setTouch(v) {
    if (INPUT.touch === v) return; INPUT.touch = v; document.body.classList.toggle('touch', v); S.prKey = '';
    if (v) { INPUT.mouseAim = false; INPUT.aimX = INPUT.aimY = null; setKbd(false); }
    phoneLayout();
  }
  /* phones play sideways: body.phone is the compact landscape layout, body.portrait shows the "turn your phone" card (and pauses).
     --tlh / --trh carry the status block's and the map column's heights so the pieces under them never overlap. */
  function phoneLayout() {
    const b = document.body, port = INPUT.touch && innerHeight > innerWidth, phone = INPUT.touch && !port && innerHeight <= 520;
    if (S.portrait !== port) { S.portrait = port; b.classList.toggle('portrait', port); syncBlock(); }
    if (S.phone !== phone) { S.phone = phone; b.classList.toggle('phone', phone); S.c.objh = null; topLayout(); restJoy(); }
    if (!phone || !D.hud) return;
    const tl = document.querySelector('.hud-tl'), tr = document.querySelector('.hud-tr');
    const th = (tl ? tl.offsetHeight : 130) + 'px', rh = (tr ? tr.offsetHeight : 44) + 'px';
    if (S.c.tlh !== th) { S.c.tlh = th; D.hud.style.setProperty('--tlh', th); el('touch').style.setProperty('--tlh', th); }
    if (S.c.trh !== rh) { S.c.trh = rh; D.hud.style.setProperty('--trh', rh); }
  }
  /* on a phone the first tap on a title button asks for fullscreen and a landscape lock (Android; iOS ignores both) */
  function goFullscreen() {
    if (S.fsTried || !INPUT.touch) return; S.fsTried = true;
    const de = document.documentElement, rf = de.requestFullscreen || de.webkitRequestFullscreen;
    try { const p = rf && rf.call(de, { navigationUI: 'hide' }); if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { })).catch(() => { }); } catch (e) { }
  }
  const running = () => typeof Game !== 'undefined' && Game.running && G && !Game.dead;
  /* aim mode: the mouse aims while it is in use; keyboard-only play (mouse idle 2.5 s, then a move/attack key) drops the stale cursor */
  function mouseActive(x, y) { if (INPUT.touch) return; S.mouseT = now(); INPUT.mouseAim = true; INPUT.aimX = x; INPUT.aimY = y; }
  function idleMouse() { if (INPUT.mouseAim && now() - S.mouseT > 2.5) { INPUT.mouseAim = false; INPUT.aimX = INPUT.aimY = null; } }
  function setKbd(v) { if (S.kbd === v) return; S.kbd = v; document.body.classList.toggle('kbd', v); }
  const MOVEK = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, KeyJ: 1, Space: 1 };
  const SCROLLK = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1, Tab: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1 };

  function onKey(e) {
    SFX.unlock();
    const c = e.code, inField = !!(e.target && e.target.tagName === 'INPUT');
    // never let keys scroll the page or reach the game while something modal is open (a text field keeps its own caret keys)
    if (SCROLLK[c] && (blocking() || !inField) && !(inField && /^(ArrowLeft|ArrowRight|Space|Home|End)$/.test(c))) e.preventDefault();
    if (!INPUT.touch || c.startsWith('Arrow') || c === 'Enter') setKbd(true);
    if (S.title) return titleKey(e);
    if (S.end) return endKey(e);
    if (S.mg) { if (S.mg.key) S.mg.key(e); return; }
    if (S.dlg) return dlgKey(e);
    if (S.panel) return panelKey(e);
    if (!running()) return;
    if (e.repeat && K[c]) return;
    K[c] = true;
    if (MOVEK[c]) idleMouse();
    if (c === 'KeyE') INPUT.interactPressed = true;
    if (c === 'KeyJ') { INPUT.attackPressed = true; S.atk.key = true; }
    if (c === 'Space') INPUT.dodgePressed = true;
    if (c === 'KeyF') { if (e.shiftKey) INPUT.clearLock = true; else INPUT.cyclePressed = true; }
    if (c === 'KeyG') INPUT.throwPressed = true;
    if (c === 'KeyH') INPUT.companionCmd = true;
    if (c === 'KeyR') INPUT.fetchCmd = true;
    syncMove();
    const open = { KeyI: 'pack', Tab: 'journal', KeyB: 'char', KeyM: 'map', Escape: 'menu' }[c];
    if (open) { delete K[c]; U.open(open); }
    if (c === 'KeyQ') U.swapWeapon();
  }
  function onKeyUp(e) { delete K[e.code]; if (e.code === 'KeyJ') S.atk.key = false; if (!blocking()) syncMove(); }

  /* ---------- dom refs + init ---------- */
  const D = {};
  function init() {
    for (const id of ['hud', 'vig', 'flash', 'dmg', 'obj', 'objhow', 'timer', 'banner', 'mm', 'toasts', 'wpn', 'barri', 'prompt', 'hint', 'wmark', 'ohps', 'chips', 'clock', 'lvl', 'joy', 'dlg', 'pnl-wrap', 'pnl', 'mg', 'end', 'title', 'lock', 'cmp'])
      D[id.replace('-', '')] = el(id);
    D.bars = { hp: el('b-hp'), sta: el('b-sta'), food: el('b-food'), water: el('b-water') };
    // damage-number pool
    for (let i = 0; i < 24; i++) { const d = document.createElement('div'); d.className = 'dn'; d.style.opacity = 0; D.dmg.appendChild(d); S.dn.push({ el: d, t: 9, x: 0, y: 0, h: 0 }); }
    addEventListener('keydown', onKey);
    addEventListener('keyup', onKeyUp);
    addEventListener('blur', () => { clearInput(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });
    const view = el('view');
    addEventListener('mousemove', e => {
      if (INPUT.touch || (S.mx0 === e.clientX && S.my0 === e.clientY)) return; // ignore synthetic same-spot moves
      S.mx0 = e.clientX; S.my0 = e.clientY;
      if (e.target && e.target.closest && e.target.closest('#view')) mouseActive(e.clientX, e.clientY);
      else if (INPUT.mouseAim) { INPUT.aimX = e.clientX; INPUT.aimY = e.clientY; }
    });
    addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') setKbd(false); }, true);
    try { RM && RM.addEventListener && RM.addEventListener('change', () => document.body.classList.toggle('rm', !!RM.matches)); } catch (e) { }
    document.body.classList.toggle('rm', !!(RM && RM.matches));
    addEventListener('mouseup', () => { S.atk.mouse = false; syncMove(); });
    view.addEventListener('contextmenu', e => e.preventDefault());
    view.addEventListener('wheel', e => { e.preventDefault(); if (!blocking() && typeof R !== 'undefined' && R.zoom) R.zoom(e.deltaY); }, { passive: false });
    view.addEventListener('pointerdown', viewDown);
    addEventListener('pointermove', viewMove, { passive: false });
    addEventListener('pointerup', viewUp); addEventListener('pointercancel', viewUp);
    addEventListener('pointerdown', e => { SFX.unlock(); if (e.pointerType === 'touch') setTouch(true); }, true);
    addEventListener('touchstart', () => { SFX.unlock(); setTouch(true); }, { passive: true, capture: true });
    document.addEventListener('touchmove', e => { if (!e.target.closest || !e.target.closest('.pb-body, #title, #end')) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', e => e.preventDefault());
    if (safe(() => matchMedia('(pointer:coarse)').matches, false)) setTouch(true);
    touchButtons();
    // HUD clicks
    D.mm.addEventListener('click', () => U.open('map'));
    D.wpn.addEventListener('click', () => U.swapWeapon());
    D.cmp.addEventListener('click', () => { if (!blocking()) INPUT.companionCmd = true; });
    D.chips.addEventListener('click', e => { if (e.target.closest('.chip.ember')) U.open('char'); });
    document.querySelectorAll('.hb[data-open]').forEach(b => b.addEventListener('click', () => U.open(b.dataset.open)));
    D.pnl.addEventListener('click', panelClick);
    D.pnl.addEventListener('change', panelChange);
    restJoy();
    addEventListener('resize', () => { phoneLayout(); restJoy(); S.c.objh = null; topLayout(); });
    addEventListener('pointerup', e => { if (e.pointerType === 'touch' && e.target.closest && e.target.closest('#title button')) goFullscreen(); }, true);
    phoneLayout();
  }

  /* ---------- touch: floating joystick on the left half, buttons on the right, pinch zoom ---------- */
  function restJoy() { if (S.joy) return; const j = D.joy; if (!j) return; j.style.left = (S.phone ? 90 : 96) + 'px'; j.style.top = (innerHeight - (S.phone ? 98 : 120)) + 'px'; j.classList.remove('on', 'sprint'); j.firstChild.style.transform = ''; }
  function viewDown(e) {
    if (e.pointerType === 'mouse') {
      if (e.button === 0 && running() && !blocking()) { mouseActive(e.clientX, e.clientY); INPUT.attackPressed = true; S.atk.mouse = true; syncMove(); }
      return;
    }
    if (blocking() || !running()) return;
    e.preventDefault();
    if (e.clientX < innerWidth * 0.5 && !S.joy) {
      const x = cl(e.clientX, 70, innerWidth * 0.5), y = cl(e.clientY, 70, innerHeight - 70);
      S.joy = { id: e.pointerId, x, y };
      D.joy.style.left = x + 'px'; D.joy.style.top = y + 'px'; D.joy.classList.add('on');
      joyMove(e.clientX, e.clientY);
    } else {
      S.pinch[e.pointerId] = { x: e.clientX, y: e.clientY };
      const ids = Object.keys(S.pinch); if (ids.length === 2) S.pinchD = pdist();
    }
  }
  function pdist() { const p = Object.values(S.pinch); return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
  function joyMove(x, y) {
    const j = S.joy, dx = x - j.x, dy = y - j.y, len = Math.hypot(dx, dy), r = 48;
    const k = len > r ? r / len : 1;
    D.joy.firstChild.style.transform = `translate(${dx * k}px,${dy * k}px)`;
    const mag = cl((len - 6) / (r - 6), 0, 1);
    INPUT.mx = len > 0 ? dx / len * mag : 0; INPUT.my = len > 0 ? dy / len * mag : 0;
    INPUT.sprint = len > r + 14;
    D.joy.classList.toggle('sprint', INPUT.sprint);
  }
  function endJoy() { S.joy = null; INPUT.mx = INPUT.my = 0; INPUT.sprint = false; restJoy(); }
  function viewMove(e) {
    if (S.joy && e.pointerId === S.joy.id) { e.preventDefault(); joyMove(e.clientX, e.clientY); return; }
    if (S.pinch[e.pointerId]) {
      S.pinch[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(S.pinch).length === 2 && S.pinchD) {
        const d = pdist(), r = d / S.pinchD;
        if (r > 1.07 || r < 0.93) { if (typeof R !== 'undefined' && R.zoom) R.zoom(r > 1 ? -1 : 1); S.pinchD = d; }
      }
    }
  }
  function viewUp(e) {
    if (S.joy && e.pointerId === S.joy.id) endJoy();
    if (S.pinch[e.pointerId]) { delete S.pinch[e.pointerId]; S.pinchD = 0; }
  }
  function touchButtons() {
    const hold = (id, down, up) => {
      const b = el(id); if (!b) return;
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch (er) { } if (blocking()) return; b.classList.add('on'); down(); });
      const off = () => { b.classList.remove('on'); up && up(); };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    };
    hold('t-atk', () => { INPUT.attackPressed = true; S.atk.touch = true; INPUT.attack = true; }, () => { S.atk.touch = false; INPUT.attack = S.atk.mouse || S.atk.key; });
    hold('t-dodge', () => { INPUT.dodgePressed = true; });
    hold('t-use', () => { INPUT.interactPressed = true; S.useHeld = true; INPUT.interact = true; }, () => { S.useHeld = false; INPUT.interact = !!K.KeyE; });
    hold('t-crouch', () => { S.crouchT = !S.crouchT; INPUT.crouch = S.crouchT; el('t-crouch').classList.toggle('lock', S.crouchT); el('t-crouch').style.borderColor = S.crouchT ? 'var(--ember)' : ''; });
    hold('t-pack', () => U.open('pack'));
    hold('t-tgt', () => { INPUT.cyclePressed = true; });
    hold('t-throw', () => { INPUT.throwPressed = true; });
    hold('t-comp', () => { INPUT.companionCmd = true; });
    hold('t-fetch', () => { INPUT.fetchCmd = true; });
    /* the floating prompt itself is a button on touch: tap for a quick action, press and hold for a search */
    hold('prompt', () => { INPUT.interactPressed = true; S.useHeld = true; INPUT.interact = true; }, () => { S.useHeld = false; INPUT.interact = !!K.KeyE; });
  }

  /* ---------- HUD ---------- */
  function setText(node, key, v) { if (S.c[key] !== v) { S.c[key] = v; node.textContent = v; } }
  function setBar(node, key, v, max) {
    const pct = cl(max > 0 ? v / max : 0, 0, 1), q = Math.round(pct * 300);
    if (S.c[key] === q) return; S.c[key] = q;
    const fl = node.querySelector('.fl'), gh = node.querySelector('.gh');
    fl.style.transform = `scaleX(${pct})`; if (gh) gh.style.transform = `scaleX(${pct})`;
    node.querySelector('.v').textContent = Math.round(v);
    node.classList.toggle('low', pct < 0.3);
  }
  function showHud(v) { if (S.hudShown === v) return; S.hudShown = v; D.hud.hidden = !v; if (!v) { D.prompt.hidden = true; D.vig.style.opacity = 0; } }
  function update(dt) {
    if (!G || !D.hud) return;
    if (S.mg && S.mg.tick) S.mg.tick(dt || 0);
    if (S.title) closeTitle();
    if (S.end) { showHud(false); return; }
    showHud(true);
    dt = dt || 0;
    const p = G.p, bl_ = !blocking();
    setBar(D.bars.hp, 'hp', p.hp, p.maxHp); setBar(D.bars.sta, 'sta', p.sta, p.maxSta);
    const needs = safe(() => isUnlocked('needs'), false);
    if (needs) {
      if (D.bars.food.hidden) { D.bars.food.hidden = D.bars.water.hidden = false; D.bars.food.classList.add('reveal'); D.bars.water.classList.add('reveal'); }
      setBar(D.bars.food, 'food', p.hunger, 100); setBar(D.bars.water, 'water', p.thirst, 100);
    } else if (!D.bars.food.hidden) D.bars.food.hidden = D.bars.water.hidden = true;
    // clock
    const night = G.isNight || G.hour >= 20 || G.hour < 6;
    if (S.c.night !== night) { S.c.night = night; D.clock.classList.toggle('night', night); }
    setText(D.clock.querySelector('.d'), 'day', 'DAY ' + G.day);
    setText(D.clock.querySelector('.tm'), 'tm', pad2(G.hour) + ':' + pad2(Math.floor(G.minute)));
    const ppl = D.clock.querySelector('.ppl');
    if (safe(() => isUnlocked('people'), false)) { ppl.hidden = false; setText(ppl.querySelector('b'), 'ppl', String(G.survivors.length)); } else ppl.hidden = true;
    chips(p);
    companionChip();
    objective(dt);
    weaponChip();
    weatherChip();
    barricade();
    U.vignette();
    if (S.timer) {
      if (bl_) S.timer.t = Math.max(0, S.timer.t - dt);
      const t = S.timer.t, txt = t < 10 ? t.toFixed(1) : String(Math.ceil(t));
      setText(D.timer.querySelector('.t'), 'tmr', txt);
      D.timer.classList.toggle('urgent', t < 3);
    }
    renderPrompt();
    tickHints(dt);
    // minimap
    const mmOn = safe(() => isUnlocked('journal') || isUnlocked('map') || G.day >= 2, false);
    if (mmOn && D.mm.hidden) { D.mm.hidden = false; D.mm.classList.add('reveal'); }
    if (!mmOn && !D.mm.hidden) D.mm.hidden = true;
    S.mmT -= dt; if (mmOn && S.mmT <= 0) { S.mmT = 0.08; drawMinimap(); }
    // char button alert
    const hb = el('hb-char'); if (hb) { const pts = p.points > 0; if (S.c.pts !== pts) { S.c.pts = pts; hb.classList.toggle('pts', pts); } }
    if (S.c.nomap !== D.mm.hidden) { S.c.nomap = D.mm.hidden; D.toasts.classList.toggle('nomap', D.mm.hidden); }
    // touch use-button readiness
    const useB = el('t-use'); if (useB) { const r = !!(S.mpr || S.pr.t) && /E\s/.test((S.mpr || S.pr).t || ''); if (S.c.useR !== r) { S.c.useR = r; useB.classList.toggle('ready', r); } }
    // touch: TARGET only when there is more than one of them close enough to switch between
    const tg = el('t-tgt'); if (tg && INPUT.touch) { let n = 0; if (typeof Combat !== 'undefined') for (const e of Combat.enemies) if (!e.dead && !e.gone && Math.hypot(e.x - p.x, e.y - p.y) < 10) n++; const r = n > 1; if (S.c.tgtR !== r) { S.c.tgtR = r; tg.classList.toggle('ready', r); } }
    if (S.phone) { S.layT = (S.layT || 0) - dt; if (S.layT <= 0) { S.layT = 0.25; phoneLayout(); } }
    // touch: THROW only when there is something to throw
    const thr = el('t-throw'); if (thr) { const v = !!(G.pack && G.pack.bottle > 0); if (S.c.thr !== v) { S.c.thr = v; thr.hidden = !v; el('touch').classList.toggle('throw', v); } } // THROW takes the PACK slot (pack stays in the top bar)
    // low HP: pulsing red edge under 30%
    const low = p.maxHp > 0 && p.hp / p.maxHp < 0.3 && p.hp > 0;
    if (S.c.low !== low) { S.c.low = low; document.body.classList.toggle('lowhp', low); }
    tickDmg(dt);
    tickEnemyBars(dt);
    for (const k in S.wbars) S.wbars[k].seen = (S.wbars[k].seen || 0) + 1;
  }
  function chips(p) {
    const out = [];
    if (G.hordeNight && !G.hordeResult) out.push(['bad', 'Horde tonight']);
    if (p.status.bleeding) out.push(['bad', 'Bleeding']);
    if (p.inf > 0) out.push(['sick', 'Infected ' + Math.round(p.inf) + '%']);
    if (p.status.sick) out.push(['sick', 'Sick']);
    if (p.status.injured) out.push(['warn', 'Injured']);
    if (safe(() => isUnlocked('needs'), false) && p.morale < 30) out.push(['warn', 'Low morale']);
    if (safe(() => packWeight() > carryCap(), false)) out.push(['warn', 'Overloaded']);
    if (INPUT.crouch) out.push(['good', 'Crouched']);
    if (p.points > 0) out.push(['ember', '+' + p.points + ' point' + (p.points > 1 ? 's' : '')]);
    const key = out.map(o => o.join(':')).join('|');
    if (S.c.chips === key) return; S.c.chips = key;
    D.chips.innerHTML = out.map(([c, t]) => `<span class="chip ${c}">${esc(t)}</span>`).join('');
  }
  function curObjective() {
    const m = typeof Moments !== 'undefined' && Moments.active && Moments.target;
    if (m && m.x != null) return { text: m.label || 'Objective', how: m.how || '', target: { x: m.x, y: m.y }, moment: true };
    return safe(() => objectiveInfo(), { text: '', target: null }) || { text: '', target: null };
  }
  /* goals that end by being done get a short tick before the next one shows; these just stop applying, so they don't */
  const NOT_DONE = /^(Horde tonight|Night\.|Scavenge)/;
  function objective(dt) {
    const o = curObjective(), p = G.p;
    if (S.objText !== o.text) {
      const prev = S.objText;
      if (prev && o.text && !S.objMom && !o.moment && !NOT_DONE.test(prev) && !S.objDone) S.objDone = { t: 1.3, text: prev };
      S.objText = o.text; S.objMom = !!o.moment;
      if (S.objDone) { D.obj.querySelector('.tx').textContent = '✓ ' + S.objDone.text; D.obj.classList.add('done'); }
      else showObjText(o.text);
    }
    if (S.objDone && (S.objDone.t -= dt || 0) <= 0) { S.objDone = null; D.obj.classList.remove('done'); showObjText(S.objText); }
    const how = S.objDone ? '' : (o.how ? (INPUT.touch ? touchWords(o.how) : o.how) : '');
    if (S.c.how !== how) { S.c.how = how; D.objhow.textContent = how; D.objhow.hidden = !how; topLayout(); }
    const t = o.target, ar = D.obj.querySelector('.ar'), ds = D.obj.querySelector('.ds');
    if (!t || !has3D()) { if (S.c.tgt !== 0) { S.c.tgt = 0; ar.style.opacity = 0.25; ds.textContent = ''; D.wmark.hidden = true; } return; }
    S.c.tgt = 1; ar.style.opacity = 1;
    const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
    setText(ds, 'dist', d < 1.5 ? 'here' : (Math.round(d * 2 / 5) * 5 || 2) + ' m');
    const p0 = R.tileToScreen(p.x, p.y, 1), ux = d > 0 ? dx / d : 0, uy = d > 0 ? dy / d : 1;
    const p1 = R.tileToScreen(p.x + ux * 2, p.y + uy * 2, 1);
    const ang = Math.atan2(p1.x - p0.x, -(p1.y - p0.y));
    ar.firstChild.style.transform = `rotate(${ang}rad)`;
    // world marker: diamond over the target when visible, edge-clamped chevron when not
    const wm = D.wmark;
    if (d < 1.4) { wm.hidden = true; return; }
    wm.hidden = false;
    const pt = R.tileToScreen(t.x, t.y, 2.4), vw = innerWidth, vh = innerHeight;
    const top = vw < 760 ? 150 : 70, bot = INPUT.touch ? 210 : 70, side = 30;
    const inside = pt.on && pt.x > side && pt.x < vw - side && pt.y > top && pt.y < vh - bot;
    let x, y;
    if (inside) { x = pt.x; y = pt.y; }
    else {
      const sx = Math.sin(ang), sy = -Math.cos(ang), cx = cl(p0.x, side, vw - side), cy = cl(p0.y, top, vh - bot);
      let k = Infinity;
      if (sx > 0) k = Math.min(k, (vw - side - cx) / sx); if (sx < 0) k = Math.min(k, (side - cx) / sx);
      if (sy > 0) k = Math.min(k, (vh - bot - cy) / sy); if (sy < 0) k = Math.min(k, (top - cy) / sy);
      if (!isFinite(k)) k = 0; x = cx + sx * k; y = cy + sy * k;
    }
    if (S.c.edge !== !inside) { S.c.edge = !inside; wm.classList.toggle('edge', !inside); }
    wm.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    wm.querySelector('.chev').style.setProperty('--r', ang + 'rad');
    setText(wm.querySelector('.dl'), 'wdl', ds.textContent);
  }
  /* phones: the objective may take two lines; the status block, minimap and toasts sit below whatever height it has */
  function showObjText(t) {
    D.obj.querySelector('.tx').textContent = t || '';
    D.obj.hidden = !t; D.obj.classList.remove('new'); void D.obj.offsetWidth; D.obj.classList.add('new');
    topLayout();
  }
  function topLayout() {
    if (!D.hud) return;
    const h = (D.obj && !D.obj.hidden ? D.obj.offsetHeight : 0) + (D.objhow && !D.objhow.hidden ? D.objhow.offsetHeight + 4 : 0), v = (h || 30) + 'px';
    if (S.c.objh !== v) { S.c.objh = v; D.hud.style.setProperty('--objh', v); }
  }
  /* weather and season next to the clock: an icon and a word (cold and the last-night storm called out) */
  const WX_IC = {
    clear: 'M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
    rain: 'M7 14a4 4 0 0 1 .5-8A5 5 0 0 1 17 7a3.5 3.5 0 0 1 0 7zM8 17l-1 3M12 17l-1 3M16 17l-1 3', fog: 'M4 9h16M6 13h12M4 17h16', snow: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9',
  };
  const SEASON_N = { autumn: 'Autumn', late: 'Late autumn', winter: 'Winter' };
  function weatherChip() {
    const box = el('wx'); if (!box || !G) return;
    const p = G.p, w = safe(() => weatherAt(p.x, p.y), G.weather || 'clear') || 'clear', cold = safe(() => coldK(p.x, p.y), 0) > 0, storm = !!G.storm && w === 'snow';
    const word = storm ? 'Snowstorm' : w === 'clear' ? (SEASON_N[G.season] || 'Clear') : w === 'rain' ? 'Rain' : w === 'fog' ? 'Fog' : 'Snow';
    const txt = word + (cold ? (storm ? ' · freezing' : ' · cold') : ''), cls = 'wx ' + (storm ? 'storm' : cold ? 'cold' : w);
    const key = txt + cls; if (S.c.wx === key) return; S.c.wx = key;
    box.hidden = false; box.className = cls; box.querySelector('b').textContent = txt; box.querySelector('path').setAttribute('d', WX_IC[w] || WX_IC.clear);
    box.title = (SEASON_N[G.season] || '') + (w === 'rain' ? ': rain dulls their hearing' : w === 'fog' ? ': fog cuts how far they see' : w === 'snow' ? ': snow slows the dead; cold drains stamina' : '');
  }
  /* the radio's guess at tomorrow's weather (seeded per day, so it reads the same every time) */
  function forecast() {
    const f = G.flags || {};
    if (f.q_bus && G.hordeDay && G.hordeDay - G.day <= 1) return 'Forecast: a blizzard coming down off the pass. Whiteout by nightfall.';
    const t = (typeof WEATHER_W !== 'undefined' && WEATHER_W[safe(() => seasonNow(), 'autumn')]) || { clear: 1 }, keys = Object.keys(t);
    let r = ((((G.seed || 1) % 9973) * 9301 + G.day * 49297) % 233280) / 233280 * keys.reduce((a, k) => a + t[k], 0), pw = keys[0];
    for (const k of keys) { r -= t[k]; if (r <= 0) { pw = k; break; } }
    return { clear: 'Forecast: dry and clear tomorrow. A good day for a long run.', rain: 'Forecast: rain tomorrow. It drowns out footsteps, yours and theirs.',
      fog: 'Forecast: fog off the river tomorrow. They will not see you coming. You will not see them.', snow: 'Forecast: snow tomorrow. Dress warm; the cold bites.' }[pw] || '';
  }
  function weaponChip() {
    const w = safe(() => weaponOf(), null), it = w && ITEMS[w];
    const name = it ? it.n : 'Fists';
    let ammo = '', out = false;
    if (it && it.ammo) { const n = G.pack[it.ammo] || 0; ammo = n + ' ' + (it.ammo === 'shells' ? 'SH' : it.ammo === 'bolts' ? 'BLT' : 'RND'); out = n === 0; }
    const owned = Object.keys(G.pack).filter(k => ITEMS[k] && ITEMS[k].c === 'weapon').length;
    const cond = w ? Math.round(safe(() => weaponCond(w), 100)) : 100;
    const key = name + ammo + owned + '|' + cond;
    if (S.c.wpn === key) return; S.c.wpn = key;
    D.wpn.querySelector('.n').textContent = name;
    /* condition pip: only once this weapon has started to wear */
    const c = D.wpn.querySelector('.c'); c.hidden = cond >= 100; c.classList.toggle('low', cond < 60); c.firstChild.style.width = cond + '%'; c.title = `Condition ${cond}%`;
    const a = D.wpn.querySelector('.a'); a.textContent = ammo; a.classList.toggle('out', out);
    D.wpn.querySelector('.k').textContent = owned > 1 ? 'Q' : '';
  }
  function barricade() {
    const hp = typeof Combat !== 'undefined' ? Combat.barricadeHp : null;
    const on = hp != null && isFinite(hp) && !!((typeof Game !== 'undefined' && Game.wave) || Combat.wave);
    if (!on) { if (!D.barri.hidden) { D.barri.hidden = true; S.barMax = 0; S.barLast = null; S.c.barri = null; } return; }
    D.barri.hidden = false; S.barMax = Math.max(S.barMax, hp, Combat.barricadeMax || 0);
    const pct = S.barMax ? cl(hp / S.barMax, 0, 1) : 0, q = Math.round(pct * 100);
    // a red tick flash whenever the barricade loses HP; the ghost segment shows what was just lost
    if (S.barLast != null && hp < S.barLast - 0.01) { D.barri.classList.remove('hit'); void D.barri.offsetWidth; D.barri.classList.add('hit'); }
    S.barLast = hp;
    if (S.c.barri !== q) {
      S.c.barri = q; D.barri.querySelector('.fl').style.transform = `scaleX(${pct})`;
      const gh = D.barri.querySelector('.gh'); if (gh) gh.style.transform = `scaleX(${pct})`;
      setText(D.barri.querySelector('.pc'), 'barpc', q + '%');
      D.barri.classList.toggle('low', pct < 0.3);
    }
  }
  function vignette() {
    if (!G || !D.vig) return;
    const p = G.p, hpr = p.maxHp ? p.hp / p.maxHp : 1;
    const grab = typeof Combat !== 'undefined' && !!Combat.grabbed;
    let a = 0, col = 'rgba(170,20,10,.78)', pulse = false;
    if (hpr < 0.38) { a = 0.35 + (0.38 - hpr) / 0.38 * 0.65; pulse = hpr < 0.2; }
    if (p.inf > 0 && a < 0.3) { a = Math.max(a, 0.25 + Math.min(1, p.inf / 100) * 0.55); col = 'rgba(70,110,30,.7)'; pulse = p.inf >= 50; }
    if (grab) { a = 1; col = 'rgba(190,20,10,.85)'; pulse = true; }
    if (Game && Game.dead) a = 0;
    const key = Math.round(a * 20) + col + pulse;
    if (S.c.vig === key) return; S.c.vig = key;
    D.vig.style.opacity = a.toFixed(2); D.vig.style.setProperty('--vc', col); D.vig.classList.toggle('pulse', pulse);
  }

  /* ---------- prompt ---------- */
  function renderPrompt() {
    const src = S.mpr || S.pr, t = blocking() ? null : src.t;
    if (!t) { if (!D.prompt.hidden) { D.prompt.hidden = true; S.prKey = ''; } return; }
    const m = /^(Hold\s+)?E\s+(.*)$/.exec(t);
    const key = t + '|' + INPUT.touch;
    if (S.prKey !== key) {
      S.prKey = key; D.prompt.hidden = false;
      D.prompt.classList.toggle('info', !m);
      D.prompt.classList.toggle('hold', !!(m && m[1]));
      // key chip: E on keyboard, USE on touch; the ring around it fills while a hold is in progress
      const w = INPUT.touch ? 48 : 32, h = 32, sv = D.prompt.querySelector('.key svg'), rc = sv.querySelectorAll('rect');
      D.prompt.querySelector('.key').style.width = w + 'px';
      sv.setAttribute('width', w + 8); sv.setAttribute('height', h + 8);
      rc.forEach(r => { r.setAttribute('width', w + 4); r.setAttribute('height', h + 4); });
      D.prompt.querySelector('.kt').textContent = INPUT.touch ? 'USE' : 'E';
      D.prompt.querySelector('.tx').innerHTML = m ? (m[1] ? '<span class="hl">Hold</span>' : '') + esc(m[2]) : esc(t);
      S.c.prp = -1;
    }
    const pr = src.p == null ? 0 : cl(src.p, 0, 1), q = Math.round(pr * 60);
    if (S.c.prp !== q) { S.c.prp = q; D.prompt.querySelector('rect.pg').style.strokeDashoffset = (100 * (1 - pr)).toFixed(1); }
    anchorPrompt(src.at);
  }
  /* the prompt floats over the thing it is about (a shelf, a car, a person) and follows it as the camera moves; it falls back to the
     bottom of the screen when the thing is off screen. On a phone it keeps clear of the button arc so it never covers a button. */
  function anchorPrompt(at) {
    const P = D.prompt;
    const pt = at && has3D() ? R.tileToScreen(at.x, at.y, at.h || 1.6) : null;
    if (!pt || !pt.on) { if (S.c.panch) { S.c.panch = false; P.classList.remove('anch'); P.style.transform = ''; } return; }
    if (S.prW == null || S.c.prwKey !== S.prKey) { S.c.prwKey = S.prKey; S.prW = P.offsetWidth; S.prH = P.offsetHeight; }
    const vw = innerWidth, vh = innerHeight, w = S.prW, h = S.prH, m = 8;
    let x = pt.x - w / 2, y = pt.y - h - 10;
    const top = S.phone ? (parseFloat(S.c.objh) || 30) + 34 : 64; /* below the objective and its notices */
    if (y < top) y = pt.y + 18;
    x = cl(x, m, vw - w - m); y = cl(y, top, vh - h - m);
    if (S.phone || INPUT.touch) {
      const armL = vw - 262, armT = vh - 196; /* the button arc's corner */
      if (x + w > armL && y + h > armT) { if (pt.x - w / 2 > armL - w) y = Math.min(y, armT - h - 6); else x = Math.min(x, armL - w - 6); }
      if (x < 186 && y + h > vh - 200) x = 186; /* and off the joystick's resting spot */
      x = cl(x, m, vw - w - m); y = cl(y, top, vh - h - m);
    }
    if (!S.c.panch) { S.c.panch = true; P.classList.add('anch'); }
    P.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  }

  /* ---------- minimap / map ---------- */
  const MAPC = {};
  function tileColors() {
    if (MAPC.pal) return MAPC.pal;
    const p = {}; const s = (t, c) => { if (typeof t === 'number') p[t] = c; };
    s(T_GRASS, '#2a2d21'); s(T_ROAD, '#4b4741'); s(T_WALL, '#8d816e'); s(T_DOOR, '#c86a2c'); s(T_TREE, '#1b2618'); s(T_WATER, '#223747');
    s(T_BRIDGE, '#635b50'); s(T_RUBBLE, '#3b342c'); s(T_CAR, '#6a3a26'); s(T_YARD, '#544631'); s(T_FIELD, '#38431f'); s(T_ROOF, '#6f6556'); s(T_FLOOR, '#3d352c'); s(T_PROP, '#5c4d3a');
    s(T_SHALLOW, '#2c3a36'); s(T_BUSH, '#24331f'); s(T_GATE, '#7a3a22'); s(T_DECO, '#5a5650'); s(T_ROCK, '#4a4844'); s(T_PATH, '#5a4a36'); s(T_FENCE, '#6a5e4e'); s(T_PLANK, '#6a5238');
    return (MAPC.pal = p);
  }
  function mapCanvas() {
    if (!WORLD || !G || !G._fog) return null;
    /* districts the story has not opened yet are drawn greyed out; everything redraws when one opens */
    const openKey = WORLD.gates ? Object.keys(WORLD.gates).map(k => (WORLD.gates[k].open || G.flags['open_' + k]) ? 1 : 0).join('') : '';
    if (MAPC.world !== WORLD || !MAPC.can || MAPC.openKey !== openKey) {
      MAPC.world = WORLD; MAPC.openKey = openKey; MAPC.can = MAPC.can || document.createElement('canvas');
      MAPC.can.width = W * 4; MAPC.can.height = H * 4; MAPC.fog = new Uint8Array(W * H);
      const x = MAPC.can.getContext('2d'); x.clearRect(0, 0, W * 4, H * 4); MAPC.dirty = true;
    }
    if (MAPC.dirty || now() - (MAPC.t || 0) > 0.4) {
      MAPC.t = now(); MAPC.dirty = false;
      const f = G._fog, x = MAPC.can.getContext('2d'), pal = tileColors();
      for (let i = 0; i < W * H; i++) if (f[i] && !MAPC.fog[i]) {
        MAPC.fog[i] = 1; const tx = i % W, ty = (i / W) | 0;
        const col = pal[WORLD.tiles[i]] || '#333', sealed = !safe(() => districtOpen(biomeAt(tx + 0.5, ty + 0.5)), true);
        x.fillStyle = sealed ? greyOut(col) : col; x.fillRect(tx * 4, ty * 4, 4, 4);
      }
    }
    return MAPC.can;
  }
  const GREY = {};
  function greyOut(hex) {
    if (GREY[hex]) return GREY[hex];
    const n = parseInt(hex.slice(1), 16), l = (((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) * 0.55 + 10) | 0;
    return (GREY[hex] = `rgb(${l},${l},${l + 3})`);
  }
  /* sealed story gates: a red hatched block (SEALED on the full map) so they read as closed */
  function drawGates(x, s, ox, oy, full) {
    if (!WORLD.gates || !G._fog) return;
    for (const id in WORLD.gates) {
      const gt = WORLD.gates[id]; if (gt.open || G.flags['open_' + id]) continue;
      if (!gt.tiles.some(([tx, ty]) => G._fog[ty * W + tx])) continue;
      const x0 = ox + gt.x0 * s, y0 = oy + gt.y0 * s, w = (gt.x1 - gt.x0 + 1) * s, h = (gt.y1 - gt.y0 + 1) * s;
      x.save(); x.fillStyle = 'rgba(160,48,28,.55)'; x.fillRect(x0, y0, w, h);
      x.beginPath(); x.rect(x0, y0, w, h); x.clip(); x.strokeStyle = 'rgba(255,140,110,.6)'; x.lineWidth = 1; x.beginPath();
      for (let k = -h; k < w; k += full ? 8 : 5) { x.moveTo(x0 + k, y0 + h); x.lineTo(x0 + k + h, y0); }
      x.stroke(); x.restore();
      x.strokeStyle = '#e05a46'; x.lineWidth = full ? 2 : 1; x.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
      if (full) {
        x.font = '600 11px "IBM Plex Mono", monospace'; x.textAlign = 'center';
        const lb = 'SEALED', tw = x.measureText(lb).width + 8, cx = x0 + w / 2, cy = y0 + h / 2;
        x.fillStyle = 'rgba(0,0,0,.75)'; x.fillRect(cx - tw / 2, cy - 8, tw, 15); x.fillStyle = '#ff8a6a'; x.fillText(lb, cx, cy + 3);
      }
    }
  }
  function drawIcons(x, s, ox, oy, size, full) {
    drawGates(x, s, ox, oy, full);
    const p = G.p, tp = (tx, ty) => [ox + tx * s, oy + ty * s];
    // shelter
    const h = WORLD.hatch; if (h) { const [hx, hy] = tp(h.x + 0.5, h.y + 0.5); x.strokeStyle = '#ebe1ce'; x.lineWidth = full ? 2 : 1.5; x.strokeRect(hx - 4, hy - 4, 8, 8); x.fillStyle = 'rgba(232,116,44,.6)'; x.fillRect(hx - 2, hy - 2, 4, 4); }
    // enemies close by (perception helps you notice them)
    if (!full && typeof Combat !== 'undefined' && Array.isArray(Combat.enemies)) {
      const rr = 8 + safe(() => A('per'), 4);
      x.fillStyle = '#d8402e';
      for (const e of Combat.enemies) { if (!e || e.dead || typeof e.x !== 'number') continue; if (Math.hypot(e.x - p.x, e.y - p.y) > rr) continue; const [ex, ey] = tp(e.x, e.y); x.fillRect(ex - 1.5, ey - 1.5, 3, 3); }
    }
    // objective
    const o = curObjective().target;
    if (o) {
      let [ox2, oy2] = tp(o.x, o.y); const pul = 3 + Math.sin(now() * 5) * 1;
      if (!full) { const m = 6; const cx = size / 2, cy = size / 2; const dx = ox2 - cx, dy = oy2 - cy; const k = Math.max(Math.abs(dx) / (cx - m), Math.abs(dy) / (cy - m), 1); ox2 = cx + dx / k; oy2 = cy + dy / k; }
      x.fillStyle = '#e8742c'; x.beginPath(); x.arc(ox2, oy2, full ? pul + 2 : pul, 0, 7); x.fill();
      x.strokeStyle = '#ffb067'; x.lineWidth = 1; x.stroke();
    }
    // player arrow
    const [px, py] = tp(p.x, p.y), f = p.face || 0, fx = Math.sin(f), fy = Math.cos(f), L = full ? 9 : 6;
    x.fillStyle = '#ebe1ce'; x.strokeStyle = '#000'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(px + fx * L, py + fy * L); x.lineTo(px - fx * L * 0.6 + fy * L * 0.6, py - fy * L * 0.6 - fx * L * 0.6); x.lineTo(px - fx * L * 0.25, py - fy * L * 0.25); x.lineTo(px - fx * L * 0.6 - fy * L * 0.6, py - fy * L * 0.6 + fx * L * 0.6); x.closePath(); x.fill(); x.stroke();
  }
  function drawMinimap() {
    const c = mapCanvas(); if (!c) return;
    const x = D.mm.getContext('2d'), size = 132, p = G.p;
    x.fillStyle = '#0d0c0b'; x.fillRect(0, 0, size, size);
    const ox = Math.round(size / 2 - p.x * 4), oy = Math.round(size / 2 - p.y * 4);
    x.imageSmoothingEnabled = false; x.drawImage(c, ox, oy);
    drawIcons(x, 4, ox, oy, size, false);
    x.strokeStyle = 'rgba(235,225,206,.12)'; x.lineWidth = 1; x.strokeRect(0.5, 0.5, size - 1, size - 1);
  }
  function drawFullMap(cv) {
    const c = mapCanvas(); if (!c || !cv) return;
    const s = 8, x = cv.getContext('2d'); cv.width = W * s; cv.height = H * s;
    x.fillStyle = '#0c0b0a'; x.fillRect(0, 0, cv.width, cv.height);
    x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, W * s, H * s);
    // grid of district lines
    x.strokeStyle = 'rgba(255,255,255,.03)'; for (let i = 0; i <= W; i += 4) { x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, H * s); x.stroke(); }
    drawIcons(x, s, 0, 0, 0, true);
    x.font = '600 11px "IBM Plex Mono", monospace'; x.textAlign = 'center';
    const f = G._fog;
    for (const k in WORLD.pois) {
      const q = WORLD.pois[k]; if (!f[q.y * W + q.x]) continue;
      const tx = (q.x + 0.5) * s, ty = (q.y + 0.5) * s - 8, lb = String(q.label || '').toUpperCase();
      x.fillStyle = 'rgba(0,0,0,.65)'; const w = x.measureText(lb).width + 8; x.fillRect(tx - w / 2, ty - 10, w, 14);
      x.fillStyle = q.type === 'tollcamp' ? '#e05a46' : q.type === 'shelter' ? '#ffb067' : '#ebe1ce'; x.fillText(lb, tx, ty + 1);
    }
  }

  /* ---------- floating numbers, overhead bars ---------- */
  function dmgNum(x, y, text, cls) {
    if (text == null || text === '' || !D.dmg) return;
    // combat reports enemy hits as dmgNum(e.x, e.y, n, 'hit'|'crit'): show that enemy's HP bar for a moment
    if ((cls === 'hit' || cls === 'crit') && typeof Combat !== 'undefined' && Array.isArray(Combat.enemies)) {
      const e = Combat.enemies.find(q => q && q.x === x && q.y === y); if (e) enemyHit(e);
    }
    let n = S.dn.find(d => d.t >= 0.9) || S.dn.reduce((a, b) => a.t > b.t ? a : b);
    n.t = 0; n.x = x + (Math.random() - 0.5) * 0.4; n.y = y; n.h = 1.9;
    n.el.className = 'dn ' + (cls || (typeof text === 'number' && text >= 15 ? 'big' : ''));
    n.el.textContent = typeof text === 'number' ? String(Math.round(text)) : String(text);
    if (!has3D()) n.t = 9;
  }
  function tickDmg(dt) {
    if (!has3D()) return;
    for (const n of S.dn) {
      if (n.t >= 0.9) { if (n.el.style.opacity !== '0') n.el.style.opacity = 0; continue; }
      n.t += dt; const k = n.t / 0.9, pt = R.tileToScreen(n.x, n.y, n.h + k * 1.4);
      n.el.style.opacity = k < 0.15 ? k / 0.15 : Math.max(0, 1 - (k - 0.5) / 0.5);
      n.el.style.transform = `translate(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px) translate(-50%,-50%) scale(${k < 0.12 ? 1.4 - k * 3 : 1})`;
    }
  }
  /* one overhead bar element: <div class="ohp [cls]"><i></i><b>label</b></div>, placed over tile (x,y) at height h */
  function makeBar(cls) { const e = document.createElement('div'); e.className = 'ohp' + (cls ? ' ' + cls : ''); e.innerHTML = '<i></i><b></b>'; D.ohps.appendChild(e); return { el: e }; }
  function placeBar(b, x, y, h, frac, label) {
    const pt = R.tileToScreen(x, y, h);
    b.el.style.transform = `translate(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px)`;
    if (b.on !== pt.on) { b.on = pt.on; b.el.style.display = pt.on ? '' : 'none'; }
    const f = frac == null ? 1 : cl(frac, 0, 1), q = Math.round(f * 200);
    if (b.q !== q) { b.q = q; const i = b.el.firstChild; i.style.transform = `scaleX(${f})`; b.el.classList.toggle('lo', frac != null && f < 0.35); }
    if (b.label !== label) { b.label = label; b.el.lastChild.textContent = label || ''; }
  }
  function worldBar(key, x, y, frac, label) {
    let b = S.wbars[key];
    if (x == null) { if (b) { b.el.remove(); delete S.wbars[key]; } return; }
    if (!b) b = S.wbars[key] = makeBar('');
    if (!has3D()) return;
    placeBar(b, x, y, 2.3, frac, label);
  }
  /* lock-on chevron + enemy HP bars (locked target always; any enemy for ~2 s after a hit) */
  function lockOn(e) { S.lock = e && !e.dead ? e : null; }
  function enemyHit(e) { if (!e || e.uid == null) return; S.ehit[e.uid] = { e, t: 2.2 }; }
  function tickEnemyBars(dt) {
    const show = {};
    if (S.lock && (S.lock.dead || S.lock.hp <= 0)) S.lock = null;
    if (S.lock) show[S.lock.uid] = S.lock;
    for (const k in S.ehit) { const h = S.ehit[k]; h.t -= dt; if (h.t <= 0 || h.e.dead || h.e.hp <= 0) delete S.ehit[k]; else show[k] = h.e; }
    const ok = has3D() && !blocking() && D.ohps;
    for (const k in S.ebars) if (!ok || !show[k]) { S.ebars[k].el.remove(); delete S.ebars[k]; }
    const lk = D.lock;
    if (!ok) { if (lk && !lk.hidden) lk.hidden = true; return; }
    for (const k in show) {
      const e = show[k]; let b = S.ebars[k];
      if (!b) b = S.ebars[k] = makeBar('ehp');
      placeBar(b, e.x, e.y, 1.9, e.maxHp ? e.hp / e.maxHp : 1, '');
      const fade = S.lock === e ? 1 : Math.min(1, (S.ehit[k] ? S.ehit[k].t : 1) / 0.4);
      if (b.fade !== fade) { b.fade = fade; b.el.style.opacity = fade.toFixed(2); }
    }
    if (!lk) return;
    if (!S.lock) { if (!lk.hidden) lk.hidden = true; return; }
    const pt = R.tileToScreen(S.lock.x, S.lock.y, 1.9);
    lk.hidden = !pt.on;
    lk.style.transform = `translate(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px)`;
  }

  /* ---------- toasts, hints, banner, flash, level up, unlocks, timer ---------- */
  /* toasts: at most 3 on screen, a repeat merges into the visible one ("+1 Batteries ×2"), short life (story lines stay longer) */
  const toastLife = (text, cls) => cls === 'story' ? 5200 + Math.min(2600, text.length * 30) : 2300 + Math.min(1700, text.length * 18);
  function toast(text, cls) {
    if (!text || !D.toasts) return;
    text = String(text); if (INPUT.touch) text = touchWords(text);
    const live = [...D.toasts.children].filter(t => !t.classList.contains('out'));
    const same = live.find(t => t.dataset.t === text);
    if (same) {
      const n = (+same.dataset.n || 1) + 1; same.dataset.n = n;
      same.innerHTML = esc(text) + `<span class="xn">×${n}</span>`;
      D.toasts.appendChild(same); same.classList.remove('bump'); void same.offsetWidth; same.classList.add('bump');
      clearTimeout(same._t); same._t = setTimeout(() => fade(same), toastLife(text, cls)); return;
    }
    const d = document.createElement('div'); d.className = 'toast ' + (cls || ''); d.textContent = text; d.dataset.t = text;
    D.toasts.appendChild(d);
    for (let over = live.length + 1 - 3, i = 0; over > 0 && i < live.length; i++, over--) { clearTimeout(live[i]._t); live[i].remove(); }
    d._t = setTimeout(() => fade(d), toastLife(text, cls));
    if (cls === 'loot') SFX.play('pickup'); else if (cls === 'story') SFX.play('good');
  }
  function fade(d) { d.classList.add('out'); setTimeout(() => d.remove(), 420); }
  /* hints are written for keyboard; on touch name the on-screen buttons instead */
  const TOUCH_WORDS = [[/Click or J to attack\. Space to dodge\./, 'Tap ATTACK. DODGE rolls clear.'], [/Mouse aims\./, 'ATTACK aims at the nearest one.'],
    [/C to crouch\./, 'CROUCH to sneak.'], [/Mash attack/, 'Mash ATTACK'], [/[Hh]old E/g, m => m[0] + 'old USE'], [/\(I\)/, '(PACK)'], [/\(B\)/, '(CHAR)'],
    [/H: stay \/ follow\./, 'Tap their name to make them stay or follow.'], [/R: send them to fetch\./, 'Tap FETCH to send them.'], [/\bE again\b/, 'USE again'], [/\bpress E\b/gi, 'tap USE']];
  function touchWords(t) { for (const [re, to] of TOUCH_WORDS) t = t.replace(re, to); return t; }
  /* ---------- notices: teaching hints and "New: X" unlock cards, one at a time ----------
     A card shows only while nothing modal is open (its clock stops behind dialogues, panels and cutscenes). During a fight only
     fight lessons (and keyless lines from moments and companions) show; the rest wait for a calm moment. A queued lesson the
     player has already done is dropped. An unlock and the hint that comes with it make one card. */
  const FIGHT_HINTS = { combat: 1, crouch: 1, sneak: 1, grab: 1, gun: 1, revive: 1, bottle: 1, horde_now: 1 };
  const HINT_DONE = {
    search: () => G.stats.searches > 0, first_loot: () => !!G.atShelter, points: () => !(G.p.points > 0),
    build: () => Object.keys(G.buildings || {}).some(k => G.buildings[k] > 0), move: () => false,
  };
  function hint(text, o) {
    if (!text || !D.hint) return; o = o || {};
    if (INPUT.touch) text = touchWords(text);
    if ((S.hintCur && S.hintCur.text === text) || S.hintQ.some(h => h.text === text)) return;
    const u = S.unlockOpen; /* the hint that the same unlock() call fires right after it joins its card */
    if (u && !u.text) { u.text = text; u.key = o.key || null; return; }
    S.hintQ.push({ text, key: o.key || null });
  }
  function unlockCard(label) {
    const c = { title: 'New: ' + label, text: '', unlock: true, key: null }; S.hintQ.push(c); SFX.play('good');
    S.unlockOpen = c; Promise.resolve().then(() => { if (S.unlockOpen === c) S.unlockOpen = null; });
  }
  const calmFor = h => !h.key || FIGHT_HINTS[h.key];
  function tickHints(dt) {
    if (!D.hint) return;
    const fight = typeof Combat !== 'undefined' && Combat.inFight && safe(() => Combat.inFight(), false), free = !blocking();
    const cur = S.hintCur;
    if (cur) {
      const show = free && (!fight || calmFor(cur));
      if (D.hint.classList.contains('on') !== show) D.hint.classList.toggle('on', show);
      if (!show) return;
      cur.t -= dt;
      const stale = cur.key && HINT_DONE[cur.key] && cur.shown > 1.2 && safe(HINT_DONE[cur.key], false);
      cur.shown = (cur.shown || 0) + dt;
      if (cur.t <= 0 || stale) { D.hint.classList.remove('on'); S.hintCur = null; S.hintGap = 0.45; }
      return;
    }
    if (S.hintGap > 0) { S.hintGap -= dt; return; }
    if (!free) return;
    for (let i = 0; i < S.hintQ.length; i++) {
      const h = S.hintQ[i], done = h.key && HINT_DONE[h.key];
      if (done && safe(done, false)) { S.hintQ.splice(i--, 1); continue; }
      if (fight && !calmFor(h)) continue;
      S.hintQ.splice(i, 1);
      const len = (h.title || '').length + h.text.length;
      h.t = 3.8 + Math.min(2.5, len * 0.022) + (h.title ? 0.8 : 0);
      S.hintCur = h;
      D.hint.innerHTML = (h.title ? `<b>${esc(h.title)}</b>` : '') + esc(h.text);
      D.hint.classList.toggle('new', !!h.title); D.hint.classList.add('on');
      return;
    }
  }
  function banner(title, line) {
    if (!D.banner) return;
    D.banner.querySelector('.t').textContent = title || '';
    D.banner.querySelector('.l').textContent = line ? firstSentence(fmt(line), 130) : '';
    D.banner.classList.add('on'); D.hud.classList.add('bannering'); clearTimeout(S.bannerT);
    S.bannerT = setTimeout(() => { D.banner.classList.remove('on'); D.hud.classList.remove('bannering'); }, 4600);
  }
  function flash(kind) {
    const f = D.flash; if (!f) return;
    const k = { hurt: ['radial-gradient(ellipse at center,rgba(179,23,12,.28) 35%,rgba(190,20,8,.95) 100%)', 0.85, 0.42], hit: ['#ffffff', 0.18, 0.15], heal: ['#6fbf4a', 0.3, 0.5], level: ['#e8742c', 0.45, 0.9], sleep: ['#000000', 1, 1.8] }[kind] || ['#ffffff', 0.2, 0.2];
    f.style.background = k[0]; f.style.setProperty('--fo', k[1]); f.style.animationDuration = k[2] + 's';
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    if (kind === 'hurt') { SFX.play('hurt'); if (!reducedMotion() && typeof R !== 'undefined' && R.shake) safe(() => R.shake(0.18)); }
  }
  function levelUp() {
    const p = G && G.p; if (!D.lvl) return;
    D.lvl.hidden = false;
    D.lvl.innerHTML = `<div class="in"><div class="t">Level ${p ? p.level : ''}</div><div class="rule"></div><div class="s">+1 attribute point · ${INPUT.touch ? 'tap CHAR' : 'press B'}</div></div>`;
    clearTimeout(S.lvlT); S.lvlT = setTimeout(() => { D.lvl.hidden = true; }, 2700);
    flash('level'); SFX.play('levelup');
    safe(() => hintOnce('points', INPUT.touch ? 'Spend your attribute point: tap CHAR at the top.' : 'Spend your attribute point in the character sheet (B).'));
  }
  function onUnlock(key) {
    if (key === 'build' && typeof World3D !== 'undefined' && World3D.refreshShelter) safe(() => World3D.refreshShelter()); // the build outlines appear now, not after the next sleep
    const l = UNLOCK_LABEL[key]; if (!l) return;
    unlockCard(l);
    if (key === 'journal' && D.mm.hidden === false) { D.mm.classList.remove('reveal'); void D.mm.offsetWidth; D.mm.classList.add('reveal'); }
  }
  function timer(label, seconds) {
    if (label == null || seconds == null) { S.timer = null; D.timer.hidden = true; return; }
    if (!S.timer || S.timer.label !== label) { S.timer = { label, t: seconds }; D.timer.querySelector('.lb').textContent = label; S.c.tmr = null; }
    else S.timer.t = seconds;
    D.timer.hidden = false;
  }

  /* ---------- dialogue ---------- */
  /* d: {who, lines:[string|{who,line}], choices:[{label,note,disabled,onPick}], tag:{ok,text}, onDone} */
  function dialogue(d) {
    const pg = [];
    for (const l of (d.lines || [])) {
      if (l == null || l === '') continue;
      if (typeof l === 'object') { for (const t of pages(fmt(l.line), 170)) pg.push({ who: l.who, text: t, beat: true }); continue; }
      for (const t of pages(fmt(l), 150)) {
        const prev = pg[pg.length - 1];
        if (prev && !prev.beat && !prev.joined && (prev.text + ' ' + t).length <= 165) { prev.text += '\n' + t; prev.joined = true; } else pg.push({ text: t });
      }
    }
    if (!pg.length) pg.push({ text: '' });
    S.dlg = { d, pg, i: 0, sel: 0, typing: false };
    syncBlock();
    D.dlg.hidden = false; D.dlg.style.animation = 'none'; void D.dlg.offsetWidth; D.dlg.style.animation = '';
    renderPage();
    SFX.play('ui');
  }
  function renderPage() {
    const s = S.dlg; if (!s) return;
    const page = s.pg[s.i], last = s.i === s.pg.length - 1, d = s.d;
    const who = page.who != null && page.who !== '' ? page.who : (page.beat ? (d.who || '') : (d.who || ''));
    const ch = last ? (d.choices || []) : [];
    s.sel = Math.max(0, ch.findIndex(c => !c.disabled));
    const tag = last && d.tag ? `<span class="tag ${d.tag.ok ? 'ok' : 'no'}">${esc(d.tag.text)}</span>` : '';
    D.dlg.innerHTML = `<div class="who">${esc(who)}</div>${tag}<div class="ln"></div>` +
      (ch.length ? `<div class="ch${ch.length > 4 ? ' many' : ''}">${ch.map((c, i) => `<button data-i="${i}" ${c.disabled ? 'disabled' : ''} class="${i === s.sel ? 'sel' : ''}"><span class="num">${i + 1}</span><span class="lb">${esc(c.label)}</span>${c.note ? `<span class="note">${esc(c.note)}</span>` : ''}</button>`).join('')}</div>
          ${ch.length > 1 ? `<div class="kh">↑↓ choose · Enter pick · 1–${Math.min(9, ch.length)}</div>` : ''}`
        : `<div class="nx"><button data-continue>${last ? (d.doneLabel || 'Continue') : 'Next'} ${INPUT.touch ? '' : '<span class="kc">E</span>'}</button></div>`);
    const ln = D.dlg.querySelector('.ln');
    // typewriter
    const full = page.text; let n = 0; s.typing = true;
    const lines = full.split('\n');
    const draw = () => { let left = n; ln.innerHTML = lines.map(t => { const v = t.slice(0, Math.max(0, left)); left -= t.length; return `<p>${esc(v)}</p>`; }).join(''); };
    const step = () => { if (S.dlg !== s || !s.typing) return; n += 3; draw(); if (n >= full.length) { s.typing = false; draw(); return; } requestAnimationFrame(step); };
    s.finish = () => { s.typing = false; n = full.length; draw(); };
    step();
    D.dlg.querySelectorAll('.ch button').forEach(b => {
      b.onclick = e => { e.stopPropagation(); pickChoice(+b.dataset.i); };
      b.onmouseenter = () => { if (!b.disabled) dlgSel(+b.dataset.i, true); };
    });
    const nx = D.dlg.querySelector('[data-continue]'); if (nx) nx.onclick = e => { e.stopPropagation(); advance(); };
    ln.onclick = () => advance();
  }
  function advance() {
    const s = S.dlg; if (!s) return;
    if (s.typing) { s.finish(); return; }
    const last = s.i === s.pg.length - 1;
    if (!last) { s.i++; renderPage(); SFX.play('ui'); return; }
    const ch = s.d.choices || [];
    if (!ch.length) { closeDlg(); s.d.onDone && s.d.onDone(); }
    else if (ch.filter(c => !c.disabled).length === 1) pickChoice(ch.findIndex(c => !c.disabled));
  }
  function pickChoice(i) {
    const s = S.dlg; if (!s) return;
    const c = (s.d.choices || [])[i]; if (!c || c.disabled) { if (s.typing) s.finish(); return; }
    SFX.play('ui'); closeDlg();
    if (c.onPick) c.onPick();
  }
  function closeDlg() { S.dlg = null; D.dlg.hidden = true; D.dlg.innerHTML = ''; syncBlock(); }
  function dlgSel(j, quiet) {
    const s = S.dlg; if (!s) return; s.sel = j;
    D.dlg.querySelectorAll('.ch button').forEach((b, k) => { b.classList.toggle('sel', k === j); if (k === j && !quiet) scrollNear(b); });
  }
  function dlgKey(e) {
    const s = S.dlg, c = e.code, last = s.i === s.pg.length - 1, ch = last ? (s.d.choices || []) : [];
    if (/^(Digit|Numpad)[1-9]$/.test(c)) { const i = +c.slice(-1) - 1; if (ch.length) { if (i < ch.length) pickChoice(i); } else if (s.typing) s.finish(); return; }
    if (ch.length > 1 && /^(ArrowDown|KeyS|ArrowUp|KeyW|ArrowLeft|KeyA|ArrowRight|KeyD)$/.test(c)) {
      e.preventDefault(); if (s.typing) s.finish();
      const dir = /^(ArrowDown|KeyS|ArrowRight|KeyD)$/.test(c) ? 1 : -1; let j = s.sel;
      for (let k = 0; k < ch.length; k++) { j = (j + dir + ch.length) % ch.length; if (!ch[j].disabled) break; }
      dlgSel(j); SFX.play('ui'); return;
    }
    if (c === 'KeyE' || c === 'Space' || c === 'Enter' || c === 'NumpadEnter') {
      e.preventDefault(); if (e.repeat) return;
      if (s.typing) { s.finish(); return; }
      if (ch.length > 1) { if (c === 'Enter' || c === 'NumpadEnter') pickChoice(s.sel); return; }
      advance();
    }
  }

  /* ---------- encounters, scenes, summary, final, end ---------- */
  function encounter(enc, done) {
    done = done || (() => { });
    const who = enc.who || enc.title;
    const text = typeof encText === 'function' ? encText(enc) : safe(() => fmt(typeof enc.text === 'function' ? enc.text() : enc.text), '');
    const choices = (enc.choices || []).map(c => {
      const ok = !c.req || safe(() => !!c.req(), false);
      const pct = c.check ? Math.round(safe(() => checkChance(c.check), 0.5) * 100) : null;
      return {
        label: c.label, disabled: !ok,
        note: ok ? (c.check ? `${String(c.check.attr).toUpperCase()} ${pct}%` : '') : (c.reqText || 'Unavailable'),
        onPick: () => resolveChoice(enc, c, who, done),
      };
    });
    if (!choices.length) choices.push({ label: 'Continue', onPick: () => done('') });
    dialogue({ who, lines: [text], choices, title: enc.title });
  }
  function resolveChoice(enc, c, who, done) {
    let spawned = false; const orig = Hooks.spawnFight;
    Hooks.spawnFight = function (ids, o) { spawned = true; return orig ? orig.apply(this, arguments) : undefined; };
    const ok = !c.check || chance(checkChance(c.check));
    let r = '';
    try { r = ok ? (c.success ? c.success() : '') : (c.fail ? c.fail() : (c.success ? c.success() : '')); }
    catch (err) { console.warn('encounter', enc.id, err); r = ''; }
    finally { Hooks.spawnFight = orig; }
    r = fmt(typeof r === 'string' ? r : '');
    if (spawned) { if (r) banner(enc.title, r); SFX.play('groan'); done(''); return; }
    if (!r) { done(''); return; }
    dialogue({ who, lines: [r], tag: c.check ? { ok, text: `${String(c.check.attr).toUpperCase()} ${ok ? 'check passed' : 'check failed'}` } : null, doneLabel: 'Continue', onDone: () => done('') });
    if (c.check) SFX.play(ok ? 'good' : 'bad');
  }
  function scene(id, done) {
    done = done || (() => { });
    const sc = CONTENT_().story[id];
    if (!sc) { done(''); return; }
    let beats = sc.beats && sc.beats.length ? sc.beats.map(b => ({ who: b.who || '', line: fmt(b.line) }))
      : (sc.paras || []).slice(0, 3).map(p => ({ who: '', line: firstSentence(fmt(typeof p === 'string' ? p : ''), 140) })).filter(b => b.line);
    if (G && sc.title && !G.journal.some(j => j.title === sc.title) && typeof storyText === 'function') safe(() => journal(sc.title, storyText(sc)));
    dialogue({
      who: sc.title, lines: beats, doneLabel: 'Continue',
      onDone: () => {
        done('');
        if (id === 'intro') setTimeout(() => safe(() => hintOnce('move', INPUT.touch ? 'Drag the left side of the screen to move.' : 'WASD to move. Shift to sprint.')), 400);
      },
    });
  }
  function summary(item, done) {
    done = done || (() => { });
    const lines = (item.lines || []).slice(0, 5), more = (item.lines || []).length - lines.length;
    openPanel('summary', {
      title: 'Dawn', sub: 'Day ' + (item.day || G.day), narrow: true,
      body: () => `<div class="sum">${lines.length ? lines.map(l => `<div class="${esc(l.cls || '')}">${esc(l.msg)}</div>`).join('') : '<div>A quiet night.</div>'}
        ${more > 0 ? `<div class="muted">+${more} more in the journal</div>` : ''}${item.radio ? `<div class="radio">RADIO · ${esc(firstSentence(fmt(item.radio), 160))}</div>` : ''}${G.flags && G.flags.radio_built ? `<div class="radio">${esc(forecast())}</div>` : ''}</div>`,
      foot: () => `<button class="btn pri" data-a="close">Begin the day <span class="kc k-hide">E</span></button>`,
      onClose: () => done(''),
    });
  }
  function final(done) {
    done = done || (() => { });
    const opts = safe(() => finalOptions(), []);
    dialogue({
      who: 'The last night', lines: ['The horde is at the edge of the city.', 'Choose how this ends.'],
      choices: opts.map(o => ({
        label: o.label, note: o.note, disabled: !o.ok,
        onPick: () => {
          const r = chooseFinal(o.id);
          // 'wait' = not yet; a run kind ('wave', 'cure', 'storm', ...) is started by main's Game.finalRun; anything else is an ending id
          if (r === 'wait' || !r) done('');
          else if (typeof Game !== 'undefined' && Game.finalRun && Game.finalRun(r)) done('');
          else U.end(r); // the public end: main.js wraps it to play the ending cutscene first
        },
      })),
    });
  }
  function end(id) {
    const sc = CONTENT_().story[id] || { title: id === 'death' ? 'You died' : 'The End', paras: [] };
    const dead = id === 'death' || id === 'end_stand_fail' || id === 'end_alliance_fail';
    const lines = sc.beats && sc.beats.length ? sc.beats.map(b => (b.who ? b.who + ': ' : '') + fmt(b.line)) : (sc.paras || []).slice(0, 4).map(p => firstSentence(fmt(p), 160));
    const epi = (safe(() => typeof endingEpilogue === 'function' ? endingEpilogue(id) : [], []) || []).filter(Boolean).slice(0, 5).map(l => fmt(String(l)));
    if (typeof Moments !== 'undefined' && Moments.abort) safe(() => Moments.abort());
    closeDlg(); closePanel(true); closeMg();
    S.end = true; syncBlock();
    if (G) safe(() => markEnded(id)); // death or an ending: the world becomes a memorial on the title screen
    const st = G ? G.stats || {} : {};
    const ey = id === 'death' ? `Day ${G ? G.day : 1} · ${G && G.deathCause ? 'Killed by ' + G.deathCause : 'The city took you'}` : 'Ending';
    D.end.className = dead ? 'dead' : '';
    D.end.innerHTML = `<div class="card"><div class="ey">${esc(ey)}</div><h1>${esc(sc.title)}</h1>
      <div class="bt2">${lines.map((l, i) => `<p style="animation-delay:${0.4 + i * 0.7}s">${esc(l)}</p>`).join('')}</div>
      ${epi.length ? `<ul class="epi">${epi.map((l, i) => `<li style="animation-delay:${0.6 + (lines.length + i) * 0.45}s">${esc(l)}</li>`).join('')}</ul>` : ''}
      <div class="stats"><div><b>${G ? G.day : 0}</b>Days</div><div><b>${st.kills || 0}</b>Kills</div><div><b>${G ? G.survivors.length : 0}</b>Survivors</div><div><b>${G ? G.p.level : 1}</b>Level</div></div>
      <div class="go"><button class="btn" data-e="title">Title</button><button class="btn pri kf" data-e="new">New game</button></div>
      <div class="kh">←→ choose · Enter</div></div>`;
    D.end.hidden = false; showHud(false); S.esel = 1; S.endT = now();
    D.end.querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
      SFX.play('ui');
      if (typeof Game !== 'undefined') { Game.running = false; Game.dead = false; Game.deathShown = false; }
      if (typeof Combat !== 'undefined' && Combat.clear) safe(() => Combat.clear());
      D.end.hidden = true; S.end = false;
      title(b.dataset.e === 'new' ? 'new' : null);
    });
    SFX.play(dead ? 'bad' : 'levelup');
  }

  /* ---------- panels ---------- */
  function openPanel(name, spec) {
    S.panel = name; S.spec = spec; syncBlock();
    D.pnlwrap.hidden = false; D.pnl.className = spec.narrow ? 'narrow' : '';
    D.pnl.style.animation = 'none'; void D.pnl.offsetWidth; D.pnl.style.animation = '';
    renderPanel(); SFX.play('ui');
  }
  function renderPanel() {
    const sp = S.spec; if (!sp) return;
    const tabs = sp.tabs ? sp.tabs() : null;
    let tab = S.panelTab[S.panel];
    if (tabs && !tabs.some(t => t[0] === tab)) tab = S.panelTab[S.panel] = tabs[0][0];
    const scroll = D.pnl.querySelector('.pb-body'), st = scroll ? scroll.scrollTop : 0, same = S.lastRender === S.panel + tab;
    const foot = sp.foot ? sp.foot(tab) : '', keys = sp.keys ? sp.keys(tab) : '';
    D.pnl.innerHTML = `<div class="ph"><h2>${esc(typeof sp.title === 'function' ? sp.title() : sp.title)}</h2><span class="sub">${esc(typeof sp.sub === 'function' ? sp.sub() : (sp.sub || ''))}</span><button class="x" data-a="close" aria-label="Close">×</button></div>
      ${tabs && tabs.length > 1 ? `<div class="tabs">${tabs.map(t => `<button data-a="tab:${t[0]}" class="${t[0] === tab ? 'on' : ''}">${esc(t[1])}</button>`).join('')}</div>` : ''}
      <div class="pb-body">${sp.body(tab)}</div>${foot || keys ? `<div class="ft${foot ? '' : ' kh-only'}">${keys ? `<span class="kh">${keys}</span>` : ''}${foot}</div>` : ''}`;
    S.lastRender = S.panel + tab;
    if (same) { const b = D.pnl.querySelector('.pb-body'); if (b) b.scrollTop = st; }
    if (sp.after) sp.after(tab);
    navApply();
  }
  /* footer key legend: kh(['↑↓','select'],['E','use']) */
  const kh = (...pairs) => pairs.map(([k, t]) => `<b>${k}</b> ${t}`).join('<i>·</i>');

  /* ---------- keyboard selection in panels ----------
     Selectable rows carry data-row="id" (and data-col="group" for side-by-side lists, data-grp to allow vertical hops between groups).
     One row per panel+tab is selected (S.nav) and drawn with the shared .kf focus ring. E/Enter = the row's primary action
     (the row itself when it is a [data-a] button, else its [data-pri] / first [data-a]); data-acts=".sel" points at buttons elsewhere
     (the pack detail box). 1-6 = the row's actions in order, X = its drop action, data-lr rows take left/right (a <select>). */
  const navKey = () => S.panel + ':' + (S.panelTab[S.panel] || '');
  const navRows = () => D.pnl ? [...D.pnl.querySelectorAll('[data-row]')].filter(r => r.getClientRects().length) : [];
  function navCur(rows) { const n = S.nav[navKey()]; return n ? (rows || navRows()).find(r => r.dataset.row === n.id) || null : null; }
  function navActs(r) {
    if (!r) return [];
    const list = r.dataset.acts ? [...D.pnl.querySelectorAll(r.dataset.acts + ' [data-a]')] : [...r.querySelectorAll('[data-a]')];
    return list.filter(b => b.getClientRects().length);
  }
  function navPrimary(r) {
    if (r.dataset.acts) return navActs(r).find(b => b.hasAttribute('data-pri')) || null;
    if (r.matches('[data-a]')) return r;
    return r.querySelector('[data-pri]') || navActs(r)[0] || null;
  }
  function navSet(r, callSel) {
    const col = r.dataset.col || '', list = navRows().filter(x => (x.dataset.col || '') === col);
    S.nav[navKey()] = { id: r.dataset.row, col, idx: Math.max(0, list.indexOf(r)) };
    if (callSel && S.spec && S.spec.onSel) S.spec.onSel(r.dataset.row);
  }
  function navApply() {
    if (!D.pnl) return;
    D.pnl.querySelectorAll('.kf').forEach(x => x.classList.remove('kf'));
    D.pnl.querySelectorAll('[data-kn]').forEach(x => x.removeAttribute('data-kn'));
    const n = S.nav[navKey()]; if (!n) return;
    const rows = navRows(); let r = rows.find(x => x.dataset.row === n.id);
    if (!r && rows.length) { // that row is gone (item used up, moved): stay at the same place in the same list
      const same = rows.filter(x => (x.dataset.col || '') === n.col), list = same.length ? same : rows;
      r = list[Math.min(n.idx, list.length - 1)];
      navSet(r, false); if (S.spec && S.spec.onSel) { S.spec.onSel(r.dataset.row); renderPanel(); return; }
    }
    if (!r) { delete S.nav[navKey()]; return; }
    r.classList.add('kf'); scrollNear(r);
    const acts = navActs(r); if (acts.length > 1 || r.dataset.acts) acts.forEach((b, i) => { if (i < 6) b.setAttribute('data-kn', i + 1); });
  }
  /* spatial pick: the nearest element in direction (dx,dy) from cur, preferring the same column/axis */
  function spatial(list, cur, dx, dy) {
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = Infinity;
    for (const r of list) {
      if (r === cur) continue;
      const b = r.getBoundingClientRect(); if (!b.width && !b.height) continue;
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      if (dy && !(dy > 0 ? b.top >= a.bottom - 4 : b.bottom <= a.top + 4)) continue;
      if (dx && !(dx > 0 ? b.left >= a.right - 4 : b.right <= a.left + 4)) continue;
      const along = dx ? (bx - ax) * dx : (by - ay) * dy, off = dx ? Math.abs(by - ay) : Math.abs(bx - ax);
      const sc = along + off * 2; if (sc < bs) { bs = sc; best = r; }
    }
    return best;
  }
  function navMove(dx, dy) {
    const rows = navRows(); if (!rows.length) return false;
    const cur = navCur(rows);
    if (!cur) { navSet(dy < 0 ? rows[rows.length - 1] : rows[0], true); navRefresh(); SFX.play('ui'); return true; }
    let pool = rows;
    if (dy && cur.dataset.col != null) { // vertical moves stay in the column; hop to another group (barter offer box) only at its end
      pool = rows.filter(r => r.dataset.col === cur.dataset.col);
      if (!spatial(pool, cur, dx, dy)) pool = rows.filter(r => (r.dataset.grp || '') !== (cur.dataset.grp || ''));
    }
    const best = spatial(pool, cur, dx, dy); if (!best) return false;
    navSet(best, true); navRefresh(); SFX.play('ui'); return true;
  }
  /* a panel that tracks the selection itself (pack detail box) re-renders; others only move the ring */
  function navRefresh() { if (S.spec && S.spec.onSel) renderPanel(); else navApply(); }
  function scrollNear(r) {
    const p = r.closest('.pb-body, .ch, #title'); if (!p || p.scrollHeight <= p.clientHeight) return;
    const a = r.getBoundingClientRect(), b = p.getBoundingClientRect(), m = 8;
    if (a.top < b.top + m) p.scrollTop -= b.top + m - a.top; else if (a.bottom > b.bottom - m) p.scrollTop += a.bottom - b.bottom + m;
  }
  function switchTab(dx) {
    const sp = S.spec, tabs = sp && sp.tabs ? sp.tabs() : null; if (!tabs || tabs.length < 2) return false;
    const i = Math.max(0, tabs.findIndex(t => t[0] === S.panelTab[S.panel]));
    S.panelTab[S.panel] = tabs[(i + dx + tabs.length) % tabs.length][0]; SFX.play('ui'); renderPanel(); return true;
  }
  function lrAdjust(r, dx) {
    const sel = r.querySelector('select'); if (!sel) return;
    for (let i = sel.selectedIndex + dx; i >= 0 && i < sel.options.length; i += dx) {
      if (sel.options[i].disabled) continue;
      sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true })); return;
    }
    SFX.play('bad');
  }
  function closePanel(silent) {
    if (!S.panel) return;
    const sp = S.spec; S.panel = null; S.spec = null; S.lastRender = '';
    D.pnlwrap.hidden = true; D.pnl.innerHTML = ''; syncBlock();
    if (!silent && sp && sp.onClose) sp.onClose();
  }
  function panelClick(e) {
    const row = e.target.closest('[data-row]'); if (row && e.isTrusted) navSet(row, false);
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const [a, ...rest] = b.dataset.a.split(':'), arg = rest.join(':');
    if (a === 'close') { SFX.play('ui'); closePanel(); return; }
    if (a === 'tab') { S.panelTab[S.panel] = arg; SFX.play('ui'); renderPanel(); return; }
    if (S.spec && S.spec.act) { S.spec.act(a, arg, b, e); if (S.panel) renderPanel(); }
  }
  function panelChange(e) { if (S.spec && S.spec.change) { S.spec.change(e); if (S.panel) renderPanel(); } }
  function panelKey(e) {
    const c = e.code, sp = S.spec, arrow = /^(Arrow(Up|Down|Left|Right)|Key[WASD])$/.test(c);
    if (e.repeat && !arrow) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const toggle = { pack: 'KeyI', journal: 'Tab', char: 'KeyB', map: 'KeyM' }[S.panel];
    if (c === 'Escape') { e.preventDefault(); if (sp && sp.back && sp.back()) { renderPanel(); SFX.play('ui'); return; } closePanel(); return; }
    if (c === toggle) { e.preventDefault(); closePanel(); return; }
    if (S.panel === 'summary' || S.panel === 'map') { if (/^(Enter|NumpadEnter|Space|KeyE)$/.test(c)) { e.preventDefault(); closePanel(); } return; }
    if (sp && sp.key && sp.key(e) === true) return;
    const rows = navRows(), cur = navCur(rows);
    if (/^(ArrowUp|KeyW|ArrowDown|KeyS)$/.test(c)) {
      e.preventDefault(); const dy = /^(ArrowDown|KeyS)$/.test(c) ? 1 : -1;
      if (!rows.length) { const b = D.pnl.querySelector('.pb-body'); if (b) b.scrollTop += dy * 90; return; }
      if (!navMove(0, dy) && dy < 0 && cur && sp.tabs && sp.tabs().length > 1) { delete S.nav[navKey()]; navApply(); SFX.play('ui'); } // up past the top: back to the tabs
      return;
    }
    if (/^(ArrowLeft|KeyA|ArrowRight|KeyD)$/.test(c)) {
      e.preventDefault(); const dx = /^(ArrowRight|KeyD)$/.test(c) ? 1 : -1;
      if (cur && cur.dataset.lr && !e.shiftKey) { lrAdjust(cur, dx); return; }
      if (cur && !e.shiftKey && navMove(dx, 0)) return;
      switchTab(dx); return;
    }
    if (c === 'PageUp' || c === 'PageDown') { e.preventDefault(); switchTab(c === 'PageDown' ? 1 : -1); return; }
    if (c === 'KeyE' || c === 'Enter' || c === 'NumpadEnter') {
      e.preventDefault();
      if (!cur) {
        if (S.panel === 'shelter' && c === 'KeyE') { closePanel(); return; } // E opened the hatch; E again leaves (until a row is picked)
        if (rows.length) { navSet(rows[0], true); navRefresh(); SFX.play('ui'); }
        return;
      }
      const b = navPrimary(cur); if (!b || b.disabled) { SFX.play('bad'); return; }
      b.click(); return;
    }
    if (c === 'KeyX') { const b = navActs(cur).find(x => /^drop:/.test(x.dataset.a || '')); if (b && !b.disabled) b.click(); else SFX.play('bad'); return; }
    if (/^(Digit|Numpad)[1-6]$/.test(c)) { const b = navActs(cur)[+c.slice(-1) - 1]; if (b && !b.disabled) b.click(); else SFX.play('bad'); }
  }

  /* a new journal entry lights the Log button instead of toasting; opening the journal clears it */
  function journalPing() { const b = document.querySelector('.hb[data-open="journal"]'); if (b) b.classList.add('ping'); }
  function open(panel) {
    if (panel === 'journal') { const b = document.querySelector('.hb[data-open="journal"]'); if (b) b.classList.remove('ping'); }
    if (S.dlg || S.mg || S.title || S.end) return;
    if (S.panel === panel) { closePanel(); return; }
    if (S.panel) closePanel(true);
    if (!G) return;
    switch (panel) {
      case 'pack': return openPanel('pack', packPanel());
      case 'char': return openPanel('char', charPanel());
      case 'journal': return openPanel('journal', journalPanel());
      case 'shelter': return openPanel('shelter', shelterPanel());
      case 'map': return openPanel('map', mapPanel());
      case 'menu': S.nav['menu:'] = { id: 'resume', col: '', idx: 0 }; return openPanel('menu', menuPanel());
      case 'trader': return barter(null, () => { });
      case 'tollcamp': return tollcamp();
    }
  }

  /* pack */
  function itemDesc(id) {
    const it = ITEMS[id]; if (!it) return '';
    const e = it.eat || {}, u = it.use || {}, o = [];
    if (e.hunger) o.push(`+${e.hunger} food`); if (e.thirst) o.push(`+${e.thirst} water`); if (e.sta) o.push(`+${e.sta} stamina`); if (e.morale) o.push(`+${e.morale} morale`); if (e.sick) o.push(`${Math.round(e.sick * 100)}% sick risk`);
    if (u.hp) o.push(`+${u.hp} HP`); if (u.sta) o.push(`+${u.sta} stamina`); if (u.cure) o.push('treats ' + u.cure.join(', ')); if (u.infect) o.push(u.infect < -100 ? 'cures infection' : 'slows infection');
    if (it.c === 'weapon') { o.push(`DMG ${it.dmg[0]}–${it.dmg[1]}`); if (it.ammo) o.push(`uses ${iname(it.ammo)}`); else if (it.reach) o.push(`reach ${it.reach}`); if (it.noise) o.push('loud'); }
    if (it.c === 'ammo') { const g = Object.keys(ITEMS).find(k => ITEMS[k].ammo === id); if (g) o.push('for the ' + ITEMS[g].n); }
    if (it.desc) o.push(it.desc);
    if (it.c === 'mat') o.push('building and crafting material');
    if (it.c === 'misc') o.push('trade goods');
    if (it.c === 'story') o.push('key item');
    o.push(`${it.w} kg`);
    return o.join(' · ');
  }
  const sortIds = ids => ids.sort((a, b) => CAT_ORDER.indexOf(ITEMS[a].c) - CAT_ORDER.indexOf(ITEMS[b].c) || ITEMS[a].n.localeCompare(ITEMS[b].n));
  function useItem(id) {
    const p = G.p, b = { hp: p.hp, hunger: p.hunger, thirst: p.thirst, sta: p.sta, inf: p.inf };
    eat(id);
    const kind = ITEMS[id].c === 'water' ? 'drink' : ITEMS[id].c === 'med' ? 'bandage' : 'eat';
    safe(() => typeof Combat !== 'undefined' && Combat.player && Combat.player.anim && Combat.player.anim(kind));
    const o = [];
    const d = (k, n) => { const v = Math.round(p[k] - b[k]); if (v) o.push((v > 0 ? '+' : '') + v + ' ' + n); };
    d('hp', 'HP'); d('hunger', 'food'); d('thirst', 'water'); d('sta', 'stamina'); d('inf', 'infection');
    toast(`${iname(id)}${o.length ? ': ' + o.join(', ') : ''}`, 'good'); SFX.play('pickup');
    if (p.status.sick && ITEMS[id].eat && ITEMS[id].eat.sick) toast('Your stomach turns.', 'warn');
  }
  function dropItem(id, n) {
    n = Math.min(n, G.pack[id] || 0); if (n <= 0) return;
    G.pack[id] -= n; if (!G.pack[id]) delete G.pack[id];
    if (G.p.weapon === id && !G.pack[id]) G.p.weapon = Object.keys(G.pack).find(k => ITEMS[k].c === 'weapon') || null;
    if (typeof Combat !== 'undefined' && typeof Combat.drop === 'function') safe(() => Combat.drop(G.p.x, G.p.y, id, n));
    toast(`Dropped ${iname(id)}${n > 1 ? ' ×' + n : ''}`, 'dim');
  }
  function packPanel() {
    let sel = null;
    return {
      title: 'Pack', sub: () => `${safe(() => packWeight(), 0)} / ${safe(() => carryCap(), 0)} kg`,
      body: () => {
        const ids = sortIds(Object.keys(G.pack).filter(k => ITEMS[k] && G.pack[k] > 0));
        if (sel && !G.pack[sel]) sel = null;
        const w = safe(() => packWeight(), 0), cap = safe(() => carryCap(), 1), over = w > cap;
        let h = `<div class="wbar ${over ? 'over' : ''}"><span>WEIGHT</span><div class="tr"><div class="fl" style="width:${Math.min(100, w / cap * 100)}%"></div></div><span>${w}/${cap} kg${over ? ' · SLOW' : ''}</span></div>`;
        if (!ids.length) return h + emptyState('pack', 'Your pack is empty.', INPUT.touch ? 'Hold USE on cabinets, crates and fridges to search them.' : 'Hold E on cabinets, crates and fridges to search them.');
        h += `<div class="grid">${ids.map(k => `<button class="it c-${ITEMS[k].c} ${k === sel ? 'sel' : ''}" data-a="sel:${k}" data-row="${k}" data-acts=".det">${G.p.weapon === k ? '<span class="eq">EQUIPPED</span>' : ''}<span class="n">${esc(ITEMS[k].n)}</span><span class="q">×${G.pack[k]}</span></button>`).join('')}</div>`;
        if (sel) {
          const it = ITEMS[sel], acts = [];
          if (it.eat) acts.push(`<button class="btn pri sm" data-a="use:${sel}" data-pri>${it.c === 'water' ? 'Drink' : 'Eat'}</button>`);
          if (it.use) acts.push(`<button class="btn pri sm" data-a="use:${sel}" ${it.eat ? '' : 'data-pri'}>Use</button>`);
          if (it.c === 'weapon' && G.p.weapon !== sel) acts.push(`<button class="btn pri sm" data-a="equip:${sel}" data-pri>Equip</button>`);
          if (G.atShelter && it.c !== 'story') acts.push(`<button class="btn sm" data-a="store:${sel}">Store</button>`);
          if (it.c !== 'story') { acts.push(`<button class="btn ghost sm" data-a="drop:${sel}:1">Drop 1</button>`); if (G.pack[sel] > 1) acts.push(`<button class="btn ghost sm" data-a="drop:${sel}:all">Drop all</button>`); }
          h += `<div class="det"><div class="dn2"><b>${esc(it.n)}</b><div>${esc(itemDesc(sel))}</div></div><div class="acts">${acts.join('')}</div></div>`;
        } else h += `<p class="hintline">${INPUT.touch ? 'Tap an item to see what you can do with it.' : 'Pick an item to see what you can do with it.'}</p>`;
        return h;
      },
      keys: () => kh(['↑↓←→', 'select'], ['E', 'use'], ['X', 'drop'], ['1–4', 'actions'], ['Esc', 'close']),
      onSel: id => { sel = id; },
      act: (a, arg) => {
        const [id, n] = arg.split(':');
        if (a === 'sel') { sel = sel === id ? null : id; SFX.play('ui'); }
        if (a === 'use') useItem(id);
        if (a === 'equip') { G.p.weapon = id; SFX.play('swing'); toast('Equipped ' + iname(id), 'dim'); }
        if (a === 'store') { G.store[id] = (G.store[id] || 0) + G.pack[id]; delete G.pack[id]; if (G.p.weapon === id) G.p.weapon = Object.keys(G.pack).find(k => ITEMS[k].c === 'weapon') || null; SFX.play('ui'); }
        if (a === 'drop') dropItem(id, n === 'all' ? G.pack[id] : 1);
      },
    };
  }
  /* character */
  function spendPoint(k) {
    const p = G.p; if (!p.points || !ATTR_LINES[k] || (p.attr[k] || 0) >= 10) return false;
    p.attr[k] = (p.attr[k] || 0) + 1; p.points--; safe(() => recalc()); SFX.play('good'); return true;
  }
  function charPanel() {
    return {
      title: () => G.p.name, sub: () => `${(BACKGROUNDS[G.p.bg] || {}).n || ''} · Level ${G.p.level}`,
      body: () => {
        const p = G.p, need = safe(() => xpNeed(), 100);
        let h = `<div class="xp"><span>XP</span><div class="tr"><div class="fl" style="width:${Math.min(100, p.xp / need * 100)}%"></div></div><span>${p.xp}/${need}</span></div>
          <div class="kv"><span>HP <b>${Math.round(p.hp)}/${p.maxHp}</b></span><span>STA <b>${Math.round(p.maxSta)}</b></span><span>CARRY <b>${safe(() => carryCap(), 0)} kg</b></span><span>KILLS <b>${G.stats.kills}</b></span><span>DAY <b>${G.day}</b></span></div>`;
        h += `<h3>Attributes ${p.points ? `<span class="pts">${p.points} to spend</span>` : ''}</h3>`;
        for (const k in ATTR_LINES) {
          const [ab, n, d] = ATTR_LINES[k], v = p.attr[k] || 0;
          h += `<div class="attr" data-row="${k}"><span class="k">${ab}</span><span class="d"><b>${n}</b><span>${d}</span></span><span class="v">${v}</span>${p.points && v < 10 ? `<button data-a="up:${k}" aria-label="Raise ${n}">+</button>` : '<span></span>'}</div>`;
        }
        if (!p.points) h += `<p class="hintline">Level up to earn points. Kills, searches and building give XP.</p>`;
        return h;
      },
      keys: () => G.p.points ? kh(['↑↓', 'select'], ['E', 'spend point'], ['Esc', 'close']) : kh(['B', 'close'], ['Esc', 'close']),
      act: (a, arg) => { if (a === 'up') spendPoint(arg); },
    };
  }
  /* journal */
  function storyTitles() { const s = CONTENT_().story || {}, o = {}; for (const k in s) if (s[k] && s[k].title) o[s[k].title] = 1; return o; }
  function arcProgress() {
    return ARCS.map(([n, pre, max, ids]) => {
      ids = ids || Array.from({ length: max }, (_, i) => pre + '_' + (i + 1));
      const done = ids.filter(id => G.flags[id] || G.seenEnc[id]).length;
      return { n, done, max: ids.length };
    });
  }
  function journalPanel() {
    return {
      title: 'Journal', sub: () => `Day ${G.day} · ${pad2(G.hour)}:${pad2(Math.floor(G.minute))}`,
      tabs: () => safe(() => isUnlocked('journal'), false) ? [['obj', 'Objective'], ['story', 'Story'], ['notes', 'Notes'], ['people', 'People']] : [['obj', 'Objective']],
      body: tab => {
        if (tab === 'story' || tab === 'notes') {
          const st = storyTitles(), list = G.journal.filter(j => tab === 'story' ? st[j.title] : !st[j.title]);
          if (!list.length) return tab === 'story' ? emptyState('book', 'Nothing yet.', 'Story moments are written down here as they happen.') : emptyState('note', 'No notes yet.', 'Letters and notes you find in the city end up here.');
          return list.map(j => `<div class="jt"><span class="h">${esc(j.title)}</span><span class="d">DAY ${j.day}</span>${String(j.text || '').split(/\n\n+/).map(t => `<p>${esc(t)}</p>`).join('')}</div>`).join('');
        }
        if (tab === 'people') {
          const ap = arcProgress();
          let h = '<h3>People you have met</h3>' + ap.map(a => `<div class="arc"><span>${a.done ? esc(a.n) : '<span class="muted">Unknown</span>'}</span><span class="pips">${Array.from({ length: a.max }, (_, i) => `<i class="${i < a.done ? 'on' : ''}"></i>`).join('')}</span></div>`).join('');
          h += '<h3>At the bunker</h3>' + (G.survivors.length ? G.survivors.map(s => `<div class="row"><span class="grow"><span class="t1">${esc(s.name)}</span> <span class="t2">${esc((TRAITS[s.trait] || {}).n || '')} · ${esc(jobName(s.job))}</span></span></div>`).join('') : '<p class="empty">Nobody yet.</p>');
          return h;
        }
        const o = curObjective();
        let h = `<h3>Now</h3><div class="objbig">${esc(o.text || 'Survive.')}${o.how ? `<span class="how">${esc(INPUT.touch ? touchWords(o.how) : o.how)}</span>` : ''}</div>`;
        const notes = [];
        if (G.hordeNight && !G.hordeResult) notes.push('A horde hits the bunker tonight. Be home by 21:00.');
        if (G.flags.q_bus && G.hordeDay) notes.push(`The great horde arrives around day ${G.hordeDay}.`);
        if (safe(() => isUnlocked('needs'), false)) notes.push(`Food ${Math.round(G.p.hunger)} · Water ${Math.round(G.p.thirst)} · Morale ${Math.round(G.p.morale)}`);
        if (notes.length) h += '<h3>Keep in mind</h3>' + notes.map(n => `<p>${esc(n)}</p>`).join('');
        const recent = G.log.slice(-6).reverse();
        if (recent.length) h += '<h3>Recent</h3>' + recent.map(l => `<p class="logl">${esc(l.t)} · ${esc(l.msg)}</p>`).join('');
        return h;
      },
      keys: () => kh(['←→', 'tabs'], ['↑↓', 'scroll'], ['Esc', 'close']),
    };
  }
  /* shelter */
  function jobName(k) { return k === 'idle' ? 'Resting' : k === 'guard' ? 'Guard' : k === 'scavenge' ? 'Scavenging' : (BUILDINGS[k] ? BUILDINGS[k].n : k); }
  function sleepHours() { return G.hour >= 18 ? (24 - G.hour + 7) : G.hour < 7 ? 7 - G.hour : 8; }
  function craft(i) {
    const r = RECIPES[i]; if (!r || !canCraft(r).ok) return false;
    for (const k in r.in) take(k, r.in[k], true);
    G.pack[r.out] = (G.pack[r.out] || 0) + r.q;
    if (ITEMS[r.out].c === 'weapon' && !safe(() => weaponOf(), null)) G.p.weapon = r.out;
    safe(() => advance(30)); safe(() => xp(5));
    toast(`Crafted ${r.q > 1 ? r.q + ' ' : ''}${iname(r.out)}`, 'good'); SFX.play('build');
    return true;
  }
  function canCraft(r) {
    if (bl('bench') < r.bench) return { ok: false, why: `Needs Workbench ${r.bench}` };
    if ((G.p.attr.int || 0) < r.int) return { ok: false, why: `Needs INT ${r.int}` };
    for (const k in r.in) if (!has(k, r.in[k])) return { ok: false, why: 'Missing materials' };
    return { ok: true };
  }
  const costHtml = c => Object.keys(c).map(k => `<span class="${has(k, c[k]) ? '' : 'miss'}">${c[k]} ${esc(iname(k))}</span>`).join(', ');
  function shelterPanel() {
    return {
      title: 'The Bunker', sub: () => `Day ${G.day} · ${pad2(G.hour)}:${pad2(Math.floor(G.minute))}`,
      tabs: () => {
        const t = [['rest', 'Rest'], ['store', 'Storage']];
        if (safe(() => isUnlocked('craft'), false)) t.push(['craft', 'Craft']);
        if (safe(() => isUnlocked('people'), false) || G.dog) t.push(['people', `People ${G.survivors.length}`]);
        if (safe(() => isUnlocked('build'), false)) t.push(['build', 'Build']);
        return t;
      },
      body: tab => {
        if (tab === 'store') {
          const pk = sortIds(Object.keys(G.pack).filter(k => ITEMS[k] && G.pack[k] > 0)), sk = sortIds(Object.keys(G.store).filter(k => ITEMS[k] && G.store[k] > 0));
          const li = (ids, bag, dir) => ids.length ? ids.map(k => `<button data-a="mv:${dir}:${k}" data-row="${dir}:${k}" data-col="${dir}"><span>${esc(ITEMS[k].n)}</span><span class="q">×${bag[k]}</span></button>`).join('') : '<p class="empty">Empty.</p>';
          return `<p class="hintline">${INPUT.touch ? 'Tap' : 'Click or press E'} to move one. Building uses what is stored here.</p>
            <div class="cols"><div><h3>Pack <span class="dir">→</span></h3><div class="mini">${li(pk, G.pack, 'in')}</div></div><div><h3><span class="dir">←</span> Storage</h3><div class="mini">${li(sk, G.store, 'out')}</div></div></div>`;
        }
        if (tab === 'craft') {
          const list = RECIPES.map((r, i) => [r, i]).filter(([r]) => r.bench <= bl('bench') + 1);
          /* repairs: worn weapons you have (pack or storage), once there is a workbench */
          const worn = bl('bench') >= 1 ? Object.keys(ITEMS).filter(k => ITEMS[k].c === 'weapon' && (G.pack[k] || G.store[k]) && safe(() => repairCost(k), 0) > 0) : [];
          const rep = worn.map(k => {
            const n = repairCost(k), ok = has('scrap', n);
            return `<div class="row" data-row="repair:${k}"><span class="grow"><span class="t1">Repair ${esc(iname(k))} · ${Math.round(weaponCond(k))}%</span><br><span class="cost">${costHtml({ scrap: n })}</span></span>${ok ? '' : '<span class="why">Missing scrap</span>'}<button class="btn sm ${ok ? 'pri' : ''}" data-a="repair:${k}" ${ok ? '' : 'disabled'}>Repair</button></div>`;
          }).join('');
          return `<p class="hintline">Workbench level ${bl('bench')} · INT ${G.p.attr.int || 0}. Crafted items go to your pack.</p>` + rep + (list.length ? list.map(([r, i]) => {
            const ck = canCraft(r);
            return `<div class="row" data-row="craft:${i}"><span class="grow"><span class="t1">${esc(r.label || iname(r.out))}${r.q > 1 ? ' ×' + r.q : ''}</span><br><span class="cost">${costHtml(r.in)}</span></span>${ck.ok ? '' : `<span class="why">${esc(ck.why)}</span>`}<button class="btn sm ${ck.ok ? 'pri' : ''}" data-a="craft:${i}" ${ck.ok ? '' : 'disabled'}>Craft</button></div>`;
          }).join('') : emptyState('tool', 'Nothing to craft yet.', 'Build a workbench in the yard to unlock recipes.'));
        }
        if (tab === 'people') {
          if (!G.survivors.length && !G.dog) return emptyState('people', 'Nobody else lives here yet.', 'Survivors in the city can be talked into joining.');
          let h = `<p class="hintline">Beds ${G.survivors.length}/${safe(() => shelterCap(), 2)}. Give everyone a job; production arrives each morning. One companion can come on runs.</p>`;
          h += dogRow();
          for (const s of G.survivors) {
            const best = Object.keys(s.skills).sort((a, b) => s.skills[b] - s.skills[a])[0];
            const opts = [['idle', 'Resting'], ['guard', 'Guard'], ['scavenge', 'Scavenge runs']];
            for (const k in BUILDINGS) if (BUILDINGS[k].workers && bl(k)) opts.push([k, `${BUILDINGS[k].n} ${safe(() => workerCount(k), 0)}/${bl(k)}`]);
            h += `<div class="row" data-row="s:${s.id}" data-lr="1"><span class="grow"><span class="t1">${esc(s.name)}</span>${compTag('survivor', s.id)}<br><span class="t2">${esc((TRAITS[s.trait] || {}).n || '')} · best at ${esc(best)} · HP ${Math.round(s.hp)} · morale ${Math.round(s.morale)}${reqNote(s)}</span></span>${compBtn('survivor', s.id)}
              <select data-s="${s.id}" aria-label="Job for ${esc(s.name)}">${opts.map(([k, n]) => `<option value="${k}" ${s.job === k ? 'selected' : ''} ${k !== s.job && BUILDINGS[k] && safe(() => workerCount(k), 0) >= bl(k) ? 'disabled' : ''}>${esc(n)}</option>`).join('')}</select></div>`;
          }
          return h;
        }
        if (tab === 'build') {
          let h = `<p class="hintline">Walk to a glowing marker in the yard and hold ${INPUT.touch ? 'USE' : 'E'} to build there.</p>`;
          for (const k in BUILDINGS) {
            const B = BUILDINGS[k]; if (B.hidden && !(k === 'radio' && G.flags.q_radio)) continue;
            const lv = bl(k), c = safe(() => buildCost(k), null), ck = safe(() => canBuild(k), { ok: false, why: '' });
            h += `<div class="row" data-row="b:${k}"><span class="grow"><span class="t1">${esc(lv ? bName(k) : B.n)}</span> <span class="lv">${lv}/${B.max}</span><br><span class="t2">${esc(B.desc)}</span>${c ? `<br><span class="cost">${costHtml(c)}</span>` : ''}</span><span class="why ${ck.ok ? 'ok' : ''}">${c ? esc(ck.ok ? 'Ready to build' : ck.why) : 'Done'}</span></div>`;
          }
          return h;
        }
        // rest
        const cs = safe(() => canSleep(), { ok: true }), p = G.p;
        const food = sortIds(Object.keys(Object.assign({}, G.store, G.pack)).filter(k => ITEMS[k] && (ITEMS[k].eat || ITEMS[k].use) && count(k) > 0));
        let h = `<div class="kv" style="margin-bottom:10px"><span>HP <b>${Math.round(p.hp)}/${p.maxHp}</b></span><span>STA <b>${Math.round(p.sta)}</b></span>${safe(() => isUnlocked('needs'), false) ? `<span>FOOD <b>${Math.round(p.hunger)}</b></span><span>WATER <b>${Math.round(p.thirst)}</b></span>` : ''}<span>BUNKS <b>${bl('bed')}</b></span></div>`;
        h += `<div class="row" data-row="sleep"><span class="grow"><span class="t1">Sleep until morning</span><br><span class="t2">${cs.ok ? `About ${sleepHours()} hours. Heals and restores stamina${bl('bed') ? '' : '. Bunks help'}.` : esc(cs.why)}</span></span><button class="btn pri" data-a="sleep" ${cs.ok ? '' : 'disabled'}>Sleep</button></div>`;
        h += '<h3>Eat and drink</h3>' + (food.length ? `<div class="mini">${food.map(k => `<button data-a="eat:${k}" data-row="eat:${k}"><span>${esc(ITEMS[k].n)} <span class="fx">${esc(itemDesc(k).split(' · ').slice(0, 2).join(' · '))}</span></span><span class="q">×${count(k)}</span></button>`).join('')}</div>` : emptyState('food', 'Nothing to eat.', 'Search the city for food and water.'));
        return h;
      },
      keys: tab => tab === 'store' ? kh(['↑↓', 'select'], ['←→', 'pack / storage'], ['E', 'move one'], ['Esc', 'close'])
        : tab === 'people' ? kh(['↑↓', 'select'], ['←→', 'change job'], ['E', 'take on runs'], ['⇧←→', 'tabs'], ['Esc', 'close'])
        : tab === 'craft' ? kh(['←→', 'tabs'], ['↑↓', 'select'], ['E', 'craft'], ['Esc', 'close'])
        : tab === 'build' ? kh(['←→', 'tabs'], ['↑↓', 'select'], ['Esc', 'close'])
        : kh(['←→', 'tabs'], ['↑↓', 'select'], ['E', 'sleep / eat'], ['Esc', 'close']),
      act: (a, arg) => {
        if (a === 'sleep') {
          const cs = canSleep(); if (!cs.ok) { toast(cs.why, 'warn'); return; }
          const h = sleepHours(); closePanel(true); flash('sleep');
          sleep(); toast(`You slept ${h} hours.`, 'dim');
          if (typeof World3D !== 'undefined' && World3D.refreshShelter) safe(() => World3D.refreshShelter());
          return;
        }
        if (a === 'eat') useItem(arg);
        if (a === 'craft') craft(+arg);
        if (a === 'repair' && safe(() => repairWeapon(arg), false)) { safe(() => advance(20)); toast(`Repaired ${iname(arg)}`, 'good'); SFX.play('build'); }
        if (a === 'comp') toggleCompanion(arg === 'dog' ? 'dog' : 'survivor', arg === 'dog' ? 'dog' : +arg);
        if (a === 'mv') {
          const [dir, id] = arg.split(':'), from = dir === 'in' ? G.pack : G.store, to = dir === 'in' ? G.store : G.pack;
          if (!from[id]) return;
          from[id]--; if (!from[id]) delete from[id]; to[id] = (to[id] || 0) + 1;
          if (dir === 'in' && G.p.weapon === id && !G.pack[id]) G.p.weapon = Object.keys(G.pack).find(k => ITEMS[k].c === 'weapon') || null;
          if (dir === 'out' && ITEMS[id].c === 'weapon' && !safe(() => weaponOf(), null)) G.p.weapon = id;
          SFX.play('ui');
        }
      },
      change: e => {
        const sel = e.target.closest('select[data-s]'); if (!sel) return;
        const s = G.survivors.find(x => String(x.id) === sel.dataset.s); if (!s) return;
        s.job = sel.value; toast(`${s.name}: ${jobName(s.job)}`, 'dim'); SFX.play('ui');
      },
    };
  }
  /* ---------- companions (People tab, talk, HUD chip) ---------- */
  const isComp = (kind, id) => !!(G.companion && G.companion.kind === kind && (kind === 'dog' || G.companion.id === id));
  function compTag(kind, id) { return isComp(kind, id) ? ' <span class="ctag">On runs</span>' : ''; }
  function compBtn(kind, id) {
    const on = isComp(kind, id), rd = safe(() => companionReady(kind, id), { ok: false, why: '' });
    return `<button class="btn sm ${on ? '' : 'pri'}" data-a="comp:${kind === 'dog' ? 'dog' : id}" ${!on && !rd.ok ? `disabled title="${esc(rd.why)}"` : ''}>${on ? 'Leave at home' : 'Take on runs'}</button>`;
  }
  function reqNote(s) { const r = safe(() => requestOf(s), null); return r ? ` · <span class="want">wants ${r.qty} ${esc(iname(r.item))}</span>` : (s.restUntil > G.day ? ' · resting' : ''); }
  function dogRow() {
    const d = G.dog; if (!d) return '';
    const rest = d.restUntil > G.day;
    return `<div class="row" data-row="dog"><span class="grow"><span class="t1">${esc(d.name)}</span>${compTag('dog')}<br><span class="t2">Dog · HP ${Math.round(d.hp)}/${typeof DOG_MAX_HP !== 'undefined' ? DOG_MAX_HP : 60} · ${rest ? 'resting until tomorrow' : 'sniffs out loot, growls at the dead, bites'}</span></span>${compBtn('dog', 'dog')}</div>`;
  }
  function toggleCompanion(kind, id) {
    if (isComp(kind, id)) { const n = G.companion.name; safe(() => clearCompanion()); toast(`${n} stays at the bunker.`, 'dim'); SFX.play('ui'); return; }
    if (safe(() => setCompanion(kind, id), false)) { toast(`${G.companion.name} comes on runs with you.`, 'good'); SFX.play(kind === 'dog' ? 'bark' : 'good'); }
    else SFX.play('bad');
  }
  const TLK = () => (CONTENT_().survivorTalk || {});
  const tpick = (bank, s) => { const b = bank || {}; const l = Array.isArray(b) ? b : (b[s.trait] || b.default || ['...']); return fmt(l[Math.floor(Math.random() * l.length)] || '...'); };
  function say(s, line, tag) { dialogue({ who: s.name, lines: [line || '...'], tag: tag ? { ok: true, text: tag } : null, doneLabel: 'Continue' }); }
  /* E on a survivor at the bunker (or the helper out with you): mood, chat, a job, a gift, runs, and sometimes a request */
  function talk(s) {
    if (!G || !s || blocking()) return;
    const TL = TLK(), req = safe(() => requestOf(s), null), gift = safe(() => giftItem(), null);
    const comp = isComp('survivor', s.id), rd = safe(() => companionReady('survivor', s.id), { ok: false, why: '' });
    const ch = [
      { label: 'How are you holding up?', onPick: () => { const m = s.morale; say(s, safe(() => chatSurvivor(s), '...'), s.morale > m ? 'Morale up' : null); } },
      { label: 'I need you on…', note: jobName(s.job), onPick: () => jobsTalk(s) },
      { label: 'Take a gift', note: gift ? iname(gift) : 'Needs cigarettes or food', disabled: !gift, onPick: () => { const l = safe(() => giftSurvivor(s), ''); SFX.play('good'); say(s, l, 'Morale up'); } },
      comp ? { label: 'Stay home from now on', onPick: () => { safe(() => clearCompanion()); say(s, tpick(TL.stay, s)); } }
        : { label: 'Come with me on runs', note: rd.ok ? (G.companion ? `instead of ${G.companion.name}` : '+8 kg carried') : rd.why, disabled: !rd.ok, onPick: () => { if (safe(() => setCompanion('survivor', s.id), false)) { SFX.play('good'); say(s, tpick(TL.follow, s), 'On runs with you'); } } },
    ];
    if (req) ch.push({ label: `Here's your ${iname(req.item).toLowerCase()}`, note: `${safe(() => count(req.item), 0)}/${req.qty}`, disabled: !safe(() => canDeliver(s), false),
      onPick: () => { const l = safe(() => deliverRequest(s), ''); SFX.play('levelup'); say(s, `${tpick(TL.thanks, s)} ${l}`, 'Request done'); } });
    else ch.push({ label: 'Anything you need?', onPick: () => { const r = safe(() => maybeRequest(s), null); say(s, r ? tpick(TL.ask, s).replace(/\{item\}/g, iname(r.item).toLowerCase()).replace(/\{qty\}/g, r.qty) : 'Not today. Ask me tomorrow.', r ? `Find ${r.qty} ${iname(r.item)}` : null); } });
    ch.push({ label: 'Leave', onPick: () => { } });
    dialogue({ who: s.name, lines: [safe(() => survivorMood(s), '...')], choices: ch });
  }
  function jobsTalk(s) {
    const js = safe(() => jobChoices(s), []);
    dialogue({ who: s.name, lines: ['Where do you want me?'], choices: js.map(([k, n, ok]) => ({ label: n, note: s.job === k ? 'now' : (ok ? '' : 'full'), disabled: !ok,
      onPick: () => { if (safe(() => setJob(s, k), false)) { SFX.play('ui'); say(s, tpick(TLK().jobs, s), `${jobName(k)}`); } } })).concat([{ label: 'Never mind', onPick: () => { } }]) });
  }
  /* E at the bunker radio: a broadcast, a hint and the caravan's schedule; on caravan day you can call them to trade */
  function radio() {
    if (!G || blocking()) return;
    const b = safe(() => radioBroadcast(), { lines: ['Static.'], trader: false });
    SFX.play('ui');
    dialogue({ who: 'Shortwave radio', lines: b.lines, doneLabel: 'Switch it off',
      choices: b.trader ? [{ label: 'Call the caravan', onPick: () => barter(null, () => { }) }, { label: 'Switch it off', onPick: () => { } }] : [] });
  }
  const COMP_IC = { dog: 'M4 13l2-5 3 2h5l3-4 1 3h2v3l-3 2v5h-2l-1-3H9l-1 3H6v-5z', survivor: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 21a7 7 0 0 1 14 0' };
  function companionChip() {
    const box = D.cmp, tb = el('t-comp'), c = typeof Combat !== 'undefined' ? Combat.companion : null;
    if (!box) return;
    if (!c) { if (!box.hidden) { box.hidden = true; S.c.cmp = null; } if (tb && !tb.hidden) tb.hidden = true; const fb = el('t-fetch'); if (fb && !fb.hidden) fb.hidden = true; return; }
    const info = safe(() => companionInfo(), null), f = info ? cl(info.hp / info.maxHp, 0, 1) : 0;
    const mode = c.mode === 'downed' ? 'Down' : c.mode === 'stay' ? 'Staying' : 'Following';
    if (tb) { if (tb.hidden) tb.hidden = false; const lb = c.mode === 'stay' ? 'Follow' : 'Stay'; if (tb.textContent !== lb) tb.textContent = lb; }
    /* FETCH shows only when the dog could go right now: rested, not already out, and something to raid within reach */
    const fb = el('t-fetch');
    if (fb) { S.fetchT = (S.fetchT || 0) - 1; if (S.fetchT <= 0) { S.fetchT = 15; S.canF = c.kind === 'dog' && c.mode !== 'downed' && !c.fetch && !safe(() => fetchBlock(), 'x') && !!safe(() => fetchTarget(G.p.x, G.p.y), null); } if (fb.hidden === S.canF) fb.hidden = !S.canF; }
    const act = c.mode === 'downed' ? '' : c.mode === 'stay' ? 'Follow' : 'Stay';
    const key = c.kind + c.name + mode + Math.round(f * 60) + !!c.fetch + act;
    if (S.c.cmp === key) return; S.c.cmp = key;
    box.hidden = false;
    box.querySelector('.nm').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${COMP_IC[c.kind] || COMP_IC.survivor}"/></svg>${esc(c.name)}`;
    box.querySelector('.md').textContent = mode + (INPUT.touch ? '' : ' · H') + (c.fetch ? ' · fetching' : '');
    box.querySelector('.md').dataset.act = act; box.setAttribute('aria-label', act ? `${c.name}: tap to ${act.toLowerCase()}` : c.name);
    box.querySelector('.fl').style.transform = `scaleX(${f})`;
    box.classList.toggle('low', f < 0.35); box.classList.toggle('down', c.mode === 'downed');
  }

  /* map */
  function mapPanel() {
    return {
      title: 'Ardent Vale', sub: () => `Explored ${Math.round(safe(() => G._fog.reduce((a, b) => a + b, 0), 0) / (W * H) * 100)}%`,
      body: () => `<canvas id="mapc"></canvas><div class="legend"><span><i style="background:#ebe1ce"></i>You</span><span><i style="background:#e8742c;border-radius:50%"></i>Objective</span><span><i style="border:2px solid #ebe1ce"></i>Bunker</span><span><i style="background:#e05a46"></i>Tollmen</span></div>`,
      keys: () => kh(['M', 'close'], ['Esc', 'close']),
      after: () => drawFullMap(el('mapc')),
    };
  }
  /* menu */
  function menuPanel() {
    let help = false;
    return {
      title: 'Paused', sub: () => G ? `${G.worldName || 'Ardent Vale'} · Day ${G.day} · ${G.p.name}` : '', narrow: true,
      body: () => {
        if (help) return helpCard();
        return `<div class="menu"><button class="btn pri" data-a="close" data-row="resume">Resume</button><button class="btn" data-a="save" data-row="save">Save now</button><button class="btn" data-a="fork" data-row="fork">Save as new world</button><button class="btn" data-a="help" data-row="help">Controls</button>
          <button class="btn" data-a="sound" data-row="sound">Sound: ${SFX.on ? 'On' : 'Off'}</button>${hasAmb() ? `<label class="vol" data-row="amb"><span>Ambience</span><input type="range" min="0" max="100" step="5" value="${Math.round(Ambience.volume * 100)}" data-amb aria-label="Ambience volume"><b>${Math.round(Ambience.volume * 100)}</b></label>` : ''}${hasCine() ? '<button class="btn" data-a="intro" data-row="intro">Watch the intro</button>' : ''}<button class="btn ghost" data-a="quit" data-row="quit">Quit to title</button></div>`;
      },
      foot: () => help ? `<button class="btn" data-a="back">Back</button>` : '',
      keys: () => help ? kh(['Esc', 'back']) : kh(['↑↓', 'select'], ['E', 'choose'], ['←→', 'ambience'], ['Esc', 'resume']),
      key: e => {
        const cur = D.pnl.querySelector('.kf'); if (!cur || cur.dataset.row !== 'amb' || !/^(ArrowLeft|ArrowRight|KeyA|KeyD)$/.test(e.code)) return false;
        e.preventDefault(); setAmb(Ambience.volume + (/Right|KeyD/.test(e.code) ? 0.05 : -0.05)); renderPanel(); return true;
      },
      change: e => { const r = e.target.closest('[data-amb]'); if (r) setAmb(+r.value / 100); },
      back: () => { if (!help) return false; help = false; S.nav['menu:'] = { id: 'help', col: '', idx: 2 }; return true; },
      act: a => {
        if (a === 'save') { const ok = safe(() => saveGame(true), false); toast(ok ? `Saved: ${G.worldName || 'this world'}.` : 'Could not save in this browser.', ok ? 'good' : 'warn'); }
        if (a === 'fork') { const base = String(G.worldName || G.p.name).replace(/ · day \d+$/, ''), id = safe(() => forkWorld(`${base.slice(0, 15)} · day ${G.day}`), null); toast(id ? `Saved as a new world: ${G.worldName}. You play on in it.` : 'Could not save in this browser.', id ? 'good' : 'warn'); }
        if (a === 'help') { help = true; S.nav['menu:'] = { id: 'help', col: '', idx: 2 }; }
        if (a === 'back') { help = false; S.nav['menu:'] = { id: 'help', col: '', idx: 2 }; }
        if (a === 'sound') { SFX.toggle(); SFX.unlock(); SFX.play('ui'); }
        if (a === 'intro') { closePanel(true); safe(() => Cine.intro(() => { })); }
        if (a === 'quit') { closePanel(true); if (typeof Game !== 'undefined' && Game.quit) Game.quit(); }
      },
    };
  }
  const hasAmb = () => typeof Ambience !== 'undefined' && !!Ambience.setVolume;
  const hasCine = () => typeof Cine !== 'undefined' && !!Cine.intro;
  function setAmb(v) { safe(() => Ambience.setVolume(Math.round(cl(v, 0, 1) * 20) / 20)); SFX.play('ui'); }
  function helpCard() {
    const rows = INPUT.touch
      ? [['Move', 'Drag left side'], ['Sprint', 'Push the stick far'], ['Attack', 'ATTACK (hold)'], ['Next target', 'TARGET'], ['Throw a bottle', 'THROW'], ['Dodge roll', 'DODGE'], ['Search / use', 'USE (hold)'], ['Sneak', 'CROUCH'], ['Zoom', 'Pinch'], ['Map', 'Tap the minimap'], ['Swap weapon', 'Tap weapon'], ['Companion: stay / follow', 'STAY / FOLLOW'], ['Dog: fetch', 'FETCH']]
      : [['Move', 'WASD / arrows'], ['Sprint', 'Shift'], ['Crouch', 'C'], ['Dodge roll', 'Space'], ['Attack', 'J / click'], ['Next target', 'F'], ['Clear target', 'Shift+F'], ['Throw a bottle', 'G'], ['Aim (optional)', 'Mouse'], ['Search / use', 'Hold E'], ['Swap weapon', 'Q'], ['Companion: stay / follow', 'H'], ['Dog: fetch', 'R'], ['Pack', 'I'], ['Character', 'B'], ['Journal', 'Tab'], ['Map', 'M'], ['Zoom', 'Wheel'], ['Menu', 'Esc']];
    return `<div class="help">${rows.map(r => `<div><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')}</div>
      ${INPUT.touch ? '' : `<p class="hintline" style="margin-top:12px">The whole game plays on the keyboard. Without the mouse, attacks lock on to the nearest enemy and F picks the next one; move the mouse to aim more precisely. In menus: arrows select, E or Enter acts, X drops, Esc closes.</p>`}
      <p class="hintline">Crouch to stay unseen. Sprinting and gunfire draw the dead. Bring loot home to build. Be in the bunker on horde nights.</p>`;
  }

  /* ---------- Tollmen gate (the Warden) ---------- */
  function tollcamp() {
    const f = G.flags;
    const canPay = has('cigs', 10) || has('canned', 4);
    dialogue({
      who: 'Tollmen gate',
      lines: f.warden_met ? ['The guards know your face. They wave you up to the wire.', 'Somewhere inside, the Warden is writing in his ledger.']
        : ['Two men with shotguns watch you from a tower of welded car doors.', { who: 'Gate guard', line: '"State your business."' }],
      choices: [
        { label: f.warden_met ? 'Speak with the Warden' : 'Ask to see the Warden', onPick: talkWarden },
        { label: 'Pay tribute', note: has('cigs', 10) ? '10 cigarettes' : has('canned', 4) ? '4 canned food' : 'Needs 10 cigs or 4 cans', disabled: !canPay, onPick: () => { if (!take('cigs', 10)) take('canned', 4); f.tribute = (f.tribute || 0) + 1; toast('Tribute paid. The ledger remembers.', 'warn'); SFX.play('pickup'); tollcamp(); } },
        { label: 'Trade at the camp market', onPick: () => barter(null, () => { }) },
        { label: 'Leave', onPick: () => { } },
      ],
    });
  }
  function talkWarden() {
    const f = G.flags, first = !f.warden_met;
    f.warden_met = true;
    if (first) { safe(() => xp(15)); safe(() => journal('The Warden', 'He runs the Tollmen from the old gas depot: grey crew cut, reading glasses, a ledger thick as a brick. Pay tribute and his men leave you alone. When the great horde comes, he might be worth an alliance.')); }
    const W_ = 'The Warden';
    const lines = first
      ? [{ who: '', line: 'Grey crew cut. Reading glasses. A ledger thick as a brick.' }, { who: W_, line: '"Everyone pays. Pay, and my boys leave you be."' }, { who: W_, line: f.q_bus ? '"I hear the big one is coming. Even I can\'t tax the dead."' : '"Come back when you have something worth my time."' }]
      : [{ who: W_, line: f.q_bus ? '"The horde will be here soon. You have walls. I have guns. Think about that."' : '"Still breathing. Good. Breathing people pay."' }];
    if (!first && f.warden_secret) lines.push({ who: '', line: 'You think of what Marcus told you. He does not know you know.' });
    if (f.tribute) lines.push({ who: W_, line: `"${f.tribute} payment${f.tribute > 1 ? 's' : ''} on time. I notice these things."` });
    dialogue({ who: W_, lines, choices: [{ label: 'Back', onPick: tollcamp }, { label: 'Leave', onPick: () => { } }] });
  }

  /* ---------- barter ---------- */
  function barter(stock, done) {
    done = done || (() => { });
    if (S.panel) closePanel(true);
    const tr = stock ? { stock: Object.assign({}, stock) } : safe(() => makeTrader(), { stock: {} });
    const st = tr.stock || {};
    const mine = {}, theirs = {};
    const avail = () => { const o = {}; for (const k in G.pack) o[k] = G.pack[k]; if (G.atShelter) for (const k in G.store) o[k] = (o[k] || 0) + G.store[k]; for (const k in mine) o[k] -= mine[k]; return o; };
    const sellable = k => ITEMS[k] && ITEMS[k].c !== 'story' && ITEMS[k].v > 0;
    const val = (o, f) => Object.keys(o).reduce((s, k) => s + f(k) * o[k], 0);
    openPanel('barter', {
      title: 'Trader', sub: () => `CHA ${G.p.attr.cha || 0} sets the prices`,
      body: () => {
        const my = val(mine, sellPrice), th = val(theirs, buyPrice), av = avail();
        const mx = Math.max(my, th, 1), short = my < th;
        const tok = (o, side, f) => Object.keys(o).filter(k => o[k] > 0).map(k => `<button class="tok" data-a="back:${side}:${k}" data-row="o${side}:${k}" data-col="o${side}" data-grp="offer">${esc(ITEMS[k].n)}${o[k] > 1 ? ' ×' + o[k] : ''}<b>${f(k) * o[k]}</b></button>`).join('') || `<span class="hintline">${INPUT.touch ? 'Tap' : 'Pick'} items below to ${side === 'm' ? 'offer them' : 'ask for them'}.</span>`;
        let h = `<div class="offer"><div><h4><span>You give</span><span>${my}</span></h4><div class="side">${tok(mine, 'm', sellPrice)}</div></div><div><h4><span>You get</span><span>${th}</span></h4><div class="side">${tok(theirs, 't', buyPrice)}</div></div>
          <div class="bal"><span>${my}</span><div class="tr ${short ? 'short' : ''}"><div class="y" style="width:${my / mx * 100}%"></div><div class="th" style="left:calc(${th / mx * 100}% - 1px)"></div></div><span>${th}</span></div></div>`;
        const yours = sortIds(Object.keys(av).filter(k => av[k] > 0 && sellable(k)));
        const goods = sortIds(Object.keys(st).filter(k => ITEMS[k] && st[k] - (theirs[k] || 0) > 0));
        h += `<div class="bt"><div><h4><span>Yours</span><span>value</span></h4><div class="mini">${yours.map(k => `<button data-a="give:${k}" data-row="y:${k}" data-col="y" data-grp="list"><span>${esc(ITEMS[k].n)} <span class="muted">×${av[k]}</span></span><span class="pr">${sellPrice(k)}</span></button>`).join('') || '<p class="empty">Nothing to trade.</p>'}</div></div>
          <div><h4><span>Theirs</span><span>price</span></h4><div class="mini">${goods.map(k => `<button data-a="take:${k}" data-row="t:${k}" data-col="t" data-grp="list"><span>${esc(ITEMS[k].n)} <span class="muted">×${st[k] - (theirs[k] || 0)}</span></span><span class="pr">${buyPrice(k)}</span></button>`).join('') || '<p class="empty">Sold out.</p>'}</div></div></div>`;
        return h;
      },
      foot: () => {
        const my = val(mine, sellPrice), th = val(theirs, buyPrice), ok = th > 0 && my >= th;
        return `<span class="bst ${th > my ? 'short' : ''}">${th > 0 && my > th ? `Overpaying by ${my - th}` : th > my ? `Short by ${th - my}` : ''}</span><button class="btn ghost" data-a="close">Leave</button><button class="btn pri" data-a="deal" ${ok ? '' : 'disabled'}>Trade<span class="kc k-hide">T</span></button>`;
      },
      keys: () => kh(['↑↓', 'select'], ['←→', 'yours / theirs'], ['E', 'offer / return'], ['T', 'trade'], ['Esc', 'leave']),
      key: e => { if (e.code !== 'KeyT') return false; e.preventDefault(); const b = D.pnl.querySelector('[data-a=deal]'); if (b && !b.disabled) b.click(); else SFX.play('bad'); return true; },
      act: (a, arg) => {
        if (a === 'give') { const av = avail(); if (av[arg] > 0) { mine[arg] = (mine[arg] || 0) + 1; SFX.play('ui'); } }
        if (a === 'take') { if (st[arg] - (theirs[arg] || 0) > 0) { theirs[arg] = (theirs[arg] || 0) + 1; SFX.play('ui'); } }
        if (a === 'back') { const [side, k] = arg.split(':'), o = side === 'm' ? mine : theirs; if (o[k]) { o[k]--; if (!o[k]) delete o[k]; } }
        if (a === 'deal') {
          const my = val(mine, sellPrice), th = val(theirs, buyPrice); if (!(th > 0 && my >= th)) return;
          for (const k in mine) take(k, mine[k]);
          const got = [];
          for (const k in theirs) { got.push(give(k, theirs[k])); st[k] -= theirs[k]; if (st[k] <= 0) delete st[k]; }
          for (const k in mine) delete mine[k]; for (const k in theirs) delete theirs[k];
          SFX.play('pickup'); toast('Deal.', 'good'); for (const g of got) if (g) toast(g, /left|full/.test(g) ? 'warn' : 'loot');
        }
      },
      onClose: () => done(),
    });
  }

  /* ---------- lockpick / pry minigame ---------- */
  function closeMg() { if (!S.mg) return; S.mg.dead = true; S.mg = null; D.mg.hidden = true; D.mg.innerHTML = ''; syncBlock(); }
  function lockpick(o, done) {
    done = done || (() => { });
    o = o || {}; const mode = o.mode === 'pry' ? 'pry' : 'pick', diff = cl(o.diff || 4, 1, 10);
    const A_ = k => (G && G.p.attr[k]) || 4;
    const m = { mode, diff, pins: 0, miss: 0, a: Math.random() * 6.28, dir: 1, fill: 0, t: 0, time: 4.2, over: false, overT: 0, flashT: 0, flashOk: true };
    m.win = cl(0.62 + (A_('agi') + A_('per') - 8) * 0.045 - (diff - 3) * 0.05, 0.22, 1.05);
    m.spd = 2.1 + diff * 0.16;
    m.newTarget = () => { let c; do { c = Math.random() * Math.PI * 2; } while (angd(c, m.a) < 1.4); m.c = c; };
    m.newTarget();
    m.add = 0.075 + A_('str') * 0.011; m.decay = 0.2 + diff * 0.045;
    S.mg = m; syncBlock();
    D.mg.hidden = false;
    D.mg.innerHTML = `<div class="box"><h2>${mode === 'pick' ? 'Pick the lock' : 'Force it open'}</h2><div class="s">${mode === 'pick' ? `AGI ${A_('agi')} · PER ${A_('per')} · lock ${diff}` : `STR ${A_('str')} · lock ${diff}`}</div>
      <canvas width="480" height="480"></canvas><div class="st"></div><div class="tip">${mode === 'pick' ? (INPUT.touch ? 'Tap when the needle is in the ember.' : 'Press E or click when the needle is in the ember.') : (INPUT.touch ? 'Tap fast before time runs out.' : 'Mash E or click before time runs out.')}</div>
      ${INPUT.touch ? `<button class="btn pri tap">${mode === 'pick' ? 'Pick' : 'Pry'}</button>` : ''}</div>`;
    const cv = D.mg.querySelector('canvas'), x = cv.getContext('2d'), stEl = D.mg.querySelector('.st');
    const press = () => {
      if (m.over) return;
      if (mode === 'pick') {
        if (angd(m.a, m.c) <= m.win / 2) { m.pins++; m.flashT = 0.25; m.flashOk = true; SFX.play('hit'); if (m.pins >= 3) return finish(true); m.dir *= -1; m.spd *= 1.14; m.newTarget(); }
        else { m.miss++; m.flashT = 0.25; m.flashOk = false; SFX.play('bad'); if (m.miss > 2) return finish(false); }
      } else { m.fill = Math.min(1, m.fill + m.add); SFX.play('step'); if (m.fill >= 1) finish(true); }
    };
    const finish = ok => {
      m.over = true; m.ok = ok; SFX.play(ok ? 'open' : 'bad');
      const tip = D.mg.querySelector('.tip'); if (tip) tip.outerHTML = `<div class="res ${ok ? 'ok' : 'no'}">${ok ? (mode === 'pick' ? 'Open' : 'Forced') : (mode === 'pick' ? 'Jammed' : 'It holds')}</div>`;
      m.done = done; // the result closes itself after 0.9 s (in tick)
    };
    m.key = e => {
      if (m.over) { if (['KeyE', 'Space', 'Enter', 'Escape'].includes(e.code) && !e.repeat && S.mg === m) { e.preventDefault(); closeMg(); done(m.ok); } return; }   // dismiss the result at once
      if (['KeyE', 'Space', 'Enter', 'KeyJ'].includes(e.code)) { e.preventDefault(); if (!e.repeat) press(); } else if (e.code === 'Escape') finish(false);
    };
    D.mg.onpointerdown = e => { if (e.target.closest('.box') || INPUT.touch) { e.preventDefault(); press(); } };
    /* stepped by UI.update from the game loop (not its own rAF), so it also runs under the test harness's sim() */
    m.tick = dt => {
      if (m.dead) return;
      dt = Math.min(0.1, dt);
      if (!m.over) {
        if (mode === 'pick') m.a = (m.a + m.dir * m.spd * dt + Math.PI * 2) % (Math.PI * 2);
        else { m.t += dt; m.fill = Math.max(0, m.fill - m.decay * dt * (m.fill > 0.02 ? 1 : 0)); if (m.t >= m.time) finish(false); }
      } else if ((m.overT += dt) >= 0.9 && S.mg === m) { closeMg(); m.done(m.ok); return; }
      m.flashT = Math.max(0, m.flashT - dt);
      drawMg(x, m);
      stEl.innerHTML = mode === 'pick' ? `<span>PINS <b>${m.pins}/3</b></span><span>SLIPS <b>${m.miss}/2</b></span>` : `<span>TIME <b>${Math.max(0, m.time - m.t).toFixed(1)}s</b></span>`;
    };
    m.tick(0);
    SFX.play('ui');
  }
  function angd(a, b) { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; }
  function drawMg(x, m) {
    x.clearRect(0, 0, 480, 480); const c = 240;
    if (m.mode === 'pick') {
      x.lineWidth = 26; x.strokeStyle = '#2a241d'; x.beginPath(); x.arc(c, c, 170, 0, 7); x.stroke();
      x.lineWidth = 1; x.strokeStyle = '#5c4d3e'; x.beginPath(); x.arc(c, c, 184, 0, 7); x.stroke(); x.beginPath(); x.arc(c, c, 156, 0, 7); x.stroke();
      for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; x.strokeStyle = '#3e352c'; x.beginPath(); x.moveTo(c + Math.cos(a) * 190, c + Math.sin(a) * 190); x.lineTo(c + Math.cos(a) * 198, c + Math.sin(a) * 198); x.stroke(); }
      const a0 = m.c - m.win / 2 - Math.PI / 2, a1 = m.c + m.win / 2 - Math.PI / 2;
      x.lineWidth = 26; x.strokeStyle = '#e8742c'; x.shadowColor = '#e8742c'; x.shadowBlur = 18; x.beginPath(); x.arc(c, c, 170, a0, a1); x.stroke(); x.shadowBlur = 0;
      const na = m.a - Math.PI / 2;
      x.strokeStyle = m.flashT > 0 ? (m.flashOk ? '#9cc46a' : '#ff5a44') : '#ebe1ce'; x.lineWidth = 6; x.lineCap = 'round';
      x.beginPath(); x.moveTo(c + Math.cos(na) * 40, c + Math.sin(na) * 40); x.lineTo(c + Math.cos(na) * 186, c + Math.sin(na) * 186); x.stroke();
      x.fillStyle = '#12100e'; x.strokeStyle = '#5c4d3e'; x.lineWidth = 2; x.beginPath(); x.arc(c, c, 44, 0, 7); x.fill(); x.stroke();
      for (let i = 0; i < 3; i++) { x.fillStyle = i < m.pins ? '#e8742c' : '#2a241d'; x.fillRect(c - 36 + i * 26, c - 9, 20, 18); }
    } else {
      const s = -Math.PI * 1.25, e = Math.PI * 0.25, f = s + (e - s) * m.fill;
      x.lineCap = 'butt'; x.lineWidth = 34; x.strokeStyle = '#2a241d'; x.beginPath(); x.arc(c, c, 160, s, e); x.stroke();
      x.strokeStyle = m.fill > 0.8 ? '#ffb067' : '#e8742c'; x.shadowColor = '#e8742c'; x.shadowBlur = 14 * m.fill; x.beginPath(); x.arc(c, c, 160, s, Math.max(s + 0.001, f)); x.stroke(); x.shadowBlur = 0;
      const tl = Math.max(0, 1 - m.t / m.time); x.lineWidth = 6; x.strokeStyle = tl < 0.3 ? '#cf3b2c' : '#a39683'; x.beginPath(); x.arc(c, c, 196, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * tl); x.stroke();
      x.fillStyle = '#ebe1ce'; x.font = '800 64px "Big Shoulders Stencil Display", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(Math.round(m.fill * 100) + '%', c, c);
    }
  }

  /* ---------- title / new game ---------- */
  function closeTitle() { if (!S.title) return; S.title = false; D.title.hidden = true; D.title.innerHTML = ''; syncBlock(); }
  function embers() { let h = '<div class="embers">'; for (let i = 0; i < 16; i++) h += `<i style="left:${(i * 37 + 11) % 100}%;animation-duration:${7 + (i * 13) % 9}s;animation-delay:${-(i * 1.7) % 9}s;--dx:${((i * 29) % 80) - 40}px"></i>`; return h + '</div>'; }
  /* title: Continue (the last world you played), Worlds (every saved world, memorials included), New world */
  const WORLD_NAMES = ['Ardent Vale', 'Cinder Road', 'Ashfall', 'The Long Dark', 'Last Light', 'Grey Harbour', 'Ember Line', 'Hollow Week', 'Smoke Season', 'The Quiet'];
  const timeAgo = t => { const s = Math.max(0, (Date.now() - (t || 0)) / 1000); return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
  const endTitle = w => { if (!w.ended) return ''; if (!w.endId || w.endId === 'death') return `Fell on day ${w.day}`; const sc = CONTENT_().story[w.endId]; return sc && sc.title ? sc.title : 'The End'; };
  const bgName = k => (BACKGROUNDS[k] || {}).n || '';
  function titleWire(map) {
    D.title.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { SFX.unlock(); SFX.play('ui'); const f = map[b.dataset.t]; if (f) f(b); });
  }
  function title(step) {
    if (typeof Moments !== 'undefined' && Moments.abort) safe(() => Moments.abort());
    closeDlg(); closePanel(true); closeMg(); S.end = false; D.end.hidden = true;
    S.title = true; syncBlock(); showHud(false); timer(null);
    D.title.hidden = false; S.titleBack = null; S.titleStart = null;
    if (step === 'new') return newGameStep();
    if (step === 'worlds') return worldsStep();
    const worlds = safe(() => listWorlds(), []), last = worlds.find(w => !w.ended);
    D.title.innerHTML = `${embers()}<div class="logo">Dead<span>Embers</span></div><div class="tag">Ardent Vale · fourteen months after the Grey Fever</div>
      <div class="acts">${last ? `<button class="btn pri cont" data-t="cont" data-nav>Continue<small>${esc(last.name)} · Day ${last.day}</small></button>` : ''}
      ${worlds.length ? `<button class="btn" data-t="worlds" data-nav>Worlds<small>${worlds.length}</small></button>` : ''}
      <button class="btn ${last ? '' : 'pri'}" data-t="new" data-nav>New world</button>${hasCine() ? '<button class="btn ghost" data-t="intro" data-nav>Watch the intro</button>' : ''}</div>
      <div class="kh tkh"><b>↑↓</b> choose<i>·</i><b>Enter</b> select</div><div class="ver">BUILD 3D</div>`;
    S.tfocus = D.title.querySelector('[data-nav]'); titleRing();
    titleWire({
      new: () => newGameStep(),
      worlds: () => worldsStep(),
      intro: () => { closeTitle(); safe(() => Cine.intro(() => title())); },
      cont: () => { if (typeof Game !== 'undefined' && Game.continueGame && Game.continueGame()) closeTitle(); else toast('That world could not be loaded.', 'warn'); },
    });
  }
  /* every saved world: load it, or delete it (with a confirm step). Ended worlds are memorials: their ending, or the day they fell. */
  function worldsStep(confirmId, focusId) {
    const ws = safe(() => listWorlds(), []);
    if (!ws.length) return title();
    S.titleStart = null;
    D.title.innerHTML = `${embers()}<div class="worlds"><h2>Worlds</h2><div class="wl">${ws.map(w => {
      const conf = confirmId === w.id;
      return `<div class="wrow ${w.ended ? 'mem' : ''} ${conf ? 'conf' : ''}" data-w="${esc(w.id)}">
        <div class="wi"><b>${w.ended ? '<i class="cross" aria-hidden="true"></i>' : ''}${esc(w.name)}</b>
          <span>${esc([w.pname, bgName(w.bg), 'Day ' + w.day, 'Level ' + w.level].filter(Boolean).join(' · '))}</span>
          <em>${w.ended ? esc(endTitle(w)) : 'Last played ' + esc(timeAgo(w.lastPlayed))}</em></div>
        <div class="wa">${conf ? `<span class="q">Delete forever?</span><button class="btn sm danger" data-t="del-yes" data-nav>Delete</button><button class="btn sm" data-t="del-no" data-nav>Keep</button>`
          : `${w.ended ? '<span class="mtag">Memorial</span>' : '<button class="btn sm pri" data-t="load" data-nav>Load</button>'}<button class="btn sm ghost" data-t="del" data-nav aria-label="Delete ${esc(w.name)}">Delete</button>`}</div></div>`;
    }).join('')}</div>
      <div class="go"><button class="btn ghost" data-t="back" data-nav>Back</button><button class="btn" data-t="new" data-nav>New world</button></div>
      <div class="kh tkh"><b>↑↓←→</b> choose<i>·</i><b>Enter</b> select<i>·</i><b>Esc</b> back</div></div>`;
    const idOf = b => { const r = b.closest('.wrow'); return r ? r.dataset.w : null; };
    titleWire({
      back: () => title(),
      new: () => newGameStep(),
      load: b => { if (typeof Game !== 'undefined' && Game.loadWorld && Game.loadWorld(idOf(b))) closeTitle(); else toast('That world could not be loaded.', 'warn'); },
      del: b => worldsStep(idOf(b)),
      'del-no': b => worldsStep(null, idOf(b)),
      'del-yes': b => { const id = idOf(b), w = ws.find(x => x.id === id); safe(() => deleteWorld(id)); toast(`${w ? w.name : 'World'} deleted.`, 'dim'); SFX.play('bad'); worldsStep(); },
    });
    const row = id => id ? [...D.title.querySelectorAll('.wrow')].find(r => r.dataset.w === id) : null;
    S.tfocus = confirmId ? row(confirmId).querySelector('[data-t=del-no]') : focusId && row(focusId) ? row(focusId).querySelector('[data-t=del]') : (D.title.querySelector('[data-t=load]') || D.title.querySelector('[data-nav]'));
    titleRing();
    S.titleBack = () => { SFX.play('ui'); if (confirmId) worldsStep(null, confirmId); else title(); };
  }
  function newGameStep() {
    const bgs = Object.keys(BACKGROUNDS);
    let sel = bgs.includes('scavenger') ? 'scavenger' : bgs[0];
    const used = safe(() => listWorlds().map(w => w.name), []), defName = WORLD_NAMES.find(n => !used.includes(n)) || `World ${used.length + 1}`;
    const bonus = b => Object.keys(b.bonus || {}).map(k => `${k.toUpperCase()} +${b.bonus[k]}`).join('  ');
    D.title.innerHTML = `${embers()}<div class="newg"><h2>A new world</h2>
      <div class="names"><label>World<input id="ng-world" maxlength="24" value="${esc(defName)}" autocomplete="off" spellcheck="false" data-nav></label>
      <label>Your name<input id="ng-name" maxlength="18" value="Survivor" autocomplete="off" spellcheck="false" data-nav></label></div>
      <div class="bgs">${bgs.map(k => `<button class="bgc ${k === sel ? 'on' : ''}" data-bg="${k}" data-nav aria-pressed="${k === sel}"><b>${esc(BACKGROUNDS[k].n)}</b><span>${esc(firstSentence(BACKGROUNDS[k].desc, 70))}</span><em>${esc(bonus(BACKGROUNDS[k]))}</em></button>`).join('')}</div>
      <div class="go"><button class="btn ghost" data-t="back" data-nav>Back</button><button class="btn pri" data-t="start" data-nav>Start</button></div>
      <div class="kh tkh"><b>←↑↓→</b> background<i>·</i><b>type</b> to rename<i>·</i><b>Enter</b> start<i>·</i><b>Esc</b> back</div></div>`;
    const pickBg = b => { sel = b.dataset.bg; D.title.querySelectorAll('.bgc').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); };
    D.title.querySelectorAll('.bgc').forEach(b => b.onclick = () => { pickBg(b); SFX.play('ui'); S.tfocus = b; titleRing(); });
    D.title.querySelector('[data-t=back]').onclick = () => { SFX.play('ui'); title(); };
    D.title.querySelector('[data-t=start]').onclick = () => startNew(sel, defName);
    S.titleStart = () => startNew(sel, defName);
    S.titleBack = () => { SFX.play('ui'); title(); };
    S.pickBg = pickBg;
    S.tfocus = D.title.querySelector('.bgc.on'); titleRing();
  }
  /* title keyboard focus: S.tfocus is the [data-nav] element with the ring (a name field takes real focus so typing works) */
  function titleRing() {
    D.title.querySelectorAll('.kf').forEach(x => x.classList.remove('kf'));
    const f = S.tfocus; if (!f || !f.isConnected) return;
    if (f.tagName === 'INPUT') { if (document.activeElement !== f) { f.focus(); try { f.select(); } catch (e) { } } }
    else { if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur(); f.classList.add('kf'); scrollNear(f); }
  }
  function startNew(bg, defName) {
    const inp = el('ng-name'), wi = el('ng-world'), name = (inp && inp.value.trim()) || 'Survivor', world = (wi && wi.value.trim()) || defName || 'Ardent Vale';
    SFX.unlock(); SFX.play('levelup');
    if (typeof Moments !== 'undefined' && Moments.abort) safe(() => Moments.abort());
    closeTitle();
    S.objText = ''; S.c = {}; S.hudShown = false;
    if (typeof Game !== 'undefined' && Game.newGame) Game.newGame(name.slice(0, 18), bg, undefined, world.slice(0, 24));
  }
  function titleKey(e) {
    const c = e.code, inp = el('ng-name'), act = document.activeElement, inField = !!(act && act.tagName === 'INPUT' && D.title.contains(act));
    const items = [...D.title.querySelectorAll('[data-nav]')];
    if (!items.includes(S.tfocus)) S.tfocus = inField ? act : (D.title.querySelector('.bgc.on') || items[0]);
    if (c === 'Enter' || c === 'NumpadEnter') {
      e.preventDefault(); if (e.repeat) return;
      const f = S.tfocus;
      if (S.titleStart && (!f || f.tagName === 'INPUT' || f.classList.contains('bgc'))) { S.titleStart(); return; }
      if (f) f.click();
      return;
    }
    if (c === 'Escape') { if (S.titleBack) S.titleBack(); return; }
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[c];
    if (dir) {
      if (inField && dir[0]) return; // left/right move the caret in a name
      e.preventDefault();
      let n = S.tfocus ? spatial(items, S.tfocus, dir[0], dir[1]) : items[0];
      if (!n && !inp && dir[1]) n = items[(items.indexOf(S.tfocus) + dir[1] + items.length) % items.length]; // title and worlds: wrap
      if (!n) return;
      S.tfocus = n; if (n.classList.contains('bgc') && S.pickBg) S.pickBg(n);
      SFX.play('ui'); titleRing(); return;
    }
    // typing anywhere on the new-world screen edits your name (unless a name field already has the caret)
    if (inp && !inField && e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { inp.focus(); try { inp.select(); } catch (er) { } S.tfocus = inp; titleRing(); }
  }
  function endKey(e) {
    const bs = [...D.end.querySelectorAll('[data-e]')], c = e.code; if (!bs.length) return;
    if (/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|KeyA|KeyD)$/.test(c)) {
      e.preventDefault(); S.esel = (S.esel + 1) % bs.length; bs.forEach((b, i) => b.classList.toggle('kf', i === S.esel)); SFX.play('ui'); return;
    }
    if ((c === 'Enter' || c === 'NumpadEnter' || c === 'KeyE') && !e.repeat) { e.preventDefault(); if (now() - (S.endT || 0) > 0.8) (bs[S.esel] || bs[bs.length - 1]).click(); }
  }

  const U = {
    get modal() { return blocking(); },
    init, update, blocking,
    toast, hint, banner, flash, levelUp, onUnlock, timer, dmgNum, worldBar, vignette, journalPing,
    prompt(t, p, at) { S.pr.t = t || null; S.pr.p = p == null ? null : p; S.pr.at = t && at ? at : null; },
    momentPrompt(t, p) { S.mpr = t ? { t, p: p == null ? null : p } : null; },
    dialogue, encounter, scene, summary, final, end,
    open, close() { closeMg(); closeDlg(); closePanel(); }, tollcamp, barter, lockpick, title, talk, radio,
    swapWeapon() {
      if (!G || blocking()) return;
      const owned = sortIds(Object.keys(G.pack).filter(k => ITEMS[k] && ITEMS[k].c === 'weapon'));
      if (owned.length < 2) { if (owned.length === 1 && G.p.weapon !== owned[0]) G.p.weapon = owned[0]; return; }
      const i = owned.indexOf(G.p.weapon); G.p.weapon = owned[(i + 1) % owned.length];
      SFX.play('swing'); D.wpn.classList.remove('swap'); void D.wpn.offsetWidth; D.wpn.classList.add('swap');
    },
    spendPoint, craft, lockOn, enemyHit,
    get reducedMotion() { return reducedMotion(); },
    get state() { return S; },
  };
  return U;
})();
