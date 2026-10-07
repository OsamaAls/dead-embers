/* In-page test harness for Dead Embers (dev only, never bundled). Load in a running page: fetch("tools/harness.js").then(r=>r.text()).then(eval)
   Deterministic frames (20/s via sim), BFS walking (goto), fight/search bots and state(). */
window.__T = 1e6;
/* sim(sec, ctl): run sec seconds of game at 20 fps without drawing (ctl(i) may return 'stop'); the last frame is drawn. */
/* frame() re-queues itself with requestAnimationFrame; stub it while stepping or every simulated frame leaves a real render queued behind. */
window.sim = (sec, ctl) => { const n = Math.round(sec * 20), draw = R.render, raf = window.requestAnimationFrame; R.render = () => { }; window.requestAnimationFrame = () => 0; let i = 0;
  try { for (; i < n; i++) { if (ctl && ctl(i) === 'stop') break; __T += 50; frame(__T); if (window.__noting && i % 2 === 0) noteTick(); } } finally { R.render = draw; window.requestAnimationFrame = raf; }
  try { R.render(); } catch (e) { } return i / 20; };
window.kd = c => dispatchEvent(new KeyboardEvent('keydown', { code: c })); window.ku = c => dispatchEvent(new KeyboardEvent('keyup', { code: c }));
window.skipDlg = () => { if (UI.blocking()) { kd('Space'); ku('Space'); } };
window.go = (pts, near, maxS) => { let i = 0; const t = sim(maxS || 40, () => { const [tx, ty] = pts[i], p = G.p, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy); skipDlg(); if (d < (i === pts.length - 1 ? near : 0.5)) { i++; if (i >= pts.length) { INPUT.mx = INPUT.my = 0; return 'stop'; } return; } INPUT.mx = dx / d; INPUT.my = dy / d; }); INPUT.mx = INPUT.my = 0; return t; };
window.path = (tx, ty) => { const sx = Math.floor(G.p.x), sy = Math.floor(G.p.y), gx = Math.floor(tx), gy = Math.floor(ty); const prev = new Int32Array(W * H).fill(-1), q = [sy * W + sx]; prev[q[0]] = q[0]; for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i - x) / W; if (x === gx && y === gy) break; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, j = ny * W + nx; if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev[j] >= 0 || SOLID.has(tileAt(nx, ny))) continue; prev[j] = i; q.push(j); } } let i = gy * W + gx; if (prev[i] < 0) return null; const pts = []; while (i !== prev[i]) { const x = i % W; pts.unshift([x + 0.5, (i - x) / W + 0.5]); i = prev[i]; } return pts; };
window.goto = (tx, ty, near, maxS) => { const pts = path(tx, ty); if (!pts) return 'nopath'; pts.push([tx, ty]); return go(pts, near || 0.5, maxS || 60); };
window.clearFoes = () => { for (const e of Combat.enemies.slice()) Combat.despawn && Combat.despawn(e); };
window.fightBot = (ids, gun, maxS) => { if (ids) { clearFoes(); window.__won = 0; window.__lost = 0; fight(ids, { onWin: () => { __won = 1; return 'Won.'; }, onFlee: () => { __lost = 'flee'; return ''; } }); } const cv = document.querySelector('#view canvas'); let swings = 0, minHp = G.p.hp;
  const t = sim(maxS || 40, i => { if (ids && (__won || __lost)) return 'stop'; minHp = Math.min(minHp, G.p.hp); if (UI.blocking()) { unblock(4); return; } const p = G.p; let b = null, bd = 99; for (const e of Combat.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; b = e; } } if (!b) return ids ? undefined : 'stop'; const s = R.tileToScreen(b.x, b.y, 1); INPUT.aimX = s.x; INPUT.aimY = s.y; INPUT.mouseAim = true;
    const want = gun ? 4.5 : 1.0; if (bd > want + 0.3) { INPUT.mx = (b.x - p.x) / bd; INPUT.my = (b.y - p.y) / bd; } else { INPUT.mx = INPUT.my = 0; }
    if (i % 4 === 0 && bd < (gun ? 7 : 1.7)) { swings++; if (gun) { cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: s.x, clientY: s.y, button: 0, pointerType: 'mouse', bubbles: true })); dispatchEvent(new PointerEvent('pointerup', { clientX: s.x, clientY: s.y, button: 0, pointerType: 'mouse', bubbles: true })); dispatchEvent(new MouseEvent('mouseup')); } else { kd('KeyJ'); ku('KeyJ'); } }
    if (Combat.grabbed && i % 2) { kd('KeyJ'); ku('KeyJ'); } });
  INPUT.mx = INPUT.my = 0; return { won: window.__won, secs: t, swings, minHp: Math.round(minHp), hp: Math.round(G.p.hp), kills: G.stats.kills }; };
