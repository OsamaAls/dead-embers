/* Phone layout check: node tools/browser-check.js --mobile --scenario tools/scenarios/layout.js [--shots dir]
   Puts every HUD piece and touch button on screen at once (needs, chips, companion with FETCH, minimap, toasts, banner, hint,
   USE, TARGET, THROW), then at three landscape phone sizes measures them and fails when two of them overlap, a button is smaller
   than 40 px, or anything leaves the screen. Also checks that portrait shows the "turn your phone" card and pauses. */
module.exports = async B => {
  let fails = 0;
  const ok = (name, pass, detail) => { if (!pass) fails++; B.log(`STEP ${name}: ${pass ? 'ok' : 'FAIL'}${detail != null ? ' ' + JSON.stringify(detail) : ''}`); };
  for (let i = 0; i < 60 && !(await B.eval(`typeof Game!=='undefined' && !!(R && R.renderer) && !!document.querySelector('#title [data-t]')`)); i++) await B.wait(250);
  await B.eval(`Game.newGame('Tester','scavenger'); 1`); await B.wait(600);
  /* the intro (and any cutscene) has to be gone first: blocked screens hide the touch controls */
  for (let i = 0; i < 40 && await B.eval(`UI.blocking() || Game.Q.length > 0 || (typeof Cine!=='undefined' && !!Cine.active)`); i++) {
    await B.eval(`(function(){ if (typeof Cine!=='undefined' && Cine.active) { Cine.skip(); return 1; } const b=[...document.querySelectorAll('#dlg button:not([disabled])')]; if (b.length) b[b.length-1].click(); return 1; })()`);
    await B.key('Enter'); await B.wait(250);
  }
  /* everything at once */
  const fill = `(function(){ G.encTimer=1e9; unlock('needs'); unlock('journal'); unlock('people'); unlock('fetch'); G.day=2; G.p.points=1; G.p.status.bleeding=3; G.p.status.injured=3;
    adoptDog('Ash'); G.dog.since=0; give('bottle',2); give('pistol',1); give('ammo',9); recruit();
    Combat.spawnFight(['walker','walker'], {at:{x:G.p.x+4,y:G.p.y}}); UI.prompt('E  Search the shelf', null);
    UI.toast('+2 Canned Food','loot'); UI.toast('+1 Water','loot'); UI.toast('Built Bunks','good'); UI.banner('Screamer','It has seen you.'); UI.hint('Hold E to search. Perception makes it faster.'); return 1; })()`;
  await B.eval(fill); await B.wait(900);
  const measure = `(function(){
    const ids=['.hud-tl','#obj','#mm','.hbtns','#wpn','#toasts','#hint','#t-atk','#t-dodge','#t-use','#t-crouch','#t-tgt','#t-throw','#t-fetch','#banner'];
    const vis=n=>{ if(!n) return false; const cs=getComputedStyle(n); if(cs.display==='none'||cs.visibility==='hidden'||n.hidden) return false; let p=n.parentElement; while(p){ if(p.hidden||getComputedStyle(p).display==='none') return false; p=p.parentElement; } const r=n.getBoundingClientRect(); return r.width>0&&r.height>0; };
    const out={}; for(const s of ids){ const n=document.querySelector(s); if(!vis(n)) continue; const r=n.getBoundingClientRect(); out[s]={x:r.left,y:r.top,w:r.width,h:r.height,round:n.classList.contains('tb')&&getComputedStyle(n).borderRadius==='50%'}; }
    return {W:innerWidth,H:innerHeight,phone:document.body.classList.contains('phone'),r:out}; })()`;
  const sizes = [[844, 390], [740, 360], [932, 430], [667, 375]];
  for (const [w, h] of sizes) {
    await B.viewport(w, h); await B.eval(`UI.toast('+1 Cloth','loot'); UI.banner('Screamer','It has seen you.'); 1`); await B.wait(700);
    const m = await B.eval(measure), r = m.r, keys = Object.keys(r), bad = [];
    /* the banner overlays the toasts on purpose (toasts fade while it shows) */
    const skip = (a, b) => [a, b].includes('#banner') && (['#toasts', '#hint'].includes(a) || ['#toasts', '#hint'].includes(b));
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const a = r[keys[i]], b = r[keys[j]]; if (skip(keys[i], keys[j])) continue;
      let hit;
      if (a.round && b.round) { const d = Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2); hit = d < (a.w + b.w) / 2 - 1; }
      else hit = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
      if (hit) bad.push(keys[i] + ' x ' + keys[j]);
    }
    const small = keys.filter(k => /^#t-|\.hbtns/.test(k) && (r[k].h < 40 || (r[k].w < 40))).map(k => k + ' ' + Math.round(r[k].w) + 'x' + Math.round(r[k].h));
    const off = keys.filter(k => r[k].x < -1 || r[k].y < -1 || r[k].x + r[k].w > m.W + 1 || r[k].y + r[k].h > m.H + 1);
    ok(`${w}x${h} phone layout`, m.phone, keys.length + ' pieces');
    ok(`${w}x${h} nothing overlaps`, !bad.length, bad);
    ok(`${w}x${h} buttons are 40px+`, !small.length, small);
    ok(`${w}x${h} all on screen`, !off.length, off);
    await B.shot(`layout-${w}x${h}`);
  }
  /* nothing to use: the USE button is gone */
  await B.viewport(844, 390); await B.eval(`(function(){ Combat.clear && Combat.clear(); G.p.x=WORLD.hatch.x+0.5; G.p.y=WORLD.hatch.y+5.5; return 1; })()`); await B.wait(400);
  const use = await B.eval(`(function(){ const t=interactTarget(); return {t:t&&t.label, act:!!t&&t.time>=0, shown:getComputedStyle(document.getElementById('t-use')).display!=='none'}; })()`);
  ok('USE shows only when there is something to do', use.shown === use.act, use);
  /* portrait: the card shows and the game pauses */
  await B.viewport(390, 844); await B.wait(400);
  const port = await B.eval(`({card:getComputedStyle(document.getElementById('rotate')).display, blocking:UI.blocking()})`);
  ok('portrait shows the turn-your-phone card and pauses', port.card === 'flex' && port.blocking, port);
  await B.shot('layout-portrait');
  await B.viewport(844, 390); await B.wait(400);
  ok('back to landscape resumes', !(await B.eval('UI.blocking()')));
  if (fails) throw new Error(fails + ' layout step(s) failed');
};
