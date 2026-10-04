import {appDict} from './i18n.app.js';
import {playerDict} from './i18n.player.js';

// تبديل اللغة بين العربية والإنجليزية لجميع نصوص الواجهة.
// المفاتيح نقطية مثل home.hero؛ كل مدخل {ar, en}. النص العربي يطابق النص الأصلي حرفياً.
const coreDict={
  'lang.toggle':{ar:'تبديل اللغة',en:'Switch language'},
  'lang.arabic':{ar:'العربية',en:'Arabic'},
  'lang.english':{ar:'الإنجليزية',en:'English'},
  'lang.unspecified':{ar:'لغة غير محددة',en:'Unspecified language'},
  'retry':{ar:'إعادة المحاولة',en:'Retry'},
  'loading':{ar:'جارٍ التحميل…',en:'Loading…'},
  'noTitle':{ar:'عنوان غير متاح',en:'Title unavailable'},
  'brand.name':{ar:'سحابة',en:'Sahaba'},
  'movie':{ar:'فيلم',en:'Movie'},
  'seriesLabel':{ar:'مسلسل',en:'Series'},
  'untitled':{ar:'بدون عنوان',en:'Untitled'},
  'html.skip':{ar:'انتقل إلى المحتوى',en:'Skip to content'},
  'html.brandHome':{ar:'سحابة، الرئيسية',en:'Sahaba home'},
  'html.tagline':{ar:'لِكُلّ حكايةٍ سماء',en:'A sky for every story'},
  'html.mainNav':{ar:'التنقل الرئيسي',en:'Main navigation'},
  'html.xp':{ar:'نقاط الخبرة والإنجازات',en:'Experience points and achievements'},
  'html.offline':{ar:'أنت غير متصل. محتواك المحفوظ ما زال هنا.',en:'You are offline. Your saved content is still here.'},
  'html.boot':{ar:'تتهيّأ سماؤك…',en:'Your sky is getting ready…'},
  'html.footer':{ar:'حكاية جديدة، نجمة جديدة.',en:'A new story, a new star.'},
  'html.footerLink':{ar:'مصادرك، باختيارك',en:'Your sources, your choice'},
  'html.close':{ar:'إغلاق',en:'Close'},
  'html.noscript':{ar:'فعّل JavaScript لتبدأ رحلتك في سحابة.',en:'Enable JavaScript to start your Sahaba journey.'},
  'nav.home':{ar:'الرئيسية',en:'Home'},
  'nav.journey':{ar:'رحلتي',en:'My Journey'},
  'nav.search':{ar:'اكتشف',en:'Discover'},
  'nav.library':{ar:'مكتبتي',en:'My Library'},
  'nav.addons':{ar:'إضافاتي',en:'My Addons'},
  'quick.aria':{ar:'اقتراحات وبحث سريع',en:'Quick suggestions and search'},
  'quick.button':{ar:'اقتراحات',en:'Explore'},
  'quick.title':{ar:'ماذا تشاهد الآن؟',en:'What should we watch?'},
  'quick.subtitle':{ar:'ابحث أو اختر اقتراحاً سريعاً',en:'Search or pick a quick suggestion'},
  'quick.placeholder':{ar:'اسم فيلم أو مسلسل…',en:'Movie or series name…'},
  'quick.search':{ar:'بحث',en:'Search'},
  'quick.featured':{ar:'إصدارات سحابة',en:'Sahaba Releases'},
  'quick.popular':{ar:'الأكثر رواجاً',en:'Trending'},
  'quick.series':{ar:'مسلسلات',en:'Series'},
  'quick.journey':{ar:'رحلتي',en:'My Journey'},
  'quick.addons':{ar:'مصادر المشاهدة',en:'Watch Sources'},
};

const entries={...appDict,...playerDict,...coreDict};
let lang='ar';

const loadLang=()=>{try{const value=localStorage.getItem('sahaba:lang');return value&&JSON.parse(value)==='en'?'en':'ar';}catch{return 'ar';}};
const saveLang=value=>{try{localStorage.setItem('sahaba:lang',JSON.stringify(value));}catch{}};

export const getLang=()=>lang;
export const isEN=()=>lang==='en';
export const tr=(ar,en)=>lang==='en'?(en||ar):ar;

export function t(key,vars){
  const entry=entries[key];
  if(!entry)return key;
  let text=entry[lang]||entry.ar||key;
  if(vars)for(const name in vars)text=text.split('{'+name+'}').join(String(vars[name]));
  return text;
}

function syncToggle(){
  if(typeof document==='undefined')return;
  const button=document.getElementById('lang-toggle');
  if(button)button.textContent=lang==='ar'?'EN':'عربي';
}

export function applyStatic(root){
  const scope=root||(typeof document!=='undefined'?document:null);
  if(!scope||!scope.querySelectorAll)return;
  scope.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
  scope.querySelectorAll('[data-i18n-label]').forEach(el=>{el.setAttribute('aria-label',t(el.dataset.i18nLabel));});
  scope.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{el.setAttribute('placeholder',t(el.dataset.i18nPlaceholder));});
  syncToggle();
}

function applyDocument(){
  if(typeof document==='undefined')return;
  const html=document.documentElement;
  html.lang=lang;
  html.dir=lang==='ar'?'rtl':'ltr';
}

export function setLang(next){
  lang=next==='en'?'en':'ar';
  saveLang(lang);
  applyDocument();
  applyStatic(document);
  document.dispatchEvent(new CustomEvent('sahaba:lang',{detail:{lang}}));
}

export function initLang(){
  lang=loadLang();
  applyDocument();
  applyStatic(document);
  const button=document.getElementById('lang-toggle');
  if(button&&!button.dataset.bound){
    button.dataset.bound='1';
    button.addEventListener('click',()=>setLang(lang==='ar'?'en':'ar'));
  }
}
