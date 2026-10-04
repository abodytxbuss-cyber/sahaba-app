import {read,write,getAddons,saveAddons} from './store.js';

export const PUBLIC_DOMAIN_MOVIES_ADDON={
  url:'https://caching.stremio.net/publicdomainmovies.now.sh/manifest.json',
  enabled:true,
  manifest:{
    id:'org.stremio.pubdomainmovies',
    version:'1.0.0',
    name:'Public Domain Movies',
    description:'أفلام مجانية من الملكية العامة عبر إضافة Stremio الرسمية.',
    resources:['catalog','stream'],
    types:['movie'],
    catalogs:[{type:'movie',id:'publicdomainmovies',name:'Public Domain Movies',extra:[{name:'skip'},{name:'search'}]}],
    idPrefixes:['tt'],
  },
};

export const WATCHHUB_ADDON={
  url:'https://watchhub.strem.io/manifest.json',
  enabled:true,
  manifest:{
    id:'org.stremio.watchhub',
    version:'1.0.0',
    name:'WatchHub',
    description:'أماكن مشاهدة رسمية وروابط مزوّدين قانونيين عندما تكون متاحة في بلدك.',
    resources:['stream'],
    types:['movie','series'],
    catalogs:[],
    idPrefixes:['tt'],
  },
};

export const STREAMING_CATALOGS_ADDON={
  url:'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/manifest.json',
  enabled:true,
  manifest:{
    id:'pw.ers.netflix-catalog',
    version:'1.0.0',
    name:'Streaming Catalogs',
    description:'كتالوجات Netflix وHBO Max وDisney+ وApple TV+ وغيرها. هذه كتالوجات فقط وليست مصادر تشغيل.',
    resources:['catalog'],
    types:['movie','series'],
    catalogs:[
      {id:'nfx',type:'movie',name:'Netflix'},
      {id:'nfx',type:'series',name:'Netflix'},
      {id:'hbm',type:'movie',name:'HBO Max'},
      {id:'hbm',type:'series',name:'HBO Max'},
      {id:'dnp',type:'movie',name:'Disney+'},
      {id:'dnp',type:'series',name:'Disney+'},
      {id:'atp',type:'movie',name:'Apple TV+'},
      {id:'atp',type:'series',name:'Apple TV+'},
    ],
  },
};

export function initializeLegalStreams(){
  if(read('legal-streams-v3',false))return;
  const addons=getAddons();
  for(const addon of [WATCHHUB_ADDON,PUBLIC_DOMAIN_MOVIES_ADDON,STREAMING_CATALOGS_ADDON]){
    const existing=addons.findIndex(a=>a.manifest.id===addon.manifest.id||a.url===addon.url);
    if(existing>=0)addons[existing]={...addon,enabled:addons[existing].enabled!==false};
    else addons.push(addon);
  }
  if(saveAddons(addons))write('legal-streams-v3',true);
}
