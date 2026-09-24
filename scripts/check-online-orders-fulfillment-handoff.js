'use strict';
const fs=require('fs');const app=fs.readFileSync('app.js','utf8');const fail=[];const need=(x,m)=>{if(!x)fail.push(m)};
const resolver=(app.match(/function resolveOnlineOrderFulfillment\([\s\S]*?\n}/)||[])[0]||'';
const accept=(app.match(/async function acceptOnlineOrderFromChannel\([\s\S]*?\n}\n\nfunction resolveOnlineOrderFulfillment/)||[])[0]||'';
const details=(app.match(/async function openDeliveryOrderDetails\([\s\S]*?\n}\n\nasync function renderDeliverySettings/)||[])[0]||'';
need(/type==='delivery'/.test(resolver),'delivery fulfillment mapping missing');
need(/type==='pickup'/.test(resolver),'pickup fulfillment mapping missing');
need(/operationRoute:'deliveryOrders'/.test(resolver),'Restaurant operational route mapping missing');
need(/operationRoute:null,profileHandler:null/.test(resolver),'unknown fulfillment must fail closed');
need(/resolveOnlineOrderFulfillment\(order\)/.test(accept),'Accept result must expose fulfillment boundary');
need(/fulfillment}/.test(accept),'Accept result missing fulfillment metadata');
need(/const fulfillment=resolveOnlineOrderFulfillment\(o\)/.test(details),'operations must consume fulfillment boundary');
need(/const isPickup=fulfillment\.type==='pickup'/.test(details),'pickup operation still source-coupled');
need(!/o\.source==='website'&&o\.order_type==='pickup'/.test(details),'website-specific pickup coupling remained');
need((app.match(/rpc\('accept_website_order'/g)||[]).length===1,'Accept RPC ownership regressed');
need((app.match(/rpc\('reject_website_order'/g)||[]).length===1,'Reject RPC ownership regressed');
if(fail.length){console.error('Online Orders Batch 7 Fulfillment Handoff: FAIL');fail.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Online Orders Batch 7 Fulfillment Handoff: PASS');
console.log('core=fulfillment-type; restaurant-adapter=delivery/pickup; unknown=fail-closed; rpc-owners=preserved');
