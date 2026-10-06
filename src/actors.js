/* ===================== ACTORS: procedural low-poly models + code-driven animation =====================
   Actors.make(kind, opts) → actor
     kind: player | survivor | raider | tollman | warden | walker | runner | bloater | screamer | brute | dog
     opts: { tint: hex (survivor shirt), scale: multiplier }
   actor: { root, kind, height, anim(name, opts?), update(dt, speed), flash(hex?), die(), setAware(v|null), setCarry(itemId|null), dispose(),
            aiming (bool: hold a gun up while no action plays), dead, deadT, sunk (corpse has sunk away; safe to dispose), action }
   anim names: idle walk run crouch (locomotion, persistent) · attack lunge shoot hit roll (timed) · work scream grab held (loops) · die.
     anim('attack', {wind}) stretches the wind-up to the weapon's wind time. Locomotion names end any loop action.
   Extras (not in API.md): Actors.itemMesh(id) → Object3D for a pickup (weapons use their hand model), Actors.night (bool, eyes glow),
     anim names 'roll' (dodge), 'grab' (zombie holding the player), 'held' (player struggling in a grab).
   Rig: root (unscaled; combat positions/rotates it; awareness sprite lives here) → base (scaled; feet pivot for falls) → mid (hip-height pivot
   for rolls) → body → hips → torso → head / arms (shoulder → elbow → hand) and legs (hip → knee). Model faces +z; its right side is -x.
   Gestures (player / survivor / any human; Actors.GESTURES): they keep playing through locomotion calls ('idle'/'walk' every frame is fine)
     and stop when the actor actually moves (update speed > 0.6), on anim('stop'), or on any other action. Loops run until stopped.
       search (loop: kneel, reach in, rummage)   hammer (loop: kneel and hammer)   chat (loop: talking hand gestures, head turns)
       pickup 0.75 s (bend down and up)   eat / drink 1.6 s (hand to mouth)   bandage 2 s (wrap the forearm)   inspect 1.6 s (hold the weapon up)
       handshake 1.6 s   wave 1.8 s   cheer 1.6 s (arms up, level-up)   point 1.6 s (arm out ahead)
   Zombie idle variety: when a zombie stands still it picks sway / shuffle / still on its own; a suspicious one (setAware 0..1) slowly turns its
     head ('turn'). actor.mood(name|null) forces one: 'feed' (crouched over a body) | 'sway' | 'shuffle' | 'turn' | 'still'; opts.mood does the same.
   Deaths: die(variant?) — zombies pick at random: 0 fall back, 1 fall forward, 2 knees buckle and spin down. Humans fall back.
   Hard hits: anim('stagger') or anim('hit', {hard:true}) = a 0.6 s stumble back with flailing arms (combat: for big hits / crits). */
