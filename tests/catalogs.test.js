import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async file=>JSON.parse(await readFile(new URL('../data/'+file+'.json',import.meta.url),'utf8'));
test('الكتالوجات المعبأة غير فارغة وفريدة وتطابق أعداد العناوين',async()=>{
  const [manifest,catalogs,featured]=await Promise.all(['collections','catalogs','movies'].map(read));
  assert.equal(manifest.collections.length,22);assert.ok(manifest.uniqueMovies>2000);assert.ok(manifest.uniqueSeries>300);
  const all=new Map(featured.map(m=>[m.type+':'+m.id,m]));
  for(const c of manifest.collections){const rows=catalogs[c.key];assert.ok(rows.length>=100,c.slug);assert.equal(rows.length,c.count);assert.equal(new Set(rows.map(m=>m.id)).size,rows.length);assert.ok(rows.every(m=>m.id&&m.name&&m.type===c.type));rows.forEach(m=>all.set(m.type+':'+m.id,m));}
  assert.equal([...all.values()].filter(m=>m.type==='movie').length,manifest.uniqueMovies);
  assert.equal([...all.values()].filter(m=>m.type==='series').length,manifest.uniqueSeries);
});
test('رحلة المشاهدة محفوظة مستقلة عن تحديث الكتالوج',async()=>{
  const journey=await read('journey');
  for(const key of ['movie/year/genre=2026','movie/year/genre=2025','movie/year/genre=2024','series/top'])assert.ok(journey[key].length>=30);
});
