/* ===================== COMBAT: player controller, enemy AI, fights, ambient population, horde waves, survivors, drops =====================
   Public (API.md §3): init, reset, update(dt), player, enemies, drops, survivors, spawnFight(ids, opts), startWave(count, onEnd), noise(x,y,r),
     drop(x,y,id,qty), nearestDrop(x,y,r), pickupDrop(d), enemiesNear(x,y,r), inFight(), clear().
   UI-facing state: grabbed (bool), grabNeed/grabMash (mash progress), dodging (bool), barricadeHp/barricadeMax (0/0 when no wave),
     aware (alive enemies currently chasing), threat (0..1: highest awareness of a nearby enemy), wave ({total,spawned,kills,breaches,...}|null).
   Extras: spawnAt(id, x, y, {aware, screamTime}) → enemy; spawnFight opts may also carry screamTime (seconds before a screamer shrieks)
     and at:{x,y} (spawn around that point instead of the player). kill(e), despawn(e), hurtEnemy(e, n, opts).
   Enemy object: {uid,id,x,y,hp,maxHp,state('wander'|'sus'|'chase'|'search'|'scream'|'siege'),aware,dead,a(actor)}.
   Coordinates are tiles; the actor root sits at (x*TILE, 0, y*TILE). Everything uses dt (main clamps it to 0.05). */
