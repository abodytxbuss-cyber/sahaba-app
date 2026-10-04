const memory = new Map();
export function read(key, fallback) { try { const value=localStorage.getItem('sahaba:'+key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
export function write(key, value) { try { localStorage.setItem('sahaba:'+key,JSON.stringify(value)); return true; } catch { return false; } }
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const saved=object(read('library',{}));
export const library={watched:object(saved.watched),later:object(saved.later),positions:object(saved.positions),earned:object(saved.earned)};
export const saveLibrary=()=>write('library',library);
export const xp=()=>Object.keys(library.earned).length*50;
export const level=()=>xp()>=1500?'سماء مفتوحة':xp()>=500?'سحابة ذهبية':'غيمة جديدة';
export function markWatched(item,videoId=item.id,complete=true) {
  const first=!library.earned[videoId];
  if(complete)library.watched[item.id]={...item,watchedAt:Date.now()};
  library.earned[videoId]=true;
  delete library.positions[videoId];
  return {first,saved:saveLibrary()};
}
export function cacheGet(key) {
  const hit=memory.get(key)||read('cache:'+key,null);
  if (hit?.expires>Date.now()) {memory.set(key,hit); return hit.value;}
  memory.delete(key);return null;
}
export function cachePut(key,value,ttl=30*60*1000) {
  const entry={expires:Date.now()+ttl,value};
  if(memory.size>=80)memory.delete(memory.keys().next().value);
  memory.set(key,entry);
  let index=read('cache-index',[]); if(!Array.isArray(index))index=[];
  index=index.filter(k=>k!==key);index.push(key);
  while(index.length>40) {try {localStorage.removeItem('sahaba:cache:'+index.shift());}catch {break;}}
  write('cache-index',index);write('cache:'+key,entry);
}
export function getAddons(){const a=read('addons',[]);return Array.isArray(a)?a.filter(x=>typeof x?.url==='string'&&x.manifest&&Array.isArray(x.manifest.resources)&&x.manifest.resources.every(r=>typeof r==='string'||r&&typeof r.name==='string')&&Array.isArray(x.manifest.types)&&Array.isArray(x.manifest.catalogs)):[];}
export function saveAddons(value){return write('addons',value);}
// الإضافة المدمجة تعمل من نفس الأصل، فتظهر روابط المشاهدة فوراً بلا إعداد
const builtin={
  url:'addon/manifest.json',
  manifest:{id:'com.sahaba.streams',version:'4.0.0',name:'سحابة — روابط المشاهدة',types:['movie','series'],resources:['stream','subtitles'],idPrefixes:['tt'],catalogs:[]},
  enabled:true,builtin:true,
};
export function ensureBuiltinAddon(){
  const list=Array.isArray(read('addons',[]))?read('addons',[]):[];
  // مطلق دائماً: النسخة القديمة كانت نسبية فكان new URL يرمي ويختفي المصدر بالكامل
  const url=new URL('addon/manifest.json',location.href).href;
  const others=list.filter(x=>!(x&&x.builtin));
  const current=list.find(x=>x&&x.builtin);
  if(current&&current.enabled&&current.url===url)return false;
  // يصلح الإدخال المعطوب عند المستخدم الحالي بدل إعادة التسجيل من الصفر
  write('addons',[{...builtin,url},...others]);
  return true;
}
export function partition(items,size=15) {
  const count=Math.ceil(items.length/size),out=[];
  for(let i=0,start=0;i<count;i++){const length=Math.ceil((items.length-start)/(count-i));out.push(items.slice(start,start+length));start+=length;}
  return out;
}
export function stageStatus(stages,index) {
  const complete=i=>stages[i].items.every(m=>library.watched[m.id]);
  const unlocked=stages.slice(0,index).every((_,i)=>complete(i));
  return {unlocked,done:complete(index),count:stages[index].items.filter(m=>library.watched[m.id]).length};
}
