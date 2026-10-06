/* ===================== CINEMATIC: cutscene player (camera paths, letterbox, captions) =====================
   Public:
     Cine.play(shots, done)   play a list of shots, then done(). While Cine.active the game is paused (main.js treats it like UI.blocking()).
     Cine.active              true while a scene plays.          Cine.update(dt)  per frame, AFTER R.update and before R.render.
     Cine.skip()              skip the whole scene.              Cine.next()      fast-forward the current shot.
     Cine.intro(done)         the backstory intro (~48 s) over the current world. Remembers localStorage['deadembers_seen_intro'].
     Cine.introSeen()         true once the intro has played (or been skipped) on this browser.
     Cine.autoIntro           false in headless / automated browsers (scripted checks are not held up); set true to force.
     Cine.cutscene(id, done)  the story/ending cutscene CUTSCENES[id], once per world (G.seenCine[id]); calls done() right away if none/seen.
     Cine.has(id)             a cutscene exists for id and has not been seen in this world.
     Cine.worldFocus()        tile point behind the camera (main passes it to World3D.update so no cutaway / see-through hole shows).
     Cine.hour                the lighting hour the current shot forces (or null).
     Cine.seek(i, t), Cine.freeze (bool)   test helpers: jump to shot i at t seconds; freeze time while still applying the camera.
   Shot: { cam:[{x,y,h},...], look:[{x,y,h},...] (tile coords + metres; 2 points lerp, 3+ spline) | orbit:{x,y,h,r,a0,a1,lookH},
           dur, ease:'inOut'|'out'|'in'|'linear', fov, hour: n | [from,to],
           caption:{who, line, style:'title'|'sub'}, fx:['black','fadeIn','fadeOut','embers','flash','shake'], shake: amount,
           sound: cue | [cue, ...] (Ambience.cue), actors:[{kind, x, y, h, face, anim, mood, carry, tint, walkTo:{x,y}, speed, delay, keep}],
           onStart(ctx), onUpdate(ctx, k, dt), onEnd(ctx) }
   ctx: { shot, t, k, add(obj) (removed at shot end), keep(obj) (removed at scene end), actors, glow(x,y,h,hex,size), puff(x,y,h,o), bus() }
   Skip: Space / Enter / Esc / tap = finish the caption, then next shot. Hold Space/Esc/tap ~0.6 s, or Esc twice, = skip the scene. */
