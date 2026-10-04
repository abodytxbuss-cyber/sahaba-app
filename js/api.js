import {cacheGet,cachePut,getAddons} from './store.js';
import {buildStreams} from './stream-core.js';
export const CINEMETA='https://v3-cinemeta.strem.io/manifest.json';
const pending=new Map();
const stringList=value=>Array.isArray(value)?value.filter(x=>typeof x==='string'):typeof value==='string'?[value]:[];
export function normalizeMeta(m,type=m.type||'movie') {
  const out={...m,type,genres:stringList(m.genres||m.genre)};
  for(const field of ['cast','director'])if(field in m)out[field]=stringList(m[field]);
  for(const [field,id]of [['videos','id'],['trailers','source'],['trailerStreams','ytId']])if(field in m)out[field]=Array.isArray(m[field])?m[field].filter(v=>v&&typeof v[id]==='string'):[];
  return out;
}
export function safeURL(value) {try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function resourceURL(manifest,resource,type,id,extra={}) {
  const u=new URL(manifest);u.pathname=u.pathname.replace(/\/manifest\.json$/, '')+'/'+[resource,type,id].map(encodeURIComponent).join('/')+(Object.keys(extra).length?'/'+Object.entries(extra).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&'):'')+'.json';return u.href;
}
export async function request(url,{force=false,ttl=1800000,timeout=7000}={}) {
  if(!force){const hit=cacheGet(url);if(hit!==null)return hit;}
  if(pending.has(url))return pending.get(url);
  const work=(async()=>{
    async function get(target){const r=await fetch(target,{signal:AbortSignal.timeout(timeout),credentials:'omit'});if(!r.ok)throw Error('تعذّر الاتصال بالخدمة ('+r.status+')');return r.json();}
    let data;
    try {data=await get(url);}catch(error){
      if(!navigator.onLine)throw Error('أنت غير متصل بالإنترنت. تحقق من الاتصال ثم أعد المحاولة.');
      const remote=new URL(url,location.href);
      if(remote.origin===location.origin)throw error;
      try{data=await get('api/proxy?url='+encodeURIComponent(url));}catch {throw Error('لم تستجب الإضافة. تحقق من رابطها واتصالك ثم أعد المحاولة.');}
    }
    cachePut(url,data,ttl);return data;
  })().finally(()=>pending.delete(url));pending.set(url,work);return work;
}
export async function catalog(type='movie',id='top',extra={},manifest=CINEMETA,force=false) {
  const data=await request(resourceURL(manifest,'catalog',type,id,extra),{force});
  if(!Array.isArray(data.metas))throw Error('الكتالوج أعاد بيانات غير صالحة.');
  return data.metas.filter(m=>m&&typeof m.id==='string'&&typeof m.name==='string').map(m=>({...normalizeMeta(m,m.type||type),origin:manifest}));
}
export function supports(addon,resource,type,id='') {
  if(!addon.enabled)return false;
  return addon.manifest.resources.some(r=>{
    const long=typeof r==='object',name=long?r.name:r,types=long?r.types:addon.manifest.types,prefixes=long?r.idPrefixes:addon.manifest.idPrefixes;
    return name===resource&&(!types||types.includes(type))&&(!prefixes||prefixes.some(p=>id.startsWith(p)));
  });
}
export async function metadata(item,force=false) {
  const sources=[...(item.origin?[item.origin]:[]),...(/^tt\d+$/.test(item.id)?[CINEMETA]:[]),...getAddons().filter(a=>supports(a,'meta',item.type,item.id)).map(a=>a.url)];
  for(const url of new Set(sources)){try{const data=await request(resourceURL(url,'meta',item.type,item.id),{force,ttl:86400000});if(data.meta?.id&&typeof data.meta.name==='string')return {...normalizeMeta({...item,...data.meta}),origin:url};}catch{}}
  throw Error('تعذّر تحديث التفاصيل. نعرض المعلومات المحفوظة؛ يمكنك إعادة المحاولة.');
}
export async function validateManifest(input) {
  let text=input.trim().replace(/^stremio:\/\//,'https://');const url=safeURL(text);
  if(!url||!new URL(url).pathname.endsWith('/manifest.json'))throw Error('ألصق رابطاً صحيحاً ينتهي بـ manifest.json.');
  const manifest=await request(url,{force:true,ttl:86400000});
  if(!manifest||typeof manifest.id!=='string'||typeof manifest.name!=='string'||typeof manifest.version!=='string'||!Array.isArray(manifest.resources)||!Array.isArray(manifest.types)||!Array.isArray(manifest.catalogs)||manifest.resources.some(r=>!(typeof r==='string'||r&&typeof r.name==='string'&&(!r.types||Array.isArray(r.types))&&(!r.idPrefixes||Array.isArray(r.idPrefixes))))||manifest.catalogs.some(c=>!c||typeof c.id!=='string'||typeof c.type!=='string'||c.extra&&!Array.isArray(c.extra)))throw Error('ملف الإضافة غير مكتمل أو لا يتوافق مع بروتوكول Stremio.');
  const strings=value=>value===undefined||Array.isArray(value)&&value.every(v=>typeof v==='string');
  if(!strings(manifest.types)||!strings(manifest.idPrefixes)||manifest.resources.some(r=>typeof r==='object'&&(!strings(r.types)||!strings(r.idPrefixes)))||manifest.catalogs.some(c=>(c.extra||[]).some(e=>!e||typeof e.name!=='string'||!strings(e.options))))throw Error('الإضافة تحتوي إعدادات موارد غير صالحة.');
  if(manifest.behaviorHints?.configurationRequired)throw Error('هذه الإضافة تحتاج إلى إعداد أولاً. انسخ رابط manifest.json الناتج بعد إعدادها.');
  return {url,manifest,enabled:true};
}
export async function sources(item,id=item.id,force=false) {
  const addons=getAddons().filter(a=>supports(a,'stream',item.type,id));
  const sameOrigin=addons.some(a=>{try{return new URL(a.url,location.href).origin===location.origin}catch{return false}});
  const addonWork=Promise.allSettled(addons.map(async a=>{
    const data=await request(resourceURL(a.url,'stream',item.type,id),{force,ttl:120000});
    if(!Array.isArray(data.streams))throw Error();
    return data.streams.filter(s=>s&&typeof s==='object').map(s=>({...s,addon:a.manifest.name}));
  }));
  // بلا خادم (استضافة ثابتة): نبني المصادر داخل المتصفح مباشرة من الأرشيف والمزوّدين
  const localWork=sameOrigin?Promise.resolve([]):buildStreams(item).then(list=>list.map(s=>({...s,addon:'سحابة — روابط المشاهدة'}))).catch(()=>[]);
  const [results,local]=await Promise.all([addonWork,localWork]);
  const streams=[],seen=new Set();
  const push=s=>{const k=s.url||s.externalUrl||`${s.name||''}|${s.title||''}`;if(seen.has(k))return;seen.add(k);streams.push(s);};
  for(const r of results)if(r.status==='fulfilled')for(const s of r.value)push(s);
  for(const s of local)push(s);
  return {streams,failed:results.filter(r=>r.status==='rejected').length,addons:addons.length};
}
export async function subtitles(item,id,force=false) {
  const addons=getAddons().filter(a=>supports(a,'subtitles',item.type,id));
  const results=await Promise.allSettled(addons.map(async a=>{
    const data=await request(resourceURL(a.url,'subtitles',item.type,id),{force,ttl:300000,timeout:10000});
    if(!Array.isArray(data.subtitles))throw Error('استجابة ترجمة غير صالحة');
    return data.subtitles.filter(s=>s&&safeURL(s.url)).map(s=>({...s,provider:a.manifest.name}));
  }));
  return {subtitles:results.flatMap(r=>r.status==='fulfilled'?r.value:[]),failed:results.filter(r=>r.status==='rejected').length,addons:addons.length};
}
