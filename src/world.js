/* ===================== WORLD 3D (skeleton: to be replaced by the full city builder) ===================== */
const World3D = {
  group: null, contMeshes: {}, shelterGroup: null, barricade: null,
  build() {
    if (this.group) R.scene.remove(this.group);
    const g = this.group = new THREE.Group(); R.scene.add(g);
    const col = { [T_GRASS]: 0x2e3326, [T_ROAD]: 0x3a3836, [T_DOOR]: 0x6b4a2a, [T_BRIDGE]: 0x55504a, [T_RUBBLE]: 0x4a4038, [T_YARD]: 0x4a4236, [T_FIELD]: 0x3d4a24, [T_FLOOR]: 0x5a5046, [T_WATER]: 0x23384a, [T_CAR]: 0x3a3836, [T_TREE]: 0x2e3326, [T_WALL]: 0x2a2622, [T_ROOF]: 0x2a2622, [T_PROP]: 0x5a5046 };
    const n = W * H, geo = new THREE.PlaneGeometry(TILE, TILE); geo.rotateX(-Math.PI / 2);
    const ground = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), n); ground.receiveShadow = true;
    const m = new THREE.Matrix4(), c = new THREE.Color();
    let i = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { m.makeTranslation((x + 0.5) * TILE, 0, (y + 0.5) * TILE); ground.setMatrixAt(i, m); ground.setColorAt(i, c.setHex(col[tileAt(x, y)] || 0x333333)); i++; }
    g.add(ground);
    const box = (t, h, color) => {
      const list = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tileAt(x, y) === t) list.push([x, y]);
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, h, TILE), new THREE.MeshLambertMaterial({ color }), Math.max(1, list.length)); im.castShadow = true; im.receiveShadow = true;
      list.forEach(([x, y], k) => { m.makeTranslation((x + 0.5) * TILE, h / 2, (y + 0.5) * TILE); im.setMatrixAt(k, m); }); im.count = list.length; g.add(im);
    };
    box(T_WALL, 3, 0x5a5248); box(T_ROOF, 3.4, 0x4a4038); box(T_TREE, 4, 0x26331f); box(T_CAR, 1.2, 0x6a3a26);
    this.contMeshes = {};
    for (const ct of WORLD.containers) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.8, 1.2, TILE * 0.8), new THREE.MeshLambertMaterial({ color: 0x8a6a3a }));
      mesh.position.set((ct.x + 0.5) * TILE, 0.6, (ct.y + 0.5) * TILE); mesh.castShadow = true; g.add(mesh); this.contMeshes[ct.id] = mesh;
    }
    const r = WORLD.shelterRect; this.barricade = { x0: r.x0, y0: r.y0, x1: r.x1 + 1, y1: r.y1 + 1 };
  },
  update(dt, px, py) { },
  containerMesh(id) { return this.contMeshes[id] || null; },
  setContainerOpened(id, on) { const m = this.contMeshes[id]; if (m) m.material.color.setHex(on ? 0x3a3026 : 0x8a6a3a); },
  refreshShelter() {
    if (this.shelterGroup) this.group.remove(this.shelterGroup);
    const sg = this.shelterGroup = new THREE.Group(); this.group.add(sg);
    const r = WORLD.shelterRect;
    for (const k in BUILD_SLOTS) {
      const [x, y, w, h] = BUILD_SLOTS[k], lv = bl(k);
      if (!lv && !isUnlocked('build')) continue;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * TILE, lv ? 1.4 : 0.1, h * TILE), new THREE.MeshLambertMaterial({ color: lv ? 0x7a6a50 : 0xe8742c, transparent: !lv, opacity: lv ? 1 : 0.35 }));
      mesh.position.set((r.x0 + x + w / 2) * TILE, lv ? 0.7 : 0.05, (r.y0 + y + h / 2) * TILE); sg.add(mesh);
    }
  },
  highlight(kind, id) { },
};
