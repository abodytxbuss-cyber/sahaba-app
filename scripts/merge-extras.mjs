// يدمج البيانات المُثراة (extras.json) والترجمة (ar-descriptions.json) داخل
// catalogs.json و movies.json حتى لا يحتاج التطبيق لملف إضافي عند التشغيل.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = p => path.join(root, 'data', p);
const read = (p, f) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : f;
const extras = read(data('extras.json'), {});
const arDesc = read(data('ar-descriptions.json'), {});
console.log(`extras: ${Object.keys(extras).length} | ترجمة: ${Object.keys(arDesc).length}`);

let enriched = 0, translated = 0;
const apply = m => {
  const e = extras[m.id], a = arDesc[m.id];
  if (!e && !a) return m;
  const out = { ...m };
  if (e) {
    if (!out.description && e.description) { out.description = e.description.slice(0, 320); }
    if (!out.runtime && e.runtime) out.runtime = e.runtime;
    if ((!out.director || !out.director.length) && e.director?.length) out.director = e.director;
    if ((!out.cast || !out.cast.length) && e.cast?.length) out.cast = e.cast;
    if ((!out.genres || !out.genres.length) && e.genres?.length) out.genres = e.genres;
    if (!out.background && e.background) out.background = e.background;
    enriched++;
  }
  if (a && !out.descriptionAr) { out.descriptionAr = a.ar; translated++; }
  return out;
};

const catalogs = read(data('catalogs.json'), {});
for (const [key, rows] of Object.entries(catalogs)) catalogs[key] = rows.map(apply);
fs.writeFileSync(data('catalogs.json'), JSON.stringify(catalogs, null, 2));

const featured = read(data('movies.json'), []).map(apply);
fs.writeFileSync(data('movies.json'), JSON.stringify(featured, null, 2));

const manifest = read(data('collections.json'), { collections: [] });
manifest.updatedAt = new Date().toISOString();
for (const c of manifest.collections) c.count = (catalogs[c.key] || []).length;
fs.writeFileSync(data('collections.json'), JSON.stringify(manifest, null, 2));

const all = Object.values(catalogs).flat();
const uniq = new Map();
for (const m of [...featured, ...all]) uniq.set(`${m.type}:${m.id}`, m);
manifest.uniqueMovies = [...uniq.values()].filter(m => m.type === 'movie').length;
manifest.uniqueSeries = [...uniq.values()].filter(m => m.type === 'series').length;
fs.writeFileSync(data('collections.json'), JSON.stringify(manifest, null, 2));
console.log(`أُثري: ${enriched} | تُرجم: ${translated}`);
console.log(`بأوصاف: ${all.filter(m => m.description).length} | بأوصاف عربية: ${all.filter(m => m.descriptionAr).length} من ${all.length}`);
console.log(`فريدة: ${manifest.uniqueMovies} فيلم + ${manifest.uniqueSeries} مسلسل`);
console.log(`الحجم: catalogs.json ${(fs.statSync(data('catalogs.json')).size / 1048576).toFixed(2)} MB`);