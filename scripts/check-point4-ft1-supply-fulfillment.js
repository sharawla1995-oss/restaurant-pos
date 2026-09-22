const fs=require('fs'),s=fs.readFileSync('supabase-beta55-central-warehouse-fulfillment.sql','utf8');
function body(name){const l=s.toLowerCase(),a=l.indexOf('create or replace function public.'+name+'('),n=l.indexOf('\ncreate or replace function public.',a+20);if(a<0)throw Error(name+' missing');return s.slice(a,n<0?s.length:n)}
let fail=0;
function check(id,name,commit){
 const b=body(name), low=b.toLowerCase(), replay=id===17?low.indexOf("if v_q.status in ('in_transit','partially_received','received') then return v_q.id;end if;"):low.indexOf('if v_receipt_id is not null then return v_receipt_id;end if;');
 const freeze=low.indexOf('into v_frozen_items'), guard=low.indexOf('inventory_stock_assert_legacy_write_allowed_v2'), first=low.indexOf(commit), frozenExec=low.indexOf('jsonb_to_recordset(v_frozen_items)',guard);
 const pAfter=low.slice(guard).includes('jsonb_to_recordset(p_items)');
 const deterministic=low.slice(freeze,guard).includes('order by item_type,coalesce(product_id,ingredient_id),request_item_id');
 const ok=replay>=0&&freeze>replay&&guard>freeze&&first>guard&&frozenExec>guard&&!pAfter&&deterministic;
 console.log(JSON.stringify({id,replay,freeze,guard,first,frozenExec,pItemsAfterGuard:pAfter,deterministic,status:ok?'PASS':'FAIL'}));if(!ok)fail++;
}
check(17,'inventory_supply_request_dispatch_v1','update public.inventory_supply_request_items');
check(18,'inventory_supply_request_receive_v1','insert into public.inventory_supply_receipts');
if(fail)process.exit(1);
