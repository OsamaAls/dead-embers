/* Cinematics, animations and ambience: node tools/browser-check.js --scenario tools/scenarios/cinematic.js --shots <dir> [--mobile]
   - the backstory intro plays on the first new world started from the title (shots k01..k05), Space fast-forwards, Esc twice skips;
     a second new world does not replay it
   - every CUTSCENES id plays once (shots k10+), and not twice in the same world
   - an actor lineup of the new gestures, zombie moods, stagger and death variants (shot k40, k41)
   - Ambience.debugState(): sources only appear when their condition holds (night crickets, no birds at night, water only near water,
     rain bed only in rain, roof rain indoors, groans only with zombies in range, snarls when aware), master gain <= 0.12.
   Prints "STEP name: ok|FAIL detail". */
const fs = require('fs'), path = require('path');
module.exports = async B => {
  const ev = s => B.eval(s);
  let fails = 0;
  const step = async (name, code, okExpr) => {
    const t0 = Date.now(); let r; try { r = await ev(`(function(){ ${code} })()`); } catch (e) { r = { err: e.message.slice(0, 300) }; }
    let ok = false; try { ok = !r || r.err ? false : await ev(`(function(r){ return !!(${okExpr}); })(${JSON.stringify(r)})`); } catch (e) { ok = false; }
    if (!ok) fails++;
    B.log(`STEP ${name}: ${ok ? 'ok' : 'FAIL'} (${((Date.now() - t0) / 1000).toFixed(1)}s) ${JSON.stringify(r).slice(0, 900)}`);
    return r;
  };
  for (let i = 0; i < 120 && !(await ev(`typeof Game!=='undefined' && typeof Cine!=='undefined' && !!(R && R.renderer && R.scene)`)); i++) await B.wait(500);
  await ev(fs.readFileSync(path.join(__dirname, '..', 'harness.js'), 'utf8'));
  B.log('ua', await ev('navigator.userAgent'), 'autoIntro', await ev('Cine.autoIntro'));
  await step('watch the intro from the title (no world yet)', `UI.title(); const had=!!WORLD; window.__wi=0; Cine.intro(()=>{window.__wi=1}); const a=Cine.active; Cine.freeze=true; Cine.seek(1, 6); return {had, a, world:!!WORLD}`, '!r.had && r.a && r.world');
  await B.wait(600); await B.shot('k00-title-replay');
  await step('title replay skips back to the title', `Cine.freeze=false; Cine.skip(); return {active:Cine.active, done:window.__wi, title:!!document.querySelector('#title:not([hidden])')}`, '!r.active && r.done===1');
  await ev(`Cine.autoIntro = true; try{ localStorage.removeItem('deadembers_seen_intro'); }catch(e){} 1`);

  /* ---------- intro ---------- */
  await step('intro starts from the title', `UI.title('new'); const b=document.querySelector('[data-t=start]'); b&&b.click(); return {active:Cine.active, seen:Cine.introSeen(), q:Game.Q.map(q=>q.type+':'+(q.id||'')).join(',')}`, 'r.active && r.seen');
  await ev(`Cine.freeze = true; 1`);
  const introAt = [[0, 3.5], [1, 6], [2, 7], [3, 7], [4, 6.5], [4, 9.6]];
  for (let i = 0; i < introAt.length; i++) {
    await ev(`Cine.seek(${introAt[i][0]}, ${introAt[i][1]}); 1`); await B.wait(700);
    await B.shot(`k0${i + 1}-intro-${introAt[i][0]}`);
  }
  await ev(`Cine.freeze = false; Cine.seek(0, 0.2); 1`);
  await step('Space fast-forwards a shot', `const i0=Cine._i ? Cine._i() : 0; kd('Space'); ku('Space'); kd('Space'); ku('Space'); return {active:Cine.active, shot:Cine.shotIndex}`, 'r.active && r.shot>=1');
  await step('Esc twice skips the intro', `kd('Escape'); ku('Escape'); kd('Escape'); ku('Escape'); sim(0.2); return {active:Cine.active, blocking:UI.blocking(), q:Game.Q.length}`, '!r.active && r.blocking');
  await B.wait(300); await B.shot('k06-after-intro-cold-open');
  await step('second new world: no intro', `for(let i=0;i<8&&UI.blocking();i++){ skipDlg(); sim(0.3); } UI.title('new'); const b=document.querySelector('[data-t=start]'); b&&b.click(); sim(0.3); const act=Cine.active; return {active:act, blocking:UI.blocking()}`, '!r.active && r.blocking');
  await ev(`for(let i=0;i<10&&UI.blocking();i++){ skipDlg(); sim(0.3); } G.encTimer=1e9; 1`);

  /* ---------- cutscenes ---------- */
  const ids = await ev(`Object.keys(Cine.CUTSCENES)`);
  let n = 10;
  for (const id of ids) {
    const r = await step(`cutscene ${id}`, `clearFoes(); G.seenCine={}; G.buildings.radio=1; World3D.refreshShelter(); G.hour=12; G.isNight=false; G.p.x=WORLD.hatch.x+0.5; G.p.y=WORLD.hatch.y+1.5; Cine.cutscene('${id}'); const a=Cine.active, d=Cine.shotDur; Cine.freeze=true; const L=Cine._shots().length-1; Cine.seek(L, Cine._shots()[L].dur*0.62); return {active:a, dur:d}`, 'r.active && r.dur>=5 && r.dur<=15');
    await B.wait(600); await B.shot(`k${n++}-cut-${id}`);
    await step(`cutscene ${id} once`, `Cine.freeze=false; Cine.skip(); sim(0.1); Cine.cutscene('${id}'); const again=Cine.active; Cine.skip(); sim(1.2); return {again, active:Cine.active}`, '!r.again && !r.active');
  }

  /* ---------- actor lineup ---------- */
  await step('actor lineup', `clearFoes(); G.hour=11; G.isNight=false; R.setTime(11,0);
    let x0=0,y0=0,bs=1e9; const Vw=Cine._view; for(let ty=4;ty<H-16;ty++) for(let tx=4;tx<W-18;tx++){ let bad=0; for(let y=ty-1;y<ty+5;y++) for(let x=tx-1;x<tx+15;x++) if(solidAt(x+0.5,y+0.5)||indoors(x+0.5,y+0.5)||Vw.obstH(x+0.5,y+0.5)>0.5) bad++; if(bad) continue; const cx=tx+6.3, cy=ty+1.6; const sc=(Vw.camClear(cx,cy+9,9)?0:50)+Vw.losBlocked({x:cx,y:cy+9,h:9},{x:cx,y:cy,h:0.6},2)*5+Vw.losBlocked({x:cx-5,y:cy+9,h:9},{x:cx-6,y:cy,h:0.6},2)*3+Vw.losBlocked({x:cx+5,y:cy+9,h:9},{x:cx+6,y:cy,h:0.6},2)*3; if(sc<bs){bs=sc;x0=tx;y0=ty;} if(bs===0) break; }  window.__line=[];
    const L=(kind,x,y,name,o)=>{ const a=Actors.make(kind,o&&o.opts); R.scene.add(a.root); a.root.position.set(x*TILE,0,y*TILE); a.root.rotation.y=0.35; if(o&&o.carry) a.setCarry(o.carry); if(o&&o.mood) a.mood(o.mood); if(o&&o.die!=null) a.die(o.die); else if(name!=='idle') a.anim(name); for(let i=0;i<(o&&o.steps||18);i++) a.update(0.05,0); __line.push({a,x,y,name}); };
    const G1=['search','hammer','pickup','eat','bandage','inspect','handshake','wave','chat','cheer'];
    G1.forEach((g,i)=>L(i%2?'survivor':'player', x0+i*1.35, y0, g, {carry:g==='inspect'||g==='hammer'?(g==='hammer'?'hammer':'machete'):null, steps:g==='pickup'?7:g==='cheer'||g==='wave'?14:18}));
    const Z=[['walker','feed'],['walker','sway'],['runner','shuffle'],['walker','turn'],['brute','stagger'],['walker',0],['walker',1],['runner',2]];
    Z.forEach(([k,m],i)=>{ const x=x0+i*1.7, y=y0+3.2; if(typeof m==='number') L(k,x,y,'die '+m,{die:m,steps:30}); else if(m==='stagger') L(k,x,y,'stagger',{steps:5}); else L(k,x,y,m,{mood:m,steps:30}); });
    const cx=x0+6.3, cy=y0+1.6;
    Cine.play([{dur:60, cam:[{x:cx, y:cy+9, h:9}], look:[{x:cx, y:cy+0.4, h:0.6}], hour:11, fov:46}]); Cine.freeze=true; Cine.update(0);
    /* labels */
    const lab=document.createElement('div'); lab.id='__lab'; lab.style.cssText='position:absolute;inset:0;z-index:70;pointer-events:none;font:600 11px IBM Plex Mono,monospace;color:#ffb067;text-shadow:0 1px 3px #000';
    for(const it of __line){ const s=R.tileToScreen(it.x,it.y,2.6); const d=document.createElement('div'); d.textContent=it.name; d.style.cssText='position:absolute;transform:translate(-50%,-100%);left:'+s.x+'px;top:'+s.y+'px'; lab.appendChild(d); }
    document.getElementById('app').appendChild(lab);
    return {n:__line.length}`, 'r.n===18');
  await B.wait(250); await B.shot('k40-actor-lineup');
  await ev(`(function(){ Cine.seek(0,0); const cx=__line[13].x, cy=__line[13].y; const Vw=Cine._view; let best=null,bs=1e9; for(const [dx,dy,h] of [[1,4.2,2.6],[1,5.5,3.5],[1,7,5],[1,8.5,7]]){ const sc=(Vw.camClear(cx+dx,cy+dy,h)?0:50)+Vw.losBlocked({x:cx+dx,y:cy+dy,h},{x:cx+1.2,y:cy,h:0.6},1.5)*5+dy*0.3; if(sc<bs){bs=sc;best={x:cx+dx,y:cy+dy,h};} } Cine._shots()[0].cam=[best]; Cine._shots()[0].look=[{x:cx+1.2, y:cy, h:0.6}]; Cine.update(0); const l=document.getElementById('__lab'); l&&l.remove(); return 1})()`);
  await B.wait(250); await B.shot('k41-zombie-moods-close');
  await ev(`(function(){ for(const it of __line) it.a.dispose(); __line=[]; Cine.freeze=false; Cine.skip(); sim(1.2); return 1})()`);

  /* ---------- ambience ---------- */
  await step('ambience: master gain', `const s=Ambience.debugState(true); return {master:s.master, volume:s.volume}`, 'r.master>0 && r.master<=0.12');
  const findSpot = `window.__spot=(want)=>{ for(let k=0;k<4000;k++){ const x=2+Math.random()*(W-4), y=2+Math.random()*(H-4); if(solidAt(x,y)||indoors(x,y)) continue; G.p.x=x; G.p.y=y; const s=Ambience.scan(); if(want(s.info, s)) return {x:+x.toFixed(1), y:+y.toFixed(1)}; } return null; }; 1`;
  await ev(findSpot);
  await step('ambience: night insects on grass, no birds at night', `clearFoes(); G.weather='clear'; G.season='autumn'; G.hour=23; G.minute=0; G.isNight=true; const sp=__spot(i=>i.grass>4 && i.water==null && i.trees>3 && i.weather==='clear' && !/forest/.test(i.biome||'')); const s=Ambience.debugState(true); return {sp, crickets:s.beds.crickets||0, birds:s.sources.filter(x=>x.src==='chirp').length, owl:s.sources.some(x=>x.src==='owl'), night:s.night}`, 'r.sp && r.crickets>0 && r.birds===0');
  await step('ambience: birds by day near trees, no crickets', `G.hour=10; G.isNight=false; G.weather='clear'; const s=Ambience.debugState(true); return {birds:s.sources.filter(x=>x.src==='chirp').length, crickets:s.beds.crickets||0, trees:s.trees}`, 'r.birds>0 && !r.crickets');
  await step('ambience: quiet street at noon is near silent', `G.hour=12; G.weather='clear'; const sp=__spot((i,s)=>tileAt(Math.floor(G.p.x),Math.floor(G.p.y))===T_ROAD && Object.values(s.beds).reduce((a,b)=>a+b,0)<0.12 && !s.emit.some(e=>e.key)); clearFoes(); const s=Ambience.debugState(true); const loud=Object.values(s.beds).reduce((a,b)=>a+b,0); return {sp, beds:s.beds, n:s.sources.length, loud:+loud.toFixed(3)}`, 'r.sp && r.loud<0.12');
  await step('ambience: water only near water', `G.hour=12; const near=__spot(i=>i.water!=null && i.water<4); const a=Ambience.debugState(true); const far=__spot(i=>i.water==null); const b=Ambience.debugState(true); return {near, waterNear:a.beds.water||0, pan:(a.sources.find(x=>x.src==='water')||{}).at, far, waterFar:b.beds.water||0}`, 'r.near && r.waterNear>0.05 && r.far && !r.waterFar');
  await step('ambience: rain bed only in rain, roof rain indoors', `G.weather='clear'; __spot(i=>!i.indoors); const a=Ambience.debugState(true); G.weather='rain'; const b=Ambience.debugState(true);
    let inside=null; for(const r of WORLD.roofs){ if(r.closed) continue; for(let y=r.y+1;y<r.y+r.h-1&&!inside;y++) for(let x=r.x+1;x<r.x+r.w-1&&!inside;x++) if(indoors(x+0.5,y+0.5)&&!solidAt(x+0.5,y+0.5)) inside={x:x+0.5,y:y+0.5}; if(inside) break; }
    G.p.x=inside.x; G.p.y=inside.y; const c=Ambience.debugState(true); G.weather='clear';
    return {clearRain:a.beds.rain||0, rain:b.beds.rain||0, inRain:c.beds.rain||0, roof:c.beds.roofrain||0, inWind:c.beds.wind||0, room:c.beds.room||0, indoors:c.indoors}`, '!r.clearRain && r.rain>0 && !r.inRain && r.roof>0 && !r.inWind && r.room>0 && r.indoors');
  await step('ambience: groans only with zombies in range, snarls when aware', `G.weather='clear'; G.hour=12; G.isNight=false; __spot(i=>!i.indoors); clearFoes(); const a=Ambience.debugState(true).sources.filter(x=>/moan|snarl/.test(x.src)).length;
    const e=Combat.spawnAt('walker', G.p.x+4, G.p.y); const b=Ambience.debugState(true).sources.filter(x=>x.src==='moan'); e.state='chase'; e.aware=1; const c=Ambience.debugState(true).sources.filter(x=>x.src==='snarl');
    e.x=G.p.x+30; const d=Ambience.debugState(true).sources.filter(x=>/moan|snarl/.test(x.src)).length; clearFoes();
    return {none:a, moan:b.length, moanAt:b[0]&&b[0].at, snarl:c.length, far:d}`, 'r.none===0 && r.moan===1 && r.snarl===1 && r.far===0');
  await step('ambience: docks cranes creak in the wind, forest quiet in snow, wading sloshes', `G.hour=12; G.isNight=false; G.weather='rain'; const cr=(WORLD.decos||[]).find(d=>d.kind==='crane'); let crane=null; if(cr){ G.p.x=cr.x+0.5; G.p.y=cr.y+(cr.h||1)+2; if(solidAt(G.p.x,G.p.y)) G.p.y+=1.5; crane=Ambience.debugState(true).sources.filter(x=>x.src==='crane').length; }
    G.weather='clear'; const calm=cr?Ambience.debugState(true).sources.filter(x=>x.src==='crane').length:0;
    const fs=__spot(i=>/forest/.test(i.biome||'') && i.trees>5); G.hour=11; const fday=Ambience.debugState(true).sources.filter(x=>/^(woodpecker|crack)$/.test(x.src)).length; G.weather='snow'; const fsnow=Ambience.debugState(true).sources.filter(x=>/^(woodpecker|crack)$/.test(x.src)).length; G.weather='clear';
    let wade=null; for(let y=1;y<H-1&&!wade;y++) for(let x=1;x<W-1;x++) if(tileAt(x,y)===T_SHALLOW){ wade={x:x+0.5,y:y+0.5}; break; } let slosh=null; if(wade){ G.p.x=wade.x; G.p.y=wade.y; sim(0.6,i=>{ G.p.x+= (i%2?0.05:-0.05); }); slosh=Ambience.debugState(true).sources.some(x=>x.src==='slosh'); }
    return {crane, calm, forest:!!fs, fday, fsnow, wade:!!wade, slosh}`, '(r.crane==null || (r.crane>0 && r.calm===0)) && (!r.forest || (r.fday>0 && r.fsnow===0)) && (!r.wade || r.slosh)');
  await step('ambience: fires crackle from their spot', `const f=World3D.fires.find(f=>!f.hatch)||World3D.fires[0]; G.p.x=f.x+2; G.p.y=f.y+2; if(solidAt(G.p.x,G.p.y)){G.p.x=f.x; G.p.y=f.y+1.5;} const s=Ambience.debugState(true); G.p.x=WORLD.hatch.x+0.5; G.p.y=WORLD.hatch.y+1.5; return {fire:s.beds.fire||0, crackles:s.sources.filter(x=>x.src==='crackle').length}`, 'r.fire>0 && r.crackles>0');
  await step('ambience: ducks in a cutscene, silent on the title', `sim(0.5); const a=Ambience.debugState().duck; Cine.play([{dur:3, cam:[{x:G.p.x, y:G.p.y+8, h:8}], look:[{x:G.p.x,y:G.p.y,h:0}]}]); sim(1.5); const b=Ambience.debugState().duck; Cine.skip(); sim(1); return {play:a, cine:b}`, 'r.play>0.5 && r.cine<0.5');
  B.log('ambience sample', JSON.stringify(await ev(`(function(){ const s=Ambience.debugState(true); return {beds:s.beds, sources:s.sources.slice(0,8), weather:s.weather, wind:s.wind, openness:s.openness}; })()`)));
  B.log(`CINEMATIC ${fails ? 'FAIL ' + fails : 'OK'}`);
  if (fails) process.exitCode = 1;
};
