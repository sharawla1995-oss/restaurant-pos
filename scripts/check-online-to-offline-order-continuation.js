'use strict';
const fs=require('fs');
const route=fs.readFileSync('permissions-v2-order-fulfillment-routing.js','utf8');
const off=fs.readFileSync('beta45-offline-v2-runtime-takeover.js','utf8');
const delivery=fs.readFileSync('beta55-delivery-settlement-shift-cash.js','utf8');
function need(s,re,msg){if(!re.test(s))throw Error(msg)}
need(route,/const localId=String\(order\?\.id\?\?''\)\.trim\(\)[\s\S]*const serverId=String\(order\?\._server_entity_id\?\?''\)\.trim\(\)[\s\S]*if\(online\(\)\)[\s\S]*Number\(serverId\|\|localId\)[\s\S]*order_fulfillment_transition_v2[\s\S]*SharawlaOfflineV2Takeover[\s\S]*saveOrderStatus\(localId,target\)/,'fulfillment must prefer server identity Online and preserve local identity Offline');
need(off,/async function saveOrderStatusV2\(orderId,targetStatus/,'durable Offline order status API missing');
need(off,/payload=\{p_order_id:orderId,p_target_status:target,p_client_tx_id:tx\}/,'Offline event must preserve existing server order id when numeric');
need(off,/if\(type==='return'\|\|type==='order_status'\)return !numericServerId\(payload\?\.p_order_id\)/,'local-id dependency gate missing');
need(delivery,/if\(!isOnline\(\)\)[\s\S]*saveOrderStatus\(raw,'delivered'\)/,'delivery Online->Offline continuation missing');
console.log('Online -> Offline order continuation SOURCE PROOF PASS: existing numeric server IDs continue offline; local IDs remain dependency-gated.');
