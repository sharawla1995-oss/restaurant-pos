(function(global){
'use strict';

// PV2-F4 SOURCE CANDIDATE ONLY.
// Runtime bridge: use the V2 owner only. Missing owner fails closed during the coordinated Beta transition.
const VERSION='10.5.4-beta.58.32';

async function rpc(name,payload){
  if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
  return global.rpc(name,payload);
}
function clean(v){const s=String(v??'').trim();return s||null}
async function saveDriver(input={},options={}){
  const branchId=Number(input.branch_id);
  const driverId=input.id==null?null:(String(input.id).startsWith('offline-')?String(input.id):Number(input.id));
  if(!Number.isFinite(branchId)||branchId<=0)throw new Error('الفرع غير صالح');
  if(driverId!==null&&!/^offline-driver-[0-9a-f-]{36}$/.test(String(driverId))&&(!Number.isFinite(driverId)||driverId<=0))throw new Error('المندوب غير صالح');
  const name=clean(input.name);
  if(!name)throw new Error('اسم المندوب مطلوب');
  const payload={p_driver_id:driverId,...(typeof driverId==='string'?{p_driver_save_tx:driverId.slice('offline-driver-'.length)}:{}),p_branch_id:branchId,p_name:name,p_phone:clean(input.phone),p_active:input.active!==false,p_client_tx_id:clean(input.client_tx_id)||(typeof global.uuid==='function'?global.uuid():crypto.randomUUID())};
  const t=global.SharawlaOfflineV2Transport;if(typeof t?.commitOptionalTxRpc!=='function')throw new Error('Offline V2 transport غير جاهز');const saved=await t.commitOptionalTxRpc('delivery_driver_save_v2',payload,{localFirstResult:true});return options.withState?(saved?.durable===true?saved:{durable:false,synced:true,result:saved}):(saved?.durable===true?saved.result:saved);
}

async function saveZone(input={},options={}){
  const branchId=Number(input.branch_id);
  const zoneId=input.id==null?null:(String(input.id).startsWith('offline-')?String(input.id):Number(input.id));
  const fee=Number(input.delivery_fee??0);
  if(!Number.isFinite(branchId)||branchId<=0)throw new Error('الفرع غير صالح');
  if(zoneId!==null&&!/^offline-zone-[0-9a-f-]{36}$/.test(String(zoneId))&&(!Number.isFinite(zoneId)||zoneId<=0))throw new Error('المنطقة غير صالحة');
  if(!Number.isFinite(fee)||fee<0)throw new Error('رسوم التوصيل غير صحيحة');
  const name=clean(input.name);
  if(!name)throw new Error('اسم المنطقة مطلوب');
  const payload={p_zone_id:zoneId,...(typeof zoneId==='string'?{p_zone_save_tx:zoneId.slice('offline-zone-'.length)}:{}),p_branch_id:branchId,p_name:name,p_delivery_fee:fee,p_active:input.active!==false,p_client_tx_id:clean(input.client_tx_id)||(typeof global.uuid==='function'?global.uuid():crypto.randomUUID())};
  const t=global.SharawlaOfflineV2Transport;if(typeof t?.commitOptionalTxRpc!=='function')throw new Error('Offline V2 transport غير جاهز');const saved=await t.commitOptionalTxRpc('delivery_zone_save_v2',payload,{localFirstResult:true});return options.withState?(saved?.durable===true?saved:{durable:false,synced:true,result:saved}):(saved?.durable===true?saved.result:saved);
}

global.__SharawlaPV2DeliverySettings=Object.freeze({version:VERSION,saveDriver,saveZone});
})(window);
