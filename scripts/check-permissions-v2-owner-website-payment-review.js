'use strict';
const fs=require('fs');
const sql=fs.readFileSync('permissions-v2-owner-website-payment-review.sql','utf8');
const app=fs.readFileSync('app.js','utf8');
function need(s,t){if(!s.toLowerCase().includes(t.toLowerCase()))throw new Error('PV2-F5D missing: '+t)}
for(const t of[
 "'orders.payment.review'","create or replace function public.review_order_payment(p_order_id bigint,p_status text)",
 "has_action_permission_v2('orders.payment.review')","has_branch_access(o.branch_id)",
 "p_status not in ('unpaid','proof_submitted','confirmed','rejected')",
 "update public.website_orders set payment_status=p_status,payment_reviewed_at=now(),payment_reviewed_by=v_emp",
 "grant execute on function public.review_order_payment(bigint,text) to authenticated"
])need(sql,t);
if(/revoke\s+update\s+on\s+(table\s+)?public\.orders/i.test(sql))throw new Error('PV2-F5D must not perform F5E global orders closure');
for(const forbidden of['delivery_mark_delivered_v2','accept_website_order','cancel_website_order_customer'])if(sql.includes('create or replace function public.'+forbidden))throw new Error('PV2-F5D must not replace '+forbidden);
const calls=(app.match(/rpc\(\s*['"]review_order_payment['"]/g)||[]).length;
if(calls!==3)throw new Error('PV2-F5D expected 3 website payment review UI calls, found '+calls);
console.log('PV2-F5D Website Payment Review SOURCE PREP PASS — runtime calls='+calls);
