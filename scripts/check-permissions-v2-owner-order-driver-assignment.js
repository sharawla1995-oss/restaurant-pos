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
 "status='out_for_delivery'","has_branch_access(v_order.branch_id)",
 "'orders.delivery.assign_driver','restaurant','commerce.delivery'"
])need(sql,t,'PV2-F5B SQL');
need(helper,"rpc('order_assign_driver_v2'",'PV2-F5B routing');
if(/revoke\s+update\s+on\s+table\s+public\.orders/i.test(sql))throw new Error('PV2-F5B must not perform F5E global closure');
if(/delivery_mark_delivered_v2\s*\(/i.test(sql))throw new Error('PV2-F5B must not replace Delivery completion owner');
need(loader,'permissions-v2-order-driver-assignment-routing.js','PV2-F5B loader wiring');
const direct=(app.match(/rest\(\s*['"]orders['"][\s\S]{0,260}?method\s*:\s*['"]PATCH['"]/g)||[]);
const assigns=direct.filter(x=>x.includes('driver_id')&&x.includes('out_for_delivery'));
if(assigns.length!==0)throw new Error('PV2-F5B direct driver assignment PATCH must be retired, found '+assigns.length);
need(app,'__SharawlaPV2OrderDriverAssignment','PV2-F5B renderer routing');
console.log('PV2-F5B Driver Assignment RENDERER ROUTING PASS — direct assignment paths=0');
