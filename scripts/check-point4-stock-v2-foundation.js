'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase-point4-stock-v2-foundation.sql'),'utf8');
const locationFoundation=fs.readFileSync(path.join(root,'supabase-beta55-central-warehouse-foundation.sql'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

function has(token,message){assert(sql.includes(token),message||`missing: ${token}`);}

has('create table if not exists public.inventory_stock_balances_v2');
has('primary key (location_id,item_kind,item_id)');
has("item_kind in ('product','variant','ingredient')");
has('generated always as (quantity_on_hand - quantity_reserved) stored');
has('allow_negative_stock boolean not null default false');
has('constraint inventory_stock_balances_v2_negative_policy_check');
has('create table if not exists public.inventory_stock_movements_v2');
has('unique (client_tx_id,line_key)');
has("operation_digest ~ '^[0-9a-f]{64}$'");
has('reserved_quantity_delta numeric(18,3) not null default 0');
has('source_document_type text not null');
has('counterparty_location_id bigint references public.branches(id)');
has('reversal_of_movement_id bigint');
has('allow_negative_stock_applied boolean not null default false');
has('check (allow_negative_stock_applied or quantity_on_hand_after >= quantity_reserved_after)');
has('create trigger inventory_stock_movements_v2_immutable');
has("raise exception 'INVENTORY_STOCK_V2_LEDGER_IMMUTABLE'");
has('create or replace function public.inventory_stock_resolve_idempotency_v2');
has("hashtextextended('inventory-stock-v2:'||v_client_tx_id||':'||v_line_key,0)");
has("raise exception 'INVENTORY_STOCK_V2_IDEMPOTENCY_CONFLICT'");
has('return query select v_existing.id,true');
has('create or replace function public.inventory_stock_resolve_policy_v2');
has("return query select false,'fail_closed'::text,1,'default_fail_closed'::text");
has('alter table public.inventory_stock_balances_v2 enable row level security');
has('alter table public.inventory_stock_movements_v2 enable row level security');
has('using (public.has_branch_access(location_id))');
has('revoke all on public.inventory_stock_balances_v2 from anon,authenticated');
has('revoke all on public.inventory_stock_movements_v2 from anon,authenticated');
has('grant select on public.inventory_stock_balances_v2 to authenticated');
has('grant select on public.inventory_stock_movements_v2 to authenticated');

const identityBody=sql.match(/create or replace function public\.inventory_stock_validate_item_v2\(\)[\s\S]*?\n\$\$;/)?.[0]||'';
for(const token of [
  "pv.id=new.item_id and pv.is_stock_unit=true",
  "raise exception 'INVENTORY_STOCK_V2_VARIANT_NOT_STOCK_UNIT'",
  "pv.product_id=new.item_id and pv.is_stock_unit=true",
  "raise exception 'INVENTORY_STOCK_V2_PRODUCT_HAS_STOCK_VARIANTS'",
  "raise exception 'INVENTORY_STOCK_V2_COMPETING_PRODUCT_OWNERSHIP'"
])assert(identityBody.includes(token),`polymorphic identity protection missing: ${token}`);

for(const token of [
  'create trigger inventory_stock_products_delete_guard_v2\nbefore delete on public.products',
  'create trigger inventory_stock_variants_delete_guard_v2\nbefore delete on public.product_variants',
  'create trigger inventory_stock_ingredients_delete_guard_v2\nbefore delete on public.ingredients',
  "b.item_kind=v_kind and b.item_id=old.id",
  "m.item_kind=v_kind and m.item_id=old.id",
  "raise exception 'INVENTORY_STOCK_V2_SOURCE_IDENTITY_REFERENCED'",
  'create trigger inventory_stock_variant_identity_guard_v2',
  "raise exception 'INVENTORY_STOCK_V2_VARIANT_IDENTITY_REFERENCED'"
])has(token,`source identity lifecycle protection missing: ${token}`);

const reversalBody=sql.match(/create or replace function public\.inventory_stock_reversal_validate_v2\(\)[\s\S]*?\n\$\$;/)?.[0]||'';
for(const token of [
  'for update',
  "raise exception 'INVENTORY_STOCK_V2_REVERSAL_SOURCE_NOT_FOUND'",
  "raise exception 'INVENTORY_STOCK_V2_REVERSAL_OF_REVERSAL'",
  'new.location_id<>v_original.location_id',
  'new.item_kind<>v_original.item_kind',
  'new.item_id<>v_original.item_id',
  'new.quantity_delta<>-v_original.quantity_delta',
  'new.reserved_quantity_delta<>-v_original.reserved_quantity_delta',
  '(new.value_delta is null)<>(v_original.value_delta is null)',
  'new.value_delta<>-v_original.value_delta'
])assert(reversalBody.includes(token),`reversal protection missing: ${token}`);
has('create trigger inventory_stock_movements_v2_reversal_validate');
has('create unique index if not exists inventory_stock_movements_v2_reversal_uidx');

function identityDecision({kind,exists=true,isStockUnit=false,parentHasStockUnit=false,parentReferenced=false}){
  if(!exists)throw new Error('NOT_FOUND');
  if(kind==='variant'&&!isStockUnit)throw new Error('VARIANT_NOT_STOCK_UNIT');
  if(kind==='product'&&parentHasStockUnit)throw new Error('PRODUCT_HAS_STOCK_VARIANTS');
  if(kind==='variant'&&parentReferenced)throw new Error('COMPETING_PRODUCT_OWNERSHIP');
  return true;
}
assert.throws(()=>identityDecision({kind:'variant',isStockUnit:false}),/VARIANT_NOT_STOCK_UNIT/);
assert.throws(()=>identityDecision({kind:'product',parentHasStockUnit:true}),/PRODUCT_HAS_STOCK_VARIANTS/);
assert.throws(()=>identityDecision({kind:'variant',isStockUnit:true,parentReferenced:true}),/COMPETING_PRODUCT_OWNERSHIP/);

function sourceDeleteDecision({kind,balanceReference=false,movementReference=false,dependentVariantReference=false}){
  if(!['product','variant','ingredient'].includes(kind))throw new Error('INVALID_SOURCE_GUARD');
  if(balanceReference||movementReference||(kind==='product'&&dependentVariantReference))throw new Error('SOURCE_IDENTITY_REFERENCED');
  return true;
}
assert.throws(()=>sourceDeleteDecision({kind:'product',balanceReference:true}),/SOURCE_IDENTITY_REFERENCED/);
assert.throws(()=>sourceDeleteDecision({kind:'variant',movementReference:true}),/SOURCE_IDENTITY_REFERENCED/);
assert.throws(()=>sourceDeleteDecision({kind:'ingredient',balanceReference:true}),/SOURCE_IDENTITY_REFERENCED/);
assert.throws(()=>sourceDeleteDecision({kind:'product',dependentVariantReference:true}),/SOURCE_IDENTITY_REFERENCED/);
assert.strictEqual(sourceDeleteDecision({kind:'ingredient'}),true);

function reversalDecision(original,reversal){
  if(original.movementType==='reversal'||original.reversalOf!=null)throw new Error('REVERSAL_OF_REVERSAL');
  if(reversal.location!==original.location||reversal.kind!==original.kind||reversal.item!==original.item)throw new Error('IDENTITY_MISMATCH');
  if(reversal.quantity!==-original.quantity)throw new Error('QUANTITY_MISMATCH');
  if(reversal.reserved!==-original.reserved)throw new Error('RESERVATION_MISMATCH');
  const oneNull=(reversal.value==null)!==(original.value==null);
  if(oneNull||(reversal.value!=null&&reversal.value!==-original.value))throw new Error('VALUE_MISMATCH');
  return true;
}
const original={movementType:'sale',reversalOf:null,location:1,kind:'product',item:7,quantity:-2,reserved:0,value:-20};
assert.throws(()=>reversalDecision({...original,movementType:'reversal'},{location:1,kind:'product',item:7,quantity:2,reserved:0,value:20}),/REVERSAL_OF_REVERSAL/);
assert.throws(()=>reversalDecision(original,{location:2,kind:'product',item:7,quantity:2,reserved:0,value:20}),/IDENTITY_MISMATCH/);
assert.throws(()=>reversalDecision(original,{location:1,kind:'variant',item:7,quantity:2,reserved:0,value:20}),/IDENTITY_MISMATCH/);
assert.throws(()=>reversalDecision(original,{location:1,kind:'product',item:8,quantity:2,reserved:0,value:20}),/IDENTITY_MISMATCH/);
assert.throws(()=>reversalDecision(original,{location:1,kind:'product',item:7,quantity:1,reserved:0,value:20}),/QUANTITY_MISMATCH/);
assert.throws(()=>reversalDecision({...original,reserved:-2},{location:1,kind:'product',item:7,quantity:2,reserved:1,value:20}),/RESERVATION_MISMATCH/);
assert.throws(()=>reversalDecision(original,{location:1,kind:'product',item:7,quantity:2,reserved:0,value:19}),/VALUE_MISMATCH/);
assert.throws(()=>reversalDecision({...original,value:null},{location:1,kind:'product',item:7,quantity:2,reserved:0,value:20}),/VALUE_MISMATCH/);
assert.strictEqual(reversalDecision({...original,value:null},{location:1,kind:'product',item:7,quantity:2,reserved:0,value:null}),true);
assert.strictEqual(reversalDecision(original,{location:1,kind:'product',item:7,quantity:2,reserved:0,value:20}),true);

assert(locationFoundation.includes("add column if not exists location_type text not null default 'branch'"),'branches.location_type canonical location contract missing');
assert(locationFoundation.includes("check (location_type in ('branch','central_warehouse'))"),'canonical location types are not constrained');

assert(!/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.warehouses\b/i.test(sql),'standalone warehouses entity is forbidden');
for(const legacy of [
  'retail_inventory_balances','retail_inventory_movements',
  'retail_variant_inventory_balances','retail_variant_inventory_movements',
  'ingredient_stock','food_ingredient_adjustment_events'
])assert(!sql.includes(legacy),`foundation must not touch legacy stock owner: ${legacy}`);
assert(!/grant\s+(?:insert|update|delete|all)[^;]*\s+to\s+(?:anon|authenticated)/i.test(sql),'client write grant detected');
assert(!/\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:inventory_supply|retail_|ingredient_stock|food_)/i.test(sql),'existing operational writer mutation detected');

const gate='node scripts/check-point4-stock-v2-foundation.js';
assert(pkg.scripts&&typeof pkg.scripts.check==='string'&&pkg.scripts.check.includes(gate),'Point 4B-1 gate missing from scripts.check');

console.log('Point 4B-1 canonical location + stock V2 foundation static check passed.');
