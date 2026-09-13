const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('topBurgerDesktop',{
 isDesktop:true,
 db:{get:k=>ipcRenderer.invoke('db:get',k),set:(k,v)=>ipcRenderer.invoke('db:set',k,v)},
 operations:{put:o=>ipcRenderer.invoke('ops:put',o),list:s=>ipcRenderer.invoke('ops:list',s),status:(id,s,e)=>ipcRenderer.invoke('ops:status',id,s,e)},
 offlineV2:{
  commitOperation:o=>ipcRenderer.invoke('offline-v2:commit-operation',o),
  importShadow:s=>ipcRenderer.invoke('offline-v2:import-shadow',s),
  outbox:s=>ipcRenderer.invoke('offline-v2:outbox',s??null),
  event:tx=>ipcRenderer.invoke('offline-v2:event',tx),
  record:(t,id)=>ipcRenderer.invoke('offline-v2:record',t,id),
  health:()=>ipcRenderer.invoke('offline-v2:health'),
  syncStats:()=>ipcRenderer.invoke('offline-v2:sync-stats'),
  inventoryLedger:x=>ipcRenderer.invoke('offline-v2:inventory-ledger',x||{}),
  inventoryProjection:x=>ipcRenderer.invoke('offline-v2:inventory-projection',x||{}),
  inventoryStats:x=>ipcRenderer.invoke('offline-v2:inventory-stats',x||{}),
  inboxReceive:e=>ipcRenderer.invoke('offline-v2:inbox-receive',e),
  inboxApply:id=>ipcRenderer.invoke('offline-v2:inbox-apply',id),
  inboxError:(id,e)=>ipcRenderer.invoke('offline-v2:inbox-error',id,e),
  inboxList:(s,l)=>ipcRenderer.invoke('offline-v2:inbox-list',s??null,l??200),
  inboxStats:()=>ipcRenderer.invoke('offline-v2:inbox-stats'),
  orderEvents:(id,l)=>ipcRenderer.invoke('offline-v2:order-events',id??null,l??200),
  orderProjection:id=>ipcRenderer.invoke('offline-v2:order-projection',id),
  customerProjection:x=>ipcRenderer.invoke('offline-v2:customer-projection',x||{}),
  customerAddresses:id=>ipcRenderer.invoke('offline-v2:customer-addresses',id),
  guardState:()=>ipcRenderer.invoke('offline-v2:guard-state'),
  guardAssert:x=>ipcRenderer.invoke('offline-v2:guard-assert',x||{}),
  authEnroll:x=>ipcRenderer.invoke('offline-v2:auth-enroll',x||{}),
  authVerify:x=>ipcRenderer.invoke('offline-v2:auth-verify',x||{}),
  authState:x=>ipcRenderer.invoke('offline-v2:auth-state',x||{}),
  authClear:()=>ipcRenderer.invoke('offline-v2:auth-clear'),
  backupCreate:x=>ipcRenderer.invoke('offline-v2:backup-create',x||{}),
  recoveryState:()=>ipcRenderer.invoke('offline-v2:recovery-state'),
  startupReport:()=>ipcRenderer.invoke('offline-v2:startup-report'),
  localReport:x=>ipcRenderer.invoke('offline-v2:local-report',x||{}),
  syncNow:x=>ipcRenderer.invoke('offline-v2:sync-now',x),
  manualRetry:x=>ipcRenderer.invoke('offline-v2:manual-retry',x),
  transportAttest:x=>ipcRenderer.invoke('offline-v2:transport-attest',x),
  takeoverState:()=>ipcRenderer.invoke('offline-v2:takeover-state'),
  takeoverArm:x=>ipcRenderer.invoke('offline-v2:takeover-arm',x),
  takeoverPrepare:x=>ipcRenderer.invoke('offline-v2:takeover-prepare',x),
  takeoverActivate:x=>ipcRenderer.invoke('offline-v2:takeover-activate',x),
  takeoverDeactivate:x=>ipcRenderer.invoke('offline-v2:takeover-deactivate',x)
 },
 backup:{create:r=>ipcRenderer.invoke('backup:create',r),saveJson:(j,r)=>ipcRenderer.invoke('backup:saveJson',j,r),list:()=>ipcRenderer.invoke('backup:list')},
 print:{list:()=>ipcRenderer.invoke('print:list'),current:o=>ipcRenderer.invoke('print:current',o),html:(h,o)=>ipcRenderer.invoke('print:html',h,o)},
 app:{info:()=>ipcRenderer.invoke('app:info')},
 update:{check:()=>ipcRenderer.invoke('update:check'),info:()=>ipcRenderer.invoke('update:info'),safety:()=>ipcRenderer.invoke('update:safety'),safetyV2:async()=>{const [legacy,offlineV2]=await Promise.all([ipcRenderer.invoke('update:safety'),ipcRenderer.invoke('offline-v2:guard-state').catch(e=>({ok:false,clear:false,error:e.message}))]);return {...legacy,offlineV2}},health:r=>ipcRenderer.invoke('update:health',r),rollback:()=>ipcRenderer.invoke('update:rollback'),setChannel:c=>ipcRenderer.invoke('update:setChannel',c),onProgress:cb=>{const fn=(_e,data)=>{try{cb(data)}catch{}};ipcRenderer.on('update:progress',fn);return()=>ipcRenderer.removeListener('update:progress',fn)}},
 paths:()=>ipcRenderer.invoke('desktop:paths'),
 device:{info:()=>ipcRenderer.invoke('device:info')},
 external:{open:url=>ipcRenderer.invoke('external:open',url)},
 acceptance:{
  networkSet:x=>ipcRenderer.invoke('acceptance:network-set',x||{}),
  networkState:()=>ipcRenderer.invoke('acceptance:network-state'),
  networkDisable:r=>ipcRenderer.invoke('acceptance:network-disable',r||'renderer'),
  restart:x=>ipcRenderer.invoke('acceptance:restart',x||{}),
  sqliteCompatibility:()=>ipcRenderer.invoke('acceptance:sqlite-compatibility'),
  crashMarker:()=>ipcRenderer.invoke('acceptance:crash-marker'),
  crashMarkerClear:()=>ipcRenderer.invoke('acceptance:crash-marker-clear'),
  crashRestart:x=>ipcRenderer.invoke('acceptance:crash-restart',x||{}),
  backupRestoreProbe:()=>ipcRenderer.invoke('acceptance:backup-restore-probe'),
  corruptionProbe:()=>ipcRenderer.invoke('acceptance:corruption-probe'),
  clockSequenceProbe:()=>ipcRenderer.invoke('acceptance:clock-sequence-probe'),
  tempRestoreCycle:()=>ipcRenderer.invoke('acceptance:temp-restore-cycle')
 },
 licenseState:{get:()=>ipcRenderer.invoke('license-state:get'),set:v=>ipcRenderer.invoke('license-state:set',v),clear:()=>ipcRenderer.invoke('license-state:clear')}
});

