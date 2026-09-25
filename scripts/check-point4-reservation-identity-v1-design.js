#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const fail=m=>{throw new Error(m)};
const must=(ok,m)=>{if(!ok)fail(m)};
const has=(text,value,m)=>must(text.includes(value),m||`missing ${value}`);
const matches=(text,re,m)=>must(re.test(text),m||`missing ${re}`);
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');

const design=read('docs/POINT4-BATCH4B-RESERVATION-IDENTITY-V1-DESIGN.md');
const beta17=read('supabase-v10-5-4-beta17-retail-market-core.sql');
const beta18=read('supabase-v10-5-4-beta18-retail-website-integration.sql');
const finalize=read('supabase-v10-5-4-beta18-retail-website-integration-finalize.sql');
const identity=read('supabase-point4-source-identity-v1-contract.sql');
const batch1=read('supabase-point4-stock-v2-runtime-adapter-contract.sql');
const cutover=read('supabase-point4-stock-v2-controlled-cutover.sql');

for(const fragment of [
  'id bigserial primary key','branch_id bigint not null references public.branches(id) on delete cascade',
  'product_id bigint not null references public.products(id) on delete cascade',
  'quantity numeric(14,3) not null check(quantity>0)','reservation_key text not null',
  "status text not null default 'active' check(status in('active','consumed','released','expired'))",
  'website_order_id bigint null','unique(reservation_key,product_id)',
  'create or replace function public.retail_reserve_stock(p_branch_id bigint,p_reservation_key text,p_items jsonb,p_minutes integer default 10)'
]) has(beta17,fragment,`beta17 contract drift: ${fragment}`);

for(const fragment of [
  'create table if not exists public.retail_website_orders(',
  'idempotency_key text not null unique','reservation_key text not null unique',
  "status text not null default 'pending' check(status in ('pending','accepted','rejected','cancelled','expired'))",
  'create table if not exists public.retail_website_order_items(',
  'quantity numeric(14,3) not null check(quantity > 0)',
  'unique(retail_website_order_id,product_id)',
  "group by nullif(x->>'product_id','')::bigint",
  "round(sum(coalesce((x->>'quantity')::numeric,0)),3) as quantity",
  "max(nullif(trim(coalesce(x->>'notes','')),'')) as notes",
  'create or replace function public.accept_retail_website_order(p_retail_website_order_id bigint)',
  'create or replace function public.reject_retail_website_order(p_retail_website_order_id bigint,p_reason text default null)',
  'create or replace function public.cancel_retail_website_order_customer(p_order_code text,p_customer_phone text)'
]) has(beta18,fragment,`beta18 contract drift: ${fragment}`);

for(const fragment of [
  'create or replace function public.retail_create_website_order(',
  'p_branch_id bigint,','p_idempotency_key text,','p_reservation_key text,','p_items jsonb',
  'retail_create_website_order_beta18_core(',
  'revoke execute on function public.retail_reserve_stock(bigint,text,jsonb,integer) from anon,authenticated'
]) has(finalize,fragment,`finalize contract drift: ${fragment}`);

