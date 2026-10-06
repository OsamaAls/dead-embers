/* ===================== RENDER: renderer, camera, light ===================== */
/* Public API (API.md §3 `R`):
     R.init(parentEl), R.scene, R.camera, R.renderer
     R.toWorld(x,y,h) -> Vector3, R.screenToTile(sx,sy) -> {x,y}|null, R.tileToScreen(x,y,h) -> {x,y,on}
     R.follow(x,y,face,snap), R.zoom(delta), R.shake(amount)
     R.setTime(hour, minute), R.setFlashlight(on, x, y, face), R.update(dt), R.render()
   Additions:
     R.pinch(scale)      pinch gesture: scale > 1 = fingers spread = zoom in.
     R.nightK            0 (full day) .. 1 (full night); R.dayK = 1 - nightK. Read by World3D for lamps and windows.
     R.time              seconds since init (animation clock).
     R.touch             true on coarse-pointer devices (lower quality settings).
     R.camDist           current camera distance in metres (zoom aware).
     R.flashK            0..1 current flashlight fade (World3D / actors may use it).
     R.lookTarget        smoothed world-space Vector3 the camera looks at.
   Weather + seasons (read from the engine every frame: weatherAt() / G.weather, G.season, G.snowCover, G.storm):
     R.env               shared shader uniforms {uSnow, uWet, uFrost, uAutumn, uBare, uWind, uTime} ({value}) used by World3D materials:
                         snow cover on up-facing surfaces, wet darkening, morning frost, autumn colour, leaf drop, wind sway.
     R.weatherK          smoothed 0..1 weights {rain, fog, snow, storm, leaves, mist} for other layers (ambience, UI).
     Precipitation is three cheap draws around the camera (rain streaks, snow flakes, falling autumn leaves), animated in the
     vertex shader. Fog distance and colour, sun strength and the sky follow the weather on top of the R.setTime day/night curve. */
