/* Combat / actors check: node tools/browser-check.js --scenario tools/scenarios/combat.js --shots <dir> [--mobile]
   Shots: c01 actor lineup (day), c02 lineup poses, c03 lineup at night (eyes), c04 melee fight, c05 after the fight (drops),
   c06 gunfire, c07 specials (bloater gas, screamer, dogs, raiders), c08 grab, c09 horde wave at the barricade, c10 survivors at work. */
module.exports = async B => {
  const ev = s => B.eval(s);
  for (let i = 0; i < 120 && !(await ev(`typeof Game!=='undefined' && typeof Combat!=='undefined' && !!R.renderer`)); i++) await B.wait(500);
  await B.wait(800);
  await ev(`Game.newGame('T','soldier')`);
  await B.wait(500);
  /* dismiss every dialogue / scene until the game has been unblocked for a while */
  const unblock = async () => {
    for (let i = 0, free = 0; i < 60 && free < 4; i++) {
      if (await ev('UI.blocking() || Game.Q.length>0 || Game.showing')) {
        free = 0;
        await ev(`(function(){try{UI.close&&UI.close()}catch(e){};const b=document.querySelector('#modal button:not([disabled]), .dlg button:not([disabled]), [data-continue], [data-a="close"]'); if(b) b.click(); return 1;})()`);
        await B.key('KeyE'); await B.key('Enter');
      } else free++;
      await B.wait(250);
    }
  };
  await unblock();
  const calm = `G.p.hp=G.p.maxHp=400; G.encTimer=99999; G.hordeNight=false;`;
  await ev(`(function(){${calm} window.__fightLog=[]; return 1})()`);
  B.log('blocked after unblock', await ev('UI.blocking()'));
  /* teleport to an open outdoor spot near a POI */
  /* teleport to the nearest open road/grass tile around (x,y) */
  const tp = (x, y) => ev(`(function(){${calm} const X=${x}, Y=${y}; let best=null,bd=1e9;
    for(let ty=1;ty<H-1;ty++) for(let tx=1;tx<W-1;tx++){ const t=tileAt(tx,ty); if(SOLID.has(t)||indoors(tx+0.5,ty+0.5)) continue; let open=true; for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++) if(solidAt(tx+ox+0.5,ty+oy+0.5)) open=false; if(!open) continue;
      const d=(tx+0.5-X)**2+(ty+0.5-Y)**2+(t===T_ROAD?0:2); if(d<bd){bd=d;best=[tx+0.5,ty+0.5];} }
    G.p.x=best[0]; G.p.y=best[1]; G.p.face=Math.PI; R.follow(G.p.x,G.p.y,G.p.face,true); return best.join(',')})()`);
  const setT = h => ev(`(function(){G.hour=${h}; G.minute=0; G.isNight=isNight(); return 1})()`);
  const killAll = () => ev(`(function(){for(const e of Combat.enemies.slice()) if(!e.dead) Combat.kill(e); return Combat.enemies.length})()`);
  await setT(12);
  /* ---- 1. lineup of every actor kind (frozen) ---- */
  const KINDS = ['player', 'survivor', 'raider', 'tollman', 'warden', 'walker', 'runner', 'bloater', 'screamer', 'brute', 'dog'];
  await tp(`WORLD.hatch.x+0.5`, `WORLD.hatch.y+4.5`);
  await ev(`(function(){
    for (const e of Combat.enemies.slice()) Combat.despawn(e);
    Combat.player.root.visible=false; for(const s of Combat.survivors) s.a.root.visible=false;
    R.zoomK=0.42; R.follow(G.p.x, G.p.y-1.5, 0, true);
    window.__line=[]; const K=${JSON.stringify(KINDS)};
    K.forEach((k,i)=>{ const a=Actors.make(k); R.scene.add(a.root); const x=G.p.x-6+i*1.2, y=G.p.y-1.5;
      a.root.position.set(x*TILE,0,y*TILE); a.root.rotation.y=0.35; if(k==='player') a.setCarry('machete'); if(k==='raider') a.setCarry('pistol'); if(k==='warden') a.setCarry('shotgun'); if(k==='tollman') a.setCarry('machete'); if(k!=='player'&&k!=='survivor') a.setAware([0.2,0.5,0.8,1][i%4]);
      for(let t=0;t<30;t++) a.update(0.05,0); window.__line.push(a); });
    return 1})()`);
  await B.wait(700); await B.shot('c01-lineup');
  /* poses: attack wind-up, scream, run, crouch, work, die */
  await ev(`(function(){ const L=window.__line; const P=['attack','work','shoot','crouch','attack','attack','run','walk','scream','attack','run'];
    L.forEach((a,i)=>{ a.setAware(null); const n=P[i]; if(n==='crouch'||n==='run'||n==='walk') a.anim(n); else a.anim(n,{wind:5}); if(n==='shoot') a.aiming=true; for(let t=0;t<12;t++) a.update(0.05,(n==='run'?4:n==='walk'?1.5:0)); });
    return 1})()`);
  await B.wait(400); await B.shot('c02-lineup-poses');
  await ev(`(function(){ const L=window.__line; L.forEach((a,i)=>{ a.anim('idle'); if(i%3===2){a.die(); for(let t=0;t<20;t++) a.update(0.05,0);} else for(let t=0;t<20;t++) a.update(0.05,0); }); G.hour=23; G.isNight=true; Actors.night=true; L.forEach(a=>a.update(0.01,0)); return 1})()`);
  await B.wait(900); await B.shot('c03-lineup-night');
  await ev(`(function(){ for(const a of window.__line) a.dispose(); window.__line=[]; Combat.player.root.visible=true; for(const s of Combat.survivors) s.a.root.visible=true; R.zoomK=1; return 1})()`);
  await setT(12);
  await unblock();
  /* ---- 2. melee fight: walker, runner, brute ---- */
  const road = `(function(){const p=nearestPoi('supermarket',G.p.x,G.p.y); return p})()`;
  await tp(`nearestPoi('supermarket',0,0).x+0.5`, `nearestPoi('supermarket',0,0).y+3.5`);
  await ev(`(function(){ G.pack.machete=1; G.p.weapon='machete'; for(const e of Combat.enemies.slice()) Combat.despawn(e);
     fight(['walker','runner','brute'], {onWin:()=>{window.__fightLog.push('win');return 'Fight won.'}, onLose:()=>{window.__fightLog.push('lose');return ''}, onFlee:()=>{window.__fightLog.push('flee');return ''}}); return Combat.enemies.length })()`);
  B.log('fight spawned', await ev(`JSON.stringify(Combat.enemies.map(e=>({id:e.id,d:+Math.hypot(e.x-G.p.x,e.y-G.p.y).toFixed(1),st:e.state})))`));
  await B.wait(1600); await B.shot('c04a-fight-approach');
  /* auto-fighter: face the nearest enemy (mouse aim), step toward it if far, attack, dodge sometimes */
  const fightStep = `(function(){ G.p.hp=Math.max(G.p.hp,200); G.p.sta=G.p.maxSta; const p=G.p; let best=null,bd=99; for(const e of Combat.enemies){ if(e.dead) continue; const d=Math.hypot(e.x-p.x,e.y-p.y); if(d<bd){bd=d;best=e;} }
     if(!best){ INPUT.mx=0; INPUT.my=0; INPUT.attack=false; return 'none'; }
     const s=R.tileToScreen(best.x,best.y,1); INPUT.aimX=s.x; INPUT.aimY=s.y;
     const prof=weaponProfile(); const want=prof.ranged?5:1.0;
     if(bd>want+0.3){ INPUT.mx=(best.x-p.x)/bd; INPUT.my=(best.y-p.y)/bd; } else if(bd<want-1.5&&prof.ranged){ INPUT.mx=-(best.x-p.x)/bd; INPUT.my=-(best.y-p.y)/bd; } else { INPUT.mx=0; INPUT.my=0; }
     if(bd<want+0.5) INPUT.attackPressed=true; if(Combat.grabbed) INPUT.attackPressed=true;
     return best.id+':'+bd.toFixed(1)+':'+best.state; })()`;
  let shotTaken = false;
  for (let i = 0; i < 160; i++) {
    if (i % 20 === 0) await unblock();
    const r = await ev(fightStep); if (r === 'none') break;
    if (i === 14 && !shotTaken) { shotTaken = true; await B.shot('c04b-fight-melee'); }
    await B.wait(100);
  }
  await ev(`INPUT.mx=0;INPUT.my=0;INPUT.attack=false;1`);
  B.log('after melee', await ev(`JSON.stringify({alive:Combat.enemies.filter(e=>!e.dead).length, drops:Combat.drops.map(d=>d.id+'x'+d.qty), log:window.__fightLog, kills:G.stats.kills, hp:G.p.hp, inFight:Combat.inFight()})`));
  await B.wait(900); await B.shot('c05-after-fight-drops');
  /* walk over the drops to auto-pick */
  await ev(`(function(){ for(const d of Combat.drops) if(d.auto){ G.p.x=d.x; G.p.y=d.y; Combat.update(0.02); } return Combat.drops.length })()`);
  B.log('drops left after walking over them', await ev(`JSON.stringify(Combat.drops.map(d=>d.id))`));
  await unblock();
  /* ---- 3. guns ---- */
  await ev(`(function(){ G.pack.pistol=1; G.pack.ammo=30; G.pack.shotgun=1; G.pack.shells=12; G.p.weapon='pistol'; for(const e of Combat.enemies.slice()) Combat.despawn(e);
     fight(['walker','walker','runner'], {onWin:()=>{window.__fightLog.push('gunwin');return 'Clear.'}}); return 1})()`);
  await B.wait(1200);
  for (let i = 0; i < 140; i++) {
    const r = await ev(fightStep); if (r === 'none') break;
    if (i === 6) await B.shot('c06a-gunfire');
    if (i === 20) await ev(`G.p.weapon='shotgun'`);
    if (i === 22) await B.shot('c06b-shotgun');
    await B.wait(100);
  }
  B.log('after guns', await ev(`JSON.stringify({alive:Combat.enemies.filter(e=>!e.dead).length, ammo:G.pack.ammo, shells:G.pack.shells, log:window.__fightLog, noise:G.noise})`));
  await unblock();
  /* ---- 4. specials: bloater gas, screamer, dogs, raiders ---- */
  await ev(`(function(){ G.day=5; for(const e of Combat.enemies.slice()) Combat.despawn(e); const b=Combat.spawnAt('bloater',G.p.x+1.2,G.p.y,{aware:true}); Combat.kill(b); return Combat.enemies.length })()`);
  await B.wait(500); await B.shot('c07a-bloater-gas');
  await B.wait(4200);
  await ev(`(function(){ fight(['screamer','zdog','zdog','raider','tollman'], {onWin:()=>{window.__fightLog.push('mixwin');return ''}}); return 1})()`);
  await B.wait(1500); await B.shot('c07b-screamer-dogs-raiders');
  await B.wait(1900); await B.shot('c07c-scream');
  await B.wait(1200);
  B.log('after scream', await ev(`JSON.stringify(Combat.enemies.filter(e=>!e.dead).map(e=>e.id+':'+e.state))`));
  await ev(`G.p.weapon='shotgun'; G.pack.shells=30; 1`);
  for (let i = 0; i < 200; i++) { const r = await ev(fightStep); if (r === 'none') break; if (i === 30) await B.shot('c07d-mixed-fight'); await B.wait(100); }
  B.log('after mixed', await ev(`JSON.stringify({alive:Combat.enemies.filter(e=>!e.dead).length, hp:G.p.hp, log:window.__fightLog})`));
  await ev(`INPUT.mx=0;INPUT.my=0;1`); await killAll();
  await unblock();
  /* ---- 5. grab ---- */
  await ev(`(function(){ window.__g=ENEMIES.walker.grab; ENEMIES.walker.grab=1; for(const e of Combat.enemies.slice()) Combat.despawn(e); const z=Combat.spawnAt('walker',G.p.x,G.p.y-1.1,{aware:true}); z.face=0; return 1 })()`);
  let grabbed = false;
  for (let i = 0; i < 40 && !grabbed; i++) { grabbed = await ev('Combat.grabbed'); await B.wait(100); }
  B.log('grabbed', grabbed);
  if (grabbed) await B.shot('c08-grab');
  for (let i = 0; i < 20 && await ev('Combat.grabbed'); i++) { await ev('INPUT.attackPressed=true;1'); await B.wait(80); }
  B.log('free after mashing', !(await ev('Combat.grabbed')));
  await ev(`ENEMIES.walker.grab=window.__g; 1`); await killAll();
  await unblock();
  /* ---- 6. horde wave ---- */
  await setT(22);
  await tp(`WORLD.hatch.x+0.5`, `WORLD.hatch.y+3.5`);
  await ev(`(function(){ G.buildings.walls=1; G.buildings.tower=1; G.buildings.garden=1; G.buildings.bench=1; try{World3D.refreshShelter()}catch(e){}
     while(G.survivors.length<4) recruit(); G.survivors[0].job='guard'; G.survivors[1].job='tower'; G.survivors[2].job='garden'; G.survivors[3].job='idle';
     for(const e of Combat.enemies.slice()) Combat.despawn(e); window.__wave=null; return 1 })()`);
  await unblock();
  await ev(`(function(){ Combat.startWave(8, r=>{window.__wave=r}); return Combat.barricadeMax })()`);
  for (let i = 0; i < 40 && (await ev('Combat.wave?Combat.wave.spawned:0')) < 3; i++) { await unblock(); await B.wait(500); }
  await B.wait(3000); await ev('R.zoomK=1.3;1'); await B.shot('c09a-wave');
  await B.wait(5000); await B.shot('c09b-wave-siege');
  B.log('wave state', await ev(`JSON.stringify({hp:Combat.barricadeHp,max:Combat.barricadeMax,alive:Combat.enemies.filter(e=>!e.dead).length,spawned:Combat.wave&&Combat.wave.spawned,states:Combat.enemies.filter(e=>!e.dead).map(e=>e.state).join(',')})`));
  for (let i = 0; i < 300 && !(await ev('window.__wave')); i++) {
    if (i % 20 === 0) await unblock();
    await ev(`(function(){ for(const e of Combat.enemies) if(!e.dead && e.wave && e.wave.spawned>=0) { if(Math.random()<0.2) Combat.hurtEnemy(e, 8); } G.p.hp=300; return 1})()`);
    await B.wait(150);
  }
  B.log('wave result', await ev(`JSON.stringify(window.__wave)`));
  /* ---- 7. survivors at work by day ---- */
  await setT(11); await ev('R.zoomK=1;1');
  await tp(`WORLD.hatch.x+0.5`, `WORLD.hatch.y+3.5`);
  await unblock(); await B.wait(4000); await B.shot('c10-survivors');
  B.log('survivors', await ev(`JSON.stringify(Combat.survivors.map(s=>s.job+':'+s.a.action+':'+s.x.toFixed(1)+','+s.y.toFixed(1)))`));
  /* ---- 8. ambient population at night in a dangerous district ---- */
  await setT(23);
  await tp(`nearestPoi('hospital',0,0).x+0.5`, `nearestPoi('hospital',0,0).y+3.5`);
  await unblock(); await B.wait(9000);
  B.log('ambient', await ev(`JSON.stringify({n:Combat.enemies.filter(e=>!e.dead).length, ids:Combat.enemies.filter(e=>!e.dead).map(e=>e.id+':'+e.state+':'+Math.hypot(e.x-G.p.x,e.y-G.p.y).toFixed(0)).join(' ')})`));
  await B.shot('c11-night-ambient');
  B.log('stats', JSON.stringify(await ev(`({fps:Math.round(Game.fps),calls:R.renderer.info.render.calls,tris:R.renderer.info.render.triangles,geos:R.renderer.info.memory.geometries,progs:R.renderer.info.programs.length})`)));
};
