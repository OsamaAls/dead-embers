/* Companions and world interactions: node tools/browser-check.js --scenario tools/scenarios/companions.js [--mobile] [--shots dir]
   Dog: adopted via the story flag path, follows on a run, sniffs out an unsearched container, growls at aware zombies, a bite stuns.
   Helper: a survivor follows and fights, carries +8 kg, is downed and revived with hold E. Talk to a survivor and assign a job.
   Siphon a wreck, fill a bottle at the river, read a wall, crows on a body, search it, pump clean water, rest in a bed,
   cook at a fire, barricade a door and watch a zombie stop at it.
   Prints "STEP name: ok|FAIL detail" and throws if any step failed. */
const fs = require('fs'), path = require('path');
module.exports = async B => {
  const ev = s => B.eval(s);
  let fails = 0;
  const step = async (name, code, okExpr) => {
    let r; try { r = await ev(`(function(){ ${code} })()`); } catch (e) { r = { err: e.message.slice(0, 300) }; }
    const ok = !r || r.err ? false : await ev(`(function(r){ return !!(${okExpr}); })(${JSON.stringify(r)})`);
    if (!ok) fails++;
    B.log(`STEP ${name}: ${ok ? 'ok' : 'FAIL'} ${JSON.stringify(r)}`);
    return r;
  };
  for (let i = 0; i < 120 && !(await ev(`typeof Game!=='undefined' && !!(R && R.renderer && R.scene)`)); i++) await B.wait(500);
  await ev(fs.readFileSync(path.join(__dirname, '..', 'harness.js'), 'utf8'));
  await ev(`localStorage.setItem('deadembers_seen_intro','1'); 1`);
  /* helpers kept in the page */
  await ev(`window.safeHp = () => { G.p.hp = G.p.maxHp; }; window.calm = () => { clearFoes(); G.encTimer = 1e9; G.hour = 10; G.minute = 0; G.isNight = false; G.noise = 0; };
    window.tileNear = (pred, from) => { let best = null, bd = 1e9; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { if (!pred(x, y)) continue; const d = (x - from.x) ** 2 + (y - from.y) ** 2; if (d < bd) { bd = d; best = { x, y }; } } return best; };
    window.openNb = (t) => [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([a, b]) => [t.x + a, t.y + b]).find(([x, y]) => !solidAt(x + 0.5, y + 0.5) && path(x + 0.5, y + 0.5));
    window.label = () => { const t = interactTarget(); return t ? t.label : null; }; 1`);

  await step('new world', `Game.newGame('Tester','soldier'); sim(0.2); let n=0; while((UI.blocking()||Game.Q.length)&&n<14){ skipDlg(); sim(0.5); n++; } calm(); G.day=3; return {running:Game.running, blocking:UI.blocking()}`, 'r.running && !r.blocking');

  /* ---------- the dog ---------- */
  await step('adopt the dog (Biscuit, teodor_4 path)', `setFlag('dog_biscuit'); adoptDog('Biscuit'); sim(0.4); const c=Combat.companion; return {kind:c&&c.kind, name:c&&c.name, flag:!!G.flags.dog_adopted, chip:!document.getElementById('cmp').hidden}`, "r.kind==='dog' && r.name==='Biscuit' && r.flag && r.chip");
  await step('dog follows on a run', `calm(); const o=nearestPoi('supermarket',G.p.x,G.p.y); goto(o.x+0.5,o.y+2.5,0.8,60); calm(); sim(2); const c=Combat.companion; return {d:+Math.hypot(c.x-G.p.x,c.y-G.p.y).toFixed(2), away:!G.atShelter}`, 'r.d < 3.5 && r.away');
  await B.shot('c01-dog-follows');
  await step('dog sniffs an unsearched container', `calm(); let found=null; sim(10, () => { calm(); safeHp(); const c=Combat.companion; if (c && c.sniff) { found=c.sniff; return 'stop'; } }); const c=Combat.companion;
    return found ? {kind:found.kind, state:containerState(found), d:+Math.hypot(found.x+0.5-c.x, found.y+0.5-c.y).toFixed(1), sniffs:c.sniffs} : {none:true}`, "r.kind && r.state!=='empty' && r.d<=12.5");
  await B.shot('c02-dog-sniff');
  await step('R does nothing on the first day', `calm(); kd('KeyR'); ku('KeyR'); sim(0.5); return {fetching:!!Combat.companion.fetch, unlocked:isUnlocked('fetch')}`, '!r.fetching && !r.unlocked');
  await step('after a day together, R: the dog fetches one item', `calm(); G.dog.since=G.day-1; checkUnlocks(); sim(0.3, skipDlg);
    const tot=()=>Object.keys(G.pack).reduce((s,k)=>s+G.pack[k],0); const n0=tot(); kd('KeyR'); ku('KeyR'); sim(0.2); const c=Combat.companion, F=c.fetch, k=F&&F.k, st0=k&&containerState(k);
    let near=99, back=false; sim(30, () => { calm(); safeHp(); if (c.fetch) near=Math.min(near, Math.hypot(c.x-k.x-0.5,c.y-k.y-0.5)); else { back=true; return 'stop'; } });
    const btn=document.getElementById('t-fetch');
    return {started:!!F, kind:k&&k.kind, near:+near.toFixed(1), back, got:tot()-n0, stays:k&&containerState(k)===st0, btnShown:INPUT.touch?!btn.hidden:null, unlocked:isUnlocked('fetch')}`, 'r.started && r.back && r.got===1 && r.near<1.6 && r.stays && r.unlocked');
  await B.shot('c02b-dog-fetched');
  await step('fetch has a cooldown', `calm(); kd('KeyR'); ku('KeyR'); sim(0.3); const now=!!Combat.companion.fetch; sim(95, () => { clearFoes(); G.encTimer=1e9; safeHp(); }); kd('KeyR'); ku('KeyR'); sim(0.3); const later=!!Combat.companion.fetch; Combat.companion.fetch=null; return {now, later}`, '!r.now && r.later');
  await step('dog warns and bites (stun)', `calm(); const p=G.p; const sp=tileNear((x,y)=>!solidAt(x+0.5,y+0.5)&&Math.hypot(x-p.x,y-p.y)>3&&Math.hypot(x-p.x,y-p.y)<5, p);
    const e=Combat.spawnAt('walker', sp.x+0.5, sp.y+0.5, {aware:true}); e.hp=e.maxHp=60; const c=Combat.companion; const w0=c.warned, b0=c.bites; let stun=0;
    sim(12, () => { safeHp(); G.encTimer=1e9; if (c.bites>b0 && !stun) { stun=e.stun; return 'stop'; } }); return {warned:c.warned-w0, bites:c.bites-b0, stun:+stun.toFixed(2)}`, 'r.warned>=1 && r.bites>=1 && r.stun>0.3');
  await B.shot('c03-dog-bite');
  await step('dog pulls a walker off you', `clearFoes(); const g0=ENEMIES.walker.grab; ENEMIES.walker.grab=1; const p=G.p; const e=Combat.spawnAt('walker', p.x+1.1, p.y, {aware:true}); e.hp=e.maxHp=80; const c=Combat.companion, k0=c.pulls; let grabbed=false;
    sim(15, () => { if (G.p.hp<30) safeHp(); if (!grabbed) c.cd=9; if (Combat.grabbed && !grabbed) { grabbed=true; c.cd=0; } if (c.pulls>k0) return 'stop'; }); ENEMIES.walker.grab=g0; clearFoes(); return {grabbed, pulls:c.pulls-k0}`, 'r.grabbed && r.pulls>=1');

  /* ---------- a survivor helper ---------- */
  await step('helper comes along, carries +8 kg', `calm(); const cap0=carryCap(); const s=recruit({name:'Ada Test', trait:'medic', skills:{combat:5}}); s.hp=100; const ok=setCompanion('survivor', s.id); sim(0.5); const c=Combat.companion;
    return {ok, kind:c&&c.kind, gun:c&&c.gun, cap:carryCap()-cap0, id:s.id}`, "r.ok && r.kind==='survivor' && r.gun && r.cap===8");
  await step('helper fights', `calm(); const p=G.p, c=Combat.companion, h0=c.hits; const sp=tileNear((x,y)=>!solidAt(x+0.5,y+0.5)&&Math.hypot(x-p.x,y-p.y)>4&&Math.hypot(x-p.x,y-p.y)<6, p);
    for (let i=0;i<2;i++) Combat.spawnAt('walker', sp.x+0.5, sp.y+0.5+i*0.3, {aware:true}); sim(15, () => { safeHp(); if (!Combat.enemies.some(e=>!e.dead)) return 'stop'; }); return {hits:c.hits-h0, alive:Combat.enemies.filter(e=>!e.dead).length}`, 'r.hits>=1');
  await B.shot('c04-helper-fights');
  await step('helper downed, revived with hold E', `calm(); const c=Combat.companion, s=companionSurvivor(); s.hp=2; const p=G.p;
    const e=Combat.spawnAt('walker', c.x+(c.x>=p.x?0.8:-0.8), c.y, {aware:true}); e.hp=e.maxHp=400; sim(10, () => { safeHp(); if (c.mode==='downed') return 'stop'; }); const down=c.mode==='downed'; clearFoes();
    goto(c.x, c.y+0.6, 0.7, 10); const lb=label(); holdE(3.5, () => c.mode!=='downed'); return {down, label:lb, mode:c.mode, hp:s.hp}`, "r.down && /Help/.test(r.label) && r.mode==='follow' && r.hp>=30");
  await B.shot('c05-helper-revived');

  /* ---------- talk to a survivor at the bunker, assign a job ---------- */
  await step('talk to a survivor, assign a job', `calm(); clearCompanion(); goto(WORLD.hatch.x+0.5, WORLD.hatch.y+1.5, 0.6, 90); calm(); const b=recruit({name:'Bo Test', trait:'cheerful'}); b.job='idle'; sim(1.5); const s=Combat.survivors.find(o=>o.id===b.id);
    if (!s) return {noActor:true}; goto(s.x, s.y, 0.9, 10); sim(0.1); const lb=label(); kd('KeyE'); ku('KeyE'); sim(0.2); for (let i=0;i<4&&dlgButtons().length<3;i++){ kd('Space'); ku('Space'); sim(0.2); }
    const opts=dlgButtons().map(x=>x.textContent); const j=dlgButtons().find(x=>/need you on/.test(x.textContent)); j&&j.click(); sim(0.2); for (let i=0;i<4&&dlgButtons().length<3;i++){ kd('Space'); ku('Space'); sim(0.2); }
    const g=dlgButtons().find(x=>/^\\d?Guard/.test(x.textContent.trim())); g&&g.click(); sim(0.2); for (let i=0;i<6&&UI.blocking();i++){ kd('Space'); ku('Space'); sim(0.2); } const who=(lb||'').replace(/^.*Talk to /,''); const t=G.survivors.find(o=>o.name===who)||b; return {label:lb, opts:opts.length, job:t.job}`, "/Talk to /.test(r.label) && r.opts>=5 && r.job==='guard'");
  await B.shot('c06-talk');

  /* ---------- world interactions ---------- */
  await step('siphon a wreck (hose)', `calm(); const t=tileNear((x,y)=>tileAt(x,y)===T_CAR&&!carSiphoned(x,y)&&!containerNear(x+0.5,y+0.5,2.2)&&!propNear(WORLD.bodies,x+0.5,y+0.5,3.2)&&!!openNb({x,y}), G.p); const n=openNb(t); goto(n[0]+0.5,n[1]+0.5,0.3,90); calm(); G.pack.hose=1; const f0=G.pack.fuel||0; const lb=label(); holdE(4); return {label:lb, fuel:(G.pack.fuel||0)-f0, done:carSiphoned(t.x,t.y)}`, '/Siphon/.test(r.label) && r.fuel>=1 && r.done');
  await step('fill a bottle at the water', `calm(); const t=tileNear((x,y)=>tileAt(x,y)===T_WATER&&!!openNb({x,y}), G.p); const n=openNb(t); goto(n[0]+0.5,n[1]+0.5,0.3,120); calm(); G.pack.bottle=2; const d0=G.pack.dirtywater||0; const lb=label(); holdE(2.5); return {label:lb, dirty:(G.pack.dirtywater||0)-d0, bottles:G.pack.bottle}`, '/bottle/.test(r.label) && r.dirty===1 && r.bottles===1');
  await B.shot('c07-water');
  /* ---------- world props: notes, bodies (with crows), pumps, beds ---------- */
  await ev(`window.openAt = (x, y) => typeof districtOpen !== 'function' || districtOpen(biomeAt(x + 0.5, y + 0.5));
    window.nearestProp = (list, ok) => list.filter(o => openAt(o.x, o.y) && (!ok || ok(o))).sort((a, b) => Math.hypot(a.x - G.p.x, a.y - G.p.y) - Math.hypot(b.x - G.p.x, b.y - G.p.y))[0]; 1`);
  await step('read writing on a wall', `calm(); const n=nearestProp(WORLD.notes, o=>!!path(o.x+0.5,o.y+0.5)); goto(n.x+0.5,n.y+0.5,0.3,150); calm(); const lb=label(); const j0=G.journal.length; kd('KeyE'); ku('KeyE'); sim(0.3);
    return {label:lb, place:n.place||null, read:!!(G.notesRead&&G.notesRead[n.x+','+n.y]), journal:G.journal.length-j0, title:G.journal[0].title}`, "/Read the writing/.test(r.label) && r.read && r.journal===1 && r.title==='Written on a wall'");
  await B.shot('c08a-note');
  await step('crows settle on a body by day, lift off as you come close', `calm(); const b=nearestProp(WORLD.bodies, o=>!o.in && !(G.bodies&&G.bodies[o.x+','+o.y]) && !!path(o.x+0.5,o.y+0.5)); window.__body=b;
    const cand=[]; for (let y=b.y-11;y<=b.y+11;y++) for (let x=b.x-11;x<=b.x+11;x++) { const d=Math.hypot(x-b.x,y-b.y); if (d>=9&&d<=11&&!solidAt(x+0.5,y+0.5)&&openAt(x,y)) cand.push([x+0.5,y+0.5]); }
    cand.sort((p,q)=>Math.hypot(p[0]-G.p.x,p[1]-G.p.y)-Math.hypot(q[0]-G.p.x,q[1]-G.p.y)); const far=cand.find(q=>!!path(q[0],q[1])); goto(far[0],far[1],0.5,150); calm(); let ground=0; sim(40, () => { calm(); ground=World3D.crowsNear(b.x+0.5,b.y+0.5,2.5).ground.length; if (ground>=2) return 'stop'; });
    goto(b.x+0.5,b.y+0.5,0.6,40); calm(); sim(0.5); const c=World3D.crowsNear(b.x+0.5,b.y+0.5,2.5); return {ground, after:c.ground.length, air:c.air, flushed:+c.flushed.toFixed(1)}`, 'r.ground>=2 && r.after===0 && r.flushed<15');
  await B.shot('c08b-crows');
  await step('search a body', `calm(); const b=window.__body; let marked=0; const f=World3D.setBodySearched; World3D.setBodySearched=(x,on)=>{ marked++; return f.call(World3D,x,on); };
    goto(b.x+0.5,b.y+0.5,0.3,20); calm(); const lb=label(); const s0=JSON.stringify(G.pack); holdE(3); World3D.setBodySearched=f;
    return {label:lb, searched:!!(G.bodies&&G.bodies[b.x+','+b.y]), marked, got:JSON.stringify(G.pack)!==s0, again:label()}`, "/Search the body/.test(r.label) && r.searched && r.marked===1 && r.got && !/Search the body/.test(r.again||'')");
  await step('pump clean water', `calm(); const p=nearestProp(WORLD.pumps, o=>!!openNb(o)); const n=openNb(p); goto(n[0]+0.5,n[1]+0.5,0.3,200); calm(); G.pack.bottle=1; const w0=G.pack.water||0, d0=G.pack.dirtywater||0; const lb=label(); holdE(2.5);
    return {label:lb, water:(G.pack.water||0)-w0, dirty:(G.pack.dirtywater||0)-d0}`, "/Pump clean water/.test(r.label) && r.water===1 && r.dirty===0");
  await B.shot('c08c-pump');
  await step('rest in a bed indoors', `calm(); const b=nearestProp(WORLD.beds, o=>!!path(o.x+0.5,o.y+0.5)); goto(b.x+0.5,b.y+0.5,0.3,200); calm(); G.p.hp=50; const t0=G.hour*60+G.minute, d0=G.day; const lb=label(); holdE(2.5); unblock(8);
    return {kind:b.kind, label:lb, mins:(G.day-d0)*1440+G.hour*60+G.minute-t0, hp:Math.round(G.p.hp)}`, "/(bed|couch|cot)/.test(r.label) && r.mins>=55 && r.hp>50");
  await B.shot('c08d-bed');
  await step('cook at a fire', `calm(); const reach=f=>{ if (typeof districtOpen==='function' && !districtOpen(biomeAt(f.x,f.y))) return null; const n=openNb({x:Math.floor(f.x),y:Math.floor(f.y)}); return n && path(n[0]+0.5,n[1]+0.5) ? n : null; }; const f=(WORLD.fires||[]).slice().sort((a,b)=>Math.hypot(a.x-G.p.x,a.y-G.p.y)-Math.hypot(b.x-G.p.x,b.y-G.p.y)).find(reach); const n=reach(f); goto(n[0]+0.5,n[1]+0.5,0.3,150); calm();
    G.pack.dirtywater=1; const w0=G.pack.water||0; const lb=label(); holdE(3.5); return {label:lb, water:(G.pack.water||0)-w0, dirty:G.pack.dirtywater||0, d:+Math.hypot(f.x-G.p.x,f.y-G.p.y).toFixed(2)}`, '/at the fire/.test(r.label) && r.water===1 && !r.dirty');
  await B.shot('c08-cook');
  await step('barricade a door, a zombie stops at it', `calm(); const isDoor=(x,y)=>tileAt(x,y)===T_DOOR && buildingAt(x+0.5,y+0.5)>=0 && !inShelter(x+0.5,y+0.5) && tileAt(x,y-1)===T_FLOOR && !solidAt(x+0.5,y+1.5) && !!path(x+0.5,y+1.6) && (()=>{ const c=containerNear(x+0.5,y+1.65,1.7); return !c || containerState(c)==='empty'; })();
    const d=tileNear(isDoor, G.p); goto(d.x+0.5, d.y+1.65, 0.25, 150); calm(); G.pack.wood=4; const lb=label(); holdE(3.5); const barred=doorBarred(d.x,d.y);
    const e=Combat.spawnAt('walker', d.x+0.5, d.y-1.5, {aware:true}); const h0=Combat.doorHits; let maxY=-1;
    sim(4, () => { safeHp(); G.encTimer=1e9; if (!e.dead) maxY=Math.max(maxY,e.y); }); const held={hits:Combat.doorHits-h0, inside:maxY < d.y+0.95, hp:G.doorBars[d.y*W+d.x]||0};
    return {label:lb, barred, held, wood:G.pack.wood}`, "/Barricade the door/.test(r.label) && r.barred && r.held.inside && r.held.hits>=1 && r.wood===2");
  await B.shot('c09-door');
  await step('it breaks through in a few seconds', `let broke=null; sim(10, i => { safeHp(); if (!barredAny()) { broke=(i+1)/20; return 'stop'; } }); return {broke}`, 'r.broke!==null'); // the first frame counts: the bar can be one hit from breaking

  B.log(fails ? `COMPANIONS: ${fails} step(s) failed` : 'COMPANIONS: all steps ok');
  if (fails) throw new Error(fails + ' companions step(s) failed');
};
