/* ===================== RENDER (skeleton: to be replaced by the full renderer) ===================== */
const R = {
  scene: null, camera: null, renderer: null, target: null, zoomK: 1, shakeA: 0, _ray: null, _plane: null,
  init(parent) {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia('(pointer:coarse)').matches ? 1 : 1.5));
    r.shadowMap.enabled = true;
    parent.appendChild(r.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x15120f); this.scene.fog = new THREE.Fog(0x15120f, 30, 70);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 200);
    this.hemi = new THREE.HemisphereLight(0xb8a890, 0x2a241c, 0.9); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe2c0, 1.1); this.sun.position.set(20, 40, 10); this.sun.castShadow = true; this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.target = new THREE.Vector3(); this._ray = new THREE.Raycaster(); this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const fit = () => { const w = parent.clientWidth || innerWidth, h = parent.clientHeight || innerHeight; r.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); };
    addEventListener('resize', fit); fit();
  },
  toWorld(x, y, h) { return new THREE.Vector3(x * TILE, h || 0, y * TILE); },
  follow(x, y, face, snap) { this.target.set(x * TILE, 0, y * TILE); if (snap) this._snap = true; },
  zoom(d) { this.zoomK = clamp(this.zoomK * (d > 0 ? 1.1 : 0.9), 0.6, 1.6); },
  shake(a) { this.shakeA = Math.max(this.shakeA, a); },
  setTime(hour, minute) { const t = hour + (minute || 0) / 60, day = clamp(Math.sin((t - 6) / 14 * Math.PI), 0, 1); this.sun.intensity = 0.15 + day * 1.0; this.hemi.intensity = 0.25 + day * 0.7; },
  setFlashlight() { },
  update(dt) {
    const off = new THREE.Vector3(0, 26, 17).multiplyScalar(this.zoomK);
    const want = this.target.clone().add(off);
    if (this._snap) { this.camera.position.copy(want); this._snap = false; } else this.camera.position.lerp(want, 1 - Math.pow(0.001, dt));
    this.camera.lookAt(this.target);
    this.sun.position.copy(this.target).add(new THREE.Vector3(20, 40, 10)); this.sun.target.position.copy(this.target);
  },
  render() { this.renderer.render(this.scene, this.camera); },
  screenToTile(sx, sy) {
    const el = this.renderer.domElement, rc = el.getBoundingClientRect();
    this._ray.setFromCamera(new THREE.Vector2((sx - rc.left) / rc.width * 2 - 1, -((sy - rc.top) / rc.height) * 2 + 1), this.camera);
    const p = new THREE.Vector3(); return this._ray.ray.intersectPlane(this._plane, p) ? { x: p.x / TILE, y: p.z / TILE } : null;
  },
  tileToScreen(x, y, h) {
    const v = new THREE.Vector3(x * TILE, h || 0, y * TILE).project(this.camera), rc = this.renderer.domElement.getBoundingClientRect();
    return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height, on: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  },
};
