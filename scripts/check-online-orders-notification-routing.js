'use strict';
const fs=require('fs'),app=fs.readFileSync('app.js','utf8');
const f=[],n=(x,m)=>{if(!x)f.push(m)};
const section=(start,end)=>{const s=app.indexOf(start);if(s<0)return '';const e=app.indexOf(end,s+start.length);return app.slice(s,e>s?e:app.length)};
const r=section('function onlineOrderNotificationRoute(','function showWebsiteOrderAlert(');
const a=section('function showWebsiteOrderAlert(','async function checkWebsiteOrders(');
const w=section('async function checkWebsiteOrders(','function startWebsiteOrderWatch(');
n(/resolveOnlineOrderChannel\(source\)/.test(r)&&/channel\.supported\?'onlineOrders':null/.test(r),'channel route/fail-closed missing');
n(/onlineOrderNotificationRoute\('website'\)/.test(a)&&/showPage\(route\)/.test(a),'alert route boundary missing');
n(!/showPage\('deliveryOrders'\)/.test(a),'alert recoupled to Delivery');
n(/canAccessPage\('onlineOrders'\)/.test(w),'watcher permission route wrong');
n(/websiteOrderBeep\(\)/.test(a)&&/setInterval\(checkWebsiteOrders,5000\)/.test(app),'notification behavior regressed');
if(f.length){console.error('Online Orders Notification Final Routing: FAIL');f.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Online Orders Notification Final Routing: PASS');
