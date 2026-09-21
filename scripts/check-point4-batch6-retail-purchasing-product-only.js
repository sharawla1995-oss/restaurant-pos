const fs=require('fs'),p=require('path').join(__dirname,'..','supabase-point4-pre-cutover-46-guard-installation-batch6-retail-purchasing-product-only.sql'),s=fs.readFileSync(p,'utf8');
function fail(m){console.error('BATCH6_PRODUCT_ONLY_FAIL '+m);process.exit(1)}
const names=['retail_purchase_receive','retail_supplier_return_create'];
for(const name of names){
 const start=s.indexOf('create or replace function public.'+name+'('); if(start<0)fail(name+':missing');
 let end=s.indexOf('\ncreate or replace function public.',start+20); if(end<0)end=s.length;
 const f=s.slice(start,end), freeze=f.indexOf("if jsonb_array_length(v_frozen_items)=0"), guard=f.indexOf('inventory_stock_assert_legacy_write_allowed_v2',freeze);
 const header=name==='retail_purchase_receive'?f.indexOf('insert into public.retail_goods_receipts',guard):f.indexOf('insert into public.retail_supplier_returns',guard);
 if(!(freeze>=0&&guard>freeze&&header>guard))fail(name+':boundary');
 const beforeGuard=f.slice(0,guard);
 const firstHeader=name==='retail_purchase_receive'?'retail_goods_receipts':'retail_supplier_returns';
 if(new RegExp('insert\\s+into\\s+public\\.'+firstHeader,'i').test(beforeGuard))fail(name+':header-before-guard');
 const afterGuard=f.slice(guard);
 if(!/jsonb_to_recordset\s*\(v_frozen_items\)/i.test(afterGuard))fail(name+':not-frozen-execution');
 if(/jsonb_to_recordset\s*\((?:coalesce\()?p_items/i.test(afterGuard))fail(name+':raw-items-after-freeze');
 if((f.match(/inventory_stock_assert_legacy_write_allowed_v2\s*\(/ig)||[]).length!==1)fail(name+':guard-count');
}
if(/cutover-hooks|inventory_stock_activate|canonical_stock/i.test(s))fail('activation-token');
console.log('BATCH6_PRODUCT_ONLY_PASS functions=2 guards=2 frozen=2 raw_rediscovery_after_freeze=0 activation=0');