window.addEventListener('DOMContentLoaded',()=>{
 ipcRenderer.invoke('app:info').then(info=>{const el=document.getElementById('appVersionBadge')||document.querySelector('.version-badge');if(el){el.textContent=`V${info.version} • ${String(info.channel||'stable').toUpperCase()}`;el.title=`Sharawla POS ${info.version} — ${info.channel}`}}).catch(()=>{});
 // Beta45: a visible pending badge must always own its physical pointer hit.
 // This is injected from preload so stale stylesheet cache-busters cannot leave
 // the badge visually present but pointer-events:none behind form labels.
 if(!document.getElementById('beta45PendingSyncClickGuard')){
  const st=document.createElement('style');st.id='beta45PendingSyncClickGuard';
  st.textContent='.pending-sync-badge.has-pending{z-index:2147483000!important;pointer-events:auto!important;opacity:1!important;transform:none!important;isolation:isolate!important}.ov2-sync-modal{width:min(760px,100%)!important}.ov2-sync-list{display:grid;gap:10px}.ov2-sync-card{border:1px solid #d8dee8;border-radius:12px;padding:11px;display:grid;gap:7px;white-space:normal}.ov2-sync-card.legacy{border-style:dashed}.ov2-sync-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.ov2-sync-head span{font-size:12px;font-weight:800}.ov2-sync-error{white-space:normal;overflow-wrap:anywhere;background:#f8fafc;border-radius:8px;padding:8px}';
  document.head.appendChild(st);
 }
 // Run after the page's DOMContentLoaded installers (Beta43 + V2 foundation),
 // so takeover wrappers always capture the protected legacy runtime as fallback.
 setTimeout(()=>{
  if(document.querySelector('script[data-offline-v2-phase4]'))return;
  const s=document.createElement('script');s.src='beta45-offline-v2-runtime-takeover.js?v=10.5.4-beta.45-dev';s.dataset.offlineV2Phase4='1';
  s.onload=()=>{
   if(document.querySelector('script[data-offline-v2-phase6-inventory]'))return;
   const i=document.createElement('script');i.src='beta45-offline-v2-inventory-runtime.js?v=10.5.4-beta.45-dev';i.dataset.offlineV2Phase6Inventory='1';
   i.onload=()=>{
    if(document.querySelector('script[data-offline-v2-phase5]'))return;
    const t=document.createElement('script');t.src='beta45-offline-v2-transport-runtime.js?v=10.5.4-beta.45-dev';t.dataset.offlineV2Phase5='1';
    t.onload=()=>{
     if(document.querySelector('script[data-offline-v2-phase7-inbox]'))return;
     const n=document.createElement('script');n.src='beta45-offline-v2-inbox-runtime.js?v=10.5.4-beta.45-dev';n.dataset.offlineV2Phase7Inbox='1';
     n.onload=()=>{
      if(document.querySelector('script[data-offline-v2-phase8-safety]'))return;
      const g=document.createElement('script');g.src='beta45-offline-v2-safety-runtime.js?v=10.5.4-beta.45-dev';g.dataset.offlineV2Phase8Safety='1';
      g.onload=()=>{
       if(document.querySelector('script[data-offline-v2-diagnostics]'))return;
       const d=document.createElement('script');d.src='beta45-offline-v2-diagnostics.js?v=10.5.4-beta.45-dev';d.dataset.offlineV2Diagnostics='1';document.body.appendChild(d);
      };
      document.body.appendChild(g);
     };
     document.body.appendChild(n);
    };
    document.body.appendChild(t);
   };
   document.body.appendChild(i);
  };
  document.body.appendChild(s);
 },0);
});