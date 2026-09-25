'use strict';
const fs=require('fs');
const sql=fs.readFileSync('permissions-v2-owner-order-driver-assignment.sql','utf8');
const helper=fs.readFileSync('permissions-v2-order-driver-assignment-routing.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const loader=fs.readFileSync('beta36-integration-loader.js','utf8');
function need(s,t,l){if(!s.toLowerCase().includes(t.toLowerCase()))throw new Error(l+' missing: '+t)}
for(const t of[
 "'orders.delivery.assign_driver'","'delivery','orders'",
 "create or replace function public.order_assign_driver_v2",
 "has_action_permission_v2('orders.delivery.assign_driver')",
 "lower(coalesce(v_order.order_type,''))<>'delivery'",
 "lower(coalesce(v_order.status,''))<>'ready'",
 "v_driver.active is distinct from true",
 "v_driver.branch_id is distinct from v_order.branch_id",
 "status='out_for_delivery'","has_branch_access(v_order.branch_id)"
])need(sql,t,'PV2-F5B SQL');
need(helper,"rpc('order_assign_driver_v2'",'PV2-F5B routing');
if(/revoke\s+update\s+on\s+table\s+public\.orders/i.test(sql))throw new Error('PV2-F5B must not perform F5E global closure');
if(/delivery_mark_delivered_v2\s*\(/i.test(sql))throw new Error('PV2-F5B must not replace Delivery completion owner');
if(loader.includes('permissions-v2-order-driver-assignment-routing.js'))throw new Error('PV2-F5B helper must remain unwired');
const direct=(app.match(/rest\(\s*['"]orders['"][\s\S]{0,260}?method\s*:\s*['"]PATCH['"]/g)||[]);
const assigns=direct.filter(x=>x.includes('driver_id')&&x.includes('out_for_delivery'));
if(assigns.length!==1)throw new Error('PV2-F5B expected exactly 1 direct driver assignment path, found '+assigns.length);
console.log('PV2-F5B Driver Assignment owner SOURCE PREP PASS — direct assignment paths='+assigns.length);
