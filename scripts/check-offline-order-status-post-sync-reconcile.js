'use strict';
const fs=require('fs'),s=fs.readFileSync('beta45-offline-v2-transport-runtime.js','utf8');
function need(re,msg){if(!re.test(s))throw Error(msg)}
need(/async function reconcileOrderStatusProjection\(\)/,'reconcile helper missing');
need(/_offline_status_pending[\s\S]*rest\('orders',[\s\S]*server\.status[\s\S]*delete bundle\.order\._offline_status_pending/,'server-confirmed pending cleanup missing');
need(/const result=await api\.syncNow\(await syncContext\(\)\);await reconcileOrderStatusProjection\(\);return result/,'reconcile must run after successful sync');
console.log('Offline order status post-sync reconciliation SOURCE PASS');
