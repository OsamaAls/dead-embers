/* ===================== MOMENTS: encounter `play` runner (gameplay instead of choices) =====================
   Moments.start(enc, done(line))  runs enc.play: horde | rescue | screamer | dodge | lock | race | barter (API.md §1).
   Moments.active                  true while a moment runs (main.js holds back further encounters).
   Moments.update(dt)              per frame while the game is unpaused.
   Added: Moments.abort()          ends the current moment silently (title, end screen, death).
          Moments.target           {x, y, label} the HUD compass/marker points at while a moment runs (else null).
   Calls into Combat / Actors / R / World3D are guarded: those layers may be mid-rewrite. */
const Moments = (() => {
  const M = { active: false, cur: null, target: null };
  const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
  const has3D = () => typeof THREE !== 'undefined' && typeof R !== 'undefined' && R && R.scene;
  const OPEN = () => new Set([T_GRASS, T_ROAD, T_YARD, T_FIELD, T_RUBBLE, T_BRIDGE, T_DOOR]);

  /* ---------- grid helpers ---------- */
  /* BFS path distance (in tiles) from (x,y) over non-solid tiles; -1 = unreachable */
  function distMap(x, y) {
    const d = new Int16Array(W * H).fill(-1), sx = Math.floor(x), sy = Math.floor(y);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return d;
    const q = [sy * W + sx]; d[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], cx = i % W, cy = (i / W) | 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + a, ny = cy + b; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx; if (d[j] >= 0 || SOLID.has(WORLD.tiles[j])) continue;
        d[j] = d[i] + 1; q.push(j);
      }
    }
    return d;
  }
  const clearAround = (x, y, r) => !solidAt(x, y) && !solidAt(x + r, y) && !solidAt(x - r, y) && !solidAt(x, y + r) && !solidAt(x, y - r);
  /* a walkable spot rmin..rmax tiles from (cx,cy). o: {dm, outdoor, noShelter, maxPath} */
  function spotNear(cx, cy, rmin, rmax, o) {
    o = o || {}; const open = OPEN();
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, r = rmin + Math.random() * (rmax - rmin);
      const x = Math.floor(cx + Math.cos(a) * r) + 0.5, y = Math.floor(cy + Math.sin(a) * r) + 0.5;
      if (x < 1 || y < 1 || x > W - 1 || y > H - 1) continue;
      if (!clearAround(x, y, 0.45)) continue;
      if (typeof districtOpen === 'function' && !districtOpen(biomeAt(x, y))) continue; // never across a closed gate
      if (o.outdoor && !open.has(tileAt(Math.floor(x), Math.floor(y)))) continue;
      if (o.noShelter && inShelter(x, y)) continue;
      if (o.dm) { const pd = o.dm[Math.floor(y) * W + Math.floor(x)]; if (pd < 0 || (o.maxPath && pd > o.maxPath)) continue; }
      return { x, y };
    }
    return null;
  }
  M.spotNear = spotNear; // for the scenario checks
  /* fight() then move the new enemies next to (x,y) if Combat exposes them. Returns the new enemy objects. */
  function spawnNear(ids, x, y, opts, rmin, rmax) {
    const list = typeof Combat !== 'undefined' && Array.isArray(Combat.enemies) ? Combat.enemies : null;
    const before = new Set(list || []);
    fight(ids, opts || {});
    const now = typeof Combat !== 'undefined' && Array.isArray(Combat.enemies) ? Combat.enemies : [];
    const added = now.filter(e => !before.has(e));
    if (x != null) for (const e of added) {
      if (typeof e.x !== 'number') continue;
      const s = spotNear(x, y, rmin || 1.4, rmax || 3.2, {}); if (!s) continue;
      e.x = s.x; e.y = s.y;
      if (e.a && e.a.root) e.a.root.position.set(s.x * TILE, 0, s.y * TILE);
    }
    return added;
  }
  const alive = e => e && !e.dead && !(e.hp <= 0);

  /* ---------- markers (own THREE meshes, removed on finish) ---------- */
  function group() {
    const c = M.cur; if (!has3D() || !c) return null;
    if (!c.grp) { c.grp = new THREE.Group(); c.grp.name = 'moment'; R.scene.add(c.grp); }
    return c.grp;
  }
  function mat(color, op, add) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }); }
  function ring(x, y, r, color, w) {
    const g = group(); if (!g) return null;
    const m = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.01, r * TILE - (w || 0.18)), r * TILE, 48), mat(color, 0.9));
    m.rotation.x = -Math.PI / 2; m.position.set(x * TILE, 0.07, y * TILE); m.renderOrder = 5; g.add(m); return m;
  }
  function disc(x, y, r, color, op) {
    const g = group(); if (!g) return null;
    const m = new THREE.Mesh(new THREE.CircleGeometry(r * TILE, 40), mat(color, op || 0.35));
    m.rotation.x = -Math.PI / 2; m.position.set(x * TILE, 0.06, y * TILE); m.renderOrder = 4; g.add(m); return m;
  }
  function beacon(x, y) {
    const g = group(); if (!g) return null;
    const b = new THREE.Group(); b.position.set(x * TILE, 0, y * TILE);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.8), new THREE.MeshLambertMaterial({ color: 0x5d6b3a }));
    crate.position.y = 0.4; crate.castShadow = true; b.add(crate);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.12, 0.82), new THREE.MeshBasicMaterial({ color: 0xe8742c })); band.position.y = 0.55; b.add(band);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.32, 16, 10, 1, true), mat(0xe8742c, 0.32, true)); beam.position.y = 8; b.add(beam);
    const r = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.75, 40), mat(0xe8742c, 0.8)); r.rotation.x = -Math.PI / 2; r.position.y = 0.07; b.add(r);
    b.userData = { beam, r }; g.add(b); return b;
  }
  function dispose(o) {
    if (!o) return;
    o.traverse && o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => m.dispose()); });
    if (o.parent) o.parent.remove(o);
  }
  function cleanup(c) {
    if (!c) return;
    safe(() => UI.timer(null)); safe(() => UI.momentPrompt(null)); safe(() => UI.worldBar('moment', null));
    if (c.grp) { dispose(c.grp); c.grp = null; }
    if (c.actor) {
      const a = c.actor; c.actor = null;
      setTimeout(() => safe(() => { if (a.dispose) a.dispose(); else if (a.root && a.root.parent) a.root.parent.remove(a.root); }), c.won ? 1600 : 3000);
    }
  }

  /* ---------- lifecycle ---------- */
  function fin(ok, extra) {
    const c = M.cur; if (!c || c.done) return;
    c.done = true; c.won = ok; cleanup(c);
    M.active = false; M.cur = null; M.target = null;
    let line = '';
    try { const f = ok ? c.pl.onWin : c.pl.onLose; const r = f ? f() : ''; line = typeof r === 'string' ? r : ''; } catch (e) { console.warn('moment', c.enc && c.enc.id, e); }
    if (extra && !line) line = extra;
    safe(() => SFX.play(ok ? 'good' : 'bad'));
    try { c.done_(line || ''); } catch (e) { console.warn(e); }
  }
  M.abort = function () {
    const c = M.cur; if (!c) { M.active = false; return; }
    c.done = true; cleanup(c); M.active = false; M.cur = null; M.target = null;
    try { c.done_(''); } catch (e) { }
  };
  M.start = function (enc, done) {
    if (M.cur) M.abort();
    const pl = (enc && enc.play) || {};
    const c = M.cur = { enc, pl, type: pl.type, t: 0, done: false, done_: done || (() => { }) };
    M.active = true; M.target = null;
    const p = G.p;
    try {
      switch (pl.type) {
        case 'horde': {
          const foes = (pl.foes && pl.foes.length ? pl.foes : ['walker', 'walker', 'walker']).filter(id => ENEMIES[id]);
          c.enemies = spawnNear(foes, null, null, { onWin: () => { fin(true); return ''; }, onFlee: () => { fin(false); return ''; }, onLose: () => { M.abort(); return ''; } });
          if (!foes.length) fin(true);
          break;
        }
        case 'rescue': {
          c.who = pl.who || 'Survivor'; c.hp = 100; c.tick = 0;
          const dm = distMap(p.x, p.y);
          const s = spotNear(p.x, p.y, 6, 9, { dm, outdoor: true, noShelter: true, maxPath: 22 }) || spotNear(p.x, p.y, 4, 11, { dm, noShelter: true }) || { x: p.x + 5, y: p.y };
          c.sx = s.x; c.sy = s.y;
          if (typeof Actors !== 'undefined' && Actors.make && has3D()) {
            c.actor = safe(() => Actors.make('survivor'), null);
            if (c.actor && c.actor.root) { R.scene.add(c.actor.root); c.actor.root.position.set(s.x * TILE, 0, s.y * TILE); safe(() => c.actor.anim && c.actor.anim('idle')); }
          }
          c.ring = ring(s.x, s.y, 0.75, 0x9cc46a, 0.12);
          const foes = (pl.foes && pl.foes.length ? pl.foes : ['walker', 'walker', 'walker']).filter(id => ENEMIES[id]);
          c.enemies = spawnNear(foes, s.x, s.y, { onWin: () => { c.cleared = true; return ''; }, onFlee: () => '', onLose: () => { M.abort(); return ''; } }, 1.6, 3.4);
          if (!foes.length) c.cleared = true;
          M.target = { x: s.x, y: s.y, label: `Save ${c.who}` };
          UI.hint(`Clear the dead around ${c.who}.`);
          break;
        }
        case 'screamer': {
          c.time = pl.time || 6;
          const dm = distMap(p.x, p.y);
          const s = spotNear(p.x, p.y, 7, 9, { dm, noShelter: true, maxPath: 16 });
          c.enemies = spawnNear(['screamer'], s ? s.x : null, s ? s.y : null, { onWin: () => { fin(true); return ''; }, onFlee: () => '', onLose: () => { M.abort(); return ''; } }, 0, 0.6);
          c.scr = c.enemies[0] || null; c.sx = s ? s.x : p.x; c.sy = s ? s.y : p.y;
          c.ring = ring(c.sx, c.sy, 0.9, 0xcf3b2c, 0.16);
          UI.timer('Silence it', c.time);
          M.target = { x: c.sx, y: c.sy, label: 'Silence the screamer' };
          safe(() => SFX.play('groan'));
          break;
        }
        case 'dodge': {
          c.waves = pl.waves || 4; c.dmg = pl.dmg || [6, 12]; c.hits = 0; c.wave = 0; c.next = 0.9; c.rings = [];
          UI.hint('The floor is giving way. Stay out of the red.');
          safe(() => R.shake && R.shake(0.25));
          break;
        }
        case 'lock': {
          UI.lockpick({ mode: pl.mode || 'pick', diff: pl.diff || 4 }, ok => {
            if (!ok) {
              addNoise(2); safe(() => Combat.noise && Combat.noise(G.p.x, G.p.y, 10));
              if (chance(0.5)) fight(['walker', 'walker']);
            }
            fin(ok);
          });
          break;
        }
        case 'race': {
          c.time = pl.time || 40; c.hold = 0;
          const dm = distMap(p.x, p.y);
          const s = spotNear(p.x, p.y, 15, 25, { dm, outdoor: true, noShelter: true, maxPath: 42 }) || spotNear(p.x, p.y, 10, 25, { dm, noShelter: true }) || spotNear(p.x, p.y, 5, 14, { dm }) || { x: p.x + 6, y: p.y };
          c.mx = s.x; c.my = s.y; c.bc = beacon(s.x, s.y);
          c.foes = (pl.foes && pl.foes.length ? pl.foes : ['walker', 'walker', 'runner']).filter(id => ENEMIES[id]);
          c.spawnEvery = (c.time * 0.6) / Math.max(1, c.foes.length); c.spawnT = 2;
          UI.timer('Reach the drop', c.time);
          M.target = { x: s.x, y: s.y, label: 'Reach the supply drop' };
          break;
        }
        case 'barter': {
          UI.barter(pl.stock || null, () => fin(true));
          break;
        }
        default: fin(true);
      }
    } catch (e) { console.warn('moment start', enc && enc.id, e); if (M.cur === c) fin(false); }
  };

  M.update = function (dt) {
    const c = M.cur; if (!c || c.done) return;
    if (!G || G.p.hp <= 0 || (typeof Game !== 'undefined' && Game.dead)) { M.abort(); return; }
    c.t += dt;
    const p = G.p;
    try {
      if (c.type === 'horde') {
        if (c.t > 3 && typeof Combat !== 'undefined' && Combat.inFight && !Combat.inFight()) fin(true);
        else if (c.enemies && c.enemies.length && c.t > 1 && c.enemies.every(e => !alive(e))) fin(true);
      } else if (c.type === 'rescue') {
        const a = c.actor;
        if (!c.cleared) {
          if (c.enemies && c.enemies.length && c.t > 1 && c.enemies.every(e => !alive(e))) c.cleared = true;
          c.tick += dt;
          if (c.tick >= 1) {
            c.tick = 0;
            const n = typeof Combat !== 'undefined' && Combat.enemiesNear ? safe(() => Combat.enemiesNear(c.sx, c.sy, 2).length, 0) : 0;
            if (n) { c.hp -= n * rnd(2, 4); safe(() => { a && a.flash && a.flash(); a && a.anim && a.anim('hit'); }); }
            if (c.hp <= 0) { c.hp = 0; safe(() => a && a.die && a.die()); UI.worldBar('moment', null); fin(false, `${c.who} is gone.`); return; }
          }
          if (c.cleared) { M.target = { x: c.sx, y: c.sy, label: `Reach ${c.who}` }; UI.hint(`Clear. Get to ${c.who}.`); }
        } else {
          if (a && a.root) { a.root.rotation.y = Math.atan2(p.x - c.sx, p.y - c.sy); }
          if (Math.hypot(p.x - c.sx, p.y - c.sy) < 1.5) { safe(() => a && a.anim && a.anim('walk')); fin(true); return; }
        }
        UI.worldBar('moment', c.sx, c.sy, c.hp / 100, c.who);
        if (c.ring) { const k = 1 + Math.sin(c.t * 4) * 0.08; c.ring.scale.set(k, k, k); }
      } else if (c.type === 'screamer') {
        const s = c.scr;
        if (s && typeof s.x === 'number') { c.sx = s.x; c.sy = s.y; if (c.ring) c.ring.position.set(s.x * TILE, 0.07, s.y * TILE); M.target = { x: s.x, y: s.y, label: 'Silence the screamer' }; }
        if (c.ring) { const k = 1 + Math.sin(c.t * 9) * 0.12; c.ring.scale.set(k, k, k); }
        if (s && !alive(s) && c.t > 0.3) { fin(true); return; }
        UI.timer('Silence it', Math.max(0, c.time - c.t));
        if (c.t >= c.time) {
          safe(() => SFX.play('scream')); addNoise(3);
          safe(() => Combat.noise && Combat.noise(c.sx, c.sy, 16)); safe(() => R.shake && R.shake(0.35));
          safe(() => s && s.a && s.a.anim && s.a.anim('scream'));
          fight((c.pl.extra && c.pl.extra.length ? c.pl.extra : ['walker', 'walker', 'walker']).filter(id => ENEMIES[id]));
          UI.banner('The shriek', 'Every dead thing nearby heard that.');
          fin(false);
        }
      } else if (c.type === 'dodge') {
        if (c.wave < c.waves && c.t >= c.next) {
          c.wave++; c.next = c.t + 2.0;
          const n = 2 + (c.wave > 2 ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const off = i === 0 ? 0.7 : 3.2, a = Math.random() * Math.PI * 2, rr = Math.random() * off;
            const x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr, r = 1.25 + Math.random() * 0.6;
            c.rings.push({ x, y, r, t: 0, out: ring(x, y, r, 0xcf3b2c, 0.14), fill: disc(x, y, r, 0xcf3b2c, 0.3) });
          }
          safe(() => SFX.play('open'));
        }
        for (const g of c.rings) {
          if (g.gone) continue;
          g.t += dt;
          if (!g.dropped) {
            const k = Math.min(1, g.t / 1.2);
            if (g.fill) { g.fill.scale.set(Math.max(0.05, k), Math.max(0.05, k), 1); g.fill.material.opacity = 0.2 + k * 0.35; }
            if (g.out) g.out.material.opacity = 0.5 + Math.sin(g.t * 18) * 0.4;
            if (g.t >= 1.2) {
              g.dropped = true; g.t = 0;
              safe(() => R.shake && R.shake(0.4)); safe(() => SFX.play('hit'));
              if (g.fill) { g.fill.material.color.setHex(0x8a8071); g.fill.material.opacity = 0.55; }
              if (g.out) g.out.material.color.setHex(0xb8ab98);
              if (Math.hypot(p.x - g.x, p.y - g.y) < g.r) {
                c.hits++; hurt(rnd(c.dmg[0], c.dmg[1]), 'a collapsing floor');
                safe(() => UI.dmgNum(p.x, p.y, 'Hit', 'hurt'));
                if (G.p.hp <= 0) { M.abort(); return; }
                if (c.hits >= 2) { fin(false); return; }
              }
            }
          } else {
            const k = 1 + g.t * 0.8;
            if (g.out) { g.out.scale.set(k, k, 1); g.out.material.opacity = Math.max(0, 0.8 - g.t * 1.6); }
            if (g.fill) g.fill.material.opacity = Math.max(0, 0.55 - g.t * 1.1);
            if (g.t > 0.6) { g.gone = true; dispose(g.out); dispose(g.fill); }
          }
        }
        if (c.wave >= c.waves && c.rings.every(g => g.gone)) fin(true);
      } else if (c.type === 'race') {
        if (c.bc) { const u = c.bc.userData; u.beam.material.opacity = 0.24 + Math.sin(c.t * 4) * 0.1; const k = 1 + (c.t % 1.2) * 0.25; u.r.scale.set(k, k, 1); u.r.material.opacity = Math.max(0, 0.9 - (c.t % 1.2) * 0.7); }
        UI.timer('Reach the drop', Math.max(0, c.time - c.t));
        c.spawnT -= dt;
        if (c.foes.length && c.spawnT <= 0) { c.spawnT = c.spawnEvery; const id = c.foes.shift(); spawnNear([id], c.mx, c.my, { noFlee: true }, 4, 7); }
        const d = Math.hypot(p.x - c.mx, p.y - c.my);
        if (d < 1.7) {
          if (INPUT.interact) c.hold += dt; else c.hold = Math.max(0, c.hold - dt * 1.5);
          UI.momentPrompt('Hold E  Grab the supplies', c.hold / 2);
          if (c.hold >= 2) { safe(() => SFX.play('pickup')); fin(true); return; }
        } else { c.hold = 0; UI.momentPrompt(null); }
        if (c.t >= c.time) { UI.banner('Too late', 'The drop is swarmed.'); fin(false); }
      }
    } catch (e) { console.warn('moment update', c.enc && c.enc.id, e); fin(false); }
  };
  return M;
})();
