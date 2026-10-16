// REVIEW ONLY / NO DEPLOY. Immutable, exact Central commercial proof adapter
// for Top Chicken operational bootstrap and delivery/suppliers entitlement sync.
// A signed Central read and authenticated Beta service actor are still required.
export const BUSINESS='5358328c-9724-49aa-affc-1bce8be90f92';
export const CODES=Object.freeze([
 'core.auth','core.users','core.permissions','commerce.delivery','inventory.suppliers'
]);
export const LEASE_MS=60_000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function timestamp(x,label){if(typeof x!=='string'||!Number.isFinite(Date.parse(x)))throw Error(label+'_INVALID');return Date.parse(x)}
function fail(x){throw Error('TC_CENTRAL_PROOF_'+x)}
export function buildTopChickenCentralLease({business_id,observed_at,decisions},{now=new Date()}={}){
 if(business_id!==BUSINESS)fail('WRONG_BUSINESS');
 if(!decisions||typeof decisions!=='object'||Array.isArray(decisions))fail('DECISIONS_MISSING');
 const current=now instanceof Date?now.getTime():Date.parse(now);
 const observed=timestamp(observed_at,'OBSERVED_AT');
 if(!Number.isFinite(current)||observed>current+1000||current-observed>5000)fail('STALE_OR_FUTURE');
 if(Object.keys(decisions).length!==CODES.length||Object.keys(decisions).some(x=>!CODES.includes(x)))fail('EXTRA_OR_MISSING_CODE');
 const rows=[];
 for(const code of CODES){
   const d=decisions[code];if(!d||Array.isArray(d)||d.business_id!==BUSINESS||d.feature_code!==code||d.profile!=='restaurant'||d.resolver_version!==1||typeof d.entitled!=='boolean')fail('DECISION_SCOPE_'+code);
   const evaluated=timestamp(d.evaluation_time,'EVALUATION_TIME');
   if(Math.abs(evaluated-observed)>2000)fail('DECISION_CLOCK_'+code);
   const core=code.startsWith('core.');
   const allowed=core?d.entitled===true&&d.reason_code==='CORE_INCLUDED'&&d.entitlement_source==='core':
     d.entitled===true&&d.reason_code==='PAID_ADDON_ENTITLED'&&d.entitlement_source==='paid_addon'&&UUID.test(String(d.entitlement_id||''));
   if(d.entitled&&!allowed)fail('UNKNOWN_GRANT_SOURCE_'+code);
   const start=d.effective_from==null?null:timestamp(d.effective_from,'EFFECTIVE_FROM');
   const until=d.effective_until==null?null:timestamp(d.effective_until,'EFFECTIVE_UNTIL');
   const enabled=!!allowed&&(start==null||start<=current)&&(until==null||until>current);
   const end=enabled?Math.min(observed+LEASE_MS,until??Number.POSITIVE_INFINITY):observed;
   rows.push(Object.freeze({
     feature_code:code,
     enabled,
     entitlement_version:observed,
     valid_until:new Date(end).toISOString(),
     source:'tc-central-signed-commercial-v1'
   }));
 }
 return Object.freeze({business_id:BUSINESS,observed_at:new Date(observed).toISOString(),rows:Object.freeze(rows)});
}
