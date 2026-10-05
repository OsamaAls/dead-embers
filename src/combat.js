/* ===================== COMBAT (skeleton: to be replaced by full real-time combat & AI) ===================== */
const Combat = {
  player: null, enemies: [], drops: [], groups: [], survivors: [], uid: 1, cd: 0, wave: null,
  init() { },
  reset() {
    this.clear();
    this.player = Actors.make('player'); R.scene.add(this.player.root);
  },
  clear() {
    for (const e of this.enemies) e.a.dispose(); for (const d of this.drops) d.mesh.parent && d.mesh.parent.remove(d.mesh);
    this.enemies = []; this.drops = []; this.groups = []; this.wave = null;
    if (this.player) { this.player.dispose(); this.player = null; }
  },
  move(x, y, dx, dy, r) {
    let nx = x + dx, ny = y + dy;
    const hit = (px, py) => solidAt(px - r, py - r) || solidAt(px + r, py - r) || solidAt(px - r, py + r) || solidAt(px + r, py + r);
    if (hit(nx, y)) nx = x; if (hit(nx, ny)) ny = y; return [nx, ny];
  },
  update(dt) {
    const p = G.p;
    const mode = INPUT.crouch ? 'crouch' : (INPUT.sprint && p.sta > 1 ? 'sprint' : 'walk');
    const len = Math.hypot(INPUT.mx, INPUT.my);
    if (len > 0.1) {
      const sp = moveSpeed(mode) * dt, k = Math.min(1, len) / len;
      [p.x, p.y] = this.move(p.x, p.y, INPUT.mx * k * sp, INPUT.my * k * sp, 0.3);
      p.face = Math.atan2(INPUT.mx, INPUT.my);
      if (mode === 'sprint') tire(sprintCost() * dt);
    } else rest(4 * dt);
    this.player.root.position.set(p.x * TILE, 0, p.y * TILE); this.player.root.rotation.y = p.face; this.player.update(dt, len);
    this.cd -= dt;
    if (INPUT.attackPressed && this.cd <= 0) {
      INPUT.attackPressed = false; const prof = weaponProfile(); this.cd = prof.cd; tire(prof.sta);
      SFX.play('swing');
      for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < (prof.reach || prof.rng || 1.2) + 0.4) { this.hurtEnemy(e, playerHitDamage(prof)); if (!prof.ranged) break; }
    }
    for (const e of this.enemies) {
      if (e.dead) { e.a.update(dt, 0); continue; }
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy), E = ENEMIES[e.id];
      if (d > E.reach) { const sp = E.spd * dt / d;[e.x, e.y] = this.move(e.x, e.y, dx * sp, dy * sp, 0.3); }
      else { e.cd -= dt; if (e.cd <= 0) { e.cd = 1.2; enemyHitsPlayer(e.id); } }
      e.a.root.position.set(e.x * TILE, 0, e.y * TILE); e.a.root.rotation.y = Math.atan2(dx, dy); e.a.update(dt, 1);
    }
    for (const gr of this.groups) if (!gr.done && gr.list.every(e => e.dead)) { gr.done = true; const s = gr.opts.onWin && gr.opts.onWin(); if (s) UI.toast(s); }
    this.groups = this.groups.filter(g => !g.done);
    if (this.wave && this.wave.list.every(e => e.dead)) { const w = this.wave; this.wave = null; w.onEnd({ held: true, kills: w.list.length, breaches: 0 }); }
  },
  hurtEnemy(e, n) {
    e.hp -= n; e.a.flash(); UI.dmgNum(e.x, e.y, n);
    if (e.hp <= 0 && !e.dead) { e.dead = true; e.a.die(); for (const d of onKill(e.id)) this.drop(e.x, e.y, d.id, d.qty); }
  },
  spawnAt(id, x, y) { const a = Actors.make(ENEMIES[id].shape === 'dog' ? 'dog' : ENEMIES[id].shape === 'human' ? id : id); R.scene.add(a.root); const e = { id, x, y, hp: ENEMIES[id].hp, a, cd: 1, dead: false }; this.enemies.push(e); return e; },
  freeSpot(cx, cy, rmin, rmax) { for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, r = rmin + Math.random() * (rmax - rmin), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (!solidAt(x, y) && !inShelter(x, y)) return [x, y]; } return [cx + rmax, cy]; },
  spawnFight(ids, opts) { const list = ids.map(id => { const [x, y] = this.freeSpot(G.p.x, G.p.y, 7, 10); return this.spawnAt(id, x, y); }); this.groups.push({ list, opts: opts || {} }); },
  startWave(n, onEnd) { const r = WORLD.shelterRect, list = []; for (let i = 0; i < n; i++) list.push(this.spawnAt(pick(zombieTypes()), r.x0 + Math.random() * 10, r.y1 + 3)); this.wave = { list, onEnd }; },
  noise() { },
  drop(x, y, id, qty) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0xf3a15a, emissive: 0x442200 })); mesh.position.set(x * TILE, 0.3, y * TILE); R.scene.add(mesh); this.drops.push({ uid: this.uid++, x, y, id, qty, mesh }); },
  nearestDrop(x, y, r) { let b = null, bd = r; for (const d of this.drops) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; b = d; } } return b; },
  pickupDrop(d) { UI.toast(pickup(d.id, d.qty), 'loot'); SFX.play('pickup'); R.scene.remove(d.mesh); this.drops.splice(this.drops.indexOf(d), 1); },
  enemiesNear(x, y, r) { return this.enemies.filter(e => !e.dead && Math.hypot(e.x - x, e.y - y) < r); },
  inFight() { return !!this.wave || this.groups.length > 0; },
};
