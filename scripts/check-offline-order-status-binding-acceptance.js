'use strict';
const fs=require('fs');
const store=fs.readFileSync('beta45-offline-v2-native-store.js','utf8');
const transport=fs.readFileSync('beta45-offline-v2-transport-runtime.js','utf8');
function need(src,t,msg=t){if(!src.includes(t))throw new Error('Offline order-status binding acceptance missing: '+msg)}
for(const t of[
 "if(text(input?.operation_type)==='order_status')",
 "rpcName!=='order_status_apply_offline_v2'",
 "errors.push('invalid:order_status_rpc_payload')",
 "errors.push('missing:order_status:p_order_id')",
 "errors.push('missing:order_status:p_target_status')",
 "text(rpcPayload.p_client_tx_id)!==text(input?.client_tx_id)",
 "errors.push('invalid:order_status_client_tx_binding')"
])need(store,t);
const vf=store.indexOf('function validateCommit(input)');
const guard=store.indexOf("if(text(input?.operation_type)==='order_status')",vf);
const cf=store.indexOf('async function commitOperationUnsafe');
const call=store.indexOf('validateCommit(input);',cf);
const begin=store.indexOf("exec('BEGIN IMMEDIATE TRANSACTION')",cf);
const seq=store.indexOf('allocateSequence(',begin);
const outbox=store.indexOf('INSERT INTO offline_v2_outbox',begin);
if(!(vf>=0&&guard>vf&&cf>guard&&call>cf&&call<begin&&begin<seq&&seq<outbox))throw new Error('Order-status binding guard is not pre-write');
for(const t of[
 "if(type==='order_status')return {rpc_name:'order_status_apply_offline_v2',rpc_payload:clone(payload)}",
 "registerOne('order_status',adapter('order_status','order_event',['order_status_apply_offline_v2']))"
])need(transport,t);
console.log('Offline order status binding focused SOURCE ACCEPTANCE PASS — malformed binding is fail-closed before sequence/outbox; correct transport binding is present');
