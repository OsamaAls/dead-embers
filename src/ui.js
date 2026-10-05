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
   Dialogue `lines` may be strings or {who, line} beats. A choice is {label, note, disabled, onPick}. */
const INPUT = { mx: 0, my: 0, sprint: false, crouch: false, attack: false, interact: false, attackPressed: false, dodgePressed: false, interactPressed: false, aimX: null, aimY: null, touch: false };
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
  };
  return {
    get on() { return on; },
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
    pr: { t: null, p: null }, mpr: null, prKey: '', hintQ: [], hintOn: false, hintT: 0, bannerT: 0,
    c: {}, dn: [], timer: null, wbars: {}, mmT: 0, fogT: 0, objText: '', joy: null, pinch: {}, crouchT: false,
    atk: { mouse: false, key: false, touch: false }, barMax: 0,
  };
  const K = {};
  const now = () => performance.now() / 1000;
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
  const fmt = s => typeof fmtName === 'function' ? fmtName(s) : String(s || '');
  const pad2 = n => String(n).padStart(2, '0');
  const iname = id => typeof itemName === 'function' ? itemName(id) : id;

  /* ---------- blocking / input ---------- */
  function blocking() { return !!(S.dlg || S.panel || S.mg || S.title || S.end); }
  function clearInput() {
    for (const k in K) delete K[k];
    INPUT.mx = INPUT.my = 0; INPUT.sprint = INPUT.attack = INPUT.interact = false;
    INPUT.attackPressed = INPUT.dodgePressed = INPUT.interactPressed = false;
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
  function setTouch(v) { if (INPUT.touch === v) return; INPUT.touch = v; document.body.classList.toggle('touch', v); S.prKey = ''; }
  const running = () => typeof Game !== 'undefined' && Game.running && G && !Game.dead;

  function onKey(e) {
    SFX.unlock();
    const c = e.code;
    if (S.title) return titleKey(e);
    if (S.end) { if (c === 'Enter') { const b = $('#end .btn.pri'); b && b.click(); } return; }
    if (c === 'Tab') e.preventDefault();
    if (S.mg) { if (S.mg.key) S.mg.key(e); return; }
    if (S.dlg) return dlgKey(e);
    if (S.panel) return panelKey(e);
    if (!running()) return;
    if (c === 'Space' || c.startsWith('Arrow')) e.preventDefault();
    if (e.repeat && K[c]) return;
    K[c] = true;
    if (c === 'KeyE') INPUT.interactPressed = true;
    if (c === 'KeyJ') { INPUT.attackPressed = true; S.atk.key = true; }
    if (c === 'Space') INPUT.dodgePressed = true;
    syncMove();
    const open = { KeyI: 'pack', Tab: 'journal', KeyB: 'char', KeyM: 'map', Escape: 'menu' }[c];
    if (open) { delete K[c]; U.open(open); }
    if (c === 'KeyQ') U.swapWeapon();
  }
  function onKeyUp(e) { delete K[e.code]; if (e.code === 'KeyJ') S.atk.key = false; if (!blocking()) syncMove(); }

  /* ---------- dom refs + init ---------- */
  const D = {};
  function init() {
    for (const id of ['hud', 'vig', 'flash', 'dmg', 'obj', 'timer', 'banner', 'mm', 'toasts', 'wpn', 'barri', 'prompt', 'hint', 'wmark', 'ohps', 'chips', 'clock', 'lvl', 'joy', 'dlg', 'pnl-wrap', 'pnl', 'mg', 'end', 'title'])
      D[id.replace('-', '')] = el(id);
    D.bars = { hp: el('b-hp'), sta: el('b-sta'), food: el('b-food'), water: el('b-water') };
    // damage-number pool
    for (let i = 0; i < 24; i++) { const d = document.createElement('div'); d.className = 'dn'; d.style.opacity = 0; D.dmg.appendChild(d); S.dn.push({ el: d, t: 9, x: 0, y: 0, h: 0 }); }
    addEventListener('keydown', onKey);
    addEventListener('keyup', onKeyUp);
    addEventListener('blur', () => { clearInput(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });
    const view = el('view');
    addEventListener('mousemove', e => { if (!INPUT.touch) { INPUT.aimX = e.clientX; INPUT.aimY = e.clientY; } });
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
    D.chips.addEventListener('click', e => { if (e.target.closest('.chip.ember')) U.open('char'); });
    document.querySelectorAll('.hb[data-open]').forEach(b => b.addEventListener('click', () => U.open(b.dataset.open)));
    D.pnl.addEventListener('click', panelClick);
    D.pnl.addEventListener('change', panelChange);
    restJoy();
    addEventListener('resize', restJoy);
  }

  /* ---------- touch: floating joystick on the left half, buttons on the right, pinch zoom ---------- */
  function restJoy() { if (S.joy) return; const j = D.joy; if (!j) return; j.style.left = '96px'; j.style.top = (innerHeight - 120) + 'px'; j.classList.remove('on', 'sprint'); j.firstChild.style.transform = ''; }
  function viewDown(e) {
    if (e.pointerType === 'mouse') {
      if (e.button === 0 && running() && !blocking()) { INPUT.attackPressed = true; S.atk.mouse = true; syncMove(); }
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
  }

  /* ---------- HUD ---------- */
  function setText(node, key, v) { if (S.c[key] !== v) { S.c[key] = v; node.textContent = v; } }
  function setBar(node, key, v, max) {
    const pct = cl(max > 0 ? v / max : 0, 0, 1), q = Math.round(pct * 300);
    if (S.c[key] === q) return; S.c[key] = q;
    const fl = node.querySelector('.fl'), gh = node.querySelector('.gh');
    fl.style.transform = `scaleX(${pct})`; if (gh) gh.style.transform = `scaleX(${pct})`;
    node.querySelector('.v').textContent = Math.round(v);
    node.classList.toggle('low', pct < 0.25);
  }
  function showHud(v) { if (S.hudShown === v) return; S.hudShown = v; D.hud.hidden = !v; if (!v) { D.prompt.hidden = true; D.vig.style.opacity = 0; } }
  function update(dt) {
    if (!G || !D.hud) return;
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
    if (safe(() => isUnlocked('people'), false)) { ppl.hidden = false; setText(ppl, 'ppl', G.survivors.length + ' SURV'); } else ppl.hidden = true;
    chips(p);
    objective();
    weaponChip();
    barricade();
    U.vignette();
    if (S.timer) {
      if (bl_) S.timer.t = Math.max(0, S.timer.t - dt);
      const t = S.timer.t, txt = t < 10 ? t.toFixed(1) : String(Math.ceil(t));
      setText(D.timer.querySelector('.t'), 'tmr', txt);
      D.timer.classList.toggle('urgent', t < 3);
    }
    renderPrompt();
    // minimap
    const mmOn = safe(() => isUnlocked('journal') || isUnlocked('map') || G.day >= 2, false);
    if (mmOn && D.mm.hidden) { D.mm.hidden = false; D.mm.classList.add('reveal'); }
    if (!mmOn && !D.mm.hidden) D.mm.hidden = true;
    S.mmT -= dt; if (mmOn && S.mmT <= 0) { S.mmT = 0.08; drawMinimap(); }
    // char button alert
    const hb = el('hb-char'); if (hb) { const pts = p.points > 0; if (S.c.pts !== pts) { S.c.pts = pts; hb.style.borderColor = pts ? 'var(--ember)' : ''; hb.style.color = pts ? 'var(--ember2)' : ''; } }
    // touch use-button readiness
    const useB = el('t-use'); if (useB) { const r = !!(S.mpr || S.pr.t) && /E\s/.test((S.mpr || S.pr).t || ''); if (S.c.useR !== r) { S.c.useR = r; useB.classList.toggle('ready', r); } }
    tickDmg(dt);
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
    if (m && m.x != null) return { text: m.label || 'Objective', target: { x: m.x, y: m.y } };
    return safe(() => objectiveInfo(), { text: '', target: null }) || { text: '', target: null };
  }
  function objective() {
    const o = curObjective(), p = G.p;
    if (S.objText !== o.text) {
      S.objText = o.text; D.obj.querySelector('.tx').textContent = o.text || '';
      D.obj.hidden = !o.text; D.obj.classList.remove('new'); void D.obj.offsetWidth; D.obj.classList.add('new');
    }
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
  function weaponChip() {
    const w = safe(() => weaponOf(), null), it = w && ITEMS[w];
    const name = it ? it.n : 'Fists';
    let ammo = '', out = false;
    if (it && it.ammo) { const n = G.pack[it.ammo] || 0; ammo = n + ' ' + (it.ammo === 'shells' ? 'SH' : it.ammo === 'bolts' ? 'BLT' : 'RND'); out = n === 0; }
    const owned = Object.keys(G.pack).filter(k => ITEMS[k] && ITEMS[k].c === 'weapon').length;
    const key = name + ammo + owned;
    if (S.c.wpn === key) return; S.c.wpn = key;
    D.wpn.querySelector('.n').textContent = name;
    const a = D.wpn.querySelector('.a'); a.textContent = ammo; a.classList.toggle('out', out);
    D.wpn.querySelector('.k').textContent = owned > 1 ? 'Q' : '';
  }
  function barricade() {
    const hp = typeof Combat !== 'undefined' ? Combat.barricadeHp : null;
    const on = hp != null && isFinite(hp) && !!((typeof Game !== 'undefined' && Game.wave) || Combat.wave);
    if (!on) { if (!D.barri.hidden) { D.barri.hidden = true; S.barMax = 0; } return; }
    D.barri.hidden = false; S.barMax = Math.max(S.barMax, hp, Combat.barricadeMax || 0);
    const pct = S.barMax ? cl(hp / S.barMax, 0, 1) : 0, q = Math.round(pct * 100);
    if (S.c.barri !== q) { S.c.barri = q; D.barri.querySelector('.fl').style.transform = `scaleX(${pct})`; }
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
      D.prompt.querySelector('.kt').textContent = INPUT.touch ? 'USE' : 'E';
      D.prompt.querySelector('.kt').style.fontSize = INPUT.touch ? '8.5px' : '';
      D.prompt.querySelector('.tx').innerHTML = m ? (m[1] ? '<span class="muted mono" style="font-size:11px;letter-spacing:.1em;margin-right:6px">HOLD</span>' : '') + esc(m[2]) : esc(t);
      S.c.prp = -1;
    }
    const pr = src.p == null ? 0 : cl(src.p, 0, 1), q = Math.round(pr * 60);
    if (S.c.prp !== q) { S.c.prp = q; D.prompt.querySelector('circle').style.strokeDashoffset = (113.1 * (1 - pr)).toFixed(1); }
  }

  /* ---------- minimap / map ---------- */
  const MAPC = {};
  function tileColors() {
    if (MAPC.pal) return MAPC.pal;
    const p = {}; const s = (t, c) => { if (typeof t === 'number') p[t] = c; };
    s(T_GRASS, '#2a2d21'); s(T_ROAD, '#4b4741'); s(T_WALL, '#8d816e'); s(T_DOOR, '#c86a2c'); s(T_TREE, '#1b2618'); s(T_WATER, '#223747');
    s(T_BRIDGE, '#635b50'); s(T_RUBBLE, '#3b342c'); s(T_CAR, '#6a3a26'); s(T_YARD, '#544631'); s(T_FIELD, '#38431f'); s(T_ROOF, '#6f6556'); s(T_FLOOR, '#3d352c'); s(T_PROP, '#5c4d3a');
    return (MAPC.pal = p);
  }
  function mapCanvas() {
    if (!WORLD || !G || !G._fog) return null;
    if (MAPC.world !== WORLD || !MAPC.can) {
      MAPC.world = WORLD; MAPC.can = MAPC.can || document.createElement('canvas');
      MAPC.can.width = W * 4; MAPC.can.height = H * 4; MAPC.fog = new Uint8Array(W * H);
      const x = MAPC.can.getContext('2d'); x.clearRect(0, 0, W * 4, H * 4); MAPC.dirty = true;
    }
    if (MAPC.dirty || now() - (MAPC.t || 0) > 0.4) {
      MAPC.t = now(); MAPC.dirty = false;
      const f = G._fog, x = MAPC.can.getContext('2d'), pal = tileColors();
      for (let i = 0; i < W * H; i++) if (f[i] && !MAPC.fog[i]) {
        MAPC.fog[i] = 1; const tx = i % W, ty = (i / W) | 0;
        x.fillStyle = pal[WORLD.tiles[i]] || '#333'; x.fillRect(tx * 4, ty * 4, 4, 4);
      }
    }
    return MAPC.can;
  }
  function drawIcons(x, s, ox, oy, size, full) {
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
  function worldBar(key, x, y, frac, label) {
    let b = S.wbars[key];
    if (x == null) { if (b) { b.el.remove(); delete S.wbars[key]; } return; }
    if (!b) { const e = document.createElement('div'); e.className = 'ohp'; e.innerHTML = '<i></i><b></b>'; D.ohps.appendChild(e); b = S.wbars[key] = { el: e }; }
    if (!has3D()) return;
    const pt = R.tileToScreen(x, y, 2.3);
    b.el.style.transform = `translate(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px)`;
    b.el.style.display = pt.on ? '' : 'none';
    const i = b.el.firstChild; i.style.transform = `scaleX(${frac == null ? 1 : cl(frac, 0, 1)})`; i.style.background = frac != null && frac < 0.35 ? 'var(--blood)' : '';
    if (b.label !== label) { b.label = label; b.el.lastChild.textContent = label || ''; }
  }

  /* ---------- toasts, hints, banner, flash, level up, unlocks, timer ---------- */
  function toast(text, cls) {
    if (!text || !D.toasts) return;
    text = String(text);
    const lastT = D.toasts.lastElementChild;
    if (lastT && lastT.dataset.t === text && !lastT.classList.contains('out')) {
      const n = (+lastT.dataset.n || 1) + 1; lastT.dataset.n = n; lastT.textContent = text + '  ×' + n; clearTimeout(lastT._t); lastT._t = setTimeout(() => fade(lastT), 3600); return;
    }
    const d = document.createElement('div'); d.className = 'toast ' + (cls || ''); d.textContent = text; d.dataset.t = text;
    D.toasts.appendChild(d);
    while (D.toasts.children.length > 4) D.toasts.firstElementChild.remove();
    d._t = setTimeout(() => fade(d), 3400 + Math.min(2500, text.length * 25));
    if (cls === 'loot') SFX.play('pickup'); else if (cls === 'story') SFX.play('good');
  }
  function fade(d) { d.classList.add('out'); setTimeout(() => d.remove(), 520); }
  function hint(text) {
    if (!text || !D.hint) return;
    if (S.hintCur === text || S.hintQ.includes(text)) return;
    S.hintQ.push(text); if (!S.hintOn) nextHint();
  }
  function nextHint() {
    const t = S.hintQ.shift(); if (!t) { S.hintOn = false; S.hintCur = null; return; }
    S.hintOn = true; S.hintCur = t; D.hint.textContent = t; D.hint.classList.add('on');
    clearTimeout(S.hintT); S.hintT = setTimeout(() => { D.hint.classList.remove('on'); setTimeout(nextHint, 450); }, 3800 + Math.min(2500, t.length * 22));
  }
  function banner(title, line) {
    if (!D.banner) return;
    D.banner.querySelector('.t').textContent = title || '';
    D.banner.querySelector('.l').textContent = line ? firstSentence(fmt(line), 130) : '';
    D.banner.classList.add('on'); clearTimeout(S.bannerT);
    S.bannerT = setTimeout(() => D.banner.classList.remove('on'), 4600);
  }
  function flash(kind) {
    const f = D.flash; if (!f) return;
    const k = { hurt: ['#b3170c', 0.42, 0.32], hit: ['#ffffff', 0.18, 0.15], heal: ['#6fbf4a', 0.3, 0.5], level: ['#e8742c', 0.45, 0.9], sleep: ['#000000', 1, 1.8] }[kind] || ['#ffffff', 0.2, 0.2];
    f.style.background = k[0]; f.style.setProperty('--fo', k[1]); f.style.animationDuration = k[2] + 's';
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    if (kind === 'hurt') { SFX.play('hurt'); if (typeof R !== 'undefined' && R.shake) safe(() => R.shake(0.18)); }
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
    const l = UNLOCK_LABEL[key]; if (!l) return;
    toast('New: ' + l, 'good'); SFX.play('good');
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
      (ch.length ? `<div class="ch">${ch.map((c, i) => `<button data-i="${i}" ${c.disabled ? 'disabled' : ''} class="${i === s.sel ? 'sel' : ''}"><span class="num">${i + 1}</span><span class="lb">${esc(c.label)}</span>${c.note ? `<span class="note">${esc(c.note)}</span>` : ''}</button>`).join('')}</div>`
        : `<div class="nx"><button data-continue>${last ? (d.doneLabel || 'Continue') : 'Next'} ${INPUT.touch ? '' : '<span class="kc">E</span>'}</button></div>`);
    const ln = D.dlg.querySelector('.ln');
    // typewriter
    const full = page.text; let n = 0; s.typing = true;
    const lines = full.split('\n');
    const draw = () => { let left = n; ln.innerHTML = lines.map(t => { const v = t.slice(0, Math.max(0, left)); left -= t.length; return `<p>${esc(v)}</p>`; }).join(''); };
    const step = () => { if (S.dlg !== s || !s.typing) return; n += 3; draw(); if (n >= full.length) { s.typing = false; draw(); return; } requestAnimationFrame(step); };
    s.finish = () => { s.typing = false; n = full.length; draw(); };
    step();
    D.dlg.querySelectorAll('.ch button').forEach(b => b.onclick = e => { e.stopPropagation(); pickChoice(+b.dataset.i); });
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
  function dlgKey(e) {
    const s = S.dlg, c = e.code, last = s.i === s.pg.length - 1, ch = last ? (s.d.choices || []) : [];
    if (/^(Digit|Numpad)[1-4]$/.test(c)) { if (ch.length) pickChoice(+c.slice(-1) - 1); else if (s.typing) s.finish(); return; }
    if (ch.length > 1 && !s.typing && (c === 'ArrowDown' || c === 'KeyS' || c === 'ArrowUp' || c === 'KeyW')) {
      e.preventDefault(); const dir = (c === 'ArrowDown' || c === 'KeyS') ? 1 : -1; let j = s.sel;
      for (let k = 0; k < ch.length; k++) { j = (j + dir + ch.length) % ch.length; if (!ch[j].disabled) break; }
      s.sel = j; D.dlg.querySelectorAll('.ch button').forEach((b, k) => b.classList.toggle('sel', k === j)); return;
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
        ${more > 0 ? `<div class="muted">+${more} more in the journal</div>` : ''}${item.radio ? `<div class="radio">RADIO · ${esc(firstSentence(fmt(item.radio), 160))}</div>` : ''}</div>`,
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
          if (r === 'wait') done('');
          else if (r === 'wave') { done(''); if (typeof Game !== 'undefined' && Game.finalWave) Game.finalWave(); }
          else if (r) end(r);
          else done('');
        },
      })),
    });
  }
  function end(id) {
    const sc = CONTENT_().story[id] || { title: id === 'death' ? 'You died' : 'The End', paras: [] };
    const dead = id === 'death' || id === 'end_stand_fail' || id === 'end_alliance_fail';
    const lines = sc.beats && sc.beats.length ? sc.beats.map(b => (b.who ? b.who + ': ' : '') + fmt(b.line)) : (sc.paras || []).slice(0, 4).map(p => firstSentence(fmt(p), 160));
    if (typeof Moments !== 'undefined' && Moments.abort) safe(() => Moments.abort());
    closeDlg(); closePanel(true); closeMg();
    S.end = true; syncBlock();
    const st = G ? G.stats || {} : {};
    const ey = id === 'death' ? `Day ${G ? G.day : 1} · ${G && G.deathCause ? 'Killed by ' + G.deathCause : 'The city took you'}` : 'Ending';
    D.end.className = dead ? 'dead' : '';
    D.end.innerHTML = `<div class="card"><div class="ey">${esc(ey)}</div><h1>${esc(sc.title)}</h1>
      <div class="bt2">${lines.map((l, i) => `<p style="animation-delay:${0.4 + i * 0.7}s">${esc(l)}</p>`).join('')}</div>
      <div class="stats"><div><b>${G ? G.day : 0}</b>Days</div><div><b>${st.kills || 0}</b>Kills</div><div><b>${G ? G.survivors.length : 0}</b>Survivors</div><div><b>${G ? G.p.level : 1}</b>Level</div></div>
      <div class="go"><button class="btn" data-e="title">Title</button><button class="btn pri" data-e="new">New game</button></div></div>`;
    D.end.hidden = false; showHud(false);
    D.end.querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
      SFX.play('ui');
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
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
    D.pnl.innerHTML = `<div class="ph"><h2>${esc(typeof sp.title === 'function' ? sp.title() : sp.title)}</h2><span class="sub">${esc(typeof sp.sub === 'function' ? sp.sub() : (sp.sub || ''))}</span><button class="x" data-a="close" aria-label="Close">×</button></div>
      ${tabs && tabs.length > 1 ? `<div class="tabs">${tabs.map(t => `<button data-a="tab:${t[0]}" class="${t[0] === tab ? 'on' : ''}">${esc(t[1])}</button>`).join('')}</div>` : ''}
      <div class="pb-body">${sp.body(tab)}</div>${sp.foot ? `<div class="ft">${sp.foot(tab)}</div>` : ''}`;
    S.lastRender = S.panel + tab;
    if (same) { const b = D.pnl.querySelector('.pb-body'); if (b) b.scrollTop = st; }
    if (sp.after) sp.after(tab);
  }
  function closePanel(silent) {
    if (!S.panel) return;
    const sp = S.spec; S.panel = null; S.spec = null; S.lastRender = '';
    D.pnlwrap.hidden = true; D.pnl.innerHTML = ''; syncBlock();
    if (!silent && sp && sp.onClose) sp.onClose();
  }
  function panelClick(e) {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
    const [a, ...rest] = b.dataset.a.split(':'), arg = rest.join(':');
    if (a === 'close') { SFX.play('ui'); closePanel(); return; }
    if (a === 'tab') { S.panelTab[S.panel] = arg; SFX.play('ui'); renderPanel(); return; }
    if (S.spec && S.spec.act) { S.spec.act(a, arg, b, e); if (S.panel) renderPanel(); }
  }
  function panelChange(e) { if (S.spec && S.spec.change) { S.spec.change(e); if (S.panel) renderPanel(); } }
  function panelKey(e) {
    if (e.repeat) return;
    const c = e.code, toggle = { pack: 'KeyI', journal: 'Tab', char: 'KeyB', map: 'KeyM', menu: 'Escape', shelter: 'KeyE' }[S.panel];
    if (c === 'Escape' || c === toggle) { e.preventDefault(); closePanel(); return; }
    if (S.panel === 'summary' && (c === 'Enter' || c === 'Space' || c === 'KeyE')) { e.preventDefault(); closePanel(); return; }
    if (S.spec && S.spec.key) S.spec.key(e);
  }

  function open(panel) {
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
      case 'menu': return openPanel('menu', menuPanel());
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
        if (!ids.length) return h + '<p class="empty">Empty. Search cabinets, crates and fridges with E.</p>';
        h += `<div class="grid">${ids.map(k => `<button class="it c-${ITEMS[k].c} ${k === sel ? 'sel' : ''}" data-a="sel:${k}">${G.p.weapon === k ? '<span class="eq">EQUIPPED</span>' : ''}<span class="n">${esc(ITEMS[k].n)}</span><span class="q">×${G.pack[k]}</span></button>`).join('')}</div>`;
        if (sel) {
          const it = ITEMS[sel], acts = [];
          if (it.eat) acts.push(`<button class="btn pri sm" data-a="use:${sel}">${it.c === 'water' ? 'Drink' : 'Eat'}</button>`);
          if (it.use) acts.push(`<button class="btn pri sm" data-a="use:${sel}">Use</button>`);
          if (it.c === 'weapon' && G.p.weapon !== sel) acts.push(`<button class="btn pri sm" data-a="equip:${sel}">Equip</button>`);
          if (G.atShelter && it.c !== 'story') acts.push(`<button class="btn sm" data-a="store:${sel}">Store</button>`);
          if (it.c !== 'story') { acts.push(`<button class="btn ghost sm" data-a="drop:${sel}:1">Drop 1</button>`); if (G.pack[sel] > 1) acts.push(`<button class="btn ghost sm" data-a="drop:${sel}:all">Drop all</button>`); }
          h += `<div class="det"><div class="dn2"><b>${esc(it.n)}</b><div>${esc(itemDesc(sel))}</div></div>${acts.join('')}</div>`;
        }
        return h;
      },
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
        h += `<h3>Attributes ${p.points ? `<span class="mono" style="color:var(--ember2);font-size:12px">${p.points} to spend</span>` : ''}</h3>`;
        for (const k in ATTR_LINES) {
          const [ab, n, d] = ATTR_LINES[k], v = p.attr[k] || 0;
          h += `<div class="attr"><span class="k">${ab}</span><span class="d"><b>${n}</b><span>${d}</span></span><span class="v">${v}</span>${p.points && v < 10 ? `<button data-a="up:${k}" aria-label="Raise ${n}">+</button>` : '<span></span>'}</div>`;
        }
        if (!p.points) h += `<p class="muted" style="margin-top:10px;font-size:13px">Level up to earn points. Kills, searches and building give XP.</p>`;
        return h;
      },
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
          if (!list.length) return `<p class="empty">${tab === 'story' ? 'Nothing yet.' : 'Notes you find in the city end up here.'}</p>`;
          return list.map(j => `<div class="jt"><span class="h">${esc(j.title)}</span><span class="d">DAY ${j.day}</span>${String(j.text || '').split(/\n\n+/).map(t => `<p>${esc(t)}</p>`).join('')}</div>`).join('');
        }
        if (tab === 'people') {
          const ap = arcProgress();
          let h = '<h3>People you have met</h3>' + ap.map(a => `<div class="arc"><span>${a.done ? esc(a.n) : '<span class="muted">Unknown</span>'}</span><span class="pips">${Array.from({ length: a.max }, (_, i) => `<i class="${i < a.done ? 'on' : ''}"></i>`).join('')}</span></div>`).join('');
          h += '<h3>At the bunker</h3>' + (G.survivors.length ? G.survivors.map(s => `<div class="row"><span class="grow"><span class="t1">${esc(s.name)}</span> <span class="t2">${esc((TRAITS[s.trait] || {}).n || '')} · ${esc(jobName(s.job))}</span></span></div>`).join('') : '<p class="empty">Nobody yet.</p>');
          return h;
        }
        const o = curObjective();
        let h = `<h3>Now</h3><div class="objbig">${esc(o.text || 'Survive.')}</div>`;
        const notes = [];
        if (G.hordeNight && !G.hordeResult) notes.push('A horde hits the bunker tonight. Be home by 21:00.');
        if (G.flags.q_bus && G.hordeDay) notes.push(`The great horde arrives around day ${G.hordeDay}.`);
        if (safe(() => isUnlocked('needs'), false)) notes.push(`Food ${Math.round(G.p.hunger)} · Water ${Math.round(G.p.thirst)} · Morale ${Math.round(G.p.morale)}`);
        if (notes.length) h += '<h3>Keep in mind</h3>' + notes.map(n => `<p>${esc(n)}</p>`).join('');
        const recent = G.log.slice(-6).reverse();
        if (recent.length) h += '<h3>Recent</h3>' + recent.map(l => `<p class="muted mono" style="font-size:12px;margin:0 0 4px">${esc(l.t)} · ${esc(l.msg)}</p>`).join('');
        return h;
      },
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
        if (safe(() => isUnlocked('people'), false)) t.push(['people', `People ${G.survivors.length}`]);
        if (safe(() => isUnlocked('build'), false)) t.push(['build', 'Build']);
        return t;
      },
      body: tab => {
        if (tab === 'store') {
          const pk = sortIds(Object.keys(G.pack).filter(k => ITEMS[k] && G.pack[k] > 0)), sk = sortIds(Object.keys(G.store).filter(k => ITEMS[k] && G.store[k] > 0));
          const li = (ids, bag, dir) => ids.length ? ids.map(k => `<button data-a="mv:${dir}:${k}"><span>${esc(ITEMS[k].n)}</span><span class="q">×${bag[k]}</span></button>`).join('') : '<p class="empty">Empty.</p>';
          return `<p class="muted" style="font-size:13px">Tap to move one. Building uses what is stored here.</p>
            <div class="cols"><div><h3>Pack</h3><div class="mini">${li(pk, G.pack, 'in')}</div></div><div><h3>Storage</h3><div class="mini">${li(sk, G.store, 'out')}</div></div></div>`;
        }
        if (tab === 'craft') {
          const list = RECIPES.map((r, i) => [r, i]).filter(([r]) => r.bench <= bl('bench') + 1);
          return `<p class="muted" style="font-size:13px">Workbench level ${bl('bench')} · INT ${G.p.attr.int || 0}. Crafted items go to your pack.</p>` + list.map(([r, i]) => {
            const ck = canCraft(r);
            return `<div class="row"><span class="grow"><span class="t1">${esc(r.label || iname(r.out))}${r.q > 1 ? ' ×' + r.q : ''}</span><br><span class="cost">${costHtml(r.in)}</span></span>${ck.ok ? '' : `<span class="mono muted" style="font-size:11px">${esc(ck.why)}</span>`}<button class="btn sm ${ck.ok ? 'pri' : ''}" data-a="craft:${i}" ${ck.ok ? '' : 'disabled'}>Craft</button></div>`;
          }).join('');
        }
        if (tab === 'people') {
          if (!G.survivors.length) return '<p class="empty">Nobody else lives here yet. Survivors in the city can be talked into joining.</p>';
          let h = `<p class="muted" style="font-size:13px">Beds ${G.survivors.length}/${safe(() => shelterCap(), 2)}. Give everyone a job; production arrives each morning.</p>`;
          for (const s of G.survivors) {
            const best = Object.keys(s.skills).sort((a, b) => s.skills[b] - s.skills[a])[0];
            const opts = [['idle', 'Resting'], ['guard', 'Guard'], ['scavenge', 'Scavenge runs']];
            for (const k in BUILDINGS) if (BUILDINGS[k].workers && bl(k)) opts.push([k, `${BUILDINGS[k].n} ${safe(() => workerCount(k), 0)}/${bl(k)}`]);
            h += `<div class="row"><span class="grow"><span class="t1">${esc(s.name)}</span><br><span class="t2">${esc((TRAITS[s.trait] || {}).n || '')} · best at ${esc(best)} · HP ${Math.round(s.hp)} · morale ${Math.round(s.morale)}</span></span>
              <select data-s="${s.id}">${opts.map(([k, n]) => `<option value="${k}" ${s.job === k ? 'selected' : ''} ${k !== s.job && BUILDINGS[k] && safe(() => workerCount(k), 0) >= bl(k) ? 'disabled' : ''}>${esc(n)}</option>`).join('')}</select></div>`;
          }
          return h;
        }
        if (tab === 'build') {
          let h = '<p class="muted" style="font-size:13px">Walk to a glowing marker in the yard and hold E to build there.</p>';
          for (const k in BUILDINGS) {
            const B = BUILDINGS[k]; if (B.hidden && !(k === 'radio' && G.flags.q_radio)) continue;
            const lv = bl(k), c = safe(() => buildCost(k), null), ck = safe(() => canBuild(k), { ok: false, why: '' });
            h += `<div class="row"><span class="grow"><span class="t1">${esc(lv ? bName(k) : B.n)}</span> <span class="mono muted" style="font-size:11px">${lv}/${B.max}</span><br><span class="t2">${esc(B.desc)}</span>${c ? `<br><span class="cost">${costHtml(c)}</span>` : ''}</span><span class="mono" style="font-size:11px;color:${ck.ok ? 'var(--good)' : 'var(--dim)'}">${c ? esc(ck.ok ? 'Ready to build' : ck.why) : 'Done'}</span></div>`;
          }
          return h;
        }
        // rest
        const cs = safe(() => canSleep(), { ok: true }), p = G.p;
        const food = sortIds(Object.keys(Object.assign({}, G.store, G.pack)).filter(k => ITEMS[k] && (ITEMS[k].eat || ITEMS[k].use) && count(k) > 0));
        let h = `<div class="kv" style="margin-bottom:10px"><span>HP <b>${Math.round(p.hp)}/${p.maxHp}</b></span><span>STA <b>${Math.round(p.sta)}</b></span>${safe(() => isUnlocked('needs'), false) ? `<span>FOOD <b>${Math.round(p.hunger)}</b></span><span>WATER <b>${Math.round(p.thirst)}</b></span>` : ''}<span>BUNKS <b>${bl('bed')}</b></span></div>`;
        h += `<div class="row"><span class="grow"><span class="t1">Sleep until morning</span><br><span class="t2">${cs.ok ? `About ${sleepHours()} hours. Heals and restores stamina${bl('bed') ? '' : '. Bunks help'}.` : esc(cs.why)}</span></span><button class="btn pri" data-a="sleep" ${cs.ok ? '' : 'disabled'}>Sleep</button></div>`;
        h += '<h3>Eat and drink</h3>' + (food.length ? `<div class="mini">${food.map(k => `<button data-a="eat:${k}"><span>${esc(ITEMS[k].n)} <span class="muted" style="font-size:12px">${esc(itemDesc(k).split(' · ').slice(0, 2).join(' · '))}</span></span><span class="q">×${count(k)}</span></button>`).join('')}</div>` : '<p class="empty">Nothing to eat. Search the city.</p>');
        return h;
      },
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
  /* map */
  function mapPanel() {
    return {
      title: 'Ardent Vale', sub: () => `Explored ${Math.round(safe(() => G._fog.reduce((a, b) => a + b, 0), 0) / (W * H) * 100)}%`,
      body: () => `<canvas id="mapc"></canvas><div class="legend"><span><i style="background:#ebe1ce"></i>You</span><span><i style="background:#e8742c;border-radius:50%"></i>Objective</span><span><i style="border:2px solid #ebe1ce"></i>Bunker</span><span><i style="background:#e05a46"></i>Tollmen</span></div>`,
      after: () => drawFullMap(el('mapc')),
    };
  }
  /* menu */
  function menuPanel() {
    let help = false;
    return {
      title: 'Paused', sub: () => G ? `Day ${G.day} · ${G.p.name}` : '', narrow: true,
      body: () => {
        if (help) return helpCard();
        return `<div class="menu"><button class="btn pri" data-a="close">Resume</button><button class="btn" data-a="save">Save game</button><button class="btn" data-a="help">Controls</button>
          <button class="btn" data-a="sound">Sound: ${SFX.on ? 'On' : 'Off'}</button><button class="btn ghost" data-a="quit">Quit to title</button></div>`;
      },
      foot: () => help ? `<button class="btn" data-a="back">Back</button>` : '',
      act: a => {
        if (a === 'save') { const ok = safe(() => saveGame(true), false); toast(ok ? 'Game saved.' : 'Could not save in this browser.', ok ? 'good' : 'warn'); }
        if (a === 'help') help = true;
        if (a === 'back') help = false;
        if (a === 'sound') { SFX.toggle(); SFX.unlock(); SFX.play('ui'); }
        if (a === 'quit') { closePanel(true); if (typeof Game !== 'undefined' && Game.quit) Game.quit(); }
      },
    };
  }
  function helpCard() {
    const rows = INPUT.touch
      ? [['Move', 'Drag left side'], ['Sprint', 'Push the stick far'], ['Attack', 'ATTACK (hold)'], ['Dodge roll', 'DODGE'], ['Search / use', 'USE (hold)'], ['Sneak', 'CROUCH'], ['Zoom', 'Pinch'], ['Map', 'Tap the minimap'], ['Swap weapon', 'Tap weapon']]
      : [['Move', 'WASD / arrows'], ['Sprint', 'Shift'], ['Crouch', 'C'], ['Dodge roll', 'Space'], ['Attack', 'Click / J'], ['Aim', 'Mouse'], ['Search / use', 'Hold E'], ['Swap weapon', 'Q'], ['Pack', 'I'], ['Character', 'B'], ['Journal', 'Tab'], ['Map', 'M'], ['Zoom', 'Wheel'], ['Menu', 'Esc']];
    return `<div class="help">${rows.map(r => `<div><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')}</div>
      <p class="muted" style="font-size:13px;margin-top:12px">Crouch to stay unseen. Sprinting and gunfire draw the dead. Bring loot home to build. Be in the bunker on horde nights.</p>`;
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
        const tok = (o, side, f) => Object.keys(o).filter(k => o[k] > 0).map(k => `<button class="tok" data-a="back:${side}:${k}">${esc(ITEMS[k].n)}${o[k] > 1 ? ' ×' + o[k] : ''}<b>${f(k) * o[k]}</b></button>`).join('') || '<span class="muted" style="font-size:12.5px">Tap items below to offer them.</span>';
        let h = `<div class="offer"><div><h4><span>You give</span><span>${my}</span></h4><div class="side">${tok(mine, 'm', sellPrice)}</div></div><div><h4><span>You get</span><span>${th}</span></h4><div class="side">${tok(theirs, 't', buyPrice)}</div></div>
          <div class="bal"><span>${my}</span><div class="tr ${short ? 'short' : ''}"><div class="y" style="width:${my / mx * 100}%"></div><div class="th" style="left:calc(${th / mx * 100}% - 1px)"></div></div><span>${th}</span></div></div>`;
        const yours = sortIds(Object.keys(av).filter(k => av[k] > 0 && sellable(k)));
        const goods = sortIds(Object.keys(st).filter(k => ITEMS[k] && st[k] - (theirs[k] || 0) > 0));
        h += `<div class="bt"><div><h4><span>Yours</span><span>value</span></h4><div class="mini">${yours.map(k => `<button data-a="give:${k}"><span>${esc(ITEMS[k].n)} <span class="muted">×${av[k]}</span></span><span class="pr">${sellPrice(k)}</span></button>`).join('') || '<p class="empty">Nothing to trade.</p>'}</div></div>
          <div><h4><span>Theirs</span><span>price</span></h4><div class="mini">${goods.map(k => `<button data-a="take:${k}"><span>${esc(ITEMS[k].n)} <span class="muted">×${st[k] - (theirs[k] || 0)}</span></span><span class="pr">${buyPrice(k)}</span></button>`).join('') || '<p class="empty">Sold out.</p>'}</div></div></div>`;
        return h;
      },
      foot: () => {
        const my = val(mine, sellPrice), th = val(theirs, buyPrice), ok = th > 0 && my >= th;
        return `<span class="muted mono" style="font-size:11px;margin-right:auto;align-self:center">${th > 0 && my > th ? `Overpaying by ${my - th}` : th > my ? `Short by ${th - my}` : ''}</span><button class="btn ghost" data-a="close">Leave</button><button class="btn pri" data-a="deal" ${ok ? '' : 'disabled'}>Trade</button>`;
      },
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
    const m = { mode, diff, pins: 0, miss: 0, a: Math.random() * 6.28, dir: 1, fill: 0, t: 0, t0: performance.now(), time: 4.2, over: false, flashT: 0, flashOk: true };
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
      setTimeout(() => { if (S.mg === m) { closeMg(); done(ok); } }, 900);
    };
    m.key = e => { if (['KeyE', 'Space', 'Enter', 'KeyJ'].includes(e.code)) { e.preventDefault(); if (!e.repeat) press(); } else if (e.code === 'Escape' && !m.over) finish(false); };
    D.mg.onpointerdown = e => { if (e.target.closest('.box') || INPUT.touch) { e.preventDefault(); press(); } };
    let lt = performance.now();
    const loop = t => {
      if (m.dead) return;
      const dt = Math.min(0.1, (t - lt) / 1000); lt = t;
      if (!m.over) {
        if (mode === 'pick') m.a = (m.a + m.dir * m.spd * dt + Math.PI * 2) % (Math.PI * 2);
        else { m.t = (performance.now() - m.t0) / 1000; m.fill = Math.max(0, m.fill - m.decay * dt * (m.fill > 0.02 ? 1 : 0)); if (m.t >= m.time) finish(false); }
      }
      m.flashT = Math.max(0, m.flashT - dt);
      drawMg(x, m);
      stEl.innerHTML = mode === 'pick' ? `<span>PINS <b>${m.pins}/3</b></span><span>SLIPS <b>${m.miss}/2</b></span>` : `<span>TIME <b>${Math.max(0, m.time - m.t).toFixed(1)}s</b></span>`;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
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
  function title(step) {
    if (typeof Moments !== 'undefined' && Moments.abort) safe(() => Moments.abort());
    closeDlg(); closePanel(true); closeMg(); S.end = false; D.end.hidden = true;
    S.title = true; syncBlock(); showHud(false); timer(null);
    D.title.hidden = false;
    if (step === 'new') return newGameStep();
    const cont = safe(() => hasSave(), false);
    D.title.innerHTML = `${embers()}<div class="logo">Dead<span>Embers</span></div><div class="tag">Ardent Vale · fourteen months after the Grey Fever</div>
      <div class="acts">${cont ? '<button class="btn pri" data-t="cont">Continue</button>' : ''}<button class="btn ${cont ? '' : 'pri'}" data-t="new">New game</button></div><div class="ver">BUILD 3D</div>`;
    D.title.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
      SFX.unlock(); SFX.play('ui');
      if (b.dataset.t === 'new') return newGameStep();
      if (typeof Game !== 'undefined' && Game.continueGame && Game.continueGame()) closeTitle();
      else toast('That save could not be loaded.', 'warn');
    });
  }
  function newGameStep() {
    const bgs = Object.keys(BACKGROUNDS);
    let sel = bgs.includes('scavenger') ? 'scavenger' : bgs[0];
    const bonus = b => Object.keys(b.bonus || {}).map(k => `${k.toUpperCase()} +${b.bonus[k]}`).join('  ');
    D.title.innerHTML = `${embers()}<div class="newg"><h2>Who were you?</h2>
      <label>Name<input id="ng-name" maxlength="18" value="Survivor" autocomplete="off" spellcheck="false"></label>
      <div class="bgs">${bgs.map(k => `<button class="bgc ${k === sel ? 'on' : ''}" data-bg="${k}"><b>${esc(BACKGROUNDS[k].n)}</b><span>${esc(firstSentence(BACKGROUNDS[k].desc, 70))}</span><em>${esc(bonus(BACKGROUNDS[k]))}</em></button>`).join('')}</div>
      <div class="go"><button class="btn ghost" data-t="back">Back</button><button class="btn pri" data-t="start">Start</button></div></div>`;
    D.title.querySelectorAll('.bgc').forEach(b => b.onclick = () => { sel = b.dataset.bg; SFX.play('ui'); D.title.querySelectorAll('.bgc').forEach(x => x.classList.toggle('on', x === b)); });
    D.title.querySelector('[data-t=back]').onclick = () => { SFX.play('ui'); title(); };
    D.title.querySelector('[data-t=start]').onclick = () => startNew(sel);
    S.titleStart = () => startNew(sel);
  }
  function startNew(bg) {
    const inp = el('ng-name'), name = (inp && inp.value.trim()) || 'Survivor';
    SFX.unlock(); SFX.play('levelup');
    if (typeof Moments !== 'undefined' && Moments.abort) safe(() => Moments.abort());
    closeTitle();
    S.objText = ''; S.c = {}; S.hudShown = false;
    if (typeof Game !== 'undefined' && Game.newGame) Game.newGame(name.slice(0, 18), bg);
  }
  function titleKey(e) {
    if (e.code === 'Enter') {
      e.preventDefault();
      if (el('ng-name')) { S.titleStart && S.titleStart(); return; }
      const b = D.title.querySelector('.btn.pri'); b && b.click();
    } else if (e.code === 'Escape' && el('ng-name')) title();
  }

  const U = {
    get modal() { return blocking(); },
    init, update, blocking,
    toast, hint, banner, flash, levelUp, onUnlock, timer, dmgNum, worldBar, vignette,
    prompt(t, p) { S.pr.t = t || null; S.pr.p = p == null ? null : p; },
    momentPrompt(t, p) { S.mpr = t ? { t, p: p == null ? null : p } : null; },
    dialogue, encounter, scene, summary, final, end,
    open, close() { closeMg(); closeDlg(); closePanel(); }, tollcamp, barter, lockpick, title,
    swapWeapon() {
      if (!G || blocking()) return;
      const owned = sortIds(Object.keys(G.pack).filter(k => ITEMS[k] && ITEMS[k].c === 'weapon'));
      if (owned.length < 2) { if (owned.length === 1 && G.p.weapon !== owned[0]) G.p.weapon = owned[0]; return; }
      const i = owned.indexOf(G.p.weapon); G.p.weapon = owned[(i + 1) % owned.length];
      SFX.play('swing'); D.wpn.classList.remove('swap'); void D.wpn.offsetWidth; D.wpn.classList.add('swap');
    },
    spendPoint, craft,
    get state() { return S; },
  };
  return U;
})();
