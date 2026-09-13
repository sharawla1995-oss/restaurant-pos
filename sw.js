const CACHE='sharawla-pos-v10.5.4-beta.51';
const SHELL=[
 './','./index.html','./styles.css?v=10.5.4-beta.51','./update-indicators.css?v=10.5.4-beta.51',
 './version-ui.js?v=10.5.4-beta.51','./update-ui.js?v=10.5.4-beta.51',
 './sharawla-runtime-core.js?v=10.5.4-beta.51','./sharawla-capabilities.js?v=10.5.4-beta.51',
 './sharawla-capabilities-beta33.js?v=10.5.4-beta.51','./sharawla-capabilities-v3.js?v=10.5.4-beta.51','./sharawla-capability-runtime-bridge.js?v=10.5.4-beta.51','./sharawla-feature-consumption.js?v=10.5.4-beta.51','./sharawla-cloud-runtime-v2.js?v=10.5.4-beta.51','./sharawla-capability-module-registry.js?v=10.5.4-beta.51',
 './restaurant-engine.js?v=10.5.4-beta.51','./retail-engine.js?v=10.5.4-beta.51','./pharmacy-engine.js?v=10.5.4-beta.51','./service-engine.js?v=10.5.4-beta.51','./warehouse-engine.js?v=10.5.4-beta.51','./membership-engine.js?v=10.5.4-beta.51','./logistics-engine.js?v=10.5.4-beta.51',
 './app.js?v=10.5.4-beta.51','./beta34-feature-ui.js?v=10.5.4-beta.51','./beta35-feature-behavior.js?v=10.5.4-beta.51','./beta44-finance-b2b-inject-shim.js?v=10.5.4-beta.51','./beta36-integration-loader.js?v=10.5.4-beta.51',
 './profile-parity-ui.js?v=10.5.4-beta.51','./beta28-runtime-fixes.js?v=10.5.4-beta.51','./owner-diagnostics.js?v=10.5.4-beta.51','./beta29-retail-functional-finalization.js?v=10.5.4-beta.51','./pharmacy-ui.js?v=10.5.4-beta.51','./beta43-offline-core.js?v=10.5.4-beta.51','./beta44-offline-storage-recovery.js?v=10.5.4-beta.51',
 './retail-website-pos.js?v=10.5.4-beta.51','./beta22-runtime-fixes.js?v=10.5.4-beta.51','./beta23-full-retail.js?v=10.5.4-beta.51','./retail-finalization-ui.js?v=10.5.4-beta.51',
 './retail-variants-runtime-bridge.js?v=10.5.4-beta.51','./retail-variants-ui.js?v=10.5.4-beta.51','./retail-variants-startup-hotfix.js?v=10.5.4-beta.51','./advanced-purchasing-runtime-bridge.js?v=10.5.4-beta.51','./advanced-purchasing-v1.js?v=10.5.4-beta.51',
 './food-recipe-runtime-bridge.js?v=10.5.4-beta.51','./food-recipe-ui-v1.js?v=10.5.4-beta.51','./food-advanced-ui-v1.js?v=10.5.4-beta.51',
 './beta36-offline-v2.js?v=10.5.4-beta.51','./permissions-v2-ui.js?v=10.5.4-beta.51','./printing-v2.js?v=10.5.4-beta.51','./landed-cost-posting-v1.js?v=10.5.4-beta.51','./commerce-orders-v2-ui.js?v=10.5.4-beta.51','./reports-v2-ui.js?v=10.5.4-beta.51','./finance-b2b-ui.js?v=10.5.4-beta.51','./service-v1-ui.js?v=10.5.4-beta.51','./warehouse-v1-ui.js?v=10.5.4-beta.51','./membership-v1-ui.js?v=10.5.4-beta.51','./logistics-v1-ui.js?v=10.5.4-beta.51',
 './beta45-offline-v2-foundation.js?v=10.5.4-beta.51',
 './beta-self-test.js?v=10.5.4-beta.51',
 './beta45-offline-v2-runtime-takeover.js?v=10.5.4-beta.51',
 './beta45-offline-v2-inventory-runtime.js?v=10.5.4-beta.51',
 './beta45-offline-v2-transport-runtime.js?v=10.5.4-beta.51',
 './beta45-offline-v2-inbox-runtime.js?v=10.5.4-beta.51',
 './beta45-offline-v2-safety-runtime.js?v=10.5.4-beta.51',
 './beta45-offline-v2-diagnostics.js?v=10.5.4-beta.51',
 './manifest.json','./icon-192.png','./icon-512.png'
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sharawla-pos-v')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 // Explicit runtime policy markers are intentionally retained for regression gates.
 const legacyAppPath=
  url.pathname.endsWith('/beta28-runtime-fixes.js')||
  url.pathname.endsWith('/beta43-offline-core.js')||
  url.pathname.endsWith('/beta44-offline-storage-recovery.js')||
  url.pathname.endsWith('/beta44-finance-b2b-inject-shim.js')||
  url.pathname.endsWith('/sharawla-capabilities-beta33.js')||
  url.pathname.endsWith('/sharawla-capabilities-v3.js')||
  url.pathname.endsWith('/sharawla-capability-runtime-bridge.js')||
  url.pathname.endsWith('/sharawla-cloud-runtime-v2.js')||
  url.pathname.endsWith('/sharawla-feature-consumption.js')||
  url.pathname.endsWith('/sharawla-capability-module-registry.js')||
  url.pathname.endsWith('/beta34-feature-ui.js')||
  url.pathname.endsWith('/beta35-feature-behavior.js')||
  url.pathname.endsWith('/owner-diagnostics.js')||
  url.pathname.endsWith('/retail-finalization-ui.js')||
  url.pathname.endsWith('/retail-variants-startup-hotfix.js');
 const isApp=event.request.mode==='navigate'||legacyAppPath||SHELL.some(x=>{const u=new URL(x,self.location.href);return u.pathname===url.pathname});
 if(isApp){event.respondWith(fetch(event.request).then(response=>{if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{})}return response}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));return}
 event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{if(response&&response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{})}return response})))
});
