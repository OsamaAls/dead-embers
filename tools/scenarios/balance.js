/* Balance measurements for a whole run on the big map (not a pass/fail check). fresh() goes through the title like endings.js, which also closes the last run's end screen:
   node tools/browser-check.js --scenario tools/scenarios/balance.js        (BAL_N=10 for more stand runs; default 6)
   1. travel: walking minutes from the bunker to each biome's landmark and back, against hunger and thirst per trip
   2. ambient zombies: average alive around a landmark, by day and by night, per biome
   3. winter cold: stamina an idle hour outside costs, with and without a coat
   4. the bus quest: walking minutes for depot, Checkpoint Echo and the fuel, against the 12 days it allows
   5. the final stand: defendBot plays ready yards and weak yards; ready should hold, weak about a coin flip
   Prints one "BAL ..." line per measurement. */
const fs = require('fs'), path = require('path');
module.exports = async B => {
  const ev = s => B.eval(s), N = +(process.env.BAL_N || 6);
  for (let i = 0; i < 120 && !(await ev(`typeof Game!=='undefined' && !!(R && R.renderer && R.scene)`)); i++) await B.wait(500);
  await ev(fs.readFileSync(path.join(__dirname, '..', 'harness.js'), 'utf8'));
  await ev(`localStorage.setItem('deadembers_seen_intro','1'); 1`);
  await ev(`window.fresh = () => { UI.title('new'); const tb = [...document.querySelectorAll('#title button')].find(b => /^start/i.test(b.textContent.trim())); if (tb) tb.click(); else Game.newGame('T','soldier'); sim(0.3); for (let i = 0; i < 14 && (UI.blocking() || Game.Q.length); i++) { skipDlg(); sim(0.5); } G.encTimer = 1e9; INPUT.aimX = INPUT.aimY = null; INPUT.mouseAim = false; };
    window.openAll = () => { for (const id of ['forest', 'docks', 'pass']) openDistrict(id); sim(0.2); unblock(10); };
    window.LANDMARKS = { oldtown: 'Bus Depot', farm: "Teodor's Farm", suburbs: 'Blue House', flooded: 'Sunken House', forest: 'Ranger Station', docks: 'Container Yard', pass: 'Checkpoint Echo' };
    window.poiByLabel = l => Object.values(WORLD.pois).find(p => p.label === l) || Object.values(WORLD.pois).find(p => p.type === 'military' && /Echo/.test(l)) || Object.values(WORLD.pois).find(p => biomeAt(p.x, p.y) === 'suburbs' && /House/.test(l) && p.type === 'house');
    window.walkMin = (fx, fy, tx, ty) => { const sp = G.p; const ox = sp.x, oy = sp.y; sp.x = fx; sp.y = fy; const pts = path(tx, ty); sp.x = ox; sp.y = oy; if (!pts) return null; let d = 0, px = fx, py = fy; for (const [x, y] of pts) { d += Math.hypot(x - px, y - py); px = x; py = y; } return d / moveSpeed('walk'); };
    window.standOn = (p) => { const s = [[0, 1], [0, 2], [1, 1], [-1, 1], [0, -1]].map(([a, b]) => [p.x + a + 0.5, p.y + b + 0.5]).find(([x, y]) => !solidAt(x, y)); G.p.x = s[0]; G.p.y = s[1]; G.atShelter = false; }; 1`);
  const log = async (label, code) => { let r; try { r = await ev(`(function(){ ${code} })()`); } catch (e) { r = { err: e.message.slice(0, 200) }; } B.log(`BAL ${label}: ${JSON.stringify(r)}`); return r; };

  /* 1. travel (game minutes; 1 real second = 1 game minute) */
  await log('travel', `fresh(); openAll(); const h = WORLD.hatch, out = {};
    for (const b in LANDMARKS) { const p = poiByLabel(LANDMARKS[b]); if (!p) { out[b] = 'no poi'; continue; } const m = walkMin(h.x + 0.5, h.y + 1.5, p.x + 0.5, p.y + 1.5);
      out[b] = m == null ? 'no path' : { oneWay: Math.round(m), roundTrip: Math.round(m * 2), hunger: +(m * 2 / 60 * 2.1).toFixed(1), thirst: +(m * 2 / 60 * 2.9).toFixed(1) }; }
    out.speed = +moveSpeed('walk').toFixed(2); return out;`);

  /* 2. ambient zombies around each landmark: alive count sampled every second, 60 s by day, 60 s by night */
  await log('density', `fresh(); openAll(); const out = {};
    for (const b in LANDMARKS) {
      const p = poiByLabel(LANDMARKS[b]); if (!p) continue; const row = {};
      for (const night of [false, true]) {
        clearFoes(); standOn(p); let sum = 0, n = 0, peak = 0;
        sim(60, i => { G.hour = night ? 23 : 12; G.minute = 0; G.isNight = night; G.noise = 0; G.encTimer = 1e9; G.p.hp = G.p.maxHp; if (UI.blocking()) unblock(4); if (i % 20 === 0) { const a = Combat.enemies.filter(e => !e.dead).length; sum += a; n++; peak = Math.max(peak, a); } });
        row[night ? 'night' : 'day'] = { avg: +(sum / n).toFixed(1), peak };
      }
      out[b] = row;
    } clearFoes(); return out;`);

  /* 3. winter cold: stamina after an idle hour outside in the snow (coat / no coat), and by a fire */
  await log('cold', `fresh(); G.flags.q_bus = true; G.hordeDay = G.day + 10; const p = poiByLabel('Bus Depot'), out = {};
    /* open ground near the depot: outdoors, not in the yard, no fire within 4 tiles (the cold would not count there) */
    let spot = null; for (let r = 2; r < 14 && !spot; r++) for (let a = 0; a < 24 && !spot; a++) { const x = Math.floor(p.x + Math.cos(a / 24 * 6.283) * r) + 0.5, y = Math.floor(p.y + Math.sin(a / 24 * 6.283) * r) + 0.5;
      if (!solidAt(x, y) && !indoors(x, y) && !inShelter(x, y) && !nearFire(x, y, 4) && !!path(x, y)) spot = { x, y }; }
    for (const coat of [false, true]) {
      clearFoes(); if (spot) { G.p.x = spot.x; G.p.y = spot.y; G.atShelter = false; } else standOn(p); if (coat) G.pack.coat = 1; else delete G.pack.coat; G.p.sta = G.p.maxSta; const t0 = G.hour;
      sim(60, () => { G.weather = 'snow'; G.snowCover = 0.8; G.storm = false; G.encTimer = 1e9; G.p.hp = G.p.maxHp; clearFoes(); if (UI.blocking()) unblock(4); });
      out[coat ? 'coat' : 'noCoat'] = { sta: Math.round(G.p.sta), max: G.p.maxSta, coldK: coldK(G.p.x, G.p.y) };
    } return out;`);

  /* 4. the bus quest: walking against the 12 days */
  await log('bus quest', `fresh(); openAll(); const h = WORLD.hatch, from = [h.x + 0.5, h.y + 1.5];
    const depot = poiByLabel('Bus Depot'), echo = Object.values(WORLD.pois).find(p => p.type === 'military');
    const fuelPois = Object.values(WORLD.pois).filter(p => ['gas', 'garage'].includes(p.type) && districtOpen(biomeAt(p.x, p.y)));
    const cars = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tileAt(x, y) === T_CAR && districtOpen(biomeAt(x, y))) cars.push([x, y]);
    const near = cars.filter(([x, y]) => Math.hypot(x - h.x, y - h.y) < 25).length;
    const dep = walkMin(...from, depot.x + 0.5, depot.y + 1.5), ech = walkMin(...from, echo.x + 0.5, echo.y + 1.5);
    const gas = fuelPois.map(p => walkMin(...from, p.x + 0.5, p.y + 1.5)).filter(m => m != null).sort((a, b) => a - b);
    /* three searches at the depot at worst (~1 min each), the map at Echo, fuel: the two nearest gas/garage runs plus siphoning (40%/car without a hose) */
    const mins = dep * 2 + 3 + ech * 2 + 2 + (gas[0] || 0) * 2 + (gas[1] || 0) * 2 + 6 / 0.4 * 1.5;
    return { depotRound: Math.round(dep * 2), echoRound: Math.round(ech * 2), gasRounds: gas.slice(0, 3).map(m => Math.round(m * 2)), carsWithin25: near, totalMin: Math.round(mins), daylightRuns: +(mins / (12 * 60)).toFixed(2), allowedDays: 12 };`);

  /* 5. the final stand */
  const stand = async (kind) => {
    let won = 0; const rows = [];
    for (let i = 0; i < N; i++) {
      const r = await ev(`(function(){ fresh();
        ${kind === 'ready'
          ? `G.buildings.walls = 3; G.buildings.tower = 1; while (G.survivors.length < 6) recruit(); G.survivors.forEach((s, i) => { s.job = i < 4 ? (i ? 'guard' : 'tower') : 'idle'; s.skills.combat = 3; }); G.pack.shotgun = 1; G.pack.shells = 60; G.p.weapon = 'shotgun';`
          : `G.buildings.walls = 1; while (G.survivors.length < 4) recruit(); G.survivors.forEach((s, i) => { s.job = i < 2 ? 'guard' : 'idle'; s.skills.combat = 2; }); G.pack.pistol = 1; G.pack.ammo = 30; G.pack.machete = 1; G.p.weapon = 'pistol';`}
        World3D.refreshShelter(); __skipTo(3); sim(0.3); const plan = finalWavePlan();
        /* another dialogue can come first (a shelter event): its last option clears it */
        let got = null; sim(15, j => { const b = dlgButtons().find(b => /Hold the bunker/i.test(b.textContent)); if (!b && dlgButtons().length > 1 && j % 6 === 3) { const o = dlgButtons(); o[o.length - 1].click(); return; } if (b) { got = b.textContent; b.click(); return 'stop'; } if (UI.blocking() && j % 6 === 0) { kd('Space'); ku('Space'); } }); sim(0.5);
        for (let k = 0; k < 10 && !Combat.wave && UI.blocking(); k++) unblock(4);
        const d = Combat.wave ? defendBot(320) : null; sim(2); for (let k = 0; k < 6 && UI.blocking() && !G.endScene; k++) { skipDlg(); sim(0.5); }
        return { picked: !!got, wave: !!d, D: plan.D, need: plan.need, count: plan.count, end: G.endScene || null, hp: Math.round(G.p.hp), secs: d && d.secs }; })()`);
      if (r.end === 'end_stand') won++;
      rows.push(`${r.end === 'end_stand' ? 'W' : 'L'}(${r.D}/${r.need},${r.count}z,${r.secs}s${r.wave ? '' : ',no wave' + (r.picked ? '' : ' (choice not found)') + ',end ' + r.end})`);
    }
    B.log(`BAL stand ${kind}: won ${won}/${N} ${rows.join(' ')}`);
  };
  await stand('ready');
  await stand('weak');
  B.log('BALANCE: done');
};
