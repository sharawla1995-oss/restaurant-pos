(function(global){
'use strict';
// PV2-F5A SOURCE CANDIDATE ONLY — deliberately UNWIRED until coordinated Beta deploy.
const VERSION='pv2-f5a-order-fulfillment-source';
async function transition(orderId,targetStatus){
 const id=Number(orderId);
 if(!Number.isFinite(id)||id<=0)throw new Error('معرّف الطلب غير صالح');
 const target=String(targetStatus||'').trim().toLowerCase();
 if(!['preparing','ready','completed'].includes(target))throw new Error('حالة الطلب غير مسموحة');
 if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
 return global.rpc('order_fulfillment_transition_v2',{p_order_id:id,p_target_status:target});
}
global.__SharawlaPV2OrderFulfillment=Object.freeze({version:VERSION,transition});
})(window);
