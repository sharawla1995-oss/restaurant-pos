(function(global){
'use strict';
// Focused SH-0007 acceptance: real durable Offline V2 order-status TX under synthetic HTTP 503,
// then automatic retry recovery and explicit server idempotent replay proof.
const VERSION='10.5.4-beta.58.29';
const R=()=>global.__SharawlaAcceptanceRegistry;
const text=v=>String(v??'').trim(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const uuid=()=>global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const net=()=>global.__SharawlaAcceptanceNetworkLab;
async function ev(tx){for(let i=0;i<40;i++){const r=await global.topBurgerDesktop?.offlineV2?.event?.(tx);if(r)return r;await sleep(75)}return null}
async function waitSynced(tx){for(let i=0;i<60;i++){try{await global.SharawlaOfflineV2Transport?.syncNow?.()}catch{}const r=await ev(tx);if(r?.status==='synced')return r;if(['dead_letter','conflict','blocked'].includes(text(r?.status)))throw new Error(`HTTP503 recovery terminal ${r.status}: ${r.last_error_code||''} ${r.last_error_message||''}`);await sleep(250)}throw new Error('HTTP503 recovery did not reach synced')}
function ack(e){const a=e?.server_ack;if(!a||a.acknowledged!==true||text(a.client_tx_id)!==text(e?.client_tx_id||e?.envelope?.client_tx_id))throw new Error('HTTP503 recovery explicit ACK missing');return a}
async function serverOrder(id){const r=await global.rest('orders',`select=id,status&id=eq.${Number(id)}&limit=1`);return r?.[0]||null}
function replayEvent(e){const b=e?.envelope||{};return {...b,client_tx_id:text(e?.client_tx_id||b.client_tx_id),device_id:text(e?.device_id||b.device_id),device_sequence:Number(e?.device_sequence||b.device_sequence||0),business_id:text(e?.business_id||b.business_id),branch_id:Number(e?.branch_id??b.branch_id??0),employee_id:Number(e?.employee_id??b.employee_id??0),operation_type:text(e?.operation_type||b.operation_type),entity_type:text(e?.entity_type||b.entity_type),local_entity_id:e?.local_entity_id??b.local_entity_id??null,local_shift_id:e?.local_shift_id??b.local_shift_id??null,depends_on_tx_id:e?.depends_on_tx_id??b.depends_on_tx_id??null,created_local_at:e?.created_local_at||b.created_local_at,protocol_version:Number(e?.protocol_version||b.protocol_version||2),schema_version:Number(e?.schema_version||b.schema_version||2),payload:b.payload,payload_digest:text(e?.payload_digest||b.payload_digest)}}
async function run(ctx){
 const owner=global.SharawlaOfflineV2Takeover?.saveOrderStatus,transport=global.SharawlaOfflineV2Transport,lab=net();
 if(typeof owner!=='function'||typeof transport?.syncNow!=='function')throw new Error('Offline V2 order-status transport unavailable');
 if(typeof lab?.enable!=='function'||typeof lab?.disable!=='function')throw new Error('Acceptance Network Lab unavailable');
 const bid=Number(global.currentBranchId?.()||0);if(!bid)throw new Error('active branch required');
 const fx=await global.rpc('sharawla_beta58_offline_status_fixture_v1',{p_run_id:ctx.run_id,p_branch_id:bid,p_kind:'status'});
 const orderId=Number(fx?.order_id);if(!orderId)throw new Error('HTTP503 isolated order fixture incomplete');
 const before=await serverOrder(orderId);if(text(before?.status)!=='new')throw new Error(`HTTP503 fixture status invalid: ${before?.status||'missing'}`);
 const tx=uuid(),target='preparing';let failed=null,faultSync=null;
 await lab.enable('http500',{run_id:ctx.run_id});
 try{
   const local=await owner(orderId,target,tx);if(text(local?.client_tx_id)!==tx)throw new Error('HTTP503 durable owner TX mismatch');
   const durable=await ev(tx);if(!durable||!['pending','retryable'].includes(text(durable.status)))throw new Error(`HTTP503 event not durable: ${durable?.status||'missing'}`);
   try{faultSync=await transport.syncNow()}catch(e){faultSync={threw:text(e?.code||e?.message||e)}}
   failed=await ev(tx);
   if(text(failed?.status)!=='retryable')throw new Error(`HTTP503 event did not become retryable: ${failed?.status||'missing'}`);
   if(Number(failed?.attempts||0)<1)throw new Error('HTTP503 retry attempt was not recorded');
   const faultText=`${failed?.last_error_code||''} ${failed?.last_error_message||''}`;
   if(!/503/.test(faultText))throw new Error(`HTTP503 evidence missing from retryable row: ${faultText}`);
 }finally{await lab.disable('http503-focused-recovery')}
 const unchanged=await serverOrder(orderId);if(text(unchanged?.status)!=='new')throw new Error('HTTP503 partial failure unexpectedly committed server mutation');
 const done=await waitSynced(tx),a=ack(done);
 const cloud=await serverOrder(orderId);if(text(cloud?.status)!==target)throw new Error(`HTTP503 recovery cloud mismatch: ${cloud?.status||'missing'}`);
 const replay=await global.rpc('sharawla_offline_v2_apply_event',{p_event:replayEvent(done)});
 if(replay?.ok!==true||replay?.duplicate!==true||replay?.idempotent_replay!==true)throw new Error('HTTP503 server exactly-once replay contract missing');
 if(text(replay?.client_tx_id)!==tx||text(replay?.server_event_id)!==text(a.server_event_id)||text(replay?.server_entity_id)!==text(a.server_entity_id))throw new Error('HTTP503 replay identity changed');
 const cloud2=await serverOrder(orderId);if(text(cloud2?.status)!==target)throw new Error('HTTP503 replay changed server state');
 return {status:'PASS',detail:`order=${orderId}; http_503=retryable; attempts=${failed.attempts}; seq=${done.device_sequence}; recovery=synced; exactly_once=server-receipt-replay; replay=same-event`,evidence:{order_id:orderId,client_tx_id:tx,device_sequence:done.device_sequence,http_503_error_code:failed.last_error_code,http_503_attempts:failed.attempts,fault_sync:faultSync,server_event_id:a.server_event_id,replay_duplicate:true}};
}
function register(){const r=R();if(!r||global.__SharawlaOfflineHttp503AcceptanceRegistered)return false;global.__SharawlaOfflineHttp503AcceptanceRegistered=true;r.register({id:'offline.http503-recovery-runtime-e2e',name:'Offline HTTP 503 → Durable Retryable → Recovery → Exactly Once',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['offline.local_first'],run});return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
global.__SharawlaOfflineHttp503Acceptance=Object.freeze({version:VERSION,register,run});
})(window);
