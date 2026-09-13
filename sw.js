const CACHE='sharawla-pos-v10.5.4-beta.50';
const SHELL=[
 './','./index.html','./styles.css?v=10.5.4-beta.50','./update-indicators.css?v=10.5.4-beta.50',
 './version-ui.js?v=10.5.4-beta.50','./update-ui.js?v=10.5.4-beta.50',
 './sharawla-runtime-core.js?v=10.5.4-beta.50','./sharawla-capabilities.js?v=10.5.4-beta.50',
 './sharawla-capabilities-beta33.js?v=10.5.4-beta.50','./sharawla-capabilities-v3.js?v=10.5.4-beta.50','./sharawla-capability-runtime-bridge.js?v=10.5.4-beta.50','./sharawla-feature-consumption.js?v=10.5.4-beta.50','./sharawla-cloud-runtime-v2.js?v=10.5.4-beta.50','./sharawla-capability-module-registry.js?v=10.5.4-beta.50',
 './restaurant-engine.js?v=10.5.4-beta.50','./retail-engine.js?v=10.5.4-beta.50','./pharmacy-engine.js?v=10.5.4-beta.50','./service-engine.js?v=10.5.4-beta.50','./warehouse-engine.js?v=10.5.4-beta.50','./membership-engine.js?v=10.5.4-beta.50','./logistics-engine.js?v=10.5.4-beta.50',
 './app.js?v=10.5.4-beta.50','./beta34-feature-ui.js?v=10.5.4-beta.50','./beta35-feature-behavior.js?v=10.5.4-beta.50','./beta44-finance-b2b-inject-shim.js?v=10.5.4-beta.50','./beta36-integration-loader.js?v=10.5.4-beta.50',
 './profile-parity-ui.js?v=10.5.4-beta.50','./beta28-runtime-fixes.js?v=10.5.4-beta.50','./owner-diagnostics.js?v=10.5.4-beta.50','./beta29-retail-functional-finalization.js?v=10.5.4-beta.50','./pharmacy-ui.js?v=10.5.4-beta.50','./beta43-offline-core.js?v=10.5.4-beta.50','./beta44-offline-storage-recovery.js?v=10.5.4-beta.50',
 './retail-website-pos.js?v=10.5.4-beta.50','./beta22-runtime-fixes.js?v=10.5.4-beta.50','./beta23-full-retail.js?v=10.5.4-beta.50','./retail-finalization-ui.js?v=10.5.4-beta.50',
 './retail-variants-runtime-bridge.js?v=10.5.4-beta.50','./retail-variants-ui.js?v=10.5.4-beta.50','./retail-variants-startup-hotfix.js?v=10.5.4-beta.50','./advanced-purchasing-runtime-bridge.js?v=10.5.4-beta.50','./advanced-purchasing-v1.js?v=10.5.4-beta.50',
 './food-recipe-runtime-bridge.js?v=10.5.4-beta.50','./food-recipe-ui-v1.js?v=10.5.4-beta.50','./food-advanced-ui-v1.js?v=10.5.4-beta.50',
 './beta36-offline-v2.js?v=10.5.4-beta.50','./permissions-v2-ui.js?v=10.5.4-beta.50','./printing-v2.js?v=10.5.4-beta.50','./landed-cost-posting-v1.js?v=10.5.4-beta.50','./commerce-orders-v2-ui.js?v=10.5.4-beta.50','./reports-v2-ui.js?v=10.5.4-beta.50','./finance-b2b-ui.js?v=10.5.4-beta.50','./service-v1-ui.js?v=10.5.4-beta.50','./warehouse-v1-ui.js?v=10.5.4-beta.50','./membership-v1-ui.js?v=10.5.4-beta.50','./logistics-v1-ui.js?v=10.5.4-beta.50',
 './beta45-offline-v2-foundation.js?v=10.5.4-beta.50',
 './beta-self-test.js?v=10.5.4-beta.50',
 './beta45-offline-v2-runtime-takeover.js?v=10.5.4-beta.50',
 './beta45-offline-v2-inventory-runtime.js?v=10.5.4-beta.50',
 './beta45-offline-v2-transport-runtime.js?v=10.5.4-beta.50',
 './beta45-offline-v2-inbox-runtime.js?v=10.5.4-beta.50',
 './beta45-offline-v2-safety-runtime.js?v=10.5.4-beta.50',
 './beta45-offline-v2-diagnostics.js?v=10.5.4-beta.50',
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
