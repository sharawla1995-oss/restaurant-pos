'use strict';
const fs=require('fs');

const app=fs.readFileSync('app.js','utf8');
const delivery=fs.readFileSync('supabase-beta55-delivery-settlement-shift-cash.sql','utf8');
const deliveryUi=fs.readFileSync('beta55-delivery-settlement-shift-cash.js','utf8');
const website=fs.readFileSync('supabase-v10-4-11-SAFE-WEBSITE-INTEGRATION.sql','utf8');
const websiteOld=fs.readFileSync('supabase-v10-4-10-website-tracking-cancel.sql','utf8');
const payment=fs.readFileSync('supabase-v9-5-0-website-control.sql','utf8');

function count(re,src){return (src.match(re)||[]).length}
function assert(ok,msg){if(!ok)throw new Error('PV2-F5 audit: '+msg)}

const directPatch=count(/rest\(\s*['"]orders['"][\s\S]{0,320}?method\s*:\s*['"]PATCH['"]/g,app);
assert(directPatch===7,'expected 7 direct orders PATCH call sites, found '+directPatch);

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

const directBodies=[...app.matchAll(/rest\(\s*['"]orders['"][\s\S]{0,320}?method\s*:\s*['"]PATCH['"][\s\S]{0,320}?body\s*:\s*JSON\.stringify\(\{([^}]*)\}\)/g)].map(m=>m[1]);
assert(directBodies.length===7,'could not classify all seven direct PATCH bodies');
const classes={
 delivered:directBodies.filter(x=>/status\s*:\s*['"]delivered['"]/.test(x)).length,
 kitchenDynamic:directBodies.filter(x=>/status\s*:\s*b\.dataset\.status/.test(x)).length,
 assignDriver:directBodies.filter(x=>/driver_id\s*:\s*d\.id/.test(x)&&/out_for_delivery/.test(x)).length,
 preparing:directBodies.filter(x=>/status\s*:\s*['"]preparing['"]/.test(x)).length,
 ready:directBodies.filter(x=>/status\s*:\s*['"]ready['"]/.test(x)).length,
 completed:directBodies.filter(x=>/status\s*:\s*['"]completed['"]/.test(x)).length
};
assert(classes.delivered===2,'expected two legacy direct delivered PATCHes');
assert(classes.kitchenDynamic===1,'expected one Kitchen dynamic status PATCH');
assert(classes.assignDriver===1,'expected one driver assignment PATCH');
assert(classes.preparing===1,'expected one preparing PATCH');
assert(classes.ready===1,'expected one ready PATCH');
assert(classes.completed===1,'expected one completed PATCH');

console.log('PV2-F5 order lifecycle audit PASS',JSON.stringify({directPatch,classes}));
