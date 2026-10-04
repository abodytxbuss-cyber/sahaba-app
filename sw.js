const CACHE='sahaba-shell-v4.1.1';
const shell=['./','index.html','style.css','app.js','js/api.js','js/stream-core.js','js/store.js','js/ui.js','js/player.js','js/languages.js','js/player-languages.js','js/subtitle-addon.js','js/source-addons.js','js/catalog-rules.js','js/collections.js','data/movies.json','data/ar-titles.json','data/ar-descriptions.json','data/catalogs.json','data/posters.json','data/collections.json','data/journey.json','assets/cloud.svg','assets/poster.svg','assets/fonts.css',...Array.from({length:7},(_,i)=>'assets/font-'+i+'.woff2')];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(shell)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sahaba-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/api/')||url.pathname.endsWith('/health'))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(async()=>{
    const hit=await caches.match(event.request);if(hit)return hit;
    if(event.request.destination==='image')return caches.match(new URL('assets/poster.svg',self.registration.scope));
    if(event.request.mode==='navigate')return caches.match(new URL('index.html',self.registration.scope));
    return new Response('تعذّر الاتصال',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }));
});
