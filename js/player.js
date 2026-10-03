import {$,esc,empty,errorBox,openModal,closeModal,toast,title} from './ui.js';
import {sources,subtitles,safeURL} from './api.js';
import {library,saveLibrary} from './store.js';
let generation=0,hlsPromise;
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
  const token=++generation;let alive=true,video,hls,selected,sourceGeneration=0,lastSave=0,stallTimer,finished=false;
  const blobs=[];
  const storePosition=()=>{
    if(!video||!Number.isFinite(video.duration)||!video.currentTime||finished)return;
    library.positions[videoId]={item,videoId,time:video.currentTime,duration:video.duration,updatedAt:Date.now()};saveLibrary();
  };
  const cleanup=()=>{alive=false;sourceGeneration++;clearTimeout(stallTimer);storePosition();hls?.destroy();if(video){video.pause();video.removeAttribute('src');video.load();}blobs.forEach(url=>URL.revokeObjectURL(url));};
  openModal(title(item),`<div class="video-wrap" id="video-wrap">${empty('نبحث عن مصادر من إضافاتك…')}</div><div id="source-status" class="player-status" role="status">جارٍ تحميل المصادر</div><div id="source-list" class="player-sources"></div><div id="subtitle-area"></div>`,cleanup);
  const status=text=>{if(alive&&token===generation)$('#source-status').innerHTML=text;};
  const subsTask=subtitles(item,videoId).catch(()=>[]);
  async function fetchSources(force=false){
    status('جارٍ تحميل المصادر…');
    const result=await sources(item,videoId,force);
    if(!alive||token!==generation)return;
    if(!result.addons){$('#video-wrap').innerHTML=empty('أضف إضافة توفر مصادر مشاهدة لتبدأ.', '<button class="btn primary" id="go-addons">إضافة مصدر</button>');$('#go-addons').onclick=()=>{closeModal();location.hash='/addons';};status('المعلومات والملصقات تأتي من Cinemeta. مصادر المشاهدة تأتي من إضافاتك.');return;}
    if(!result.streams.length){$('#video-wrap').innerHTML=empty('لا توجد مصادر متاحة لهذا العنوان.');status(errorBox(result.failed?'لم تستجب بعض الإضافات.':'لم ترسل إضافاتك أي مصادر.','sources'));$('#source-status button').onclick=()=>fetchSources(true);return;}
    status((result.failed?'تعذّر الوصول إلى '+result.failed+' من إضافاتك. ':'')+'اختر مصدراً. يدعم المشغل الفيديو المباشر وHLS.');
    if(result.failed){const retry=document.createElement('button');retry.textContent='إعادة المحاولة';retry.className='text-button';retry.onclick=()=>fetchSources(true);$('#source-status').append(retry);}
    const list=$('#source-list');list.replaceChildren();
    result.streams.forEach((stream,i)=>{
      const url=safeURL(stream.url),button=document.createElement('button');button.className='source';button.dataset.source=i;
      button.innerHTML=`<b>${esc(stream.name||stream.addon)}</b><span>${esc(stream.description||stream.title||'مصدر مباشر')}</span><span>${esc(stream.addon)}${!url?' · هذا المصدر يحتاج مشغلاً خارجياً':''}</span>`;
      button.disabled=!url;button.onclick=()=>play(stream,button);list.append(button);
    });
    $('#video-wrap').innerHTML=empty(result.streams.some(s=>safeURL(s.url))?'اختر جودة المشاهدة من المصادر أدناه.':'هذه المصادر ليست روابط فيديو مباشرة. أضف إضافة توفر MP4 أو HLS.');
  }
  function playbackError(message){clearTimeout(stallTimer);status(errorBox(message,'playback'));const retry=$('#source-status button');if(retry)retry.onclick=()=>selected&&play(selected.stream,selected.button);}
  async function loadSubtitles(stream,session){
    const remote=await subsTask;if(!alive||session!==sourceGeneration)return;
    const candidates=[...(Array.isArray(stream.subtitles)?stream.subtitles:[]),...remote].filter(s=>safeURL(s?.url));
    if(!candidates.length)return;
    $('#subtitle-area').innerHTML='<label class="subtitle-picker">الترجمة<select id="subtitle-select"><option value="">بدون ترجمة</option></select></label><p id="subtitle-status" class="player-status" role="status"></p>';
    const select=$('#subtitle-select');const names={ar:'العربية',ara:'العربية',en:'الإنجليزية',eng:'الإنجليزية',fr:'الفرنسية',fre:'الفرنسية'};
    candidates.forEach((s,i)=>{const option=document.createElement('option');option.value=i;option.textContent=names[s.lang]||s.lang||'ترجمة '+(i+1);select.append(option);});
    let subGeneration=0;
    select.onchange=async()=>{
      const attempt=++subGeneration;video.querySelectorAll('track').forEach(n=>n.remove());const message=$('#subtitle-status');message.textContent='';if(select.value==='')return;
      const sub=candidates[Number(select.value)];
      try{
        const r=await fetch(sub.url,{signal:AbortSignal.timeout(8000),credentials:'omit'});if(!r.ok)throw Error();
        let text=(await r.text()).replace(/^\uFEFF/,'');
        if(!text.startsWith('WEBVTT'))text='WEBVTT\n\n'+text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2');
        if(!alive||session!==sourceGeneration||attempt!==subGeneration)return;
        const blob=URL.createObjectURL(new Blob([text],{type:'text/vtt'}));blobs.push(blob);const track=document.createElement('track');track.kind='subtitles';track.label=names[sub.lang]||sub.lang||'ترجمة';track.srclang=({ara:'ar',eng:'en'})[sub.lang]||sub.lang||'ar';track.src=blob;track.default=true;video.append(track);track.track.mode='showing';track.onerror=()=>{message.textContent='تعذّرت قراءة الترجمة. اختر ترجمة أخرى أو أعد اختيارها للمحاولة.';};
      }catch{if(alive&&session===sourceGeneration&&attempt===subGeneration)message.textContent='تعذّر تحميل الترجمة. قد يمنع مصدرها الاتصال المباشر؛ أعد اختيارها للمحاولة.';}
    };
  }
  async function play(stream,button){
    selected={stream,button};const session=++sourceGeneration;clearTimeout(stallTimer);storePosition();hls?.destroy();hls=null;if(video){video.pause();video.removeAttribute('src');video.load();}
    $('#source-list').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button));$('#subtitle-area').replaceChildren();
    $('#video-wrap').innerHTML='<video id="video" controls playsinline preload="metadata" aria-label="مشغل الفيديو"></video>';video=$('#video');status('جارٍ تجهيز المشاهدة…');
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
        hls=new Hls({maxBufferLength:30});hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal){hls?.destroy();playbackError('تعذّر تشغيل البث. تحقق من المصدر أو اختر جودة أخرى.');}});hls.loadSource(url);hls.attachMedia(video);
      }else video.src=url;
      video.play().catch(()=>{if(alive&&session===sourceGeneration&&video.readyState>=1)status('اضغط زر التشغيل داخل الفيديو لبدء المشاهدة.');});
      await loadSubtitles(stream,session);
    }catch(error){if(alive&&session===sourceGeneration)playbackError(error.message||'تعذّر تشغيل المصدر.');}
  }
  await fetchSources();
}
