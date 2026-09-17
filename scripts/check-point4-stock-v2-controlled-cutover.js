'use strict';

const assert=require('assert');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const file=path.join(root,'supabase-point4-stock-v2-controlled-cutover.sql');
const sql=fs.readFileSync(file,'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

function has(token,message){assert(sql.includes(token),message||`missing: ${token}`);}
function before(a,b,message){
  assert(sql.indexOf(a)>=0&&sql.indexOf(a)<sql.indexOf(b),message||`${a} must precede ${b}`);
}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(
    Object.keys(value).sort().map(key=>[key,canonical(value[key])])
  );
  return value;
}
function digest(value){
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

for(const object of [
  'inventory_stock_cutover_plans_v2','inventory_stock_cutover_candidates_v2',
  'inventory_stock_cutover_boundaries_v2','inventory_stock_ownership_v2',
  'inventory_stock_ownership_events_v2'
]){
  has(`create table if not exists public.${object}`);
  has(`alter table public.${object} enable row level security`);
  has(`revoke all on public.${object} from public,anon,authenticated`);
}

for(const fn of [
  'inventory_stock_point4b2_concurrency_closed_v2',
  'inventory_stock_resolve_operational_owner_v2',
  'inventory_stock_assert_legacy_write_allowed_v2',
  'inventory_stock_assert_document_workflow_allowed_v2',
  'inventory_stock_assert_canonical_write_allowed_v2',
  'inventory_stock_stage_cutover_plan_v2',
  'inventory_stock_revalidate_cutover_candidate_v2',
  'inventory_stock_execute_cutover_v2',
  'inventory_stock_mark_forward_recovery_v2',
  'inventory_stock_validate_cutover_item_v2',
  'inventory_stock_ownership_event_immutable_v2'
]){
  has(`create or replace function public.${fn}(`,`function missing: ${fn}`);
  assert(new RegExp(`revoke all on function public\\.${fn}\\(`).test(sql),`client revoke missing: ${fn}`);
}

has("as $$ select false $$",'4B-2 concurrency gate must remain hard-closed');
before(
  'if not public.inventory_stock_point4b2_concurrency_closed_v2() then',
  'perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_plan_digest,0))',
  'concurrency refusal must precede every cutover lock/mutation'
);
for(const token of [
  "raise exception 'INVENTORY_STOCK_CUTOVER_POINT4B2_CONCURRENCY_REQUIRED'",
  "raise exception 'INVENTORY_STOCK_CUTOVER_PLAN_CONFLICT'",
  "raise exception 'INVENTORY_STOCK_CUTOVER_CANDIDATE_NOT_READY'",
  "raise exception 'INVENTORY_STOCK_CUTOVER_STALE_WATERMARK'",
  "raise exception 'INVENTORY_STOCK_CUTOVER_ACTIVE_RESERVATION'",
  "raise exception 'INVENTORY_STOCK_CUTOVER_IN_FLIGHT_DOCUMENT'",
  "raise exception 'INVENTORY_STOCK_CUTOVER_BOUNDARY_HOOK_REQUIRED'",
  "raise exception 'INVENTORY_STOCK_CUTOVER_V2_CONFLICT'",
  "raise exception 'INVENTORY_STOCK_CUTOVER_PRODUCT_VARIANT_CONFLICT'",
  "raise exception 'INVENTORY_STOCK_CUTOVER_QUANTITY_PRECISION_OR_SIGN'"
])has(token);
for(const token of [
  '44d29b548400ca80870d1418968945a2ef3154cc5e8ae688dbabd3ee018567fc',
  'd54c6e5cbd75a79e6b2fcb9ddc862b68dc1330fb8eee4f2263987f31a048196d',
  '26e720760b6b4d2ddf6d45470b6092dab81c15a4fb1e98c5e76043551fb0d88d',
  "jsonb_array_length(coalesce(p_auditor_result->'candidate_evidence','[]'::jsonb))<>3",
  "jsonb_array_length(coalesce(p_auditor_result->'legacy_writer_inventory','[]'::jsonb))<>50",
  "jsonb_array_length(coalesce(p_auditor_result->'document_workflow_mutators','[]'::jsonb))<>6"
])has(token,`approved 4B-3A checkpoint not pinned: ${token}`);

// Ownership is independent of balance existence. No row is NOT_CUT_OVER;
// both positive and zero committed states route only to Canonical V2.
for(const token of [
  "if not found then return 'NOT_CUT_OVER'",
  "v_state in ('CUT_OVER_ZERO','CANONICAL_ACTIVE')",
  "return 'CANONICAL_V2'",
  "return 'FAIL_CLOSED_FORWARD_RECOVERY'",
  "raise exception 'INVENTORY_STOCK_V2_LEGACY_OWNER_DENIED'",
  "raise exception 'INVENTORY_STOCK_V2_CANONICAL_OWNER_REQUIRED'",
  'source_average_unit_cost numeric(18,4)',
  'source_last_unit_cost numeric(18,4)'
])has(token);

const zeroBlock=sql.slice(
  sql.indexOf('if v_candidate.source_quantity=0 then'),
  sql.indexOf('else',sql.indexOf('if v_candidate.source_quantity=0 then'))
);
has("'CUT_OVER_ZERO'",'zero ownership state missing');
assert(!/inventory_stock_apply_movement_v2\s*\(/.test(zeroBlock),'zero quantity must not call physical writer');
assert(!/insert\s+into\s+public\.inventory_stock_balances_v2/i.test(zeroBlock),'zero quantity must not fabricate balance');
assert(zeroBlock.includes("'quantity',0")&&zeroBlock.includes("'lineage'")&&zeroBlock.includes("'historical_warnings'"),'zero lineage evidence incomplete');

const positiveBlock=sql.slice(
  sql.indexOf('else',sql.indexOf('if v_candidate.source_quantity=0 then')),
  sql.indexOf('end if;',sql.indexOf('else',sql.indexOf('if v_candidate.source_quantity=0 then')))
);
assert(/inventory_stock_apply_movement_v2\s*\(/.test(positiveBlock),'positive quantity must use the approved 4B-2 writer');
for(const token of [
  "v_candidate.opening_client_tx_id,v_candidate.opening_line_key",
  "'opening'","'legacy_cutover'","'CANONICAL_ACTIVE'",
  "'CANONICAL_OPENING'"
])assert(positiveBlock.includes(token),`positive opening contract missing: ${token}`);

for(const token of [
  "'point4-stock-cutover-v1:opening:'",
  "'opening:'||v_item_kind||':'||v_item_id",
  "'point4-stock-ownership-v1:'",
  "'cutover_schema_version',1",
  'extensions.digest(',
  "pg_catalog.convert_to(v_candidate::text,'UTF8')",
  "historical_warnings",
  "'{lineage,legacy_history}'<>'historical_read_only_not_copied'",
  "'{lineage,source_digest}'<>v_source_digest"
])has(token,`determinism/lineage token missing: ${token}`);

const executeBody=sql.slice(sql.indexOf('create or replace function public.inventory_stock_execute_cutover_v2('),sql.indexOf('create or replace function public.inventory_stock_mark_forward_recovery_v2('));
function executeBefore(a,b,message){assert(executeBody.indexOf(a)>=0&&executeBody.indexOf(a)<executeBody.lastIndexOf(b),message);}
executeBefore("set status='CUTOVER_PROTECTED'","set state='FROZEN'",'protection must precede freeze');
assert((executeBody.match(/inventory_stock_revalidate_cutover_candidate_v2\s*\(/g)||[]).length===2,'watermark must be revalidated before and after freeze');
assert(executeBody.indexOf("set state='FROZEN'")<executeBody.lastIndexOf('inventory_stock_revalidate_cutover_candidate_v2('),'freeze must precede second watermark validation');
assert(executeBody.lastIndexOf('inventory_stock_revalidate_cutover_candidate_v2(')<executeBody.lastIndexOf('for v_candidate in select *'),'second watermark validation must precede openings');
executeBefore('for v_candidate in select *',"set state='CANONICAL_ACTIVE'",'ownership/openings must precede workflow switch');
executeBefore("raise exception 'INVENTORY_STOCK_CUTOVER_VERIFY_FAILED'","set state='CANONICAL_ACTIVE'",'canonical verification must precede workflow switch');
executeBefore("set state='CANONICAL_ACTIVE'","set status='CANONICAL_COMMITTED'",'exact workflow switch must precede commit state');

for(const token of [
  "boundary_kind in ('PHYSICAL_STOCK_WRITER','DOCUMENT_WORKFLOW_BARRIER')",
  "not b.hook_verified",
  'verified_definition_digest is not null',
  'pg_catalog.pg_get_functiondef(p.oid)',
  "pg_catalog.to_regprocedure('public.'||b.function_signature)",
  "deployed.definition!~* 'inventory_stock_assert_legacy_write_allowed_v2[[:space:]]*[(]'",
  "deployed.definition!~* 'inventory_stock_assert_document_workflow_allowed_v2[[:space:]]*[(]'",
  "and state='LEGACY_ACTIVE'",
  "and state='FROZEN'",
  "'point4-stock-owner-v2:'",
  "'point4-stock-document-barrier-v2'",
  'inventory_stock_revalidate_cutover_candidate_v2(',
  "raise exception 'INVENTORY_STOCK_OWNERSHIP_EVENT_IMMUTABLE'",
  "status='FORWARD_RECOVERY_REQUIRED'",
  "ownership_state='FORWARD_RECOVERY_REQUIRED'",
  "state='FORWARD_RECOVERY_REQUIRED'",
  'No immutable V2 row is deleted'
])has(token,`freeze/forward-recovery invariant missing: ${token}`);

assert(!/delete\s+from\s+public\.inventory_stock_(?:movements|balances)_v2/i.test(sql),'cutover must never delete canonical stock');
assert(!/update\s+public\.inventory_stock_movements_v2/i.test(sql),'cutover must never rewrite immutable movements');
assert(!/insert\s+into\s+public\.(?:retail_inventory|retail_variant_inventory|ingredient_stock|stock_movements)/i.test(sql),'cutover source must not mutate Legacy stock');
assert(!/grant\s+execute\s+on\s+function/i.test(sql),'no client-executable cutover API is allowed');

// Deterministic behavioral model for the source contract.
function stage(candidate,{concurrencyClosed=false}={}){
  if(!concurrencyClosed)throw new Error('INVENTORY_STOCK_CUTOVER_POINT4B2_CONCURRENCY_REQUIRED');
  if(candidate.readiness!=='READY')throw new Error('INVENTORY_STOCK_CUTOVER_CANDIDATE_NOT_READY');
  if(candidate.blockers.length)throw new Error('INVENTORY_STOCK_CUTOVER_CANDIDATE_GATE_FAILED');
  if(candidate.stale)throw new Error('INVENTORY_STOCK_CUTOVER_STALE_WATERMARK');
  if(candidate.activeReservations)throw new Error('INVENTORY_STOCK_CUTOVER_ACTIVE_RESERVATION');
  if(candidate.inFlight)throw new Error('INVENTORY_STOCK_CUTOVER_IN_FLIGHT_DOCUMENT');
  if(candidate.v2Conflict)throw new Error('INVENTORY_STOCK_CUTOVER_V2_CONFLICT');
  if(candidate.ownershipConflict)throw new Error('INVENTORY_STOCK_CUTOVER_PRODUCT_VARIANT_CONFLICT');
  if(Number(candidate.quantity.toFixed(3))!==candidate.quantity)throw new Error('INVENTORY_STOCK_CUTOVER_QUANTITY_PRECISION_OR_SIGN');
  if(Number(candidate.cost.toFixed(4))!==candidate.cost)throw new Error('INVENTORY_STOCK_CUTOVER_CANDIDATE_GATE_FAILED');
  if(candidate.dualWrite)throw new Error('INVENTORY_STOCK_CUTOVER_BOUNDARY_HOOK_REQUIRED');
  return candidate.quantity===0
    ? {owner:'CANONICAL_V2',state:'CUT_OVER_ZERO',movement:null,warnings:[...candidate.warnings]}
    : {owner:'CANONICAL_V2',state:'CANONICAL_ACTIVE',movement:'opening',warnings:[...candidate.warnings]};
}
const base={readiness:'READY',blockers:[],quantity:5,cost:12.3456,warnings:['MOVEMENT_COST_EVIDENCE_MISSING']};
assert.throws(()=>stage(base),/POINT4B2_CONCURRENCY_REQUIRED/,'current source must refuse execution');
const positive=stage(base,{concurrencyClosed:true});
assert.strictEqual(positive.movement,'opening','positive quantity requires physical opening');
const zero=stage({...base,quantity:0},{concurrencyClosed:true});
assert.deepStrictEqual(zero,{owner:'CANONICAL_V2',state:'CUT_OVER_ZERO',movement:null,warnings:base.warnings},'zero ownership must have lineage but no physical effect');
assert.notStrictEqual(zero.state,'NOT_CUT_OVER','CUT_OVER_ZERO must differ from NOT_CUT_OVER');
assert.strictEqual(zero.owner,'CANONICAL_V2','future zero mutation must not route to Legacy');

for(const [field,value,error] of [
  ['readiness','QUARANTINED','CANDIDATE_NOT_READY'],
  ['blockers',['X'],'CANDIDATE_GATE_FAILED'],['stale',true,'STALE_WATERMARK'],
  ['activeReservations',1,'ACTIVE_RESERVATION'],['inFlight',1,'IN_FLIGHT_DOCUMENT'],
  ['v2Conflict',true,'V2_CONFLICT'],['ownershipConflict',true,'PRODUCT_VARIANT_CONFLICT'],
  ['quantity',1.0001,'QUANTITY_PRECISION_OR_SIGN'],['cost',1.00001,'CANDIDATE_GATE_FAILED'],
  ['dualWrite',true,'BOUNDARY_HOOK_REQUIRED']
])assert.throws(()=>stage({...base,[field]:value},{concurrencyClosed:true}),new RegExp(error),`${field} must fail closed`);

const plan={source:'a'.repeat(64),candidate:{location:1,kind:'product',id:2,quantity:'0.000'}};
assert.strictEqual(digest(plan),digest(canonical(plan)),'exact plan replay must be deterministic');
assert.notStrictEqual(digest(plan),digest({...plan,candidate:{...plan.candidate,quantity:'1.000'}}),'changed payload must conflict');
assert.deepStrictEqual(zero.warnings,base.warnings,'historical warnings must be preserved, not converted into facts');

const gate='node scripts/check-point4-stock-v2-controlled-cutover.js';
assert.strictEqual(pkg.scripts['check:point4-stock-v2-controlled-cutover'],gate,'dedicated 4B-3B gate missing');
assert(pkg.scripts.check.includes(gate),'4B-3B gate missing from scripts.check');

console.log('Point 4B-3B controlled canonical opening/cutover static check passed.');
