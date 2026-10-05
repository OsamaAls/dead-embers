/* In-page test harness for Dead Embers (dev only, never bundled). Load in a running page: fetch("tools/harness.js").then(r=>r.text()).then(eval)
   Deterministic frames (20/s via sim), BFS walking (goto), fight/search bots and state(). */
window.__T = 1e6;
/* sim(sec, ctl): run sec seconds of game at 20 fps without drawing (ctl(i) may return 'stop'); the last frame is drawn. */
/* frame() re-queues itself with requestAnimationFrame; stub it while stepping or every simulated frame leaves a real render queued behind. */
window.sim = (sec, ctl) => { const n = Math.round(sec * 20), draw = R.render, raf = window.requestAnimationFrame; R.render = () => { }; window.requestAnimationFrame = () => 0; let i = 0;
  try { for (; i < n; i++) { if (ctl && ctl(i) === 'stop') break; __T += 50; frame(__T); } } finally { R.render = draw; window.requestAnimationFrame = raf; }
  try { R.render(); } catch (e) { } return i / 20; };
window.kd = c => dispatchEvent(new KeyboardEvent('keydown', { code: c })); window.ku = c => dispatchEvent(new KeyboardEvent('keyup', { code: c }));
window.skipDlg = () => { if (UI.blocking()) { kd('Space'); ku('Space'); } };
window.go = (pts, near, maxS) => { let i = 0; const t = sim(maxS || 40, () => { const [tx, ty] = pts[i], p = G.p, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy); skipDlg(); if (d < (i === pts.length - 1 ? near : 0.5)) { i++; if (i >= pts.length) { INPUT.mx = INPUT.my = 0; return 'stop'; } return; } INPUT.mx = dx / d; INPUT.my = dy / d; }); INPUT.mx = INPUT.my = 0; return t; };
window.path = (tx, ty) => { const sx = Math.floor(G.p.x), sy = Math.floor(G.p.y), gx = Math.floor(tx), gy = Math.floor(ty); const prev = new Int32Array(W * H).fill(-1), q = [sy * W + sx]; prev[q[0]] = q[0]; for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i - x) / W; if (x === gx && y === gy) break; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, j = ny * W + nx; if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev[j] >= 0 || SOLID.has(tileAt(nx, ny))) continue; prev[j] = i; q.push(j); } } let i = gy * W + gx; if (prev[i] < 0) return null; const pts = []; while (i !== prev[i]) { const x = i % W; pts.unshift([x + 0.5, (i - x) / W + 0.5]); i = prev[i]; } return pts; };
window.goto = (tx, ty, near, maxS) => { const pts = path(tx, ty); if (!pts) return 'nopath'; pts.push([tx, ty]); return go(pts, near || 0.5, maxS || 60); };
window.clearFoes = () => { for (const e of Combat.enemies.slice()) Combat.despawn && Combat.despawn(e); };
window.fightBot = (ids, gun, maxS) => { if (ids) { clearFoes(); window.__won = 0; window.__lost = 0; fight(ids, { onWin: () => { __won = 1; return 'Won.'; }, onFlee: () => { __lost = 'flee'; return ''; } }); } const cv = document.querySelector('#view canvas'); let swings = 0, minHp = G.p.hp;
  const t = sim(maxS || 40, i => { if (ids && (__won || __lost)) return 'stop'; minHp = Math.min(minHp, G.p.hp); if (UI.blocking()) { skipDlg(); return; } const p = G.p; let b = null, bd = 99; for (const e of Combat.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; b = e; } } if (!b) return ids ? undefined : 'stop'; const s = R.tileToScreen(b.x, b.y, 1); INPUT.aimX = s.x; INPUT.aimY = s.y; INPUT.mouseAim = true;
    const want = gun ? 4.5 : 1.0; if (bd > want + 0.3) { INPUT.mx = (b.x - p.x) / bd; INPUT.my = (b.y - p.y) / bd; } else { INPUT.mx = INPUT.my = 0; }
    if (i % 4 === 0 && bd < (gun ? 7 : 1.7)) { swings++; if (gun) { cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: s.x, clientY: s.y, button: 0, pointerType: 'mouse', bubbles: true })); dispatchEvent(new PointerEvent('pointerup', { clientX: s.x, clientY: s.y, button: 0, pointerType: 'mouse', bubbles: true })); dispatchEvent(new MouseEvent('mouseup')); } else { kd('KeyJ'); ku('KeyJ'); } }
    if (Combat.grabbed && i % 2) { kd('KeyJ'); ku('KeyJ'); } });
  INPUT.mx = INPUT.my = 0; return { won: window.__won, secs: t, swings, minHp: Math.round(minHp), hp: Math.round(G.p.hp), kills: G.stats.kills }; };
window.nearestCont = () => WORLD.containers.filter(c => containerState(c) !== 'empty').sort((a, b) => ((a.x - G.p.x) ** 2 + (a.y - G.p.y) ** 2) - ((b.x - G.p.x) ** 2 + (b.y - G.p.y) ** 2))[0];
window.searchNearest = () => { const c = nearestCont(); const adj = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dx, dy]) => [c.x + dx + 0.5, c.y + dy + 0.5]).find(([x, y]) => !solidAt(x, y)); goto(adj[0], adj[1], 0.3); const s0 = G.stats.searches; kd('KeyE'); const th = sim(10, () => G.stats.searches > s0 ? 'stop' : 0); ku('KeyE'); return { kind: c.kind, ok: G.stats.searches > s0, held: th }; };
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
1;
