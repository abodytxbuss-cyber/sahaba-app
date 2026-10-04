// رفع كتالوج التطبيق إلى موقع سحابة (sahaba.onrender.com).
//
// الاستخدام من مجلد المشروع:
//   $env:SAHABA_TOKEN='<توكن الأدمن>'
//   node scripts/upload-to-sahaba.mjs                  # معاينة فقط (لا يكتب)
//   node scripts/upload-to-sahaba.mjs --run            # رفع كل الناقص
//   node scripts/upload-to-sahaba.mjs --run --limit=50  # دفعة صغيرة
//   node scripts/upload-to-sahaba.mjs --run --type=movie --delay=2500
//
// المتاح: --run --limit=N --delay=MS --type=movie|series --yes
// التوكن يُقرأ من SAHABA_TOKEN ولا يُخزَّن في المستودع.

import fs from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const SITE = process.env.SAHABA_SITE || 'https://sahaba.onrender.com';
const TOKEN = process.env.SAHABA_TOKEN || '';
const args = process.argv.slice(2);
const flag = name => args.includes('--' + name);
const opt = (name, dflt) => {
  const a = args.find(x => x.startsWith('--' + name + '='));
  return a ? a.split('=')[1] : dflt;
};

if (!TOKEN) {
  console.error('مطلوب: $env:SAHABA_TOKEN  (توكن الأدمن من تسجيل الدخول)');
  process.exit(1);
}
if (!flag('yes') && flag('run')) {
  console.error('رفع بالكتلة على سيرفر حي. أضف --yes للتأكيد.');
  process.exit(1);
}

const RUN = flag('run');
const LIMIT = Number(opt('limit', '0')) || Infinity;
const DELAY = Number(opt('delay', '1500'));
const ONLY = opt('type', '');

const auth = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
const sleep = ms => new Promise(s => setTimeout(s, ms));

// السايت يحظر مؤقتاً (429) بعد عدد محاولات — نعيد المحاولة بهدوء
async function api(path, init = {}, tries = 5) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(SITE + path, { ...init, headers: { ...auth, Accept: 'application/json', ...(init.headers || {}) }, signal: AbortSignal.timeout(90000) });
    const t = await r.text();
    let d; try { d = JSON.parse(t); } catch { d = { raw: t.slice(0, 200) }; }
    if (r.ok) return d;
    const err = new Error(r.status + ' ' + (d?.error || d?.message || d?.raw || ''));
    if ((r.status === 429 || r.status >= 500) && attempt < tries) {
      const wait = Math.min(30000, 4000 * attempt) + Math.random() * 2000;
      console.log('  … ' + r.status + '، إعادة المحاولة بعد ' + Math.round(wait / 1000) + 's (' + attempt + '/' + tries + ')');
      await sleep(wait);
      continue;
    }
    throw err;
  }
}
const wait = sleep;

// تحقّق من الصلاحية (غير أساسي: بعض الخطط تحجب /api/auth/me)
let adminOK = false;
try { adminOK = (await api('/api/auth/me', {}, 2))?.user?.isAdmin === true; } catch {}
if (adminOK) console.log('تحقّق الأدمن ✓'); else console.log('تحقّق /api/auth/me محجوب — نعتمد على صلاحية الكتابة نفسها');

// ما هو موجود مسبقاً — بمفتاح title مطبّع لتفادي التكرار بالعناوين
const existingById = new Set();
const existingByTitle = new Set();
let pages = 0;
for (let page = 1; page <= 200; page++) {
  const r = await api('/api/content?page=' + page + '&limit=200');
  const rows = r?.data || [];
  pages = r?.pages || 1;
  for (const m of rows) {
    if (m.id) existingById.add(m.id);
    if (m.sourceId) existingById.add(m.sourceId + '-' + (m.title || '').toLowerCase());
    const key = String(m.title || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '').slice(0, 40);
    if (key) existingByTitle.add(key);
    if (m.sourceUrl) { const im = m.sourceUrl.match(/tt\d+/); if (im) existingById.add('imdb:' + im[0]); }
  }
  if (!rows.length || page >= pages) break;
  await wait(300);
}
console.log('موجود على سحابة:', existingById.size, 'ids |', existingByTitle.size, 'عناوين |', pages, 'صفحة');

