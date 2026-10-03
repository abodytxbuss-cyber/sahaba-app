import {$,esc,number,title,card,empty,errorBox} from './ui.js';
import {catalog} from './api.js';

export const collectionKey=c=>[c.type,c.id,...Object.entries(c.extra||{}).map(([k,v])=>k+'='+v)].join('/');
export const dedupe=list=>[...new Map(list.map(m=>[(m.type||'movie')+':'+m.id,m])).values()];
const normalize=value=>String(value||'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[\u064B-\u065F]/g,'');
export function collectionChips(collections,active='all') {
  return `<div class="collection-chips" aria-label="اختر كتالوجاً"><a class="chip ${active==='all'?'active':''}" href="#/catalog/all">كل الأفلام</a><a class="chip ${active==='featured'?'active':''}" href="#/catalog/featured">إصدارات سحابة</a>${collections.map(c=>`<a class="chip ${active===c.slug?'active':''}" href="#/catalog/${esc(c.slug)}">${esc(c.name)}</a>`).join('')}</div>`;
}
export function renderCollection({main,slug,manifest,featured,backup,remember,alive}) {
  const definition=manifest.collections.find(c=>c.slug===slug),isAll=slug==='all',isFeatured=slug==='featured';
  if(!definition&&!isAll&&!isFeatured){main.innerHTML=empty('هذا الكتالوج غير موجود.', '<a class="btn primary" href="#/catalog/all">جميع الكتالوجات</a>');return;}
  const heading=isAll?'كتالوجات سحابة':isFeatured?'إصدارات سحابة':definition.name;
  let rows=dedupe(isFeatured?featured:isAll?[...featured,...Object.values(backup).flat().filter(m=>m.type==='movie')]:backup[definition.key]||[]),visible=48,busy=false,ended=false,skip=definition?.nextSkip||0;
  remember(rows);
  main.innerHTML=`<div class="container"><div class="page-head"><div><span class="eyebrow">عالم كامل من الحكايات</span><h1>${esc(heading)}</h1><p>${number(manifest.uniqueMovies)} فيلم و${number(manifest.uniqueSeries)} مسلسل، موزّعة حسب مزاجك.</p></div><a class="btn secondary small" href="#/search">بحث في كل المصادر</a></div>${collectionChips(manifest.collections,slug)}<div class="catalog-toolbar"><label class="field">ابحث داخل الكتالوج<input class="input" id="collection-query" type="search" placeholder="العنوان بالعربي أو الإنجليزي…"></label><p id="collection-count" class="muted" role="status"></p>${definition?'<button class="btn secondary small" id="collection-refresh">تحديث الكتالوج</button>':''}</div><div id="collection-status" role="status"></div><div class="grid" id="collection-grid"></div><div class="load-more"><button class="btn secondary" id="collection-more">عرض المزيد</button></div></div>`;
  function render(){
    if(!alive())return;
    const query=normalize($('#collection-query').value),filtered=rows.filter(m=>!query||normalize(title(m)).includes(query)||normalize(m.name).includes(query));
    $('#collection-grid').innerHTML=filtered.length?filtered.slice(0,visible).map(m=>card(m)).join(''):empty('لا توجد نتائج داخل هذا الكتالوج. جرّب اسماً آخر.');
    $('#collection-count').textContent=`${number(Math.min(visible,filtered.length))} من ${number(filtered.length)} عنوان`;
    const button=$('#collection-more');button.hidden=visible>=filtered.length&&(!!query||!definition||ended);button.disabled=busy;button.textContent=visible<filtered.length?'عرض المزيد':'تحميل عناوين إضافية';
  }
  async function loadMore(force=false){
    if(busy)return;busy=true;render();const next=force?0:skip;$('#collection-status').textContent='جارٍ تحديث الكتالوج…';
    try{
      const incoming=await catalog(definition.type,definition.id,{...definition.extra,...(next?{skip:next}:{})},undefined,force);if(!alive())return;
      const previous=rows.length;rows=dedupe(force?[...incoming,...rows]:[...rows,...incoming]);remember(rows);backup[definition.key]=rows;
      if(!force){skip+=100;visible+=48;ended=incoming.length===0;}else ended=false;
      $('#collection-status').textContent=rows.length>previous?'أُضيفت عناوين جديدة إلى الكتالوج.':incoming.length?'الكتالوج محدّث.':'وصلت إلى نهاية الكتالوج المتاح.';
    }catch(error){if(alive()){$('#collection-status').innerHTML=errorBox('تعذّر التحديث. ما زال الكتالوج المحفوظ متاحاً. '+error.message,'collection-retry');$('#collection-status button').onclick=()=>loadMore(force);}}
    finally{busy=false;if(alive())render();}
  }
  $('#collection-query').oninput=()=>{visible=48;render();};
  $('#collection-more').onclick=()=>{const query=normalize($('#collection-query').value),count=rows.filter(m=>!query||normalize(title(m)).includes(query)||normalize(m.name).includes(query)).length;if(visible<count){visible+=48;render();}else if(definition)void loadMore();};
  if(definition)$('#collection-refresh').onclick=()=>void loadMore(true);
  render();
}
