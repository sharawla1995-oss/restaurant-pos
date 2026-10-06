(function(global){
'use strict';
// Active V2 always durably commits order_status; its existing server wrapper
// delegates permission and transition checks to the fulfillment owner.
const VERSION='pv2-f5a-order-fulfillment-routing-v2';
const online=()=>typeof navigator==='undefined'||navigator.onLine!==false;
async function transition(orderIdentity,targetStatus,options={}){
 const order=orderIdentity&&typeof orderIdentity==='object'?orderIdentity:{id:orderIdentity};
 const localId=String(order?.id??'').trim();
 const serverId=String(order?._server_entity_id??'').trim();
 const target=String(targetStatus||'').trim().toLowerCase();
 if(!localId)throw new Error('معرّف الطلب غير صالح');
 if(!['preparing','ready','completed'].includes(target))throw new Error('حالة الطلب غير مسموحة');
 const transport=global.SharawlaOfflineV2Transport;
 if((/^\d+$/.test(serverId||localId)||/^offline-[0-9a-f-]{36}$/.test(localId))&&typeof transport?.isActive==='function'&&await transport.isActive()){
  const saved=await transport.commitRpcLocal('order_status_apply_offline_v2',{p_order_id:serverId||localId,p_target_status:target,p_client_tx_id:global.crypto.randomUUID()});
  return options.withState?saved:saved.result;
 }
 if(!/^\d+$/.test(serverId||localId)){if(online())throw new Error('الطلب لم يحصل بعد على معرّف السيرفر؛ انتظر اكتمال المزامنة');const ov2=global.SharawlaOfflineV2Takeover;if(typeof ov2?.saveOrderStatus!=='function')throw new Error('Offline V2 غير جاهز لتحديث حالة الطلب');const result=await ov2.saveOrderStatus(localId,target);return options.withState?{durable:true,synced:false,result}:result}
 if(online()){
  const id=Number(serverId||localId);if(!Number.isFinite(id)||id<=0)throw new Error('الطلب لم يحصل بعد على معرّف السيرفر؛ انتظر اكتمال المزامنة');
  if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
  const result=await global.rpc('order_fulfillment_transition_v2',{p_order_id:id,p_target_status:target});return options.withState?{durable:false,synced:true,result}:result;
 }
 const ov2=global.SharawlaOfflineV2Takeover;
 if(typeof ov2?.saveOrderStatus!=='function')throw new Error('Offline V2 غير جاهز لتحديث حالة الطلب');
 return ov2.saveOrderStatus(localId,target);
}
global.__SharawlaPV2OrderFulfillment=Object.freeze({version:VERSION,transition});
})(window);
