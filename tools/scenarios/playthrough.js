/* End-to-end playthrough: node tools/browser-check.js --scenario tools/scenarios/playthrough.js [--mobile] [--shots dir]
   Injects tools/harness.js (deterministic frames, BFS walking, bots) and plays the core route with real key/pointer events:
   cold open -> walk to the objective -> hold E to search -> melee + gun fights -> home, build -> screamer + rescue moments ->
   a dialogue decision -> sleep to day 2 -> horde night -> act 3 -> Haven ending. Prints "STEP name: ok|FAIL detail". */
const fs = require('fs'), path = require('path');
module.exports = async B => {
  const ev = s => B.eval(s);
  let fails = 0;
  const step = async (name, code, okExpr) => {
    const t0 = Date.now(); let r; try { r = await ev(`(function(){ ${code} })()`); } catch (e) { r = { err: e.message.slice(0, 200) }; }
    const ok = !r || r.err ? false : await ev(`(function(r){ return !!(${okExpr}); })(${JSON.stringify(r)})`);
    if (!ok) fails++;
    B.log(`STEP ${name}: ${ok ? 'ok' : 'FAIL'} (${((Date.now() - t0) / 1000).toFixed(1)}s) ${JSON.stringify(r)}`);
    return r;
  };
  for (let i = 0; i < 120 && !(await ev(`typeof Game!=='undefined' && !!(R && R.renderer && R.scene)`)); i++) await B.wait(500);
  await ev(fs.readFileSync(path.join(__dirname, '..', 'harness.js'), 'utf8'));
  await step('cold open', `Game.newGame('Tester','scavenger'); sim(0.2); let n=0; while(UI.blocking()&&n<10){ skipDlg(); sim(0.6); n++; } return {presses:n, blocking:UI.blocking(), obj:objectiveInfo().text}`, 'r.presses<=6 && !r.blocking');
  await B.shot('p01-start');
  await step('walk to objective', `G.encTimer=1e9; const o=objectiveInfo(); const t=goto(o.target.x,o.target.y+0.6,0.6); return {t, d:Math.hypot(o.target.x-G.p.x,o.target.y+0.6-G.p.y)}`, 'r.d<1');
  await step('hold E to search', `const a=searchNearest(), b=searchNearest(); return {a,b,obj:objectiveInfo().text}`, 'r.a.ok && r.b.ok');
  await B.shot('p02-searched');
  await step('melee fight', `const d=nearestPoi('supermarket',G.p.x,G.p.y); goto(d.x+0.5,d.y+2.5,0.6); G.pack.machete=1; G.p.weapon='machete'; G.p.hp=G.p.maxHp; return fightBot(['walker','walker'],false,40)`, 'r.won');
  await B.shot('p03-melee');
  await step('gun fight', `G.pack.pistol=1; G.pack.ammo=60; G.p.weapon='pistol'; return Object.assign(fightBot(['runner','walker'],true,40),{ammo:G.pack.ammo||0})`, 'r.won && r.ammo<60');
  await step('home + build', `clearFoes(); goto(WORLD.hatch.x+0.5,WORLD.hatch.y+1.5,0.6,90); sim(1,skipDlg); const s=slotCentre('bed'); goto(s.x,s.y,0.6); const label=interactTarget()&&interactTarget().label; holdE(6,()=>bl('bed')); return {build:isUnlocked('build'), label, bed:bl('bed'), obj:objectiveInfo().text}`, 'r.build && r.bed===1');
  await B.shot('p04-built');
  await step('screamer moment', `const d=nearestPoi('supermarket',G.p.x,G.p.y); goto(d.x+0.5,d.y+2.5,0.6); clearFoes(); const e=allEncounters().find(e=>e.play&&e.play.type==='screamer'&&!e.cond); Game.Q.push({type:'enc',enc:e}); sim(0.5); const started=Moments.active; fightBot(null,true,15); sim(1,skipDlg); return {id:e.id, started, after:Moments.active}`, 'r.started && !r.after');
  await step('rescue moment', `clearFoes(); const e=allEncounters().find(e=>e.play&&e.play.type==='rescue'&&!e.cond); Game.Q.push({type:'enc',enc:e}); sim(0.5); const started=Moments.active; fightBot(null,true,25); const c=Moments.cur; const why=c?{cleared:!!c.cleared, left:(c.enemies||[]).filter(x=>!x.dead).map(x=>x.id+'@'+Math.round(Math.hypot(x.x-G.p.x,x.y-G.p.y))), toS:+Math.hypot(c.sx-G.p.x,c.sy-G.p.y).toFixed(1), ammo:G.pack.ammo||0, sHp:c.hp}:null; if(c) goto(c.sx,c.sy,1.0,20); sim(1.5,skipDlg); return {id:e.id, started, after:Moments.active, survivors:G.survivors.length, people:isUnlocked('people'), why, toS2:c?+Math.hypot(c.sx-G.p.x,c.sy-G.p.y).toFixed(1):null}`, 'r.started && !r.after && r.survivors>=1');
  await B.shot('p05-rescue');
  await step('dialogue decision', `clearFoes(); sim(0.3,skipDlg); const e=allEncounters().find(e=>e.choices&&e.choices.length>=2&&!e.cond&&!e.minDay&&(e.where||[]).includes('travel')); Game.Q.push({type:'enc',enc:e}); sim(0.4); for(let i=0;i<5&&dlgButtons().length<2;i++){kd('Space');ku('Space');sim(0.3);} const btn=dlgButtons().find(b=>!/^1/.test(b.textContent))||dlgButtons()[0]; const label=btn&&btn.textContent; btn&&btn.click(); sim(0.4); for(let i=0;i<6&&UI.blocking();i++){kd('Space');ku('Space');sim(0.4);} return {id:e.id, label, closed:!UI.blocking()}`, 'r.label && r.closed');
  await step('sleep to day 2', `clearFoes(); goto(WORLD.hatch.x+0.5,WORLD.hatch.y+1.2,0.5); G.hour=21; G.minute=0; G.isNight=true; sim(0.2); kd('KeyE'); ku('KeyE'); sim(0.3); const sb=[...document.querySelectorAll('#pnl button, #pnl .btn')].find(b=>/sleep/i.test(b.textContent)); sb&&sb.click(); sim(0.5); for(let i=0;i<30&&(UI.blocking()||Game.Q.length);i++){ const bs=dlgButtons(); if(bs.length>=2) bs[bs.length-1].click(); else {kd('Space');ku('Space');} sim(0.4); if(Moments.active) fightBot(null,true,15); } return {day:G.day, unlocks:Object.keys(G.unlocks)}`, "r.day===2 && r.unlocks.includes('needs')");
  await B.shot('p06-day2');
  await step('horde night', `clearFoes(); G.buildings.walls=1; while(G.survivors.length<2) recruit(); G.survivors[0].job='guard'; World3D.refreshShelter(); G.pack.shotgun=1; G.pack.shells=80; G.p.weapon='shotgun'; G.p.x=WORLD.hatch.x+0.5; G.p.y=WORLD.hatch.y+1.5; G.hordeNight=true; G.hordeResult=null; G.hour=20; G.minute=58; G.isNight=true; let seen=false;
    sim(150,i=>{ skipDlg(); if(Game.wave) seen=true; if(seen&&!Game.wave) return 'stop'; if(i%3===0){ const p=G.p; let b=null,bd=99; for(const e of Combat.enemies){ if(e.dead) continue; const d=Math.hypot(e.x-p.x,e.y-p.y); if(d<bd){bd=d;b=e;} } if(b&&bd<7){ const s=R.tileToScreen(b.x,b.y,1); INPUT.aimX=s.x; INPUT.aimY=s.y; INPUT.attackPressed=true; } } G.p.hp=Math.max(G.p.hp,50); });
    return {seen, over:!Game.wave, result:G.hordeResult&&G.hordeResult.lines&&G.hordeResult.lines[0]&&G.hordeResult.lines[0].msg}`, 'r.seen && r.over');
  await B.shot('p07-horde');
  await step('Haven ending', `__skipTo(3); let end=null; sim(20,i=>{ const el=document.querySelector('#end'); if(el&&!el.hidden&&el.innerText.trim()){ end=el.innerText.replace(/\\n+/g,' / ').slice(0,120); return 'stop'; } const bs=dlgButtons(); const b=bs.find(b=>/haven|bus/i.test(b.textContent)); if(b){ b.click(); return; } if(UI.blocking()&&i%6===0){kd('Space');ku('Space');} }); return {end}`, 'r.end');
  await B.shot('p08-ending');
  B.log('perf', JSON.stringify(await ev(`({calls:R.renderer.info.render.calls, tris:R.renderer.info.render.triangles})`)));
  B.log(fails ? `PLAYTHROUGH: ${fails} step(s) failed` : 'PLAYTHROUGH: all steps ok');
  if (fails) throw new Error(fails + ' playthrough step(s) failed');
};
