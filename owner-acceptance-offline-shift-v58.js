(function(global){
'use strict';
// SH-0007 sandbox focused acceptance for the existing Offline V2 Shift Close/Open owners.
// The test performs one real sandbox shift rollover: close the current acceptance shift,
// prove durable+ACK+replay, then open its replacement Offline and prove the same invariants.
const VERSION='10.5.4-beta.58.29';
const R=()=>global.__SharawlaAcceptanceRegistry;
const text=v=>String(v??'').trim(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const uuid=()=>global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const net=()=>global.__SharawlaAcceptanceNetworkLab;
async function ev(tx){for(let i=0;i<40;i++){const r=await global.topBurgerDesktop?.offlineV2?.event?.(tx);if(r)return r;await sleep(75)}return null}
async function sync(tx){for(let i=0;i<60;i++){try{await global.SharawlaOfflineV2Transport?.syncNow?.()}catch{}const r=await ev(tx);if(r?.status==='synced')return r;if(['dead_letter','conflict','blocked'].includes(text(r?.status)))throw new Error(`terminal ${r.status}: ${r.last_error_code||''} ${r.last_error_message||''}`);await sleep(150)}throw new Error('offline shift event did not sync')}
function ack(e){const a=e?.server_ack;if(!a||a.acknowledged!==true||String(a.client_tx_id||'')!==String(e?.client_tx_id||e?.envelope?.client_tx_id||''))throw new Error('explicit server ACK missing');return a}
async function currentEmployee(){
  const eid=Number(await global.rpc('current_employee_id',{}));
  if(!eid)throw new Error('focused shift acceptance employee missing');
  return eid;
}
async function pickIsolatedBranch(employeeId,originalBranch){
  if(typeof global.allowedBranchIds!=='function')throw new Error('focused shift acceptance branch access helper missing');
  const allowed=[...new Set((global.allowedBranchIds()||[]).map(Number))]
    .filter(id=>id&&id!==Number(originalBranch));
  for(const branchId of allowed){
    const rows=await global.rest('shifts',`select=id&branch_id=eq.${branchId}&employee_id=eq.${employeeId}&status=eq.open&closed_at=is.null&limit=1`);
    if(!(rows||[]).length)return branchId;
  }
  throw new Error('focused shift acceptance requires an accessible isolated branch with zero open shifts');
}
function switchBranch(branchId){
  if(typeof global.selectBranch!=='function'||typeof global.currentBranchId!=='function')
    throw new Error('focused shift acceptance branch switch helper missing');
  global.selectBranch(Number(branchId));
  if(Number(global.currentBranchId())!==Number(branchId))
    throw new Error(`focused shift acceptance branch switch failed: expected=${branchId} actual=${global.currentBranchId()}`);
}
async function directRpc(name,payload){
  if(typeof global.req!=='function')throw new Error('focused shift acceptance direct request helper missing');
  return global.req(`/rest/v1/rpc/${name}`,{method:'POST',body:JSON.stringify(payload)});
}
function metricsFor(sh){
  const opening=Number(sh?.opening_cash||0);
  return {
    sales:Number(sh?.sales_total||0),
    cash:Number(sh?.cash_sales||0),
    wallet:Number(sh?.wallet_sales||0),
    instapay:Number(sh?.instapay_sales||0),
    exp:Number(sh?.expenses_total||0),
    expected:Number(sh?.expected_cash||opening),
    count:Number(sh?.orders_count||0)
  };
}
function metricsPayload(sh){
  const m=metricsFor(sh),actual=Number(sh?.expected_cash||sh?.opening_cash||0);
  return {
    sales_total:m.sales,cash_sales:m.cash,wallet_sales:m.wallet,instapay_sales:m.instapay,
    expenses_total:m.exp,expected_cash:m.expected,cash_difference:Number(actual-m.expected),orders_count:m.count
  };
}
async function cleanupRunShift(tx,ctxRunId){
  if(!tx)return 0;
  const rows=await global.rest('shifts',`select=*&client_open_tx_id=eq.${encodeURIComponent(tx)}&status=eq.open&closed_at=is.null`);
  for(const sh of rows||[]){
    await directRpc('close_pos_shift_idempotent',{
      p_shift_id:Number(sh.id),
      p_closing_cash:Number(sh.expected_cash||sh.opening_cash||0),
      p_metrics:metricsPayload(sh),
      p_client_tx_id:`${ctxRunId}-P15-CLEANUP-${sh.id}`
    });
  }
  return (rows||[]).length;
}
async function lifecycle(ctx){
  const T=global.SharawlaOfflineV2Takeover,close=T?.saveShiftClose,open=T?.saveShiftOpen;
  if(typeof close!=='function'||typeof open!=='function')throw new Error('offline shift owners unavailable');
  const originalBranch=Number(global.currentBranchId?.()||0);
  if(!originalBranch)throw new Error('focused shift acceptance current branch missing');
  const employeeId=await currentEmployee();
  const sandboxBranch=await pickIsolatedBranch(employeeId,originalBranch);
  const seedTx=`${ctx.run_id}-P15-SEED`,closeTx=uuid(),openTx=uuid();
  let result=null,primaryError=null;
  const cleanupErrors=[];
  try{
    switchBranch(sandboxBranch);
    const seed=await directRpc('open_pos_shift_idempotent',{
      p_branch_id:sandboxBranch,p_opening_cash:0,p_client_tx_id:seedTx
    });
    if(!seed||Number(seed.branch_id)!==sandboxBranch||Number(seed.employee_id)!==employeeId||text(seed.status)!=='open')
      throw new Error('focused shift acceptance isolated seed open mismatch');

    const metrics=metricsFor(seed),actual=Number(seed.expected_cash||seed.opening_cash||0);
    let localClose;
    await net().enable('offline',{run_id:ctx.run_id});
    try{localClose=await close(seed,metrics,actual,closeTx)}
    finally{await net().disable('offline-shift-close-commit')}
    if(text(localClose?.client_tx_id)!==closeTx||text(localClose?.status)!=='closed')
      throw new Error('shift close local projection mismatch');
    const closeDurable=await ev(closeTx);
    if(!closeDurable||!['pending','retryable'].includes(closeDurable.status))
      throw new Error(`shift close not durable: ${closeDurable?.status||'missing'}`);
    const closeDone=await sync(closeTx),closeAck=ack(closeDone);
    const closed=await global.rest('shifts',`select=id,status,closed_at,client_close_tx_id&client_close_tx_id=eq.${encodeURIComponent(closeTx)}`);
    if(closed.length!==1||text(closed[0].status)!=='closed'||!closed[0].closed_at)
      throw new Error('shift close cloud persistence mismatch');
    await global.SharawlaOfflineV2Transport?.syncNow?.();
    const closed2=await global.rest('shifts',`select=id&client_close_tx_id=eq.${encodeURIComponent(closeTx)}`);
    if(closed2.length!==1)throw new Error('shift close replay duplicated');

    let localOpen;
    await net().enable('offline',{run_id:ctx.run_id});
    try{localOpen=await open(0,openTx)}
    finally{await net().disable('offline-shift-open-commit')}
    if(text(localOpen?.client_tx_id)!==openTx||text(localOpen?.status)!=='open')
      throw new Error('shift open local projection mismatch');
    const openDurable=await ev(openTx);
    if(!openDurable||!['pending','retryable'].includes(openDurable.status))
      throw new Error(`shift open not durable: ${openDurable?.status||'missing'}`);
    const openDone=await sync(openTx),openAck=ack(openDone);
    const opened=await global.rest('shifts',`select=id,status,closed_at,client_open_tx_id,opening_cash&client_open_tx_id=eq.${encodeURIComponent(openTx)}`);
    if(opened.length!==1||text(opened[0].status)!=='open'||opened[0].closed_at)
      throw new Error('shift open cloud persistence mismatch');
    await global.SharawlaOfflineV2Transport?.syncNow?.();
    const opened2=await global.rest('shifts',`select=id&client_open_tx_id=eq.${encodeURIComponent(openTx)}`);
    if(opened2.length!==1)throw new Error('shift open replay duplicated');
    if(closeAck.ok!==true||openAck.ok!==true)throw new Error('shift ACK semantic mismatch');

    result={
      status:'PASS',
      detail:`sandbox_branch=${sandboxBranch}; close_shift=${closed[0].id}; close_seq=${closeDone.device_sequence}; open_shift=${opened[0].id}; open_seq=${openDone.device_sequence}; explicit_ack=2; replay=stable; cleanup=closed`,
      evidence:{
        sandbox_branch_id:sandboxBranch,seed_open_tx:seedTx,close_tx:closeTx,close_sequence:closeDone.device_sequence,
        closed_shift_id:closed[0].id,open_tx:openTx,open_sequence:openDone.device_sequence,opened_shift_id:opened[0].id
      }
    };
  }catch(e){primaryError=e}
  finally{
    try{await net()?.disable?.('offline-shift-focused-finally')}catch(e){cleanupErrors.push(`network:${e?.message||e}`)}
    try{await cleanupRunShift(openTx,ctx.run_id)}catch(e){cleanupErrors.push(`open:${e?.message||e}`)}
    try{await cleanupRunShift(seedTx,ctx.run_id)}catch(e){cleanupErrors.push(`seed:${e?.message||e}`)}
    try{
      if(Number(global.currentBranchId?.()||0)!==originalBranch)switchBranch(originalBranch);
    }catch(e){cleanupErrors.push(`branch:${e?.message||e}`)}
    try{global.document?.querySelector?.('#ownerDiagnosticsNav')?.click?.()}catch{}
  }
  if(primaryError)throw primaryError;
  if(cleanupErrors.length)throw new Error(`focused shift acceptance cleanup failed: ${cleanupErrors.join(' | ')}`);
  const leaked=await global.rest('shifts',`select=id&branch_id=eq.${sandboxBranch}&employee_id=eq.${employeeId}&status=eq.open&closed_at=is.null&limit=1`);
  if((leaked||[]).length)throw new Error('focused shift acceptance isolated branch leaked an open shift');
  return result;
}
function register(){const r=R();if(!r||global.__SharawlaOfflineShiftAcceptanceRegistered)return false;global.__SharawlaOfflineShiftAcceptanceRegistered=true;r.register({id:'offline.shift-lifecycle-runtime-e2e',name:'Offline Shift Close → ACK → Replay → Open → ACK → Replay',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['offline.local_first','core.shifts'],run:lifecycle});return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
})(window);
