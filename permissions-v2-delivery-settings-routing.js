(function(global){
'use strict';

// PV2-F4 SOURCE CANDIDATE ONLY.
// Runtime bridge: use the V2 owner only. Missing owner fails closed during the coordinated Beta transition.
const VERSION='10.5.4-beta.58.33';

async function rpc(name,payload){
  if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
  return global.rpc(name,payload);
}
function clean(v){const s=String(v??'').trim();return s||null}

async function saveDriver(input={}){
  const branchId=Number(input.branch_id);
  const driverId=input.id==null?null:Number(input.id);
  if(!Number.isFinite(branchId)||branchId<=0)throw new Error('الفرع غير صالح');
  if(driverId!==null&&(!Number.isFinite(driverId)||driverId<=0))throw new Error('المندوب غير صالح');
  const name=clean(input.name);
  if(!name)throw new Error('اسم المندوب مطلوب');
  return rpc('delivery_driver_save_v2',{p_driver_id:driverId,p_branch_id:branchId,p_name:name,p_phone:clean(input.phone),p_active:input.active!==false});
}

async function saveZone(input={}){
  const branchId=Number(input.branch_id);
  const zoneId=input.id==null?null:Number(input.id);
  const fee=Number(input.delivery_fee??0);
  if(!Number.isFinite(branchId)||branchId<=0)throw new Error('الفرع غير صالح');
  if(zoneId!==null&&(!Number.isFinite(zoneId)||zoneId<=0))throw new Error('المنطقة غير صالحة');
  if(!Number.isFinite(fee)||fee<0)throw new Error('رسوم التوصيل غير صحيحة');
  const name=clean(input.name);
  if(!name)throw new Error('اسم المنطقة مطلوب');
  return rpc('delivery_zone_save_v2',{p_zone_id:zoneId,p_branch_id:branchId,p_name:name,p_delivery_fee:fee,p_active:input.active!==false});
}

global.__SharawlaPV2DeliverySettings=Object.freeze({version:VERSION,saveDriver,saveZone});
})(window);
