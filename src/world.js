/* ===================== WORLD 3D: the static city built from WORLD ===================== */
/* Public API (API.md §3 `World3D`):
     build(), update(dt, px, py), containerMesh(id), setContainerOpened(id, bool), refreshShelter(), highlight(kind, id), barricade {x0,y0,x1,y1}.
   Additions:
     World3D.setObjective(target)   The beacon is automatic: update() reads objectiveInfo() 4x a second and shows a light pillar at its target.
                                    setObjective({x,y}) pins it to that tile point, setObjective(false) hides it, setObjective(null) = automatic again.
     World3D.marker(key, pos, hex)  Extra ground beacon for moments (race goal, rescue target). pos {x,y} in tiles; pos null removes it.
     World3D.highlight('point', {x,y})  Ember ring at any tile point (besides 'container' and 'slot').
     World3D.barricade.level        Walls level 0..3 (the ring is also set when level is 0, so horde code always has geometry).
     World3D.heightAt(i)            Roof height in metres of WORLD.roofs[i].
     World3D.cutBuilding            Index of the building cut away because the player is inside, or -1.
     World3D.fires                  [{x,y}] tile positions of burning barrels / camp fires.
   How the city is drawn:
     Static geometry is merged into 32 m chunks (frustum culled, one draw each): 'solid' (casts shadows) and 'ground'.
     Trees, cars, lamps, grass and crop stalks are InstancedMeshes. Containers are two merged meshes (bodies, lids/doors).
     A material patch adds: per-vertex glow (lamps, lit windows, fires), the roof/upper-wall cutaway for the building the
     player stands in (shader discard above a height, back faces drawn as a flat dark cap), and a dithered see-through hole
     around the player for anything between the camera and the player. */
