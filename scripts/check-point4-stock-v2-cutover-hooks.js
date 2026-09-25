'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const normalize=s=>s.replace(/\r\n?/g,'\n');
const sql=normalize(fs.readFileSync(path.join(root,'supabase-point4-stock-v2-cutover-hooks.sql'),'utf8'));
const cutover=normalize(fs.readFileSync(path.join(root,'supabase-point4-stock-v2-controlled-cutover.sql'),'utf8'));
const auditor=normalize(fs.readFileSync(path.join(root,'point4-stock-reconciliation-auditor.sql'),'utf8'));
const supply=[
  'supabase-beta55-central-warehouse-foundation.sql',
  'supabase-beta55-central-warehouse-fulfillment.sql',
  'supabase-beta55-central-warehouse-visibility-shortages.sql'
].map(name=>normalize(fs.readFileSync(path.join(root,name),'utf8'))).join('\n');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

function has(text,token,message){assert(text.includes(token),message||`missing: ${token}`);}
function body(text,name){
  const start=text.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`,'i'));
  assert(start>=0,`function source missing: ${name}`);
  const next=text.slice(start+1).search(/\ncreate\s+or\s+replace\s+function\s+public\./i);
  return next<0?text.slice(start):text.slice(start,start+1+next);
}

assert(cutover.includes("as $point4b2$ select true $point4b2$;"),'4B-2 concurrency evidence gate is not closed/pass');
for(const fn of [
  'inventory_stock_resolve_cutover_route_v2',
  'inventory_stock_declare_cutover_hooks_v2',
  'inventory_stock_verify_cutover_hooks_v2'
]){
  has(sql,`create or replace function public.${fn}(`);
  assert(new RegExp(`revoke all on function public\\.${fn}\\(`).test(sql),`client EXECUTE revoke missing: ${fn}`);
}
for(const token of [
  'create table if not exists public.inventory_stock_cutover_hook_contracts_v2',
  'alter table public.inventory_stock_cutover_hook_contracts_v2 enable row level security',
  'revoke all on public.inventory_stock_cutover_hook_contracts_v2',
  "'DIRECT_PHYSICAL_WRITER','TRANSITIVE_STOCK_CALLER','DOCUMENT_WORKFLOW_BARRIER'",
  "v_plan.approved_auditor_evidence->'legacy_writer_inventory'",
  "v_plan.approved_auditor_evidence->'document_workflow_mutators'",
  "v_direct<>40 or v_transitive<>15 or v_documents<>6",
  "where plan_digest=p_plan_digest)<>61",
  "contract_kind='DIRECT_PHYSICAL_WRITER')<>40",
  "contract_kind='TRANSITIVE_STOCK_CALLER')<>15",
  "contract_kind='DOCUMENT_WORKFLOW_BARRIER')<>6",
  "raise exception 'INVENTORY_STOCK_HOOKS_UNKNOWN_DIRECT_WRITER'"
])has(sql,token,`coverage contract missing: ${token}`);

for(const digest of [
  '44d29b548400ca80870d1418968945a2ef3154cc5e8ae688dbabd3ee018567fc',
  'd54c6e5cbd75a79e6b2fcb9ddc862b68dc1330fb8eee4f2263987f31a048196d',
  'ef4460f8ac8631427f448be86f4316619a1ab7bc170d5888a0a656bbc10284f6'
])has(sql,digest,'authoritative 4B-3A digest missing');

const resolver=body(sql,'inventory_stock_resolve_cutover_route_v2');
for(const token of [
  "return 'LEGACY_ONLY'","return 'CANONICAL_ONLY'",
  "raise exception 'INVENTORY_STOCK_ROUTE_CONCURRENCY_GATE_REQUIRED'",
  "raise exception 'INVENTORY_STOCK_ROUTE_MANUAL_RECOVERY_REQUIRED'",
  "raise exception 'INVENTORY_STOCK_ROUTE_UNKNOWN_OWNERSHIP'",
  "p.status='CANONICAL_COMMITTED'",
  "o.ownership_state in ('CUT_OVER_ZERO','CANONICAL_ACTIVE')"
])has(resolver,token,`routing invariant missing: ${token}`);
assert(!resolver.includes('inventory_stock_balances_v2'),'ownership must not depend on balance existence');

has(sql,"'inventory_stock_assert_legacy_write_allowed_v2'");
has(sql,"'inventory_stock_assert_document_workflow_allowed_v2'");
assert(!/inventory_stock_apply_movement_v2\s*\(/i.test(sql),'4B-4 must not create a second stock writer/adapter');
assert(!/\b(insert\s+into|update|delete\s+from)\s+public\.(retail_inventory|retail_variant_inventory|ingredient_stock|stock_movements)/i.test(sql),'4B-4 must not mutate Legacy stock');

const verifier=body(sql,'inventory_stock_verify_cutover_hooks_v2');
assert(verifier.indexOf('if not public.inventory_stock_point4b2_concurrency_closed_v2() then')<verifier.indexOf('update public.inventory_stock_cutover_hook_contracts_v2'),'concurrency gate must precede activation');
has(verifier,"raise exception 'INVENTORY_STOCK_HOOKS_POINT4B2_CONCURRENCY_REQUIRED'");
has(verifier,"pg_catalog.pg_get_functiondef(p.oid)");
has(verifier,"pg_catalog.convert_to(v_definition,'UTF8')");
has(verifier,"inventory_stock_assert_legacy_write_allowed_v2[[:space:]]*[(]");
has(verifier,"inventory_stock_assert_document_workflow_allowed_v2[[:space:]]*[(]");

// The auditor remains the only inventory discovery algorithm. 4B-4 consumes
// its materialized JSON and never introduces a VALUES/list of writer names.
has(auditor,'direct_legacy_writers as materialized');
has(auditor,'writer_closure(oid,proname,signature,definition,root_signature,path)');
assert(!/values\s*\([^)]*(?:retail_|food_|inventory_supply_)/i.test(sql),'manual writer list detected');

const documentOnly=[
  'inventory_supply_request_create_v1','inventory_supply_request_submit_v1',
  'inventory_supply_request_prepare_v1','inventory_supply_request_decide_v1',
  'inventory_supply_request_cancel_v1','inventory_supply_shortage_request_create_v1'
];
const stockTables=/(retail_inventory_balances|retail_inventory_movements|retail_variant_inventory_balances|retail_variant_inventory_movements|ingredient_stock|stock_movements|retail_stock_reservations)/i;
for(const name of documentOnly){
  const fn=body(supply,name);
  assert(!stockTables.test(fn),`${name} must remain a document barrier, not a stock writer`);
}
for(const name of ['inventory_supply_request_dispatch_v1','inventory_supply_request_receive_v1']){
  const fn=body(supply,name);
  assert(stockTables.test(fn),`${name} must remain a genuine stock-mutating workflow`);
}

// State-machine acceptance model. Canonical routes never fall back to Legacy.
function route({owner='NOT_CUT_OVER',protectedState=false,committed=false,concurrency=false}){
  if(owner==='NOT_CUT_OVER'&&!protectedState&&!committed)return 'LEGACY_ONLY';
  if(owner==='CANONICAL_V2'&&committed){
    if(!concurrency)throw new Error('CONCURRENCY_GATE_REQUIRED');
    return 'CANONICAL_ONLY';
  }
  if(owner==='FAIL_CLOSED_FORWARD_RECOVERY'||protectedState)throw new Error('MANUAL_RECOVERY_REQUIRED');
  throw new Error('UNKNOWN_OWNERSHIP');
}
assert.strictEqual(route({}),'LEGACY_ONLY','NOT_CUT_OVER must preserve Legacy');
assert.strictEqual(route({owner:'CANONICAL_V2',committed:true,concurrency:true}),'CANONICAL_ONLY','CUT_OVER_ZERO/CANONICAL_ACTIVE must be Canonical only');
assert.throws(()=>route({owner:'CANONICAL_V2',committed:true,concurrency:false}),/CONCURRENCY_GATE_REQUIRED/,'explicit concurrency=false must block activation');
assert.throws(()=>route({owner:'FAIL_CLOSED_FORWARD_RECOVERY'}),/MANUAL_RECOVERY_REQUIRED/,'forward recovery must fail closed');
assert.throws(()=>route({owner:'NOT_CUT_OVER',committed:true}),/UNKNOWN_OWNERSHIP/,'missing committed ownership must not fall back');
assert.throws(()=>route({owner:'UNKNOWN'}),/UNKNOWN_OWNERSHIP/,'unknown ownership must fail closed');

// Transitive contracts only point to direct roots; neither contract applies a
// physical effect. Reentrant guards therefore cannot double-write stock.
has(sql,"v_roots:=coalesce(v_writer->'reaches_direct_writers','[]'::jsonb)");
has(sql,"raise exception 'INVENTORY_STOCK_HOOKS_TRANSITIVE_ROOT_REQUIRED'");
assert(!/\bdual[_ -]?write\b/i.test(sql.replace(/--[^\n]*/g,'')),'dual-write implementation detected');

const gate='node scripts/check-point4-stock-v2-cutover-hooks.js';
assert.strictEqual(pkg.scripts['check:point4-stock-v2-cutover-hooks'],gate,'dedicated 4B-4 gate missing');
assert(pkg.scripts.check.includes(gate),'4B-4 gate missing from scripts.check');

console.log('Point 4B-4 Legacy writer hooks/workflow barriers static check passed.');
