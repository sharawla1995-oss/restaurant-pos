(function(global){
'use strict';

// PV2-F4 SOURCE CANDIDATE ONLY.
// Runtime bridge: prefer the V2 owner; fall back only when that RPC is absent during the coordinated Beta transition.
const VERSION='pv2-f4-delivery-settings-source';

async function rpc(name,payload){
  if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
  return global.rpc(name,payload);
}
function missingOwner(err){return /PGRST202|could not find the function|404/i.test(String(err?.message||err||''))}
async function rest(table,query,options){if(typeof global.rest!=='function')throw new Error('REST غير جاهز');return global.rest(table,query,options)}
function clean(v){const s=String(v??'').trim();return s||null}

async function saveDriver(input={}){
  const branchId=Number(input.branch_id);
  const driverId=input.id==null?null:Number(input.id);
  if(!Number.isFinite(branchId)||branchId<=0)throw new Error('الفرع غير صالح');
  if(driverId!==null&&(!Number.isFinite(driverId)||driverId<=0))throw new Error('المندوب غير صالح');
  const name=clean(input.name);
  if(!name)throw new Error('اسم المندوب مطلوب');
  try{return await rpc('delivery_driver_save_v2',{p_driver_id:driverId,p_branch_id:branchId,p_name:name,p_phone:clean(input.phone),p_active:input.active!==false})}catch(err){if(!missingOwner(err))throw err;const body={name,phone:clean(input.phone),branch_id:branchId,active:input.active!==false};if(driverId===null){const rows=await rest('delivery_drivers','',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([body])});return Number(rows?.[0]?.id||0)}await rest('delivery_drivers',`id=eq.${driverId}`,{method:'PATCH',body:JSON.stringify(body)});return driverId}
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
  try{return await rpc('delivery_zone_save_v2',{p_zone_id:zoneId,p_branch_id:branchId,p_name:name,p_delivery_fee:fee,p_active:input.active!==false})}catch(err){if(!missingOwner(err))throw err;const body={name,delivery_fee:fee,branch_id:branchId,active:input.active!==false};if(zoneId===null){const rows=await rest('delivery_zones','',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([body])});return Number(rows?.[0]?.id||0)}await rest('delivery_zones',`id=eq.${zoneId}`,{method:'PATCH',body:JSON.stringify(body)});return zoneId}
}

global.__SharawlaPV2DeliverySettings=Object.freeze({version:VERSION,saveDriver,saveZone});
})(window);
