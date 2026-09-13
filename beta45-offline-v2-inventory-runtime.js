(function(global){
'use strict';

// Sharawla Offline Engine V2 — Phase 6 inventory ledger + offline stock policy.
// Generic by item kind. Food/recipe adapters may emit server-derived movements;
// Retail/Pharmacy/Warehouse/other profiles may emit product/variant/batch/etc.
const VERSION='10.5.4-beta.51';
const POLICY_VALUES=Object.freeze(['legacy_behavior','allow_offline_oversell','warn_only','strict_cloud_stock','device_reservation_pool']);
const LEDGER_RECORD='inventory_ledger';
let installed=false;

function text(v){return String(v??'').trim()}
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function nowIso(){return new Date().toISOString()}
function runtimeBranch(){try{return num(typeof currentBranchId==='function'?currentBranchId():state?.activeBranchId)}catch{return 0}}
function runtimeBusiness(){try{return text((typeof sharawlaRuntimeConfig!=='undefined'&&sharawlaRuntimeConfig?.business_id)||state?.business?.id||JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'{}')?.business_id)}catch{return ''}}
function normalizePolicy(v){v=text(v).toLowerCase();return POLICY_VALUES.includes(v)?v:null}
function localPolicyKey(){return `sharawlaOfflineStockPolicyV2:${runtimeBusiness()||'unknown'}:${runtimeBranch()||0}`}
function configuredPolicy(){
  let cfg=null;try{cfg=JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'null')}catch{}
  const candidates=[
    typeof sharawlaRuntimeConfig!=='undefined'?sharawlaRuntimeConfig?.offline_stock_policy:null,
    cfg?.offline_stock_policy,
    state?.settings?.offline_stock_policy,
    state?.business?.offline_stock_policy,
    localStorage.getItem(localPolicyKey())
  ];
  for(const v of candidates){const p=normalizePolicy(v);if(p)return p}
  // Preserve existing business behavior until a business/profile explicitly
  // chooses an Offline V2 stock policy. Never silently impose a new default.
  return 'legacy_behavior';
}
function setLocalPolicy(mode){
  const p=normalizePolicy(mode);if(!p)throw new Error(`Offline V2 invalid stock policy: ${text(mode)}`);
  localStorage.setItem(localPolicyKey(),p);return p;
}

