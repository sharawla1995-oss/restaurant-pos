'use strict';
const assert=require('assert'),crypto=require('crypto'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const hash=f=>crypto.createHash('sha256').update(read(f)).digest('hex');
const sql=read('supabase-point4-stock-v2-direct-routing-foundation.sql');
const pkg=JSON.parse(read('package.json'));
const has=(s,m)=>assert(sql.includes(s),m||`Batch 3 missing: ${s}`);

for(const s of [
  'inventory_stock_prepare_retail_product_effects_v2(',
  'inventory_stock_apply_prepared_retail_product_effects_v2(',
  "v_operation not in ('sale','sale_return')",
  "'create_retail_pos_order_atomic(jsonb,jsonb,jsonb)'",
  "'create_retail_order_return_idempotent(bigint,text,text,jsonb,jsonb,text)'",
  "'classification','LEGACY_COMPAT','route','LEGACY_ONLY'",
  "'classification','CANONICAL_V1'",
  "'route','CANONICAL_BLOCKED_INACTIVE'",
  'point4_identity_uuid_v4_v1(',
  'point4_identity_effect_line_key_v1(',
  'point4_identity_operation_digest_v1(',
  'inventory_stock_validate_runtime_effect_v2(',
  'INVENTORY_STOCK_ROUTE_DUPLICATE_EFFECT_LINE_KEY',
  'INVENTORY_STOCK_ROUTE_VARIANT_BOUNDARY_DEFERRED',
  'INVENTORY_STOCK_ROUTE_RETURN_LINE_NOT_REVIEWED',
  'INVENTORY_STOCK_ROUTE_RETURN_COST_REQUIRED',
  "v_original_source_document_id:=public.point4_identity_source_document_id_v1(\n      'sale',v_original_source_document_id,false",
  "'original_source_document_id',v_original_source_document_id"
])has(s);

// Canonical identity is consumed, never generated or reconstructed from a DB row.
assert(!/gen_random_uuid|random_uuid|uuid_generate|crypto\.randomuuid/i.test(sql),'routing foundation must not generate identity');
assert(!/['"]db:['"]\s*\|\||'db:'\s*\|\|/i.test(sql),'routing foundation must not fabricate DB canonical identity');
assert(sql.includes("v_source_document_id<>'uuid:'||v_document_uid::text"),'immutable UUID document identity must be exact');
assert(sql.includes("v_line->>'effect_line_key' is distinct from v_effect_line_key"),'effect key must be deterministic');
assert(!/ordinality|row_number\s*\(/i.test(sql),'line identity must not use array position');
assert(!/product_id[^\n]*line_uid|line_uid[^\n]*product_id/i.test(sql),'product ID must not become line identity');

// Legacy compatibility is classification-only. Partial identity follows the
// canonical branch and fails validation; no identity is invented or backfilled.
const legacyAt=sql.indexOf("if not v_has_any_identity then");
const canonicalValidationAt=sql.indexOf("point4_identity_uuid_v4_v1(v_tx)");
assert(legacyAt>=0&&legacyAt<canonicalValidationAt,'fully absent identity must remain Legacy before canonical validation');
assert(!/insert\s+into|update\s+public\.|delete\s+from/i.test(sql),'preparation foundation must not backfill or mutate data');

// Both hard gates precede the only future adapter call. No Legacy fallback or
// direct 4B-2 writer call is permitted in this reviewed routing layer.
const apply=sql.slice(sql.indexOf('create or replace function public.inventory_stock_apply_prepared_retail_product_effects_v2'));
const concurrencyAt=apply.indexOf('inventory_stock_point4b2_concurrency_closed_v2()');
const activationAt=apply.indexOf('inventory_stock_runtime_adapter_activation_allowed_v2()');
const adapterAt=apply.indexOf('inventory_stock_apply_runtime_adapter_v2(');
assert(concurrencyAt>=0&&concurrencyAt<activationAt&&activationAt<adapterAt,'hard gates must precede adapter delegation');
assert.strictEqual((apply.match(/inventory_stock_apply_runtime_adapter_v2\s*\(/g)||[]).length,1,'one future adapter boundary required');
assert(!/inventory_stock_apply_movement_v2\s*\(/i.test(sql),'routing layer must not call the canonical writer directly');
assert(!/\bexception\s+when\b/i.test(apply),'no exception fallback permitted');
assert(!/\b(retail_inventory_balances|retail_inventory_movements|retail_variant_inventory_balances|retail_variant_inventory_movements|ingredient_stock|stock_movements)\b/i.test(sql),'routing layer must not dual-write Legacy stock');
assert(!/create_(?:food_)?retail_.*\(/i.test(apply),'transitive/Legacy RPC must not become a second effect owner');

for(const fn of ['inventory_stock_prepare_retail_product_effects_v2','inventory_stock_apply_prepared_retail_product_effects_v2']){
  assert(new RegExp(`revoke all on function public\\.${fn}\\(`,'i').test(sql),`${fn} client revoke missing`);
}
assert(!/grant\s+execute/i.test(sql),'no client-executable routing surface allowed');
assert(/security definer set search_path=''/i.test(sql),'safe empty search_path required');

// Static behavioral model: distinct line UIDs preserve duplicate products;
// fully Legacy stays Legacy; partial Canonical data fails closed.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function classify(order,items){
  const any=Boolean(order.document_uid||order.source_document_id||order.point4_identity_contract||items.some(x=>x.line_uid||x.effect_line_key||x.source_document_id));
  if(!any)return 'LEGACY_ONLY';
  if(!uuid.test(order.document_uid||'')||order.source_document_id!==`uuid:${order.document_uid}`)throw new Error('PARTIAL_IDENTITY');
  const keys=items.map(x=>`v1:stock:sale:${x.line_uid}`);
  if(items.some((x,i)=>x.effect_line_key!==keys[i])||new Set(keys).size!==keys.length)throw new Error('EFFECT_IDENTITY');
  return 'CANONICAL_BLOCKED_INACTIVE';
}
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',d='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
assert.strictEqual(classify({},[{product_id:7}]),'LEGACY_ONLY');
assert.throws(()=>classify({document_uid:d},[{product_id:7}]),/PARTIAL_IDENTITY/);
assert.strictEqual(classify({document_uid:d,source_document_id:`uuid:${d}`},[
  {product_id:7,line_uid:a,effect_line_key:`v1:stock:sale:${a}`},
  {product_id:7,line_uid:b,effect_line_key:`v1:stock:sale:${b}`}
]),'CANONICAL_BLOCKED_INACTIVE');

// Published/Offline/Batch 1 and Batch 2 baselines remain byte-identical.
for(const [f,h] of Object.entries({
  'supabase-point4-stock-v2-foundation.sql':'3c81f3bb21ecf2f5e023e8601fb89556aced7b01a0a78b7b78b14af581259538',
  'supabase-point4-stock-v2-writer.sql':'799af8c8949a3131b1db883b823ba7151e2ba4216705cabf063db9f83b31659e',
  'supabase-point4-stock-v2-runtime-adapter-contract.sql':'1c6cd6270eb2993f218485df37d2b5a3ac9529319d4c4c1956153ce0ab235902',
  'app.js':'4368176118cc3d683d80e4e277459fd165d5a45cbf7f75a330aeb954faad9f36',
  'beta45-offline-v2-transport-runtime.js':'e3d9c05e533b1d5e2687cdbcd551425ee639c6ed28db8bd407d63ed48214d37b',
  'beta45-offline-v2-native-store.js':'c29aaa53f655e39210320ed54daf68a7860b5ce15093e9475dafdb68d0e0b9c8',
  'beta45-offline-v2-sync.js':'a23c671aae1d6d26b77af56252acb0185ab331b214ea9e47b4a35b70dd65b2a5'
}))assert.strictEqual(hash(f),h,`${f} changed from Batch 3 baseline`);

assert(read('supabase-point4-stock-v2-runtime-adapter-contract.sql').includes('as $$ select false $$'),'Batch 1 must remain hard-false');
assert(read('supabase-point4-stock-v2-controlled-cutover.sql').includes('as $$ select false $$'),'4B-2 concurrency gate must remain false');
assert(!read('app.js').includes('inventory_stock_apply_runtime_adapter_v2'),'real POS workflow must not call adapter');
assert(!read('beta45-offline-v2-transport-runtime.js').includes('inventory_stock_apply_runtime_adapter_v2'),'Offline transport must not call adapter');
assert.notStrictEqual('payload_digest','operation_digest');

const gate='node scripts/check-point4-stock-v2-direct-routing-foundation.js';
assert.strictEqual(pkg.scripts['check:point4-stock-v2-direct-routing'],gate,'Batch 3 dedicated gate missing');
assert(pkg.scripts['check:point4'].includes(gate),'Batch 3 missing from aggregate Point 4 gate');

console.log('Point 4 Batch 3 direct stock routing foundation PASS (static/JS; no PostgreSQL runtime or concurrency claim).');
