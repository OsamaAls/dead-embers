/* ===================== AMBIENCE: subtle procedural ambient soundscape (no music) =====================
   Every sound comes from something around the player right now. scan() runs every 0.5 s and looks at the tiles and objects
   within ~14 tiles (trees, water, grass and fields, cars, buildings, fires, zombies, corpses, survivors, farm sheds), plus the
   time of day, G.weather, G.season and indoors/outdoors. Only layers that scan justifies play; a quiet street at noon is near silent.
   Public:
     Ambience.init()            wire the first-input listener (the AudioContext starts on the first key / pointer / touch).
     Ambience.update(dt)        per frame (also on the title, where it fades to silence).
     Ambience.volume            0..1, default 0.35 (relative to the effects level); Ambience.setVolume(v) persists it.
     Ambience.cue(name, {dur})  cinematic sounds for Cine: drone, swell, static, engine, bells, horde, duck, stop.
     Ambience.debugState(fresh) { ready, master, volume, muted, duck, indoors, weather, night, wind, openness, beds:{name:gain}, sources:[{src, reason, at, gain}] }
   Uses SFX.ctx when SFX exposes one, else its own AudioContext. Respects SFX.on === false (mute). Ducks under dialogue, cutscenes and fights. */
const Ambience = (() => {
  const VKEY = 'deadembers_ambience';
  const A = { volume: 0.35 };
  try { const v = parseFloat(localStorage.getItem(VKEY)); if (v >= 0 && v <= 1) A.volume = v; } catch (e) { }
  let ctx = null, own = false, noise = null, brown = null, nodes = null, started = false;
  const beds = {}; // name -> {gain node, pan node, filter..., target}
  const timers = {}; // emitter key -> seconds left
  const recent = []; // one-shots fired: {src, reason, at, gain, t}
  let moveSpd = 0, lastP = null;
  let scanT = 0, scanR = null, clock = 0, voiceT = [], duck = 1, lastMaster = -1;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rand = (a, b) => a + Math.random() * (b - a);
  const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
  const MASTER_K = 0.2; // master = volume * MASTER_K (the effects master is 0.2), so the default 0.35 gives 0.07

  /* ---------------------------------------------------------------- audio graph ---------------------------------------------------------------- */
  function getCtx() {
    if (ctx) return ctx;
    if (typeof SFX !== 'undefined' && SFX.ctx) { ctx = SFX.ctx; own = false; }
    else {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      try { ctx = new AC(); own = true; } catch (e) { ctx = null; return null; }
    }
    build();
    return ctx;
  }
  function unlock() {
    const c = getCtx(); if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => { });
  }
  function build() {
    const sr = ctx.sampleRate, len = Math.floor(sr * 2.5);
    noise = ctx.createBuffer(1, len, sr); brown = ctx.createBuffer(1, len, sr);
    const d = noise.getChannelData(0), b = brown.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; d[i] = w; last = (last + 0.02 * w) / 1.02; b[i] = last * 3.5; }
    const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const duckG = ctx.createGain(); duckG.connect(master);
    const outF = ctx.createBiquadFilter(); outF.type = 'lowpass'; outF.frequency.value = 18000; outF.Q.value = 0.5;
    const outG = ctx.createGain(); outF.connect(outG); outG.connect(duckG);
    const inG = ctx.createGain(); inG.connect(duckG);
    const cueG = ctx.createGain(); cueG.gain.value = 0.2; cueG.connect(ctx.destination);
    nodes = { master, duckG, outF, outG, inG, cueG, cues: [] };
    /* beds: looping sources through filters into a gain + panner */
    const mk = (name, src, chain, bus) => {
      const g = ctx.createGain(); g.gain.value = 0; const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      let n = src; for (const f of chain) { n.connect(f); n = f; }
      n.connect(g); if (p) { g.connect(p); p.connect(bus); } else g.connect(bus);
      beds[name] = { g, p, chain, src, target: 0, pan: 0 };
    };
    const loop = buf => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; };
    const flt = (type, f, q) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q || 0.7; return x; };
    mk('wind', loop(noise), [flt('bandpass', 420, 0.5), flt('lowpass', 1100)], outF);
    mk('leaves', loop(noise), [flt('highpass', 1600), flt('bandpass', 3800, 0.6)], outF);
    mk('rain', loop(noise), [flt('highpass', 500), flt('lowpass', 7000)], outF);
    mk('roofrain', loop(brown), [flt('lowpass', 1300), flt('peaking', 300, 1)], inG);
    mk('snow', loop(noise), [flt('bandpass', 1400, 0.4), flt('lowpass', 2400)], outF);
    mk('water', loop(brown), [flt('lowpass', 520), flt('highpass', 60)], outF);
    mk('fire', loop(noise), [flt('bandpass', 700, 0.5), flt('lowpass', 1800)], outF);
    mk('room', loop(brown), [flt('lowpass', 190)], inG);
    /* water lapping: slow LFO on its gain */
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.31; lg.gain.value = 0; lfo.connect(lg); lg.connect(beds.water.g.gain); lfo.start(); beds.water.lfo = lg;
    /* crickets: two pulsing carriers */
    {
      const g = ctx.createGain(); g.gain.value = 0; const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) { g.connect(p); p.connect(outF); } else g.connect(outF);
      for (const [f, rate, gate, pan] of [[4350, 29, 1.3, -0.4], [4780, 33, 0.9, 0.45]]) {
        const o = ctx.createOscillator(); o.frequency.value = f; const a1 = ctx.createGain(); a1.gain.value = 0.5; const l1 = ctx.createOscillator(); l1.type = 'square'; l1.frequency.value = rate; const l1g = ctx.createGain(); l1g.gain.value = 0.5; l1.connect(l1g); l1g.connect(a1.gain);
        const a2 = ctx.createGain(); a2.gain.value = 0.5; const l2 = ctx.createOscillator(); l2.frequency.value = gate; const l2g = ctx.createGain(); l2g.gain.value = 0.5; l2.connect(l2g); l2g.connect(a2.gain);
        const pp = ctx.createStereoPanner ? ctx.createStereoPanner() : null; o.connect(a1); a1.connect(a2); if (pp) { pp.pan.value = pan; a2.connect(pp); pp.connect(g); } else a2.connect(g);
        o.start(); l1.start(); l2.start();
      }
      beds.crickets = { g, p, target: 0, pan: 0 };
    }
    /* generator / radio hum at the shelter */
    {
      const g = ctx.createGain(); g.gain.value = 0; const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; const lp = flt('lowpass', 260);
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 59.6; const o2 = ctx.createOscillator(); o2.frequency.value = 120.3; const o2g = ctx.createGain(); o2g.gain.value = 0.4;
      o1.connect(lp); o2.connect(o2g); o2g.connect(lp); lp.connect(g); if (p) { g.connect(p); p.connect(outF); } else g.connect(outF); o1.start(); o2.start();
      beds.hum = { g, p, target: 0, pan: 0 };
    }
    started = true;
  }

  /* ---------------------------------------------------------------- one-shot synths ---------------------------------------------------------------- */
  const T = () => ctx.currentTime;
  function voice(gain, pan, bus, delay) {
    const g = ctx.createGain(), t = T() + (delay || 0); g.gain.value = 0;
    let head = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan || 0, -1, 1); g.connect(p); p.connect(bus || nodes.outF); } else g.connect(bus || nodes.outF);
    return { g, t, gain, head };
  }
  function env(g, t, a, peak, dec, hold) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + a); if (hold) g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + (hold || 0) + dec); }
  function osc(v, type, f0, f1, t0, dur, peak, a, filt) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    let n = o; if (filt) { const f = ctx.createBiquadFilter(); f.type = filt[0]; f.frequency.value = filt[1]; f.Q.value = filt[2] || 1; o.connect(f); n = f; }
    env(g, t0, a || 0.01, peak * v.gain, dur); n.connect(g); g.connect(v.g); o.start(t0); o.stop(t0 + dur + a + 0.1); return o;
  }
  function hiss(v, t0, dur, peak, type, f0, f1, q, a) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; f.type = type; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t0); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    env(g, t0, a || 0.004, peak * v.gain, dur); s.connect(f); f.connect(g); g.connect(v.g); s.start(t0, Math.random() * 2); s.stop(t0 + dur + 0.1);
  }
  function vib(o, rate, depth, t0, dur) { const l = ctx.createOscillator(), g = ctx.createGain(); l.frequency.value = rate; g.gain.value = depth; l.connect(g); g.connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.2); }
  const open = v => { v.g.gain.setValueAtTime(1, v.t); v.g.gain.setValueAtTime(1, v.t + 6); v.g.gain.linearRampToValueAtTime(0, v.t + 6.2); };
  const SYN = {
    chirp(v) { open(v); const n = 2 + (Math.random() * 4 | 0), f = rand(2600, 3600); for (let i = 0; i < n; i++) { const t0 = v.t + i * rand(0.08, 0.16); osc(v, 'sine', f * rand(0.9, 1.1), f * rand(1.15, 1.45), t0, rand(0.05, 0.1), 0.5, 0.005); } },
    caw(v) { open(v); const n = 1 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) { const t0 = v.t + i * rand(0.38, 0.5); osc(v, 'sawtooth', rand(430, 520), rand(330, 380), t0, 0.26, 0.45, 0.02, ['bandpass', 1100, 2.2]); hiss(v, t0, 0.2, 0.15, 'bandpass', 1500, 1100, 3); } },
    woodpecker(v) { open(v); const n = 9 + (Math.random() * 7 | 0); for (let i = 0; i < n; i++) hiss(v, v.t + i * 0.055, 0.02, 0.6 * (1 - i / n * 0.5), 'bandpass', 1700, 1700, 4); },
    crack(v) { open(v); hiss(v, v.t, 0.07, 0.7, 'highpass', 1400, 1400, 0.8); hiss(v, v.t + rand(0.08, 0.2), 0.12, 0.4, 'bandpass', 900, 600, 1.5); },
    owl(v) { open(v); const o1 = osc(v, 'sine', 392, 360, v.t, 0.32, 0.5, 0.05, ['lowpass', 900]); const o2 = osc(v, 'sine', 392, 350, v.t + 0.55, 0.6, 0.45, 0.06, ['lowpass', 900]); vib(o2, 6, 6, v.t + 0.55, 0.6); },
    moan(v) { open(v); const d = rand(1.1, 2.0), f = rand(68, 105), o = osc(v, 'sawtooth', f, f * rand(0.75, 0.88), v.t, d, 0.55, 0.25, ['lowpass', rand(380, 560), 1.5]); vib(o, rand(3, 6), rand(3, 7), v.t, d); hiss(v, v.t + 0.1, d * 0.8, 0.12, 'bandpass', 400, 300, 2, 0.2); },
    snarl(v) { open(v); const d = rand(0.45, 0.8), f = rand(140, 210), o = osc(v, 'sawtooth', f, f * 0.7, v.t, d, 0.55, 0.03, ['bandpass', 800, 1.6]); vib(o, rand(24, 34), rand(18, 30), v.t, d); hiss(v, v.t, d, 0.35, 'bandpass', 1200, 700, 2.5); },
    shuffle(v) { open(v); hiss(v, v.t, 0.18, 0.5, 'lowpass', 650, 350, 0.8, 0.03); hiss(v, v.t + rand(0.35, 0.5), 0.16, 0.35, 'lowpass', 600, 330, 0.8, 0.03); },
    bark(v) { open(v); for (let i = 0, n = 1 + (Math.random() * 2 | 0); i < n; i++) { const t0 = v.t + i * 0.22; osc(v, 'square', 560, 330, t0, 0.09, 0.4, 0.004, ['bandpass', 900, 1.2]); hiss(v, t0, 0.07, 0.3, 'bandpass', 1200, 800, 2); } },
    growl(v) { open(v); const o = osc(v, 'sawtooth', 88, 80, v.t, 0.9, 0.5, 0.1, ['lowpass', 420, 2]); vib(o, 26, 14, v.t, 0.9); },
    murmur(v) {
      open(v); const n = 3 + (Math.random() * 5 | 0), base = rand(105, 190); let t0 = v.t;
      for (let i = 0; i < n; i++) {
        const d = rand(0.11, 0.22), o = ctx.createOscillator(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), g = ctx.createGain(), g2 = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(base * rand(0.9, 1.15), t0); o.frequency.linearRampToValueAtTime(base * rand(0.85, 1.1), t0 + d);
        f1.type = 'bandpass'; f1.frequency.value = rand(450, 800); f1.Q.value = 5; f2.type = 'bandpass'; f2.frequency.value = rand(1100, 1900); f2.Q.value = 6;
        o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g2); g2.connect(g); g2.gain.value = 0.5;
        env(g, t0, 0.03, 0.5 * v.gain, d); g.connect(v.g); o.start(t0); o.stop(t0 + d + 0.1); t0 += d + rand(0.03, 0.18);
      }
    },
    hammer(v) { open(v); for (let i = 0; i < 2; i++) { const t0 = v.t + i * rand(0.32, 0.45); osc(v, 'sine', 190, 75, t0, 0.07, 0.6, 0.002); hiss(v, t0, 0.04, 0.35, 'highpass', 2600, 2600, 0.8); } },
    dig(v) { open(v); hiss(v, v.t, 0.28, 0.5, 'bandpass', 700, 280, 1.2, 0.03); hiss(v, v.t + 0.3, 0.12, 0.25, 'lowpass', 500, 300, 0.8); },
    bang(v) { open(v); osc(v, 'sine', 95, 48, v.t, 0.35, 0.7, 0.002); hiss(v, v.t, 0.25, 0.5, 'lowpass', 500, 200, 0.8); hiss(v, v.t + 0.3, 0.15, 0.2, 'lowpass', 420, 200, 0.8); },
    creak(v) { open(v); const d = rand(0.5, 0.9), o = osc(v, 'sawtooth', rand(170, 230), rand(120, 160), v.t, d, 0.3, 0.08, ['bandpass', 950, 9]); vib(o, 11, 9, v.t, d); },
    ping(v) { open(v); osc(v, 'sine', rand(2400, 4600), rand(2200, 4200), v.t, 0.06, 0.4, 0.001); },
    drip(v) { open(v); osc(v, 'sine', rand(1100, 1600), rand(500, 700), v.t, 0.07, 0.5, 0.002); osc(v, 'sine', rand(900, 1300), 500, v.t + 0.11, 0.05, 0.12, 0.002); },
    rope(v) { open(v); const d = rand(0.35, 0.6), o = osc(v, 'sawtooth', rand(300, 380), rand(250, 300), v.t, d, 0.22, 0.05, ['bandpass', 1200, 11]); vib(o, 7, 6, v.t, d); },
    crane(v) { open(v); const d = rand(1.0, 1.8), o = osc(v, 'sawtooth', rand(95, 130), rand(70, 90), v.t, d, 0.35, 0.2, ['bandpass', 420, 7]); vib(o, 4, 5, v.t, d); hiss(v, v.t + d * 0.6, 0.3, 0.12, 'bandpass', 900, 500, 3, 0.05); },
    lap(v) { open(v); hiss(v, v.t, rand(0.5, 0.9), 0.45, 'lowpass', 420, 260, 0.8, 0.25); },
    slosh(v) { open(v); hiss(v, v.t, 0.28, 0.6, 'lowpass', 1200, 300, 1, 0.03); hiss(v, v.t + 0.12, 0.22, 0.25, 'bandpass', 1800, 700, 2, 0.02); },
    crackle(v) { open(v); for (let i = 0, n = 2 + (Math.random() * 5 | 0); i < n; i++) hiss(v, v.t + rand(0, 0.5), rand(0.008, 0.03), rand(0.3, 0.8), 'bandpass', rand(1800, 4200), null, 1.5); },
  };

  /* ---------------------------------------------------------------- scan: what is around the player right now ---------------------------------------------------------------- */
  /* local weather (the pass is always snowing) and the last night's storm */
  const weatherOf = (x, y) => {
    let w = (typeof weatherAt === 'function' ? safe(() => weatherAt(x, y), null) : null) || (typeof G !== 'undefined' && G && G.weather) || 'clear';
    w = String(w).toLowerCase(); if (G && G.storm && /snow|rain/.test(w)) w += ' storm'; return w;
  };
  function windFor(w) {
    if (typeof G !== 'undefined' && G && typeof G.wind === 'number') return clamp(G.wind, 0, 1);
    if (/storm|blizzard/.test(w)) return 1; if (/snow/.test(w)) return 0.6; if (/rain/.test(w)) return 0.45; if (/fog|mist/.test(w)) return 0.08; if (/cloud|overcast|wind/.test(w)) return 0.35; return 0.16;
  }
  function addDir(acc, dx, dy, w) { const d = Math.hypot(dx, dy) || 1; acc.x += dx / d * w; acc.y += dy / d * w; acc.w += w; if (d < acc.near) { acc.near = d; acc.nx = dx; acc.ny = dy; } }
  const dirAcc = () => ({ x: 0, y: 0, w: 0, near: 99, nx: 0, ny: 0 });
  const panOf = (dx, dy) => clamp(dx / Math.max(2.5, Math.hypot(dx, dy)), -1, 1) * 0.85;
  const att = (d, r) => Math.pow(clamp(1 - d / r, 0, 1), 1.4);
  function scan() {
    const out = { beds: {}, pans: {}, emit: [], info: {} };
    if (typeof G === 'undefined' || !G || !G.p || typeof WORLD === 'undefined' || !WORLD) return out;
    const p = G.p, px = p.x, py = p.y, fx = Math.floor(px), fy = Math.floor(py), Rr = 13;
    const w = weatherOf(px, py), rain = /rain|storm/.test(w), snow = /snow|blizzard/.test(w), storm = /storm|blizzard/.test(w);
    const hour = G.hour + (G.minute || 0) / 60, night = !!G.isNight || hour < 5.2 || hour >= 20.6, day = hour >= 5.6 && hour < 19.8 && !night;
    const inside = safe(() => indoors(px, py), false);
    const season = String(G.season || '').toLowerCase(), cold = snow || /winter/.test(season) || (G.snowCover || 0) > 0.3 || (typeof G.temp === 'number' && G.temp < 4);
    const biome = typeof biomeAt === 'function' ? String(safe(() => biomeAt(px, py), '') || '') : '';
    const dist = biome && biome !== 'oldtown' ? biome : safe(() => districtAt(px, py), 'street');
    const trees = dirAcc(), water = dirAcc(), grass = dirAcc(), cars = dirAcc(), fields = dirAcc(), planks = dirAcc(), fences = dirAcc();
    const TB = typeof T_BUSH !== 'undefined' ? T_BUSH : -1, TS = typeof T_SHALLOW !== 'undefined' ? T_SHALLOW : -1, TP = typeof T_PLANK !== 'undefined' ? T_PLANK : -1;
    let solid = 0, cells = 0;
    for (let y = fy - Rr; y <= fy + Rr; y++) for (let x = fx - Rr; x <= fx + Rr; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = x + 0.5 - px, dy = y + 0.5 - py, d = Math.hypot(dx, dy); if (d > Rr) continue;
      const t = tileAt(x, y), k = 1 / (1 + d * 0.35);
      if (t === T_TREE) addDir(trees, dx, dy, k);
      else if (t === TB) addDir(trees, dx, dy, k * 0.5);
      else if (t === T_WATER || t === TS) addDir(water, dx, dy, k);
      else if (typeof T_FENCE !== 'undefined' && t === T_FENCE) addDir(fences, dx, dy, k);
      else if (t === TP) { addDir(planks, dx, dy, k); if (d < 7) addDir(cars, dx, dy, k * 0.4); }
      else if (t === T_CAR) { if (d < 7) addDir(cars, dx, dy, k); }
      else if (t === T_FIELD) { addDir(fields, dx, dy, k); if (d < 9) addDir(grass, dx, dy, k); }
      else if (t === T_GRASS && d < 9) addDir(grass, dx, dy, k);
      if (d < 3.6) { cells++; if (t === T_ROOF || t === T_WALL) solid++; }
    }
    const tt = tileAt(fx, fy);
    const wading = typeof T_SHALLOW !== 'undefined' && tt === T_SHALLOW;
    const nn = typeof World3D !== 'undefined' && World3D.natureNear ? safe(() => World3D.natureNear(px, py, 12), null) : null;
    if (nn && nn.reeds) trees.w += nn.reeds * 0.15;
    const decos = ((WORLD.decos) || []).map(o => ({ o, x: o.x + (o.w || 1) / 2, y: o.y + (o.h || 1) / 2 })).map(o => Object.assign(o, { d: Math.hypot(o.x - px, o.y - py) })).filter(o => o.d < 14);
    let openness = clamp(1 - (solid / Math.max(1, cells)) * 2.4, 0, 1);
    if (tt === T_BRIDGE) openness = Math.min(1, openness + 0.35);
    if (fields.w > 2) openness = Math.min(1, openness + 0.2);
    if (/pass|hill|ridge|mountain/.test(dist)) openness = Math.min(1, openness + 0.35);
    const wind = windFor(w) * (/pass|hill|ridge|mountain/.test(dist) ? 1.35 : 1);
    const I = out.info; Object.assign(I, { fences: +fences.w.toFixed(1), wading, moving: +moveSpd.toFixed(2), biome: biome || null, planks: +planks.w.toFixed(1), weather: w, night, day, indoors: inside, wind: +wind.toFixed(2), openness: +openness.toFixed(2), district: dist, trees: +trees.w.toFixed(1), water: water.near < 99 ? +water.near.toFixed(1) : null, grass: +grass.w.toFixed(1), cars: +cars.w.toFixed(1), season: season || null });
    const B = out.beds, Pn = out.pans, at = (dx, dy) => ({ x: +(px + dx).toFixed(1), y: +(py + dy).toFixed(1) });
    const src = (name, reason, gain, pos) => { B[name] = gain; out.emit.push({ bed: name, src: name, reason, gain: +gain.toFixed(3), at: pos || null }); };
    /* wind: outdoors only, by weather and openness */
    if (!inside && wind > 0.05) src('wind', `outdoors, ${w}, open ${openness.toFixed(2)}`, 0.5 * wind * (0.3 + 0.7 * openness));
    /* leaves: trees around + wind */
    if (trees.w > 1.2 && wind > 0.12 && !inside) { src('leaves', `${trees.w.toFixed(1)} tree weight, wind ${wind.toFixed(2)}`, 0.42 * Math.min(1, trees.w / 6) * Math.min(1, wind * 1.6), at(trees.x / trees.w * 3, trees.y / trees.w * 3)); Pn.leaves = panOf(trees.x, trees.y); }
    /* rain / snow */
    if (rain) { if (inside) src('roofrain', `${w} on the roof`, storm ? 0.6 : 0.42); else src('rain', w, storm ? 0.55 : 0.38); }
    if (snow && !inside) src('snow', w, 0.14 + wind * 0.1);
    /* water */
    if (water.near < 12) { src('water', `water ${water.near.toFixed(1)} tiles`, 0.55 * att(water.near, 12.5), at(water.nx, water.ny)); Pn.water = panOf(water.nx, water.ny); }
    /* fires */
    const fires = (typeof World3D !== 'undefined' && World3D.fires && World3D.fires.length ? World3D.fires : WORLD.fires) || [];
    const nf = [];
    for (const f of fires) { const d = Math.hypot(f.x - px, f.y - py); if (d < 12) nf.push({ f, d }); }
    nf.sort((a, b) => a.d - b.d);
    if (nf.length) {
      let g = 0, pa = 0; for (const { f, d } of nf.slice(0, 3)) { const k = att(d, 12) * (f.k || 1); g += k; pa += panOf(f.x - px, f.y - py) * k; }
      src('fire', `${nf.length} fire(s), nearest ${nf[0].d.toFixed(1)}`, 0.38 * Math.min(1, g), { x: +nf[0].f.x.toFixed(1), y: +nf[0].f.y.toFixed(1) }); Pn.fire = g > 0 ? pa / g : 0;
      for (const { f, d } of nf.slice(0, 3)) out.emit.push({ key: 'fire:' + f.x.toFixed(1) + ',' + f.y.toFixed(1), src: 'crackle', reason: `fire ${d.toFixed(1)} tiles`, x: f.x, y: f.y, gain: 0.5 * att(d, 12) * (f.k || 1), every: [0.25, 1.1 + d * 0.15] });
    }
    /* night insects: warm, dry, grass around */
    if (night && !cold && !rain && !inside && grass.w > 2.5) { src('crickets', `night, ${season || 'warm'}, grass ${grass.w.toFixed(1)}`, 0.2 * Math.min(1, grass.w / 8)); Pn.crickets = panOf(grass.x, grass.y) * 0.5; }
    /* indoors: room tone and drips */
    if (inside) { src('room', 'indoors', 0.3); out.emit.push({ key: 'drip', src: 'drip', reason: 'indoors', x: px + rand(-3, 3), y: py + rand(-3, 3), gain: 0.35, every: [2.5, 8], inside: true }); }
    /* birds by day near trees; woodpeckers and cracking branches in the woods; owls at night */
    if (day && !storm && !snow && trees.w > 2.5) out.emit.push({ key: 'birds', src: 'chirp', reason: `day, trees ${trees.w.toFixed(1)}`, x: px + trees.x / trees.w * 5, y: py + trees.y / trees.w * 5, gain: 0.32 * Math.min(1, trees.w / 6), every: [2.5, 9 - Math.min(5, trees.w * 0.5)] });
    if (day && !snow && /forest|wood/.test(dist) && trees.w > 5) out.emit.push({ key: 'woodpecker', src: 'woodpecker', reason: 'forest by day', x: px + trees.x / trees.w * 7, y: py + trees.y / trees.w * 7, gain: 0.3, every: [12, 26] });
    if (day && !snow && /forest|wood/.test(dist) && trees.w > 5) out.emit.push({ key: 'branch', src: 'crack', reason: 'forest by day', x: px + trees.x / trees.w * 6, y: py + trees.y / trees.w * 6, gain: 0.28, every: [14, 32] });
    if (night && trees.w > 3 && !rain) out.emit.push({ key: 'owl', src: 'owl', reason: `night, trees ${trees.w.toFixed(1)}`, x: px + trees.x / trees.w * 8, y: py + trees.y / trees.w * 8, gain: 0.26, every: [16, 38] });
    /* crows: by day from the crows actually sitting on the bodies in the street (World3D.crowsNear), else near fresh kills or open fields;
       a burst of calls when a flock lifts off */
    const C_ = typeof Combat !== 'undefined' ? Combat : null;
    const cn = typeof World3D !== 'undefined' && World3D.crowsNear ? safe(() => World3D.crowsNear(px, py, 16), null) : null;
    const bodies = C_ ? C_.enemies.filter(e => e.dead && !e.gone && Math.hypot(e.x - px, e.y - py) < 14) : [];
    if (cn && cn.ground.length) { const c = cn.ground[0]; out.emit.push({ key: 'crows', src: 'caw', reason: `${cn.ground.length} crow(s) on a body`, x: c.x, y: c.y, gain: 0.32, every: [6, 16] }); }
    else if (day && !storm && (bodies.length || fields.w > 4)) { const b = bodies[0]; out.emit.push({ key: 'crows', src: 'caw', reason: bodies.length ? `${bodies.length} bod${bodies.length > 1 ? 'ies' : 'y'} nearby` : 'open fields', x: b ? b.x : px + fields.x / fields.w * 8, y: b ? b.y : py + fields.y / fields.w * 8, gain: 0.3, every: [8, 20] }); }
    if (cn && cn.air && cn.flushed < 3) out.emit.push({ key: 'crowsup', src: 'caw', reason: `${cn.air} crow(s) lifting off`, x: px, y: py - 3, gain: 0.4, every: [0.3, 0.9] });
    /* rain on cars pings; wind makes wrecks creak */
    if (rain && !inside && cars.w > 0.2) out.emit.push({ key: 'pings', src: 'ping', reason: 'rain on metal', x: px + cars.nx, y: py + cars.ny, gain: 0.22 * Math.min(1, cars.w * 2), every: [0.12, 0.6] });
    if (wind > 0.35 && cars.w > 0.2) out.emit.push({ key: 'creak', src: 'creak', reason: `wind ${wind.toFixed(2)} on wrecks`, x: px + cars.nx, y: py + cars.ny, gain: 0.2, every: [9, 22] });
    /* docks: wet planks and moored metal creak in the wind, from the actual planks */
    if (planks.w > 1 && wind > 0.15 && !inside) out.emit.push({ key: 'dock', src: 'creak', reason: `dock planks ${planks.near.toFixed(1)} tiles, wind ${wind.toFixed(2)}`, x: px + planks.nx, y: py + planks.ny, gain: 0.22 * att(planks.near, 13), every: [5, 14] });
    /* a farm shed door banging in the wind, from the actual farm buildings */
    if (wind > 0.2 && fences.w > 0.3 && !inside) out.emit.push({ key: 'gate', src: 'bang', reason: `fence gate ${fences.near.toFixed(1)} tiles, wind ${wind.toFixed(2)}`, x: px + fences.nx, y: py + fences.ny, gain: 0.25 * att(fences.near, 14), every: [8, 22] });
    /* docks: cranes groan and moored boats tug their ropes, from the actual props; water slaps the piers */
    for (const o of decos) {
      if (o.o.kind === 'crane' && wind > 0.3) out.emit.push({ key: 'crane:' + o.x + ',' + o.y, src: 'crane', reason: `crane ${o.d.toFixed(1)} tiles, wind ${wind.toFixed(2)}`, x: o.x, y: o.y, gain: 0.3 * att(o.d, 14), every: [6, 16] });
      if (o.o.kind === 'boat' && o.d < 11) { out.emit.push({ key: 'rope:' + o.x + ',' + o.y, src: 'rope', reason: `moored boat ${o.d.toFixed(1)} tiles`, x: o.x, y: o.y, gain: 0.22 * att(o.d, 11), every: [4, 11] }); out.emit.push({ key: 'lap:' + o.x + ',' + o.y, src: 'lap', reason: `water against the hull ${o.d.toFixed(1)}`, x: o.x, y: o.y, gain: 0.3 * att(o.d, 11), every: [2, 5] }); }
    }
    if (planks.w > 1 && water.near < 6 && !inside) out.emit.push({ key: 'pier', src: 'lap', reason: `water against the piers ${water.near.toFixed(1)}`, x: px + water.nx, y: py + water.ny, gain: 0.3 * att(water.near, 7), every: [1.8, 4.5] });
    /* flooded quarter: sloshing while you wade, dripping around */
    if (wading && moveSpd > 0.5) out.emit.push({ key: 'slosh', src: 'slosh', reason: 'wading through shallow water', x: px, y: py, gain: 0.4, every: [0.35, 0.6] });
    if (/flooded/.test(dist) && !snow) out.emit.push({ key: 'fdrip', src: 'drip', reason: 'flooded quarter', x: px + rand(-5, 5), y: py + rand(-5, 5), gain: 0.25, every: [2, 6] });
    /* the dead: groans and shuffles from their actual positions */
    if (C_) {
      let n = 0; const live = C_.enemies.filter(e => !e.dead && Math.hypot(e.x - px, e.y - py) < 16).sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py));
      for (const e of live) {
        if (n++ >= 6) break;
        const d = Math.hypot(e.x - px, e.y - py), z = !!(e.E && e.E.z), dog = e.id === 'zdog' || (e.E && e.E.shape === 'dog'), angry = e.state === 'chase' || e.state === 'siege' || e.aware >= 1;
        if (!z && !dog) continue; // raiders and Tollmen do not groan
        if (dog) out.emit.push({ key: 'z:' + e.uid, src: angry ? 'bark' : 'growl', reason: `${e.id} ${e.state} at ${d.toFixed(1)}`, x: e.x, y: e.y, gain: 0.45 * att(d, 16), every: angry ? [1.2, 3] : [6, 14] });
        else out.emit.push({ key: 'z:' + e.uid, src: angry ? 'snarl' : 'moan', reason: `${e.id} ${e.state} at ${d.toFixed(1)}`, x: e.x, y: e.y, gain: (angry ? 0.42 : 0.5) * att(d, 16), every: angry ? [1.6, 4] : [5, 13] });
        if (d < 8 && (e.state === 'chase' || e.state === 'search' || e.state === 'sus')) out.emit.push({ key: 's:' + e.uid, src: 'shuffle', reason: `${e.id} moving at ${d.toFixed(1)}`, x: e.x, y: e.y, gain: 0.3 * att(d, 8), every: [0.9, 1.8] });
      }
    }
    /* placed events (places.js): a dog growling under the pump, the dead moaning round the corner, a radio crackling */
    if (typeof Places !== 'undefined' && Places.emitters) for (const e of Places.emitters(px, py)) out.emit.push(e);
    /* survivors at the bunker: murmurs and work, from where they stand */
    const sr = WORLD.shelterRect, nearYard = sr && px > sr.x0 - 5 && px < sr.x1 + 6 && py > sr.y0 - 5 && py < sr.y1 + 6;
    if (C_ && nearYard && C_.survivors.length) {
      const ss = C_.survivors;
      for (const s of ss) {
        const d = Math.hypot(s.x - px, s.y - py); if (d > 14) continue;
        if (ss.length > 1) out.emit.push({ key: 'm:' + s.id, src: 'murmur', reason: `${ss.length} survivors in the yard`, x: s.x, y: s.y, gain: 0.32 * att(d, 14), every: [4, 11], inside: false });
        if (s.a && s.a.action === 'work') out.emit.push({ key: 'w:' + s.id, src: s.job === 'garden' ? 'dig' : 'hammer', reason: `${s.job} work`, x: s.x, y: s.y, gain: 0.32 * att(d, 14), every: [1.2, 2.6] });
      }
    }
    /* the radio set / purifier hum at the shelter */
    if (nearYard && typeof bl === 'function' && typeof slotCentre === 'function') {
      for (const k of ['radio', 'purifier']) { if (!safe(() => bl(k), 0)) continue; const c = slotCentre(k), d = Math.hypot(c.x - px, c.y - py); if (d < 9) { src('hum', `${k} running ${d.toFixed(1)}`, 0.16 * att(d, 9), { x: c.x, y: c.y }); Pn.hum = panOf(c.x - px, c.y - py); break; } }
    }
    out.inside = inside;
    return out;
  }

  /* ---------------------------------------------------------------- per frame ---------------------------------------------------------------- */
  function running() { return typeof Game !== 'undefined' && Game.running && typeof G !== 'undefined' && G && !Game.dead; }
  function duckTarget() {
    if (!running()) return 0;
    if (typeof Cine !== 'undefined' && Cine.active) return 0.25;
    if (typeof UI !== 'undefined' && UI.blocking && safe(() => UI.blocking(), false)) return 0.45;
    if (typeof Combat !== 'undefined' && Combat.inFight && safe(() => Combat.inFight(), false)) return 0.65;
    return 1;
  }
  const muted = () => typeof SFX !== 'undefined' && SFX.on === false;
  const masterTarget = () => muted() ? 0 : A.volume * MASTER_K;
  function fire(e) {
    const p = G.p, dx = e.x - p.x, dy = e.y - p.y;
    recent.push({ src: e.src, reason: e.reason, at: { x: +e.x.toFixed(1), y: +e.y.toFixed(1) }, gain: +e.gain.toFixed(3), t: clock });
    while (recent.length > 24) recent.shift();
    if (!ctx || !started || e.gain < 0.004) return;
    /* never pile up: at most 5 one-shots per real second */
    const rt = ctx.currentTime; voiceT = voiceT.filter(t => rt - t < 1); if (voiceT.length >= 5) return; voiceT.push(rt);
    const v = voice(e.gain * (e.far ? 0.8 : 1), panOf(dx, dy), e.inside ? nodes.inG : nodes.outF, rand(0, 0.05));
    safe(() => SYN[e.src] && SYN[e.src](v));
  }
  A.init = function () {
    if (A._init) return; A._init = true;
    const first = () => { unlock(); };
    if (typeof addEventListener === 'function') for (const ev of ['keydown', 'pointerdown', 'touchstart']) addEventListener(ev, first, { capture: true, passive: true });
  };
  A.update = function (dt) {
    dt = dt || 0; clock += dt;
    const run = running();
    if (run && dt > 0) { const p = G.p; if (lastP) moveSpd += (Math.hypot(p.x - lastP.x, p.y - lastP.y) / dt - moveSpd) * Math.min(1, dt * 6); lastP = { x: p.x, y: p.y }; }
    scanT -= dt;
    if (scanT <= 0) { scanT = 0.5; scanR = run ? safe(() => scan(), null) : null; }
    const r = scanR;
    duck += (duckTarget() - duck) * Math.min(1, dt * 2.5);
    /* one-shot emitters */
    if (r && run) {
      const live = {};
      for (const e of r.emit) {
        if (!e.key) continue; live[e.key] = 1;
        if (timers[e.key] == null) timers[e.key] = rand(0.2, e.every[1]);
        timers[e.key] -= dt;
        if (timers[e.key] <= 0) { timers[e.key] = rand(e.every[0], e.every[1]); if (duck > 0.2) fire(e); }
      }
      for (const k in timers) if (!live[k]) delete timers[k];
    }
    if (!ctx || !started) return;
    const t = ctx.currentTime;
    const m = masterTarget();
    if (Math.abs(m - lastMaster) > 1e-4) { nodes.master.gain.setTargetAtTime(m, t, 0.3); lastMaster = m; }
    nodes.duckG.gain.setTargetAtTime(duck, t, 0.15);
    nodes.cueG.gain.setTargetAtTime(muted() ? 0 : 0.2, t, 0.1);
    const inside = r && r.inside;
    nodes.outF.frequency.setTargetAtTime(inside ? 520 : 18000, t, 0.25); nodes.outG.gain.setTargetAtTime(inside ? 0.55 : 1, t, 0.25);
    for (const name in beds) {
      const b = beds[name], want = r && run ? (r.beds[name] || 0) : 0;
      /* slow swells so beds breathe instead of droning */
      let g = want;
      if (name === 'wind' && want > 0) { b.sw = (b.sw || 0) + dt; g *= 0.65 + 0.35 * Math.sin(b.sw * 0.21) * Math.sin(b.sw * 0.13 + 1) + 0.2 * Math.sin(b.sw * 0.9) * (r.info.wind > 0.5 ? 1 : 0.3); if (b.chain) b.chain[0].frequency.setTargetAtTime(300 + 380 * (0.5 + 0.5 * Math.sin(b.sw * 0.17)), t, 0.5); }
      if (name === 'leaves' && want > 0) { b.sw = (b.sw || 0) + dt; g *= 0.5 + 0.5 * Math.abs(Math.sin(b.sw * 0.37) * Math.sin(b.sw * 0.11 + 2)); }
      if (name === 'water' && b.lfo) b.lfo.gain.setTargetAtTime(want * 0.45, t, 0.4);
      b.g.gain.setTargetAtTime(Math.max(0, g), t, 0.35);
      if (b.p && r && r.pans[name] != null) b.p.pan.setTargetAtTime(r.pans[name], t, 0.3);
    }
  };
  A.setVolume = function (v) { A.volume = clamp(+v || 0, 0, 1); try { localStorage.setItem(VKEY, String(A.volume)); } catch (e) { } lastMaster = -1; return A.volume; };

  /* ---------------------------------------------------------------- cinematic cues ---------------------------------------------------------------- */
  A.cue = function (name, o) {
    o = o || {};
    if (name === 'duck') return;
    if (!ctx || !started || muted()) return;
    const t0 = ctx.currentTime + 0.02, dur = o.dur || 6;
    if (name === 'stop') { for (const g of nodes.cues) { try { g.gain.cancelScheduledValues(t0); g.gain.setTargetAtTime(0, t0, 0.25); } catch (e) { } } nodes.cues = []; return; }
    const g = ctx.createGain(); g.gain.value = 0; g.connect(nodes.cueG); nodes.cues.push(g);
    const v = { g, t: t0, gain: 1 };
    const stopAt = t0 + dur + 2;
    const keep = () => { g.gain.setValueAtTime(1, t0); g.gain.setValueAtTime(1, stopAt - 0.6); g.gain.linearRampToValueAtTime(0, stopAt); };
    if (name === 'drone') {
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.5, t0 + 2.5); g.gain.setValueAtTime(0.5, t0 + dur - 1); g.gain.linearRampToValueAtTime(0, t0 + dur + 1.5);
      for (const [f, ty] of [[55, 'sawtooth'], [82.6, 'sawtooth'], [110.4, 'triangle']]) { const o1 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), og = ctx.createGain(); o1.type = ty; o1.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 240; og.gain.value = 0.22; o1.connect(lp); lp.connect(og); og.connect(g); o1.start(t0); o1.stop(t0 + dur + 2); vib(o1, 0.15, 0.6, t0, dur + 1.5); }
    } else if (name === 'swell') {
      keep(); hiss(v, t0, dur * 0.8, 0.18, 'bandpass', 300, 1400, 0.7, dur * 0.5); osc(v, 'sine', 65, 98, t0, dur * 0.9, 0.35, dur * 0.6, ['lowpass', 400]);
    } else if (name === 'static') {
      keep(); hiss(v, t0, Math.min(4, dur), 0.25, 'bandpass', 2600, 1800, 0.9, 0.2);
      for (let i = 0; i < 18; i++) hiss(v, t0 + rand(0, Math.min(4, dur)), 0.02, rand(0.2, 0.5), 'bandpass', rand(1500, 4000), null, 2);
      osc(v, 'sine', 1020, 1000, t0 + 1.2, 1.4, 0.05, 0.3);
    } else if (name === 'engine') {
      keep();
      for (let i = 0; i < 3; i++) { const t1 = t0 + 1.2 + i * 0.35; osc(v, 'sawtooth', 48, 30, t1, 0.25, 0.5, 0.01, ['lowpass', 300]); hiss(v, t1, 0.2, 0.35, 'lowpass', 700, 200, 0.7); }
      const o1 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), og = ctx.createGain(); o1.type = 'sawtooth'; o1.frequency.setValueAtTime(34, t0 + 2.3); o1.frequency.linearRampToValueAtTime(46, t0 + dur); lp.type = 'lowpass'; lp.frequency.value = 260;
      og.gain.setValueAtTime(0, t0 + 2.2); og.gain.linearRampToValueAtTime(0.4, t0 + 2.6); og.gain.setValueAtTime(0.4, t0 + dur); og.gain.linearRampToValueAtTime(0, t0 + dur + 1.5);
      o1.connect(lp); lp.connect(og); og.connect(g); o1.start(t0 + 2.2); o1.stop(t0 + dur + 1.6); vib(o1, 9, 3, t0 + 2.2, dur);
    } else if (name === 'bells') {
      keep();
      for (let i = 0; i < 6; i++) { const t1 = t0 + 0.4 + i * 1.5, f = i % 2 ? 196 : 247; for (const [m, a] of [[1, 0.5], [2.76, 0.22], [5.4, 0.1], [0.5, 0.25]]) osc(v, 'sine', f * m, f * m * 0.998, t1, 3.2 / Math.sqrt(m), a, 0.004); }
    } else if (name === 'horde') {
      keep();
      for (let i = 0; i < 12; i++) { const vv = { g, t: t0 + rand(0.5, dur - 1), gain: rand(0.12, 0.3) }; const d = rand(1.2, 2.4), f = rand(60, 110); const o1 = osc(vv, 'sawtooth', f, f * 0.8, vv.t, d, 1, 0.3, ['lowpass', rand(300, 480), 1.2]); vib(o1, rand(3, 6), 4, vv.t, d); }
    } else { g.disconnect(); }
  };

  /* ---------------------------------------------------------------- debug ---------------------------------------------------------------- */
  A.debugState = function (fresh) {
    if (fresh && running()) scanR = safe(() => scan(), scanR);
    const r = scanR || (running() ? safe(() => scan(), null) : null);
    const bedsOut = {}; if (r) for (const k in r.beds) if (r.beds[k] > 0.001) bedsOut[k] = +r.beds[k].toFixed(3);
    const srcs = r ? r.emit.map(e => ({ src: e.src, reason: e.reason, at: e.at || (e.x != null ? { x: +e.x.toFixed(1), y: +e.y.toFixed(1) } : null), gain: +(+e.gain).toFixed(3), kind: e.bed ? 'bed' : 'oneshot' })) : [];
    return Object.assign({ ready: !!(ctx && started), ctxState: ctx ? ctx.state : null, master: +masterTarget().toFixed(3), volume: A.volume, muted: muted(), duck: +duck.toFixed(2),
      beds: bedsOut, sources: srcs, recent: recent.filter(x => clock - x.t < 10).map(x => ({ src: x.src, reason: x.reason, at: x.at, gain: x.gain })) }, r ? r.info : {});
  };
  A.scan = () => scan();
  return A;
})();
