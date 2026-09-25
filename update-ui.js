// Sharawla POS V10.5.4 Part 3 — Update Center UI + Update Safety visibility.
// Windows-only UI over the existing updater exposed by preload.js.
(()=>{
  const $=s=>document.querySelector(s);
  const stateLabel={
    idle:'جاهز',
    checking:'جاري الفحص',
    busy:'الفحص جارٍ',
    available:'تحديث متاح',
    downloading:'جاري التنزيل',
    progress:'جاري التنزيل',
    downloaded:'تم التنزيل',
    installing:'جاري التثبيت',
    restarting:'إعادة التشغيل',
    'up-to-date':'أحدث إصدار',
    'blocked-offline':'متوقف — حركات أوفلاين',
    'backing-up':'جاري النسخ الاحتياطي',
    'backup-ready':'Backup جاهز',
    'backup-error':'فشل Backup',
    'verifying-integrity':'فحص السلامة',
    'integrity-error':'فشل السلامة',
    'health-failed':'فشل الفحص',
    error:'فشل'
  };

  let lastInfo=null;
  let lastRemote='—';
  let stopProgress=null;

  function setText(id,value){
    const el=document.getElementById(id);
    if(el)el.textContent=value==null||value===''?'—':String(value);
  }

  function setStatus(payload={}){
    const state=String(payload.state||'idle');
    setText('updateStatusValue',stateLabel[state]||state);
    if(payload.remote)setText('updateAvailableVersion',`V${payload.remote}`);
    if(payload.local)setText('updateCurrentVersion',`V${payload.local}`);
    if(payload.channel)setText('updateChannelValue',String(payload.channel).toUpperCase());
    if(payload.pendingCount!=null)setText('updateOfflineQueueValue',Number(payload.pendingCount)>0?`${Number(payload.pendingCount)} معلقة`:'متزامنة ✓');
    if(payload.backupName)setText('updateBackupValue',payload.backupName);

    const message=document.getElementById('updateStatusMessage');
    if(message)message.textContent=payload.message||'';

    const progress=document.getElementById('updateProgressBar');
    if(progress){
      const hasPercent=Number.isFinite(payload.percent);
      progress.classList.toggle('hidden',!hasPercent);
      if(hasPercent)progress.value=Math.max(0,Math.min(100,Number(payload.percent)));
    }

    const btn=document.getElementById('checkUpdatesNowBtn');
    if(btn)btn.disabled=['checking','downloading','progress','backing-up','installing','restarting'].includes(state);
  }

  async function refreshSafety(){
    if(!window.topBurgerDesktop?.update?.safety)return null;
    try{
      const info=await window.topBurgerDesktop.update.safety();
      const q=info?.queue;
      if(q?.ok===false)setText('updateOfflineQueueValue','تعذر الفحص');
      else if(Number(q?.pendingCount||0)>0)setText('updateOfflineQueueValue',`${Number(q.pendingCount)} معلقة`);
      else setText('updateOfflineQueueValue','متزامنة ✓');
      setText('updateBackupValue',info?.lastPreUpdateBackup?.name||'لم يُنشأ بعد');
      const integrity=info?.lastIntegrity;
      setText('updateIntegrityValue',integrity?.ok===true?`✓ ${String(integrity.actual||integrity.sha256||'').slice(0,10)}…`:(integrity?.ok===false?'✕ فشل':'—'));
      const health=info?.lastHealth;
      setText('updateHealthValue',health?.ok===true?'✓ سليم':(health?.ok===false?'✕ فشل':'—'));
      setText('updateLastGoodValue',info?.lastKnownGood?.version?`V${info.lastKnownGood.version}`:'—');
      setText('updatePreviousGoodValue',info?.previousLastKnownGood?.version?`V${info.previousLastKnownGood.version}`:'—');
      const rb=document.getElementById('rollbackLastGoodBtn');
      if(rb){
        rb.classList.toggle('hidden',info?.rollbackAvailable!==true);
        rb.textContent=info?.rollbackTarget?.version?`↩️ الرجوع إلى V${info.rollbackTarget.version}`:'↩️ الرجوع لآخر نسخة سليمة';
      }
      return info;
    }catch(err){
      setText('updateOfflineQueueValue','تعذر الفحص');
      return null;
    }
  }

  async function refreshInfo(){
    if(!window.topBurgerDesktop?.update?.info)return null;
    const info=await window.topBurgerDesktop.update.info();
    lastInfo=info||null;
    if(info){
      setText('updateCurrentVersion',info.version?`V${info.version}`:'—');
      setText('updateChannelValue',String(info.channel||'stable').toUpperCase());
      setText('updateArchitectureValue',String(info.arch||'—'));
      setText('updateAvailableVersion',lastRemote==='—'?'—':`V${lastRemote}`);
    }
    await refreshSafety().catch(()=>{});
    return info;
  }

  async function manualCheck(){
    if(!window.topBurgerDesktop?.update?.check)return;
    await refreshSafety().catch(()=>{});
    setStatus({
      state:'checking',
      local:lastInfo?.version,
      channel:lastInfo?.channel,
      message:'جاري فحص GitHub Releases للقناة الحالية…'
    });

    try{
      const result=await window.topBurgerDesktop.update.check();
      if(result?.remote){
        lastRemote=result.remote;
        setText('updateAvailableVersion',`V${result.remote}`);
      }
      if(result?.error){
        setStatus({state:'error',local:result.local,channel:result.channel,message:result.error});
      }else if(result?.busy){
        setStatus({state:'busy',local:result.local,channel:result.channel,message:'يوجد فحص تحديثات جارٍ بالفعل'});
      }else if(result?.available){
        setStatus({
          state:'available',
          local:result.local,
          remote:result.remote,
          channel:result.channel,
          message:result.checkOnly?'التحديث متاح — فحص فقط، لن يبدأ التنزيل من الزر اليدوي':(result.skipped?'التحديث متاح وتم تأجيله':'التحديث متاح')
        });
      }else if(result&&result.available===false){
        setStatus({
          state:'up-to-date',
          local:result.local,
          remote:result.remote,
          channel:result.channel,
          message:`أنت على أحدث إصدار V${result.local}`
        });
      }
    }catch(err){
      setStatus({state:'error',message:String(err?.message||err||'تعذر فحص التحديث')});
    }finally{
      await refreshSafety().catch(()=>{});
      const btn=document.getElementById('checkUpdatesNowBtn');
      if(btn)btn.disabled=false;
    }
  }

  function openCenter(){
    const modal=$('#updateCenterModal');
    if(!modal)return;
    modal.classList.remove('hidden');
    refreshInfo().catch(()=>{});
  }

  function closeCenter(){
    const modal=$('#updateCenterModal');
    if(modal)modal.classList.add('hidden');
  }

  function init(){
    const supported=!!window.topBurgerDesktop?.isDesktop&&!!window.topBurgerDesktop?.update;
    const menuBtn=$('#updateCenterMenuBtn');
    if(!supported){
      if(menuBtn)menuBtn.classList.add('hidden');
      return;
    }

    if(menuBtn)menuBtn.onclick=openCenter;
    const close=$('#updateCenterCloseBtn');
    if(close)close.onclick=closeCenter;
    const modal=$('#updateCenterModal');
    if(modal)modal.onclick=e=>{if(e.target===modal)closeCenter()};
    const check=$('#checkUpdatesNowBtn');
    if(check)check.onclick=manualCheck;
    const rollback=$('#rollbackLastGoodBtn');
    if(rollback)rollback.onclick=async()=>{rollback.disabled=true;try{await window.topBurgerDesktop?.update?.rollback?.()}finally{rollback.disabled=false;await refreshSafety().catch(()=>{})}};

    refreshInfo().then(()=>{
      setStatus({
        state:'idle',
        local:lastInfo?.version,
        channel:lastInfo?.channel,
        message:'اضغط «فحص التحديثات الآن» للبحث عن تحديث جديد.'
      });
    }).catch(()=>setStatus({state:'error',message:'تعذر قراءة معلومات نظام التحديث'}));

    if(window.topBurgerDesktop.update.onProgress){
      stopProgress=window.topBurgerDesktop.update.onProgress(payload=>{
        if(payload?.remote)lastRemote=payload.remote;
        setStatus(payload||{});
      });
    }

    window.addEventListener('beforeunload',()=>{try{stopProgress&&stopProgress()}catch{}},{once:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
