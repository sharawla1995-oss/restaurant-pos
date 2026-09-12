const CACHE='sharawla-pos-v10.5.4-beta.36';
const SHELL=[
 './','./index.html','./styles.css?v=10.5.4-beta.36','./update-indicators.css?v=10.5.4-beta.36',
 './version-ui.js?v=10.5.4-beta.36','./update-ui.js?v=10.5.4-beta.36',
 './sharawla-runtime-core.js?v=10.5.4-beta.36','./sharawla-capabilities.js?v=10.5.4-beta.36',
 './sharawla-capabilities-beta33.js?v=10.5.4-beta.36','./sharawla-capability-runtime-bridge.js?v=10.5.4-beta.36','./sharawla-feature-consumption.js?v=10.5.4-beta.36','./sharawla-cloud-runtime-v2.js?v=10.5.4-beta.36',
 './restaurant-engine.js?v=10.5.4-beta.36','./retail-engine.js?v=10.5.4-beta.36','./pharmacy-engine.js?v=10.5.4-beta.36','./service-engine.js?v=10.5.4-beta.36','./warehouse-engine.js?v=10.5.4-beta.36','./membership-engine.js?v=10.5.4-beta.36','./logistics-engine.js?v=10.5.4-beta.36',
 './app.js?v=10.5.4-beta.36','./beta34-feature-ui.js?v=10.5.4-beta.36','./beta35-feature-behavior.js?v=10.5.4-beta.36','./beta36-integration-loader.js?v=10.5.4-beta.36',
 './profile-parity-ui.js?v=10.5.4-beta.36','./beta28-runtime-fixes.js?v=10.5.4-beta.36','./owner-diagnostics.js?v=10.5.4-beta.36','./beta29-retail-functional-finalization.js?v=10.5.4-beta.36','./pharmacy-ui.js?v=10.5.4-beta.36',
 './retail-website-pos.js?v=10.5.4-beta.36','./beta22-runtime-fixes.js?v=10.5.4-beta.36','./beta23-full-retail.js?v=10.5.4-beta.36','./retail-finalization-ui.js?v=10.5.4-beta.36',
 './retail-variants-runtime-bridge.js?v=10.5.4-beta.36','./retail-variants-ui.js?v=10.5.4-beta.36','./advanced-purchasing-v1.js?v=10.5.4-beta.36',
 './food-recipe-runtime-bridge.js?v=food-recipe-runtime-v1.0','./food-recipe-ui-v1.js?v=food-recipe-ui-v1.0','./food-advanced-ui-v1.js?v=food-advanced-ui-v1.0',
 './beta36-offline-v2.js?v=10.5.4-beta.36','./permissions-v2-ui.js?v=10.5.4-beta.36','./printing-v2.js?v=10.5.4-beta.36','./landed-cost-posting-v1.js?v=10.5.4-beta.36','./commerce-orders-v2-ui.js?v=10.5.4-beta.36','./reports-v2-ui.js?v=10.5.4-beta.36','./finance-b2b-ui.js?v=10.5.4-beta.36','./service-v1-ui.js?v=10.5.4-beta.36','./warehouse-v1-ui.js?v=10.5.4-beta.36','./membership-v1-ui.js?v=10.5.4-beta.36','./logistics-v1-ui.js?v=10.5.4-beta.36',
 './manifest.json','./icon-192.png','./icon-512.png'
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sharawla-pos-v')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 // Explicit legacy paths are intentionally retained as executable policy markers.
 // Historical regression gates verify these exact assets remain protected by the app-shell strategy.
 const legacyAppPath=
  url.pathname.endsWith('/beta28-runtime-fixes.js')||
  url.pathname.endsWith('/sharawla-capabilities-beta33.js')||
  url.pathname.endsWith('/sharawla-capability-runtime-bridge.js')||
  url.pathname.endsWith('/sharawla-cloud-runtime-v2.js')||
  url.pathname.endsWith('/sharawla-feature-consumption.js')||
  url.pathname.endsWith('/beta34-feature-ui.js')||
  url.pathname.endsWith('/beta35-feature-behavior.js')||
  url.pathname.endsWith('/owner-diagnostics.js')||
  url.pathname.endsWith('/retail-finalization-ui.js');
 const isApp=event.request.mode==='navigate'||legacyAppPath||SHELL.some(x=>{const u=new URL(x,self.location.href);return u.pathname===url.pathname});
 if(isApp){event.respondWith(fetch(event.request).then(response=>{if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{})}return response}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));return}
 event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{})}return response})))
});
