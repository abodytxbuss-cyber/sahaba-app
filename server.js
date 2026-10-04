import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifest as addonManifest, stream as addonStream, subtitles as addonSubtitles, providers as addonProviders } from './js/stream-addon.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const cache = new Map();
const allowed = new Set(['v3-cinemeta.strem.io','cinemeta-catalogs.strem.io','opensubtitles-v3.strem.io', ...(process.env.PROXY_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean)]);
const proxyAllowed=target=>target.protocol==='https:'&&!target.port&&!target.username&&!target.password&&allowed.has(target.hostname)&&target.pathname.endsWith('.json');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.png':'image/png', '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8', '.vtt':'text/vtt; charset=utf-8' };
const sendJSON = (res, status, obj) => { res.writeHead(status, { 'Content-Type':mime['.json'], 'Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify(obj)); };
export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS' }); return res.end(); }
    if (!['GET','HEAD'].includes(req.method)) return sendJSON(res, 405, {error:'طريقة الطلب غير مدعومة'});
    if (url.pathname === '/health') return sendJSON(res, 200, {ok:true});
    // إضافة Stremio مدمجة: manifest + stream + subtitles من نفس الأصل
    if (url.pathname === '/addon/manifest.json') return sendJSON(res, 200, addonManifest());
    if (url.pathname.startsWith('/addon/')) {
      const call = url.pathname.match(/^\/addon\/(stream|subtitles)\/(movie|series)\/(tt\d+)\.json$/);
      if (!call) return sendJSON(res, 404, {error:'مسار الإضافة غير موجود'});
      try {
        const data = call[1] === 'stream' ? await addonStream(call[2], call[3]) : await addonSubtitles(call[2], call[3]);
        return sendJSON(res, 200, data);
      } catch {
        // لا نضيع المشاهدة بسبب الأرشيف: نعيد المزوّدين على الأقل
        return sendJSON(res, 200, call[1] === 'stream' ? { streams: addonProviders({ id: call[3], type: call[2] }) } : { subtitles: [] });
      }
    }
    if (url.pathname === '/api/proxy') {
      let target;
      try { target = new URL(url.searchParams.get('url')); } catch { return sendJSON(res,400,{error:'رابط غير صالح'}); }
      // يُفحص كل تحويل أيضاً؛ Cinemeta يحيل الكتالوجات إلى مضيفه الرسمي الثاني.
      if (process.env.ENABLE_PROXY === 'false' || !proxyAllowed(target)) return sendJSON(res,403,{error:'هذا المضيف غير مفعّل في الوكيل. استخدم الاتصال المباشر أو أضفه إلى PROXY_HOSTS.'});
      const key = target.href, cached = cache.get(key);
      if (cached && cached.expires > Date.now()) return sendJSON(res,200,cached.value);
      let upstream;
      const signal=AbortSignal.timeout(10000);
      for(let hop=0;hop<4;hop++){
        upstream=await fetch(target.href,{signal,redirect:'manual',headers:{Accept:'application/json'}});
        if(![301,302,303,307,308].includes(upstream.status))break;
        const location=upstream.headers.get('location');await upstream.body?.cancel();
        if(!location)return sendJSON(res,502,{error:'تحويل غير صالح من الإضافة'});
        target=new URL(location,target);
        if(!proxyAllowed(target))return sendJSON(res,403,{error:'تحويل الإضافة إلى مضيف غير مسموح'});
      }
      if (!upstream.ok) return sendJSON(res,502,{error:'تعذر الوصول إلى الإضافة'});
      const reader = upstream.body.getReader(); let size = 0; const chunks = [];
      while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > 5_000_000) { await reader.cancel(); return sendJSON(res,413,{error:'استجابة الإضافة كبيرة جداً'}); } chunks.push(Buffer.from(value)); }
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key,{value,expires:Date.now()+300000});
      return sendJSON(res,200,value);
    }
    let file;
    try { file = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'; } catch { return sendJSON(res,400,{error:'مسار غير صالح'}); }
    const full = path.resolve(root, file);
    const publicFile = ['index.html','style.css','app.js','sw.js'].includes(file) || /^(js|data|assets)\/[a-zA-Z0-9_./-]+$/.test(file);
    if (!publicFile || !full.startsWith(root + path.sep) || file.split('/').some(p => p.startsWith('.'))) return sendJSON(res,404,{error:'الصفحة غير موجودة'});
    try {
      const body = await readFile(full);
      res.writeHead(200, {'Content-Type':mime[path.extname(full)] || 'application/octet-stream','Cache-Control':file.startsWith('assets/') ? 'public, max-age=86400' : 'no-cache'});
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { sendJSON(res,404,{error:'الملف غير موجود'}); }
  } catch { sendJSON(res,502,{error:'تعذر الاتصال حالياً. حاول مجدداً.'}); }
});
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'المنفذ مستخدم. أغلق النسخة السابقة أو اختر PORT آخر.' : 'تعذر بدء الخادم: ' + error.message); process.exitCode=1; });
  server.listen(Number(process.env.PORT || 8080), process.env.HOST || undefined, () => console.log('سحابة متاحة على http://localhost:' + (process.env.PORT || 8080)));
}
