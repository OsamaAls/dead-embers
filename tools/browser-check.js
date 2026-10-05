/* Headless browser check for the built game (no server needed).
   node tools/browser-check.js [--mobile] [--shots dir] [--scenario file.js]
   Launches Edge or Chrome headless with SwiftShader WebGL, opens index.html, plays a short scenario, prints
   console errors / exceptions and FPS, and saves screenshots. Exit code 1 on any page error.
   A scenario file exports async (B) => {...} where B has: eval(expr), key(code, ms), keyDown(code), keyUp(code),
   click(x,y), wait(ms), shot(name), log(...). */
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
const mobile = !!opt('--mobile'), shotDir = opt('--shots') || path.join(os.tmpdir(), 'dead-embers-shots');
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const exe = BROWSERS.find(p => fs.existsSync(p));
if (!exe) { console.log('No Chrome/Edge found; skipping browser check.'); process.exit(0); }
const page = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/').replace(/ /g, '%20');
const port = 9300 + Math.floor(Math.random() * 500);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'de-prof-'));
const [vw, vh] = mobile ? [390, 844] : [1280, 800];
const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files', `--window-size=${vw},${vh}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [], logs = [];
let ws, msgId = 0; const pending = {};
const send = (method, params) => new Promise((res, rej) => { const id = ++msgId; pending[id] = { res, rej }; ws.send(JSON.stringify({ id, method, params: params || {} })); });
async function connect() {
  for (let i = 0; i < 60; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const t = list.find(x => x.type === 'page'); if (t) return t.webSocketDebuggerUrl; } catch (e) { }
    await sleep(250);
  }
  throw new Error('browser did not start');
}
const KEYMAP = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyE: 'e', KeyI: 'i', KeyJ: 'j', KeyC: 'c', KeyB: 'b', Space: ' ', Escape: 'Escape', Tab: 'Tab', ShiftLeft: 'Shift', Enter: 'Enter', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
const B = {
  async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text)); return r.result.value; },
  async keyDown(code) { await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: KEYMAP[code] || code, windowsVirtualKeyCode: 0 }); },
  async keyUp(code) { await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: KEYMAP[code] || code }); },
  async key(code, ms) { await B.keyDown(code); await sleep(ms || 60); await B.keyUp(code); },
  async click(x, y) { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); },
  async tap(x, y) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(80); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); },
  wait: sleep,
  async shot(name) { fs.mkdirSync(shotDir, { recursive: true }); const r = await send('Page.captureScreenshot', { format: 'png' }); const f = path.join(shotDir, name + (mobile ? '-mobile' : '') + '.png'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); console.log('shot', f); return f; },
  log: (...a) => console.log(...a),
};
const defaultScenario = async B => {
  await B.wait(1500);
  await B.shot('01-title');
  await B.eval(`Game.newGame('Tester','scavenger')`);
  await B.wait(600); await B.shot('02-intro');
  for (let i = 0; i < 6 && await B.eval('UI.blocking()'); i++) { await B.key('Enter'); await B.wait(250); await B.eval(`(function(){const b=document.querySelector('#modal button:not([disabled]), .dlg button:not([disabled]), [data-continue]'); if(b) b.click(); return 1;})()`); await B.wait(250); }
  await B.keyDown('KeyW'); await B.wait(1800); await B.keyUp('KeyW');
  await B.keyDown('KeyA'); await B.wait(900); await B.keyUp('KeyA');
  await B.shot('03-walking');
  await B.eval(`fight(['walker','walker'], {onWin:()=> 'won'})`); await B.wait(2500);
  for (let i = 0; i < 12; i++) { await B.click(vw / 2, vh / 2 - 40); await B.wait(220); }
  await B.shot('04-fight');
  await B.eval(`G.hour=22; G.isNight=true`); await B.wait(800); await B.shot('05-night');
  B.log('state', JSON.stringify(await B.eval(`({day:G.day,hour:G.hour,x:+G.p.x.toFixed(1),y:+G.p.y.toFixed(1),hp:G.p.hp,kills:G.stats.kills,fps:Math.round(Game.fps),obj:objective(),calls:R.renderer.info.render.calls,tris:R.renderer.info.render.triangles})`)));
};
(async () => {
  let code = 0;
  try {
    ws = new WebSocket(await connect());
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending[m.id]) { const p = pending[m.id]; delete pending[m.id]; m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
      if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text).split('\n').slice(0, 4).join(' | '));
      if (m.method === 'Runtime.consoleAPICalled') { const t = m.params.args.map(a => a.value !== undefined ? a.value : a.description).join(' '); if (m.params.type === 'error') errors.push('console.error ' + t); else if (m.params.type === 'warning') logs.push('warn ' + t); }
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon|fonts\.g/.test(m.params.entry.text + (m.params.entry.url || ''))) errors.push('log ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    };
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
    if (mobile) { await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 2, mobile: true }); await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
    await send('Page.navigate', { url: page });
    await sleep(500);
    const scen = opt('--scenario');
    await (scen ? require(path.resolve(scen)) : defaultScenario)(B);
  } catch (e) { errors.push('DRIVER ' + e.message); }
  for (const l of logs.slice(0, 10)) console.log(l);
  if (errors.length) { console.log('PAGE ERRORS (' + errors.length + '):\n' + [...new Set(errors)].slice(0, 30).join('\n')); code = 1; } else console.log('No page errors.');
  try { ws && ws.close(); } catch (e) { }
  proc.kill(); setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { } process.exit(code); }, 400);
})();
