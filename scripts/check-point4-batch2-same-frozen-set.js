'use strict';
const fs=require('fs');
const p='supabase-point4-pre-cutover-46-guard-installation-batch2-website-identity.sql';
const s=fs.readFileSync(p,'utf8');
const names=[
'accept_retail_website_order_identity_v1',
'cancel_retail_website_order_customer_identity_v1',
'expire_retail_website_order_identity_v1',
'reject_retail_website_order_identity_v1'];
let failures=[];
for(let i=0;i<names.length;i++){
 const start=s.indexOf('CREATE OR REPLACE FUNCTION public.'+names[i]);
 const end=i+1<names.length?s.indexOf('CREATE OR REPLACE FUNCTION public.'+names[i+1],start):s.length;
 const x=s.slice(start,end);
 const freeze=x.indexOf('into v_frozen_items');
 const guard=x.indexOf('inventory_stock_assert_legacy_write_allowed_v2',freeze);
 const commit=x.indexOf('insert into public.retail_reservation_mutations_identity_v1',freeze);
 if(start<0||freeze<0||guard<freeze||commit<guard) failures.push(names[i]+': ordering');
 if((x.match(/into v_frozen_items/g)||[]).length!==1) failures.push(names[i]+': freeze-count');
 if((x.match(/inventory_stock_assert_legacy_write_allowed_v2/g)||[]).length!==1) failures.push(names[i]+': guard-count');
 const afterMaterialize=x.slice(x.indexOf(';',freeze)+1);
 if(/\bfrom\s+public\.retail_website_order_items\b/i.test(afterMaterialize)||
    /\bjoin\s+public\.retail_website_order_items\b/i.test(afterMaterialize))
   failures.push(names[i]+': item-rediscovery-after-freeze');
 const ru=x.indexOf('update public.retail_stock_reservations',commit);
 if(ru<0||x.indexOf('and product_id in (',ru)<ru||
    x.indexOf('jsonb_array_elements(v_frozen_items)',ru)<ru)
   failures.push(names[i]+': reservation-execution-not-frozen');
}
if((s.match(/CREATE OR REPLACE FUNCTION public\./g)||[]).length!==4) failures.push('function-count');
if(/cutover-hooks|inventory_stock_activate|canonical_stock/i.test(s)) failures.push('forbidden-activation-token');
if(failures.length){console.error('BATCH2_SAME_FROZEN_SET_FAIL '+failures.join(' | '));process.exit(1);}
console.log('BATCH2_SAME_FROZEN_SET_PASS functions=4 materialize=4 guards=4 reservation-bound=4 rediscovery=0');
