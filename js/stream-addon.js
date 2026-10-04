// إضافة Stremio مدمجة داخل التطبيق: توفّر روابط المشاهدة والترجمة.
// منطق البناء مشترك مع المتصفح عبر js/stream-core.js، وهنا نضيف المسارات ديناميكياً.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStreams, providers } from './stream-core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p, f) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : f;

const catalogs = readJSON(path.join(root, 'data', 'catalogs.json'), {});

const byId = new Map();
for (const rows of Object.values(catalogs)) for (const m of Array.isArray(rows) ? rows : []) if (m?.id) byId.set(m.id, m);
for (const m of readJSON(path.join(root, 'data', 'movies.json'), [])) if (m?.id) byId.set(m.id, m);

export const manifest = () => ({
  id: 'com.sahaba.streams',
  version: '4.0.0',
  name: 'سحابة — روابط المشاهدة',
  description: 'مصادر مشاهدة رسمية ومفتوحة وأرشيفية، بترتيب عربي أولاً. تعمل فوراً بلا إعدادات.',
  logo: 'https://live.metahub.space/logo/medium/tt4900148/img',
  background: 'https://live.metahub.space/background/medium/tt4900148/img',
  types: ['movie', 'series'],
  resources: ['stream', 'subtitles'],
  idPrefixes: ['tt'],
  catalogs: [],
  behaviorHints: { configurable: false },
});

export { providers };

export async function stream(type, id) {
  const item = byId.get(id) || { id, type };
  return { streams: await buildStreams(item) };
}

export async function subtitles(type, id) {
  return { subtitles: [] };
}
