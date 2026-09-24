'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const v2=fs.readFileSync('beta55-delivery-settlement-shift-cash.js','utf8');
const ds=app.slice(app.indexOf('async function renderDeliverySettings()'),app.indexOf('async function renderUsers()'));
const checks=[
 ['delivery settings has no settlement panel',!ds.includes('تسويات المناديب')],
 ['delivery settings has no settlement action',!ds.includes('data-settle')],
 ['delivery settings has no settlement history query',!ds.includes("rest('driver_settlements'")],
 ['delivery orders v2 enhancement exists',v2.includes('enhanceDeliveryOrdersSettlement')],
 ['delivery orders shows custody panel',v2.includes('data-delivery-custody-v2')],
 ['delivery orders owns one-order settlement',v2.includes('data-delivery-settle-order-v2')],
 ['delivery orders owns settle-all',v2.includes('data-delivery-settle-all-v2')],
 ['pending source is authoritative v2 rpc',v2.includes("delivery_driver_pending_v2")],
 ['settlement write is authoritative v2 rpc',v2.includes("delivery_driver_settle_v2")],
 ['only positive custody is rendered',v2.includes("filter(o=>num(o.custody_amount)>0)")],
 ['wallet/zero custody cannot render as pending',!v2.includes("payment_method=eq.cash")]
];
let bad=0;for(const [n,ok] of checks){console.log((ok?'PASS':'FAIL')+' — '+n);if(!ok)bad++}
if(bad)process.exit(1);console.log('Delivery-orders custody ownership guard PASS');