const World3D = (() => {
  /* ---------- shared uniforms + material patch ---------- */
  const U = {
    uHole: { value: new THREE.Vector4(-1e4, -1e4, 0, 0) },
    uCutId: { value: -1 }, uCutH: { value: 99 },
    uCap: { value: new THREE.Vector3(0.22, 0.2, 0.18) },
    uGlowA: { value: 1 }, uGlowN: { value: 0 },
  };
  const FRAG_DISCARD = `
#ifdef DE_CUT
  if (vDeBid > 0.5 && abs(vDeBid - uCutId) < 0.5 && vDeW.y > uCutH) discard;
#endif
#ifdef DE_HOLE
  {
#ifdef DE_HOLEALL
    float deEl = 1.0;
#else
    float deEl = step(0.5, vDeBid);
#endif
    if (deEl > 0.5 && vDeW.y > 1.5 && vDeVZ < uHole.w - 0.8) {
      float deF = (1.0 - smoothstep(uHole.z * 0.45, uHole.z, distance(gl_FragCoord.xy, uHole.xy))) * clamp((vDeW.y - 1.5) * 1.2, 0.0, 1.0);
      if (deF > fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;
    }
  }
#endif
`;
  function deMat(flags, params) {
    const m = new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true, flatShading: true }, params || {}));
    const D = {};
    if (flags.includes('x')) D.DE_CUT = '';
    if (flags.includes('h')) D.DE_HOLE = '';
    if (flags.includes('a')) { D.DE_HOLE = ''; D.DE_HOLEALL = ''; }
    if (flags.includes('c')) D.DE_CAP = '';
    m.defines = D;
    m.onBeforeCompile = sh => {
      for (const k in U) sh.uniforms[k] = U[k];
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 glow; attribute float bid;\nvarying vec2 vDeGlow; varying float vDeBid; varying vec3 vDeW; varying float vDeVZ;')
        .replace('#include <fog_vertex>', `#include <fog_vertex>
  vec4 deW = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  deW = instanceMatrix * deW;
#endif
  deW = modelMatrix * deW; vDeW = deW.xyz; vDeVZ = -mvPosition.z; vDeGlow = glow; vDeBid = bid;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uHole; uniform float uCutId; uniform float uCutH; uniform vec3 uCap; uniform float uGlowA; uniform float uGlowN;\nvarying vec2 vDeGlow; varying float vDeBid; varying vec3 vDeW; varying float vDeVZ;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAG_DISCARD)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * (vDeGlow.x * uGlowA + vDeGlow.y * uGlowN);')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n#ifdef DE_CAP\n  if (!gl_FrontFacing) gl_FragColor = vec4(uCap, 1.0);\n#endif');
    };
    m.customProgramCacheKey = () => 'de-' + flags;
    return m;
  }

  /* ---------- deterministic randomness + noise ---------- */
  let rr = Math.random, NSEED = 1;
  const rf = (a, b) => a + (b - a) * rr();
  const rpick = a => a[Math.floor(rr() * a.length)];
  const hash = (x, y) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + NSEED) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const sm = t => t * t * (3 - 2 * t);
  const vnoise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = sm(x - ix), fy = sm(y - iy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const fbm = (x, y) => vnoise(x, y) * 0.65 + vnoise(x * 2.7 + 13.1, y * 2.7 + 7.3) * 0.35;
  const col = (hex, v) => { const c = new THREE.Color(hex); if (v) c.multiplyScalar(1 + (rr() - 0.5) * v); return c; };
  const mixc = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(k, 0, 1));

  /* ---------- geometry templates + merge builder ---------- */
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _ps = new THREE.Vector3(), _sc = new THREE.Vector3(), _n3 = new THREE.Matrix3();
  const _Y = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
  function M(x, y, z, ry, sx, sy, sz, rx, rz) { _e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q.setFromEuler(_e); return _m.compose(_ps.set(x, y, z), _q, _sc.set(sx, sy, sz)); }
  function convex(v, cx, cy, cz) {
    for (let i = 0; i < v.length; i += 9) {
      const ux = v[i + 3] - v[i], uy = v[i + 4] - v[i + 1], uz = v[i + 5] - v[i + 2], wx = v[i + 6] - v[i], wy = v[i + 7] - v[i + 1], wz = v[i + 8] - v[i + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const mx = (v[i] + v[i + 3] + v[i + 6]) / 3 - cx, my = (v[i + 1] + v[i + 4] + v[i + 7]) / 3 - cy, mz = (v[i + 2] + v[i + 5] + v[i + 8]) / 3 - cz;
      if (nx * mx + ny * my + nz * mz < 0) for (let k = 0; k < 3; k++) { const t = v[i + 3 + k]; v[i + 3 + k] = v[i + 6 + k]; v[i + 6 + k] = t; }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
  }
  /* triangular prism: cross-section A(-.5,0) B(.5,0) C(rx,1) in x/y, extruded z -.5...5. Faces (6 verts each): slope AC, slope CB, bottom, both ends */
  function prism(rx) {
    const A = [-0.5, 0], B = [0.5, 0], C = [rx, 1], P = (p, z) => [p[0], p[1], z];
    const quad = (p, q) => [...P(p, -0.5), ...P(q, -0.5), ...P(q, 0.5), ...P(p, -0.5), ...P(q, 0.5), ...P(p, 0.5)];
    return convex([...quad(A, C), ...quad(C, B), ...quad(A, B), ...P(A, 0.5), ...P(B, 0.5), ...P(C, 0.5), ...P(A, -0.5), ...P(B, -0.5), ...P(C, -0.5)], rx / 3, 1 / 3, 0);
  }
  let G_BOX, G_CYL6, G_CYL8, G_CYL12, G_CONE5, G_CONE7, G_ICO, G_DOD, G_TOR, G_PRISM, G_PRISM_R, G_BLADES;
  function templates() {
    if (G_BOX) return;
    G_BOX = new THREE.BoxGeometry(1, 1, 1);
    G_CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6); G_CYL8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8); G_CYL12 = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
    G_CONE5 = new THREE.ConeGeometry(0.5, 1, 5); G_CONE7 = new THREE.ConeGeometry(0.5, 1, 7);
    G_ICO = new THREE.IcosahedronGeometry(0.5, 0); G_DOD = new THREE.DodecahedronGeometry(0.5, 0);
    G_TOR = new THREE.TorusGeometry(0.38, 0.14, 4, 8);
    G_PRISM = prism(0); G_PRISM_R = prism(0.5);
    /* a tuft of 5 grass blades (single triangles, drawn double sided) */
    const v = [];
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3 + 0.4, h = 0.32 + (k % 3) * 0.12, lx = Math.cos(a) * 0.12, lz = Math.sin(a) * 0.12, px = -Math.sin(a) * 0.035, pz = Math.cos(a) * 0.035;
      v.push(px, 0, pz, -px, 0, -pz, lx, h, lz);
    }
    G_BLADES = new THREE.BufferGeometry(); G_BLADES.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); G_BLADES.computeVertexNormals();
    const cb = []; for (let i = 0; i < v.length / 3; i++) { const k = v[i * 3 + 1] > 0 ? 1 : 0.55; cb.push(k, k, k); }
    G_BLADES.setAttribute('color', new THREE.Float32BufferAttribute(cb, 3));
  }
  function tplOf(geo) {
    if (geo._de) return geo._de;
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    const c = g.attributes.color ? g.attributes.color.array : null, gl = g.attributes.glow ? g.attributes.glow.array : null;
    let minY = Infinity, maxY = -Infinity; for (let i = 1; i < p.length; i += 3) { if (p[i] < minY) minY = p[i]; if (p[i] > maxY) maxY = p[i]; }
    return (geo._de = { p, n, c, gl, count: p.length / 3, minY, maxY });
  }
  const WHITE = new THREE.Color(1, 1, 1), NOOPT = {};
  class Bld {
    constructor() { this.p = []; this.n = []; this.c = []; this.g = []; this.b = []; }
    get count() { return this.p.length / 3; }
    /* add a template transformed by matrix m. col: Color|hex|null. o: {fc:[face colours|null=skip], fsz, grad, glow:[always,night], bid} */
    add(geo, m, colr, o) {
      const t = tplOf(geo); o = o || NOOPT;
      const e = m.elements; _n3.getNormalMatrix(m); const ne = _n3.elements;
      const base = colr == null ? WHITE : (typeof colr === 'number' ? new THREE.Color(colr) : colr);
      const fc = o.fc, fsz = o.fsz || 6, grad = o.grad, g0 = o.glow ? o.glow[0] : 0, g1 = o.glow ? o.glow[1] : 0, bid = o.bid || 0;
      const span = (t.maxY - t.minY) || 1, P = this.p, N = this.n, Cc = this.c, Gg = this.g, Bb = this.b;
      for (let i = 0; i < t.count; i++) {
        let r = base.r, g = base.g, b = base.b;
        if (fc) {
          const f = fc[Math.floor(i / fsz)];
          if (f === null) { i += fsz - 1; continue; }
          if (f !== undefined) { r = f.r; g = f.g; b = f.b; }
        }
        const i3 = i * 3, x = t.p[i3], y = t.p[i3 + 1], z = t.p[i3 + 2];
        P.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
        const nx = t.n[i3], ny = t.n[i3 + 1], nz = t.n[i3 + 2];
        const ox = ne[0] * nx + ne[3] * ny + ne[6] * nz, oy = ne[1] * nx + ne[4] * ny + ne[7] * nz, oz = ne[2] * nx + ne[5] * ny + ne[8] * nz, l = Math.hypot(ox, oy, oz) || 1;
        N.push(ox / l, oy / l, oz / l);
        if (t.c) { r *= t.c[i3]; g *= t.c[i3 + 1]; b *= t.c[i3 + 2]; }
        if (grad) { const k = grad + (1 - grad) * (y - t.minY) / span; r *= k; g *= k; b *= k; }
        Cc.push(r, g, b);
        if (t.gl) Gg.push(t.gl[i * 2] + g0, t.gl[i * 2 + 1] + g1); else Gg.push(g0, g1);
        Bb.push(bid);
      }
      return this;
    }
    geo(geo, x, y, z, sx, sy, sz, c, o) { return this.add(geo, M(x, y, z, o && o.ry, sx, sy, sz, o && o.rx, o && o.rz), c, o); }
    /* box with its bottom at y (before rotation) */
    box(x, y, z, sx, sy, sz, c, o) { return this.geo(G_BOX, x, y + sy / 2, z, sx, sy, sz, c, o); }
    /* a box stretched between two points */
    beam(ax, ay, az, bx, by, bz, th, c, o) {
      _d.set(bx - ax, by - ay, bz - az); const len = _d.length() || 0.001; _d.divideScalar(len);
      _q.setFromUnitVectors(_Y, _d); _m.compose(_ps.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _sc.set(th, len, th));
      return this.add(G_BOX, _m, c, o);
    }
    /* flat ground quad, colours at (x0,z0) (x1,z0) (x0,z1) (x1,z1) */
    quad(x0, z0, x1, z1, y, a, b, c, d) {
      this.p.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
      for (let i = 0; i < 6; i++) { this.n.push(0, 1, 0); this.g.push(0, 0); this.b.push(0); }
      for (const q of [a, c, d, a, d, b]) this.c.push(q.r, q.g, q.b);
      return this;
    }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('glow', new THREE.Float32BufferAttribute(this.g, 2));
      g.setAttribute('bid', new THREE.Float32BufferAttribute(this.b, 1));
      if (this.p.length) { g.computeBoundingSphere(); g.computeBoundingBox(); }
      return g;
    }
  }

  /* ---------- chunked static geometry ---------- */
  const CHM = 32;
  let chunkMap = {};
  const chunk = (cat, x, z) => { const k = cat + ':' + Math.floor(x / CHM) + ',' + Math.floor(z / CHM); return chunkMap[k] || (chunkMap[k] = new Bld()); };
  const router = cat => ({
    add(geo, m, c, o) { chunk(cat, m.elements[12], m.elements[14]).add(geo, m, c, o); },
    geo(geo, x, y, z, sx, sy, sz, c, o) { chunk(cat, x, z).geo(geo, x, y, z, sx, sy, sz, c, o); },
    box(x, y, z, sx, sy, sz, c, o) { chunk(cat, x, z).box(x, y, z, sx, sy, sz, c, o); },
    beam(ax, ay, az, bx, by, bz, th, c, o) { chunk(cat, (ax + bx) / 2, (az + bz) / 2).beam(ax, ay, az, bx, by, bz, th, c, o); },
    quad(x0, z0, x1, z1, y, a, b, c, d) { chunk(cat, (x0 + x1) / 2, (z0 + z1) / 2).quad(x0, z0, x1, z1, y, a, b, c, d); },
  });
  const S = router('s'), GD = router('g');

  /* ---------- palette ---------- */
  const PAL = {
    soot: 0x1c1a17, dark: 0x141210, steel: 0x3c3e40, rust: 0x7a4428, wood: 0x6a4e34, wood2: 0x4e3a28, concrete: 0x86827a, cap: 0x5e5a54,
    glass: 0x1c2024, trim: 0x2e2a26, ember: 0xff8a3a, fire: 0xffb050, lamp: 0xffc27a, tarp: 0x3e4a56, sand: 0x8a7a5a, olive: 0x4e5636,
  };
  const BST = {
    street: { h: 3.4, wall: 0x75624f, inner: 0x8c7c68, roof: 'gable', roofC: 0x4c3e36, floor: 'wood', band: 0x7a3a26, shop: true },
    hospital: { h: 7.4, wall: 0xa09e96, inner: 0xaaaca6, roof: 'flat', roofC: 0x4a4844, floor: 'tile', band: 0x8a2a24, cross: true },
    apartments: { h: 9.8, wall: 0x80584a, inner: 0x8e8270, roof: 'flat', roofC: 0x3c3834, floor: 'wood', bands: true, balcony: true, tank: true },
    supermarket: { h: 4.8, wall: 0x928676, inner: 0x9c988c, roof: 'flat', roofC: 0x45423e, floor: 'tile', band: 0x8e3222, shop: true, sign: 0xd8c8a0 },
    police: { h: 5.0, wall: 0x545a60, inner: 0x7a7e80, roof: 'flat', roofC: 0x3a3c3e, floor: 'tile', band: 0x2c3c66, sign: 0xb0b8c8 },
    military: { h: 3.8, wall: 0x585e46, inner: 0x6a6c5c, roof: 'flat', roofC: 0x41463a, floor: 'concrete', slits: true, sandbags: true },
    gas: { h: 3.9, wall: 0x8e887c, inner: 0x9a968c, roof: 'flat', roofC: 0x44423e, floor: 'tile', band: 0xa64c1a, shop: true, sign: 0xe0a040 },
    factory: { h: 6.6, wall: 0x70503a, inner: 0x6a645a, roof: 'saw', roofC: 0x5a4a3e, floor: 'concrete', strip: true, chimney: true, ribs: true },
    farm: { h: 4.2, wall: 0x6e3428, inner: 0x6e5a44, roof: 'gable', roofC: 0x6e4a32, floor: 'hay', ribs: true },
    electronics: { h: 4.4, wall: 0x5e6a66, inner: 0x8a8e88, roof: 'flat', roofC: 0x3e4240, floor: 'tile', band: 0x2a6a7c, shop: true, sign: 0x9ad0d8 },
    radiotower: { h: 3.8, wall: 0x7e7e76, inner: 0x8a8a82, roof: 'flat', roofC: 0x45453f, floor: 'concrete', mast: true },
    depot: { h: 5.8, wall: 0x726e66, inner: 0x7a766c, roof: 'flat', roofC: 0x43413c, floor: 'concrete', band: 0xb0902a, strip: true, garage: true },
    tollcamp: { h: 5.2, wall: 0x403c38, inner: 0x403c38, roof: 'flat', roofC: 0x2a2826, floor: 'concrete', ribs: true, flags: true },
  };

  /* ---------- module state ---------- */
  let root = null, shelterGroup = null, owned = [], heights = [], bIdx = null, conts = {}, contGeo = null, lidGeo = null, contObjs = null;
  let mats = null, water = null, waterBase = null, ash = null, sparks = null, lampPools = null, firePools = null, firePoolBase = 0;
  let beacon = null, hl = null, ghostMesh = null, ghostIcons = null, ghostSlots = [], markers = {}, busMesh = null, busReady = null;
  let carAt = {}, objT = 0, objOverride = null, objAuto = null, cutId = -1, cutH = 99, tAcc = 0, fires = [], hlState = { kind: null, id: null };
  const own = o => { owned.push(o); return o; };

  function materials() {
    if (mats) return mats;
    const radial = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
    })();
    const hammer = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      x.fillStyle = 'rgba(20,14,10,0.75)'; x.beginPath(); x.arc(32, 32, 29, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#ff9a4a'; x.lineWidth = 4; x.stroke();
      x.translate(32, 32); x.rotate(-0.75); x.fillStyle = '#ffd0a0';
      x.fillRect(-3, -6, 6, 26); x.fillRect(-12, -16, 24, 10); x.fillStyle = '#ff9a4a'; x.fillRect(8, -16, 5, 10);
      return new THREE.CanvasTexture(c);
    })();
    hammer.colorSpace = THREE.SRGBColorSpace;
    const add = (o) => new THREE.MeshBasicMaterial(Object.assign({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }, o));
    mats = {
      solid: deMat('xhc', { side: THREE.DoubleSide }),
      ground: new THREE.MeshLambertMaterial({ vertexColors: true }),
      inst: deMat(''),
      tree: deMat('a'),
      cont: deMat(''),
      grass: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      water: new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 70, specular: 0x5a6670 }),
      pool: add({ map: radial, color: 0xffa860, opacity: 0.5 }),
      firePool: add({ map: radial, color: 0xff8a3a, opacity: 0.6 }),
      beam: add({ vertexColors: true, side: THREE.DoubleSide, opacity: 0.8 }),
      ring: add({ color: 0xff8a3a, side: THREE.DoubleSide, opacity: 0.8 }),
      ghost: add({ color: 0xff7a2a, opacity: 0.6 }),
      icon: new THREE.MeshBasicMaterial({ map: hammer, transparent: true, depthWrite: false, fog: false }),
      hull: new THREE.MeshBasicMaterial({ color: 0xff8a3a, side: THREE.BackSide, transparent: true, opacity: 0.8, depthWrite: false, fog: false }),
      ash: new THREE.PointsMaterial({ map: radial, color: 0xc8beb0, size: 0.16, transparent: true, opacity: 0.75, depthWrite: false }),
      spark: new THREE.PointsMaterial({ map: radial, vertexColors: true, size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    };
    return mats;
  }

  /* ================================================================ kits (local-space models) ================================================================ */
  /* each kit: geometry built in a local Bld with baked colours, origin at the floor centre of its tile */
  const kitCache = {};
  function kit(name, fn) { if (!kitCache[name]) { const b = new Bld(); fn(b); kitCache[name] = b.geometry(); } return kitCache[name]; }
  const KIT = {
    pine: () => kit('pine', b => {
      b.geo(G_CYL6, 0, 0.9, 0, 0.36, 1.8, 0.36, col(0x33291f));
      const tiers = [[3.4, 2.6, 1.2, 0x2b3628], [2.7, 2.4, 2.6, 0x313c2c], [1.95, 2.2, 4.0, 0x384230], [1.1, 1.7, 5.3, 0x3e4634]];
      for (const [r, h, y, c] of tiers) b.geo(G_CONE7, 0, y + h / 2, 0, r, h, r, col(c), { ry: y });
    }),
    deadTree: (leafy) => kit('dead' + (leafy ? 'L' : ''), b => {
      const bark = col(0x40382f);
      b.beam(0, 0, 0, 0.1, 4.6, 0.05, 0.36, bark); b.beam(0.1, 4.6, 0.05, 0.05, 5.4, 0.1, 0.16, bark);
      const br = [[2.0, 0.3, 0.75, 1.9], [2.6, 2.4, 0.9, 1.7], [3.3, 4.3, 0.7, 1.5], [3.9, 1.3, 0.85, 1.3], [4.4, 3.4, 0.6, 1.1]];
      for (const [y, a, el, len] of br) {
        const ex = Math.sin(el) * Math.cos(a) * len, ey = Math.cos(el) * len, ez = Math.sin(el) * Math.sin(a) * len;
        b.beam(0.05, y, 0.03, ex, y + ey, ez, 0.12, bark);
        b.beam(ex, y + ey, ez, ex * 1.5 + 0.2, y + ey * 1.6, ez * 1.5 - 0.1, 0.06, bark);
        if (leafy) b.geo(G_DOD, ex * 1.2, y + ey * 1.3, ez * 1.2, 0.9, 0.6, 0.9, col(0x5a4c34, 0.3), { ry: a });
      }
    }),
    car: () => kit('car', b => {
      const paint = col(0xffffff), dark = col(0x1a1a1a), glass = col(0x22282c);
      b.box(0, 0.3, 0, 3.5, 0.62, 1.62, paint, { fc: [undefined, undefined, undefined, dark] });
      b.box(-0.25, 0.92, 0, 1.95, 0.56, 1.46, glass, { fc: [glass, glass, paint, dark, glass, glass] });
      b.box(1.78, 0.32, 0, 0.12, 0.22, 1.66, dark); b.box(-1.78, 0.32, 0, 0.12, 0.22, 1.66, dark);
      for (const sx of [-1.12, 1.12]) for (const sz of [-0.72, 0.72]) b.geo(G_CYL8, sx, 0.33, sz, 0.66, 0.24, 0.66, dark, { rx: Math.PI / 2 });
      for (const sz of [-0.55, 0.55]) b.box(1.76, 0.6, sz, 0.06, 0.12, 0.3, col(0x8a8676));
    }),
    lamp: (on) => kit('lamp' + (on ? 1 : 0), b => {
      const metal = col(0x2c2b2a);
      b.box(0, 0, 0, 0.32, 0.3, 0.32, col(0x4a4844));
      b.geo(G_CYL6, 0, 2.6, 0, 0.16, 5.2, 0.16, metal);
      b.beam(0, 5.0, 0, 1.4, 5.25, 0, 0.1, metal);
      b.box(1.5, 5.1, 0, 0.62, 0.18, 0.3, metal);
      b.box(1.5, 5.04, 0, 0.42, 0.06, 0.2, on ? col(PAL.lamp) : col(0x3a3a38), on ? { glow: [0, 1.6] } : undefined);
    }),
    blades: () => G_BLADES,
    stalk: () => kit('stalk', b => {
      const c = col(0x7a6a42);
      b.beam(0, 0, 0, 0.05, 1.1, 0.02, 0.05, c); b.beam(0.03, 0.6, 0, 0.3, 0.85, 0.1, 0.03, c); b.beam(0.03, 0.8, 0, -0.25, 1.0, -0.12, 0.03, c);
    }),
    barrelFire: () => kit('barrelFire', b => {
      b.geo(G_CYL8, 0, 0.45, 0, 0.66, 0.9, 0.66, col(0x5a3422), { grad: 0.6 });
      b.geo(G_CYL8, 0, 0.91, 0, 0.6, 0.03, 0.6, col(0x1a1410));
      b.geo(G_CONE5, 0.05, 1.12, 0, 0.42, 0.5, 0.42, col(0xff7a2a), { glow: [1.4, 0] });
      b.geo(G_CONE5, -0.1, 1.05, 0.08, 0.3, 0.38, 0.3, col(0xffb04a), { glow: [1.8, 0], ry: 1 });
      b.geo(G_CONE5, 0.08, 1.02, -0.1, 0.22, 0.42, 0.22, col(0xffd070), { glow: [2.0, 0], ry: 2 });
    }),
    bus: (ready) => kit('bus' + (ready ? 1 : 0), b => {
      const paint = col(ready ? 0xc8a032 : 0xa08030), rustc = col(0x6a3c22), dark = col(0x161616), glass = col(0x262c30);
      b.box(0, 0.55, 0, 8.4, 2.1, 2.4, paint, { grad: 0.75 });
      b.box(-0.2, 2.65, 0, 8.0, 0.18, 2.2, col(ready ? 0xd0b060 : 0x9a8a62));
      for (const sz of [-1.22, 1.22]) {
        for (let i = 0; i < 7; i++) b.box(-2.9 + i * 0.95, 1.55, sz, 0.8, 0.75, 0.04, glass);
        b.box(0, 1.1, sz, 8.2, 0.1, 0.04, dark);
        if (!ready) for (let i = 0; i < 3; i++) b.box(rf(-3, 3), rf(0.6, 1.2), sz * 1.005, rf(0.4, 1.1), rf(0.25, 0.5), 0.03, rustc);
      }
      b.box(4.22, 1.35, 0, 0.04, 0.95, 2.1, glass); b.box(-4.22, 1.4, 0, 0.04, 0.8, 1.9, glass);
      b.box(4.3, 0.45, 0, 0.18, 0.3, 2.4, dark); b.box(-4.3, 0.45, 0, 0.18, 0.3, 2.4, dark);
      for (const sz of [-0.8, 0.8]) b.box(4.26, 0.85, sz, 0.06, 0.18, 0.3, ready ? col(0xffe0a0) : col(0x8a8676), ready ? { glow: [1.6, 0] } : undefined);
      b.box(3.4, 0.55, 1.21, 0.8, 1.65, 0.05, dark);
      for (const sx of [-2.6, 2.6]) for (const sz of [-1.0, 1.0]) b.geo(G_CYL12, sx, ready ? 0.45 : 0.36, sz, 0.9, 0.34, 0.9, dark, { rx: Math.PI / 2 });
      if (!ready) b.box(-1.2, 2.83, 0.3, 1.2, 0.05, 0.9, col(0x3e4a56), { ry: 0.3 });
    }),
  };

  /* searchable container kits: body (darkened when searched) + lid/door (moved by an open transform). front faces +z. */
  const CONT_KIT = {};
  function hinge(px, py, pz, rx, ry, rz) { const a = new THREE.Matrix4().makeTranslation(px, py, pz), r = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')), c = new THREE.Matrix4().makeTranslation(-px, -py, -pz); return a.multiply(r).multiply(c); }
  function contKit(kind, loc) {
    const key = kind + '|' + (['hospital', 'police', 'military', 'factory', 'depot'].includes(loc) ? loc : '');
    if (CONT_KIT[key]) return CONT_KIT[key];
    const B = new Bld(), L = new Bld(), inner = col(0x0e0c0a);
    const saveR = rr; rr = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(key.length * 7919 + 17);
    let open = new THREE.Matrix4();
    const med = loc === 'hospital', cop = loc === 'police', mil = loc === 'military', ind = loc === 'factory' || loc === 'depot';
    switch (kind) {
      case 'shelf': {
        const mc = col(ind ? 0x6a5a3a : 0x4e5458);
        for (const x of [-0.86, 0.86]) for (const z of [-0.86, -0.34]) B.box(x, 0, z, 0.07, 1.95, 0.07, mc);
        B.box(0, 0, -0.9, 1.8, 1.95, 0.03, col(0x2a2c2e));
        for (const y of [0.1, 0.62, 1.14, 1.66]) B.box(0, y, -0.6, 1.8, 0.04, 0.56, mc);
        const goods = [0x8a3a2a, 0x3a5a7a, 0xb09a6a, 0x5a6a3a, 0x9a8a7a, 0x6a4a6a];
        for (const y of [0.14, 0.66, 1.18, 1.7]) for (let x = -0.75; x < 0.75; x += rf(0.22, 0.4)) if (rr() < 0.75) {
          const w = rf(0.14, 0.26), h = rf(0.14, 0.34);
          if (rr() < 0.5) L.geo(G_CYL8, x, y + h / 2, -0.6 + rf(-0.1, 0.1), w, h, w, col(rpick(goods), 0.2)); else L.box(x, y, -0.6 + rf(-0.1, 0.1), w, h, rf(0.15, 0.3), col(rpick(goods), 0.2));
        }
        open = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
        break;
      }
      case 'cabinet': {
        const c = col(med ? 0xb8b8b0 : cop ? 0x5a6066 : 0x6a4a32);
        B.box(0, 0.08, -0.6, 1.3, 1.5, 0.55, c, { fc: [undefined, undefined, undefined, undefined, inner] });
        B.box(0, 0, -0.6, 1.24, 0.08, 0.5, col(0x1a1612));
        B.box(-0.33, 0.12, -0.31, 0.62, 1.42, 0.04, c); B.box(-0.08, 0.75, -0.28, 0.04, 0.16, 0.04, col(0x8a8676));
        if (med) { B.box(-0.33, 1.1, -0.285, 0.28, 0.08, 0.02, col(0x9a2a24)); B.box(-0.33, 1.0, -0.285, 0.08, 0.28, 0.02, col(0x9a2a24)); }
        L.box(0.33, 0.12, -0.31, 0.62, 1.42, 0.04, c); L.box(0.08, 0.75, -0.28, 0.04, 0.16, 0.04, col(0x8a8676));
        open = hinge(0.64, 0, -0.31, 0, 1.9, 0);
        break;
      }
      case 'fridge': {
        const c = col(0xa8a69a);
        B.box(0, 0, -0.5, 0.92, 1.86, 0.74, c, { grad: 0.7, fc: [undefined, undefined, undefined, undefined, inner] });
        B.box(0, 1.2, -0.5, 0.8, 0.03, 0.6, col(0x6a6a64));
        L.box(0, 0.02, -0.1, 0.92, 1.82, 0.07, c, { grad: 0.75 }); L.box(0.36, 0.9, -0.04, 0.05, 0.5, 0.05, col(0x5a5a56));
        open = hinge(-0.46, 0, -0.1, 0, -1.9, 0);
        break;
      }
      case 'crate': {
        const c = col(mil ? 0x4e5636 : 0x7a5a36), band = col(mil ? 0x3a4028 : 0x5a4026);
        B.box(-0.15, 0, -0.35, 1.1, 0.85, 1.1, c, { fc: [undefined, undefined, inner] });
        for (const y of [0.1, 0.62]) B.box(-0.15, y, -0.35, 1.13, 0.12, 1.13, band);
        if (mil) B.box(-0.15, 0.36, 0.215, 0.6, 0.14, 0.02, col(0xb0a050));
        B.box(0.72, 0, -0.55, 0.6, 0.6, 0.6, col(mil ? 0x4a5232 : 0x6e5232), { ry: 0.3 });
        L.box(-0.15, 0.85, -0.35, 1.16, 0.09, 1.16, c);
        open = hinge(-0.15, 0.89, -0.93, -1.95, 0, 0);
        break;
      }
      case 'locker': {
        const c = col(cop ? 0x4c5662 : mil ? 0x4e5440 : 0x56604e), dk = col(0x23262a);
        B.box(0, 0, -0.62, 1.5, 1.9, 0.5, c, { fc: [undefined, undefined, undefined, undefined, inner] });
        for (const x of [-0.5, 0.5]) { B.box(x, 0.04, -0.36, 0.47, 1.82, 0.03, c); for (const y of [1.55, 1.62, 1.69]) B.box(x, y, -0.34, 0.3, 0.025, 0.01, dk); }
        L.box(0, 0.04, -0.36, 0.47, 1.82, 0.03, c); for (const y of [1.55, 1.62, 1.69]) L.box(0, y, -0.34, 0.3, 0.025, 0.01, dk);
        L.box(0.17, 0.9, -0.33, 0.04, 0.14, 0.03, col(0x8a8a86));
        open = hinge(-0.235, 0, -0.36, 0, -1.8, 0);
        break;
      }
      case 'desk': {
        const c = col(cop || med ? 0x6a6a64 : 0x5e4632);
        B.box(0, 0.74, -0.45, 1.6, 0.06, 0.82, c);
        B.box(0.55, 0, -0.45, 0.46, 0.74, 0.76, c, { fc: [undefined, undefined, undefined, undefined, inner] });
        for (const x of [-0.74]) for (const z of [-0.8, -0.1]) B.box(x, 0, z, 0.06, 0.74, 0.06, c);
        B.box(-0.3, 0.8, -0.6, 0.46, 0.4, 0.42, col(0x8a867a)); B.box(-0.3, 0.88, -0.385, 0.34, 0.26, 0.02, col(0x1c2226));
        B.box(-0.2, 0.8, -0.2, 0.42, 0.02, 0.16, col(0x3a3a38));
        for (let i = 0; i < 3; i++) B.box(rf(0.1, 0.6), 0.8 + i * 0.006, rf(-0.7, -0.2), 0.22, 0.005, 0.3, col(0xc8c4b8), { ry: rf(-0.5, 0.5) });
        L.box(0.55, 0.46, -0.4, 0.42, 0.2, 0.7, c, { fc: [undefined, undefined, inner] }); L.box(0.55, 0.53, -0.04, 0.12, 0.03, 0.03, col(0x8a8a86));
        open = new THREE.Matrix4().makeTranslation(0, 0, 0.45);
        break;
      }
      case 'toolbox': {
        const c = col(0x8e2c22), dk = col(0x2a1e1a);
        B.box(0, 0.08, -0.55, 1.0, 0.9, 0.6, c, { grad: 0.8, fc: [undefined, undefined, inner] });
        for (const y of [0.25, 0.45, 0.65, 0.85]) B.box(0, y, -0.248, 0.9, 0.02, 0.01, dk);
        for (const x of [-0.42, 0.42]) for (const z of [-0.8, -0.3]) B.geo(G_CYL6, x, 0.05, z, 0.1, 0.1, 0.1, dk, { rx: Math.PI / 2 });
        B.box(-0.65, 0, -0.6, 0.5, 0.08, 0.5, col(0x5a4a3a));
        L.box(0, 0.98, -0.55, 1.02, 0.1, 0.62, c);
        open = hinge(0, 1.03, -0.86, -1.6, 0, 0);
        break;
      }
      case 'trunk': {
        B.box(-1.36, 0.88, 0, 0.62, 0.05, 1.32, inner);
        L.box(-1.36, 0.92, 0, 0.72, 0.07, 1.46, col(0xffffff));
        open = hinge(-1.02, 0.95, 0, 0, 0, -1.15);
        break;
      }
      case 'rubble': {
        const cs = [0x6e6a64, 0x5a5650, 0x7a4a3a, 0x4a4640];
        for (let i = 0; i < 9; i++) B.geo(rr() < 0.5 ? G_ICO : G_DOD, rf(-0.7, 0.7), rf(0.1, 0.45), rf(-0.7, 0.7), rf(0.4, 0.9), rf(0.35, 0.7), rf(0.4, 0.9), col(rpick(cs), 0.2), { ry: rf(0, 6), rx: rf(-0.4, 0.4) });
        B.beam(-0.8, 0.2, 0.5, 0.7, 0.9, -0.3, 0.12, col(0x5a4630));
        B.beam(0.5, 0.2, 0.6, 0.2, 1.2, -0.2, 0.04, col(0x5a3a2a));
        B.box(0.3, 0.6, 0.35, 0.62, 0.18, 0.44, col(0x5a3e2a), { ry: 0.4, fc: [undefined, undefined, inner] });
        L.box(0.3, 0.78, 0.35, 0.64, 0.08, 0.46, col(0x5a3e2a), { ry: 0.4 });
        open = hinge(0.3 - Math.sin(0.4) * 0.23, 0.82, 0.35 - Math.cos(0.4) * 0.23, -1.7, 0.4, 0);
        break;
      }
      case 'nets': {
        const pole = col(0x4e3e2c);
        for (const x of [-0.85, 0.85]) B.box(x, 0, -0.5, 0.1, 1.7, 0.1, pole);
        B.box(0, 1.6, -0.5, 1.9, 0.08, 0.08, pole);
        B.box(0, 0.35, -0.48, 1.65, 1.25, 0.03, col(0x3a4438), { rx: 0.08 });
        for (let i = 0; i < 4; i++) B.geo(G_CYL6, rf(-0.7, 0.7), rf(0.5, 1.4), -0.44, 0.1, 0.14, 0.1, col(0xa4542a), { rx: Math.PI / 2 });
        B.geo(G_CYL8, 0.45, 0.24, 0.35, 0.72, 0.48, 0.72, col(0x7a6040), { fc: undefined });
        L.geo(G_CYL8, 0.45, 0.5, 0.35, 0.78, 0.06, 0.78, col(0x6a5236));
        open = new THREE.Matrix4().makeTranslation(0.15, -0.38, 0.55).multiply(hinge(0.45, 0.5, 0.35, 0.5, 0, 0));
        break;
      }
      case 'stash': {
        const c = col(0x4a5232);
        B.box(0, 0, -0.2, 1.0, 0.6, 0.7, c, { fc: [undefined, undefined, inner] });
        for (const z of [0.35, 0.6]) B.geo(G_CYL8, 0, 0.14, z, 0.28, 1.6, 0.28, col(0x4a3a2a), { rz: Math.PI / 2, ry: rf(-0.2, 0.2) });
        L.box(0, 0.6, -0.2, 1.3, 0.06, 1.0, col(0x3e4a2e), { rz: 0.05 });
        open = hinge(0, 0.63, -0.7, -1.4, 0, 0);
        break;
      }
      default: B.box(0, 0, 0, 1.2, 1, 1.2, col(0x6a5a44));
    }
    rr = saveR;
    const body = B.geometry(), lid = L.geometry();
    const all = new Bld(); if (B.count) all.add(body, new THREE.Matrix4()); if (L.count) all.add(lid, new THREE.Matrix4());
    const hullGeo = all.count ? all.geometry() : body;
    hullGeo.computeBoundingBox();
    return (CONT_KIT[key] = { body, lid, open, hull: hullGeo, centre: hullGeo.boundingBox.getCenter(new THREE.Vector3()) });
  }

  /* ================================================================ ground ================================================================ */
  const MG = 14; // outskirts margin (tiles)
  const isRoadT = t => t === T_ROAD || t === T_CAR;
  const roadRow = y => ROADS_Y.some(r => y === r || y === r + 1), roadCol = x => ROADS_X.some(r => x === r || x === r + 1);
  /* tile type including the outskirts ring (roads and the river continue, everything else is forest floor) */
  function tAt(x, y) {
    if (x >= 0 && y >= 0 && x < W && y < H) return tileAt(x, y);
    if (RIVER_X.includes(x)) return roadRow(y) ? T_BRIDGE : T_WATER;
    if ((roadRow(y) && (x < 0 || x >= W)) || (roadCol(x) && (y < 0 || y >= H))) return T_ROAD;
    return -1; // forest floor
  }
  const waterLike = t => t === T_WATER || t === T_BRIDGE;
  function groundCol(t, wx, wz, forest, x, y) {
    const n = fbm(wx * 0.08, wz * 0.08), d = vnoise(wx * 0.55 + 3, wz * 0.55 + 9);
    let c;
    if (isRoadT(t)) { c = mixc(0x33322f, 0x46433e, n * 0.8 + d * 0.3); }
    else if (t === T_YARD || t === T_DOOR) c = mixc(0x5a5043, 0x6e624f, n);
    else if (t === T_FIELD) c = mixc(0x3a2c21, 0x55412e, n);
    else if (t === T_RUBBLE) c = mixc(0x4a4640, 0x5c5852, n);
    else if (t === T_WALL) c = mixc(0x4c463c, 0x5a5246, n);
    else if (forest || t === -1) c = mixc(0x2e3026, 0x47402e, n * 0.9 + d * 0.2);
    else c = mixc(0x4a503d, 0x6e6748, n * 0.85 + d * 0.25);
    if (!isRoadT(t) && vnoise(wx * 0.045 + 40, wz * 0.045 - 11) < 0.2) c.multiplyScalar(0.62); // scorched patches
    return c;
  }
  function floorCol(style, i, k) {
    if (style === 'wood') return col(rpick([0x5e4430, 0x6a4c34, 0x553c2a, 0x6e5238]), 0.12);
    if (style === 'tile') return col(((i + k) & 1) ? 0x8c8a84 : 0x6e6c68, 0.08);
    if (style === 'hay') return col(rpick([0x6e5e3a, 0x7a6a42, 0x5e4e32]), 0.15);
    return col(rpick([0x605e58, 0x6a6862, 0x58564f]), 0.1);
  }
  function buildGround() {
    const forestAt = (x, y) => x >= 0 && y >= 0 && x < W && y < H && districtAt(x, y) === 'forest';
    for (let y = -MG; y < H + MG; y++) for (let x = -MG; x < W + MG; x++) {
      const t = tAt(x, y), inMap = x >= 0 && y >= 0 && x < W && y < H, X0 = x * 2, Z0 = y * 2;
      if (waterLike(t)) {
        const c1 = col(0x2a2620, 0.2), c2 = col(0x352f26, 0.2);
        GD.quad(X0, Z0, X0 + 2, Z0 + 2, -1.3, c1, c2, c2, c1);
        for (const [dx, dy, f] of [[-1, 0, 'w'], [1, 0, 'e'], [0, -1, 'n'], [0, 1, 's']]) {
          const nt = tAt(x + dx, y + dy); if (waterLike(nt)) continue;
          const bx = f === 'w' ? X0 : f === 'e' ? X0 + 2 : X0 + 1, bz = f === 'n' ? Z0 : f === 's' ? Z0 + 2 : Z0 + 1;
          GD.box(bx, -1.3, bz, f === 'w' || f === 'e' ? 0.12 : 2, 1.3, f === 'n' || f === 's' ? 0.12 : 2, col(0x4a3e30, 0.15), { grad: 0.45 });
        }
        continue;
      }
      if (inMap) {
        const bi = bIdx[y * W + x];
        if (t === T_ROOF || (t === T_WALL && (bi >= 0 || inBunker(x, y)))) continue;
        const st = bi >= 0 ? (BST[WORLD.roofs[bi].type] || BST.street) : null;
        if (st && (t === T_FLOOR || t === T_PROP || t === T_DOOR)) {
          if (st.floor === 'wood') for (let i = 0; i < 4; i++) { const c = floorCol('wood'); GD.quad(X0 + i * 0.5, Z0, X0 + i * 0.5 + 0.5, Z0 + 2, 0, c, c, c, c); }
          else for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) { const c = floorCol(st.floor, x * 2 + i, y * 2 + k); GD.quad(X0 + i, Z0 + k, X0 + i + 1, Z0 + k + 1, 0, c, c, c, c); }
          continue;
        }
        const fo = forestAt(x, y), tt = (t === T_PROP || t === T_TREE) ? T_GRASS : t;
        const cs = [];
        for (let k = 0; k <= 2; k++) for (let i = 0; i <= 2; i++) cs.push(groundCol(tt, X0 + i, Z0 + k, fo, x, y));
        for (let k = 0; k < 2; k++) for (let i = 0; i < 2; i++) GD.quad(X0 + i, Z0 + k, X0 + i + 1, Z0 + k + 1, 0, cs[k * 3 + i], cs[k * 3 + i + 1], cs[(k + 1) * 3 + i], cs[(k + 1) * 3 + i + 1]);
      } else {
        const c = (i, k) => groundCol(t, X0 + i, Z0 + k, true, x, y);
        GD.quad(X0, Z0, X0 + 2, Z0 + 2, 0, c(0, 0), c(2, 0), c(0, 2), c(2, 2));
      }
    }
  }
  const inBunker = (x, y) => { const b = WORLD.bunker; return b && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h; };

  /* roads: lane dashes, crossings, cracks, stains, sidewalks + curbs */
  function buildStreets(lampSpots) {
    const L0 = -MG * 2, LX = (W + MG) * 2, LZ = (H + MG) * 2, mark = col(0x8e8670);
    const inXing = (v, list) => list.some(r => v >= r * 2 - 0.6 && v <= (r + 2) * 2 + 0.6);
    for (const Y of ROADS_Y) for (let x = L0; x < LX; x += 4) {
      if (inXing(x + 0.8, ROADS_X) || rr() < 0.18) continue;
      GD.box(x + 0.8, 0, (Y + 1) * 2, 1.6, 0.012, 0.14, col(0x8e8670, 0.2));
    }
    for (const X of ROADS_X) for (let z = L0; z < LZ; z += 4) {
      if (inXing(z + 0.8, ROADS_Y) || rr() < 0.18) continue;
      GD.box((X + 1) * 2, 0, z + 0.8, 0.14, 0.012, 1.6, col(0x8e8670, 0.2));
    }
    /* zebra crossings beside each in-map intersection */
    for (const X of ROADS_X) for (const Y of ROADS_Y) {
      for (const side of [-1, 1]) {
        const xc = side < 0 ? X * 2 - 1.1 : (X + 2) * 2 + 1.1, zc = side < 0 ? Y * 2 - 1.1 : (Y + 2) * 2 + 1.1;
        for (let k = 0; k < 5; k++) if (rr() < 0.8) GD.box(xc, 0, Y * 2 + 0.45 + k * 0.78, 1.4, 0.013, 0.42, mark);
        for (let k = 0; k < 5; k++) if (rr() < 0.8) GD.box(X * 2 + 0.45 + k * 0.78, 0, zc, 0.42, 0.013, 1.4, mark);
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tileAt(x, y), wx = x * 2, wz = y * 2;
      if (isRoadT(t)) {
        if (rr() < 0.3) { let px = wx + rf(0.2, 1.8), pz = wz + rf(0.2, 1.8), a = rf(0, 6); for (let k = 0; k < 3; k++) { const l = rf(0.4, 1.0), nx = px + Math.cos(a) * l, nz = pz + Math.sin(a) * l; GD.beam(px, 0.012, pz, nx, 0.012, nz, 0.05, col(0x1a1917)); px = nx; pz = nz; a += rf(-0.9, 0.9); } }
        if (rr() < 0.08) GD.geo(G_CYL8, wx + rf(0.5, 1.5), 0.01, wz + rf(0.5, 1.5), rf(0.8, 1.6), 0.008, rf(0.6, 1.3), col(0x24221f), { ry: rf(0, 3) });
        if (rr() < 0.04) GD.geo(G_DOD, wx + 1, 0, wz + 1, rf(0.7, 1.1), 0.05, rf(0.6, 1.0), col(0x1e1c1a), { ry: rf(0, 3) });
        if (rr() < 0.05) GD.box(wx + rf(0.3, 1.7), 0, wz + rf(0.3, 1.7), 0.25, 0.01, 0.32, col(0xb8b2a4, 0.2), { ry: rf(0, 3) });
        continue;
      }
      if (![T_GRASS, T_RUBBLE, T_YARD, T_FIELD, T_TREE].includes(t) || bIdx[y * W + x] >= 0) continue;
      const nb = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => isRoadT(tileAt(x + dx, y + dy)) || tileAt(x + dx, y + dy) === T_BRIDGE);
      nb.forEach((r, i) => {
        if (!r) return;
        const horiz = i < 2, edge = i === 0 ? wz : i === 1 ? wz + 2 : i === 2 ? wx : wx + 2, dir = (i === 0 || i === 2) ? 1 : -1;
        for (let k = 0; k < 2; k++) {
          if (rr() < 0.06) continue;
          const c = col(0x6e6a63, 0.14), along = (horiz ? wx : wz) + 0.5 + k;
          if (horiz) GD.box(along, 0, edge + dir * 0.7, 0.96, 0.09, 1.3, c); else GD.box(edge + dir * 0.7, 0, along, 1.3, 0.09, 0.96, c);
        }
        if (horiz) GD.box(wx + 1, 0, edge + dir * 0.06, 2, 0.15, 0.14, col(0x8a867c, 0.1)); else GD.box(edge + dir * 0.06, 0, wz + 1, 0.14, 0.15, 2, col(0x8a867c, 0.1));
        /* street lamps every few tiles on the sidewalk, arm over the road */
        const lane = horiz ? x : y;
        if (lane % 8 === (horiz ? (i === 0 ? 1 : 5) : (i === 2 ? 2 : 6)) && t !== T_TREE && !inShelter(x + 0.5, y + 0.5) && districtAt(x, y) !== 'tollcamp') {
          const lx = horiz ? wx + 1 : edge + dir * 0.45, lz = horiz ? edge + dir * 0.45 : wz + 1;
          lampSpots.push({ x: lx, z: lz, dx: horiz ? 0 : -dir, dz: horiz ? -dir : 0 });
        }
      });
    }
  }

  /* rubble piles, debris, fields */
  function buildDetails(fieldStalks) {
    const conc = [0x6e6a64, 0x5a5650, 0x7a4a3a, 0x4a4640, 0x625e56];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tileAt(x, y), wx = x * 2, wz = y * 2;
      if (t === T_RUBBLE) {
        for (let i = 0; i < 6; i++) S.geo(rr() < 0.5 ? G_ICO : G_DOD, wx + rf(0.3, 1.7), rf(0, 0.12), wz + rf(0.3, 1.7), rf(0.25, 0.7), rf(0.15, 0.45), rf(0.25, 0.7), col(rpick(conc), 0.2), { ry: rf(0, 6) });
        for (let i = 0; i < 5; i++) GD.box(wx + rf(0.2, 1.8), 0, wz + rf(0.2, 1.8), 0.24, 0.08, 0.12, col(0x7a4a36, 0.25), { ry: rf(0, 3) });
        if (rr() < 0.5) S.beam(wx + rf(0.2, 0.8), 0.05, wz + rf(0.2, 1.8), wx + rf(1.2, 1.9), rf(0.2, 0.5), wz + rf(0.2, 1.8), 0.1, col(PAL.wood2, 0.2));
        if (rr() < 0.3) S.beam(wx + 1, 0.1, wz + 1, wx + 1 + rf(-0.6, 0.6), rf(0.6, 1.0), wz + 1 + rf(-0.6, 0.6), 0.03, col(0x5a3a28));
      } else if (t === T_FIELD) {
        for (const ox of [0.33, 1.0, 1.67]) {
          GD.box(wx + ox, 0, wz + 1, 0.42, 0.13, 2, col(0x4a3826, 0.12));
          for (let k = 0; k < 3; k++) if (rr() < 0.8) fieldStalks.push([wx + ox + rf(-0.08, 0.08), wz + 0.35 + k * 0.65 + rf(-0.1, 0.1)]);
        }
      } else if ((t === T_GRASS || t === T_YARD) && bIdx[y * W + x] < 0 && !inShelter(x + 0.5, y + 0.5)) {
        if (rr() < 0.05) S.geo(G_ICO, wx + rf(0.4, 1.6), 0.18, wz + rf(0.4, 1.6), rf(0.45, 0.65), 0.38, rf(0.4, 0.6), col(0x1e221e, 0.3), { ry: rf(0, 3) }); // bin bag
        if (rr() < 0.03) S.geo(G_TOR, wx + rf(0.4, 1.6), 0.13, wz + rf(0.4, 1.6), 1, 1, 1, col(0x171615), { rx: Math.PI / 2 + rf(-0.2, 0.2), ry: rf(0, 3) });
        if (rr() < 0.06) GD.box(wx + rf(0.3, 1.7), 0, wz + rf(0.3, 1.7), 0.22, 0.01, 0.3, col(0xb0aa9c, 0.25), { ry: rf(0, 3) });
      }
    }
    /* a scarecrow watching the dead crops */
    const ft = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tileAt(x, y) === T_FIELD) ft.push([x, y]);
    if (ft.length) {
      const [x, y] = ft[Math.floor(ft.length / 2)], wx = x * 2 + 1, wz = y * 2 + 1;
      S.box(wx, 0, wz, 0.1, 2.2, 0.1, col(PAL.wood2)); S.box(wx, 1.55, wz, 1.6, 0.08, 0.08, col(PAL.wood2));
      S.box(wx, 1.1, wz, 0.5, 0.7, 0.28, col(0x5a4a3a)); S.geo(G_ICO, wx, 1.95, wz, 0.34, 0.36, 0.34, col(0x8a7a5a));
      S.geo(G_CONE5, wx, 2.2, wz, 0.6, 0.25, 0.6, col(0x3a2e22));
    }
  }

  /* ================================================================ buildings ================================================================ */
  const N4 = [[1, 0], [-1, 0], null, null, [0, 1], [0, -1]]; // box face order: +x -x +y -y +z -z
  function windowAt(cx, cy, cz, nx, nz, w, h, o, kind) {
    const ry = Math.atan2(nx, nz), bid = o.bid;
    kind = kind || (rr() < 0.42 ? 'dark' : rr() < 0.4 ? 'boarded' : rr() < 0.55 ? 'broken' : 'lit');
    S.geo(G_BOX, cx + nx * 0.03, cy, cz + nz * 0.03, w + 0.2, h + 0.2, 0.06, col(o.trim || PAL.trim, 0.2), { ry, bid });
    const glass = kind === 'lit' ? col(0x7a5434, 0.2) : kind === 'broken' ? col(0x0c0c0d) : col(PAL.glass, 0.25);
    S.geo(G_BOX, cx + nx * 0.06, cy, cz + nz * 0.06, w, h, 0.04, glass, { ry, bid, glow: kind === 'lit' ? [0, 1.25] : undefined });
    S.geo(G_BOX, cx + nx * 0.1, cy - h / 2 - 0.06, cz + nz * 0.1, w + 0.3, 0.08, 0.2, col(0x6a665e, 0.2), { ry, bid });
    if (kind === 'boarded') for (let k = 0; k < 3; k++) S.geo(G_BOX, cx + nx * 0.11, cy - h * 0.32 + k * h * 0.32, cz + nz * 0.11, w + 0.25, 0.2, 0.04, col(PAL.wood, 0.3), { ry, rz: rf(-0.22, 0.22), bid });
    if (kind === 'broken' || rr() < 0.12) S.geo(G_BOX, cx + nx * 0.035, cy + h / 2 + 0.5, cz + nz * 0.035, w * 0.85, 1.0, 0.02, col(PAL.soot, 0.2), { ry, bid });
  }
  function building(r, idx) {
    const st = BST[r.type] || BST.street, bid = idx + 1, O = { bid, trim: 0x2e2a26 };
    const h = st.h + rf(-0.25, 0.25), flat = st.roof === 'flat', top = flat ? h + 0.5 : h;
    const x0 = r.x, y0 = r.y, x1 = r.x + r.w - 1, y1 = r.y + r.h - 1;
    const W2 = r.w * 2, D2 = r.h * 2, cx = (x0 + r.w / 2) * 2, cz = (y0 + r.h / 2) * 2;
    heights[idx] = top + (st.roof === 'gable' ? 2.6 : st.roof === 'saw' ? 2.0 : 0) + (st.mast ? 16 : 0);
    const inFp = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1, perim = (x, y) => x === x0 || x === x1 || y === y0 || y === y1;
    const roofc = col(st.roofC, 0.1), CAPC = col(PAL.cap, 0.1), DK = col(PAL.dark);
    const wallBase = col(st.wall);
    if (r.closed) return closedBlock(r, st, h, bid);
    const nst = Math.max(1, Math.floor((h + 0.2) / 3.2));
    let doorX = -1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = tileAt(x, y), wx = (x + 0.5) * 2, wz = (y + 0.5) * 2;
      if (t === T_DOOR) { doorX = x; door(x, y, st, h, top, bid, inFp); continue; }
      if (t !== T_WALL) continue;
      const pm = perim(x, y), wt = pm ? top : h - 0.3;
      const wc = wallBase.clone().multiplyScalar(1 + (rr() - 0.5) * 0.14), ic = col(st.inner, 0.08);
      const fc = [], ext = [];
      for (const f of [0, 1, 4, 5]) {
        const nx = x + N4[f][0], ny = y + N4[f][1];
        if (!inFp(nx, ny)) { fc[f] = wc; ext.push(f); continue; }
        const nt = tileAt(nx, ny);
        fc[f] = (nt === T_DOOR || (nt === T_WALL && (!pm || perim(nx, ny)))) ? null : ic;
      }
      fc[2] = CAPC; fc[3] = DK;
      S.box(wx, 0, wz, 2, wt, 2, null, { fc, grad: 0.58, bid });
      if (st.ribs) for (const f of ext) { const nx = N4[f][0], nz = N4[f][1], ry = Math.atan2(nx, nz); for (const k of [-0.66, 0, 0.66]) S.geo(G_BOX, wx + nx * 1.02 + nz * k, wt / 2 - 0.05, wz + nz * 1.02 - nx * k, 0.1, wt - 0.1, 0.05, wc.clone().multiplyScalar(0.8), { ry, bid }); }
      if (ext.length !== 1) continue; // corners stay plain
      const f = ext[0], nx = N4[f][0], nz = N4[f][1], ry = Math.atan2(nx, nz), fx = wx + nx, fz = wz + nz;
      const nearDoor = [[1, 0], [-1, 0]].some(([a, b]) => tileAt(x + a, y + b) === T_DOOR);
      const inner = fc[f ^ 1] && fc[f ^ 1] !== null ? fc[f ^ 1] : null;
      if (st.bands) for (let s = 1; s < nst; s++) S.geo(G_BOX, fx + nx * 0.06, s * 3.2 + 0.05, fz + nz * 0.06, 2.04, 0.2, 0.12, col(0x6a645a, 0.1), { ry, bid });
      if (st.band && f === 4) {
        S.geo(G_BOX, fx + nx * 0.08, h - 0.75, fz + nz * 0.08, 2.03, 0.75, 0.16, col(st.band, 0.12), { ry, bid });
        if (st.sign && rr() < 0.75) S.geo(G_BOX, fx + nx * 0.17, h - 0.75 + rf(-0.05, 0.05), fz + nz * 0.17, rf(0.35, 0.8), 0.32, 0.03, col(st.sign, 0.25), { ry, bid });
      }
      if (st.garage && f === 4 && !nearDoor) {
        S.geo(G_BOX, fx + nx * 0.04, 1.7, fz + nz * 0.04, 1.84, 3.4, 0.06, col(0x5a5852, 0.15), { ry, bid });
        for (let k = 0; k < 9; k++) S.geo(G_BOX, fx + nx * 0.08, 0.2 + k * 0.38, fz + nz * 0.08, 1.8, 0.05, 0.03, col(0x3e3c38), { ry, bid });
        continue;
      }
      if (st.strip) { windowAt(fx, h - 1.5, fz, nx, nz, 1.75, 0.8, O, rr() < 0.5 ? 'dark' : 'broken'); continue; }
      if (st.slits) { windowAt(fx, 2.2, fz, nx, nz, 1.2, 0.3, O, 'dark'); continue; }
      for (let s = 0; s < nst; s++) {
        const cy = 1.65 + s * 3.2;
        if (cy + 0.8 > h - (st.band ? 0.9 : 0.15)) break;
        if (s === 0 && st.shop && f === 4) { windowAt(fx, 1.35, fz, nx, nz, 1.7, 1.9, O, rr() < 0.4 ? 'boarded' : rr() < 0.5 ? 'broken' : 'dark'); continue; }
        if (s === 0 && nearDoor) continue;
        if (rr() < 0.82) windowAt(fx, cy, fz, nx, nz, 1.0, 1.3, O, s === 0 && rr() < 0.85 ? (rr() < 0.5 ? 'boarded' : 'dark') : null);
        if (s === 0 && inner) S.geo(G_BOX, wx - nx * 1.03, cy, wz - nz * 1.03, 1.0, 1.25, 0.04, col(PAL.glass), { ry, bid });
        if (st.balcony && s >= 1 && f === 4 && rr() < 0.35) {
          const bx = fx + nx * 0.5, bz = fz + nz * 0.5, by = s * 3.2 + 0.1;
          S.geo(G_BOX, bx, by, bz, 1.7, 0.14, 1.0, col(0x6e6a62), { ry, bid });
          S.geo(G_BOX, fx + nx * 0.98, by + 0.5, fz + nz * 0.98, 1.7, 0.85, 0.05, col(0x3a3836), { ry, bid });
        }
      }
    }
    /* roof */
    if (flat) {
      const rx0 = (x0 + 1) * 2, rx1 = x1 * 2, rz0 = (y0 + 1) * 2, rz1 = y1 * 2;
      S.box((rx0 + rx1) / 2, h - 0.3, (rz0 + rz1) / 2, rx1 - rx0, 0.3, rz1 - rz0, roofc, { bid });
      const n = Math.max(2, Math.round((rx1 - rx0) * (rz1 - rz0) / 18));
      let tank = st.tank || r.type === 'hospital';
      for (let i = 0; i < n; i++) {
        const px = rf(rx0 + 0.8, rx1 - 0.8), pz = rf(rz0 + 0.8, rz1 - 0.8), k = rr();
        if (tank) { tank = false; S.geo(G_CYL12, px, h + 1.9, pz, 2.0, 1.7, 2.0, col(0x5c5850), { bid }); S.geo(G_CONE7, px, h + 2.95, pz, 2.1, 0.4, 2.1, col(0x4a4640), { bid }); for (const [a, b] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) S.box(px + a, h, pz + b, 0.12, 1.05, 0.12, col(PAL.steel), { bid }); continue; }
        if (k < 0.3) { S.box(px, h, pz, 1.2, 0.8, 0.9, col(0x7a7a74, 0.1), { bid, ry: rf(0, 0.3) }); S.geo(G_CYL8, px, h + 0.81, pz, 0.62, 0.03, 0.62, col(PAL.dark), { bid }); }
        else if (k < 0.5) S.geo(G_CYL6, px, h + 0.4, pz, 0.3, 0.8, 0.3, col(0x4a4844), { bid });
        else if (k < 0.65) S.box(px, h, pz, 1.0, 0.4, 1.0, col(0x55524c), { bid });
        else if (k < 0.8) S.box(px, h, pz, rf(1, 2), 0.04, rf(0.8, 1.6), col(PAL.tarp, 0.2), { bid, ry: rf(0, 3) });
        else S.box(px, h + 0.001, pz, rf(1, 3), 0.02, rf(1, 2.5), col(PAL.soot), { bid, ry: rf(0, 3) });
      }
    } else if (st.roof === 'gable') {
      const alongX = W2 >= D2, across = (alongX ? D2 : W2) + 0.6, len = (alongX ? W2 : D2) + 0.6, rh = Math.min(3, across * 0.3);
      S.geo(G_PRISM, cx, h, cz, across, rh, len, roofc, { ry: alongX ? Math.PI / 2 : 0, fc: [roofc, roofc.clone().multiplyScalar(0.8), DK, wallBase], bid });
      S.geo(G_BOX, cx, h + rh, cz, alongX ? len : 0.25, 0.14, alongX ? 0.25 : len, col(PAL.soot), { bid });
      if (rr() < 0.7) S.box(cx + rf(-1.5, 1.5), h + 0.4, cz + rf(-0.5, 0.5), 0.5, 1.4, 0.5, col(0x5a3a2c), { bid });
    } else if (st.roof === 'saw') {
      const n = Math.max(2, Math.round(D2 / 4)), seg = D2 / n;
      for (let i = 0; i < n; i++) S.geo(G_PRISM_R, cx, h, y0 * 2 + seg * (i + 0.5), seg, 1.9, W2 + 0.2, roofc, { ry: -Math.PI / 2, fc: [roofc, col(0x1e2226), DK, wallBase], bid });
    }
    if (st.chimney) { const px = (x0 + 1.5) * 2, pz = (y0 + 1.5) * 2; S.geo(G_CYL8, px, 5.2, pz, 1.3, 10.4, 1.3, col(0x6a3a2c), { bid, grad: 0.7 }); S.geo(G_CYL8, px, 10.45, pz, 1.5, 0.35, 1.5, col(PAL.soot), { bid }); }
    if (st.cross) { const px = (doorX >= 0 ? doorX + 0.5 : x0 + r.w / 2) * 2, pz = (y1 + 1) * 2 + 0.1; S.box(px, h - 2.3, pz, 1.4, 0.4, 0.08, col(0x9a2a24), { bid }); S.box(px, h - 2.8, pz, 0.4, 1.4, 0.08, col(0x9a2a24), { bid }); }
    if (st.mast) radioMast(cx, h, cz, bid);
    if (st.sandbags) for (const sx of [x0 * 2 - 0.2, (x1 + 1) * 2 + 0.2]) for (let k = 0; k < 3; k++) S.geo(G_CYL8, sx, 0.22 + (k % 2) * 0.32, (y1 + 1) * 2 - 0.4 - k * 0.7, 0.9, 0.36, 0.5, col(PAL.sand, 0.15), { rz: Math.PI / 2 });
    interiorDecor(r, st, x0, y0, x1, y1, doorX);
  }
  function door(x, y, st, h, top, bid, inFp) {
    const wx = (x + 0.5) * 2, wz = (y + 0.5) * 2, nz = inFp(x, y + 1) ? -1 : 1, dh = 2.5, trim = col(0x24201c);
    S.box(wx - 0.82, 0, wz, 0.36, dh, 2, trim, { bid }); S.box(wx + 0.82, 0, wz, 0.36, dh, 2, trim, { bid });
    const ext = col(st.wall, 0.1), inn = col(st.inner, 0.08);
    S.box(wx, dh, wz, 2, top - dh, 2, null, { bid, fc: [null, null, col(PAL.cap), col(PAL.dark), nz > 0 ? ext : inn, nz > 0 ? inn : ext], grad: 0.85 });
    S.geo(G_BOX, wx, dh + 0.08, wz + nz * 1.04, 1.5, 0.16, 0.08, trim, { bid });
    GD.box(wx, 0, wz + nz * 0.9, 1.3, 0.02, 0.3, col(0x1e1a16));
    if (st.shop) S.geo(G_BOX, wx, 2.95, wz + nz * 1.6, 2.6, 0.08, 1.3, col(st.band || 0x5a3a2a, 0.15), { bid, rx: 0.22 * nz });
    if (st.cross) {
      S.box(wx, 3.0, wz + nz * 2.1, 4.4, 0.25, 2.4, col(0x8a8880), { bid });
      for (const sx of [-1.9, 1.9]) S.box(wx + sx, 0, wz + nz * 3.0, 0.16, 3.0, 0.16, col(PAL.steel), { bid });
    }
  }
  function radioMast(cx, base, cz, bid) {
    const H2 = 18, lv = 8, legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const at = (k, y) => { const s = 1.3 - (y / H2) * 1.0; return [cx + legs[k][0] * s, base + y, cz + legs[k][1] * s]; };
    for (let k = 0; k < 4; k++) { const a = at(k, 0), b = at(k, H2); S.beam(a[0], a[1], a[2], b[0], b[1], b[2], 0.16, col(0x5a5852), { bid }); }
    for (let i = 0; i <= lv; i++) {
      const y = i * H2 / lv, c = col(i % 2 ? 0xb4aca0 : 0x8a3a2e, 0.1);
      for (let k = 0; k < 4; k++) {
        const a = at(k, y), b = at((k + 1) % 4, y); S.beam(a[0], a[1], a[2], b[0], b[1], b[2], 0.08, c, { bid });
        if (i < lv) { const d = at((k + 1) % 4, y + H2 / lv); S.beam(a[0], a[1], a[2], d[0], d[1], d[2], 0.05, c, { bid }); }
      }
    }
    S.geo(G_CYL6, cx, base + H2 + 1.5, cz, 0.1, 3, 0.1, col(0x4a4844), { bid });
    S.geo(G_ICO, cx, base + H2 + 3.1, cz, 0.3, 0.3, 0.3, col(0x5a1e1a), { bid });
    S.geo(G_CYL12, cx + 0.6, base + H2 * 0.7, cz + 0.4, 1.3, 0.12, 1.3, col(0x9a968e), { bid, rx: 1.2, ry: 0.6 });
  }
  function closedBlock(r, st, h, bid) {
    const X0 = r.x * 2, Z0 = r.y * 2, W2 = r.w * 2, D2 = r.h * 2, cx = X0 + W2 / 2, cz = Z0 + D2 / 2, wc = col(st.wall), rc = col(st.roofC);
    S.box(cx, 0, cz, W2, h, D2, null, { fc: [wc, wc, rc, col(PAL.dark), wc, wc], grad: 0.5, bid });
    for (let x = X0 + 0.3; x < X0 + W2; x += 0.6) for (const z of [Z0 - 0.03, Z0 + D2 + 0.03]) S.box(x, 0, z, 0.12, h - 0.1, 0.06, col(st.wall, 0.3).multiplyScalar(0.8), { bid });
    for (let z = Z0 + 0.3; z < Z0 + D2; z += 0.6) for (const x of [X0 - 0.03, X0 + W2 + 0.03]) S.box(x, 0, z, 0.06, h - 0.1, 0.12, col(st.wall, 0.3).multiplyScalar(0.8), { bid });
    S.box(cx, h, cz, W2 + 0.3, 0.25, D2 + 0.3, col(PAL.soot), { bid });
    for (let i = 0; i < 3; i++) windowAt(X0 + 1.5 + i * (W2 - 3) / 2, h - 1.4, Z0 + D2 + 0.06, 0, 1, 1.2, 0.5, { bid }, 'boarded');
    /* a big painted toll stripe and black flags on the roof */
    S.box(cx, 1.1, Z0 + D2 + 0.08, W2 * 0.6, 0.35, 0.03, col(0x7a2418), { bid });
    for (const [px, pz] of [[X0 + 0.8, Z0 + 0.8], [X0 + W2 - 0.8, Z0 + 0.8], [cx, Z0 + D2 - 1]]) {
      S.geo(G_CYL6, px, h + 2.6, pz, 0.14, 5, 0.14, col(0x2a2826), { bid });
      S.box(px + 0.75, h + 3.6, pz, 1.4, 0.95, 0.05, col(0x121010, 0.2), { bid, ry: rf(-0.3, 0.3) });
    }
    for (let i = 0; i < 4; i++) S.geo(G_CYL8, cx + rf(-W2 / 3, W2 / 3), h + 0.55, cz + rf(-D2 / 3, D2 / 3), 0.66, 0.9, 0.66, col(rpick([0x5a3422, 0x2e3a2e, 0x3a3a3a])), { bid });
  }
  function interiorDecor(r, st, x0, y0, x1, y1, doorX) {
    const t2 = r.type;
    for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) {
      if (tileAt(x, y) !== T_FLOOR || (Math.abs(x - doorX) <= 1 && y >= y1 - 2) || rr() > 0.4) continue;
      const wx = x * 2 + rf(0.4, 1.6), wz = y * 2 + rf(0.4, 1.6), k = rr();
      if (k < 0.3) for (let i = 0; i < 4; i++) GD.box(wx + rf(-0.5, 0.5), 0.005, wz + rf(-0.5, 0.5), 0.22, 0.008, 0.3, col(0xc8c2b4, 0.2), { ry: rf(0, 3) });
      else if (k < 0.45 && (t2 === 'apartments' || t2 === 'street' || t2 === 'police')) GD.box(wx, 0, wz, rf(1.2, 1.7), 0.02, rf(0.9, 1.2), col(rpick([0x5a2a24, 0x2a3a4a, 0x4a3a2a]), 0.2), { ry: rf(-0.2, 0.2) });
      else if (k < 0.6) { S.box(wx, 0, wz, 0.45, 0.45, 0.45, col(0x5a4632, 0.2), { ry: rf(0, 3), rx: rr() < 0.5 ? Math.PI / 2 : 0 }); } // toppled chair / box
      else if (k < 0.72 && t2 === 'supermarket') for (let i = 0; i < 5; i++) S.geo(G_CYL6, wx + rf(-0.6, 0.6), 0.07, wz + rf(-0.6, 0.6), 0.13, 0.17, 0.13, col(rpick([0x8a3a2a, 0x3a5a7a, 0xb09a6a])), { rz: Math.PI / 2, ry: rf(0, 3) });
      else if (k < 0.8 && (t2 === 'factory' || t2 === 'depot')) S.box(wx, 0, wz, 1.2, 0.14, 1.0, col(0x6a5034, 0.2), { ry: rf(-0.3, 0.3) });
      else if (k < 0.88) S.geo(G_ICO, wx, 0.05, wz, rf(0.3, 0.6), 0.18, rf(0.3, 0.6), col(0x4a4640, 0.3), { ry: rf(0, 3) });
      else GD.geo(G_CYL8, wx, 0.006, wz, rf(0.8, 1.4), 0.006, rf(0.6, 1.1), col(0x26221e), { ry: rf(0, 3) });
    }
  }

  /* ================================================================ shelter, camp, bus ================================================================ */
  function buildBunker() {
    const bk = WORLD.bunker, hk = WORLD.hatch; if (!bk) return;
    const X0 = bk.x * 2, Z0 = bk.y * 2, W2 = bk.w * 2, D2 = bk.h * 2, cx = X0 + W2 / 2, cz = Z0 + D2 / 2, Hh = 3.1, bid = 98;
    const conc = col(0x7e7a70);
    S.box(cx, 0, cz, W2, Hh, D2, null, { fc: [conc, conc, col(0x5e5a52), col(PAL.dark), conc, conc], grad: 0.55, bid });
    S.box(cx, Hh, cz, W2 + 0.3, 0.25, D2 + 0.3, col(0x5a564e), { bid });
    const sz = Z0 + D2;
    for (let i = 0; i < 12; i++) S.box(X0 + 0.25 + i * (W2 - 0.5) / 11, 0, sz + 0.03, (W2 - 0.5) / 11 * 0.98, 0.4, 0.06, col(i % 2 ? 0x1a1816 : 0xb08a2a, 0.1), { bid });
    /* metro roundel */
    const rx = X0 + 1.3, ry = 2.0;
    S.geo(G_CYL12, rx, ry, sz + 0.06, 1.2, 0.06, 1.2, col(0x9a2620), { rx: Math.PI / 2, bid });
    S.geo(G_CYL12, rx, ry, sz + 0.1, 0.78, 0.06, 0.78, col(0xb8b0a0), { rx: Math.PI / 2, bid });
    S.box(rx, ry - 0.14, sz + 0.13, 1.5, 0.28, 0.05, col(0x24346a), { bid });
    /* steel door + caged ember lamp over the hatch */
    const hx = (hk.x + 0.5) * 2, hz = (hk.y + 0.5) * 2;
    S.box(hx, 0, sz + 0.04, 1.4, 2.3, 0.1, col(0x3a3c3e), { bid }); S.box(hx, 0, sz + 0.1, 1.2, 2.15, 0.04, col(0x2a2c2e), { bid });
    S.box(hx, 2.55, sz + 0.18, 0.3, 0.32, 0.26, col(PAL.fire), { bid, glow: [1.8, 0] });
    for (const o of [-0.13, 0.13]) S.box(hx + o, 2.53, sz + 0.32, 0.03, 0.36, 0.03, col(PAL.dark), { bid });
    /* roof vents, pipe, ladder, sandbags */
    for (const vx of [X0 + 0.9, X0 + 2.4]) { S.geo(G_CYL8, vx, Hh + 0.6, Z0 + 1.2, 0.35, 1.0, 0.35, col(0x4a4844), { bid }); S.geo(G_CYL8, vx, Hh + 1.15, Z0 + 1.2, 0.7, 0.18, 0.7, col(0x3a3836), { bid }); }
    S.box(X0 - 0.12, 0.5, Z0 + 1.0, 0.16, 2.8, 0.16, col(0x4a4038), { bid });
    for (const lz of [cz - 0.3, cz + 0.3]) S.box(X0 + W2 + 0.06, 0, lz, 0.06, Hh + 0.6, 0.06, col(PAL.steel), { bid });
    for (let k = 0; k < 7; k++) S.box(X0 + W2 + 0.07, 0.3 + k * 0.45, cz, 0.05, 0.05, 0.6, col(PAL.steel), { bid });
    for (const sx of [X0 - 0.4, X0 + W2 + 0.4]) for (let k = 0; k < 3; k++) S.geo(G_CYL8, sx, 0.2 + (k === 2 ? 0.34 : 0), sz - 0.5 - (k % 2) * 0.7, 0.85, 0.34, 0.5, col(PAL.sand, 0.15), { rz: Math.PI / 2 });
    /* the hatch: steel frame, lid leaning back, ember glow from below */
    const fr = col(0x3c3e40);
    S.box(hx, 0, hz - 0.78, 1.76, 0.18, 0.2, fr); S.box(hx, 0, hz + 0.78, 1.76, 0.18, 0.2, fr);
    S.box(hx - 0.78, 0, hz, 0.2, 0.18, 1.36, fr); S.box(hx + 0.78, 0, hz, 0.2, 0.18, 1.36, fr);
    S.box(hx, 0.005, hz, 1.36, 0.03, 1.36, col(0xff9a48), { glow: [1.5, 0] });
    for (let k = -1; k <= 1; k++) S.box(hx, 0.04, hz + k * 0.38, 0.8, 0.03, 0.07, col(PAL.dark));
    for (const o of [-0.4, 0.4]) S.box(hx + o, 0.03, hz, 0.06, 0.04, 1.3, col(PAL.dark));
    S.geo(G_BOX, hx, 0.18 + 0.664, hz - 0.78 - 0.226, 1.5, 0.08, 1.4, col(0x46484a), { rx: -1.9 });
    fires.push({ x: hx / 2, y: hz / 2, k: 0.7, hatch: true });
  }
  function buildCamp() {
    const g = WORLD.gate; if (!g) return;
    const sheets = [0x6a3a22, 0x5a5650, 0x3a3634, 0x7a5a3a, 0x4a4a46];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (tileAt(x, y) !== T_WALL || bIdx[y * W + x] >= 0 || inBunker(x, y)) continue;
      const wx = (x + 0.5) * 2, wz = (y + 0.5) * 2;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nt = tileAt(x + dx, y + dy); if ([T_WALL, T_YARD, T_ROOF, T_DOOR].includes(nt)) continue;
        const ry = Math.atan2(dx, dy);
        for (const k of [-0.66, 0, 0.66]) {
          const px = wx + dx * 0.55 + dy * k, pz = wz + dy * 0.55 - dx * k, hh = rf(2.5, 3.3);
          S.geo(G_BOX, px, hh / 2, pz, 0.72, hh, 0.07, col(rpick(sheets), 0.2), { ry, rz: rf(-0.05, 0.05), rx: rf(-0.06, 0.03), bid: 99 });
          S.geo(G_CONE5, px, hh + 0.18, pz, 0.14, 0.4, 0.14, col(PAL.rust), { bid: 99 });
        }
        S.box(wx + dx * 0.3, 0, wz + dy * 0.3, 0.16, 2.6, 0.16, col(PAL.wood2), { bid: 99 });
        if (rr() < 0.35) S.geo(G_CYL8, wx - dx * 0.4 + rf(-0.4, 0.4), 0.45, wz - dy * 0.4 + rf(-0.4, 0.4), 0.62, 0.9, 0.62, col(rpick([0x5a3422, 0x2e3a2e, 0x3a3a3a])), { bid: 99 });
        if (rr() < 0.3) for (let i = 0; i < 3; i++) S.geo(G_TOR, wx + dx * 1.3, 0.14 + i * 0.26, wz + dy * 1.3, 1, 1, 1, col(0x161514), { rx: Math.PI / 2, bid: 99 });
      }
    }
    const gx = (g.x + 0.5) * 2, gz = (g.y + 0.5) * 2, dw = col(0x2e2620), bid = 99;
    for (const sx of [-1.05, 1.05]) S.box(gx + sx, 0, gz + 0.5, 0.4, 4.6, 0.4, dw, { bid });
    S.box(gx, 4.15, gz + 0.5, 2.9, 0.4, 0.4, dw, { bid });
    for (let k = 0; k < 5; k++) S.geo(G_CONE5, gx - 1.2 + k * 0.6, 4.75, gz + 0.5, 0.14, 0.5, 0.14, col(PAL.rust), { bid });
    S.box(gx, 3.0, gz + 0.75, 2.0, 0.75, 0.08, col(0x2a2420), { bid });
    S.box(gx, 3.25, gz + 0.8, 1.7, 0.18, 0.04, col(0x8a2a1c), { bid });
    S.box(gx - 1.3, 0, gz + 1.0, 0.35, 1.2, 0.35, col(0x3a3836), { bid });
    for (let i = 0; i < 4; i++) { const a = 1.25, l = 0.65, sx = gx - 1.3 + Math.cos(a) * l * i, sy = 1.15 + Math.sin(a) * l * i; S.beam(sx, sy, gz + 1.0, sx + Math.cos(a) * l, sy + Math.sin(a) * l, gz + 1.0, 0.12, col(i % 2 ? 0xb8b0a0 : 0x9a2a1c), { bid }); }
    for (const sx of [-2.2, 2.2]) addFire(gx + sx, gz + 2.1);
    for (const [px, pz] of [[(g.x - 3.5) * 2, gz - 0.2], [(g.x + 3.5) * 2, gz - 0.2]]) {
      S.geo(G_CYL6, px, 3.2, pz, 0.14, 6.4, 0.14, col(0x2a2826), { bid });
      S.box(px + 0.75, 5.2, pz, 1.4, 0.95, 0.05, col(0x121010), { bid, ry: 0.2 });
    }
  }
  function addFire(wx, wz) { S.add(KIT.barrelFire(), M(wx, 0, wz, rr() * 6, 1, 1, 1), null, { bid: 0 }); fires.push({ x: wx / 2, y: wz / 2, k: 1 }); }
  function buildBus() {
    if (busMesh) { root.remove(busMesh); busMesh.geometry.dispose(); busMesh = null; }
    const b = WORLD.bus; if (!b) return;
    busReady = !!(G && G.flags && G.flags.bus_ready);
    const B = new Bld(); B.add(KIT.bus(busReady), M((b.x + 0.5) * 2, busReady ? 0.08 : 0, (b.y + 0.5) * 2, 0.04, 1, 1, 1, 0, busReady ? 0 : 0.03), null, { bid: 95 });
    busMesh = new THREE.Mesh(B.geometry(), mats.solid); busMesh.castShadow = busMesh.receiveShadow = true; root.add(busMesh);
  }

  /* ================================================================ props: trees, cars, lamps, grass ================================================================ */
  function instanced(geo, mat, list, cast) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c || WHITE); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = !!cast; im.receiveShadow = true; im.computeBoundingSphere && im.computeBoundingSphere();
    root.add(im); return im;
  }
  const mcopy = (...a) => M(...a).clone();
  function buildProps(lampSpots, fieldStalks) {
    const pines = [], dead = [], leafy = [], cars = [], lampsOn = [], lampsOff = [], tufts = [], stalks = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tileAt(x, y), wx = (x + 0.5) * 2, wz = (y + 0.5) * 2;
      if (t === T_TREE) {
        const forest = districtAt(x, y) === 'forest', k = rr(), s = rf(0.8, 1.2);
        const m = mcopy(wx + rf(-0.3, 0.3), 0, wz + rf(-0.3, 0.3), rf(0, 6.28), s, s * rf(0.85, 1.15), s, rf(-0.04, 0.04), rf(-0.04, 0.04));
        const c = col(0xffffff, 0.25);
        if (forest ? k < 0.72 : k < 0.18) pines.push({ m, c }); else if (k < (forest ? 0.85 : 0.6)) dead.push({ m, c }); else leafy.push({ m, c });
      } else if (t === T_CAR) {
        const horiz = roadRow(y) && !roadCol(x) ? true : !roadRow(y) && roadCol(x) ? false : rr() < 0.5;
        const cont = WORLD.containers.find(c => c.x === x && c.y === y);
        const crash = rr() < 0.18, flip = !cont && rr() < 0.15, burnt = rr() < 0.25;
        const ry = (horiz ? 0 : Math.PI / 2) + (rr() < 0.5 ? Math.PI : 0) + (crash ? rf(-0.9, 0.9) : rf(-0.25, 0.25));
        const paint = burnt ? col(0x2a2420, 0.3) : col(rpick([0x7a3a2a, 0x3e4e5e, 0x8a8270, 0x5a5e58, 0x4e5a3e, 0x9a9488, 0x6a4a2a]), 0.2);
        const m = flip ? mcopy(wx, 1.7, wz, ry, 1, 1, 1, Math.PI + rf(-0.1, 0.1), 0) : mcopy(wx, 0, wz, ry, 1, 1, 1, 0, rf(-0.03, 0.03));
        cars.push({ m, c: paint });
        if (cont) carAt[x + ',' + y] = { m, c: paint };
      } else if (t === T_GRASS && rr() < 0.75 && bIdx[y * W + x] < 0) {
        const n = rr() < 0.4 ? 2 : 1;
        for (let i = 0; i < n; i++) { const s = rf(0.8, 1.5); tufts.push({ m: mcopy(wx + rf(-0.9, 0.9), 0, wz + rf(-0.9, 0.9), rf(0, 6), s, s * rf(0.7, 1.3), s), c: mixc(0x6a6a4c, 0x8a7a50, rr()) }); }
      }
    }
    for (const l of lampSpots) {
      const broken = rr() < 0.3, ry = Math.atan2(-l.dz, l.dx);
      (broken ? lampsOff : lampsOn).push({ m: mcopy(l.x, 0, l.z, ry, 1, 1, 1, broken ? rf(-0.12, 0.12) : 0, broken ? rf(-0.15, 0.15) : 0), c: col(0xffffff, 0.15) });
      if (!broken) l.on = true;
    }
    for (const [sx, sz] of fieldStalks) stalks.push({ m: mcopy(sx, 0, sz, rf(0, 6), 1, rf(0.7, 1.2), 1, rf(-0.15, 0.15), rf(-0.15, 0.15)), c: col(0xffffff, 0.3) });
    instanced(KIT.pine(), mats.tree, pines, true);
    instanced(KIT.deadTree(false), mats.tree, dead, true);
    instanced(KIT.deadTree(true), mats.tree, leafy, true);
    instanced(KIT.car(), mats.inst, cars, true);
    instanced(KIT.lamp(true), mats.inst, lampsOn, true);
    instanced(KIT.lamp(false), mats.inst, lampsOff, true);
    instanced(G_BLADES, mats.grass, tufts, false);
    instanced(KIT.stalk(), mats.grass, stalks, false);
    /* light pools under working lamps (additive decals, brighten at night) */
    const on = lampSpots.filter(l => l.on);
    if (on.length) {
      const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2); own(pg);
      lampPools = new THREE.InstancedMesh(pg, mats.pool, on.length);
      on.forEach((l, i) => lampPools.setMatrixAt(i, mcopy(l.x + l.dx * 1.5, 0.03, l.z + l.dz * 1.5, 0, 7, 1, 7)));
      lampPools.renderOrder = 2; root.add(lampPools);
    }
  }
  /* outskirts forest (merged into chunks so it is frustum culled) */
  function buildOutskirts() {
    const pine = KIT.pine(), dead = KIT.deadTree(false);
    for (let y = -MG; y < H + MG; y++) for (let x = -MG; x < W + MG; x++) {
      if (x >= 0 && y >= 0 && x < W && y < H) continue;
      const t = tAt(x, y); if (t !== -1) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => tAt(x + a, y + b) !== -1 && !(x + a >= 0 && y + b >= 0 && x + a < W && y + b < H))) { if (rr() < 0.7) continue; }
      const dEdge = Math.max(-x, x - W + 1, -y, y - H + 1);
      if (rr() > 0.3 + dEdge * 0.05) continue;
      const s = rf(0.85, 1.3), k = rr();
      S.add(k < 0.75 ? pine : dead, M((x + 0.5) * 2 + rf(-0.5, 0.5), 0, (y + 0.5) * 2 + rf(-0.5, 0.5), rf(0, 6), s, s, s), col(0xffffff, 0.25), { bid: 97 });
    }
  }
  /* river surface + bridges */
  function buildRiver() {
    const x0 = RIVER_X[0] * 2, wd = RIVER_X.length * 2, z0 = -MG * 2, len = (H + 2 * MG) * 2;
    const g = own(new THREE.PlaneGeometry(wd, len, 4, len)); g.rotateX(-Math.PI / 2);
    const n = g.attributes.position.count, cs = new Float32Array(n * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cs, 3));
    water = new THREE.Mesh(g, mats.water); water.position.set(x0 + wd / 2, -0.45, z0 + len / 2); water.receiveShadow = true;
    waterBase = Float32Array.from(g.attributes.position.array);
    root.add(water);
    for (const Y of ROADS_Y) {
      const z1 = Y * 2, z2 = (Y + 2) * 2, xb0 = x0, xb1 = x0 + wd, cxm = (xb0 + xb1) / 2, deck = col(0x403e3a);
      S.box(cxm, -0.6, (z1 + z2) / 2, xb1 - xb0, 0.6, z2 - z1, null, { fc: [col(0x6a665e), col(0x6a665e), deck, col(PAL.dark), col(0x6a665e), col(0x6a665e)] });
      for (const [ez, s] of [[z1 + 0.12, 1], [z2 - 0.12, -1]]) {
        S.box(cxm, 0, ez, xb1 - xb0 + 1.2, 0.22, 0.24, col(0x7a766e));
        for (let x = xb0 - 0.5; x <= xb1 + 0.5; x += 1.0) if (rr() < 0.88) S.box(x, 0.2, ez, 0.08, 0.85, 0.08, col(PAL.rust, 0.2));
        S.box(cxm + rf(-0.3, 0.3), 1.0, ez, xb1 - xb0 + 1.0, 0.07, 0.1, col(PAL.rust, 0.2), { rz: rr() < 0.3 ? rf(-0.08, 0.08) : 0 });
      }
      for (const pz of [z1 + 1, z2 - 1]) S.geo(G_CYL8, cxm, -0.95, pz, 0.8, 0.7, 0.8, col(0x5e5a52));
    }
  }

  /* ================================================================ containers ================================================================ */
  function buildContainers() {
    const BB = new Bld(), LB = new Bld(), tmp = new Bld();
    conts = {}; contObjs = new THREE.Group(); root.add(contObjs);
    for (const c of WORLD.containers) {
      const K = contKit(c.kind, c.loc);
      let m;
      const car = carAt[c.x + ',' + c.y];
      if (c.kind === 'trunk') m = car ? car.m.clone() : M((c.x + 0.5) * 2, 0, (c.y + 0.5) * 2, 0, 1, 1, 1).clone();
      else {
        let ry;
        const wall = (dx, dy) => { const t = tileAt(c.x + dx, c.y + dy); return t === T_WALL || t === T_ROOF; };
        if (wall(0, -1)) ry = 0; else if (wall(-1, 0)) ry = Math.PI / 2; else if (wall(1, 0)) ry = -Math.PI / 2; else if (wall(0, 1)) ry = Math.PI;
        else ry = Math.floor(rr() * 4) * Math.PI / 2 + rf(-0.3, 0.3);
        m = M((c.x + 0.5) * 2, 0, (c.y + 0.5) * 2, ry, 1, 1, 1).clone();
      }
      const tint = c.kind === 'trunk' && car ? car.c : WHITE;
      const bs = BB.count; BB.add(K.body, m, WHITE); const bc = BB.count - bs;
      const ls = LB.count; LB.add(K.lid, m, tint); const lc = LB.count - ls;
      tmp.p.length = tmp.n.length = tmp.c.length = tmp.g.length = tmp.b.length = 0;
      tmp.add(K.lid, new THREE.Matrix4().multiplyMatrices(m, K.open), tint);
      const o = new THREE.Object3D(); o.position.set((c.x + 0.5) * 2, 0, (c.y + 0.5) * 2); o.quaternion.setFromRotationMatrix(m); o.userData = { id: c.id, kind: c.kind };
      contObjs.add(o);
      conts[c.id] = { c, m, K, bs, bc, ls, lc, openP: Float32Array.from(tmp.p), openN: Float32Array.from(tmp.n), opened: false, obj: o, car };
    }
    contGeo = own(BB.geometry()); lidGeo = own(LB.geometry());
    for (const id in conts) { const k = conts[id]; k.col = contGeo.attributes.color.array.slice(k.bs * 3, (k.bs + k.bc) * 3); k.closedP = lidGeo.attributes.position.array.slice(k.ls * 3, (k.ls + k.lc) * 3); k.closedN = lidGeo.attributes.normal.array.slice(k.ls * 3, (k.ls + k.lc) * 3); }
    const a = new THREE.Mesh(contGeo, mats.cont), b = new THREE.Mesh(lidGeo, mats.cont);
    a.castShadow = b.castShadow = true; a.receiveShadow = b.receiveShadow = true; root.add(a); root.add(b);
  }

  /* ================================================================ shelter yard structures ================================================================ */
  const SLOT_MODELS = {
    bed(B, X, Z, w, d, lv) {
      const wood = col(PAL.wood, 0.1), cloth = [0x5a4a3a, 0x3e4a3a, 0x6a5a48, 0x4a3e3e];
      if (lv === 1) {
        for (const px of [X + 0.4, X + w - 0.4]) B.box(px, 0, Z + 0.4, 0.1, 1.9, 0.1, wood);
        B.geo(G_BOX, X + w / 2, 1.45, Z + d * 0.45, w - 0.2, 0.05, d * 0.95, col(PAL.tarp), { rx: 0.42 });
        for (let i = 0; i < 2; i++) B.geo(G_CYL8, X + 1.2 + i * 2.2, 0.12, Z + d * 0.55, 0.36, 1.8, 0.5, col(rpick(cloth)), { rx: Math.PI / 2 });
        return;
      }
      const n = lv === 2 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const bx = X + 0.75 + i * (w - 1.5) / Math.max(1, n - 1);
        for (const [a, b2] of [[-0.45, -0.95], [0.45, -0.95], [-0.45, 0.95], [0.45, 0.95]]) B.box(bx + a, 0, Z + d / 2 + b2 * 0.95, 0.08, 1.75, 0.08, col(0x3a3c3e));
        for (const y of [0.4, 1.3]) { B.box(bx, y, Z + d / 2, 0.95, 0.08, 1.95, col(0x3a3c3e)); B.box(bx, y + 0.08, Z + d / 2, 0.85, 0.14, 1.85, col(rpick(cloth), 0.15)); }
      }
      if (lv === 2) { for (const px of [X + 0.1, X + w - 0.1]) for (const pz of [Z + 0.1, Z + d - 0.1]) B.box(px, 0, pz, 0.12, 2.3, 0.12, wood); B.box(X + w / 2, 2.3, Z + d / 2, w + 0.3, 0.06, d + 0.3, col(PAL.rust, 0.1), { rx: 0.05 }); }
      else {
        const ply = col(0x7a6448, 0.08);
        B.box(X + w / 2, 0, Z + 0.06, w, 2.4, 0.12, ply); B.box(X + 0.06, 0, Z + d / 2, 0.12, 2.4, d, ply); B.box(X + w - 0.06, 0, Z + d / 2, 0.12, 2.4, d, ply);
        B.box(X + 0.8, 0, Z + d - 0.06, 1.6, 2.4, 0.12, ply); B.box(X + w - 0.8, 0, Z + d - 0.06, 1.6, 2.4, 0.12, ply); B.box(X + w / 2, 1.9, Z + d - 0.06, w - 3.2, 0.5, 0.12, ply);
        B.geo(G_PRISM, X + w / 2, 2.4, Z + d / 2, d + 0.4, 0.9, w + 0.4, col(PAL.rust, 0.1), { ry: Math.PI / 2 });
        B.box(X + 0.9, 1.1, Z + d - 0.0, 0.7, 0.6, 0.04, col(0x7a5a34), { glow: [0, 1.2] });
      }
    },
    rain(B, X, Z, w, d, lv) {
      const cx = X + w / 2, cz = Z + d / 2, blue = col(0x2e4a62, 0.1);
      if (lv >= 3) {
        B.box(cx, 0, cz, 1.4, 0.15, 1.4, col(PAL.wood)); B.box(cx, 0.15, cz, 1.2, 1.2, 1.2, col(0xb8b4a8, 0.05));
        for (const o of [-0.6, 0.6]) { B.box(cx + o, 0.15, cz, 0.05, 1.25, 1.25, col(0x6a6a66)); B.box(cx, 0.15, cz + o, 1.25, 1.25, 0.05, col(0x6a6a66)); }
        B.geo(G_CONE7, cx, 1.75, cz, 1.8, 0.6, 1.8, col(PAL.tarp), { rx: Math.PI });
        return;
      }
      B.geo(G_CYL12, cx - (lv > 1 ? 0.45 : 0), 0.5, cz, 0.8, 1.0, 0.8, blue);
      if (lv > 1) { B.geo(G_CYL12, cx + 0.45, 0.5, cz, 0.8, 1.0, 0.8, blue); B.box(cx, 1.05, cz, 1.8, 0.1, 0.2, col(PAL.rust)); for (const o of [-0.85, 0.85]) B.box(cx + o, 0, cz - 0.2, 0.08, 1.9, 0.08, col(PAL.wood)); B.box(cx, 1.8, cz - 0.2, 1.9, 0.08, 0.6, col(PAL.rust), { rx: 0.3 }); }
      B.geo(G_CONE7, cx - (lv > 1 ? 0.45 : 0), 1.3, cz, 1.3, 0.5, 1.3, col(PAL.tarp), { rx: Math.PI });
    },
    tower(B, X, Z, w, d) {
      const cx = X + w / 2, cz = Z + d / 2, wood = col(PAL.wood, 0.1), P = 5.2;
      for (const [a, b2] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) B.beam(cx + a * 1.1, 0, cz + b2 * 1.1, cx + a * 0.85, P, cz + b2 * 0.85, 0.18, wood);
      for (const y of [1.6, 3.4]) { B.beam(cx - 1.0, y, cz + 1.0, cx + 1.0, y + 1.2, cz + 1.0, 0.1, wood); B.beam(cx - 1.0, y, cz - 1.0, cx + 1.0, y + 1.2, cz - 1.0, 0.1, wood); }
      B.box(cx, P, cz, 2.3, 0.15, 2.3, col(PAL.wood2));
      for (const [a, b2, rw, rd] of [[0, -1.1, 2.3, 0.08], [0, 1.1, 2.3, 0.08], [-1.1, 0, 0.08, 2.3], [1.1, 0, 0.08, 2.3]]) B.box(cx + a, P + 0.15, cz + b2, rw, 0.9, rd, wood);
      for (const [a, b2] of [[-1.05, -1.05], [1.05, -1.05], [-1.05, 1.05], [1.05, 1.05]]) B.box(cx + a, P, cz + b2, 0.1, 2.1, 0.1, wood);
      B.geo(G_PRISM, cx, P + 2.1, cz, 2.6, 0.8, 2.6, col(PAL.rust, 0.1));
      for (let k = 0; k < 9; k++) B.box(cx, 0.3 + k * 0.55, cz + 1.25, 0.6, 0.06, 0.06, wood);
      for (const o of [-0.3, 0.3]) B.box(cx + o, 0, cz + 1.25, 0.07, P, 0.07, wood);
      B.box(cx + 0.6, P + 1.2, cz - 0.9, 0.3, 0.25, 0.4, col(0xffd8a0), { glow: [0, 1.4] });
    },
    bench(B, X, Z, w, d, lv) {
      const wood = col(PAL.wood, 0.1), cx = X + w / 2;
      B.box(cx, 0.85, Z + 0.7, w - 0.3, 0.1, 1.0, wood); for (const a of [-1, 1]) for (const b2 of [0.3, 1.1]) B.box(cx + a * (w / 2 - 0.3), 0, Z + b2, 0.1, 0.85, 0.1, wood);
      B.box(cx, 0.95, Z + 0.15, w - 0.3, 1.2, 0.06, col(0x6a5a44)); for (let i = 0; i < 5; i++) B.box(cx - 1 + i * 0.5, 1.3 + (i % 2) * 0.3, Z + 0.2, 0.08, 0.4, 0.04, col(PAL.steel));
      B.box(cx - 0.9, 0.95, Z + 0.8, 0.3, 0.25, 0.25, col(0x3a4a5a));
      if (lv >= 2) { B.box(cx + 1.0, 0.95, Z + 0.7, 0.3, 0.9, 0.3, col(0x5a6a4a)); B.box(cx + 1.0, 1.7, Z + 0.85, 0.4, 0.2, 0.5, col(0x5a6a4a)); }
      if (lv >= 3) { B.box(cx, 2.15, Z + 0.15, 0.4, 0.15, 0.3, col(0xffd8a0), { glow: [0, 1.6] }); B.box(cx + 1.6, 0, Z + 0.5, 0.6, 1.8, 0.5, col(PAL.steel)); }
    },
    forge(B, X, Z, w, d, lv) {
      const brick = col(0x6a3a2c, 0.1), cx = X + 0.9, cz = Z + d / 2, s = lv >= 2 ? 1.25 : 1;
      B.box(cx, 0, cz, 1.4 * s, 1.1 * s, 1.3, brick, { grad: 0.6 });
      B.box(cx, 0.35 * s, cz + 0.66, 0.6, 0.4, 0.04, col(0xff7a2a), { glow: [1.9, 0] });
      B.geo(G_CYL8, cx - 0.3, 1.1 * s + 1.0, cz - 0.3, 0.4, 2.0, 0.4, col(0x3a3836));
      B.geo(G_BOX, X + 2.3, 0.35, cz, 0.5, 0.7, 0.4, col(0x2a2826)); B.box(X + 2.3, 0.7, cz, 0.8, 0.22, 0.32, col(0x3a3c3e));
      if (lv >= 2) B.geo(G_PRISM, X + 2.3, 0, cz + 0.8, 0.9, 0.5, 0.6, col(0x5a3a26), { ry: 0.3 });
    },
    purifier(B, X, Z, w, d, lv) {
      const cx = X + w / 2, cz = Z + d / 2, blue = col(0x2e4a62), steel = col(0x6a6c6a);
      B.geo(G_CYL12, cx - 0.45, 0.45, cz + 0.3, 0.7, 0.9, 0.7, blue); B.geo(G_CYL12, cx + 0.45, 0.45, cz + 0.3, 0.7, 0.9, 0.7, col(0x7a3a2a));
      for (let i = 0; i < lv + 1; i++) B.geo(G_CYL8, cx - 0.5 + i * 0.5, 0.85, cz - 0.45, 0.28, 1.7, 0.28, steel);
      B.box(cx, 1.55, cz - 0.45, 1.4, 0.08, 0.08, steel); B.beam(cx - 0.45, 0.9, cz + 0.3, cx - 0.5, 1.55, cz - 0.45, 0.06, steel);
    },
    kitchen(B, X, Z, w, d, lv) {
      const cx = X + 1.0, cz = Z + d / 2;
      B.geo(G_CYL12, cx, 0.75, cz, 1.0, 0.4, 1.0, col(0x3a3a38)); for (const [a, b2] of [[-0.3, -0.3], [0.3, -0.3], [0, 0.35]]) B.box(cx + a, 0, cz + b2, 0.06, 0.6, 0.06, col(0x2a2826));
      B.geo(G_CYL12, cx, 0.96, cz, 0.85, 0.03, 0.85, col(0xff6a22), { glow: [1.5, 0] });
      B.geo(G_CYL8, cx + 0.15, 1.1, cz, 0.42, 0.32, 0.42, col(0x4a4a48));
      B.box(X + 2.3, 0.75, cz, 1.0, 0.08, 0.7, col(PAL.wood)); for (const a of [-0.4, 0.4]) B.box(X + 2.3 + a, 0, cz, 0.08, 0.75, 0.6, col(PAL.wood2));
      if (lv >= 2) { B.box(X + 2.3, 0.83, cz, 0.7, 0.55, 0.5, col(0x5a5852)); B.geo(G_CYL6, X + 2.5, 1.9, cz, 0.18, 1.6, 0.18, col(0x3a3836)); }
    },
    woodshop(B, X, Z, w, d, lv) {
      const n = lv >= 2 ? 3 : 2;
      for (let r2 = 0; r2 < n; r2++) for (let i = 0; i < 4 - r2; i++) B.geo(G_CYL8, X + 0.9 + i * 0.36 + r2 * 0.18, 0.18 + r2 * 0.32, Z + d * 0.35, 0.34, 1.4, 0.34, col(0x5a4630, 0.15), { rx: Math.PI / 2 });
      B.geo(G_CYL8, X + 2.4, 0.3, Z + d * 0.7, 0.6, 0.6, 0.6, col(0x6a5034)); B.beam(X + 2.4, 0.6, Z + d * 0.7, X + 2.6, 1.05, Z + d * 0.7 + 0.15, 0.06, col(PAL.wood2));
      B.box(X + 1.2, 0.55, Z + d * 0.78, 1.4, 0.1, 0.25, col(PAL.wood)); for (const a of [-0.55, 0.55]) B.box(X + 1.2 + a, 0, Z + d * 0.78, 0.08, 0.55, 0.4, col(PAL.wood2));
      if (lv >= 2) for (let i = 0; i < 4; i++) B.box(X + 1.2, 0.05 + i * 0.07, Z + d * 0.95, 1.6, 0.06, 0.3, col(0x7a6048, 0.1));
    },
    garden(B, X, Z, w, d, lv) {
      const beds = lv + (lv >= 3 ? 1 : 0), green = [0x5a7a3a, 0x6a8a42, 0x4e6e34];
      for (let i = 0; i < Math.min(4, beds); i++) {
        const bx = X + 0.9 + (i % 2) * 2.6, bz = Z + 1.0 + Math.floor(i / 2) * 2.4;
        B.box(bx + 0.6, 0, bz, 2.2, 0.3, 1.5, col(PAL.wood, 0.1), { fc: [undefined, undefined, col(0x3a2a1e)] });
        for (let k = 0; k < 6; k++) B.geo(rr() < 0.5 ? G_ICO : G_CONE5, bx + rf(-0.3, 1.5), 0.3 + 0.15 * lv, bz + rf(-0.5, 0.5), 0.3 + 0.1 * lv, 0.25 + 0.12 * lv, 0.3 + 0.1 * lv, col(rpick(green), 0.2), { ry: rf(0, 3) });
        for (let k = 0; k < 2; k++) B.box(bx + rf(-0.3, 1.5), 0.3, bz + rf(-0.5, 0.5), 0.04, 0.7, 0.04, col(PAL.wood2));
      }
    },
    infirmary(B, X, Z, w, d, lv) {
      const cx = X + w / 2, cz = Z + d / 2, canvas = col(0xb0aa98), s = lv >= 2 ? 1.15 : 1;
      B.geo(G_PRISM, cx, 0, cz, d * s, 2.3, w * s, canvas, { ry: Math.PI / 2, fc: [canvas, canvas.clone().multiplyScalar(0.85), col(PAL.dark), col(0x22201c)] });
      B.box(cx, 1.0, cz + d * s / 2 * 0.55 + 0.02, 0.5, 0.15, 0.02, col(0x9a2a24), { rx: -0.6 }); B.box(cx, 1.0, cz + d * s / 2 * 0.55 + 0.02, 0.15, 0.5, 0.02, col(0x9a2a24), { rx: -0.6 });
      for (let i = 0; i < lv + 1; i++) B.box(X + 0.6 + i * 1.1, 0.35, Z + d + 0.35, 0.7, 0.12, 0.5, col(0x8a8676));
    },
    radio(B, X, Z, w, d) {
      const cx = X + w / 2, cz = Z + d / 2, base = 3.35, steel = col(0x5a5a56);
      B.box(cx, base, cz, 0.7, 0.45, 0.5, col(0x3a4a3a)); B.box(cx, base + 0.12, cz + 0.26, 0.4, 0.15, 0.02, col(0xffc070), { glow: [1.0, 0] });
      B.geo(G_CYL6, cx, base + 3.5, cz, 0.12, 7, 0.12, steel);
      for (const [a, b2] of [[1.6, 0], [-1.2, 1.0], [-0.4, -1.4]]) B.beam(cx, base + 5.5, cz, cx + a, base, cz + b2, 0.025, col(0x2a2a2a));
      for (const y of [4.5, 5.6]) B.box(cx, base + y, cz, 1.1, 0.05, 0.05, steel);
      B.geo(G_ICO, cx, base + 7.05, cz, 0.18, 0.18, 0.18, col(0xff3a2a), { glow: [2.2, 0] });
    },
  };
  function wallsRing(B, lv) {
    const r = WORLD.shelterRect, X0 = r.x0 * 2, X1 = (r.x1 + 1) * 2, Z0 = r.y0 * 2, Z1 = (r.y1 + 1) * 2, bk = WORLD.bunker;
    const bx0 = bk.x * 2, bx1 = (bk.x + bk.w) * 2, gapS = [(X0 + X1) / 2 - 1.6, (X0 + X1) / 2 + 1.6], gapEW = [(Z0 + Z1) / 2 - 1.3, (Z0 + Z1) / 2 + 1.3];
    const sides = [[X0, Z0, X1, Z0, [bx0 - 0.2, bx1 + 0.2]], [X0, Z1, X1, Z1, gapS], [X0, Z0, X0, Z1, gapEW], [X1, Z0, X1, Z1, gapEW]];
    for (const [ax, az, bx, bz, gap] of sides) {
      const horiz = az === bz, L0 = horiz ? ax : az, L1 = horiz ? bx : bz, ry = horiz ? 0 : Math.PI / 2;
      const P = s => horiz ? [s, az] : [ax, s];
      const step = lv === 1 ? 1.1 : lv === 2 ? 0.7 : 1.5;
      for (let s = L0 + step / 2; s < L1; s += step) {
        if (s > gap[0] && s < gap[1]) continue;
        const [px, pz] = P(s);
        if (lv === 1) {
          B.geo(G_BOX, px, 0.75, pz, 0.12, 1.5, 0.12, col(PAL.wood, 0.25), { ry, rz: rf(-0.25, 0.25), rx: rf(-0.3, 0.3) });
          if (rr() < 0.8) B.geo(G_BOX, px, rf(0.4, 1.1), pz, 1.3, 0.2, 0.06, col(PAL.wood, 0.3), { ry, rz: rf(-0.2, 0.2) });
          if (rr() < 0.25) B.geo(G_BOX, px, 0.6, pz, 1.0, 1.2, 0.05, col(PAL.rust, 0.3), { ry, rz: rf(-0.1, 0.1) });
        } else if (lv === 2) {
          const hh = rf(1.9, 2.3);
          B.geo(G_BOX, px, hh / 2, pz, 0.74, hh, 0.07, col(rpick([0x6a3a22, 0x5a5650, 0x4a4844, 0x7a5a3a]), 0.2), { ry, rz: rf(-0.04, 0.04) });
          if (Math.round(s / step) % 3 === 0) { B.geo(G_BOX, px, 1.15, pz, 0.12, 2.3, 0.12, col(PAL.wood2), { ry }); B.geo(G_TOR, px, 2.45, pz, 1.1, 1.1, 1.1, col(0x5a5a56), { ry: ry + Math.PI / 2 }); }
        } else {
          B.geo(G_BOX, px, 1.4, pz, 1.42, 2.8, 0.4, col(0x8a867c, 0.08), { ry, grad: 0.6 });
          B.geo(G_BOX, px, 0.2, pz, 1.42, 0.4, 1.0, col(0x7a766c, 0.08), { ry });
          B.geo(G_TOR, px, 3.05, pz, 1.3, 1.3, 1.3, col(0x5a5a56), { ry: ry + Math.PI / 2 });
        }
      }
      if (lv >= 2 && gap !== sides[0][4]) for (const gs of gap) { const [px, pz] = P(gs); B.geo(G_BOX, px, 1.4, pz, 0.3, 2.8, 0.3, col(lv === 3 ? 0x6a665e : PAL.wood2), { ry }); }
    }
  }
  function slotRect(k) {
    const r = WORLD.shelterRect;
    if (k === 'walls') { const c = slotCentre('walls'); return [c.x * 2 - 1.6, c.y * 2 - 0.8, 3.2, 1.6]; }
    const s = BUILD_SLOTS[k]; return [(r.x0 + s[0]) * 2, (r.y0 + s[1]) * 2, s[2] * 2, s[3] * 2];
  }

  /* ================================================================ public object ================================================================ */
  const self = {
    group: null, barricade: null, cutBuilding: -1, fires,

    build() {
      if (!WORLD) return;
      templates(); materials();
      this.dispose();
      rr = seeded(((G && G.seed) || 1) ^ 0x5eed1234); NSEED = ((G && G.seed) || 1) & 0xffff;
      root = this.group = new THREE.Group(); root.name = 'world'; R.scene.add(root);
      chunkMap = {}; carAt = {}; heights = []; fires = this.fires = []; markers = {};
      bIdx = new Int16Array(W * H).fill(-1);
      WORLD.roofs.forEach((r, i) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x >= 0 && y >= 0 && x < W && y < H) bIdx[y * W + x] = i; });
      const lampSpots = [], fieldStalks = [];
      buildGround();
      buildStreets(lampSpots);
      buildDetails(fieldStalks);
      WORLD.roofs.forEach((r, i) => building(r, i));
      buildBunker(); buildCamp(); buildRiver(); buildOutskirts();
      /* burning barrels in rough districts */
      const spots = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (tileAt(x, y) === T_GRASS && ['street', 'depot', 'factory', 'gas'].includes(districtAt(x, y)) && bIdx[y * W + x] < 0 && isRoadT(tileAt(x, y + 1))) spots.push([x, y]);
      for (let i = 0; i < 5 && spots.length; i++) { const [x, y] = spots.splice(Math.floor(rr() * spots.length), 1)[0]; addFire((x + 0.5) * 2 + rf(-0.4, 0.4), (y + 0.5) * 2 - 0.3); }
      buildProps(lampSpots, fieldStalks);
      buildContainers();
      for (const k in chunkMap) {
        const b = chunkMap[k]; if (!b.count) continue;
        const solid = k[0] === 's', mesh = new THREE.Mesh(own(b.geometry()), solid ? mats.solid : mats.ground);
        mesh.castShadow = solid; mesh.receiveShadow = true; root.add(mesh);
      }
      chunkMap = {};
      buildBus();
      /* fire light pools (static fires + shelter fires, rewritten by refreshShelter) */
      const pg = own(new THREE.PlaneGeometry(1, 1)); pg.rotateX(-Math.PI / 2);
      firePools = new THREE.InstancedMesh(pg, mats.firePool, 48); firePools.count = 0; firePools.renderOrder = 2; root.add(firePools);
      firePoolBase = fires.length; this._syncFirePools();
      /* beacon, highlight, ash, sparks */
      const bg = own(new THREE.CylinderGeometry(0.45, 0.9, 34, 12, 1, true)); bg.translate(0, 17, 0);
      const bc = new Float32Array(bg.attributes.position.count * 3);
      for (let i = 0; i < bg.attributes.position.count; i++) { const k = Math.pow(1 - bg.attributes.position.getY(i) / 34, 2.2); bc[i * 3] = 1.0 * k; bc[i * 3 + 1] = 0.36 * k; bc[i * 3 + 2] = 0.08 * k; }
      bg.setAttribute('color', new THREE.BufferAttribute(bc, 3));
      const ringG = own(new THREE.RingGeometry(0.82, 1, 40)); ringG.rotateX(-Math.PI / 2);
      beacon = new THREE.Group(); beacon.add(new THREE.Mesh(bg, mats.beam)); beacon.add(new THREE.Mesh(ringG, mats.ring.clone())); beacon.add(new THREE.Mesh(ringG, mats.ring.clone()));
      beacon.visible = false; beacon.renderOrder = 3; root.add(beacon);
      hl = { ring: new THREE.Mesh(ringG, mats.ring.clone()), hull: new THREE.Mesh(new THREE.BufferGeometry(), mats.hull), rect: null };
      hl.ring.visible = hl.hull.visible = false; root.add(hl.ring); root.add(hl.hull);
      this._ringG = ringG; this._beamG = bg;
      const NA = R.touch ? 160 : 320, ag = own(new THREE.BufferGeometry()), ap = new Float32Array(NA * 3);
      for (let i = 0; i < NA; i++) { ap[i * 3] = rf(-30, 30); ap[i * 3 + 1] = rf(0, 16); ap[i * 3 + 2] = rf(-26, 26); }
      ag.setAttribute('position', new THREE.BufferAttribute(ap, 3)); ash = new THREE.Points(ag, mats.ash); ash.frustumCulled = false; root.add(ash);
      const NS = 70, sg = own(new THREE.BufferGeometry());
      sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3)); sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
      sparks = new THREE.Points(sg, mats.spark); sparks.frustumCulled = false; sparks.userData.life = new Float32Array(NS); sparks.userData.vel = new Float32Array(NS * 3); root.add(sparks);
      const r = WORLD.shelterRect; this.barricade = { x0: r.x0, y0: r.y0, x1: r.x1 + 1, y1: r.y1 + 1, level: 0 };
      cutId = -1; cutH = 99; U.uCutId.value = -1; U.uCutH.value = 99; objOverride = null; objT = 0;
    },

    dispose() {
      if (root) { R.scene.remove(root); root.traverse(o => { if ((o.isInstancedMesh || o.isMesh || o.isPoints) && o.geometry && !o.geometry._de) o.geometry.dispose(); }); }
      for (const o of owned) o.dispose && o.dispose();
      owned = []; root = this.group = null; shelterGroup = null; busMesh = null; lampPools = firePools = null; ghostMesh = ghostIcons = null; ghostSlots = [];
    },

    heightAt(i) { return heights[i] || 0; },

    _syncFirePools() {
      if (!firePools) return;
      const n = Math.min(48, fires.length);
      for (let i = 0; i < n; i++) { const f = fires[i], s = f.hatch ? 5 : 6.5 * (f.k || 1); firePools.setMatrixAt(i, mcopy(f.x * 2, 0.04 + i * 0.0005, f.y * 2, 0, s, 1, s)); }
      firePools.count = n; firePools.instanceMatrix.needsUpdate = true;
    },

    update(dt, px, py) {
      if (!root || !WORLD) return;
      tAcc += dt; const t = tAcc, nk = R.nightK || 0;
      /* glow: night-only emitters scale with darkness, fires flicker */
      U.uGlowN.value = 0.12 + nk * 2.6;
      U.uGlowA.value = 1.15 + Math.sin(t * 11.3) * 0.18 + Math.sin(t * 23.7 + 1.3) * 0.12 + Math.sin(t * 3.1) * 0.1;
      if (lampPools) lampPools.material.opacity = nk * 0.42;
      if (firePools) firePools.material.opacity = (0.22 + nk * 0.45) * (0.85 + Math.sin(t * 13.1) * 0.08 + Math.sin(t * 7.7) * 0.07);
      /* cutaway: drop the walls of the building the player stands in */
      let want = -1;
      if (px != null) { const bi = buildingAt(px, py); if (bi >= 0 && !WORLD.roofs[bi].closed && indoors(px, py)) want = bi + 1; }
      const k = 1 - Math.exp(-dt * 9);
      if (cutId !== want) {
        if (cutId > 0 && cutH < 14) cutH += (16 - cutH) * k;
        else { cutId = want; cutH = want > 0 ? (heights[want - 1] || 8) + 1 : 99; }
      } else if (want > 0) cutH += (1.35 - cutH) * k;
      U.uCutId.value = cutId; U.uCutH.value = cutH; this.cutBuilding = cutId - 1;
      /* see-through hole around the player for anything in front of them */
      if (px != null && R.camera) {
        const cam = R.camera, v = new THREE.Vector3(px * TILE, 1.1, py * TILE), vz = -v.clone().applyMatrix4(cam.matrixWorldInverse).z;
        v.project(cam); const bw = R.renderer.domElement.width, bh = R.renderer.domElement.height;
        U.uHole.value.set((v.x + 1) / 2 * bw, (v.y + 1) / 2 * bh, clamp(bh * 0.15 / (R.zoomK || 1), bh * 0.08, bh * 0.3), vz);
      }
      /* river */
      if (water) {
        const pa = water.geometry.attributes.position.array, ca = water.geometry.attributes.color.array, n = pa.length / 3;
        for (let i = 0; i < n; i++) {
          const x = waterBase[i * 3], z = waterBase[i * 3 + 2], wz = z + water.position.z;
          pa[i * 3 + 1] = Math.sin(wz * 0.9 + t * 1.6 + x * 1.7) * 0.06 + Math.sin(wz * 2.3 - t * 2.2) * 0.035;
          const f = Math.max(0, vnoise(x * 1.3 + 50, wz * 0.35 - t * 0.9) - 0.62) * 1.6;
          ca[i * 3] = 0.05 + f * 0.25; ca[i * 3 + 1] = 0.065 + f * 0.25; ca[i * 3 + 2] = 0.07 + f * 0.22;
        }
        water.geometry.attributes.position.needsUpdate = true; water.geometry.attributes.color.needsUpdate = true;
      }
      /* bus repaired? */
      if (G && G.flags && busReady !== !!G.flags.bus_ready) buildBus();
      /* objective beacon */
      objT -= dt;
      if (objT <= 0) { objT = 0.25; try { const o = (typeof objectiveInfo === 'function' && G) ? objectiveInfo() : null; objAuto = o && o.target ? o.target : null; } catch (e) { objAuto = null; } }
      const tg = objOverride === false ? null : objOverride || objAuto;
      if (beacon) {
        beacon.visible = !!tg;
        if (tg) {
          beacon.position.set(tg.x * TILE, 0.05, tg.y * TILE);
          const d = px != null ? Math.hypot(tg.x - px, tg.y - py) : 99, fade = clamp((d - 1.2) / 3, 0.15, 1);
          beacon.children[0].material.opacity = (0.42 + Math.sin(t * 2.4) * 0.1) * fade * (0.7 + nk * 0.3);
          for (let i = 1; i <= 2; i++) { const ph = (t * 0.6 + (i - 1) * 0.5) % 1, m2 = beacon.children[i]; m2.scale.setScalar(0.6 + ph * 1.8); m2.material.opacity = (1 - ph) * 0.8; }
        }
      }
      for (const key in markers) { const mk = markers[key], ph = (t * 0.8) % 1; mk.children[1].scale.setScalar(0.5 + ph * 1.4); mk.children[1].material.opacity = (1 - ph) * 0.9; mk.children[0].material.opacity = 0.5 + Math.sin(t * 3) * 0.15; }
      /* highlight pulse */
      if (hl && (hl.ring.visible || hl.hull.visible)) {
        const p = 0.55 + Math.sin(t * 6) * 0.3;
        hl.ring.material.opacity = p; hl.hull.material.opacity = p * 0.9; if (hl.rect) hl.rect.material.opacity = p;
        hl.ring.scale.setScalar(hl.ringS * (1 + Math.sin(t * 3) * 0.05));
      }
      /* ghost build markers */
      if (ghostMesh) ghostMesh.material.opacity = 0.35 + Math.sin(t * 3.2) * 0.2;
      if (ghostIcons && R.camera) {
        const q = R.camera.quaternion;
        ghostSlots.forEach((g, i) => { ghostIcons.setMatrixAt(i, _m.compose(_ps.set(g.x, 1.6 + g.y0 + Math.sin(t * 2 + i) * 0.15, g.z), q, _sc.set(0.9, 0.9, 0.9))); });
        ghostIcons.instanceMatrix.needsUpdate = true;
      }
      /* drifting ash around the camera target */
      const L = R.lookTarget || { x: 0, z: 0 };
      if (ash) {
        const a = ash.geometry.attributes.position.array;
        for (let i = 0; i < a.length; i += 3) {
          a[i] += (0.35 + Math.sin(t * 0.7 + i) * 0.25) * dt; a[i + 1] -= (0.35 + (i % 7) * 0.05) * dt; a[i + 2] += Math.sin(t * 0.5 + i * 0.3) * 0.2 * dt;
          if (a[i + 1] < 0) { a[i + 1] = 16; a[i] = rf(-30, 30); a[i + 2] = rf(-26, 26); }
          if (a[i] > 30) a[i] -= 60;
        }
        ash.position.set(L.x, 0, L.z);
        ash.geometry.attributes.position.needsUpdate = true;
        mats.ash.opacity = 0.55 - nk * 0.25;
        mats.ash.color.setHex(nk > 0.5 ? 0x8a8a96 : 0xc8beb0);
      }
      if (sparks && fires.length) {
        const pa = sparks.geometry.attributes.position.array, ca = sparks.geometry.attributes.color.array, life = sparks.userData.life, vel = sparks.userData.vel;
        const near = fires.filter(f => Math.abs(f.x * 2 - L.x) < 34 && Math.abs(f.y * 2 - L.z) < 30);
        for (let i = 0; i < life.length; i++) {
          life[i] -= dt;
          if (life[i] <= 0) {
            if (!near.length) { pa[i * 3 + 1] = -50; continue; }
            const f = near[Math.floor(Math.random() * near.length)];
            pa[i * 3] = f.x * 2 + (Math.random() - 0.5) * 0.5; pa[i * 3 + 1] = f.hatch ? 0.1 : 1.1; pa[i * 3 + 2] = f.y * 2 + (Math.random() - 0.5) * 0.5;
            vel[i * 3] = (Math.random() - 0.5) * 0.5; vel[i * 3 + 1] = 0.8 + Math.random() * 1.4; vel[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
            life[i] = 0.8 + Math.random() * 1.6;
          }
          pa[i * 3] += (vel[i * 3] + Math.sin(t * 3 + i) * 0.3) * dt; pa[i * 3 + 1] += vel[i * 3 + 1] * dt; pa[i * 3 + 2] += vel[i * 3 + 2] * dt;
          const k2 = clamp(life[i] / 1.2, 0, 1); ca[i * 3] = 1.0 * k2; ca[i * 3 + 1] = 0.45 * k2; ca[i * 3 + 2] = 0.12 * k2;
        }
        sparks.geometry.attributes.position.needsUpdate = true; sparks.geometry.attributes.color.needsUpdate = true;
      }
    },

    containerMesh(id) { const c = conts[id]; return c ? c.obj : null; },

    setContainerOpened(id, on) {
      const c = conts[id]; on = !!on; if (!c || c.opened === on) return;
      c.opened = on;
      if (c.lc) { lidGeo.attributes.position.array.set(on ? c.openP : c.closedP, c.ls * 3); lidGeo.attributes.normal.array.set(on ? c.openN : c.closedN, c.ls * 3); lidGeo.attributes.position.needsUpdate = true; lidGeo.attributes.normal.needsUpdate = true; }
      if (c.bc) { const a = contGeo.attributes.color.array, k = on ? 0.45 : 1; for (let i = 0; i < c.col.length; i++) a[c.bs * 3 + i] = c.col[i] * k; contGeo.attributes.color.needsUpdate = true; }
      if (hlState.kind === 'container' && hlState.id === id) this.highlight('container', id);
    },

    highlight(kind, id) {
      hlState = { kind, id };
      if (!hl) return;
      hl.ring.visible = hl.hull.visible = false;
      if (hl.rect) { root.remove(hl.rect); hl.rect.geometry.dispose(); hl.rect = null; }
      if (!kind) return;
      if (kind === 'container') {
        const c = conts[id]; if (!c) return;
        const geo = c.c.kind === 'trunk' && c.car ? KIT.car() : c.K.hull;
        const m = c.c.kind === 'trunk' && c.car ? c.car.m : c.m;
        geo.computeBoundingBox(); const ce = geo.boundingBox.getCenter(new THREE.Vector3()), sz = geo.boundingBox.getSize(new THREE.Vector3());
        hl.hull.geometry = geo;
        const s = new THREE.Matrix4().makeTranslation(ce.x, ce.y, ce.z).multiply(new THREE.Matrix4().makeScale(1 + 0.12 / Math.max(0.3, sz.x), 1 + 0.08 / Math.max(0.3, sz.y), 1 + 0.12 / Math.max(0.3, sz.z))).multiply(new THREE.Matrix4().makeTranslation(-ce.x, -ce.y, -ce.z));
        hl.hull.matrixAutoUpdate = false; hl.hull.matrix.multiplyMatrices(m, s); hl.hull.matrixWorldNeedsUpdate = true; hl.hull.visible = true;
        hl.ring.position.set((c.c.x + 0.5) * TILE, 0.06, (c.c.y + 0.5) * TILE); hl.ringS = 1.25; hl.ring.visible = true;
      } else if (kind === 'slot') {
        const [X, Z, w, d] = slotRect(id), B = new Bld();
        for (const [x, z, sx, sz] of [[X + w / 2, Z, w + 0.2, 0.1], [X + w / 2, Z + d, w + 0.2, 0.1], [X, Z + d / 2, 0.1, d + 0.2], [X + w, Z + d / 2, 0.1, d + 0.2]]) B.box(x, 0.03, z, sx, 0.05, sz, WHITE);
        hl.rect = new THREE.Mesh(B.geometry(), mats.ring.clone()); hl.rect.renderOrder = 3; root.add(hl.rect);
        hl.ring.position.set(X + w / 2, 0.06, Z + d / 2); hl.ringS = Math.max(w, d) * 0.62; hl.ring.visible = true;
      } else if (kind === 'point' && id) {
        hl.ring.position.set(id.x * TILE, 0.06, id.y * TILE); hl.ringS = 1.1; hl.ring.visible = true;
      }
    },

    refreshShelter() {
      if (!root || !WORLD || !G) return;
      if (shelterGroup) { root.remove(shelterGroup); shelterGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
      const sg = shelterGroup = new THREE.Group(); root.add(sg);
      const saveR = rr; rr = seeded(((G.seed || 1) ^ 0x51e17e5) >>> 0);
      const B = new Bld(), GB = new Bld(); ghostSlots = [];
      fires.length = firePoolBase;
      const canShow = isUnlocked('build');
      const ghost = (k, X, Z, w, d, y0) => {
        for (const [x, z, sx, sz] of [[X + w / 2, Z, w, 0.12], [X + w / 2, Z + d, w, 0.12], [X, Z + d / 2, 0.12, d], [X + w, Z + d / 2, 0.12, d]]) GB.box(x, y0 + 0.02, z, sx, 0.06, sz, WHITE);
        for (const [x, z] of [[X, Z], [X + w, Z], [X, Z + d], [X + w, Z + d]]) GB.box(x, y0, z, 0.1, 0.7, 0.1, WHITE);
        ghostSlots.push({ k, x: X + w / 2, z: Z + d / 2, y0 });
      };
      for (const k in BUILDINGS) {
        const lv = bl(k), B0 = BUILDINGS[k];
        const hiddenOK = !B0.hidden || (k === 'radio' && G.flags.q_radio);
        if (k === 'walls') {
          if (lv > 0) wallsRing(B, Math.min(3, lv));
          else if (canShow) { const [X, Z, w, d] = slotRect('walls'); ghost('walls', X, Z, w, d, 0); const r = WORLD.shelterRect; for (let x = r.x0 * 2 + 1; x < (r.x1 + 1) * 2; x += 2.4) for (const z of [r.y0 * 2, (r.y1 + 1) * 2]) GB.box(x, 0.02, z, 1.0, 0.04, 0.08, WHITE); for (let z = r.y0 * 2 + 1; z < (r.y1 + 1) * 2; z += 2.4) for (const x of [r.x0 * 2, (r.x1 + 1) * 2]) GB.box(x, 0.02, z, 0.08, 0.04, 1.0, WHITE); }
          continue;
        }
        if (!BUILD_SLOTS[k] || !SLOT_MODELS[k]) continue;
        const [X, Z, w, d] = slotRect(k);
        if (lv > 0) {
          SLOT_MODELS[k](B, X, Z, w, d, Math.min(lv, B0.max || 3));
          if (k === 'forge') fires.push({ x: (X + 0.9) / 2, y: (Z + d / 2 + 0.7) / 2, k: 0.6 });
          if (k === 'kitchen') fires.push({ x: (X + 1.0) / 2, y: (Z + d / 2) / 2, k: 0.6 });
        } else if (canShow && hiddenOK) ghost(k, X, Z, w, d, k === 'radio' ? 3.35 : 0);
      }
      rr = saveR;
      if (B.count) { const m = new THREE.Mesh(B.geometry(), mats.solid); B.b.fill(96); m.geometry.setAttribute('bid', new THREE.Float32BufferAttribute(B.b, 1)); m.castShadow = m.receiveShadow = true; sg.add(m); }
      ghostMesh = null; ghostIcons = null;
      if (GB.count) { ghostMesh = new THREE.Mesh(GB.geometry(), mats.ghost); ghostMesh.renderOrder = 3; sg.add(ghostMesh); }
      if (ghostSlots.length) {
        const pg = new THREE.PlaneGeometry(1, 1);
        ghostIcons = new THREE.InstancedMesh(pg, mats.icon, ghostSlots.length); ghostIcons.renderOrder = 4; ghostIcons.frustumCulled = false; sg.add(ghostIcons);
      }
      const r = WORLD.shelterRect; this.barricade = { x0: r.x0, y0: r.y0, x1: r.x1 + 1, y1: r.y1 + 1, level: bl('walls') };
      this._syncFirePools();
      if (hlState.kind === 'slot') this.highlight('slot', hlState.id);
    },

    setObjective(target) { objOverride = target === undefined ? null : target; },

    marker(key, pos, hex) {
      if (!root) return;
      const old = markers[key];
      if (!pos) { if (old) { root.remove(old); delete markers[key]; } return; }
      let mk = old;
      if (!mk) {
        mk = new THREE.Group();
        const pm = mats.beam.clone(), rm = mats.ring.clone(); if (hex != null) rm.color.setHex(hex);
        const p = new THREE.Mesh(this._beamG, pm); p.scale.set(0.6, 0.35, 0.6); mk.add(p); mk.add(new THREE.Mesh(this._ringG, rm));
        mk.renderOrder = 3; root.add(mk); markers[key] = mk;
      }
      mk.position.set(pos.x * TILE, 0.05, pos.y * TILE);
    },
  };
  return self;
})();
