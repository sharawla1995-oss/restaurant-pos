'use strict';
const fs=require('fs');
const s=fs.readFileSync('beta45-offline-v2-runtime-takeover.js','utf8');
function need(re,msg){if(!re.test(s))throw Error(msg)}
need(/const entry=await ensureCommitted\('order_status',payload,tx\);[\s\S]*odbGet\('cachedOrders'\)/,'projection must happen after durable order_status commit');
need(/String\(bundle\?\.order\?\.id\)!==String\(orderId\)/,'projection must target the same order identity');
need(/status:target,_offline_status_pending:true,_offline_status_tx:tx/,'pending local status metadata missing');
need(/if\(changed\)await odbSet\('cachedOrders',bundles\)/,'cached order projection persistence missing');
console.log('Offline order status local projection SOURCE PASS');
