(function(global){
'use strict';
// PV2-F5B coordinated renderer routing — Offline uses the durable Offline V2 assignment owner.
const VERSION='pv2-f5b-order-driver-assignment-routing-v3';
function tx(){return global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}
async function assignDriver(orderId,driverId){
 const oid=Number(orderId),did=Number(driverId);
 if(!Number.isFinite(oid)||oid<=0)throw new Error('معرّف الطلب غير صالح');
 if(!Number.isFinite(did)||did<=0)throw new Error('معرّف المندوب غير صالح');
 if(global.navigator?.onLine===false){if(typeof global.SharawlaOfflineV2Transport?.commitRpc!=='function')throw new Error('Offline V2 غير جاهز');return global.SharawlaOfflineV2Transport.commitRpc('offline_delivery_assign_driver_v1',{p_order_id:oid,p_driver_id:did,p_client_tx_id:tx()})}
 if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
 return global.rpc('order_assign_driver_v2',{p_order_id:oid,p_driver_id:did});
}
global.__SharawlaPV2OrderDriverAssignment=Object.freeze({version:VERSION,assignDriver});
})(window);
