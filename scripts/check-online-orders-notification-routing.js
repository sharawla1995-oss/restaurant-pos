'use strict';
const fs=require('fs');const app=fs.readFileSync('app.js','utf8');const fail=[];const need=(x,m)=>{if(!x)fail.push(m)};
const route=(app.match(/function onlineOrderNotificationRoute\([\s\S]*?\n}/)||[])[0]||'';
const alert=(app.match(/function showWebsiteOrderAlert\([\s\S]*?\n}/)||[])[0]||'';
const watch=(app.match(/async function checkWebsiteOrders\([\s\S]*?\n}/)||[])[0]||'';
need(/channel==='website'\)return 'onlineOrders'/.test(route),'website notification must resolve to Online Orders');
need(/return null/.test(route),'unknown channel notification must fail closed');
need(/onlineOrderNotificationRoute\('website'\)/.test(alert),'website alert must use channel route boundary');
need(!/showPage\('deliveryOrders'\)/.test(alert),'website alert still routes to Delivery');
need(/showPage\(route\)/.test(alert),'resolved inbox route is not opened');
need(/canAccessPage\('onlineOrders'\)/.test(watch),'watcher must gate on Online Orders access');
need(!/canAccessPage\('deliveryOrders'\)/.test(watch),'watcher still directly coupled to Delivery access');
need(/websiteOrderBeep\(\)/.test(alert),'existing notification sound changed');
need(/setInterval\(checkWebsiteOrders,5000\)/.test(app),'existing watcher interval changed');
if(fail.length){console.error('Online Orders Batch 6 Notification Routing: FAIL');fail.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Online Orders Batch 6 Notification Routing: PASS');
console.log('website_route=onlineOrders; unknown_channel=fail-closed; watcher=preserved; sound=preserved');
