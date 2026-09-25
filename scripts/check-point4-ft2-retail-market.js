const fs=require('fs'),s=fs.readFileSync('supabase-v10-5-4-beta17-retail-market-core.sql','utf8');
function body(name){const l=s.toLowerCase(),a=l.indexOf('create or replace function public.'+name+'('),n=l.indexOf('\ncreate or replace function public.',a+20);if(a<0)throw Error(name+' missing');return s.slice(a,n<0?s.length:n)}
let fail=0;
function check(id,name,first,opts={}){
 const b=body(name),l=b.toLowerCase(),freeze=l.indexOf('into v_frozen_items'),guard=l.indexOf('inventory_stock_assert_legacy_write_allowed_v2'),commit=l.indexOf(first);
 const pAfter=l.slice(guard).includes('jsonb_to_recordset(coalesce(p_items')||l.slice(guard).includes('jsonb_to_recordset(p_items');
 const frozenAfter=l.slice(guard).includes('jsonb_to_recordset(v_frozen_items)');
 const deterministic=l.slice(freeze,guard).includes('order by product_id');
 const track=opts.track?l.slice(0,commit).includes("'track_inventory'")&&l.slice(commit).includes('v.track_inventory'):true;
 const grouped=opts.grouped?l.slice(0,guard).includes('group by x.product_id'):true;
 const ok=freeze>=0&&guard>freeze&&commit>guard&&!pAfter&&frozenAfter&&deterministic&&track&&grouped;
 console.log(JSON.stringify({id,freeze,guard,commit,pItemsAfterGuard:pAfter,frozenAfterGuard:frozenAfter,deterministic,trackFrozen:track,duplicatesGrouped:grouped,status:ok?'PASS':'FAIL'}));if(!ok)fail++;
}
check(26,'retail_post_stock_count','insert into public.retail_stock_counts',{track:true});
check(29,'retail_reserve_stock','update public.retail_stock_reservations',{grouped:true});
if(fail)process.exit(1);