const Cine = (() => {
  const S = {
    shots: null, i: 0, t: 0, done: null, shot: null, perShot: [], perScene: [], actors: [], keepActors: [], queue: [],
    capFull: '', capN: 0, capEl: null, fade: 0, holdT: 0, holdKey: null, lastEsc: -9, embers: [], emberOn: 0, prevFov: 42,
    look: null, camPos: null, flashT: 0, puffs: [], glows: [], hint: 0, endFade: 0, wasHidden: [],
  };
  const C = { active: false, hour: null, freeze: false, autoIntro: !(typeof navigator !== 'undefined' && (navigator.webdriver || /Headless/i.test(navigator.userAgent || ''))) };
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const EASE = {
    linear: k => k, in: k => k * k, out: k => 1 - (1 - k) * (1 - k),
    inOut: k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2,
  };
  const V = (x, y, h) => new THREE.Vector3(x * TILE, h || 0, y * TILE);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
  const cue = (name, o) => { if (typeof Ambience !== 'undefined' && Ambience.cue) safe(() => Ambience.cue(name, o)); };

  /* ---------------------------------------------------------------- DOM overlay ---------------------------------------------------------------- */
  let D = null;
  const CSS = `
#cine{position:absolute;inset:0;z-index:60;display:none;pointer-events:none;overflow:hidden;font-family:'Barlow',system-ui,sans-serif}
#cine.on{display:block;pointer-events:auto;cursor:none}
#cine .cb{position:absolute;left:0;right:0;height:12vh;background:#060504;transition:transform .7s cubic-bezier(.2,.8,.2,1)}
#cine .cb.t{top:0;transform:translateY(-101%)}#cine .cb.b{bottom:0;transform:translateY(101%)}
#cine.bars .cb{transform:none}
#cine .cf{position:absolute;inset:0;background:#000;opacity:0}
#cine .cfl{position:absolute;inset:0;background:#ffd9a8;opacity:0;mix-blend-mode:screen}
#cine canvas{position:absolute;inset:0;width:100%;height:100%}
#cine .cap{position:absolute;left:50%;bottom:calc(12vh - 4px);transform:translate(-50%,50%);width:min(820px,calc(100vw - 32px));text-align:center;opacity:0;transition:opacity .45s}
#cine .cap.on{opacity:1}
#cine .cap .w{font:800 15px/1 'Big Shoulders Stencil Display',Impact,'Arial Narrow',sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#ffb067;margin-bottom:7px}
#cine .cap .w:empty{display:none}
#cine .cap .l{font:500 21px/1.4 'Barlow',system-ui,sans-serif;color:#ebe1ce;text-shadow:0 2px 12px #000,0 0 2px #000;min-height:1.4em}
#cine .cap .l i{font-style:normal;opacity:0}
#cine .cap.title{bottom:50%;transform:translate(-50%,50%)}
#cine .cap.title .l{font:800 clamp(26px,4.2vw,46px)/1.15 'Big Shoulders Stencil Display',Impact,'Arial Narrow',sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#ebe1ce}
#cine .cap.title .l b{color:#e8742c;font-weight:800}
#cine .sk{position:absolute;right:calc(14px + env(safe-area-inset-right,0px));top:calc(6vh - 8px);font:600 11px/1 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#a99c88;opacity:0;transition:opacity .6s;display:flex;align-items:center;gap:8px}
#cine .sk.on{opacity:.75}
#cine .sk s{display:block;width:44px;height:3px;background:#3e352c;text-decoration:none;position:relative}
#cine .sk s:after{content:'';position:absolute;inset:0;background:#e8742c;transform-origin:left;transform:scaleX(var(--k,0))}
body.cine #hud,body.cine #touch,body.cine #lvl,body.cine #dmg{visibility:hidden}
@media (max-aspect-ratio:1/1){#cine .cb{height:10vh}#cine .cap{bottom:calc(10vh - 4px)}#cine .cap .l{font-size:17px}#cine .cap .w{font-size:13px}#cine .sk{top:calc(5vh - 6px);font-size:10px}}
@media (prefers-reduced-motion:reduce){#cine .cb{transition:none}}`;
  function dom() {
    if (D) return D;
    const app = document.getElementById('app') || document.body;
    const st = document.createElement('style'); st.id = 'cine-css'; st.textContent = CSS; document.head.appendChild(st);
    const el = document.createElement('div'); el.id = 'cine';
    el.innerHTML = `<canvas></canvas><div class="cb t"></div><div class="cb b"></div><div class="cfl"></div><div class="cf"></div>
      <div class="cap"><div class="w"></div><div class="l"></div></div><div class="sk"><span></span><s></s></div>`;
    app.appendChild(el);
    D = { el, cv: el.querySelector('canvas'), cf: el.querySelector('.cf'), fl: el.querySelector('.cfl'), cap: el.querySelector('.cap'), w: el.querySelector('.cap .w'), l: el.querySelector('.cap .l'), sk: el.querySelector('.sk'), skT: el.querySelector('.sk span') };
    D.ctx = D.cv.getContext('2d');
    /* tap = next, long press = skip */
    el.addEventListener('pointerdown', e => { if (!C.active) return; e.preventDefault(); e.stopPropagation(); S.holdKey = 'tap'; S.holdT = 0; S.holdStart = now(); });
    const up = e => { if (S.holdKey !== 'tap') return; e.preventDefault(); e.stopPropagation(); const held = now() - (S.holdStart || 0); S.holdKey = null; if (C.active && held < 0.6) C.next(); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', () => { S.holdKey = null; });
    return D;
  }
  /* keys: capture before the game's own handlers while a scene plays */
  function onKeyDown(e) {
    if (!C.active) return;
    const c = e.code, skipKey = c === 'Space' || c === 'Escape', nextKey = skipKey || c === 'Enter' || c === 'NumpadEnter' || c === 'KeyE';
    e.preventDefault(); e.stopImmediatePropagation();
    if (!nextKey || e.repeat) return;
    if (c === 'Escape') { const t = now(); if (t - S.lastEsc < 1.2) { C.skip(); return; } S.lastEsc = t; }
    if (skipKey) { S.holdKey = c; S.holdT = 0; S.holdStart = now(); }
    C.next();
  }
  function onKeyUp(e) { if (!C.active && !S.holdKey) return; if (e.code === S.holdKey) S.holdKey = null; if (C.active) { e.preventDefault(); e.stopImmediatePropagation(); } }
  if (typeof addEventListener === 'function') { addEventListener('keydown', onKeyDown, true); addEventListener('keyup', onKeyUp, true); }

  /* ---------------------------------------------------------------- 3D helpers ---------------------------------------------------------------- */
  let GLOWTEX = null;
  function glowTex() {
    if (GLOWTEX) return GLOWTEX;
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); GLOWTEX = new THREE.CanvasTexture(c); return GLOWTEX;
  }
  function glow(x, y, h, hex, size) {
    const m = new THREE.SpriteMaterial({ map: glowTex(), color: hex == null ? 0xff3a26 : hex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    const s = new THREE.Sprite(m); s.position.copy(V(x, y, h)); const z = size || 2; s.scale.set(z, z, 1); s.renderOrder = 5; R.scene.add(s);
    s.userData.dispose = () => m.dispose(); return s;
  }
  let PUFFG = null;
  function puff(x, y, h, o) {
    o = o || {}; PUFFG = PUFFG || new THREE.IcosahedronGeometry(0.5, 0);
    const n = o.n || 6;
    for (let i = 0; i < n; i++) {
      const m = new THREE.MeshLambertMaterial({ color: o.color || 0x4a4640, transparent: true, opacity: 0.0, depthWrite: false, flatShading: true });
      const p = new THREE.Mesh(PUFFG, m); p.position.copy(V(x + (Math.random() - 0.5) * (o.spread || 0.4), y + (Math.random() - 0.5) * (o.spread || 0.4), h));
      R.scene.add(p);
      S.puffs.push({ m: p, mat: m, t: -(o.stagger == null ? i * 0.12 : i * o.stagger), life: o.life || 2.4, vy: (o.rise || 1.4) * (0.7 + Math.random() * 0.6), vx: (Math.random() - 0.5) * 0.8 + (o.drift || 0), vz: (Math.random() - 0.5) * 0.8, s0: o.size || 0.6, op: o.opacity || 0.55 });
    }
  }
  function updatePuffs(dt) {
    for (let i = S.puffs.length - 1; i >= 0; i--) {
      const p = S.puffs[i]; p.t += dt; if (p.t < 0) continue;
      const k = p.t / p.life;
      if (k >= 1) { p.m.parent && p.m.parent.remove(p.m); p.mat.dispose(); S.puffs.splice(i, 1); continue; }
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt * (1 - k * 0.6); p.m.position.z += p.vz * dt;
      p.m.scale.setScalar(p.s0 * (1 + k * 3)); p.m.rotation.y += dt; p.mat.opacity = p.op * Math.sin(Math.PI * Math.min(1, k * 1.4 + 0.05)) * (1 - k);
    }
  }
  function removeObj(o) {
    if (!o) return;
    if (o.dispose && o.root) { safe(() => o.dispose()); return; } // actor
    o.parent && o.parent.remove(o); if (o.userData && o.userData.dispose) safe(() => o.userData.dispose());
  }
  /* the real bus: the world builds it as one merged mesh; find it and drive a pivoted copy */
  function findBus() {
    if (typeof World3D !== 'undefined' && World3D.busMesh) return World3D.busMesh;
    const b = WORLD && WORLD.bus, g = typeof World3D !== 'undefined' && World3D.group; if (!b || !g) return null;
    const cx = (b.x + 0.5) * TILE, cz = (b.y + 0.5) * TILE; let best = null, bd = 9;
    for (const m of g.children) {
      if (!m.isMesh || m.isInstancedMesh || !m.geometry) continue;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox, sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z, sy = bb.max.y - bb.min.y;
      if (sx > 12 || sz > 12 || sy > 4.5 || Math.max(sx, sz) < 6) continue;
      const d = Math.hypot((bb.min.x + bb.max.x) / 2 - cx, (bb.min.z + bb.max.z) / 2 - cz); if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
  function busCopy() {
    const src = findBus(), b = WORLD.bus;
    let obj;
    if (src) {
      if (!src.geometry.boundingBox) src.geometry.computeBoundingBox();
      const bb = src.geometry.boundingBox, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
      const g = src.geometry.clone(); g.translate(-cx, 0, -cz);
      obj = new THREE.Mesh(g, src.material); obj.castShadow = true; obj.userData.dispose = () => g.dispose();
      const was = src.visible; src.visible = false; S.wasHidden.push([src, was]);
      obj.position.set(cx, 0, cz);
    } else {
      const grp = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: 0xc8a032, flatShading: true });
      const body = new THREE.Mesh(new THREE.BoxGeometry(8.4, 2.4, 2.4), mat); body.position.y = 1.6; grp.add(body);
      grp.userData.dispose = () => { body.geometry.dispose(); mat.dispose(); };
      obj = grp; obj.position.copy(V(b.x + 0.5, b.y + 0.5, 0));
    }
    R.scene.add(obj); return obj; // model is long along world x (bus faces +x); rotation.y = PI/2 faces north (-z)
  }

  /* ---------------------------------------------------------------- playback ---------------------------------------------------------------- */
  function pathAt(pts, k) {
    if (!pts || !pts.length) return null;
    if (pts.length === 1) return V(pts[0].x, pts[0].y, pts[0].h);
    if (pts.length === 2) return V(pts[0].x, pts[0].y, pts[0].h).lerp(V(pts[1].x, pts[1].y, pts[1].h), k);
    const key = pts.__curve || (pts.__curve = new THREE.CatmullRomCurve3(pts.map(p => V(p.x, p.y, p.h))));
    return key.getPoint(k);
  }
  function spawnActor(a, list) {
    if (typeof Actors === 'undefined') return null;
    const act = safe(() => Actors.make(a.kind || 'walker', { tint: a.tint, mood: a.mood }), null); if (!act) return null;
    R.scene.add(act.root);
    act.root.position.copy(V(a.x, a.y, a.h || 0));
    const face = a.face != null ? a.face : a.walkTo ? Math.atan2(a.walkTo.x - a.x, a.walkTo.y - a.y) : 0;
    act.root.rotation.y = face;
    if (a.carry) act.setCarry(a.carry);
    if (a.mood && act.mood) act.mood(a.mood);
    act.anim(a.anim || (a.walkTo ? 'walk' : 'idle'));
    const rec = { a: act, o: a, x: a.x, y: a.y, t: -(a.delay || 0), face };
    if (a.walkTo) { const d = Math.hypot(a.walkTo.x - a.x, a.walkTo.y - a.y); rec.spd = a.speed || 1.1; rec.len = d; }
    for (let i = 0; i < 4; i++) act.update(0.05, 0);
    list.push(rec); return rec;
  }
  function updateActors(list, dt) {
    for (const r of list) {
      r.t += dt; let spd = 0;
      if (r.o.walkTo && r.t > 0 && r.len > 0.01) {
        const k = Math.min(1, (r.t * r.spd) / r.len);
        const nx = r.o.x + (r.o.walkTo.x - r.o.x) * k, ny = r.o.y + (r.o.walkTo.y - r.o.y) * k;
        spd = k < 1 ? r.spd * TILE * 0.5 : 0; r.x = nx; r.y = ny;
        if (k >= 1 && !r.arrived) { r.arrived = true; r.a.anim(r.o.arrive || 'idle'); }
      }
      r.a.root.position.set(r.x * TILE, r.o.h || 0, r.y * TILE);
      r.a.update(dt, r.o.walkTo && !r.arrived && r.t > 0 ? (r.o.run ? 5 : Math.max(1.2, spd)) : 0);
    }
  }
  function ctxFor(shot) {
    return {
      shot, get t() { return S.t; }, get k() { return clamp01(S.t / Math.max(0.01, shot.dur || 1)); },
      add(o) { S.perShot.push(o); return o; }, keep(o) { S.perScene.push(o); return o; },
      get actors() { return S.actors; },
      glow(x, y, h, hex, size) { return this.add(glow(x, y, h, hex, size)); },
      puff, bus() { return this.keep(busCopy()); },
      actor(a) { return spawnActor(a, a.keep ? S.keepActors : S.actors); },
    };
  }
  function setCaption(cap) {
    const d = dom();
    if (!cap || !cap.line) { d.cap.classList.remove('on'); S.capFull = ''; S.capN = 0; return; }
    d.cap.className = 'cap on' + (cap.style === 'title' ? ' title' : '');
    d.w.textContent = cap.who || '';
    S.capFull = cap.line; S.capN = 0;
    /* pre-lay out every char invisible so typing never re-wraps lines */
    d.l.innerHTML = cap.line.split('').map(ch => `<i>${ch === '<' ? '&lt;' : ch === '&' ? '&amp;' : ch}</i>`).join('');
    S.capSpans = d.l.querySelectorAll('i');
  }
  function typeCaption(dt) {
    if (!S.capFull || !S.capSpans) return;
    const n0 = Math.floor(S.capN); S.capN = Math.min(S.capFull.length, S.capN + dt * 34); const n1 = Math.floor(S.capN);
    for (let i = n0; i < n1; i++) S.capSpans[i].style.opacity = 1;
  }
  const capDone = () => !S.capFull || S.capN >= S.capFull.length;
  function finishCaption() { S.capN = S.capFull.length; if (S.capSpans) S.capSpans.forEach(s => { s.style.opacity = 1; }); }

  function endShot() {
    const s = S.shot; if (!s) return;
    if (s.onEnd) safe(() => s.onEnd(S.ctx));
    for (const r of S.actors) safe(() => r.a.dispose()); S.actors = [];
    for (const o of S.perShot) removeObj(o); S.perShot = [];
  }
  function startShot(i) {
    endShot();
    S.i = i; S.t = 0; const s = S.shot = S.shots[i]; S.ctx = ctxFor(s);
    s.dur = s.dur || 4;
    const fx = s.fx || [];
    S.fx = {}; for (const f of fx) S.fx[f] = true;
    if (S.fx.flash) S.flashT = 0.5;
    C.hour = Array.isArray(s.hour) ? s.hour[0] : s.hour != null ? s.hour : C.hour;
    setCaption(s.caption);
    for (const a of s.actors || []) spawnActor(a, a.keep ? S.keepActors : S.actors);
    if (s.sound) for (const c of [].concat(s.sound)) cue(c, { dur: s.dur });
    if (s.onStart) safe(() => s.onStart(S.ctx));
  }
  function finish(skipped) {
    endShot();
    for (const r of S.keepActors) safe(() => r.a.dispose()); S.keepActors = [];
    for (const o of S.perScene) removeObj(o); S.perScene = [];
    for (const p of S.puffs) { p.m.parent && p.m.parent.remove(p.m); p.mat.dispose(); } S.puffs = [];
    for (const [m, v] of S.wasHidden) m.visible = v; S.wasHidden = [];
    C.active = false; C.hour = null; S.shot = null;
    const d = dom();
    d.el.classList.remove('bars'); d.cap.classList.remove('on'); d.sk.classList.remove('on');
    S.embers = []; S.emberOn = 0; d.ctx.clearRect(0, 0, d.cv.width, d.cv.height);
    /* hand back to the game camera, fading in from black if the scene ended dark */
    S.endFade = parseFloat(d.cf.style.opacity) || 0;
    if (skipped) S.endFade = Math.max(S.endFade, 0.85);
    d.cf.style.opacity = S.endFade;
    d.el.classList.remove('on');
    if (S.endFade > 0.01) d.el.style.display = 'block';
    document.body.classList.remove('cine');
    if (R.camera) { R.camera.fov = S.prevFov; R.camera.updateProjectionMatrix(); }
    if (typeof G !== 'undefined' && G && G.p) R.follow(G.p.x, G.p.y, G.p.face || 0, true);
    cue('stop');
    if (typeof World3D !== 'undefined' && World3D.setObjective) safe(() => World3D.setObjective(null));
    const done = S.done; S.done = null; S.shots = null;
    if (done) safe(() => done());
    if (!C.active && S.queue.length) { const q = S.queue.shift(); C.play(q[0], q[1]); }
  }

  C.play = function (shots, done) {
    if (!shots || !shots.length || typeof R === 'undefined' || !R.camera) { if (done) done(); return; }
    if (C.active) { S.queue.push([shots, done]); return; }
    const d = dom();
    C.active = true; S.shots = shots; S.done = done || null; S.prevFov = R.camera.fov; S.holdKey = null; S.holdT = 0; S.endFade = 0; S.emberOn = 0;
    d.el.style.display = ''; d.el.classList.add('on'); d.cf.style.opacity = shots[0].fx && (shots[0].fx.includes('black') || shots[0].fx.includes('fadeIn')) ? 1 : 0;
    void d.el.offsetWidth; d.el.classList.add('bars');
    d.skT.textContent = (typeof INPUT !== 'undefined' && INPUT.touch) ? 'Hold to skip' : 'Hold Esc to skip'; d.sk.classList.add('on'); S.hint = 0;
    document.body.classList.add('cine');
    if (typeof UI !== 'undefined' && UI.prompt) safe(() => UI.prompt(null));
    cue('duck');
    if (typeof World3D !== 'undefined' && World3D.setObjective) safe(() => World3D.setObjective(false)); // no objective beacon in shot
    startShot(0);
    C.update(0);
  };
  C.next = function () {
    if (!C.active) return;
    if (!capDone()) { finishCaption(); return; }
    if (S.i + 1 < S.shots.length) startShot(S.i + 1); else finish(false);
  };
  C.skip = function () { if (C.active) finish(true); };
  C.seek = function (i, t) { if (!C.active) return; startShot(Math.max(0, Math.min(S.shots.length - 1, i))); const tt = t || 0; S.t = 0; C.freezeAt = null; const fz = C.freeze; C.freeze = false; let left = tt; while (left > 0) { const st = Math.min(0.05, left); C.update(st, true); left -= st; } C.freeze = fz; C.update(0); };
  C.worldFocus = function () {
    const cam = R.camera; if (!cam) return { x: -999, y: -999 };
    const f = new THREE.Vector3(); cam.getWorldDirection(f); const p = cam.position.clone().addScaledVector(f, -40);
    return { x: p.x / TILE, y: p.z / TILE };
  };

  C.update = function (dt, internal) {
    const d = D;
    /* fade back from black after a scene ends (the game is already running underneath) */
    if (!C.active) {
      if (d && S.endFade > 0) { S.endFade = Math.max(0, S.endFade - (dt || 0) * 1.1); d.cf.style.opacity = S.endFade; if (S.endFade <= 0) d.el.style.display = ''; }
      return;
    }
    const s = S.shot; if (!s) return;
    if (C.freeze && !internal) dt = 0;
    /* holding Space / Esc / a finger skips the whole scene */
    if (S.holdKey) {
      S.holdT = now() - (S.holdStart || now());
      d.sk.style.setProperty('--k', clamp01(S.holdT / 0.6).toFixed(3));
      if (S.holdT >= 0.6) { S.holdKey = null; d.sk.style.setProperty('--k', 0); C.skip(); return; }
    } else d.sk.style.setProperty('--k', 0);
    S.hint += dt; if (S.hint > 6) d.sk.classList.remove('on');
    S.t += dt;
    const k = clamp01(S.t / s.dur), e = (EASE[s.ease] || EASE.inOut)(k);
    /* lighting time */
    if (Array.isArray(s.hour)) C.hour = s.hour[0] + (s.hour[1] - s.hour[0]) * e;
    if (C.hour != null) { R.setTime(Math.floor(C.hour), (C.hour % 1) * 60); if (typeof Actors !== 'undefined') Actors.night = R.nightK > 0.5; }
    /* actors, props, per-shot logic (before the camera so a shot can track what moves) */
    updateActors(S.actors, dt); updateActors(S.keepActors, dt); updatePuffs(dt);
    if (s.onUpdate) safe(() => s.onUpdate(S.ctx, k, dt));
    /* camera */
    let pos, look;
    if (s.orbit) {
      const o = s.orbit, a = o.a0 + (o.a1 - o.a0) * e, r = o.r0 != null ? o.r0 + (o.r - o.r0) * e : o.r, h = o.h0 != null ? o.h0 + (o.h - o.h0) * e : o.h;
      pos = V(o.x + Math.sin(a) * r, o.y + Math.cos(a) * r, h); look = V(o.x, o.y, o.lookH0 != null ? o.lookH0 + ((o.lookH || 0) - o.lookH0) * e : (o.lookH || 0));
    } else { pos = pathAt(s.cam, e); look = pathAt(s.look || s.cam, e) || pos.clone().add(new THREE.Vector3(0, -1, -1)); }
    if (s.track) { const tp = safe(() => s.track(S.ctx, e), null); if (tp) look = V(tp.x, tp.y, tp.h || 0); }
    const sh = (S.fx.shake ? 0.25 : 0) + (s.shake || 0);
    if (sh > 0) { const f = sh * (1 - k * 0.6); pos.x += (Math.random() - 0.5) * f; pos.y += (Math.random() - 0.5) * f * 0.6; pos.z += (Math.random() - 0.5) * f; }
    const cam = R.camera, asp = cam.aspect || 1, fov0 = Array.isArray(s.fov) ? s.fov[0] + (s.fov[1] - s.fov[0]) * e : s.fov || 42;
    cam.fov = asp < 1 ? Math.min(74, fov0 / Math.pow(asp, 0.55)) : fov0; cam.updateProjectionMatrix();
    cam.position.copy(pos); cam.lookAt(look); cam.updateMatrixWorld();
    S.look = look; S.camPos = pos;
    if (R.lookTarget) R.lookTarget.set(look.x, 0, look.z);
    /* fog by shot distance, flashlight off, shadows around what we look at */
    const dist = pos.distanceTo(look), fog = R.scene.fog;
    if (fog) { fog.near = dist * 0.85 + 6; fog.far = dist * 2.4 + 30; }
    if (R.flash) R.flash.intensity = 0; if (R.glow) R.glow.intensity = 0;
    if (R.sun && R._sunDir) { R.sun.target.position.set(look.x, 0, look.z); R.sun.position.set(look.x, 0, look.z).addScaledVector(R._sunDir, 60); R.sun.target.updateMatrixWorld(); }
    /* fades */
    let black = 0;
    const fi = s.fadeIn || 1.0, fo = s.fadeOut || 1.0;
    if (S.fx.black) black = 1;
    if (S.fx.fadeIn) black = Math.max(black, 1 - clamp01(S.t / fi));
    if (S.fx.fadeOut) black = Math.max(black, clamp01((S.t - (s.dur - fo)) / fo));
    if (S.fx.black && S.fx.fadeOut) black = 1;
    d.cf.style.opacity = black.toFixed(3);
    if (S.flashT > 0) { S.flashT = Math.max(0, S.flashT - dt); d.fl.style.opacity = (S.flashT / 0.5 * 0.85).toFixed(3); } else d.fl.style.opacity = 0;
    typeCaption(dt);
    S.emberOn += ((S.fx.embers ? 1 : 0) - S.emberOn) * Math.min(1, dt * 2);
    drawEmbers(dt);
    /* hold the last caption until it can be read, then move on */
    if (S.t >= s.dur && !internal) {
      if (!capDone() && S.t < s.dur + 3) return;
      if (S.i + 1 < S.shots.length) startShot(S.i + 1); else finish(false);
    }
  };

  /* screen-space embers (2D canvas over the 3D view) */
  function drawEmbers(dt) {
    const d = D, cv = d.cv, w = cv.clientWidth | 0, h = cv.clientHeight | 0;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const x = d.ctx; x.clearRect(0, 0, w, h);
    if (S.emberOn < 0.01 && !S.embers.length) return;
    const want = Math.round(70 * S.emberOn * Math.min(1, w / 900 + 0.3));
    while (S.embers.length < want) S.embers.push({ x: Math.random() * w, y: h + Math.random() * h * 0.6, v: 18 + Math.random() * 46, s: 0.8 + Math.random() * 2.2, p: Math.random() * 6, a: 0.4 + Math.random() * 0.6 });
    x.globalCompositeOperation = 'lighter';
    for (let i = S.embers.length - 1; i >= 0; i--) {
      const e = S.embers[i]; e.y -= e.v * dt; e.p += dt * 1.7; e.x += Math.sin(e.p) * 12 * dt + 6 * dt;
      if (e.y < -10 || (S.embers.length > want && Math.random() < dt)) { S.embers.splice(i, 1); continue; }
      const fl = 0.6 + Math.sin(e.p * 3.1) * 0.4, al = e.a * fl * S.emberOn * Math.min(1, (h - e.y) / 120 + 0.2);
      x.fillStyle = `rgba(255,${120 + (e.s * 30 | 0)},50,${al.toFixed(3)})`; x.beginPath(); x.arc(e.x, e.y, e.s, 0, 6.283); x.fill();
      x.fillStyle = `rgba(255,120,40,${(al * 0.18).toFixed(3)})`; x.beginPath(); x.arc(e.x, e.y, e.s * 4, 0, 6.283); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
  }

  /* ---------------------------------------------------------------- places in the generated world ---------------------------------------------------------------- */
  const P = {
    hatch() { const h = WORLD.hatch; return { x: h.x + 0.5, y: h.y + 0.5 }; },
    tower() {
      const i = WORLD.roofs.findIndex(r => r.type === 'radiotower');
      if (i >= 0) { const r = WORLD.roofs[i], top = typeof World3D !== 'undefined' && World3D.heightAt ? World3D.heightAt(i) : 0, base = top > 16 ? top - 16 : 3.8; return { x: r.x + r.w / 2, y: r.y + r.h / 2, base, top: base + 21 }; }
      const p = nearestPoi('radiotower', WORLD.hatch.x, WORLD.hatch.y) || WORLD.hatch; return { x: p.x + 0.5, y: p.y + 0.5, base: 3.8, top: 25 };
    },
    /* the gate's crossbeam (the camp is a walled compound north of it; the sign and fires face south) */
    gate() { const g = WORLD.gate || WORLD.hatch; return { x: g.x + 0.5, y: g.y + 0.75 }; },
    bus() { const b = WORLD.bus || WORLD.hatch; return { x: b.x + 0.5, y: b.y + 0.5 }; },
    yard() { const r = WORLD.shelterRect; return { x: (r.x0 + r.x1 + 1) / 2, y: (r.y0 + r.y1 + 1) / 2, r }; },
    roof(type) { const r = WORLD.roofs.find(q => q.type === type); return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h } : null; },
    /* road tiles near (x,y) within rad, sorted by distance */
    roads(x, y, rad, n) {
      const out = [];
      for (let ty = Math.max(1, Math.floor(y - rad)); ty <= Math.min(H - 2, y + rad); ty++) for (let tx = Math.max(1, Math.floor(x - rad)); tx <= Math.min(W - 2, x + rad); tx++)
        if (tileAt(tx, ty) === T_ROAD) out.push({ x: tx + 0.5, y: ty + 0.5, d: Math.hypot(tx + 0.5 - x, ty + 0.5 - y) });
      out.sort((a, b) => a.d - b.d); return n ? out.slice(0, n) : out;
    },
    /* the road to Haven: from the top edge (near x 74) south through the Northern Pass, as centre points ordered north -> south */
    passRoad() {
      const ok = t => t === T_ROAD || (typeof T_PATH !== 'undefined' && t === T_PATH) || t === T_BRIDGE;
      let x = null, bd = 1e9;
      for (let y = 0; y < 4 && x == null; y++) for (let tx = 1; tx < W - 1; tx++) if (ok(tileAt(tx, y))) { const d = Math.abs(tx - 74); if (d < bd) { bd = d; x = tx; } }
      if (x == null) return null;
      const pts = []; let cx = x;
      for (let y = 0; y < Math.min(H - 1, 40); y++) {
        let s = 0, n = 0; for (let dx = -3; dx <= 3; dx++) if (ok(tileAt(cx + dx, y))) { s += cx + dx; n++; }
        if (!n) break; cx = Math.round(s / n); pts.push({ x: s / n + 0.5, y: y + 0.5 });
      }
      return pts.length > 8 ? pts : null;
    },
    /* centre line (tile x) of the north-south road nearest x that runs north from y */
    roadColumn(x, y) {
      let best = null, bd = 1e9;
      for (let tx = 1; tx < W - 1; tx++) {
        let ok = 0; for (let k = 0; k < 8; k++) if (tileAt(tx, Math.max(0, Math.floor(y) - k)) === T_ROAD) ok++;
        if (ok >= 7) { const dd = Math.abs(tx + 0.5 - x); if (dd < bd) { bd = dd; best = tx; } }
      }
      if (best == null) return x;
      return tileAt(best + 1, Math.floor(y) - 2) === T_ROAD ? best + 1 : best + 0.5;
    },
  };
  C.places = P;
  /* rough obstacle height (m) on a tile: keeps cameras out of walls and their view of the subject clear */
  let HT = null;
  function obstH(x, y) {
    const fx = Math.floor(x), fy = Math.floor(y); if (fx < 0 || fy < 0 || fx >= W || fy >= H) return 0;
    if (!HT) {
      HT = {}; HT[T_TREE] = 7.5; HT[T_CAR] = 1.8; HT[T_PROP] = 1.4;
      try { if (typeof T_BUSH !== 'undefined') HT[T_BUSH] = 1.2; if (typeof T_FENCE !== 'undefined') HT[T_FENCE] = 1.3; if (typeof T_ROCK !== 'undefined') HT[T_ROCK] = 1.6; if (typeof T_GATE !== 'undefined') HT[T_GATE] = 4.8; } catch (e) { }
    }
    const t = tileAt(fx, fy);
    if (t === T_ROOF || t === T_WALL || t === T_FLOOR || t === T_DOOR) {
      const bi = buildingAt(fx + 0.5, fy + 0.5);
      if (bi >= 0) { const r = WORLD.roofs[bi], h = typeof World3D !== 'undefined' && World3D.heightAt ? World3D.heightAt(bi) : 6; return r.type === 'radiotower' ? 4.4 : (h || 6) + 0.5; }
      return 3.8; // camp walls, the bunker block
    }
    return HT[t] || (SOLID.has(t) && t !== T_WATER ? 1.5 : 0);
  }
  function camClear(x, y, h) {
    if (x < 0.5 || y < 0.5 || x > W - 0.5 || y > H - 0.5) return false;
    for (const [dx, dy] of [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) if (obstH(x + dx, y + dy) > h - 0.7) return false;
    return true;
  }
  function losBlocked(a, b, skipEnd) {
    const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / 0.4)); let bad = 0;
    for (let i = 1; i < n; i++) {
      const f = i / n; if (d * (1 - f) < (skipEnd == null ? 1.2 : skipEnd)) break;
      if (obstH(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f) > a.h + (b.h - a.h) * f - 0.2) bad++;
    }
    return bad;
  }
  /* best orbit angle around c (0 = camera south of it, the game's own view); scores camera clearance and line of sight over the sweep */
  function bestAngle(c, o) {
    const r0 = o.r0 != null ? o.r0 : o.r, h0 = o.h0 != null ? o.h0 : o.h, lh0 = o.lookH0 != null ? o.lookH0 : (o.lookH || 0), sw = o.sweep || 0, pref = o.prefer || 0;
    let best = pref, bs = 1e9;
    for (let i = 0; i < 36; i++) {
      const step = Math.ceil(i / 2), a = pref + (i % 2 ? 1 : -1) * step * (Math.PI / 18);
      let s = step * 0.6;
      for (const k of [0, 0.5, 1]) {
        const r = r0 + (o.r - r0) * k, h = h0 + (o.h - h0) * k, lh = lh0 + ((o.lookH || 0) - lh0) * k, aa = a - sw / 2 + sw * k;
        const cx = c.x + Math.sin(aa) * r, cy = c.y + Math.cos(aa) * r;
        if (!camClear(cx, cy, h)) s += 40;
        s += 6 * losBlocked({ x: cx, y: cy, h }, { x: c.x, y: c.y, h: lh }, o.skipEnd);
      }
      if (s < bs) { bs = s; best = a; }
    }
    return best;
  }
  function orbitAt(c, o) { const a = bestAngle(c, o), sw = o.sweep || 0; return Object.assign({}, o, { x: c.x, y: c.y, a0: a - sw / 2, a1: a + sw / 2 }); }
  /* lowest camera height at (x,y) that sees t */
  function clearHeight(x, y, t, h0, h1) { for (let h = h0; h <= h1; h += 1) if (camClear(x, y, h) && !losBlocked({ x, y, h }, t, 2)) return h; return h1; }
  /* nearest clear camera spot to (x,y) at height h that sees t */
  function clearSpot(x, y, h, t) {
    let best = { x, y }, bs = 1e9;
    for (let r = 0; r <= 4; r += 1) for (let i = 0; i < (r ? 12 : 1); i++) {
      const cx = x + Math.sin(i * Math.PI / 6) * r, cy = y + Math.cos(i * Math.PI / 6) * r;
      const s = r + (camClear(cx, cy, h) ? 0 : 50) + (t ? 5 * losBlocked({ x: cx, y: cy, h }, t, 2) : 0);
      if (s < bs) { bs = s; best = { x: cx, y: cy }; }
    }
    return best;
  }
  C._view = { obstH, camClear, losBlocked, bestAngle };
  const mapClamp = p => ({ x: Math.max(2, Math.min(W - 2, p.x)), y: Math.max(2, Math.min(H - 2, p.y)), h: p.h });
  const walkers = (list, kinds) => { const ks = kinds || ['walker', 'walker', 'runner', 'walker', 'bloater']; return list.map((p, i) => Object.assign({ kind: ks[i % ks.length] }, p)); };

  /* ---------------------------------------------------------------- the backstory intro ---------------------------------------------------------------- */
  const SEEN_KEY = 'deadembers_seen_intro';
  C.introSeen = function () { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; } };
  C.markIntroSeen = function () { try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { } };
  function introShots() {
    const hk = P.hatch(), tw = P.tower(), gt = P.gate();
    /* dusk flyover: in from the south-west over the rooftops, toward home */
    const c0 = mapClamp({ x: hk.x - 34, y: hk.y + 30, h: 50 }), c1 = mapClamp({ x: hk.x - 16, y: hk.y + 17, h: 38 }), c2 = mapClamp({ x: hk.x - 5, y: hk.y + 9, h: 30 });
    const l0 = mapClamp({ x: hk.x - 22, y: hk.y + 12, h: 0 }), l1 = mapClamp({ x: hk.x - 10, y: hk.y + 1, h: 0 }), l2 = mapClamp({ x: hk.x + 2, y: hk.y - 12, h: 0 });
    const rd = P.roads(l1.x, l1.y, 10).filter((p, i) => i % 4 === 0).slice(0, 8);
    const flyWalkers = walkers(rd.map((p, i) => ({ x: p.x, y: p.y, walkTo: { x: p.x + (i % 2 ? 2.5 : -2), y: p.y + (i % 3 ? 1.5 : -2) }, speed: 0.35 + (i % 3) * 0.08, delay: i * 0.3 })));
    /* the hatch: down from above the yard to the player at the glowing hatch, at first light */
    const end = clearSpot(hk.x + 2.4, hk.y + 5.6, 4.4, { x: hk.x, y: hk.y + 0.6, h: 0.8 });
    return [
      { dur: 6.5, fx: ['black'], hour: 18.6, cam: [c0], look: [l0], sound: 'drone',
        caption: { style: 'title', line: 'Fourteen months ago, the Grey Fever reached Ardent Vale.' } },
      { dur: 12, fx: ['fadeIn', 'embers'], fadeIn: 2.2, hour: [18.6, 18.95], ease: 'linear', cam: [c0, c1, c2], look: [l0, l1, l2], actors: flyWalkers },
      { dur: 10.5, fx: ['fadeIn', 'fadeOut'], fadeIn: 0.8, fadeOut: 0.7, hour: [19.1, 19.3], sound: 'static', fov: 46,
        orbit: orbitAt(tw, { r0: 17, r: 12, h0: 6, h: 10, lookH0: tw.top - 9, lookH: tw.top - 3, sweep: 0.8, prefer: 0.3, skipEnd: 3 }),
        caption: { line: 'A voice on the radio still speaks of Haven, beyond the northern mountains.' },
        onStart: c => { c.blink = c.glow(tw.x, tw.y, tw.top + 0.2, 0xff3a26, 3.2); },
        onUpdate: c => { if (c.blink) c.blink.material.opacity = (Math.sin(c.t * 3.4) > 0.2 ? 1 : 0.15); } },
      { dur: 10, fx: ['fadeIn', 'fadeOut', 'embers'], fadeIn: 0.7, fadeOut: 0.7, hour: 19.55,
        orbit: orbitAt({ x: gt.x, y: gt.y + 1 }, { r0: 10, r: 6.5, h0: 2.8, h: 2.0, lookH0: 3.4, lookH: 2.9, sweep: 0.35, prefer: 0, skipEnd: 2 }),
        caption: { line: 'The Tollmen charge for every road. Their Warden charges more.' },
        actors: [{ kind: 'warden', x: gt.x, y: gt.y + 1.4, face: 0, carry: 'shotgun' }, { kind: 'tollman', x: gt.x - 1.6, y: gt.y + 1.9, face: 0.2, carry: 'pistol' }, { kind: 'tollman', x: gt.x + 1.7, y: gt.y + 2.0, face: -0.3, carry: 'pipe' }] },
      { dur: 10.5, fx: ['fadeIn', 'fadeOut'], fadeIn: 0.8, fadeOut: 1.6, hour: [5.55, 6.5], ease: 'inOut', sound: 'swell',
        cam: [mapClamp({ x: hk.x + 7, y: hk.y + 16, h: 24 }), mapClamp({ x: hk.x + 4, y: hk.y + 9, h: 11 }), { x: end.x, y: end.y, h: 4.4 }],
        look: [{ x: hk.x, y: hk.y, h: 0 }, { x: hk.x, y: hk.y + 0.5, h: 0.4 }, { x: hk.x, y: hk.y + 0.6, h: 0.8 }],
        caption: { line: 'You kept to the dark. Now the cans have run out.' } },
    ];
  }
  C.intro = function (done) {
    /* replayed from the title before any world exists: build a throwaway city to fly over */
    try { if (!WORLD && typeof genWorld === 'function') WORLD = genWorld(Math.floor(Math.random() * 1e9)); if (WORLD && typeof World3D !== 'undefined' && !World3D.group) World3D.build(); } catch (e) { }
    if (typeof WORLD === 'undefined' || !WORLD) { if (done) done(); return; }
    C.markIntroSeen();
    C.play(introShots(), done);
  };

  /* ---------------------------------------------------------------- story + ending cutscenes ---------------------------------------------------------------- */
  const gp = () => ({ x: G.p.x, y: G.p.y });
  const pullAway = (hour) => () => {
    const p = gp();
    return [{ dur: 7, fx: ['fadeOut'], fadeOut: 2.6, hour, ease: 'out', cam: [{ x: p.x + 1.5, y: p.y + 4, h: 4 }, { x: p.x + 4, y: p.y + 13, h: 24 }], look: [{ x: p.x, y: p.y, h: 0.6 }, { x: p.x, y: p.y - 1, h: 0 }], sound: 'drone' }];
  };
  const busNorth = (hour) => () => {
    const pass = P.passRoad(), first = busDepot(hour, !!pass)();
    if (!pass) return first;
    const i0 = Math.min(pass.length - 1, 26), s0 = pass[i0];
    const along = k => { const f = (1 - k) * i0, i = Math.floor(f), r = f - i, a = pass[i], b2 = pass[Math.min(i + 1, pass.length - 1)]; return { x: a.x + (b2.x - a.x) * r, y: a.y + (b2.y - a.y) * r }; };
    const cam0 = clearSpot(s0.x + 1.2, s0.y + 5, 3.2, s0);
    return first.concat([{ dur: 8.5, fx: ['fadeIn', 'fadeOut', 'embers'], fadeIn: 0.8, fadeOut: 2.2, hour, ease: 'linear',
      cam: [{ x: cam0.x, y: cam0.y, h: 3.2 }, { x: s0.x + 0.8, y: s0.y + 4, h: 7 }, { x: s0.x + 0.5, y: s0.y + 2, h: 14 }],
      track: c => { const a = c.busAt || s0; return { x: a.x, y: a.y - 1.5, h: 1.2 }; },
      onStart: c => { c.bobj = S.perScene.find(o => o && o.userData && o.userData.isBus) || c.bus(); },
      onUpdate: (c, k) => {
        const o = c.bobj; if (!o) return; const f = Math.pow(k, 1.25), p = along(f), q = along(Math.min(1, f + 0.02));
        o.position.set(p.x * TILE, 0, p.y * TILE); o.rotation.y = Math.atan2(-(q.y - p.y), q.x - p.x || 1e-4);
        c.busAt = p; if (Math.random() < 0.3) puff(p.x, p.y + 2.1, 0.5, { n: 1, life: 1.6, size: 0.35, color: 0x3a3632, rise: 0.6, opacity: 0.4 });
      } }]);
  };
  const busDepot = (hour, more) => () => {
    const b = P.bus(), rx = P.roadColumn(b.x, b.y), yEnd = 2;
    const c0 = clearSpot(rx + 0.6, b.y + 6, 3, { x: b.x, y: b.y, h: 1.2 }); // on the road, south of the junction: the road ahead is a clear corridor
    return [{ dur: more ? 7 : 12.5, fx: ['fadeIn', 'fadeOut', 'embers'], fadeIn: 1, fadeOut: more ? 0.8 : 2, hour, ease: 'linear', sound: 'engine',
      cam: [{ x: c0.x, y: c0.y, h: 3 }, { x: rx + 0.5, y: b.y + 3, h: 6 }, { x: rx + 0.4, y: b.y - 3, h: 13 }],
      track: c => { const a = c.busAt || b; return { x: a.x, y: a.y - 1.5, h: 1.2 }; },
      onStart: c => {
        c.bobj = c.bus(); c.bobj.userData.isBus = true;
        c.path = [{ x: b.x, y: b.y }, { x: rx, y: b.y }, { x: rx, y: Math.max(yEnd, b.y - (more ? 22 : 40)) }];
      },
      onUpdate: (c, k) => {
        /* pull out onto the road, turn north, then away, accelerating */
        const o = c.bobj; if (!o) return;
        const p = c.path, west = p[1].x < p[0].x; let x, y, rot;
        if (k < 0.25) { const f = EASE.inOut(k / 0.25); x = p[0].x + (p[1].x - p[0].x) * f; y = p[0].y - Math.sin(f * Math.PI / 2) * 1.5; rot = (west ? Math.PI : 0) + (Math.PI / 2 - (west ? Math.PI : 0)) * f; }
        else { const f = Math.pow((k - 0.25) / 0.75, 1.6); x = p[1].x; y = p[1].y - 1.5 + (p[2].y - p[1].y) * f; rot = Math.PI / 2; }
        o.position.set(x * TILE, 0, y * TILE); o.rotation.y = rot;
        c.busAt = { x, y };
        if (Math.random() < 0.25) puff(x, y + 2.1, 0.5, { n: 1, life: 1.6, size: 0.35, color: 0x3a3632, rise: 0.6, opacity: 0.4 });
      } }];
  };
  /* a story gate opens (WORLD.gates[id]): dust off the old barrier, the way beyond, the district's name */
  const gateCut = id => () => {
    const g = WORLD.gates && WORLD.gates[id]; if (!g) return null;
    const c = { x: (g.x0 + g.x1 + 1) / 2, y: (g.y0 + g.y1 + 1) / 2 }, I = typeof GATE_INFO !== 'undefined' && GATE_INFO[id];
    const pref = G && G.p ? Math.atan2(G.p.x - c.x, G.p.y - c.y) : 0;
    return [{ dur: 7, fx: ['fadeIn', 'fadeOut'], fadeIn: 0.6, fadeOut: 0.9, sound: 'swell', orbit: orbitAt(c, { r0: 13, r: 9, h0: 7, h: 4.5, lookH: 0.8, sweep: 0.5, prefer: pref, skipEnd: 2 }),
      caption: I ? { who: 'The way is open', line: I.title } : null,
      onStart: () => { g.tiles.filter((q, i) => i % 2 === 0).slice(0, 16).forEach(([x, y], i) => puff(x + 0.5, y + 0.5, 0.3, { n: 2, color: 0x8a8070, size: 0.6, rise: 0.9, life: 2.6, stagger: 0.2 + i * 0.03 })); },
      onUpdate: cx => { cx.shot.shake = cx.t < 1.2 ? 0.2 : 0; } }];
  };
  const CUTSCENES = {
    radio_fixed: () => {
      const s = typeof slotCentre === 'function' ? slotCentre('radio') : P.hatch(), top = 10.45;
      return [{ dur: 8, fx: ['fadeIn', 'fadeOut'], fadeIn: 0.6, fadeOut: 0.8, sound: 'static',
        orbit: orbitAt(s, { r0: 10, r: 8, h0: 3, h: 4.5, lookH0: 5, lookH: 7.6, sweep: 0.6, prefer: 0.3, skipEnd: 2 }),
        onStart: c => { c.l = c.glow(s.x, s.y, top, 0xff4a2a, 2.4); },
        onUpdate: c => { c.l.material.opacity = c.t < 2.5 ? (Math.random() < 0.3 ? 0.6 : 0) : (Math.sin(c.t * 3.2) > 0 ? 1 : 0.25); } }];
    },
    tollmen_demand: () => {
      const h = P.hatch(), y = P.yard().r;
      const sx = h.x, sy = y.y1 + 6;
      return [{ dur: 9, fx: ['fadeIn', 'fadeOut'], fadeIn: 0.6, fadeOut: 0.8, cam: [{ x: h.x - 4, y: h.y + 1, h: 1.7 }, { x: h.x - 3, y: h.y + 0.5, h: 1.9 }], look: [{ x: sx, y: sy, h: 1.4 }, { x: h.x, y: h.y + 3.5, h: 1.3 }],
        actors: [{ kind: 'tollman', x: sx, y: sy, walkTo: { x: h.x, y: h.y + 3.4 }, speed: 0.9, carry: 'pistol' }, { kind: 'tollman', x: sx - 1.4, y: sy + 1.2, walkTo: { x: h.x - 1.3, y: h.y + 4.3 }, speed: 0.95, carry: 'pipe' }, { kind: 'tollman', x: sx + 1.4, y: sy + 1.0, walkTo: { x: h.x + 1.4, y: h.y + 4.2 }, speed: 0.92, carry: 'pistol' }] }];
    },
    horde_warning: () => {
      const yd = P.yard(), ny = Math.max(3, yd.r.y0 - 17), line = [];
      for (let i = 0; i < 30; i++) { const x = yd.x - 15 + i * 1.0 + Math.sin(i * 7.1) * 0.5, y = ny - (i % 3) * 1.1 - Math.cos(i * 3.3) * 0.6; line.push({ kind: i % 7 === 3 ? 'brute' : i % 5 === 1 ? 'runner' : 'walker', x, y, walkTo: { x: x + Math.sin(i) * 0.6, y: y + 3 }, speed: 0.22 + (i % 4) * 0.04, delay: (i % 5) * 0.4 }); }
      const cy = yd.y + 3, h = clearHeight(yd.x, cy, { x: yd.x, y: ny, h: 1.5 }, 7, 26);
      return [{ dur: 11, fx: ['fadeIn', 'fadeOut', 'embers'], fadeIn: 0.8, fadeOut: 1, hour: 18.45, sound: ['drone', 'horde'],
        cam: [{ x: yd.x, y: cy + 1, h: h }, { x: yd.x, y: cy, h: h + 1.5 }], look: [{ x: yd.x, y: yd.y - 4, h: 0.5 }, { x: yd.x, y: ny - 1, h: 1.4 }], fov: [42, 24], ease: 'inOut', actors: line }];
    },
    bus_ready: () => {
      const b = P.bus();
      return [{ dur: 7, fx: ['fadeIn', 'fadeOut'], fadeIn: 0.5, fadeOut: 0.8, sound: 'engine', orbit: orbitAt(b, { r: 9, h: 3, lookH: 1.2, sweep: 0.4, prefer: 0.9, skipEnd: 3 }),
        onUpdate: (c, k, dt) => {
          c.shot.shake = c.t > 1.4 && c.t < 2.4 ? 0.35 : c.t > 2.4 ? 0.05 : 0;
          c.pt = (c.pt || 0) - dt; if (c.t > 1.4 && c.pt <= 0) { c.pt = c.t < 3 ? 0.08 : 0.35; puff(b.x - 2.2, b.y + 0.5, 0.5, { n: c.t < 3 ? 2 : 1, color: c.t < 3 ? 0x2a2826 : 0x4a4640, size: c.t < 3 ? 0.55 : 0.35, rise: 0.8, drift: -0.6 }); }
        } }];
    },
    first_rescue: () => {
      const p = gp(), h = P.hatch(), dx = h.x - p.x, dy = h.y - p.y, d = Math.max(1, Math.hypot(dx, dy)), ux = dx / d, uy = dy / d;
      const to = { x: p.x + ux * 6, y: p.y + uy * 6 };
      return [{ dur: 7, fx: ['fadeIn', 'fadeOut'], fadeIn: 0.5, fadeOut: 0.9, cam: [{ x: p.x - ux * 3 + 2, y: p.y - uy * 3 + 2, h: 3 }, { x: p.x - ux * 1 + 2.5, y: p.y - uy * 1 + 2.5, h: 4.5 }], look: [{ x: p.x + ux * 2, y: p.y + uy * 2, h: 1 }, { x: to.x, y: to.y, h: 1 }],
        actors: [{ kind: 'survivor', x: p.x + uy * 0.9, y: p.y - ux * 0.9, walkTo: { x: to.x + uy * 0.9, y: to.y - ux * 0.9 }, speed: 0.9, delay: 0.6 }] }];
    },
    end_haven: busNorth(6.5), end_convoy: busNorth(7.4),
    end_stand: () => {
      const yd = P.yard();
      return [{ dur: 11, fx: ['fadeIn', 'fadeOut', 'embers'], fadeIn: 1.4, fadeOut: 1.4, hour: [4.9, 6.9], ease: 'inOut', sound: 'swell',
        cam: [{ x: yd.x + 6, y: yd.y + 10, h: 3 }, { x: yd.x + 3, y: yd.y + 9, h: 16 }], look: [{ x: yd.x, y: yd.y, h: 1.5 }, { x: yd.x - 2, y: yd.y - 8, h: 4 }] }];
    },
    end_cure: () => {
      const tw = P.tower();
      return [{ dur: 10, fx: ['fadeIn', 'fadeOut'], fadeIn: 1, fadeOut: 1.4, hour: 20.5, sound: 'static', orbit: orbitAt(tw, { r0: 22, r: 15, h0: 6, h: 13, lookH0: tw.top - 10, lookH: tw.top - 2, sweep: 0.8, prefer: -0.3, skipEnd: 3 }),
        onStart: c => { c.r = c.glow(tw.x, tw.y, tw.top + 0.2, 0xff3a26, 4); c.w = c.glow(tw.x, tw.y, tw.top - 6, 0xffffff, 2.2); },
        onUpdate: c => { c.r.material.opacity = Math.sin(c.t * 4.2) > 0 ? 1 : 0.1; c.w.material.opacity = Math.sin(c.t * 4.2 + 2) > 0.6 ? 0.9 : 0.05; } }];
    },
    end_usurp: () => {
      const g = P.gate();
      return [{ dur: 9, fx: ['fadeIn', 'fadeOut', 'embers'], fadeIn: 1, fadeOut: 1.2, hour: 19.3, fov: 46,
        orbit: orbitAt({ x: g.x, y: g.y }, { r0: 8.5, r: 6, h0: 1.4, h: 2.2, lookH0: 4.6, lookH: 5.3, sweep: 0.3, prefer: 0, skipEnd: 1.5 }),
        actors: [{ kind: 'player', x: g.x, y: g.y, h: 4.55, face: 0, anim: 'idle', carry: G && G.p && G.p.weapon }, { kind: 'tollman', x: g.x - 1.5, y: g.y + 2.5, face: Math.PI, carry: 'pistol' }, { kind: 'tollman', x: g.x + 1.6, y: g.y + 2.8, face: Math.PI }] }];
    },
    end_alliance: () => {
      const g = P.gate(), c = { x: g.x, y: g.y + 2.2 }, ob = orbitAt(c, { r: 4, h: 1.9, lookH: 1.3, sweep: 0.5, prefer: 0.3, skipEnd: 1 });
      /* the two stand across the camera's line of sight so both are seen in profile */
      const a = (ob.a0 + ob.a1) / 2, px = Math.cos(a) * 0.52, py = -Math.sin(a) * 0.52, f = Math.atan2(px, py);
      return [{ dur: 8, fx: ['fadeIn', 'fadeOut', 'embers'], fadeIn: 1, fadeOut: 1.2, hour: 18.9, orbit: ob,
        actors: [{ kind: 'player', x: c.x - px, y: c.y - py, face: f, anim: 'handshake' }, { kind: 'warden', x: c.x + px, y: c.y + py, face: f + Math.PI, anim: 'handshake' }] }];
    },
    end_alone: () => {
      const pass = P.passRoad();
      if (pass) {
        const a = pass[Math.min(pass.length - 1, 18)], b = pass[Math.min(pass.length - 1, 5)], c0 = clearSpot(a.x + 1.5, a.y + 6, 2.6, a);
        return [{ dur: 11, fx: ['fadeIn', 'fadeOut'], fadeIn: 1.2, fadeOut: 2.2, hour: 6.4, ease: 'linear', cam: [{ x: c0.x, y: c0.y, h: 2.6 }, { x: a.x + 1, y: a.y + 4, h: 16 }],
          track: c => { const r = c.actors[0]; return r ? { x: r.x, y: r.y - 2, h: 1 } : a; },
          actors: [{ kind: 'player', x: a.x, y: a.y, walkTo: { x: b.x, y: b.y }, speed: 1.0, carry: G && G.p && G.p.weapon }] }];
      }
      const p = gp(), rx = P.roadColumn(p.x, p.y), y0 = Math.min(H - 3, p.y);
      return [{ dur: 11, fx: ['fadeIn', 'fadeOut'], fadeIn: 1.2, fadeOut: 2.2, hour: 6.4, ease: 'linear', cam: [{ x: rx + 2, y: y0 + 6, h: 2.5 }, { x: rx + 1, y: y0 + 5, h: 18 }], look: [{ x: rx, y: y0 - 2, h: 1 }, { x: rx, y: y0 - 10, h: 0 }],
        actors: [{ kind: 'player', x: rx, y: y0, walkTo: { x: rx, y: y0 - 12 }, speed: 1.0, carry: G && G.p && G.p.weapon }] }];
    },
    end_choir: () => {
      const c0 = P.roof('hospital') || P.hatch();
      return [{ dur: 10, fx: ['fadeIn', 'fadeOut', 'embers'], fadeIn: 1.2, fadeOut: 1.8, hour: 19.2, sound: 'bells', orbit: orbitAt(c0, { r0: 20, r: 16, h0: 5, h: 12, lookH: 6, sweep: 0.5, prefer: 0.2, skipEnd: 4 }) }];
    },
    gate_forest: gateCut('forest'), gate_docks: gateCut('docks'), gate_pass: gateCut('pass'),
    /* first frost: a slow, low orbit of the wreck nearest the player at first light (the frost shader peaks around 07:00) */
    first_frost: () => {
      const p = gp(); let car = null, bd = 15 * 15;
      for (let ty = Math.floor(p.y - 15); ty <= p.y + 15; ty++) for (let tx = Math.floor(p.x - 15); tx <= p.x + 15; tx++) {
        if (tileAt(tx, ty) !== T_CAR) continue;
        const d = (tx + 0.5 - p.x) ** 2 + (ty + 0.5 - p.y) ** 2; if (d < bd) { bd = d; car = { x: tx + 0.5, y: ty + 0.5 }; }
      }
      const c = car || p, pref = Math.atan2(p.x - c.x, p.y - c.y);
      return [{ dur: 6, fx: ['fadeIn', 'fadeOut'], fadeIn: 0.8, fadeOut: 1, hour: 7, ease: 'inOut',
        orbit: orbitAt(c, { r0: 5.5, r: 3.8, h0: 2.6, h: 1.7, lookH0: 1.2, lookH: 0.8, sweep: 0.45, prefer: pref, skipEnd: 1.4 }),
        onUpdate: (cx, k, dt) => { cx.bt = (cx.bt || 0) - dt; if (cx.bt <= 0) { cx.bt = 1.5; puff(p.x, p.y, 1.55, { n: 1, life: 1.3, size: 0.18, color: 0xdfe4e8, rise: 0.25, drift: 0.2, opacity: 0.3 }); } } }];
    },
    /* first snow: close under the falling snow looking up past the player, then up and back to see it settle on the street */
    first_snow: () => {
      const p = gp();
      return [{ dur: 7, fx: ['fadeIn', 'fadeOut'], fadeIn: 0.8, fadeOut: 1.1, ease: 'inOut',
        orbit: orbitAt(p, { r0: 3.6, r: 8, h0: 1.5, h: 7, lookH0: 4.5, lookH: 0.6, sweep: 0.5, prefer: 0, skipEnd: 1.2 }) }];
    },
    end_stand_fail: pullAway(), end_alliance_fail: pullAway(), end_cure_fail: pullAway(), death: pullAway(), abandoned: pullAway(),
  };
  C.CUTSCENES = CUTSCENES;
  Object.defineProperty(C, 'shotIndex', { get: () => S.i });
  Object.defineProperty(C, 'shotDur', { get: () => S.shot ? S.shot.dur : 0 });
  C._shots = () => S.shots;
  C.has = function (id) { return !!(CUTSCENES[id] && typeof G !== 'undefined' && G && !(G.seenCine && G.seenCine[id])); };
  C.cutscene = function (id, done) {
    if (!C.has(id) || typeof WORLD === 'undefined' || !WORLD) { if (done) done(); return; }
    G.seenCine = G.seenCine || {}; G.seenCine[id] = true;
    const shots = safe(() => CUTSCENES[id](), null);
    if (!shots) { if (done) done(); return; }
    C.play(shots, done);
  };
  return C;
})();
