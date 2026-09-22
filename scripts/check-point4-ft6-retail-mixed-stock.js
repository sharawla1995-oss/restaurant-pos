const fs=require('fs');
const p=require('path').join(__dirname,'..','supabase-point4-ft6-retail-mixed-stock.sql');
const s=fs.readFileSync(p,'utf8');
function fail(m){console.error('FT6_RETAIL_MIXED_FAIL '+m);process.exit(1)}
function fn(name){const a=s.indexOf('create or replace function public.'+name+'(');if(a<0)fail(name+':missing');let e=s.indexOf('\ncreate or replace function public.',a+20);if(e<0)e=s.length;return s.slice(a,e)}
function ordered(b,parts,label){let last=-1;for(const [n,t] of parts){const i=b.indexOf(t);if(i<0)fail(label+':'+n+'-missing');if(i<=last)fail(label+':'+n+'-order');last=i;}}
const f25=fn('retail_landed_cost_post_v1'),f27=fn('retail_purchase_receive_v2'),f30=fn('retail_supplier_return_create_v2');

ordered(f25,[['replay',"if lc.status='posted'"],['freeze',"v_frozen_items:=v_frozen_items||jsonb_build_array"],['guard','inventory_stock_assert_legacy_write_allowed_v2'],['commit','update public.retail_variant_inventory_balances set average_unit_cost'],['execute','insert into public.retail_inventory_value_adjustments_v1']],'#25');
if(!/select distinct x\.stock_kind,x\.stock_id[\s\S]*order by x\.stock_kind,x\.stock_id/i.test(f25))fail('#25 deterministic mixed guard set');
if(/retail_landed_cost_allocations/i.test(f25.slice(f25.indexOf('inventory_stock_assert_legacy_write_allowed_v2'))))fail('#25 allocation rediscovery after guard');

ordered(f27,[['replay','select id into v_grn from public.retail_goods_receipts where client_tx_id=v_key'],['freeze',"v_frozen_items:=v_frozen_items||jsonb_build_array"],['cumulative','sum(x.quantity) quantity'],['guard','inventory_stock_assert_legacy_write_allowed_v2'],['commit','insert into public.retail_goods_receipts'],['execute','jsonb_to_recordset(v_frozen_items)']],'#27');
if(!f27.includes("'stock_kind',case when v_line.variant_id is null then 'product' else 'variant' end"))fail('#27 mixed identity freeze');
if(/jsonb_to_recordset\s*\(p_items\)/i.test(f27.slice(f27.indexOf('inventory_stock_assert_legacy_write_allowed_v2'))))fail('#27 raw payload rediscovery after guard');

ordered(f30,[['replay','select id into v_ret from public.retail_supplier_returns where client_tx_id=v_key'],['freeze',"v_frozen_items:=v_frozen_items||jsonb_build_array"],['cumulative','sum(x.quantity) quantity'],['guard','inventory_stock_assert_legacy_write_allowed_v2'],['commit','insert into public.retail_supplier_returns'],['execute','jsonb_to_recordset(v_frozen_items)']],'#30');
if(!f30.includes("'stock_kind',case when v.variant_id is null then 'product' else 'variant' end"))fail('#30 mixed identity freeze');
if(/jsonb_to_recordset\s*\(coalesce\(p_items/i.test(f30.slice(f30.indexOf('inventory_stock_assert_legacy_write_allowed_v2'))))fail('#30 raw payload rediscovery after guard');

if((s.match(/inventory_stock_assert_legacy_write_allowed_v2\s*\(/ig)||[]).length!==3)fail('guard-count');
if(/inventory_stock_activate|cutover-hooks|canonical_stock/i.test(s))fail('activation');
console.log('FT6_RETAIL_MIXED_PASS contracts=25,27,30 guards=3 frozen_set=1 cumulative_duplicates=1 raw_rediscovery=0 activation=0');
