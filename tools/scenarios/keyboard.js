/* Keyboard-only walkthrough: node tools/browser-check.js --scenario tools/scenarios/keyboard.js --shots <dir> [--mobile]
   No mouse events at all. Title -> new game (arrows pick a background) -> intro -> pack (use + drop) -> character point ->
   bunker tabs + sleep -> barter trade -> dialogue choice. Prints "STEP name: ok|FAIL detail" and throws if any step failed. */
module.exports = async B => {
  let fails = 0;
  const ev = s => B.eval(s);
  const ok = (name, pass, detail) => { if (!pass) fails++; B.log(`STEP ${name}: ${pass ? 'ok' : 'FAIL'}${detail != null ? ' ' + JSON.stringify(detail) : ''}`); };
  const press = async (code, n, ms) => { for (let i = 0; i < (n || 1); i++) { await B.key(code, 40); await B.wait(ms || 120); } };
  const panel = () => ev('UI.state.panel');
  /* close whatever the story queues (summary, scenes, night events) with Enter / Space only */
  const cine = () => ev(`typeof Cine!=='undefined' && !!Cine.active`);
  /* cutscenes: Esc twice skips; everything else (summary, scenes, night events) closes with Enter / Space */
  const drain = async () => {
    for (let i = 0; i < 80 && await ev(`UI.blocking() || Game.Q.length > 0 || (typeof Cine!=='undefined' && !!Cine.active)`); i++) {
      if (await cine()) { await press('Escape', 2, 80); await B.wait(200); continue; }
      await press(i % 3 === 2 ? 'Space' : 'Enter', 1, 250);
    }
  };
  const focusRow = () => ev(`(function(){ const r=document.querySelector('#pnl .kf'); return r ? r.dataset.row : null; })()`);
  for (let i = 0; i < 60 && !(await ev(`typeof Game!=='undefined' && !!(R && R.renderer) && !!document.querySelector('#title [data-t]')`)); i++) await B.wait(250);

  // title: arrows + Enter to New game
  await press('ArrowDown'); await press('ArrowUp');
  const tf = await ev(`(function(){ const b=[...document.querySelectorAll('#title [data-nav]')]; const n=b.find(x=>x.dataset.t==='new'); return {n:b.length, kf:(document.querySelector('#title .kf')||{}).textContent||''}; })()`);
  // move the ring onto "New game" (it is the last title button) and select it
  for (let i = 0; i < 3 && !/New (game|world)/.test((await ev(`(document.querySelector('#title .kf')||{}).textContent||''`))); i++) await press('ArrowDown');
  await B.shot('kb-00-title');
  await press('Enter', 1, 400);
  ok('title -> new game', await ev(`!!document.getElementById('ng-name')`), tf);

  // background cards: arrows pick, Enter starts
  const bg0 = await ev(`document.querySelector('.bgc.on').dataset.bg`);
  await press('ArrowRight');
  if ((await ev(`document.querySelector('.bgc.on').dataset.bg`)) === bg0) await press('ArrowLeft');
  const bg1 = await ev(`document.querySelector('.bgc.on').dataset.bg`);
  await B.shot('kb-01-newgame');
  ok('arrows pick a background', bg1 && bg1 !== bg0, { bg0, bg1 });
  await press('Enter', 1, 1200);
  ok('Enter starts the game', await ev(`Game.running && G.p.bg===${JSON.stringify(bg1)}`), await ev('G && G.p.bg'));

  // intro: Space / E through the story beats
  for (let i = 0; i < 40 && await ev(`UI.blocking() || (typeof Cine!=='undefined' && !!Cine.active)`); i++) {
    if (await cine()) { await press('Escape', 2, 80); await B.wait(200); continue; }
    await press(i % 2 ? 'KeyE' : 'Space', 1, 220);
  }
  await drain();
  ok('intro with Space/E', !(await ev('UI.blocking()')));
  ok('mouse aim stays off', await ev('INPUT.mouseAim===false && INPUT.aimX==null'));
  await B.keyDown('KeyW'); await B.wait(500); await B.keyUp('KeyW');

  // pack: select canned food with arrows, E eats one, X drops one
  await ev(`G.encTimer=1e9; G.pack.canned=3; G.pack.cloth=2; G.p.hunger=40; 1`);
  await drain();
  await press('KeyI', 1, 300);
  ok('I opens the pack', (await panel()) === 'pack');
  await press('ArrowDown');
  for (let i = 0; i < 10 && (await focusRow()) !== 'canned'; i++) await press('ArrowRight');
  await B.shot('kb-02-pack-focus');
  const c0 = await ev(`G.pack.canned||0`), h0 = await ev('G.p.hunger');
  await press('KeyE', 1, 250);
  const c1 = await ev(`G.pack.canned||0`), h1 = await ev('G.p.hunger');
  ok('E eats the selected item', c1 === c0 - 1 && h1 > h0, { c0, c1, h0, h1, row: await focusRow() });
  await press('KeyX', 1, 250);
  const c2 = await ev(`G.pack.canned||0`);
  ok('X drops the selected item', c2 === c1 - 1, { c1, c2 });
  await B.shot('kb-03-pack-after');
  await press('Escape', 1, 250);
  ok('Esc closes the pack', !(await panel()));

  // character: spend a point with keys
  await drain();
  await ev(`G.p.points=1; 1`);
  await press('KeyB', 1, 300);
  await press('ArrowDown');
  const attr = await focusRow(), v0 = await ev(`G.p.attr[${JSON.stringify(attr)}]||0`);
  await B.shot('kb-04-char-focus');
  await press('Enter', 1, 250);
  ok('Enter spends the point', (await ev('G.p.points')) === 0 && (await ev(`G.p.attr[${JSON.stringify(attr)}]`)) === v0 + 1, { attr, v0 });
  await press('Escape', 1, 250);

  // bunker: walk-free teleport next to the hatch, E opens, arrows switch tabs, sleep with keys
  await ev(`for (const d of (Combat.drops||[]).slice()) Combat.pickupDrop(d); unlock('needs'); unlock('craft'); unlock('build'); G.p.x=WORLD.hatch.x+0.5; G.p.y=WORLD.hatch.y+1.2; G.hour=21; G.minute=0; G.isNight=true; 1`);
  for (let i = 0; i < 20 && !(await ev(`(interactTarget()||{}).key==='hatch'`)); i++) await B.wait(150);
  await drain();
  await press('KeyE', 1, 200);
  for (let i = 0; i < 20 && (await panel()) !== 'shelter'; i++) await B.wait(150);
  ok('E opens the bunker', (await panel()) === 'shelter', await ev(`({panel:UI.state.panel, dlg:!!UI.state.dlg, tgt:(interactTarget()||{}).label, p:[G.p.x,G.p.y], h:WORLD.hatch})`));
  const t0 = await ev(`UI.state.panelTab.shelter`);
  await press('ArrowRight', 1, 200);
  const t1 = await ev(`UI.state.panelTab.shelter`);
  await B.shot('kb-05-bunker-tab');
  await press('ArrowRight', 1, 200);
  const t2 = await ev(`UI.state.panelTab.shelter`);
  await press('ArrowLeft', 2, 200);
  const t3 = await ev(`UI.state.panelTab.shelter`);
  ok('arrows switch bunker tabs', t1 !== t0 && t2 !== t1 && t3 === t0, { t0, t1, t2, t3 });
  await press('ArrowDown', 1, 200);
  const sr = await focusRow();
  await B.shot('kb-06-bunker-sleep-focus');
  const d0 = await ev('G.day');
  await press('KeyE', 1, 800);
  ok('E sleeps', (await ev('G.day')) === d0 + 1, { row: sr, d0, day: await ev('G.day') });
  await drain();
  ok('morning summary and night events close with keys', !(await ev('UI.blocking()')), await ev(`Game.Q.map(q=>q.type).join(',')`));

  await drain();
  // barter: give tradeable goods, offer with Enter, take with Enter, T trades
  await ev(`give('cigs',12); give('canned',6); G.atShelter=false; window.__bt=0; UI.barter({bandage:2, cloth:3}, ()=>{ window.__bt=1; }); 1`);
  await B.wait(300);
  await press('ArrowDown');
  let r = await focusRow();
  if (!/^y:/.test(r || '')) await press('ArrowLeft');
  const before = await ev(`({b:G.pack.bandage||0})`);
  // ask for one item on their side
  await press('ArrowRight'); r = await focusRow();
  await press('Enter', 1, 150);
  // offer goods from our side until the deal is fair
  await press('ArrowLeft');
  for (let i = 0; i < 25 && await ev(`!!(document.querySelector('#pnl [data-a=deal]')||{}).disabled`); i++) await press('Enter', 1, 90);
  await B.shot('kb-07-barter');
  const ready = await ev(`!(document.querySelector('#pnl [data-a=deal]')||{disabled:true}).disabled`);
  await press('KeyT', 1, 300);
  const after = await ev(`({b:G.pack.bandage||0, c:G.pack.cloth||0})`);
  ok('barter trade with keys', ready && (after.b > before.b || after.c > 0), { r, ready, before, after });
  await press('Escape', 1, 250);
  ok('Esc leaves the trader', (await ev('window.__bt')) === 1 && !(await panel()));

  // dialogue: arrows + Enter pick the second choice; keys 1-6 for six choices
  await ev(`window.__pick=null; UI.dialogue({who:'Test', lines:['Pick one.'], choices:[{label:'A',onPick:()=>{window.__pick='A'}},{label:'B',onPick:()=>{window.__pick='B'}},{label:'C',onPick:()=>{window.__pick='C'}}]}); 1`);
  await B.wait(200); await press('ArrowDown'); await press('Enter', 1, 250);
  ok('dialogue arrows + Enter', (await ev('window.__pick')) === 'B', await ev('window.__pick'));
  await ev(`window.__pick=null; UI.dialogue({who:'The last night', lines:['Choose.'], choices:[1,2,3,4,5,6].map(n=>({label:'Option '+n, note:n===3?'Needs fuel':'', disabled:n===3, onPick:()=>{window.__pick=n}}))}); 1`);
  await B.wait(400); await B.shot('kb-08-six-choices');
  await press('Digit6', 1, 250);
  ok('key 6 picks the sixth choice', (await ev('window.__pick')) === 6, await ev('window.__pick'));

  await drain();
  // menu via Esc, arrows to Controls, Enter, Esc back, Esc resume
  await press('Escape', 1, 300); for (let i = 0; i < 8 && (await ev(`(document.querySelector('#pnl .kf')||{dataset:{}}).dataset.row`)) !== 'help'; i++) await press('ArrowDown'); await press('Enter', 1, 300);
  const help = await ev(`!!document.querySelector('#pnl .help')`);
  await B.shot('kb-09-help');
  await press('Escape', 1, 200); const back = await ev(`UI.state.panel==='menu' && !document.querySelector('#pnl .help')`);
  await press('Escape', 1, 200);
  ok('menu + controls with keys', help && back && !(await panel()), { help, back });
  ok('no mouse aim after keyboard play', await ev('INPUT.mouseAim===false'));

  B.log(fails ? `KEYBOARD: ${fails} step(s) failed` : 'KEYBOARD: all steps ok');
  if (fails) throw new Error(fails + ' keyboard step(s) failed');
};
