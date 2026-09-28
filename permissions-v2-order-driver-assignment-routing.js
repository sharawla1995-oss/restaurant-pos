(function(global){
'use strict';
// PV2-F5B coordinated renderer routing — Offline uses the durable Offline V2 assignment owner.
const VERSION='pv2-f5b-order-driver-assignment-routing-v3';
function tx(){return global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}
async function assignDriver(orderId,driverId){
 const raw=String(orderId??'').trim(),oid=Number(raw),isLocal=/^offline-(?!shift-|ret-|exp-|movement-).+/.test(raw),did=Number(driverId);
 if((!Number.isFinite(oid)||oid<=0)&&!isLocal)throw new Error('معرّف الطلب غير صالح');
 if(!Number.isFinite(did)||did<=0)throw new Error('معرّف المندوب غير صالح');
 const transport=global.SharawlaOfflineV2Transport,takeover=global.SharawlaOfflineV2Takeover;
 const ownership=typeof takeover?.resolveOperationOwner==='function'?await takeover.resolveOperationOwner('delivery_assign_driver'):null;
 if(ownership?.owner==='v2'){const committed=await transport.commitRpcLocal('offline_delivery_assign_driver_v1',{p_order_id:isLocal?raw:oid,p_driver_id:did,p_client_tx_id:tx()});return committed.result}
 if(global.navigator?.onLine===false){const e=new Error('Offline V2 غير جاهز. لم يتم تسليم الطلب للمندوب.');e.code='OFFLINE_OPERATION_NO_SAFE_OWNER';e.operation_type='delivery_assign_driver';e.ownership=ownership;throw e}
 if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
 return global.rpc('order_assign_driver_v2',{p_order_id:oid,p_driver_id:did});
}
global.__SharawlaPV2OrderDriverAssignment=Object.freeze({version:VERSION,assignDriver});
})(window);
