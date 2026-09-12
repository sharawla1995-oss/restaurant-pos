const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('topBurgerDesktop',{
 isDesktop:true,
 db:{get:k=>ipcRenderer.invoke('db:get',k),set:(k,v)=>ipcRenderer.invoke('db:set',k,v)},
 operations:{put:o=>ipcRenderer.invoke('ops:put',o),list:s=>ipcRenderer.invoke('ops:list',s),status:(id,s,e)=>ipcRenderer.invoke('ops:status',id,s,e)},
 offlineV2:{
  commitOperation:o=>ipcRenderer.invoke('offline-v2:commit-operation',o),
  importShadow:s=>ipcRenderer.invoke('offline-v2:import-shadow',s),
  outbox:s=>ipcRenderer.invoke('offline-v2:outbox',s??null),
  record:(t,id)=>ipcRenderer.invoke('offline-v2:record',t,id),
  health:()=>ipcRenderer.invoke('offline-v2:health'),
  syncStats:()=>ipcRenderer.invoke('offline-v2:sync-stats'),
  takeoverState:()=>ipcRenderer.invoke('offline-v2:takeover-state'),
  takeoverArm:x=>ipcRenderer.invoke('offline-v2:takeover-arm',x),
  takeoverPrepare:x=>ipcRenderer.invoke('offline-v2:takeover-prepare',x),
  takeoverActivate:x=>ipcRenderer.invoke('offline-v2:takeover-activate',x),
  takeoverDeactivate:x=>ipcRenderer.invoke('offline-v2:takeover-deactivate',x)
 },
 backup:{create:r=>ipcRenderer.invoke('backup:create',r),saveJson:(j,r)=>ipcRenderer.invoke('backup:saveJson',j,r),list:()=>ipcRenderer.invoke('backup:list')},
 print:{list:()=>ipcRenderer.invoke('print:list'),current:o=>ipcRenderer.invoke('print:current',o),html:(h,o)=>ipcRenderer.invoke('print:html',h,o)},
 app:{info:()=>ipcRenderer.invoke('app:info')},
 update:{check:()=>ipcRenderer.invoke('update:check'),info:()=>ipcRenderer.invoke('update:info'),safety:()=>ipcRenderer.invoke('update:safety'),health:r=>ipcRenderer.invoke('update:health',r),rollback:()=>ipcRenderer.invoke('update:rollback'),setChannel:c=>ipcRenderer.invoke('update:setChannel',c),onProgress:cb=>{const fn=(_e,data)=>{try{cb(data)}catch{}};ipcRenderer.on('update:progress',fn);return()=>ipcRenderer.removeListener('update:progress',fn)}},
 paths:()=>ipcRenderer.invoke('desktop:paths'),
 device:{info:()=>ipcRenderer.invoke('device:info')},
 external:{open:url=>ipcRenderer.invoke('external:open',url)},
 licenseState:{get:()=>ipcRenderer.invoke('license-state:get'),set:v=>ipcRenderer.invoke('license-state:set',v),clear:()=>ipcRenderer.invoke('license-state:clear')}
});

window.addEventListener('DOMContentLoaded',()=>{
 ipcRenderer.invoke('app:info').then(info=>{const el=document.getElementById('appVersionBadge')||document.querySelector('.version-badge');if(el){el.textContent=`V${info.version} • ${String(info.channel||'stable').toUpperCase()}`;el.title=`Sharawla POS ${info.version} — ${info.channel}`}}).catch(()=>{});
 // Run after the page's DOMContentLoaded installers (Beta43 + V2 foundation),
 // so takeover wrappers always capture the protected legacy runtime as fallback.
 setTimeout(()=>{
  if(document.querySelector('script[data-offline-v2-phase4]'))return;
  const s=document.createElement('script');s.src='beta45-offline-v2-runtime-takeover.js?v=10.5.4-beta.45-dev';s.dataset.offlineV2Phase4='1';document.body.appendChild(s);
 },0);
});
