'use strict';
const fs=require('fs'),assert=(v,m)=>{if(!v)throw new Error(m)};
const s=fs.readFileSync('supabase-rc1-bon-v3-base-sale-owner-source.sql','utf8');
const d=fs.readFileSync('docs/BON-V3-BASE-SALE-OWNER-CLOSURE.md','utf8');
const wrappers=[
 ['supabase-v10-5-4-beta15-retail-inventory-foundation.sql','create_retail_pos_order_atomic','create_pos_order_atomic'],
 ['supabase-engine-variants-v1-checkout-returns.sql','create_retail_variant_pos_order_atomic_v1','create_pos_order_atomic'],
 ['supabase-engine-recipe-basic-v1-runtime.sql','create_food_pos_order_atomic_v1','create_pos_order_atomic'],
 ['supabase-beta42-food-cross-profile-retail-runtime-v1.sql','create_food_retail_pos_order_atomic_v1','create_retail']
];
for(const x of ['create or replace function public.create_pos_order_atomic','pos_bon_consumptions_v2','bon_trusted_device_context','verified_device_context_id',"v_bon_numbering_mode not in ('SHIFT','BRANCH')",'pos_consume_sale_bon_v3(p_order,v_client_tx_id)','insert into public.orders('])assert(s.includes(x),'base V3 owner invariant missing '+x);
assert(!s.includes('pos_consume_reserved_bon_v1('),'base owner must not use Bon V1');
assert(!s.includes('v_bon_device_fingerprint'),'base owner must not trust request fingerprint');
assert(s.indexOf('pos_consume_sale_bon_v3(p_order,v_client_tx_id)')<s.indexOf('insert into public.orders('),'V3 consume must precede first durable order write');
assert(s.includes("if v_bon_evidence is not null then"),'optional reservation behavior missing');
for(const [file,fn,delegate] of wrappers){const x=fs.readFileSync(file,'utf8');assert(x.includes(fn),file+' wrapper missing');assert(x.includes(delegate),file+' delegation missing')}
assert(d.includes('Restaurant, Retail, Variant Retail and Food/Retail')&&d.includes('does not force every reservation to equal the cashier shift'),'owner/scope closure doc missing');
console.log('BON V3 BASE SALE OWNER GATE PASS — owners=4 base_owner=1 trusted_consume=V3 branch_mode=SUPPORTED v1_fallback=DENIED deployment=0');
