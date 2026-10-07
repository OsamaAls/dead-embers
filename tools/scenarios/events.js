/* Placed events: node tools/browser-check.js --scenario tools/scenarios/events.js [--mobile] [--shots dir]
   Every event happens somewhere you can see (places.js). Day one starts with nobody standing around; the bitten woman sits in a
   doorway and talks when you walk up; the dead stand on the road and come at you when you get close; a safe sits in the shop you
   search; a dog walks up to the yard gate; the stray waits under the pump; a bunker happening is about a real survivor in the yard;
   a random roll puts something ahead of you instead of opening a dialogue; draw calls stay under 180 with people standing about.
   Prints "STEP name: ok|FAIL detail" and throws if any step failed. */
module.exports = async B => {
  let fails = 0;
  const ev = s => B.eval(s);
  const step = async (name, body, test) => {
    let r; try { r = await ev(`(function(){ ${body} })()`); } catch (e) { r = { err: e.message }; }
    let pass = false; try { pass = !r.err && !!(new Function('r', 'return ' + test))(r); } catch (e) { }
    if (!pass) fails++; B.log(`STEP ${name}: ${pass ? 'ok' : 'FAIL'} ${JSON.stringify(r)}`); return r;
  };
  for (let i = 0; i < 60 && !(await ev(`typeof Game!=='undefined' && !!(R && R.renderer) && !!document.querySelector('#title [data-t]')`)); i++) await B.wait(250);
  await ev(`fetch('tools/harness.js').then(r=>r.text()).then(eval)`);
  await ev(`window.home = () => { G.p.x = WORLD.hatch.x + 0.5; G.p.y = WORLD.hatch.y + 1.5; G.p.maxHp = G.p.hp = 5000; }; window.tidy = () => { unblock(8); if (Moments.active) Moments.abort(); clearFoes(); Places.reset(); UI.close(); sim(0.2); home(); }; 1`);

  await step('day one starts with nobody standing around', `Game.newGame('Tester','scavenger'); sim(0.5); unblock(20); sim(3); return {live: placedNow().length, dlg: !!UI.state.dlg}`, 'r.live===0 && !r.dlg');
  await ev(`G.encTimer = 1e9; G.flags.got_water = true; home(); 1`);

  /* the bitten woman: in a doorway, calls out, talks when you walk up */
  await step('the bitten woman sits in a doorway', `const e = Places.spawn('bitten_stranger'); window.__e = e; sim(0.5);
    return {kind: e && e.spec.at.split(':')[0], actors: e && e.actors.length, door: e && [[0,-1],[1,0],[-1,0],[0,1]].some(([a,b]) => tileAt(Math.floor(e.x)+a, Math.floor(e.y)+b) === T_DOOR)}`, "r.kind==='door' && r.actors===1 && r.door");
  await ev(`(function(){ const e=window.__e; const pts=path(e.x, e.y+1); if (pts) go(pts, 4, 30); sim(0.3); e.sayT = 0; sim(0.3); return 1; })()`);
  await B.wait(400); await B.shot('ev-01-bitten-woman');
  await step('walk up and talk to her', `const e = window.__e; goto(e.x, e.y + 0.9, 0.4, 20); sim(0.3); const t = interactTarget(); kd('KeyE'); ku('KeyE'); sim(0.3);
    const b = dlgButtons().map(x => x.textContent.trim()); const l = dlgButtons().find(x => /Leave/.test(x.textContent)); l && l.click(); sim(0.3); unblock(6); sim(1);
    return {label: t && t.label, choices: b.length, after: e.actors.map(a => a.go), seen: !!G.seenEnc.bitten_stranger}`, "r.label==='Talk to the bitten woman' && r.choices>=2 && r.after[0]==='stay' && r.seen");
  await ev(`tidy(); 1`);

  /* the dead stand on the road; getting close starts the fight where they stood */
  await step('the dead wait on the road and come at you up close', `const e = Places.spawn('walker_pack'); const x = e.x, y = e.y, decor = e.actors.length; sim(0.3);
    const pts = path(x, y); if (pts) go(pts, 8, 40); sim(0.6); const near = Combat.enemies.filter(z => !z.dead && Math.hypot(z.x - x, z.y - y) < 4).length;
    const f = fightBot(null, false, 30); sim(1); return {decor, near, mom: Moments.active, won: !Moments.active}`, 'r.decor===3 && r.near>=3 && r.won');
  await ev(`tidy(); 1`);

  /* a safe in the back of the shop you are searching */
  await step('a safe sits in the building you search', `const q = nearestPoi('apartments', G.p.x, G.p.y); goto(q.x + 0.5, q.y - 1.5, 0.6, 80); const bi = buildingAt(G.p.x, G.p.y);
    const r = meetEvent('locked_safe', {bi}); r.inSame = bi >= 0 && buildingAt(r.at[0], r.at[1]) === bi; unblock(8); return r`, "r.placed && r.inSame && r.label==='Crack the safe' && r.mg");
  await ev(`tidy(); 1`);

  /* a dog walks up to the yard gate */
  await step('a dog walks up to the yard gate', `G.day = 3; const r = meetEvent('sh_dog'); r.gate = r.at[1] > WORLD.shelterRect.y1; unblock(8); return r`, "r.placed && r.gate && r.label==='Go to the dog' && r.dlg");
  await B.shot('ev-02-gate');
  await ev(`tidy(); 1`);

  /* the stray waits under the hand pump nearest the bunker, from day two, when you come by */
  await step('the stray waits under the pump', `G.day = 3; unlock('build'); G.flags.stray_fed = 0; G.flags.stray_day = 0; delete G.dog; G.encTimer = 500; /* people at home show only with events on */ const h = npcHome('stray');
    const sp = WORLD.pumps.slice().sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
    let got = null; const pts = path(h.x, h.y); if (pts) go(pts, 3, 60, ); for (let i = 0; i < 20 && !got; i++) { sim(0.5); got = Places.live.find(e => e.id === 'stray_pump'); }
    if (got) { goto(got.x, got.y + 1, 1.2, 20); sim(0.5); } const t = interactTarget();
    return {home: !!h, d: +Math.hypot(h.x - G.p.x, h.y - G.p.y).toFixed(1), live: placedNow().map(e => e.id), near: homeEventsNear(G.p.x, G.p.y, 20).map(x => x.enc.id), elig: encEligible(encById('stray_pump'), null, true), at: got && [+got.x.toFixed(1), +got.y.toFixed(1)], pumpD: got && +Math.hypot(got.x - sp.x - 0.5, got.y - sp.y - 0.5).toFixed(1), dog: got && got.actors.some(a => a.dog), label: t && t.label}`, "r.home && r.dog && r.pumpD < 2 && r.label==='Approach the stray'");
  await B.shot('ev-03-stray');
  await ev(`G.encTimer = 1e9; tidy(); 1`);

  /* a bunker happening is about a real survivor standing in the yard */
  await step('a bunker happening is about someone in the yard', `G.day = 6; G.hour = 22; G.isNight = true; recruit(); recruit(); home(); sim(2); const e = Places.spawn('sh_turning'); sim(5);
    const o = e && Combat.survivors.find(s => s.ref === e.who); if (o) goto(o.x, o.y + 0.8, 0.4, 20); sim(0.3); const t = interactTarget();
    return {who: e && e.who && e.who.name, drawn: !!o, label: t && t.label}`, "r.who && r.drawn && r.label==='Check on ' + r.who");
  await ev(`tidy(); 1`);

  /* a random roll puts something ahead of you; nothing opens by itself */
  await step('a random roll is placed, not popped', `G.day = 3; unlock('build'); const q = nearestPoi('street', G.p.x, G.p.y); goto(q.x + 0.5, q.y + 2, 1, 60);
    let dlg = false, placed = null; G.encTimer = 0.01; sim(4, () => { if (UI.state.dlg) dlg = true; placed = Places.live.find(e => e.src === 'field'); if (placed) return 'stop'; if (G.encTimer > 50 && !placed) G.encTimer = 0.01; });
    G.encTimer = 1e9; return {dlg, placed: placed && placed.id, kind: placed && placed.spec.at, q: Game.Q.map(x => x.type)}`, '!r.dlg && (r.placed || r.q.includes("enc"))');
  await ev(`tidy(); 1`);

  /* people standing about stay inside the draw-call budget */
  await step('draw calls stay under 180 with three people out', `G.day = 5; G.hour = 10; const e = Places.spawn('ruin_wedding'); sim(0.3); goto(e.x, e.y + 3, 1.5, 30); sim(0.5); R.render(); const calls = R.renderer.info.render.calls;
    return {calls, actors: e.actors.length}`, 'r.calls < 180 && r.actors===3');
  await B.shot('ev-04-wedding');
  if (fails) throw new Error(fails + ' event step(s) failed');
  B.log('EVENTS: all steps ok');
};
