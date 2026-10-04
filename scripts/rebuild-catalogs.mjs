// إعادة بناء كل الكتالوجات من مجموعةmovies المحلية، مستخدماً نفس قواعد العرض
// في js/catalog-rules.js حتى لا يختلف ما يُخزَّن عمّا يُعرض.
// الصفوف الثقيلة (الوصف/المدة/المخرج/الممثلون) تُنقل إلى data/details.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtInCollections, filterCollectionRows, normalizeCatalogItem, itemRating, itemYear } from '../js/catalog-rules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = p => path.join(root, 'data', p);
const read = (p, f) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : f;
const CAP = 450;

const pool = new Map();
const add = m => { if (m?.id && /^tt\d+$/.test(m.id)) pool.set(m.id, m); };
for (const rows of Object.values(read(data('catalogs.json'), {}))) for (const m of Array.isArray(rows) ? rows : []) add(m);
read(data('movies.json'), []).forEach(add);
for (const rows of Object.values(read(data('journey.json'), {}))) for (const m of Array.isArray(rows) ? rows : []) add(m);

// الوصف والمدة والمخرج محفوظة في details.json، نعيد دمجها قبل البناء
const previousDetails = read(data('details.json'), {});
for (const [id, extra] of Object.entries(previousDetails)) {
  const m = pool.get(id);
  if (m) pool.set(id, { ...m, ...extra });
}

const items = [...pool.values()].map(m => normalizeCatalogItem(m, 'movie')).filter(m => m.name);
const rated = items.filter(m => itemRating(m) !== null);
const score = m => (itemRating(m) || 0) * 10 + Math.min(10, (itemYear(m) || 1990) - 1980) / 10;
const byQuality = list => [...list].sort((a, b) => score(b) - score(a));
const byPopularity = list => [...list].sort((a, b) => {
  const aGood = (itemRating(a) || 0) >= 6.5 ? 2 : 0, bGood = (itemRating(b) || 0) >= 6.5 ? 2 : 0;
  return (bGood + (itemYear(b) || 0)) - (aGood + (itemYear(a) || 0));
});

const definitions = builtInCollections();
const catalogs = {};
const details = {};
const HEAVY = ['description', 'descriptionAr', 'runtime', 'director', 'cast', 'background', 'releaseInfo', 'logo', 'videos', 'trailers', 'trailerStreams'];
const arTitles = read(data('ar-titles.json'), {});

const store = m => {
  const out = {};
  const heavy = {};
  for (const k of Object.keys(m)) (HEAVY.includes(k) ? (heavy[k] = m[k]) : (out[k] = m[k]));
  if (Object.values(heavy).some(v => v && (!Array.isArray(v) || v.length))) details[m.id] = { ...(details[m.id] || {}), ...heavy };
  return out;
};

const collections = [];
let tooThin = 0;
for (const definition of definitions) {
  const poolForType = items.filter(m => (m.type || 'movie') === definition.type);
  let matches = filterCollectionRows(poolForType, definition);
  const order = definition.slug === 'popular' ? byPopularity : byQuality;
  let rows = order(matches).slice(0, CAP);
  if (matches.length < CAP && definition.id === 'top' && !definition.extra?.genre) rows = order(rows);
  if (rows.length < 25) tooThin++;
  catalogs[definition.key] = rows.map(store);
  collections.push({ ...definition, count: rows.length, nextSkip: 400 });
}

fs.writeFileSync(data('catalogs.json'), JSON.stringify(catalogs, null, 2));
fs.writeFileSync(data('details.json'), JSON.stringify(details, null, 2));

const all = Object.values(catalogs).flat();
const uniq = new Map();
for (const m of [...read(data('movies.json'), []), ...all]) uniq.set(`${m.type}:${m.id}`, m);
const movies = [...uniq.values()].filter(m => m.type === 'movie');
const series = [...uniq.values()].filter(m => m.type === 'series');

fs.writeFileSync(data('collections.json'), JSON.stringify({
  updatedAt: new Date().toISOString(),
  uniqueMovies: movies.length,
  uniqueSeries: series.length,
  collections,
}, null, 2));

console.log('== الكتالوجات ==');
for (const c of collections) {
  const rows = catalogs[c.key];
  const ar = rows.filter(m => arTitles[m.id]?.ar).length;
  console.log(`  ${c.slug.padEnd(14)} ${String(c.count).padStart(4)}  عربي ${String(Math.round(100 * ar / rows.length)).padStart(3)}%  ${c.key}`);
}
console.log(`\nأقل من 25 عنصراً: ${tooThin}`);
console.log(`فريدة: ${movies.length} فيلم + ${series.length} مسلسل`);
console.log(`عناوين عربية: ${[...uniq.values()].filter(m => arTitles[m.id]?.ar).length}/${uniq.size}`);
console.log(`catalogs.json ${(fs.statSync(data('catalogs.json')).size / 1048576).toFixed(2)} MB | details.json ${(fs.statSync(data('details.json')).size / 1048576).toFixed(2)} MB`);