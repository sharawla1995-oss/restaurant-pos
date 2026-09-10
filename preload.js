const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('topBurgerDesktop',{
 isDesktop:true,
 db:{get:k=>ipcRenderer.invoke('db:get',k),set:(k,v)=>ipcRenderer.invoke('db:set',k,v)},
 operations:{put:o=>ipcRenderer.invoke('ops:put',o),list:s=>ipcRenderer.invoke('ops:list',s),status:(id,s,e)=>ipcRenderer.invoke('ops:status',id,s,e)},
 backup:{create:r=>ipcRenderer.invoke('backup:create',r),saveJson:(j,r)=>ipcRenderer.invoke('backup:saveJson',j,r),list:()=>ipcRenderer.invoke('backup:list')},
 print:{list:()=>ipcRenderer.invoke('print:list'),current:o=>ipcRenderer.invoke('print:current',o),html:(h,o)=>ipcRenderer.invoke('print:html',h,o)},
 app:{info:()=>ipcRenderer.invoke('app:info')},
 update:{check:()=>ipcRenderer.invoke('update:check'),info:()=>ipcRenderer.invoke('update:info'),setChannel:c=>ipcRenderer.invoke('update:setChannel',c),onProgress:cb=>{const fn=(_e,data)=>{try{cb(data)}catch{}};ipcRenderer.on('update:progress',fn);return()=>ipcRenderer.removeListener('update:progress',fn)}},
 paths:()=>ipcRenderer.invoke('desktop:paths'),
 device:{info:()=>ipcRenderer.invoke('device:info')},
 external:{open:url=>ipcRenderer.invoke('external:open',url)},
 licenseState:{get:()=>ipcRenderer.invoke('license-state:get'),set:v=>ipcRenderer.invoke('license-state:set',v),clear:()=>ipcRenderer.invoke('license-state:clear')}
});

window.addEventListener('DOMContentLoaded',()=>{ipcRenderer.invoke('app:info').then(info=>{const el=document.getElementById('appVersionBadge')||document.querySelector('.version-badge');if(el){el.textContent=`V${info.version} • ${String(info.channel||'stable').toUpperCase()}`;el.title=`Sharawla POS ${info.version} — ${info.channel}`}}).catch(()=>{})});
