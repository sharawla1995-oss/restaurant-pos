(function(){
  let deferred=null;
  const DISMISS_KEY='topchicken-beta-install-dismissed-at';
  const DAYS=7*24*60*60*1000;
  function standalone(){return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone===true}
  function recentlyDismissed(){try{return Date.now()-Number(localStorage.getItem(DISMISS_KEY)||0)<DAYS}catch(_){return false}}
  function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)}
  function isSafari(){return isIOS() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent)}
  function ensure(){
    let el=document.getElementById('pwaInstallBanner'); if(el)return el;
    el=document.createElement('div'); el.id='pwaInstallBanner'; el.className='pwa-install-banner hidden';
    el.innerHTML='<span class="top-chicken-install-mark" aria-hidden="true">🍗</span><div><b>حمّل تطبيق Top Chicken</b><small id="pwaInstallHint">افتحه أسرع من الشاشة الرئيسية</small></div><button type="button" id="pwaInstallAction">تحميل</button><button type="button" class="pwa-install-close" aria-label="إغلاق">×</button>';
    document.body.appendChild(el);
    el.querySelector('.pwa-install-close').onclick=()=>{el.classList.add('hidden');try{localStorage.setItem(DISMISS_KEY,String(Date.now()))}catch(_){}};
    el.querySelector('#pwaInstallAction').onclick=async()=>{
      if(deferred){deferred.prompt();try{await deferred.userChoice}catch(_){} deferred=null;el.classList.add('hidden');return}
      if(isSafari()){document.getElementById('pwaInstallHint').textContent='اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية»';return}
    };
    return el;
  }
  function show(){if(standalone()||recentlyDismissed())return;ensure().classList.remove('hidden')}
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;show()});
  window.addEventListener('appinstalled',()=>{deferred=null;ensure().classList.add('hidden')});
  window.addEventListener('load',()=>{if(isSafari()&&!standalone())setTimeout(show,1200)});
})();
