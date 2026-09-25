(function(global){
'use strict';
// PV2-F5B coordinated renderer routing — online only; Offline assignment remains blocked until a durable assignment operation exists.
const VERSION='pv2-f5b-order-driver-assignment-routing-v2';
async function assignDriver(orderId,driverId){
 const oid=Number(orderId),did=Number(driverId);
 if(!Number.isFinite(oid)||oid<=0)throw new Error('معرّف الطلب غير صالح');
 if(!Number.isFinite(did)||did<=0)throw new Error('معرّف المندوب غير صالح');
 if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
 return global.rpc('order_assign_driver_v2',{p_order_id:oid,p_driver_id:did});
}
global.__SharawlaPV2OrderDriverAssignment=Object.freeze({version:VERSION,assignDriver});
})(window);
