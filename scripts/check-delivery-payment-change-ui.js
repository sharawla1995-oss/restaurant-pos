'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const delivery=fs.readFileSync('beta55-delivery-settlement-shift-cash.js','utf8');
const checks=[
 ['detail action exposed',/data-change-delivery-payment="\$\{o\.id\}"/.test(app)],
 ['only delivery detail states',/o\.order_type==='delivery'&&\['out_for_delivery','delivered','completed'\]/.test(app)],
 ['settled orders hidden',/o\.driver_settled_at==null/.test(app)],
 ['interactive owner exists',/async function changeDeliveryPaymentInteractive\(orderId,hostModal=null\)/.test(delivery)],
 ['fresh payment options reused',/const methods=await paymentOptions\(order\);/.test(delivery)],
 ['same audited server boundary',/B55-PAYMENT-CHANGE/.test(delivery)&&/delivery_mark_delivered_v2/.test(delivery)],
 ['settled change blocked client side',/لا يمكن تغيير طريقة الدفع بعد تسوية عهدة هذا الطلب/.test(delivery)],
 ['mixed excluded',/toLowerCase\(\)!=='mixed'/.test(delivery)]
];
let failed=0;for(const [n,p] of checks){console.log((p?'PASS':'FAIL')+' — '+n);if(!p)failed++}
if(failed){console.error('Delivery payment change UI guard: FAIL');process.exit(1)}
console.log('Delivery payment change UI guard: PASS');
