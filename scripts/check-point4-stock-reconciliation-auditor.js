'use strict';

const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const auditorPath=path.join(root,'point4-stock-reconciliation-auditor.sql');
const sql=fs.readFileSync(auditorPath,'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

function stripSql(text){
  return text
    .replace(/\/\*[\s\S]*?\*\//g,' ')
    .replace(/--[^\n]*/g,' ')
    .replace(/'(?:''|[^'])*'/g,"''")
    .replace(/\s+/g,' ')
    .trim();
}
function has(token,message){assert(sql.includes(token),message||`missing: ${token}`);}

const executable=stripSql(sql);
assert(/^with\s+recursive\b/i.test(executable),'auditor must be one read-only WITH/SELECT statement');
assert(/\)\s*select\s+jsonb_build_object\s*\(/i.test(executable),'auditor result projection missing');
assert(!/\b(insert|update|delete|merge|upsert|create|alter|drop|truncate|grant|revoke|comment|call|do|copy|vacuum|refresh|reindex|cluster)\b/i.test(executable),'mutating SQL/DDL detected in auditor');
assert(!/\binventory_stock_apply_movement_v2\s*\(/i.test(executable),'canonical writer call detected in auditor');
for(const rpc of [
  'retail_inventory_adjust','retail_variant_inventory_adjust_v1',
  'retail_post_stock_count','retail_purchase_receive','retail_purchase_receive_v2',
  'retail_supplier_return_create','retail_supplier_return_create_v2',
  'retail_transfer_create','retail_transfer_receive','retail_reserve_stock',
  'food_apply_ingredient_delta_internal_v1','food_ingredient_stock_adjust_v1',
  'food_purchase_receive_v1','food_supplier_return_create_v1',
  'food_stock_count_post_v1','food_stock_transfer_create_v1',
  'food_stock_transfer_receive_v1','food_stock_transfer_cancel_v1',
  'food_waste_post_v1','food_production_batch_complete_v1',
  'inventory_supply_request_dispatch_v1','inventory_supply_request_receive_v1',
  'create_retail_pos_order_atomic','create_retail_variant_pos_order_atomic_v1',
  'create_food_pos_order_atomic_v1','create_food_retail_pos_order_atomic_v1'
])assert(!new RegExp(`\\b(?:public\\.)?${rpc}\\s*\\(`,'i').test(executable),`stock mutation RPC call detected: ${rpc}`);

for(const table of [
  'retail_inventory_balances','retail_inventory_movements',
  'retail_variant_inventory_balances','retail_variant_inventory_movements',
  'ingredient_stock','stock_movements','inventory','retail_stock_reservations',
  'retail_transfers','retail_transfer_items','stock_transfers','stock_transfer_items',
  'inventory_supply_requests','inventory_supply_request_items',
  'inventory_supply_receipts','inventory_supply_receipt_items',
  'retail_purchase_orders','retail_purchase_order_items','purchases','purchase_items',
  'retail_goods_receipts','retail_goods_receipt_items',
  'food_purchase_receipts','food_purchase_receipt_items',
  'retail_stock_counts','retail_stock_count_items','food_stock_counts','food_stock_count_items',
  'food_ingredient_adjustment_events','food_waste_events'
])has(`public.${table}`,`legacy source missing: ${table}`);

for(const field of [
  'location_id','item_kind','item_id','source_evidence','source_quantity',
  'reserved_quantity','available_quantity','tracking_state','allow_negative_stock',
  'average_unit_cost','last_unit_cost','source_quantity_scale','source_cost_scale',
  'latest_balance_after','latest_movement_at','inferred_preledger_opening_quantity',
  'active_reservation_count','in_flight_document_count','readiness_blockers',
  'historical_warnings','readiness'
])has(field,`candidate field missing: ${field}`);

for(const reason of [
  'ORPHAN_LOCATION','ORPHAN_ITEM_IDENTITY','DUPLICATE_BALANCE_KEY',
  'MISSING_LEGACY_BALANCE',
  'MULTIPLE_LEGACY_BALANCE_OWNERS','PRODUCT_VARIANT_COMPETING_OWNERSHIP',
  'BALANCE_LATEST_MOVEMENT_MISMATCH','MISSING_AVERAGE_COST_EVIDENCE',
  'TRACKING_STATE_NOT_TRACKED',
  'QUANTITY_PRECISION_EXCEEDS_V2_SCALE_3','COST_PRECISION_EXCEEDS_V2_SCALE_4',
  'CONFLICTING_LEGACY_CLIENT_TX_ID','ACTIVE_RESERVATIONS_REQUIRE_CONVERSION',
  'IN_FLIGHT_STOCK_DOCUMENTS'
])has(`'${reason}'`,`fail-closed rule missing: ${reason}`);

for(const reason of [
  'MOVEMENT_CHAIN_DISCONTINUITY','MOVEMENT_COST_EVIDENCE_MISSING',
  'UNMAPPED_LEGACY_MOVEMENT_TYPE','UNRESOLVED_ADJUSTMENT_COSTING'
])has(`'${reason}'`,`historical warning missing: ${reason}`);

assert(!sql.includes("'AMBIGUOUS_LEGACY_CLIENT_TX_ID'"),'duplicate Legacy client_tx_id alone must not quarantine');
for(const token of [
  'conflicting_client_keys as materialized','legitimate_multiline_client_keys as materialized',
  'use_count<>identity_count','location_count<>1','document_count<>1','movement_type_count<>1',
  'has_missing_document_identity','legitimate_multiline_client_tx_rows'
])has(token,`client transaction conflict proof missing: ${token}`);

for(const token of [
  "'strategy','single_opening_at_approved_watermark'",
  "'legacy_history','historical_read_only_not_copied'",
  "':opening:'",
  "'opening:'||c.item_kind||':'||c.item_id",
  "':reservation-set:'",
  'extensions.digest(',
  "'source'",
  "'candidate_plan'",
  "'legacy_writer_inventory'",
  "'mode','READ_ONLY'",
  "'cutover_executed',false",
  "'canonical_writer_called',false",
  "'candidate_state_ready'",
  "'ready_for_cutover',false",
  "'blocked_by_point4b2_concurrency',true",
  "'requires_point4b2_concurrency_closure',true"
])has(token,`determinism/safety contract missing: ${token}`);

for(const token of [
  'identity_universe as materialized',
  'select location_id,item_kind,item_id from movement_rows',
  'select location_id,item_kind,item_id from active_reservations',
  'select location_id,item_kind,item_id from in_flight_documents',
  'direct_legacy_writers as materialized',
  'writer_closure(oid,proname,signature,definition,root_signature,path)',
  'reaches_direct_writers'
])has(token,`complete identity/writer coverage missing: ${token}`);

for(const token of [
  'is_direct_stock_mutator','document_workflow_mutators as materialized',
  "'document/in-flight workflow barrier'",
  "from document_workflow_mutators"
])has(token,`writer/barrier separation missing: ${token}`);

const directWriterSection=sql.slice(
  sql.indexOf('direct_legacy_writers as materialized'),
  sql.indexOf('writer_closure(',sql.indexOf('direct_legacy_writers as materialized'))
);
assert(!/(retail_transfers|stock_transfers|inventory_supply_requests)/i.test(directWriterSection),'document tables must not define direct stock writers');

assert(!/\bnow\s*\(|\bclock_timestamp\s*\(|\bstatement_timestamp\s*\(/i.test(executable),'wall-clock dependency would make an unchanged audit non-deterministic');

const clientTxConflict=rows=>{
  const identities=new Set(rows.map(r=>`${r.location_id}:${r.item_id}`));
  const locations=new Set(rows.map(r=>r.location_id));
  const documents=new Set(rows.map(r=>`${r.reference_type}:${r.reference_id}`));
  const types=new Set(rows.map(r=>r.movement_type));
  return rows.length!==identities.size||locations.size!==1||documents.size!==1||
    types.size!==1||rows.some(r=>r.reference_type==null||r.reference_id==null);
};
const line=(item,doc,location=1)=>({location_id:location,item_id:item,movement_type:'sale',reference_type:'order',reference_id:doc});
assert.strictEqual(clientTxConflict([line(1,'10'),line(2,'10')]),false,'legitimate multi-line order must not conflict');
assert.strictEqual(clientTxConflict([line(1,'10'),line(1,'10')]),true,'same-identity duplicate must fail closed');
assert.strictEqual(clientTxConflict([line(1,'10'),line(2,'11')]),true,'cross-document key reuse must fail closed');
assert.strictEqual(clientTxConflict([line(1,'10',1),line(2,'10',2)]),true,'cross-location key reuse must fail closed');
assert.strictEqual(clientTxConflict([{...line(1,'10'),reference_id:null},line(2,'10')]),true,'missing document identity must fail closed');

for(const classification of [
  'product','variant','ingredient','reservation','transfer',
  'purchasing/receiving','sale/return','adjustment/waste/stocktake','other'
])has(`'${classification}'`,`writer classification missing: ${classification}`);

assert(sql.includes("source_quantity<>round(source_quantity,3)")||sql.includes("b.source_quantity<>round(b.source_quantity,3)"),'lossless quantity precision check missing');
assert(sql.includes("average_unit_cost,0)<>round(coalesce(b.average_unit_cost,0),4"),'lossless cost precision check missing');
assert(!/\bround\(b\.source_quantity,3\)\s+as\s+source_quantity\b/i.test(sql),'auditor must not silently round source quantity');

const canonicalize=value=>{
  if(Array.isArray(value))return value.map(canonicalize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonicalize(value[k])]));
  return value;
};
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
const fixture=[
  {location_id:1,item_kind:'product',item_id:3,quantity:'9.398',blockers:[],warnings:[]},
  {location_id:1,item_kind:'product',item_id:1,quantity:'22.000',blockers:[],warnings:['MOVEMENT_CHAIN_DISCONTINUITY']}
];
const ordered=[...fixture].sort((a,b)=>a.location_id-b.location_id||a.item_kind.localeCompare(b.item_kind)||a.item_id-b.item_id);
assert.strictEqual(digest(ordered),digest([...ordered]),'unchanged candidate plan digest must be stable');
assert.strictEqual(digest(canonicalize({b:2,a:1})),digest(canonicalize({a:1,b:2})),'canonical digest must ignore object key insertion order');

const gate='node scripts/check-point4-stock-reconciliation-auditor.js';
assert.strictEqual(pkg.scripts['check:point4-stock-reconciliation-auditor'],gate,'dedicated auditor gate missing');
assert(pkg.scripts.check.includes(gate),'auditor gate missing from scripts.check');

console.log('Point 4B-3A read-only reconciliation auditor static check passed.');
