'use strict';
const fs=require('fs'),assert=(v,m)=>{if(!v)throw new Error(m)};
const t=fs.readFileSync('beta45-offline-v2-transport-runtime.js','utf8');
const d=fs.readFileSync('docs/BON-V3-TRANSPORT-INTEGRATION.md','utf8');
const v3=fs.readFileSync('supabase-rc1-trusted-device-context-bon-v3-source.sql','utf8');
for(const x of ['async function trustedBonContext()','global.topBurgerDesktop?.trustedDevice','api?.bonContext','verified_device_context_id','exp>Date.now()','catch{return null}'])
 assert(t.includes(x),'transport trusted context invariant missing '+x);
assert(t.includes('if(trusted)out.p_order.bon_trusted_device_context=trusted'),'durable sale context evidence hook missing');
assert(d.includes('ACQUISITION DORMANT')&&d.includes('OFF-* fallback'),'dormant/fallback contract missing');
assert(v3.includes('p_verified_device_context_id uuid'),'Bon V3 server binding missing');
assert(!t.includes('SHARAWLA_CLOUD_SERVICE_ROLE_KEY')&&!t.includes('RESTAURANT_SUPABASE_SERVICE_ROLE_KEY'),'server secret leaked to renderer transport');
console.log('BON V3 TRANSPORT BOUNDARY GATE PASS — opaque_context=1 expired=REJECT unavailable=OFF acquisition=DORMANT deployment=0');
