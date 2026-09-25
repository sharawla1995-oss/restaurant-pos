(function(global){
'use strict';
const VERSION='10.5.4-beta.58.29',R=()=>global.__SharawlaAcceptanceRegistry;
const text=v=>String(v??'').trim(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),uuid=()=>global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const net=()=>global.__SharawlaAcceptanceNetworkLab;
async function event(tx){for(let i=0;i<40;i++){const e=await global.topBurgerDesktop?.offlineV2?.event?.(tx);if(e)return e;await sleep(75)}return null}
async function sync(tx){for(let i=0;i<60;i++){try{await global.SharawlaOfflineV2Transport?.syncNow?.()}catch{}const e=await event(tx);if(e?.status==='synced')return e;if(['dead_letter','conflict','blocked'].includes(text(e?.status)))throw new Error(`terminal ${e.status}: ${e.last_error_code||''} ${e.last_error_message||''}`);await sleep(150)}throw new Error('offline event did not sync')}
async function receipt(tx){return await global.rest('offline_v2_server_receipts',`select=client_tx_id,operation_type,rpc_name,server_entity_id&client_tx_id=eq.${encodeURIComponent(tx)}&limit=2`)||[]}
async function ownerReceipt(tx){return await global.rest('offline_customer_delivery_receipts_v1',`select=client_tx_id,operation_type,entity_id&client_tx_id=eq.${encodeURIComponent(tx)}&limit=2`)||[]}
async function durable(name,payload,tx){let err=null;await net().enable('offline',{run_id:'offline-customer-delivery'});try{await global.SharawlaOfflineV2Transport.commitRpc(name,{...payload,p_client_tx_id:tx})}catch(e){err=e}finally{await net().disable('offline-durable-commit')}if(err&&!/fetch|network|offline|deferred/i.test(text(err?.message||err))&&!err?.offline_v2_status)throw err;const e=await event(tx);if(!e||!['pending','retryable'].includes(text(e.status)))throw new Error(`durable event missing: ${name} / ${e?.status||'missing'}`);return e}
async function customer(ctx){
 const marker=`ACC-${String(ctx.run_id).slice(-8)}-${Date.now().toString().slice(-5)}`,phone='010'+String(Date.now()).slice(-8),tx=uuid();
 await durable('offline_customer_create_v1',{p_name:marker,p_phone:phone,p_area:'Acceptance',p_address:'Offline',p_notes:'SHARAWLA_ACCEPTANCE'},tx);
 const done=await sync(tx),tr=await receipt(tx),own=await ownerReceipt(tx);
 if(tr.length!==1||own.length!==1||tr[0].operation_type!=='customer_create'||tr[0].rpc_name!=='offline_customer_create_v1')throw new Error('customer create receipts mismatch');
 const cid=Number(tr[0].server_entity_id);if(!cid)throw new Error('customer server id missing');
 const rows=await global.rest('customers',`select=id,name,phone&id=eq.${cid}&limit=1`);if(rows?.length!==1||rows[0].name!==marker)throw new Error('customer cloud reconciliation mismatch');
 await global.SharawlaOfflineV2Transport.syncNow();if((await receipt(tx)).length!==1||(await ownerReceipt(tx)).length!==1)throw new Error('customer replay duplicated');
 return {status:'PASS',detail:`customer=${cid}; seq=${done.device_sequence}; receipts=1; replay=stable`,evidence:{customer_id:cid,client_tx_id:tx,device_sequence:done.device_sequence}};
}
async function driver(ctx){
 const orders=await global.rest('orders','select=id,branch_id,status,order_type,driver_id&order_type=eq.delivery&status=eq.ready&order=id.desc&limit=20');let o=null,d=null;
 for(const x of orders||[]){const ds=await global.rest('delivery_drivers',`select=id,branch_id,active&branch_id=eq.${Number(x.branch_id)}&active=eq.true&limit=1`);if(ds?.[0]){o=x;d=ds[0];break}}
 if(!o||!d)throw new Error('ready delivery order + active driver required');
 const tx=uuid();await durable('offline_delivery_assign_driver_v1',{p_order_id:Number(o.id),p_driver_id:Number(d.id)},tx);
 const done=await sync(tx),tr=await receipt(tx),own=await ownerReceipt(tx),cloud=(await global.rest('orders',`select=id,status,driver_id,assigned_at&id=eq.${Number(o.id)}&limit=1`))?.[0];
 if(tr.length!==1||own.length!==1||tr[0].operation_type!=='delivery_assign_driver'||tr[0].rpc_name!=='offline_delivery_assign_driver_v1')throw new Error('driver assignment receipts mismatch');
 if(text(cloud?.status)!=='out_for_delivery'||Number(cloud?.driver_id)!==Number(d.id))throw new Error('driver assignment cloud state mismatch');
 await global.SharawlaOfflineV2Transport.syncNow();if((await receipt(tx)).length!==1||(await ownerReceipt(tx)).length!==1)throw new Error('driver assignment replay duplicated');
 return {status:'PASS',detail:`order=${o.id}; driver=${d.id}; seq=${done.device_sequence}; replay=stable`,evidence:{order_id:o.id,driver_id:d.id,client_tx_id:tx,device_sequence:done.device_sequence}};
}
async function delivered(ctx){
 const rows=await global.rest('orders','select=id,total,payment_method,status,driver_id,delivery_cash_custody_amount&order_type=eq.delivery&status=eq.out_for_delivery&driver_id=not.is.null&order=id.desc&limit=20');const o=(rows||[]).find(x=>Number(x.id)>0&&text(x.payment_method)&&text(x.payment_method)!=='mixed');if(!o)throw new Error('out_for_delivery order required');
 const tx=uuid();await durable('order_status_apply_offline_v2',{p_order_id:Number(o.id),p_target_status:'delivered'},tx);const done=await sync(tx);
 const cloud=(await global.rest('orders',`select=id,total,payment_method,payment_status,status,driver_id,delivery_cash_custody_amount,delivered_at&id=eq.${Number(o.id)}&limit=1`))?.[0];
 const pays=await global.rest('order_payments',`select=order_id,method,amount&order_id=eq.${Number(o.id)}`),events=await global.rest('delivery_payment_events',`select=client_tx_id,order_id,new_method,custody_after&client_tx_id=eq.${encodeURIComponent(tx)}`),tr=await receipt(tx);
 const expected=text(cloud.payment_method)==='cash'?Number(cloud.total):0;
 if(text(cloud.status)!=='delivered'||text(cloud.payment_status)!=='confirmed')throw new Error('offline delivery final state mismatch');
 if(pays.length!==1||text(pays[0].method)!==text(cloud.payment_method)||Math.abs(Number(pays[0].amount)-Number(cloud.total))>.005)throw new Error('offline delivery payment semantics mismatch');
 if(events.length!==1||Math.abs(Number(events[0].custody_after)-expected)>.005||Math.abs(Number(cloud.delivery_cash_custody_amount)-expected)>.005)throw new Error('offline delivery custody semantics mismatch');
 if(tr.length!==1||tr[0].rpc_name!=='order_status_apply_offline_v2')throw new Error('offline delivery receipt mismatch');
 await global.SharawlaOfflineV2Transport.syncNow();const events2=await global.rest('delivery_payment_events',`select=client_tx_id&client_tx_id=eq.${encodeURIComponent(tx)}`);if(events2.length!==1||(await receipt(tx)).length!==1)throw new Error('offline delivery replay duplicated economics');
 return {status:'PASS',detail:`order=${o.id}; method=${cloud.payment_method}; custody=${expected}; seq=${done.device_sequence}; economic replay=stable`,evidence:{order_id:o.id,client_tx_id:tx,payment_method:cloud.payment_method,custody:expected,device_sequence:done.device_sequence}};
}
function register(){const r=R();if(!r||global.__SharawlaOfflineCustomerDeliveryAcceptanceRegistered)return false;global.__SharawlaOfflineCustomerDeliveryAcceptanceRegistered=true;r.registerMany([
{id:'offline.customer-create-runtime-e2e',name:'Offline Customer Create → Durable → Sync → Cloud → Replay',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['offline.local_first','core.customers'],run:customer},
{id:'offline.delivery-driver-runtime-e2e',name:'Offline Driver Assignment → Durable → Sync → Cloud → Replay',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['offline.local_first','commerce.delivery'],run:driver},
{id:'offline.delivery-economic-runtime-e2e',name:'Offline Delivery Complete → Payment + Custody → Replay',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['offline.local_first','commerce.delivery'],run:delivered}
]);return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
})(window);
