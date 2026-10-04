import {$,esc,number,title,card,empty,errorBox} from './ui.js';
import {catalog} from './api.js';
import {collectionKey as makeCollectionKey,filterCollectionRows} from './catalog-rules.js';
import {tr,isEN} from './i18n.js';

export const collectionKey=makeCollectionKey;
export const dedupe=list=>[...new Map(list.map(m=>[(m.type||'movie')+':'+m.id,m])).values()];
const normalize=value=>String(value||'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[\u064B-\u065F]/g,'');
const nameEN={featured:'Sahaba Releases',all:'Sahaba Catalogs',popular:'Popular',series:'Series','top-rated':'Top Rated','year-2026':'2026 Movies','year-2025':'2025 Movies','year-2024':'2024 Movies',action:'Action',adventure:'Adventure',animation:'Animation',comedy:'Comedy',drama:'Drama',horror:'Horror',thriller:'Thriller','sci-fi':'Sci-Fi',documentary:'Documentary',war:'War'};
const collectionName=c=>isEN()?(nameEN[c.slug]||c.name):c.name;
export function collectionChips(collections,active='all') {
  return `<div class="collection-chips" aria-label="${tr('اختر كتالوجاً','Choose a catalog')}"><a class="chip ${active==='all'?'active':''}" href="#/catalog/all">${tr('كل الأفلام','All titles')}</a><a class="chip ${active==='featured'?'active':''}" href="#/catalog/featured">${tr('إصدارات سحابة','Sahaba Releases')}</a>${collections.map(c=>`<a class="chip ${active===c.slug?'active':''}" href="#/catalog/${esc(c.slug)}">${esc(collectionName(c))}</a>`).join('')}</div>`;
}
export function renderCollection({main,slug,manifest,featured,backup,remember,alive}) {
  const definition=manifest.collections.find(c=>c.slug===slug),isAll=slug==='all',isFeatured=slug==='featured';
  if(!definition&&!isAll&&!isFeatured){main.innerHTML=empty(tr('هذا الكتالوج غير موجود.','This catalog does not exist.'), `<a class="btn primary" href="#/catalog/all">${tr('جميع الكتالوجات','All catalogs')}</a>`);return;}
  const heading=isAll?tr('كتالوجات سحابة','Sahaba Catalogs'):isFeatured?tr('إصدارات سحابة','Sahaba Releases'):collectionName(definition);
  let rows=dedupe(isFeatured?featured:isAll?[...featured,...Object.values(backup).flat().filter(m=>m.type==='movie')]:filterCollectionRows(backup[definition.key]||[],definition)),visible=48,busy=false,ended=false,skip=definition?.nextSkip||0;
  remember(rows);
  main.innerHTML=`<div class="container"><div class="page-head"><div><span class="eyebrow">${tr('عالم كامل من الحكايات','A whole world of stories')}</span><h1>${esc(heading)}</h1><p>${number(manifest.uniqueMovies)} ${tr('فيلم','movies')}${tr(' و',' and ')}${number(manifest.uniqueSeries)} ${tr('مسلسل، موزّعة حسب مزاجك.','series, arranged by your mood.')}</p></div><a class="btn secondary small" href="#/search">${tr('بحث في كل المصادر','Search all sources')}</a></div>${collectionChips(manifest.collections,slug)}<div class="catalog-toolbar"><label class="field">${tr('ابحث داخل الكتالوج','Search this catalog')}<input class="input" id="collection-query" type="search" placeholder="${tr('العنوان بالعربي أو الإنجليزي…','Arabic or English title…')}"></label><p id="collection-count" class="muted" role="status"></p>${definition?`<button class="btn secondary small" id="collection-refresh">${tr('تحديث الكتالوج','Refresh catalog')}</button>`:''}</div><div id="collection-status" role="status"></div><div class="grid" id="collection-grid"></div><div class="load-more"><button class="btn secondary" id="collection-more">${tr('عرض المزيد','Show more')}</button></div></div>`;
  function render(){
    if(!alive())return;
    const query=normalize($('#collection-query').value),filtered=rows.filter(m=>!query||normalize(title(m)).includes(query)||normalize(m.name).includes(query));
    $('#collection-grid').innerHTML=filtered.length?filtered.slice(0,visible).map(m=>card(m)).join(''):empty(tr('لا توجد نتائج داخل هذا الكتالوج. جرّب اسماً آخر.','No results in this catalog. Try another name.'));
    $('#collection-count').textContent=`${number(Math.min(visible,filtered.length))} ${tr('من','of')} ${number(filtered.length)} ${tr('عنوان','titles')}`;
    const button=$('#collection-more');button.hidden=visible>=filtered.length&&(!!query||!definition||ended);button.disabled=busy;button.textContent=visible<filtered.length?tr('عرض المزيد','Show more'):tr('تحميل عناوين إضافية','Load more titles');
  }
  async function loadMore(force=false){
    if(busy)return;busy=true;render();const next=force?0:skip;$('#collection-status').textContent=tr('جارٍ تحديث الكتالوج…','Refreshing catalog…');
    try{
      const incoming=filterCollectionRows(await catalog(definition.type,definition.id,{...definition.extra,...(next?{skip:next}:{})},undefined,force),definition);if(!alive())return;
      const previous=rows.length;rows=dedupe(force?[...incoming,...rows]:[...rows,...incoming]);remember(rows);backup[definition.key]=rows;
      if(!force){skip+=100;visible+=48;ended=incoming.length===0;}else ended=false;
      $('#collection-status').textContent=rows.length>previous?tr('أُضيفت عناوين جديدة إلى الكتالوج.','New titles were added to the catalog.'):incoming.length?tr('الكتالوج محدّث.','The catalog is up to date.'):tr('وصلت إلى نهاية الكتالوج المتاح.','You reached the end of the available catalog.');
    }catch(error){if(alive()){$('#collection-status').innerHTML=errorBox(tr('تعذّر التحديث. ما زال الكتالوج المحفوظ متاحاً. ','Could not refresh. The saved catalog is still available. ')+error.message,'collection-retry');$('#collection-status button').onclick=()=>loadMore(force);}}
    finally{busy=false;if(alive())render();}
  }
  $('#collection-query').oninput=()=>{visible=48;render();};
  $('#collection-more').onclick=()=>{const query=normalize($('#collection-query').value),count=rows.filter(m=>!query||normalize(title(m)).includes(query)||normalize(m.name).includes(query)).length;if(visible<count){visible+=48;render();}else if(definition)void loadMore();};
  if(definition)$('#collection-refresh').onclick=()=>void loadMore(true);
  render();
}
