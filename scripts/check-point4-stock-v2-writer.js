'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase-point4-stock-v2-writer.sql'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

function has(token,message){assert(sql.includes(token),message||`missing: ${token}`);}
function before(a,b,message){assert(sql.indexOf(a)>=0&&sql.indexOf(a)<sql.indexOf(b),message||`${a} must precede ${b}`);}

for(const token of [
  'average_unit_cost_after numeric(18,4) not null',
  'last_unit_cost_after numeric(18,4) not null',
  'balance_version_after bigint not null',
  'create or replace function public.inventory_stock_apply_movement_v2(',
  'security definer',
  "set search_path=''",
  'extensions.digest(',
  'pg_catalog.encode(',
  "'digest_schema_version',1",
  'public.inventory_stock_resolve_idempotency_v2(',
  'on conflict(location_id,item_kind,item_id) do nothing',
  'for update;',
  "raise exception 'INVENTORY_STOCK_V2_TRACKING_DISABLED'",
  "raise exception 'INVENTORY_STOCK_V2_TRACKING_BLOCKED'",
  "raise exception 'INVENTORY_STOCK_V2_INSUFFICIENT_AVAILABLE'",
  "raise exception 'INVENTORY_STOCK_V2_NO_EFFECT'",
  "raise exception 'INVENTORY_STOCK_V2_OPENING_REQUIRES_NEW_IDENTITY'",
  "raise exception 'INVENTORY_STOCK_V2_ADJUSTMENT_COST_RULE_REQUIRED'",
  'v_unit_cost:=v_balance.average_unit_cost',
  'v_average_after:=round(',
  'v_version_after:=v_balance.balance_version+1',
  'v_average_after,v_last_after,v_version_after',
  'v_quantity_delta:=-v_original.quantity_delta',
  'v_reserved_delta:=-v_original.reserved_quantity_delta',
  'v_value_delta:=case when v_original.value_delta is null then null else -v_original.value_delta end',
  'revoke all on function public.inventory_stock_apply_movement_v2('
])has(token);

has(') from public,anon,authenticated;','writer must not be client executable');
assert(!/grant\s+execute\s+on\s+function\s+public\.inventory_stock_apply_movement_v2/i.test(sql),'generic client mutation RPC grant detected');

const digestBody=sql.match(/v_digest_payload:=jsonb_build_object\([\s\S]*?\n  \);/)?.[0]||'';
for(const token of [
  'digest_schema_version','client_tx_id','line_key','location_id','item_kind','item_id',
  'movement_type','source_document_type','source_document_id','counterparty_location_id',
  'reversal_of_movement_id','canonical_quantity_input','canonical_reserved_quantity_input',
  'canonical_unit_cost_input','stocktake_target_quantity'
])assert(digestBody.includes(`'${token}'`),`digest field missing: ${token}`);
for(const forbidden of [
  'occurred_at','expected_balance_version','metadata','employee_id','device_id','recorded_at',
  'policy_code','policy_version','quantity_delta','value_delta','quantity_on_hand_after',
  'average_unit_cost_after','last_unit_cost_after','balance_version_after'
])assert(!digestBody.includes(`'${forbidden}'`),`mutable/derived digest field detected: ${forbidden}`);

before('from public.inventory_stock_resolve_idempotency_v2(',"if jsonb_typeof(v_metadata)<>'object'",'replay must precede mutable retry validation');
before('from public.inventory_stock_resolve_idempotency_v2(','insert into public.inventory_stock_balances_v2','replay must precede balance creation');
before('if v_idempotency.reuse_existing then','p_expected_balance_version is not null','replay must precede version validation');
before('for update;','v_quantity_delta:=round(v_stocktake_target-v_balance.quantity_on_hand,3)','stocktake delta must be derived after row lock');
before('insert into public.inventory_stock_movements_v2(','update public.inventory_stock_balances_v2','movement append must precede balance update in one transaction');

for(const movement of [
  'opening','adjustment','waste','damage','stocktake','reservation','reservation_release',
  'sale','sale_return','purchase_receive','purchase_return','transfer_out','transfer_in','reversal'
])assert(sql.includes(`'${movement}'`),`movement primitive missing: ${movement}`);

for(const token of [
  "v_quantity_input is null or v_quantity_delta<=0 or v_reserved_delta<>0",
  "v_quantity_input is null or v_quantity_delta>=0 or v_reserved_delta<>0",
  "v_quantity_input is null or v_quantity_delta>=0 or v_reserved_delta>0",
  'v_reserved_delta<v_quantity_delta',
  "coalesce(v_quantity_input,0)<>0 or v_reserved_delta<=0",
  "coalesce(v_quantity_input,0)<>0 or v_reserved_delta>=0",
  'v_stocktake_target is null or v_stocktake_target<0',
  "raise exception 'INVENTORY_STOCK_V2_STOCKTAKE_COST_RULE_REQUIRED'",
  "raise exception 'INVENTORY_STOCK_V2_RESERVATION_UNDERFLOW'"
])has(token,`movement sign/delta rule missing: ${token}`);

has("v_quantity_delta:=round(v_stocktake_target-v_balance.quantity_on_hand,3)",'stocktake target is not authoritative');
has('if not v_balance_created or exists(','opening is not restricted to a new identity');
has('if v_balance.quantity_on_hand<0 then','negative cost basis must fail closed');
has('if v_quantity_after<=0 then\n    v_average_after:=v_balance.average_unit_cost','average cost must be preserved at zero');
has("if v_movement_type in ('purchase_receive','transfer_in') then\n      v_last_after:=v_unit_cost",'last cost qualification missing');
has("select * into v_original\n    from public.inventory_stock_movements_v2 m",'reversal must derive from immutable original');
has('v_counterparty_location_id:=v_original.counterparty_location_id','reversal counterparty must derive from original');

for(const legacy of [
  'retail_inventory_balances','retail_inventory_movements',
  'retail_variant_inventory_balances','retail_variant_inventory_movements',
  'ingredient_stock','food_ingredient_adjustment_events','inventory_supply_requests'
])assert(!sql.includes(legacy),`writer must not connect existing operational owner: ${legacy}`);

const approvedV2Files=new Set([
  'supabase-point4-stock-v2-foundation.sql',
  'supabase-point4-stock-v2-writer.sql'
]);
for(const name of fs.readdirSync(root)){
  if(!/\.(?:js|sql)$/.test(name)||approvedV2Files.has(name))continue;
  const body=fs.readFileSync(path.join(root,name),'utf8');
  assert(!/\b(?:insert\s+into|update|delete\s+from)\s+public\.inventory_stock_(?:balances|movements)_v2\b/i.test(body),`operational V2 writer connected outside canonical boundary: ${name}`);
  assert(!/inventory_stock_apply_movement_v2\s*\(/i.test(body),`operational workflow connected to canonical writer: ${name}`);
}

assert(pkg.scripts&&pkg.scripts['check:point4-stock-v2-writer']==='node scripts/check-point4-stock-v2-writer.js','Point 4B-2 dedicated gate missing');

console.log('Point 4B-2 canonical stock writer static check passed.');