window.nearestCont = () => WORLD.containers.filter(c => containerState(c) !== 'empty').sort((a, b) => ((a.x - G.p.x) ** 2 + (a.y - G.p.y) ** 2) - ((b.x - G.p.x) ** 2 + (b.y - G.p.y) ** 2))[0];
/* unblock(): clear whatever is in the way (cutscene, dialogue with choices: picks the last option, story beats) */
window.unblock = (max) => { for (let i = 0; i < (max || 20) && UI.blocking(); i++) { if (typeof Cine !== 'undefined' && Cine.active) { Cine.skip(); sim(0.2); continue; } if (UI.state.mg || UI.state.panel) { kd('Escape'); ku('Escape'); sim(0.3); continue; } const bs = dlgButtons(); if (bs.length > 1) bs[bs.length - 1].click(); else { kd('Space'); ku('Space'); } sim(0.3); if (Moments.active) fightBot(null, true, 10); } return !UI.blocking(); };
/* searchNearest(): walk to the nearest unsearched container (from a free side that has a path; same side of the wall as the container)
   and hold E until the search completes. Returns {kind, ok, held} plus diagnostics when it fails. */
window.searchNearest = () => {
  unblock(); const c = nearestCont(); const inC = indoors(c.x + 0.5, c.y + 0.5);
  const sides = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dx, dy]) => [c.x + dx + 0.5, c.y + dy + 0.5]).filter(([x, y]) => !solidAt(x, y) && path(x, y));
  sides.sort((a, b) => (indoors(a[0], a[1]) === inC ? 0 : 1) - (indoors(b[0], b[1]) === inC ? 0 : 1));
  const adj = sides[0]; if (!adj) return { kind: c.kind, ok: false, held: 0, why: 'no reachable side' };
  const walk = goto(adj[0], adj[1], 0.3); unblock();
  const s0 = G.stats.searches; kd('KeyE'); const th = sim(10, () => { if (G.stats.searches > s0) return 'stop'; if (UI.blocking()) { ku('KeyE'); unblock(); kd('KeyE'); } }); ku('KeyE');
  const ok = G.stats.searches > s0, out = { kind: c.kind, ok, held: th };
  if (!ok) { const t = interactTarget(); Object.assign(out, { walk, d: +Math.hypot(G.p.x - c.x - 0.5, G.p.y - c.y - 0.5).toFixed(2), target: t && t.label, state: containerState(c), blocking: UI.blocking(), mom: Moments.active }); }
  return out;
};
window.holdE = (sec, until) => { kd('KeyE'); const t = sim(sec, () => until && until() ? 'stop' : 0); ku('KeyE'); return t; };
window.dlgButtons = () => [...document.querySelectorAll('#dlg button:not([disabled])')];
window.state = () => ({ day: G.day, time: G.hour + ':' + String(G.minute).padStart(2, '0'), p: [+G.p.x.toFixed(1), +G.p.y.toFixed(1)], hp: Math.round(G.p.hp), obj: objectiveInfo().text, unlocks: Object.keys(G.unlocks).join(','), blocking: UI.blocking(), mom: Moments.active, q: Game.Q.map(q => q.type).join(',') });
/* defendBot(maxS): play a horde wave like a player would. Hold the ring just inside the barricade nearest the closest attacker,
   kill anything that got inside first, shoot when there is ammo (else melee), mash out of grabs. Returns when the wave ends. */
