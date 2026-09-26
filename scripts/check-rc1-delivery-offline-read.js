'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const must=(x,m)=>{if(!x)throw new Error(m)};

must(app.includes('async function pendingOfflineDeliveryOrders(){'),'delivery pending local read helper missing');
must(app.includes("if(j?.type!=='sale'||j?.local_order?.order_type!=='delivery')continue;"),'legacy durable local delivery projection missing');
must(app.includes("if(r.operation_type!=='sale'||r.status==='synced')continue;"),'Offline V2 pending delivery projection missing');
must(app.includes("if(p.order_type!=='delivery')continue;"),'Offline V2 delivery filter missing');
must(app.includes("await odbSet('deliveryCurrentOrdersCache',outOrders||[])"),'delivery cloud cache write missing');
must(app.includes("outOrders=(await odbGet('deliveryCurrentOrdersCache'))||[]"),'delivery offline cache fallback missing');
must(app.includes('outOrders=mergeDeliveryCurrentOrders(outOrders,localDelivery);'),'delivery cache/local merge missing');
must(app.includes('وضع Offline: الطلبات من آخر Cache محفوظة على الجهاز + الحركات المحلية المعلقة'),'delivery stale/cache semantics must be visible');
must(app.includes("local?'<span class="tag">بانتظار المزامنة</span>'"),'unsynced local delivery must not expose unsupported server-id actions');
must(app.includes("if(!isNetError(e))throw e;deliveryOnline=false;"),'delivery read must not hide non-network backend failures');

console.log('RC1 delivery Offline read-model gate PASS');
