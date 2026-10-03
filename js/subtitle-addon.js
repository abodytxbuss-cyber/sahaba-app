import {read,write,getAddons,saveAddons} from './store.js';
export const ARABIC_SUBTITLE_ADDON={url:'https://opensubtitles-v3.strem.io/manifest.json',enabled:true,manifest:{id:'org.stremio.opensubtitlesv3',version:'1.0.0',name:'OpenSubtitles v3',description:'ترجمات الأفلام والمسلسلات؛ تُختار العربية تلقائياً عند توفرها.',catalogs:[],resources:['subtitles'],types:['movie','series'],idPrefixes:['tt']}};
// إعداد لمرة واحدة؛ نحترم حذف المستخدم للإضافة أو تعطيلها لاحقاً.
export function initializeArabicSubtitles(){
  if(read('arabic-subtitles-v1',false))return;
  const addons=getAddons();
  if(!addons.some(a=>a.manifest.id===ARABIC_SUBTITLE_ADDON.manifest.id))addons.push(ARABIC_SUBTITLE_ADDON);
  if(saveAddons(addons))write('arabic-subtitles-v1',true);
}
