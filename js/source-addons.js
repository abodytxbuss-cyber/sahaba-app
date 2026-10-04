import {read,write,getAddons,saveAddons} from './store.js';

export const PUBLIC_DOMAIN_MOVIES_ADDON={
  url:'https://caching.stremio.net/publicdomainmovies.now.sh/manifest.json',
  enabled:true,
  manifest:{
    id:'com.linvo.publicdomainmovies',
    version:'1.0.0',
    name:'Public Domain Movies',
    description:'أفلام مجانية من الملكية العامة عبر إضافة Stremio الرسمية.',
    resources:['catalog','stream'],
    types:['movie'],
    catalogs:[{type:'movie',id:'publicdomainmovies',name:'Public Domain Movies',extra:[{name:'skip'},{name:'search'}]}],
    idPrefixes:['tt'],
  },
};

export function initializeLegalStreams(){
  if(read('legal-streams-v1',false))return;
  const addons=getAddons();
  if(!addons.some(a=>a.manifest.id===PUBLIC_DOMAIN_MOVIES_ADDON.manifest.id))addons.push(PUBLIC_DOMAIN_MOVIES_ADDON);
  if(saveAddons(addons))write('legal-streams-v1',true);
}
