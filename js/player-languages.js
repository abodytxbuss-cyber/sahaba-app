import {read,write} from './store.js';
import {safeURL} from './api.js';
import {isArabic,arabicAudio,languageName,rankSubtitles,decodeSubtitle,toVtt} from './languages.js';
import {t} from './i18n.js';

export function languageControls({video,root,stream,fetchSubtitles}) {
  let alive=true,hls,remote=[],choices=[],selection='',manualSubtitle=false,manualAudio=false,attempt=0,search=0,controller,blob,external,offset=0,baseCues=[],remoteFinished=false,failed=0,autoTried=new Set();
  const listeners=[],hlsListeners=[];
  let preferArabic=read('prefer-arabic',true)!==false;
  root.innerHTML=`<section class="language-panel" aria-label="${t('sub.panelAria')}"><div class="language-head"><h3>${t('sub.panelAria')}</h3><label><input type="checkbox" id="prefer-arabic"> ${t('sub.preferArabic')}</label></div><label class="subtitle-picker">${t('sub.audioLanguage')}<select id="audio-select" aria-label="${t('sub.audioLanguage')}"></select></label><p id="audio-status" class="player-status" role="status"></p><label class="subtitle-picker">${t('sub.subtitles')}<select id="subtitle-select" aria-label="${t('sub.subtitles')}"><option value="">${t('sub.none')}</option></select></label><p id="subtitle-status" class="player-status" role="status">${t('sub.searchingSubs')}</p><p id="subtitle-search-status" class="player-status" role="status"></p><div class="language-actions"><button class="btn" id="subtitle-retry">${t('retry')}</button><label class="subtitle-file">${t('sub.addSubtitleFile')}<input id="subtitle-file" type="file" accept=".srt,.vtt" aria-label="${t('sub.addSubtitleFile')}"></label><label class="subtitle-offset">${t('sub.offsetLabel')}<input id="subtitle-offset" type="number" min="-600" max="600" step="0.5" value="0" aria-label="${t('sub.offsetAria')}" disabled></label></div><p class="player-status">${t('sub.offsetHint')}</p></section>`;
  const find=s=>root.querySelector(s),subSelect=find('#subtitle-select'),audioSelect=find('#audio-select'),message=find('#subtitle-status'),searchMessage=find('#subtitle-search-status'),offsetInput=find('#subtitle-offset');
  find('#prefer-arabic').checked=preferArabic;
  const listen=(target,event,fn)=>{target?.addEventListener(event,fn);listeners.push(()=>target?.removeEventListener(event,fn));};
  const option=(select,value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);};
  const nativeSubs=()=>Array.from(video.textTracks||[]).filter(t=>['subtitles','captions'].includes(t.kind)&&t!==external?.track);
  function audioTracks(){return hls?hls.audioTracks:Array.from(video.audioTracks||[]);}
  function refreshAudio(){
    if(!alive)return;
    const tracks=audioTracks(),arabic=tracks.findIndex(isArabic);
    let index=hls?hls.audioTrack:tracks.findIndex(t=>t.enabled);
    if(preferArabic&&!manualAudio&&arabic>=0){index=arabic;if(hls){if(hls.audioTrack!==arabic)hls.audioTrack=arabic;}else tracks.forEach((t,i)=>t.enabled=i===arabic);}
    audioSelect.replaceChildren();
    if(!tracks.length)option(audioSelect,'',arabicAudio(stream)?t('player.arabicAudioNote'):t('sub.defaultAudio'));
    else tracks.forEach((t,i)=>option(audioSelect,String(i),languageName(t)+(t.name&&!isArabic(t)?' · '+t.name:'')));
    audioSelect.disabled=tracks.length<2;if(index>=0)audioSelect.value=String(index);
    find('#audio-status').textContent=arabic>=0?(index===arabic?t('sub.arabicTrackActive'):t('sub.arabicTrackAvailable')) : arabicAudio(stream)?t('sub.sourceArabicAudio'):t('sub.noArabicTrack');
  }
  audioSelect.onchange=()=>{manualAudio=true;const i=Number(audioSelect.value);if(hls)hls.audioTrack=i;else audioTracks().forEach((t,n)=>t.enabled=n===i);refreshAudio();};
  function clearSubtitle(){
    controller?.abort();controller=null;
    if(hls){hls.subtitleTrack=-1;hls.subtitleDisplay=false;}
    Array.from(video.textTracks||[]).forEach(t=>{t.mode='disabled';});
    external?.remove();external=null;if(blob)URL.revokeObjectURL(blob);blob=null;baseCues=[];offsetInput.disabled=true;
  }
  function timing(){
    for(const {cue,start,end} of baseCues){cue.startTime=Math.max(0,start+offset);cue.endTime=Math.max(.001,end+offset);}
  }
  offsetInput.oninput=()=>{offset=Math.max(-600,Math.min(600,Number(offsetInput.value)||0));timing();};
  function rebuild(){
    if(!alive)return;
    const embedded=hls?hls.subtitleTracks.map((t,i)=>({...t,key:'hls:'+i,kind:'hls',index:i})):nativeSubs().map((t,i)=>({language:t.language,label:t.label,key:'native:'+i,kind:'native',track:t}));
    const seen=new Set();
    const network=rankSubtitles([...(Array.isArray(stream.subtitles)?stream.subtitles:[]),...remote].filter(s=>safeURL(s?.url)&&!seen.has(s.url)&&seen.add(s.url)),stream).map(s=>({...s,key:s.url,kind:'remote'}));
    choices=[...embedded,...network];
    subSelect.replaceChildren();option(subSelect,'',t('sub.none'));
    choices.forEach((s,i)=>option(subSelect,s.key,languageName(s)+' · '+(s.kind==='remote'?(s.subtitleFileName||s.movieReleaseName||s.provider||t('sub.external')):t('sub.embedded'))+' · '+(i+1)));
    if(selection==='local')option(subSelect,'local',t('lang.arabic')+' · '+t('sub.fileFromDevice'));
    subSelect.value=selection;
    if(preferArabic&&!manualSubtitle&&!selection){
      const first=choices.find(c=>isArabic(c)&&!autoTried.has(c.key));
      if(first){autoTried.add(first.key);void choose(first.key);return;}
    }
    if(!selection&&remoteFinished)message.textContent=choices.some(isArabic)?t('sub.pickArabicVersion'):t('sub.noArabicSubtitle');
  }
  async function readRemote(url,signal){
    const response=await fetch(url,{signal,credentials:'omit'});if(!response.ok)throw Error(t('sub.downloadFailed'));
    const reader=response.body.getReader(),chunks=[];let size=0;
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000){await reader.cancel();throw Error(t('sub.tooLarge'));}chunks.push(value);}
    const bytes=new Uint8Array(size);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.length;}return toVtt(decodeSubtitle(bytes));
  }
  function attachText(text,sub,current){
    return new Promise((resolve,reject)=>{
      const track=document.createElement('track');external=track;
      track.kind='subtitles';track.label=languageName(sub);track.srclang=isArabic(sub)?'ar':sub.lang||sub.language||'und';track.default=true;
      blob=URL.createObjectURL(new Blob([text],{type:'text/vtt'}));track.src=blob;
      const timer=setTimeout(()=>reject(Error(t('sub.readTimeout'))),8000);
      track.onload=()=>{clearTimeout(timer);if(!alive||current!==attempt)return resolve();
        baseCues=Array.from(track.track.cues||[]).map(cue=>({cue,start:cue.startTime,end:cue.endTime}));
        if(!baseCues.length)return reject(Error(t('sub.noValidCues')));
        offsetInput.disabled=false;timing();track.track.mode='showing';resolve();
      };
      track.onerror=()=>{clearTimeout(timer);reject(Error(t('sub.readFailed')));};
      video.append(track);track.track.mode='showing';
    });
  }
  async function choose(key,localText){
    const current=++attempt;clearSubtitle();selection=key;subSelect.value=key;
    if(!key){message.textContent=t('sub.disabled');return;}
    const sub=key==='local'?{lang:'ar',kind:'local'}:choices.find(c=>c.key===key);if(!sub)return;
    message.textContent=t('sub.preparing');
    try{
      if(sub.kind==='hls'){hls.subtitleDisplay=true;hls.subtitleTrack=sub.index;message.textContent=t('sub.selectedFromVideo',{name:languageName(sub)});return;}
      if(sub.kind==='native'){sub.track.mode='showing';message.textContent=t('sub.selectedFromVideo',{name:languageName(sub)});return;}
      controller=new AbortController();const timer=setTimeout(()=>controller?.abort(),10000);
      let text;
      try{text=localText||await readRemote(sub.url,controller.signal);}finally{clearTimeout(timer);}
      if(!alive||current!==attempt)return;
      await attachText(text,sub,current);if(!alive||current!==attempt)return;
      message.textContent=isArabic(sub)?t('sub.arabicActive'):t('sub.activated');
    }catch(error){
      if(!alive||current!==attempt)return;
      clearSubtitle();selection='';subSelect.value='';
      const next=!manualSubtitle&&preferArabic&&choices.find(c=>isArabic(c)&&!autoTried.has(c.key));
      if(next&&autoTried.size<3){autoTried.add(next.key);void choose(next.key);return;}
      message.textContent=t('sub.tryAnother',{error:error.name==='AbortError'?t('sub.loadTimeout'):error.message});
    }
  }
  subSelect.onchange=()=>{manualSubtitle=true;void choose(subSelect.value);};
  async function searchSubtitles(force=false){
    const current=++search;searchMessage.textContent=t('sub.searchingArabic');find('#subtitle-retry').disabled=true;
    try{
      const result=await fetchSubtitles(force);if(!alive||current!==search)return;
      remote=result.subtitles;failed=result.failed;
      searchMessage.textContent=failed?t('sub.addonsFailed'):!result.addons?t('sub.enableAddon'):'';
    }catch{if(!alive||current!==search)return;failed=1;searchMessage.textContent=t('sub.searchFailed');}
    finally{if(alive&&current===search){remoteFinished=true;find('#subtitle-retry').disabled=false;rebuild();}}
  }
  find('#subtitle-retry').onclick=()=>{autoTried.clear();manualSubtitle=false;if(!selection)message.textContent=t('sub.retrying');void searchSubtitles(true);};
  find('#prefer-arabic').onchange=e=>{preferArabic=e.target.checked;write('prefer-arabic',preferArabic);if(preferArabic){manualAudio=false;manualSubtitle=false;autoTried.clear();if(selection!=='local'){attempt++;clearSubtitle();selection='';}refreshAudio();rebuild();}};
  find('#subtitle-file').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;manualSubtitle=true;
    const uploadAttempt=++attempt;
    try{if(file.size>2_000_000)throw Error(t('sub.fileTooLarge'));const text=toVtt(decodeSubtitle(new Uint8Array(await file.arrayBuffer())));if(!alive||uploadAttempt!==attempt)return;selection='local';rebuild();await choose('local',text);}
    catch(error){if(alive&&uploadAttempt===attempt)message.textContent=error.message;}
    e.target.value='';
  };
  listen(video,'loadedmetadata',()=>{refreshAudio();rebuild();});
  listen(video.textTracks,'addtrack',()=>{if(!hls)rebuild();});
  listen(video.audioTracks,'addtrack',refreshAudio);
  listen(video.audioTracks,'change',refreshAudio);
  refreshAudio();rebuild();void searchSubtitles();
  return {
    attachHls(instance,Hls){
      hls=instance;
      for(const [event,fn] of [[Hls.Events.AUDIO_TRACKS_UPDATED,refreshAudio],[Hls.Events.AUDIO_TRACK_SWITCHED,refreshAudio],[Hls.Events.SUBTITLE_TRACKS_UPDATED,rebuild]]){hls.on(event,fn);hlsListeners.push(()=>instance.off(event,fn));}
      const onSubtitleError=(_,data)=>{if(data.details?.toLowerCase().includes('subtitle')&&selection.startsWith('hls:'))message.textContent=t('sub.hlsSubtitleFailed');};
      hls.on(Hls.Events.ERROR,onSubtitleError);hlsListeners.push(()=>instance.off(Hls.Events.ERROR,onSubtitleError));
      refreshAudio();rebuild();
    },
    dispose(){alive=false;attempt++;search++;clearSubtitle();listeners.forEach(off=>off());hlsListeners.forEach(off=>off());}
  };
}
