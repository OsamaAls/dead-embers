/* ===================== ACTORS (skeleton: to be replaced by procedural low-poly models) ===================== */
const Actors = {
  make(kind, opts) {
    const colors = { player: 0xe8742c, survivor: 0x8dbd6a, raider: 0x7a2a22, tollman: 0x2a2a2a, warden: 0x111111, walker: 0x6f7a5a, runner: 0x8a8a6a, bloater: 0x7a8a3a, screamer: 0x9a8a8a, brute: 0x4a5a3a, dog: 0x5a4a3a };
    const root = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: colors[kind] || 0x888888 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.5, 8), mat); body.position.y = 0.75; body.castShadow = true; root.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), mat); head.position.y = 1.7; head.castShadow = true; root.add(head);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.4), mat); nose.position.set(0, 1.2, 0.4); root.add(nose);
    let t = 0, dead = false;
    return {
      root,
      anim() { },
      update(dt, speed) { if (dead) { root.rotation.x = Math.min(Math.PI / 2, root.rotation.x + dt * 4); return; } t += dt * (speed || 0) * 3; body.position.y = 0.75 + Math.abs(Math.sin(t)) * 0.08; },
      flash() { mat.emissive.setHex(0xff3300); setTimeout(() => mat.emissive.setHex(0), 90); },
      die() { dead = true; },
      setAware() { }, setCarry() { },
      dispose() { root.parent && root.parent.remove(root); },
    };
  },
};
