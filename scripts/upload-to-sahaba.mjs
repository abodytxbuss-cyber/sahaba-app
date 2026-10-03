// رفع كتالوج التطبيق إلى موقع سحابة.
// الاستخدام:
//   node scripts/upload-to-sahaba.mjs            # معاينة فقط (لا يكتب شيئاً)
//   node scripts/upload-to-sahaba.mjs --run      # رفع فعلي
//   node scripts/upload-to-sahaba.mjs --run --limit=100
//
// بيانات الدخول تُقرأ من متغيرات البيئة (ولا تُكتب في المستودع):
//   $env:SAHABA_EMAIL = '...'; $env:SAHABA_PASSWORD = '...'
// أو من ملف .env محلي (مُستثنى في .gitignore):
//   SAHABA_EMAIL=...
//   SAHABA_PASSWORD=...

import fs from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const SITE = process.env.SAHABA_SITE || 'https://sahaba.onrender.com';
const args = process.argv.slice(2);
const RUN = args.includes('--run');
const LIMIT = Number((args.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity;
const DELAY = Number((args.find(a => a.startsWith('--delay=')) || '').split('=')[1]) || 1200;

// .env محلي
try {
  for (const line of fs.readFileSync(new URL('../.env', ROOT), 'utf8').split('\n')) {
    const m = line.match(/^\s*(SAHABA_[A-Z_]+)\s*=\s*(.+)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const EMAIL = process.env.SAHABA_EMAIL;
const PASSWORD = process.env.SAHABA_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('مطلوب: SAHABA_EMAIL و SAHABA_PASSWORD\n');
  console.error('مثال (PowerShell):');
  console.error("  $env:SAHABA_EMAIL='you@mail.com'; $env:SAHABA_PASSWORD='••••'; node scripts/upload-to-sahaba.mjs --run --limit=20");
  process.exit(1);
}

let token = '';
async function api(path, options = {}) {
  const r = await fetch(SITE + path, {
    ...options,
    signal: AbortSignal.timeout(60000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(options.headers || {}) },
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  if (!r.ok) throw new Error(r.status + ' ' + (data?.error || data?.message || data?.raw || ''));
  return data;
}

const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
token = login?.token || login?.accessToken || login?.jwt || '';
if (!token) throw new Error('الاستجابة لا تحتوي توكن: ' + JSON.stringify(login).slice(0, 200));
const me = await api('/api/auth/me');
console.log('مسجّل الدخول:', me?.user?.username || me?.username || me?.email, '| أدمن:', Boolean(me?.user?.isAdmin ?? me?.isAdmin));

// ما هو موجود مسبقاً
const existing = new Map();
for (let page = 1; page <= 60; page++) {
  const r = await api('/api/content?page=' + page + '&limit=200');
  const rows = r?.data || [];
  for (const m of rows) existing.set(m.id, m);
  if (!rows.length || page >= (r.pages || 1)) break;
}
console.log('موجود حالياً على سحابة:', existing.size);

const compact = m => ({
  id: m.id,
  title: m.name,
  type: m.type === 'series' ? 'series' : 'movie',
  year: Number(String(m.releaseInfo || m.year || '').replace(/\D/g, '').slice(0, 4)) || undefined,
  imdbRating: m.imdbRating || undefined,
  genres: (m.genres || []).slice(0, 4),
  description: (m.description || '').slice(0, 1500) || undefined,
  poster: m.poster || undefined,
});
const toSlug = (m) => (m.type === 'series' ? 'series' : 'mov') + '-' + m.id;

const catalogs = JSON.parse(fs.readFileSync(new URL('data/catalogs.json', ROOT), 'utf8'));
const featured = JSON.parse(fs.readFileSync(new URL('data/movies.json', ROOT), 'utf8'));
const seen = new Map();
for (const m of [...featured, ...Object.values(catalogs).flat()]) {
  if (!m?.id || !/^tt\d+$/.test(m.id) || !m.name) continue;
  if (seen.has(m.id)) continue;
  seen.set(m.id, compact(m));
}
const queue = [...seen.values()];
const todo = queue.filter(m => !existing.has(m.id)).slice(0, LIMIT);

console.log('في الكتالوج:', queue.length, '| جديد غير مرفوع:', todo.length, LIMIT === Infinity ? '' : '(محدود بـ ' + LIMIT + ')');
if (!RUN) {
  console.log('\nمعاينة أول 10:');
  todo.slice(0, 10).forEach(m => console.log('  +', toSlug(m), '|', m.title, m.year ? '(' + m.year + ')' : ''));
  console.log('\nهذه معاينة فقط. أضف --run للتنفيذ.');
  process.exit(0);
}

let ok = 0, fail = 0;
for (const [i, m] of todo.entries()) {
  const id = toSlug(m);
  try {
    // 1) جلب البيانات الوصفية من IMDb عبر إضافتهم
    let meta = null;
    try { meta = await api('/api/admin/fetch-meta', { method: 'POST', body: JSON.stringify({ imdbId: m.id, type: m.type }) }); } catch {}
    // 2) إنشاء العنصر
    const body = {
      id,
      title: m.title,
      type: m.type === 'series' ? 'series' : 'movie',
      year: m.year,
      imdbId: m.id,
      description: m.description,
      poster: m.poster,
      genres: m.genres,
      ...(meta?.meta || meta || {}),
    };
    delete body.id2;
    await api('/api/admin/content', { method: 'POST', body: JSON.stringify(body) });
    ok++;
    if ((i + 1) % 20 === 0) console.log('  ' + (i + 1) + '/' + todo.length + ' نجح=' + ok + ' فشل=' + fail);
  } catch (e) {
    fail++;
    if (fail <= 8) console.log('  X ' + id + ' :: ' + e.message);
  }
  await new Promise(s => setTimeout(s, DELAY));
}
console.log('انتهى: نجح=' + ok + ' فشل=' + fail);