import {safeURL} from './api.js';
export const $=(s,root=document)=>root.querySelector(s);
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const number=n=>Number(n||0).toLocaleString('ar-KW',{numberingSystem:'arab',useGrouping:false});
export const genreAR={'Action':'أكشن','Adventure':'مغامرة','Animation':'رسوم متحركة','Biography':'سيرة ذاتية','Comedy':'كوميديا','Crime':'جريمة','Documentary':'وثائقي','Drama':'دراما','Family':'عائلي','Fantasy':'فانتازيا','History':'تاريخي','Horror':'رعب','Mystery':'غموض','Romance':'رومانسي','Sci-Fi':'خيال علمي','Sport':'رياضة','Thriller':'إثارة','War':'حرب','Western':'ويسترن','Music':'موسيقى','Musical':'موسيقي','Reality-TV':'تلفزيون الواقع','Talk-Show':'حواري','Game-Show':'مسابقات'};
let translations={},posters={};
export const setTitles=t=>{translations=t;};
export const setPosters=p=>{posters=p;};
export const title=m=>translations[m.id]?.ar||m.titleAr||m.name||'عنوان غير متاح';
export const year=m=>String(m.releaseInfo||m.year||m.released||'').slice(0,4);
export const genres=m=>(m.genres||m.genre||[]).map(g=>genreAR[g]||g);
export const imageURL=m=>posters[m.id]||m.localPoster||safeURL(m.poster)||'assets/poster.svg';
export function card(m,{badge='',progress}={}) {return `<a class="movie-card" href="#/details/${encodeURIComponent(m.type||'movie')}/${encodeURIComponent(m.id)}" aria-label="${esc(title(m))}"><div class="poster"><img src="${esc(imageURL(m))}" alt="" loading="lazy" width="300" height="450">${m.imdbRating?`<span class="rating">★ ${esc(m.imdbRating)}</span>`:''}${badge?`<span class="card-badge">${esc(badge)}</span>`:''}<span class="card-play" aria-hidden="true">▷</span>${progress?`<div class="watch-progress"><i style="width:${Math.min(100,progress)}%"></i></div>`:''}</div><h3>${esc(title(m))}</h3><p>${esc(year(m))}<span> • </span>${esc(genres(m)[0]||(m.type==='series'?'مسلسل':'فيلم'))}</p></a>`;}
export const skeleton=(n=6)=>`<div class="rail" aria-label="جارٍ التحميل">${Array.from({length:n},()=>'<div class="skeleton-card"><div class="skeleton"></div><div class="skeleton line"></div></div>').join('')}</div>`;
export const empty=(text,action='')=>`<div class="empty"><span class="empty-icon">✧</span><p>${esc(text)}</p>${action}</div>`;
export const errorBox=(text,action='retry')=>`<div class="notice" role="status"><span>${esc(text)}</span><button class="text-button" data-action="${esc(action)}">إعادة المحاولة</button></div>`;
export function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('visible'),4500);}
const modal=$('#modal');let cleanup=()=>{},returnFocus;
export function closeModal(){cleanup();cleanup=()=>{};modal.close();$('#modal-body').replaceChildren();returnFocus?.focus?.();}
export function openModal(name,html,onClose=()=>{}){if(modal.open)closeModal();returnFocus=document.activeElement;$('#modal-title').textContent=name;$('#modal-body').innerHTML=html;cleanup=onClose;modal.showModal();$('#close-modal').focus();}
$('#close-modal').onclick=closeModal;modal.addEventListener('cancel',e=>{e.preventDefault();closeModal();});modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement){const img=e.target;if(!img.src.endsWith('/assets/poster.svg')){img.src='assets/poster.svg';img.classList.add('fallback-image');}}},true);
// اختيار أقرب عنصر في اتجاه سهم الريموت، مع احترام حقول الكتابة والمشغل.
document.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||['INPUT','TEXTAREA','SELECT','VIDEO'].includes(document.activeElement.tagName))return;
  const root=modal.open?modal:document;
  const nodes=[...root.querySelectorAll('a[href],button:not(:disabled),input,select,[tabindex="0"]')].filter(n=>n.getClientRects().length&&!n.closest('[hidden]'));
  const current=document.activeElement;if(!nodes.includes(current)){nodes[0]?.focus();e.preventDefault();return;}
  const r=current.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;let best,score=Infinity;
  for(const node of nodes){if(node===current)continue;const q=node.getBoundingClientRect(),dx=q.left+q.width/2-x,dy=q.top+q.height/2-y;const horizontal=/Left|Right/.test(e.key),main=horizontal?dx:dy,cross=horizontal?dy:dx,sign=/Right|Down/.test(e.key)?1:-1;if(main*sign<8)continue;const s=Math.abs(main)+Math.abs(cross)*3;if(s<score){score=s;best=node;}}
  if(best){e.preventDefault();best.focus();best.scrollIntoView({block:'nearest',inline:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
});
