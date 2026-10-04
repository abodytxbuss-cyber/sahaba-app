// ينزّل البوسترات المحلية الناقصة من metahub ويحدّث data/posters.json.
// آمن للتشغيل المتكرر: يتخطّى الموجود ويعيد المحاولة عند الفشل.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = p => path.join(root, 'data', p);
const postersFile = data('posters.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' };
const sleep = ms => new Promise(s => setTimeout(s, ms));

const posters = JSON.parse(fs.readFileSync(postersFile, 'utf8'));
const catalogs = JSON.parse(fs.readFileSync(data('catalogs.json'), 'utf8'));
const featured = JSON.parse(fs.readFileSync(data('movies.json'), 'utf8'));
const items = new Map();
for (const m of [...featured, ...Object.values(catalogs).flat()]) if (m?.id && /^tt\d+$/.test(m.id)) items.set(m.id, m);

const missing = [...items.keys()].filter(id => !posters[id]);
console.log(`بوتسر ناقص: ${missing.length} من ${items.size}`);

let ok = 0, failed = 0;
for (const [i, id] of missing.entries()) {
  const target = path.join(root, 'assets', `${id}.jpg`);
  try {
    if (!fs.existsSync(target)) {
      const res = await fetch(`https://live.metahub.space/poster/medium/${id}/img`, { headers: UA, signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw Error('http ' + res.status);
      const type = res.headers.get('content-type') || '';
      if (!type.startsWith('image/')) throw Error('not image');
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1500) throw Error('too small');
      fs.writeFileSync(target, buf);
    }
    posters[id] = `assets/${id}.jpg`;
    ok++;
  } catch (e) {
    failed++;
    console.log(`  ✗ ${id} -> ${e.message}`);
  }
  if ((i + 1) % 25 === 0) {
    fs.writeFileSync(postersFile, JSON.stringify(posters, null, 2));
    console.log(`  ${i + 1}/${missing.length} | ok=${ok} failed=${failed}`);
  }
  await sleep(120);
}

fs.writeFileSync(postersFile, JSON.stringify(posters, null, 2));
console.log(`\nانتهى: ok=${ok} failed=${failed} | إجمالي البوستر ${Object.keys(posters).length}`);
console.log(`تغطية: ${items.size - missing.length + ok}/${items.size}`);