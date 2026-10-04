// يوسّع كل كتالوجات الأفلام والمسلسلات من Cinematio (مصدر Stremio)؛
// يجمع كل النتائج في مجموعة واحدة ثم يبني كل collection على أساس النوع + التصنيف + السنة.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = p => path.join(root, 'data', p);
const BASE = 'https://v3-cinemeta.strem.io/catalog';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' };
const CAP = 300;
const sleep = ms => new Promise(s => setTimeout(s, ms));

const GENRES = [
  ['action', 'أكشن وإثارة', 'Action'], ['adventure', 'مغامرات', 'Adventure'],
  ['animation', 'رسوم متحركة', 'Animation'], ['comedy', 'كوميديا', 'Comedy'],
  ['crime', 'جريمة وتحقيق', 'Crime'], ['drama', 'دراما', 'Drama'],
  ['family', 'أفلام عائلية', 'Family'], ['fantasy', 'فانتازيا', 'Fantasy'],
  ['history', 'تاريخ', 'History'], ['horror', 'رعب', 'Horror'],
  ['music', 'موسيقى', 'Music'], ['mystery', 'غموض', 'Mystery'],
  ['romance', 'رومانسية', 'Romance'], ['sci-fi', 'خيال علمي', 'Sci-Fi'],
  ['sport', 'رياضة', 'Sport'], ['thriller', 'تشويق', 'Thriller'],
  ['documentary', 'وثائقيات', 'Documentary'], ['war', 'أفلام حربية', 'War'],
  ['biography', 'سيرة ذاتية', 'Biography'], ['western', 'غربية', 'Western'],
];
const YEAR_CATALOGS = [2026, 2025, 2024, 2023, 2022, 2021, 2020];
const YEARS_TO_HARVEST = [];
for (let y = 2026; y >= 1990; y--) YEARS_TO_HARVEST.push(y);

const readJSON = (p, fallback) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;
const writeJSON = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));

const ids = new Set();
const short = v => (typeof v === 'string' ? v : '');
const list = v => (Array.isArray(v) ? v.map(short).filter(Boolean) : []);

function normalize(raw, expectType) {
  const id = short(raw.id);
  if (!/^tt\d{5,}$/.test(id)) return null;
  const type = raw.type === 'series' ? 'series' : 'movie';
  if (expectType && type !== expectType) return null;
  if (ids.has(id)) return null;
  ids.add(id);
  const rating = Number(raw.imdbRating);
  const year = Number(raw.year) || null;
  return {
    id, type,
    name: short(raw.name).slice(0, 160),
    poster: short(raw.poster),
    year,
    imdbRating: Number.isFinite(rating) ? rating : null,
    genres: list(raw.genres).slice(0, 6),
    description: short(raw.description).replace(/\s+/g, ' ').trim().slice(0, 320),
    runtime: short(raw.runtime),
    director: list(raw.director).slice(0, 3),
    cast: list(raw.cast).slice(0, 5),
  };
}

async function fetchCatalog(url, expectType, label) {
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
    if (!res.ok) { console.log(`  ✗ ${label} -> ${res.status}`); return []; }
    const json = await res.json();
    const metas = Array.isArray(json.metas) ? json.metas : [];
    const fresh = metas.map(m => normalize(m, expectType)).filter(Boolean);
    console.log(`  ✓ ${label} -> ${metas.length} (جديد ${fresh.length})`);
    return fresh;
  } catch (e) {
    console.log(`  ✗ ${label} -> ${e.message}`);
    return [];
  }
}

const pool = [];
console.log('== حصاد أفلام Stremio حسب السنة ==');
for (const y of YEARS_TO_HARVEST) {
  pool.push(...await fetchCatalog(`${BASE}/movie/year=${y}.json`, 'movie', `فيلم ${y}`));
  await sleep(180);
}
console.log('== حصاد مسلسلات Stremio ==');
for (const y of YEARS_TO_HARVEST) {
  pool.push(...await fetchCatalog(`${BASE}/series/year=${y}.json`, 'series', `مسلسل ${y}`));
  await sleep(180);
}
console.log('== حصاد التصنيفات ==');
for (const [, , genre] of GENRES) {
  pool.push(...await fetchCatalog(`${BASE}/movie/top/genre=${encodeURIComponent(genre)}.json`, 'movie', genre));
  await sleep(180);
}
pool.push(...await fetchCatalog(`${BASE}/movie/top.json`, 'movie', 'الأكثر رواجاً'));
await sleep(200);
pool.push(...await fetchCatalog(`${BASE}/movie/imdbRating.json`, 'movie', 'الأعلى تقييماً'));
await sleep(200);
pool.push(...await fetchCatalog(`${BASE}/series/top.json`, 'series', 'مسلسلات رائجة'));
await sleep(200);
pool.push(...await fetchCatalog(`${BASE}/series/imdbRating.json`, 'series', 'مسلسلات الأعلى تقييماً'));

