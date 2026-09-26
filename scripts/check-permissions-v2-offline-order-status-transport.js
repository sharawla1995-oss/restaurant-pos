'use strict';
const fs=require('fs');
const rt=fs.readFileSync('beta45-offline-v2-transport-runtime.js','utf8');
const sql=fs.readFileSync('supabase-beta45-offline-v2-transport-v1.sql','utf8');
const owner=fs.readFileSync('permissions-v2-offline-order-status-owner.sql','utf8');
const store=fs.readFileSync('beta45-offline-v2-native-store.js','utf8');
function need(s,t){if(!s.includes(t))throw new Error('Order-status transport missing: '+t)}
for(const t of[
 "if(type==='order_status')return {rpc_name:'order_status_apply_offline_v2',rpc_payload:clone(payload)}",
 "if(type==='return'||type==='order_status'||type==='delivery_assign_driver')return localOrderTx(payload?.p_order_id)",
 "registerOne('order_status',adapter('order_status','order_event',['order_status_apply_offline_v2']))"
])need(rt,t);
for(const t of[
 "if(type==='return')return !numericServerId(payload?.p_order_id)&&!localOrderTx(payload?.p_order_id)",
 "if(type==='order_status'||type==='delivery_assign_driver')return !numericServerId(payload?.p_order_id)"
])need(rt,t);
const takeover=fs.readFileSync('beta45-offline-v2-runtime-takeover.js','utf8');
for(const t of[
 "async function saveOrderStatusV2(orderId,targetStatus,providedClientTx=null)",
 "saveOrderStatus:saveOrderStatusV2"
])need(takeover,t);
for(const t of[
 "(v_operation='order_status' and v_rpc<>'order_status_apply_offline_v2')",
 "'sale','return','expense','shift_open','shift_close','order_status'",
 "v_operation='order_status'",
 "when 'order_status_apply_offline_v2' then",
 "elsif v_operation in ('return','order_status','delivery_assign_driver') then",
 "public.order_status_apply_offline_v2((v_payload->>'p_order_id')::bigint,v_payload->>'p_target_status',v_payload->>'p_client_tx_id')"
])need(sql,t);
need(owner,'OFFLINE_ORDER_STATUS_REPLAY_MISMATCH');
for(const t of[
 "if(text(input?.operation_type)==='order_status')",
 "rpcName!=='order_status_apply_offline_v2'",
 "errors.push('invalid:order_status_rpc_payload')",
 "errors.push('missing:order_status:p_order_id')",
 "errors.push('missing:order_status:p_target_status')",
 "text(rpcPayload.p_client_tx_id)!==text(input?.client_tx_id)",
 "errors.push('invalid:order_status_client_tx_binding')"
])need(store,t);
if(/revoke\s+update\s+on\s+(table\s+)?public\.orders/i.test(rt+sql+owner))throw new Error('Premature Orders UPDATE closure');
console.log('Offline V2 order-status transport SOURCE WIRING PASS — DB/runtime deployment still unauthorized');
