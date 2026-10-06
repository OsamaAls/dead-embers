/* Every last-night ending, played: node tools/browser-check.js --scenario tools/scenarios/endings.js [--shots dir]
   Starts a fresh world per ending through the title, sets the story flags that unlock it, jumps to the last night
   (__skipTo(3)), picks the option from the final dialogue and plays it out (the stand, the KVAL broadcast, the Warden storm).
   Asserts the end screen shows the expected ending. Prints "STEP name: ok|FAIL" and throws on any FAIL. */
const fs = require('fs'), path = require('path');
module.exports = async B => {
  const ev = s => B.eval(s);
  for (let i = 0; i < 120 && !(await ev(`typeof Game!=='undefined' && !!(R && R.renderer && R.scene)`)); i++) await B.wait(500);
  await ev(fs.readFileSync(path.join(__dirname, '..', 'harness.js'), 'utf8'));
  await ev(`window.fresh = () => { UI.title('new'); const b = [...document.querySelectorAll('#title button')].find(b => /^start/i.test(b.textContent.trim())); if (b) b.click(); else Game.newGame('T','soldier'); sim(0.3); for (let i = 0; i < 10 && UI.blocking(); i++) { skipDlg(); sim(0.5); } G.encTimer = 1e9; INPUT.aimX = INPUT.aimY = null; INPUT.mouseAim = false; };
    window.pickFinal = re => { let got = null; sim(15, i => { const b = dlgButtons().find(b => re.test(b.textContent)); if (b) { got = b.textContent; b.click(); return 'stop'; } if (UI.blocking() && i % 6 === 0) { kd('Space'); ku('Space'); } }); sim(0.3); return got; };
    window.endNow = () => { const el = document.querySelector('#end'); return el && !el.hidden && el.innerText.trim() ? G.endScene : null; };
    window.fightOut = s => sim(s, i => { if (endNow() || (!Game.final && !Game.wave)) return 'stop'; skipDlg(); G.p.hp = Math.max(G.p.hp, 60); const p = G.p, b = Combat.target || Combat.enemies.find(e => !e.dead); if (!b) { INPUT.mx = INPUT.my = 0; return; }
      const d = Math.hypot(b.x - p.x, b.y - p.y), gun = weaponProfile().ranged; if (d > (gun ? 4.5 : 1)) { INPUT.mx = (b.x - p.x) / d; INPUT.my = (b.y - p.y) / d; } else INPUT.mx = INPUT.my = 0; if (i % 6 === 0 && d < (gun ? 7 : 1.7)) INPUT.attackPressed = true; });`);
  let fails = 0;
  const run = async (name, setup, re, play, want) => {
    const r = await ev(`(function(){ fresh(); ${setup}; __skipTo(3); sim(0.3); const picked = pickFinal(${re}); ${play || ''}; return { picked: picked && picked.slice(0, 40) }; })()`);
    /* endings may play a cutscene first (Cine): skip it, then wait for the end screen */
    for (let i = 0; i < 60 && !(await ev('!!endNow()')); i++) { await B.wait(300); await ev("(typeof Cine!=='undefined' && Cine.active && Cine.skip) ? (Cine.skip(), 1) : 0"); }
    const end = await ev('endNow()'), epi = await ev(`endNow() ? endingEpilogue(endNow()).length : 0`);
    const ok = end === want && !!r.picked;
    if (!ok) fails++;
    B.log(`STEP ${name}: ${ok ? 'ok' : 'FAIL'} picked="${r.picked}" end=${end} epilogue=${epi}`);
    await B.shot('end-' + name);
  };
  await run('haven', ``, /bus|Haven/i, '', 'end_haven');
  await run('convoy', `G.flags.vance_ally = true; recruit({ name: 'Ada Vance', trait: 'steady', skills: { combat: 5 } })`, /Vance|bus/i, '', 'end_convoy');
  await run('alone', ``, /alone/i, '', 'end_alone');
  await run('choir', `G.flags.choir_joined = true`, /bells/i, '', 'end_choir');
  await run('storm', `G.flags.warden_secret = true; G.pack.shotgun = 1; G.pack.shells = 40; G.p.weapon = 'shotgun'`, /Storm/i, `fightOut(120)`, 'end_usurp');
  await run('cure', `G.flags.ines_formula = true; give('antibiotics', 3); G.flags.radio_built = true`, /Okafor/i,
    `const F = Game.final; if (F) { goto(F.tower.x, F.tower.y + 0.4, 0.8, 40); kd('KeyE'); sim(20, () => !Game.final ? 'stop' : 0); ku('KeyE'); }`, 'end_cure');
  await run('stand', `G.buildings.walls = 3; G.buildings.tower = 1; while (G.survivors.length < 6) recruit(); G.survivors.forEach((s, i) => { s.job = i < 4 ? (i ? 'guard' : 'tower') : 'idle'; s.skills.combat = 3; }); G.pack.shotgun = 1; G.pack.shells = 60; G.p.weapon = 'shotgun'; World3D.refreshShelter()`,
    /Stay/i, `fightOut(300)`, 'end_stand');
  B.log(fails ? `ENDINGS: ${fails} failed` : 'ENDINGS: all ok');
  if (fails) throw new Error(fails + ' ending(s) failed');
};
