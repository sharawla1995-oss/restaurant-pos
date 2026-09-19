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
const sha=f=>crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n'))
  .digest('hex');

const sql=read('supabase-point4-reservation-identity-v1-contract.sql');
const design=read('docs/POINT4-BATCH4B-RESERVATION-IDENTITY-V1-DESIGN.md');
const batch1=read('supabase-point4-stock-v2-runtime-adapter-contract.sql');
const cutover=read('supabase-point4-stock-v2-controlled-cutover.sql');

const manifestMatch=design.match(/CONTRACT_MANIFEST_BEGIN[\s\S]*?```json\s*([\s\S]*?)\s*```[\s\S]*?CONTRACT_MANIFEST_END/);
must(manifestMatch,'normative contract manifest missing');
let manifest;
try{manifest=JSON.parse(manifestMatch[1])}catch(e){fail(`invalid contract manifest JSON: ${e.message}`)}
must(crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex')==='53006ef7672c7cd9534697752e34b234a3ba3af7f4e8ec19e4eaa29b764c1198','normative manifest exact-content drift');

has(sql,'begin;','transaction BEGIN missing');
must(
  (sql.match(/^commit;$/gm)||[]).length===1,
  'expected exactly one COMMIT'
);

for(const table of [
  'public.retail_reservation_documents_identity_v1',
  'public.retail_reservation_lines_identity_v1',
  'public.retail_reservation_mutations_identity_v1'
]){
  has(sql,`create table ${table}`,`${table}: table missing`);
  has(sql,`alter table ${table}`,`${table}: RLS ALTER missing`);
}

for(const name of [
  'retail_reservation_documents_identity_v1_pkey',
  'retail_reservation_documents_identity_v1_website_order_fkey',
  'retail_reservation_documents_identity_v1_website_order_key',
  'retail_reservation_documents_identity_v1_document_uid_key',
  'retail_reservation_documents_identity_v1_source_document_key',
  'retail_reservation_documents_identity_v1_creation_tx_key',
  'retail_reservation_documents_identity_v1_digest_check',
  'retail_reservation_documents_identity_v1_version_check',
  'retail_reservation_lines_identity_v1_pkey',
  'retail_reservation_lines_identity_v1_document_fkey',
  'retail_reservation_lines_identity_v1_product_fkey',
  'retail_reservation_lines_identity_v1_line_uid_key',
  'retail_reservation_lines_identity_v1_effect_key',
  'retail_reservation_lines_identity_v1_quantity_check',
  'retail_reservation_lines_identity_v1_effect_format_check',
  'retail_reservation_lines_identity_v1_digest_check',
  'retail_reservation_mutations_identity_v1_pkey',
  'retail_reservation_mutations_identity_v1_document_fkey',
  'retail_reservation_mutations_identity_v1_employee_fkey',
  'retail_reservation_mutations_identity_v1_client_tx_key',
  'retail_reservation_mutations_identity_v1_digest_check',
  'retail_reservation_mutations_identity_v1_type_status_check',
  'retail_reservation_mutations_identity_v1_actor_check',
  'retail_reservation_mutations_identity_v1_result_check',
  'retail_reservation_mutations_identity_v1_result_status_check'
]) has(sql,name,`constraint missing: ${name}`);

for(const name of [
  'retail_reservation_documents_identity_v1_created_idx',
  'retail_reservation_lines_identity_v1_document_product_idx',
  'retail_reservation_mutations_identity_v1_document_recorded_idx',
  'retail_reservation_mutations_identity_v1_one_expiry_idx'
]) has(sql,name,`index missing: ${name}`);

for(const trigger of [
  'retail_reservation_documents_identity_v1_immutable',
  'retail_reservation_lines_identity_v1_immutable',
  'retail_reservation_mutations_identity_v1_guard'
]) has(sql,`create trigger ${trigger}`,`trigger missing: ${trigger}`);

const functions=[
  'public.retail_reservation_identity_immutable_v1()',
  'public.retail_reservation_mutation_guard_v1()',
  'public.retail_reservation_identity_digest_v1(',
  'public.retail_reservation_identity_resolve_mutation_v1(',
  'public.retail_reservation_identity_assert_projection_v1(',
  'public.retail_create_website_order_identity_v1(',
  'public.accept_retail_website_order_identity_v1(',
  'public.reject_retail_website_order_identity_v1(',
  'public.cancel_retail_website_order_customer_identity_v1(',
  'public.expire_retail_website_order_identity_v1('
];

for(const fn of functions){
  has(sql,`create or replace function ${fn}`,`function missing: ${fn}`);
}

must(
  (sql.match(/^create or replace function /gm)||[]).length===10,
  'unexpected Reservation Identity V1 function count'
);

must(
  (sql.match(/^\$\$;$/gm)||[]).length===10,
  'function body terminator count mismatch'
);

for(const rpc of [
  /create or replace function public\.retail_create_website_order_identity_v1\(\s*p_identity_envelope jsonb\s*\)\s*returns jsonb[\s\S]*?security definer[\s\S]*?set search_path=''/,
  /create or replace function public\.accept_retail_website_order_identity_v1\(\s*p_document_uid text,\s*p_client_tx_id text\s*\)\s*returns jsonb[\s\S]*?security definer[\s\S]*?set search_path=''/,
  /create or replace function public\.reject_retail_website_order_identity_v1\(\s*p_document_uid text,\s*p_client_tx_id text,\s*p_reason text\s*\)\s*returns jsonb[\s\S]*?security definer[\s\S]*?set search_path=''/,
  /create or replace function public\.cancel_retail_website_order_customer_identity_v1\(\s*p_document_uid text,\s*p_client_tx_id text,\s*p_customer_phone text\s*\)\s*returns jsonb[\s\S]*?security definer[\s\S]*?set search_path=''/,
  /create or replace function public\.expire_retail_website_order_identity_v1\(\s*p_document_uid text\s*\)\s*returns jsonb[\s\S]*?security definer[\s\S]*?set search_path=''/
]){
  matches(sql,rpc,'RPC signature/security contract drift');
}
matches(sql,/point4_identity_source_document_id_v1(s*'stock_reservation',s*'uuid:'||v_document_uid,s*trues*)/,'create source_document_id must use canonical uuid: document identity');

for(const fragment of [
  "'sharawla.point4.identity.v1'",
  "'^[0-9a-f]{64}$'",
  "'uuid:'||v_document_uid",
  "public.point4_identity_uuid_v4_v1(p_client_tx_id)",
  "public.point4_identity_uuid_v4_v1(p_document_uid)",
  "public.point4_identity_canonical_lines_v1(v_lines)",
  "extensions.digest(",
  "'sha256'",
  "'hex'"
]) has(sql,fragment,`digest contract missing: ${fragment}`);

for(const op of ['create','accept','reject','cancel','expire']){
  has(sql,`'${op}'`,`operation missing: ${op}`);
}

has(
  sql,
  "p_intent,array['reservation_expires_at']",
  'expiry stored-evidence allowlist missing'
);

has(
  sql,
  "'reservation_expires_at',p_intent->'reservation_expires_at'",
  'expiry evidence missing from canonical digest'
);

must(
  (sql.match(/elsif v_operation='expire' then/g)||[]).length===1,
  'expire digest branch must exist exactly once'
);

for(const key of [
  'point4-reservation-client-tx:',
  'point4-reservation-document:'
]) has(sql,key,`advisory lock domain missing: ${key}`);

has(
  sql,
  'RETAIL_RESERVATION_IDENTITY_V1_IDEMPOTENCY_CONFLICT',
  'idempotency conflict contract missing'
);

has(
  sql,
  'from public.retail_reservation_documents_identity_v1',
  'creation TX namespace lookup missing'
);

has(
  sql,
  'from public.retail_reservation_mutations_identity_v1',
  'mutation TX namespace lookup missing'
);

has(
  sql,
  'retail_reservation_identity_assert_projection_v1(v_document.id)',
  'projection assertion missing from create transaction'
);

for(const fragment of [
  'group by l.product_id',
  'group by i.product_id',
  'round(sum(l.quantity),3)::numeric(14,3)',
  'round(sum(i.quantity),3)::numeric(14,3)',
  'max(l.normalized_notes)',
  'max(i.notes)'
]) has(sql,fragment,`duplicate-product projection contract missing: ${fragment}`);

has(
  sql,
  'insert into public.retail_reservation_lines_identity_v1',
  'lossless sidecar line insert missing'
);

has(
  sql,
  'insert into public.retail_website_order_items',
  'Legacy aggregate item projection missing'
);

has(
  sql,
  'insert into public.retail_stock_reservations',
  'Legacy reservation projection missing'
);

for(const type of ['accept','reject','cancel','expire']){
  matches(
    sql,
    new RegExp(
      "insert into public\\.retail_reservation_mutations_identity_v1\\([\\s\\S]*?"+
      `'${type}'`
    ),
    `${type}: durable mutation row missing`
  );
}

for(const status of ['accepted','rejected','cancelled','expired']){
  has(
    sql,
    `result_status='${status}'`,
    `${status}: durable result missing`
  );
}

has(
  sql,
  'v_client_tx_id:=extensions.gen_random_uuid()::text;',
  'DB-owned expiry TX generation missing'
);

matches(sql,/from public\.retail_reservation_mutations_identity_v1[\s\S]*?where reservation_document_id=v_document\.id[\s\S]*?and mutation_type='expire'/,'durable expiry replay lookup missing');

has(
  sql,
  "where mutation_type = 'expire'",
  'unique expiry index predicate missing'
);


for(const table of [
  'public.retail_reservation_documents_identity_v1',
  'public.retail_reservation_lines_identity_v1',
  'public.retail_reservation_mutations_identity_v1'
]){
  matches(
    sql,
    new RegExp(
      `alter table ${table.replace(/\./g,'\\.')}\\s+enable row level security;`
    ),
    `${table}: RLS not enabled`
  );

  matches(
    sql,
    new RegExp(
      `revoke insert, update, delete\\s+on ${table.replace(/\./g,'\\.')}\\s+from public, anon, authenticated;`
    ),
    `${table}: direct mutation revoke missing`
  );
}

for(const policy of [
  'retail_reservation_documents_identity_v1_staff_select',
  'retail_reservation_lines_identity_v1_staff_select',
  'retail_reservation_mutations_identity_v1_staff_select'
]){
  has(sql,`create policy ${policy}`,`policy missing: ${policy}`);
}

must(
  (sql.match(/public\.has_branch_access\(w\.branch_id\)/g)||[]).length===3,
  'all three staff SELECT policies must enforce branch access'
);

for(const helper of [
  'public.retail_reservation_identity_immutable_v1()',
  'public.retail_reservation_mutation_guard_v1()',
  'public.retail_reservation_identity_digest_v1(',
  'public.retail_reservation_identity_resolve_mutation_v1(',
  'public.retail_reservation_identity_assert_projection_v1('
]){
  const pos=sql.indexOf(`revoke execute\non function ${helper}`);
  must(pos>=0,`helper EXECUTE revoke missing: ${helper}`);
}

for(const grant of [
  /grant execute\s+on function public\.retail_create_website_order_identity_v1\(jsonb\)\s+to anon, authenticated;/,
  /grant execute\s+on function public\.accept_retail_website_order_identity_v1\(text,text\)\s+to authenticated;/,
  /grant execute\s+on function public\.reject_retail_website_order_identity_v1\(text,text,text\)\s+to authenticated;/,
  /grant execute\s+on function public\.cancel_retail_website_order_customer_identity_v1\(\s*text,text,text\s*\)\s+to anon, authenticated;/
]){
  matches(sql,grant,'entrypoint grant contract drift');
}

must(
  !/grant execute\s+on function public\.expire_retail_website_order_identity_v1\(text\)/.test(sql),
  'expiry RPC must remain internal-only'
);

for(const rpc of [
  'public.retail_create_website_order_identity_v1(jsonb)',
  'public.accept_retail_website_order_identity_v1(text,text)',
  'public.reject_retail_website_order_identity_v1(text,text,text)',
  'public.cancel_retail_website_order_customer_identity_v1(',
  'public.expire_retail_website_order_identity_v1(text)'
]){
  has(
    sql,
    `revoke execute\non function ${rpc}`,
    `entrypoint revoke missing: ${rpc}`
  );
}

const hashes={
  'supabase-v10-5-4-beta17-retail-market-core.sql':
    'dba694bb945cdf1cf4764509b654314602ce4e0a59c067182f8ca49fd62040ff',
  'supabase-v10-5-4-beta18-retail-website-integration.sql':
    '8ed30f2c04ed44991fd922cdaa122e2c0a7ed491ba370747cc1f82af3ae7e670',
  'supabase-v10-5-4-beta18-retail-website-integration-finalize.sql':
    'f4e9407e1d1bf0c385daecde2c756e497b29baa5b94d52ed83ad1d87fd97db28',
  'retail-website/app.js':
    'eae88ecf8013345616b824ef89adcea348b0272168f210308de1b72e0c078cd6',
  'retail-website-pos.js':
    '24ee3baba812b762865d9a6fbab59e88bfc5128970ba3f9c3cf420a94a65bcb9',
  'supabase-point4-stock-v2-foundation.sql':
    '3c81f3bb21ecf2f5e023e8601fb89556aced7b01a0a78b7b78b14af581259538',
  'supabase-point4-stock-v2-writer.sql':
    '799af8c8949a3131b1db883b823ba7151e2ba4216705cabf063db9f83b31659e',
  'supabase-point4-stock-v2-runtime-adapter-contract.sql':
    '1c6cd6270eb2993f218485df37d2b5a3ac9529319d4c4c1956153ce0ab235902',
  'supabase-point4-stock-v2-direct-routing-foundation.sql':
    '987d92e546eb7109ea917590187e54cc6d83504794abf77cd49670e19ebaf4a5',
  'beta45-offline-v2-native-store.js':
    'c29aaa53f655e39210320ed54daf68a7860b5ce15093e9475dafdb68d0e0b9c8',
  'beta45-offline-v2-inbox-store.js':
    '7dffc974533ddb9780f0317c88ab058932e77c6e5e0b16e8d2f68a075e1fc91c',
  'beta45-offline-v2-inventory-store.js':
    '47af5bcd4765cd4817c2556988d4eea4c2a2d0e25b68ca03e5d69a4fe20148f3',
  'beta45-offline-v2-sync.js':
    'a23c671aae1d6d26b77af56252acb0185ab331b214ea9e47b4a35b70dd65b2a5',
  'beta45-offline-v2-transport-runtime.js':
    'e3d9c05e533b1d5e2687cdbcd551425ee639c6ed28db8bd407d63ed48214d37b'
};

for(const [file,expected] of Object.entries(hashes)){
  must(sha(file)===expected,`${file}: frozen-source hash drift`);
}

matches(
  batch1,
  /inventory_stock_runtime_adapter_activation_allowed_v2\(\)[\s\S]*?as \$\$ select false \$\$/,
  'Batch 1 activation is not hard-false'
);

matches(
  cutover,
  /inventory_stock_point4b2_concurrency_closed_v2\(\)[\s\S]*?as \$\$ select false \$\$/,
  '4B-2 genuine concurrency gate is not false/open'
);

const forbidden=[
  'inventory_stock_apply_'+'movement_v2(',
  'inventory_stock_runtime_adapter_activation_allowed_v2() is true',
  'inventory_stock_point4b2_concurrency_closed_v2() is true'
];

for(const fragment of forbidden){
  must(!sql.includes(fragment),`forbidden activation/writer connection: ${fragment}`);
}

for(const phrase of [
  'Source implementation only.',
  'Canonical Stock remains inactive.'
]){
  has(sql,phrase,`source-only boundary missing: ${phrase}`);
}

console.log('Point 4 Batch 4C-1 Reservation Identity V1 source contract checker: PASS');
console.log('Static/source assertions only; no deployment, PostgreSQL runtime, or genuine committed-concurrency proof claimed.');