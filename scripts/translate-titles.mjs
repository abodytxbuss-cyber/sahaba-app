// يترجم كل العناوين الناقصة إلى العربية عبر مترجم Google المجاني.
// آمن للتشغيل المتكرر: يحفظ بعد كل 50 عنصر ويكمل من حيث وقف.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = p => path.join(root, 'data', p);
const FILE = data('ar-titles.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' };
const hasArabic = s => /[\u0600-\u06FF]/.test(s);
const sleep = ms => new Promise(s => setTimeout(s, ms));

const titles = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const catalogs = JSON.parse(fs.readFileSync(data('catalogs.json'), 'utf8'));
const featured = JSON.parse(fs.readFileSync(data('movies.json'), 'utf8'));

const items = new Map();
for (const m of [...featured, ...Object.values(catalogs).flat()]) {
  if (m?.id && /^tt\d+$/.test(m.id) && m.name) items.set(m.id, m);
}
const need = [...items.values()].filter(m => !titles[m.id]?.ar);
console.log(`مطلوب ترجمته: ${need.length} من ${items.size}`);

async function translate(text) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=' + encodeURIComponent(text);
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
      if (r.status === 429 || r.status >= 500) throw Error('http ' + r.status);
      if (!r.ok) return null;
      const j = await r.json();
      const out = (j[0] || []).map(p => p[0]).join('').trim();
      if (!out) return null;
      return out;
    } catch {
      await sleep(2000 * (a + 1));
    }
  }
  return null;
}

let ok = 0, skipped = 0, failed = 0;
for (const [i, m] of need.entries()) {
  const ar = await translate(m.name);
  if (!ar) failed++;
  else if (!hasArabic(ar) || ar === m.name) skipped++;
  else { titles[m.id] = { ar, en: m.name }; ok++; }

  if ((i + 1) % 50 === 0) {
    fs.writeFileSync(FILE, JSON.stringify(titles, null, 2));
    console.log(`  ${i + 1}/${need.length} | ok=${ok} skipped=${skipped} failed=${failed}`);
  }
  await sleep(150);
}

fs.writeFileSync(FILE, JSON.stringify(titles, null, 2));
const total = items.size;
const covered = [...items.values()].filter(m => titles[m.id]?.ar).length;
console.log(`\nانتهى: ok=${ok} skipped=${skipped} failed=${failed}`);
console.log(`التغطية الآن: ${covered}/${total} (${((covered / total) * 100).toFixed(1)}%) | ملف الترجمة ${Object.keys(titles).length}`);