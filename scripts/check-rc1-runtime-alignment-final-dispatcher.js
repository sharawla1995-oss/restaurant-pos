'use strict';
const fs=require('fs'),assert=require('assert');
const transport=fs.readFileSync('beta45-offline-v2-transport-runtime.js','utf8');
const sql=fs.readFileSync('supabase-rc1-offline-v2-runtime-alignment-final-dispatcher.sql','utf8');

const registered=[...transport.matchAll(/registerOne\('([^']+)'/g)].map(m=>m[1]);
const ops=[...new Set(registered)];
assert.strictEqual(ops.length,59,'expected 59 current Offline V2 client operation types');

const finalMarker='create or replace function public.sharawla_offline_v2_apply_event(p_event jsonb)';
const finalAt=sql.lastIndexOf(finalMarker);
assert(finalAt>=0,'final public dispatcher missing');
const final=sql.slice(finalAt);
const routed=new Set([...final.matchAll(/'([a-z][a-z0-9_]+)'/g)].map(m=>m[1]));
const missing=ops.filter(op=>!routed.has(op));
assert.deepStrictEqual(missing,[],'client operations missing from final dispatcher: '+missing.join(', '));

for(const marker of [
  'sharawla_offline_v2_apply_event_point4_outer_v1',
  'sharawla_offline_v2_apply_event_reference_v1',
  'sharawla_offline_v2_apply_event_modern_v1',
  'sharawla_offline_v2_apply_event_alignment_special_v1'
]) assert(sql.includes(marker),marker+' helper missing');

assert(final.includes("v_operation in ('sale','return','expense','shift_open')"),'Point-4/base routing missing');
assert(final.includes("return public.sharawla_offline_v2_apply_event_point4_outer_v1(p_event);"),'Point-4/base operations must enter Outer preparation before Core');
assert(!final.includes("return public.sharawla_offline_v2_apply_event_core_v1(p_event);"),'public final dispatcher must not bypass Point-4 Outer preparation');
const outerStart=sql.indexOf('create or replace function public.sharawla_offline_v2_apply_event_point4_outer_v1');
assert(outerStart>=0,'Point-4 Outer helper missing');
const outerEnd=sql.indexOf('create or replace function public.sharawla_offline_v2_apply_event(p_event jsonb)',outerStart);
const outer=sql.slice(outerStart,outerEnd);
assert(outer.includes('sharawla_offline_v2_prepare_stock_event_v1(p_event)'),'Point-4 Outer must prepare stock context');
assert(outer.includes("v_prepared->'context_envelope'"),'Point-4 Outer must forward prepared context envelope');
assert(outer.includes("v_prepared->'stock_identities'"),'Point-4 Outer must forward prepared stock identities');
assert(outer.includes('sharawla_point4_assert_context_envelope_v1'),'Point-4 Outer must validate prepared context envelope');
assert(outer.includes('inventory_stock_assert_legacy_write_allowed_v2'),'Point-4 Outer must preserve literal stock guards');
assert(outer.includes('return public.sharawla_offline_v2_apply_event_core_v1(v_forward);'),'Point-4 Outer must forward the enriched event to Core');
assert(final.includes("v_operation='shift_close' and v_rpc='close_pos_shift_idempotent'"),'legacy shift-close replay compatibility missing');
assert(final.includes("v_operation in ('shift_close','delivery_mark_delivered','delivery_driver_settle','inventory_supply_request_create')"),'runtime-gap special router missing');
assert(final.includes("v_operation='retail_suspend_sale' and v_rpc='offline_retail_suspend_sale_v1'"),'retail suspend route missing');
assert(final.includes("v_operation='retail_resume_sale' and v_rpc='offline_retail_resume_sale_v1'"),'retail resume route missing');

const staticPairs=[...transport.matchAll(/if\(type==='([^']+)'\)return \{rpc_name:'([^']+)'/g)].map(m=>[m[1],m[2]]);
for(const [op,rpc] of staticPairs){
  assert(sql.includes("'"+op+"'"),'operation literal missing from alignment SQL: '+op);
  if(!['sale','return'].includes(op))assert(sql.includes("'"+rpc+"'"),'RPC literal missing from alignment SQL: '+op+' -> '+rpc);
}
for(const rpc of [
 'close_pos_shift_v2','delivery_mark_delivered_v2','offline_delivery_driver_settle_v1','inventory_supply_request_create_v1'
]) assert(sql.includes(rpc),'special RPC binding missing: '+rpc);

for(const op of [
 'inventory_supply_request_submit','inventory_supply_request_decide',
 'inventory_supply_request_prepare','inventory_supply_request_dispatch','inventory_supply_request_receive'
]){
 const pattern=new RegExp("when 'offline_"+op.replace('inventory_supply_request_','inventory_supply_request_')+"_v1'[\\s\\S]{0,900}v_entity_id := \\(v_payload->>'p_request_id'\\);");
 assert(pattern.test(sql),'supply request state path must assign server entity id: '+op);
}

assert(!/grant execute on function public\.sharawla_offline_v2_apply_event_(point4_outer|reference|modern|alignment_special)_v1/i.test(sql),'private helper dispatcher must not be executable by authenticated/public');
assert(sql.includes('revoke all on function public.sharawla_offline_v2_apply_event_point4_outer_v1(jsonb) from public,anon,authenticated'),'Point-4 Outer helper revoke missing');
assert(sql.includes('revoke all on function public.sharawla_offline_v2_apply_event_reference_v1(jsonb) from public,anon,authenticated'),'reference helper revoke missing');
assert(sql.includes('revoke all on function public.sharawla_offline_v2_apply_event_modern_v1(jsonb) from public,anon,authenticated'),'modern helper revoke missing');
assert(sql.includes('grant execute on function public.sharawla_offline_v2_apply_event(jsonb) to authenticated'),'single public dispatcher grant missing');

console.log('RC1 Runtime Alignment final dispatcher gate PASS — operations='+ops.length+'; missing=0; helpers=private; Point4 Outer restored before Core');
