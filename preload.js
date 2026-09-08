const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('topBurgerDesktop',{
 isDesktop:true,
 db:{get:k=>ipcRenderer.invoke('db:get',k),set:(k,v)=>ipcRenderer.invoke('db:set',k,v)},
 operations:{put:o=>ipcRenderer.invoke('ops:put',o),list:s=>ipcRenderer.invoke('ops:list',s),status:(id,s,e)=>ipcRenderer.invoke('ops:status',id,s,e)},
 backup:{create:r=>ipcRenderer.invoke('backup:create',r),saveJson:(j,r)=>ipcRenderer.invoke('backup:saveJson',j,r),list:()=>ipcRenderer.invoke('backup:list')},
 print:{list:()=>ipcRenderer.invoke('print:list'),current:o=>ipcRenderer.invoke('print:current',o),html:(h,o)=>ipcRenderer.invoke('print:html',h,o)},
 update:{check:()=>ipcRenderer.invoke('update:check'),onProgress:cb=>{const fn=(_e,data)=>{try{cb(data)}catch{}};ipcRenderer.on('update:progress',fn);return()=>ipcRenderer.removeListener('update:progress',fn)}},
 paths:()=>ipcRenderer.invoke('desktop:paths')
});
