(function(global){
'use strict';
const VERSION='10.5.4-beta.55';
const R=()=>global.__SharawlaAcceptanceRegistry;
const TYPES={delivery:['دليفري','DELIVERY'],takeaway:['تيك أواي','TAKEAWAY'],pickup:['استلام فرع','PICKUP'],dinein:['صالة','DINE-IN']};
function ensureIncludes(html,needle,label){if(!String(html||'').includes(needle))throw new Error(`${label}: missing ${needle}`)}
async function printContract(){
 const api=global.__SharawlaBeta55PrintOrderTypeV1;
 if(!api?.active)throw new Error('Beta55 print order type runtime is not active');
 if(typeof global.receiptHTML!=='function'||typeof global.prepReceiptHTML!=='function')throw new Error('Receipt renderers unavailable');
 const evidence={types:{}};
 for(const [type,[ar,en]] of Object.entries(TYPES)){
  const base='<div class="receipt"><div class="r-totals"><div><span>إجمالي الأصناف</span><b>100.00 ج.م</b></div></div></div>';
  const order={order_type:type,subtotal:100,delivery_fee:type==='delivery'?15:0,total:type==='delivery'?115:100,notes:type==='delivery'?'اختبار ملاحظات الدليفري':''};
  const customer=api.decorateCustomer(base,order);
  const prep=api.decoratePrep(base,order);
  ensureIncludes(customer,ar,`${type} customer ar`);ensureIncludes(customer,en,`${type} customer en`);
  ensureIncludes(prep,ar,`${type} prep ar`);ensureIncludes(prep,en,`${type} prep en`);
  ensureIncludes(prep,'الإجمالي',`${type} prep total`);
  if(type==='delivery'){
   ensureIncludes(prep,'رسوم التوصيل','delivery fee label');ensureIncludes(prep,'15.00 ج.م','delivery fee amount');ensureIncludes(prep,'115.00 ج.م','delivery grand total');ensureIncludes(prep,'ملاحظات الطلب','delivery order notes');
  }else if(prep.includes('رسوم التوصيل'))throw new Error(`${type}: delivery fee leaked to non-delivery prep receipt`);
  evidence.types[type]={customer_header:true,prep_header:true,delivery_fee:type==='delivery'};
 }
 return {status:'PASS',detail:'Customer + preparation receipts show prominent bilingual order type headers for delivery/takeaway/pickup/dine-in; delivery prep includes fee + grand total + notes',evidence};
}
function register(){const r=R();if(!r||global.__SharawlaBeta55PrintAcceptanceRegistered)return false;global.__SharawlaBeta55PrintAcceptanceRegistered=true;r.register({id:'beta55.restaurant-print-order-type',name:'Restaurant receipt/prep bilingual order type + delivery fee contract',pack:'beta55-restaurant',profile:'restaurant',level:'quick',mode:'readonly',critical:true,run:printContract});return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
global.__SharawlaBeta55PrintAcceptanceV55=Object.freeze({version:VERSION,register});
})(window);
