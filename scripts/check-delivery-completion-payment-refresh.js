'use strict';
const fs=require('fs');
const src=fs.readFileSync('beta55-delivery-settlement-shift-cash.js','utf8');
const checks=[
 ['payment resolver is async',/async function paymentOptions\(order\)/],
 ['server payment methods refresh',/global\.rest\('payment_methods','select=id,code,name,active,sort_order&active=eq\.true&order=sort_order,id'\)/],
 ['server branch payment refresh',/global\.rest\('branch_payment_methods',`select=branch_id,payment_method_id,active,is_default&branch_id=eq\.\$\{bid\}&active=eq\.true`\)/],
 ['delivery awaits fresh methods',/const methods=await paymentOptions\(order\);/],
 ['no bootstrap cache payment eligibility',/const links=global\.state\?\.branchPaymentMethods\|\|\[\]/,true],
 ['delivery RPC preserved',/global\.rpc\('delivery_mark_delivered_v2'/]
];
let failed=0;
for(const [name,re,negative] of checks){const hit=re.test(src);const pass=negative?!hit:hit;console.log((pass?'PASS':'FAIL')+' — '+name);if(!pass)failed++;}
if(failed){console.error('Delivery completion payment refresh guard: FAIL');process.exit(1)}
console.log('Delivery completion payment refresh guard: PASS');
