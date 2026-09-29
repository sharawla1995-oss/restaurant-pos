'use strict';
const fs=require('fs'),assert=(v,m)=>{if(!v)throw new Error(m)};
const s=fs.readFileSync('supabase-rc1-bon-v3-sale-integration-source.sql','utf8');
const d=fs.readFileSync('docs/BON-V3-FINAL-SALE-INTEGRATION.md','utf8');
const t=fs.readFileSync('beta45-offline-v2-transport-runtime.js','utf8');
for(const x of ['pos_consume_sale_bon_v3','bon_trusted_device_context','verified_device_context_id','pos_consume_reserved_bon_v3','trusted device context required for reserved Bon','BEFORE the first durable order write'])
 assert(s.includes(x),'V3 sale integration invariant missing '+x);
assert(s.includes("if v_evidence is null then return null; end if;"),'no-reservation online compatibility missing');
assert(s.includes('v_row.bon_number<>v_bon'),'exact Bon preservation check missing');
assert(!s.includes('pos_consume_reserved_bon_v1('),'V3 integration must not fall back to V1');
assert(t.includes('bon_trusted_device_context=trusted'),'transport durable trusted context missing');
assert(d.includes('same database transaction')&&d.includes('may not silently fall back to V1'),'final owner contract missing');
console.log('BON V3 SALE INTEGRATION SOURCE GATE PASS — trusted_consume=V3 same_tx=REQUIRED v1_fallback=DENIED online_no_reservation=UNCHANGED deployment=0');
