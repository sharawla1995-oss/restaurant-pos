const fs=require('fs'),s=fs.readFileSync('supabase-engine-variants-v1-checkout-returns.sql','utf8');
function fail(m){console.error('POINT4_BATCH15_VARIANT_RETURN_FAIL '+m);process.exit(1)}
const a=s.indexOf('create or replace function public.create_retail_variant_order_return_idempotent_v1(');
const e=s.indexOf('\nrevoke all on function public.create_retail_variant_pos_order_atomic_v1',a),c=s.slice(a,e);
const replay=c.indexOf('if v_existing is not null then return v_existing; end if;');
const freeze=c.indexOf('into v_frozen_items',replay);
const guard=c.indexOf('inventory_stock_assert_legacy_write_allowed_v2',freeze);
const commit=c.indexOf('v_return_id:=public.create_order_return_idempotent',guard);
const execute=c.indexOf('from jsonb_to_recordset(v_frozen_items)',commit);
if(!(replay>=0&&freeze>replay&&guard>freeze&&commit>guard&&execute>commit))fail('ordering');
if(!/case when oi\.variant_id is not null then 'variant' else 'product' end/.test(c.slice(replay,freeze)))fail('mixed-identity');
if(!c.includes('inventory_stock_assert_legacy_write_allowed_v2(v_branch,v_row.item_kind,v_row.item_id)'))fail('guard-identity');
if((c.match(/jsonb_array_elements\(coalesce\(p_items,'\[\]'::jsonb\)\)/g)||[]).length!==1)fail('p-items-reparsed');
if(/jsonb_array_elements\(coalesce\(p_items/i.test(c.slice(commit)))fail('p-items-after-commit');
if(/join public\.order_items/i.test(c.slice(commit)))fail('order-items-after-commit');
if(/v_(variant_)?balance\.track_inventory/.test(c.slice(commit)))fail('live-track-after-commit');
if((c.slice(commit).match(/if not v_row\.track_inventory then continue; end if;/g)||[]).length!==2)fail('frozen-track-both-kinds');
console.log('POINT4_BATCH15_VARIANT_RETURN_PASS replay=1 mixed_freeze=1 guard_all=1 nested_commit_after_guard=1 same_frozen_execution=1');
