'use strict';
const fs=require('fs');const vm=require('vm');
function must(v,msg){if(!v)throw new Error(msg)}
const runtime=fs.readFileSync('beta55-print-order-type.js','utf8');
const acceptance=fs.readFileSync('owner-acceptance-beta55-print-v55.js','utf8');
const loader=fs.readFileSync('beta36-integration-loader.js','utf8');
const lazy=fs.readFileSync('owner-acceptance-lazy-loader-v47.js','utf8');
for(const token of ['دليفري','DELIVERY','تيك أواي','TAKEAWAY','استلام فرع','PICKUP','صالة','DINE-IN','رسوم التوصيل','الإجمالي'])must(runtime.includes(token),`runtime missing ${token}`);
must(loader.includes("['beta55-print-order-type','beta55-print-order-type.js?v=10.5.4-beta.55']"),'integration loader missing print runtime');
must(lazy.includes("['owner-acceptance-beta55-print-v55','owner-acceptance-beta55-print-v55.js?v=10.5.4-beta.55']"),'lazy loader missing print acceptance');
must(acceptance.includes("id:'beta55.restaurant-print-order-type'"),'acceptance id missing');
const baseCustomer=()=>'<div class="receipt"><div>BASE</div></div>';
const basePrep=()=>'<div class="receipt"><div class="r-totals"><div><span>إجمالي الأصناف</span><b>100.00 ج.م</b></div></div></div>';
const window={receiptHTML:baseCustomer,prepReceiptHTML:basePrep};
const ctx={window,console,Object,String,Number};vm.createContext(ctx);vm.runInContext(runtime,ctx,{filename:'beta55-print-order-type.js'});
const api=window.__SharawlaBeta55PrintOrderTypeV1;must(api?.active===true,'runtime API inactive');
const types={delivery:['دليفري','DELIVERY'],takeaway:['تيك أواي','TAKEAWAY'],pickup:['استلام فرع','PICKUP'],dinein:['صالة','DINE-IN']};
for(const [type,[ar,en]] of Object.entries(types)){
 const o={order_type:type,delivery_fee:type==='delivery'?15:0,total:type==='delivery'?115:100,notes:type==='delivery'?'اختبار':''};
 const c=api.decorateCustomer(baseCustomer(),o),p=api.decoratePrep(basePrep(),o);
 must(c.includes(ar)&&c.includes(en),`${type} customer header mismatch`);must(p.includes(ar)&&p.includes(en),`${type} prep header mismatch`);must(p.includes('الإجمالي'),`${type} prep grand total missing`);
 if(type==='delivery'){must(p.includes('رسوم التوصيل'),'delivery fee label missing');must(p.includes('15.00 ج.م'),'delivery fee amount missing');must(p.includes('115.00 ج.م'),'delivery grand total missing');must(p.includes('ملاحظات الطلب'),'delivery notes missing')}else must(!p.includes('رسوم التوصيل'),`${type} leaked delivery fee`);
}
must(window.receiptHTML({order_type:'delivery'},[]).includes('DELIVERY'),'wrapped customer renderer missing header');
must(window.prepReceiptHTML({order_type:'delivery',delivery_fee:15,total:115},[]).includes('رسوم التوصيل'),'wrapped prep renderer missing delivery fee');
console.log('Beta55 print order type gate PASS');
