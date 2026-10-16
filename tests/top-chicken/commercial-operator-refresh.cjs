'use strict';
// SOURCE-ONLY: verify the runtime guard is narrow and fail-closed, never touch a device.
const fs=require('node:fs'),assert=require('node:assert/strict');
const app=fs.readFileSync('app.js','utf8');
const beta=fs.readFileSync('supabase/functions/top-chicken-commercial-sync/index.ts','utf8');
const central=fs.readFileSync('supabase/functions/top-chicken-commercial-proof/index.ts','utf8');
let n=0;const pass=(title,fn)=>{fn();n++;console.log('PASS '+title)};
pass('only beta Top Chicken branch 22 refreshes',()=>{
 assert.match(app,/function isTopChickenSyncDiagnosticsScope\(\)[\s\S]*?https:\/\/xihcxydjnzemflhedzor\.supabase\.co/);
 assert.match(app,/String\(state\.employee\?\.business_id\|\|''\)==='5358328c-9724-49aa-affc-1bce8be90f92'/);
 assert.match(app,/Number\(currentBranchId\(\)\)===22/);
 assert.match(app,/if\(feature&&isTopChickenSyncDiagnosticsScope\(\)\)/);
});
pass('critical feature owners strictly allowlisted',()=>{
 for(const key of ['offline_delivery_driver_save_v1','offline_delivery_zone_save_v1','food_supplier_save_v1']){
 assert.match(app,new RegExp(key+":'"+(key==='food_supplier_save_v1'?'inventory.suppliers':'commerce.delivery')+"'"))}
 assert.match(app,/async function refreshTopChickenCommercialLease\(feature\)/);
 assert.match(app,/await refreshTopChickenCommercialLease\(feature\)/);
 assert.match(app,/await refreshTopChickenCommercialLease\('core.permissions'\)/);
});
pass('refresh is online-only and refuses unverifiable grants',()=>{
 assert.match(app,/req\('\/functions\/v1\/top-chicken-commercial-sync',\{method:'POST',body:'\{\}'\}\)/);
 assert.match(app,/proof\?\.ok!==true/);
 assert.match(app,/proof\.business_id!=='5358328c-9724-49aa-affc-1bce8be90f92'/);
 assert.match(app,/if\(entry\[feature\]!==true\)throw/);
 assert.match(app,/topChickenCommercialLeaseCache=null;throw/);
 assert.match(app,/cache\.expires>now\+12000/);
});
pass('actual Beta JWT and scoped employee/member/branch checks happen server side',()=>{
 assert.match(beta,/admin\.auth\.getUser\(bearer\.slice\(7\)\)/);
 assert.match(beta,/\.eq\('branch_id',22\)\.eq\('active',true\)/);
 assert.match(beta,/business_auth_memberships/);
 assert.match(beta,/TC_BRANCH22_MEMBER_REQUIRED/);
 assert.match(beta,/snapshot\.actor_user_id!==beta_actor_id/);
});
pass('Central issues signed decisions only to HMAC verified Beta transport',()=>{
 assert.match(central,/verifyBody\(key,raw/);
 assert.match(central,/mode==='beta_operator'/);
 assert.match(central,/mode==='central_admin'/);
 assert.match(central,/cloud\.auth\.getUser\(bearer\.slice\(7\)\)/);
 assert.match(central,/Promise\.all\(CODES\.map\(code=>/);
 assert.match(central,/signBody\(key,responseBody\)/);
});
console.log('PASS '+n+' isolated source groups; no live writes, no device install.');
