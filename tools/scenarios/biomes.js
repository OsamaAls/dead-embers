/* Biomes, gates, weather and seasons: node tools/browser-check.js --scenario tools/scenarios/biomes.js --shots <dir> [--mobile]
   Teleports to every biome (Old Town, park, Elm Row suburbs, the Docks, Kessler Woods, Teodor's farmland, the Flooded Quarter,
   the Northern Pass), shows each story gate closed and open, and the weather/season variants (clear autumn day, rain, fog,
   late-autumn frost, first snow, the last night's snowstorm). Prints draw calls / triangles / FPS per view and the busiest one.
   Checks: gates block until openDistrict, weather modifiers, natureNear, no page errors. Exit 1 on a failed check. */
const fs = require('fs'), path = require('path');
module.exports = async B => {
  const ev = s => B.eval(s);
  let fails = 0;
  const check = async (name, code, okExpr) => {
    let r; try { r = await ev(`(function(){ ${code} })()`); } catch (e) { r = { err: e.message.slice(0, 200) }; }
    const ok = !r || r.err ? false : await ev(`(function(r){ return !!(${okExpr}); })(${JSON.stringify(r)})`);
    if (!ok) fails++;
    B.log(`CHECK ${name}: ${ok ? 'ok' : 'FAIL'} ${JSON.stringify(r)}`);
    return r;
  };
  for (let i = 0; i < 120 && !(await ev(`typeof Game!=='undefined' && !!(R && R.renderer && R.scene)`).catch(() => false)); i++) await B.wait(500);
  await ev(fs.readFileSync(path.join(__dirname, '..', 'harness.js'), 'utf8'));
  await ev(`(function(){ try{ if (typeof Cine!=='undefined') Cine.autoIntro=false; }catch(e){} Game.newGame('Tester','scavenger'); sim(0.3);
    for (let i=0;i<20&&(UI.blocking()||(typeof Cine!=='undefined'&&Cine.active));i++){ try{ if(typeof Cine!=='undefined'&&Cine.active) Cine.skip(); }catch(e){} skipDlg(); sim(0.4); } return 1; })()`);
  /* calm world: no encounters, no ambient dead in the way of the camera */
  const calm = `G.p.hp=9999; G.p.maxHp=9999; G.encTimer=1e9; G.hordeNight=false; try{clearFoes()}catch(e){}; Game.Q.length=0;`;
  /* set the scene: tile point, hour, season, weather, snow cover; settle the smoothed weather, draw a few frames */
  const view = async (name, o) => {
    await ev(`(function(){ ${calm}
      const o=${JSON.stringify(o)}; const p=eval(o.at);
      G.p.x=p.x; G.p.y=p.y; G.p.face=o.face||0; G.hour=Math.floor(o.h); G.minute=Math.round((o.h%1)*60); G.isNight=isNight();
      G.season=o.season||'autumn'; G.weather=o.w||'clear'; G.weatherH=99; G.storm=!!o.storm; G.snowCover=o.snow||0;
      R.follow(G.p.x,G.p.y,G.p.face,true); if (o.zoom) R.zoom(o.zoom);
      sim(0.6, ()=>{ try{clearFoes()}catch(e){} skipDlg(); }); R._weather(30, R.lookTarget); if (!R.weatherK.rain) R.env.uWet.value = o.wet||0; sim(0.4, ()=>{ try{clearFoes()}catch(e){} });
      if (o.zoom) R.zoom(-o.zoom); return 1; })()`);
    await B.wait(o.wait || 900);
    const st = await ev(`({calls:R.renderer.info.render.calls, tris:R.renderer.info.render.triangles, fps:Math.round(Game.fps||0), biome:biomeAt(G.p.x,G.p.y), w:weatherAt(G.p.x,G.p.y)})`);
    B.log(`VIEW ${name}: ${JSON.stringify(st)}`);
    await B.shot(name);
    return st;
  };
  const poi = (type, dx, dy) => `(function(){ const p=Object.values(WORLD.pois).find(q=>q.type==='${type}'); return {x:p.x+0.5+(${dx || 0}), y:p.y+0.5+(${dy || 2})}; })()`;
  const tile = (x, y) => `({x:${x + 0.5},y:${y + 0.5}})`;

  /* ---- gates closed: the woods, the pass and the docks are sealed ---- */
  await check('gates closed at start', `const g=WORLD.gates; return {forest:solidAt(g.forest.x0+0.5,g.forest.y0+0.5), pass:solidAt(g.pass.x0+0.5,g.pass.y0+0.5), docks:solidAt(g.docks.x0+0.5,g.docks.y0+0.5), path:path(WORLD.gates.forest.x0+0.5, WORLD.gates.forest.y0-3)}`, 'r.forest && r.pass && r.docks && !r.path');
  const shots = [];
  shots.push(await view('b01-gate-rockfall-closed', { at: tile(34.5, 19.5), h: 10, face: 3.14 }));
  shots.push(await view('b02-gate-toll-closed', { at: tile(58.5, 19.5), h: 10.5, face: 3.14 }));
  shots.push(await view('b03-gate-bridge-closed', { at: tile(82, 38.5), h: 11, face: 1.57 }));
  await check('open districts', `openDistrict('forest'); openDistrict('pass'); openDistrict('docks'); sim(0.8); const g=WORLD.gates; return {forest:solidAt(g.forest.x0+0.5,g.forest.y0+0.5), pass:solidAt(g.pass.x0+0.5,g.pass.y0+0.5), docks:solidAt(g.docks.x0+0.5,g.docks.y0+0.5), flags:[G.flags.open_forest,G.flags.open_pass,G.flags.open_docks], path:!!path(WORLD.gates.forest.x0+0.5, WORLD.gates.forest.y0-3)}`, '!r.forest && !r.pass && !r.docks && r.flags.every(Boolean) && r.path');
  shots.push(await view('b04-gate-rockfall-open', { at: tile(34.5, 19.5), h: 10, face: 3.14 }));
  shots.push(await view('b05-gate-bridge-open', { at: tile(82, 38.5), h: 11, face: 1.57 }));

  /* ---- biomes, act 1 autumn ---- */
  shots.push(await view('b10-oldtown-autumn-day', { at: poi('supermarket', 0, 2.5), h: 10.5 }));
  shots.push(await view('b11-oldtown-park', { at: `(function(){ const [x0,x1]=BLOCKS_X[0],[y0,y1]=BLOCKS_Y[2]; return {x:(x0+x1)/2+0.5,y:(y0+y1)/2+0.5}; })()`, h: 16.5 }));
  shots.push(await view('b12-suburbs-autumn', { at: tile(11, 49), h: 11 }));
  shots.push(await view('b13-suburbs-rain', { at: tile(11, 59), h: 14, w: 'rain', wet: 1 }));
  shots.push(await view('b14-farmland', { at: tile(47, 72.5), h: 15.5 }));
  shots.push(await view('b15-forest-ranger', { at: poi('ranger', 0, 3), h: 13 }));
  shots.push(await view('b16-forest-deep', { at: tile(27, 10), h: 12 }));
  shots.push(await view('b17-docks-day', { at: tile(95, 28.5), h: 11.5 }));
  shots.push(await view('b19-docks-harbour-crane', { at: tile(97, 73), h: 12.5 }));
  shots.push(await view('b19b-hunting-stand', { at: `(function(){ const p=Object.values(WORLD.pois).find(q=>q.label==='Hunting Stand'); return {x:p.x+0.5,y:p.y+1.5}; })()`, h: 15 }));
  shots.push(await view('b19c-boulevard', { at: tile(52, 39), h: 9.5 }));
  shots.push(await view('b18-flooded-quarter', { at: tile(71, 68), h: 10.5, season: 'late' }));
  /* ---- act 2 late autumn: bare trees, morning frost, fog ---- */
  shots.push(await view('b20-late-autumn-frost-morning', { at: poi('supermarket', 0, 2.5), h: 7.2, season: 'late' }));
  shots.push(await view('b21-docks-fog', { at: tile(95, 48.5), h: 9, season: 'late', w: 'fog' }));
  shots.push(await view('b22-forest-late-frost', { at: tile(20, 12.5), h: 7.5, season: 'late' }));
  /* ---- act 3 winter: first snow, the pass, the last night's snowstorm ---- */
  shots.push(await view('b30-first-snow-oldtown', { at: `({x:WORLD.hatch.x+0.5,y:WORLD.hatch.y+5})`, h: 12, season: 'winter', w: 'snow', snow: 0.35 }));
  shots.push(await view('b31-pass-checkpoint', { at: poi('military', 0, 2.5), h: 12.5, season: 'winter', w: 'snow', snow: 0.6 }));
  shots.push(await view('b32-pass-road', { at: tile(74.5, 4), h: 14, season: 'winter', w: 'clear', snow: 0.6, face: 3.14 }));
  shots.push(await view('b33-snowstorm-last-night', { at: `({x:WORLD.hatch.x+0.5,y:WORLD.hatch.y+4})`, h: 22, season: 'winter', w: 'snow', storm: true, snow: 1 }));
  shots.push(await view('b34-rain-night-street', { at: poi('apartments', 0, 3), h: 21.5, season: 'late', w: 'rain', wet: 1 }));

  /* ---- modifiers + ambience hook ---- */
  await check('weather modifiers', `${calm} G.season='late'; G.weather='rain'; const rain=hearMul(G.p.x,G.p.y); G.weather='fog'; const fog=sightMul(G.p.x,G.p.y); G.weather='snow'; const snow=zSpeedMul(G.p.x,G.p.y); G.weather='clear';
    const sh=WORLD.tiles.findIndex(t=>t===T_SHALLOW), shx=sh%W+0.5, shy=Math.floor(sh/W)+0.5; return {rain, fog, snow, shallow:moveMul(shx,shy), coat:ITEMS.coat.c}`, 'r.rain===0.6 && r.fog===0.6 && r.snow===0.85 && r.shallow<0.7 && r.coat==="gear"');
  await check('natureNear', `const f=World3D.natureNear(20,12,8), t=World3D.natureNear(86,40,6), h=World3D.natureNear(WORLD.hatch.x+0.5,WORLD.hatch.y+0.5,4); return {forestTrees:f.trees, river:t.water, hatchFire:!!h.nearest.fire, biome:f.biome}`, 'r.forestTrees>10 && r.river>3 && r.hatchFire && r.biome==="forest"');
  await check('bush hides a crouched player', `${calm} const i=WORLD.tiles.findIndex((t,i)=>t===T_BUSH && !solidAt(i%W+1.5,Math.floor(i/W)+0.5)); G.p.x=i%W+0.5; G.p.y=Math.floor(i/W)+0.5; INPUT.crouch=true; const e=Combat.spawnAt('walker',G.p.x+1.5,G.p.y+3.2); let seen=null; if(e){ e.face=Math.atan2(G.p.x-e.x,G.p.y-e.y); sim(0.4); seen=e.sees; } INPUT.crouch=false; clearFoes(); return {inBush:inBush(G.p.x,G.p.y), seen}`, 'r.inBush && r.seen===false');
  const busiest = shots.reduce((a, b) => (b && b.calls > (a ? a.calls : 0) ? b : a), null);
  B.log('busiest view', JSON.stringify(busiest));
  B.log(fails ? `BIOMES: ${fails} check(s) failed` : 'BIOMES: all checks ok');
  if (fails) throw new Error(fails + ' biome check(s) failed');
};
