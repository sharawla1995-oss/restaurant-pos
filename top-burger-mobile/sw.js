const CACHE='top-burger-mobile-10.5.16-full-5';
const SHELL=[
  './','./index.html','./manifest.json','./icon-192.png','./icon-512.png',
  './styles.css?v=topburger-10.5.16.2',
  './sharawla-runtime-core.js?v=topburger-10.5.16.2',
  './restaurant-engine.js?v=topburger-10.5.16.3',
  './food-recipe-ui-v1.js?v=topburger-10.5.16.2',
  './food-recipe-runtime-bridge-v10-5-16.js?v=topburger-10.5.16.2',
  './inventory-overview-v10-5-16.js?v=topburger-10.5.16.2',
  './food-advanced-ui-v10-5-16.js?v=topburger-10.5.16.2',
  './v10-5-16-restaurant-closure-ui.js?v=topburger-10.5.16.5',
  './app.js?v=topburger-10.5.16.5',
  './hr-core-admin-v1.js?v=topburger-10.5.16.2',
  './hr-attendance-admin-v1.js?v=topburger-10.5.16.2',
  './v10-5-14-ops-hr-summary.js?v=topburger-10.5.16.2'
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('top-burger-mobile-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const shellAsset=event.request.mode==='navigate'||[
    '/index.html','/app.js','/styles.css','/sharawla-runtime-core.js','/restaurant-engine.js',
    '/food-recipe-ui-v1.js','/hr-core-admin-v1.js','/hr-attendance-admin-v1.js','/v10-5-14-ops-hr-summary.js'
  ].some(s=>url.pathname.endsWith(s));
  if(shellAsset){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});return response})
      .catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});return response})));
});
