import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async file=>JSON.parse(await readFile(new URL('../data/'+file+'.json',import.meta.url),'utf8'));
test('الكتالوجات المعبأة غير فارغة وفريدة وتطابق أعداد العناوين',async()=>{
  const [manifest,catalogs,featured,titles]=await Promise.all(['collections','catalogs','movies','ar-titles'].map(read));
  assert.ok(manifest.collections.length>=30);assert.ok(manifest.uniqueMovies>2500);assert.ok(manifest.uniqueSeries>400);
  const all=new Map(featured.map(m=>[m.type+':'+m.id,m]));
  for(const c of manifest.collections){const rows=catalogs[c.key];assert.ok(rows.length>=25,c.slug);assert.equal(rows.length,c.count);assert.equal(new Set(rows.map(m=>m.id)).size,rows.length);assert.ok(rows.every(m=>m.id&&m.name&&m.type===c.type));rows.forEach(m=>all.set(m.type+':'+m.id,m));}
  const movies=[...all.values()].filter(m=>m.type==='movie'),series=[...all.values()].filter(m=>m.type==='series');
  assert.equal(movies.length,manifest.uniqueMovies);
  assert.equal(series.length,manifest.uniqueSeries);
  const translated=[...movies,...series].filter(m=>titles[m.id]?.ar);
  assert.ok(translated.length/(movies.length+series.length)>=0.95,'تغطية الترجمة العربية أقل من 95%');
  assert.ok(movies.every(m=>m.year===null||(m.year>1880&&m.year<2100)),'السنة غير منطقية');
  assert.ok(movies.filter(m=>m.imdbRating!==undefined).every(m=>m.imdbRating===null||(m.imdbRating>0&&m.imdbRating<=10)),'التقييم خارج المدى');
});
test('رحلة المشاهدة محفوظة مستقلة عن تحديث الكتالوج',async()=>{
  const journey=await read('journey');
  for(const key of ['movie/year/genre=2026','movie/year/genre=2025','movie/year/genre=2024','series/top'])assert.ok(journey[key].length>=30);
});