const R = (() => {
  const V3 = () => new THREE.Vector3();
  const PITCH = 56 * Math.PI / 180, BASE_DIST = 27, ZMIN = 0.55, ZMAX = 1.7;
  /* Day/night keyframes: [hour, fog/background, sun colour, sun intensity, hemi sky, hemi ground, hemi intensity, nightK] */
  const KEYS = [
    [0, 0x0d111b, 0x7d93c8, 0.55, 0x34456a, 0x101116, 1.25, 1],
    [4.7, 0x0d111b, 0x7d93c8, 0.55, 0x34456a, 0x101116, 1.25, 1],
    [5.6, 0x2e2433, 0x9a7090, 0.6, 0x5c4a66, 0x18141a, 1.3, 0.75],
    [6.5, 0x8c5f58, 0xff9870, 1.9, 0xc69284, 0x2c2222, 1.55, 0.2],
    [8, 0x8d877d, 0xffd9b4, 2.7, 0xc8c0b0, 0x3a342c, 1.7, 0],
    [12, 0x9b958b, 0xfff0dc, 3.1, 0xd0c8b8, 0x3e382e, 1.8, 0],
    [16.5, 0x978b7d, 0xffe0bc, 2.8, 0xcabea8, 0x3c342a, 1.7, 0],
    [18.4, 0x86604a, 0xff8c4c, 2.3, 0xa88272, 0x2e2622, 1.55, 0.08],
    [19.4, 0x3a2a2c, 0xc8643e, 0.9, 0x544656, 0x161416, 1.3, 0.55],
    [20.3, 0x0d111b, 0x7d93c8, 0.55, 0x34456a, 0x101116, 1.25, 1],
    [24, 0x0d111b, 0x7d93c8, 0.55, 0x34456a, 0x101116, 1.25, 1],
  ];
  const cA = new THREE.Color(), cB = new THREE.Color();
  const lerpHex = (out, a, b, k) => out.copy(cA.setHex(a)).lerp(cB.setHex(b), k);
  /* critically damped spring step for one scalar (x, v) towards target */
  const spring = (x, v, to, w, dt) => {
    const f = 1 + 2 * dt * w, oo = w * w, hoo = dt * oo, hhoo = dt * hoo, inv = 1 / (f + hhoo);
    return [(f * x + dt * v + hhoo * to) * inv, (v + hoo * (to - x)) * inv];
  };

  const self = {
    scene: null, camera: null, renderer: null, target: null, lookTarget: null,
    zoomK: 1, zoomT: 1, shakeA: 0, nightK: 0, dayK: 1, time: 0, touch: false, camDist: BASE_DIST, flashK: 0,
    _ray: null, _plane: null, _snap: true, _vel: null, _face: 0, _flashOn: false, _flash: { x: 0, y: 0, face: 0 }, _lastT: -1,
    _sunDir: null, _fogNear: 30, _fogFar: 80, _shake: null, _aspect: 1, _bg: null, _hemiI: 1.7, _sunI: 3, _precip: null, _natT: 0, _trees: 0,
    env: { uSnow: { value: 0 }, uWet: { value: 0 }, uFrost: { value: 0 }, uAutumn: { value: 1 }, uBare: { value: 0.12 }, uWind: { value: 0.35 }, uTime: { value: 0 } },
    weatherK: { rain: 0, fog: 0, snow: 0, storm: 0, leaves: 0, mist: 0 },

    init(parent) {
      this.touch = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
      const r = this.renderer = new THREE.WebGLRenderer({ antialias: !this.touch, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.touch ? 1 : 1.5));
      r.shadowMap.enabled = true;
      r.shadowMap.type = this.touch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.05;
      parent.appendChild(r.domElement);

      const s = this.scene = new THREE.Scene();
      s.background = new THREE.Color(0x15120f);
      s.fog = new THREE.Fog(0x15120f, 30, 80);
      this.camera = new THREE.PerspectiveCamera(42, 1, 1, 260);

      this.hemi = new THREE.HemisphereLight(0xc8c0b0, 0x3a342c, 1.6); s.add(this.hemi);
      const sun = this.sun = new THREE.DirectionalLight(0xfff0dc, 3);
      sun.castShadow = true;
      const sm = this.touch ? 1024 : 2048;
      sun.shadow.mapSize.set(sm, sm);
      const sc = sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 140;
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
      s.add(sun); s.add(sun.target);
      /* flashlight cone + warm personal light: always in the scene (intensity 0 when off) so materials never recompile */
      const fl = this.flash = new THREE.SpotLight(0xfff1dc, 0, 24, 0.52, 0.55, 1.3);
      fl.castShadow = false; s.add(fl); s.add(fl.target);
      this.glow = new THREE.PointLight(0xffa860, 0, 11, 1.5); s.add(this.glow);

      this.target = V3(); this.lookTarget = V3(); this._vel = V3(); this._sunDir = new THREE.Vector3(0.3, 0.8, 0.45).normalize();
      this._shake = V3();
      this._ray = new THREE.Raycaster(); this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const fit = () => {
        const w = parent.clientWidth || innerWidth, h = parent.clientHeight || innerHeight;
        r.setSize(w, h); this.camera.aspect = w / h; this._aspect = w / h; this.camera.updateProjectionMatrix();
      };
      addEventListener('resize', fit);
      if (window.ResizeObserver) new ResizeObserver(fit).observe(parent);
      fit();
      this._bg = new THREE.Color(0x15120f);
      this._precip = makePrecip(s, this.touch);
      this.setTime(8, 0);
    },

    toWorld(x, y, h) { return new THREE.Vector3(x * TILE, h || 0, y * TILE); },
    follow(x, y, face, snap) { this.target.set(x * TILE, 0, y * TILE); this._face = face || 0; if (snap) this._snap = true; },
    /* wheel deltaY (pixels, |d| >= 20), small integer steps (±1), or fractional pinch deltas (|d| < 1) */
    zoom(d) {
      if (!d) return;
      const a = Math.abs(d), k = a >= 20 ? Math.exp(clamp(d, -400, 400) * 0.0011) : a >= 1 ? Math.pow(1.1, clamp(d, -5, 5)) : 1 + d;
      this.zoomT = clamp(this.zoomT * k, ZMIN, ZMAX);
    },
    pinch(scale) { if (scale > 0) this.zoomT = clamp(this.zoomT / scale, ZMIN, ZMAX); },
    shake(a) { this.shakeA = Math.min(1.5, Math.max(this.shakeA, a || 0.3)); },

    setTime(hour, minute) {
      let t = ((hour || 0) + (minute || 0) / 60) % 24; if (t < 0) t += 24;
      if (Math.abs(t - this._lastT) < 0.003) return;
      this._lastT = t; this.hour = t;
      let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++;
      const a = KEYS[i], b = KEYS[i + 1], k = clamp((t - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1);
      const s = this.scene;
      lerpHex(this._bg, a[1], b[1], k); s.background.copy(this._bg); s.fog.color.copy(this._bg);
      lerpHex(this.sun.color, a[2], b[2], k); this._sunI = a[3] + (b[3] - a[3]) * k;
      lerpHex(this.hemi.color, a[4], b[4], k); lerpHex(this.hemi.groundColor, a[5], b[5], k);
      this.hemi.intensity = this._hemiI = a[6] + (b[6] - a[6]) * k;
      this.nightK = a[7] + (b[7] - a[7]) * k; this.dayK = 1 - this.nightK;
      /* sun arcs east -> south -> west; the moon hangs high in the south-west */
      const ang = clamp((t - 5.5) / 14, 0, 1) * Math.PI;
      const sunD = new THREE.Vector3(Math.cos(ang) * 0.85, 0.28 + Math.sin(ang) * 0.85, 0.42).normalize();
      const moonD = new THREE.Vector3(-0.35, 0.85, 0.4).normalize();
      this._sunDir.copy(sunD).lerp(moonD, this.nightK).normalize();
      this.sun.intensity = this._sunI;
    },

    setFlashlight(on, x, y, face) { this._flashOn = !!on; this._flash.x = x; this._flash.y = y; this._flash.face = face || 0; },

    update(dt) {
      dt = Math.min(dt || 0, 0.1); this.time += dt;
      const cam = this.camera;
      /* zoom smoothing, portrait screens sit a bit further back so the play area stays wide enough */
      this.zoomK += (this.zoomT - this.zoomK) * (1 - Math.exp(-dt * 10));
      const dist = this.camDist = BASE_DIST * this.zoomK * (this._aspect < 0.8 ? 1.3 : 1);
      /* look-ahead in the facing direction (face = atan2(dx, dy) in tile space; +y tile = +z world) */
      const la = 1.4 * Math.min(1.3, this.zoomK);
      const want = this.target.clone(); want.x += Math.sin(this._face) * la; want.z += Math.cos(this._face) * la;
      const L = this.lookTarget, v = this._vel;
      if (this._snap || dt === 0) { L.copy(want); v.set(0, 0, 0); this._snap = false; }
      else {
        let r = spring(L.x, v.x, want.x, 6.5, dt); L.x = r[0]; v.x = r[1];
        r = spring(L.z, v.z, want.z, 6.5, dt); L.z = r[0]; v.z = r[1];
        L.y = 0;
      }
      /* shake decays exponentially */
      this.shakeA *= Math.exp(-dt * 7); if (this.shakeA < 0.002) this.shakeA = 0;
      const sa = this.shakeA * 0.6;
      this._shake.set((Math.random() - 0.5) * sa, (Math.random() - 0.5) * sa * 0.6, (Math.random() - 0.5) * sa);
      cam.position.set(L.x, Math.sin(PITCH) * dist, L.z + Math.cos(PITCH) * dist).add(this._shake);
      cam.lookAt(L.x + this._shake.x * 0.5, 0.6, L.z + this._shake.z * 0.5);
      cam.updateMatrixWorld();

      /* fog follows zoom; night closes it in; the weather closes it further */
      const n = this.nightK, f = this.scene.fog;
      const wk = this._weather(dt, L);
      const fogK = 1 - 0.62 * wk.fog - 0.22 * wk.rain - 0.25 * wk.snow - 0.3 * wk.storm - 0.25 * wk.mist;
      /* never fog out the player: the camera sits ~dist away, keep far beyond it */
      f.near = Math.max(dist * 0.62, dist * (0.95 - 0.35 * n) * Math.max(0.25, fogK - 0.1 * wk.fog)); f.far = Math.max(dist * 1.32, dist * (2.5 - 0.85 * n) * Math.max(0.36, fogK));

      /* shadow camera: tight box around the look target, snapped to shadow texels to avoid shimmer */
      const half = 20 + 6 * clamp(this.zoomK - 1, -0.4, 0.7);
      const sc = this.sun.shadow.camera;
      if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
      const d = this._sunDir, fwd = d.clone().negate();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      if (right.lengthSq() < 0.01) right.set(1, 0, 0);
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const texel = (half * 2) / this.sun.shadow.mapSize.x;
      const T = L.clone(), rx = T.dot(right), uy = T.dot(up);
      T.addScaledVector(right, Math.round(rx / texel) * texel - rx).addScaledVector(up, Math.round(uy / texel) * texel - uy);
      this.sun.target.position.copy(T); this.sun.position.copy(T).addScaledVector(d, 60);
      this.sun.target.updateMatrixWorld();

      /* flashlight + warm personal light fade */
      this.flashK += ((this._flashOn ? 1 : 0) - this.flashK) * (1 - Math.exp(-dt * 7));
      const F = this._flash, fx = F.x * TILE, fz = F.y * TILE, sx = Math.sin(F.face), sz = Math.cos(F.face);
      const flick = 0.97 + Math.sin(this.time * 23) * 0.015 + Math.sin(this.time * 7.3) * 0.015;
      this.flash.intensity = this.flashK * (70 + 50 * n) * flick;
      this.flash.position.set(fx + sx * 0.25, 1.35, fz + sz * 0.25);
      this.flash.target.position.set(fx + sx * 7, 0, fz + sz * 7); this.flash.target.updateMatrixWorld();
      this.glow.intensity = this.flashK * (2.2 + 4.5 * n);
      this.glow.position.set(fx, 2.4, fz);
    },

    /* weather + season: smooth weights, sky/fog colour and light on top of the day curve, shader uniforms, precipitation */
    _weather(dt, L) {
      const g = typeof G !== 'undefined' && G ? G : null, K = this.weatherK, E = this.env;
      const w = g ? ((typeof weatherAt === 'function' ? weatherAt(g.p.x, g.p.y) : g.weather) || 'clear') : 'clear';
      const season = g ? (g.season || 'autumn') : 'autumn', storm = !!(g && g.storm), inside = g && typeof indoors === 'function' ? indoors(g.p.x, g.p.y) : false;
      const biome = g && typeof biomeAt === 'function' ? biomeAt(g.p.x, g.p.y) : '';
      /* trees nearby make the autumn leaves fall (checked once a second) */
      this._natT -= dt;
      if (this._natT <= 0) { this._natT = 1; try { const nn = typeof World3D !== 'undefined' && World3D.natureNear && g ? World3D.natureNear(g.p.x, g.p.y, 9) : null; this._trees = nn ? nn.trees + nn.bushes * 0.3 : 0; } catch (e) { this._trees = 0; } }
      const ap = (k, to, rate) => { K[k] += (to - K[k]) * (1 - Math.exp(-dt * rate)); };
      ap('rain', w === 'rain' ? 1 : 0, 0.5); ap('fog', w === 'fog' ? 1 : 0, 0.35); ap('snow', w === 'snow' ? 1 : 0, 0.5); ap('storm', storm ? 1 : 0, 0.4);
      ap('mist', biome === 'flooded' ? 1 : 0, 0.6);
      ap('leaves', season !== 'winter' && w !== 'snow' ? clamp(this._trees / 10, 0, 1) * (season === 'autumn' ? 1 : 0.6) : 0, 0.5);
      /* shader uniforms */
      const h = this.hour == null ? 12 : this.hour, morning = clamp(1 - Math.abs(h - 7) / 3.2, 0, 1);
      const tgt = {
        uAutumn: season === 'winter' ? 0.55 : season === 'late' ? 0.9 : 1, uBare: season === 'winter' ? 0.93 : season === 'late' ? 0.68 : 0.14,
        uFrost: season === 'late' ? 0.85 * morning + 0.1 * this.nightK : season === 'winter' ? 0.3 + 0.4 * morning : 0, uSnow: g ? clamp(g.snowCover || 0, 0, 1) : 0,
        uWind: 0.3 + 0.35 * K.rain + 0.25 * K.snow + 1.3 * K.storm - 0.15 * K.fog,
      };
      for (const k in tgt) E[k].value += (tgt[k] - E[k].value) * (1 - Math.exp(-dt * (k === 'uWind' ? 0.8 : 0.35)));
      E.uWet.value = clamp(E.uWet.value + dt * (K.rain > 0.3 ? 0.08 * K.rain : -0.012), 0, 1);
      E.uTime.value = this.time;
      /* sky + fog colour: overcast greys of the same brightness; the mist hangs over the flood */
      const bg = this._bg, lum = Math.max(0.02, bg.r * 0.3 + bg.g * 0.59 + bg.b * 0.11), mixK = clamp(K.rain * 0.5 + K.fog * 0.75 + K.snow * 0.55 + K.storm * 0.2 + K.mist * 0.3, 0, 0.9);
      const grey = cA.setRGB(0.52, 0.56, 0.6).multiplyScalar(lum / 0.55 * (1 + 0.25 * K.snow));
      this.scene.background.copy(bg).lerp(grey, mixK); this.scene.fog.color.copy(this.scene.background);
      const dim = 1 - 0.5 * K.rain - 0.55 * K.fog - 0.4 * K.snow - 0.2 * K.storm;
      this.sun.intensity = this._sunI * Math.max(0.25, dim); this.hemi.intensity = this._hemiI * (1 + 0.08 * (K.fog + K.snow));
      /* precipitation */
      const P = this._precip;
      if (P) {
        for (const m of [P.rain, P.snow, P.leaf]) { m.material.uniforms.uT.value = this.time; m.material.uniforms.uCenter.value.set(L.x, 0, L.z); }
        const rainA = K.rain * (inside ? 0.25 : 1), snowA = K.snow * (inside ? 0.2 : 1), leafA = K.leaves * (inside ? 0 : 1);
        P.rain.visible = rainA > 0.02; P.rain.material.uniforms.uOpacity.value = 0.42 * rainA;
        P.snow.visible = snowA > 0.02; P.snow.material.uniforms.uOpacity.value = 0.9 * snowA; P.snow.material.uniforms.uWind.value = 0.5 + 3.2 * K.storm;
        P.snow.material.uniforms.uDensity.value = clamp((season === 'winter' ? 0.75 : 0.45) + K.storm, 0, 1);
        P.leaf.visible = leafA > 0.02; P.leaf.material.uniforms.uOpacity.value = leafA;
      }
      return K;
    },

    render() { this.renderer.render(this.scene, this.camera); },


    screenToTile(sx, sy) {
      const el = this.renderer.domElement, rc = el.getBoundingClientRect();
      this._ray.setFromCamera(new THREE.Vector2((sx - rc.left) / rc.width * 2 - 1, -((sy - rc.top) / rc.height) * 2 + 1), this.camera);
      const p = V3(); return this._ray.ray.intersectPlane(this._plane, p) ? { x: p.x / TILE, y: p.z / TILE } : null;
    },
    tileToScreen(x, y, h) {
      const v = new THREE.Vector3(x * TILE, h || 0, y * TILE).project(this.camera), rc = this.renderer.domElement.getBoundingClientRect();
      return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height, on: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
    },
  };
  /* rain streaks (line pairs), snow flakes and falling leaves (points): positions wrap around the camera in the vertex shader */
  function makePrecip(scene, touch) {
    const BOX = new THREE.Vector3(46, 24, 46);
    const mk = (n, pairs) => {
      const g = new THREE.BufferGeometry(), k = pairs ? 2 : 1, p = new Float32Array(n * 3 * k), e = new Float32Array(n * k), r = new Float32Array(n * k);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * BOX.x, y = Math.random() * BOX.y, z = Math.random() * BOX.z, rv = Math.random();
        for (let j = 0; j < k; j++) { p.set([x, y, z], (i * k + j) * 3); e[i * k + j] = j; r[i * k + j] = rv; }
      }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(e, 1)); g.setAttribute('aR', new THREE.BufferAttribute(r, 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      return g;
    };
    const common = `uniform float uT; uniform vec3 uCenter; uniform vec3 uBox; attribute float aEnd; attribute float aR; varying float vR;
vec3 wrapP(vec3 p) { vec3 w; w.y = p.y; w.xz = uCenter.xz - uBox.xz * 0.5 + mod(p.xz - (uCenter.xz - uBox.xz * 0.5), uBox.xz); return w; }
`;
    const uni = o => Object.assign({ uT: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: BOX }, uOpacity: { value: 0 } }, o || {});
    const rain = new THREE.LineSegments(mk(touch ? 700 : 1600, true), new THREE.ShaderMaterial({
      uniforms: uni(), transparent: true, depthWrite: false,
      vertexShader: common + `void main() { vR = aR; vec3 p = position; p.y = mod(p.y - uT * (17.0 + aR * 6.0), uBox.y); vec3 w = wrapP(p); w.x += w.y * 0.12;
  if (aEnd > 0.5) { w.y += 0.75; w.x += 0.09; } gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
      fragmentShader: `uniform float uOpacity; varying float vR; void main() { gl_FragColor = vec4(0.72, 0.78, 0.86, uOpacity * (0.5 + 0.5 * vR)); }`,
    }));
    const snow = new THREE.Points(mk(touch ? 800 : 1800, false), new THREE.ShaderMaterial({
      uniforms: uni({ uWind: { value: 0.5 }, uDensity: { value: 1 } }), transparent: true, depthWrite: false,
      vertexShader: common + `uniform float uWind; uniform float uDensity; varying float vK;
void main() { vR = aR; vK = step(aR, uDensity); vec3 p = position; p.y = mod(p.y - uT * (1.6 + aR * 1.2) * (1.0 + uWind * 0.35), uBox.y);
  p.x += uT * uWind * 2.2 + sin(uT * 0.9 + aR * 40.0) * 0.6; p.z += cos(uT * 0.7 + aR * 23.0) * 0.5;
  vec3 w = wrapP(p); vec4 mv = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp((0.09 + aR * 0.08) * 300.0 / -mv.z, 1.0, 9.0); }`,
      fragmentShader: `uniform float uOpacity; varying float vR; varying float vK; void main() { if (vK < 0.5) discard; vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)); gl_FragColor = vec4(0.94, 0.96, 1.0, a * uOpacity); }`,
    }));
    const leaf = new THREE.Points(mk(touch ? 40 : 90, false), new THREE.ShaderMaterial({
      uniforms: uni(), transparent: true, depthWrite: false,
      vertexShader: common + `varying float vS;
void main() { vR = aR; vec3 p = position; p.y = mod(p.y * 0.55 - uT * (0.9 + aR * 0.6), uBox.y * 0.55);
  p.x += sin(uT * 1.3 + aR * 30.0) * 1.2 + uT * 0.6; p.z += cos(uT * 1.1 + aR * 17.0) * 0.8;
  vec3 w = wrapP(p); vec4 mv = viewMatrix * vec4(w, 1.0); vS = sin(uT * (3.0 + aR * 4.0) + aR * 9.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(0.32 * 300.0 / -mv.z, 2.0, 14.0); }`,
      fragmentShader: `uniform float uOpacity; varying float vR; varying float vS;
void main() { vec2 c = gl_PointCoord - 0.5; c.x /= max(0.25, abs(vS)); float a = smoothstep(0.5, 0.3, length(c * vec2(1.0, 1.7))); if (a < 0.05) discard;
  vec3 col = mix(vec3(0.62, 0.3, 0.08), vec3(0.75, 0.55, 0.12), vR); gl_FragColor = vec4(col * (0.7 + 0.3 * abs(vS)), a * uOpacity); }`,
    }));
    for (const m of [rain, snow, leaf]) { m.frustumCulled = false; m.visible = false; m.renderOrder = 5; scene.add(m); }
    return { rain, snow, leaf };
  }
  return self;
})();

