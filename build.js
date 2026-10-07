/* Bundles vendor/three.min.js + src/*.js into one self-contained page (no external scripts). */
const fs = require('fs'), path = require('path');
const S = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
/* Load order matters: data and content first, engine (pure game rules, no THREE), then the 3D/browser layers. */
const ORDER = ['src/data.js', 'src/content.js', 'src/encounters.js', 'src/arcs.js', 'src/engine.js',
  'src/world.js', 'src/actors.js', 'src/render.js', 'src/combat.js', 'src/moments.js', 'src/places.js', 'src/cinematic.js', 'src/ambience.js', 'src/ui.js', 'src/main.js'];
const js = ORDER.map(f => `/* ---- ${path.basename(f)} ---- */\n` + S(f)).join('\n');
const three = S('vendor/three.min.js');
const frag = S('src/shell.html').replace('<!--SCRIPTS-->', () => `<script>\n${three}\n</script>\n<script>\n${js}\n</script>`);
fs.mkdirSync(path.join(__dirname, 'artifact'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'artifact', 'dead-embers.html'), frag);
const i = frag.indexOf('<div id="app">');
fs.writeFileSync(path.join(__dirname, 'Dead Embers.html'), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n${frag.slice(0, i)}</head><body style="margin:0">\n${frag.slice(i)}\n</body></html>\n`);
fs.writeFileSync(path.join(__dirname, 'index.html'), fs.readFileSync(path.join(__dirname, 'Dead Embers.html')));
if (process.argv.includes('--check')) fs.writeFileSync(path.join(__dirname, 'artifact', '_check.js'), js);
module.exports = { ORDER };
console.log('built', (frag.length / 1024).toFixed(0) + 'KB');
