(function(global){
'use strict';
const VERSION='10.5.4-beta.51';
const EXPECTED_SUPPORT='SH-0007';
const EXPECTED_BUSINESS='91826502-590e-4afa-8826-2c0f4b99c490';
const EXPECTED_HOST='xihcxydjnzemflhedzor.supabase.co';
const ARCHIVE_KEY='sharawlaBeta49AcceptanceResidueArchive';
const text=v=>String(v??'').trim();
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let activationBusy=false;
let shadowStateOwned=false;
let previousWindowState;
function ownerOpen(){try{return global.__SharawlaOwnerDiagnostics?.isUnlocked?.()===true}catch{return false}}
function branch(){try{return num(typeof currentBranchId==='function'?currentBranchId():global.currentBranchId?.(),0)}catch{return 0}}
async function currentEmployeeId(){
 try{const x=await global.rpc('current_employee_id',{});return num(x?.id??x,0)}catch{return 0}
}
async function employeeRow(id){
 if(!id||typeof global.rest!=='function')return null;
 try{return (await global.rest('employees',`select=id,name,username,role& id=eq.${id}&limit=1`.replace('& ', '&')))?.[0]||null}catch{return null}
}
async function ensureAcceptanceContext(){
 const employeeId=await currentEmployeeId();const branchId=branch();
 if(employeeId<=0||branchId<=0)throw new Error(`Acceptance context unavailable: employee=${employeeId}; branch=${branchId}`);
 const row=await employeeRow(employeeId);
 if(!shadowStateOwned){previousWindowState=Object.prototype.hasOwnProperty.call(global,'state')?global.state:undefined;shadowStateOwned=true}
 const prior=(global.state&&typeof global.state==='object')?global.state:{};
 global.state={...prior,activeBranchId:branchId,employee:{...(prior.employee||{}),...(row||{}),id:employeeId}};
 global.__SharawlaAcceptanceContext=Object.freeze({employee_id:employeeId,branch_id:branchId,employee:row||{id:employeeId},updated_at:new Date().toISOString()});
 return global.__SharawlaAcceptanceContext;
}
function clearAcceptanceContext(){
 if(!shadowStateOwned)return;
 if(previousWindowState===undefined){try{delete global.state}catch{global.state=undefined}}else global.state=previousWindowState;
 shadowStateOwned=false;previousWindowState=undefined;try{delete global.__SharawlaAcceptanceContext}catch{}
}
async function legacyQueue(){
 try{if(typeof offlineQueue==='function')return (await offlineQueue())||[]}catch{}
 try{if(typeof global.offlineQueue==='function')return (await global.offlineQueue())||[]}catch{}
 try{return (await global.odbGet?.('queue'))||[]}catch{return[]}
}
async function persistLegacyQueue(q){
 if(!Array.isArray(q))throw new Error('Legacy queue must be an array');
 try{if(typeof setOfflineQueue==='function'){await setOfflineQueue(q);return q}}catch(e){console.warn('Beta49 lexical setOfflineQueue failed',e)}
 if(typeof global.setOfflineQueue==='function'){await global.setOfflineQueue(q);return q}
 if(typeof global.odbSet==='function'){await global.odbSet('queue',q);return q}
 throw new Error('Legacy queue persistence API unavailable');
}
function mismatchError(v){
 const m=text(v).toLowerCase();
 return /بيانات الموظف غير مطابقة للجلسة الحالية|الموظف غير مطابق(?:ة)? للجلسة|employee.*(?:session|shift).*mismatch|session.*employee.*mismatch|shift.*employee.*mismatch|الوردية.*غير.*مطابق.*الموظف|الموظف.*غير.*مطابق.*الوردية/.test(m);
}
async function classifyLegacyMismatches(){
 const q=await legacyQueue();let changed=0;
 for(const j of q){
  if(j?._sync?.status==='conflict')continue;
  if(!mismatchError(j?._sync?.last_error))continue;
  j._sync={...(j._sync||{}),status:'conflict',conflict_reason:'employee_or_shift_context_mismatch',classified_at:new Date().toISOString()};changed++;
  try{await global.topBurgerDesktop?.operations?.status?.(j.client_tx_id,'conflict',j._sync.last_error||'Employee/shift context mismatch')}catch{}
 }
 if(changed)await persistLegacyQueue(q);
 return {changed,conflicts:q.filter(x=>x?._sync?.status==='conflict').length,total:q.length};
}
function acceptanceResidue(job){
 const status=text(job?._sync?.status).toLowerCase();if(!['failed','conflict'].includes(status))return false;
 const tx=text(job?.client_tx_id);if(!/^ACC-/i.test(tx))return false;
 let raw='';try{raw=JSON.stringify(job)}catch{}
 return /SHARAWLA_ACCEPTANCE:|SHARAWLA ACCEPTANCE|ACC ADV|Acceptance automated/i.test(raw);
}
function readArchive(){try{const x=JSON.parse(localStorage.getItem(ARCHIVE_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
async function cleanupAcceptanceResidue(){
 const q=await legacyQueue(),remove=q.filter(acceptanceResidue);if(!remove.length)return {removed:0,tx_ids:[]};
 const ids=new Set(remove.map(x=>text(x.client_tx_id)));const keep=q.filter(x=>!ids.has(text(x.client_tx_id)));
 const archive=readArchive();archive.push({at:new Date().toISOString(),version:VERSION,jobs:remove});localStorage.setItem(ARCHIVE_KEY,JSON.stringify(archive.slice(-20)));
 await persistLegacyQueue(keep);
 for(const j of remove){try{await global.topBurgerDesktop?.operations?.status?.(j.client_tx_id,'discarded','Beta49 acceptance residue archived before V2 takeover')}catch{}}
 return {removed:remove.length,tx_ids:[...ids]};
}
function connection(){try{return JSON.parse(localStorage.getItem('sharawlaBusinessConnectionV1')||'null')}catch{return null}}
function runtimeCfg(){try{return JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'null')}catch{return null}}
async function preflight(){
 const reasons=[];const st=await global.topBurgerDesktop?.licenseState?.get?.();const c=connection();let host='';try{host=new URL(c?.url||'').hostname}catch{}
 const takeover=await global.topBurgerDesktop?.offlineV2?.takeoverState?.();const q=await legacyQueue();const native=await global.topBurgerDesktop?.offlineV2?.outbox?.(null);const employeeId=await currentEmployeeId();const branchId=branch();const rc=runtimeCfg();
 const support=text(st?.support_code);const business=text(st?.business_id);const canonical=text(st?.device_fingerprint);
 if(support!==EXPECTED_SUPPORT)reasons.push(`support=${support||'missing'}`);
 if(business!==EXPECTED_BUSINESS)reasons.push(`business=${business||'missing'}`);
 if(host!==EXPECTED_HOST)reasons.push(`host=${host||'missing'}`);
 if(!canonical)reasons.push('canonical fingerprint missing');
 if(text(rc?.pos_profile||rc?.profile)!=='retail')reasons.push(`profile=${text(rc?.pos_profile||rc?.profile)||'missing'}`);
 if(employeeId<=0)reasons.push(`employee=${employeeId}`);if(branchId<=0)reasons.push(`branch=${branchId}`);
 if(!global.SharawlaOfflineV2?.migrateLegacyQueue||!global.SharawlaOfflineV2?.keys)reasons.push('foundation API unavailable');
 if(!global.SharawlaOfflineV2Takeover?.arm||!global.SharawlaOfflineV2Takeover?.prepareMigration||!global.SharawlaOfflineV2Takeover?.activate)reasons.push('takeover API unavailable');
 if(!global.SharawlaOfflineV2Transport?.attestTransport)reasons.push('transport attestation unavailable');
 const conflicts=q.filter(x=>x?._sync?.status==='conflict');const residues=q.filter(acceptanceResidue);
 return {ok:reasons.length===0,reasons,support_code:support,business_id:business,host,profile:text(rc?.pos_profile||rc?.profile),employee_id:employeeId,branch_id:branchId,canonical_pinned:!!canonical,legacy_count:q.length,legacy_conflicts:conflicts.length,legacy_conflict_tx_ids:conflicts.map(x=>text(x.client_tx_id)),acceptance_residue_count:residues.length,acceptance_residue_tx_ids:residues.map(x=>text(x.client_tx_id)),native_outbox_count:Array.isArray(native)?native.length:null,takeover};
}
async function activate(){
 if(activationBusy)throw new Error('Beta49 takeover activation already running');if(!ownerOpen())throw new Error('Owner Diagnostics must be unlocked');activationBusy=true;
 try{
  await ensureAcceptanceContext();await classifyLegacyMismatches();let before=await preflight();if(!before.ok)throw new Error(`Beta49 preflight blocked: ${before.reasons.join(', ')}`);
  const cleanup=await cleanupAcceptanceResidue();await classifyLegacyMismatches();const clean=await preflight();if(!clean.ok)throw new Error(`Beta49 post-cleanup preflight blocked: ${clean.reasons.join(', ')}`);
  const conflictTx=[...clean.legacy_conflict_tx_ids];
  await global.SharawlaOfflineV2Takeover.arm();
  const migration=await global.SharawlaOfflineV2Takeover.prepareMigration();
  const transport=await global.SharawlaOfflineV2Transport.attestTransport();
  const activated=await global.SharawlaOfflineV2Takeover.activate();
  const finalState=await global.topBurgerDesktop.offlineV2.takeoverState();
  if(!(finalState?.active===true&&finalState?.migration_verified===true&&finalState?.transport_ready===true))throw new Error(`V2 takeover verification failed: ${JSON.stringify(finalState)}`);
  const preserved=[];for(const tx of conflictTx){const ev=await global.topBurgerDesktop.offlineV2.event(tx);preserved.push({tx,status:ev?.status||null,error_code:ev?.last_error_code||ev?.envelope?.last_error_code||null})}
  const bad=preserved.filter(x=>x.status!=='conflict');if(bad.length)throw new Error(`Legacy conflict preservation failed: ${bad.map(x=>`${x.tx}:${x.status}`).join(',')}`);
  try{await global.SharawlaOfflineV2Transport.syncNow()}catch(e){console.warn('Beta49 initial V2 sync',e)}
  const result={ok:true,version:VERSION,before,cleanup,migration,transport,activated,final_state:finalState,preserved_conflicts:preserved};
  global.dispatchEvent(new CustomEvent('sharawla-beta49-takeover-activated',{detail:result}));render();return result;
 }finally{activationBusy=false}
}
function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
async function render(){
 if(!ownerOpen())return false;const host=document.querySelector('#ownerDiagnosticsResults')?.parentElement;if(!host)return false;let p=document.querySelector('#beta49TakeoverPanel');if(!p){p=document.createElement('div');p.id='beta49TakeoverPanel';p.className='panel';p.style.marginTop='14px';host.appendChild(p)}
 let s;try{s=await preflight()}catch(e){s={ok:false,reasons:[text(e?.message||e)]}};const t=s.takeover||{};
 p.innerHTML=`<div class="section-head"><div><h3>🛡️ Offline V2 Takeover Safety</h3><p class="muted">Beta50 • SH-0007 فقط • لا يوجد تفعيل تلقائي</p></div><b dir="ltr">${VERSION}</b></div><div class="settings-list compact"><div class="setting-switch"><span><b>Preflight</b></span><span class="status ${s.ok?'success':'danger'}">${s.ok?'PASS':'BLOCKED'}</span></div><div class="setting-switch"><span>Legacy Queue</span><b>${esc(s.legacy_count??'—')} • conflicts=${esc(s.legacy_conflicts??'—')} • residue=${esc(s.acceptance_residue_count??'—')}</b></div><div class="setting-switch"><span>Native Outbox</span><b>${esc(s.native_outbox_count??'—')}</b></div><div class="setting-switch"><span>Takeover</span><b>${t.active?'ACTIVE':t.mode||'disabled'} • migration=${t.migration_verified===true?'yes':'no'} • transport=${t.transport_ready===true?'yes':'no'}</b></div>${s.reasons?.length?`<div class="setting-switch"><span>Blockers</span><small>${esc(s.reasons.join(' • '))}</small></div>`:''}</div><div class="inline-actions"><button type="button" data-b49-preflight>🔎 V2 Preflight</button><button type="button" class="danger" data-b49-activate ${(!s.ok||t.active)?'disabled':''}>🚀 Activate V2 on SH-0007</button></div>`;
 p.querySelector('[data-b49-preflight]').onclick=async e=>{e.currentTarget.disabled=true;try{await ensureAcceptanceContext();const x=await preflight();console.log('Beta49 V2 Preflight',x);global.toast?.(x.ok?'✅ V2 Preflight PASS':`⛔ ${x.reasons.join(' • ')}`)}catch(err){global.toast?.(text(err?.message||err))}finally{await render()}};
 const a=p.querySelector('[data-b49-activate]');if(a)a.onclick=async e=>{if(!confirm('تفعيل Offline Engine V2 على SH-0007 التجريبي فقط؟ سيتم أرشفة بقايا Acceptance المحددة، نسخ Legacy Queue والتحقق منها، ثم تفعيل V2 بعد Transport Attestation.'))return;e.currentTarget.disabled=true;try{const x=await activate();console.log('Beta49 V2 Takeover ACTIVE',x);global.toast?.('✅ Offline Engine V2 ACTIVE على SH-0007')}catch(err){console.error('Beta49 activation failed',err);global.toast?.(`⛔ ${text(err?.message||err)}`)}finally{await render()}};
 return true;
}
function renderSoon(){setTimeout(()=>render().catch(()=>{}),0)}
function onOwner(e){if(e?.detail?.unlocked===true){ensureAcceptanceContext().catch(()=>{});renderSoon()}else if(e?.detail?.unlocked===false)clearAcceptanceContext()}
document.addEventListener('sharawla-owner-diagnostics-change',onOwner);
document.addEventListener('sharawla-owner-diagnostics-rendered',()=>{ensureAcceptanceContext().catch(()=>{});renderSoon()});
global.addEventListener('sharawla-beta48-acceptance-ready',renderSoon);
global.addEventListener('sharawla-beta49-takeover-activated',renderSoon);
setTimeout(()=>classifyLegacyMismatches().catch(()=>{}),1200);
global.__SharawlaBeta49TakeoverSafety=Object.freeze({version:VERSION,preflight,activate,ensureAcceptanceContext,clearAcceptanceContext,classifyLegacyMismatches,cleanupAcceptanceResidue,acceptanceResidue,render});
})(window);
