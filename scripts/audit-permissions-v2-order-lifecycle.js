'use strict';
const fs=require('fs');

const app=fs.readFileSync('app.js','utf8');
const loader=fs.readFileSync('beta36-integration-loader.js','utf8');
const delivery=fs.readFileSync('supabase-beta55-delivery-settlement-shift-cash.sql','utf8');
const deliveryUi=fs.readFileSync('beta55-delivery-settlement-shift-cash.js','utf8');
const website=fs.readFileSync('supabase-v10-4-11-SAFE-WEBSITE-INTEGRATION.sql','utf8');
const websiteOld=fs.readFileSync('supabase-v10-4-10-website-tracking-cancel.sql','utf8');
const payment=fs.readFileSync('supabase-v9-5-0-website-control.sql','utf8');

function count(re,src){return (src.match(re)||[]).length}
function assert(ok,msg){if(!ok)throw new Error('PV2-F5 audit: '+msg)}

const directPatch=count(/rest\(\s*['"]orders['"][\s\S]{0,320}?method\s*:\s*['"]PATCH['"]/g,app);
assert(directPatch===0,'direct orders PATCH must remain fully retired, found '+directPatch);
const fulfillmentRoutes=count(/__SharawlaPV2OrderFulfillment/g,app);
const driverRoutes=count(/__SharawlaPV2OrderDriverAssignment/g,app);
assert(fulfillmentRoutes===4,'expected exactly 4 fulfillment owner routes, found '+fulfillmentRoutes);
assert(driverRoutes===1,'expected exactly 1 driver assignment owner route, found '+driverRoutes);
assert(loader.includes('permissions-v2-order-fulfillment-routing.js'),'fulfillment routing loader wiring missing');
assert(loader.includes('permissions-v2-order-driver-assignment-routing.js'),'driver assignment routing loader wiring missing');

assert(count(/create or replace function public\.delivery_mark_delivered_v2\s*\(/gi,delivery)===1,
  'delivery_mark_delivered_v2 authoritative definition drift');
assert(/has_action_permission_v2\('delivery\.mark_delivered'\)/.test(delivery),
  'delivery_mark_delivered_v2 must keep delivery.mark_delivered Action guard');
assert(/has_action_permission_v2\('delivery\.payment\.change_at_delivery'\)/.test(delivery),
  'delivery_mark_delivered_v2 must keep payment-change Action guard');
assert(/global\.rpc\('delivery_mark_delivered_v2'/.test(deliveryUi),
  'live delivery completion runtime must route through delivery_mark_delivered_v2');

assert(count(/create or replace function public\.accept_website_order\s*\(/gi,website)===1,
  'accepted website owner definition drift');
assert(count(/create or replace function public\.cancel_website_order_customer\s*\(/gi,website)===1,
  'website cancel owner definition drift in safe integration');
assert(count(/create or replace function public\.cancel_website_order_customer\s*\(/gi,websiteOld)===1,
  'historical website cancel predecessor missing');
assert(count(/create or replace function public\.review_order_payment\s*\(/gi,payment)===1,
  'review_order_payment authoritative source definition drift');

console.log('PV2-F5 order lifecycle audit PASS',JSON.stringify({directPatch,fulfillmentRoutes,driverRoutes}));
