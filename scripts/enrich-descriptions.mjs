// يجلب البيانات الناقصة (الوصف، المدة، المخرج، الممثلون، التصنيفات) من Cinemeta
// لكل عنصر لا يحملها في ملفاتنا، ثم يترجم الوصف للعربية.
// آمن للتشغيل المتكرر: يحفظ بعد كل 20 عنصر ويكمل من حيث وقف.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = p => path.join(root, 'data', p);
const META = 'https://v3-cinemeta.strem.io/meta';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' };
const hasArabic = s => /[\u0600-\u06FF]/.test(s);
const sleep = ms => new Promise(s => setTimeout(s, ms));
const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || 3200;

// نقطة ترجمة بديلة عن translate_a: تتحمّل الحجب بعد آلاف الطلبات
async function translate(text) {
  const url = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=ar&format=html&q=' + encodeURIComponent(text);
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return null;
      const j = await r.json();
      const out = Array.isArray(j) ? j[0] : null;
      if (typeof out !== 'string' || !out.trim()) return null;
      return out.trim();
    } catch { await sleep(1500 * (a + 1)); }
  }
  return null;
}

async function getJson(url) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return null;
      return await r.json();
    } catch { await sleep(1200 * (a + 1)); }
  }
  return null;
}

const catalogs = JSON.parse(fs.readFileSync(data('catalogs.json'), 'utf8'));
const featured = JSON.parse(fs.readFileSync(data('movies.json'), 'utf8'));
const journey = JSON.parse(fs.readFileSync(data('journey.json'), 'utf8'));
const AR = data('ar-descriptions.json');
const arDesc = fs.existsSync(AR) ? JSON.parse(fs.readFileSync(AR, 'utf8')) : {};
const EXTRAS = data('extras.json');
const extras = fs.existsSync(EXTRAS) ? JSON.parse(fs.readFileSync(EXTRAS, 'utf8')) : {};

const items = new Map();
for (const m of [...featured, ...Object.values(catalogs).flat(), ...Object.values(journey).flat()]) {
  if (m?.id && /^tt\d+$/.test(m.id) && !items.has(m.id)) items.set(m.id, m);
}
const need = [...items.values()].filter(m => !m.description && !arDesc[m.id]?.ar).slice(0, LIMIT);
console.log(`عناصر ناقصة الوصف: ${need.length} من ${items.size}`);

let ok = 0, tOk = 0, tSkip = 0, fail = 0;
for (const [i, m] of need.entries()) {
  const payload = (await getJson(`${META}/${m.type}/${m.id}.json`))?.meta;
  const description = String(payload?.description || '').replace(/\s+/g, ' ').trim().slice(0, 700);
  if (description.length > 40) {
    extras[m.id] = {
      description,
      runtime: typeof payload?.runtime === 'string' ? payload.runtime : m.runtime || '',
      director: Array.isArray(payload?.director) ? payload.director.filter(x => typeof x === 'string') : m.director || [],
      cast: Array.isArray(payload?.cast) ? payload.cast.filter(x => typeof x === 'string').slice(0, 6) : m.cast || [],
      genres: Array.isArray(payload?.genres) ? payload.genres.filter(x => typeof x === 'string') : m.genres || [],
      background: typeof payload?.background === 'string' ? payload.background : m.background || '',
    };
    ok++;
    const ar = await translate(description);
    if (ar && hasArabic(ar)) { arDesc[m.id] = { ar, en: description.slice(0, 320) }; tOk++; }
    else tSkip++;
  } else fail++;

  if ((i + 1) % 20 === 0) {
    fs.writeFileSync(AR, JSON.stringify(arDesc, null, 2));
    fs.writeFileSync(EXTRAS, JSON.stringify(extras, null, 2));
    console.log(`  ${i + 1}/${need.length} | جلب=${ok} عربي=${tOk} فشل=${fail}`);
  }
  await sleep(280);
}

fs.writeFileSync(AR, JSON.stringify(arDesc, null, 2));
fs.writeFileSync(EXTRAS, JSON.stringify(extras, null, 2));
console.log(`\nانتهى: جلب=${ok} ترجمة=${tOk} تخطي=${tSkip} فشل=${fail}`);
console.log(`extras.json: ${Object.keys(extras).length} | ar-descriptions.json: ${Object.keys(arDesc).length}`);
process.exit(0);