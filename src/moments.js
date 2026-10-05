/* ===================== MOMENTS (skeleton: encounter `play` runner) ===================== */
const Moments = {
  active: false, cur: null,
  start(enc, done) {
    const pl = enc.play, fin = ok => { this.active = false; this.cur = null; const f = ok ? pl.onWin : pl.onLose; done(f ? f() : ''); };
    this.active = true; this.cur = { enc, fin };
    if (pl.foes && pl.foes.length) { fight(pl.foes, { onWin: () => { fin(true); return ''; }, onFlee: () => { fin(false); return ''; } }); return; }
    if (pl.type === 'lock') { UI.lockpick({ mode: pl.mode, diff: pl.diff }, ok => fin(ok)); return; }
    if (pl.type === 'barter') { UI.barter(pl.stock || null, () => fin(true)); return; }
    fin(true);
  },
  update(dt) { },
};
