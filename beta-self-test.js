(function(global){
  'use strict';

  const VERSION='10.5.4-beta.21';
  const RUNTIME_KEY='sharawlaRuntimeConfigV1';
  const CONNECTION_KEY='sharawlaBusinessConnectionV1';
  const RESULTS=[];
  let enabled=false;
  let currentInfo=null;

  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function row(name,status,detail=''){
    return {name:String(name),status:String(status),detail:String(detail||''),at:new Date().toISOString()};
  }

  function setResult(name,status,detail=''){
    const i=RESULTS.findIndex(x=>x.name===name);
    const r=row(name,status,detail);
    if(i>=0)RESULTS[i]=r;else RESULTS.push(r);
    return r;
  }

  function parseLocal(key){
    try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}
  }

  function statusClass(s){
    return s==='PASS'?'success':s==='FAIL'?'danger':s==='MANUAL'?'warning':'muted';
  }

  function renderResults(){
    const body=$('#betaSelfTestResults');
    if(!body)return;
    if(!RESULTS.length){body.innerHTML='<div class="empty-state">لم يبدأ الاختبار بعد.</div>';return}
    const counts=RESULTS.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{});
    body.innerHTML=`
      <div class="settings-list compact">
        ${RESULTS.map(x=>`<div class="setting-switch"><span><b>${esc(x.name)}</b>${x.detail?`<small style="display:block">${esc(x.detail)}</small>`:''}</span><span class="status ${statusClass(x.status)}">${esc(x.status)}</span></div>`).join('')}
      </div>
      <div class="panel" style="margin-top:12px"><b>النتيجة:</b>
        ${['PASS','FAIL','SKIPPED','MANUAL'].filter(k=>counts[k]).map(k=>`${counts[k]} ${k}`).join(' / ')||'—'}
      </div>`;
  }

  function reportObject(){
    return {
      product:'Sharawla POS',
      self_test_version:VERSION,
      app_version:currentInfo?.version||null,
      channel:currentInfo?.channel||null,
      arch:currentInfo?.arch||null,
      device_support_code:parseLocal('sharawlaLicenseStateV1')?.support_code||null,
      generated_at:new Date().toISOString(),
      safe_mode:true,
      results:RESULTS.map(x=>({...x}))
    };
  }

  function reportText(){
    const r=reportObject();
    const lines=[
      'Sharawla Beta Self-Test',
      `${r.app_version||'—'} — ${r.device_support_code||'Beta Device'}`,
      '',
      ...r.results.map(x=>`${x.name.padEnd(25,'.')} ${x.status}${x.detail?` — ${x.detail}`:''}`),
      ''
    ];
    const counts=r.results.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{});
    lines.push(`Result: ${['PASS','FAIL','SKIPPED','MANUAL'].filter(k=>counts[k]).map(k=>`${counts[k]} ${k}`).join(' / ')||'No tests'}`);
    lines.push('Mode: SAFE READ-ONLY (no business data mutations)');
    return lines.join('\n');
  }

  async function copyText(){
    const text=reportText();
    try{await navigator.clipboard.writeText(text);global.toast?.('تم نسخ تقرير Self-Test');return}catch{}
    const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();try{document.execCommand('copy');global.toast?.('تم نسخ تقرير Self-Test')}finally{t.remove()}
  }

  function exportJson(){
    const blob=new Blob([JSON.stringify(reportObject(),null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`sharawla-self-test-${String(currentInfo?.version||'beta').replace(/[^0-9A-Za-z._-]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  async function run(name,fn){
    setResult(name,'SKIPPED','جاري الاختبار…');renderResults();
    try{
      const out=await fn();
      if(out&&typeof out==='object'&&'status'in out)setResult(name,out.status,out.detail||'');
      else setResult(name,out===false?'FAIL':'PASS','');
    }catch(e){setResult(name,'FAIL',e?.message||String(e))}
    renderResults();
  }

  function exactCodes(rows){
    return (rows||[]).map(x=>String(x.code||'')).filter(Boolean).sort();
  }

  async function runAll(){
    RESULTS.splice(0,RESULTS.length);renderResults();
    const btn=$('#betaSelfTestRunAll');if(btn)btn.disabled=true;
    try{
      await run('Runtime Engine',async()=>{
        const core=global.SharawlaRuntimeCore;
        const ok=!!core?.hasEngine?.('retail')&&global.__SharawlaRetailEngineLoaded===true;
        return {status:ok?'PASS':'FAIL',detail:ok?'Retail Engine registered':'Retail Engine missing/not registered'};
      });

      await run('Runtime Config',async()=>{
        const c=parseLocal(RUNTIME_KEY);
        const ok=!!c&&String(c.pos_profile||'').toLowerCase()==='retail'&&c.profile_active!==false&&c.profile_implemented!==false;
        return {status:ok?'PASS':'FAIL',detail:c?`profile=${c.pos_profile||'—'}; business=${c.business_name||c.business_id||'—'}`:'Runtime Config cache missing'};
      });

      await run('Business Connection',async()=>{
        const c=parseLocal(CONNECTION_KEY);
        const ok=!!c&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(c.url||''))&&String(c.key||'').startsWith('sb_publishable_');
        return {status:ok?'PASS':'FAIL',detail:ok?`business=${c.business_name||c.business_id||'—'}`:'Business Connection cache invalid/missing'};
      });

      await run('Login/Permissions',async()=>{
        const branch=Number(global.currentBranchId?.()||0);
        const pos=typeof global.canAccessPage==='function'?global.canAccessPage('pos'):true;
        const reports=typeof global.canAccessPage==='function'?global.canAccessPage('reports'):true;
        const ok=branch>0&&pos&&reports;
        return {status:ok?'PASS':'FAIL',detail:`branch=${branch||'—'}; pos=${!!pos}; reports=${!!reports}`};
      });

      await run('Retail Checkout',async()=>{
        const ok=typeof global.checkout==='function'&&typeof global.drawCart==='function'&&typeof global.retailQtyNormalize==='function';
        return {status:ok?'PASS':'FAIL',detail:ok?'Retail checkout functions loaded':'Retail checkout functions missing'};
      });

      await run('Decimal Quantity',async()=>{
        if(typeof global.rest!=='function')return {status:'FAIL',detail:'REST client unavailable'};
        const rows=await global.rest('retail_product_settings','select=product_id,unit_type,allow_decimal,qty_step,min_qty&allow_decimal=eq.true&limit=20');
        const d=(rows||[]).find(x=>Number(x.qty_step)>0&&Number(x.qty_step)<1);
        if(!d)return {status:'SKIPPED',detail:'No decimal Retail product configured'};
        const q=typeof global.retailQtyNormalize==='function'?global.retailQtyNormalize(Number(d.product_id),1.25):1.25;
        return {status:Math.abs(Number(q)-1.25)<0.0005?'PASS':'FAIL',detail:`product=${d.product_id}; unit=${d.unit_type}; step=${d.qty_step}; normalized=${q}`};
      });

      await run('Inventory Read',async()=>{
        const branch=Number(global.currentBranchId?.()||0);
        if(!branch)return {status:'FAIL',detail:'No active branch'};
        const rows=await global.rest('retail_inventory_balances',`select=product_id,quantity,track_inventory&branch_id=eq.${branch}&limit=20`);
        return {status:Array.isArray(rows)?'PASS':'FAIL',detail:`branch=${branch}; balances=${Array.isArray(rows)?rows.length:0}`};
      });

      await run('Website API',async()=>{
        if(!navigator.onLine)return {status:'SKIPPED',detail:'Offline'};
        const branch=Number(global.currentBranchId?.()||0);
        const boot=await global.rpc('retail_website_bootstrap',{});
        const catalog=branch?await global.rpc('retail_website_catalog',{p_branch_id:branch}):null;
        return {status:boot&&catalog!==undefined?'PASS':'FAIL',detail:`bootstrap=${boot?'ok':'missing'}; catalog=${catalog!==undefined?'ok':'missing'}`};
      });

      await run('Reports Contract',async()=>{
        const e=global.SharawlaRuntimeCore?.getEngine?.('retail');
        const rows=typeof e?.reportOrderTypes==='function'?e.reportOrderTypes():[];
        const codes=exactCodes(rows);
        const ok=JSON.stringify(codes)===JSON.stringify(['delivery','pickup','takeaway']);
        return {status:ok?'PASS':'FAIL',detail:`types=${codes.join(',')||'none'}`};
      });

      await run('Restaurant Leakage',async()=>{
        const pages=typeof global.runtimeAllPages==='function'?global.runtimeAllPages():[];
        const leaked=['kitchen','deliveryOrders','deliverySettings'].filter(x=>pages.includes(x));
        return {status:leaked.length?'FAIL':'PASS',detail:leaked.length?`leaked=${leaked.join(',')}`:'No Restaurant-only pages in Retail contract'};
      });

      await run('EAN13 Checksum',async()=>{
        const fn=global.__SharawlaRetailEan13Valid;
        if(typeof fn!=='function')return {status:'SKIPPED',detail:'Runtime checksum validator not exported yet'};
        const valid='4006381333931',invalid='4006381333932';
        return {status:fn(valid)&&!fn(invalid)?'PASS':'FAIL',detail:'valid + invalid checksum cases'};
      });

      await run('Update Health',async()=>{
        const u=global.topBurgerDesktop?.update;
        if(!u?.info||!u?.safety)return {status:'SKIPPED',detail:'Desktop updater unavailable'};
        const [info,safety]=await Promise.all([u.info(),u.safety()]);
        const health=safety?.lastHealth;
        const ok=!!info?.version&&(health?.ok===true||health==null);
        return {status:ok?'PASS':'FAIL',detail:`version=${info?.version||'—'}; channel=${info?.channel||'—'}; health=${health?.ok===true?'ok':health?.ok===false?'failed':'not-yet-recorded'}`};
      });

      setResult('Decimal Return','SKIPPED','Safe Mode لا ينشئ مرتجعات فعلية — Sandbox mutation test سيضاف لاحقًا');
      setResult('Website Order','SKIPPED','Safe Mode لا ينشئ طلبات فعلية — Sandbox mutation test سيضاف لاحقًا');
      setResult('Reservation/Reject','SKIPPED','Safe Mode لا يغيّر حجوزات أو طلبات حقيقية');
      setResult('Notification Sound','MANUAL','اضغط «اختبار الصوت» ثم أكد هل سمعته');
      setResult('Printer Output','MANUAL','يتطلب تأكيد خروج ورقة فعلية من الطابعة');
      renderResults();
    }finally{if(btn)btn.disabled=false}
  }

  async function testSound(){
    let played=false;
    try{
      if(typeof global.__SharawlaRetailWebsiteTestSound==='function')played=await global.__SharawlaRetailWebsiteTestSound();
      else{
        const Ctx=global.AudioContext||global.webkitAudioContext;
        if(Ctx){const ctx=new Ctx();if(ctx.state==='suspended')await ctx.resume();const osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=880;gain.gain.value=.12;osc.start();setTimeout(()=>{try{osc.stop();ctx.close()}catch{}},350);played=true}
      }
    }catch{}
    const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="modal-card"><h2>🔊 اختبار صوت الإشعار</h2><p>${played?'تم تشغيل نغمة الاختبار. هل سمعتها؟':'تعذر تشغيل نغمة الاختبار برمجيًا.'}</p><div class="modal-actions"><button class="danger" data-heard="no">لم أسمع</button><button class="primary" data-heard="yes">سمعت الصوت</button></div></div>`;document.body.appendChild(m);
    m.onclick=e=>{const b=e.target.closest('[data-heard]');if(!b&&e.target!==m)return;if(b)setResult('Notification Sound',b.dataset.heard==='yes'?'PASS':'FAIL',b.dataset.heard==='yes'?'Audible test confirmed by operator':'No audible sound');m.remove();renderResults()};
  }

  function render(){
    const page=$('#page');if(!page)return;
    document.querySelectorAll('#nav button').forEach(b=>b.classList.remove('active'));
    $('#betaSelfTestNav')?.classList.add('active');
    const title=$('#pageTitle');if(title)title.textContent='مركز اختبار Beta';
    page.innerHTML=`
      <div class="panel">
        <div class="section-head"><div><h2>🧪 Sharawla Beta Self-Test</h2><p class="muted">Safe Read-Only Mode — لا ينشئ أو يحذف بيانات تشغيل حقيقية.</p></div><b dir="ltr">${esc(currentInfo?.version||VERSION)}</b></div>
        <div class="inline-actions">
          <button id="betaSelfTestRunAll" class="primary" type="button">▶ بدء الاختبار الكامل</button>
          <button id="betaSelfTestSound" type="button">🔊 اختبار الصوت</button>
          <button id="betaSelfTestCopy" type="button">📋 نسخ التقرير</button>
          <button id="betaSelfTestExport" type="button">⬇️ تصدير JSON</button>
        </div>
        <div id="betaSelfTestResults" style="margin-top:14px"></div>
      </div>`;
    $('#betaSelfTestRunAll').onclick=runAll;
    $('#betaSelfTestSound').onclick=testSound;
    $('#betaSelfTestCopy').onclick=copyText;
    $('#betaSelfTestExport').onclick=exportJson;
    renderResults();
  }

  function ensureNav(){
    if(!enabled)return;
    const nav=$('#nav');if(!nav)return;
    let b=$('#betaSelfTestNav');
    if(!b){
      b=document.createElement('button');b.id='betaSelfTestNav';b.type='button';b.textContent='🧪 مركز اختبار Beta';
      nav.insertBefore(b,$('#logoutMenuBtn')||null);b.onclick=render;
    }
    b.classList.remove('hidden');
  }

  async function init(){
    try{
      currentInfo=await global.topBurgerDesktop?.update?.info?.();
      const v=String(currentInfo?.version||'');
      const ch=String(currentInfo?.channel||'').toLowerCase();
      enabled=ch==='beta'||/-(?:alpha|beta|rc|preview)(?:[.-]|$)/i.test(v);
    }catch{enabled=false}
    if(!enabled)return;
    ensureNav();
    setInterval(ensureNav,1500);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