const Actors = (function () {
  const GEO = {}, SHARED = {};
  const geo = (key, fn) => GEO[key] || (GEO[key] = fn());
  /* box whose top face sits at y=0 (hangs down from a pivot), or centred when c */
  const hang = (w, h, d, oz) => geo(`h${w},${h},${d},${oz || 0}`, () => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, -h / 2, oz || 0); return g; });
  const up = (w, h, d, oz) => geo(`u${w},${h},${d},${oz || 0}`, () => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, oz || 0); return g; });
  const cbox = (w, h, d) => geo(`c${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  const ico = (r, det) => geo(`i${r},${det || 0}`, () => new THREE.IcosahedronGeometry(r, det || 0));
  const cyl = (r0, r1, h, seg) => geo(`y${r0},${r1},${h},${seg}`, () => { const g = new THREE.CylinderGeometry(r0, r1, h, seg || 6); g.translate(0, -h / 2, 0); return g; });
  const sharedMat = (hex, emis) => { const k = hex + '_' + (emis || 0); return SHARED[k] || (SHARED[k] = new THREE.MeshLambertMaterial({ color: hex, emissive: emis || 0, flatShading: true })); };
  let EYE = null;
  const eyeMat = () => EYE || (EYE = new THREE.MeshBasicMaterial({ color: 0x5a4a28, fog: false }));

  /* ---------- awareness sprites: grey→yellow "?" while suspicious, red "!" when aware ---------- */
  let AW = null;
  function awareMats() {
    if (AW) return AW;
    const mk = (ch, fill, ring) => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      x.font = '900 54px Impact, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 9; x.strokeStyle = 'rgba(10,8,6,0.9)'; x.strokeText(ch, 32, 35);
      if (ring) { x.lineWidth = 3; x.strokeStyle = fill; x.strokeText(ch, 32, 35); } else { x.fillStyle = fill; x.fillText(ch, 32, 35); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace || t.colorSpace;
      return new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true, fog: false });
    };
    AW = [mk('?', '#9a958c', true), mk('?', '#d9cf8a', true), mk('?', '#f2d23a', false), mk('?', '#ff9a2a', false), mk('!', '#ff3a26', false)];
    return AW;
  }

  /* ---------- hand-held items (shared geometry + materials) ---------- */
  const STEEL = 0xb8bcc0, DARK = 0x2a2a2c, WOOD = 0x8a5e36;
  function handItem(id) {
    const g = new THREE.Group(), add = (gm, hex, x, y, z, rx) => { const m = new THREE.Mesh(gm, sharedMat(hex)); m.position.set(x || 0, y || 0, z || 0); if (rx) m.rotation.x = rx; g.add(m); return m; };
    const it = (typeof ITEMS !== 'undefined' && ITEMS[id]) || null;
    let gun = false;
    switch (id) {
      case 'knife': add(hang(0.05, 0.11, 0.05), DARK); add(hang(0.025, 0.26, 0.05), STEEL, 0, -0.1); break;
      case 'pipe': add(cyl(0.035, 0.035, 0.95, 6), 0x7d7f80, 0, 0.12); break;
      case 'bat': add(cyl(0.028, 0.062, 0.9, 6), WOOD, 0, 0.12); add(cyl(0.07, 0.07, 0.14, 6), 0x5a5550, 0, -0.55); break;
      case 'machete': add(hang(0.05, 0.14, 0.05), DARK); add(hang(0.02, 0.58, 0.09, 0.02), STEEL, 0, -0.12); break;
      case 'axe': add(cyl(0.032, 0.032, 0.95, 5), WOOD, 0, 0.12); add(cbox(0.05, 0.12, 0.26), 0xa8281e, 0, -0.74, 0.08); add(cbox(0.03, 0.14, 0.06), STEEL, 0, -0.74, 0.23); break;
      case 'crowbar': add(cyl(0.025, 0.025, 0.85, 5), 0x8a2a20, 0, 0.1); add(cbox(0.04, 0.04, 0.16), 0x8a2a20, 0, -0.75, 0.07); break;
      case 'hammer': add(cyl(0.025, 0.025, 0.42, 5), WOOD, 0, 0.05); add(cbox(0.07, 0.07, 0.2), DARK, 0, -0.33, 0.03); break;
      case 'shovel': add(cyl(0.025, 0.025, 1.0, 5), WOOD, 0, 0.2); add(cbox(0.2, 0.26, 0.03), 0x6a6e70, 0, -0.9, 0); break;
      case 'pistol': gun = true; add(hang(0.06, 0.3, 0.09, 0.0), DARK, 0, 0.04); add(cbox(0.05, 0.08, 0.14), 0x3a3634, 0, 0.0, -0.07); break;
      case 'shotgun': gun = true; add(hang(0.06, 0.95, 0.07), DARK, 0, 0.3); add(hang(0.07, 0.36, 0.11), WOOD, 0, 0.42); add(hang(0.08, 0.2, 0.08), WOOD, 0, -0.25); break;
      case 'rifle': gun = true; add(hang(0.05, 1.05, 0.07), DARK, 0, 0.35); add(hang(0.07, 0.4, 0.12), WOOD, 0, 0.45); add(cbox(0.05, 0.16, 0.06), DARK, 0, -0.05, 0.08); break;
      case 'crossbow': gun = true; add(hang(0.07, 0.7, 0.08), WOOD, 0, 0.25); add(cbox(0.7, 0.04, 0.05), DARK, 0, -0.38, 0); break;
      default:
        if (it && it.ammo) { gun = true; add(hang(0.06, 0.6, 0.08), DARK, 0, 0.2); add(hang(0.07, 0.25, 0.1), WOOD, 0, 0.25); }
        else add(cyl(0.03, 0.04, 0.8, 5), WOOD, 0, 0.1);
    }
    g.userData.gun = gun;
    return g;
  }
  const CAT_COL = { food: 0xe8b04a, water: 0x4aa8ea, mat: 0xb08a5a, med: 0xe8504a, weapon: 0xe8742c, ammo: 0xe8d040, gear: 0x9a7aea, misc: 0xb0b0a8, story: 0xffe070 };
  function itemMesh(id) {
    const it = (typeof ITEMS !== 'undefined' && ITEMS[id]) || { c: 'misc' }, col = CAT_COL[it.c] || 0xcccccc;
    const g = new THREE.Group();
    if (it.c === 'weapon' || id === 'crowbar') { const h = handItem(id); h.rotation.set(0, 0, Math.PI / 2); h.position.x = -0.4; h.scale.setScalar(1.15); g.add(h); }
    else {
      let gm;
      if (it.c === 'food') gm = geo('dfood', () => new THREE.CylinderGeometry(0.13, 0.13, 0.22, 7));
      else if (it.c === 'water') gm = geo('dwater', () => new THREE.CylinderGeometry(0.09, 0.11, 0.38, 6));
      else if (it.c === 'story') gm = ico(0.18, 0);
      else if (it.c === 'ammo') gm = cbox(0.26, 0.14, 0.18);
      else if (it.c === 'med') gm = cbox(0.3, 0.18, 0.22);
      else gm = cbox(0.3, 0.22, 0.3);
      g.add(new THREE.Mesh(gm, sharedMat(col, new THREE.Color(col).multiplyScalar(0.45).getHex())));
    }
    const ring = new THREE.Mesh(geo('dring', () => { const r = new THREE.RingGeometry(0.32, 0.46, 14); r.rotateX(-Math.PI / 2); return r; }),
      SHARED['ring' + col] || (SHARED['ring' + col] = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));
    ring.name = 'ring'; g.add(ring);
    return g;
  }

  /* ---------- kind configs ---------- */
  const SURV_TINTS = [0x5f7a5a, 0x4f6a7a, 0x6a6a52, 0x56627a, 0x6e7a62, 0x4e5e6e];
  const HAIR = [0x2a1e16, 0x4a3426, 0x6a5a48, 0x1a1a1a, 0x8a7a60];
  const KINDS = {
    player: { scale: 1.12, skin: 0xc8946c, shirt: 0xe8742c, sleeve: 0xe8742c, fore: 0xd06a28, pants: 0x3a3430, shin: 0x2a2420, hair: 0x2e2018, pack: 0x5a4632 },
    survivor: { scale: 1.08, skin: 0xb88a68, shirt: 0x5f7a5a, pants: 0x3a3c40, shin: 0x2e2e30, hair: 0x4a3426 },
    raider: { scale: 1.1, skin: 0xb07e5a, shirt: 0x9a2a1e, sleeve: 0xb07e5a, fore: 0xb07e5a, pants: 0x4a3a2a, shin: 0x2e2620, band: 0xc03020, rag: 0x7a1e16 },
    tollman: { scale: 1.12, skin: 0x9a7a5e, shirt: 0x1c1c20, pants: 0x26262a, shin: 0x16161a, mask: 0xd8d0be, hood: 0x111114 },
    warden: { scale: 1.28, skin: 0x9a785a, shirt: 0x24201c, pants: 0x1c1a18, shin: 0x121010, coat: 0x2e2018, hat: 0x141210, mask: 0xd8d0be, tw: 0.54, td: 0.3 },
    walker: { scale: 1.1, z: 1, skin: 0x7f8c6a, shirt: 0x58604e, sleeve: 0x7f8c6a, pants: 0x3e3c34, shin: 0x34322c, hunch: 0.38, armF: -1.2, headF: 0.25, headZ: 0.25, sway: 1, rag: 0x48503e, claws: 1 },
    runner: { scale: 1.06, z: 1, skin: 0xa29c84, shirt: 0x6e3e2e, sleeve: 0xa29c84, pants: 0x2c3646, shin: 0x242c38, tw: 0.36, td: 0.22, armW: 0.09, legW: 0.11, hunch: 0.25, lean: 0.55, armF: -0.5, headF: 0.2, sway: 0.5, claws: 1, legL: 1.06 },
    bloater: { scale: 1.3, z: 1, skin: 0xa2aa58, shirt: 0x6a6a3a, sleeve: 0xa2aa58, pants: 0x4a4630, shin: 0x3a3624, tw: 0.6, th: 0.52, td: 0.36, armW: 0.15, armL: 0.8, legW: 0.19, legL: 0.78, head: 0.13, belly: 0xc2c24a, hunch: 0.12, armF: -0.6, sway: 0.7, claws: 1 },
    screamer: { scale: 1.06, z: 1, skin: 0xd6cebe, shirt: 0xa89e8c, sleeve: 0xd6cebe, pants: 0x5a544a, shin: 0x4a443a, tw: 0.36, th: 0.6, td: 0.2, armW: 0.08, armL: 1.25, legW: 0.11, legL: 1.1, neck: 0.3, head: 0.15, jaw: 1, hunch: 0.15, armF: -0.25, headF: -0.1, sway: 0.6, claws: 1 },
    brute: { scale: 1.55, z: 1, skin: 0x485640, shirt: 0x2e3428, sleeve: 0x485640, pants: 0x24221c, shin: 0x1c1a16, tw: 0.74, th: 0.66, td: 0.42, armW: 0.27, armL: 1.15, legW: 0.24, legL: 0.88, neck: -0.08, head: 0.13, hunch: 0.3, armF: -0.45, headF: 0.3, sway: 0.4, claws: 1, fist: 0x3a4632 },
    dog: { scale: 0.85, z: 1, dog: 1, fur: 0x5a4a3a, belly: 0x7a6a56, skin: 0x8a6a5a, sway: 0.3 },
  };
  const LOCO = { idle: 1, walk: 1, run: 1, crouch: 1 };
  const LOOP = { work: 1, scream: 1, grab: 1, held: 1 };
  const DUR = { lunge: 0.45, shoot: 0.32, hit: 0.26, roll: 0.36, stagger: 0.62 };
  /* gestures: value = duration in seconds (0 = loop until stopped) */
  const GEST = { search: 0, hammer: 0, chat: 0, pickup: 0.75, eat: 1.6, drink: 1.6, bandage: 2.0, inspect: 1.6, handshake: 1.6, wave: 1.8, cheer: 1.6, point: 1.6 };
  const KEYS = ['sink', 'by', 'bx', 'bz', 'byaw', 'mx', 'tx', 'ty', 'tz', 'nx', 'ny', 'nz', 'alx', 'alz', 'arx', 'arz', 'elx', 'erx', 'llx', 'lrx', 'klx', 'krx', 'jaw', 'tail'];
  const ease = f => f < 0 ? 0 : f > 1 ? 1 : f * f * (3 - 2 * f);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const lerp = (a, b, f) => a + (b - a) * f;

  function make(kind, opts) {
    opts = opts || {};
    const k = Object.assign({}, KINDS[kind] || KINDS.walker);
    if (opts.k) Object.assign(k, opts.k); // a one-off look (act bosses)
    if (kind === 'survivor') { k.shirt = opts.tint || SURV_TINTS[(Math.random() * SURV_TINTS.length) | 0]; k.hair = HAIR[(Math.random() * HAIR.length) | 0]; }
    const sc = (k.scale || 1) * (opts.scale || 1) * 1.12;
    const mats = {}, matList = [];
    const mat = hex => { if (!mats[hex]) { mats[hex] = new THREE.MeshLambertMaterial({ color: hex, flatShading: true }); matList.push(mats[hex]); } return mats[hex]; };
    const mesh = (gm, hex, parent, x, y, z, shadow) => { const m = new THREE.Mesh(gm, typeof hex === 'number' ? mat(hex) : hex); m.position.set(x || 0, y || 0, z || 0); if (shadow) m.castShadow = true; parent.add(m); return m; };
    const root = new THREE.Group(), base = new THREE.Group(), mid = new THREE.Group(), body = new THREE.Group();
    root.add(base); base.add(mid); mid.add(body); base.scale.setScalar(sc);
    const J = {}; let height = 1.8, hipH = 0.92, jaw = null, tail = null;

    if (k.dog) {
      /* quadruped: body pitches at its centre; diagonal leg pairs */
      hipH = 0.5; mid.position.y = hipH; body.position.y = -hipH;
      const torso = J.torso = new THREE.Group(); torso.position.y = hipH; body.add(torso);
      mesh(cbox(0.3, 0.28, 0.78), k.fur, torso, 0, 0.04, 0, true);
      mesh(cbox(0.24, 0.12, 0.5), k.belly, torso, 0, -0.1, 0.02);
      const head = J.head = new THREE.Group(); head.position.set(0, 0.16, 0.4); torso.add(head);
      mesh(cbox(0.24, 0.22, 0.24), k.fur, head, 0, 0.04, 0.08, true);
      mesh(cbox(0.13, 0.11, 0.22), k.skin, head, 0, -0.02, 0.28);
      mesh(cbox(0.06, 0.12, 0.04), k.fur, head, 0.08, 0.2, 0.02); mesh(cbox(0.06, 0.12, 0.04), k.fur, head, -0.08, 0.2, 0.02);
      const eg = cbox(0.045, 0.03, 0.02); mesh(eg, eyeMat(), head, 0.065, 0.08, 0.205); mesh(eg, eyeMat(), head, -0.065, 0.08, 0.205);
      jaw = new THREE.Group(); jaw.position.set(0, -0.07, 0.2); head.add(jaw); mesh(hang(0.11, 0.04, 0.2, 0.08), 0x4a2420, jaw);
      const leg = (x, z) => { const g = new THREE.Group(); g.position.set(x, -0.08, z); torso.add(g); mesh(hang(0.08, 0.42, 0.09), k.fur, g); return g; };
      J.fl = leg(0.1, 0.28); J.fr = leg(-0.1, 0.28); J.bl = leg(0.1, -0.28); J.br = leg(-0.1, -0.28);
      tail = new THREE.Group(); tail.position.set(0, 0.12, -0.38); torso.add(tail); const tm = mesh(hang(0.05, 0.32, 0.05), k.fur, tail); tm.rotation.x = 0;
      height = 0.8;
    } else {
      const legL = 0.92 * (k.legL || 1), thL = legL * 0.49, shL = legL * 0.51;
      const tw = k.tw || 0.46, th = k.th || 0.58, td = k.td || 0.26, aw = k.armW || 0.12, lw = k.legW || 0.15, aL = 0.34 * (k.armL || 1);
      hipH = legL; mid.position.y = hipH; body.position.y = -hipH;
      const hips = new THREE.Group(); hips.position.y = hipH; body.add(hips);
      mesh(cbox(tw * 0.92, 0.16, td * 0.95), k.pants, hips, 0, 0.02, 0);
      const torso = J.torso = new THREE.Group(); hips.add(torso);
      mesh(up(tw, th, td), k.shirt, torso, 0, 0.04, 0, true);
      if (k.rag) { const r = mesh(hang(tw * 0.5, 0.22, 0.03), k.rag, torso, tw * 0.18, 0.2, td / 2 + 0.01); r.rotation.z = 0.25; }
      if (k.belly) { const b = mesh(ico(0.36, 1), k.belly, torso, 0, th * 0.42, td * 0.42, true); b.scale.set(1.05, 0.95, 0.9); mesh(ico(0.07, 0), 0xd8a040, torso, 0.18, th * 0.6, td * 0.75); mesh(ico(0.055, 0), 0xd8a040, torso, -0.14, th * 0.3, td * 0.82); }
      if (k.pack) mesh(up(tw * 0.78, th * 0.78, 0.2), k.pack, torso, 0, th * 0.15, -td / 2 - 0.1, true);
      if (k.coat) { mesh(hang(tw + 0.08, th + 0.5, td + 0.08), k.coat, torso, 0, th + 0.06, 0, true); mesh(cbox(tw + 0.22, 0.1, td + 0.14), k.coat, torso, 0, th, 0); }
      const neck = J.neck = new THREE.Group(); neck.position.y = th + 0.04; torso.add(neck);
      const nL = k.neck || 0; if (nL > 0) mesh(up(0.08, nL + 0.04, 0.08), k.skin, neck);
      const head = J.head = new THREE.Group(); head.position.y = Math.max(0, nL); neck.add(head);
      const hr = k.head || 0.16;
      if (k.jaw) {
        mesh(up(0.2, 0.22, 0.2, -0.01), k.skin, head, 0, 0.06, 0, true);
        jaw = new THREE.Group(); jaw.position.set(0, 0.08, 0.02); head.add(jaw);
        mesh(hang(0.17, 0.16, 0.16, 0.03), k.skin, jaw); mesh(cbox(0.13, 0.1, 0.04), 0x2a0e0c, jaw, 0, -0.02, 0.12);
        const eg = cbox(0.05, 0.03, 0.02); mesh(eg, eyeMat(), head, 0.055, 0.2, 0.095); mesh(eg, eyeMat(), head, -0.055, 0.2, 0.095);
      } else {
        mesh(ico(hr, 0), k.skin, head, 0, hr * 0.95, 0, true);
        if (k.z) { const eg = cbox(0.045, 0.03, 0.02); mesh(eg, eyeMat(), head, hr * 0.36, hr * 1.05, hr * 0.86); mesh(eg, eyeMat(), head, -hr * 0.36, hr * 1.05, hr * 0.86); }
      }
      if (k.hair) mesh(up(0.27, 0.1, 0.27, -0.02), k.hair, head, 0, hr * 1.25);
      if (k.band) mesh(up(0.29, 0.08, 0.29), k.band, head, 0, hr * 1.2);
      if (k.mask) mesh(cbox(0.22, 0.2, 0.06), k.mask, head, 0, hr * 0.95, hr * 0.85);
      if (k.hood) mesh(up(0.3, 0.2, 0.3, -0.03), k.hood, head, 0, hr * 1.15);
      if (k.hat) { mesh(up(0.5, 0.03, 0.5), k.hat, head, 0, hr * 1.55); mesh(up(0.26, 0.16, 0.26), k.hat, head, 0, hr * 1.55); }
      const arm = side => {
        const s = new THREE.Group(); s.position.set(side * (tw / 2 + aw / 2 + 0.01), th - 0.05, 0); torso.add(s);
        mesh(hang(aw, aL, aw), k.sleeve || k.shirt, s);
        const el = new THREE.Group(); el.position.y = -aL; s.add(el);
        mesh(hang(aw * 0.9, aL * 0.95, aw * 0.9), k.fore || k.sleeve || k.skin, el);
        if (k.fist) mesh(cbox(aw * 1.25, aw * 1.1, aw * 1.25), k.fist, el, 0, -aL * 0.95, 0);
        const hand = new THREE.Group(); hand.position.y = -aL * 0.95; el.add(hand);
        return { s, el, hand };
      };
      const L = arm(1), Rr = arm(-1);
      J.al = L.s; J.el = L.el; J.ar = Rr.s; J.er = Rr.el; J.hand = Rr.hand;
      const leg = side => {
        const g = new THREE.Group(); g.position.set(side * tw * 0.24, 0, 0); hips.add(g);
        mesh(hang(lw, thL, lw * 1.1), k.pants, g, 0, 0, 0, true);
        const kn = new THREE.Group(); kn.position.y = -thL; g.add(kn);
        mesh(hang(lw * 0.9, shL, lw), k.shin || k.pants, kn); mesh(cbox(lw * 0.95, 0.07, lw * 1.6), k.shin || k.pants, kn, 0, -shL + 0.035, lw * 0.35);
        return { g, kn };
      };
      const LL = leg(1), RL = leg(-1); J.ll = LL.g; J.kl = LL.kn; J.lr = RL.g; J.kr = RL.kn;
      height = hipH + th + 0.04 + Math.max(0, nL) + hr * 2.1;
    }

    /* awareness sprite */
    const aware = new THREE.Sprite(awareMats()[0]); aware.visible = false; aware.renderOrder = 999;
    aware.scale.set(0.75, 0.75, 1); aware.position.y = height * sc + 0.45; root.add(aware);

    const cur = {}, tgt = {}; for (const key of KEYS) { cur[key] = 0; tgt[key] = 0; }
    let loco = 'idle', act = null, actT = 0, actOpts = {}, phase = Math.random() * 6, t = Math.random() * 10, flashT = 0, carry = null, carryId = null, dead = false;
    let mood = opts.mood || null, autoMood = Math.random() < 0.5 ? 'sway' : 'shuffle', moodT = 3 + Math.random() * 6, aware01 = 0, deathV = 0;
    const endAct = () => { act = null; A.action = null; };

    const A = {
      root, kind, height: height * sc, aiming: false, dead: false, deadT: 0, sunk: false, action: null,
      anim(name, o) {
        if (dead && name !== 'die') return;
        if (name === 'stop') { if (act && (LOOP[act] || GEST[act] != null)) endAct(); return; }
        if (LOCO[name]) { loco = name; if (act && LOOP[act]) endAct(); return; }
        if (name === 'die') { A.die(o && o.variant); return; }
        if (name === 'hit' && o && o.hard) name = 'stagger';
        if ((LOOP[name] || GEST[name] === 0) && act === name) return;
        act = name; actT = 0; actOpts = o || {}; A.action = name;
      },
      die(variant) {
        if (dead) return; dead = true; A.dead = true; act = 'die'; actT = 0; A.action = 'die'; A.setAware(null);
        deathV = variant != null ? variant : (k.z && !k.dog ? Math.floor(Math.random() * 3) : 0); A.deathVariant = deathV;
      },
      /* zombie idle mood: 'feed' | 'sway' | 'shuffle' | 'turn' | 'still' | null (automatic). Returns the mood in use. */
      mood(name) { if (name !== undefined) mood = name || null; return mood || autoMood; },
      flash(hex) { flashT = 0.09; const c = hex == null ? 0xff5a40 : hex; for (const m of matList) m.emissive.setHex(c); },
      setAware(v) {
        aware01 = v == null ? 0 : v;
        if (v == null || v <= 0.02) { aware.visible = false; return; }
        aware.visible = true; const M = awareMats();
        aware.material = v >= 1 ? M[4] : M[Math.min(3, Math.floor(v * 4))];
        const s = v >= 1 ? 0.85 : 0.6 + v * 0.2; aware.scale.set(s, s, 1);
      },
      setCarry(id) {
        if (id === carryId) return; carryId = id;
        if (carry) { carry.parent && carry.parent.remove(carry); carry = null; }
        if (!id || !J.hand) return;
        carry = handItem(id); if (!carry.userData.gun) carry.rotation.x = -1.15; J.hand.add(carry);
      },
      update(dt, speed) {
        speed = speed || 0; t += dt;
        if (act && GEST[act] != null && speed > 0.6) endAct();
        if (flashT > 0) { flashT -= dt; if (flashT <= 0) for (const m of matList) m.emissive.setHex(0); }
        if (k.z && EYE) EYE.color.setHex(Actors.night ? 0xffcc33 : 0x6a5a30);
        for (const key of KEYS) tgt[key] = 0;
        let rate = 14;
        if (k.dog) rate = dogPose(dt, speed); else rate = humPose(dt, speed);
        const f = Math.min(1, dt * rate);
        for (const key of KEYS) cur[key] += (tgt[key] - cur[key]) * f;
        apply();
      },
      dispose() { root.parent && root.parent.remove(root); for (const m of matList) m.dispose(); matList.length = 0; },
    };

    function locoPart(dt, speed) {
      const P = tgt, moving = speed > 0.15, run = moving && (loco === 'run' || speed > 4.3), crouch = loco === 'crouch';
      P.tx = k.hunch || 0; P.alx = P.arx = k.armF || 0; P.elx = P.erx = k.armF ? -0.35 : -0.12; P.alz = 0.08; P.arz = -0.08; P.nx = k.headF || 0; P.nz = (k.headZ || 0) * Math.sin(t * 0.6);
      P.tx += Math.sin(t * 1.7) * 0.025; P.tz = Math.sin(t * 0.9) * 0.05 * (k.sway || 0);
      if (k.armF) { P.alx += Math.sin(t * 1.3) * 0.08; P.arx += Math.sin(t * 1.3 + 1.7) * 0.08; }
      if (crouch) { P.by = -0.27; P.llx = P.lrx = -1.0; P.klx = P.krx = 1.6; P.tx += 0.35; P.alx += -0.3; P.arx += -0.3; }
      if (moving) {
        const freq = run ? Math.min(3, 1.2 + speed * 0.3) : Math.min(2.2, 0.55 + speed * 0.4), amp = crouch ? 0.35 : run ? 1.0 : Math.min(0.75, 0.3 + speed * 0.13);
        phase += dt * freq * Math.PI * 2;
        const s = Math.sin(phase), c = Math.cos(phase);
        P.llx += s * amp; P.lrx -= s * amp;
        P.klx += Math.max(0, c) * amp * 1.3 + 0.05; P.krx += Math.max(0, -c) * amp * 1.3 + 0.05;
        const armAmp = k.armF ? 0.25 : 0.8;
        P.alx += -s * amp * armAmp; P.arx += s * amp * armAmp;
        P.by += Math.abs(s) * 0.07 * amp - 0.03;
        P.ty = s * 0.08 * amp;
        if (run) { P.tx += k.lean || 0.3; P.elx = P.erx = -1.3; if (!k.armF || kind === 'runner') { P.alx = -s * 1.0 + 0.2; P.arx = s * 1.0 + 0.2; } }
        if (k.sway) P.tz += Math.sin(phase * 0.5) * 0.06 * k.sway;
      }
    }
    function humPose(dt, speed) {
      const P = tgt; let rate = 14;
      locoPart(dt, speed);
      if (A.aiming && !act && carry && carry.userData.gun) { P.arx = -1.5; P.erx = 0; P.arz = 0.05; P.alx = -1.3; P.alz = -0.5; P.elx = -0.5; }
      if (k.z && !act && !dead && speed < 0.15) zombieIdle(dt, P);
      if (act) {
        actT += dt; const a = actT;
        if (GEST[act] != null) { rate = gesture(act, a, P); return rate; }
        switch (act) {
          case 'stagger': {
            rate = 20; const f = Math.max(0, 1 - a / DUR.stagger), m = Math.sin(Math.PI * Math.min(1, a / DUR.stagger));
            P.tx = (k.hunch || 0) - 0.55 * f; P.nx = -0.5 * f; P.alz = 0.9 * m + Math.sin(a * 21) * 0.3 * f; P.arz = -0.9 * m - Math.sin(a * 19 + 1) * 0.3 * f;
            P.alx = P.arx = -0.6 * m; P.llx = 0.5 * m; P.lrx = -0.3 * m; P.klx = 0.4 * m; P.tz = Math.sin(a * 12) * 0.15 * f; P.by = -0.08 * m;
            if (a > DUR.stagger) endAct();
            break;
          }
          case 'attack': {
            const W = actOpts.wind != null ? Math.max(0.08, actOpts.wind) : (k.z ? 0.4 : 0.25), S = 0.16, end = W + S + 0.22;
            rate = 26;
            const fists = !carry && !k.z;
            if (a < W) {
              const f = ease(a / W);
              if (k.claws) { P.alx = P.arx = lerp(k.armF || 0, -2.7, f); P.elx = P.erx = -0.3; P.tx = (k.hunch || 0) - 0.25 * f; P.nx = -0.2 * f; }
              else if (fists) { P.arx = -0.7; P.erx = -1.9 * f; P.ty = -0.45 * f; P.alx = -0.9; P.elx = -1.6; }
              else { P.arx = -2.6 * f; P.erx = -0.5; P.arz = -0.2; P.ty = -0.55 * f; P.alx = -0.5; P.elx = -0.4; P.tx -= 0.1 * f; }
            } else if (a < W + S) {
              const f = ease((a - W) / S);
              if (k.claws) { P.alx = P.arx = lerp(-2.7, -0.6, f); P.elx = P.erx = -0.2; P.tx = (k.hunch || 0) + 0.45 * f; P.nx = 0.3; }
              else if (fists) { P.arx = -1.6; P.erx = lerp(-1.9, 0, f); P.ty = lerp(-0.45, 0.45, f); P.tx += 0.15; }
              else { P.arx = lerp(-2.6, -0.4, f); P.erx = -0.15; P.ty = lerp(-0.55, 0.55, f); P.tx += 0.3 * f; P.alx = -0.3; }
            } else if (a > end) { act = null; A.action = null; }
            break;
          }
          case 'lunge': {
            rate = 22; const f = Math.min(1, a / 0.12);
            P.tx = (k.hunch || 0) + 0.6 * f; P.alx = P.arx = -1.7; P.elx = P.erx = -0.15; P.llx = -0.8 * f; P.lrx = 0.7 * f; P.klx = 0.3; P.krx = 0.5; P.by = -0.1 * f; P.nx = 0.1;
            if (a > DUR.lunge) { act = null; A.action = null; }
            break;
          }
          case 'shoot': {
            rate = 30; const kick = a < 0.07 ? 1 - a / 0.07 : 0;
            P.arx = -1.5 - 0.3 * kick; P.erx = 0; P.arz = 0.05; P.alx = -1.3 - 0.25 * kick; P.alz = -0.5; P.elx = -0.5; P.tx -= 0.1 * kick;
            if (a > DUR.shoot) { act = null; A.action = null; }
            break;
          }
          case 'hit': {
            rate = 24; const f = 1 - a / DUR.hit;
            P.tx -= 0.4 * f; P.nx -= 0.45 * f; P.alz += 0.5 * f; P.arz -= 0.5 * f; P.alx += 0.3 * f; P.arx += 0.3 * f;
            if (a > DUR.hit) { act = null; A.action = null; }
            break;
          }
          case 'roll': {
            rate = 40; const f = Math.min(1, a / DUR.roll);
            P.mx = Math.PI * 2 * ease(f); P.by = -0.35 * Math.sin(f * Math.PI); P.llx = P.lrx = -1.7; P.klx = P.krx = 2.2; P.tx = 0.8; P.alx = P.arx = -1.2; P.elx = P.erx = -1.4; P.nx = 0.5;
            if (a > DUR.roll) { act = null; A.action = null; cur.mx = 0; }
            break;
          }
          case 'work': {
            const c = (a * 1.5) % 1;
            P.by = -0.2; P.tx = 0.5; P.llx = -0.9; P.klx = 1.2; P.lrx = 0.25; P.krx = 1.2; P.nx = 0.3;
            P.arx = c < 0.65 ? lerp(-0.7, -2.3, ease(c / 0.65)) : lerp(-2.3, -0.6, ease((c - 0.65) / 0.12)); P.erx = -0.5; P.alx = -0.9; P.elx = -0.7; P.ty = -0.15;
            rate = 22; break;
          }
          case 'scream': {
            const f = Math.min(1, a / 0.5);
            P.tx = -0.3 * f; P.nx = -1.0 * f; P.alz = 1.35 * f; P.arz = -1.35 * f; P.alx = P.arx = -0.3; P.elx = P.erx = -0.2; P.jaw = 1.0 * f;
            P.tz = Math.sin(a * 38) * 0.05 * f; P.nz = Math.sin(a * 31) * 0.12 * f; P.llx = -0.2; P.lrx = 0.25; rate = 18; break;
          }
          case 'grab': {
            P.tx = (k.hunch || 0) + 0.3; P.alx = P.arx = -1.45; P.alz = -0.3; P.arz = 0.3; P.elx = P.erx = -0.5; P.nx = 0.4 + Math.sin(a * 11) * 0.25; P.jaw = 0.5 + Math.sin(a * 11) * 0.4; break;
          }
          case 'held': {
            P.tz = Math.sin(a * 17) * 0.18; P.ty = Math.sin(a * 9) * 0.3; P.alx = P.arx = -1.3; P.elx = P.erx = -0.6; P.alz = -0.2; P.arz = 0.2; P.tx = -0.15; rate = 20; break;
          }
          case 'die': {
            rate = 30;
            if (deathV === 1) { /* forward onto the face, arms thrown ahead */
              const f = ease(Math.min(1, a / 0.7));
              P.bx = Math.PI / 2 * f * 0.95; P.alx = P.arx = -2.6 * f; P.alz = 0.35 * f; P.arz = -0.35 * f; P.elx = P.erx = -0.2 * f; P.llx = 0.15 * f; P.lrx = -0.1 * f; P.krx = 0.5 * f; P.nx = -0.5 * f; P.nz = 0.4 * f; P.tx = 0; P.sink = 0.12 * f;
            } else if (deathV === 2) { /* knees buckle, a half turn, then down on the side */
              const f1 = ease(Math.min(1, a / 0.4)), f2 = ease(clamp01((a - 0.3) / 0.6));
              P.by = -0.38 * f1 * (1 - f2 * 0.6); P.llx = P.lrx = -0.7 * f1; P.klx = P.krx = 1.5 * f1; P.byaw = 1.8 * ease(Math.min(1, a / 0.9)); P.bz = Math.PI / 2 * 0.95 * f2;
              P.tx = (k.hunch || 0) + 0.3 * f1; P.alz = 0.6 * f2; P.arz = -1.2 * f2; P.alx = -0.8 * f1; P.arx = -0.3; P.nx = 0.3 * f1; P.nz = 0.3 * f2; P.sink = 0.12 * f2;
            } else {
              const f = ease(Math.min(1, a / 0.6));
              P.bx = -Math.PI / 2 * f * 0.97; P.alz = 1.3 * f; P.arz = -1.2 * f; P.alx = P.arx = -0.4 * f; P.llx = -0.25 * f; P.lrx = 0.15 * f; P.klx = 0.3 * f; P.nx = -0.3 * f; P.tx = 0; P.sink = 0.13 * f;
            }
            P.jaw = k.jaw ? 0.8 : 0;
            sinkCheck(a, P); break;
          }
          default: act = null; A.action = null;
        }
      }
      if (k.jaw && !(act === 'scream' || act === 'grab' || act === 'die')) P.jaw = 0.35 + Math.sin(t * 2.3) * 0.12;
      return rate;
    }
    function kneel(P, f) { P.by = -0.36 * f; P.llx = -1.45 * f; P.klx = 1.55 * f; P.lrx = 0.35 * f; P.krx = 1.95 * f; }
    /* zombies standing still: sway, shuffle in place, crouch and feed, or a slow suspicious head-turn */
    function zombieIdle(dt, P) {
      moodT -= dt;
      if (moodT <= 0) { moodT = 4 + Math.random() * 6; const r = Math.random(); autoMood = r < 0.45 ? 'sway' : r < 0.8 ? 'shuffle' : 'still'; }
      const m = mood || (aware01 > 0.02 && aware01 < 1 ? 'turn' : autoMood), sw = k.sway || 0.5;
      if (m === 'sway') {
        P.tz += Math.sin(t * 0.8) * 0.12 * sw; P.tx += Math.sin(t * 0.55) * 0.07; P.nz += Math.sin(t * 0.6 + 1) * 0.2; P.byaw = Math.sin(t * 0.3) * 0.15;
        P.alx += Math.sin(t * 0.8) * 0.1; P.arx += Math.sin(t * 0.8 + 2) * 0.1;
      } else if (m === 'shuffle') {
        const s = Math.sin(t * 2.6), c = Math.cos(t * 2.6);
        P.llx += s * 0.28; P.lrx -= s * 0.28; P.klx += Math.max(0, c) * 0.35; P.krx += Math.max(0, -c) * 0.35; P.by += Math.abs(s) * 0.03 - 0.02; P.byaw = Math.sin(t * 0.45) * 0.6; P.ty += s * 0.06;
      } else if (m === 'turn') {
        P.ny = Math.sin(t * 0.65) * 0.95; P.ty += Math.sin(t * 0.65) * 0.3; P.tx -= 0.15; P.nx -= 0.2 + Math.sin(t * 1.7) * 0.05; P.alx *= 0.6; P.arx *= 0.6;
      } else if (m === 'feed') {
        kneel(P, 1); P.tx = 1.05; P.nx = 0.55 + Math.sin(t * 6) * 0.12; P.alx = -1.5 + Math.sin(t * 4.7) * 0.3; P.arx = -1.5 + Math.sin(t * 4.7 + 2) * 0.3; P.elx = P.erx = -0.6; P.ty = Math.sin(t * 2) * 0.08; P.tz = 0;
        if (k.jaw) P.jaw = 0.4 + Math.sin(t * 9) * 0.35;
      }
    }
    /* player / survivor gestures; returns the blend rate */
    function gesture(g, a, P) {
      const D = GEST[g], w = D ? Math.min(clamp01(a / 0.25), clamp01((D - a) / 0.3)) : clamp01(a / 0.3);
      if (D && a > D) { endAct(); return 14; }
      switch (g) {
        case 'search': kneel(P, w); P.tx = 0.55 * w; P.nx = 0.35 * w; P.arx = (-1.15 + Math.sin(a * 5.5) * 0.22) * w; P.erx = (-0.35 + Math.sin(a * 5.5 + 1) * 0.2) * w; P.alx = (-0.9 + Math.sin(a * 4.3 + 2) * 0.18) * w; P.elx = -0.5 * w; P.ty = Math.sin(a * 1.3) * 0.12 * w; return 12;
        case 'hammer': {
          kneel(P, w); P.tx = 0.45 * w; P.nx = 0.4 * w; const c = (a * 2.1) % 1;
          P.arx = c < 0.6 ? lerp(-0.5, -2.4, ease(c / 0.6)) : lerp(-2.4, -0.4, ease((c - 0.6) / 0.1)); P.erx = -0.6; P.alx = -0.95 * w; P.elx = -0.8 * w; P.ty = -0.12 * w; return 24;
        }
        case 'chat': P.arx = -0.45 + Math.sin(a * 2.3) * 0.28; P.erx = -0.95 + Math.sin(a * 3.1) * 0.2; P.arz = -0.12; P.alx = -0.25 + Math.sin(a * 1.7 + 2) * 0.18; P.elx = -0.55; P.ny = Math.sin(a * 0.7) * 0.3; P.nx = 0.03 + Math.sin(a * 2.9) * 0.06; P.ty = Math.sin(a * 0.9) * 0.1; return 8;
        case 'pickup': { const f = Math.sin(Math.PI * clamp01(a / D)); P.by = -0.32 * f; P.tx = 0.95 * f; P.llx = -0.7 * f; P.klx = 1.1 * f; P.lrx = -0.4 * f; P.krx = 0.9 * f; P.arx = -1.1 * f; P.erx = -0.2 * f; P.alx = -0.6 * f; P.nx = 0.3 * f; return 18; }
        case 'eat': case 'drink': {
          P.arx = (-1.75 + (g === 'eat' ? Math.sin(a * 7) * 0.12 : 0)) * w; P.erx = -2.0 * w; P.arz = 0.35 * w; P.alx = -0.2 * w;
          P.nx = g === 'drink' ? -0.45 * w : (0.12 + Math.sin(a * 9) * 0.04) * w; return 14;
        }
        case 'bandage': P.alx = -1.25 * w; P.elx = -0.7 * w; P.alz = -0.25 * w; P.arx = (-1.15 + Math.sin(a * 8) * 0.22) * w; P.arz = (0.45 + Math.cos(a * 8) * 0.18) * w; P.erx = -1.35 * w; P.nx = 0.45 * w; P.tx += 0.12 * w; return 14;
        case 'inspect': P.arx = -1.55 * w; P.erx = -1.05 * w; P.arz = 0.3 * w; P.alx = -0.6 * w; P.elx = -1.0 * w; P.ty = (-0.15 + Math.sin(a * 2.4) * 0.12) * w; P.nx = 0.15 * w; P.ny = (-0.2 + Math.sin(a * 2.4) * 0.12) * w; return 12;
        case 'handshake': P.arx = (-1.05 + (a > 0.35 && a < 1.2 ? Math.sin(a * 15) * 0.13 : 0)) * w; P.erx = -0.35 * w; P.arz = 0.12 * w; P.tx += 0.12 * w; P.nx = 0.12 * w; return 16;
        case 'wave': P.arx = -0.25 * w; P.arz = (-2.55 + Math.sin(a * 9) * 0.28) * w; P.erx = (-0.3 + Math.sin(a * 9 + 1) * 0.2) * w; P.nx = -0.05 * w; P.tz = 0.05 * w; return 14;
        case 'cheer': { const pu = Math.sin(a * 11) * 0.15; P.alz = (2.55 + pu) * w; P.arz = (-2.55 - pu) * w; P.alx = P.arx = -0.35 * w; P.elx = P.erx = -0.2 * w; P.by = Math.abs(Math.sin(a * 7)) * 0.06 * w; P.nx = -0.3 * w; return 16; }
        case 'point': P.arx = -1.5 * w; P.erx = 0; P.arz = -0.05 * w; P.ty = -0.1 * w; P.nx = 0; return 14;
      }
      return 14;
    }
    function sinkCheck(a, P) {
      A.deadT = a;
      if (kind === 'player' || kind === 'survivor') return;
      if (a > 3.2) { P.sink = 0.13 - (a - 3.2) * 0.35; if (a > 6.5) A.sunk = true; }
    }
    function dogPose(dt, speed) {
      const P = tgt; let rate = 14; const moving = speed > 0.15;
      P.tail = 0.9 + Math.sin(t * (moving ? 9 : 3)) * 0.25; P.nx = 0.15; P.tx = Math.sin(t * 2) * 0.02;
      if (moving) {
        const freq = Math.min(3.4, 1 + speed * 0.5), amp = Math.min(0.9, 0.35 + speed * 0.12);
        phase += dt * freq * Math.PI * 2; const s = Math.sin(phase);
        P.llx = s * amp; P.lrx = -s * amp; P.by = Math.abs(Math.cos(phase)) * 0.06 - 0.03; P.tx = Math.sin(phase * 2) * 0.05;
      }
      P.jaw = 0.15;
      if (act) {
        actT += dt; const a = actT;
        if (act === 'attack') {
          const W = actOpts.wind != null ? actOpts.wind : 0.3; rate = 26;
          if (a < W) { const f = ease(a / W); P.tx = -0.25 * f; P.nx = -0.4 * f; P.by = -0.08 * f; P.jaw = 0.6 * f; }
          else if (a < W + 0.16) { P.tx = 0.25; P.nx = 0.45; P.jaw = 0.1; P.llx = -0.8; P.lrx = -0.8; }
          else if (a > W + 0.4) { act = null; A.action = null; }
        } else if (act === 'lunge') { rate = 22; P.tx = 0.15; P.nx = 0.2; P.llx = -0.9; P.lrx = 0.9; P.jaw = 0.7; if (a > DUR.lunge) { act = null; A.action = null; } }
        else if (act === 'grab') { P.nx = 0.5 + Math.sin(a * 13) * 0.3; P.jaw = 0.4 + Math.sin(a * 13) * 0.3; P.tx = 0.15; }
        else if (act === 'hit') { rate = 24; const f = 1 - a / DUR.hit; P.tx = -0.3 * f; P.nx = -0.5 * f; if (a > DUR.hit) { act = null; A.action = null; } }
        else if (act === 'scream') { P.nx = -0.8; P.jaw = 0.8; }
        else if (act === 'die') { rate = 30; const f = ease(Math.min(1, a / 0.5)); P.bz = Math.PI / 2 * f; P.llx = 0.5 * f; P.lrx = -0.3 * f; P.jaw = 0.5; P.tail = 0; P.sink = 0.13 * f; sinkCheck(a, P); }
        else if (DUR[act] && a > DUR[act]) { act = null; A.action = null; }
        else if (!DUR[act] && !LOOP[act]) { act = null; A.action = null; }
      }
      return rate;
    }
    function apply() {
      const c = cur;
      base.position.y = c.sink; body.position.y = -hipH + c.by; base.rotation.x = c.bx; base.rotation.y = c.byaw; base.rotation.z = c.bz; mid.rotation.x = c.mx;
      const T = J.torso; T.rotation.set(c.tx, c.ty, c.tz);
      if (J.head) J.head.rotation.set(c.nx, c.ny, c.nz);
      if (jaw) jaw.rotation.x = c.jaw * 0.6;
      if (k.dog) {
        J.fl.rotation.x = c.llx; J.br.rotation.x = c.llx * 0.9; J.fr.rotation.x = c.lrx; J.bl.rotation.x = c.lrx * 0.9;
        if (tail) tail.rotation.x = -c.tail - 0.6;
        return;
      }
      J.al.rotation.set(c.alx, 0, c.alz); J.ar.rotation.set(c.arx, 0, c.arz); J.el.rotation.x = c.elx; J.er.rotation.x = c.erx;
      J.ll.rotation.x = c.llx; J.lr.rotation.x = c.lrx; J.kl.rotation.x = c.klx; J.kr.rotation.x = c.krx;
    }
    apply();
    return A;
  }
  return { make, itemMesh, handItem, night: false, KINDS, GESTURES: Object.keys(GEST), MOODS: ['feed', 'sway', 'shuffle', 'turn', 'still'] };
})();
