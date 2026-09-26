'use strict';
const fs=require('fs');
const src=fs.readFileSync('beta55-delivery-settlement-shift-cash.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const checks=[
 ['legacy settlement control removed after V2 cutover',!app.includes("data-settle=\"")&&!app.includes("payment_method=eq.cash")],
 ['v2 installs loading state before authoritative pending RPC',(()=>{const load=src.indexOf("data-settlement-v2-loading"),rpc=src.indexOf("delivery_driver_pending_v2",load);return load>=0&&rpc>load})()],
 ['v2 pending RPC is authoritative',src.includes("delivery_driver_pending_v2")],
 ['v2 settlement RPC is authoritative',src.includes("delivery_driver_settle_v2")],
 ['delivery navigation delegates to live runtime owner',app.includes('deliveryOrders:(...args)=>window.renderDeliveryOrders(...args)')&&app.includes('delivery:(...args)=>window.renderDeliveryOrders(...args)')],
 ['empty pending custody keeps an explicit stable panel',!src.includes('if(!rows.length)return;')&&src.includes('لا توجد عهدة كاش غير مسواة')],
 ['legacy controls not copied into v2 UI',!src.includes('data-settle="')],
 ['rpc failure remains fail closed',src.includes("panel.innerHTML=\`<h2>💰 عهد وتسويات المناديب</h2><p class=\"negative\"")]
];
let bad=0;for(const [n,ok] of checks){console.log((ok?'PASS':'FAIL')+' — '+n);if(!ok)bad++}
if(bad)process.exit(1);
console.log('Driver settlement runtime ownership guard PASS');
