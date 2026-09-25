(function(global){
'use strict';

// PV2-F2 SOURCE CANDIDATE ONLY.
// Runtime bridge: prefer the V2 owner; fall back only when that RPC is absent during the coordinated Beta transition.
const VERSION='pv2-f2-customers-edit-address-source';

async function rpc(name,payload){
  if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
  return global.rpc(name,payload);
}
function missingOwner(err){return /PGRST202|could not find the function|404/i.test(String(err?.message||err||''))}
async function rest(table,query,options){if(typeof global.rest!=='function')throw new Error('REST غير جاهز');return global.rest(table,query,options)}
function clean(v){const s=String(v??'').trim();return s||null}
function tx(){return global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function offline(){return global.navigator?.onLine===false}
function offlineRpc(name,payload){if(typeof global.SharawlaOfflineV2Transport?.commitRpc!=='function')throw new Error('Offline V2 غير جاهز');return global.SharawlaOfflineV2Transport.commitRpc(name,{...payload,p_client_tx_id:tx()})}

async function updateCustomer(input={}){
  const id=Number(input.id);
  if(!Number.isFinite(id)||id<=0)throw new Error('معرّف العميل غير صالح');
  const payload={
    p_customer_id:id,
    p_name:clean(input.name),
    p_phone:clean(input.phone),
    p_area:clean(input.area),
    p_address:clean(input.address),
    p_notes:clean(input.notes)
  };
  if(offline())return offlineRpc('offline_customer_update_v1',payload);
  try{return await rpc('customer_update_v2',{
    p_customer_id:id,
    p_name:clean(input.name),
    p_phone:clean(input.phone),
    p_area:clean(input.area),
    p_address:clean(input.address),
    p_notes:clean(input.notes)
  });}catch(err){if(!missingOwner(err))throw err;await rest('customers',`id=eq.${id}`,{method:'PATCH',body:JSON.stringify({name:clean(input.name),phone:clean(input.phone),area:clean(input.area),address:clean(input.address),notes:clean(input.notes),updated_at:new Date().toISOString()})});return id}
}

async function saveAddress(input={}){
  const customerId=Number(input.customer_id);
  if(!Number.isFinite(customerId)||customerId<=0)throw new Error('معرّف العميل غير صالح');
  const addressId=input.id==null?null:Number(input.id);
  if(addressId!==null&&(!Number.isFinite(addressId)||addressId<=0))throw new Error('معرّف العنوان غير صالح');
  const payload={p_address_id:addressId,p_customer_id:customerId,p_label:clean(input.label),p_area:clean(input.area),p_address:clean(input.address),p_notes:clean(input.notes),p_is_default:input.is_default===true};
  if(offline())return offlineRpc('offline_customer_address_save_v1',payload);
  try{return await rpc('customer_address_save_v2',{
    p_address_id:addressId,
    p_customer_id:customerId,
    p_label:clean(input.label),
    p_area:clean(input.area),
    p_address:clean(input.address),
    p_notes:clean(input.notes),
    p_is_default:input.is_default===true
  });}catch(err){if(!missingOwner(err))throw err;const body={customer_id:customerId,label:clean(input.label),area:clean(input.area),address:clean(input.address),notes:clean(input.notes),is_default:input.is_default===true};if(addressId===null){const rows=await rest('customer_addresses','',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([body])});return Number(rows?.[0]?.id||0)}await rest('customer_addresses',`id=eq.${addressId}`,{method:'PATCH',body:JSON.stringify(body)});return addressId}
}

async function deleteAddress(addressId){
  const id=Number(addressId);
  if(!Number.isFinite(id)||id<=0)throw new Error('معرّف العنوان غير صالح');
  if(offline())return offlineRpc('offline_customer_address_delete_v1',{p_address_id:id});
  try{return await rpc('customer_address_delete_v2',{p_address_id:id})}catch(err){if(!missingOwner(err))throw err;await rest('customer_addresses',`id=eq.${id}`,{method:'DELETE'});return true}
}

global.__SharawlaPV2CustomerEditAddress=Object.freeze({
  version:VERSION,
  updateCustomer,
  saveAddress,
  deleteAddress
});
})(window);
