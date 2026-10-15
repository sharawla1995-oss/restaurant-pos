// REVIEW-ONLY / NO DEPLOY. Pure Central->Beta decision validation; never accepts
// client-selected business/features or writes a Supabase database.
// A separate trusted, authenticated Edge reader and carefully reviewed SQL
// writer are REQUIRED before this can become an operational sync bridge.
export const TOP_CHICKEN='5358328c-9724-49aa-affc-1bce8be90f92';
export const FEATURE_CODES=Object.freeze([
 'core.auth','core.users','core.permissions','core.customers','core.payments',
 'commerce.orders','commerce.pos','commerce.products','commerce.delivery',
 'commerce.pickup','commerce.website','inventory.suppliers','inventory.purchasing'
]);
export const LEASE_MS=10000;
const REASON_GRANTED=new Set(['CORE_INCLUDED','PACKAGE_ENTITLED','PAID_ADDON_ENTITLED']);
const isoTime=(input,label)=>{
 if(typeof input!=='string'||!/^\d{4}-\d\d-\d\dT/.test(input))throw Error(label+'_MISSING');
 const ms=Date.parse(input);
 if(!Number.isFinite(ms))throw Error(label+'_INVALID');
 return ms;
};
export function prepareTopChickenLease(snapshot,{now=new Date()}={}){
 if(snapshot?.business_id!==TOP_CHICKEN)throw Error('FOREIGN_BUSINESS_DENIED');
 if(snapshot?.profile_code!=='restaurant')throw Error('PROFILE_MISMATCH_DENIED');
 if(typeof snapshot.business_active!=='boolean'||typeof snapshot.profile_active!=='boolean')
   throw Error('CLOUD_BUSINESS_PROFILE_MISSING');
 if(!snapshot.decisions||typeof snapshot.decisions!=='object'||Array.isArray(snapshot.decisions))
   throw Error('CLOUD_DECISIONS_MISSING');
 const observed=isoTime(snapshot.observed_at,'OBSERVED_AT');
 const current=now instanceof Date?now.getTime():Date.parse(now);
 if(!Number.isFinite(current)||observed>current+1000||current-observed>5000)
   throw Error('STALE_OR_FUTURE_CLOUD_SNAPSHOT');
 const end=observed+LEASE_MS;
 const rows=FEATURE_CODES.map(code=>{
   const decision=snapshot.decisions[code];
   if(!decision||Array.isArray(decision)||decision.business_id!==TOP_CHICKEN||
     decision.feature_code!==code||typeof decision.entitled!=='boolean')
     throw Error('CLOUD_DECISION_UNTRUSTED_'+code);
   if(typeof decision.feature_active!=='boolean'||
      typeof decision.feature_implemented!=='boolean'||
      typeof decision.override_disabled!=='boolean')throw Error('CLOUD_FEATURE_FLAGS_MISSING_'+code);
   const evaluated=isoTime(decision.evaluation_time,'EVALUATION_TIME');
   if(Math.abs(evaluated-observed)>1000)throw Error('DECISION_TIME_MISMATCH_'+code);
   let entitled=decision.entitled&&snapshot.business_active&&snapshot.profile_active&&
      decision.feature_active&&decision.feature_implemented&&!decision.override_disabled;
   if(entitled&&!REASON_GRANTED.has(decision.reason_code))throw Error('UNSUPPORTED_GRANT_SOURCE_'+code);
   const start=decision.effective_from==null?null:isoTime(decision.effective_from,'EFFECTIVE_FROM');
   const expiry=decision.effective_until==null?null:isoTime(decision.effective_until,'EFFECTIVE_UNTIL');
   if(entitled&&start!==null&&start>current)entitled=false;
   if(entitled&&expiry!==null&&expiry<=current)entitled=false;
   // False always results in an explicit denial row; no implicit defaults.
   const validTo=entitled?Math.min(end,expiry??end):observed;
   return Object.freeze({cloud_business_id:TOP_CHICKEN,feature_code:code,
     enabled:!!entitled,entitlement_version:observed,
     source:'central-commercial-resolver-v1',valid_until:new Date(validTo).toISOString()});
 });
 return Object.freeze({business_id:TOP_CHICKEN,observed_at:new Date(observed).toISOString(),
   lease_deadline:new Date(end).toISOString(),rows:Object.freeze(rows)});
}