window.defendBot = (maxS) => { const t0 = __T; let minHp = G.p.hp;
  const t = sim(maxS || 300, i => { skipDlg(); if (!Combat.wave) return 'stop'; minHp = Math.min(minHp, G.p.hp); if (G.p.hp <= 0) return 'stop';
    const w = Combat.wave, r = w.rect, p = G.p, ins = (x, y) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
    let b = null, bd = 1e9; for (const e of Combat.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - p.x, e.y - p.y) + (ins(e.x, e.y) ? 0 : 6); if (d < bd) { bd = d; b = e; } }
    if (!b) { INPUT.mx = INPUT.my = 0; return; }
    const gun = weaponProfile().ranged, d = Math.hypot(b.x - p.x, b.y - p.y);
    let tx = b.x, ty = b.y; if (!ins(b.x, b.y)) { tx = Math.min(r.x1 - 0.7, Math.max(r.x0 + 0.7, b.x)); ty = Math.min(r.y1 - 0.7, Math.max(r.y0 + 0.7, b.y)); }
    const want = gun ? 0.4 : 0.3, dm = Math.hypot(tx - p.x, ty - p.y);
    if (dm > want && !(gun && d < 5 && ins(p.x, p.y))) { INPUT.mx = (tx - p.x) / dm; INPUT.my = (ty - p.y) / dm; } else INPUT.mx = INPUT.my = 0;
    const s = R.tileToScreen(b.x, b.y, 1); if (s.on) { INPUT.aimX = s.x; INPUT.aimY = s.y; INPUT.mouseAim = true; } else { INPUT.aimX = INPUT.aimY = null; INPUT.mouseAim = false; G.p.face = Math.atan2(b.x - p.x, b.y - p.y); }
    if (i % 3 === 0 && d < (gun ? 8 : 1.8)) INPUT.attackPressed = true;
    if (Combat.grabbed && i % 2) INPUT.attackPressed = true;
    if (gun && !(G.pack.ammo || G.pack.shells) && G.pack.machete) G.p.weapon = 'machete'; });
  INPUT.mx = INPUT.my = 0; return { secs: t, minHp: Math.round(minHp), hp: Math.round(G.p.hp) }; };
/* placed events (places.js): meetEvent(id, ctx) puts the event in the world, walks up to it and presses E (or just walks close
   for the dead and hazards). Returns {placed, at, kind, label, dlg, mg, mom, state}. placedNow() lists what stands in the world. */
window.placedNow = () => Places.live.map(e => ({ id: e.id, state: e.state, src: e.src, home: e.home || null, x: +e.x.toFixed(1), y: +e.y.toFixed(1), actors: e.actors.length, props: e.props.length }));
window.meetEvent = (id, ctx) => {
  unblock(); const ev = Places.spawn(id, ctx); if (!ev) return { placed: false };
  const out = { placed: true, at: [+ev.x.toFixed(1), +ev.y.toFixed(1)], kind: ev.spec.at, d0: +Math.hypot(ev.x - G.p.x, ev.y - G.p.y).toFixed(1) };
  sim(0.6); /* gate visitors walk up first */
  for (let i = 0; i < 20 && ev.arrive; i++) sim(0.5);
  if (ev.spec.engage !== 'E') { const pts = path(ev.x, ev.y); if (pts) go(pts, Math.max(0.5, ev.spec.r - 1.5), 40); sim(0.4); }
  else {
    const tx = ev.actors.length ? ev.actors[0].x : ev.x, ty = ev.actors.length ? ev.actors[0].y : ev.y;
    const sides = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([a, b]) => [tx + a * 0.9, ty + b * 0.9]).filter(([x, y]) => !solidAt(x, y) && path(x, y));
    sides.sort((a, b) => Math.hypot(a[0] - G.p.x, a[1] - G.p.y) - Math.hypot(b[0] - G.p.x, b[1] - G.p.y));
    if (sides[0]) goto(sides[0][0], sides[0][1], 0.3, 60);
    sim(0.3); const t = interactTarget(); out.label = t && t.label;
    kd('KeyE'); ku('KeyE'); sim(0.3);
  }
  Object.assign(out, { dlg: !!UI.state.dlg, mg: !!UI.state.mg, mom: Moments.active, state: ev.state });
  return out;
};
/* what a new player sees, in order: noteStart() then play; notesLog holds "D1 07:12 KIND: text" lines for objectives (with their
   how line), prompts, hints, banners, dialogues, toasts and panels. Polled every other simulated frame (and by noteTick()). */
