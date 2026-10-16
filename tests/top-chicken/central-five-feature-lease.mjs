import assert from 'node:assert/strict';
import {BUSINESS,CODES,LEASE_MS,buildTopChickenCentralLease} from '../../supabase/functions/top-chicken-entitlement-bridge/central-decision.mjs';
const at='2026-10-16T00:02:00.000Z', now=new Date('2026-10-16T00:02:01.000Z');
const uuid='87b87c9e-f66f-4070-ac38-de7693e31256';
const fixture=()=>{
 const decisions={};
 for(const code of CODES){const core=code.startsWith('core.');decisions[code]={
   business_id:BUSINESS,feature_code:code,profile:'restaurant',resolver_version:1,
   entitled:true,reason_code:core?'CORE_INCLUDED':'PAID_ADDON_ENTITLED',
   entitlement_source:core?'core':'paid_addon',
   ...(!core?{entitlement_id:uuid,effective_from:'2026-10-15T23:56:00Z'}:{}),
   evaluation_time:at,effective_until:null
 }}
 return {business_id:BUSINESS,observed_at:at,decisions};
};
let count=0;const pass=(name,fn)=>{fn();count++;console.log('PASS '+name)};
pass('five exact codes and expiring leases',()=>{
 const o=buildTopChickenCentralLease(fixture(),{now});
 assert.deepEqual(o.rows.map(x=>x.feature_code),CODES);
 assert(o.rows.every(x=>x.enabled && x.entitlement_version===Date.parse(at)));
 assert(o.rows.every(x=>Date.parse(x.valid_until)-Date.parse(at)===LEASE_MS));
});
pass('Central revoke maps to denial not cached allow',()=>{
 const s=fixture();s.decisions['commerce.delivery']={...s.decisions['commerce.delivery'],entitled:false,reason_code:'NOT_ENTITLED',entitlement_source:'none'};
 const o=buildTopChickenCentralLease(s,{now});const d=o.rows.find(x=>x.feature_code==='commerce.delivery');
 assert.equal(d.enabled,false);assert.equal(d.valid_until,at);
 assert.equal(o.rows.find(x=>x.feature_code==='inventory.suppliers').enabled,true);
});
pass('expiry and future grant fail closed',()=>{
 for(const [code,attrs] of [['inventory.suppliers',{effective_until:'2026-10-16T00:02:00.500Z'}],['commerce.delivery',{effective_from:'2026-10-16T00:03:00Z'}]]){
 const s=fixture();Object.assign(s.decisions[code],attrs);
 assert.equal(buildTopChickenCentralLease(s,{now}).rows.find(x=>x.feature_code===code).enabled,false)}
});
pass('positive grant lease cannot outlast Central grant',()=>{
 const s=fixture();s.decisions['inventory.suppliers'].effective_until='2026-10-16T00:02:03Z';
 assert.equal(buildTopChickenCentralLease(s,{now}).rows.find(x=>x.feature_code==='inventory.suppliers').valid_until,'2026-10-16T00:02:03.000Z');
});
for(const [name,mutate,rx] of [
 ['foreign business',s=>s.business_id='3e405b6f-feba-4d5c-a4bf-bebb77f2d5d7',/WRONG_BUSINESS/],
 ['other business resolver',s=>s.decisions['core.auth'].business_id='other',/DECISION_SCOPE/],
 ['wrong profile',s=>s.decisions['core.auth'].profile='retail',/DECISION_SCOPE/],
 ['missing resolver version',s=>delete s.decisions['core.auth'].resolver_version,/DECISION_SCOPE/],
 ['extra feature',s=>s.decisions['commerce.website']={...s.decisions['commerce.delivery']},/EXTRA_OR_MISSING_CODE/],
 ['missing feature',s=>delete s.decisions['inventory.suppliers'],/EXTRA_OR_MISSING_CODE/],
 ['future snapshot',s=>s.observed_at='2026-10-16T00:03:00Z',/STALE_OR_FUTURE/],
 ['stale snapshot',s=>s.observed_at='2026-10-16T00:01:00Z',/STALE_OR_FUTURE/],
 ['mismatched decision clock',s=>s.decisions['core.users'].evaluation_time='2026-10-16T00:01:30Z',/DECISION_CLOCK/],
 ['forged core source',s=>s.decisions['core.users'].entitlement_source='paid_addon',/UNKNOWN_GRANT_SOURCE/],
 ['missing addon grant ID',s=>delete s.decisions['commerce.delivery'].entitlement_id,/UNKNOWN_GRANT_SOURCE/],
 ['invalid addon grant ID',s=>s.decisions['commerce.delivery'].entitlement_id='fake',/UNKNOWN_GRANT_SOURCE/],
 ['mismatched addon source',s=>s.decisions['commerce.delivery'].reason_code='CORE_INCLUDED',/UNKNOWN_GRANT_SOURCE/],
 ['null entitled flag',s=>s.decisions['core.permissions'].entitled=null,/DECISION_SCOPE/],
 ['wrong feature identity',s=>s.decisions['core.auth'].feature_code='core.users',/DECISION_SCOPE/]
])pass('deny '+name,()=>{const s=fixture();mutate(s);assert.throws(()=>buildTopChickenCentralLease(s,{now}),rx)});
console.log('PASS: '+count+' groups, SOURCE-ONLY. No Supabase writes.');
