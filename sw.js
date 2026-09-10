const CACHE='sharawla-pos-v10.5.4-beta.14';
const SHELL=['./','./index.html','./styles.css?v=10.5.4-beta.14','./update-indicators.css?v=10.5.4-beta.14','./sharawla-runtime-core.js?v=10.5.4-beta.14','./restaurant-engine.js?v=10.5.4-beta.14','./retail-engine.js?v=10.5.4-beta.14','./version-ui.js?v=10.5.4-beta.14','./update-ui.js?v=10.5.4-beta.14','./app.js?v=10.5.4-beta.14','./manifest.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const isApp=url.pathname.endsWith('/')||url.pathname.endsWith('/index.html')||url.pathname.endsWith('/app.js')||url.pathname.endsWith('/sharawla-runtime-core.js')||url.pathname.endsWith('/restaurant-engine.js')||url.pathname.endsWith('/retail-engine.js')||url.pathname.endsWith('/styles.css')||url.pathname.endsWith('/update-indicators.css')||url.pathname.endsWith('/version-ui.js')||url.pathname.endsWith('/update-ui.js')||event.request.mode==='navigate';
  if(isApp){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response})));
});
