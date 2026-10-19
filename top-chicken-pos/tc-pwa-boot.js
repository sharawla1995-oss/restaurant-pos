'use strict';
// Top Chicken PWA preview is deliberately distinct from Top Burger's web shell.
// Host this route on its OWN HTTPS ORIGIN: no localStorage or SW sharing.
// This module is loaded exclusively by the isolated Top Chicken PWA entrypoint.
// Do not rely on URL path: Vercel drag-and-drop may place index.html at /.
if(!window.topBurgerDesktop?.isDesktop){
  window.__TOP_CHICKEN_PWA_PREVIEW__='top-chicken-branch22-preview-v1';
}
// Fail closed for every application module, including legacy direct fetches
// that do not go through the shared POS request helper.
if(window.__TOP_CHICKEN_PWA_PREVIEW__==='top-chicken-branch22-preview-v1'){
  const originalFetch=window.fetch.bind(window);
  const betaOrigin='https://xihcxydjnzemflhedzor.supabase.co';
  const centralOrigin='https://ikppryeavoabnugcijeq.supabase.co';
  window.fetch=function(input,init){
    const rawUrl=typeof input==='string'?input:input?.url;
    const requestUrl=new URL(String(rawUrl||''),window.location.href);
    const method=String(init?.method||input?.method||'GET').toUpperCase();
    // Fail closed for ALL destinations, not only the known Supabase hosts.
    // A wrongly configured module must never mutate Top Burger or a third-party.
    if(method!=='GET'&&method!=='HEAD'){
      const path=requestUrl.pathname+requestUrl.search;
      const authorizedAuthFlow=requestUrl.origin===betaOrigin&&method==='POST'&&
        (path==='/auth/v1/token?grant_type=password' ||
         path==='/auth/v1/token?grant_type=refresh_token' ||
         path==='/functions/v1/top-chicken-pin-login');
      const readonlyPermission=requestUrl.origin===betaOrigin&&method==='POST'&&
        path==='/rest/v1/rpc/has_permission';
      if(!authorizedAuthFlow&&!readonlyPermission)
        return Promise.reject(new Error('Top Chicken PWA Beta — ممنوع حفظ أو تعديل أي بيانات في وضع المعاينة'));
    }
    return originalFetch(input,init);
  };
  // Avoid silent alternate transport paths for writes in preview.
  if(typeof navigator!=='undefined'&&typeof navigator.sendBeacon==='function'){
    navigator.sendBeacon=function(){return false};
  }
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
