/* End-to-end playthrough: node tools/browser-check.js --scenario tools/scenarios/playthrough.js [--mobile] [--shots dir]
   Cold open -> walk to the objective -> hold E to search -> melee fight + drops -> gun fight -> home, build bunks ->
   a gameplay moment -> a dialogue decision -> sleep (day 2 unlocks) -> skip to act 3 -> pick an ending.
   Prints one line per step: "STEP name: ok|FAIL detail". Movement is driven through INPUT (like the joystick), keys through CDP. */
module.exports = async B => {
  const ev = s => B.eval(s), log = (n, ok, d) => B.log(`STEP ${n}: ${ok ? 'ok' : 'FAIL'}${d ? ' ' + d : ''}`);
  for (let i = 0; i < 120 && !(await ev(`typeof Game!=='undefined' && !!(R&&R.renderer)`)); i++) await B.wait(500);
  await B.wait(800);
  const t0 = Date.now();
  await ev(`Game.newGame('Tester','soldier'); 1`);
  /* advance the cold open with real key presses */
  let presses = 0;
  for (; presses < 12 && await ev('UI.blocking()'); presses++) { await B.key('Space'); await B.wait(350); }
  log('cold open', !(await ev('UI.blocking()')), `${presses} presses, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await B.shot('p01-start');
  const calm = `G.encTimer=99999;`;
  const unblock = async () => { for (let i = 0; i < 15 && await ev('UI.blocking()'); i++) { await B.key('Enter'); await B.wait(200); await ev(`(function(){const b=document.querySelector('#dlg button:not([disabled]), #end .btn.pri'); if(b) b.click(); return 1})()`); await B.wait(200); } };
  /* steer toward a tile target via INPUT (stops near it or after maxMs) */
  const walkTo = async (tx, ty, maxMs, near) => {
    const end = Date.now() + maxMs; let d = 99;
    while (Date.now() < end) {
      d = await ev(`(function(){${calm} const dx=${tx}-G.p.x, dy=${ty}-G.p.y, d=Math.hypot(dx,dy); if(d<${near || 1.2}){INPUT.mx=INPUT.my=0; return d;}
        let ax=dx/d, ay=dy/d; const p=G.p, s=0.6; if(solidAt(p.x+ax*s,p.y+ay*s)){ const o=[[ay,-ax],[-ay,ax]].find(v=>!solidAt(p.x+v[0]*s,p.y+v[1]*s)); if(o){ax=o[0];ay=o[1];} }
        INPUT.mx=ax; INPUT.my=ay; return d;})()`);
      if (d < (near || 1.2)) break;
      if (await ev('UI.blocking()')) await unblock();
      await B.wait(120);
    }
    await ev('INPUT.mx=INPUT.my=0;1'); return d;
  };
  /* 1. walk to the objective target (FreshMart door) */
  const obj = await ev('objectiveInfo()');
  const tw = Date.now();
  const left = await walkTo(obj.target.x, obj.target.y + 0.6, 30000, 1.5);
  log('walk to objective', left < 1.5, `"${obj.text}" ${((Date.now() - tw) / 1000).toFixed(1)}s, ${left.toFixed(1)} tiles left`);
  await B.shot('p02-objective');
  /* 2. go inside to the nearest full container and hold E */
  const c = await ev(`(function(){let b=null,bd=1e9; for(const c of WORLD.containers){ if(containerState(c)==='empty') continue; const d=(c.x-G.p.x)**2+(c.y-G.p.y)**2; if(d<bd){bd=d;b=c;} } return b})()`);
  const spot = await ev(`(function(){const c=${JSON.stringify(c)}; for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]) if(!solidAt(c.x+dx+0.5,c.y+dy+0.5)) return [c.x+dx+0.5,c.y+dy+0.5]; return [c.x+0.5,c.y+1.5]})()`);
  let d2 = await walkTo(spot[0], spot[1], 20000, 0.5);
  if (d2 > 0.5) { await ev(`G.p.x=${spot[0]};G.p.y=${spot[1]};1`); }
  const before = await ev('G.stats.searches'), tsr = await ev(`searchTime(WORLD.containers.find(x=>x.id==='${c.id}'))`);
  await B.keyDown('KeyE'); await B.wait(700); await B.shot('p03-searching'); await B.wait(Math.ceil(tsr * 1000) + 1500); await B.keyUp('KeyE');
  log('hold E to search', (await ev('G.stats.searches')) > before, `${c.kind} ${tsr.toFixed(1)}s${d2 > 0.5 ? ' (teleported the last bit)' : ''}`);
  await unblock();
  /* 3. melee fight with real attack presses */
  const fightLoop = async (ids, maxMs, gun) => {
    await ev(`(function(){${calm} for(const e of Combat.enemies.slice()) Combat.despawn?Combat.despawn(e):0; window.__won=0; fight(${JSON.stringify(ids)}, {onWin:()=>{window.__won=1; return 'Won.'}}); return 1})()`);
    const end = Date.now() + maxMs; let shot = false;
    while (Date.now() < end) {
      const r = await ev(`(function(){ G.p.hp=Math.max(G.p.hp,60); const p=G.p; let best=null,bd=99; for(const e of Combat.enemies){ if(e.dead) continue; const d=Math.hypot(e.x-p.x,e.y-p.y); if(d<bd){bd=d;best=e;} }
        if(!best){INPUT.mx=INPUT.my=0; return {done:1};} const s=R.tileToScreen(best.x,best.y,1); INPUT.aimX=s.x; INPUT.aimY=s.y; const want=${gun ? 5 : 1.0};
        if(bd>want+0.3){INPUT.mx=(best.x-p.x)/bd;INPUT.my=(best.y-p.y)/bd;} else {INPUT.mx=INPUT.my=0;} return {d:bd, x:s.x, y:s.y}; })()`);
      if (r.done) break;
      if (r.d < (gun ? 6 : 1.6)) { if (gun) await B.click(r.x, r.y); else await B.key('KeyJ'); }
      if (!shot && r.d < 2.5) { shot = true; await B.shot(gun ? 'p05-gunfight' : 'p04-melee'); }
      if (await ev('UI.blocking()')) await unblock();
      await B.wait(110);
    }
    await ev('INPUT.mx=INPUT.my=0;1');
    return ev(`({won:window.__won, alive:Combat.enemies.filter(e=>!e.dead).length, drops:Combat.drops.length, kills:G.stats.kills, hp:Math.round(G.p.hp)})`);
  };
  await ev(`(function(){const d=nearestPoi('supermarket',G.p.x,G.p.y); G.p.x=d.x+0.5; G.p.y=d.y+2.5; return 1})()`);
  let r = await fightLoop(['walker', 'walker'], 40000, false);
  log('melee fight', r.won && r.alive === 0, JSON.stringify(r));
  await B.shot('p04b-drops');
  /* walk over drops to collect */
  const packBefore = await ev('Object.values(G.pack).reduce((a,b)=>a+b,0)');
  for (let i = 0; i < 4; i++) { const dr = await ev('Combat.drops[0]?{x:Combat.drops[0].x,y:Combat.drops[0].y}:null'); if (!dr) break; await walkTo(dr.x, dr.y, 6000, 0.3); await B.key('KeyE'); await B.wait(300); }
  log('pick up drops', true, `pack items ${packBefore} -> ${await ev('Object.values(G.pack).reduce((a,b)=>a+b,0)')}, drops left ${await ev('Combat.drops.length')}`);
  /* 4. gun fight */
  await ev(`(function(){ G.pack.pistol=1; G.pack.ammo_pistol=(G.pack.ammo_pistol||0)+20; G.p.weapon='pistol'; return weaponProfile().ranged})()`);
  r = await fightLoop(['runner', 'walker'], 40000, true);
  log('gun fight', r.won && r.alive === 0, JSON.stringify(r) + ' weapon ' + await ev('G.p.weapon'));
  /* 5. home: build bunks by holding E at the ghost slot */
  await ev(`(function(){ G.p.x=WORLD.hatch.x+0.5; G.p.y=WORLD.hatch.y+1.5; R.follow(G.p.x,G.p.y,0,true); give('wood',20); give('scrap',20); give('cloth',10); give('nails',10); return 1})()`);
  await B.wait(600);
  log('build unlocked at home', await ev(`isUnlocked('build')`), await ev('objectiveInfo().text'));
  const slot = await ev(`slotCentre('bed')`);
  await walkTo(slot.x, slot.y, 15000, 0.9);
  const can = await ev(`JSON.stringify(canBuild('bed'))`);
  await B.keyDown('KeyE'); await B.wait(3600); await B.keyUp('KeyE');
  log('build bunks', (await ev(`bl('bed')`)) > 0, `canBuild ${can}; objective now "${await ev('objectiveInfo().text')}"`);
  await B.shot('p06-built');
  /* 6. a gameplay moment from the real content (screamer) */
  await ev(`(function(){ const d=nearestPoi('supermarket',G.p.x,G.p.y); G.p.x=d.x+0.5; G.p.y=d.y+2.5; R.follow(G.p.x,G.p.y,0,true); const e=allEncounters().find(e=>e.play&&e.play.type==='screamer'); window.__mom=null; Game.Q.push({type:'enc', enc:e}); return e.id})()`);
  await B.wait(1500); await B.shot('p07-moment');
  const mom = await ev('Moments.active');
  const mEnd = Date.now() + 15000;
  while (Date.now() < mEnd && await ev('Moments.active')) {
    const t = await ev(`(function(){ const e=Combat.enemies.find(e=>!e.dead); if(!e) return null; const s=R.tileToScreen(e.x,e.y,1); INPUT.aimX=s.x; INPUT.aimY=s.y; return {x:s.x,y:s.y}})()`);
    if (t) await B.click(t.x, t.y); await B.wait(150);
  }
  log('screamer moment', mom && !(await ev('Moments.active')), `active at start ${mom}`);
  await unblock();
  /* 7. a dialogue decision with real clicks */
  await ev(`(function(){ const e=allEncounters().find(e=>e.choices&&e.choices.length>=2&&!e.cond&&(e.where||[]).includes('travel')); Game.Q.push({type:'enc', enc:e}); window.__dlg=e.id; return 1})()`);
  await B.wait(800); await B.shot('p08-dialogue');
  for (let i = 0; i < 6 && !(await ev(`!!document.querySelector('#dlg button:not([disabled])')`)); i++) { await B.key('Space'); await B.wait(300); }
  const choiceTxt = await ev(`(function(){const b=document.querySelector('#dlg button:not([disabled])'); if(!b) return null; const t=b.textContent; b.click(); return t})()`);
  await B.wait(500); await B.shot('p09-result');
  await unblock();
  log('dialogue decision', !!choiceTxt && !(await ev('UI.blocking()')), `${await ev('window.__dlg')}: "${choiceTxt}"`);
  /* 8. sleep -> day 2 */
  await ev(`(function(){ for(const e of Combat.enemies.slice()) Combat.despawn?Combat.despawn(e):0; G.p.x=WORLD.hatch.x+0.5; G.p.y=WORLD.hatch.y+1.2; G.hour=21; G.minute=0; G.isNight=true; R.follow(G.p.x,G.p.y,0,true); return 1})()`);
  await B.wait(400); await B.key('KeyE'); await B.wait(700); await B.shot('p10-bunker');
  const sleptBtn = await ev(`(function(){const b=[...document.querySelectorAll('#pnl button, #pnl .btn')].find(b=>/sleep/i.test(b.textContent)); if(!b) return null; b.click(); return b.textContent})()`);
  await B.wait(1200); await B.shot('p11-morning');
  await unblock();
  log('sleep to day 2', (await ev('G.day')) >= 2, `button "${sleptBtn}", day ${await ev('G.day')}, unlocks ${await ev('JSON.stringify(G.unlocks)')}`);
  /* 9. act 3 and an ending */
  await ev(`(function(){ __skipTo(3); G.p.x=WORLD.hatch.x+0.5; G.p.y=WORLD.hatch.y+1.2; G.hour=19; G.flags.final=false; storyCheck(); return 1})()`);
  let ended = null;
  for (let i = 0; i < 30 && !ended; i++) {
    const s = await ev(`(function(){ if(document.querySelector('#end:not([hidden])')&&!document.querySelector('#end').hidden) return 'end'; const bs=[...document.querySelectorAll('#dlg button:not([disabled])')]; const b=bs.find(b=>/haven|bus/i.test(b.textContent))||bs[0]; if(b){ const t=b.textContent; b.click(); return 'click:'+t } return 'none'})()`);
    if (s === 'end') ended = await ev(`document.querySelector('#end').textContent.slice(0,80)`);
    else if (s === 'none') { await B.key('Space'); }
    await B.wait(400);
  }
  await B.shot('p12-ending');
  log('ending reached', !!ended, ended || '');
  B.log('perf', JSON.stringify(await ev(`({fps:Math.round(Game.fps), calls:R.renderer.info.render.calls, tris:R.renderer.info.render.triangles})`)));
};
