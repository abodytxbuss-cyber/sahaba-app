import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const SITE = process.env.SOURCE_SITE || 'https://sahaba.onrender.com';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

let backupCache = null;
function loadBackup() {
  if (backupCache) return backupCache;
  const p = path.join(__dirname, 'data', 'movies.json');
  if (!fs.existsSync(p)) return [];
  try {
    backupCache = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    backupCache = [];
  }
  return backupCache;
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    res.writeHead(400);
    return res.end('Bad Request');
  }

  if (url.pathname.startsWith('/api/')) {
    const target = SITE + url.pathname + url.search;
    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers: { ...req.headers, host: new URL(SITE).host },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
        signal: AbortSignal.timeout(60000),
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      let out = buf;
      const ct = upstream.headers.get('content-type') || '';
      if (url.pathname === '/api/content' && /json/.test(ct) && req.method === 'GET') {
        try {
          const j = JSON.parse(buf.toString('utf8'));
          if (j && Array.isArray(j.data)) {
            const known = new Set(j.data.map((x) => x.id));
            const missing = loadBackup().filter((x) => !known.has(x.id));
            if (missing.length) {
              j.data = missing.concat(j.data);
              j.total = j.data.length;
              out = Buffer.from(JSON.stringify(j));
            }
          }
        } catch {}
      }
      res.writeHead(upstream.status, {
        'content-type': ct || 'application/json',
        'access-control-allow-origin': '*',
      });
      return res.end(out);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      return res.end(JSON.stringify({ error: 'proxy failure', detail: e.message }));
    }
  }

  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  const full = path.join(__dirname, file);
  if (!full.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      if (url.pathname !== '/' && !path.extname(file)) {
        return fs.readFile(path.join(__dirname, 'index.html'), (_, d) => {
          res.writeHead(200, { 'content-type': MIME['.html'] });
          res.end(d);
        });
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Not Found');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('سحابة متاحة على: http://localhost:' + PORT);
});