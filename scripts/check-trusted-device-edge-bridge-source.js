'use strict';
const fs=require('fs'),assert=(v,m)=>{if(!v)throw new Error(m)};
const s=fs.readFileSync('supabase/functions/trusted-device-bridge-v1/index.ts','utf8');
const d=fs.readFileSync('docs/TRUSTED-DEVICE-BRIDGE-EDGE-SOURCE.md','utf8');
for(const x of ['SHARAWLA_CLOUD_SERVICE_ROLE_KEY','RESTAURANT_SUPABASE_SERVICE_ROLE_KEY','RESTAURANT_BUSINESS_ID','consume_trusted_device_assertion_v1','pos_register_trusted_device_context_v1','employeeClient.auth.getUser()','SELF_ASSERTED_DEVICE_FORBIDDEN','WRONG_BUSINESS','BRIDGE_UNAVAILABLE'])
 assert(s.includes(x),'edge bridge invariant missing '+x);
assert(s.includes('body?.business_id||body?.device_id||body?.device_fingerprint'),'self-asserted tuple rejection missing');
assert(s.includes('String(canonical.business_id)!==restaurantBusiness'),'server-fixed business comparison missing');
assert(s.includes('verified_device_context_id:contextId'),'opaque Restaurant context output missing');
assert(!/eyJ[A-Za-z0-9_-]{20,}/.test(s),'possible committed JWT/service secret');
assert(!/https:\/\/[a-z0-9-]+\.supabase\.co/i.test(s),'real Supabase endpoint must not be committed');
assert(d.includes('SOURCE TEMPLATE / NOT DEPLOYED'),'deployment boundary missing');
console.log('TRUSTED DEVICE EDGE BRIDGE SOURCE GATE PASS — employee_auth=1 cloud_consume=SERVER_ONLY restaurant_mint=SERVER_ONLY self_asserted_tuple=DENIED deployment=0');
