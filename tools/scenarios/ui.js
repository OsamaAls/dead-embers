/* UI / moments walkthrough for tools/browser-check.js:
   node tools/browser-check.js --scenario tools/scenarios/ui.js --shots <dir> [--mobile]
   Title, new game, intro, HUD, every panel, a dialogue encounter, both minigames, barter, every moment type, level up, end card. */
module.exports = async B => {
  const step = async (name, expr, ms) => { if (expr) await B.eval(expr); await B.wait(ms == null ? 500 : ms); if (name) await B.shot(name); };
  const clear = `(function(){UI.close(); if(UI.state.mg){} return 1;})()`;
  const drainDialogue = async () => { for (let i = 0; i < 12 && await B.eval('!!UI.state.dlg'); i++) { await B.key('Enter'); await B.wait(160); } };

  await B.wait(1500);
  await B.shot('ui-01-title');
  await step('ui-02-newgame', `document.querySelector('#title [data-t=new]').click()`, 400);
  await step(null, `document.querySelector('#title [data-t=start]').click()`, 900);
  await B.shot('ui-03-intro');
  await drainDialogue();
  await B.keyDown('KeyW'); await B.wait(900); await B.keyUp('KeyW');
  await step('ui-04-hud', `UI.toast('+2 Canned Food','loot'); UI.toast('Note found: Ledger (journal)','story'); 1`, 700);
  await step('ui-05-hud-needs', `unlock('needs'); unlock('journal'); unlock('people'); unlock('build'); unlock('craft'); G.day=2; G.p.hp=28; G.p.points=1; give('pistol',1); give('ammo',12); give('bandage',2); give('water',2); recruit(); UI.prompt('Hold E  Search Cabinet', 0.45); UI.dmgNum(G.p.x+1,G.p.y-1,14); 1`, 1200);
  await step(null, `G.p.hp=G.p.maxHp; UI.prompt(null); 1`, 100);
  for (const p of ['pack', 'char', 'journal', 'shelter', 'map', 'menu']) {
    await step('ui-06-' + p, `UI.open('${p}')`, 600);
    if (p === 'pack') await step('ui-06-pack-sel', `document.querySelector('#pnl .it') && document.querySelector('#pnl .it').click()`, 300);
    if (p === 'shelter') { await step('ui-06-shelter-store', `document.querySelector('#pnl [data-a="tab:store"]').click()`, 300); await step('ui-06-shelter-people', `(document.querySelector('#pnl [data-a="tab:people"]')||{click(){}}).click()`, 300); await step('ui-06-shelter-craft', `(document.querySelector('#pnl [data-a="tab:craft"]')||{click(){}}).click()`, 300); }
    if (p === 'journal') await step('ui-06-journal-people', `(document.querySelector('#pnl [data-a="tab:people"]')||{click(){}}).click()`, 300);
    await step(null, clear, 200);
  }
  // keyboard toggles
  await B.key('KeyI'); await B.wait(200); const packOpen = await B.eval(`UI.state.panel`); await B.key('KeyI'); await B.wait(200);
  B.log('pack toggle', packOpen, await B.eval('UI.state.panel'));
  // dialogue encounter
  await step(null, `UI.encounter(allEncounters().find(e=>e.choices && e.choices.length>1 && e.who) || allEncounters().find(e=>e.choices), ()=>{ window.__encDone=1; })`, 300);
  await B.key('Enter'); await B.wait(200);
  for (let i = 0; i < 4 && !(await B.eval(`!!document.querySelector('#dlg .ch')`)); i++) { await B.key('Enter'); await B.wait(200); }
  await B.shot('ui-07-dialogue');
  await B.key('Digit1'); await B.wait(500); await B.shot('ui-08-dialogue-result');
  await drainDialogue(); await step(null, clear, 200);
  // tollcamp
  await step('ui-09-tollcamp', `UI.open('tollcamp')`, 700);
  await B.key('Digit1'); await B.wait(400); await drainDialogue();
  B.log('warden_met', await B.eval('G.flags.warden_met'));
  await step(null, clear, 200);
  // minigames
  await step(null, `UI.lockpick({mode:'pick',diff:4}, ok=>{window.__lp=ok;})`, 900);
  await B.shot('ui-10-lockpick');
  for (let i = 0; i < 6 && await B.eval('!!UI.state.mg'); i++) { await B.key('KeyE'); await B.wait(350); }
  await B.wait(1200);
  await step(null, `UI.lockpick({mode:'pry',diff:4}, ok=>{window.__lp2=ok;})`, 200);
  for (let i = 0; i < 8; i++) { await B.key('KeyE', 30); await B.wait(60); }
  await B.shot('ui-11-pry');
  await B.wait(4500);
  B.log('lockpick', await B.eval('window.__lp'), 'pry', await B.eval('window.__lp2'));
  await step(null, `UI.barter(null, ()=>{window.__bt=1;})`, 400);
  await step('ui-12-barter', `(function(){const g=document.querySelectorAll('#pnl [data-a^="give:"]'); const t=document.querySelector('#pnl [data-a^="take:"]'); if(g[0]) g[0].click(); if(t) t.click(); return 1;})()`, 400);
  await step(null, clear, 200);
  B.log('barter done', await B.eval('window.__bt'));
  // summary + level up
  await step('ui-13-summary', `UI.summary({day:3, lines:[{msg:'Rain collector: +3 Dirty Water'},{msg:'Work done: +4 Wood',cls:'good'},{msg:'A horde is coming TONIGHT. Be at the bunker by dark.',cls:'bad'}], radio:'Haven calling. Anyone on this band, answer.'}, ()=>{})`, 500);
  await step(null, clear, 200);
  await step('ui-14-levelup', `G.p.level++; UI.levelUp(); UI.hint('Hunger is dropping. Eat something from your pack (I).'); UI.banner('Screamer','It has seen you.'); 1`, 700);
  // moments
  const moment = async (name, play, ms, after) => {
    await B.eval(`Moments.start({id:'t_${name}', title:'t', play:${play}}, l=>{window.__m=(window.__m||[]).concat(['${name}:'+l]);})`);
    await B.wait(ms); await B.shot('ui-15-moment-' + name);
    if (after) await B.eval(after);
    await B.wait(300);
    await B.eval(`Moments.active && Moments.abort(); UI.close(); 1`);
    await B.wait(200);
  };
  await moment('screamer', `{type:'screamer', time:6}`, 1500);
  await moment('dodge', `{type:'dodge', waves:3}`, 1600);
  await moment('rescue', `{type:'rescue', who:'Ada', foes:['walker','walker']}`, 2000);
  await moment('race', `{type:'race', time:30}`, 1500);
  await moment('horde', `{type:'horde', foes:['walker']}`, 1200);
  await moment('lock', `{type:'lock', mode:'pick', diff:3}`, 900);
  await moment('barter', `{type:'barter', stock:{canned:3, ammo:6}}`, 700);
  B.log('moments', JSON.stringify(await B.eval('window.__m||[]')));
  // end card
  await step('ui-16-end', `UI.end('death')`, 2600);
};
