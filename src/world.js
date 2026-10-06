/* ===================== WORLD 3D: the static world built from WORLD ===================== */
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
     World3D.fires                  [{x,y,k,kind?,hatch?}] tile positions of burning barrels / camp fires / the hatch glow / shelter fires.
     World3D.refreshGates()         Rebuilds the story-gate props (rockfall on the forest road, Tollmen toll barrier, broken river bridge)
                                    from WORLD.gates and G.flags.open_*. update() polls the flags too, so openDistrict() needs no extra call.
     World3D.natureNear(x, y, r)    What grows / flows / burns near a tile point, for ambience: {trees, bushes, reeds, water, fires, biome,
                                    nearest:{tree, bush, water, fire}} (counts within r tiles; each nearest is {x,y,d} in tiles or null).
     World3D.busMesh                The bus mesh (cinematics drive a copy of it).
   How the world is drawn:
     Static geometry is merged into 32 m chunks (frustum culled, one draw each): 's' solid (casts shadows), 'g' ground, 'f' trees and bushes
     (cast shadows; wind sway + season in the vertex shader), 'h' small plants (no shadows), 'w' still water surfaces.
     Cars and lamps are InstancedMeshes. Containers are two merged meshes (bodies, lids/doors). Gates are one mesh rebuilt on open.
     A material patch adds: per-vertex glow (lamps, lit windows, fires), the roof/upper-wall cutaway for the building the player stands in
     (shader discard above a height, back faces drawn as a flat dark cap), a dithered see-through hole around the player for anything
     between the camera and the player, and the weather/season look from R.env (snow cover on up-facing surfaces, wet darkening,
     morning frost, autumn colours). Foliage carries a class per vertex in `bid` (0 wood, 1 leaves, 2 needles, 3 grass/fern, 4 flowers)
     and a random number per leaf blob in `glow.x`: blobs drop as R.env.uBare rises (bare trees in late autumn), flowers die back. */
