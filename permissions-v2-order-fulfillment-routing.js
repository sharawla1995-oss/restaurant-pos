(function(global){
'use strict';
// PV2-F5A coordinated renderer routing. Online uses the authoritative fulfillment
// owner; Offline commits a durable order_status event through Offline V2.
const VERSION='pv2-f5a-order-fulfillment-routing-v2';
const online=()=>typeof navigator==='undefined'||navigator.onLine!==false;
async function transition(orderIdentity,targetStatus){
 const order=orderIdentity&&typeof orderIdentity==='object'?orderIdentity:{id:orderIdentity};
 const localId=String(order?.id??'').trim();
 const serverId=String(order?._server_entity_id??'').trim();
 const target=String(targetStatus||'').trim().toLowerCase();
 if(!localId)throw new Error('معرّف الطلب غير صالح');
 if(!['preparing','ready','completed'].includes(target))throw new Error('حالة الطلب غير مسموحة');
 if(online()){
  const id=Number(serverId||localId);if(!Number.isFinite(id)||id<=0)throw new Error('الطلب لم يحصل بعد على معرّف السيرفر؛ انتظر اكتمال المزامنة');
  if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
  return global.rpc('order_fulfillment_transition_v2',{p_order_id:id,p_target_status:target});
 }
 const ov2=global.SharawlaOfflineV2Takeover;
 if(typeof ov2?.saveOrderStatus!=='function')throw new Error('Offline V2 غير جاهز لتحديث حالة الطلب');
 return ov2.saveOrderStatus(localId,target);
}
global.__SharawlaPV2OrderFulfillment=Object.freeze({version:VERSION,transition});
})(window);
