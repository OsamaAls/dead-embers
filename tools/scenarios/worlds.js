/* Saved worlds: node tools/browser-check.js --scenario tools/scenarios/worlds.js [--mobile] [--shots dir]
   Keys only for the menus: three new worlds from the title (arrows + Enter), play a bit in each (harness goto), Save now from the
   pause menu, Quit to title; reload the page; the Worlds list shows all three; load each and check day + position; die in one
   (memorial, not continuable); delete one through the confirm step. Prints "STEP name: ok|FAIL detail", throws if any failed. */
const fs = require('fs'), path = require('path');
module.exports = async B => {
  let fails = 0;
  const ev = s => B.eval(s);
  const ok = (name, pass, detail) => { if (!pass) fails++; B.log(`STEP ${name}: ${pass ? 'ok' : 'FAIL'}${detail != null ? ' ' + JSON.stringify(detail) : ''}`); };
  const press = async (code, n, ms) => { for (let i = 0; i < (n || 1); i++) { await B.key(code, 40); await B.wait(ms || 110); } };
  const titleFocus = () => ev(`(function(){ const f=document.querySelector('#title .kf'); if(!f) return null; const r=f.closest('.wrow'); return {t:f.dataset.t||'', text:f.textContent.trim(), row:r?r.dataset.w:null}; })()`);
  const waitTitle = async () => { for (let i = 0; i < 80 && !(await ev(`typeof Game!=='undefined' && !!(R && R.renderer) && !!document.querySelector('#title [data-t]')`)); i++) await B.wait(250); };
  const harness = () => ev(fs.readFileSync(path.join(__dirname, '..', 'harness.js'), 'utf8'));
  /* title: move the ring with ArrowDown until the focused button's text matches, then Enter */
  const titlePick = async re => { for (let i = 0; i < 8; i++) { const f = await titleFocus(); if (f && re.test(f.text)) { await press('Enter', 1, 400); return true; } await press('ArrowDown'); } return false; };
  /* worlds list: ring onto row id's Load ('load') or Delete ('del') */
  const worldsTo = async (id, kind) => {
    for (let i = 0; i < 30; i++) {
      const f = await titleFocus(); if (f && f.row === id && f.t === kind) return true;
      await press(f && f.row === id && kind === 'del' && f.t === 'load' ? 'ArrowRight' : 'ArrowDown', 1, 80);
    }
    return false;
  };
  const drain = async () => {
    for (let i = 0; i < 60 && await ev(`UI.blocking() || Game.Q.length > 0 || (typeof Cine!=='undefined' && !!Cine.active)`); i++) {
      if (await ev(`typeof Cine!=='undefined' && !!Cine.active`)) { await press('Escape', 2, 80); continue; }
      await press(i % 3 === 2 ? 'Space' : 'Enter', 1, 200);
      await ev(`sim(0.3)`);
    }
  };
  const menuTo = async row => { for (let i = 0; i < 8; i++) { if ((await ev(`(document.querySelector('#pnl .kf')||{dataset:{}}).dataset.row`)) === row) return true; await press('ArrowDown'); } return false; };

  await waitTitle();
  await ev(`localStorage.clear(); localStorage.setItem('deadembers_seen_intro','1'); UI.title(); 1`);
  await harness();
  const made = [];
  const names = ['Ashfall Test', 'Cinder Road Test', 'Grey Harbour Test'];
  for (let k = 0; k < 3; k++) {
    const picked = await titlePick(/New world/);
    await ev(`(function(){ const i=document.getElementById('ng-world'); i.value=${JSON.stringify(names[k])}; return 1; })()`);
    await press('ArrowRight', k);
    if (k === 0) await B.shot('w00-newworld');
    await press('Enter', 1, 900);
    await drain();
    const started = await ev(`Game.running && G.worldName`);
    const w = await ev(`(function(){ G.encTimer=1e9; INPUT.mx=${k === 1 ? 1 : 0}; INPUT.my=${k === 1 ? 0 : 1}; sim(0.8 + ${k} * 0.6); INPUT.mx=INPUT.my=0; G.day=${2 + k}; sim(0.5); return {id:G.slot, name:G.worldName, bg:G.p.bg, day:G.day, x:+G.p.x.toFixed(2), y:+G.p.y.toFixed(2)}; })()`);
    await press('Escape', 1, 250);
    const saveRow = await menuTo('save'); await press('Enter', 1, 250);
    const toastSaved = await ev(`[...document.querySelectorAll('#toasts .toast')].some(t=>/Saved/.test(t.textContent))`);
    const quitRow = await menuTo('quit'); await press('Enter', 1, 500);
    const onTitle = await ev(`UI.state.title && !Game.running`);
    w.slotSaved = await ev(`listWorlds().some(x=>x.id===${JSON.stringify(w.id)} && x.day===${w.day})`);
    made.push(w);
    ok(`world ${k + 1} created, played, saved`, picked && started === names[k] && saveRow && toastSaved && quitRow && onTitle && w.slotSaved, w);
  }

  await ev(`setTimeout(()=>location.reload(), 30); 1`);
  await B.wait(2500); await waitTitle(); await B.wait(400); await harness();
  const listed = await ev(`listWorlds().map(w=>w.name)`);
  ok('three worlds after a reload', made.every(w => listed.includes(w.name)) && listed.length === 3, listed);
  const contTxt = await ev(`(document.querySelector('#title [data-t=cont]')||{textContent:''}).textContent`);
  ok('continue offers the last world played', contTxt.includes(made[2].name), contTxt);
  await titlePick(/^Worlds/);
  const rows = await ev(`[...document.querySelectorAll('#title .wrow')].map(r=>r.querySelector('.wi b').textContent)`);
  ok('worlds list shows all three', rows.length === 3, rows);
  await B.shot('w01-worlds');

  for (const w of made) {
    const there = await worldsTo(w.id, 'load'); await press('Enter', 1, 600);
    const st = await ev(`({running:Game.running, id:G.slot, name:G.worldName, day:G.day, x:+G.p.x.toFixed(2), y:+G.p.y.toFixed(2)})`);
    ok(`load ${w.name}`, there && st.running && st.id === w.id && st.day === w.day && Math.hypot(st.x - w.x, st.y - w.y) < 0.6, { want: w, got: st });
    await drain();
    await press('Escape', 1, 250); await menuTo('quit'); await press('Enter', 1, 500);
    await titlePick(/^Worlds/);
  }

  /* die in the second world: a memorial that cannot be continued */
  const dead = made[1];
  await worldsTo(dead.id, 'load'); await press('Enter', 1, 600); await drain();
  await ev(`G.p.hp = 0; G.deathCause = 'a test'; Hooks.onDeath(); sim(0.3); 1`);
  let endShown = false;
  for (let i = 0; i < 60 && !endShown; i++) {
    await B.wait(250);
    if (await ev(`typeof Cine!=='undefined' && !!Cine.active`)) { await press('Escape', 2, 80); continue; }
    endShown = await ev(`!document.getElementById('end').hidden && !!document.querySelector('#end [data-e=title]')`);
  }
  await B.wait(1100);
  for (let i = 0; i < 3 && !(await ev(`document.querySelector('#end [data-e=title]').classList.contains('kf')`)); i++) await press('ArrowLeft', 1, 150);
  await press('Enter', 1, 600);
  const deadMeta = await ev(`listWorlds().find(w=>w.id===${JSON.stringify(dead.id)})`);
  const contNow = await ev(`(document.querySelector('#title [data-t=cont]')||{textContent:''}).textContent`);
  ok('death leaves a memorial', endShown && deadMeta && deadMeta.ended && deadMeta.endId === 'death' && !contNow.includes(dead.name) && !(await ev(`loadWorld(${JSON.stringify(dead.id)})`)), { deadMeta, contNow });
  await titlePick(/^Worlds/);
  const mem = await ev(`(function(){ const r=[...document.querySelectorAll('#title .wrow')].find(r=>r.dataset.w===${JSON.stringify(dead.id)}); return r ? {mem:r.classList.contains('mem'), text:r.textContent.replace(/\\s+/g,' ').trim(), load:!!r.querySelector('[data-t=load]')} : null; })()`);
  ok('memorial row: "Fell on day", no Load', mem && mem.mem && /Fell on day/.test(mem.text) && !mem.load, mem);
  await B.shot('w02-memorial');

  /* delete the third world through the confirm step */
  const gone = made[2];
  const atDel = await worldsTo(gone.id, 'del'); await press('Enter', 1, 300);
  const conf = await ev(`(function(){ const f=document.querySelector('#title .kf'); return {t:f&&f.dataset.t, confirm:!!document.querySelector('#title .wrow.conf')}; })()`);
  await B.shot('w03-delete-confirm');
  await press('ArrowLeft', 1, 150);
  const onYes = (await titleFocus() || {}).t;
  await press('Enter', 1, 400);
  const after = await ev(`({list:listWorlds().map(w=>w.id), rows:document.querySelectorAll('#title .wrow').length})`);
  ok('delete with a confirm step', atDel && conf.confirm && conf.t === 'del-no' && onYes === 'del-yes' && !after.list.includes(gone.id) && after.rows === 2, { conf, onYes, after });
  await B.shot('w04-after-delete');
  await press('Escape', 1, 300);
  ok('Esc goes back to the title', await ev(`!!document.querySelector('#title [data-t=new]') && !document.querySelector('#title .wrow')`));

  B.log(fails ? `WORLDS: ${fails} step(s) failed` : 'WORLDS: all steps ok');
  if (fails) throw new Error(fails + ' worlds step(s) failed');
};
