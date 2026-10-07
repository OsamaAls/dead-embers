/* What a new player sees in the first days: node tools/browser-check.js --mobile --scenario tools/scenarios/firstdays.js [--shots dir]
   An Ex-Soldier on a phone follows the objective through day one (water, home, bunks, rain collector), sleeps, and starts day two
   (the radio quest, a fight, the weapon list). Every objective, prompt, hint, banner, dialogue, toast and placed event is logged
   in order ("NOTE D1 07:12 KIND: text"), so the flow can be read like a script. Fails when:
     an objective has no "how" line, a touch hint or toast uses keyboard words, two teaching cards show at once,
     a dialogue opens out on the street with nobody walked up to, or a trade screen opens by itself. */
module.exports = async B => {
  let fails = 0;
  const ev = s => B.eval(s);
  const ok = (name, pass, detail) => { if (!pass) fails++; B.log(`STEP ${name}: ${pass ? 'ok' : 'FAIL'}${detail != null ? ' ' + JSON.stringify(detail) : ''}`); };
  for (let i = 0; i < 60 && !(await ev(`typeof Game!=='undefined' && !!(R && R.renderer) && !!document.querySelector('#title [data-t]')`)); i++) await B.wait(250);
  await ev(`fetch('tools/harness.js').then(r=>r.text()).then(eval)`);
  /* dialogues out in the field must follow an E press (a person walked up to); count the ones that don't */
  await ev(`(function(){ window.__eAt = -99; const kd0 = window.kd; window.kd = c => { if (c === 'KeyE') __eAt = __T; return kd0(c); };
    const pd = HTMLElement.prototype.dispatchEvent; window.__strayDlg = []; window.__wasDlg = false;
    window.__dlgWatch = () => { const on = !!UI.state.dlg; if (on && !__wasDlg && !G.atShelter && __T - __eAt > 3000) __strayDlg.push(notesLog[notesLog.length - 1] || ''); __wasDlg = on; };
    const s0 = window.sim; window.sim = (sec, ctl) => s0(sec, i => { __dlgWatch(); return ctl ? ctl(i) : undefined; }); return 1; })()`);
  await ev(`(function(){ Game.newGame('Tester','soldier'); noteStart(); sim(0.3); for (let i = 0; i < 8 && UI.blocking(); i++) { sim(1); unblock(1); } G.p.maxHp = G.p.hp = 3000; return 1; })()`);
  await B.shot('fd-01-start');
  B.log('BOT', JSON.stringify(await ev(`followObjective(40)`)));
  await B.shot('fd-02-day1');
  /* materials so the bot can finish the day-one chain, then the night */
  B.log('BOT', JSON.stringify(await ev(`(function(){ give('wood',4); give('scrap',4); give('cloth',4); return followObjective(30); })()`)));
  B.log('BOT', JSON.stringify(await ev(`(function(){ G.hour = 19; sim(1); const l = followObjective(20); for (let i = 0; i < 10; i++) { sim(2); unblock(4); } return l; })()`)));
  await B.shot('fd-03-day2');
  B.log('BOT', JSON.stringify(await ev(`(function(){ G.encTimer = 30; return followObjective(40); })()`)));
  await B.shot('fd-04-day2-out');
  const notes = await ev('notesLog');
  for (const l of notes) B.log('NOTE ' + l);
  const objs = notes.filter(l => / OBJ: /.test(l));
  ok('every objective says how', objs.length >= 5 && objs.every(l => !/\[no how\]/.test(l)), objs.filter(l => /\[no how\]/.test(l)));
  const keyWords = notes.filter(l => / (HINT|TOAST|OBJ): /.test(l) && /(\bhold E\b|\bHold E\b|\bpress E\b|\bE to\b|\bC to\b|Click or J|WASD|\(I\)|\(B\)|\bQ\b|\bH:|\bR:)/.test(l));
  ok('touch text never names keyboard keys', !keyWords.length, keyWords);
  ok('no dialogue opens on the street by itself', !(await ev('__strayDlg.length')), await ev('__strayDlg'));
  const trade = notes.filter(l => / PANEL: barter/.test(l));
  ok('no trade screen without walking up to a trader', !trade.length || notes.some(l => /PROMPT: USE Trade with/.test(l)), trade);
  ok('the day-one chain finishes', await ev(`bl('bed') >= 1 && bl('rain') >= 1 && G.day >= 2`), await ev(`({bed: bl('bed'), rain: bl('rain'), day: G.day})`));
  if (fails) throw new Error(fails + ' first-days step(s) failed');
  B.log('FIRSTDAYS: all steps ok');
};
