const fs=require('fs'),assert=require('assert');
const read=p=>fs.readFileSync(p,'utf8'),sql=read('supabase-offline-v2-customer-delivery-owners-v1.sql'),design=read('docs/OFFLINE-V2-CUSTOMER-DELIVERY-DURABLE-OWNER-DESIGN.md');
for(const x of ['offline_customer_create_v1','offline_customer_update_v1','offline_customer_address_save_v1','offline_customer_address_delete_v1','offline_delivery_assign_driver_v1','offline_customer_delivery_receipts_v1'])assert(sql.includes(x),x+' missing');
for(const x of ['public.customer_create_v2(','public.customer_update_v2(','public.customer_address_save_v2(','public.customer_address_delete_v2(','public.order_assign_driver_v2('])assert(sql.includes(x),'accepted owner delegation missing: '+x);
for(const x of ["pg_advisory_xact_lock","payload_digest","REPLAY_MISMATCH","revoke all on table public.offline_customer_delivery_receipts_v1"])assert(sql.includes(x),'idempotency/security contract missing: '+x);
assert(!/update\s+public\.orders/i.test(sql),'offline driver wrapper must not update orders directly');
assert(!/insert\s+into\s+public\.customers/i.test(sql),'offline customer wrapper must not insert customers directly');
assert(design.includes('Changing payment method while offline is a separate future durable operation'),'delivery payment gap must stay explicit');
console.log('Offline Customer + Delivery Owner Design: PASS — wrappers delegate to accepted owners; receipt/digest/replay gates present; no direct business DML');
