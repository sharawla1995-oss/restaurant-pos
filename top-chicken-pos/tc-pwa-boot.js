'use strict';
// Top Chicken PWA preview is deliberately distinct from Top Burger's web shell.
// Host this route on its OWN HTTPS ORIGIN: no localStorage or SW sharing.
if(!window.topBurgerDesktop?.isDesktop &&
   /\/top-chicken-pos\/(?:index\.html)?$/.test(window.location.pathname)){
  window.__TOP_CHICKEN_PWA_PREVIEW__='top-chicken-branch22-preview-v1';
}
(function(){
  let deferredInstall=null;
  window.addEventListener('beforeinstallprompt',event=>{
    if(window.__TOP_CHICKEN_PWA_PREVIEW__!=='top-chicken-branch22-preview-v1')return;
    event.preventDefault();
    deferredInstall=event;
    const b=document.getElementById('tcPwaInstall');
    if(b)b.hidden=false;
  });
  window.addEventListener('DOMContentLoaded',()=>{
    const b=document.getElementById('tcPwaInstall');
    if(!b)return;
    b.addEventListener('click',async()=>{
      if(!deferredInstall)return;
      const request=deferredInstall;
      deferredInstall=null;
      b.hidden=true;
      await request.prompt();
    });
  });
  window.addEventListener('appinstalled',()=>{
    deferredInstall=null;
    const b=document.getElementById('tcPwaInstall');
    if(b)b.hidden=true;
  });
})();
