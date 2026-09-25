(function(global){
'use strict';
const VERSION='10.5.4-beta.58.29',R=()=>global.__SharawlaAcceptanceRegistry;
const text=v=>String(v??'').trim(),sleep=ms=>new Promise(r=>setTimeout(r,ms)),uuid=()=>global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const net=()=>global.__SharawlaAcceptanceNetworkLab;
async function event(tx){for(let i=0;i<40;i++){const e=await global.topBurgerDesktop?.offlineV2?.event?.(tx);if(e)return e;await sleep(75)}return null}
async function sync(tx){for(let i=0;i<60;i++){try{await global.SharawlaOfflineV2Transport?.syncNow?.()}catch{}const e=await event(tx);if(e?.status==='synced')return e;if(['dead_letter','conflict','blocked'].includes(text(e?.status)))throw new Error(`terminal ${e.status}: ${e.last_error_code||''} ${e.last_error_message||''}`);await sleep(150)}throw new Error('offline event did not sync')}
function ack(e){const a=e?.server_ack;if(!a||a.acknowledged!==true)throw new Error('explicit server ACK missing');return a}
async function durable(name,payload,tx){let err=null;await net().enable('offline',{run_id:'offline-customer-delivery'});try{await global.SharawlaOfflineV2Transport.commitRpc(name,{...payload,p_client_tx_id:tx})}catch(e){err=e}finally{await net().disable('offline-durable-commit')}if(err&&!/fetch|network|offline|deferred/i.test(text(err?.message||err))&&!err?.offline_v2_status)throw err;const e=await event(tx);if(!e||!['pending','retryable'].includes(text(e.status)))throw new Error(`durable event missing: ${name} / ${e?.status||'missing'}`);return e}
async function customer(ctx){
 const marker=`ACC-${String(ctx.run_id).slice(-8)}-${Date.now().toString().slice(-5)}`,phone='010'+String(Date.now()).slice(-8),tx=uuid();
 await durable('offline_customer_create_v1',{p_name:marker,p_phone:phone,p_area:'Acceptance',p_address:'Offline',p_notes:'SHARAWLA_ACCEPTANCE'},tx);
 const done=await sync(tx),a=ack(done);
 if(text(a.operation_type)!=='customer_create'||text(a.rpc_name)!=='offline_customer_create_v1')throw new Error('customer create ACK mismatch');
 const cid=Number(a.server_entity_id);if(!cid)throw new Error('customer server id missing');
 const rows=await global.rest('customers',`select=id,name,phone&id=eq.${cid}&limit=1`);if(rows?.length!==1||rows[0].name!==marker)throw new Error('customer cloud reconciliation mismatch');
 await global.SharawlaOfflineV2Transport.syncNow();
 return {status:'PASS',detail:`customer=${cid}; seq=${done.device_sequence}; receipts=1; replay=stable`,evidence:{customer_id:cid,client_tx_id:tx,device_sequence:done.device_sequence}};
}
async function customerChain(ctx){
 const marker=`CHAIN-${String(ctx.run_id).slice(-6)}-${Date.now().toString().slice(-5)}`,phone='011'+String(Date.now()).slice(-8),parent=uuid(),child=uuid();
 await net().enable('offline',{run_id:'offline-customer-chain'});let err=null;
 try{await global.SharawlaOfflineV2Transport.commitRpc('offline_customer_create_v1',{p_name:marker,p_phone:phone,p_area:'Acceptance',p_address:'Parent',p_notes:'CHAIN',p_client_tx_id:parent})}catch(e){if(!/fetch|network|offline|deferred/i.test(text(e?.message||e))&&!e?.offline_v2_status)throw e}
 try{await global.SharawlaOfflineV2Transport.commitRpc('offline_customer_address_save_v1',{p_address_id:null,p_customer_id:null,p_customer_create_tx:parent,p_label:'Home',p_area:'Acceptance',p_address:'Dependent Address',p_notes:'CHAIN',p_is_default:true,p_client_tx_id:child})}catch(e){err=e}finally{await net().disable('offline-customer-chain-commit')}
 if(err&&!/fetch|network|offline|deferred/i.test(text(err?.message||err))&&!err?.offline_v2_status)throw err;
 const pe=await event(parent),ce=await event(child);if(!pe||!ce||text(ce.depends_on_tx_id)!==parent)throw new Error('customer dependency was not durably bound');
 const parentDone=await sync(parent),cid=Number(ack(parentDone).server_entity_id);if(!cid)throw new Error('customer dependency parent mapping missing');
 const childDone=await sync(child),aid=Number(ack(childDone).server_entity_id);if(!aid)throw new Error('dependent address server mapping missing');
 const a=(await global.rest('customer_addresses',`select=id,customer_id,label,address,is_default&id=eq.${aid}&limit=1`))?.[0];if(Number(a?.customer_id)!==cid||text(a?.address)!=='Dependent Address')throw new Error('dependent customer address reconciliation mismatch');
 await global.SharawlaOfflineV2Transport.syncNow();
 return {status:'PASS',detail:`customer=${cid}; address=${aid}; dependency=ACK-mapped; replay=stable`,evidence:{customer_id:cid,address_id:aid,parent_tx:parent,child_tx:child,parent_sequence:pe.device_sequence,child_sequence:ce.device_sequence}};
}
async function customerMutations(ctx){
 const rows=await global.rest('customers','select=id,name,phone&order=id.desc&limit=20'),base=(rows||[]).find(x=>Number(x.id)>0);if(!base)throw new Error('existing customer required');
 const updateTx=uuid();await durable('offline_customer_update_v1',{p_customer_id:Number(base.id),p_name:text(base.name)||'Acceptance Customer',p_phone:text(base.phone),p_area:'Offline Updated',p_address:'Updated',p_notes:'OFFLINE_UPDATE'},updateTx);await sync(updateTx);
 const addrTx=uuid();await durable('offline_customer_address_save_v1',{p_address_id:null,p_customer_id:Number(base.id),p_label:'Acceptance',p_area:'Offline',p_address:'Offline Address',p_notes:'E2E',p_is_default:false},addrTx);const addrDone=await sync(addrTx);
 const aid=Number(ack(addrDone).server_entity_id);if(!aid)throw new Error('offline address save id missing');
 const delTx=uuid();await durable('offline_customer_address_delete_v1',{p_address_id:aid},delTx);await sync(delTx);
 const cloud=(await global.rest('customers',`select=id,area,address,notes&id=eq.${Number(base.id)}&limit=1`))?.[0],deleted=await global.rest('customer_addresses',`select=id&id=eq.${aid}&limit=1`);
 if(text(cloud?.area)!=='Offline Updated'||text(cloud?.address)!=='Updated'||deleted.length!==0)throw new Error('customer update/address mutation reconciliation mismatch');
 for(const tx of [updateTx,addrTx,delTx]){ack(await event(tx))}
 return {status:'PASS',detail:`customer=${base.id}; update+address-save+delete synced; receipts=3`,evidence:{customer_id:base.id,update_tx:updateTx,address_tx:addrTx,delete_tx:delTx,address_id:aid}};
}
async function driver(ctx){
 const orders=await global.rest('orders','select=id,branch_id,status,order_type,driver_id&order_type=eq.delivery&status=eq.ready&order=id.desc&limit=20');let o=null,d=null;
 for(const x of orders||[]){const ds=await global.rest('delivery_drivers',`select=id,branch_id,active&branch_id=eq.${Number(x.branch_id)}&active=eq.true&limit=1`);if(ds?.[0]){o=x;d=ds[0];break}}
 if(!o||!d)throw new Error('ready delivery order + active driver required');
 const tx=uuid();await durable('offline_delivery_assign_driver_v1',{p_order_id:Number(o.id),p_driver_id:Number(d.id)},tx);
 const done=await sync(tx),a=ack(done),cloud=(await global.rest('orders',`select=id,status,driver_id,assigned_at&id=eq.${Number(o.id)}&limit=1`))?.[0];
 if(text(a.operation_type)!=='delivery_assign_driver'||text(a.rpc_name)!=='offline_delivery_assign_driver_v1')throw new Error('driver assignment ACK mismatch');
 if(text(cloud?.status)!=='out_for_delivery'||Number(cloud?.driver_id)!==Number(d.id))throw new Error('driver assignment cloud state mismatch');
 await global.SharawlaOfflineV2Transport.syncNow();
 return {status:'PASS',detail:`order=${o.id}; driver=${d.id}; seq=${done.device_sequence}; replay=stable`,evidence:{order_id:o.id,driver_id:d.id,client_tx_id:tx,device_sequence:done.device_sequence}};
}
async function delivered(ctx){
 const rows=await global.rest('orders','select=id,total,payment_method,status,driver_id,delivery_cash_custody_amount&order_type=eq.delivery&status=eq.out_for_delivery&driver_id=not.is.null&order=id.desc&limit=20');const o=(rows||[]).find(x=>Number(x.id)>0&&text(x.payment_method)&&text(x.payment_method)!=='mixed');if(!o)throw new Error('out_for_delivery order required');
 const tx=uuid();await durable('order_status_apply_offline_v2',{p_order_id:Number(o.id),p_target_status:'delivered'},tx);const done=await sync(tx);
 const cloud=(await global.rest('orders',`select=id,total,payment_method,payment_status,status,driver_id,delivery_cash_custody_amount,delivered_at&id=eq.${Number(o.id)}&limit=1`))?.[0];
 const pays=await global.rest('order_payments',`select=order_id,method,amount&order_id=eq.${Number(o.id)}`),events=await global.rest('delivery_payment_events',`select=client_tx_id,order_id,new_method,custody_after&client_tx_id=eq.${encodeURIComponent(tx)}`);const a=ack(done);
 const expected=text(cloud.payment_method)==='cash'?Number(cloud.total):0;
 if(text(cloud.status)!=='delivered'||text(cloud.payment_status)!=='confirmed')throw new Error('offline delivery final state mismatch');
 if(pays.length!==1||text(pays[0].method)!==text(cloud.payment_method)||Math.abs(Number(pays[0].amount)-Number(cloud.total))>.005)throw new Error('offline delivery payment semantics mismatch');
 if(events.length!==1||Math.abs(Number(events[0].custody_after)-expected)>.005||Math.abs(Number(cloud.delivery_cash_custody_amount)-expected)>.005)throw new Error('offline delivery custody semantics mismatch');
 if(text(a.rpc_name)!=='order_status_apply_offline_v2')throw new Error('offline delivery ACK mismatch');
 await global.SharawlaOfflineV2Transport.syncNow();const events2=await global.rest('delivery_payment_events',`select=client_tx_id&client_tx_id=eq.${encodeURIComponent(tx)}`);if(events2.length!==1)throw new Error('offline delivery replay duplicated economics');
 return {status:'PASS',detail:`order=${o.id}; method=${cloud.payment_method}; custody=${expected}; seq=${done.device_sequence}; economic replay=stable`,evidence:{order_id:o.id,client_tx_id:tx,payment_method:cloud.payment_method,custody:expected,device_sequence:done.device_sequence}};
}
function register(){const r=R();if(!r||global.__SharawlaOfflineCustomerDeliveryAcceptanceRegistered)return false;global.__SharawlaOfflineCustomerDeliveryAcceptanceRegistered=true;r.registerMany([
{id:'offline.customer-create-runtime-e2e',name:'Offline Customer Create → Durable → Sync → Cloud → Replay',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['offline.local_first','core.customers'],run:customer},
{id:'offline.customer-dependent-address-runtime-e2e',name:'Offline Customer Create + Dependent Address → ACK Mapping → Replay',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['offline.local_first','core.customers'],run:customerChain},
{id:'offline.customer-mutations-runtime-e2e',name:'Offline Customer Update + Address Save/Delete → Sync',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['offline.local_first','core.customers'],run:customerMutations},
{id:'offline.delivery-driver-runtime-e2e',name:'Offline Driver Assignment → Durable → Sync → Cloud → Replay',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['offline.local_first','commerce.delivery'],run:driver},
{id:'offline.delivery-economic-runtime-e2e',name:'Offline Delivery Complete → Payment + Custody → Replay',pack:'offline',profile:'restaurant',level:'chaos',mode:'chaos',critical:true,features:['offline.local_first','commerce.delivery'],run:delivered}
]);return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
})(window);
