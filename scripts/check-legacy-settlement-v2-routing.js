'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const block=app.slice(app.indexOf("const b=e.target.closest('[data-settle]')"),app.indexOf("async function renderUsers"));
const checks=[
 ['legacy settlement button routes to pending v2',block.includes("delivery_driver_pending_v2")],
 ['legacy settlement button routes to settle v2',block.includes("delivery_driver_settle_v2")],
 ['custody amount is authoritative',block.includes("custody_amount")],
 ['old cash-status query removed',!block.includes("payment_method=eq.cash")],
 ['old direct order settlement patch removed',!block.includes("driver_settled_at:now")],
 ['old direct driver_settlements insert removed',!block.includes("rest('driver_settlements','',{method:'POST'")]
];
let bad=0;for(const [n,ok] of checks){console.log((ok?'PASS':'FAIL')+' — '+n);if(!ok)bad++}
if(bad)process.exit(1);console.log('Legacy settlement V2 routing guard PASS');
