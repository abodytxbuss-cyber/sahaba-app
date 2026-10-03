// يجلب كتالوجاً واحداً من Cinemeta ويدمجه في data/catalogs.json
// الاستخدام:  node scripts/catalog-one.mjs movie/top
// ملاحظة: Cinemeta يتجاهل ?skip، فاستخدم مفاتيح مختلفة (top/imdbRating/year/genre) للتوسّع.
import fs from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const slug = process.argv[2];
if (!slug || !/^(movie|series)\/[a-zA-Z0-9-]+$/.test(slug)) {
  console.error('الاستخدام: node scripts/catalog-one.mjs movie/top');
  process.exit(1);
}

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Stremio/1.20', Accept: 'application/json' };
const readJSON = async name => JSON.parse(await fs.readFile(new URL('data/' + name + '.json', ROOT), 'utf8'));
const type = slug.split('/')[0];

const compact = m => Object.fromEntries(Object.entries({
  id: m.id,
  type: m.type || 'movie',
  name: m.name,
  poster: m.poster,
  background: m.background,
  releaseInfo: m.releaseInfo || (m.year ? String(m.year) : undefined),
  genres: m.genres || m.genre || [],
  imdbRating: m.imdbRating,
}).filter(([, v]) => v !== undefined));

const catalogs = await readJSON('catalogs');
const movies = await readJSON('movies');
const manifest = await readJSON('collections');
const posters = await readJSON('posters');

let rows = [];
try {
  const r = await fetch('https://v3-cinemeta.strem.io/catalog/' + slug + '.json', { headers: UA, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw Error('HTTP ' + r.status);
  const j = await r.json();
  rows = (j.metas || []).filter(m => m?.id && m?.name && /^tt\d+$/.test(m.id)).map(compact);
} catch (e) {
  console.error('تعذّر الجلب:', e.message, '- تم الإبقاء على النسخة المحفوظة.');
  rows = (catalogs[slug] || []).slice();
}

catalogs[slug] = [...new Map(rows.map(m => [m.id, m])).values()];
const collection = manifest.collections.find(c => c.key === slug);
if (collection) collection.count = catalogs[slug].length;

for (const m of catalogs[slug].slice(0, 60)) {
  if (posters[m.id] || !m.poster) continue;
  try {
    const img = await fetch(m.poster, { headers: UA, signal: AbortSignal.timeout(12000) });
    if (!img.ok) throw Error();
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length < 1500) throw Error();
    await fs.writeFile(new URL('assets/' + m.id + '.jpg', ROOT), buf);
    posters[m.id] = 'assets/' + m.id + '.jpg';
  } catch { posters[m.id] = 'assets/poster.svg'; }
}

const all = new Map();
for (const m of movies) all.set(m.type + ':' + m.id, m);
for (const rows2 of Object.values(catalogs)) for (const m of rows2) all.set(m.type + ':' + m.id, m);
manifest.updatedAt = new Date().toISOString();
manifest.uniqueMovies = [...all.values()].filter(m => m.type === 'movie').length;
manifest.uniqueSeries = [...all.values()].filter(m => m.type === 'series').length;

await fs.writeFile(new URL('data/catalogs.json', ROOT), JSON.stringify(catalogs));
await fs.writeFile(new URL('data/collections.json', ROOT), JSON.stringify(manifest, null, 2));
await fs.writeFile(new URL('data/posters.json', ROOT), JSON.stringify(posters, null, 2));

console.log(JSON.stringify({ key: slug, rows: catalogs[slug].length, uniqueMovies: manifest.uniqueMovies, uniqueSeries: manifest.uniqueSeries }));
