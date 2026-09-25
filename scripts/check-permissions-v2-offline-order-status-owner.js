'use strict';
const fs=require('fs');
const sql=fs.readFileSync('permissions-v2-offline-order-status-owner.sql','utf8');
const transport=fs.readFileSync('beta45-offline-v2-transport-runtime.js','utf8');
function need(s,t){if(!s.includes(t))throw new Error('Offline order-status owner missing: '+t)}
for(const t of[
 'create table if not exists public.offline_order_status_receipts_v2',
 'create or replace function public.order_status_apply_offline_v2',
 "v_target not in ('preparing','ready','completed','delivered')",
 "pg_advisory_xact_lock(hashtextextended('offline-order-status:'||v_tx,0))",
 'OFFLINE_ORDER_STATUS_REPLAY_MISMATCH',
 'has_branch_access(v_order.branch_id)',
 'delivery_mark_delivered_v2(v_order.id,v_order.payment_method,v_tx)',
 'order_fulfillment_transition_v2(v_order.id,v_target)',
 'grant execute on function public.order_status_apply_offline_v2(bigint,text,text) to authenticated'
])need(sql,t);
if(/revoke\s+update\s+on\s+(table\s+)?public\.orders/i.test(sql))throw new Error('Offline owner must not prematurely close Orders UPDATE');
need(transport,"registerOne('order_status',adapter('order_status','order_event',['order_status_apply_offline_v2']))");
need(transport,"if(type==='order_status')return {rpc_name:'order_status_apply_offline_v2',rpc_payload:clone(payload)}");
console.log('Offline V2 order-status owner SOURCE PASS — coordinated transport wiring present');
