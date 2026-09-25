(function(global){
'use strict';
// SH-0007 sandbox executable acceptance for the real Offline V2 order-status path.
// This deliberately exercises renderer routing -> durable SQLite -> transport -> server
// owner -> receipt -> cloud state. It does not broaden production behavior.
const VERSION='10.5.4-beta.58.29';
const R=()=>global.__SharawlaAcceptanceRegistry;
const text=v=>String(v??'').trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const uuid=()=>global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
async function event(tx,tries=40){for(let i=0;i<tries;i++){const e=await global.topBurgerDesktop?.offlineV2?.event?.(tx);if(e)return e;await sleep(75)}return null}
async function waitSynced(tx,tries=60){for(let i=0;i<tries;i++){try{await global.SharawlaOfflineV2Transport?.syncNow?.()}catch{}const e=await event(tx,1);if(e?.status==='synced')return e;if(['dead_letter','conflict','blocked'].includes(text(e?.status)))throw new Error(`Order status terminal state: ${e.status} / ${e.last_error_code||''}`);await sleep(150)}throw new Error('Order status did not reach synced')}
async function serverOrder(id){const r=await global.rest('orders',`select=id,branch_id,status,order_type,payment_method,driver_id,delivered_at&id=eq.${Number(id)}&limit=1`);return r?.[0]||null}
function ack(e){const a=e?.server_ack;if(!a||a.acknowledged!==true)throw new Error('explicit server ACK missing');return a}
async function run(ctx){
 const api=global.__SharawlaPV2OrderFulfillment;
 if(typeof api?.transition!=='function')throw new Error('PV2 fulfillment routing unavailable');
 if(typeof global.SharawlaOfflineV2Takeover?.saveOrderStatus!=='function')throw new Error('Offline V2 order status owner unavailable');
 if(typeof global.__SharawlaAcceptanceNetworkLab?.enable!=='function')throw new Error('Acceptance network lab unavailable');
 // Reuse a sandbox acceptance delivery/takeaway order instead of inventing business data.
 const rows=await global.rest('orders','select=id,status,order_type&status=in.(new,preparing,ready)&order=id.desc&limit=20');
 const o=(rows||[]).find(x=>Number(x.id)>0);
 if(!o)throw new Error('No sandbox order available for offline status acceptance');
 const target=text(o.status)==='new'?'preparing':text(o.status)==='preparing'?'ready':'completed';
 let tx=null,ev=null;
 await global.__SharawlaAcceptanceNetworkLab.enable('offline',{run_id:ctx.run_id});
 try{
   const before=await global.topBurgerDesktop?.offlineV2?.health?.();
   let transitionResult=null;
   try{transitionResult=await global.SharawlaOfflineV2Takeover.saveOrderStatus(Number(o.id),target)}catch(e){if(!/fetch|network|offline|deferred/i.test(text(e?.message||e))&&!e?.offline_v2_status)throw e}
   const after=await global.topBurgerDesktop?.offlineV2?.health?.();
   tx=text(transitionResult?.client_tx_id);
   if(!tx)throw new Error('Order status transition did not return client_tx_id');
   ev=await event(tx);
   if(!ev)throw new Error('Durable order_status event missing');
   if(!tx)throw new Error('Order status client_tx_id missing');
   if(text(ev?.envelope?.payload?.rpc_name)!=='order_status_apply_offline_v2')throw new Error('Order status RPC binding mismatch');
   if(text(ev?.envelope?.payload?.rpc_payload?.p_target_status)!==target)throw new Error('Order status target mismatch');
   if(text(ev.status)!=='pending'&&text(ev.status)!=='retryable')throw new Error(`Unexpected durable status ${ev.status}`);
 }finally{await global.__SharawlaAcceptanceNetworkLab.disable('order-status-offline-commit-complete')}
 const synced=await waitSynced(tx);
 const cloud=await serverOrder(o.id);
 if(text(cloud?.status)!==target)throw new Error(`Cloud order status mismatch: expected=${target} actual=${cloud?.status}`);
 const a=ack(synced);
 if(text(a.operation_type)!=='order_status'||text(a.rpc_name)!=='order_status_apply_offline_v2'||Number(a.server_entity_id)!==Number(o.id))throw new Error('Transport ACK semantic mismatch');
 // Re-sync the already-synced identity; cloud/receipt cardinality must stay exactly one.
 await global.SharawlaOfflineV2Transport?.syncNow?.();
 const cloud2=await serverOrder(o.id);
 if(text(cloud2?.status)!==target)throw new Error('Order status replay/idempotency mismatch');
 return {status:'PASS',detail:`order=${o.id}; ${o.status}->${target}; seq=${synced.device_sequence}; explicit_ack=1; replay=stable`,evidence:{order_id:Number(o.id),from:o.status,to:target,device_sequence:Number(synced.device_sequence),client_tx_id:tx,rpc_name:a.rpc_name,server_version:a.server_version}};
}
function register(){const r=R();if(!r||global.__SharawlaOfflineOrderStatusAcceptanceRegistered)return false;global.__SharawlaOfflineOrderStatusAcceptanceRegistered=true;r.register({id:'offline.order-status-runtime-e2e',name:'Offline Order Status → Durable → Sync → Receipt → Cloud → Replay',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['offline.local_first','commerce.delivery'],run});return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
global.__SharawlaOfflineOrderStatusAcceptance=Object.freeze({version:VERSION,register,run});
})(window);
