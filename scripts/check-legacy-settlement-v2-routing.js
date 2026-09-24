'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const v2=fs.readFileSync('beta55-delivery-settlement-shift-cash.js','utf8');
const start=app.indexOf("async function renderDeliverySettings()");
const end=app.indexOf("async function renderUsers()",start);
if(start<0||end<0)throw new Error('delivery settings block missing');
const block=app.slice(start,end);
const checks=[
 ['legacy data-settle buttons may render only as inert compatibility shell',block.includes('data-settle=')],
 ['app legacy handler is fail-closed',block.includes("if(b){e.preventDefault();e.stopPropagation();return toast('تسوية عهدة المناديب متاحة من لوحة العهد V2 فقط')}")],
 ['app cannot call pending settlement RPC',!block.includes("delivery_driver_pending_v2")],
 ['app cannot call settlement RPC',!block.includes("delivery_driver_settle_v2")],
 ['app cannot calculate custody settlement amount',!block.includes("custody_amount")],
 ['app cannot show legacy amount confirmation',!block.includes("طلب بإجمالي")],
 ['app cannot directly settle orders',!block.includes("driver_settled_at:now")],
 ['app cannot insert driver settlements',!block.includes("rest('driver_settlements','',{method:'POST'")],
 ['v2 owns pending RPC',v2.includes("delivery_driver_pending_v2")],
 ['v2 owns settlement RPC',v2.includes("delivery_driver_settle_v2")],
 ['v2 owns settlement action selectors',v2.includes("data-settle-order-v2")&&v2.includes("data-settle-all-v2")]
];
let bad=0;for(const [n,ok] of checks){console.log((ok?'PASS':'FAIL')+' — '+n);if(!ok)bad++}
if(bad)process.exit(1);
console.log('Driver settlement single-owner V2 guard PASS');
