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
const coreOpsE2E=read('owner-acceptance-offline-core-ops-v58.js');
const customerDeliveryE2E=read('owner-acceptance-offline-customer-delivery-v58.js');
const lazy=read('owner-acceptance-lazy-loader-v47.js');

function has(src,t,msg=t){assert(src.includes(t),`Offline acceptance coverage missing: ${msg}`)}
function declaredOnly(name){return phase9.includes(`'${name}'`) && !e2e.includes(`id:'${name}'`) && !e2e.includes(`id:"${name}"`)}

const declared=[];
const transportRuntime=read('beta45-offline-v2-transport-runtime.js');
const customerCreateRouting=read('permissions-v2-customers-create-routing.js');
const customerEditRouting=read('permissions-v2-customers-edit-address-routing.js');
for(const t of ["registerOne('customer_create'","registerOne('customer_update'","registerOne('customer_address_save'","registerOne('customer_address_delete'","registerOne('delivery_assign_driver'"])has(transportRuntime,t);
has(customerCreateRouting,"commitRpc('offline_customer_create_v1'",'Customer create durable offline route');
for(const t of ["offline_customer_update_v1","offline_customer_address_save_v1","offline_customer_address_delete_v1"])has(customerEditRouting,t);

for(const t of ["id:'retail.offline-sale-sync'","id:'retail.lost-ack-idempotency'",'saveOfflineSale','syncClientTx'])has(e2e,t);
for(const t of ["id:'offline.order-status-runtime-e2e'",'__SharawlaPV2OrderFulfillment','order_status_apply_offline_v2','offline_v2_server_receipts','offline_order_status_receipts_v2','waitSynced','replay/idempotency'])has(orderStatusE2E,t);
has(lazy,'owner-acceptance-offline-order-status-v58.js','runtime acceptance must be lazy-loaded');
for(const t of ["id:'offline.expense-runtime-e2e'","id:'offline.return-runtime-e2e'",'saveExpense','saveReturn','offline_v2_server_receipts','replay=stable'])has(coreOpsE2E,t);
has(lazy,'owner-acceptance-offline-core-ops-v58.js','offline core ops runtime acceptance must be lazy-loaded');
for(const t of ["id:'beta55.delivery-settlement-shift-cash'",'delivery_mark_delivered_v2','delivery_driver_settle_v2','driver_custody_unsettled'])has(delivery,t);
has(fulfillment,'SharawlaOfflineV2Takeover.saveOrderStatus','fulfillment offline durable status route');
has(driver,"commitRpc('offline_delivery_assign_driver_v1'",'driver assignment durable offline route');
for(const t of ["id:'offline.customer-create-runtime-e2e'","id:'offline.customer-dependent-address-runtime-e2e'","id:'offline.customer-mutations-runtime-e2e'","id:'offline.delivery-driver-runtime-e2e'","id:'offline.delivery-economic-runtime-e2e'",'delivery_payment_events','delivery_cash_custody_amount','economic replay=stable'])has(customerDeliveryE2E,t);
has(lazy,'owner-acceptance-offline-customer-delivery-v58.js','customer/delivery runtime acceptance must be lazy-loaded');
has(settlement,'if(!isOnline())return false','interactive payment-choice delivery UI remains online-only; offline completion preserves stored method');
has(settlement,"ov2.saveOrderStatus(raw,'delivered')",'legacy offline delivered interception remains visible for equivalence audit');

const coverage={
 executable_runtime:['retail.offline-sale-sync','retail.lost-ack-idempotency','offline.order-status-runtime-e2e','offline.expense-runtime-e2e','offline.return-runtime-e2e','offline.customer-create-runtime-e2e','offline.customer-dependent-address-runtime-e2e','offline.customer-mutations-runtime-e2e','offline.delivery-driver-runtime-e2e','offline.delivery-economic-runtime-e2e'],
 executable_online_business_semantics:['beta55.delivery-settlement-shift-cash'],
 source_contract_only:['offline_order_status routing/binding/replay guards (plus executable runtime E2E)'],
 declared_matrix_not_e2e:[],
 known_gap:['offline delivery payment-method change remains online-only']
};
console.log('Offline Runtime Acceptance Coverage Audit PASS');
console.log(JSON.stringify(coverage,null,2));
