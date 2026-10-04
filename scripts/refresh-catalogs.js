import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {builtInCollections,filterCollectionRows,normalizeCatalogItem} from '../js/catalog-rules.js';
const root=new URL('../',import.meta.url),data=name=>new URL('data/'+name+'.json',root);
const old=JSON.parse(await fs.readFile(data('catalogs'),'utf8'));
const featured=JSON.parse(await fs.readFile(data('movies'),'utf8'));
// تثبيت مجموعات الرحلة القديمة قبل تحديث الكتالوجات الحية.
try{await fs.access(data('journey'));}catch{const frozen={};for(const key of ['movie/year/genre=2026','movie/year/genre=2025','movie/year/genre=2024','series/top'])frozen[key]=old[key]||[];await fs.writeFile(data('journey'),JSON.stringify(frozen));}
const defs=builtInCollections();
const compact=m=>Object.fromEntries(Object.entries(normalizeCatalogItem({id:m.id,type:m.type||'movie',name:m.name,poster:m.poster,background:m.background,releaseInfo:m.releaseInfo||m.year,year:m.year,genres:m.genres||m.genre||[],imdbRating:m.imdbRating},m.type||'movie')).filter(([,v])=>v!==undefined));
const unique=items=>[...new Map(items.map(m=>[m.type+':'+m.id,m])).values()];
const catalogs={};let cursor=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<defs.length){const d=defs[cursor++],key=d.key;let rows=[],nextSkip=0;for(let page=0;page<4;page++){const extra={...d.extra,...(page?{skip:page*100}:{})},suffix=Object.entries(extra).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&'),url='https://v3-cinemeta.strem.io/catalog/'+d.type+'/'+d.id+(suffix?'/'+suffix:'')+'.json';try{const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(r.status);const j=await r.json();if(!Array.isArray(j.metas)||!j.metas.length)break;rows.push(...j.metas.filter(m=>m?.id&&m.name).map(compact));nextSkip=(page+1)*100;}catch(e){console.log('احتفظنا بالنسخة المتاحة:',d.slug,e.message);break;}}
rows=filterCollectionRows(unique([...rows,...(old[key]||[]).map(compact)]),d);if(!rows.length)throw Error('كتالوج فارغ: '+key);catalogs[key]=rows;d.count=rows.length;d.nextSkip=nextSkip||rows.length;console.log(d.slug,rows.length);}}));
const all=unique([...featured.map(compact),...Object.values(catalogs).flat()]);
await fs.writeFile(data('catalogs'),JSON.stringify(catalogs));
const manifest={updatedAt:new Date().toISOString(),uniqueMovies:all.filter(m=>m.type==='movie').length,uniqueSeries:all.filter(m=>m.type==='series').length,collections:defs};
await fs.writeFile(data('collections'),JSON.stringify(manifest,null,2));
const posters=JSON.parse(await fs.readFile(data('posters'),'utf8'));
const covers=unique(defs.flatMap(d=>catalogs[d.key].slice(0,48)));cursor=0;
await Promise.all(Array.from({length:6},async()=>{while(cursor<covers.length){const m=covers[cursor++];if(posters[m.id])continue;const relative='assets/'+m.id+'.jpg';try{if(!m.poster)throw Error();const r=await fetch(m.poster,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();await fs.writeFile(new URL(relative,root),Buffer.from(await r.arrayBuffer()));posters[m.id]=relative;}catch{posters[m.id]='assets/poster.svg';}}}));
await fs.writeFile(data('posters'),JSON.stringify(posters,null,2));
console.log(JSON.stringify({catalogs:defs.length,movies:manifest.uniqueMovies,series:manifest.uniqueSeries,localPosters:Object.keys(posters).length}));
