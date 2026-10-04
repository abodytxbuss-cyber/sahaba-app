import {library,saveLibrary,xp,level,markWatched,getAddons,saveAddons,partition,stageStatus,read,write} from './js/store.js';
import {catalog,metadata,validateManifest,CINEMETA} from './js/api.js';
import {$,esc,number,genreAR,title,year,genres,card,skeleton,empty,errorBox,toast,openModal,closeModal,imageURL,setTitles,setPosters} from './js/ui.js';
import {openPlayer,trailer} from './js/player.js';
import {renderCollection,collectionChips,dedupe} from './js/collections.js';
import {initializeArabicSubtitles} from './js/subtitle-addon.js';
import {initializeLegalStreams} from './js/source-addons.js';
import {filterCollectionRows} from './js/catalog-rules.js';

const main=$('#main'),items=new Map();let featured=[],backup={},journeyBackup={},collections={collections:[]},stages=[],titles={},descriptions={},routeVersion=0,heroTimer,heroIndex=0,heroPaused=matchMedia('(prefers-reduced-motion: reduce)').matches,searchTimer,searchVersion=0,currentItem,libraryTab='later';
const key=m=>`${m.type||'movie'}:${m.id}`;
function remember(list){for(const m of list){const known=items.get(key(m));items.set(key(m),{...known,...m,...(known?.localPoster?{localPoster:known.localPoster}:{}),...(known?.descriptionAr?{descriptionAr:known.descriptionAr}:{})});}return list.map(m=>items.get(key(m)));}
const unique=list=>[...new Map(list.map(m=>[key(m),m])).values()];
const header=(label,heading,desc)=>`<div class="page-head"><div><span class="eyebrow">${label}</span><h1>${heading}</h1><p>${desc}</p></div></div>`;
const grid=list=>`<div class="grid">${list.map(m=>card(m,{badge:library.watched[m.id]?'✓ شاهدته':''})).join('')}</div>`;
function profile(){return `<div class="profile-panel"><span class="big-star">✧</span><h2>${level()}</h2><p>كل حكاية تمنح رحلتك ضوءاً جديداً.</p><div class="track"><i style="width:${xp()>=1500?100:xp()<500?xp()/5:(xp()-500)/10}%"></i></div><div class="profile-numbers"><div><b>${number(xp())}</b><span>نقطة خبرة</span></div><div><b>${number(Object.keys(library.earned).length)}</b><span>نجمة</span></div></div>${achievements()}</div>`;}
function achievements(){const watched=Object.values(library.watched).filter(m=>m.type==='movie').length,done=stages.some((_,i)=>stageStatus(stages,i).done);return [[watched>=1,'✦','أول حكاية','شاهد أول فيلم'],[watched>=10,'✧','عاشق السينما','شاهد عشرة أفلام'],[done,'♜','فاتح الآفاق','أكمل مرحلة من رحلتك']].map(([ok,icon,name,desc])=>`<div class="achievement ${ok?'':'locked'}"><span>${icon}</span><div><b>${name}</b><small>${ok?'تم الإنجاز · ':''}${desc}</small></div></div>`).join('');}
function updateXP(){$('#xp-value').textContent=number(xp())+' XP';$('#xp-button').setAttribute('aria-label',`${number(xp())} نقطة خبرة، ${level()}`);}
function completed(item,id=item.id){
  const before=stages.map((_,i)=>stageStatus(stages,i).done);
  let complete=item.type!=='series'||id===item.id;
  if(!complete){const episodes=(item.videos||[]).filter(v=>v.season>0&&(!v.released||new Date(v.released)<=new Date()));complete=episodes.length>0&&episodes.every(v=>v.id===id||library.earned[v.id]);}
  const result=markWatched(item,id,complete);updateXP();
  const stage=stages.findIndex((_,i)=>!before[i]&&stageStatus(stages,i).done);
  toast(!result.saved?'تم حفظ التقدم لهذه الجلسة؛ مساحة التخزين المحلي ممتلئة.':stage>=0?'🎉 اكتملت المرحلة! فُتحت محطتك التالية.':result.first?'✦ نجمة جديدة! أضفنا ٥٠ نقطة إلى رحلتك.':'هذه المشاهدة محسوبة بالفعل في رحلتك.');
  if(location.hash.startsWith('#/details')){const b=$('[data-action="watched"]');if(b)b.textContent='✓ شاهدته';}
}
function buildStages(){
  const frozen=[];
  partition(featured).forEach((list,i)=>frozen.push({name:'إصدارات سحابة'+(i?' · '+number(i+1):''),items:list}));
  const used=new Set(featured.map(m=>m.id));
  for(const yr of [2026,2025,2024]){
    const list=(journeyBackup['movie/year/genre='+yr]||[]).filter(m=>!used.has(m.id)).slice(0,30);list.forEach(m=>used.add(m.id));
    partition(list).filter(p=>p.length>=10).forEach((p,i)=>frozen.push({name:'حكايات '+number(yr)+(i?' · '+number(i+1):''),items:remember(p.map(m=>({...m,type:'movie'})))}));
  }
  partition((journeyBackup['series/top']||[]).slice(0,30)).filter(p=>p.length>=10).forEach((p,i)=>frozen.push({name:'عوالم المسلسلات · '+number(i+1),items:remember(p.map(m=>({...m,type:'series'})))}));
  stages=frozen;
}
const heroIds=['tt16311594','tt26743210','tt4900148'];
function renderHero(){
  const m=items.get('movie:'+heroIds[heroIndex])||featured[0];if(!m||!$('#hero'))return;
  const titleParts=title(m);$('#hero').innerHTML=`<div class="hero-art"><img src="assets/${esc(m.id)}-bg.jpg" alt="" fetchpriority="high"></div><div class="container"><div class="hero-content"><span class="feature-badge">✦ اختيار سحابة الليلة</span><h1>${esc(titleParts)}</h1><p class="original-title" lang="en" dir="ltr" style="text-align:right">${esc(m.name)}</p><div class="meta-line"><span class="gold">★ ${esc(m.imdbRating||'—')}</span><span class="separator">|</span><span>${esc(year(m))}</span><span>${esc(genres(m).slice(0,2).join(' · '))}</span><span class="pill">${esc((m.runtime||'').replace(/min/g,'دقيقة'))}</span></div><p class="description">${esc(m.descriptionAr||'حكاية تستحق أن تكون محطتك التالية في سحابة.')}</p><div class="actions"><button class="btn primary" data-play="${esc(key(m))}">▷ شاهد الآن</button><a class="btn secondary" href="#/details/movie/${m.id}">التفاصيل <span>ⓘ</span></a><button class="icon-button" data-later="${esc(key(m))}" aria-label="${library.later[m.id]?'إزالة من لاحقاً':'أضف إلى لاحقاً'}">${library.later[m.id]?'✓':'+'}</button></div></div></div><div class="hero-bottom"><span>حكايات تبقى معك، بعد المشهد الأخير.</span><div class="hero-controls">${heroIds.map((id,i)=>`<button class="hero-dot ${i===heroIndex?'active':''}" data-hero="${i}" aria-label="اختيار الفيلم ${number(i+1)}" aria-pressed="${i===heroIndex}"></button>`).join('')}<button class="pause" data-action="hero-pause" aria-label="${heroPaused?'تشغيل التبديل التلقائي':'إيقاف التبديل التلقائي'}">${heroPaused?'▷':'Ⅱ'}</button></div><div class="hero-count"><b class="gold">0${heroIndex+1}</b> / 03</div></div>`;
}
function shelfShell(id,name,link='',count=0){const badge=count?`<span class="sub">${number(count)} عنوان</span>`:'';return `<section class="shelf" id="${id}"><div class="section-title"><h2>${esc(name)} ${badge}</h2><div class="section-tools">${link?`<a class="text-button" href="${esc(link)}">عرض الكل</a>`:''}<button class="scroll-btn" data-scroll="${id}" data-direction="1" aria-label="العناوين السابقة">›</button><button class="scroll-btn" data-scroll="${id}" data-direction="-1" aria-label="العناوين التالية">‹</button></div></div><div class="shelf-content">${skeleton()}</div></section>`;}
function putShelf(id,list,message='') {const el=$('#'+id+' .shelf-content');if(!el)return;el.innerHTML=(message?errorBox(message,'shelf:'+id):'')+(list.length?`<div class="rail">${remember(list).slice(0,20).map(m=>card(m)).join('')}</div>`:empty('لا توجد عناوين في هذا الرف حالياً.',`<button class="text-button" data-action="shelf:${id}">إعادة المحاولة</button>`));}
const shelfJobs=new Map();
async function loadShelf(id,config,version,force=false){
  if(!$('#'+id))return;if(config.fallback?.length)putShelf(id,config.fallback);else $('#'+id+' .shelf-content').innerHTML=skeleton();
  try{const list=await catalog(config.type,config.id,config.extra||{},config.manifest||CINEMETA,force);if(version!==routeVersion)return;const rows=config.manifest?list:filterCollectionRows(list,config);putShelf(id,dedupe([...rows,...(config.fallback||[])]));}
  catch(error){if(version!==routeVersion)return;putShelf(id,config.fallback||[],(config.fallback?.length?'نعرض النسخة المحفوظة. ':'')+error.message);}
}
function addonCatalogExtra(cat){const extras={};for(const field of cat.extra||[]){if(field.isRequired){if(field.options?.length)extras[field.name]=field.options[0];else return null;}}return extras;}
function home(version){
  const current=stages.findIndex((_,i)=>!stageStatus(stages,i).done),index=Math.max(0,current),s=stages[index],progress=s?stageStatus(stages,index).count:0;
  const shelves=collections.collections;
  const featuredSlugs=['top-rated','popular','year-2026','action','sci-fi','drama','comedy','adventure','thriller','horror','animation','war','documentary','series'];
  const homeShelves=featuredSlugs.map(slug=>shelves.find(c=>c.slug===slug)).filter(Boolean);
  const restShelves=shelves.filter(c=>!featuredSlugs.includes(c.slug));
  main.innerHTML=`<section class="hero" id="hero" aria-label="اختيار الليلة"></section><div class="container home-content"><a class="journey-banner" href="#/journey"><div class="journey-emblem">✧</div><div><h2>رحلتك الكبيرة تبدأ بحكاية</h2><p>المرحلة ${number(index+1)} · ${esc(s?.name||'إصدارات سحابة')}</p></div><div class="banner-progress"><small>${number(progress)} من ${number(s?.items.length||0)} حكاية</small><div class="track"><i style="width:${s?progress/s.items.length*100:0}%"></i></div></div><span class="text-button">اكتشف رحلتك ✧</span></a><section class="catalog-intro"><div class="section-title"><h2>عالمك السينمائي <span class="sub">${number(collections.uniqueMovies)} فيلم · ${number(collections.uniqueSeries)} مسلسل · ${number(shelves.length)} كتالوج</span></h2><a class="text-button" href="#/catalog/all">تصفّح كل الأفلام</a></div>${collectionChips(shelves)}</section>${shelfShell('shelf-featured','إصدارات سحابة','#/catalog/featured',featured.length)}${homeShelves.map(c=>shelfShell('shelf-'+c.slug,c.name,'#/catalog/'+c.slug,c.count)).join('')}${restShelves.length?`<section class="shelf" id="shelf-rest"><div class="section-title"><h2>مزيد من التصنيفات <span class="sub">${number(restShelves.length)} كتالوج</span></h2><div class="section-tools"><a class="text-button" href="#/catalog/all">تصفّح الكل</a></div></div><div class="collection-chips">${restShelves.map(c=>`<a class="chip" href="#/catalog/${esc(c.slug)}">${esc(c.name)} <b class="chip-count">${number(c.count)}</b></a>`).join('')}</div></section>`:''}<div id="addon-shelves"></div></div>`;
  renderHero();putShelf('shelf-featured',featured);shelfJobs.clear();
  for(const c of homeShelves){const config={...c,fallback:filterCollectionRows(backup[c.key]||[],c)};shelfJobs.set('shelf-'+c.slug,config);putShelf('shelf-'+c.slug,config.fallback);}
  // تبقى الأرفف معبأة فوراً، ويُحدّث الرائج والمسلسلات فقط عند فتح الرئيسية.
  for(const slug of ['popular','series']){const config=shelfJobs.get('shelf-'+slug);if(config)void loadShelf('shelf-'+slug,config,version);}
  let count=0;
  for(const addon of getAddons().filter(a=>a.enabled))for(const cat of addon.manifest.catalogs){
    const id='addon-shelf-'+count++,extra=addonCatalogExtra(cat);$('#addon-shelves').insertAdjacentHTML('beforeend',shelfShell(id,addon.manifest.name+' · '+(cat.name||'كتالوج الإضافة')));
    if(extra===null){$('#'+id+' .shelf-content').innerHTML=empty('هذا الكتالوج يحتاج إلى بحث أو إعداد إضافي.', '<a class="btn secondary" href="#/search">انتقل إلى البحث</a>');continue;}
    const config={type:cat.type,id:cat.id,extra,manifest:addon.url};shelfJobs.set(id,config);void loadShelf(id,config,version);
  }
  if(!count)$('#addon-shelves').innerHTML=`<section class="shelf"><div class="section-title"><h2>من إضافاتك</h2></div>${empty('أضف عوالم جديدة إلى سمائك. تظهر كتالوجات إضافاتك هنا.', '<a class="btn secondary" href="#/addons">استكشف إضافاتي</a>')}</section>`;

  heroTimer=setInterval(()=>{if(!heroPaused&&!document.hidden&&!$('#modal').open&&!$('#hero')?.matches(':hover, :focus-within')){heroIndex=(heroIndex+1)%heroIds.length;renderHero();}},8500);
}
function journey(){main.innerHTML=`<div class="container">${header('خطوة نحو السماء','رحلة السحاب','شاهد، اجمع النجوم، وافتح آفاقاً جديدة. كل مرحلة تقرّبك من سمائك.')}<div class="journey-layout"><div class="journey-path">${stages.map((s,i)=>{const status=stageStatus(stages,i),cls=status.done?'done':status.unlocked?'current':'locked';return `<section class="stage ${cls}"><div class="stage-node" aria-label="${status.done?'منجزة':status.unlocked?'حالية':'مقفولة'}">${status.done?'✓':status.unlocked?'✦':'♙'}</div><div class="stage-body"><p class="stage-label">المرحلة ${number(i+1)} · ${status.done?'مكتملة':status.unlocked?'رحلتك الحالية':'🔒 مقفولة'}</p><h2>${esc(s.name)}</h2><div class="stage-stats"><span>${number(status.count)} / ${number(s.items.length)} حكاية</span><span>${number(s.items.length)} نجمة</span></div><div class="track" role="progressbar" aria-label="تقدم المرحلة ${i+1}" aria-valuemin="0" aria-valuemax="${s.items.length}" aria-valuenow="${status.count}"><i style="width:${status.count/s.items.length*100}%"></i></div><div class="stage-posters">${s.items.slice(0,5).map(m=>`<img src="${esc(imageURL(m))}" alt="${esc(title(m))}" loading="lazy">`).join('')}${status.unlocked?`<a class="btn small ${status.done?'secondary':'primary'}" href="#/stage/${i}">${status.done?'عرض المرحلة':'ابدأ المرحلة'}</a>`:'<button class="btn small" disabled>أكمل السابقة</button>'}</div></div></section>`;}).join('')}</div><aside>${profile()}</aside></div></div>`;}
function stage(index){if(!Number.isInteger(index)||!stages[index])return notFound();const s=stages[index],status=stageStatus(stages,index);main.innerHTML=`<div class="container">${header('رحلة السحاب',esc(s.name),`${number(status.count)} من ${number(s.items.length)} حكاية مكتملة`)}<a class="back-link" href="#/journey">العودة إلى خريطة الرحلة</a>${status.unlocked?grid(s.items):empty('هذه المرحلة مقفولة. أكمل المراحل السابقة أولاً.', '<a class="btn primary" href="#/journey">تابع رحلتك</a>')}</div>`;}
async function details(type,id,version,force=false){
  let m=items.get(type+':'+id)||{id,type,name:'جارٍ تحميل التفاصيل…'};currentItem=m;renderDetail(m,true);
  try{m=await metadata(m,force);if(version!==routeVersion)return;remember([m]);currentItem=m;renderDetail(m,false);}
  catch(error){if(version!==routeVersion)return;renderDetail(m,false,error.message);}
}
function renderDetail(m,loading=false,error=''){
  const list=(m.videos||[]).filter(v=>Number.isFinite(v.season)&&Number.isFinite(v.episode)),seasons=[...new Set(list.map(v=>v.season))].sort((a,b)=>a-b),hasTrailer=(m.trailerStreams||[]).some(t=>t.ytId)||(m.trailers||[]).some(t=>t.source);
  main.innerHTML=`<article class="detail"><div class="detail-backdrop"><img src="${esc(m.featured&&heroIds.includes(m.id)?'assets/'+m.id+'-bg.jpg':m.background||imageURL(m))}" alt=""></div><div class="container"><a class="back-link" href="#/home">الرئيسية / ${m.type==='series'?'مسلسلات':'الأفلام'}</a>${error?errorBox(error,'detail-retry'):''}<div class="detail-layout"><img class="detail-poster" src="${esc(imageURL(m))}" alt="ملصق ${esc(title(m))}"><div class="detail-copy"><span class="eyebrow">${m.type==='series'?'عالم يستحق الاستكشاف':'حكايتك التالية'}</span><h1>${esc(title(m))}</h1><p class="original-title" dir="auto">${esc(titles[m.id]?.ar?m.name:'')}</p><div class="meta-line"><span class="gold">★ ${esc(m.imdbRating||'غير متاح')}</span><span>${esc(year(m))}</span><span>${esc((m.runtime||'').replace(/min/g,'دقيقة'))}</span></div><div class="detail-tags">${genres(m).map(g=>`<span>${esc(g)}</span>`).join('')}</div><p class="detail-description" dir="auto">${esc(m.descriptionAr||m.description||'لا يتوفر وصف لهذا العنوان حالياً.')}</p>${loading?'<p class="muted" role="status">جارٍ تحديث التفاصيل…</p>':''}<div class="actions"><button class="btn primary" data-action="detail-play">▷ شاهد الآن</button><button class="btn secondary" data-later="${esc(key(m))}">${library.later[m.id]?'✓ في قائمة لاحقاً':'＋ لاحقاً'}</button><button class="btn secondary" data-action="trailer" ${hasTrailer?'':'disabled'}>الإعلان الدعائي</button><button class="text-button" data-action="watched">${library.watched[m.id]?'✓ شاهدته':'✓ سجلته كمُشاهد'}</button></div><div class="cast"><p><b>الإخراج</b>${esc((m.director||[]).join('، ')||'غير متاح')}</p><p><b>طاقم العمل</b>${esc((m.cast||[]).slice(0,8).join('، ')||'غير متاح')}</p></div></div></div>${m.type==='series'?`<section class="episodes"><div class="section-title"><h2>المواسم والحلقات</h2>${seasons.length?`<label class="field">الموسم<select id="season-select">${seasons.map(s=>`<option value="${s}">${s===0?'حلقات خاصة':'الموسم '+number(s)}</option>`).join('')}</select></label>`:''}</div><div id="episodes-list">${loading?skeleton(3):empty('لا تتوفر معلومات الحلقات حالياً.', '<button class="text-button" data-action="detail-retry">إعادة المحاولة</button>')}</div></section>`:''}</div></article>`;
  if(seasons.length){const initial=seasons.includes(1)?1:seasons[0];$('#season-select').value=initial;renderEpisodes(m,initial);$('#season-select').onchange=e=>renderEpisodes(m,Number(e.target.value));}
}
function renderEpisodes(m,season){$('#episodes-list').innerHTML=`<div class="episodes-list">${(m.videos||[]).filter(v=>v.season===season).sort((a,b)=>a.episode-b.episode).map(v=>{const future=v.released&&new Date(v.released)>new Date();return `<button class="episode" data-episode="${esc(v.id)}" ${future?'disabled':''}><span class="episode-num">${number(v.episode)}</span><span>الحلقة ${number(v.episode)}<small dir="auto">${esc(v.name||v.title||'')}${future?' · لم تُعرض بعد':''}${library.earned[v.id]?' · ✓':''}</small></span></button>`;}).join('')}</div>`;}
function libraryPage(){
  const rows=libraryTab==='continue'?Object.values(library.positions).filter(p=>p?.item&&p.time>0).sort((a,b)=>b.updatedAt-a.updatedAt):Object.values(library[libraryTab]||{}).filter(m=>m?.id);
  main.innerHTML=`<div class="container">${header('مساحتك الخاصة','مكتبتي','الحكايات التي عشتها… والتي تنتظرك.')}<div class="tabs">${[['later','🔖 لاحقاً'],['watched','✓ شاهدتها'],['continue','▷ متابعة المشاهدة']].map(([id,label])=>`<button class="chip ${libraryTab===id?'active':''}" data-library="${id}" aria-pressed="${libraryTab===id}">${label}</button>`).join('')}</div>${rows.length?`<div class="grid">${rows.map(row=>{const m=libraryTab==='continue'?row.item:row;remember([m]);return `<div>${card(m,{badge:libraryTab==='watched'?'✓ شاهدته':'',progress:row.time/row.duration*100})}${libraryTab==='continue'?`<button class="text-button" data-resume="${esc(row.videoId)}">متابعة من ${number(Math.floor(row.time/60))} دقيقة</button>`:libraryTab==='later'?`<button class="text-button" data-later="${esc(key(m))}">إزالة من لاحقاً</button>`:''}</div>`;}).join('')}</div>`:empty(libraryTab==='continue'?'ستظهر هنا المشاهدات التي لم تكملها بعد.':'مكتبتك تنتظر أول حكاية.', '<a class="btn secondary" href="#/search">اكتشف شيئاً جديداً</a>')}</div>`;
}
function addonHasResource(addon,resource){return addon.manifest.resources.some(r=>(typeof r==='string'?r:r.name)===resource);}
function addonsPage(){const addons=getAddons(),params=new URLSearchParams((location.hash.split('?')[1]||'')),setupStreams=params.get('setup')==='streams',returnPath=read('addon-return','');main.innerHTML=`<div class="container">${header('وسّع آفاقك','إضافاتي','كتالوجات جديدة ومصادر مشاهدة تختارها بنفسك.')}${setupStreams?`<div class="notice"><span>ألصق رابط manifest.json لإضافة Stremio تحتوي «مصادر مشاهدة». بعد نجاح الإضافة سنعيدك للفيلم مباشرة.</span>${returnPath?`<a class="text-button" href="${esc(returnPath)}">العودة للفيلم</a>`:''}</div>`:''}<section class="addon-form"><h2>عالم جديد برابط واحد</h2><p>ألصق رابط manifest.json لإضافة Stremio. ستظهر كتالوجاتها في الرئيسية ومصادرها داخل المشغّل.</p><form id="addon-form"><label class="field">رابط الإضافة<input class="input" id="addon-url" type="text" inputmode="url" placeholder="https://example.com/manifest.json" autocomplete="off" required></label><button class="btn primary" type="submit">＋ إضافة إلى سحابة</button></form><div id="addon-message" role="status"></div></section><div class="section-title"><h2>الإضافات المثبتة <span class="sub">${number(addons.length+1)} إضافات</span></h2></div><div class="addon-list"><div class="addon-item"><div class="addon-icon">◈</div><div class="addon-info"><h2>الكتالوج السينمائي <span class="muted">Cinemeta</span></h2><p>المعلومات الأساسية للأفلام والمسلسلات</p><div class="tags"><span>كتالوجات</span><span>بيانات</span></div></div><span class="gold">إضافة أساسية</span></div>${addons.map((a,i)=>`<article class="addon-item"><div class="addon-icon">✧</div><div class="addon-info"><h2 dir="auto">${esc(a.manifest.name)}</h2><p dir="auto">${esc(a.manifest.description||'إضافة Stremio')}</p><div class="tags">${a.manifest.resources.map(r=>`<span>${esc(({catalog:'كتالوجات',meta:'بيانات',stream:'مصادر مشاهدة',subtitles:'ترجمات'})[typeof r==='string'?r:r.name]||'موارد إضافية')}</span>`).join('')}</div></div><div class="addon-actions"><button class="toggle ${a.enabled?'':'off'}" data-toggle-addon="${i}" aria-pressed="${a.enabled}">${a.enabled?'● مفعّلة':'غير مفعّلة'}</button><button class="danger" data-remove-addon="${i}">حذف</button></div></article>`).join('')}</div><aside class="help-panel"><h2>كيف تبدأ؟</h2><p>١. انسخ رابط الإضافة بعد إعدادها في صفحة مزوّدها.</p><p>٢. ألصقه أعلاه ثم اختر «إضافة إلى سحابة».</p><p>٣. افتح أي فيلم واختر «شاهد الآن»، ثم اختر مصدراً متاحاً.</p><p>يدعم المشغل روابط MP4 وبث HLS وترجمات VTT وSRT. مصادر التورنت والروابط التي تحتاج ترويسات خاصة قد تحتاج مشغلاً خارجياً. لا تأتي سحابة بمصادر مشاهدة مدمجة.</p></aside></div>`;
  $('#addon-form').onsubmit=async e=>{e.preventDefault();const button=$('#addon-form button'),message=$('#addon-message'),input=$('#addon-url');button.disabled=true;message.textContent='جارٍ قراءة الإضافة…';try{const addon=await validateManifest(input.value);const list=getAddons(),index=list.findIndex(a=>a.url===addon.url);if(index<0)list.push(addon);else list[index]=addon;if(!saveAddons(list))throw Error('تعذّر حفظ الإضافة. اسمح بالتخزين المحلي أو وفر مساحة.');if(message.isConnected){const back=read('addon-return','');if(setupStreams&&!addonHasResource(addon,'stream')){addonsPage();toast('أُضيفت الإضافة، لكنها لا تحتوي مصادر مشاهدة.');return;}if(back&&addonHasResource(addon,'stream')){write('addon-return','');toast('أُضيفت '+addon.manifest.name+'؛ نعيدك للفيلم.');location.hash=back;return;}addonsPage();toast('أُضيفت '+addon.manifest.name+' إلى سمائك.');}}catch(error){if(message.isConnected){message.innerHTML=errorBox(error.message,'addon-retry');$('#addon-message button').onclick=()=>$('#addon-form').requestSubmit();}}finally{button.disabled=false;}};
}
function searchPage(params){const query=params.get('q')||'',type=params.get('type')||'movie',selectedYear=params.get('year')||'',genre=params.get('genre')||'';
  main.innerHTML=`<div class="container">${header('خلف كل عنوان، عالم','اكتشف حكايتك','ابحث بالعربية أو الإنجليزية، أو دع فضولك يختار.')}<p style="margin-bottom:20px"><a class="text-button" href="#/catalog/all">تصفّح جميع كتالوجات الأفلام</a></p><form id="search-form" class="search-form"><label class="input" style="display:flex;align-items:center;gap:14px;flex:1"><span aria-hidden="true">⌕</span><input id="search-input" type="search" aria-label="ابحث عن فيلم أو مسلسل" placeholder="عنوان، حكاية، عالم جديد…" value="${esc(query)}" style="border:0;background:none;color:inherit;width:100%;min-width:0"></label><button class="btn primary">بحث</button></form><div class="filters"><span class="filter-label">تصفية حسب</span><select id="type-filter" aria-label="نوع المحتوى"><option value="movie">أفلام</option><option value="series">مسلسلات</option></select><select id="genre-filter" aria-label="التصنيف"><option value="">كل الأنواع</option>${Object.entries(genreAR).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select><select id="year-filter" aria-label="سنة الإصدار"><option value="">كل السنوات</option>${Array.from({length:new Date().getFullYear()-1919},(_,i)=>new Date().getFullYear()-i).map(y=>`<option value="${y}">${number(y)}</option>`).join('')}</select></div><div id="search-status" role="status"></div><div id="search-results">${skeleton()}</div><div class="load-more"><button id="load-more" class="btn secondary" hidden>المزيد من العناوين</button></div></div>`;
  $('#type-filter').value=type;$('#genre-filter').value=genre;$('#year-filter').value=selectedYear;
  let skip=0,results=[];
  const normalize=s=>String(s).toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/[\u064B-\u065F]/g,'');
  async function run(more=false,force=false){
    const token=++searchVersion,version=routeVersion,q=$('#search-input').value.trim(),t=$('#type-filter').value,g=$('#genre-filter').value,y=$('#year-filter').value;
    const resultEl=$('#search-results'),statusEl=$('#search-status'),moreButton=$('#load-more');if(!more){skip=0;results=[];resultEl.innerHTML=skeleton();}moreButton.disabled=true;moreButton.hidden=true;statusEl.textContent='جارٍ البحث…';
    const matches=m=>(!q||[m.name,title(m)].some(s=>normalize(s).includes(normalize(q))))&&m.type===t&&(!y||year(m)===y)&&(!g||(m.genres||m.genre||[]).includes(g));
    const local=unique([...items.values()]).filter(matches).slice(0,q?200:100);
    const translated=Object.entries(titles).find(([,v])=>normalize(v.ar).includes(normalize(q))&&q);
    const search=q&&translated&&/[\u0600-\u06ff]/.test(q)?translated[1].en:q;
    const extra={...(q?{search}:{}),...(g&&!y?{genre:g}:{}),...(y&&!q?{genre:y}:{}),...(skip?{skip}:{})};
    try{
      const jobs=[catalog(t,y&&!q?'year':'top',extra,CINEMETA,force)];
      if(q)for(const addon of getAddons().filter(a=>a.enabled))for(const cat of addon.manifest.catalogs.filter(c=>c.type===t&&(c.extra||[]).some(e=>e.name==='search'))){const extras={search, ...(skip?{skip}:{})};let valid=true;for(const e of cat.extra||[]){if(e.isRequired&&e.name!=='search'){if(e.options?.length)extras[e.name]=e.options[0];else valid=false;}}if(valid)jobs.push(catalog(t,cat.id,extras,addon.url,force));}
      const responses=await Promise.allSettled(jobs);if(token!==searchVersion||version!==routeVersion)return;
      const failed=responses.filter(r=>r.status==='rejected').length,received=responses.flatMap(r=>r.status==='fulfilled'?r.value:[]);remember(received);
      const filtered=received.filter(m=>(!y||year(m)===y)&&(!g||(m.genres||m.genre||[]).includes(g)));
      results=unique([...(more?results:local),...filtered]);resultEl.innerHTML=results.length?grid(results):empty('لم نعثر على نتائج. جرّب عنواناً آخر أو غيّر الفلاتر.', '<button class="text-button" data-action="search-retry">إعادة المحاولة</button>');
      statusEl.innerHTML=failed?errorBox('تعذّر الوصول إلى '+number(failed)+' من مصادر البحث. نعرض النتائج المتاحة.','search-retry'):`<p class="muted" style="margin-bottom:20px;font-size:.85rem">${number(results.length)} حكاية بانتظارك</p>`;
      moreButton.hidden=!received.length;moreButton.disabled=false;
    }catch{if(token===searchVersion&&version===routeVersion){statusEl.innerHTML=errorBox('تعذّر البحث. حاول مجدداً.','search-retry');resultEl.innerHTML=local.length?grid(local):empty('لم تصل نتائج بعد.');}}
  }
  $('#search-form').onsubmit=e=>{e.preventDefault();clearTimeout(searchTimer);run();};$('#search-input').oninput=()=>{clearTimeout(searchTimer);searchVersion++;searchTimer=setTimeout(()=>run(),350);};
  for(const selector of ['#type-filter','#genre-filter','#year-filter'])$(selector).onchange=()=>run();
  $('#load-more').onclick=()=>{skip+=100;run(true);};
  main.searchRetry=()=>run(false,true);void run();
}
function notFound(){main.innerHTML=`<div class="container">${header('خارج الخريطة','هذه الصفحة غير موجودة','دعنا نعود إلى الحكاية.')} ${empty('لم نتمكن من العثور على هذا المسار.', '<a class="btn primary" href="#/home">العودة للرئيسية</a>')}</div>`;}
async function route(){
  const version=++routeVersion;searchVersion++;clearInterval(heroTimer);clearTimeout(searchTimer);if($('#modal').open)closeModal();
  const raw=location.hash.replace(/^#\/?/,'')||'home',parts=raw.split('?'),paths=parts[0].split('/');let page=paths[0];
  document.querySelectorAll('[data-route]').forEach(n=>{const active=n.dataset.route===(page==='stage'?'journey':page==='details'?'home':page==='catalog'?'search':page);n.classList.toggle('active',active);if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
  document.title=({home:'الرئيسية',journey:'رحلتي',search:'اكتشف',library:'مكتبتي',addons:'إضافاتي',details:'التفاصيل',stage:'رحلة السحاب',catalog:'الكتالوجات'}[page]||'صفحة غير موجودة')+' — سحابة';
  window.scrollTo(0,0);
  try{switch(page){case 'home':home(version);break;case 'journey':journey();break;case 'stage':stage(Number(paths[1]));break;case 'library':libraryPage();break;case 'catalog':renderCollection({main,slug:decodeURIComponent(paths[1]||'all'),manifest:collections,featured,backup,remember,alive:()=>version===routeVersion});break;case 'search':searchPage(new URLSearchParams(parts[1]));break;case 'addons':addonsPage();break;case 'details':await details(decodeURIComponent(paths[1]||'movie'),decodeURIComponent(paths[2]||''),version);break;default:notFound();}}
  catch{main.innerHTML=`<div class="container">${errorBox('تعذّر عرض هذه الصفحة. بيانات مكتبتك محفوظة؛ أعد المحاولة.')}</div>`;}
}
document.addEventListener('click',async e=>{
  const button=e.target.closest('button');if(!button)return;
  try{
    if(button.dataset.play){const m=items.get(button.dataset.play);if(m)await openPlayer(m,m.id,completed);}
    if(button.dataset.later){const m=items.get(button.dataset.later);if(!m)return;if(library.later[m.id])delete library.later[m.id];else library.later[m.id]=m;const saved=saveLibrary();toast(saved?(library.later[m.id]?'أُضيف إلى قائمة لاحقاً.':'أُزيل من قائمة لاحقاً.'):'تعذّر الحفظ الدائم؛ مكتبتك متاحة لهذه الجلسة.');if(location.hash.includes('library'))libraryPage();else if(location.hash.includes('details'))button.textContent=library.later[m.id]?'✓ في قائمة لاحقاً':'＋ لاحقاً';else renderHero();}
    if(button.dataset.hero!==undefined){heroIndex=Number(button.dataset.hero);renderHero();$('#hero').querySelector(`[data-hero="${heroIndex}"]`)?.focus();}
    if(button.dataset.scroll){const rail=$('#'+button.dataset.scroll+' .rail');rail?.scrollBy({left:Number(button.dataset.direction)*rail.clientWidth*.8,behavior:'smooth'});}
    if(button.dataset.library){libraryTab=button.dataset.library;libraryPage();}
    if(button.dataset.episode&&currentItem)await openPlayer(currentItem,button.dataset.episode,completed);
    if(button.dataset.resume){const p=library.positions[button.dataset.resume];if(p)await openPlayer(p.item,p.videoId,completed);}
    if(button.dataset.toggleAddon!==undefined||button.dataset.removeAddon!==undefined){const a=getAddons();if(button.dataset.toggleAddon!==undefined){const i=Number(button.dataset.toggleAddon);a[i].enabled=!a[i].enabled;}else a.splice(Number(button.dataset.removeAddon),1);if(!saveAddons(a))toast('تعذّر حفظ التغيير.');addonsPage();}
    const action=button.dataset.action;
    if(action==='retry'){if(!featured.length)location.reload();else route();}
    if(action==='hero-pause'){heroPaused=!heroPaused;renderHero();$('[data-action="hero-pause"]')?.focus();}
    if(action==='detail-retry')await details(currentItem.type,currentItem.id,routeVersion,true);
    if(action==='trailer')trailer(currentItem);
    if(action==='watched'){if(!library.watched[currentItem.id])completed(currentItem);else toast('هذا العنوان مسجل في قائمة شاهدتها.');}
    if(action==='detail-play'){if(currentItem.type==='series'){const first=(currentItem.videos||[]).filter(v=>v.season>0&&(!v.released||new Date(v.released)<=new Date())).sort((a,b)=>a.season-b.season||a.episode-b.episode).find(v=>!library.earned[v.id]);if(!first)return toast('اختر حلقة من القائمة، أو أعد تحميل تفاصيل المسلسل.');await openPlayer(currentItem,first.id,completed);}else await openPlayer(currentItem,currentItem.id,completed);}
    if(action==='search-retry')main.searchRetry?.();
    if(action?.startsWith('shelf:')){const id=action.slice(6),config=shelfJobs.get(id);if(config)await loadShelf(id,config,routeVersion,true);else putShelf(id,featured);}
  }catch{toast('تعذّر إتمام العملية. يرجى إعادة المحاولة.');}
});
$('#xp-button').onclick=()=>openModal('نجومك وإنجازاتك',`<div class="celebration"><span>✧</span><h3>${level()}</h3><p>${number(xp())} نقطة خبرة · ${number(Object.keys(library.earned).length)} نجمة</p><p class="muted">غيمة جديدة ← ٥٠٠ نقطة: سحابة ذهبية ← ١٥٠٠ نقطة: سماء مفتوحة</p></div><div class="achievement-grid">${achievements()}</div>`);
function connection(){ $('#connection').hidden=navigator.onLine; }
window.addEventListener('offline',connection);window.addEventListener('online',()=>{connection();toast('عاد الاتصال. يمكنك تحديث المحتوى.');});
window.addEventListener('hashchange',()=>void route());
async function boot(){
  initializeArabicSubtitles();
  initializeLegalStreams();
  connection();updateXP();
  try{
    const load=async name=>{try{const r=await fetch('data/'+name+'.json');if(!r.ok)throw Error();const data=await r.json();write('backup:'+name,data);return data;}catch{const data=read('backup:'+name,null);if(!data)throw Error();return data;}};
const data=await Promise.all([load('movies'),load('ar-titles'),load('catalogs'),load('posters'),load('collections'),load('journey'),load('ar-descriptions')]);
    if(!Array.isArray(data[0])||!data[0].length)throw Error();titles=data[1];setTitles(titles);setPosters(data[3]);featured=remember(data[0]);backup=data[2];collections=data[4];journeyBackup=data[5];descriptions=data[6]||{};
    for(const list of Object.values(backup))remember(list);
    for(const list of [library.watched,library.later])remember(Object.values(list).filter(m=>m?.id));
    for(const [id,entry] of Object.entries(descriptions)){
      for(const type of ['movie','series']){const cur=items.get(type+':'+id);if(cur&&!cur.descriptionAr)items.set(type+':'+id,{...cur,descriptionAr:entry.ar});}
    }
    buildStages();await route();
  }catch{main.innerHTML=`<div class="container">${header('سحابة','تعذّر تحميل المكتبة','تأكد أن ملفات data موجودة وأن الخادم يعمل.')} ${errorBox('لم تصل البيانات المحلية. أعد المحاولة بعد التحقق من الاتصال.')}</div>`;}
}
void boot();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
