const fs=require('fs'),s=fs.readFileSync('supabase-v10-5-4-beta15-retail-inventory-foundation.sql','utf8');
function fail(m){console.error('POINT4_BATCH14_RETAIL_SALE_FAIL '+m);process.exit(1)}
const a=s.indexOf('create or replace function public.create_retail_pos_order_atomic('),e=s.indexOf('\ncreate or replace function public.create_retail_order_return_idempotent(',a),c=s.slice(a,e);
const replay=c.indexOf('if v_existing_order_id is not null then');
const freeze=c.indexOf('into v_frozen_items',replay);
const guard=c.indexOf('inventory_stock_assert_legacy_write_allowed_v2',freeze);
const firstInsert=c.indexOf('insert into public.retail_inventory_balances',guard);
const invoice=c.indexOf('v_result:=public.create_pos_order_atomic',firstInsert);
const execute=c.indexOf('from jsonb_to_recordset(v_frozen_items)',invoice);
if(!(replay>=0&&freeze>replay&&guard>freeze&&firstInsert>guard&&invoice>firstInsert&&execute>invoice))fail('ordering');
if(/insert\s+into\s+public\.retail_inventory_balances/i.test(c.slice(replay,guard)))fail('balance-insert-before-guard');
if((c.match(/jsonb_array_elements\(coalesce\(p_items,'\[\]'::jsonb\)\)/g)||[]).length!==1)fail('p-items-reparsed');
if(/jsonb_array_elements\(coalesce\(p_items/i.test(c.slice(firstInsert)))fail('p-items-after-commitment');
if(!c.includes("inventory_stock_assert_legacy_write_allowed_v2(v_branch,'product',v_row.product_id)"))fail('guard-identity');
if(/if v_balance\.track_inventory/i.test(c.slice(firstInsert)))fail('live-track-policy-after-commitment');
if(!/if not v_row\.track_inventory then continue; end if;/.test(c.slice(invoice)))fail('frozen-track-not-executed');
if(!/v_row\.balance_quantity < v_row\.qty/.test(c.slice(firstInsert,invoice)))fail('frozen-balance-not-validated');
if(/cutover-hooks|inventory_stock_activate|canonical_stock/i.test(c))fail('activation');
console.log('POINT4_BATCH14_RETAIL_SALE_PASS replay=1 freeze=1 guard_all_before_balance_insert=1 p_items_once=1 frozen_validation=1 frozen_execution=1');
