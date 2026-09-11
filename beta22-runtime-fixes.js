(function(global){
  'use strict';

  const FIX_VERSION='10.5.4-beta.22';
  let bypassWeightCapture=false;
  let alertSoundTimer=null;
  let alertSoundStopTimer=null;
  let settingsCache=new Map();

  function isRetail(){
    try{return typeof global.runtimeAllPages==='function'&&global.runtimeAllPages().includes('marketSettings')}catch{return false}
  }

  function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}

  async function refreshSettings(){
    if(!isRetail()||typeof global.rest!=='function')return settingsCache;
    try{
      const rows=await global.rest('retail_product_settings','select=product_id,unit_type,allow_decimal,qty_step,min_qty');
      settingsCache=new Map((rows||[]).map(x=>[String(x.product_id),x]));
    }catch{}
    return settingsCache;
  }

  function settingFor(productId){
    return settingsCache.get(String(productId))||null;
  }

  function unitLabel(st){
    return ({piece:'قطعة',kg:'كجم',g:'جم',liter:'لتر',ml:'مل'})[st?.unit_type]||st?.unit_type||'وحدة';
  }

  function normalizeBySetting(st,value){
    let q=Number(value);
    if(!Number.isFinite(q)||q<=0)return null;
    const allow=st?.allow_decimal===true;
    const step=Math.max(.001,Number(allow?st?.qty_step:1)||1);
    const min=Math.max(0,Number(st?.min_qty||0));
    q=Math.round(q/step)*step;
    if(!allow)q=Math.round(q);
    q=Math.round(q*1000)/1000;
    if(q<=0||q+1e-9<min)return null;
    return q;
  }

  function openWeightModal(button){
    const index=Number(button.dataset.i);
    const label=button.parentElement?.querySelector('b')?.textContent||'';
    const current=(label.match(/[0-9٠-٩.,]+/)||['1'])[0].replace(/,/g,'.');
    const productId=(()=>{
      try{
        const card=button.closest('.cart-item');
        const name=card?.querySelector('.cart-row b')?.textContent||'';
        const p=(global.state?.products||[]).find?.(x=>String(x.name)===String(name));
        return p?.id||null;
      }catch{return null}
    })();
    const st=productId?settingFor(productId):null;
    const unit=unitLabel(st);
    const step=st?Math.max(.001,Number(st.allow_decimal?st.qty_step:1)||1):.001;
    const min=st?Math.max(0,Number(st.min_qty||0)):step;

    const m=document.createElement('div');
    m.className='modal';
    m.innerHTML=`<div class="modal-card" style="max-width:430px"><h2>⚖️ إدخال الكمية / الوزن</h2><p class="muted">اكتب القيمة مباشرة ثم اضغط موافق.</p><label>الكمية (${esc(unit)})<input id="retailWeightDirectInput" type="number" inputmode="decimal" min="${min}" step="${step}" value="${esc(current)}" style="font-size:28px;text-align:center;font-weight:800" autofocus></label><small>أقل كمية: ${min} · خطوة الكمية: ${step}</small><div class="modal-actions"><button class="secondary" data-weight-cancel>إلغاء</button><button class="primary" data-weight-ok>موافق</button></div></div>`;
    document.body.appendChild(m);
    const input=m.querySelector('#retailWeightDirectInput');
    setTimeout(()=>{try{input.focus();input.select()}catch{}},0);
    const close=()=>m.remove();
    const apply=()=>{
      const normalized=normalizeBySetting(st,Number(input.value));
      if(normalized==null){try{global.toast?.(`اكتب كمية صحيحة لا تقل عن ${min} ${unit}`)}catch{};return}
      const originalPrompt=global.prompt;
      try{
        bypassWeightCapture=true;
        global.prompt=()=>String(normalized);
        button.click();
      }finally{
        global.prompt=originalPrompt;
        bypassWeightCapture=false;
      }
      close();
    };
    m.onclick=e=>{
      if(e.target===m||e.target.closest('[data-weight-cancel]'))return close();
      if(e.target.closest('[data-weight-ok]'))return apply();
    };
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply()}if(e.key==='Escape')close()});
  }

  function wireWeightEntry(){
    document.addEventListener('click',e=>{
      if(bypassWeightCapture||!isRetail())return;
      const b=e.target.closest?.('button[data-a="editqty"]');
      if(!b)return;
      e.preventDefault();e.stopImmediatePropagation();
      refreshSettings().finally(()=>openWeightModal(b));
    },true);
  }

  async function toneBurst(){
    try{
      const Ctx=global.AudioContext||global.webkitAudioContext;
      if(!Ctx)return false;
      const ctx=new Ctx();if(ctx.state==='suspended')await ctx.resume();
      const notes=[880,1040,880];
      notes.forEach((freq,i)=>{
        const osc=ctx.createOscillator(),gain=ctx.createGain();
        osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=freq;gain.gain.value=.22;
        const at=ctx.currentTime+i*.34;osc.start(at);osc.stop(at+.20);
      });
      setTimeout(()=>{try{ctx.close()}catch{}},1300);
      return true;
    }catch{return false}
  }

  function stopAlertSound(){
    if(alertSoundTimer){clearInterval(alertSoundTimer);alertSoundTimer=null}
    if(alertSoundStopTimer){clearTimeout(alertSoundStopTimer);alertSoundStopTimer=null}
  }

  function startAlertSound(){
    stopAlertSound();
    toneBurst();
    alertSoundTimer=setInterval(()=>{
      if(!document.querySelector('#retailWebsiteOrderAlert'))return stopAlertSound();
      toneBurst();
    },3500);
    alertSoundStopTimer=setTimeout(stopAlertSound,30000);
  }

  function watchWebsiteAlert(){
    const observer=new MutationObserver(()=>{
      const alert=document.querySelector('#retailWebsiteOrderAlert');
      if(alert&&!alert.dataset.beta22Sound){alert.dataset.beta22Sound='1';startAlertSound()}
      if(!alert)stopAlertSound();
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  global.__SharawlaRetailWebsiteTestSound=async()=>{
    await toneBurst();
    await new Promise(r=>setTimeout(r,420));
    await toneBurst();
    return true;
  };
  global.__SharawlaBeta22RefreshRetailSettings=refreshSettings;
  global.__SharawlaBeta22NormalizeBySetting=normalizeBySetting;
  global.__SharawlaBeta22FixesLoaded=true;

  function start(){
    if(!isRetail())return;
    refreshSettings();
    wireWeightEntry();
    watchWebsiteAlert();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);