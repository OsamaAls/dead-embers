const http=require('http'),fs=require('fs'),path=require('path');
http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/Dead Embers.html';const f=path.join(__dirname,p);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end('nf')}r.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html; charset=utf-8':'text/plain'});r.end(d)})}).listen(8765);
