/* ===================== UI (skeleton: to be replaced by the full HUD, panels, touch controls and audio) ===================== */
const INPUT = { mx: 0, my: 0, sprint: false, crouch: false, attack: false, interact: false, attackPressed: false, dodgePressed: false, interactPressed: false, aimX: null, aimY: null, touch: false };
const SFX = { play() { } };
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const UI = {
  modal: false, keys: {},
  init() {
    const K = this.keys;
    const sync = () => { INPUT.mx = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0); INPUT.my = (K.KeyS || K.ArrowDown ? 1 : 0) - (K.KeyW || K.ArrowUp ? 1 : 0); INPUT.sprint = !!(K.ShiftLeft || K.ShiftRight); INPUT.crouch = !!(K.KeyC || K.ControlLeft); INPUT.interact = !!K.KeyE; };
    addEventListener('keydown', e => { if (this.modal) return; K[e.code] = true; if (e.code === 'KeyE' && !e.repeat) INPUT.interactPressed = true; if (e.code === 'KeyJ') INPUT.attackPressed = true; if (e.code === 'Space') INPUT.dodgePressed = true; if (e.code === 'KeyI') this.open('pack'); sync(); });
    addEventListener('keyup', e => { K[e.code] = false; sync(); });
    addEventListener('mousedown', e => { if (!this.modal && e.target.tagName === 'CANVAS') { INPUT.attackPressed = true; INPUT.attack = true; } });
    addEventListener('mouseup', () => { INPUT.attack = false; });
    addEventListener('mousemove', e => { INPUT.aimX = e.clientX; INPUT.aimY = e.clientY; });
    addEventListener('wheel', e => R.zoom(e.deltaY));
  },
  update() {
    const p = G.p, o = objectiveInfo();
    $('#hud').innerHTML = `HP ${Math.round(p.hp)} · STA ${Math.round(p.sta)}${isUnlocked('needs') ? ` · FOOD ${Math.round(p.hunger)} · WATER ${Math.round(p.thirst)}` : ''} · Day ${G.day} ${String(G.hour).padStart(2, '0')}:${String(G.minute).padStart(2, '0')}<br><b>${esc(o.text)}</b>`;
  },
  show(html, binds) { this.modal = true; $('#modal-wrap').hidden = false; $('#modal').innerHTML = html; for (const id in binds) { const el = document.getElementById(id); if (el) el.onclick = binds[id]; } },
  close() { this.modal = false; $('#modal-wrap').hidden = true; },
  blocking() { return this.modal; },
  toast(t) { if (!t) return; const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $('#toasts').appendChild(d); setTimeout(() => d.remove(), 3000); },
  hint(t) { this.toast(t); }, banner(a, b) { this.toast(a + ': ' + b); }, flash() { }, levelUp() { this.toast('Level up'); }, dmgNum() { }, onUnlock() { }, timer() { },
  prompt(t, prog) { $('#prompt').textContent = t ? t + (prog != null ? ` ${Math.round(prog * 100)}%` : '') : ''; },
  dialogue(d) { const html = `<b>${esc(d.who || '')}</b><p>${(d.lines || []).map(esc).join('<br>')}</p>` + d.choices.map((c, i) => `<button id="dc${i}" ${c.disabled ? 'disabled' : ''}>${esc(c.label)} ${c.note ? '<small>' + esc(c.note) + '</small>' : ''}</button>`).join(''); const b = {}; d.choices.forEach((c, i) => b['dc' + i] = () => { this.close(); c.onPick && c.onPick(); }); this.show(html, b); },
  encounter(enc, done) {
    const choices = enc.choices.map(c => { const ok = !c.req || c.req(); const pc = c.check ? `${c.check.attr.toUpperCase()} ${Math.round(checkChance(c.check) * 100)}%` : ''; return { label: c.label, note: ok ? pc : c.reqText, disabled: !ok, onPick: () => { const r = (!c.check || chance(checkChance(c.check))) ? c.success() : c.fail(); this.dialogue({ who: enc.title, lines: [r], choices: [{ label: 'Continue', onPick: () => done() }] }); } }; });
    this.dialogue({ who: enc.title, lines: [encText(enc)], choices });
  },
  scene(id, done) { const sc = CONTENT_().story[id] || { title: id, paras: [] }; const lines = sc.beats ? sc.beats.map(b => (b.who ? b.who + ': ' : '') + b.line) : sc.paras.slice(0, 2); this.dialogue({ who: sc.title, lines: lines.map(fmtName), choices: [{ label: 'Continue', onPick: () => done() }] }); },
  summary(q, done) { this.dialogue({ who: 'Day ' + q.day, lines: q.lines.map(l => l.msg), choices: [{ label: 'Continue', onPick: () => done() }] }); },
  final(done) { this.dialogue({ who: 'The last night', lines: [], choices: finalOptions().map(o => ({ label: o.label, note: o.note, disabled: !o.ok, onPick: () => { const r = chooseFinal(o.id); if (r === 'wait') done(); else if (r === 'wave') { done(); Game.finalWave(); } else this.end(r); } })) }); },
  end(id) { const sc = CONTENT_().story[id] || { title: 'The End', paras: [] }; this.dialogue({ who: sc.title, lines: (sc.beats ? sc.beats.map(b => b.line) : sc.paras).map(fmtName), choices: [{ label: 'Title', onPick: () => Game.quit() }] }); },
  open(panel) {
    if (panel === 'shelter') return this.dialogue({ who: 'Bunker', lines: ['Home.'], choices: [{ label: 'Sleep', onPick: () => { if (canSleep().ok) sleep(); } }, { label: 'Store pack', onPick: () => { for (const k in G.pack) if (ITEMS[k].c !== 'weapon') { G.store[k] = (G.store[k] || 0) + G.pack[k]; delete G.pack[k]; } } }, { label: 'Leave', onPick: () => { } }] });
    if (panel === 'pack') return this.dialogue({ who: 'Pack', lines: [Object.keys(G.pack).map(k => itemName(k) + ' ×' + G.pack[k]).join(', ') || 'Empty'], choices: Object.keys(G.pack).filter(k => ITEMS[k].eat || ITEMS[k].use).map(k => ({ label: 'Use ' + itemName(k), onPick: () => eat(k) })).concat([{ label: 'Close' }]) });
    this.dialogue({ who: panel, lines: ['(not built yet)'], choices: [{ label: 'Close' }] });
  },
  lockpick(o, done) { this.dialogue({ who: 'Lock', lines: ['(minigame placeholder)'], choices: [{ label: 'Try', onPick: () => done(chance(0.6)) }] }); },
  barter(stock, done) { this.dialogue({ who: 'Trader', lines: ['(barter placeholder)'], choices: [{ label: 'Leave', onPick: () => done() }] }); },
  title() {
    this.dialogue({ who: 'DEAD EMBERS', lines: ['A city of ash. A bunker. A voice on the radio.'], choices: [
      ...(hasSave() ? [{ label: 'Continue', onPick: () => Game.continueGame() }] : []),
      { label: 'New game', onPick: () => Game.newGame('Survivor', 'scavenger') }] });
  },
};