window.noteStart = () => { window.notesLog = []; window.__nl = {}; window.__noting = true; noteTick(); };
window.noteTick = () => {
  if (!G || !window.notesLog) return;
  const pad = n => String(n).padStart(2, '0'), T = `D${G.day} ${pad(G.hour)}:${pad(Math.floor(G.minute))}`, txt = e => e ? e.innerText.replace(/\s+/g, ' ').trim() : '';
  const chk = (k, v) => { if (v && __nl[k] !== v) notesLog.push(`${T} ${k}: ${v}`); __nl[k] = v; };
  /* what the HUD shows (touch wording included), not the engine's text */
  const ob = document.getElementById('obj'), oh = document.getElementById('objhow');
  chk('OBJ', ob.hidden ? '' : txt(ob.querySelector('.tx')) + (oh && !oh.hidden && txt(oh) ? '  [how: ' + txt(oh) + ']' : '  [no how]'));
  const pr = document.getElementById('prompt'); chk('PROMPT', pr.hidden ? '' : txt(pr));
  const h = document.getElementById('hint'); chk('HINT', h.classList.contains('on') ? txt(h) : '');
  const b = document.getElementById('banner'); chk('BANNER', b.classList.contains('on') ? txt(b) : '');
  const d = document.getElementById('dlg'); chk('DIALOG', d.hidden ? '' : txt(d).slice(0, 110));
  chk('PANEL', UI.state.panel || '');
  for (const t of document.querySelectorAll('#toasts .toast:not([data-seen])')) { t.dataset.seen = 1; notesLog.push(`${T} TOAST: ${txt(t)}`); }
  for (const e of Places.live) if (!e._noted) { e._noted = 1; notesLog.push(`${T} PLACED: ${e.id} (${e.spec.at}${e.home ? ', home' : ''}) ${e.spec.verb || ''}`); }
};
window.safe0 = (f, d) => { try { return f(); } catch (e) { return d; } };
/* followObjective(maxS): a simple player that does what the objective says. Walks to the target; at a building it goes in and
   searches what is there; at a yard outline it holds E; at night it goes home and sleeps. Returns a short log of what it did. */
window.followObjective = (maxS) => {
  const log = []; const t0 = __T;
  for (let k = 0; k < 40 && (__T - t0) / 1000 < (maxS || 600); k++) {
    unblock(10); const o = objectiveInfo(), tg = o.target; if (!tg) { log.push('no target: ' + o.text); break; }
    if (/Sleep|Night/.test(o.text)) { goto(WORLD.hatch.x + 0.5, WORLD.hatch.y + 1.2, 0.5, 120); sim(0.3); kd('KeyE'); ku('KeyE'); sim(0.4); const sb = [...document.querySelectorAll('#pnl button, #pnl .btn')].find(b => /sleep/i.test(b.textContent)); if (sb) sb.click(); sim(0.5); unblock(30); log.push('slept'); continue; }
    if (G.hour >= 19 || G.hour < 6) { G.hour = 21; }
    const path0 = path(tg.x, tg.y + 0.6) ? [tg.x, tg.y + 0.6] : path(tg.x, tg.y) ? [tg.x, tg.y] : null;
    if (!path0) { log.push('no path: ' + o.text); break; }
    goto(path0[0], path0[1], 0.6, 120); unblock(10);
    const t = interactTarget();
    if (t && /^build|bus/.test(t.key) && t.time > 0) { holdE(t.time + 1.5); log.push('built: ' + t.label); continue; }
    if (t && t.time === 0 && /hatch/.test(t.key)) { log.push('home'); sim(1); continue; }
    /* a building: go in and search the nearest full containers in it */
    const bi = buildingAt(tg.x, tg.y - 1.2); let n = 0;
    for (let i = 0; i < 3; i++) { const c = WORLD.containers.filter(q => containerState(q) !== 'empty' && (bi < 0 || buildingAt(q.x + 0.5, q.y + 0.5) === bi)).sort((a, b) => Math.hypot(a.x - G.p.x, a.y - G.p.y) - Math.hypot(b.x - G.p.x, b.y - G.p.y))[0]; if (!c) break; const r = searchNearest(); if (r.ok) n++; if (objectiveInfo().text !== o.text) break; }
    log.push(`searched ${n} for: ${o.text}`);
    if (!n && objectiveInfo().text === o.text) { sim(2); }
  }
  return log;
};
1;
