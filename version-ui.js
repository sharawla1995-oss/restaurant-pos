// Sharawla POS version badge fallback for Browser/PWA.
// Electron preload remains authoritative on desktop and may overwrite this value.
(async()=>{
  try{
    const res=await fetch('./version.json',{cache:'no-store'});
    if(!res.ok)return;
    const info=await res.json();
    const el=document.getElementById('appVersionBadge')||document.querySelector('.version-badge');
    if(!el||!info?.version)return;
    const channel=String(info.channel||'stable').toUpperCase();
    el.textContent=`V${info.version} • ${channel}`;
    el.title=`Sharawla POS ${info.version} — ${String(info.channel||'stable')}`;
  }catch{}
})();
