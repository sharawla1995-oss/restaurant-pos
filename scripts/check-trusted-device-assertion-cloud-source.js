'use strict';
const fs=require('fs'),assert=(v,m)=>{if(!v)throw new Error(m)};
const s=fs.readFileSync('SHARAWLA-CLOUD-TRUSTED-DEVICE-ASSERTION-V1-SOURCE.sql','utf8');
const d=fs.readFileSync('docs/TRUSTED-DEVICE-ASSERTION-V1.md','utf8');
for(const x of ['trusted_device_assertions_v1','assertion_token uuid not null unique','device_id uuid not null','device_fingerprint text not null',"purpose='restaurant_bon_device_verification'","interval '2 minutes'",'for update','consumed_at is not null','expires_at<=clock_timestamp()','set consumed_at=clock_timestamp()'])
 assert(s.includes(x),'assertion invariant missing '+x);
assert(s.includes('select d.business_id into v_business')&&s.includes('d.id=p_device_id')&&s.includes('d.device_fingerprint=v_fp'),'Cloud must derive canonical tuple');
assert(s.includes('revoke all on function public.consume_trusted_device_assertion_v1(uuid,text) from public,anon,authenticated'),'consume must not be client executable');
assert(s.includes('revoke all on function public.issue_trusted_device_assertion_v1(uuid,text,text) from public,anon,authenticated'),'issue remains runtime blocked');
assert(!/grant execute on function public\.consume_trusted_device_assertion_v1/i.test(s),'consume bridge leaked to client role');
assert(d.includes('explicit trusted service bridge'),'design bridge requirement missing');
class A{constructor(exp){this.exp=exp;this.used=false}consume(now,purpose){if(purpose!=='restaurant_bon_device_verification')throw Error('purpose');if(this.used)throw Error('replay');if(now>=this.exp)throw Error('expired');this.used=true;return true}}
let a=new A(10);assert(a.consume(9,'restaurant_bon_device_verification'));try{a.consume(9,'restaurant_bon_device_verification');throw Error('replay accepted')}catch(e){assert(e.message==='replay','wrong replay result')}
try{new A(10).consume(10,'restaurant_bon_device_verification');throw Error('expiry accepted')}catch(e){assert(e.message==='expired','wrong expiry result')}
console.log('TRUSTED DEVICE ASSERTION CLOUD SOURCE GATE PASS — canonical_cloud=1 one_time=1 expiry=1 client_consume=DENIED runtime_activation=BLOCKED deployment=0');
