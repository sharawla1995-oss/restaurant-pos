'use strict';
const fs=require('fs'),app=fs.readFileSync('app.js','utf8');
const f=[],n=(x,m)=>{if(!x)f.push(m)};
const section=(start,end)=>{const s=app.indexOf(start);if(s<0)return '';const e=app.indexOf(end,s+start.length);return app.slice(s,e>s?e:app.length)};
const i=section('async function renderOnlineOrders(','async function renderDeliveryOrders(');
n(/rest\('website_orders'.*limit=\$\{pageSize\+1\}.*offset=\$\{offset\}/.test(i),'source server pagination missing');
n(/rest\('orders'.*source=eq\.website.*limit=\$\{pageSize\+1\}.*offset=\$\{offset\}/.test(i),'canonical server pagination missing');
n(/\['all','الكل'\].*\['new','جديد'\].*\['accepted','مقبول'\].*\['in_fulfillment','قيد التنفيذ'\].*\['completed','مكتمل'\].*\['rejected_cancelled','مرفوض \/ ملغي'\]/.test(i),'lifecycle views missing');
n(/onlineOrderLifecycleState\(w,'source'\)/.test(i)&&/onlineOrderLifecycleState\(o,'canonical'\)/.test(i),'lifecycle normalization missing');
n(/let view='new'/.test(i)&&/isSource&&isNew/.test(i),'safe New/action scope missing');
if(f.length){console.error('Online Orders Lifecycle Views Final: FAIL');f.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Online Orders Lifecycle Views Final: PASS');
