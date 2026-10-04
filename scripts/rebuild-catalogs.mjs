// يعيد بناء الكتالوجات من مجموعة الأفلام الموجودة محلياً (بلا شبكة):
// يرفع السقف لكل تصنيف، ويكمل التصنيفات الضحلة بالأفلام التي يحمل عنوانها اسم التصنيف.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = p => path.join(root, 'data', p);
const readJSON = (p, f) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : f;
const writeJSON = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));
const CAP = 450;
const MIN = 250;

const GENRES = [
  ['action', 'أكشن وإثارة', 'Action', /\b(action|assassin|gun|battle|fight)\b/i],
  ['adventure', 'مغامرات', 'Adventure', /\b(adventure|quest|treasure|island|surviv)\b/i],
  ['animation', 'رسوم متحركة', 'Animation', /\b(animation|animated|toy story|disney|pixar)\b/i],
  ['comedy', 'كوميديا', 'Comedy', /\b(comedy|comic|funny|laugh)\b/i],
  ['crime', 'جريمة وتحقيق', 'Crime', /\b(crime|cop|gangster|heist|mafia)\b/i],
  ['drama', 'دراما', 'Drama', /\bdrama\b/i],
  ['family', 'أفلام عائلية', 'Family', /\b(family|kids|children)\b/i],
  ['fantasy', 'فانتازيا', 'Fantasy', /\b(fantasy|magic|dragon|wizard|witch)\b/i],
  ['history', 'تاريخ', 'History', /\b(history|historical|empire|kingdom)\b/i],
  ['horror', 'رعب', 'Horror', /\b(horror|scary|haunt|terrifying)\b/i],
  ['music', 'موسيقى', 'Music', /\b(music|band|singer|concert|rock)\b/i],
  ['mystery', 'غموض', 'Mystery', /\b(mystery|murder|detective|whodunit)\b/i],
  ['romance', 'رومانسية', 'Romance', /\b(romance|romantic|love story)\b/i],
  ['sci-fi', 'خيال علمي', 'Sci-Fi', /\b(sci.?fi|space|alien|robot|future|cyber|time travel)\b/i],
  ['sport', 'رياضة', 'Sport', /\b(sport|football|soccer|basketball|boxing|olympic)\b/i],
  ['thriller', 'تشويق', 'Thriller', /\b(thriller|spy|conspiracy|chase)\b/i],
  ['documentary', 'وثائقيات', 'Documentary', /\b(documentary)\b/i],
  ['war', 'أفلام حربية', 'War', /\b(war|wars|battle for|soldier|military)\b/i],
  ['biography', 'سيرة ذاتية', 'Biography', /\b(biography|biopic|life of)\b/i],
  ['western', 'غربية', 'Western', /\b(western|cowboy)\b/i],
];
const YEAR_CATALOGS = [2026, 2025, 2024, 2023, 2022, 2021, 2020];

// بيانات Stremio القديمة تحفظ السنة في releaseInfo والتقييم كنص؛ نطبّعها هنا
function normalize(m) {
  const info = typeof m.releaseInfo === 'string' ? m.releaseInfo : '';
  const year = Number(m.year) || Number(info.match(/\d{4}/)?.[0]) || null;
  const rating = Number(m.imdbRating);
  return {
    ...m,
    year: Number.isFinite(year) && year > 1880 ? year : null,
    imdbRating: Number.isFinite(rating) && rating > 0 ? rating : null,
    genres: Array.isArray(m.genres) ? m.genres.filter(g => typeof g === 'string') : [],
    description: typeof m.description === 'string' ? m.description.replace(/\s+/g, ' ').trim().slice(0, 320) : '',
  };
}

const catalogs = readJSON(data('catalogs.json'), {});
const seen = new Set();
const movies = [], series = [];
for (const rows of Object.values(catalogs)) {
  for (const raw of Array.isArray(rows) ? rows : []) {
    if (!raw?.id || !/^tt\d+$/.test(raw.id) || !raw.name || seen.has(raw.id)) continue;
    seen.add(raw.id);
    const m = normalize(raw);
    (m.type === 'series' ? series : movies).push(m);
  }
}
console.log(`المجموعة: ${movies.length} فيلم + ${series.length} مسلسل`);

const score = m => (m.imdbRating || 0) * 10 + Math.min(10, (m.year || 1990) - 1980) / 10;
const best = arr => [...arr].filter(m => m.imdbRating).sort((a, b) => score(b) - score(a));
const byRecency = arr => [...arr].sort((a, b) => (b.imdbRating || 0) - (a.imdbRating || 0) || (b.year || 0) - (a.year || 0));

const out = {};
const collections = [];
const push = (slug, name, type, id, extra, icon, rows) => {
  const key = extra ? `${type}/${id}/${Object.entries(extra).map(([k, v]) => `${k}=${v}`).join('&')}` : `${type}/${id}`;
  out[key] = rows;
  collections.push({ slug, name, type, id, ...(extra ? { extra } : {}), icon, key, count: rows.length, nextSkip: 400 });
};

push('top-rated', 'الأعلى تقييماً', 'movie', 'imdbRating', null, '★', best(movies).slice(0, CAP));
push('popular', 'الأكثر رواجاً الآن', 'movie', 'top', null, '✦', byRecency(movies).filter(m => (m.imdbRating || 0) >= 6).slice(0, CAP));

for (const y of YEAR_CATALOGS) {
  const rows = byRecency(movies.filter(m => m.year === y));
  push(`year-${y}`, `أفلام ${y}`, 'movie', 'year', { genre: String(y) }, '◷', rows.slice(0, CAP));
}

for (const [slug, name, genre, keyword] of GENRES) {
  const tagged = movies.filter(m => (m.genres || []).some(g => g.toLowerCase() === genre.toLowerCase()));
  let rows = best(tagged);
  if (rows.length < MIN) {
    const extra = movies.filter(m => !tagged.includes(m) && keyword.test(m.name));
    rows = rows.concat(best(extra));
    if (rows.length < MIN) rows = rows.concat(byRecency(extra));
  }
  push(slug, name, 'movie', 'top', { genre }, '◇', [...new Map(rows.map(m => [m.id, m])).values()].slice(0, CAP));
}

push('series-rated', 'المسلسلات الأعلى تقييماً', 'series', 'imdbRating', null, '★', best(series).slice(0, CAP));
push('series', 'مسلسلات تستحق وقتك', 'series', 'top', null, '▤', byRecency(series).slice(0, CAP));

writeJSON(data('catalogs.json'), out);
writeJSON(data('collections.json'), { updatedAt: new Date().toISOString(), uniqueMovies: movies.length, uniqueSeries: series.length, collections });

console.log('\n== النتيجة ==');
let thin = 0;
for (const c of collections) {
  if (c.count < MIN) thin++;
  console.log(`  ${c.slug.padEnd(14)} ${String(c.count).padStart(4)}  ${c.key}`);
}
console.log(`\nتصنيفات أقل من ${MIN}: ${thin}`);
console.log(`الحجم: ${(fs.statSync(data('catalogs.json')).size / 1048576).toFixed(2)} MB`);