'use strict';
const fs=require('fs'),assert=require('assert');
const read=f=>fs.readFileSync(f,'utf8');
const phase9=read('scripts/check-beta45-offline-v2-acceptance-harness.js');
const e2e=read('owner-acceptance-e2e-v3.js');
const delivery=read('owner-acceptance-beta55-delivery-settlement-v55.js');
const fulfillment=read('permissions-v2-order-fulfillment-routing.js');
const driver=read('permissions-v2-order-driver-assignment-routing.js');
const settlement=read('beta55-delivery-settlement-shift-cash.js');
const orderStatusE2E=read('owner-acceptance-offline-order-status-v58.js');
const lazy=read('owner-acceptance-lazy-loader-v47.js');

function has(src,t,msg=t){assert(src.includes(t),`Offline acceptance coverage missing: ${msg}`)}
function declaredOnly(name){return phase9.includes(`'${name}'`) && !e2e.includes(`id:'${name}'`) && !e2e.includes(`id:"${name}"`)}

const declared=['offline_return','offline_expense','offline_customer'];
for(const x of declared)assert(declaredOnly(x),`Coverage classification changed for ${x}; update this audit with executable evidence`);

for(const t of ["id:'retail.offline-sale-sync'","id:'retail.lost-ack-idempotency'",'saveOfflineSale','syncClientTx'])has(e2e,t);
for(const t of ["id:'offline.order-status-runtime-e2e'",'__SharawlaPV2OrderFulfillment','order_status_apply_offline_v2','offline_v2_server_receipts','offline_order_status_receipts_v2','waitSynced','replay/idempotency'])has(orderStatusE2E,t);
has(lazy,'owner-acceptance-offline-order-status-v58.js','runtime acceptance must be lazy-loaded');
for(const t of ["id:'beta55.delivery-settlement-shift-cash'",'delivery_mark_delivered_v2','delivery_driver_settle_v2','driver_custody_unsettled'])has(delivery,t);
has(fulfillment,'SharawlaOfflineV2Takeover.saveOrderStatus','fulfillment offline durable status route');
has(driver,'online only','driver assignment must remain explicitly classified online-only');
has(driver,"global.rpc('order_assign_driver_v2'",'driver assignment online owner');
has(settlement,'if(!isOnline())return false','interactive delivered flow is not offline-complete');
has(settlement,"ov2.saveOrderStatus(raw,'delivered')",'legacy offline delivered interception remains visible for equivalence audit');

const coverage={
 executable_runtime:['retail.offline-sale-sync','retail.lost-ack-idempotency','offline.order-status-runtime-e2e'],
 executable_online_business_semantics:['beta55.delivery-settlement-shift-cash'],
 source_contract_only:['offline_order_status routing/binding/replay guards (plus executable runtime E2E)'],
 declared_matrix_not_e2e:['offline_return','offline_expense','offline_customer'],
 known_gap:['offline driver assignment','offline delivery completion economic-equivalence']
};
console.log('Offline Runtime Acceptance Coverage Audit PASS');
console.log(JSON.stringify(coverage,null,2));
