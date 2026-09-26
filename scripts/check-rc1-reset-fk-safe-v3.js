'use strict';
const fs=require('fs');
const sql=fs.readFileSync('supabase-rc1-reset-fk-safe-v3.sql','utf8');
const must=(x,m)=>{if(!x)throw new Error(m)};
must(sql.includes("1a81036c4f0aaf7767943281c3bdf13a"),'reset V3 MD5 precondition missing');
for(const marker of ['driver_settlement_items','delivery_payment_events','restaurant_table_session_orders']){
  must(sql.includes(marker),`missing reset child cleanup: ${marker}`);
}
must(sql.indexOf('delete from public.driver_settlement_items') < sql.indexOf('delete from public.orders'),'settlement items must be deleted before orders');
must(sql.indexOf('delete from public.delivery_payment_events') < sql.indexOf('delete from public.orders'),'payment events must be deleted before orders');
must(sql.indexOf('delete from public.restaurant_table_session_orders') < sql.indexOf('delete from public.orders'),'table-session links must be deleted before orders');
must(sql.includes("set status='closed'"),'shift reset must close, not delete, open shifts');
must(sql.includes('shift_history_preserved'),'shift-history preservation marker missing');
must(!sql.includes('delete from public.shifts where true'),'UI reset must not delete shift history');
must(sql.includes('customers_preserved_by_history'),'customer-history preservation marker missing');
must(sql.includes('offline_v2_customer_merge_receipts'),'offline customer evidence preservation missing');
must(!sql.includes('delete from public.offline_v2_customer_merge_receipts'),'offline customer evidence must never be reset');
must(!sql.includes('delete from public.offline_v2_server_receipts'),'Offline V2 server receipts must never be reset');
must(sql.includes("revoke all on function public.reset_pos_data(text[]) from public,anon"),'anon EXECUTE revoke missing');
console.log('RC1 FK-safe reset V3 source gate PASS');
