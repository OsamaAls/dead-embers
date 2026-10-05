/* World / renderer visual check: node tools/browser-check.js --scenario tools/scenarios/world.js --shots <dir> [--mobile]
   Shots: day street, dusk, night, building interior (cutaway), shelter with structures, shelter ghosts, objective beacon. */
module.exports = async B => {
  for (let i = 0; i < 120 && !(await B.eval(`typeof Game !== 'undefined' && !!R.renderer`).catch(() => false)); i++) await B.wait(500);
  await B.wait(800);
  await B.eval(`Game.newGame('Tester','scavenger')`);
  await B.wait(500);
  for (let i = 0; i < 8 && await B.eval('UI.blocking()'); i++) {
    await B.key('Enter'); await B.wait(200);
    await B.eval(`(function(){const b=document.querySelector('#modal button:not([disabled]), .dlg button:not([disabled]), [data-continue]'); if(b) b.click(); return 1;})()`);
    await B.wait(200);
  }
  const calm = `G.p.hp=9999; G.p.maxHp=9999; G.encTimer=9999; try{Combat.clear()}catch(e){}; try{G.hordeNight=false}catch(e){};`;
  const tp = (x, y, face) => B.eval(`(function(){${calm} G.p.x=${x}; G.p.y=${y}; G.p.face=${face || 0}; R.follow(G.p.x,G.p.y,G.p.face,true); return 1})()`);
  const setT = h => B.eval(`(function(){G.hour=${Math.floor(h)}; G.minute=${Math.round((h % 1) * 60)}; G.isNight=isNight(); return 1})()`);
  // 1. day at the bunker
  await setT(10); await tp(`WORLD.hatch.x+0.5`, `WORLD.hatch.y+2.5`, 3.14); await B.wait(1500); await B.shot('w01-day-shelter');
  // 2. day street near the supermarket door
  await tp(`nearestPoi('supermarket',0,0).x+0.5`, `nearestPoi('supermarket',0,0).y+2.5`, 3.14); await B.wait(1500); await B.shot('w02-day-street');
  // 3. hospital / radio tower / apartments area
  await tp(`nearestPoi('apartments',0,0).x+0.5`, `nearestPoi('apartments',0,0).y+3`, 3.14); await B.wait(1500); await B.shot('w03-day-apartments');
  // 4. interior cutaway: first open building, floor tile near its centre
  await B.eval(`(function(){const r=WORLD.roofs.find(r=>!r.closed&&r.type==='supermarket')||WORLD.roofs.find(r=>!r.closed);let best=null;for(let y=r.y+1;y<r.y+r.h-1;y++)for(let x=r.x+1;x<r.x+r.w-1;x++)if(tileAt(x,y)===T_FLOOR){const d=(x-r.x-r.w/2)**2+(y-r.y-r.h/2)**2;if(!best||d<best.d)best={x,y,d};}${calm} G.p.x=best.x+0.5;G.p.y=best.y+0.5;R.follow(G.p.x,G.p.y,0,true);return 1})()`);
  await B.wait(1800); await B.shot('w04-interior');
  // 5. dusk at the river bridge
  await setT(18.6); await tp(`50.5`, `24.5`, 1.57); await B.wait(1500); await B.shot('w05-dusk-bridge');
  // 6. night on a street, then night with flashlight indoors
  await setT(22); await tp(`nearestPoi('supermarket',0,0).x+0.5`, `nearestPoi('supermarket',0,0).y+3.5`, 3.14); await B.wait(1600); await B.shot('w06-night-street');
  // 7. shelter with everything built
  await setT(11);
  await B.eval(`(function(){unlock('build'); G.flags.q_radio=true; Object.assign(G.buildings,{bed:3,rain:3,tower:1,bench:3,forge:2,purifier:2,kitchen:2,woodshop:2,garden:3,infirmary:2,walls:2,radio:1}); World3D.refreshShelter(); return 1})()`);
  await tp(`WORLD.hatch.x+0.5`, `WORLD.hatch.y+2.5`, 3.14); await B.eval('R.zoom(400)'); await B.wait(1800); await B.shot('w07-shelter-built');
  await B.eval(`(function(){G.buildings.walls=3; World3D.refreshShelter(); return 1})()`); await B.wait(600); await B.shot('w07b-shelter-walls3');
  // 8. shelter ghosts (nothing built) + highlight on a slot
  await B.eval(`(function(){G.buildings={bed:1}; World3D.refreshShelter(); World3D.highlight('slot','rain'); return 1})()`);
  await B.eval('R.zoom(-400)'); await B.wait(1500); await B.shot('w08-shelter-ghosts');
  // 9. container highlight + opened container + objective beacon
  await B.eval(`(function(){const c=WORLD.containers.find(c=>c.kind!=='trunk'&&indoors(c.x+0.5,c.y+1.5))||WORLD.containers[0];${calm} G.p.x=c.x+0.5;G.p.y=c.y+1.6;R.follow(G.p.x,G.p.y,3.14,true);World3D.highlight('container',c.id);const o=WORLD.containers.find(o=>o!==c&&o.poi===c.poi);if(o)World3D.setContainerOpened(o.id,true);World3D.setObjective({x:c.x+3,y:c.y-2});return c.kind})()`);
  await B.wait(1500); await B.shot('w09-container-highlight');
  await B.eval(`World3D.setObjective(null)`);
  await setT(12); await tp(`WORLD.hatch.x+0.5`, `WORLD.hatch.y+6`, 0); await B.wait(1200);
  B.log('stats', JSON.stringify(await B.eval(`({fps:Math.round(Game.fps),calls:R.renderer.info.render.calls,tris:R.renderer.info.render.triangles,geos:R.renderer.info.memory.geometries,progs:R.renderer.info.programs.length})`)));
};