const catalogs = JSON.parse(fs.readFileSync(new URL('data/catalogs.json', ROOT), 'utf8'));
const featured = JSON.parse(fs.readFileSync(new URL('data/movies.json', ROOT), 'utf8'));

const titleKey = t => String(t || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '').slice(0, 40);

const byImdb = new Map();
for (const m of [...featured, ...Object.values(catalogs).flat()]) {
  if (!m?.id || !/^tt\d+$/.test(m.id) || !m.name) continue;
  if (!byImdb.has(m.id)) byImdb.set(m.id, m);
}

const todo = [];
for (const m of byImdb.values()) {
  const type = m.type === 'series' ? 'series' : 'movie';
  if (ONLY && ONLY !== type) continue;
  const imdb = 'imdb:' + m.id;
  if (existingById.has(imdb)) continue;
  if (existingByTitle.has(titleKey(m.name))) continue;
  todo.push(m);
}

console.log('الكتالوج المحلي:', byImdb.size, '| ناقص للرفع:', todo.length);
if (!todo.length) { console.log('لا يوجد شيء جديد. تم.'); process.exit(0); }

// روابط المشاهدة: الخوادم تلتقطها من IMDb عبر background scanner
const payload = (m, type) => {
  const year = Number(String(m.releaseInfo || m.year || '').replace(/\D/g, '').slice(0, 4)) || undefined;
  return {
    title: m.name,
    type,
    year,
    description: m.description || undefined,
    poster: m.poster || undefined,
    genre: Array.isArray(m.genres) ? m.genres.slice(0, 3).join(', ') : undefined,
    quality: 'HD',
    embedUrl: 'https://vidsrc.xyz/' + type + '/' + m.id,
  };
};

const batch = todo.slice(0, LIMIT);
console.log('الدفعة:', batch.length, batch.length < todo.length ? '(متبقي ' + (todo.length - batch.length) + ')' : '');
if (!RUN) {
  console.log('\nمعاينة أول 12:');
  batch.slice(0, 12).forEach(m => console.log('  +', (m.type === 'series' ? 'series' : 'movie'), m.id, '|', m.name, m.releaseInfo || ''));
  console.log('\nمعاينة فقط. أضف --run --yes للتنفيذ.');
  process.exit(0);
}

let ok = 0, skip = 0, fail = 0;
const errors = new Map();
const started = Date.now();
for (const [i, m] of batch.entries()) {
  const type = m.type === 'series' ? 'series' : 'movie';
  try {
    const r = await api('/api/admin/content', { method: 'POST', body: JSON.stringify(payload(m, type)) });
    if (r?.ok) { ok++; existingByTitle.add(titleKey(m.name)); existingById.add('imdb:' + m.id); }
    else skip++;
  } catch (e) {
    fail++;
    const msg = String(e.message).slice(0, 90);
    errors.set(msg, (errors.get(msg) || 0) + 1);
    if (fail <= 5) console.log('  X ' + m.name + ' :: ' + msg);
  }
  if ((i + 1) % 25 === 0) {
    const rate = ((i + 1) / ((Date.now() - started) / 1000)).toFixed(1);
    console.log('  ' + (i + 1) + '/' + batch.length + ' | نجح=' + ok + ' فشل=' + fail + ' | ' + rate + '/s');
  }
  await wait(DELAY);
}

console.log('\n=== انتهى ===');
console.log('نجح: ' + ok + ' | مكرر: ' + skip + ' | فشل: ' + fail + ' | المدة: ' + Math.round((Date.now() - started) / 1000) + 's');
if (errors.size) { console.log('أخطاء:'); for (const [k, v] of [...errors].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log('  ' + v + '× ' + k); }
try { const s = await api('/api/stats'); console.log('سحابة الآن: ' + s.totalContent + ' عنصر (' + s.totalMovies + ' فيلم / ' + s.totalSeries + ' مسلسل)'); } catch {}