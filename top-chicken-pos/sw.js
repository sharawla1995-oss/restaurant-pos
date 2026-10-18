'use strict';
// Scope is /top-chicken-pos/ only. Never delete Top Burger or Windows caches.
const CACHE='tc-pwa-branch22-preview-rc10-20261018-v1';
const SHELL=[
  './index.html','./tc-pwa-boot.js','./manifest.webmanifest',
  '../styles.css?v=10.5.19-rc.10',
  '../sharawla-runtime-core.js?v=10.5.19-rc.10',
  '../restaurant-engine.js?v=10.5.19-rc.10',
  '../food-recipe-ui-v1.js?v=10.5.19-rc.10',
  '../app.js?v=10.5.19-rc.10',
  '../food-recipe-runtime-bridge-v10-5-16.js?v=10.5.19-rc.10',
  '../v10-5-16-restaurant-closure-ui.js?v=10.5.19-rc.10',
  '../inventory-overview-v10-5-16.js?v=10.5.19-rc.10',
  '../food-advanced-ui-v10-5-16.js?v=10.5.19-rc.10',
  '../hr-core-admin-v1.js?v=10.5.19-rc.10',
  '../hr-attendance-admin-v1.js?v=10.5.19-rc.10',
  '../v10-5-14-ops-hr-summary.js?v=10.5.19-rc.10',
  '../icon-192.png','../icon-512.png'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys
    .filter(key=>key.startsWith('tc-pwa-branch22-')&&key!==CACHE)
    .map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  // Never cache Supabase/Cloud requests, credentials, POST or financial data.
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const shellOrigin=new URL(self.registration.scope).origin;
  if(url.origin!==shellOrigin)return;
  const isNavigation=event.request.mode==='navigate';
  const shellResource=SHELL.some(item=>new URL(item,self.registration.scope).href===url.href);
  if(!isNavigation&&!shellResource)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));
    }
    return response;
  }).catch(()=>caches.match(event.request).then(hit=>hit||
    (isNavigation?caches.match(new URL('./index.html',self.registration.scope)):Response.error()))));
});