const movies = pool.filter(m => m.type === 'movie');
const series = pool.filter(m => m.type === 'series');
console.log(`\nالمجموعة: ${movies.length} فيلم + ${series.length} مسلسل`);

// ندمج مع الموجود مسبقاً حتى لا نفقد أي عنوان
const oldCatalogs = readJSON(data('catalogs.json'), {});
const existing = [];
const seen = new Set();
for (const rows of Object.values(oldCatalogs)) {
  for (const m of Array.isArray(rows) ? rows : []) {
    if (!m?.id || !/^tt\d+$/.test(m.id) || seen.has(m.id)) continue;
    seen.add(m.id);
    existing.push(m);
  }
}
const byId = new Map();
for (const m of [...pool, ...existing]) {
  const prev = byId.get(m.id);
  byId.set(m.id, prev ? { ...prev, ...m, description: m.description || prev.description } : m);
}
const allMovies = [...byId.values()].filter(m => m.type === 'movie' && m.name);
const allSeries = [...byId.values()].filter(m => m.type === 'series' && m.name);
console.log(`بعد الدمج: ${allMovies.length} فيلم + ${allSeries.length} مسلسل`);

// ترتيب الجودة: التقييم أولاً ثم حداثة السنة
const score = m => (m.imdbRating || 0) * 10 + Math.min(10, (m.year || 1990) - 1980) / 10;
const best = arr => [...arr].filter(m => m.imdbRating).sort((a, b) => score(b) - score(a));
const slice = arr => arr.slice(0, CAP);

const catalogs = {};
const collections = [];
const push = (slug, name, type, id, extra, icon, rows) => {
  const key = extra ? `${type}/${id}/${Object.entries(extra).map(([k, v]) => `${k}=${v}`).join('&')}` : `${type}/${id}`;
  catalogs[key] = rows;
  collections.push({ slug, name, type, id, ...(extra ? { extra } : {}), icon, key, count: rows.length, nextSkip: 400 });
};

const rated = best(allMovies);
push('top-rated', 'الأعلى تقييماً', 'movie', 'imdbRating', null, '★', slice(rated));
const popular = [...allMovies].sort((a, b) => {
  const pa = (a.imdbRating || 0) >= 6.5 ? 2 : 0, pb = (b.imdbRating || 0) >= 6.5 ? 2 : 0;
  return (pb + (b.year || 0)) - (pa + (a.year || 0));
});
push('popular', 'الأكثر رواجاً الآن', 'movie', 'top', null, '✦', slice(popular));

for (const y of YEAR_CATALOGS) {
  const rows = best(allMovies.filter(m => m.year === y)).concat(allMovies.filter(m => m.year === y));
  push(`year-${y}`, `أفلام ${y}`, 'movie', 'year', { genre: String(y) }, '◷', slice(rows));
}

for (const [slug, name, genre] of GENRES) {
  const rows = best(allMovies.filter(m => (m.genres || []).some(g => g.toLowerCase() === genre.toLowerCase())));
  push(slug, name, 'movie', 'top', { genre }, '◇', slice(rows));
}

const ratedSeries = best(allSeries);
push('series-rated', 'المسلسلات الأعلى تقييماً', 'series', 'imdbRating', null, '★', slice(ratedSeries));
push('series', 'مسلسلات تستحق وقتك', 'series', 'top', null, '▤', slice([...allSeries].sort((a, b) => (b.year || 0) - (a.year || 0))));

writeJSON(data('catalogs.json'), catalogs);
writeJSON(data('collections.json'), {
  updatedAt: new Date().toISOString(),
  uniqueMovies: allMovies.length,
  uniqueSeries: allSeries.length,
  collections,
});

console.log('\n== الكتالوجات الجديدة ==');
for (const c of collections) console.log(`  ${c.slug.padEnd(14)} ${String(c.count).padStart(4)}  ${c.key}`);

const missing = allMovies.concat(allSeries).filter(m => !m.name).length;
console.log(`\nبدون اسم: ${missing}`);
console.log(`الحجم: catalogs.json ${(fs.statSync(data('catalogs.json')).size / 1048576).toFixed(2)} MB`);