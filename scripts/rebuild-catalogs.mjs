// يعيد بناء كتالوجات سحابة من البيانات المحلية فقط، مع تصنيف صارم حسب السنة والنوع.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {builtInCollections,filterCollectionRows,itemRating,itemYear,normalizeCatalogItem} from '../js/catalog-rules.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=p=>path.join(root,'data',p);
const readJSON=(file,fallback)=>fs.existsSync(data(file))?JSON.parse(fs.readFileSync(data(file),'utf8')):fallback;
const writeJSON=(file,value)=>fs.writeFileSync(data(file),JSON.stringify(value,null,2));

const sources=[
  ...Object.values(readJSON('catalogs.json',{})).flat(),
  ...Object.values(readJSON('journey.json',{})).flat(),
  ...readJSON('movies.json',[]),
  ...Object.entries(readJSON('extras.json',{})).map(([id,value])=>({id,...value})),
  ...Object.entries(readJSON('details.json',{})).map(([id,value])=>({id,...value})),
];

const byKey=new Map();
for(const raw of sources){
  if(!raw?.id||!/^tt\d+$/.test(raw.id)||!raw.name)continue;
  const type=raw.type==='series'?'series':'movie';
  const key=type+':'+raw.id;
  const previous=byKey.get(key)||{};
  const merged=normalizeCatalogItem({...previous,...raw,type},type);
  byKey.set(key,merged);
}

const movies=[...byKey.values()].filter(item=>item.type==='movie');
const series=[...byKey.values()].filter(item=>item.type==='series');
const score=item=>(itemRating(item)||0)*100+(itemYear(item)||0)/10000;
const unique=rows=>[...new Map(rows.map(item=>[item.type+':'+item.id,item])).values()];
const ranked=rows=>unique(rows).sort((a,b)=>score(b)-score(a)||String(a.name).localeCompare(String(b.name)));
const recent=rows=>unique(rows).sort((a,b)=>(itemYear(b)||0)-(itemYear(a)||0)||score(b)-score(a)||String(a.name).localeCompare(String(b.name)));

const catalogs={};
const collections=builtInCollections().map(definition=>{
  const base=definition.type==='series'?series:movies;
  let rows;
  if(definition.id==='imdbRating')rows=ranked(base.filter(item=>itemRating(item)));
  else if(definition.id==='top')rows=definition.extra?.genre?ranked(filterCollectionRows(base,definition)):recent(base);
  else rows=recent(filterCollectionRows(base,definition));
  catalogs[definition.key]=rows;
  return {...definition,count:rows.length,nextSkip:rows.length};
});

writeJSON('catalogs.json',catalogs);
writeJSON('collections.json',{
  updatedAt:new Date().toISOString(),
  uniqueMovies:movies.length,
  uniqueSeries:series.length,
  collections,
});

console.log(`المجموعة: ${movies.length} فيلم + ${series.length} مسلسل`);
for(const collection of collections)console.log(`${collection.slug.padEnd(14)} ${String(collection.count).padStart(4)}  ${collection.key}`);
console.log(`الحجم: ${(fs.statSync(data('catalogs.json')).size/1048576).toFixed(2)} MB`);
