(function(global){
'use strict';

// PV2-F2 SOURCE CANDIDATE ONLY.
// Runtime bridge: use the V2 owner only. Missing owner fails closed during the coordinated Beta transition.
const VERSION='10.5.4-beta.58.31';

async function rpc(name,payload){
  if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
  return global.rpc(name,payload);
}
function clean(v){const s=String(v??'').trim();return s||null}
function tx(){return global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function offline(){return global.navigator?.onLine===false}
function localTx(value,prefix){const s=String(value??'').trim();return s.startsWith(prefix)?s.slice(prefix.length)||null:null}
async function durableRpc(name,payload){
  const transport=global.SharawlaOfflineV2Transport;
  const active=typeof transport?.isActive==='function'&&!!(await transport.isActive());
  if(active){const committed=await transport.commitRpcLocal(name,{...payload,p_client_tx_id:tx()});return committed.result}
  if(offline())throw new Error('Offline V2 غير جاهز. لم يتم حفظ أي بيانات.');
  return null;
}

async function updateCustomer(input={}){
  const rawId=String(input.id??'').trim(),createTx=localTx(rawId,'offline-customer-'),id=Number(rawId);
  if((!Number.isFinite(id)||id<=0)&&!createTx)throw new Error('معرّف العميل غير صالح');
  const payload={
    p_customer_id:createTx?null:id,
    p_customer_create_tx:createTx,
    p_name:clean(input.name),
    p_phone:clean(input.phone),
    p_area:clean(input.area),
    p_address:clean(input.address),
    p_notes:clean(input.notes)
  };
  const durable=await durableRpc('offline_customer_update_v1',payload);if(durable!==null)return durable;
  return rpc('customer_update_v2',{
    p_customer_id:id,
    p_name:clean(input.name),
    p_phone:clean(input.phone),
    p_area:clean(input.area),
    p_address:clean(input.address),
    p_notes:clean(input.notes)
  });
}

async function saveAddress(input={}){
  const rawCustomer=String(input.customer_id??'').trim(),customerCreateTx=localTx(rawCustomer,'offline-customer-'),customerId=Number(rawCustomer);
  if((!Number.isFinite(customerId)||customerId<=0)&&!customerCreateTx)throw new Error('معرّف العميل غير صالح');
  const rawAddress=input.id==null?'':String(input.id).trim(),addressSaveTx=localTx(rawAddress,'offline-customer_address_save-'),addressId=rawAddress?Number(rawAddress):null;
  if(rawAddress&&(!Number.isFinite(addressId)||addressId<=0)&&!addressSaveTx)throw new Error('معرّف العنوان غير صالح');
  const payload={p_address_id:addressSaveTx?null:addressId,p_address_save_tx:addressSaveTx,p_customer_id:customerCreateTx?null:customerId,p_customer_create_tx:customerCreateTx,p_label:clean(input.label),p_area:clean(input.area),p_address:clean(input.address),p_notes:clean(input.notes),p_is_default:input.is_default===true};
  const durable=await durableRpc('offline_customer_address_save_v1',payload);if(durable!==null)return durable;
  return rpc('customer_address_save_v2',{
    p_address_id:addressId,
    p_customer_id:customerId,
    p_label:clean(input.label),
    p_area:clean(input.area),
    p_address:clean(input.address),
    p_notes:clean(input.notes),
    p_is_default:input.is_default===true
  });
}

async function deleteAddress(addressId){
  const raw=String(addressId??'').trim(),addressSaveTx=localTx(raw,'offline-customer_address_save-'),id=Number(raw);
  if((!Number.isFinite(id)||id<=0)&&!addressSaveTx)throw new Error('معرّف العنوان غير صالح');
  const durable=await durableRpc('offline_customer_address_delete_v1',{p_address_id:addressSaveTx?null:id,p_address_save_tx:addressSaveTx});if(durable!==null)return durable;
  return rpc('customer_address_delete_v2',{p_address_id:id});
}

global.__SharawlaPV2CustomerEditAddress=Object.freeze({
  version:VERSION,
  updateCustomer,
  saveAddress,
  deleteAddress
});
})(window);
