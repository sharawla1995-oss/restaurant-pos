'use strict';
const fs=require('fs');
const sql=fs.readFileSync('permissions-v2-orders-privilege-closure.sql','utf8');
const app=fs.readFileSync('app.js','utf8');
function need(t){if(!sql.toLowerCase().includes(t.toLowerCase()))throw Error('F5E closure missing: '+t)}
need("select sharawla_internal.assert_operational_profile_v1('restaurant')");
need('drop policy if exists orders_branch_update on public.orders');
need('revoke update on table public.orders from authenticated');
if((app.match(/rest\(\s*['"]orders['"][\s\S]{0,260}?method\s*:\s*['"]PATCH['"]/g)||[]).length)throw Error('F5E closure forbidden while direct renderer Orders PATCH exists');
for(const p of ['permissions-v2-owner-order-fulfillment.sql','permissions-v2-owner-order-driver-assignment.sql','permissions-v2-offline-order-status-owner.sql','permissions-v2-owner-website-payment-review.sql']){
 if(!fs.existsSync(p))throw Error('F5E required owner artifact missing: '+p);
}
console.log('PV2-F5E Orders privilege closure SOURCE ARTIFACT PASS — NOT DEPLOYED');
