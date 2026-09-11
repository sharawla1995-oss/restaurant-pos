(function(global){
'use strict';
const BETA_BUSINESS_ID='91826502-590e-4afa-8826-2c0f4b99c490';
const BETA_OPERATIONAL_HOST='xihcxydjnzemflhedzor.supabase.co';
const rows=[];
const nowIso=()=>new Date().toISOString();
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const localJson=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
const currentBranch=()=>Number(global.currentBranchId?.()||0);
function put(name,status,detail='',critical=false){const r={name,status,detail:String(detail||''),critical:!!critical,at:nowIso()};const i=rows.findIndex(x=>x.name===name);if(i>=0)rows[i]=r;else rows.push(r);renderResults();return r}
async function test(name,fn,critical=false){put(name,'RUNNING','',critical);try{const o=await fn();return put(name,o?.status||'PASS',o?.detail||'',critical)}catch(e){return put(name,'FAIL',e?.message||String(e),critical)}}
function betaLock(){const rc=localJson('sharawlaRuntimeConfigV1'),bc=localJson('sharawlaBusinessConnectionV1');const business=String(rc?.business_id||bc?.business_id||'');let host='';try{host=new URL(bc?.url||'').host}catch{}return {ok:business===BETA_BUSINESS_ID&&host===BETA_OPERATIONAL_HOST,business,host,profile:String(rc?.pos_profile||'')}}
async function appVersion(){try{return (await global.topBurgerDesktop?.update?.info?.())?.version||'unknown'}catch{return 'unknown'}}
async function copy(text,msg){try{await navigator.clipboard.writeText(text);global.toast?.(msg);return}catch{}const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();try{document.execCommand('copy');global.toast?.(msg)}finally{t.remove()}}
function textReport(){const c=rows.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{});return ['Sharawla Beta26 UI & Delivery Acceptance',...rows.map(x=>`${x.name.padEnd(32,'.')} ${x.status}${x.detail?` — ${x.detail}`:''}`),'',`Result: ${['PASS','FAIL','SKIPPED'].filter(k=>c[k]).map(k=>`${c[k]} ${k}`).join(' / ')||'No tests'}`].join('\n')}
async function combinedReport(){const v=await appVersion();const old=global.__SharawlaBeta23Acceptance;return JSON.stringify({product:'Sharawla POS',app_version:v,generated_at:nowIso(),beta_lock:betaLock(),ui_delivery:rows,legacy_acceptance:old?{version:old.version,read_only:old.results,transactional:old.txResults}:null},null,2)}
function statusClass(s){return s==='PASS'?'success':s==='FAIL'?'danger':s==='SKIPPED'?'muted':'warning'}
function renderResults(){const el=$('#beta26UiResults');if(!el)return;const c=rows.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{});el.innerHTML=`<div class="settings-list compact">${rows.map(x=>`<div class="setting-switch"><span><b>${esc(x.name)}</b>${x.critical?' <small>CRITICAL</small>':''}${x.detail?`<small style="display:block">${esc(x.detail)}</small>`:''}</span><span class="status ${statusClass(x.status)}">${x.status}</span></div>`).join('')}</div><div class="panel" style="margin-top:10px"><b>UI/Delivery:</b> ${['PASS','FAIL','SKIPPED'].filter(k=>c[k]).map(k=>`${c[k]} ${k}`).join(' / ')||'—'}</div>`}
async function openPage(page){if(typeof global.showPage!=='function')throw new Error('showPage unavailable');await global.showPage(page);await sleep(220)}
function visibleNav(){return $$('#nav button').filter(b=>{const s=getComputedStyle(b);return s.display!=='none'&&s.visibility!=='hidden'&&!b.classList.contains('hidden')&&!/تسجيل الخروج/.test(b.textContent||'')})}
async function run(){rows.splice(0,rows.length);renderResults();
 await test('Beta Isolation Lock',async()=>{const b=betaLock();return {status:b.ok?'PASS':'FAIL',detail:`business=${b.business||'—'}; host=${b.host||'—'}; profile=${b.profile||'—'}`}},true);
 await test('Current App Version',async()=>{const v=await appVersion();return {status:/10\.5\.4-beta\.26/.test(v)?'PASS':'FAIL',detail:`version=${v}`}},true);
 await test('Retail Engine Phase',async()=>{const e=global.SharawlaRuntimeCore?.getEngine?.('retail');return {status:e?.phase==='retail-finalization'?'PASS':'FAIL',detail:`phase=${e?.phase||'missing'}`}},true);
 await test('Home ↔ Sidebar Parity',async()=>{await openPage('home');const nav=visibleNav().filter(b=>b.id!=='betaSelfTestNav'&&b.dataset.page&&b.dataset.page!=='home');const cards=$$('.home-grid .home-card');const missing=[];for(const b of nav){const title=norm((b.textContent||'').replace(/^[^\p{L}\p{N}]+/u,''));const found=cards.some(c=>norm(c.textContent).includes(title));if(!found)missing.push(b.dataset.page)}return {status:missing.length?'FAIL':'PASS',detail:`nav=${nav.length}; cards=${cards.length}; missing=${missing.join(',')||'none'}`}},true);
 await test('Home Mirrored Card Routes',async()=>{await openPage('home');const mirrors=$$('[data-retail-final-mirror]');let bad=0,checked=0;for(let i=0;i<mirrors.length;i++){await openPage('home');const list=$$('[data-retail-final-mirror]');const card=list[i];if(!card)continue;const before=norm($('#pageTitle')?.textContent);card.click();await sleep(180);checked++;if(norm($('#pageTitle')?.textContent)===before)bad++}return {status:bad?'FAIL':'PASS',detail:`checked=${checked}; broken=${bad}`}},true);
 const uiChecks=[
  ['Inventory Search','inventory','[data-final-search="inventory"]'],
  ['Inventory Filters','inventory','[data-inv-filter="all"],[data-inv-filter="low"],[data-inv-filter="tracked"],[data-inv-filter="untracked"]'],
  ['Weight/Unit Search','marketSettings','[data-final-search="units"]'],
  ['Stock Count Search','stockCount','[data-final-search="stockcount"]'],
  ['Stock Count Difference Filter','stockCount','[data-count-diff]'],
  ['Suppliers Search','suppliers','[data-final-search="suppliers"]'],
  ['Purchasing Search','purchasing','[data-final-search="purchasing"]'],
  ['Orders Search','orders','[data-final-search="orders"]'],
  ['Returns Search','returns','[data-final-search="returns"]'],
  ['Transfers Search','transfers','[data-final-search="transfers"]'],
  ['Offers Search','retailOffers','[data-final-search="offers"]'],
  ['Products Search','products','[data-final-search="products"]']
 ];
 for(const [name,page,sel] of uiChecks)await test(name,async()=>{await openPage(page);const n=$$(sel).length;return {status:n?'PASS':'FAIL',detail:`controls=${n}`}});
 await test('Retail POS Delivery Selector',async()=>{await openPage('pos');const txt=norm($('#page')?.textContent);const ok=/دليفري|توصيل/.test(txt);return {status:ok?'PASS':'FAIL',detail:ok?'Delivery option visible in POS':'No Delivery option visible in POS'}},true);
 await test('Delivery Orders Route',async()=>{const pages=global.runtimeAllPages?.()||[];return {status:pages.includes('deliveryOrders')?'PASS':'FAIL',detail:`enabled=${pages.includes('deliveryOrders')}`}},true);
 await test('Delivery Settings Route',async()=>{const pages=global.runtimeAllPages?.()||[];return {status:pages.includes('deliverySettings')?'PASS':'FAIL',detail:`enabled=${pages.includes('deliverySettings')}`}},true);
 await test('Delivery Drivers Read',async()=>{const b=currentBranch();const r=await global.rest('delivery_drivers',`select=id,name,phone,branch_id,active&branch_id=eq.${b}`);return {status:Array.isArray(r)?'PASS':'FAIL',detail:`drivers=${r?.length||0}`}});
 await test('Delivery Zones Read',async()=>{const b=currentBranch();const r=await global.rest('delivery_zones',`select=id,name,delivery_fee,branch_id,active&branch_id=eq.${b}`);return {status:Array.isArray(r)?'PASS':'FAIL',detail:`zones=${r?.length||0}`}});
 await test('Website Delivery Zones Contract',async()=>{const x=await global.rpc('retail_website_bootstrap',{});const zones=x?.delivery_zones;return {status:Array.isArray(zones)?'PASS':'FAIL',detail:`website_zones=${Array.isArray(zones)?zones.length:'missing'}`}},true);
 await test('Negative Stock Guard State',async()=>{const b=currentBranch();const s=await global.rest('retail_inventory_settings',`select=allow_negative_stock&branch_id=eq.${b}&limit=1`);const allow=s?.[0]?.allow_negative_stock===true;const r=await global.rest('retail_inventory_balances',`select=product_id,quantity,track_inventory&branch_id=eq.${b}&track_inventory=eq.true`);const neg=(r||[]).filter(x=>Number(x.quantity)<-0.0005);return {status:!allow&&neg.length?'FAIL':'PASS',detail:`allow_negative=${allow}; negative=${neg.length}`}},true);
 await test('Inventory Movements Schema',async()=>{const b=currentBranch();const r=await global.rest('retail_inventory_movements',`select=id,movement_type,quantity_delta,balance_after,product_id&branch_id=eq.${b}&order=id.desc&limit=20`);return {status:Array.isArray(r)?'PASS':'FAIL',detail:`movements=${r?.length||0}`}});
 await test('Goods Receipt Schema',async()=>{const b=currentBranch();const r=await global.rest('retail_goods_receipts',`select=id,purchase_order_id,branch_id,supplier_id&branch_id=eq.${b}&limit=20`);return {status:Array.isArray(r)?'PASS':'FAIL',detail:`goods_receipts=${r?.length||0}`}});
 render();
}
function render(){const page=$('#page');if(!page)return;const title=$('#pageTitle');if(title)title.textContent='Beta26 UI & Delivery Test';page.innerHTML=`<div class="panel"><div class="section-head"><div><h2>🧪 Beta26 UI & Delivery Acceptance</h2><p class="muted">Read-Only diagnostics فقط — لا ينشئ أو يعدّل بيانات تشغيل.</p></div></div><div class="inline-actions"><button id="beta26Run" class="primary">▶ تشغيل الاختبار</button><button id="beta26Copy">📋 نسخ UI/Delivery</button><button id="beta26CopyLegacy">📋 نسخ Acceptance القديم</button><button id="beta26CopyCombined">📋 نسخ التقريرين معًا</button></div><div id="beta26UiResults" style="margin-top:12px"></div></div>`;$('#beta26Run').onclick=run;$('#beta26Copy').onclick=()=>copy(textReport(),'تم نسخ UI/Delivery');$('#beta26CopyLegacy').onclick=async()=>{const a=global.__SharawlaBeta23Acceptance;if(!a)return global.toast?.('Acceptance القديم غير محمل');await copy(JSON.stringify({version:a.version,read_only:a.results,transactional:a.txResults},null,2),'تم نسخ Acceptance القديم')};$('#beta26CopyCombined').onclick=async()=>copy(await combinedReport(),'تم نسخ التقريرين معًا');renderResults()}
function ensureNav(){const nav=$('#nav');if(!nav||$('#beta26UiNav'))return;const b=document.createElement('button');b.id='beta26UiNav';b.type='button';b.textContent='🧪 فحص UI والدليفري';nav.insertBefore(b,$('#logoutMenuBtn')||null);b.onclick=render}
new MutationObserver(ensureNav).observe(document.body,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureNav,{once:true});else ensureNav();
global.__SharawlaBeta26UiDelivery={run,rows,betaLock,render};
})(window);
