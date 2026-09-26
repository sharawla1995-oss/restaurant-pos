'use strict';
const fs=require('fs'),app=fs.readFileSync('app.js','utf8');
const f=[],n=(x,m)=>{if(!x)f.push(m)};
const section=(start,end)=>{const s=app.indexOf(start);if(s<0)return '';const e=app.indexOf(end,s+start.length);return app.slice(s,e>s?e:app.length)};
const r=section('function resolveOnlineOrderFulfillment(','async function rejectOnlineOrderFromChannel(');
const a=section('async function acceptOnlineOrderFromChannel(','function onlineOrderLifecycleState(');
const d=section('async function openDeliveryOrderDetails(','async function renderDeliverySettings(');
n(/type==='delivery'/.test(r)&&/type==='pickup'/.test(r),'fulfillment mappings missing');
n(/operationRoute:null,profileHandler:null/.test(r),'unknown fulfillment not fail-closed');
n(/resolveOnlineOrderFulfillment\(order\)/.test(a)&&/fulfillment/.test(a),'accept fulfillment metadata missing');
n(/const fulfillment=resolveOnlineOrderFulfillment\(o\)/.test(d)&&/const isPickup=fulfillment\.type==='pickup'/.test(d),'operations not consuming fulfillment');
n(!/o\.source==='website'&&o\.order_type==='pickup'/.test(d),'source-specific pickup coupling returned');
if(f.length){console.error('Online Orders Fulfillment Final Handoff: FAIL');f.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Online Orders Fulfillment Final Handoff: PASS');