function movementId(tx,index){return `inv:${text(tx)}:${String(index+1).padStart(3,'0')}`}
function explicitMovements(commit,ctx){
  const p=ctx?.payload||{};
  const rows=Array.isArray(commit?.inventory_movements)?commit.inventory_movements:Array.isArray(p?.inventory_movements)?p.inventory_movements:Array.isArray(p?.p_inventory_movements)?p.p_inventory_movements:null;
  if(!rows)return null;
  return rows.map(x=>({...clone(x),source:'explicit_adapter'}));
}
function saleMovements(commit,ctx){
  const rpc=commit?.payload?.rpc_name||'';
  const p=commit?.payload?.rpc_payload||ctx?.payload||{};
  const food=/^create_food_/i.test(text(rpc));
  const out=[];
  for(const item of (Array.isArray(p?.p_items)?p.p_items:[])){
    const qty=Math.abs(num(item?.quantity));if(!(qty>0))continue;
    const kind=item?.variant_id!=null?'variant':'product';
    const id=item?.variant_id??item?.product_id;if(id==null||text(id)==='')continue;
    out.push({
      movement_type:'SALE',item_kind:kind,item_id:text(id),quantity_delta:-qty,
      unit:text(item?.unit)||null,projectable:!food,server_derived:food,
      product_id:item?.product_id??null,variant_id:item?.variant_id??null,
      source:food?'food_server_derived_intent':'direct_sale_line'
    });
  }
  return out;
}
function returnMovements(commit,ctx){
  const rpc=commit?.payload?.rpc_name||'';
  const p=commit?.payload?.rpc_payload||ctx?.payload||{};
  const food=/^create_food_/i.test(text(rpc));
  const out=[];
  for(const item of (Array.isArray(p?.p_items)?p.p_items:[])){
    const qty=Math.abs(num(item?.quantity));if(!(qty>0))continue;
    let kind='order_item',id=item?.order_item_id,projectable=false;
    if(item?.variant_id!=null){kind='variant';id=item.variant_id;projectable=!food}
    else if(item?.product_id!=null){kind='product';id=item.product_id;projectable=!food}
    if(id==null||text(id)==='')continue;
    out.push({
      movement_type:'RETURN',item_kind:kind,item_id:text(id),quantity_delta:qty,
      unit:text(item?.unit)||null,projectable,server_derived:food||kind==='order_item',
      product_id:item?.product_id??null,variant_id:item?.variant_id??null,order_item_id:item?.order_item_id??null,
      source:projectable?'direct_return_line':'server_resolved_return_intent'
    });
  }
  return out;
}
function directMovement(commit,ctx){
  const p=commit?.payload?.rpc_payload||ctx?.payload||{};
  const delta=num(p?.p_quantity_delta??p?.quantity_delta);
  const id=p?.p_variant_id??p?.variant_id??p?.p_product_id??p?.product_id??p?.p_item_id??p?.item_id;
  if(!delta||id==null)return [];
  const kind=(p?.p_variant_id??p?.variant_id)!=null?'variant':text(p?.item_kind||p?.p_item_kind)||'product';
  return [{movement_type:text(p?.p_movement_type||p?.movement_type||'ADJUSTMENT').toUpperCase(),item_kind:kind,item_id:text(id),quantity_delta:delta,unit:text(p?.unit)||null,projectable:true,server_derived:false,source:'direct_inventory_operation'}];
}
function deriveMovements(type,commit,ctx){
  const explicit=explicitMovements(commit,ctx);if(explicit)return explicit;
  if(type==='sale')return saleMovements(commit,ctx);
  if(type==='return')return returnMovements(commit,ctx);
  if(type==='inventory_movement')return directMovement(commit,ctx);
  return [];
}
function isOffline(){try{return navigator.onLine===false}catch{return false}}
function policyDecision(policy,movements){
  const decreases=movements.filter(x=>num(x.quantity_delta)<0);
  const offline=isOffline();
  if(!offline||!decreases.length)return {allowed:true,policy,offline,warning:null};
  if(policy==='strict_cloud_stock')return {allowed:false,policy,offline,code:'OFFLINE_V2_STRICT_CLOUD_STOCK_REQUIRED',message:'سياسة المخزون تتطلب التحقق من Cloud قبل خصم المخزون.'};
  if(policy==='device_reservation_pool')return {allowed:false,policy,offline,code:'OFFLINE_V2_DEVICE_RESERVATION_POOL_NOT_IMPLEMENTED',message:'Device Reservation Pool غير مفعّل في هذا الإصدار.'};
  if(policy==='warn_only')return {allowed:true,policy,offline,warning:'OFFLINE_V2_STOCK_NOT_CLOUD_VERIFIED'};
  return {allowed:true,policy,offline,warning:null};
}
function ledgerRecords(type,commit,ctx,movements,decision){
  const tx=text(commit?.client_tx_id||ctx?.clientTx),created=text(commit?.created_local_at)||text(ctx?.createdAt)||nowIso();
  return movements.map((m,i)=>({
    record_type:LEDGER_RECORD,local_id:movementId(tx,i),parent_local_id:text(commit?.local_entity_id)||null,created_local_at:created,
    payload:{
      movement_id:movementId(tx,i),client_tx_id:tx,business_id:text(commit?.business_id),branch_id:num(commit?.branch_id),device_id:text(commit?.device_id),employee_id:num(commit?.employee_id),
      movement_type:text(m.movement_type).toUpperCase(),item_kind:text(m.item_kind)||'generic',item_id:text(m.item_id),quantity_delta:num(m.quantity_delta),unit:text(m.unit)||null,
      reference_type:text(commit?.entity_type)||text(type),reference_local_id:text(commit?.local_entity_id)||null,operation_type:text(type),created_local_at:created,
      projectable:m.projectable!==false,server_derived:m.server_derived===true,source:text(m.source)||'adapter',
      product_id:m.product_id??null,variant_id:m.variant_id??null,order_item_id:m.order_item_id??null,
      policy_mode:decision.policy,policy_warning:decision.warning||null,offline_observed:decision.offline===true
    }
  }));
}
function attachInventory(type,commit,ctx){
  const movements=deriveMovements(type,commit,ctx),policy=configuredPolicy(),decision=policyDecision(policy,movements);
  if(!decision.allowed){const e=new Error(decision.message);e.code=decision.code;e.kind='stock_policy';e.policy=policy;throw e}
  if(!movements.length)return commit;
  const records=ledgerRecords(type,commit,ctx,movements,decision);
  commit.records=[...(Array.isArray(commit.records)?commit.records:[]),...records];
  commit.inventory_policy={mode:policy,offline_observed:decision.offline===true,warning:decision.warning||null,movement_count:records.length};
  return commit;
}
function wrapAdapter(type,adapter){
  if(!adapter||typeof adapter.buildCommit!=='function'||adapter.__offlineV2InventoryWrapped)return adapter;
  const base=adapter.buildCommit;
  adapter.buildCommit=function(ctx){return attachInventory(text(type),base(ctx),ctx)};
  adapter.__offlineV2InventoryWrapped=true;
  return adapter;
}
function installAdapterWrapper(){
  if(installed)return true;
  const base=global.SharawlaOfflineV2Takeover;if(!base?.registerOperation)return false;
  const wrapped={...base,registerOperation(type,adapter){return base.registerOperation(type,wrapAdapter(type,adapter))}};
  global.SharawlaOfflineV2Takeover=Object.freeze(wrapped);installed=true;return true;
}
function start(){
  if(!installAdapterWrapper())return setTimeout(start,40);
  global.SharawlaOfflineV2Inventory=Object.freeze({version:VERSION,policies:POLICY_VALUES,policy:configuredPolicy,setLocalPolicy,deriveMovements,policyDecision,attachInventory});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