const World3D = (() => {
  /* ---------- shared uniforms + material patch ---------- */
  const U = {
    uHole: { value: new THREE.Vector4(-1e4, -1e4, 0, 0) },
    uCutId: { value: -1 }, uCutH: { value: 99 },
    uCap: { value: new THREE.Vector3(0.22, 0.2, 0.18) },
    uGlowA: { value: 1 }, uGlowN: { value: 0 },
  };
  const ENV_KEYS = ['uSnow', 'uWet', 'uFrost', 'uAutumn', 'uBare', 'uWind', 'uTime'];
  const envU = () => { const E = (typeof R !== 'undefined' && R.env) || {}; const o = {}; for (const k of ENV_KEYS) o[k] = E[k] || { value: 0 }; return o; };
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
  /* season + weather on the surface colour (before lighting) */
  const ENV_FRAG = `
#ifdef DE_ENV
  {
    float deUp = clamp(vDeN.y, 0.0, 1.0);
    float deGr = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) * 28.0, 0.0, 1.0);
    float deHue = deN2(vDeW.xz * 0.21 + 7.0);
    vec3 deAut = diffuseColor.rgb * mix(vec3(1.9, 0.95, 0.35), vec3(2.3, 0.62, 0.22), deHue) + vec3(0.02, 0.006, 0.0);
    float deAk = uAutumn * DE_AUT;
#ifdef DE_FOLIAGE
    if (vDeBid > 1.5 && vDeBid < 2.5) deAk *= 0.1; // needles and hedges stay green
#endif
    diffuseColor.rgb = mix(diffuseColor.rgb, deAut, deGr * deAk);
    diffuseColor.rgb *= 1.0 - uWet * (0.1 + 0.28 * deUp);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.66, 0.74), uFrost * 0.4 * smoothstep(0.55, 0.95, deUp));
    float deNs = deN2(vDeW.xz * 0.33) * 0.68 + deN2(vDeW.xz * 1.4 + 3.1) * 0.32;
    float deSn = smoothstep(deNs - 0.1, deNs + 0.1, uSnow * 1.22 - 0.06) * smoothstep(0.4, 0.86, deUp);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.87, 0.91), deSn);
  }
#endif
`;
  /* foliage: leaf blobs drop (bare trees), flowers die back, everything above the ground sways in the wind */
  const FOLIAGE_VERT = `
#ifdef DE_FOLIAGE
  {
    if ((bid > 0.5 && bid < 1.5 && fract(glow.x) < uBare) || (bid > 3.5 && bid < 4.5 && uBare > 0.5)) transformed = vec3(0.0);
    vec4 deP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
    deP = instanceMatrix * deP;
#endif
    deP = modelMatrix * deP;
    float deH = max(0.0, deP.y - 0.12);
    float deK = uWind * (bid > 2.5 ? 0.11 : 0.026) * pow(deH, 1.15);
    float dePh = uTime * (1.2 + uWind * 1.6) + deP.x * 0.31 + deP.z * 0.23;
    transformed.x += (sin(dePh) + sin(dePh * 2.3 + 1.7) * 0.35) * deK;
    transformed.z += cos(dePh * 0.83) * deK * 0.7;
  }
#endif
`;
  const VHEAD = 'attribute vec2 glow; attribute float bid;\nvarying vec2 vDeGlow; varying float vDeBid; varying vec3 vDeW; varying float vDeVZ; varying vec3 vDeN;\nuniform float uTime; uniform float uWind; uniform float uBare;';
  const FHEAD = 'float deH2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\nfloat deN2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(deH2(i), deH2(i + vec2(1.0, 0.0)), f.x), mix(deH2(i + vec2(0.0, 1.0)), deH2(i + vec2(1.0, 1.0)), f.x), f.y); }\nuniform vec4 uHole; uniform float uCutId; uniform float uCutH; uniform vec3 uCap; uniform float uGlowA; uniform float uGlowN;\nuniform float uSnow; uniform float uWet; uniform float uFrost; uniform float uAutumn;\nvarying vec2 vDeGlow; varying float vDeBid; varying vec3 vDeW; varying float vDeVZ; varying vec3 vDeN;';
  /* flags: x cutaway, h see-through hole (buildings), a hole for everything, c dark back-face cap, e weather/season look, f foliage. aut = autumn strength */
  function deMat(flags, params, aut) {
    const m = new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true, flatShading: true }, params || {}));
    const D = {};
    if (flags.includes('x')) D.DE_CUT = '';
    if (flags.includes('h')) D.DE_HOLE = '';
    if (flags.includes('a')) { D.DE_HOLE = ''; D.DE_HOLEALL = ''; }
    if (flags.includes('c')) D.DE_CAP = '';
    if (flags.includes('e')) { D.DE_ENV = ''; D.DE_AUT = (aut || 0).toFixed(2); }
    if (flags.includes('f')) D.DE_FOLIAGE = '';
    m.defines = D;
    m.onBeforeCompile = sh => {
      for (const k in U) sh.uniforms[k] = U[k];
      const E = envU(); for (const k in E) sh.uniforms[k] = E[k];
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VHEAD)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + FOLIAGE_VERT)
        .replace('#include <fog_vertex>', `#include <fog_vertex>
  vec4 deW = vec4(transformed, 1.0);
  vec3 deN = objectNormal;
#ifdef USE_INSTANCING
  deW = instanceMatrix * deW; deN = mat3(instanceMatrix) * deN;
#endif
  deW = modelMatrix * deW; vDeW = deW.xyz; vDeVZ = -mvPosition.z; vDeGlow = glow; vDeBid = bid; vDeN = normalize(mat3(modelMatrix) * deN);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FHEAD)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAG_DISCARD)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + ENV_FRAG)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifndef DE_FOLIAGE\n  totalEmissiveRadiance += diffuseColor.rgb * (vDeGlow.x * uGlowA + vDeGlow.y * uGlowN);\n#endif')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n#ifdef DE_CAP\n  if (!gl_FrontFacing) gl_FragColor = vec4(uCap, 1.0);\n#endif');
    };
    m.customProgramCacheKey = () => 'de-' + flags + (aut || 0);
    return m;
  }
  /* shadow pass for foliage: dropped leaves cast no shadow */
  function foliageDepth() {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.onBeforeCompile = sh => {
      sh.uniforms.uBare = envU().uBare;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 glow; attribute float bid; uniform float uBare;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  if ((bid > 0.5 && bid < 1.5 && fract(glow.x) < uBare) || (bid > 3.5 && bid < 4.5 && uBare > 0.5)) transformed = vec3(0.0);');
    };
    m.customProgramCacheKey = () => 'de-fdepth';
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
    const c = g.attributes.color ? g.attributes.color.array : null, gl = g.attributes.glow ? g.attributes.glow.array : null, bd = g.attributes.bid ? g.attributes.bid.array : null;
    let minY = Infinity, maxY = -Infinity; for (let i = 1; i < p.length; i += 3) { if (p[i] < minY) minY = p[i]; if (p[i] > maxY) maxY = p[i]; }
    return (geo._de = { p, n, c, gl, bd, count: p.length / 3, minY, maxY });
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
        Bb.push(t.bd ? t.bd[i] + bid : bid);
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
  /* s solid (casts), g ground, f trees + bushes (cast, wind), h small plants (no shadow), w still water surfaces */
  const S = router('s'), GD = router('g'), F = router('f'), HB = router('h'), WT = router('w');

  /* ---------- palette ---------- */
  const PAL = {
    soot: 0x1c1a17, dark: 0x141210, steel: 0x3c3e40, rust: 0x7a4428, wood: 0x6a4e34, wood2: 0x4e3a28, concrete: 0x86827a, cap: 0x5e5a54,
    glass: 0x1c2024, trim: 0x2e2a26, ember: 0xff8a3a, fire: 0xffb050, lamp: 0xffc27a, tarp: 0x3e4a56, sand: 0x8a7a5a, olive: 0x4e5636,
    ivy: 0x3e5426, moss: 0x4a5a30,
  };
  const BST = {
    street: { h: 3.4, wall: 0x75624f, inner: 0x8c7c68, roof: 'gable', roofC: 0x4c3e36, floor: 'wood', band: 0x7a3a26, shop: true, brick: true },
    hospital: { h: 7.4, wall: 0xa09e96, inner: 0xaaaca6, roof: 'flat', roofC: 0x4a4844, floor: 'tile', band: 0x8a2a24, cross: true },
    apartments: { h: 9.8, wall: 0x80584a, inner: 0x8e8270, roof: 'flat', roofC: 0x3c3834, floor: 'wood', bands: true, balcony: true, tank: true, brick: true },
    supermarket: { h: 4.8, wall: 0x928676, inner: 0x9c988c, roof: 'flat', roofC: 0x45423e, floor: 'tile', band: 0x8e3222, shop: true, sign: 0xd8c8a0 },
    police: { h: 5.0, wall: 0x545a60, inner: 0x7a7e80, roof: 'flat', roofC: 0x3a3c3e, floor: 'tile', band: 0x2c3c66, sign: 0xb0b8c8 },
    military: { h: 3.8, wall: 0x585e46, inner: 0x6a6c5c, roof: 'flat', roofC: 0x41463a, floor: 'concrete', slits: true, sandbags: true },
    gas: { h: 3.9, wall: 0x8e887c, inner: 0x9a968c, roof: 'flat', roofC: 0x44423e, floor: 'tile', band: 0xa64c1a, shop: true, sign: 0xe0a040 },
    factory: { h: 6.6, wall: 0x70503a, inner: 0x6a645a, roof: 'saw', roofC: 0x5a4a3e, floor: 'concrete', strip: true, chimney: true, ribs: true, brick: true },
    farm: { h: 4.2, wall: 0x6e3428, inner: 0x6e5a44, roof: 'gable', roofC: 0x6e4a32, floor: 'hay', ribs: true, brick: true },
    electronics: { h: 4.4, wall: 0x5e6a66, inner: 0x8a8e88, roof: 'flat', roofC: 0x3e4240, floor: 'tile', band: 0x2a6a7c, shop: true, sign: 0x9ad0d8 },
    radiotower: { h: 3.8, wall: 0x7e7e76, inner: 0x8a8a82, roof: 'flat', roofC: 0x45453f, floor: 'concrete', mast: true },
    depot: { h: 5.8, wall: 0x726e66, inner: 0x7a766c, roof: 'flat', roofC: 0x43413c, floor: 'concrete', band: 0xb0902a, strip: true, garage: true },
    tollcamp: { h: 5.2, wall: 0x403c38, inner: 0x403c38, roof: 'flat', roofC: 0x2a2826, floor: 'concrete', ribs: true, flags: true },
    house: { h: 3.3, wall: 0x9a8e7a, inner: 0x9a8c76, roof: 'gable', roofC: 0x4a3a34, floor: 'wood', walls: [0x9a8e7a, 0x7e8a8e, 0xa89a72, 0x8e6a58, 0x8a8a7e, 0x6e7a6a], roofs: [0x4a3a34, 0x3a3e44, 0x5a3a2c, 0x44443e], brick: true },
    garage: { h: 2.7, wall: 0x8a8478, inner: 0x8a8478, roof: 'flat', roofC: 0x3e3c38, floor: 'concrete' },
    ranger: { h: 3.3, wall: 0x5e4430, inner: 0x7a5e44, roof: 'gable', roofC: 0x3a4a3a, floor: 'wood', logs: true },
    warehouse: { h: 6.4, wall: 0x56606a, inner: 0x6a6e70, roof: 'saw', roofC: 0x4a5058, floor: 'concrete', strip: true, ribs: true, garage: true },
    docks: { h: 4.4, wall: 0x7a7468, inner: 0x8a867c, roof: 'flat', roofC: 0x3e3e3a, floor: 'tile', band: 0x2a4a6a, sign: 0xc8c8b8 },
    flooded: { h: 3.4, wall: 0x7a6a56, inner: 0x7a6e5e, roof: 'gable', roofC: 0x463a32, floor: 'wood', waterline: true, brick: true },
    pass: { h: 3.0, wall: 0x6a6862, inner: 0x7a6e5e, roof: 'gable', roofC: 0x4a4a52, floor: 'wood', snowRoof: true },
  };

  /* ---------- module state ---------- */
  let root = null, shelterGroup = null, owned = [], heights = [], bIdx = null, conts = {}, contGeo = null, lidGeo = null, contObjs = null;
  /* small animated moments: lids swinging open, new buildings rising, dust/ember bursts */
  const lidAnims = [], risers = [], bursts = []; let prevLv = null, burstGeo = null;
  let mats = null, water = null, waterBase = null, ash = null, sparks = null, lampPools = null, firePools = null, firePoolBase = 0, puddles = null;
  let beacon = null, hl = null, ghostMesh = null, ghostIcons = null, ghostSlots = [], markers = {}, busMesh = null, busReady = null, gateMesh = null, gateKey = '';
  let carAt = {}, objT = 0, objOverride = null, objAuto = null, cutId = -1, cutH = 99, tAcc = 0, fires = [], hlState = { kind: null, id: null }, gateT = 0;
  let natCls = null, baseW = null, MW = 0;
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
      solid: deMat('xhce', { side: THREE.DoubleSide }, 0.3),
      ground: deMat('e', null, 0.45),
      inst: deMat('e', null, 0),
      cont: deMat('e', null, 0),
      foliage: deMat('afe', { side: THREE.DoubleSide }, 1),
      herb: deMat('fe', { side: THREE.DoubleSide }, 1),
      fdepth: foliageDepth(),
      still: new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.8, shininess: 80, specular: 0x4a5560, depthWrite: false }),
      puddle: new THREE.MeshPhongMaterial({ color: 0x15171a, transparent: true, opacity: 0, shininess: 110, specular: 0x9aa6b0, depthWrite: false }),
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

  /* ---------- foliage kits: colours baked, class per vertex in bid (0 wood, 1 leaves, 2 needles, 3 grass, 4 flowers), a random glow.x per leaf blob ---------- */
  const LEAF = o => Object.assign({ bid: 1, glow: [rr(), 0] }, o || {});
  const FOL = {
    pine: v => kit('pine' + v, b => {
      b.geo(G_CYL6, 0, 0.9, 0, 0.36, 1.8, 0.36, col(0x33291f));
      const tiers = [[3.4, 2.6, 1.2, 0x2b3628], [2.7, 2.4, 2.6, 0x313c2c], [1.95, 2.2, 4.0, 0x384230], [1.1, 1.7, 5.3, 0x3e4634]], k = [1, 0.88, 1.1][v % 3];
      for (const [r, h, y, c] of tiers) b.geo(G_CONE7, 0, y + h / 2, 0, r * k, h, r * k, col(c, 0.12), { ry: y + v, bid: 2 });
    }),
    snowPine: v => kit('spine' + v, b => {
      b.geo(G_CYL6, 0, 0.9, 0, 0.34, 1.8, 0.34, col(0x2e2620));
      [[3.2, 2.5, 1.2], [2.5, 2.3, 2.5], [1.8, 2.1, 3.8], [1.0, 1.6, 5.0]].forEach(([r, h, y], i) => {
        b.geo(G_CONE7, 0, y + h / 2, 0, r, h, r, mixc(0x2a3628, 0x9aa2a8, 0.15 + i * 0.08 + rr() * 0.1), { ry: y + v, bid: 2 });
        b.geo(G_CONE7, 0, y + h * 0.8, 0, r * 0.66, h * 0.42, r * 0.66, col(0xdfe3e8, 0.04), { ry: y + v + 0.45, bid: 2 });
      });
    }),
    youngPine: v => kit('ypine' + v, b => {
      b.geo(G_CYL6, 0, 0.5, 0, 0.2, 1.0, 0.2, col(0x3a2e22));
      for (const [r, h, y, c] of [[1.7, 1.6, 0.6, 0x2e3a2a], [1.2, 1.4, 1.5, 0x354030], [0.7, 1.1, 2.3, 0x3c4834]]) b.geo(G_CONE7, 0, y + h / 2, 0, r, h, r, col(c, 0.12), { ry: y + v, bid: 2 });
    }),
    broad: v => kit('broad' + v, b => {
      const bark = col(0x463a2c), H0 = 2.6 + v * 0.35;
      b.beam(0, 0, 0, 0.1, H0, 0.05, 0.42, bark);
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + v; b.beam(0.05, H0 - 0.6, 0.03, Math.cos(a) * 1.2, H0 + 0.6, Math.sin(a) * 1.2, 0.16, bark); }
      for (let i = 0; i < 5 + (v % 2); i++) {
        const a = i * 2.4 + v * 0.7, r = i === 0 ? 0 : rf(0.8, 1.5), y = H0 + (i === 0 ? 1.6 : rf(0.6, 1.5)), s = i === 0 ? 2.3 : rf(1.4, 1.9);
        b.geo(G_DOD, Math.cos(a) * r, y, Math.sin(a) * r, s, s * 0.82, s, col(rpick([0x4a5a2a, 0x56662e, 0x3e5026, 0x5a6a34]), 0.12), LEAF({ ry: a }));
      }
    }),
    youngBroad: v => kit('ybroad' + v, b => {
      b.beam(0, 0, 0, 0.04, 1.8, 0.03, 0.2, col(0x4a3c2e));
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + v; b.geo(G_DOD, Math.cos(a) * 0.5, 2.0 + rf(0, 0.6), Math.sin(a) * 0.5, rf(0.9, 1.3), rf(0.8, 1.0), rf(0.9, 1.3), col(rpick([0x56662e, 0x4a5a2a, 0x627434]), 0.12), LEAF()); }
    }),
    birch: v => kit('birch' + v, b => {
      const H0 = 3.4 + v * 0.3;
      b.beam(0, 0, 0, 0.08, H0 + 1.2, 0.04, 0.24, col(0xd2cec2));
      for (let k = 0; k < 5; k++) b.box(rf(-0.04, 0.04), 0.4 + k * 0.75, 0, 0.26, 0.06, 0.26, col(0x2a2826));
      for (let i = 0; i < 5; i++) { const a = i * 1.7 + v, r = rf(0.3, 0.9); b.geo(G_ICO, Math.cos(a) * r, H0 + rf(-0.6, 1.4), Math.sin(a) * r, rf(1.0, 1.4), rf(1.1, 1.6), rf(1.0, 1.4), col(rpick([0x7a8a3a, 0x6e7e34, 0x8a9440]), 0.1), LEAF()); }
    }),
    willow: v => kit('willow' + v, b => {
      b.beam(0, 0, 0, 0.3, 2.6, 0.1, 0.55, col(0x40362a));
      b.geo(G_DOD, 0.3, 3.4, 0.1, 3.0, 1.5, 3.0, col(0x5a6a34, 0.1), LEAF());
      for (let i = 0; i < 9; i++) { const a = i * 0.7 + v, r = rf(1.0, 1.6); b.geo(G_CONE5, 0.3 + Math.cos(a) * r, 2.3, 0.1 + Math.sin(a) * r, 0.9, 2.6, 0.9, col(rpick([0x6a7a3a, 0x5e6e34, 0x748440]), 0.1), LEAF({ rx: Math.PI, ry: a })); }
    }),
    street: v => kit('street' + v, b => {
      b.beam(0, 0, 0, 0.02, 2.4, 0.02, 0.24, col(0x3e342a));
      b.box(0, 0, 0, 0.9, 0.05, 0.9, col(0x3a3632));
      for (let i = 0; i < 4; i++) { const a = i * 1.6 + v, r = i ? 0.6 : 0; b.geo(G_DOD, Math.cos(a) * r, 2.9 + rf(0, 0.7), Math.sin(a) * r, rf(1.2, 1.6), rf(1.0, 1.3), rf(1.2, 1.6), col(rpick([0x4e5e2c, 0x5a6a30]), 0.12), LEAF()); }
    }),
    sapling: v => kit('sapling' + v, b => {
      b.beam(0, 0, 0, rf(-0.1, 0.1), 1.1 + v * 0.2, rf(-0.1, 0.1), 0.06, col(0x4a3c2c));
      for (let i = 0; i < 3; i++) b.geo(G_ICO, rf(-0.25, 0.25), 0.7 + i * 0.3 + v * 0.1, rf(-0.25, 0.25), rf(0.4, 0.6), rf(0.35, 0.5), rf(0.4, 0.6), col(rpick([0x5a6e2e, 0x6a7c34, 0x4e622a]), 0.15), LEAF());
    }),
    bush: v => kit('bush' + v, b => {
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + v; b.geo(G_DOD, Math.cos(a) * 0.35, 0.45 + rf(0, 0.25), Math.sin(a) * 0.35, rf(0.9, 1.3), rf(0.8, 1.1), rf(0.9, 1.3), col(rpick([0x3e4e2a, 0x465630, 0x37462a]), 0.12), LEAF()); }
    }),
    hedge: v => kit('hedge' + v, b => {
      for (let i = 0; i < 3; i++) b.geo(G_DOD, -0.6 + i * 0.6, 0.55 + rf(0, 0.1), rf(-0.1, 0.1), rf(1.0, 1.2), rf(1.1, 1.35), rf(0.9, 1.1), col(rpick([0x34452a, 0x3a4c2c, 0x2f3f26]), 0.08), { bid: 2, ry: rf(0, 3) });
    }),
    fern: v => kit('fern' + v, b => {
      for (let i = 0; i < 7; i++) { const a = i * 0.9 + v; b.geo(G_BOX, Math.cos(a) * 0.32, 0.18, Math.sin(a) * 0.32, 0.7, 0.02, 0.18, col(rpick([0x4a6a2e, 0x567636, 0x3e5a28]), 0.12), { ry: -a, rz: 0.5, bid: 3 }); }
    }),
    flowers: v => kit('flowers' + v, b => {
      const heads = [[0xd8c040, 0xe0d070], [0xc8c8c0, 0xe8e4d8], [0x9a4ac0, 0xb070d0], [0xd06030, 0xe08040]][v % 4];
      for (let i = 0; i < 7; i++) { const x = rf(-0.45, 0.45), z = rf(-0.45, 0.45), h = rf(0.25, 0.5); b.beam(x, 0, z, x + rf(-0.05, 0.05), h, z, 0.025, col(0x4a6a2e), { bid: 3 }); b.geo(G_ICO, x, h, z, 0.12, 0.09, 0.12, col(rpick(heads), 0.1), { bid: 4 }); }
    }),
    reeds: v => kit('reeds' + v, b => {
      for (let i = 0; i < 9; i++) { const x = rf(-0.5, 0.5), z = rf(-0.5, 0.5), h = rf(1.1, 1.8); b.beam(x, 0, z, x + rf(-0.15, 0.15), h, z + rf(-0.15, 0.15), 0.035, col(rpick([0x6a7040, 0x7a7a46, 0x5e6a3a]), 0.1), { bid: 3 }); }
      for (let i = 0; i < 3; i++) { const x = rf(-0.3, 0.3), z = rf(-0.3, 0.3); b.beam(x, 0, z, x, 1.3, z, 0.03, col(0x6a6a40), { bid: 3 }); b.geo(G_CYL6, x, 1.4, z, 0.09, 0.3, 0.09, col(0x4a3222), { bid: 3 }); }
    }),
    crops: v => kit('crops' + v, b => {
      for (let i = 0; i < 4; i++) { const x = -0.6 + i * 0.4; b.geo(G_ICO, x, 0.16, rf(-0.05, 0.05), 0.32, 0.26, 0.32, col(rpick([0x5a7a3a, 0x6a8a42, 0x4e6e34]), 0.15), { bid: 3 }); }
    }),
  };
  /* outdoor prop kits (solid) */
  const DKIT = {
    container: () => kit('container', b => {
      const L = 5.8, Wd = 2.3, Hh = 2.5;
      b.box(0, 0, 0, L, Hh, Wd, col(0xffffff), { grad: 0.8 });
      for (let x = -L / 2 + 0.3; x < L / 2 - 0.2; x += 0.6) for (const z of [-Wd / 2 - 0.02, Wd / 2 + 0.02]) b.box(x, 0.08, z, 0.16, Hh - 0.16, 0.04, col(0xcfcfcf));
      b.box(L / 2 + 0.02, 0.1, 0, 0.04, Hh - 0.2, Wd - 0.2, col(0xb4b4b4));
      for (const z of [-0.35, 0.35]) b.box(L / 2 + 0.06, 0.2, z, 0.05, Hh - 0.4, 0.05, col(0x4a4a4a));
      for (const x of [-L / 2, L / 2]) for (const z of [-Wd / 2, Wd / 2]) b.box(x, 0, z, 0.2, Hh + 0.02, 0.2, col(0x5a5a5a));
    }),
    silo: () => kit('silo', b => {
      b.geo(G_CYL12, 0, 4.5, 0, 3.8, 9, 3.8, col(0x9a968a), { grad: 0.7 });
      for (const y of [1.5, 3.5, 5.5, 7.5]) b.geo(G_CYL12, 0, y, 0, 3.9, 0.12, 3.9, col(0x6a665e));
      b.geo(G_CONE7, 0, 9.7, 0, 4.0, 1.4, 4.0, col(0x7a4a32));
      for (let k = 0; k < 14; k++) b.box(1.95, 0.4 + k * 0.62, 0, 0.06, 0.05, 0.5, col(PAL.steel));
      for (const z of [-0.25, 0.25]) b.box(1.95, 0, z, 0.05, 9, 0.05, col(PAL.steel));
    }),
    tank: () => kit('tank', b => {
      b.geo(G_CYL12, 0, 2.2, 0, 5.6, 4.4, 5.6, col(0xb8b2a4), { grad: 0.7 });
      b.geo(G_CONE7, 0, 4.7, 0, 5.8, 0.7, 5.8, col(0x9a948a));
      for (let k = 0; k < 7; k++) b.box(2.85, 0.4 + k * 0.6, 0.5, 0.06, 0.05, 0.5, col(PAL.steel));
      b.box(0, 1.2, 2.82, 3.0, 0.9, 0.04, col(0x8a3a2a));
      b.beam(2.8, 0.5, -1, 4.5, 0.5, -1, 0.3, col(0x5a5a56));
    }),
    hay: () => kit('hay', b => {
      b.geo(G_CYL12, 0, 0.75, 0, 1.5, 1.3, 1.5, col(0xa08a4a, 0.1), { rz: Math.PI / 2 });
      b.geo(G_CYL12, 0.66, 0.75, 0, 1.2, 0.04, 1.2, col(0x8a7a42), { rz: Math.PI / 2 });
    }),
    log: () => kit('log', b => {
      b.geo(G_CYL8, 0, 0.32, 0, 0.64, 3.6, 0.64, col(0x4a3a2a), { rz: Math.PI / 2, ry: 0.1 });
      b.geo(G_CYL8, 1.81, 0.32, 0.18, 0.56, 0.04, 0.56, col(0x8a6a44), { rz: Math.PI / 2 });
      b.box(-0.6, 0.6, 0, 1.4, 0.06, 0.4, col(PAL.moss, 0.2));
      b.beam(0.4, 0.5, 0.1, 0.7, 1.1, 0.5, 0.08, col(0x4a3a2a)); b.beam(-0.9, 0.5, -0.1, -1.1, 0.9, -0.6, 0.07, col(0x4a3a2a));
    }),
    boat: (len) => kit('boat' + len, b => {
      const L = len * 2 - 0.4, hull = col(rpick([0xc8c4b8, 0x3e5a7a, 0x8a3a2a])), dk = col(0x2a2622);
      b.box(-0.4, 0, 0, L - 1.2, 0.9, 1.7, hull, { grad: 0.7 });
      b.geo(G_PRISM, L / 2 - 1.0, 0, 0, 1.7, 0.9, 1.6, hull, { rz: -Math.PI / 2, ry: Math.PI / 2 });
      b.box(-0.4, 0.86, 0, L - 1.3, 0.06, 1.5, col(0x6a5a44));
      if (len >= 3) { b.box(-L / 4, 0.9, 0, 1.6, 1.1, 1.3, col(0xd8d4c8)); b.box(-L / 4 + 0.82, 1.4, 0, 0.04, 0.4, 1.1, dk); }
      b.box(-L / 2 + 0.4, 0.3, 0, 0.12, 0.7, 0.4, dk);
    }),
    stand: () => kit('stand', b => {
      const wd = col(PAL.wood, 0.1);
      for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) b.beam(x * 1.25, 0, z * 1.25, x * 0.8, 3.2, z * 0.8, 0.14, wd);
      b.box(0, 3.2, 0, 1.9, 0.12, 1.9, col(PAL.wood2));
      for (const [x, z, w, d] of [[0, -0.9, 1.9, 0.06], [0, 0.9, 1.9, 0.06], [-0.9, 0, 0.06, 1.9], [0.9, 0, 0.06, 1.9]]) b.box(x, 3.32, z, w, 0.7, d, wd);
      b.geo(G_PRISM, 0, 4.5, 0, 2.2, 0.7, 2.2, col(0x3e4a2e));
      for (const x of [-0.25, 0.25]) b.beam(x, 0, 1.6, x, 3.2, 0.8, 0.06, wd);
      for (let k = 1; k < 7; k++) b.box(0, k * 0.45, 1.6 - k * 0.115, 0.55, 0.05, 0.08, wd);
    }),
    campfire: () => kit('campfire', b => {
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; b.geo(G_ICO, Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62, 0.32, 0.24, 0.3, col(0x5a5852, 0.2)); }
      for (let i = 0; i < 3; i++) { const a = i * 2.1; b.beam(Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5, -Math.cos(a) * 0.1, 0.45, -Math.sin(a) * 0.1, 0.11, col(0x3a2a1e)); }
      b.geo(G_CONE5, 0, 0.45, 0, 0.5, 0.6, 0.5, col(0xff7a2a), { glow: [1.5, 0] });
      b.geo(G_CONE5, 0.08, 0.4, -0.05, 0.32, 0.5, 0.32, col(0xffc060), { glow: [1.9, 0], ry: 1 });
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
  const roadish = t => t === T_ROAD || t === T_CAR || t === T_BRIDGE || t === T_GATE;
  const inMapT = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const N4 = [[1, 0], [-1, 0], null, null, [0, 1], [0, -1]]; // box face order: +x -x +y -y +z -z
  const D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  /* biome of a tile; outside the map, the nearest edge tile's biome */
  const gbio = (x, y) => biomeAt(clamp(x, 0, W - 1) + 0.5, clamp(y, 0, H - 1) + 0.5);
  const floraAt = (x, y) => inMapT(x, y) && WORLD.flora ? WORLD.flora[y * W + x] : 0;
  const gateUnder = (x, y) => { for (const id in WORLD.gates || {}) for (const [a, b, t] of WORLD.gates[id].tiles) if (a === x && b === y) return t; return null; };
  const inCamp = (x, y) => { const c = WORLD.camp; return !!c && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1; };
  /* tile type including the outskirts ring: roads leaving the map continue straight out, the river runs on, the sea lies east of the
     docks, the flood spreads south of the Flooded Quarter; everything else is the biome's wild ground (-1). -2 = sea. */
  function tAt(x, y) {
    if (inMapT(x, y)) return tileAt(x, y);
    if (RIVER_X.includes(x)) return T_WATER;
    const cx = clamp(x, 0, W - 1), cy = clamp(y, 0, H - 1), t = tileAt(cx, cy), b = gbio(x, y);
    if (b === 'docks' && x >= W) return -2;
    if ((t === T_ROAD || t === T_PATH) && (x === cx || y === cy)) return t;
    if (b === 'flooded' && y >= H) return T_SHALLOW;
    return -1;
  }
  /* what is under a tile: 2 open water, 1 knee-deep flood, 0 dry ground */
  function baseOf(x, y) {
    const t = tAt(x, y);
    if (t === T_WATER || t === T_BRIDGE || t === -2) return 2;
    if (t === T_SHALLOW) return 1;
    if (t === T_GATE) return gateUnder(x, y) === T_BRIDGE ? 2 : 0;
    if (t === T_PLANK || t === T_DECO || t === T_PROP || t === T_TREE) {
      const b = gbio(x, y); let w = 0, s = 0;
      for (const [a, c] of D4) { const n = tAt(x + a, y + c); if (n === T_WATER || n === -2) w++; else if (n === T_SHALLOW || n === T_PLANK) s++; }
      if (b === 'docks' && w) return 2;
      if (b === 'flooded' && (s || w)) return 1;
    }
    return 0;
  }
  const baseAt = (x, y) => (baseW && x >= -MG && y >= -MG && x < W + MG && y < H + MG) ? baseW[(y + MG) * MW + x + MG] : 0;
  function groundCol(t, wx, wz, b, fv) {
    const n = fbm(wx * 0.08, wz * 0.08), d = vnoise(wx * 0.55 + 3, wz * 0.55 + 9);
    let c;
    if (isRoadT(t)) c = b === 'docks' ? mixc(0x45433e, 0x57544e, n * 0.8 + d * 0.3) : b === 'pass' ? mixc(0x6a6c70, 0x9a9ca0, n * 0.5 + d * 0.6) : mixc(0x33322f, 0x46433e, n * 0.8 + d * 0.3);
    else if (t === T_PATH) c = b === 'forest' ? mixc(0x463a2a, 0x5e4c36, n + d * 0.2) : b === 'farm' ? mixc(0x5e4c34, 0x76623f, n) : b === 'pass' ? mixc(0x8a8a8a, 0xb4b6ba, n) : mixc(0x6a6252, 0x80786a, n * 0.8 + d * 0.3);
    else if (t === T_YARD || t === T_DOOR) c = b === 'docks' ? mixc(0x4e4c46, 0x605c55, n * 0.7 + d * 0.3) : b === 'farm' ? mixc(0x5a4a34, 0x6e5a40, n) : mixc(0x5a5043, 0x6e624f, n);
    else if (t === T_FIELD) c = mixc(0x3a2c21, 0x55412e, n);
    else if (t === T_RUBBLE) c = mixc(0x4a4640, 0x5c5852, n);
    else if (t === T_WALL) c = mixc(0x4c463c, 0x5a5246, n);
    else if (t === T_SHALLOW) c = fv === FLORA.SUNKROAD ? mixc(0x232325, 0x2e2d2b, d) : mixc(0x2a2620, 0x3a3328, n);
    else if (b === 'pass') c = d < 0.2 ? mixc(0x5a5a5c, 0x7a7a7c, n) : mixc(0xb0b4ba, 0xd8dce2, n * 0.8 + d * 0.3);
    else if (b === 'forest' || (t === -1 && b === 'suburbs')) c = mixc(0x2e3026, 0x47402e, n * 0.9 + d * 0.2);
    else if (b === 'suburbs') c = mixc(0x485834, 0x667044, n * 0.85 + d * 0.25);
    else if (b === 'farm') c = mixc(0x5a5a36, 0x7a7046, n * 0.85 + d * 0.25);
    else if (b === 'docks') c = mixc(0x4a4842, 0x5e5a52, n * 0.7 + d * 0.4);
    else if (b === 'flooded') c = mixc(0x3e382c, 0x4e4636, n);
    else c = mixc(0x4a503d, 0x6e6748, n * 0.85 + d * 0.25);
    if (!isRoadT(t) && (b === 'oldtown' || b === 'docks') && vnoise(wx * 0.045 + 40, wz * 0.045 - 11) < 0.2) c.multiplyScalar(0.62); // scorched patches
    return c;
  }
  function floorCol(style, i, k) {
    if (style === 'wood') return col(rpick([0x5e4430, 0x6a4c34, 0x553c2a, 0x6e5238]), 0.12);
    if (style === 'tile') return col(((i + k) & 1) ? 0x8c8a84 : 0x6e6c68, 0.08);
    if (style === 'hay') return col(rpick([0x6e5e3a, 0x7a6a42, 0x5e4e32]), 0.15);
    return col(rpick([0x605e58, 0x6a6862, 0x58564f]), 0.1);
  }
  function buildGround() {
    MW = W + 2 * MG; baseW = new Int8Array(MW * (H + 2 * MG));
    for (let y = -MG; y < H + MG; y++) for (let x = -MG; x < W + MG; x++) baseW[(y + MG) * MW + x + MG] = baseOf(x, y);
    const wetC = (b, deep) => deep ? (b === 'docks' ? col(0x1e2c2c, 0.08) : col(0x2c3a32, 0.12)) : col(0x34423a, 0.1);
    for (let y = -MG; y < H + MG; y++) for (let x = -MG; x < W + MG; x++) {
      const t = tAt(x, y), inMap = inMapT(x, y), X0 = x * 2, Z0 = y * 2, b = gbio(x, y), base = baseAt(x, y), fv = floraAt(x, y);
      if (base === 2) {
        const c1 = col(0x2a2620, 0.2), c2 = col(0x352f26, 0.2);
        GD.quad(X0, Z0, X0 + 2, Z0 + 2, -1.3, c1, c2, c2, c1);
        for (const [dx, dy, f] of [[-1, 0, 'w'], [1, 0, 'e'], [0, -1, 'n'], [0, 1, 's']]) {
          if (baseAt(x + dx, y + dy) === 2) continue;
          const bx = f === 'w' ? X0 : f === 'e' ? X0 + 2 : X0 + 1, bz = f === 'n' ? Z0 : f === 's' ? Z0 + 2 : Z0 + 1;
          GD.box(bx, -1.3, bz, f === 'w' || f === 'e' ? 0.12 : 2, 1.3, f === 'n' || f === 's' ? 0.12 : 2, b === 'docks' ? col(0x6a665e, 0.1) : col(0x4a3e30, 0.15), { grad: 0.45 });
        }
        if (!RIVER_X.includes(x)) { const wc = wetC(b, true); WT.quad(X0, Z0, X0 + 2, Z0 + 2, -0.45, wc, wc, wc, wc); }
        continue;
      }
      if (inMap) {
        const bi = bIdx[y * W + x];
        if (t === T_ROOF || (t === T_WALL && (bi >= 0 || inBunker(x, y)))) continue;
        const st = bi >= 0 ? (BST[WORLD.roofs[bi].type] || BST.street) : null;
        if (st && (t === T_FLOOR || t === T_PROP || t === T_DOOR || t === T_SHALLOW)) {
          if (st.floor === 'wood') for (let i = 0; i < 4; i++) { const c = floorCol('wood'); GD.quad(X0 + i * 0.5, Z0, X0 + i * 0.5 + 0.5, Z0 + 2, 0, c, c, c, c); }
          else for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) { const c = floorCol(st.floor, x * 2 + i, y * 2 + k); GD.quad(X0 + i, Z0 + k, X0 + i + 1, Z0 + k + 1, 0, c, c, c, c); }
          if (t === T_SHALLOW) { const wc = wetC(b, false); WT.quad(X0, Z0, X0 + 2, Z0 + 2, 0.16, wc, wc, wc, wc); }
          continue;
        }
      }
      if (base === 1) {
        const cs = []; for (let k = 0; k <= 2; k++) for (let i = 0; i <= 2; i++) cs.push(groundCol(T_SHALLOW, X0 + i, Z0 + k, b, fv));
        for (let k = 0; k < 2; k++) for (let i = 0; i < 2; i++) GD.quad(X0 + i, Z0 + k, X0 + i + 1, Z0 + k + 1, -0.04, cs[k * 3 + i], cs[k * 3 + i + 1], cs[(k + 1) * 3 + i], cs[(k + 1) * 3 + i + 1]);
        const wc = wetC(b, false); WT.quad(X0, Z0, X0 + 2, Z0 + 2, 0.16, wc, wc, wc, wc);
        continue;
      }
      const tt = inMap ? gtype(x, y) : t;
      if (inMap) {
        const cs = [], hard = isRoadT(tt);
        for (let k = 0; k <= 2; k++) for (let i = 0; i <= 2; i++) {
          if (hard) { cs.push(groundCol(tt, X0 + i, Z0 + k, b, fv)); continue; }
          /* average the ground of every dry, non-road tile that touches this vertex */
          const c = groundCol(tt, X0 + i, Z0 + k, b, fv); let n = 1;
          for (const tx of i === 0 ? [x - 1, x] : i === 2 ? [x, x + 1] : [x]) for (const ty of k === 0 ? [y - 1, y] : k === 2 ? [y, y + 1] : [y]) {
            if ((tx === x && ty === y) || !inMapT(tx, ty) || baseAt(tx, ty) || bIdx[ty * W + tx] >= 0) continue;
            const ot = gtype(tx, ty); if (isRoadT(ot) || ot === T_WALL || ot === T_ROOF || ot === T_FLOOR) continue;
            c.add(groundCol(ot, X0 + i, Z0 + k, gbio(tx, ty), floraAt(tx, ty))); n++;
          }
          cs.push(c.multiplyScalar(1 / n));
        }
        for (let k = 0; k < 2; k++) for (let i = 0; i < 2; i++) GD.quad(X0 + i, Z0 + k, X0 + i + 1, Z0 + k + 1, 0, cs[k * 3 + i], cs[k * 3 + i + 1], cs[(k + 1) * 3 + i], cs[(k + 1) * 3 + i + 1]);
      } else {
        const c = (i, k) => groundCol(tt, X0 + i, Z0 + k, b, 0);
        GD.quad(X0, Z0, X0 + 2, Z0 + 2, 0, c(0, 0), c(2, 0), c(0, 2), c(2, 2));
      }
    }
  }
  const inBunker = (x, y) => { const b = WORLD.bunker; return b && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h; };
  /* the ground a tile shows: props stand on whatever their neighbours stand on; gates on what they block */
  let gtCache = null;
  function gtype(x, y) {
    if (!gtCache || gtCache.length !== W * H) { gtCache = new Int8Array(W * H).fill(-99); }
    const i = y * W + x; if (gtCache[i] !== -99) return gtCache[i];
    const t = tileAt(x, y); let r = t;
    if ([T_PROP, T_TREE, T_BUSH, T_DECO, T_ROCK, T_FENCE, T_PLANK].includes(t)) {
      const votes = {};
      for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const n = tileAt(x + a, y + c); if ([T_GRASS, T_YARD, T_PATH, T_FIELD, T_RUBBLE].includes(n)) votes[n] = (votes[n] || 0) + 1; }
      let best = gbio(x, y) === 'docks' ? T_YARD : T_GRASS, bv = 0; for (const k in votes) if (votes[k] > bv) { bv = votes[k]; best = +k; }
      r = best;
    } else if (t === T_GATE) { const u = gateUnder(x, y); r = u == null ? T_ROAD : u; }
    return (gtCache[i] = r);
  }

  /* roads: lane dashes, crossings, cracks, stains, sidewalks + curbs (in town), lamps */
  function buildStreets(lampSpots) {
    const mark = col(0x8e8670);
    for (let y = -MG; y < H + MG; y++) for (let x = -MG; x < W + MG; x++) {
      if (!isRoadT(tAt(x, y)) || gbio(x, y) === 'pass') continue;
      if (isRoadT(tAt(x, y + 1)) && !roadish(tAt(x, y - 1)) && !roadish(tAt(x, y + 2)) && !(x & 1) && rr() > 0.15) GD.box(x * 2 + 1, 0, (y + 1) * 2, 1.6, 0.012, 0.14, col(0x8e8670, 0.2));
      if (isRoadT(tAt(x + 1, y)) && !roadish(tAt(x - 1, y)) && !roadish(tAt(x + 2, y)) && !(y & 1) && rr() > 0.15) GD.box((x + 1) * 2, 0, y * 2 + 1, 0.14, 0.012, 1.6, col(0x8e8670, 0.2));
    }
    /* zebra crossings beside each Old Town intersection */
    for (const X of ROADS_X) for (const Y of ROADS_Y) {
      for (const side of [-1, 1]) {
        const xc = side < 0 ? X * 2 - 1.1 : (X + 2) * 2 + 1.1, zc = side < 0 ? Y * 2 - 1.1 : (Y + 2) * 2 + 1.1;
        if (isRoadT(tileAt(Math.floor(xc / 2), Y))) for (let k = 0; k < 5; k++) if (rr() < 0.8) GD.box(xc, 0, Y * 2 + 0.45 + k * 0.78, 1.4, 0.013, 0.42, mark);
        if (isRoadT(tileAt(X, Math.floor(zc / 2)))) for (let k = 0; k < 5; k++) if (rr() < 0.8) GD.box(X * 2 + 0.45 + k * 0.78, 0, zc, 0.42, 0.013, 1.4, mark);
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tileAt(x, y), wx = x * 2, wz = y * 2, b = gbio(x, y);
      if (isRoadT(t)) {
        if (rr() < 0.3) { let px = wx + rf(0.2, 1.8), pz = wz + rf(0.2, 1.8), a = rf(0, 6); for (let k = 0; k < 3; k++) { const l = rf(0.4, 1.0), nx = px + Math.cos(a) * l, nz = pz + Math.sin(a) * l; GD.beam(px, 0.012, pz, nx, 0.012, nz, 0.05, col(0x1a1917)); px = nx; pz = nz; a += rf(-0.9, 0.9); } }
        if (rr() < 0.08) GD.geo(G_CYL8, wx + rf(0.5, 1.5), 0.01, wz + rf(0.5, 1.5), rf(0.8, 1.6), 0.008, rf(0.6, 1.3), col(0x24221f), { ry: rf(0, 3) });
        if (rr() < 0.04 && b !== 'pass') GD.geo(G_DOD, wx + 1, 0, wz + 1, rf(0.7, 1.1), 0.05, rf(0.6, 1.0), col(0x1e1c1a), { ry: rf(0, 3) });
        if (rr() < 0.05 && b !== 'pass') GD.box(wx + rf(0.3, 1.7), 0, wz + rf(0.3, 1.7), 0.25, 0.01, 0.32, col(0xb8b2a4, 0.2), { ry: rf(0, 3) });
        continue;
      }
      if (b !== 'oldtown' && b !== 'suburbs') continue;
      if (![T_GRASS, T_RUBBLE, T_YARD, T_FIELD, T_TREE, T_BUSH, T_FENCE].includes(t) || bIdx[y * W + x] >= 0) continue;
      const nb = D4.map(([dx, dy]) => isRoadT(tileAt(x + dx, y + dy)) || tileAt(x + dx, y + dy) === T_BRIDGE);
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
        if (lane % 8 === (horiz ? (i === 0 ? 1 : 5) : (i === 2 ? 2 : 6)) && t !== T_TREE && t !== T_FENCE && !inShelter(x + 0.5, y + 0.5) && !inCamp(x, y)) {
          const lx = horiz ? wx + 1 : edge + dir * 0.45, lz = horiz ? edge + dir * 0.45 : wz + 1;
          lampSpots.push({ x: lx, z: lz, dx: horiz ? 0 : -dir, dz: horiz ? -dir : 0 });
        }
      });
    }
    /* docks quay: a concrete edge with bollards along the river and the harbour */
    for (let y = 0; y < H; y++) for (let x = 88; x < W; x++) {
      const t = tileAt(x, y); if (t === T_WATER || baseAt(x, y) === 2) continue;
      for (const [dx, dy] of D4) {
        if (baseAt(x + dx, y + dy) !== 2 || tileAt(x + dx, y + dy) === T_PLANK) continue;
        const ex = (x + 0.5) * 2 + dx * 0.88, ez = (y + 0.5) * 2 + dy * 0.88;
        GD.box(ex, 0, ez, dx ? 0.25 : 2, 0.06, dy ? 0.25 : 2, col(0xb09030, 0.1));
        if ((x + y) % 3 === 0) S.geo(G_CYL8, ex - dx * 0.2, 0.25, ez - dy * 0.2, 0.36, 0.5, 0.36, col(0x2a2a2a));
      }
    }
  }

  /* rubble piles, debris, fields, ruins */
  function buildDetails() {
    const conc = [0x6e6a64, 0x5a5650, 0x7a4a3a, 0x4a4640, 0x625e56];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tileAt(x, y), wx = x * 2, wz = y * 2, b = gbio(x, y);
      if (t === T_RUBBLE) {
        for (let i = 0; i < 6; i++) S.geo(rr() < 0.5 ? G_ICO : G_DOD, wx + rf(0.3, 1.7), rf(0, 0.12), wz + rf(0.3, 1.7), rf(0.25, 0.7), rf(0.15, 0.45), rf(0.25, 0.7), col(rpick(conc), 0.2), { ry: rf(0, 6) });
        for (let i = 0; i < 5; i++) GD.box(wx + rf(0.2, 1.8), 0, wz + rf(0.2, 1.8), 0.24, 0.08, 0.12, col(0x7a4a36, 0.25), { ry: rf(0, 3) });
        if (rr() < 0.5) S.beam(wx + rf(0.2, 0.8), 0.05, wz + rf(0.2, 1.8), wx + rf(1.2, 1.9), rf(0.2, 0.5), wz + rf(0.2, 1.8), 0.1, col(PAL.wood2, 0.2));
        if (rr() < 0.3) S.beam(wx + 1, 0.1, wz + 1, wx + 1 + rf(-0.6, 0.6), rf(0.6, 1.0), wz + 1 + rf(-0.6, 0.6), 0.03, col(0x5a3a28));
      } else if (t === T_FIELD) {
        const crop = floraAt(x, y) === FLORA.CROP;
        for (const ox of [0.33, 1.0, 1.67]) {
          GD.box(wx + ox, 0, wz + 1, 0.42, 0.13, 2, col(0x4a3826, 0.12));
          if (!crop) continue;
          if (b === 'suburbs') { if (rr() < 0.7) HB.add(FOL.crops((rr() * 2) | 0), M(wx + ox, 0.1, wz + 1, Math.PI / 2, 1, 1, 1), col(0xffffff, 0.15), { bid: 0 }); continue; }
          for (let k = 0; k < 3; k++) if (rr() < 0.8) HB.add(KIT.stalk(), M(wx + ox + rf(-0.08, 0.08), 0, wz + 0.35 + k * 0.65 + rf(-0.1, 0.1), rf(0, 6), 1, rf(0.7, 1.2), 1, rf(-0.15, 0.15), rf(-0.15, 0.15)), col(0xffffff, 0.3), { bid: 3 });
        }
      } else if ((t === T_GRASS || t === T_YARD) && bIdx[y * W + x] < 0 && !inShelter(x + 0.5, y + 0.5) && (b === 'oldtown' || b === 'suburbs' || b === 'docks')) {
        if (rr() < 0.05) S.geo(G_ICO, wx + rf(0.4, 1.6), 0.18, wz + rf(0.4, 1.6), rf(0.45, 0.65), 0.38, rf(0.4, 0.6), col(0x1e221e, 0.3), { ry: rf(0, 3) }); // bin bag
        if (rr() < 0.03) S.geo(G_TOR, wx + rf(0.4, 1.6), 0.13, wz + rf(0.4, 1.6), 1, 1, 1, col(0x171615), { rx: Math.PI / 2 + rf(-0.2, 0.2), ry: rf(0, 3) });
        if (rr() < 0.06) GD.box(wx + rf(0.3, 1.7), 0, wz + rf(0.3, 1.7), 0.22, 0.01, 0.3, col(0xb0aa9c, 0.25), { ry: rf(0, 3) });
      } else if (t === T_WALL && bIdx[y * W + x] < 0 && !inBunker(x, y) && !inCamp(x, y)) {
        /* collapsed house: jagged brick wall stubs, rubble at their feet, ivy climbing the old brick */
        const brick = col(rpick([0x75624f, 0x80584a, 0x6e5a48]), 0.1), hh = rf(0.7, 2.8);
        S.box(wx + 1, 0, wz + 1, 2, hh, 2, brick, { grad: 0.6 });
        S.box(wx + 1 + rf(-0.4, 0.4), hh, wz + 1 + rf(-0.4, 0.4), rf(0.6, 1.2), rf(0.3, 0.9), rf(0.6, 1.2), brick);
        for (let i = 0; i < 3; i++) S.geo(G_ICO, wx + rf(0, 2), 0.1, wz + rf(0, 2), rf(0.3, 0.6), rf(0.2, 0.4), rf(0.3, 0.6), col(rpick(conc), 0.2), { ry: rf(0, 6) });
        if (rr() < 0.6) { const f = rpick([0, 1, 4, 5]); ivyPatch(wx + 1 + N4[f][0] * 1.02, wz + 1 + N4[f][1] * 1.02, N4[f][0], N4[f][1], hh, 0); }
      }
    }
    /* a scarecrow watching the crops in Teodor's biggest field */
    const ft = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tileAt(x, y) === T_FIELD && gbio(x, y) === 'farm') ft.push([x, y]);
    if (ft.length) {
      const [x, y] = ft[Math.floor(ft.length / 2)], wx = x * 2 + 1, wz = y * 2 + 1;
      S.box(wx, 0, wz, 0.1, 2.2, 0.1, col(PAL.wood2)); S.box(wx, 1.55, wz, 1.6, 0.08, 0.08, col(PAL.wood2));
      S.box(wx, 1.1, wz, 0.5, 0.7, 0.28, col(0x5a4a3a)); S.geo(G_ICO, wx, 1.95, wz, 0.34, 0.36, 0.34, col(0x8a7a5a));
      S.geo(G_CONE5, wx, 2.2, wz, 0.6, 0.25, 0.6, col(0x3a2e22));
    }
  }
  /* ivy on a wall face at (fx,fz) facing (nx,nz): a few leafy sheets climbing from the ground, uneven tops */
  function ivyPatch(fx, fz, nx, nz, maxH, bid) {
    const ry = Math.atan2(nx, nz), n = 2 + Math.floor(rr() * 3);
    for (let i = 0; i < n; i++) {
      const along = rf(-0.8, 0.8), h = rf(0.8, Math.max(1, maxH - 0.2)), w = rf(0.35, 0.7);
      S.geo(G_BOX, fx + nx * 0.05 + nz * along, h / 2, fz + nz * 0.05 - nx * along, w, h, 0.05, col(rpick([PAL.ivy, 0x46602c, 0x36481f]), 0.15), { ry, bid });
      if (rr() < 0.5) S.geo(G_BOX, fx + nx * 0.07 + nz * (along + rf(-0.2, 0.2)), h + rf(-0.2, 0.15), fz + nz * 0.07 - nx * (along + rf(-0.2, 0.2)), w * 0.6, rf(0.25, 0.5), 0.05, col(PAL.ivy, 0.2), { ry, bid });
    }
  }

  /* ================================================================ buildings ================================================================ */
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
    const snowy = st.snowRoof || gbio(x0, y0) === 'pass';
    const roofc = snowy ? col(0xd4d8de, 0.04) : col(st.roofs ? rpick(st.roofs) : st.roofC, 0.1), CAPC = col(PAL.cap, 0.1), DK = col(PAL.dark);
    const wallBase = col(st.walls ? rpick(st.walls) : st.wall);
    if (r.closed) return r.type === 'garage' ? closedGarage(r, st, bid) : closedBlock(r, st, h, bid);
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
      /* log cabin courses, the flood's tide mark */
      if (st.logs) for (const f of ext) { const nx = N4[f][0], nz = N4[f][1], ry = Math.atan2(nx, nz); for (let yy = 0.2; yy < wt - 0.1; yy += 0.42) S.geo(G_BOX, wx + nx * 1.03, yy, wz + nz * 1.03, 2.1, 0.1, 0.06, wc.clone().multiplyScalar(0.72), { ry, bid }); }
      if (st.waterline) for (const f of ext) { const nx = N4[f][0], nz = N4[f][1], ry = Math.atan2(nx, nz); S.geo(G_BOX, wx + nx * 1.03, 0.55, wz + nz * 1.03, 2.04, 1.1, 0.04, col(0x3a3626, 0.1), { ry, bid }); S.geo(G_BOX, wx + nx * 1.04, 1.12, wz + nz * 1.04, 2.04, 0.08, 0.04, col(0x4a5232, 0.15), { ry, bid }); }
      if (ext.length !== 1) continue; // corners stay plain
      const f = ext[0], nx = N4[f][0], nz = N4[f][1], ry = Math.atan2(nx, nz), fx = wx + nx, fz = wz + nz;
      /* ivy climbs old brick, mostly on the shaded north faces */
      if (st.brick && rr() < (f === 5 ? 0.45 : 0.1)) ivyPatch(fx, fz, nx, nz, wt, bid);
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
        else if (k < 0.8) S.box(px, h, pz, rf(1, 2), 0.04, rf(0.8, 1.6), col(rr() < 0.5 ? PAL.tarp : PAL.moss, 0.2), { bid, ry: rf(0, 3) });
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
  /* a closed suburban garage: painted block, roller door to the drive */
  function closedGarage(r, st, bid) {
    const X0 = r.x * 2, Z0 = r.y * 2, W2 = r.w * 2, D2 = r.h * 2, cx = X0 + W2 / 2, cz = Z0 + D2 / 2, h = st.h, wc = col(rpick(BST.house.walls), 0.06);
    S.box(cx, 0, cz, W2 - 0.1, h, D2 - 0.1, null, { fc: [wc, wc, col(0x3e3c38), col(PAL.dark), wc, wc], grad: 0.6, bid });
    S.box(cx, h, cz, W2 + 0.2, 0.18, D2 + 0.2, col(0x3a3834), { bid });
    S.box(cx, 0, Z0 + D2 - 0.02, W2 - 1.1, 2.2, 0.08, col(rpick([0x8a8a84, 0x6a7a8a, 0x8a6a4a])), { bid });
    for (let k = 0; k < 7; k++) S.box(cx, 0.2 + k * 0.3, Z0 + D2 + 0.03, W2 - 1.2, 0.04, 0.03, col(0x4a4a46), { bid });
    GD.geo(G_CYL8, cx, 0.012, Z0 + D2 + 1.0, 1.2, 0.006, 0.9, col(0x1e1c1a));
    if (rr() < 0.4) ivyPatch(X0 - 0.02, cz, -1, 0, h, bid);
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
      else if (k < 0.45 && ['apartments', 'street', 'police', 'house', 'ranger', 'flooded', 'docks', 'pass'].includes(t2)) GD.box(wx, 0, wz, rf(1.2, 1.7), 0.02, rf(0.9, 1.2), col(rpick([0x5a2a24, 0x2a3a4a, 0x4a3a2a]), 0.2), { ry: rf(-0.2, 0.2) });
      else if (k < 0.6) { S.box(wx, 0, wz, 0.45, 0.45, 0.45, col(0x5a4632, 0.2), { ry: rf(0, 3), rx: rr() < 0.5 ? Math.PI / 2 : 0 }); } // toppled chair / box
      else if (k < 0.72 && t2 === 'supermarket') for (let i = 0; i < 5; i++) S.geo(G_CYL6, wx + rf(-0.6, 0.6), 0.07, wz + rf(-0.6, 0.6), 0.13, 0.17, 0.13, col(rpick([0x8a3a2a, 0x3a5a7a, 0xb09a6a])), { rz: Math.PI / 2, ry: rf(0, 3) });
      else if (k < 0.8 && (t2 === 'factory' || t2 === 'depot' || t2 === 'warehouse')) S.box(wx, 0, wz, 1.2, 0.14, 1.0, col(0x6a5034, 0.2), { ry: rf(-0.3, 0.3) });
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
      if (tileAt(x, y) !== T_WALL || bIdx[y * W + x] >= 0 || inBunker(x, y) || !inCamp(x, y)) continue;
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
  function addFire(wx, wz, kind) { S.add(kind === 'camp' ? DKIT.campfire() : KIT.barrelFire(), M(wx, 0, wz, rr() * 6, 1, 1, 1), null, { bid: 0 }); fires.push({ x: wx / 2, y: wz / 2, k: kind === 'camp' ? 0.8 : 1, kind: kind || 'barrel' }); }
  function buildBus() {
    if (busMesh) { root.remove(busMesh); busMesh.geometry.dispose(); busMesh = null; }
    const b = WORLD.bus; if (!b) return;
    busReady = !!(G && G.flags && G.flags.bus_ready);
    const B = new Bld(); B.add(KIT.bus(busReady), M((b.x + 0.5) * 2, busReady ? 0.08 : 0, (b.y + 0.5) * 2, 0.04, 1, 1, 1, 0, busReady ? 0 : 0.03), null, { bid: 95 });
    busMesh = new THREE.Mesh(B.geometry(), mats.solid); busMesh.castShadow = busMesh.receiveShadow = true; root.add(busMesh);
  }

  /* ================================================================ props: cars, lamps ================================================================ */
  function instanced(geo, mat, list, cast) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c || WHITE); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = !!cast; im.receiveShadow = true; im.computeBoundingSphere && im.computeBoundingSphere();
    root.add(im); return im;
  }
  const mcopy = (...a) => M(...a).clone();
  function buildProps(lampSpots) {
    const cars = [], lampsOn = [], lampsOff = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (tileAt(x, y) !== T_CAR) continue;
      const wx = (x + 0.5) * 2, wz = (y + 0.5) * 2, rd = (a, b) => roadish(tileAt(a, b));
      const hz = rd(x, y - 1) !== rd(x, y + 1), vt = rd(x - 1, y) !== rd(x + 1, y);
      const horiz = hz && !vt ? true : vt && !hz ? false : rr() < 0.5;
      const cont = WORLD.containers.find(c => c.x === x && c.y === y), pass = gbio(x, y) === 'pass';
      const crash = rr() < 0.18, flip = !cont && !pass && rr() < 0.15, burnt = rr() < 0.25;
      const ry = (horiz ? 0 : Math.PI / 2) + (rr() < 0.5 ? Math.PI : 0) + (crash ? rf(-0.9, 0.9) : rf(-0.25, 0.25));
      const paint = pass ? col(rpick([0x4e5636, 0x3e4430, 0x5a5e48]), 0.15) : burnt ? col(0x2a2420, 0.3) : col(rpick([0x7a3a2a, 0x3e4e5e, 0x8a8270, 0x5a5e58, 0x4e5a3e, 0x9a9488, 0x6a4a2a]), 0.2);
      const m = flip ? mcopy(wx, 1.7, wz, ry, 1, 1, 1, Math.PI + rf(-0.1, 0.1), 0) : mcopy(wx, 0, wz, ry, 1, 1, 1, 0, rf(-0.03, 0.03));
      cars.push({ m, c: paint });
      if (cont) carAt[x + ',' + y] = { m, c: paint };
    }
    for (const l of lampSpots) {
      const broken = rr() < 0.3, ry = Math.atan2(-l.dz, l.dx);
      (broken ? lampsOff : lampsOn).push({ m: mcopy(l.x, 0, l.z, ry, 1, 1, 1, broken ? rf(-0.12, 0.12) : 0, broken ? rf(-0.15, 0.15) : 0), c: col(0xffffff, 0.15) });
      if (!broken) l.on = true;
    }
    instanced(KIT.car(), mats.inst, cars, true);
    instanced(KIT.lamp(true), mats.inst, lampsOn, true);
    instanced(KIT.lamp(false), mats.inst, lampsOff, true);
    /* light pools under working lamps (additive decals, brighten at night) */
    const on = lampSpots.filter(l => l.on);
    if (on.length) {
      const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2); own(pg);
      lampPools = new THREE.InstancedMesh(pg, mats.pool, on.length);
      on.forEach((l, i) => lampPools.setMatrixAt(i, mcopy(l.x + l.dx * 1.5, 0.03, l.z + l.dz * 1.5, 0, 7, 1, 7)));
      lampPools.renderOrder = 2; root.add(lampPools);
    }
  }

  /* ================================================================ nature: every plant has a reason to be where it is ================================================================ */
  function placeTree(fv, b, wx, wz, o) {
    const v = (rr() * 3) | 0; let geo, s = rf(0.85, 1.15);
    if (fv === FLORA.WILLOW) { geo = FOL.willow(v % 2); s = rf(0.95, 1.2); }
    else if (fv === FLORA.DEAD) geo = KIT.deadTree(false);
    else if (fv === FLORA.SNOWPINE || b === 'pass') geo = FOL.snowPine(v % 2);
    else if (fv === FLORA.BIRCH) geo = FOL.birch(v % 2);
    else if (fv === FLORA.STREET) geo = FOL.street(v % 2);
    else if (b === 'forest') {
      if (fv === FLORA.YOUNG) { geo = rr() < 0.7 ? FOL.youngPine(v) : FOL.youngBroad(v % 2); s = rf(0.8, 1.05); }
      else { geo = rr() < 0.8 ? FOL.pine(v) : FOL.broad(v % 2); s = rf(1.05, 1.4); }
    } else if (fv === FLORA.YOUNG) geo = FOL.youngBroad(v % 2);
    else geo = (b === 'oldtown' && rr() < 0.12) ? KIT.deadTree(true) : FOL.broad(v % 2);
    F.add(geo, M(wx, 0, wz, rr() * 6.28, s, s * rf(0.88, 1.12), s, rf(-0.04, 0.04), rf(-0.04, 0.04)), (o && o.c) || col(0xffffff, 0.22), { glow: [rr(), 0] });
  }
  function buildFlora() {
    const dens = R.touch ? 0.6 : 1, hatch = WORLD.hatch;
    /* weeds thrive where nobody walks: far from the bunker, in the suburbs and the docks, never in the yard */
    const weedK = (x, y) => { if (inShelter(x + 0.5, y + 0.5)) return 0; const d = Math.hypot(x - hatch.x, y - hatch.y); let k = clamp((d - 5) / 24, 0.12, 1); if (gbio(x, y) !== 'oldtown') k = Math.min(1, k * 1.25); return k * dens; };
    const tuft = (wx, wz, s, c) => HB.add(G_BLADES, M(wx, 0, wz, rr() * 6.28, s, s * rf(0.7, 1.4), s), c || mixc(0x6a6a4c, 0x8a7a50, rr()), { bid: 3 });
    const grassC = b => b === 'farm' ? mixc(0x8a7a4a, 0xa08a52, rr()) : b === 'forest' ? mixc(0x4a5a30, 0x6a7040, rr()) : b === 'pass' ? mixc(0x7a7058, 0x8a8068, rr()) : b === 'suburbs' ? mixc(0x5a6e3a, 0x7a8048, rr()) : mixc(0x5e6a40, 0x8a7a50, rr());
    const plant = (geo, wx, wz, s) => HB.add(geo, M(wx, 0, wz, rr() * 6.28, s, s * rf(0.85, 1.15), s), col(0xffffff, 0.18), { glow: [rr(), 0] });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, t = tileAt(x, y), fv = WORLD.flora[i], b = BIOMES[WORLD.biome[i]], wx = (x + 0.5) * 2, wz = (y + 0.5) * 2;
      if (bIdx[i] >= 0) continue;
      if (t === T_TREE) { placeTree(fv, b, wx + rf(-0.3, 0.3), wz + rf(-0.3, 0.3)); continue; }
      if (t === T_BUSH) {
        const hedge = fv === FLORA.HEDGE, hz = tileAt(x - 1, y) === T_BUSH || tileAt(x + 1, y) === T_BUSH;
        F.add(hedge ? FOL.hedge((rr() * 3) | 0) : FOL.bush((rr() * 3) | 0), M(wx + rf(-0.15, 0.15), 0, wz + rf(-0.15, 0.15), hedge ? (hz ? 0 : Math.PI / 2) + rf(-0.1, 0.1) : rr() * 6.28, rf(0.95, 1.15), rf(0.9, 1.2), rf(0.95, 1.15)), col(0xffffff, 0.15), { glow: [rr(), 0] });
        if (hedge && rr() < 0.3) tuft(wx + rf(-0.9, 0.9), wz + rf(-0.9, 0.9), rf(0.7, 1.1), grassC(b));
        continue;
      }
      /* plants placed by the generator for a reason: saplings in rubble and ruins, ferns at the forest edge, flowers, reeds at the water */
      if (fv === FLORA.SAPLING) plant(FOL.sapling((rr() * 3) | 0), wx + rf(-0.5, 0.5), wz + rf(-0.5, 0.5), rf(0.8, 1.3));
      else if (fv === FLORA.FERN) for (let k = 0; k < 2; k++) plant(FOL.fern((rr() * 3) | 0), wx + rf(-0.7, 0.7), wz + rf(-0.7, 0.7), rf(0.8, 1.3));
      else if (fv === FLORA.FLOWERS) plant(FOL.flowers((rr() * 4) | 0), wx + rf(-0.5, 0.5), wz + rf(-0.5, 0.5), rf(0.8, 1.2));
      else if (fv === FLORA.REED) plant(FOL.reeds((rr() * 2) | 0), wx + rf(-0.4, 0.4), wz + rf(-0.4, 0.4), rf(0.8, 1.2));
      if (isRoadT(t)) { if (rr() < 0.07 * weedK(x, y)) tuft(wx + rf(-0.8, 0.8), wz + rf(-0.8, 0.8), rf(0.6, 1.0), mixc(0x5a6a3a, 0x7a7a48, rr())); continue; }
      if (![T_GRASS, T_RUBBLE, T_YARD, T_PATH].includes(t) || inShelter(x + 0.5, y + 0.5)) continue;
      const wk = weedK(x, y);
      if (t === T_PATH) { if (rr() < 0.25 * wk + (b === 'forest' ? 0.3 : 0)) tuft(wx + rf(-0.8, 0.8), wz + rf(-0.8, 0.8), rf(0.6, 1.0), grassC(b)); continue; }
      /* kerb joints and wall feet */
      for (const [dx, dy] of D4) {
        const nt = tileAt(x + dx, y + dy);
        if (isRoadT(nt) && (b === 'oldtown' || b === 'suburbs')) { const n = Math.round(rr() * 2.6 * wk); for (let k = 0; k < n; k++) { const along = rf(-0.9, 0.9), o = rr() < 0.5 ? 0.9 : -0.32; tuft(wx + (dx ? dx * o : along), wz + (dy ? dy * o : along), rf(0.6, 1.0)); } }
        else if (nt === T_WALL && bIdx[(y + dy) * W + x + dx] >= 0) { const n = 1 + Math.round(rr() * 2 * wk); for (let k = 0; k < n; k++) { const along = rf(-0.9, 0.9); tuft(wx + (dx ? dx * 0.84 : along), wz + (dy ? dy * 0.84 : along), rf(0.7, 1.2)); } }
      }
      /* open ground: lawns, meadow, forest floor, cracked docks concrete, grass poking through the snow; back alleys grow wild */
      let base = b === 'forest' ? 0.55 : b === 'farm' ? 0.9 : b === 'suburbs' ? 0.7 : b === 'pass' ? 0.12 : b === 'docks' ? 0.2 * wk : b === 'flooded' ? 0.4 : t === T_RUBBLE ? 0.5 * wk : 0.3 + 0.45 * wk;
      if (b === 'oldtown' && !D4.some(([a, c]) => isRoadT(tileAt(x + a, y + c)))) base *= 1.4;
      if (t === T_YARD) base *= b === 'docks' ? 1 : 0.3;
      const n = Math.floor(base * 2.2 * dens + rr());
      for (let k = 0; k < n; k++) tuft(wx + rf(-0.9, 0.9), wz + rf(-0.9, 0.9), rf(0.7, 1.5), grassC(b));
    }
  }
  /* outskirts: the woods around the valley, snow above the pass, the sea east of the docks */
  function buildOutskirts() {
    for (let y = -MG; y < H + MG; y++) for (let x = -MG; x < W + MG; x++) {
      if (inMapT(x, y) || tAt(x, y) !== -1) continue;
      const b = gbio(x, y), dEdge = Math.max(-x, x - W + 1, -y, y - H + 1);
      if (D4.some(([a, c]) => { const t = tAt(x + a, y + c); return t !== -1 && !inMapT(x + a, y + c); })) { if (rr() < 0.75) continue; }
      const p = b === 'forest' || b === 'pass' ? 0.42 + dEdge * 0.04 : b === 'suburbs' ? 0.3 + dEdge * 0.03 : b === 'farm' ? 0.1 + dEdge * 0.03 : 0.2;
      const wx = (x + 0.5) * 2 + rf(-0.5, 0.5), wz = (y + 0.5) * 2 + rf(-0.5, 0.5);
      if (rr() > p) { if (b === 'forest' && rr() < 0.3) HB.add(FOL.fern((rr() * 3) | 0), M(wx, 0, wz, rr() * 6, 1, 1, 1), col(0xffffff, 0.15), { glow: [rr(), 0] }); continue; }
      if (b === 'pass') { if (rr() < 0.35) boulder(wx, wz, true, true); else placeTree(FLORA.SNOWPINE, b, wx, wz); }
      else if (b === 'forest') placeTree(rr() < 0.85 ? FLORA.OLD : FLORA.BIRCH, 'forest', wx, wz);
      else if (b === 'suburbs') placeTree(rr() < 0.5 ? FLORA.OLD : FLORA.BIRCH, rr() < 0.4 ? 'forest' : 'suburbs', wx, wz);
      else placeTree(FLORA.OLD, b, wx, wz);
    }
  }
  /* river surface */
  function buildRiver() {
    const x0 = RIVER_X[0] * 2, wd = RIVER_X.length * 2, z0 = -MG * 2, len = (H + 2 * MG) * 2;
    const g = own(new THREE.PlaneGeometry(wd, len, 4, len)); g.rotateX(-Math.PI / 2);
    const n = g.attributes.position.count, cs = new Float32Array(n * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cs, 3));
    water = new THREE.Mesh(g, mats.water); water.position.set(x0 + wd / 2, -0.45, z0 + len / 2); water.receiveShadow = true;
    waterBase = Float32Array.from(g.attributes.position.array);
    root.add(water);
  }
  /* rocks: the old drystone wall round Kessler Woods, cliffs of the pass, boulders on the hills */
  function boulder(wx, wz, big, snow) {
    const n = big ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const sx = rf(1.1, 2.0) * (big ? 1.3 : 1), sy = rf(0.9, big ? 3.2 : 1.8);
      S.geo(rr() < 0.5 ? G_DOD : G_ICO, wx + rf(-0.5, 0.5), sy * 0.32, wz + rf(-0.5, 0.5), sx, sy, sx * rf(0.8, 1.1), snow ? mixc(0x55565a, 0x707278, rr()) : col(rpick([0x5e5a52, 0x6a665c, 0x52504a]), 0.12), { ry: rr() * 6.28 });
      if (snow) S.geo(G_DOD, wx + rf(-0.3, 0.3), sy * 0.62, wz + rf(-0.3, 0.3), sx * 0.7, sy * 0.3, sx * 0.7, col(0xdfe3e8, 0.04), { ry: rr() * 6 });
      else if (rr() < 0.5) S.geo(G_BOX, wx, sy * 0.62, wz, sx * 0.5, 0.06, sx * 0.5, col(PAL.moss, 0.2), { ry: rr() * 6 });
    }
  }
  function buildRocks() {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (tileAt(x, y) !== T_ROCK) continue;
      const fv = floraAt(x, y), wx = (x + 0.5) * 2, wz = (y + 0.5) * 2, b = gbio(x, y);
      if (fv === FLORA.STONEWALL) {
        const horiz = tileAt(x - 1, y) === T_ROCK || tileAt(x + 1, y) === T_ROCK;
        for (let k = 0; k < 5; k++) { const a = -0.8 + k * 0.4; S.geo(G_DOD, horiz ? wx + a : wx + rf(-0.1, 0.1), rf(0.2, 0.55), horiz ? wz + rf(-0.1, 0.1) : wz + a, rf(0.5, 0.7), rf(0.45, 0.6), rf(0.5, 0.7), col(rpick([0x6e6a62, 0x5e5a52, 0x7a756a]), 0.12), { ry: rr() * 6 }); }
        S.geo(G_BOX, wx, 0.78, wz, horiz ? 2 : 0.55, 0.07, horiz ? 0.55 : 2, col(PAL.moss, 0.2));
      } else boulder(wx, wz, fv === FLORA.CLIFF, b === 'pass');
    }
  }
  /* garden fences: board panels between posts */
  function buildFences() {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (tileAt(x, y) !== T_FENCE) continue;
      const wx = (x + 0.5) * 2, wz = (y + 0.5) * 2, c = col([0xc8c4b8, 0x8a7a64, 0x5a6a54, 0xa89878][Math.floor(hash(Math.floor(x / 12), Math.floor(y / 10)) * 4)], 0.1);
      S.box(wx, 0, wz, 0.16, 1.3, 0.16, c.clone().multiplyScalar(0.8));
      let any = false;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const nt = tileAt(x + dx, y + dy), link = nt === T_FENCE || nt === T_ROOF || (nt === T_WALL && bIdx[(y + dy) * W + x + dx] >= 0);
        if (!link) continue; any = true;
        if (nt === T_FENCE && (dx < 0 || dy < 0)) continue;  // the neighbour draws it
        const len = nt === T_FENCE ? 2 : 1;
        S.box(wx + dx * len / 2, 0.12, wz + dy * len / 2, dx ? len : 0.05, 0.98, dy ? len : 0.05, c, { grad: 0.85 });
        S.box(wx + dx * len / 2, 1.1, wz + dy * len / 2, dx ? len : 0.08, 0.06, dy ? len : 0.08, c.clone().multiplyScalar(0.85));
      }
      if (!any) S.box(wx, 0.12, wz, 1.2, 0.98, 0.05, c);
    }
  }
  /* docks containers and cranes, silos, hay, fuel tanks, fallen logs, boats, the hunting stand */
  const TALL = 94; // bid for tall outdoor props: never cut away (no building has it), but the see-through hole applies
  const CONT_COL = [0x8a3a2a, 0x2a4a6a, 0x4a6a3a, 0x9a7a2a, 0x6a6a68, 0x7a4a2a];
  function buildDecos() {
    for (const d of WORLD.decos || []) {
      const cx = (d.x + d.w / 2) * 2, cz = (d.y + d.h / 2) * 2, horiz = d.w >= d.h, onWater = baseAt(d.x, d.y) === 2;
      if (d.kind === 'container') {
        for (let s = 0; s < (d.stack || 1); s++) S.add(DKIT.container(), M(cx + rf(-0.08, 0.08), s * 2.55, cz + rf(-0.08, 0.08), (horiz ? 0 : Math.PI / 2) + rf(-0.03, 0.03), 1, 1, 1), col(CONT_COL[((d.c || 0) + s * 2) % CONT_COL.length], 0.12), { bid: TALL });
      } else if (d.kind === 'crane') {
        const X0 = d.x * 2 + 1, X1 = (d.x + d.w - 1) * 2 + 1, Z0 = d.y * 2 + 1, Z1 = (d.y + d.h - 1) * 2 + 1, Hc = 15, yc = col(0xb08a2a, 0.08), dk = col(0x4a4038), T = { bid: TALL }, TG = { bid: TALL, grad: 0.7 };
        for (const [x, z] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) { S.box(x, 0, z, 0.9, Hc, 0.9, yc, TG); S.box(x, 0, z, 1.4, 0.5, 1.4, dk, T); }
        for (const z of [Z0, Z1]) { S.box((X0 + X1) / 2, Hc, z, X1 - X0 + 1.2, 1.1, 1.0, yc, T); S.beam(X0, 2.5, z, X1, Hc - 0.5, z, 0.25, yc, T); }
        for (const x of [X0, X1]) S.box(x, Hc, (Z0 + Z1) / 2, 1.0, 1.1, Z1 - Z0 + 1.0, yc, T);
        S.box((X0 + X1) / 2, Hc + 1.1, (Z0 + Z1) / 2, X1 - X0 + 1.4, 0.8, 1.2, yc, T);
        S.box((X0 + X1) / 2 + 1, Hc - 1.6, (Z0 + Z1) / 2, 2.0, 1.6, 1.8, col(0x8a8a84), T);
        S.box((X0 + X1) / 2 + 1, Hc - 1.4, (Z0 + Z1) / 2 + 0.92, 1.6, 0.8, 0.04, col(PAL.glass), T);
        S.beam((X0 + X1) / 2 + 1, Hc - 1.7, (Z0 + Z1) / 2, (X0 + X1) / 2 + 1, 3.0, (Z0 + Z1) / 2, 0.05, dk, T);
        S.box((X0 + X1) / 2 + 1, 2.6, (Z0 + Z1) / 2, 1.2, 0.4, 2.4, dk, T);
      } else if (d.kind === 'silo') S.add(DKIT.silo(), M(cx, 0, cz, rr() * 6, 1, 1, 1), col(0xffffff, 0.08), { bid: TALL });
      else if (d.kind === 'tank') S.add(DKIT.tank(), M(cx, 0, cz, rr() * 6, 1, 1, 1), col(0xffffff, 0.08), { bid: TALL });
      else if (d.kind === 'hay') S.add(DKIT.hay(), M(cx, 0, cz, rr() * 6, 1, 1, 1), col(0xffffff, 0.12));
      else if (d.kind === 'log') S.add(DKIT.log(), M(cx, 0, cz, (horiz ? 0 : Math.PI / 2) + rf(-0.3, 0.3), 1, 1, 1), col(0xffffff, 0.12));
      else if (d.kind === 'boat') S.add(DKIT.boat(Math.max(d.w, d.h)), M(cx, onWater ? -0.62 : -0.1, cz, (horiz ? 0 : Math.PI / 2) + rf(-0.2, 0.2), 1, 1, 1, rf(-0.05, 0.05), onWater ? rf(-0.03, 0.03) : rf(0.1, 0.2)), null);
      else if (d.kind === 'stand') S.add(DKIT.stand(), M(cx, 0, cz, rr() * 6, 1, 1, 1), null);
    }
    /* boardwalks and piers: planks on posts (over the flood and the harbour) */
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tileAt(x, y); if (t !== T_PLANK && !(t === T_PROP && [T_PLANK].includes(tileAt(x, y + 1)))) continue;
      const wx = (x + 0.5) * 2, wz = (y + 0.5) * 2, hz = tileAt(x - 1, y) === T_PLANK || tileAt(x + 1, y) === T_PLANK;
      for (let k = 0; k < 5; k++) S.box(hz ? wx - 0.8 + k * 0.4 : wx, 0.22, hz ? wz : wz - 0.8 + k * 0.4, hz ? 0.36 : 1.8, 0.08, hz ? 1.8 : 0.36, col(rpick([0x6a5238, 0x5a4430, 0x7a6044]), 0.12), { ry: rf(-0.03, 0.03) });
      for (const s of [-0.75, 0.75]) S.box(hz ? wx : wx + s, -1.3, hz ? wz + s : wz, 0.16, 1.55, 0.16, col(0x3a2e22));
    }
  }
  /* burning barrels and camp fires (engine places them: WORLD.fires) */
  function buildFires() { for (const f of WORLD.fires || []) addFire(f.x * 2 + rf(-0.3, 0.3), f.y * 2, f.kind); }
  /* story gates: real props on the roads into the gated districts; rebuilt when one opens */
  function buildGates() {
    if (gateMesh) { root.remove(gateMesh); gateMesh.geometry.dispose(); gateMesh = null; }
    const B = new Bld(), saveR = rr; rr = seeded((((G && G.seed) || 1) ^ 0x6a7e5) >>> 0);
    const gs = WORLD.gates || {}, rock = () => col(rpick([0x6a665c, 0x5a564e, 0x77736a]), 0.12);
    for (const id in gs) {
      const g = gs[id], open = !!(G && G.flags && G.flags['open_' + id]);
      const X0 = g.x0 * 2, Z0 = g.y0 * 2, X1 = (g.x1 + 1) * 2, Z1 = (g.y1 + 1) * 2, cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
      if (g.kind === 'rubble') {
        if (!open) {
          for (let i = 0; i < 12; i++) { const s = rf(0.9, 2.1); B.geo(rr() < 0.5 ? G_DOD : G_ICO, rf(X0 + 0.3, X1 - 0.3), s * rf(0.25, 0.6), rf(Z0 + 0.3, Z1 - 0.3), s, s * rf(0.6, 1.1), s, rock(), { ry: rr() * 6 }); }
          for (const [a, b2] of [[-1, 0.4], [1, -0.5]]) B.geo(G_CYL8, cx + a * 0.6, 1.4 + rr() * 0.4, cz + a * 0.3, 0.5, 8, 0.5, col(0x3a2e22), { rz: Math.PI / 2 - 0.15 * a, ry: b2 });
          B.geo(G_CONE7, cx + 2.4, 1.6, cz - 0.6, 2.6, 2.2, 2.6, col(0x2e3a2a), { rz: 1.4, ry: 0.4 });
        } else {
          for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const s = rf(0.8, 1.5); B.geo(G_DOD, sx < 0 ? X0 - rf(0.4, 1.4) : X1 + rf(0.4, 1.4), s * 0.35, rf(Z0, Z1), s, s * 0.8, s, rock(), { ry: rr() * 6 }); }
          B.geo(G_CYL8, X0 - 1.2, 0.3, cz, 0.5, 3.2, 0.5, col(0x3a2e22), { rx: Math.PI / 2, ry: 0.2 }); B.geo(G_CYL8, X1 + 1.2, 0.3, cz + 0.5, 0.5, 2.8, 0.5, col(0x3a2e22), { rx: Math.PI / 2, ry: -0.3 });
        }
      } else if (g.kind === 'toll') {
        const red = col(0x8a2a1c), wht = col(0xb8b0a0), drum = () => col(rpick([0x5a3422, 0x2e3a2e, 0x3a3a3a]), 0.1);
        /* the shack and the black flag stay; the barrier and the drums move */
        B.box(X1 + 1.6, 0, cz, 2.2, 2.5, 2.2, col(0x4a4440), { grad: 0.7 }); B.box(X1 + 1.6, 2.5, cz, 2.6, 0.12, 2.6, col(PAL.rust));
        B.box(X1 + 0.48, 1.2, cz, 0.04, 0.7, 1.2, col(PAL.glass));
        B.geo(G_CYL6, X0 - 1.0, 3, cz - 0.6, 0.14, 6, 0.14, col(0x2a2826)); B.box(X0 - 0.25, 5.2, cz - 0.6, 1.4, 0.95, 0.05, col(0x121010));
        B.geo(G_CYL8, X0 - 0.6, 0.55, cz + 0.7, 0.62, 1.1, 0.62, drum());
        if (!open) {
          for (let i = 0; i < 4; i++) B.geo(G_CYL8, X0 + 0.5 + i * ((X1 - X0 - 1) / 3), 0.45, cz + rf(-0.3, 0.3), 0.66, 0.9, 0.66, drum());
          for (let i = 0; i < 6; i++) B.beam(X0 - 0.4 + i * 0.85, 1.25, cz, X0 + 0.45 + i * 0.85, 1.25, cz, 0.16, i % 2 ? wht : red);
          for (let i = 0; i < 3; i++) B.geo(G_TOR, X0 + 0.8 + i * 1.2, 0.3, cz + 1.4, 1.5, 1.5, 1.5, col(0x3a3a38), { rx: Math.PI / 2, ry: rr() });
          for (let k = 0; k < 5; k++) B.geo(G_CONE5, X0 + 0.4 + k * 0.8, 1.6, cz, 0.12, 0.45, 0.12, col(PAL.rust));
        } else {
          for (let i = 0; i < 6; i++) B.beam(X0 - 0.4, 1.25 + i * 0.85, cz, X0 - 0.4, 1.25 + (i + 1) * 0.85, cz, 0.16, i % 2 ? wht : red);
          for (let i = 0; i < 3; i++) B.geo(G_CYL8, X1 + 0.6 + rr() * 0.6, 0.45, cz + 1.6 - i * 0.9, 0.66, 0.9, 0.66, drum());
        }
      } else if (g.kind === 'bridge') {
        /* the river bridge: the middle span fell in; Marcus's people laid scaffold planks across */
        const deck = col(0x403e3a), side = col(0x6a665e), mid0 = X0 + 2, mid1 = X1 - 2;
        for (const [a, b2] of [[X0, mid0], [mid1, X1]]) B.box((a + b2) / 2, -0.6, cz, b2 - a, 0.6, Z1 - Z0, null, { fc: [side, side, deck, col(PAL.dark), side, side] });
        for (const pz of [Z0 + 1, Z1 - 1]) for (const px of [X0 + 1, X1 - 1]) B.geo(G_CYL8, px, -0.95, pz, 0.8, 0.7, 0.8, col(0x5e5a52));
        for (const ez of [Z0 + 0.12, Z1 - 0.12]) for (const [a, b2] of [[X0 - 0.6, mid0], [mid1, X1 + 0.6]]) {
          B.box((a + b2) / 2, 0, ez, b2 - a, 0.22, 0.24, col(0x7a766e));
          for (let x = a + 0.1; x <= b2; x += 1.0) if (rr() < 0.85) B.box(x, 0.2, ez, 0.08, 0.85, 0.08, col(PAL.rust, 0.2));
        }
        if (!open) {
          for (const [x, s] of [[mid0, 1], [mid1, -1]]) {
            B.geo(G_BOX, x + s * 0.7, -0.9, cz + rf(-0.6, 0.6), 1.6, 0.4, Z1 - Z0 - 0.6, deck, { rz: -s * 0.7 });
            for (let i = 0; i < 4; i++) B.beam(x, -0.4, Z0 + 0.6 + i * 0.9, x + s * rf(0.6, 1.2), rf(-0.2, 0.4), Z0 + 0.6 + i * 0.9 + rf(-0.3, 0.3), 0.05, col(PAL.rust));
          }
          B.geo(G_BOX, cx, -1.1, cz, 1.6, 0.4, 2.2, deck, { rx: 0.5, rz: 0.3 });
        } else {
          for (let i = 0; i < 9; i++) B.box(cx, 0.02, Z0 + 0.3 + i * 0.42, mid1 - mid0 + 1.2, 0.08, 0.36, col(rpick([0x7a6a4a, 0x6a5a3c]), 0.1));
          for (const ez of [Z0 + 0.2, Z1 - 0.2]) { B.box(cx, 0.1, ez, 0.12, 1.1, 0.12, col(PAL.wood2)); B.beam(mid0, 1.0, ez, mid1, 1.0, ez, 0.04, col(0x8a7a5a)); }
          B.box(mid0 - 0.4, 0.05, cz, 0.6, 0.4, 1.2, col(PAL.sand));
        }
      }
    }
    rr = saveR;
    if (!B.count) return;
    gateMesh = new THREE.Mesh(B.geometry(), mats.solid); gateMesh.castShadow = gateMesh.receiveShadow = true; root.add(gateMesh);
  }
  const GATE_HINT = { forest: 'A rockfall buries the forest road. Kessler Woods are cut off for now.', docks: 'The bridge span lies in the river. The Docks are out of reach for now.', pass: 'A Tollmen barrier closes the north road. The Pass is not open to you yet.' };
  const gateFlags = () => Object.keys((WORLD && WORLD.gates) || {}).map(id => (G && G.flags && G.flags['open_' + id]) ? 1 : 0).join('');
  /* puddles on roads and yards: invisible when dry, glossy in the rain */
  function buildPuddles() {
    const list = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = tileAt(x, y), b = gbio(x, y);
      if (!(isRoadT(t) || t === T_YARD || t === T_PATH) || b === 'pass' || rr() > (t === T_PATH ? 0.12 : 0.07)) continue;
      list.push(mcopy((x + 0.5) * 2 + rf(-0.6, 0.6), 0.02, (y + 0.5) * 2 + rf(-0.6, 0.6), rr() * 6, rf(0.6, 1.4), 1, rf(0.4, 0.9)));
    }
    if (!list.length) return;
    const g = own(new THREE.CircleGeometry(1, 10)); g.rotateX(-Math.PI / 2);
    puddles = new THREE.InstancedMesh(g, mats.puddle, list.length);
    list.forEach((m, i) => puddles.setMatrixAt(i, m)); puddles.renderOrder = 1; puddles.visible = false; root.add(puddles);
  }
  /* per-tile nature class for natureNear: 1 tree, 2 bush, 3 water, 4 reeds */
  function buildNature() {
    natCls = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, t = WORLD.tiles[i], fv = WORLD.flora ? WORLD.flora[i] : 0, b = baseAt(x, y);
      natCls[i] = t === T_TREE ? 1 : t === T_BUSH ? 2 : (b > 0 || t === T_WATER) ? 3 : fv === FLORA.REED ? 4 : 0;
    }
  }

  /* ================================================================ interaction props: notes, bodies, pumps, beds; crows ================================================================ */
  /* engine placeProps puts them: notes on walls by story places, bodies on streets and indoors, hand pumps in parks and farms, beds in homes.
     Notes, pumps and beds go into the merged static chunks (no extra draw calls); bodies get one mesh of their own so a search can darken one;
     crows are one InstancedMesh that gathers round the outdoor bodies near the player by day. */
  let bodyGeo = null, bodyR = {}, crowMesh = null, crows = [], crowT = 0;
  const PUMP = () => kit('pump', b => {
    const iron = col(0x2e3a30, 0.1), dk = col(0x1e2420);
    b.box(0, 0, 0, 0.9, 0.16, 0.9, col(0x7a766c, 0.1));
    b.geo(G_CYL8, 0, 0.75, 0, 0.26, 1.2, 0.26, iron, { grad: 0.6 });
    b.geo(G_CYL8, 0, 1.4, 0, 0.36, 0.14, 0.36, dk);
    b.geo(G_CONE5, 0, 1.52, 0, 0.3, 0.14, 0.3, iron);
    b.box(0, 1.0, 0.24, 0.1, 0.1, 0.4, iron); b.box(0, 0.92, 0.42, 0.1, 0.14, 0.08, dk);
    b.beam(0, 1.46, -0.08, 0.0, 1.62, -0.75, 0.06, iron); b.geo(G_CYL6, 0, 1.62, -0.78, 0.09, 0.2, 0.09, col(0x4a3a2a), { rx: Math.PI / 2 });
    b.geo(G_CYL12, 0, 0.17, 0.55, 0.62, 0.22, 0.62, col(0x5a5c58, 0.1)); b.geo(G_CYL12, 0, 0.27, 0.55, 0.5, 0.02, 0.5, col(0x2a3438));
  });
  const BEDK = {
    bed: () => kit('bed', b => {
      const wd = col(0x4e3a28, 0.1);
      b.box(0, 0, 0, 1.15, 0.32, 1.95, wd); b.box(0, 0, -0.94, 1.15, 0.85, 0.08, wd);
      b.box(0, 0.32, 0.03, 1.05, 0.16, 1.82, col(0xa8a090, 0.1));
      b.box(0, 0.48, -0.7, 0.8, 0.12, 0.34, col(0xc8c2b4, 0.1), { rz: 0.05 });
      b.box(0.02, 0.48, 0.3, 1.1, 0.1, 1.15, col(rpick([0x5a3a34, 0x3a4a5a, 0x5a5a3a, 0x6a5a48]), 0.12), { ry: rf(-0.12, 0.12), rz: rf(-0.04, 0.04) });
    }),
    couch: () => kit('couch', b => {
      const c = col(rpick([0x5a4632, 0x4a3a3a, 0x3e4a44, 0x6a5440]), 0.1), d = c.clone().multiplyScalar(0.8);
      b.box(0, 0.08, 0, 1.85, 0.36, 0.85, c); b.box(0, 0.08, -0.36, 1.85, 0.85, 0.2, d);
      for (const x of [-0.86, 0.86]) b.box(x, 0.08, 0.02, 0.18, 0.62, 0.85, d);
      for (const x of [-0.42, 0.42]) b.box(x, 0.44, 0.06, 0.8, 0.12, 0.66, c.clone().multiplyScalar(1.08), { rz: rf(-0.04, 0.04) });
      for (const [x, z] of [[-0.82, -0.36], [0.82, -0.36], [-0.82, 0.36], [0.82, 0.36]]) b.box(x, 0, z, 0.08, 0.08, 0.08, col(0x1e1a16));
    }),
    cot: () => kit('cot', b => {
      const fr = col(0x3a3c36), cv = col(0x55603e, 0.1);
      for (const x of [-0.42, 0.42]) b.box(x, 0.38, 0, 0.05, 0.05, 1.9, fr);
      for (const z of [-0.8, 0.8]) { b.beam(-0.42, 0, z - 0.15, 0.42, 0.4, z + 0.15, 0.04, fr); b.beam(0.42, 0, z - 0.15, -0.42, 0.4, z + 0.15, 0.04, fr); }
      b.box(0, 0.4, 0, 0.84, 0.04, 1.85, cv); b.box(0, 0.44, 0.2, 0.86, 0.06, 1.0, col(0x4a4a42, 0.15), { ry: rf(-0.15, 0.15) });
    }),
  };
  /* a body lying on its back along local x, head at +x; coat colour, skin and pose vary */
  function bodyParts(B, m, inside) {
    m = m.clone();
    const coat = col(rpick([0x3a3430, 0x2e3440, 0x4a3e2e, 0x3e2a2a, 0x353a2e, 0x5a4a3a]), 0.15), trousers = col(rpick([0x26282c, 0x3a3a36, 0x2a3040]), 0.1);
    const skin = col(rpick([0x8a8a72, 0x7a7462, 0x9a8a74]), 0.1), boot = col(0x1c1a18);
    const T = new Bld(), sp = rf(-0.25, 0.25);
    T.box(0.15, 0, 0, 0.8, 0.26, 0.5, coat);
    T.box(-0.5, 0, -0.12 + sp * 0.3, 0.75, 0.18, 0.19, trousers, { ry: sp * 0.4 }); T.box(-0.5, 0, 0.12, 0.75, 0.18, 0.19, trousers, { ry: -0.15 });
    T.box(-0.92, 0, -0.14 + sp * 0.5, 0.2, 0.2, 0.17, boot); T.box(-0.92, 0, 0.16, 0.2, 0.2, 0.17, boot);
    T.geo(G_ICO, 0.72, 0.13, 0.04, 0.27, 0.24, 0.27, skin);
    T.box(0.32, 0, -0.38, 0.55, 0.13, 0.14, coat, { ry: 0.5 + sp }); T.box(0.1, 0, 0.36, 0.5, 0.13, 0.14, coat, { ry: -0.35 });
    T.geo(G_ICO, -0.12, 0.05, 0.52, 0.14, 0.09, 0.14, skin);
    B.add(T.geometry(), m, WHITE);
    /* a dark stain under it (ground, never changes) */
    const e = m.elements; GD.geo(G_CYL8, e[12] + rf(-0.2, 0.2), 0.008, e[14] + rf(-0.2, 0.2), rf(1.3, 1.8), 0.008, rf(0.9, 1.3), col(inside ? 0x221c18 : 0x2a1e18), { ry: rf(0, 3) });
  }
  function buildInteractProps() {
    /* notes: spray paint on the wall plus a pinned paper, on the face the note tile looks at */
    for (const n of WORLD.notes || []) {
      const fx = (n.x + 0.5) * 2 + n.fx * 0.99, fz = (n.y + 0.5) * 2 + n.fy * 0.99, nx = -n.fx, nz = -n.fy, ry = Math.atan2(nx, nz);
      const at = (along, h, d) => [fx + nx * d + nz * along, h, fz + nz * d - nx * along];
      const paint = col(n.place ? rpick([0xe8e0d0, 0xb83a2a, 0xd8b040]) : rpick([0xb83a2a, 0xe8e0d0, 0x3a7a9a, 0x6a9a3a]), 0.1);
      for (let i = 0; i < 4; i++) { const [x, y, z] = at(rf(-0.8, 0.5) + i * 0.15, rf(1.3, 2.1), 0.04); S.geo(G_BOX, x, y, z, rf(0.3, 0.8), rf(0.06, 0.12), 0.02, paint, { ry, rz: rf(-0.35, 0.35) }); }
      if (n.place) {
        const [x, y, z] = at(rf(0.2, 0.5), 1.25, 0.05); S.geo(G_BOX, x, y, z, 0.42, 0.56, 0.015, col(0xd8d0bc, 0.1), { ry, rz: rf(-0.12, 0.12) });
        for (let k = 0; k < 4; k++) { const [a, b2, c] = at(rf(0.25, 0.45), 1.4 - k * 0.09, 0.062); S.geo(G_BOX, a, b2, c, 0.28, 0.02, 0.01, col(0x2a2622), { ry }); }
      }
    }
    /* hand pumps, spout towards the open side */
    for (const p of WORLD.pumps || []) {
      const o = [[0, 1], [1, 0], [-1, 0], [0, -1]].find(([a, b]) => !SOLID.has(tileAt(p.x + a, p.y + b))) || [0, 1];
      S.add(PUMP(), M((p.x + 0.5) * 2, 0, (p.y + 0.5) * 2, Math.atan2(o[0], o[1]) + rf(-0.15, 0.15), 1, 1, 1), null);
    }
    /* beds, couches and cots: the head (or the back) against the wall */
    for (const b of WORLD.beds || []) {
      const K = BEDK[b.kind] || BEDK.bed, ry = Math.atan2(-b.fx, -b.fy), back = b.kind === 'couch' ? 0.5 : 0;
      S.add(K(), M((b.x + 0.5) * 2 + b.fx * back, 0, (b.y + 0.5) * 2 + b.fy * back, ry + rf(-0.04, 0.04), 1, 1, 1), null);
    }
    /* bodies: one mesh, a vertex range each so setBodySearched can darken one */
    const BB = new Bld(); bodyR = {};
    for (const b of WORLD.bodies || []) {
      const s = BB.count; bodyParts(BB, M((b.x + 0.5) * 2 + rf(-0.3, 0.3), 0, (b.y + 0.5) * 2 + rf(-0.3, 0.3), b.r * Math.PI / 2 + rf(-0.5, 0.5), 1, 1, 1), b.in);
      bodyR[b.x + ',' + b.y] = { s, n: BB.count - s, b, searched: false };
    }
    if (BB.count) {
      bodyGeo = own(BB.geometry());
      for (const k in bodyR) { const r = bodyR[k]; r.col = bodyGeo.attributes.color.array.slice(r.s * 3, (r.s + r.n) * 3); }
      const mesh = new THREE.Mesh(bodyGeo, mats.cont); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
      const done = (G && G.bodies) || {}; for (const k in done) if (bodyR[k]) self.setBodySearched(bodyR[k].b, true, true);
    }
    /* crows: a little flock of black birds, one draw call */
    const cb = new Bld(), blk = col(0x141416), bk = col(0x3a3020);
    cb.box(0, 0.08, 0, 0.16, 0.13, 0.3, blk); cb.geo(G_ICO, 0, 0.23, 0.15, 0.13, 0.12, 0.13, blk); cb.geo(G_CONE5, 0, 0.23, 0.26, 0.05, 0.1, 0.05, bk, { rx: Math.PI / 2 });
    cb.box(0, 0.1, -0.2, 0.12, 0.03, 0.16, blk, { rx: -0.3 }); for (const x of [-0.11, 0.11]) cb.box(x, 0.13, -0.02, 0.05, 0.08, 0.26, blk);
    for (const x of [-0.04, 0.04]) cb.box(x, 0, 0.02, 0.015, 0.06, 0.015, bk);
    crowMesh = new THREE.InstancedMesh(own(cb.geometry()), mats.inst, 18); crowMesh.count = 0; crowMesh.castShadow = true; crowMesh.frustumCulled = false; root.add(crowMesh);
    crows = []; crowT = 0;
  }
  /* crows settle on the outdoor bodies near the player by day; they lift off and circle away when you come close, and drift back later */
  function updateCrows(dt, px, py) {
    if (!crowMesh) return;
    const hour = G ? G.hour + (G.minute || 0) / 60 : 12, day = hour >= 6 && hour < 19.5, wx = typeof weatherAt === 'function' && G ? weatherAt(px, py) : '', bad = /storm|blizzard/.test(wx || '') || (G && G.storm);
    crowT -= dt;
    if (crowT <= 0) {
      crowT = 1.5;
      const want = day && !bad && px != null ? (WORLD.bodies || []).filter(b => !b.in && Math.hypot(b.x + 0.5 - px, b.y + 0.5 - py) < 26).sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py)).slice(0, 6) : [];
      for (const c of crows) if (!want.includes(c.b) && c.mode !== 'gone') { c.mode = 'fly'; c.leave = true; }
      for (const b of want) {
        const have = crows.filter(c => c.b === b && !c.leave).length, n = 2 + ((b.x * 7 + b.y * 3) % 2);
        for (let i = have; i < n && crows.length < 18; i++) {
          const a = rr() * 6.28, hx = (b.x + 0.5) * 2 + Math.cos(a) * rf(0.6, 1.4), hz = (b.y + 0.5) * 2 + Math.sin(a) * rf(0.6, 1.4);
          crows.push({ b, hx, hz, x: hx + rf(-12, 12), y: 14, z: hz + rf(-12, 12), ry: rr() * 6, mode: 'land', t: 0, peck: rr() * 3, rest: 0 });
        }
      }
    }
    const P = px != null ? [px * 2, py * 2] : null;
    for (let i = crows.length - 1; i >= 0; i--) {
      const c = crows[i]; c.t += dt;
      const close = P && Math.hypot(c.hx - P[0], c.hz - P[1]) < 10;
      if ((c.mode === 'ground' || c.mode === 'land') && close) { c.mode = 'fly'; c.flee = true; c.vx = (c.x - P[0]) || 1; c.vz = (c.z - P[1]) || 1; const l = Math.hypot(c.vx, c.vz); c.vx /= l; c.vz /= l; c.t = 0; self.crowsFlushed = tAcc; }
      if (c.mode === 'land') {
        const dx = c.hx - c.x, dz = c.hz - c.z, d = Math.hypot(dx, dz), sp = Math.min(d, 7 * dt);
        if (d > 0.05) { c.x += dx / d * sp; c.z += dz / d * sp; c.ry = Math.atan2(dx, dz); }
        c.y = Math.max(0, c.y - Math.max(2.5, c.y * 1.2) * dt * (d < 3 ? 1.6 : 0.4));
        if (d < 0.1 && c.y <= 0.01) { c.mode = 'ground'; c.y = 0; }
      } else if (c.mode === 'ground') {
        c.peck -= dt;
        if (c.peck <= 0) { c.peck = rf(0.6, 2.6); if (rr() < 0.35) { const a = rr() * 6.28; c.hx = (c.b.x + 0.5) * 2 + Math.cos(a) * rf(0.5, 1.4); c.hz = (c.b.y + 0.5) * 2 + Math.sin(a) * rf(0.5, 1.4); c.mode = 'land'; c.y = 0.25; } else c.ry += rf(-1.2, 1.2); }
      } else if (c.mode === 'fly') {
        if (c.flee) { c.x += c.vx * 9 * dt; c.z += c.vz * 9 * dt; c.y += 5 * dt; c.ry = Math.atan2(c.vx, c.vz); const a = c.t * 1.4; c.vx = c.vx * 0.99 + Math.cos(a) * 0.012; c.vz = c.vz * 0.99 + Math.sin(a) * 0.012; }
        else { c.y += 6 * dt; c.x += Math.sin(c.ry) * 8 * dt; c.z += Math.cos(c.ry) * 8 * dt; }
        if (c.y > 16) { if (c.leave || !P) { crows.splice(i, 1); continue; } c.mode = 'gone'; c.rest = rf(14, 30); }
      } else if (c.mode === 'gone') {
        c.rest -= dt;
        if (c.leave) { crows.splice(i, 1); continue; }
        if (c.rest <= 0 && !close && !(P && Math.hypot(c.hx - P[0], c.hz - P[1]) < 16)) { c.mode = 'land'; c.flee = false; c.y = 14; }
      }
    }
    let n = 0;
    for (const c of crows) {
      if (c.mode === 'gone') continue;
      const air = c.mode !== 'ground' && c.y > 0.05, bob = c.mode === 'ground' && c.peck < 0.25 ? 0.35 : 0, flap = air ? Math.sin(tAcc * 26 + c.hx) * 0.5 : 0;
      crowMesh.setMatrixAt(n++, M(c.x, c.y + (air ? Math.abs(flap) * 0.08 : 0), c.z, c.ry, air ? 1.5 + flap * 0.4 : 1, 1, 1, bob, 0));
    }
    crowMesh.count = n; crowMesh.instanceMatrix.needsUpdate = true;
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
        /* tidy rows: cabbages in front, beans up their canes behind */
        for (let c = 0; c < 5; c++) B.geo(G_ICO, bx - 0.3 + c * 0.45, 0.36 + 0.04 * lv, bz + 0.35, 0.28 + 0.06 * lv, 0.2 + 0.06 * lv, 0.28 + 0.06 * lv, col(rpick(green), 0.15), { ry: rf(0, 3) });
        for (let c = 0; c < 4; c++) { const px = bx - 0.15 + c * 0.5; B.box(px, 0.3, bz - 0.3, 0.04, 0.6 + 0.25 * lv, 0.04, col(PAL.wood2)); B.geo(G_CONE5, px, 0.45 + 0.12 * lv, bz - 0.3, 0.26, 0.3 + 0.22 * lv, 0.26, col(rpick(green), 0.2), { ry: rf(0, 3) }); }
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
      chunkMap = {}; carAt = {}; heights = []; fires = this.fires = []; markers = {}; gtCache = null;
      bIdx = new Int16Array(W * H).fill(-1);
      WORLD.roofs.forEach((r, i) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x >= 0 && y >= 0 && x < W && y < H) bIdx[y * W + x] = i; });
      const lampSpots = [];
      buildGround();
      buildStreets(lampSpots);
      buildDetails();
      WORLD.roofs.forEach((r, i) => building(r, i));
      buildBunker(); buildCamp(); buildRiver(); buildRocks(); buildFences(); buildDecos(); buildFires();
      buildFlora(); buildOutskirts();
      buildProps(lampSpots);
      buildContainers();
      buildInteractProps();
      for (const k in chunkMap) {
        const b = chunkMap[k]; if (!b.count) continue;
        const cat = k[0], mat = cat === 's' ? mats.solid : cat === 'f' ? mats.foliage : cat === 'h' ? mats.herb : cat === 'w' ? mats.still : mats.ground;
        const mesh = new THREE.Mesh(own(b.geometry()), mat);
        mesh.castShadow = cat === 's' || cat === 'f'; mesh.receiveShadow = cat !== 'w';
        if (cat === 'f') mesh.customDepthMaterial = mats.fdepth;
        if (cat === 'w') mesh.renderOrder = 1;
        root.add(mesh);
      }
      chunkMap = {};
      buildBus(); buildGates(); gateKey = gateFlags(); buildPuddles(); buildNature();
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
      owned = []; root = this.group = null; shelterGroup = null; bodyGeo = null; bodyR = {}; crowMesh = null; crows = []; busMesh = null; lampPools = firePools = null; ghostMesh = ghostIcons = null; ghostSlots = []; gateMesh = null; puddles = null;
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
      this._animate(dt);
      updateCrows(dt, px, py);
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
      /* bus repaired? a story gate opened? */
      if (G && G.flags && busReady !== !!G.flags.bus_ready) buildBus();
      gateT -= dt;
      if (gateT <= 0) {
        gateT = 0.5; const gk = gateFlags(); if (gk !== gateKey) this.refreshGates();
        /* walking up to a closed gate says why the way is shut */
        const gn = px != null && typeof gateNear === 'function' ? gateNear(px, py, 3.5) : null;
        if (gn && typeof hintOnce === 'function') hintOnce('gate_' + gn.id, GATE_HINT[gn.id] || 'The way is blocked. Not yet.');
      }
      /* weather on the water: puddles gloss in the rain, ponds skin over with ice as the snow settles */
      const E = (typeof R !== 'undefined' && R.env) || null;
      if (E) {
        const wet = E.uWet.value, snow = E.uSnow.value;
        if (puddles) { puddles.visible = wet > 0.03; mats.puddle.opacity = wet * 0.8 * (1 - snow); }
        mats.still.color.setRGB(1 + snow * 1.6, 1 + snow * 1.7, 1 + snow * 1.8); mats.still.opacity = 0.8 + snow * 0.15;
      }
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
        const pk = (typeof R !== 'undefined' && R.weatherK) ? Math.max(R.weatherK.rain, R.weatherK.snow) : 0;
        mats.ash.opacity = (0.55 - nk * 0.25) * (1 - pk);
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

    get busMesh() { return busMesh; },

    /* rebuild the gate props after openDistrict() (update() also notices on its own) */
    refreshGates() { if (!root || !WORLD) return; buildGates(); gateKey = gateFlags(); if (WORLD.tiles && natCls) buildNature(); },

    /* what grows, flows and burns near (x,y): counts within r tiles and the nearest of each, for ambience */
    natureNear(x, y, r) {
      r = clamp(r || 8, 1, 20);
      const out = { trees: 0, bushes: 0, reeds: 0, water: 0, fires: 0, biome: typeof biomeAt === 'function' ? biomeAt(x, y) : null, nearest: { tree: null, bush: null, water: null, fire: null } };
      if (!natCls) return out;
      const keys = [null, 'tree', 'bush', 'water', null], cnt = [null, 'trees', 'bushes', 'water', 'reeds'], r2 = r * r;
      for (let ty = Math.max(0, Math.floor(y - r)); ty <= Math.min(H - 1, Math.floor(y + r)); ty++) for (let tx = Math.max(0, Math.floor(x - r)); tx <= Math.min(W - 1, Math.floor(x + r)); tx++) {
        const c = natCls[ty * W + tx]; if (!c) continue;
        const d2 = (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2; if (d2 > r2) continue;
        out[cnt[c]]++;
        const k = keys[c]; if (k && (!out.nearest[k] || d2 < out.nearest[k].d * out.nearest[k].d)) out.nearest[k] = { x: tx + 0.5, y: ty + 0.5, d: Math.sqrt(d2) };
      }
      for (const f of fires) { const d2 = (f.x - x) ** 2 + (f.y - y) ** 2; if (d2 > r2) continue; out.fires++; if (!out.nearest.fire || d2 < out.nearest.fire.d ** 2) out.nearest.fire = { x: f.x, y: f.y, d: Math.sqrt(d2) }; }
      return out;
    },

    containerMesh(id) { const c = conts[id]; return c ? c.obj : null; },

    setContainerOpened(id, on) {
      const c = conts[id]; on = !!on; if (!c || c.opened === on) return;
      c.opened = on;
      if (c.lc) {
        if (on && c.openP.length === c.closedP.length) { const i = lidAnims.findIndex(a => a.c === c); if (i >= 0) lidAnims.splice(i, 1); lidAnims.push({ c, t: 0 }); }
        else { lidGeo.attributes.position.array.set(on ? c.openP : c.closedP, c.ls * 3); lidGeo.attributes.normal.array.set(on ? c.openN : c.closedN, c.ls * 3); lidGeo.attributes.position.needsUpdate = true; lidGeo.attributes.normal.needsUpdate = true; }
      }
      if (on) this.burst(c.c.x + 0.5, c.c.y + 0.5, 0x9a8a72, 6, 0.6);
      if (c.bc) { const a = contGeo.attributes.color.array, k = on ? 0.45 : 1; for (let i = 0; i < c.col.length; i++) a[c.bs * 3 + i] = c.col[i] * k; contGeo.attributes.color.needsUpdate = true; }
      if (hlState.kind === 'container' && hlState.id === id) this.highlight('container', id);
    },

    /* a searched body: darker, a little dust */
    setBodySearched(b, on, quiet) {
      const r = b && bodyR[b.x + ',' + b.y]; on = !!on; if (!r || !bodyGeo || r.searched === on) return;
      r.searched = on; const a = bodyGeo.attributes.color.array, k = on ? 0.55 : 1;
      for (let i = 0; i < r.col.length; i++) a[r.s * 3 + i] = r.col[i] * k;
      bodyGeo.attributes.color.needsUpdate = true;
      if (on && !quiet) this.burst(b.x + 0.5, b.y + 0.5, 0x6a5a4a, 5, 0.5);
    },
    /* crows within r tiles of (x,y): on the ground, and how long since a flock last lifted off */
    crowsNear(x, y, r) {
      const out = { ground: [], air: 0, flushed: this.crowsFlushed != null ? tAcc - this.crowsFlushed : 99 };
      for (const c of crows) { const cx = c.x / 2, cy = c.z / 2; if (Math.hypot(cx - x, cy - y) > r) continue; if (c.mode === 'ground') out.ground.push({ x: cx, y: cy }); else if (c.mode !== 'gone') out.air++; }
      return out;
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
      const B = new Bld(), GB = new Bld(), NB = new Bld(); ghostSlots = [];
      const lvNow = {}; for (const k in BUILDINGS) lvNow[k] = bl(k);
      const fresh = k => prevLv && lvNow[k] > (prevLv[k] || 0);
      const newSpots = [];
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
          SLOT_MODELS[k](fresh(k) ? NB : B, X, Z, w, d, Math.min(lv, B0.max || 3));
          if (fresh(k)) newSpots.push({ x: (X + w / 2) / TILE, y: (Z + d / 2) / TILE, w: Math.max(w, d) / TILE });
          if (k === 'forge') fires.push({ x: (X + 0.9) / 2, y: (Z + d / 2 + 0.7) / 2, k: 0.6 });
          if (k === 'kitchen') fires.push({ x: (X + 1.0) / 2, y: (Z + d / 2) / 2, k: 0.6 });
        } else if (canShow && hiddenOK) ghost(k, X, Z, w, d, k === 'radio' ? 3.35 : 0);
      }
      rr = saveR;
      if (B.count) { const m = new THREE.Mesh(B.geometry(), mats.solid); B.b.fill(96); m.geometry.setAttribute('bid', new THREE.Float32BufferAttribute(B.b, 1)); m.castShadow = m.receiveShadow = true; sg.add(m); }
      /* a freshly built or upgraded structure rises out of the ground in a puff of dust */
      if (NB.count) {
        const m = new THREE.Mesh(NB.geometry(), mats.solid); NB.b.fill(96); m.geometry.setAttribute('bid', new THREE.Float32BufferAttribute(NB.b, 1)); m.castShadow = m.receiveShadow = true;
        m.scale.y = 0.02; sg.add(m); risers.push({ m, t: 0 });
        for (const sp of newSpots) { this.burst(sp.x, sp.y, 0xb0a48e, 14, sp.w * 0.7 + 0.6); }
        if (typeof R !== 'undefined' && R.shake && !(typeof UI !== 'undefined' && UI.reducedMotion)) R.shake(0.12);
      }
      prevLv = lvNow;
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

    /* burst(x, y, hex, n, spread): a short puff of particles at a tile point (dust when building or opening, embers on level-up) */
    burst(x, y, hex, n, spread) {
      if (!root) return;
      if (!burstGeo) burstGeo = new THREE.IcosahedronGeometry(0.09, 0);
      const mat = new THREE.MeshBasicMaterial({ color: hex == null ? 0xe8742c : hex, transparent: true, opacity: 0.85, depthWrite: false });
      const g = new THREE.Group(); g.position.set(x * TILE, 0.15, y * TILE); root.add(g);
      const parts = [];
      for (let i = 0; i < (n || 10); i++) {
        const m = new THREE.Mesh(burstGeo, mat); const a = Math.random() * Math.PI * 2, r = Math.random() * (spread || 1) * TILE * 0.5;
        m.position.set(Math.sin(a) * r, Math.random() * 0.3, Math.cos(a) * r);
        parts.push({ m, vx: Math.sin(a) * (0.4 + Math.random()), vy: 0.8 + Math.random() * 1.6, vz: Math.cos(a) * (0.4 + Math.random()) }); g.add(m);
      }
      bursts.push({ g, mat, parts, t: 0, life: 0.9 + Math.random() * 0.3 });
    },
    _animate(dt) {
      for (let i = lidAnims.length - 1; i >= 0; i--) {
        const a = lidAnims[i], c = a.c; a.t = Math.min(1, a.t + dt / 0.35);
        const k = 1 - Math.pow(1 - a.t, 3), P = lidGeo.attributes.position.array, N = lidGeo.attributes.normal.array, o = c.ls * 3;
        for (let j = 0; j < c.closedP.length; j++) { P[o + j] = c.closedP[j] + (c.openP[j] - c.closedP[j]) * k; N[o + j] = c.closedN[j] + (c.openN[j] - c.closedN[j]) * k; }
        lidGeo.attributes.position.needsUpdate = true; lidGeo.attributes.normal.needsUpdate = true;
        if (a.t >= 1) lidAnims.splice(i, 1);
      }
      for (let i = risers.length - 1; i >= 0; i--) {
        const r = risers[i]; r.t = Math.min(1, r.t + dt / 0.8); const k = r.t;
        r.m.scale.y = Math.max(0.02, 1 - Math.pow(1 - k, 3));
        if (r.t >= 1) { r.m.scale.y = 1; risers.splice(i, 1); }
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]; b.t += dt; const k = b.t / b.life;
        for (const p of b.parts) { p.vy -= 3.2 * dt; p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.02, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt; p.m.scale.setScalar(1 + k * 1.5); }
        b.mat.opacity = Math.max(0, 0.85 * (1 - k));
        if (k >= 1) { root.remove(b.g); b.mat.dispose(); bursts.splice(i, 1); }
      }
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