const Combat = (function () {
  const C = {
    player: null, enemies: [], drops: [], groups: [], survivors: [], aware: [], wave: null,
    grabbed: false, grabNeed: 0, grabMash: 0, dodging: false, barricadeHp: 0, barricadeMax: 0, threat: 0, uid: 1,
  };
  const AUTO_CATS = { food: 1, water: 1, ammo: 1, mat: 1, med: 1, misc: 1 };
  const TELE = { walker: 0.45, runner: 0.3, bloater: 0.55, screamer: 0.4, brute: 0.62, zdog: 0.28 };
  const HUMAN_TELE = 0.35;
  /* ---------- small helpers ---------- */
  const has = (o, k) => o && typeof o[k] === 'function';
  const toast = (t, c) => { if (t && typeof UI !== 'undefined' && has(UI, 'toast')) UI.toast(t, c); };
  const sfx = n => { if (typeof SFX !== 'undefined' && has(SFX, 'play')) try { SFX.play(n); } catch (e) { } };
  const num = (x, y, t, c) => { if (typeof UI !== 'undefined' && has(UI, 'dmgNum')) try { UI.dmgNum(x, y, t, c); } catch (e) { } };
  const shake = a => { if (typeof R !== 'undefined' && has(R, 'shake')) R.shake(a); };
  const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  const turn = (a, b, max) => { const d = angDiff(a, b); return a + Math.max(-max, Math.min(max, d)); };
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const rand = (a, b) => a + Math.random() * (b - a);
  const hitR = (x, y, r) => solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r);
  function move(x, y, dx, dy, r, block) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.2)); dx /= steps; dy /= steps;
    for (let i = 0; i < steps; i++) {
      let nx = x + dx, ny = y;
      if (hitR(nx, ny, r) || (block && block(nx, ny))) nx = x;
      ny = y + dy;
      if (hitR(nx, ny, r) || (block && block(nx, ny))) ny = y;
      x = nx; y = ny;
    }
    return [x, y];
  }
  function los(x0, y0, x1, y1) {
    const d = dist(x0, y0, x1, y1), n = Math.ceil(d / 0.3);
    for (let i = 1; i < n; i++) { const f = i / n; if (solidAt(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f)) return false; }
    return true;
  }
  const onScreen = (x, y) => { try { return !!(typeof R !== 'undefined' && R.camera && has(R, 'tileToScreen') && R.tileToScreen(x, y, 1).on); } catch (e) { return false; } };
  const tNow = () => G.day * 24 + G.hour + G.minute / 60;

  /* ---------- flow field from the player (BFS over walkable tiles) ---------- */
  const FMAX = 46;
  let flow = null, flowKey = '', flowT = 0, fq = null;
  function flowUpdate(force) {
    const px = Math.floor(G.p.x), py = Math.floor(G.p.y), key = px + ',' + py;
    if (!force && key === flowKey) return;
    flowKey = key;
    if (!flow) { flow = new Int16Array(W * H); fq = new Int32Array(W * H); }
    flow.fill(-1);
    if (px < 0 || py < 0 || px >= W || py >= H) return;
    let h = 0, t = 0; flow[py * W + px] = 0; fq[t++] = py * W + px;
    while (h < t) {
      const i = fq[h++], x = i % W, y = (i / W) | 0, d = flow[i];
      if (d >= FMAX) continue;
      if (x > 0) { const j = i - 1; if (flow[j] < 0 && !SOLID.has(WORLD.tiles[j])) { flow[j] = d + 1; fq[t++] = j; } }
      if (x < W - 1) { const j = i + 1; if (flow[j] < 0 && !SOLID.has(WORLD.tiles[j])) { flow[j] = d + 1; fq[t++] = j; } }
      if (y > 0) { const j = i - W; if (flow[j] < 0 && !SOLID.has(WORLD.tiles[j])) { flow[j] = d + 1; fq[t++] = j; } }
      if (y < H - 1) { const j = i + W; if (flow[j] < 0 && !SOLID.has(WORLD.tiles[j])) { flow[j] = d + 1; fq[t++] = j; } }
    }
  }
  const flowAt = (x, y) => { const fx = Math.floor(x), fy = Math.floor(y); if (!flow || fx < 0 || fy < 0 || fx >= W || fy >= H) return -1; return flow[fy * W + fx]; };
  function flowStep(x, y) {
    const fx = Math.floor(x), fy = Math.floor(y), d0 = flowAt(x, y);
    if (d0 <= 0) return null;
    let best = null, bd = d0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = fx + ox, ny = fy + oy, d = flowAt(nx, ny);
      if (d < 0 || d >= bd) continue;
      if (ox && oy && (solidAt(fx + ox, fy) || solidAt(fx, fy + oy))) continue;
      bd = d; best = { x: nx + 0.5, y: ny + 0.5 };
    }
    return best;
  }

  /* ---------- FX: tracers, muzzle flashes, gas clouds ---------- */
  let FXM = null, light = null;
  const fx = [], gas = [];
  function fxMats() {
    if (FXM) return FXM;
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.3, 'rgba(255,190,80,0.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const tg = new THREE.BoxGeometry(0.06, 0.06, 1); tg.translate(0, 0, 0.5);
    FXM = {
      tracerGeo: tg,
      tracer: new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      tracerE: new THREE.MeshBasicMaterial({ color: 0xff7a50, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      flash: new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }),
      gasGeo: new THREE.IcosahedronGeometry(1, 1),
      ring: (() => { const g = new THREE.RingGeometry(0.85, 1, 24); g.rotateX(-Math.PI / 2); return g; })(),
    };
    return FXM;
  }
  function addFx(obj, life) { R.scene.add(obj); fx.push({ obj, t: 0, life }); }
  function tracer(x0, y0, h0, x1, y1, h1, enemy) {
    const M = fxMats(), m = new THREE.Mesh(M.tracerGeo, enemy ? M.tracerE : M.tracer);
    const a = new THREE.Vector3(x0 * TILE, h0, y0 * TILE), b = new THREE.Vector3(x1 * TILE, h1, y1 * TILE);
    m.position.copy(a); m.scale.set(1, 1, Math.max(0.01, a.distanceTo(b))); m.lookAt(b); addFx(m, 0.07);
  }
  function muzzle(x, y, h, big) {
    const s = new THREE.Sprite(fxMats().flash); s.position.set(x * TILE, h, y * TILE); s.scale.setScalar(big ? 1.6 : 1.0); addFx(s, 0.06);
    if (light) { light.position.set(x * TILE, h + 0.3, y * TILE); light.intensity = big ? 90 : 55; }
  }
  function gasCloud(x, y) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x9cc040, transparent: true, opacity: 0.0, depthWrite: false });
    const m = new THREE.Mesh(fxMats().gasGeo, mat); m.position.set(x * TILE, 0.6, y * TILE); m.scale.set(0.1, 0.05, 0.1); R.scene.add(m);
    gas.push({ x, y, t: 0, life: 4, r: 1.8, m, mat, tick: 0, sick: false });
    sfx('hit'); shake(0.15);
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; if (f.t >= f.life) { f.obj.parent && f.obj.parent.remove(f.obj); fx.splice(i, 1); } }
    if (light && light.intensity > 0) light.intensity = Math.max(0, light.intensity - dt * 1400);
    const p = G.p;
    for (let i = gas.length - 1; i >= 0; i--) {
      const g = gas[i]; g.t += dt;
      const grow = Math.min(1, g.t / 0.5), fade = g.t > g.life - 1 ? Math.max(0, g.life - g.t) : 1, R_ = g.r * TILE * (0.4 + 0.6 * grow);
      g.m.scale.set(R_, R_ * 0.45, R_); g.m.rotation.y += dt * 0.4; g.mat.opacity = 0.38 * fade * grow;
      if (g.t < g.life && dist(p.x, p.y, g.x, g.y) < g.r && p.hp > 0) {
        g.tick -= dt;
        if (g.tick <= 0) { g.tick = 0.5; hurt(1, 'bloater gas'); num(p.x, p.y, '1', 'hurt'); }
        if (!g.sick) { g.sick = true; if (Math.random() < 0.3) { setStatus('sick', 6); toast('The gas gets in your lungs. You feel sick.', 'bad'); } }
      }
      if (g.t >= g.life) { g.m.parent && g.m.parent.remove(g.m); g.mat.dispose(); gas.splice(i, 1); }
    }
  }

  /* ---------- player ---------- */
  const PS = { swing: null, cd: 0, dodge: null, kx: 0, ky: 0, staDelay: 0, winded: false, noiseT: 0, noAmmoTold: false, grabBy: null, grabTick: 0, grabT: 0, hitStop: 0, buf: 0, lastProf: undefined, tiredT: 0 };
  function aimAngle(prof) {
    const p = G.p;
    if (INPUT.touch) {
      const rng = prof.ranged ? (prof.rng || 8) : (prof.reach || 1) + 3;
      let best = null, bd = rng;
      for (const e of C.enemies) { if (e.dead) continue; const d = dist(p.x, p.y, e.x, e.y); if (d < bd && los(p.x, p.y, e.x, e.y)) { bd = d; best = e; } }
      return best ? Math.atan2(best.x - p.x, best.y - p.y) : null;
    }
    if (INPUT.aimX != null && typeof R !== 'undefined' && has(R, 'screenToTile')) {
      const t = R.screenToTile(INPUT.aimX, INPUT.aimY);
      if (t && dist(t.x, t.y, p.x, p.y) > 0.15) return Math.atan2(t.x - p.x, t.y - p.y);
    }
    return null;
  }
  function updatePlayer(dt) {
    const p = G.p, pl = C.player;
    let mx = INPUT.mx || 0, my = INPUT.my || 0; const len0 = Math.hypot(mx, my);
    if (len0 > 1) { mx /= len0; my /= len0; }
    const len = Math.min(1, len0);
    const prof = weaponProfile();
    if (prof.id !== PS.lastProf) { PS.lastProf = prof.id; pl.setCarry(prof.id); }
    pl.aiming = !!prof.ranged;
    if (prof.ranged) hintOnce('gun', 'Mouse aims. Gunfire draws them.');
    PS.cd -= dt; PS.staDelay -= dt; PS.tiredT -= dt;
    if (INPUT.attackPressed) { PS.buf = 0.25; INPUT.attackPressed = false; if (C.grabbed) C.grabMash++; }
    else PS.buf -= dt;
    if (C.grabbed) {
      if (INPUT.interactPressed) { INPUT.interactPressed = false; C.grabMash++; }
      if (INPUT.dodgePressed) { INPUT.dodgePressed = false; C.grabMash++; }
      PS.buf = 0; updateGrab(dt); mx = my = 0;
    }
    /* dodge roll */
    if (INPUT.dodgePressed) {
      INPUT.dodgePressed = false;
      if (!PS.dodge && !C.grabbed) {
        if (p.sta >= DODGE_COST) {
          tire(DODGE_COST); PS.staDelay = 0.8;
          const dx = len > 0.1 ? mx / len : Math.sin(p.face || 0), dy = len > 0.1 ? my / len : Math.cos(p.face || 0);
          PS.dodge = { t: 0, dx, dy }; PS.swing = null; pl.anim('roll'); sfx('step');
        } else if (PS.tiredT <= 0) { PS.tiredT = 1.2; num(p.x, p.y, 'Too tired', 'info'); }
      }
    }
    /* movement */
    let speed = 0, mode = 'walk';
    if (PS.dodge) {
      const d = PS.dodge; d.t += dt; const f = d.t / 0.36, v = 9.5 * Math.max(0.2, 1 - f * f);
      const [nx, ny] = move(p.x, p.y, d.dx * v * dt, d.dy * v * dt, 0.3); speed = dist(nx, ny, p.x, p.y) / Math.max(dt, 1e-4); p.x = nx; p.y = ny;
      p.face = Math.atan2(d.dx, d.dy);
      if (d.t >= 0.36) PS.dodge = null;
    } else if (!C.grabbed) {
      if (p.sta <= 0.5) PS.winded = true; else if (p.sta > 12) PS.winded = false;
      const sprint = INPUT.sprint && !INPUT.crouch && len > 0.1 && !PS.winded;
      mode = INPUT.crouch ? 'crouch' : (sprint ? 'sprint' : 'walk');
      if (len > 0.1) {
        let sp = moveSpeed(mode) * len;
        if (PS.swing) sp *= 0.45;
        const [nx, ny] = move(p.x, p.y, mx / len * sp * dt, my / len * sp * dt, 0.3);
        speed = dist(nx, ny, p.x, p.y) / Math.max(dt, 1e-4); p.x = nx; p.y = ny;
        if (mode === 'sprint') {
          tire(sprintCost() * dt); PS.staDelay = 0.6; PS.noiseT -= dt;
          if (PS.noiseT <= 0) { PS.noiseT = 0.5; C.noise(p.x, p.y, 5.5, true); }
        }
      }
    }
    C.dodging = !!(PS.dodge && PS.dodge.t < 0.32);
    /* knockback (brute hits) */
    if (Math.abs(PS.kx) + Math.abs(PS.ky) > 0.01) {
      [p.x, p.y] = move(p.x, p.y, PS.kx * dt, PS.ky * dt, 0.3);
      const k = Math.exp(-7 * dt); PS.kx *= k; PS.ky *= k;
    }
    /* stamina regen */
    if (PS.staDelay <= 0 && mode !== 'sprint' && !PS.swing) rest((speed > 0.2 ? 7 : 12) * dt);
    /* facing */
    const aim = (prof.ranged || PS.buf > 0 || INPUT.attack || PS.swing) ? aimAngle(prof) : null;
    let want = p.face || 0;
    if (PS.dodge) want = p.face;
    else if (C.grabbed && PS.grabBy) want = Math.atan2(PS.grabBy.x - p.x, PS.grabBy.y - p.y);
    else if (PS.swing && PS.swing.face != null) want = PS.swing.face;
    else if (prof.ranged && aim != null) want = aim;
    else if (len > 0.1) want = Math.atan2(mx, my);
    p.face = turn(p.face || 0, want, dt * 16);
    /* attacks */
    if (!C.grabbed && !PS.dodge && PS.cd <= 0 && !PS.swing && (PS.buf > 0 || INPUT.attack)) {
      PS.buf = 0;
      const face = aim != null ? aim : (p.face || 0);
      if (prof.ranged) fireGun(prof, face);
      else {
        tire(prof.sta || 3); PS.staDelay = 0.8;
        PS.swing = { t: 0, wind: prof.wind || 0.15, prof, face, done: false };
        PS.cd = (prof.wind || 0.15) + (prof.cd || 0.45);
        p.face = face; pl.anim('attack', { wind: prof.wind || 0.15 });
      }
    }
    if (PS.swing) {
      const s = PS.swing; s.t += dt;
      if (!s.done && s.t >= s.wind) { s.done = true; sfx('swing'); meleeHit(s.prof, s.face); }
      if (s.t >= s.wind + 0.18) PS.swing = null;
    }
    /* actor */
    if (!PS.dodge && !C.grabbed) pl.anim(mode === 'crouch' ? 'crouch' : mode === 'sprint' ? 'run' : 'walk');
    pl.root.position.set(p.x * TILE, 0, p.y * TILE); pl.root.rotation.y = p.face;
    pl.update(dt, speed);
  }
  function meleeHit(prof, face) {
    const p = G.p, reach = prof.reach || 1, arc = prof.arc || 1.4;
    const hits = [];
    for (const e of C.enemies) {
      if (e.dead) continue;
      const d = dist(p.x, p.y, e.x, e.y); if (d > reach + e.r + 0.3) continue;
      const da = Math.abs(angDiff(face, Math.atan2(e.x - p.x, e.y - p.y)));
      if (da <= arc / 2 + (d < e.r + 0.45 ? 0.8 : 0.15) && los(p.x, p.y, e.x, e.y)) hits.push([d, e]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    const max = arc >= 1.6 ? 3 : 2;
    hits.slice(0, max).forEach(([d, e], i) => {
      let n = playerHitDamage(prof); if (i > 0) n = Math.max(1, Math.round(n * 0.7));
      const dx = (e.x - p.x) / Math.max(d, 0.01), dy = (e.y - p.y) / Math.max(d, 0.01), kb = (prof.id === 'axe' || prof.id === 'bat' || prof.id === 'pipe') ? 4.5 : 3;
      hurtEnemy(e, n, { kx: dx * kb, ky: dy * kb });
    });
    if (hits.length) { PS.hitStop = 0.05; shake(0.14 + (prof.dmg ? prof.dmg[1] : 4) * 0.01); sfx('hit'); }
  }
  function fireGun(prof, face) {
    const p = G.p;
    if (!useAmmo(prof)) {
      PS.cd = 0.5; sfx('ui');
      if (!PS.noAmmoTold) { PS.noAmmoTold = true; toast('No ammo.', 'warn'); }
      return;
    }
    PS.noAmmoTold = false;
    const pellets = prof.pellets || 1, rng = prof.rng || 8, spread = prof.spread || 0.05;
    const mx0 = p.x + Math.sin(face) * 0.45, my0 = p.y + Math.cos(face) * 0.45, h = 1.35;
    for (let i = 0; i < pellets; i++) {
      const a = face + (Math.random() - 0.5) * 2 * spread * (INPUT.crouch ? 0.7 : 1);
      const r = rayHit(p.x, p.y, a, rng);
      if (r.e) {
        let n = playerHitDamage(prof);
        if (pellets > 1) n = Math.max(1, Math.round(n / pellets * 1.5 * (1 - 0.45 * r.t / rng)));
        hurtEnemy(r.e, n, { kx: Math.sin(a) * (pellets > 1 ? 2.2 : 1.2), ky: Math.cos(a) * (pellets > 1 ? 2.2 : 1.2) });
      }
      tracer(mx0, my0, h, p.x + Math.sin(a) * r.t, p.y + Math.cos(a) * r.t, r.e ? 1.1 : 0.9, false);
    }
    const big = pellets > 1;
    muzzle(mx0, my0, h, big);
    sfx(prof.id === 'shotgun' ? 'shotgun' : 'shoot'); shake(big ? 0.3 : 0.12);
    if (prof.noise) C.noise(p.x, p.y, 6 + prof.noise * 3);
    C.player.anim('shoot');
    PS.cd = (prof.wind || 0) + (prof.cd || 0.4);
    tire(prof.sta || 1);
  }
  /* first enemy along a ray (stops at walls). → {e|null, t} */
  function rayHit(x, y, a, rng) {
    const dx = Math.sin(a), dy = Math.cos(a);
    let wall = rng;
    for (let t = 0.3; t < rng; t += 0.12) if (solidAt(x + dx * t, y + dy * t)) { wall = t; break; }
    let best = null, bt = wall;
    for (const e of C.enemies) {
      if (e.dead) continue;
      const ex = e.x - x, ey = e.y - y, t = ex * dx + ey * dy; if (t < 0 || t > bt) continue;
      const perp = Math.abs(ex * dy - ey * dx); if (perp < e.r + 0.14) { bt = t; best = e; }
    }
    return { e: best, t: best ? bt : wall };
  }
  function updateGrab(dt) {
    const e = PS.grabBy, p = G.p;
    if (!e || e.dead || e.gone) { release(false); return; }
    PS.grabT += dt; PS.grabTick -= dt;
    if (PS.grabTick <= 0) {
      PS.grabTick = 0.85;
      const d = enemyHitsPlayer(e.id, 0.3); num(p.x, p.y, String(d), 'hurt'); C.player.flash(); sfx('hurt');
    }
    if (C.grabMash >= C.grabNeed || PS.grabT > 9) release(true);
  }
  function startGrab(e) {
    C.grabbed = true; PS.grabBy = e; C.grabMash = 0; C.grabNeed = e.id === 'bloater' ? 4 : 5; PS.grabTick = 0.7; PS.grabT = 0;
    PS.swing = null; e.atk = null; e.a.anim('grab'); C.player.anim('held');
    hintOnce('grab', 'Mash attack to break free.'); shake(0.25);
  }
  function release(broke) {
    const e = PS.grabBy, p = G.p;
    C.grabbed = false; PS.grabBy = null; C.grabMash = 0;
    if (C.player) C.player.anim('idle');
    if (e && !e.dead) {
      e.a.anim('walk'); e.cd = 1.4; e.atk = null;
      if (broke) {
        const d = Math.max(0.01, dist(e.x, e.y, p.x, p.y)); e.kx = (e.x - p.x) / d * 5; e.ky = (e.y - p.y) / d * 5; e.stun = 1.0;
        e.a.anim('hit'); sfx('hit'); shake(0.2); num(p.x, p.y, 'Free!', 'info');
      }
    }
  }

  /* ---------- enemies ---------- */
  function kindOf(id) { const E = ENEMIES[id]; if (!E) return 'walker'; if (E.shape === 'human') return id; if (E.shape === 'dog') return 'dog'; return E.shape || id; }
  function spawnAt(id, x, y, o) {
    o = o || {};
    const E = ENEMIES[id]; if (!E) return null;
    const a = Actors.make(kindOf(id)); R.scene.add(a.root);
    if (E.shape === 'human') a.setCarry(E.rng ? (id === 'warden' ? 'shotgun' : 'pistol') : 'pipe');
    const sc = E.scale || 1;
    const e = {
      uid: C.uid++, id, E, x, y, hp: E.hp, maxHp: E.hp, a, r: E.shape === 'dog' ? 0.26 : Math.min(0.42, 0.27 * sc), face: Math.random() * 6.28, faceT: 0,
      state: 'wander', aware: 0, cd: rand(0.4, 1), stun: 0, kx: 0, ky: 0, atk: null, sees: false, percT: Math.random() * 0.12, lastX: x, lastY: y, lostT: 0,
      wT: rand(0, 2), wx: x, wy: y, ix: x, iy: y, susT: 0, alertT: 0, side: Math.random() < 0.5 ? 1 : -1, strafeT: 0, screamed: false, screamT: 0,
      screamTime: o.screamTime || 3, stuckT: 0, detour: 0, group: null, wave: null, ambient: false, dead: false, gone: false, spd: 0,
    };
    e.faceT = e.face;
    C.enemies.push(e);
    if (o.aware) becomeAware(e, true);
    return e;
  }
  function becomeAware(e, quiet) {
    const p = G.p;
    if (e.state !== 'chase' && e.state !== 'scream') e.alertT = 0;
    e.aware = 1; e.lastX = p.x; e.lastY = p.y; e.lostT = 0;
    if (e.E.scream && !e.screamed) { e.state = 'scream'; e.screamT = 0; e.atk = null; }
    else if (e.state !== 'scream' && e.state !== 'siege') e.state = 'chase';
    hintOnce('combat', 'Click or J to attack. Space to dodge.');
    if (!quiet && e.E.z && Math.random() < 0.5) sfx('groan');
  }
  function canSee(e) {
    const p = G.p; if (p.hp <= 0) return false;
    const d = dist(e.x, e.y, p.x, p.y);
    let range = (e.E.sense || 6) * (INPUT.crouch ? 0.5 : 1) * (G.isNight ? 0.78 : 1);
    if (e.state === 'chase' || e.state === 'search') range *= 1.9;
    if (d > range) return false;
    const close = d < (INPUT.crouch ? 1.4 : 2.6);
    if (!close && e.state !== 'chase' && Math.abs(angDiff(e.face, Math.atan2(p.x - e.x, p.y - e.y))) > 1.15) return false;
    return los(e.x, e.y, p.x, p.y);
  }
  /* walk toward (tx,ty); returns the speed actually moved (tiles/s). Slides along walls; detours when stuck. */
  function walkTo(e, tx, ty, spd, dt, block) {
    let dx = tx - e.x, dy = ty - e.y; const L = Math.hypot(dx, dy);
    if (L < 0.05 || spd <= 0) return 0;
    dx /= L; dy /= L;
    if (e.detour > 0) { e.detour -= dt; const px = -dy * e.side, py = dx * e.side; dx = dx * 0.3 + px; dy = dy * 0.3 + py; const l2 = Math.hypot(dx, dy); dx /= l2; dy /= l2; }
    const step = Math.min(L, spd * dt);
    let [nx, ny] = move(e.x, e.y, dx * step, dy * step, e.r, block);
    let moved = dist(nx, ny, e.x, e.y);
    if (moved < step * 0.35) {
      /* slide along one axis first: lets them line up with one-tile gaps instead of jittering at corners */
      const ax = move(e.x, e.y, Math.sign(dx) * step, 0, e.r, block), ay = move(e.x, e.y, 0, Math.sign(dy) * step, e.r, block);
      const mx = Math.abs(dx) > 0.05 ? dist(ax[0], ax[1], e.x, e.y) : 0, my = Math.abs(dy) > 0.05 ? dist(ay[0], ay[1], e.x, e.y) : 0;
      if (Math.max(mx, my) >= step * 0.5) { [nx, ny] = mx >= my ? ax : ay; e.x = nx; e.y = ny; e.stuckT = Math.max(0, e.stuckT - dt); e.faceT = Math.atan2(dx, dy); return step / Math.max(dt, 1e-4); }
      const px = -dy * e.side, py = dx * e.side;
      [nx, ny] = move(e.x, e.y, px * step, py * step, e.r, block);
      moved = dist(nx, ny, e.x, e.y);
      e.stuckT += dt;
      if (e.stuckT > 0.7) { e.stuckT = 0; e.side = -e.side; e.detour = 0.8; }
    } else e.stuckT = Math.max(0, e.stuckT - dt);
    e.x = nx; e.y = ny;
    e.faceT = Math.atan2(dx, dy);
    return moved / Math.max(dt, 1e-4);
  }
  /* path toward the player: direct when visible/close, else follow the flow field, else last known spot */
  function chaseStep(e, spd, dt, block) {
    const p = G.p, d = dist(e.x, e.y, p.x, p.y);
    if (e.sees || d < 1.6) return walkTo(e, p.x, p.y, spd, dt, block);
    const s = flowStep(e.x, e.y);
    if (s) return walkTo(e, s.x, s.y, spd, dt, block);
    return walkTo(e, e.lastX, e.lastY, spd, dt, block);
  }
  function hurtEnemy(e, n, o) {
    if (!e || e.dead) return;
    o = o || {};
    e.hp -= n; e.a.flash(); num(e.x, e.y, String(n), n >= 15 ? 'crit' : 'hit');
    if (o.kx || o.ky) { const m = e.id === 'brute' ? 0.3 : e.id === 'warden' ? 0.5 : 1; e.kx += (o.kx || 0) * m; e.ky += (o.ky || 0) * m; }
    if (e.hp <= 0) { kill(e); return; }
    if (PS.grabBy !== e && (e.id !== 'brute' || n >= 12)) { e.stun = Math.max(e.stun, e.id === 'brute' ? 0.15 : 0.28); if (e.atk && e.atk.phase === 'tele') { e.atk = null; e.cd = 0.5; } e.a.anim('hit'); }
    if (!o.guard) {
      if (e.state === 'scream') { /* keeps shrieking */ } else if (e.state !== 'siege' || dist(e.x, e.y, G.p.x, G.p.y) < 4) becomeAware(e, true);
    }
  }
  function kill(e) {
    if (e.dead) return;
    e.dead = true; e.state = 'dead'; e.atk = null; e.a.die(); e.deadAt = 0;
    if (PS.grabBy === e) release(false);
    if (e.E.z && Math.random() < 0.4) sfx('groan');
    let drops = [];
    try { drops = onKill(e.id) || []; } catch (err) { drops = []; }
    for (const d of drops) {
      let x = e.x + rand(-0.6, 0.6), y = e.y + rand(-0.6, 0.6);
      if (hitR(x, y, 0.15)) { x = e.x; y = e.y; }
      C.drop(x, y, d.id, d.qty, { kill: true });
    }
    if (drops.gas || e.E.gas) gasCloud(e.x, e.y);
    if (e.wave && C.wave === e.wave) e.wave.kills++;
  }
  function despawn(e) { e.gone = true; e.dead = true; e.a.dispose(); const i = C.enemies.indexOf(e); if (i >= 0) C.enemies.splice(i, 1); if (PS.grabBy === e) release(false); }

  function updateEnemy(e, dt) {
    const p = G.p, E = e.E;
    if (e.dead) { e.a.update(dt, 0); return; }
    e.cd -= dt; e.stun -= dt;
    if (Math.abs(e.kx) + Math.abs(e.ky) > 0.02) {
      [e.x, e.y] = move(e.x, e.y, e.kx * dt, e.ky * dt, e.r, waveBlock(e));
      const k = Math.exp(-8 * dt); e.kx *= k; e.ky *= k;
    }
    const d = dist(e.x, e.y, p.x, p.y), toP = Math.atan2(p.x - e.x, p.y - e.y);
    e.percT -= dt;
    if (e.percT <= 0) { e.percT = 0.12; e.sees = canSee(e); }
    /* awareness */
    if (e.state !== 'chase' && e.state !== 'scream' && e.state !== 'siege') {
      if (e.sees) {
        const range = (E.sense || 6) * (INPUT.crouch ? 0.5 : 1);
        const sprinting = INPUT.sprint && Math.hypot(INPUT.mx, INPUT.my) > 0.1 && !INPUT.crouch;
        e.aware += (0.55 + 2.4 * Math.max(0, 1 - d / Math.max(1, range))) * (sprinting ? 1.5 : 1) * (INPUT.crouch ? 0.6 : 1) * dt;
        e.ix = p.x; e.iy = p.y;
        if (e.aware > 0.3 && (e.state === 'wander' || e.state === 'idle')) { e.state = 'sus'; e.susT = 0; hintOnce('crouch', 'C to crouch. They hear sprinting.'); }
      } else e.aware = Math.max(0, e.aware - (e.state === 'sus' ? 0.07 : 0.15) * dt);
      if (e.aware >= 1) becomeAware(e);
    }
    let spd = 0;
    if (e.stun > 0) { /* staggered */ }
    else if (e.state === 'scream') {
      e.screamT += dt; e.a.anim('scream'); e.faceT = toP;
      if (e.screamT >= e.screamTime) shriek(e);
    } else if (e.state === 'siege') spd = siegeStep(e, dt, d);
    else if (e.state === 'chase') {
      if (e.sees) { e.lastX = p.x; e.lastY = p.y; e.lostT = 0; } else e.lostT += dt;
      const tracked = e.group || e.wave;
      if (tracked && !e.sees) { e.lastX = p.x; e.lastY = p.y; }
      if (e.wave && C.wave === e.wave && C.barricadeHp > 0 && !e.inside && inRect(e.wave.rect, p.x, p.y, -0.3) && !e.atk) { e.state = 'siege'; }
      else if (!tracked && (e.lostT > 7 || d > 26)) { e.state = 'search'; e.susT = 0; e.aware = 0.7; }
      else if (E.rng) spd = humanStep(e, dt, d, toP);
      else spd = zombieStep(e, dt, d, toP);
    } else if (e.state === 'search') {
      const dl = dist(e.x, e.y, e.lastX, e.lastY);
      if (dl > 0.6) spd = walkTo(e, e.lastX, e.lastY, (E.spd || 1) * 0.7, dt);
      else { e.susT += dt; e.faceT += dt * 1.2; if (e.susT > 4) { e.state = 'sus'; e.susT = 0; e.aware = 0.5; e.ix = e.x; e.iy = e.y; } }
    } else if (e.state === 'sus') {
      const di = dist(e.x, e.y, e.ix, e.iy);
      if (di > 0.8) { spd = walkTo(e, e.ix, e.iy, (E.spd || 1) * (E.z ? 0.6 : 0.5), dt); }
      else { e.susT += dt; e.faceT += Math.sin(e.susT * 1.3) * dt * 1.5; }
      if (e.aware <= 0.05 || e.susT > 7) { e.state = 'wander'; e.wT = rand(1, 3); }
    } else {
      e.wT -= dt;
      if (e.wT <= 0) {
        e.wT = rand(3, 7);
        if (Math.random() < 0.55) for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28, r = rand(1.5, 5), x = e.x + Math.sin(a) * r, y = e.y + Math.cos(a) * r; if (!hitR(x, y, e.r) && !inShelter(x, y) && los(e.x, e.y, x, y)) { e.wx = x; e.wy = y; break; } }
        else { e.wx = e.x; e.wy = e.y; }
      }
      if (dist(e.x, e.y, e.wx, e.wy) > 0.3) spd = walkTo(e, e.wx, e.wy, (E.spd || 1) * (E.shape === 'dog' ? 0.35 : 0.45), dt);
    }
    /* facing + model */
    const tr = e.atk && e.atk.phase === 'tele' ? 3.2 : (E.shape === 'dog' ? 10 : 6);
    e.face = turn(e.face, e.faceT, tr * dt);
    e.spd = spd;
    if (e.state !== 'scream' && !(PS.grabBy === e)) {
      const run = (e.state === 'chase' || e.state === 'siege') && (e.id === 'runner' || E.shape === 'dog' || (E.shape === 'human' && spd > 1.8));
      e.a.anim(run ? 'run' : 'walk');
    }
    e.a.aiming = !!(E.rng && e.state === 'chase' && e.sees && d < E.rng);
    if (e.state === 'chase' || e.state === 'siege') { e.alertT += dt; e.a.setAware(e.alertT < 2.2 ? 1 : null); }
    else e.a.setAware(e.aware > 0.06 ? Math.min(0.99, e.aware) : null);
    e.a.root.position.set(e.x * TILE, 0, e.y * TILE); e.a.root.rotation.y = e.face;
    e.a.update(dt, spd);
  }
  function zombieStep(e, dt, d, toP) {
    const E = e.E, p = G.p;
    if (PS.grabBy === e) { e.faceT = toP; return 0; }
    if (e.atk) return attackStep(e, dt, d, toP);
    const reach = (E.reach || 0.9) + e.r;
    if (e.cd <= 0 && d < reach + 0.55 && (e.sees || d < 1.2)) {
      e.atk = { phase: 'tele', t: 0, tele: TELE[e.id] || 0.4, hit: false, dx: 0, dy: 0 };
      e.a.anim('attack', { wind: e.atk.tele }); e.faceT = toP;
      return 0;
    }
    if (d < e.r + 0.35) { e.faceT = toP; return 0; }
    const spd = (E.spd || 1) * (e.id === 'runner' ? 1 : 1);
    return chaseStep(e, spd, dt, waveBlock(e));
  }
  function attackStep(e, dt, d, toP) {
    const E = e.E, p = G.p, A = e.atk; A.t += dt;
    if (A.phase === 'tele') {
      e.faceT = toP;
      if (A.t >= A.tele) { A.phase = 'lunge'; A.t = 0; A.dx = Math.sin(e.face); A.dy = Math.cos(e.face); }
      return 0;
    }
    if (A.phase === 'lunge') {
      const v = Math.min(7.5, Math.max(3, (E.spd || 1) * (E.lunge || 2) * 0.9));
      const [nx, ny] = move(e.x, e.y, A.dx * v * dt, A.dy * v * dt, e.r, waveBlock(e));
      const mv = dist(nx, ny, e.x, e.y); e.x = nx; e.y = ny;
      if (!A.hit && dist(e.x, e.y, p.x, p.y) < (E.reach || 0.9) + e.r * 0.6 + 0.3 && Math.abs(angDiff(e.face, Math.atan2(p.x - e.x, p.y - e.y))) < 1.3) { A.hit = true; landHit(e, A); }
      if (A.t >= 0.2) { A.phase = 'rec'; A.t = 0; }
      return mv / Math.max(dt, 1e-4);
    }
    if (A.t >= (e.id === 'brute' ? 0.75 : 0.45)) { e.atk = null; e.cd = rand(0.5, 1.0) + (e.id === 'brute' ? 0.6 : 0); }
    return 0;
  }
  function landHit(e, A) {
    const p = G.p, E = e.E;
    if (C.dodging) { num(p.x, p.y, 'Dodged', 'info'); return; }
    if (p.hp <= 0) return;
    const n = enemyHitsPlayer(e.id, 1);
    num(p.x, p.y, String(n), 'hurt'); C.player.flash(); C.player.anim('hit'); sfx('hurt'); shake(E.knock ? 0.5 : 0.22);
    PS.swing = null;
    if (E.knock) { PS.kx = A.dx * 9; PS.ky = A.dy * 9; tire(8); }
    else if (E.grab && !C.grabbed && p.hp > 0 && Math.random() < E.grab) startGrab(e);
  }
  function humanStep(e, dt, d, toP) {
    const E = e.E, p = G.p;
    if (e.atk && e.atk.melee) return attackStep(e, dt, d, toP);
    if (e.atk) {
      const A = e.atk; A.t += dt; e.faceT = toP;
      if (A.t >= HUMAN_TELE) { e.atk = null; enemyShoot(e, d); e.cd = (E.cd || 1.5) * rand(0.85, 1.35); }
      return 0;
    }
    const reach = (E.reach || 1) + e.r;
    if (e.cd <= 0 && d < reach + 0.4) {
      e.atk = { phase: 'tele', t: 0, tele: HUMAN_TELE, hit: false, dx: 0, dy: 0, melee: true }; e.a.anim('attack', { wind: HUMAN_TELE }); e.faceT = toP; return 0;
    }
    if (e.cd <= 0 && e.sees && d < (E.rng || 8) && d > reach + 0.4) { e.atk = { phase: 'aim', t: 0 }; e.faceT = toP; return 0; }
    const want = (E.rng || 8) * (e.hp < e.maxHp * 0.5 ? 0.8 : 0.6);
    const spd = E.spd || 2;
    if (!e.sees || d > want + 1.5) return chaseStep(e, spd, dt);
    e.strafeT -= dt; if (e.strafeT <= 0) { e.strafeT = rand(1.2, 2.6); e.side = Math.random() < 0.5 ? -1 : 1; }
    const ax = (p.x - e.x) / Math.max(d, 0.01), ay = (p.y - e.y) / Math.max(d, 0.01);
    let mx = -ay * e.side * 0.8, my = ax * e.side * 0.8;
    if (d < want - 1.5) { mx -= ax; my -= ay; }
    const s = walkTo(e, e.x + mx * 2, e.y + my * 2, spd * 0.6, dt);
    e.faceT = toP;
    return s;
  }
  function enemyShoot(e, d) {
    const E = e.E, p = G.p;
    const mx0 = e.x + Math.sin(e.face) * 0.45, my0 = e.y + Math.cos(e.face) * 0.45;
    let hitP = (E.acc || 0.6) * (INPUT.crouch ? 0.85 : 1) * (d > (E.rng || 8) * 0.7 ? 0.75 : 1) * (Math.hypot(INPUT.mx, INPUT.my) > 0.5 ? 0.85 : 1);
    if (C.dodging || !los(e.x, e.y, p.x, p.y)) hitP = 0;
    const big = e.id === 'warden';
    muzzle(mx0, my0, 1.35 * (E.scale || 1), big);
    sfx(big ? 'shotgun' : 'shoot');
    C.noise(e.x, e.y, 10, true);
    if (Math.random() < hitP && p.hp > 0) {
      const n = enemyHitsPlayer(e.id, 1); num(p.x, p.y, String(n), 'hurt'); C.player.flash(); C.player.anim('hit'); shake(0.2); sfx('hurt');
      tracer(mx0, my0, 1.35, p.x, p.y, 1.2, true);
    } else {
      const off = (Math.random() < 0.5 ? -1 : 1) * rand(0.6, 1.2), a = Math.atan2(p.x - e.x, p.y - e.y), L = d + 2;
      tracer(mx0, my0, 1.35, e.x + Math.sin(a) * L + Math.cos(a) * off, e.y + Math.cos(a) * L - Math.sin(a) * off, 0.6, true);
      if (C.dodging) num(p.x, p.y, 'Dodged', 'info');
    }
    e.a.anim('shoot');
  }
  function shriek(e) {
    e.screamed = true; e.state = 'chase'; e.a.anim('walk'); e.alertT = 0;
    sfx('scream'); shake(0.35); addNoise(2);
    C.noise(e.x, e.y, 22);
    toast('The shriek carries for blocks.', 'warn');
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const s = findSpot(e.x, e.y, 7, 12, { offscreen: true, reach: true });
      if (!s) continue;
      const z = spawnAt('walker', s.x, s.y, { aware: true });
      if (z) { z.group = e.group; if (e.group) e.group.list.push(z); z.ambient = !e.group; }
    }
  }

  /* ---------- spawn spot search ---------- */
  function findSpot(cx, cy, rmin, rmax, o) {
    o = o || {}; const p = G.p;
    let best = null, bs = -1e9;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(rmin, rmax), x = cx + Math.sin(a) * r, y = cy + Math.cos(a) * r;
      if (x < 1 || y < 1 || x > W - 1 || y > H - 1 || hitR(x, y, 0.32)) continue;
      if (!o.shelterOK && inShelter(x, y)) continue;
      if (o.outdoors && indoors(x, y)) continue;
      const f = flowAt(x, y);
      if (o.reach && (f < 0 || f > 30)) continue;
      let s = Math.random();
      if (o.avoidView) s += Math.abs(angDiff(p.face || 0, Math.atan2(x - p.x, y - p.y))) / Math.PI * 1.2;
      if (o.offscreen) { if (onScreen(x, y)) s -= 3; if (!los(p.x, p.y, x, y)) s += 0.6; }
      if (f >= 0) s += 0.5;
      if (s > bs) { bs = s; best = { x, y }; }
    }
    return best;
  }

  /* ---------- fights ---------- */
  function finishGroup(gr, key) {
    if (gr.done) return; gr.done = true;
    let s = ''; try { const f = gr.opts[key]; s = f ? f() : ''; } catch (err) { console.warn('fight callback', err); }
    if (s) toast(s);
  }
  function updateGroups() {
    const p = G.p;
    for (const gr of C.groups) {
      if (gr.done) continue;
      const alive = gr.list.filter(e => !e.dead && !e.gone);
      if (!alive.length) finishGroup(gr, 'onWin');
      else if (!gr.opts.noFlee && alive.every(e => dist(e.x, e.y, p.x, p.y) > 18)) { finishGroup(gr, 'onFlee'); alive.forEach(despawn); }
    }
    C.groups = C.groups.filter(g => !g.done);
  }
  let deathDone = false;
  function checkDeath() {
    if (deathDone || !G || G.p.hp > 0) return;
    deathDone = true;
    for (const gr of C.groups) finishGroup(gr, 'onLose');
    C.groups = [];
    if (C.wave) endWave(false);
    if (C.grabbed) release(false);
    if (C.player) C.player.die();
  }

  /* ---------- ambient population ---------- */
  let ambT = 0, ambCd = 0, roomSeen = {}, lastBld = -1;
  function ambientTypes() {
    const t = zombieTypes();
    return t.length ? t : ['walker'];
  }
  function pickType(exclude) {
    const W_ = { walker: 6, runner: 2, zdog: 1.2, screamer: 0.9, bloater: 1, brute: G.isNight ? 0.7 : 0.35 };
    const list = ambientTypes().filter(t => !exclude || !exclude.includes(t));
    return list.length ? wpick(list, t => W_[t] || 1) : 'walker';
  }
  function manageAmbient(dt) {
    ambT -= dt; ambCd -= dt;
    if (ambT > 0) return; ambT = 1;
    const p = G.p;
    const amb = C.enemies.filter(e => e.ambient && !e.dead);
    const night = !!G.isNight, sh = inShelter(p.x, p.y);
    let danger = 1; try { const L = LOCS[districtAt(p.x, p.y)]; danger = L ? (L.danger || 0) : 1; } catch (e) { }
    const noise = G.noise || 0;
    const cap = (night ? 12 : 6) + Math.floor(noise / 3);
    let want = (night ? 4 : 2) + danger * (night ? 1.6 : 0.9) + noise * 0.4;
    if (G.day <= 1 && !night) want = Math.min(want, 3);
    if (sh) want = Math.min(want, night ? 3 : 1);
    if (C.wave) want = 0;
    want = Math.min(cap, Math.round(want));
    /* despawn far, unaware ones */
    for (const e of amb) {
      const d = dist(e.x, e.y, p.x, p.y);
      if ((d > 30 && e.state !== 'chase') || (d > 40)) despawn(e);
      else if (amb.length > want + 2 && d > 18 && (e.state === 'wander' || e.state === 'idle') && !onScreen(e.x, e.y)) { despawn(e); break; }
    }
    const count = C.enemies.filter(e => e.ambient && !e.dead).length;
    if (count < want && ambCd <= 0 && C.enemies.length < 36) {
      ambCd = night ? 2 : 4;
      const id = pickType();
      const s = findSpot(p.x, p.y, 14, 22, { offscreen: true, outdoors: true });
      if (s) {
        const n = id === 'zdog' ? 2 + (Math.random() < 0.4 ? 1 : 0) : 1;
        for (let i = 0; i < n; i++) {
          let x = s.x + rand(-1, 1) * (i ? 1 : 0), y = s.y + rand(-1, 1) * (i ? 1 : 0); if (hitR(x, y, 0.3)) { x = s.x; y = s.y; }
          const e = spawnAt(id, x, y); if (e) e.ambient = true;
        }
      }
    }
    /* a zombie in a room, sometimes */
    const b = buildingAt(p.x, p.y);
    if (b !== lastBld) {
      lastBld = b;
      const rf = b >= 0 ? WORLD.roofs[b] : null;
      if (rf && !rf.closed && !sh && !C.wave) {
        const now = tNow();
        if (roomSeen[b] == null || now - roomSeen[b] >= 12) {
          roomSeen[b] = now;
          let dg = 1; try { dg = (LOCS[rf.type] && LOCS[rf.type].danger) || 1; } catch (e) { }
          if (Math.random() < 0.2 + dg * 0.1 + (night ? 0.1 : 0)) {
            const spots = [];
            for (let y = rf.y + 1; y < rf.y + rf.h - 1; y++) for (let x = rf.x + 1; x < rf.x + rf.w - 1; x++) if (tileAt(x, y) === T_FLOOR && !hitR(x + 0.5, y + 0.5, 0.3) && dist(x + 0.5, y + 0.5, p.x, p.y) > 3.5) spots.push([x + 0.5, y + 0.5]);
            spots.sort((a, c) => (los(p.x, p.y, a[0], a[1]) ? 1 : 0) - (los(p.x, p.y, c[0], c[1]) ? 1 : 0) || Math.random() - 0.5);
            if (spots.length) { const e = spawnAt(pickType(['zdog']), spots[0][0], spots[0][1]); if (e) { e.ambient = true; e.state = 'wander'; e.wT = rand(2, 5); } }
          }
        }
      }
    }
  }

  /* ---------- horde waves ---------- */
  function rectOf() {
    const b = (typeof World3D !== 'undefined' && World3D.barricade) || null;
    if (b && isFinite(b.x0)) return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
    const r = WORLD.shelterRect; return { x0: r.x0, y0: r.y0, x1: r.x1 + 1, y1: r.y1 + 1 };
  }
  const inRect = (r, x, y, m) => x > r.x0 + (m || 0) && x < r.x1 - (m || 0) && y > r.y0 + (m || 0) && y < r.y1 - (m || 0);
  function waveBlock(e) {
    const w = C.wave; if (!e.wave || !w || w !== e.wave || C.barricadeHp <= 0 || e.inside) return null;
    return (x, y) => inRect(w.rect, x, y, -0.15);
  }
  function siegeStep(e, dt, d) {
    const w = e.wave, r = w.rect, p = G.p;
    if (C.barricadeHp <= 0 || e.inside || (!inRect(r, p.x, p.y, -0.3) && d < 5)) { e.state = 'chase'; e.alertT = 3; return zombieStep(e, dt, d, Math.atan2(p.x - e.x, p.y - e.y)); }
    if (e.atk) return attackStep(e, dt, d, Math.atan2(p.x - e.x, p.y - e.y));
    /* nearest point just outside the ring */
    const cx = Math.max(r.x0, Math.min(r.x1, e.x)), cy = Math.max(r.y0, Math.min(r.y1, e.y));
    let tx = cx, ty = cy; const dx0 = Math.min(e.x - r.x0, r.x1 - e.x), dy0 = Math.min(e.y - r.y0, r.y1 - e.y);
    if (e.x < r.x0) tx = r.x0 - 0.5; else if (e.x > r.x1) tx = r.x1 + 0.5;
    if (e.y < r.y0) ty = r.y0 - 0.5; else if (e.y > r.y1) ty = r.y1 + 0.5;
    if (!(e.x < r.x0 || e.x > r.x1 || e.y < r.y0 || e.y > r.y1)) { if (dx0 < dy0) tx = e.x < (r.x0 + r.x1) / 2 ? r.x0 - 0.5 : r.x1 + 0.5; else ty = e.y < (r.y0 + r.y1) / 2 ? r.y0 - 0.5 : r.y1 + 0.5; }
    if (tx === r.x0 - 0.5 || tx === r.x1 + 0.5) ty += (e.off || 0) * 0.6; else tx += (e.off || 0) * 0.6;
    if (dist(e.x, e.y, tx, ty) > 0.45) {
      /* far from the ring: follow the flow field (it routes around buildings toward the player in the yard) */
      const f = dist(e.x, e.y, tx, ty) > 2.5 ? flowStep(e.x, e.y) : null;
      if (f) return walkTo(e, f.x, f.y, e.E.spd || 1, dt, waveBlock(e));
      return walkTo(e, tx, ty, e.E.spd || 1, dt, waveBlock(e));
    }
    e.faceT = Math.atan2(cx - e.x, cy - e.y);
    if (e.cd <= 0) {
      e.cd = rand(1.1, 1.5); e.a.anim('attack', { wind: 0.35 });
      const dmg = ((e.E.dmg[0] + e.E.dmg[1]) / 2) * (e.id === 'brute' ? 2 : 1) * 0.6;
      C.barricadeHp = Math.max(0, C.barricadeHp - dmg);
      if (w.sfxT <= 0) { w.sfxT = 0.5; sfx('hit'); }
    }
    return 0;
  }
  function waveSpawnPoint(r) {
    for (let i = 0; i < 40; i++) {
      const side = (Math.random() * 4) | 0, off = rand(7, 11);
      let x, y;
      if (side === 0) { x = rand(r.x0 - 3, r.x1 + 3); y = r.y0 - off; }
      else if (side === 1) { x = rand(r.x0 - 3, r.x1 + 3); y = r.y1 + off; }
      else if (side === 2) { x = r.x0 - off; y = rand(r.y0 - 3, r.y1 + 3); }
      else { x = r.x1 + off; y = rand(r.y0 - 3, r.y1 + 3); }
      if (x < 1 || y < 1 || x > W - 1 || y > H - 1 || hitR(x, y, 0.35) || indoors(x, y) || flowAt(x, y) < 0) continue;
      return { x, y };
    }
    return { x: r.x0 - 4, y: r.y1 + 4 };
  }
  function updateWave(dt) {
    const w = C.wave; if (!w) return;
    w.t += dt; w.batchT -= dt; w.sfxT -= dt;
    const alive = w.list.filter(e => !e.dead && !e.gone);
    if (w.spawned < w.total && w.batchT <= 0 && alive.length < 18) {
      w.batchT = rand(4, 6);
      const n = Math.min(w.total - w.spawned, 3 + ((Math.random() * 3) | 0));
      const sp = waveSpawnPoint(w.rect);
      for (let i = 0; i < n; i++) {
        let x = sp.x + rand(-1.5, 1.5), y = sp.y + rand(-1.5, 1.5); if (hitR(x, y, 0.35)) { x = sp.x; y = sp.y; }
        const id = Math.random() < 0.7 ? 'walker' : pickType(['zdog']);
        const e = spawnAt(id, x, y); if (!e) continue;
        e.wave = w; e.aware = 1; e.state = 'siege'; e.screamed = true; e.off = rand(-1, 1); e.alertT = 0;
        w.list.push(e); w.spawned++;
      }
    }
    for (const e of alive) {
      const inside = inRect(w.rect, e.x, e.y, 0.2);
      if (inside && !e.inside) { e.inside = true; if (w.breached) w.breaches++; }
    }
    if (C.barricadeHp <= 0 && !w.breached) { w.breached = true; toast('The barricade is down!', 'bad'); shake(0.5); sfx('scream'); }
    updateGuards(dt, w);
    if (G.p.hp <= 0) endWave(false);
    else if (w.spawned >= w.total && !alive.length) endWave(true);
    else if (w.breached && w.breaches >= Math.max(3, Math.ceil(w.total * 0.5))) endWave(false);
  }
  function endWave(held) {
    const w = C.wave; if (!w || w.ended) return;
    w.ended = true; C.wave = null;
    const res = { held: !!held, kills: w.kills, breaches: w.breaches };
    for (const e of w.list) { if (e.dead || e.gone) continue; if (!held && !e.inside) despawn(e); else { e.wave = null; e.state = 'chase'; e.ambient = true; } }
    C.barricadeHp = 0; C.barricadeMax = 0;
    try { w.onEnd && w.onEnd(res); } catch (err) { console.warn('wave onEnd', err); }
  }
  const guardT = {};
  function updateGuards(dt, w) {
    const guards = C.survivors.filter(s => s.job === 'guard' || s.job === 'tower');
    for (const s of guards) {
      guardT[s.id] = (guardT[s.id] || rand(0.3, 1.2)) - dt;
      if (guardT[s.id] > 0) continue;
      const sk = (s.ref.skills && s.ref.skills.combat) || 1;
      guardT[s.id] = Math.max(0.8, 2.0 - sk * 0.2) * rand(0.9, 1.2);
      const range = s.job === 'tower' ? 11 : 9;
      let best = null, bd = range;
      for (const e of C.enemies) { if (e.dead || (!e.wave && e.state !== 'chase')) continue; const d = dist(s.x, s.y, e.x, e.y); if (d < bd && los(s.x, s.y, e.x, e.y)) { bd = d; best = e; } }
      if (!best) continue;
      s.face = Math.atan2(best.x - s.x, best.y - s.y); s.a.anim('shoot');
      const h = s.job === 'tower' ? 3.2 : 1.35;
      muzzle(s.x + Math.sin(s.face) * 0.4, s.y + Math.cos(s.face) * 0.4, h, false); sfx('shoot');
      if (Math.random() < 0.5 + sk * 0.08 + (s.job === 'tower' ? 0.1 : 0)) { hurtEnemy(best, rnd(5, 10) + sk * 2, { guard: true, kx: Math.sin(s.face), ky: Math.cos(s.face) }); tracer(s.x, s.y, h, best.x, best.y, 1.1, false); }
      else tracer(s.x, s.y, h, best.x + rand(-1, 1), best.y + rand(-1, 1), 0.3, false);
    }
  }

  /* ---------- shelter survivors ---------- */
  const SURV_TINTS = [0x5f7a5a, 0x4f6a7a, 0x6a6a52, 0x56627a, 0x6e7a62, 0x4e5e6e, 0x5a6a4a, 0x46586a];
  let survKey = '', survT = 0;
  function survTarget(s, idx) {
    const r = WORLD.shelterRect, job = s.job, h = WORLD.hatch;
    const sameJob = C.survivors.filter(o => o.job === job), k = Math.max(0, sameJob.indexOf(s));
    if (job === 'tower') { const c = slotCentre('tower'); return { x: c.x, y: c.y + 0.9, work: false }; }
    if (job === 'guard') {
      const R_ = rectOf(), cx = (R_.x0 + R_.x1) / 2;
      const spots = [[cx - 1.2, R_.y1 - 0.8], [cx + 1.2, R_.y1 - 0.8], [R_.x0 + 0.8, (R_.y0 + R_.y1) / 2], [R_.x1 - 0.8, (R_.y0 + R_.y1) / 2], [cx - 3, R_.y1 - 0.8], [cx + 3, R_.y1 - 0.8]];
      const sp = spots[k % spots.length]; return { x: sp[0], y: sp[1], work: false };
    }
    if (typeof BUILDINGS !== 'undefined' && BUILDINGS[job] && bl(job) > 0) { const c = slotCentre(job); return { x: c.x + (k - (sameJob.length - 1) / 2) * 0.8, y: c.y + 0.9, work: true }; }
    return null;
  }
  function syncSurvivors(dt) {
    survT -= dt; if (survT > 0) return; survT = 0.5;
    const p = G.p, r = WORLD.shelterRect, cx = (r.x0 + r.x1 + 1) / 2, cy = (r.y0 + r.y1 + 1) / 2;
    const near = dist(p.x, p.y, cx, cy) < 25;
    const list = near ? (G.survivors || []).filter(s => s.job !== 'scavenge' || G.isNight) : [];
    const key = list.map(s => s.id + ':' + s.job).join(',') + '|' + Object.keys(G.buildings || {}).map(k => k + bl(k)).join(',');
    if (key === survKey) return;
    survKey = key;
    const keep = [];
    for (const o of C.survivors) { const s = list.find(x => x.id === o.id); if (s) { o.ref = s; o.job = s.job; keep.push(o); } else o.a.dispose(); }
    for (const s of list) {
      if (keep.find(o => o.id === s.id)) continue;
      const a = Actors.make('survivor', { tint: SURV_TINTS[s.id % SURV_TINTS.length] }); R.scene.add(a.root);
      const h = WORLD.hatch;
      keep.push({ id: s.id, ref: s, job: s.job, a, x: h.x + 0.5 + rand(-1, 1), y: h.y + 1.3 + rand(0, 1), face: Math.PI * 0.0, wx: 0, wy: 0, wT: 0, carry: undefined });
    }
    C.survivors = keep;
  }
  function updateSurvivors(dt) {
    syncSurvivors(dt);
    const h = WORLD.hatch;
    C.survivors.forEach((s, i) => {
      const tg = survTarget(s, i);
      let spd = 0, tx, ty;
      if (tg) { tx = tg.x; ty = tg.y; }
      else {
        s.wT -= dt;
        if (s.wT <= 0) { s.wT = rand(4, 9); for (let k = 0; k < 6; k++) { const x = h.x + 0.5 + rand(-3, 3), y = h.y + 1.5 + rand(0, 3); if (!hitR(x, y, 0.3) && inShelter(x, y)) { s.wx = x; s.wy = y; break; } } }
        tx = s.wx || s.x; ty = s.wy || s.y;
      }
      const d = dist(s.x, s.y, tx, ty);
      if (d > 0.25) {
        const v = Math.min(d, 1.5 * dt), dx = (tx - s.x) / d, dy = (ty - s.y) / d;
        const [nx, ny] = move(s.x, s.y, dx * v, dy * v, 0.25);
        spd = dist(nx, ny, s.x, s.y) / Math.max(dt, 1e-4);
        if (spd < 0.05) { s.stuck = (s.stuck || 0) + dt; if (s.stuck > 5) { s.x = tx; s.y = ty; s.stuck = 0; } } else s.stuck = 0;
        s.x = nx; s.y = ny; s.face = turn(s.face, Math.atan2(dx, dy), dt * 8);
        s.a.anim('walk');
      } else if (tg && tg.work) {
        s.a.anim('work'); s.face = turn(s.face, Math.PI, dt * 6);
      } else {
        s.a.anim('idle');
        if (tg) s.face = turn(s.face, s.job === 'guard' ? Math.atan2(s.x - (WORLD.shelterRect.x0 + WORLD.shelterRect.x1 + 1) / 2, s.y - (WORLD.shelterRect.y0 + WORLD.shelterRect.y1 + 1) / 2) : 0, dt * 4);
      }
      const carry = s.job === 'guard' || s.job === 'tower' ? 'pistol' : (tg && tg.work && d <= 0.25 ? (s.job === 'garden' ? 'shovel' : 'hammer') : null);
      if (carry !== s.carry) { s.carry = carry; s.a.setCarry(carry); }
      s.a.aiming = false;
      const hgt = s.job === 'tower' && d <= 0.25 ? 1.9 : 0;
      s.a.root.position.set(s.x * TILE, hgt, s.y * TILE); s.a.root.rotation.y = s.face;
      s.a.update(dt, spd);
    });
  }

  /* ---------- drops ---------- */
  function updateDrops(dt) {
    const p = G.p;
    C._dt = (C._dt || 0) + dt;
    for (let i = C.drops.length - 1; i >= 0; i--) {
      const d = C.drops[i];
      d.t += dt;
      d.mesh.position.y = 0.32 + Math.sin(d.t * 3 + d.uid) * 0.08; d.spin.rotation.y += dt * 1.5;
      if (d.ring) { const s = 1 + Math.sin(d.t * 4) * 0.12; d.ring.scale.set(s, 1, s); d.ring.position.y = -d.mesh.position.y + 0.04; }
      const dd = dist(d.x, d.y, p.x, p.y);
      if (d.blocked && dd > 1.5) d.blocked = false;
      if (d.auto && !d.blocked && dd < 0.75 && p.hp > 0) C.pickupDrop(d);
    }
  }

  /* ---------- public API ---------- */
  Object.assign(C, {
    init() {
      if (typeof R !== 'undefined' && R.scene && !light) {
        light = new THREE.PointLight(0xffb060, 0, 12, 2); R.scene.add(light);
        fxMats();
      }
    },
    reset() {
      this.clear();
      if (this._corpse) { this._corpse.dispose(); this._corpse = null; }
      this.init();
      deathDone = false; flowKey = ''; roomSeen = {}; lastBld = -1; ambT = 0.5; ambCd = 3; survKey = '';
      Object.assign(PS, { swing: null, cd: 0, dodge: null, kx: 0, ky: 0, staDelay: 0, winded: false, noiseT: 0, noAmmoTold: false, grabBy: null, hitStop: 0, buf: 0, lastProf: undefined });
      this.player = Actors.make('player'); R.scene.add(this.player.root);
      this.player.root.position.set(G.p.x * TILE, 0, G.p.y * TILE); this.player.root.rotation.y = G.p.face || 0;
      this.player.update(0.016, 0);
    },
    clear() {
      if (G && G.p && G.p.hp <= 0) checkDeath();
      for (const e of this.enemies) e.a.dispose();
      for (const d of this.drops) d.mesh.parent && d.mesh.parent.remove(d.mesh);
      for (const s of this.survivors) s.a.dispose();
      for (const f of fx) f.obj.parent && f.obj.parent.remove(f.obj); fx.length = 0;
      for (const g of gas) { g.m.parent && g.m.parent.remove(g.m); g.mat.dispose(); } gas.length = 0;
      this.enemies = []; this.drops = []; this.groups = []; this.survivors = []; this.aware = []; this.wave = null; survKey = '';
      this.grabbed = false; this.dodging = false; this.barricadeHp = 0; this.barricadeMax = 0; this.threat = 0; PS.grabBy = null; PS.dodge = null; PS.swing = null;
      if (light) light.intensity = 0;
      if (this.player) {
        const pl = this.player; this.player = null;
        if (G && G.p && G.p.hp <= 0) {
          /* keep the body on the ground and let it finish falling */
          if (this._corpse) this._corpse.dispose();
          this._corpse = pl; pl.die(); let last = performance.now();
          const tick = now => { if (this._corpse !== pl) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; pl.update(dt, 0); if (pl.deadT < 2.5) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        } else pl.dispose();
      }
    },
    update(dt) {
      if (!this.player || !G || !WORLD) return;
      if (PS.hitStop > 0) { PS.hitStop -= dt; dt *= 0.1; }
      Actors.night = !!G.isNight;
      flowT -= dt; if (flowT <= 0) { flowT = 0.25; flowUpdate(false); }
      if (G.p.hp > 0) updatePlayer(dt); else { this.player.update(dt, 0); checkDeath(); }
      for (let i = 0; i < this.enemies.length; i++) updateEnemy(this.enemies[i], dt);
      /* separation (living enemies) */
      const L = this.enemies, p = G.p;
      for (let i = 0; i < L.length; i++) {
        const a = L[i]; if (a.dead) continue;
        for (let j = i + 1; j < L.length; j++) {
          const b = L[j]; if (b.dead) continue;
          const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r; if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
          const d = Math.hypot(dx, dy); if (d >= rr || d < 1e-4) continue;
          const push = (rr - d) / 2, ux = dx / d * push, uy = dy / d * push;
          [a.x, a.y] = move(a.x, a.y, -ux, -uy, a.r, waveBlock(a)); [b.x, b.y] = move(b.x, b.y, ux, uy, b.r, waveBlock(b));
        }
        if (PS.grabBy !== a) {
          const dx = a.x - p.x, dy = a.y - p.y, d = Math.hypot(dx, dy), rr = a.r + 0.3;
          if (d < rr && d > 1e-4) [a.x, a.y] = move(a.x, a.y, dx / d * (rr - d), dy / d * (rr - d), a.r, waveBlock(a));
        }
      }
      /* corpses that have sunk away */
      for (let i = L.length - 1; i >= 0; i--) if (L[i].dead && L[i].a.sunk) { L[i].a.dispose(); L.splice(i, 1); }
      let corpses = L.filter(e => e.dead);
      if (corpses.length > 14) despawn(corpses[0]);
      checkDeath();
      updateGroups();
      updateWave(dt);
      manageAmbient(dt);
      updateSurvivors(dt);
      updateDrops(dt);
      updateFx(dt);
      this.aware = L.filter(e => !e.dead && (e.state === 'chase' || e.state === 'siege'));
      let th = 0; for (const e of L) if (!e.dead && dist(e.x, e.y, p.x, p.y) < 16) th = Math.max(th, e.state === 'chase' ? 1 : e.aware);
      this.threat = th;
      if (this.wave) this.barricadeMax = this.wave.max;
    },
    spawnAt(id, x, y, o) { return spawnAt(id, x, y, o); },
    hurtEnemy, kill, despawn,
    spawnFight(ids, opts) {
      opts = opts || {};
      if (!G || !WORLD || !R.scene) return;
      flowUpdate(true);
      const c = opts.at || G.p;
      const gr = { list: [], opts, done: false };
      const anchor = findSpot(c.x, c.y, 8, 12, { avoidView: !opts.at, reach: true, offscreen: false }) || findSpot(c.x, c.y, 5, 14, {}) || { x: c.x + 8, y: c.y };
      ids.forEach((id, i) => {
        let x = anchor.x, y = anchor.y;
        if (i) { const s = findSpot(anchor.x, anchor.y, 0.8, 2.4, { shelterOK: false }); if (s) { x = s.x; y = s.y; } }
        const e = spawnAt(id, x, y, { screamTime: opts.screamTime }); if (!e) return;
        e.group = gr; becomeAware(e, true); e.alertT = 0;
        gr.list.push(e);
      });
      if (!gr.list.length) { finishGroup(gr, 'onWin'); return; }
      this.groups.push(gr);
      hintOnce('combat', 'Click or J to attack. Space to dodge.');
    },
    startWave(count, onEnd) {
      if (this.wave) endWave(true);
      const lv = bl('walls');
      const max = lv ? 60 + 80 * lv : 45;
      this.barricadeMax = max; this.barricadeHp = max;
      this.wave = { rect: rectOf(), total: Math.max(1, count | 0), spawned: 0, list: [], kills: 0, breaches: 0, breached: false, onEnd, batchT: 1.2, sfxT: 0, t: 0, max, ended: false };
      flowUpdate(true);
    },
    noise(x, y, radius, soft) {
      for (const e of this.enemies) {
        if (e.dead || e.wave) continue;
        const d = dist(e.x, e.y, x, y); if (d > radius) continue;
        if (e.state === 'chase') { if (!e.sees) { e.lastX = x; e.lastY = y; e.lostT = 0; } continue; }
        if (e.state === 'scream') continue;
        const k = 1 - d / radius;
        e.aware = Math.max(e.aware, Math.min(0.95, (soft ? 0.35 : 0.5) + 0.55 * k));
        e.ix = x + rand(-1, 1) * (1 - k); e.iy = y + rand(-1, 1) * (1 - k); e.state = 'sus'; e.susT = 0; e.faceT = Math.atan2(x - e.x, y - e.y);
        if (soft) hintOnce('crouch', 'C to crouch. They hear sprinting.');
      }
    },
    drop(x, y, id, qty, o) {
      if (!ITEMS[id] || !(qty > 0)) return null;
      const g = new THREE.Group(), spin = Actors.itemMesh(id);
      const ring = spin.getObjectByName('ring'); if (ring) { spin.remove(ring); g.add(ring); }
      g.add(spin); g.position.set(x * TILE, 0.32, y * TILE); R.scene.add(g);
      const cat = ITEMS[id].c;
      const d = { uid: this.uid++, x, y, id, qty, mesh: g, spin, ring, t: 0, auto: !!AUTO_CATS[cat], blocked: !(o && o.kill) && !!G && dist(x, y, G.p.x, G.p.y) < 1.5 };
      this.drops.push(d);
      if (this.drops.length > 60) { const o = this.drops.shift(); o.mesh.parent && o.mesh.parent.remove(o.mesh); }
      return d;
    },
    nearestDrop(x, y, r) { let b = null, bd = r; for (const d of this.drops) { const dd = dist(d.x, d.y, x, y); if (dd < bd) { bd = dd; b = d; } } return b; },
    pickupDrop(d) {
      if (!d || this.drops.indexOf(d) < 0) return;
      const before = (G.pack[d.id] || 0) + (G.store[d.id] || 0);
      const label = pickup(d.id, d.qty);
      const got = (G.pack[d.id] || 0) + (G.store[d.id] || 0) - before;
      if (got > 0) sfx('pickup');
      toast(label, got >= d.qty ? 'loot' : 'warn');
      if (got >= d.qty) { d.mesh.parent && d.mesh.parent.remove(d.mesh); this.drops.splice(this.drops.indexOf(d), 1); }
      else { d.qty -= Math.max(0, got); d.blocked = true; }
    },
    enemiesNear(x, y, r) { return this.enemies.filter(e => !e.dead && dist(e.x, e.y, x, y) < r); },
    inFight() {
      if (this.wave || this.groups.some(g => !g.done)) return true;
      if (!G) return false;
      const p = G.p; return this.enemies.some(e => !e.dead && (e.state === 'chase' || e.state === 'scream') && dist(e.x, e.y, p.x, p.y) < 14);
    },
  });
  return C;
})();
