import {$,esc,empty,errorBox,openModal,closeModal,toast,title} from './ui.js';
import {sources,subtitles,safeURL} from './api.js';
import {library,saveLibrary,read,write} from './store.js';
import {languageControls} from './player-languages.js';
import {arabicAudio} from './languages.js';
let generation=0,hlsPromise;
// رابط ملف مرئي فقط؛ غير ذلك (صفحة مزود/متصفح) يُفتح داخل إطار لا في video.src
const MEDIA=/\.(mp4|m4v|mkv|webm|mov|m3u8|mpd)(?:[?#]|$)/i;
const streamURL=stream=>{const u=safeURL(stream&&stream.url);return u&&!stream.behaviorHints?.notWebReady&&(MEDIA.test(u)||/mpegurl/i.test(String(stream.mimeType||'')))?u:'';};
const externalURL=stream=>{if(!stream||streamURL(stream))return '';return safeURL(stream.externalUrl)||safeURL(stream.url);};
function loadHls(){
  if(window.Hls)return Promise.resolve(window.Hls);
  if(!hlsPromise)hlsPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='assets/hls.min.js';script.onload=()=>window.Hls?resolve(window.Hls):reject(Error());script.onerror=()=>reject(Error('تعذّر تحميل مشغل البث.'));document.head.append(script);}).catch(e=>{hlsPromise=null;throw e;});
  return hlsPromise;
}
export function trailer(item){
  const id=item.trailerStreams?.find(t=>t.ytId)?.ytId||item.trailers?.find(t=>t.source)?.source;
  if(!id||!/^[-\w]{11}$/.test(id))return toast('الإعلان الدعائي غير متاح لهذا العنوان حالياً.');
  openModal('الإعلان الدعائي — '+title(item),`<div class="video-wrap"><iframe title="الإعلان الدعائي" src="https://www.youtube-nocookie.com/embed/${esc(id)}?autoplay=1&hl=ar" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div><p class="player-status">إذا تعذّر تضمين الإعلان، <a class="text-button" href="https://www.youtube.com/watch?v=${esc(id)}" target="_blank" rel="noopener noreferrer">افتحه على يوتيوب</a>.</p>`);
}
export async function openPlayer(item,videoId,onComplete){
  const token=++generation;let alive=true,video,hls,selected,sourceGeneration=0,lastSave=0,stallTimer,finished=false,languages;
  const storePosition=()=>{
    if(!video||!Number.isFinite(video.duration)||!video.currentTime||finished)return;
    library.positions[videoId]={item,videoId,time:video.currentTime,duration:video.duration,updatedAt:Date.now()};saveLibrary();
  };
  const cleanup=()=>{alive=false;sourceGeneration++;clearTimeout(stallTimer);storePosition();languages?.dispose();hls?.destroy();if(video){video.pause();video.removeAttribute('src');video.load();}};
  openModal(title(item),`<div class="video-wrap" id="video-wrap">${empty('نبحث عن مصادر من إضافاتك…')}</div><div id="source-status" class="player-status" role="status">جارٍ تحميل المصادر</div><div id="subtitle-area"></div><div id="source-list" class="player-sources"></div>`,cleanup);
  const status=text=>{if(alive&&token===generation)$('#source-status').innerHTML=text;};
  async function fetchSources(force=false){
    status('جارٍ تحميل المصادر…');
    const result=await sources(item,videoId,force);
    if(!alive||token!==generation)return;
    if(!result.addons){$('#video-wrap').innerHTML=empty('أضف إضافة Stremio تحتوي مصادر مشاهدة لتبدأ.', '<button class="btn primary" id="go-addons">إضافة مصدر الآن</button>');$('#go-addons').onclick=()=>{write('addon-return',location.hash);closeModal();location.hash='/addons?setup=streams';};status('المعلومات والملصقات تأتي من Cinemeta. روابط المشاهدة تأتي من إضافات Stremio التي تختارها.');return;}
    if(!result.streams.length){$('#video-wrap').innerHTML=empty('لا توجد مصادر متاحة لهذا العنوان من إضافاتك الحالية.', '<button class="btn primary" id="go-addons">إضافة مصدر آخر</button>');$('#go-addons').onclick=()=>{write('addon-return',location.hash);closeModal();location.hash='/addons?setup=streams';};status(errorBox(result.failed?'لم تستجب بعض الإضافات.':'المصدر المجاني الرسمي يغطي أفلام الملكية العامة فقط. الأفلام الحديثة تحتاج إضافة Stremio مرخّصة أو مصدراً تملكه.','sources'));$('#source-status button').onclick=()=>fetchSources(true);return;}
    status((result.failed?'تعذّر الوصول إلى '+result.failed+' من إضافاتك. ':'')+'اختر مصدراً. سيظهر الفيديو أو مشغل المصدر داخل المربع الأسود.');
    if(result.failed){const retry=document.createElement('button');retry.textContent='إعادة المحاولة';retry.className='text-button';retry.onclick=()=>fetchSources(true);$('#source-status').append(retry);}
    const list=$('#source-list');list.replaceChildren();
    const ordered=[...result.streams].sort((a,b)=>Number(!!streamURL(b))-Number(!!streamURL(a))||Number(!!externalURL(b))-Number(!!externalURL(a))||(read('prefer-arabic',true)!==false?Number(arabicAudio(b))-Number(arabicAudio(a)):0));
    let firstChoice=null;
    ordered.forEach((stream,i)=>{
      const url=streamURL(stream),external=externalURL(stream),copyURL=external||url,usable=!!url||!!external;
      const row=document.createElement('div');row.className='source';row.dataset.source=i;row.setAttribute('role','button');row.tabIndex=0;
      row.innerHTML=`<b>${esc(stream.name||stream.addon)}</b><span>${esc(stream.description||stream.title||(external?'مشغل داخل الصفحة':'مصدر مباشر'))}</span><span>${esc(stream.addon)}${arabicAudio(stream)?' · صوت عربي بحسب وصف المصدر':''}${!url&&external?' · يعرض هنا داخل سحابة':!url?' · لا يرسل رابط فيديو مباشر':''}</span>${copyURL?'<button class="text-button copy-source" type="button">نسخ الرابط</button>':''}`;
      const activate=()=>url?play(stream,row):external?openExternal(stream,row):showUnsupported(stream,row);
      row.onclick=activate;
      row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}};
      const copyBtn=row.querySelector('.copy-source');
      if(copyBtn)copyBtn.onclick=e=>{e.stopPropagation();if(navigator.clipboard?.writeText)navigator.clipboard.writeText(copyURL).then(()=>toast('نُسخ الرابط.')).catch(()=>toast('تعذّر نسخ الرابط.'));else toast(copyURL);};
      list.append(row);
      if(!firstChoice&&usable)firstChoice={stream,row,url,external};
    });
    if(firstChoice)firstChoice.url?play(firstChoice.stream,firstChoice.row):openExternal(firstChoice.stream,firstChoice.row);
    else $('#video-wrap').innerHTML=empty('المصادر الموجودة لا ترسل رابط فيديو مباشر أو مشغل قابل للعرض داخل المتصفح. اختر إضافة توفر MP4 أو HLS أو مشغلاً قابلاً للتضمين.');
  }
  function markActive(button){
    $('#source-list').querySelectorAll('.source').forEach(b=>b.classList.toggle('active',b===button));
  }
  function clearCurrent(){
    clearTimeout(stallTimer);storePosition();languages?.dispose();languages=null;hls?.destroy();hls=null;
    if(video){video.pause();video.removeAttribute('src');video.load();video=null;}
    $('#subtitle-area').replaceChildren();
  }
  function openExternal(stream,button){
    const url=externalURL(stream)||safeURL(stream.url);if(!url)return;
    sourceGeneration++;selected={stream,button};clearCurrent();markActive(button);
    status('يُعرض المصدر داخل المربع الأسود. إذا منع المزوّد التضمين استخدم زر الفتح الخارجي.');
    const wrap=$('#video-wrap');wrap.style.position='relative';
    const tools='position:absolute;top:12px;right:12px;left:12px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 12px;border:1px solid #ffffff24;border-radius:10px;background:#080b12cc;backdrop-filter:blur(10px);font-size:.78rem;color:#d9dce7';
    const link='background:#e3c17b;color:#17151b;border-radius:7px;padding:5px 10px;font-weight:700';
    wrap.innerHTML=`<iframe title="${esc(stream.name||'مشغل المصدر')}" src="${esc(url)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="no-referrer" loading="eager"></iframe><div style="${tools}"><span>المصدر داخل سحابة</span><a class="text-button" style="${link}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">فتح خارجي</a></div>`;
  }
  function showUnsupported(stream,button){
    sourceGeneration++;selected={stream,button};clearCurrent();markActive(button);
    $('#video-wrap').innerHTML=empty('هذا المصدر لا يرسل رابط فيديو مباشر للموقع. اختر مصدراً آخر من القائمة يوفر MP4 أو HLS أو مشغلاً قابلاً للتضمين.');
    status('بعض إضافات Stremio ترسل بيانات تحتاج مشغلاً خارجياً، لذلك لا يمكن عرضها داخل المتصفح مباشرة.');
  }
  function playbackError(message){clearTimeout(stallTimer);status(errorBox(message,'playback'));const retry=$('#source-status button');if(retry)retry.onclick=()=>selected&&play(selected.stream,selected.button);}
  async function play(stream,button){
    selected={stream,button};const session=++sourceGeneration;clearCurrent();
    markActive(button);
    $('#video-wrap').innerHTML='<video id="video" controls playsinline preload="metadata" aria-label="مشغل الفيديو"></video>';video=$('#video');status('جارٍ تجهيز المشاهدة…');
    languages=languageControls({video,root:$('#subtitle-area'),stream,fetchSubtitles:force=>subtitles(item,videoId,force)});
    const resume=library.positions[videoId]?.time||0;
    const complete=()=>{if(finished)return;finished=true;delete library.positions[videoId];saveLibrary();onComplete(item,videoId);};
    video.addEventListener('loadedmetadata',()=>{if(resume>0&&resume<video.duration-10)video.currentTime=resume;});
    video.addEventListener('timeupdate',()=>{if(video.duration>0&&video.currentTime/video.duration>=.9)complete();if(Date.now()-lastSave>5000){lastSave=Date.now();storePosition();}});
    video.addEventListener('ended',complete);video.addEventListener('pause',storePosition);
    video.addEventListener('playing',()=>{clearTimeout(stallTimer);status('مشاهدة ممتعة. يُحفظ موضعك تلقائياً.');});
    video.addEventListener('waiting',()=>{clearTimeout(stallTimer);stallTimer=setTimeout(()=>playbackError('البث لا يستجيب. أعد المحاولة أو اختر مصدراً آخر.'),18000);});
    video.addEventListener('error',()=>{if(alive&&session===sourceGeneration)playbackError('تعذّر تشغيل هذا المصدر. قد يكون الرابط منتهياً أو ترميز الفيديو غير مدعوم.');});
    stallTimer=setTimeout(()=>{if(video.readyState<2)playbackError('المصدر لم يستجب في الوقت المحدد.');},18000);
    try{
      const url=safeURL(stream.url),isHls=/\.m3u8(?:[?#]|$)/i.test(url)||/mpegurl/i.test(stream.mimeType||'');
      if(isHls&&!video.canPlayType('application/vnd.apple.mpegurl')){
        const Hls=await loadHls();if(!alive||session!==sourceGeneration)return;if(!Hls.isSupported())throw Error('متصفحك لا يدعم تشغيل HLS.');
        hls=new Hls({maxBufferLength:30});hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal){hls?.destroy();playbackError('تعذّر تشغيل البث. تحقق من المصدر أو اختر جودة أخرى.');}});languages.attachHls(hls,Hls);hls.loadSource(url);hls.attachMedia(video);
      }else video.src=url;
      video.play().catch(()=>{if(alive&&session===sourceGeneration&&video.readyState>=1)status('اضغط زر التشغيل داخل الفيديو لبدء المشاهدة.');});
    }catch(error){if(alive&&session===sourceGeneration)playbackError(error.message||'تعذّر تشغيل المصدر.');}
  }
  await fetchSources();
}
