'use strict';
const fs=require('fs'),assert=(v,m)=>{if(!v)throw new Error(m)};
const s=fs.readFileSync('supabase-rc1-trusted-device-context-bon-v3-source.sql','utf8');
const c=fs.readFileSync('SHARAWLA-CLOUD-TRUSTED-DEVICE-ASSERTION-V1-SOURCE.sql','utf8');
const v2=fs.readFileSync('supabase-rc1-bon-reservation-v2-scope-aware-source.sql','utf8');
for(const x of ['pos_trusted_device_contexts_v1','cloud_assertion_id uuid not null unique','pos_register_trusted_device_context_v1','pos_verified_device_context_v1','pos_reserve_bon_range_v3','pos_consume_reserved_bon_v3','p_verified_device_context_id uuid'])
 assert(s.includes(x),'trusted Restaurant bridge invariant missing '+x);
assert(s.includes('revoke all on function public.pos_register_trusted_device_context_v1')&&s.includes('from public,anon,authenticated'),'client must not mint trusted context');
assert(!/pos_reserve_bon_range_v3[\s\S]{0,350}p_device_fingerprint text/.test(s),'V3 must not accept request fingerprint');
assert(s.includes('v.device_fingerprint,p_request_uid')&&s.includes('v.device_fingerprint\n  );'),'V3 must derive fingerprint from verified context');
assert(v2.includes('current_employee_id()')&&v2.includes('has_branch_access(p_branch_id)'),'employee branch auth must remain independent');
assert(c.includes('consume_trusted_device_assertion_v1'),'Cloud consume authority missing');
assert(s.includes("p_expires_at>clock_timestamp()+interval '2 minutes'"),'Restaurant context must not outlive assertion window');
assert(!/grant execute on function public\.pos_register_trusted_device_context_v1/i.test(s),'mint function leaked to POS role');
console.log('TRUSTED DEVICE RESTAURANT BINDING SOURCE GATE PASS — request_fingerprint=DENIED employee_auth=INDEPENDENT bridge_mint=SERVER_ONLY runtime_activation=BLOCKED deployment=0');
