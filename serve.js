/* Local dev server: node serve.js [port]  ->  http://localhost:8765 */
const http = require('http'), fs = require('fs'), path = require('path');
const port = +(process.argv[2] || process.env.PORT || 8765);
http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(__dirname, p);
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain', 'Cache-Control': 'no-store' });
    r.end(d);
  });
}).listen(port, () => console.log('Dead Embers on http://localhost:' + port));
