// SOURCE-ONLY isolated review. No Supabase, grants, SQL or device operations.
import assert from 'node:assert/strict';
import {TOP_CHICKEN,FEATURE_CODES,LEASE_MS,prepareTopChickenLease} from
 '../../supabase/functions/top-chicken-entitlement-bridge/policy.mjs';
const at='2026-10-16T00:00:00.000Z';
const current=new Date('2026-10-16T00:00:01.000Z');
const create=()=>{
 const decisions={};
 for(const code of FEATURE_CODES)decisions[code]={
   business_id:TOP_CHICKEN,feature_code:code,entitled:true,
   reason_code:code.startsWith('core.')?'CORE_INCLUDED':
     ['commerce.orders','commerce.pos','commerce.products'].includes(code)?
     'PACKAGE_ENTITLED':'PAID_ADDON_ENTITLED',
   feature_active:true,feature_implemented:true,override_disabled:false,
   evaluation_time:at,effective_from:null,effective_until:null
 };
 return {business_id:TOP_CHICKEN,profile_code:'restaurant',
   business_active:true,profile_active:true,observed_at:at,decisions};
};
let count=0;
function pass(title,fn){fn();count++;console.log('PASS',title)}
pass('exact Top Chicken list, 10-second bounded grants',()=>{
 const result=prepareTopChickenLease(create(),{now:current});
 assert.deepEqual(result.rows.map(x=>x.feature_code),FEATURE_CODES);
 assert.equal(result.rows.length,13);
 assert(result.rows.every(x=>x.enabled===true&&x.entitlement_version===Date.parse(at)));
 assert.equal(Date.parse(result.lease_deadline)-Date.parse(result.observed_at),LEASE_MS);
 assert(result.rows.every(x=>x.valid_until===result.lease_deadline));
});
pass('revoked supplier explicitly denied, other features unaffected',()=>{
 const s=create();s.decisions['inventory.suppliers'].entitled=false;
 s.decisions['inventory.suppliers'].reason_code='NOT_ENTITLED';
 const rows=prepareTopChickenLease(s,{now:current}).rows;
 const denied=rows.find(x=>x.feature_code==='inventory.suppliers');
 assert.equal(denied.enabled,false);assert.equal(denied.valid_until,at);
 assert.equal(rows.find(x=>x.feature_code==='commerce.delivery').enabled,true);
});
pass('expired, future, feature-disabled, override-disabled deny',()=>{
 for(const [code,change] of [
  ['commerce.delivery',{effective_until:'2026-10-15T23:59:00.000Z'}],
  ['commerce.pickup',{effective_from:'2026-10-16T00:01:00.000Z'}],
  ['inventory.suppliers',{feature_active:false}],
  ['commerce.website',{override_disabled:true}],
  ['commerce.orders',{feature_implemented:false}]
 ]){
  const s=create();Object.assign(s.decisions[code],change);
  assert.equal(prepareTopChickenLease(s,{now:current}).rows.find(x=>x.feature_code===code).enabled,false,code);
 }
});
pass('effective until shortened to actual Central expiration',()=>{
 const s=create();s.decisions['commerce.delivery'].effective_until='2026-10-16T00:00:03.000Z';
 const row=prepareTopChickenLease(s,{now:current}).rows.find(x=>x.feature_code==='commerce.delivery');
 assert.equal(row.valid_until,'2026-10-16T00:00:03.000Z');
});
for(const [label,mutate,reason] of [
 ['foreign business',s=>s.business_id='91826502-590e-4afa-8826-2c0f4b99c490',/FOREIGN_BUSINESS/],
 ['wrong profile',s=>s.profile_code='retail',/PROFILE_MISMATCH/],
 ['missing decision',s=>delete s.decisions['commerce.orders'],/CLOUD_DECISION_UNTRUSTED/],
 ['decision wrong tenant',s=>s.decisions['commerce.orders'].business_id='other',/CLOUD_DECISION_UNTRUSTED/],
 ['decision wrong code',s=>s.decisions['commerce.orders'].feature_code='core.auth',/CLOUD_DECISION_UNTRUSTED/],
 ['missing snapshot time',s=>delete s.observed_at,/OBSERVED_AT/],
 ['stale snapshot',s=>s.observed_at='2026-10-15T23:59:40.000Z',/STALE_OR_FUTURE/],
 ['future snapshot',s=>s.observed_at='2026-10-16T00:00:10.000Z',/STALE_OR_FUTURE/],
 ['stale feature resolver',s=>s.decisions['core.users'].evaluation_time='2026-10-15T23:59:00.000Z',/DECISION_TIME_MISMATCH/],
 ['missing feature flags',s=>delete s.decisions['core.users'].feature_active,/CLOUD_FEATURE_FLAGS/],
 ['unknown grant provenance',s=>s.decisions['core.users'].reason_code='PROFILE_DEFAULT',/UNSUPPORTED_GRANT_SOURCE/],
 ['malformed entitled flag',s=>s.decisions['core.users'].entitled='true',/CLOUD_DECISION_UNTRUSTED/],
]){
 pass('fail closed: '+label,()=>{
  const s=create();mutate(s);assert.throws(()=>prepareTopChickenLease(s,{now:current}),reason);
 });
}
pass('disabled business/profile always deny every feature',()=>{
 for(const field of ['business_active','profile_active']){
  const s=create();s[field]=false;
  assert(prepareTopChickenLease(s,{now:current}).rows.every(x=>x.enabled===false));
 }
});
console.log('PASS: '+count+' isolated lease policy groups. NO Beta/Cloud data writes.');
