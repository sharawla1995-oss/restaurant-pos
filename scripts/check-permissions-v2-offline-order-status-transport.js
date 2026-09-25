'use strict';
const fs=require('fs');
const rt=fs.readFileSync('beta45-offline-v2-transport-runtime.js','utf8');
const sql=fs.readFileSync('supabase-beta45-offline-v2-transport-v1.sql','utf8');
const owner=fs.readFileSync('permissions-v2-offline-order-status-owner.sql','utf8');
function need(s,t){if(!s.includes(t))throw new Error('Order-status transport missing: '+t)}
for(const t of[
 "if(type==='order_status')return {rpc_name:'order_status_apply_offline_v2',rpc_payload:clone(payload)}",
 "if(type==='return'||type==='order_status')return localOrderTx(payload?.p_order_id)",
 "registerOne('order_status',adapter('order_status','order_event',['order_status_apply_offline_v2']))"
])need(rt,t);
for(const t of[
 "(v_operation='order_status' and v_rpc<>'order_status_apply_offline_v2')",
 "'sale','return','expense','shift_open','shift_close','order_status'",
 "v_operation='order_status'",
 "when 'order_status_apply_offline_v2' then",
 "elsif v_operation in ('return','order_status') then",
 "public.order_status_apply_offline_v2((v_payload->>'p_order_id')::bigint,v_payload->>'p_target_status',v_payload->>'p_client_tx_id')"
])need(sql,t);
need(owner,'OFFLINE_ORDER_STATUS_REPLAY_MISMATCH');
if(/revoke\s+update\s+on\s+(table\s+)?public\.orders/i.test(rt+sql+owner))throw new Error('Premature Orders UPDATE closure');
console.log('Offline V2 order-status transport SOURCE WIRING PASS — DB/runtime deployment still unauthorized');
