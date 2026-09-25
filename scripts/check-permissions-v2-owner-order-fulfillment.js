'use strict';
const fs=require('fs');
const sql=fs.readFileSync('permissions-v2-owner-order-fulfillment.sql','utf8');
const helper=fs.readFileSync('permissions-v2-order-fulfillment-routing.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const loader=fs.readFileSync('beta36-integration-loader.js','utf8');
function need(src,t,label){if(!src.toLowerCase().includes(t.toLowerCase()))throw new Error(label+' missing: '+t)}
for(const t of[
 "assert_operational_profile_v1('restaurant')",
 "'orders.fulfillment.manage'",
 "'orders','orders'",
 "create or replace function public.order_fulfillment_transition_v2",
 "has_action_permission_v2('orders.fulfillment.manage')",
 "if v_from<>'new'",
 "if v_from<>'preparing'",
 "if v_from<>'ready'",
 "delivery_completion_requires_delivery_owner",
 "has_branch_access(v_order.branch_id)",
 "revoke all on function public.order_fulfillment_transition_v2(bigint,text) from public,anon"
])need(sql,t,'PV2-F5A SQL');
for(const t of["rpc('order_fulfillment_transition_v2'","['preparing','ready','completed']"])need(helper,t,'PV2-F5A routing');
if(/revoke\s+update\s+on\s+table\s+public\.orders/i.test(sql))throw new Error('PV2-F5A must not perform F5E global Orders privilege closure');
if(/delivery_mark_delivered_v2\s*\(/i.test(sql))throw new Error('PV2-F5A must not replace Delivery completion owner');
if(/review_order_payment\s*\(/i.test(sql))throw new Error('PV2-F5A must not replace Website payment review owner');
if(/accept_website_order\s*\(/i.test(sql)||/cancel_website_order_customer\s*\(/i.test(sql))throw new Error('PV2-F5A must not replace Website accept/cancel owners');
need(helper,"SharawlaOfflineV2Takeover",'PV2-F5A offline routing');
need(helper,"saveOrderStatus(raw,target)",'PV2-F5A offline routing');
need(loader,"permissions-v2-order-fulfillment-routing.js",'PV2-F5A loader wiring');

const direct=(app.match(/rest\(\s*['"]orders['"][\s\S]{0,260}?method\s*:\s*['"]PATCH['"]/g)||[]);
if(direct.length!==0)throw new Error('PV2-F5A direct Orders PATCH paths must be fully retired, found '+direct.length);
const routerCalls=(app.match(/__SharawlaPV2OrderFulfillment/g)||[]).length;
if(routerCalls<4)throw new Error('PV2-F5A renderer routing expected at least 4 fulfillment router call sites, found '+routerCalls);
const statuses={preparing:0,ready:0,completed:0,out_for_delivery:0,delivered:0};
for(const x of direct){for(const k of Object.keys(statuses))if(x.includes(k))statuses[k]++}
if(statuses.preparing||statuses.ready||statuses.completed)throw new Error('PV2-F5A direct fulfillment PATCH still present '+JSON.stringify(statuses));
console.log('PV2-F5A Order Fulfillment RENDERER ROUTING PASS — remaining direct PATCH='+direct.length+'; routerRefs='+routerCalls+'; '+JSON.stringify(statuses));
