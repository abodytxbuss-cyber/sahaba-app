// بديل /api/proxy في النشر الساكن (Vercel/Netlify/Pages Functions).
// يستخدم نفس قواعد السماح في server.js حتى لا يتحوّل الخادم إلى وكيل مفتوح.
const ALLOWED = new Set([
  'v3-cinemeta.strem.io',
  'cinemeta-catalogs.strem.io',
  'opensubtitles-v3.strem.io',
  'opensubtitles-catalogos.strem.io',
]);

export default async function handler(req) {
  const url = new URL(req.url);
  const raw = url.searchParams.get('url');
  if (!raw) return new Response(JSON.stringify({ error: 'رابط غير صالح' }), { status: 400, headers: json() });

  let target;
  try { target = new URL(raw); } catch { return new Response(JSON.stringify({ error: 'رابط غير صالح' }), { status: 400, headers: json() }); }

  const allowed = t => t.protocol === 'https:' && !t.port && !t.username && !t.password && ALLOWED.has(t.hostname) && t.pathname.endsWith('.json');

  let hops = 0;
  while (hops++ < 4) {
    if (!allowed(target)) return new Response(JSON.stringify({ error: 'هذا المضيف غير مسموح.' }), { status: 403, headers: json() });
    const upstream = await fetch(target.href, { headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(12000) });
    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      const location = upstream.headers.get('location');
      if (!location) return new Response(JSON.stringify({ error: 'تحويل غير صالح' }), { status: 502, headers: json() });
      target = new URL(location, target);
      continue;
    }
    if (!upstream.ok) return new Response(JSON.stringify({ error: 'تعذر الوصول إلى الإضافة' }), { status: 502, headers: json() });
    const text = await upstream.text();
    if (text.length > 5_000_000) return new Response(JSON.stringify({ error: 'استجابة كبيرة جداً' }), { status: 413, headers: json() });
    return new Response(text, { status: 200, headers: json() });
  }
  return new Response(JSON.stringify({ error: 'تجاوز عدد التحويلات' }), { status: 502, headers: json() });
}

function json() {
  return { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' };
}