const manifestMatch=design.match(/<!-- CONTRACT_MANIFEST_BEGIN -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- CONTRACT_MANIFEST_END -->/);
must(manifestMatch,'normative contract manifest missing');
let manifest;
try{manifest=JSON.parse(manifestMatch[1])}catch(e){fail(`invalid contract manifest JSON: ${e.message}`)}
must(crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex')==='53006ef7672c7cd9534697752e34b234a3ba3af7f4e8ec19e4eaa29b764c1198','normative manifest exact-content drift');
must(manifest.contract==='sharawla.point4.reservation.identity.v1','wrong manifest contract');
must(manifest.status==='source-design-only','design must remain source-only');

const expectedTables={
  'public.retail_reservation_documents_identity_v1':{
    columns:{id:'bigint generated always as identity',retail_website_order_id:'bigint',document_uid:'uuid',source_document_id:"text generated always as ('uuid:' || document_uid::text) stored",creation_client_tx_id:'uuid',creation_operation_digest:'text',identity_contract_version:'text',created_at:'timestamptz'},
    constraints:['retail_reservation_documents_identity_v1_pkey','retail_reservation_documents_identity_v1_website_order_fkey','retail_reservation_documents_identity_v1_website_order_key','retail_reservation_documents_identity_v1_document_uid_key','retail_reservation_documents_identity_v1_source_document_key','retail_reservation_documents_identity_v1_creation_tx_key','retail_reservation_documents_identity_v1_digest_check','retail_reservation_documents_identity_v1_version_check'],
    indexes:['retail_reservation_documents_identity_v1_created_idx'],triggers:['retail_reservation_documents_identity_v1_immutable']
  },
  'public.retail_reservation_lines_identity_v1':{
    columns:{id:'bigint generated always as identity',reservation_document_id:'bigint',line_uid:'uuid',product_id:'bigint',quantity:'numeric(14,3)',normalized_notes:'text',reservation_effect_line_key:'text',canonical_line_digest:'text',created_at:'timestamptz'},
    constraints:['retail_reservation_lines_identity_v1_pkey','retail_reservation_lines_identity_v1_document_fkey','retail_reservation_lines_identity_v1_product_fkey','retail_reservation_lines_identity_v1_line_uid_key','retail_reservation_lines_identity_v1_effect_key','retail_reservation_lines_identity_v1_quantity_check','retail_reservation_lines_identity_v1_effect_format_check','retail_reservation_lines_identity_v1_digest_check'],
    indexes:['retail_reservation_lines_identity_v1_document_product_idx'],triggers:['retail_reservation_lines_identity_v1_immutable']
  },
  'public.retail_reservation_mutations_identity_v1':{
    columns:{id:'bigint generated always as identity',reservation_document_id:'bigint',client_tx_id:'uuid',mutation_type:'text',operation_digest:'text',requested_status:'text',result_status:'text',result_payload:'jsonb',actor_kind:'text',actor_employee_id:'bigint',recorded_at:'timestamptz',applied_at:'timestamptz'},
    constraints:['retail_reservation_mutations_identity_v1_pkey','retail_reservation_mutations_identity_v1_document_fkey','retail_reservation_mutations_identity_v1_employee_fkey','retail_reservation_mutations_identity_v1_client_tx_key','retail_reservation_mutations_identity_v1_digest_check','retail_reservation_mutations_identity_v1_type_status_check','retail_reservation_mutations_identity_v1_actor_check','retail_reservation_mutations_identity_v1_result_check','retail_reservation_mutations_identity_v1_result_status_check'],
    indexes:['retail_reservation_mutations_identity_v1_document_recorded_idx','retail_reservation_mutations_identity_v1_one_expiry_idx'],triggers:['retail_reservation_mutations_identity_v1_guard']
  }
};

must(Object.keys(manifest.tables).sort().join('|')===Object.keys(expectedTables).sort().join('|'),'table set drift');
for(const [table,expected] of Object.entries(expectedTables)){
  const actual=manifest.tables[table];
  const cols=Object.fromEntries(actual.columns.map(c=>[c.name,c]));
  must(Object.keys(cols).sort().join('|')===Object.keys(expected.columns).sort().join('|'),`${table}: column set drift`);
  for(const [name,type] of Object.entries(expected.columns)){
    must(cols[name].type===type,`${table}.${name}: type drift`);
    const nullable=['normalized_notes','result_status','result_payload','actor_employee_id','applied_at'].includes(name);
    must(cols[name].nullable===nullable,`${table}.${name}: nullability drift`);
    must(Object.prototype.hasOwnProperty.call(cols[name],'default'),`${table}.${name}: default omitted`);
  }
  const names=k=>actual[k].map(x=>typeof x==='string'?x:x.name).sort().join('|');
  must(names('constraints')===[...expected.constraints].sort().join('|'),`${table}: constraint-name drift`);
  must(names('indexes')===[...expected.indexes].sort().join('|'),`${table}: index-name drift`);
  must(names('triggers')===[...expected.triggers].sort().join('|'),`${table}: trigger-name drift`);
  for(const c of actual.constraints)must(c.kind&&c.definition,`${table}.${c.name}: incomplete constraint`);
  for(const i of actual.indexes)must(i.definition,`${table}.${i.name}: incomplete index`);
  for(const t of actual.triggers)must(t.definition,`${table}.${t.name}: incomplete trigger`);
}

const expectedFunctions=[
  'public.retail_reservation_identity_immutable_v1() returns trigger',
  'public.retail_reservation_mutation_guard_v1() returns trigger',
  'public.retail_reservation_identity_digest_v1(text,text,text,bigint,jsonb,jsonb) returns text',
  'public.retail_reservation_identity_resolve_mutation_v1(text,text,text) returns bigint',
  'public.retail_reservation_identity_assert_projection_v1(bigint) returns void',
  'public.retail_create_website_order_identity_v1(jsonb) returns jsonb',
  'public.accept_retail_website_order_identity_v1(text,text) returns jsonb',
  'public.reject_retail_website_order_identity_v1(text,text,text) returns jsonb',
  'public.cancel_retail_website_order_customer_identity_v1(text,text,text) returns jsonb',
  'public.expire_retail_website_order_identity_v1(text) returns jsonb'
];
must(manifest.functions.sort().join('|')===[...expectedFunctions].sort().join('|'),'function/signature drift');
must(manifest.policies.map(p=>p.name).sort().join('|')===[
  'retail_reservation_documents_identity_v1_staff_select',
  'retail_reservation_lines_identity_v1_staff_select',
  'retail_reservation_mutations_identity_v1_staff_select'
].sort().join('|'),'policy-name drift');
for(const p of manifest.policies){
  must(p.table.startsWith('public.retail_reservation_'),'policy table drift');
  must(p.command==='select'&&p.roles.join('|')==='authenticated','policy command/role drift');
  must(p.using.includes('public.has_branch_access('),'policy branch-access drift');
}

const expectedRpcContracts={
  'public.retail_create_website_order_identity_v1(jsonb) returns jsonb':[['p_identity_envelope jsonb'],['anon','authenticated']],
  'public.accept_retail_website_order_identity_v1(text,text) returns jsonb':[['p_document_uid text','p_client_tx_id text'],['authenticated']],
  'public.reject_retail_website_order_identity_v1(text,text,text) returns jsonb':[['p_document_uid text','p_client_tx_id text','p_reason text'],['authenticated']],
  'public.cancel_retail_website_order_customer_identity_v1(text,text,text) returns jsonb':[['p_document_uid text','p_client_tx_id text','p_customer_phone text'],['anon','authenticated']],
  'public.expire_retail_website_order_identity_v1(text) returns jsonb':[['p_document_uid text'],[]]
};
must(Object.keys(manifest.rpc_contracts).sort().join('|')===Object.keys(expectedRpcContracts).sort().join('|'),'RPC contract set drift');
for(const [signature,[args,roles]] of Object.entries(expectedRpcContracts)){
  const rpc=manifest.rpc_contracts[signature];
  must(rpc.arguments.join('|')===args.join('|'),`${signature}: argument drift`);
  must(rpc.security==="security definer set search_path=''",`${signature}: security drift`);
  must(rpc.execute_roles.join('|')===roles.join('|'),`${signature}: grant drift`);
}
must(manifest.security.rls_enabled_on.length===3,'RLS table coverage drift');
must(manifest.security.table_mutation_revoked_from.join('|')==='PUBLIC|anon|authenticated','table revoke drift');
must(manifest.security.helper_execute_revoked_from.join('|')==='PUBLIC|anon|authenticated','helper revoke drift');
must(manifest.security.entrypoint_public_execute_revoked===true,'entrypoint PUBLIC revoke missing');

must(manifest.digest.syntax==='^[0-9a-f]{64}$'&&manifest.digest.characters===64&&manifest.digest.decoded_bytes===32&&manifest.digest.storage==='text','digest contract drift');
must(manifest.digest.wire==='lowercase hexadecimal text','digest wire drift');
const statusMap={accept:'accepted',reject:'rejected',cancel:'cancelled',expire:'expired'};
must(Object.keys(manifest.mutation_map).sort().join('|')===Object.keys(statusMap).sort().join('|'),'mutation set drift');
must(Object.entries(manifest.mutation_map).every(([type,v])=>statusMap[type]===v.status&&v.lock_domain==='point4-reservation-client-tx:'),'mutation/status/global-lock mapping drift');

const normalizedDesign=design.replace(/\s+/g,' ');
for(const phrase of [
  "localStorage['sharawlaRetailReservationCreatePendingV1:<document_uid>']",
  "localStorage['sharawlaRetailReservationMutationPendingV1:<client_tx_id>']",
  'Per-command keys avoid one pending command overwriting another',
  'No `bytea` digest column is proposed','clients do not supply an authoritative digest',
  'Same TX/same digest replays; same TX/different','Group canonical sidecar lines by `product_id`',
  '`max(normalized_notes)`','canonical line digests retain each line note','does not claim per-line discount allocation',
  'check both the document creation TX and mutation TX namespaces','Looks up the TX across both document creation and mutation rows',
  'without DML','database durability begins atomically with the website order and sidecar','No read generates identity, no backfill occurs',
  'database-owned','three-pending-orders-per-phone/branch/10-minute guards',
  '`supabase-point4-reservation-identity-v1-contract.sql`','`scripts/check-point4-reservation-identity-v1-contract.js`',
  'No business/accounting decision remains'
]) has(normalizedDesign,phrase,`normative narrative missing: ${phrase}`);

has(identity,"pg_catalog.encode(extensions.digest(",'shared digest must use SHA-256 + hex encoding');
has(identity,"),'hex');",'shared digest must return hex');
has(identity,"coalesce(p_reversal_of->>'operation_digest','')!~'^[0-9a-f]{64}$'",'shared digest syntax drift');
has(identity,"'Source-only canonical economic digest. It is distinct from Offline V2 transport payload_digest",'digest separation drift');

const hashes={
  'supabase-v10-5-4-beta17-retail-market-core.sql':'dba694bb945cdf1cf4764509b654314602ce4e0a59c067182f8ca49fd62040ff',
  'supabase-v10-5-4-beta18-retail-website-integration.sql':'8ed30f2c04ed44991fd922cdaa122e2c0a7ed491ba370747cc1f82af3ae7e670',
  'supabase-v10-5-4-beta18-retail-website-integration-finalize.sql':'f4e9407e1d1bf0c385daecde2c756e497b29baa5b94d52ed83ad1d87fd97db28',
  'retail-website/app.js':'eae88ecf8013345616b824ef89adcea348b0272168f210308de1b72e0c078cd6',
  'retail-website-pos.js':'24ee3baba812b762865d9a6fbab59e88bfc5128970ba3f9c3cf420a94a65bcb9',
  'supabase-point4-stock-v2-foundation.sql':'3c81f3bb21ecf2f5e023e8601fb89556aced7b01a0a78b7b78b14af581259538',
  'supabase-point4-stock-v2-writer.sql':'799af8c8949a3131b1db883b823ba7151e2ba4216705cabf063db9f83b31659e',
  'supabase-point4-stock-v2-runtime-adapter-contract.sql':'1c6cd6270eb2993f218485df37d2b5a3ac9529319d4c4c1956153ce0ab235902',
  'supabase-point4-stock-v2-direct-routing-foundation.sql':'987d92e546eb7109ea917590187e54cc6d83504794abf77cd49670e19ebaf4a5',
  'beta45-offline-v2-native-store.js':'c29aaa53f655e39210320ed54daf68a7860b5ce15093e9475dafdb68d0e0b9c8',
  'beta45-offline-v2-inbox-store.js':'7dffc974533ddb9780f0317c88ab058932e77c6e5e0b16e8d2f68a075e1fc91c',
  'beta45-offline-v2-inventory-store.js':'47af5bcd4765cd4817c2556988d4eea4c2a2d0e25b68ca03e5d69a4fe20148f3',
  'beta45-offline-v2-sync.js':'a23c671aae1d6d26b77af56252acb0185ab331b214ea9e47b4a35b70dd65b2a5',
  'beta45-offline-v2-transport-runtime.js':'e3d9c05e533b1d5e2687cdbcd551425ee639c6ed28db8bd407d63ed48214d37b'
};
for(const [file,expected] of Object.entries(hashes))must(sha(file)===expected,`${file}: frozen-source hash drift`);
matches(batch1,/inventory_stock_runtime_adapter_activation_allowed_v2\(\)[\s\S]*?as \$\$ select false \$\$/,'Batch 1 activation is not hard-false');
matches(cutover,/inventory_stock_point4b2_concurrency_closed_v2\(\)[\s\S]*?as \$\$ select false \$\$/,'4B-2 concurrency gate is not false/open');

for(const re of [/\bcreate\s+table\b/i,/\bcreate\s+or\s+replace\s+function\b/i,/\balter\s+table\b/i,/\bcommit\s*;/i])must(!re.test(design),`design contains executable SQL: ${re}`);
const writerCall='inventory_stock_apply_'+'movement_v2(';
must(!design.includes(writerCall),'design connects Canonical Stock writer');

console.log('Point 4 Batch 4B hardened Reservation Identity V1 design checker: PASS');
console.log('Exact manifest/source/hash assertions only; no PostgreSQL runtime, deployment, or concurrency proof claimed.');
