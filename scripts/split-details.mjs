// يفصل الحقول الثقيلة (الوصف، المدة، المخرج، الممثلون) إلى data/details.json
// حتى يبقى تحميل الكتالوجات خفيفاً، وتُجلب التفاصيل عند فتح صفحة الفيلم فقط.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = p => path.join(root, 'data', p);
const read = (p, f) => JSON.parse(fs.readFileSync(p, 'utf8'));
const HEAVY = ['description', 'descriptionAr', 'runtime', 'director', 'cast'];

const details = {};
const lean = m => {
  const out = {};
  const heavy = {};
  for (const k of Object.keys(m)) (HEAVY.includes(k) ? (heavy[k] = m[k]) : (out[k] = m[k]));
  const any = Object.values(heavy).some(v => v && (!Array.isArray(v) || v.length));
  if (any) details[m.id] = { ...(details[m.id] || {}), ...heavy };
  return out;
};

const catalogs = read(data('catalogs.json'), {});
let rows = 0;
for (const [key, list] of Object.entries(catalogs)) {
  catalogs[key] = list.map(lean);
  rows += list.length;
}
fs.writeFileSync(data('catalogs.json'), JSON.stringify(catalogs, null, 2));

const featured = read(data('movies.json'), []);
fs.writeFileSync(data('movies.json'), JSON.stringify(featured.map(lean), null, 2));

const journey = read(data('journey.json'), {});
for (const [key, list] of Object.entries(journey)) journey[key] = list.map(lean);
fs.writeFileSync(data('journey.json'), JSON.stringify(journey, null, 2));

fs.writeFileSync(data('details.json'), JSON.stringify(details, null, 2));

const size = f => (fs.statSync(data(f)).size / 1048576).toFixed(2);
console.log(`صفوف: ${rows} | تفاصيل: ${Object.keys(details).length}`);
console.log(`catalogs.json ${size('catalogs.json')} MB | details.json ${size('details.json')} MB | movies.json ${size('movies.json')} MB`);