// يترجم أوصاف الأفلام إلى العربية للعناصر التي يراها المستخدم أولاً:
// إصدارات سحابة + الأعلى تقييماً + الأكثر رواجاً + أول عنصر من كل تصنيف + رحلة المشاهدة.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = p => path.join(root, 'data', p);
const OUT = data('ar-descriptions.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' };
const hasArabic = s => /[\u0600-\u06FF]/.test(s);
const sleep = ms => new Promise(s => setTimeout(s, ms));
const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || 1200;

const catalogs = JSON.parse(fs.readFileSync(data('catalogs.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(data('collections.json'), 'utf8'));
const featured = JSON.parse(fs.readFileSync(data('movies.json'), 'utf8'));
const journey = JSON.parse(fs.readFileSync(data('journey.json'), 'utf8'));
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

const wanted = new Map();
const add = m => { if (m?.id && /^tt\d+$/.test(m.id) && (m.descriptionAr || m.description)) wanted.set(m.id, m); };
featured.forEach(add);
Object.values(journey).flat().forEach(add);
for (const slug of ['top-rated', 'popular', 'year-2026']) {
  const c = manifest.collections.find(x => x.slug === slug);
  if (c) (catalogs[c.key] || []).slice(0, 120).forEach(add);
}
for (const c of manifest.collections) (catalogs[c.key] || []).slice(0, 25).forEach(add);

const need = [...wanted.values()].filter(m => !out[m.id]?.ar).slice(0, LIMIT);
console.log(`أوصاف مطلوبة: ${need.length} (المخزون ${Object.keys(out).length})`);

async function translate(text) {
  const url = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=ar&format=html&q=' + encodeURIComponent(text);
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return null;
      const j = await r.json();
      const res = Array.isArray(j) ? j[0] : null;
      return typeof res === 'string' && res.trim() ? res.trim() : null;
    } catch { await sleep(1500 * (a + 1)); }
  }
  return null;
}

let ok = 0, skipped = 0, failed = 0;
for (const [i, m] of need.entries()) {
  const text = String(m.description || '').replace(/\s+/g, ' ').trim().slice(0, 700);
  if (text.length < 40) { skipped++; continue; }
  const ar = await translate(text);
  if (!ar) failed++;
  else if (!hasArabic(ar)) skipped++;
  else { out[m.id] = { ar, en: text.slice(0, 320) }; ok++; }
  if ((i + 1) % 25 === 0) {
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(`  ${i + 1}/${need.length} | ok=${ok} skipped=${skipped} failed=${failed}`);
  }
  await sleep(200);
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\nانتهى: ok=${ok} skipped=${skipped} failed=${failed} | الإجمالي ${Object.keys(out).length}`);
process.exit(0);