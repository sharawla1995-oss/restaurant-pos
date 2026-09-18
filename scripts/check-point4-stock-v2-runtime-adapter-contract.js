'use strict';

const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase-point4-stock-v2-runtime-adapter-contract.sql'),'utf8');
const writer=fs.readFileSync(path.join(root,'supabase-point4-stock-v2-writer.sql'),'utf8');
const cutover=fs.readFileSync(path.join(root,'supabase-point4-stock-v2-controlled-cutover.sql'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const has=(token,msg)=>assert(sql.includes(token),msg||`missing: ${token}`);

const publishedHashes={
  'supabase-point4-stock-v2-foundation.sql':'3c81f3bb21ecf2f5e023e8601fb89556aced7b01a0a78b7b78b14af581259538',
  'supabase-point4-stock-v2-writer.sql':'799af8c8949a3131b1db883b823ba7151e2ba4216705cabf063db9f83b31659e'
};
const offlineHashes={
  'beta36-offline-v2.js':'4acb8c2acd124c1101f339519e404f22940adb983606d104cfd5df78dc37f6ff',
  'beta43-offline-core.js':'00b3a29a40f548aaad5cacd8f5e39560cef4a3bb7bbbe78e29293ad3d1e1232b',
  'beta45-offline-v2-transport-runtime.js':'e3d9c05e533b1d5e2687cdbcd551425ee639c6ed28db8bd407d63ed48214d37b',
  'beta47-performance-sync-hotfix.js':'b670d1b8e40c2622bb8d43dba341116b883eae4523514a1e0ea83abb2c1fefdd',
  'beta49-takeover-activation-safety.js':'1873727a0c1ef26031716e7b3f5093d7ad1c36f056da198e17566fa829dbae55',
  'beta55-4-runtime-recovery.js':'137928c9ed556e3fa7b20d9f39b3e9044b3ebf49ab1f3d9c07700ffbe2ca2bc8'
};
for(const [file,expected] of Object.entries({...publishedHashes,...offlineHashes})){
  assert.strictEqual(hash(file),expected,`${file} changed from the approved Batch 1 baseline`);
}

for(const [operation,movement,source] of [
  ['stock_opening','opening','stock_opening'],['adjustment','adjustment','stock_adjustment'],
  ['waste','waste','stock_waste'],['damage','damage','stock_damage'],
  ['stocktake','stocktake','stocktake'],['reservation','reservation','stock_reservation'],
  ['reservation_release','reservation_release','stock_reservation_release'],
  ['sale','sale','sale'],['sale_return','sale_return','sale_return'],
  ['purchase_receive','purchase_receive','purchase_grn'],
  ['purchase_return','purchase_return','purchase_return'],
  ['transfer_out','transfer_out','inventory_transfer'],
  ['transfer_in','transfer_in','inventory_transfer'],['reversal','reversal','reversal']
]){
  has(`when '${operation}' then '${movement}'`,`missing movement mapping: ${operation}`);
  has(`when '${operation}' then '${source}'`,`missing source-document mapping: ${operation}`);
  assert(writer.includes(`'${movement}'`),`4B-2 vocabulary missing: ${movement}`);
}
has("raise exception 'INVENTORY_STOCK_ADAPTER_OPERATION_NOT_APPROVED'",'unknown operation must fail closed');

for(const token of [
  'point4_identity_uuid_v4_v1(p_line_uid::text)',
  'point4_identity_uuid_v4_v1(p_document_uid::text)',
  "v_source_id<>'uuid:'||v_document_uid",
  'point4_identity_source_document_id_v1(',
  "v_source_id!~'^digest:sha256:[0-9a-f]{64}$'",
  "point4_identity_effect_line_key_v1(\n    'stock',v_movement_type,v_line_uid,null,null",
  'point4_identity_decimal_v1(p_quantity,3)',
  'point4_identity_decimal_v1(p_unit_cost,4)',
  'point4_identity_operation_digest_v1(',
  "raise exception 'INVENTORY_STOCK_ADAPTER_OPERATION_DIGEST_MISMATCH'"
])has(token,`Identity V1 validation missing: ${token}`);

assert(!/coalesce\s*\(\s*p_unit_cost\s*,\s*0/i.test(sql),'missing valuation must not become zero');
has("INVENTORY_STOCK_ADAPTER_OUTBOUND_COST_CLIENT_FORBIDDEN",'client outbound valuation must be rejected');
has("INVENTORY_STOCK_ADAPTER_VALUATION_REQUIRED",'required inbound valuation must fail closed');
has("INVENTORY_STOCK_V2_ADJUSTMENT_COST_RULE_REQUIRED",'unresolved positive adjustment costing must fail closed');
has("INVENTORY_STOCK_ADAPTER_STOCKTAKE_TARGET_REQUIRED",'stocktake target must be required');

const applyStart=sql.indexOf('create or replace function public.inventory_stock_apply_runtime_adapter_v2');
assert(applyStart>=0,'apply kernel missing');
const apply=sql.slice(applyStart);
const validationAt=apply.indexOf('inventory_stock_validate_runtime_effect_v2(');
const concurrencyAt=apply.indexOf('inventory_stock_point4b2_concurrency_closed_v2()');
const activationAt=apply.indexOf('inventory_stock_runtime_adapter_activation_allowed_v2()');
const ownerAt=apply.indexOf('inventory_stock_resolve_operational_owner_v2(');
const assertionAt=apply.indexOf('inventory_stock_assert_canonical_write_allowed_v2(');
const writerAt=apply.indexOf('inventory_stock_apply_movement_v2(');
assert(validationAt>=0&&validationAt<concurrencyAt,'identity/mapping validation must precede concurrency gate');
assert(concurrencyAt<activationAt&&activationAt<ownerAt,'activation gates must precede ownership resolution');
assert(ownerAt<assertionAt&&assertionAt<writerAt,'canonical ownership assertion must precede sole writer');
assert.strictEqual((apply.match(/inventory_stock_apply_movement_v2\s*\(/g)||[]).length,1,'kernel must have one writer call');
assert(!/\bexception\s+when\b/i.test(apply),'kernel must not catch and fall back to Legacy');
assert(!/\b(retail_inventory_balances|retail_inventory_movements|retail_variant_inventory_balances|retail_variant_inventory_movements|ingredient_stock|stock_movements|retail_stock_reservations)\b/i.test(sql),'kernel must not dual-write Legacy stock');
for(const token of [
  'where m.id=p_reversal_of_movement_id','for update;',
  "p_reversal_of->>'source_document_type'","p_reversal_of->>'source_document_id'",
  "p_reversal_of->>'client_tx_id'","p_reversal_of->>'line_key'",
  "p_reversal_of->>'operation_digest'",'INVENTORY_STOCK_ADAPTER_REVERSAL_SOURCE_MISMATCH',
  'v_location_id:=v_original.location_id','v_item_kind:=v_original.item_kind','v_item_id:=v_original.item_id'
])has(token,`reversal ownership/lineage proof missing: ${token}`);
assert(apply.indexOf('where m.id=p_reversal_of_movement_id')<ownerAt,'reversal source identity must be resolved before ownership');

has("as $$ select false $$",'adapter activation must remain hard-false');
assert(cutover.includes("as $$ select false $$"),'4B-2 concurrency evidence must remain hard-false');
for(const [owner,error] of [
  ['NOT_CUT_OVER','INVENTORY_STOCK_ADAPTER_LEGACY_OWNER_ACTIVE'],
  ['FAIL_CLOSED_FORWARD_RECOVERY','INVENTORY_STOCK_ADAPTER_FORWARD_RECOVERY_REQUIRED']
]){
  has(`v_owner='${owner}'`,`ownership state missing: ${owner}`);
  has(error,`ownership failure missing: ${owner}`);
}
has("v_owner<>'CANONICAL_V2'",'unknown/contradictory ownership must fail closed');
assert(cutover.includes("v_state in ('CUT_OVER_ZERO','CANONICAL_ACTIVE') then return 'CANONICAL_V2'"),'zero/active canonical ownership mapping changed');

for(const fn of ['inventory_stock_runtime_adapter_activation_allowed_v2','inventory_stock_validate_runtime_effect_v2','inventory_stock_apply_runtime_adapter_v2']){
  assert(new RegExp(`revoke all on function public\\.${fn}\\(`,'i').test(sql),`client EXECUTE revoke missing: ${fn}`);
}
assert(/inventory_stock_apply_runtime_adapter_v2\([\s\S]*?language plpgsql security definer set search_path=''/i.test(sql),'apply kernel must use SECURITY DEFINER with empty search_path');
assert(!/grant\s+execute/i.test(sql),'kernel must grant execute to no client role');

// Behavioral model for static coverage only. This is not PostgreSQL runtime or
// committed-concurrency proof; the real writer remains covered by its own gate.
const route=(concurrency,activation,owner)=>{
  if(!concurrency)return 'CONCURRENCY_REQUIRED';
  if(!activation)return 'ACTIVATION_BLOCKED';
  if(owner==='NOT_CUT_OVER')return 'LEGACY_OWNER_ACTIVE';
  if(owner==='FAIL_CLOSED_FORWARD_RECOVERY')return 'FORWARD_RECOVERY_REQUIRED';
  if(owner!=='CANONICAL_V2')return 'UNKNOWN_OWNERSHIP';
  return 'WRITER';
};
assert.strictEqual(route(false,false,'CANONICAL_V2'),'CONCURRENCY_REQUIRED');
assert.strictEqual(route(true,false,'CANONICAL_V2'),'ACTIVATION_BLOCKED');
assert.strictEqual(route(true,true,'NOT_CUT_OVER'),'LEGACY_OWNER_ACTIVE');
assert.strictEqual(route(true,true,'FAIL_CLOSED_FORWARD_RECOVERY'),'FORWARD_RECOVERY_REQUIRED');
assert.strictEqual(route(true,true,'UNKNOWN'),'UNKNOWN_OWNERSHIP');
assert.strictEqual(route(true,true,'CANONICAL_V2'),'WRITER');

assert(writer.indexOf('inventory_stock_resolve_idempotency_v2(')<writer.indexOf('if v_idempotency.reuse_existing then'),'4B-2 replay resolution changed');
assert(writer.includes('INVENTORY_STOCK_V2_IDEMPOTENCY_CONFLICT')||
  fs.readFileSync(path.join(root,'supabase-point4-stock-v2-foundation.sql'),'utf8').includes('INVENTORY_STOCK_V2_IDEMPOTENCY_CONFLICT'),
  'same-key changed-intent conflict proof missing');

const gate='node scripts/check-point4-stock-v2-runtime-adapter-contract.js';
assert.strictEqual(pkg.scripts['check:point4-stock-v2-runtime-adapter'],gate,'dedicated Batch 1 gate missing');
assert(pkg.scripts['check:point4'].includes(gate),'Batch 1 gate missing from check:point4');

console.log('Point 4 inactive Canonical Stock runtime adapter static/source check passed.');
console.log('Static/source evidence only; no PostgreSQL runtime or concurrency claim.');
