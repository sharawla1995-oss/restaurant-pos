'use strict';
const fs=require('fs');
const s=fs.readFileSync('permissions-v2-sh0007-cloud-projection.sql','utf8');
for(const x of [
"91826502-590e-4afa-8826-2c0f4b99c490","'restaurant'","'core.customers'","'core.expenses'","'commerce.delivery'","'commerce.orders'",
"PV2_B_BINDING_TABLE_REQUIRED","PV2_C_ENTITLEMENT_TABLE_REQUIRED","SH0007_PV2_BINDING_ASSERTION_FAILED","SH0007_PV2_ENTITLEMENT_ASSERTION_FAILED"
])if(!s.includes(x))throw new Error('PV2_SH0007_PROJECTION_MISSING '+x);
if(/SH-0005|SH-0006/.test(s)===false)throw new Error('PV2_SH0007_PRODUCTION_WARNING_MISSING');
if(!/begin;[\s\S]*commit;/i.test(s))throw new Error('PV2_SH0007_TRANSACTION_MISSING');
console.log('PV2 SH-0007 Cloud projection artifact: PASS');
