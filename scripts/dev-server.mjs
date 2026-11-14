// Server lokal sederhana: melayani public/ dan meneruskan /api/* ke handler di api/.
// Pakai: node scripts/dev-server.mjs (env dibaca dari .env kalau ada). Port default 3000.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (existsSync('.env')) {
  for (const baris of readFileSync('.env', 'utf8').split('\n')) {
    const m = baris.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TIPE = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain', '.txt': 'text/plain' };
const PUBLIC = resolve('public');
const port = Number(process.env.PORT || 3000);
// header keamanan sama seperti produksi (dari vercel.json)
const HEADER_GLOBAL = Object.fromEntries((JSON.parse(readFileSync('vercel.json', 'utf8')).headers.find((h) => h.source === '/(.*)')?.headers || []).map((h) => [h.key, h.value]));

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const file = resolve('api', url.pathname.slice(5) + '.js');
      if (!file.startsWith(resolve('api')) || !existsSync(file)) { res.writeHead(404).end('{"error":"tidak ada"}'); return; }
      const mod = await import(pathToFileURL(file).href);
      const fn = mod[req.method];
      if (!fn) { res.writeHead(405).end(); return; }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', req.socket.remoteAddress || '127.0.0.1');
      const r = await fn(new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let p = join(PUBLIC, decodeURIComponent(url.pathname));
    if (!p.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
    if ((await stat(p).catch(() => null))?.isDirectory()) p = join(p, 'index.html');
    const isi = await readFile(p);
    res.writeHead(200, { ...HEADER_GLOBAL, 'content-type': TIPE[extname(p)] || 'application/octet-stream' });
    res.end(isi);
  } catch (e) {
    if (e.code === 'ENOENT') { res.writeHead(404).end('not found'); return; }
    console.error(e);
    res.writeHead(500).end('error');
  }
}).listen(port, () => console.log(`RISETWORKS lokal: http://localhost:${port}`));
