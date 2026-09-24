'use strict';
const fs=require('fs');const app=fs.readFileSync('app.js','utf8');const fail=[];const need=(x,m)=>{if(!x)fail.push(m)};
const inbox=(app.match(/async function renderOnlineOrders\([\s\S]*?\n}\n\nasync function renderDeliveryOrders/)||[])[0]||'';
need(/rest\('website_orders'.*order=created_at\.desc&limit=100/.test(inbox),'source history fetch missing');
need(/rest\('orders'.*source=eq\.website.*limit=100/.test(inbox),'canonical online history fetch missing');
need(/\['all','الكل'\].*\['new','جديد'\].*\['accepted','مقبول'\].*\['in_fulfillment','قيد التنفيذ'\].*\['completed','مكتمل'\].*\['rejected_cancelled','مرفوض \/ ملغي'\]/.test(inbox),'Core lifecycle views missing');
need(/onlineOrderLifecycleState\(w,'source'\)/.test(inbox),'source lifecycle normalization missing');
need(/onlineOrderLifecycleState\(o,'canonical'\)/.test(inbox),'canonical lifecycle normalization missing');
need(/matchesView/.test(inbox)&&/rejected','cancelled/.test(inbox),'rejected/cancelled view mapping missing');
need(/let view='new'/.test(inbox),'safe default New view missing');
need(/data-online-view/.test(inbox),'view filter controls missing');
need(/isSource&&isNew/.test(inbox),'source actions must be restricted to raw New orders');
need(/data-online-accept/.test(inbox)&&/data-online-reject/.test(inbox),'New Accept/Reject actions missing');
need(/data-web-details/.test(inbox)&&/data-web-receipt/.test(inbox),'New details/receipt actions missing');
need((app.match(/rpc\('accept_website_order'/g)||[]).length===1,'Accept RPC ownership regressed');
need((app.match(/rpc\('reject_website_order'/g)||[]).length===1,'Reject RPC ownership regressed');
if(fail.length){console.error('Online Orders Batch 10 Lifecycle Views: FAIL');fail.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Online Orders Batch 10 Lifecycle Views: PASS');
console.log('views=all/new/accepted/in_fulfillment/completed/rejected_cancelled; actions=raw-new-only; db=unchanged');
