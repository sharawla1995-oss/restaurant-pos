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
async function currentOpen(){const b=Number(global.currentBranchId?.()||0),eid=Number(global.state?.employee?.id||0)||Number(await global.rpc('current_employee_id',{}));const rows=await global.rest('shifts',`select=*&branch_id=eq.${b}&employee_id=eq.${eid}&status=eq.open&closed_at=is.null&order=id.desc&limit=2`);if((rows||[]).length!==1)throw new Error(`focused shift acceptance requires exactly one current open shift; found=${rows?.length||0}`);return rows[0]}
async function lifecycle(ctx){
 const T=global.SharawlaOfflineV2Takeover,close=T?.saveShiftClose,open=T?.saveShiftOpen;
 if(typeof close!=='function'||typeof open!=='function')throw new Error('offline shift owners unavailable');
 const sh=await currentOpen(),opening=Number(sh.opening_cash||0);
 // Use the shift's already persisted summary fields as the close snapshot. This avoids
 // fabricating acceptance accounting values while still exercising the real close owner.
 const metrics={sales:Number(sh.sales_total||0),cash:Number(sh.cash_sales||0),wallet:Number(sh.wallet_sales||0),instapay:Number(sh.instapay_sales||0),exp:Number(sh.expenses_total||0),expected:Number(sh.expected_cash||opening),count:Number(sh.orders_count||0)};
 const actual=Number(sh.expected_cash||opening),closeTx=uuid();let localClose;
 await net().enable('offline',{run_id:ctx.run_id});try{localClose=await close(sh,metrics,actual,closeTx)}finally{await net().disable('offline-shift-close-commit')}
 if(text(localClose?.client_tx_id)!==closeTx||text(localClose?.status)!=='closed')throw new Error('shift close local projection mismatch');
 const closeDurable=await ev(closeTx);if(!closeDurable||!['pending','retryable'].includes(closeDurable.status))throw new Error(`shift close not durable: ${closeDurable?.status||'missing'}`);
 const closeDone=await sync(closeTx),closeAck=ack(closeDone);
 const closed=await global.rest('shifts',`select=id,status,closed_at,client_close_tx_id&client_close_tx_id=eq.${encodeURIComponent(closeTx)}`);
 if(closed.length!==1||text(closed[0].status)!=='closed'||!closed[0].closed_at)throw new Error('shift close cloud persistence mismatch');
 await global.SharawlaOfflineV2Transport?.syncNow?.();const closed2=await global.rest('shifts',`select=id&client_close_tx_id=eq.${encodeURIComponent(closeTx)}`);if(closed2.length!==1)throw new Error('shift close replay duplicated');

 const openTx=uuid();let localOpen;
 await net().enable('offline',{run_id:ctx.run_id});try{localOpen=await open(opening,openTx)}finally{await net().disable('offline-shift-open-commit')}
 if(text(localOpen?.client_tx_id)!==openTx||text(localOpen?.status)!=='open')throw new Error('shift open local projection mismatch');
 const openDurable=await ev(openTx);if(!openDurable||!['pending','retryable'].includes(openDurable.status))throw new Error(`shift open not durable: ${openDurable?.status||'missing'}`);
 const openDone=await sync(openTx),openAck=ack(openDone);
 const opened=await global.rest('shifts',`select=id,status,closed_at,client_open_tx_id,opening_cash&client_open_tx_id=eq.${encodeURIComponent(openTx)}`);
 if(opened.length!==1||text(opened[0].status)!=='open'||opened[0].closed_at)throw new Error('shift open cloud persistence mismatch');
 await global.SharawlaOfflineV2Transport?.syncNow?.();const opened2=await global.rest('shifts',`select=id&client_open_tx_id=eq.${encodeURIComponent(openTx)}`);if(opened2.length!==1)throw new Error('shift open replay duplicated');
 if(closeAck.ok!==true||openAck.ok!==true)throw new Error('shift ACK semantic mismatch');
 return {status:'PASS',detail:`close_shift=${closed[0].id}; close_seq=${closeDone.device_sequence}; open_shift=${opened[0].id}; open_seq=${openDone.device_sequence}; explicit_ack=2; replay=stable`,evidence:{close_tx:closeTx,close_sequence:closeDone.device_sequence,closed_shift_id:closed[0].id,open_tx:openTx,open_sequence:openDone.device_sequence,opened_shift_id:opened[0].id}};
}
function register(){const r=R();if(!r||global.__SharawlaOfflineShiftAcceptanceRegistered)return false;global.__SharawlaOfflineShiftAcceptanceRegistered=true;r.register({id:'offline.shift-lifecycle-runtime-e2e',name:'Offline Shift Close → ACK → Replay → Open → ACK → Replay',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['offline.local_first','core.shifts'],run:lifecycle});return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
})(window);
