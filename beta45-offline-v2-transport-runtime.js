(function(global){
'use strict';

// Sharawla Offline Engine V2 — Phase 5 renderer bridge.
// Once controlled takeover is active, mapped operational RPCs use the V2
// outbox/explicit-ACK transport as their only network authority. Inactive mode
// delegates unchanged to the protected Phase 4/legacy runtime.
const VERSION='10.5.4-beta.58.32';
const CONNECTION_KEY='sharawlaBusinessConnectionV1';
const FALLBACK_CONTEXT_MS=30_000;
const POS_PROFILES=new Set(['restaurant','retail','pharmacy','service','warehouse','membership','logistics']);
const OFFLINE_COMMERCE_PROFILES=new Set(['restaurant','retail']);
const adaptersByType=new Map();
const typeByRpc=new Map();
const fallbackByType=new Map();
let syncing=false,timer=null,bridge=null,installed=false;

function text(v){return String(v??'').trim()}
function num(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v))}
function nowIso(){return new Date().toISOString()}
function uid(){try{return typeof uuid==='function'?uuid():crypto.randomUUID()}catch{return `${Date.now()}-${Math.random().toString(16).slice(2)}`}}
const POINT4_UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function point4IdentityError(code){const e=new Error(code);e.code=code;return e}
function assertPoint4Uuid(value){const v=text(value);if(v!==v.toLowerCase()||!POINT4_UUID_V4.test(v))throw point4IdentityError('POINT4_IDENTITY_UUID_V4_REQUIRED');return v}
function assertPoint4Lines(type,items){const seen=new Set();for(const item of items||[]){const line=assertPoint4Uuid(item?.line_uid),expected=`v1:stock:${type==='return'?'sale_return':'sale'}:${line}`;if(text(item?.effect_line_key)!==expected)throw point4IdentityError('POINT4_IDENTITY_EFFECT_LINE_KEY_INVALID');if(seen.has(line))throw point4IdentityError('POINT4_IDENTITY_DUPLICATE_LINE_UID');seen.add(line)}if(!seen.size)throw point4IdentityError('POINT4_IDENTITY_LINES_REQUIRED')}
function assertPoint4Payload(type,payload){const rawTx=text(type==='sale'?payload?.p_order?.client_tx_id:payload?.p_client_tx_id),items=payload?.p_items||[],hasIdentity=type==='sale'?[payload?.p_order?.document_uid,payload?.p_order?.source_document_id,payload?.p_order?.point4_identity_contract,...items.flatMap(x=>[x?.line_uid,x?.effect_line_key])].some(Boolean):items.some(x=>x?.line_uid||x?.effect_line_key||x?.source_document_id||x?.original_source_document_id);if(!hasIdentity){if(!rawTx)throw point4IdentityError('OFFLINE_V2_CLIENT_TX_REQUIRED');return{tx:rawTx,classification:'LEGACY_COMPAT'}}const tx=assertPoint4Uuid(rawTx);if(type==='sale'){const doc=assertPoint4Uuid(payload?.p_order?.document_uid);if(payload?.p_order?.source_document_id!==`uuid:${doc}`||payload?.p_order?.point4_identity_contract!=='sharawla.point4.identity.v1')throw point4IdentityError('POINT4_IDENTITY_SALE_DOCUMENT_INVALID')}else{const source=new Set(items.map(x=>text(x?.source_document_id))),original=new Set(items.map(x=>text(x?.original_source_document_id))),originalId=[...original][0];if(source.size!==1||![...source][0].startsWith('uuid:')||!POINT4_UUID_V4.test([...source][0].slice(5)))throw point4IdentityError('POINT4_IDENTITY_RETURN_DOCUMENT_INVALID');if(original.size!==1||!(originalId.startsWith('uuid:')&&POINT4_UUID_V4.test(originalId.slice(5)))&&!/^db:[1-9][0-9]*$/.test(originalId))throw point4IdentityError('POINT4_IDENTITY_RETURN_LINEAGE_INVALID')}assertPoint4Lines(type,items);return{tx,classification:'CANONICAL_V1'}}
function runtimeBranch(){try{return num(typeof currentBranchId==='function'?currentBranchId():state?.activeBranchId)}catch{return 0}}
function runtimeEmployee(){try{return num(state?.employee?.id)}catch{return 0}}
function authoritativeProfile(){const profile=text(global.SharawlaRuntimeConfig?.current?.()?.pos_profile).toLowerCase();if(!profile){const e=new Error('Offline V2 pos_profile is required');e.code='OFFLINE_V2_POS_PROFILE_REQUIRED';throw e}if(!POS_PROFILES.has(profile)){const e=new Error(`Offline V2 pos_profile is invalid: ${profile}`);e.code='OFFLINE_V2_INVALID_POS_PROFILE';throw e}return profile}
function localShiftTx(v){const s=text(v);return s.startsWith('offline-shift-')?s.slice('offline-shift-'.length):null}
function localOrderTx(v){const s=text(v);if(!s.startsWith('offline-')||s.startsWith('offline-shift-')||s.startsWith('offline-ret-')||s.startsWith('offline-exp-')||s.startsWith('offline-movement-'))return null;return s.slice('offline-'.length)||null}
function localCustomerTx(v){const s=text(v),p='offline-customer-';return s.startsWith(p)?s.slice(p.length)||null:null}
function localAddressTx(v){const s=text(v),p='offline-customer_address_save-';return s.startsWith(p)?s.slice(p.length)||null:null}
function deterministicLocalId(type,tx){
  if(type==='sale')return `offline-${tx}`;
  if(type==='return')return `offline-ret-${tx}`;
  if(type==='expense')return `offline-exp-${tx}`;
  if(type==='shift_open')return `offline-shift-${tx}`;
  if(type==='shift_close')return `offline-shift-close-${tx}`;
  return `offline-${type}-${tx}`;
}
function foodApi(){return global.__SharawlaFoodRecipeRuntimeV1||null}
function variantsApi(){return global.__SharawlaRetailVariantsRuntimeV1||null}
function foodOn(){try{return foodApi()?.operational?.()===true}catch{return false}}
function variantsOn(){try{return variantsApi()?.operational?.()===true}catch{return false}}
function enrichSaleItems(items){
  let out=clone(items||[]);
  try{if(variantsOn()&&typeof variantsApi()?.enrichSaleItems==='function')out=variantsApi().enrichSaleItems(out)}catch{}
  try{if(foodOn()&&typeof foodApi()?.enrich==='function')out=foodApi().enrich(out)}catch{}
  return out;
}
function resolveSale(payload={},profile=authoritativeProfile()){
  const p=clone(payload||{});p.p_items=enrichSaleItems(p.p_items||[]);
  if(!OFFLINE_COMMERCE_PROFILES.has(profile)){const e=new Error(`Offline V2 sale is not supported for profile: ${profile}`);e.code='OFFLINE_V2_COMMERCE_PROFILE_UNSUPPORTED';e.profile=profile;e.operation='sale';throw e}
  if(profile==='retail'){
    if(foodOn())return {rpc_name:'create_food_retail_pos_order_atomic_v1',rpc_payload:{...p,p_use_variants:variantsOn()||foodApi()?.variantsOperational?.()===true}};
    if(variantsOn())return {rpc_name:'create_retail_variant_pos_order_atomic_v1',rpc_payload:p};
    return {rpc_name:'create_retail_pos_order_atomic',rpc_payload:p};
  }
  return foodOn()?{rpc_name:'create_food_pos_order_atomic_v1',rpc_payload:p}:{rpc_name:'create_pos_order_atomic',rpc_payload:p};
}
function resolveReturn(payload={},profile=authoritativeProfile()){
  const p=clone(payload||{});
  if(!OFFLINE_COMMERCE_PROFILES.has(profile)){const e=new Error(`Offline V2 return is not supported for profile: ${profile}`);e.code='OFFLINE_V2_COMMERCE_PROFILE_UNSUPPORTED';e.profile=profile;e.operation='return';throw e}
  if(profile==='retail'){
    if(foodOn())return {rpc_name:'create_food_retail_order_return_idempotent_v1',rpc_payload:{...p,p_use_variants:variantsOn()||foodApi()?.variantsOperational?.()===true}};
    if(variantsOn())return {rpc_name:'create_retail_variant_order_return_idempotent_v1',rpc_payload:p};
    return {rpc_name:'create_retail_order_return_idempotent',rpc_payload:p};
  }
  return foodOn()?{rpc_name:'create_food_order_return_idempotent_v1',rpc_payload:p}:{rpc_name:'create_order_return_idempotent',rpc_payload:p};
}
function resolveOperation(type,payload){
  const profile=authoritativeProfile();
  if(type==='sale')return resolveSale(payload,profile);
  if(type==='return')return resolveReturn(payload,profile);
  if(type==='expense')return {rpc_name:'create_pos_expense_idempotent',rpc_payload:clone(payload)};
  if(type==='shift_open')return {rpc_name:'open_pos_shift_idempotent',rpc_payload:clone(payload)};
  if(type==='shift_close')return {rpc_name:'close_pos_shift_v2',rpc_payload:clone(payload)};
  if(type==='delivery_mark_delivered')return {rpc_name:'delivery_mark_delivered_v2',rpc_payload:clone(payload)};
  if(type==='delivery_driver_settle')return {rpc_name:'offline_delivery_driver_settle_v1',rpc_payload:clone(payload)};
  if(type==='order_status')return {rpc_name:'order_status_apply_offline_v2',rpc_payload:clone(payload)};
  if(type==='customer_create')return {rpc_name:'offline_customer_create_v1',rpc_payload:clone(payload)};
  if(type==='customer_update')return {rpc_name:'offline_customer_update_v1',rpc_payload:clone(payload)};
  if(type==='customer_address_save')return {rpc_name:'offline_customer_address_save_v1',rpc_payload:clone(payload)};
  if(type==='customer_address_delete')return {rpc_name:'offline_customer_address_delete_v1',rpc_payload:clone(payload)};
  if(type==='delivery_assign_driver')return {rpc_name:'offline_delivery_assign_driver_v1',rpc_payload:clone(payload)};
  if(type==='supplier_save')return {rpc_name:'offline_food_supplier_save_v1',rpc_payload:clone(payload)};
  if(type==='driver_save')return {rpc_name:'offline_delivery_driver_save_v1',rpc_payload:clone(payload)};
  if(type==='zone_save')return {rpc_name:'offline_delivery_zone_save_v1',rpc_payload:clone(payload)};
  if(type==='floor_save')return {rpc_name:'offline_restaurant_floor_save_v1',rpc_payload:clone(payload)};
  if(type==='table_save')return {rpc_name:'offline_restaurant_table_save_v1',rpc_payload:clone(payload)};
  if(type==='table_session_open')return {rpc_name:'restaurant_table_session_open_v1',rpc_payload:clone(payload)};
  if(type==='table_session_attach')return {rpc_name:'offline_restaurant_table_session_attach_v1',rpc_payload:clone(payload)};
  if(type==='table_session_close')return {rpc_name:'offline_restaurant_table_session_close_v1',rpc_payload:clone(payload)};
  if(type==='ingredient_save')return {rpc_name:'offline_food_ingredient_save_v1',rpc_payload:clone(payload)};
  if(type==='ingredient_conversion_save')return {rpc_name:'offline_food_ingredient_conversion_save_v1',rpc_payload:clone(payload)};
  if(type==='recipe_draft_save')return {rpc_name:'offline_food_recipe_save_draft_v1',rpc_payload:clone(payload)};
  if(type==='recipe_version_activate')return {rpc_name:'offline_food_recipe_activate_version_v1',rpc_payload:clone(payload)};
  if(type==='prep_item_save')return {rpc_name:'offline_food_prep_item_save_v1',rpc_payload:clone(payload)};
  if(type==='prep_recipe_draft_save')return {rpc_name:'offline_food_prep_recipe_save_draft_v1',rpc_payload:clone(payload)};
  if(type==='food_po_create')return {rpc_name:'offline_food_purchase_order_create_v1',rpc_payload:clone(payload)};
  if(type==='food_po_approve')return {rpc_name:'offline_food_purchase_order_approve_v1',rpc_payload:clone(payload)};
  if(type==='food_po_cancel')return {rpc_name:'offline_food_purchase_order_cancel_v1',rpc_payload:clone(payload)};
  if(type==='food_purchase_receive')return {rpc_name:'offline_food_purchase_receive_v1',rpc_payload:clone(payload)};
  if(type==='food_supplier_return')return {rpc_name:'offline_food_supplier_return_create_v1',rpc_payload:clone(payload)};
  if(type==='food_stock_count')return {rpc_name:'offline_food_stock_count_post_v1',rpc_payload:clone(payload)};
  if(type==='food_transfer_create')return {rpc_name:'offline_food_stock_transfer_create_v1',rpc_payload:clone(payload)};
  if(type==='food_transfer_receive')return {rpc_name:'offline_food_stock_transfer_receive_v1',rpc_payload:clone(payload)};
  if(type==='food_transfer_cancel')return {rpc_name:'offline_food_stock_transfer_cancel_v1',rpc_payload:clone(payload)};
  if(type==='food_ingredient_stock_adjust')return {rpc_name:'offline_food_ingredient_stock_adjust_action_v2',rpc_payload:clone(payload)};
  if(type==='food_production_start')return {rpc_name:'offline_food_production_batch_start_action_v2',rpc_payload:clone(payload)};
  if(type==='food_production_complete')return {rpc_name:'offline_food_production_batch_complete_action_v2',rpc_payload:clone(payload)};
  if(type==='food_waste_post')return {rpc_name:'offline_food_waste_post_action_v2',rpc_payload:clone(payload)};
  if(type==='food_ingredient_save')return {rpc_name:'offline_food_ingredient_save_action_v2',rpc_payload:clone(payload)};
  if(type==='food_ingredient_conversion_save')return {rpc_name:'offline_food_ingredient_conversion_save_action_v2',rpc_payload:clone(payload)};
  if(type==='food_recipe_save_draft')return {rpc_name:'offline_food_recipe_save_draft_action_v2',rpc_payload:clone(payload)};
  if(type==='food_recipe_activate')return {rpc_name:'offline_food_recipe_activate_version_action_v2',rpc_payload:clone(payload)};
  if(type==='food_prep_item_save')return {rpc_name:'offline_food_prep_item_save_action_v2',rpc_payload:clone(payload)};
  if(type==='food_prep_recipe_save_draft')return {rpc_name:'offline_food_prep_recipe_save_draft_action_v2',rpc_payload:clone(payload)};
   if(type==='inventory_supply_request_create')return {rpc_name:'inventory_supply_request_create_v1',rpc_payload:clone(payload)};
   if(type==='inventory_supply_request_submit')return {rpc_name:'offline_inventory_supply_request_submit_v1',rpc_payload:clone(payload)};
   if(type==='inventory_supply_request_decide')return {rpc_name:'offline_inventory_supply_request_decide_v1',rpc_payload:clone(payload)};
   if(type==='inventory_supply_request_prepare')return {rpc_name:'offline_inventory_supply_request_prepare_v1',rpc_payload:clone(payload)};
   if(type==='inventory_supply_request_dispatch')return {rpc_name:'offline_inventory_supply_request_dispatch_v1',rpc_payload:clone(payload)};
   if(type==='inventory_supply_request_receive')return {rpc_name:'offline_inventory_supply_request_receive_v1',rpc_payload:clone(payload)};
  throw new Error(`Offline V2 transport target is not registered: ${type}`);
}
function dependencyTx(type,payload={}){
  if(type==='sale')return localShiftTx(payload?.p_order?.shift_id);
  if(type==='expense'||type==='shift_close')return localShiftTx(payload?.p_shift_id);
  if(type==='return'||type==='order_status'||type==='delivery_assign_driver'||type==='delivery_mark_delivered')return localOrderTx(payload?.p_order_id);
  if(type==='customer_update'&&text(payload?.p_customer_create_tx))return text(payload.p_customer_create_tx);
  if(type==='customer_address_save'&&text(payload?.p_address_save_tx))return text(payload.p_address_save_tx);
  if(type==='customer_address_save'&&text(payload?.p_customer_create_tx))return text(payload.p_customer_create_tx);
  if(type==='customer_address_delete'&&text(payload?.p_address_save_tx))return text(payload.p_address_save_tx);
  if((type==='table_session_attach'||type==='table_session_close')&&text(payload?.p_session_open_tx))return text(payload.p_session_open_tx);
  if(type==='ingredient_conversion_save'&&text(payload?.p_ingredient_create_tx))return text(payload.p_ingredient_create_tx);
  return null;
}
function shiftId(type,payload={}){
  if(type==='sale')return text(payload?.p_order?.shift_id)||null;
  if(type==='expense'||type==='shift_close')return text(payload?.p_shift_id)||null;
  return null;
}
function recordsFor(type,entityType,localId,rpcPayload,created){
  if(type==='sale'){
    const order={...(clone(rpcPayload.p_order)||{}),id:localId,_offline:true};
    const rows=[{record_type:'order',local_id:localId,payload:order,created_local_at:created}];
    (rpcPayload.p_items||[]).forEach((item,i)=>rows.push({record_type:'order_item',local_id:item.line_uid?`${localId}-line-${item.line_uid}`:`${localId}-legacy-i${i+1}`,parent_local_id:localId,payload:{...clone(item),order_id:localId},created_local_at:created}));
    (rpcPayload.p_payments||[]).forEach((p,i)=>rows.push({record_type:'payment',local_id:`${localId}-p${i+1}`,parent_local_id:localId,payload:{...clone(p),order_id:localId},created_local_at:created}));
    return rows;
  }
  return [{record_type:entityType,local_id:localId,payload:clone(rpcPayload),created_local_at:created}];
}
function adapter(type,entityType,rpcNames){
  return {
    type,entityType,rpcNames,
    extractTx:p=>type==='sale'?text(p?.p_order?.client_tx_id||p?.p_client_tx_id):text(p?.p_client_tx_id||p?.client_tx_id),
    buildCommit:({payload,clientTx,identity,createdAt})=>{
      const resolved=resolveOperation(type,payload),created=createdAt||nowIso(),localId=deterministicLocalId(type,clientTx),order=resolved.rpc_payload?.p_order||{};
      const point4Identity=type==='sale'||type==='return'?assertPoint4Payload(type,resolved.rpc_payload):null;if(point4Identity&&point4Identity.tx!==clientTx)throw point4IdentityError('POINT4_IDENTITY_CLIENT_TX_MISMATCH');
      const branchId=num(order.branch_id??resolved.rpc_payload?.p_branch_id,runtimeBranch()),employeeId=num(order.employee_id??resolved.rpc_payload?.p_employee_id,runtimeEmployee());
      return {
        client_tx_id:clientTx,device_id:identity.device_id,business_id:identity.business_id,branch_id:branchId,employee_id:employeeId,
        operation_type:type,entity_type:entityType,local_entity_id:localId,local_shift_id:shiftId(type,resolved.rpc_payload),depends_on_tx_id:dependencyTx(type,resolved.rpc_payload),
        created_local_at:created,protocol_version:2,schema_version:2,status:'pending',
        payload:{rpc_name:resolved.rpc_name,rpc_payload:clone(resolved.rpc_payload),point4_identity_classification:point4Identity?.classification||'NOT_APPLICABLE'},
        records:recordsFor(type,entityType,localId,resolved.rpc_payload,created)
      };
    }
  };
}

function registerOne(type,a){
  const t=global.SharawlaOfflineV2Takeover;if(!t?.registerOperation)return false;
  adaptersByType.set(type,a);for(const name of a.rpcNames||[])typeByRpc.set(name,type);t.registerOperation(type,a);return true;
}
function registerTransportAdapters(){
  const t=global.SharawlaOfflineV2Takeover;if(!t?.registerOperation)return false;
  registerOne('sale',adapter('sale','order',[
    'create_pos_order_atomic','create_retail_pos_order_atomic','create_retail_variant_pos_order_atomic_v1','create_food_pos_order_atomic_v1','create_food_retail_pos_order_atomic_v1'
  ]));
  registerOne('return',adapter('return','return',[
    'create_order_return_idempotent','create_retail_order_return_idempotent','create_retail_variant_order_return_idempotent_v1','create_food_order_return_idempotent_v1','create_food_retail_order_return_idempotent_v1'
  ]));
  registerOne('expense',adapter('expense','expense',['create_pos_expense_idempotent']));
  registerOne('shift_open',adapter('shift_open','shift',['open_pos_shift_idempotent']));
  registerOne('shift_close',adapter('shift_close','shift_event',['close_pos_shift_idempotent','close_pos_shift_v2']));
  registerOne('delivery_mark_delivered',adapter('delivery_mark_delivered','order_event',['delivery_mark_delivered_v2']));
  registerOne('delivery_driver_settle',adapter('delivery_driver_settle','delivery_settlement',['delivery_driver_settle_v2']));
  registerOne('order_status',adapter('order_status','order_event',['order_status_apply_offline_v2']));
  registerOne('customer_create',adapter('customer_create','customer',['offline_customer_create_v1']));
  registerOne('customer_update',adapter('customer_update','customer',['offline_customer_update_v1']));
  registerOne('customer_address_save',adapter('customer_address_save','customer_address',['offline_customer_address_save_v1']));
  registerOne('customer_address_delete',adapter('customer_address_delete','customer_address',['offline_customer_address_delete_v1']));
  registerOne('delivery_assign_driver',adapter('delivery_assign_driver','order_event',['offline_delivery_assign_driver_v1']));
  registerOne('supplier_save',adapter('supplier_save','supplier',['food_supplier_save_v1']));
  registerOne('driver_save',adapter('driver_save','delivery_driver',['delivery_driver_save_v2']));
  registerOne('zone_save',adapter('zone_save','delivery_zone',['delivery_zone_save_v2']));
  registerOne('floor_save',adapter('floor_save','restaurant_floor',['restaurant_floor_save_v1']));
  registerOne('table_save',adapter('table_save','restaurant_table',['restaurant_table_save_v1']));
  registerOne('table_session_open',adapter('table_session_open','restaurant_table_session',['restaurant_table_session_open_v1']));
  registerOne('table_session_attach',adapter('table_session_attach','restaurant_table_session_order',['restaurant_table_session_attach_order_v1']));
  registerOne('table_session_close',adapter('table_session_close','restaurant_table_session',['restaurant_table_session_close_v1']));
  registerOne('ingredient_save',adapter('ingredient_save','ingredient',['food_ingredient_save_v1']));
  registerOne('ingredient_conversion_save',adapter('ingredient_conversion_save','ingredient_conversion',['food_ingredient_conversion_save_v1']));
  registerOne('recipe_draft_save',adapter('recipe_draft_save','recipe_version',['food_recipe_save_draft_v1']));
  registerOne('recipe_version_activate',adapter('recipe_version_activate','recipe_version',['food_recipe_activate_version_v1']));
  registerOne('prep_item_save',adapter('prep_item_save','prep_item',['food_prep_item_save_v1']));
  registerOne('prep_recipe_draft_save',adapter('prep_recipe_draft_save','prep_recipe_version',['food_prep_recipe_save_draft_v1']));
  registerOne('food_po_create',adapter('food_po_create','food_purchase_order',['food_purchase_order_create_v1']));
  registerOne('food_po_approve',adapter('food_po_approve','food_purchase_order',['food_purchase_order_approve_v1']));
  registerOne('food_po_cancel',adapter('food_po_cancel','food_purchase_order',['food_purchase_order_cancel_v1']));
  registerOne('food_purchase_receive',adapter('food_purchase_receive','food_purchase_receipt',['food_purchase_receive_v1']));
  registerOne('food_supplier_return',adapter('food_supplier_return','food_supplier_return',['food_supplier_return_create_v1']));
  registerOne('food_stock_count',adapter('food_stock_count','food_stock_count',['food_stock_count_post_v1']));
  registerOne('food_transfer_create',adapter('food_transfer_create','food_stock_transfer',['food_stock_transfer_create_v1']));
  registerOne('food_transfer_receive',adapter('food_transfer_receive','food_stock_transfer',['food_stock_transfer_receive_v1']));
  registerOne('food_transfer_cancel',adapter('food_transfer_cancel','food_stock_transfer',['food_stock_transfer_cancel_v1']));
  registerOne('food_ingredient_stock_adjust',adapter('food_ingredient_stock_adjust','food_ingredient_adjustment',['food_ingredient_stock_adjust_action_v2']));
  registerOne('food_production_start',adapter('food_production_start','food_production_batch',['food_production_batch_start_action_v2']));
  registerOne('food_production_complete',adapter('food_production_complete','food_production_batch',['food_production_batch_complete_action_v2']));
  registerOne('food_waste_post',adapter('food_waste_post','food_waste_event',['food_waste_post_action_v2']));
  registerOne('food_ingredient_save',adapter('food_ingredient_save','food_ingredient_master',['food_ingredient_save_action_v2']));
  registerOne('food_ingredient_conversion_save',adapter('food_ingredient_conversion_save','food_ingredient_conversion_master',['food_ingredient_conversion_save_action_v2']));
  registerOne('food_recipe_save_draft',adapter('food_recipe_save_draft','food_recipe_version_master',['food_recipe_save_draft_action_v2']));
  registerOne('food_recipe_activate',adapter('food_recipe_activate','food_recipe_version_master',['food_recipe_activate_version_action_v2']));
  registerOne('food_prep_item_save',adapter('food_prep_item_save','food_prep_item_master',['food_prep_item_save_action_v2']));
  registerOne('food_prep_recipe_save_draft',adapter('food_prep_recipe_save_draft','food_recipe_version_master',['food_prep_recipe_save_draft_action_v2']));
   registerOne('inventory_supply_request_create',adapter('inventory_supply_request_create','inventory_supply_request',['inventory_supply_request_create_v1']));
   registerOne('inventory_supply_request_submit',adapter('inventory_supply_request_submit','inventory_supply_request',['inventory_supply_request_submit_v1']));
   registerOne('inventory_supply_request_decide',adapter('inventory_supply_request_decide','inventory_supply_request',['inventory_supply_request_decide_v1']));
   registerOne('inventory_supply_request_prepare',adapter('inventory_supply_request_prepare','inventory_supply_request',['inventory_supply_request_prepare_v1']));
   registerOne('inventory_supply_request_dispatch',adapter('inventory_supply_request_dispatch','inventory_supply_request',['inventory_supply_request_dispatch_v1']));
   registerOne('inventory_supply_request_receive',adapter('inventory_supply_request_receive','inventory_supply_request',['inventory_supply_request_receive_v1']));
  return true;
}

function connection(){try{return JSON.parse(localStorage.getItem(CONNECTION_KEY)||'null')}catch{return null}}
async function canonicalIdentity(){
  const st=typeof loadLicenseState==='function'?await loadLicenseState():null;
  const identity={device_id:text(st?.device_id),business_id:text(st?.business_id),device_fingerprint:text(st?.device_fingerprint)};
  if(!identity.device_id||!identity.business_id||!identity.device_fingerprint){const e=new Error('Offline V2 canonical device identity is required');e.code='OFFLINE_V2_CANONICAL_IDENTITY_REQUIRED';throw e}
  return identity;
}
async function syncContext(){
  if(typeof refreshSessionIfNeeded==='function')try{await refreshSessionIfNeeded()}catch{}
  const st=await canonicalIdentity(),c=connection();
  const token=typeof session!=='undefined'?text(session?.access_token):'';
  if(!c?.url||!c?.key||!token||runtimeEmployee()<=0)throw new Error('Offline V2 authenticated sync context is unavailable');
  return {url:c.url,key:c.key,access_token:token,device_id:st.device_id,business_id:st.business_id,device_fingerprint:st.device_fingerprint,employee_id:runtimeEmployee()};
}
async function projectDirectOperation(type,payload,tx,row){
  if(typeof global.odbGet!=='function'||typeof global.odbSet!=='function')return;
  const pending=row?.status!=='synced',created=text(row?.created_local_at)||nowIso(),serverResult=row?.server_ack?.result||{};
  if(type==='sale'){
    const durablePayload=clone(row?.envelope?.payload?.rpc_payload)||clone(payload)||{},reserved=durablePayload?.p_order?.bon_reservation||null,reservedBon=num(reserved?.bon_number,0);
    const localId='offline-'+tx,serverOrder=serverResult?.order||null,serverId=text(serverOrder?.id||row?.server_ack?.server_entity_id),id=serverId||localId,all=clone(await global.odbGet('cachedOrders'))||[];
    const localOrder=serverOrder?{...serverOrder,_offline:false,_official_number_pending:false}:{...clone(durablePayload?.p_order||{}),id:localId,client_tx_id:tx,invoice_number:null,bon_number:reservedBon||null,offline_reference:reservedBon?null:'OFF-'+text(tx).replace(/-/g,'').slice(0,10).toUpperCase(),_official_number_pending:!reservedBon,created_at:created,payment_status:'confirmed',_offline:true,_offline_sync_status:text(row?.status)||'pending'};
    const localItems=serverOrder?clone(serverResult?.items||[]):(clone(durablePayload?.p_items)||[]).map((x,i)=>({...x,id:x.line_uid?localId+'-line-'+x.line_uid:localId+'-legacy-i'+(i+1),order_id:id}));
    await global.odbSet('cachedOrders',[{order:{...localOrder,id},items:localItems},...all.filter(b=>String(b?.order?.id)!==localId&&String(b?.order?.id)!==String(id)&&String(b?.order?.client_tx_id||'')!==tx)].slice(0,250));
  }else if(type==='return'){
    const localId='offline-ret-'+tx,serverId=num(serverResult?.return_id??serverResult?.id,0),id=serverId||localId,branchId=num(payload?.p_branch_id,runtimeBranch()),all=clone(await global.odbGet('cachedReturns:'+branchId))||[];
    const item={id,return_number:serverResult?.return_number||(serverId?String(serverId):'OFF-'+tx.slice(0,6)),branch_id:branchId,order_id:payload?.p_order_id,reason:payload?.p_reason,notes:payload?.p_notes??null,total:Number(payload?.p_payments?.[0]?.amount||0),created_at:created,client_tx_id:tx,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('cachedReturns:'+branchId,[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,500));
  }else if(type==='shift_open'){
    const localId=`offline-shift-${tx}`,serverId=num(serverResult?.id??serverResult?.shift_id,0),id=serverId||localId,local={id,branch_id:payload?.p_branch_id,employee_id:runtimeEmployee(),opening_cash:Number(payload?.p_opening_cash||0),status:'open',opened_at:created,client_tx_id:tx,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};await global.odbSet(`openShift:${runtimeEmployee()}:${payload?.p_branch_id}`,local);const hist=clone(await global.odbGet(`shiftHistory:${payload?.p_branch_id}`))||[];await global.odbSet(`shiftHistory:${payload?.p_branch_id}`,[local,...hist.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,100));
  }else if(type==='expense'){
    const localId=`offline-exp-${tx}`,serverId=num(serverResult?.id??serverResult?.expense_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2Expenses'))||[],item={id,branch_id:runtimeBranch(),employee_id:runtimeEmployee(),shift_id:payload?.p_shift_id,description:payload?.p_description,amount:Number(payload?.p_amount||0),created_at:created,client_tx_id:tx,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};await global.odbSet('offlineV2Expenses',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='shift_close'){
    const key=`openShift:${runtimeEmployee()}:${runtimeBranch()}`,open=clone(await global.odbGet(key));if(open&&String(open.id)===String(payload?.p_shift_id)){const closed={...open,status:'closed',closing_cash:Number(payload?.p_closing_cash||0),closed_at:created,...clone(payload?.p_metrics||{}),client_tx_id:tx,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};await global.odbSet(key,null);const hist=clone(await global.odbGet(`shiftHistory:${runtimeBranch()}`))||[];await global.odbSet(`shiftHistory:${runtimeBranch()}`,[closed,...hist.filter(x=>String(x.id)!==String(open.id)&&String(x.client_tx_id||'')!==tx)].slice(0,100))}
  }else if(type==='customer_create'){
    const localId=`offline-customer-${tx}`,serverId=num(serverResult.customer_id,0),id=serverId||localId;
    const customer={id,name:text(payload?.p_name)||text(payload?.p_phone),phone:text(payload?.p_phone),area:payload?.p_area??null,address:payload?.p_address??null,notes:payload?.p_notes??null,created_at:created,client_tx_id:tx,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    const all=clone(await global.odbGet('customersCache'))||[];
    const phone=text(customer.phone).replace(/\D/g,'').slice(-10);
    const next=[customer,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx&&(!phone||text(x.phone).replace(/\D/g,'').slice(-10)!==phone))];
    await global.odbSet('customersCache',next.slice(0,10000));
  }else if(type==='customer_update'){
    const localId=text(payload?.p_customer_id)||`offline-customer-${text(payload?.p_customer_create_tx)}`,serverId=num(serverResult.customer_id,0),all=clone(await global.odbGet('customersCache'))||[];
    const i=all.findIndex(x=>String(x.id)===localId||String(x.id)===String(serverId)||String(x.client_tx_id||'')===text(payload?.p_customer_create_tx));
    const base=i>=0?all[i]:{id:serverId||localId};
    const customer={...base,id:serverId||base.id,name:payload?.p_name??base.name,phone:payload?.p_phone??base.phone,area:payload?.p_area??null,address:payload?.p_address??null,notes:payload?.p_notes??null,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    if(i>=0)all.splice(i,1);all.unshift(customer);await global.odbSet('customersCache',all.slice(0,10000));
  }else if(type==='customer_address_save'){
    const localId=`offline-customer_address_save-${tx}`,serverId=num(serverResult.address_id,0),id=serverId||localId;
    const customerId=serverResult.customer_id??payload?.p_customer_id??(payload?.p_customer_create_tx?`offline-customer-${payload.p_customer_create_tx}`:null);
    const address={id,customer_id:customerId,label:payload?.p_label??null,area:payload?.p_area??null,address:payload?.p_address??null,notes:payload?.p_notes??null,is_default:payload?.p_is_default===true,created_at:created,updated_at:created,client_tx_id:tx,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    const all=clone(await global.odbGet('customerAddressesCache'))||[];
    const next=[address,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_address_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)];
    await global.odbSet('customerAddressesCache',next.slice(0,20000));
  }else if(type==='customer_address_delete'){
    const all=clone(await global.odbGet('customerAddressesCache'))||[],addressId=text(payload?.p_address_id)||`offline-customer_address_save-${text(payload?.p_address_save_tx)}`;
    await global.odbSet('customerAddressesCache',all.filter(x=>String(x.id)!==addressId&&String(x.client_tx_id||'')!==text(payload?.p_address_save_tx)));
  }else if(type==='delivery_assign_driver'){
    const orderId=text(payload?.p_order_id),bundles=clone(await global.odbGet('cachedOrders'))||[];
    for(const bundle of bundles){if(String(bundle?.order?.id)!==orderId)continue;bundle.order={...bundle.order,driver_id:num(payload?.p_driver_id),status:'out_for_delivery',assigned_at:created,_offline_status_pending:pending,_offline_status_tx:tx,_offline_status_at:created}}
    await global.odbSet('cachedOrders',bundles);
  }else if(type==='supplier_save'){
    const localId=`offline-supplier-${tx}`,serverId=num(serverResult.supplier_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2Suppliers'))||[];
    const supplier={id,name:text(payload?.p_name),phone:payload?.p_phone??null,email:payload?.p_email??null,tax_no:payload?.p_tax_no??null,address:payload?.p_address??null,notes:payload?.p_notes??null,active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    const next=[supplier,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_supplier_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)];
    await global.odbSet('offlineV2Suppliers',next.slice(0,5000));
  }
  else if(type==='driver_save'){
    const localId=`offline-driver-${tx}`,serverId=num(serverResult.driver_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2Drivers'))||[];
    const driver={id,branch_id:num(payload?.p_branch_id),name:text(payload?.p_name),phone:payload?.p_phone??null,active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    const next=[driver,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_driver_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)];
    await global.odbSet('offlineV2Drivers',next.slice(0,5000));
  }else if(type==='zone_save'){
    const localId=`offline-zone-${tx}`,serverId=num(serverResult.zone_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2Zones'))||[];
    const zone={id,branch_id:num(payload?.p_branch_id),name:text(payload?.p_name),delivery_fee:num(payload?.p_delivery_fee),active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    const next=[zone,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_zone_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)];
    await global.odbSet('offlineV2Zones',next.slice(0,5000));
  }else if(type==='floor_save'){
    const localId=`offline-floor-${tx}`,serverId=num(serverResult.floor_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2RestaurantFloors'))||[];
    const item={id,branch_id:num(payload?.p_branch_id),name:text(payload?.p_name),sort_order:num(payload?.p_sort_order,100),active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2RestaurantFloors',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_floor_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,5000));
  }
   if(type==='table_save'){
    const localId=`offline-table-${tx}`,serverId=num(serverResult.table_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2RestaurantTables'))||[];
    const item={id,branch_id:num(payload?.p_branch_id),floor_id:payload?.p_floor_id??null,name:text(payload?.p_name),code:payload?.p_code??null,capacity:Math.max(1,num(payload?.p_capacity,2)),status:payload?.p_active===false?'disabled':'available',active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2RestaurantTables',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_table_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,5000));
}else if(['inventory_supply_request_submit','inventory_supply_request_decide','inventory_supply_request_prepare','inventory_supply_request_dispatch','inventory_supply_request_receive'].includes(type)){
     const all=clone(await global.odbGet('offlineV2InventorySupplyRequests'))||[],id=String(payload?.p_request_id??''),i=all.findIndex(x=>String(x.id)===id);if(i>=0){const status=type==='inventory_supply_request_submit'?'submitted':type==='inventory_supply_request_prepare'?'preparing':type==='inventory_supply_request_dispatch'?'in_transit':type==='inventory_supply_request_receive'?(payload?.p_final?'received':'partially_received'):(payload?.p_approve?'approved':'rejected');all[i]={...all[i],status,_offline:pending,_offline_sync_status:text(row?.status)||'pending',updated_at:created};await global.odbSet('offlineV2InventorySupplyRequests',all)}
   }else if(type==='inventory_supply_request_create'){
     const localId=`offline-supply-request-${tx}`,serverId=num(serverResult?.request_id??serverResult,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2InventorySupplyRequests'))||[],itemsAll=clone(await global.odbGet('offlineV2InventorySupplyRequestItems'))||[];
     const req={id,route_id:payload?.p_route_id,request_type:payload?.p_request_type,notes:payload?.p_notes??null,status:'draft',client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
     const items=(clone(payload?.p_items)||[]).map((x,n)=>({id:`offline-supply-request-item-${tx}-${n+1}`,request_id:id,catalog_item_id:x.catalog_item_id,quantity_requested:Number(x.quantity||0),line_note:x.line_note??null,client_tx_id:tx,_offline:pending,_offline_sync_status:text(row?.status)||'pending'}));
     await global.odbSet('offlineV2InventorySupplyRequests',[req,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,5000));
     await global.odbSet('offlineV2InventorySupplyRequestItems',[...items,...itemsAll.filter(x=>String(x.client_tx_id||'')!==tx)].slice(0,20000));
   }else if(type==='food_purchase_receive'){
    const localId=`offline-food-receipt-${tx}`,serverId=num(serverResult.receipt_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2FoodPurchaseReceipts'))||[];
    const item={id,purchase_id:payload?.p_purchase_id,items:clone(payload?.p_items||[]),client_tx_id:tx,created_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending',stock_authority:'server_ack_only'};
    await global.odbSet('offlineV2FoodPurchaseReceipts',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='food_supplier_return'){
    const localId=`offline-food-supplier-return-${tx}`,serverId=num(serverResult.supplier_return_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2FoodSupplierReturns'))||[];
    const item={id,branch_id:payload?.p_branch_id,supplier_id:payload?.p_supplier_id??null,notes:payload?.p_notes??null,items:clone(payload?.p_items||[]),client_tx_id:tx,created_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending',stock_authority:'server_ack_only'};
    await global.odbSet('offlineV2FoodSupplierReturns',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='food_stock_count'){
    const localId=`offline-food-stock-count-${tx}`,serverId=num(serverResult.stock_count_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2FoodStockCounts'))||[];
    const item={id,branch_id:payload?.p_branch_id,notes:payload?.p_notes??null,items:clone(payload?.p_items||[]),client_tx_id:tx,created_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending',stock_authority:'server_ack_only'};
    await global.odbSet('offlineV2FoodStockCounts',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='food_transfer_create'){
    const localId=`offline-food-transfer-${tx}`,serverId=num(serverResult.transfer_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2FoodStockTransfers'))||[];
    const item={id,from_branch_id:payload?.p_from_branch_id,to_branch_id:payload?.p_to_branch_id,notes:payload?.p_notes??null,items:clone(payload?.p_items||[]),status:pending?'pending_sync':'sent',client_tx_id:tx,created_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending',stock_authority:'server_ack_only'};
    await global.odbSet('offlineV2FoodStockTransfers',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='food_transfer_receive'||type==='food_transfer_cancel'){
    const all=clone(await global.odbGet('offlineV2FoodStockTransfers'))||[],id=String(payload?.p_transfer_id??''),i=all.findIndex(x=>String(x.id)===id);
    if(i>=0){all[i]={...all[i],status:pending?(type==='food_transfer_receive'?'receive_pending_sync':'cancel_pending_sync'):(type==='food_transfer_receive'?'received':'cancelled'),_offline:pending,_offline_sync_status:text(row?.status)||'pending',stock_authority:'server_ack_only',updated_at:created};await global.odbSet('offlineV2FoodStockTransfers',all.slice(0,10000))}
  }else if(type==='food_ingredient_stock_adjust'){
    const localId=`offline-food-ingredient-adjustment-${tx}`,serverId=num(serverResult.adjustment_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2FoodIngredientAdjustments'))||[];
    const item={id,branch_id:payload?.p_branch_id,ingredient_id:payload?.p_ingredient_id,quantity_delta:Number(payload?.p_quantity_delta||0),unit_cost:Number(payload?.p_unit_cost||0),reason:payload?.p_reason??null,client_tx_id:tx,created_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending',stock_authority:'server_ack_only'};
    await global.odbSet('offlineV2FoodIngredientAdjustments',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='food_production_start'){
    const localId=`offline-food-production-batch-${tx}`,serverId=num(serverResult.production_batch_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2FoodProductionBatches'))||[];
    const item={id,branch_id:payload?.p_branch_id,prep_item_id:payload?.p_prep_item_id,planned_output_quantity:Number(payload?.p_planned_output_quantity||0),batch_number:payload?.p_batch_number??null,notes:payload?.p_notes??null,status:'in_progress',client_tx_id:tx,created_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending',stock_authority:'server_ack_only'};
    await global.odbSet('offlineV2FoodProductionBatches',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='food_production_complete'){
    const all=clone(await global.odbGet('offlineV2FoodProductionBatches'))||[],id=String(payload?.p_production_batch_id??''),i=all.findIndex(x=>String(x.id)===id);
    if(i>=0){all[i]={...all[i],status:pending?'complete_pending_sync':'completed',actual_output_quantity:Number(payload?.p_actual_output_quantity||0),completion_client_tx_id:tx,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending',stock_authority:'server_ack_only'};await global.odbSet('offlineV2FoodProductionBatches',all.slice(0,10000))}
  }else if(type==='food_waste_post'){
    const localId=`offline-food-waste-${tx}`,serverId=num(serverResult.waste_event_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2FoodWasteEvents'))||[];
    const item={id,branch_id:payload?.p_branch_id,ingredient_id:payload?.p_ingredient_id,prep_item_id:payload?.p_prep_item_id??null,shift_id:payload?.p_shift_id??null,reason_code:payload?.p_reason_code,quantity:Number(payload?.p_quantity||0),unit_code:payload?.p_unit_code,notes:payload?.p_notes??null,status:pending?'pending_sync':'posted',client_tx_id:tx,occurred_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending',stock_authority:'server_ack_only'};
    await global.odbSet('offlineV2FoodWasteEvents',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='food_ingredient_save'){
    const localId=`offline-food-ingredient-${tx}`,serverId=num(serverResult.ingredient_id,0),id=serverId||num(payload?.p_ingredient_id,0)||localId,all=clone(await global.odbGet('offlineV2FoodIngredients'))||[];
    const item={id,name:payload?.p_name,base_unit_code:payload?.p_base_unit_code,purchase_unit_code:payload?.p_purchase_unit_code,sku:payload?.p_sku??null,barcode:payload?.p_barcode??null,cost_per_unit:Number(payload?.p_cost_per_base_unit||0),minimum_quantity:Number(payload?.p_minimum_quantity||0),track_inventory:payload?.p_track_inventory!==false,usable_yield_percent:Number(payload?.p_usable_yield_percent||100),shelf_life_minutes:payload?.p_shelf_life_minutes??null,active:payload?.p_active!==false,client_tx_id:tx,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2FoodIngredients',[item,...all.filter(x=>String(x.id)!==String(id)&&String(x.id)!==localId&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='food_ingredient_conversion_save'){
    const localId=`offline-food-ingredient-conversion-${tx}`,serverId=num(serverResult.conversion_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2FoodIngredientConversions'))||[];
    const item={id,ingredient_id:payload?.p_ingredient_id,from_unit_code:payload?.p_from_unit_code,to_unit_code:payload?.p_to_unit_code,factor:Number(payload?.p_factor||0),active:payload?.p_active!==false,client_tx_id:tx,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2FoodIngredientConversions',[item,...all.filter(x=>String(x.id)!==String(id)&&String(x.id)!==localId&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='food_recipe_save_draft'){
    const localId=`offline-food-recipe-version-${tx}`,serverId=num(serverResult.recipe_version_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2FoodRecipeVersions'))||[];
    const item={id,recipe_id:serverResult.recipe_id??null,product_id:payload?.p_product_id,variant_id:payload?.p_variant_id??null,name:payload?.p_name??null,output_quantity:Number(payload?.p_output_quantity||0),output_unit_code:payload?.p_output_unit_code,lines:clone(payload?.p_lines)||[],modifier_impacts:clone(payload?.p_modifier_impacts)||[],removal_mappings:clone(payload?.p_removal_mappings)||[],notes:payload?.p_notes??null,status:'draft',client_tx_id:tx,created_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2FoodRecipeVersions',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='food_recipe_activate'){
    const all=clone(await global.odbGet('offlineV2FoodRecipeVersions'))||[],id=String(payload?.p_recipe_version_id??''),i=all.findIndex(x=>String(x.id)===id);if(i>=0){all[i]={...all[i],status:pending?'activation_pending_sync':'active',activation_client_tx_id:tx,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};await global.odbSet('offlineV2FoodRecipeVersions',all.slice(0,10000))}
  }else if(type==='food_prep_item_save'){
    const localId=`offline-food-prep-item-${tx}`,serverId=num(serverResult.prep_item_id,0),id=serverId||num(payload?.p_prep_item_id,0)||localId,all=clone(await global.odbGet('offlineV2FoodPrepItems'))||[];
    const item={id,name:payload?.p_name,output_ingredient_id:serverResult.output_ingredient_id??payload?.p_output_ingredient_id??null,base_unit_code:payload?.p_base_unit_code,default_batch_quantity:Number(payload?.p_default_batch_quantity||0),shelf_life_minutes:payload?.p_shelf_life_minutes??null,notes:payload?.p_notes??null,active:payload?.p_active!==false,client_tx_id:tx,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2FoodPrepItems',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='food_prep_recipe_save_draft'){
    const localId=`offline-food-recipe-version-${tx}`,serverId=num(serverResult.recipe_version_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2FoodRecipeVersions'))||[];
    const item={id,recipe_id:serverResult.recipe_id??null,prep_item_id:payload?.p_prep_item_id,output_quantity:Number(payload?.p_output_quantity||0),output_unit_code:payload?.p_output_unit_code,lines:clone(payload?.p_lines)||[],notes:payload?.p_notes??null,status:'draft',recipe_kind:'prep',client_tx_id:tx,created_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2FoodRecipeVersions',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='food_po_create'){
    const localId=`offline-food-po-${tx}`,serverId=num(serverResult.purchase_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2FoodPurchaseOrders'))||[];
    const total=(Array.isArray(payload?.p_items)?payload.p_items:[]).reduce((a,x)=>a+num(x?.quantity,0)*num(x?.unit_cost,0),0);
    const item={id,branch_id:payload?.p_branch_id,supplier_id:payload?.p_supplier_id,invoice_number:payload?.p_invoice_number??null,notes:payload?.p_notes??null,total,status:'draft',items:clone(payload?.p_items||[]),client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2FoodPurchaseOrders',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='food_po_approve'||type==='food_po_cancel'){
    const all=clone(await global.odbGet('offlineV2FoodPurchaseOrders'))||[],pid=String(payload?.p_purchase_id??''),i=all.findIndex(x=>String(x.id)===pid);
    if(i>=0){all[i]={...all[i],status:type==='food_po_approve'?'approved':'cancelled',updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};await global.odbSet('offlineV2FoodPurchaseOrders',all.slice(0,10000))}
  }else if(type==='prep_item_save'){
    const localId=`offline-prep-item-${tx}`,serverId=num(serverResult.prep_item_id,0),id=serverId||localId,outputId=serverResult.output_ingredient_id??payload?.p_output_ingredient_id??`offline-prep-output-${tx}`,all=clone(await global.odbGet('offlineV2PrepItems'))||[];
    const item={id,name:text(payload?.p_name),output_ingredient_id:outputId,base_unit_code:payload?.p_base_unit_code,default_batch_quantity:num(payload?.p_default_batch_quantity,1),shelf_life_minutes:payload?.p_shelf_life_minutes??null,notes:payload?.p_notes??null,active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2PrepItems',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_prep_item_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='prep_recipe_draft_save'){
    const localId=`offline-prep-recipe-version-${tx}`,serverId=num(serverResult.recipe_version_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2PrepRecipeVersions'))||[];
    const item={id,prep_item_id:payload?.p_prep_item_id,status:'draft',output_quantity:num(payload?.p_output_quantity,1),output_unit_code:payload?.p_output_unit_code,lines:clone(payload?.p_lines||[]),notes:payload?.p_notes??null,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2PrepRecipeVersions',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='recipe_draft_save'){
    const localId=`offline-recipe-version-${tx}`,serverId=num(serverResult.recipe_version_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2RecipeVersions'))||[];
    const item={id,product_id:payload?.p_product_id,variant_id:payload?.p_variant_id??null,name:payload?.p_name??null,status:'draft',output_quantity:num(payload?.p_output_quantity,1),output_unit_code:payload?.p_output_unit_code,lines:clone(payload?.p_lines||[]),modifier_impacts:clone(payload?.p_modifier_impacts||[]),removal_mappings:clone(payload?.p_removal_mappings||[]),notes:payload?.p_notes??null,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2RecipeVersions',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='ingredient_save'){
    const localId=`offline-ingredient-${tx}`,serverId=num(serverResult.ingredient_id,0),id=serverId||localId,all=clone(await global.odbGet('offlineV2Ingredients'))||[];
    const item={id,name:text(payload?.p_name),unit:payload?.p_base_unit_code,base_unit_code:payload?.p_base_unit_code,purchase_unit_code:payload?.p_purchase_unit_code||payload?.p_base_unit_code,sku:payload?.p_sku??null,barcode:payload?.p_barcode??null,cost_per_unit:num(payload?.p_cost_per_base_unit),minimum_quantity:num(payload?.p_minimum_quantity),track_inventory:payload?.p_track_inventory!==false,usable_yield_percent:num(payload?.p_usable_yield_percent,100),shelf_life_minutes:payload?.p_shelf_life_minutes??null,active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2Ingredients',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_ingredient_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
  }else if(type==='ingredient_conversion_save'){
    const localId=`offline-ingredient-conversion-${tx}`,serverId=num(serverResult.conversion_id,0),id=serverId||localId,ingredientId=serverResult.ingredient_id??payload?.p_ingredient_id??(payload?.p_ingredient_create_tx?`offline-ingredient-${payload.p_ingredient_create_tx}`:null),all=clone(await global.odbGet('offlineV2IngredientConversions'))||[];
    const item={id,ingredient_id:ingredientId,from_unit_code:payload?.p_from_unit_code,to_unit_code:payload?.p_to_unit_code,factor:num(payload?.p_factor),active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2IngredientConversions',[item,...all.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,20000));
  }else if(type==='table_session_open'){
    const localId=`offline-table-session-${tx}`,serverId=num(serverResult.session_id,0),id=serverId||localId,sessions=clone(await global.odbGet('offlineV2RestaurantTableSessions'))||[],tables=clone(await global.odbGet('offlineV2RestaurantTables'))||[];
    const item={id,branch_id:runtimeBranch(),table_id:payload?.p_table_id,guest_count:Math.max(1,num(payload?.p_guest_count,1)),notes:payload?.p_notes??null,status:'open',client_tx_id:tx,opened_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2RestaurantTableSessions',[item,...sessions.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000));
    await global.odbSet('offlineV2RestaurantTables',tables.map(x=>String(x.id)===String(payload?.p_table_id)?{...x,status:'occupied',_offline_session_tx:tx}:x));
  }else if(type==='table_session_attach'){
    const links=clone(await global.odbGet('offlineV2RestaurantTableSessionOrders'))||[],sessionId=payload?.p_session_id||`offline-table-session-${text(payload?.p_session_open_tx)}`,orderId=payload?.p_order_id||`offline-${text(payload?.p_order_sale_tx)}`;
    const item={id:`offline-table-session-order-${tx}`,session_id:sessionId,order_id:orderId,client_tx_id:tx,created_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
    await global.odbSet('offlineV2RestaurantTableSessionOrders',[item,...links.filter(x=>String(x.client_tx_id||'')!==tx&&String(x.order_id)!==String(orderId))].slice(0,20000));
  }else if(type==='table_session_close'){
    const sessions=clone(await global.odbGet('offlineV2RestaurantTableSessions'))||[],tables=clone(await global.odbGet('offlineV2RestaurantTables'))||[],sessionKey=payload?.p_session_id||`offline-table-session-${text(payload?.p_session_open_tx)}`;let tableId=null;
    const next=sessions.map(x=>{if(String(x.id)!==String(sessionKey)&&String(x.client_tx_id||'')!==text(payload?.p_session_open_tx))return x;tableId=x.table_id;return {...x,status:'closed',closed_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'}});
    await global.odbSet('offlineV2RestaurantTableSessions',next);if(tableId!=null)await global.odbSet('offlineV2RestaurantTables',tables.map(x=>String(x.id)===String(tableId)?{...x,status:'available',_offline_session_tx:null}:x));
  }
  try{global.dispatchEvent(new CustomEvent('sharawla:offline-v2-projection-changed',{detail:{type,client_tx_id:tx,status:row?.status||'pending'}}))}catch{}
}
async function reconcileCompatibilityProjections(){
  const api=global.topBurgerDesktop?.offlineV2;if(!api?.outbox||typeof global.odbGet!=='function'||typeof global.odbSet!=='function')return;
  const rows=await api.outbox();if(!Array.isArray(rows)||!rows.length)return;
  const hasCustomers=rows.some(r=>['customer_create','customer_update'].includes(text(r?.operation_type)));
  const hasAddresses=rows.some(r=>['customer_address_save','customer_address_delete'].includes(text(r?.operation_type)));
  const hasOrders=rows.some(r=>text(r?.operation_type)==='delivery_assign_driver'||text(r?.operation_type)==='sale');
  const hasSuppliers=rows.some(r=>text(r?.operation_type)==='supplier_save');
  const hasDrivers=rows.some(r=>text(r?.operation_type)==='driver_save');
  const hasZones=rows.some(r=>text(r?.operation_type)==='zone_save');
  const hasFloors=rows.some(r=>text(r?.operation_type)==='floor_save');
  const hasTables=rows.some(r=>text(r?.operation_type)==='table_save'||['table_session_open','table_session_close'].includes(text(r?.operation_type)));
  const hasSessions=rows.some(r=>['table_session_open','table_session_close'].includes(text(r?.operation_type)));
  const hasSessionLinks=rows.some(r=>text(r?.operation_type)==='table_session_attach');
  const hasIngredients=rows.some(r=>text(r?.operation_type)==='ingredient_save');
  const hasIngredientConversions=rows.some(r=>text(r?.operation_type)==='ingredient_conversion_save');
  const hasRecipeDrafts=rows.some(r=>text(r?.operation_type)==='recipe_draft_save'||text(r?.operation_type)==='recipe_version_activate');
  const prepRows=rows.filter(r=>['prep_item_save','prep_recipe_draft_save'].includes(text(r?.operation_type)));
  const foodPoRows=rows.filter(r=>['food_po_create','food_po_approve','food_po_cancel'].includes(text(r?.operation_type)));
  const foodReceiptRows=rows.filter(r=>text(r?.operation_type)==='food_purchase_receive');
  const foodSupplierReturnRows=rows.filter(r=>text(r?.operation_type)==='food_supplier_return');
  const foodStockCountRows=rows.filter(r=>text(r?.operation_type)==='food_stock_count');
  const foodTransferRows=rows.filter(r=>['food_transfer_create','food_transfer_receive','food_transfer_cancel'].includes(text(r?.operation_type)));
  const foodAdjustmentRows=rows.filter(r=>text(r?.operation_type)==='food_ingredient_stock_adjust');
  const foodProductionRows=rows.filter(r=>['food_production_start','food_production_complete'].includes(text(r?.operation_type)));
  const foodWasteRows=rows.filter(r=>text(r?.operation_type)==='food_waste_post');
  const foodIngredientMasterRows=rows.filter(r=>['food_ingredient_save','food_ingredient_conversion_save'].includes(text(r?.operation_type)));
  const foodRecipeRows=rows.filter(r=>['food_recipe_save_draft','food_recipe_activate','food_prep_recipe_save_draft'].includes(text(r?.operation_type)));
  const foodPrepRows=rows.filter(r=>text(r?.operation_type)==='food_prep_item_save');
  let customers=hasCustomers?(clone(await global.odbGet('customersCache'))||[]):null;
  let addresses=hasAddresses?(clone(await global.odbGet('customerAddressesCache'))||[]):null;
  let bundles=hasOrders?(clone(await global.odbGet('cachedOrders'))||[]):null;
  let suppliers=hasSuppliers?(clone(await global.odbGet('offlineV2Suppliers'))||[]):null;
  let drivers=hasDrivers?(clone(await global.odbGet('offlineV2Drivers'))||[]):null;
  let zones=hasZones?(clone(await global.odbGet('offlineV2Zones'))||[]):null;
  let floors=hasFloors?(clone(await global.odbGet('offlineV2RestaurantFloors'))||[]):null;
  let tables=hasTables?(clone(await global.odbGet('offlineV2RestaurantTables'))||[]):null;
  let sessions=hasSessions?(clone(await global.odbGet('offlineV2RestaurantTableSessions'))||[]):null;
  let sessionLinks=hasSessionLinks?(clone(await global.odbGet('offlineV2RestaurantTableSessionOrders'))||[]):null;
  let ingredients=hasIngredients?(clone(await global.odbGet('offlineV2Ingredients'))||[]):null;
  let ingredientConversions=hasIngredientConversions?(clone(await global.odbGet('offlineV2IngredientConversions'))||[]):null;
  let recipeVersions=hasRecipeDrafts?(clone(await global.odbGet('offlineV2RecipeVersions'))||[]):null;
  let customersChanged=false,addressesChanged=false,ordersChanged=false,suppliersChanged=false,driversChanged=false,zonesChanged=false,floorsChanged=false,tablesChanged=false,sessionsChanged=false,sessionLinksChanged=false,ingredientsChanged=false,ingredientConversionsChanged=false,recipeVersionsChanged=false;
  for(const row of prepRows){const type=text(row?.operation_type),tx=text(row?.client_tx_id),payload=row?.envelope?.payload?.rpc_payload||{};await projectDirectOperation(type,payload,tx,row)}
  for(const row of foodPoRows){const type=text(row?.operation_type),tx=text(row?.client_tx_id),payload=row?.envelope?.payload?.rpc_payload||{};await projectDirectOperation(type,payload,tx,row)}
  for(const row of foodReceiptRows){const type=text(row?.operation_type),tx=text(row?.client_tx_id),payload=row?.envelope?.payload?.rpc_payload||{};await projectDirectOperation(type,payload,tx,row)}
  for(const row of foodSupplierReturnRows){const type=text(row?.operation_type),tx=text(row?.client_tx_id),payload=row?.envelope?.payload?.rpc_payload||{};await projectDirectOperation(type,payload,tx,row)}
  for(const row of foodStockCountRows){const type=text(row?.operation_type),tx=text(row?.client_tx_id),payload=row?.envelope?.payload?.rpc_payload||{};await projectDirectOperation(type,payload,tx,row)}
  for(const row of foodTransferRows){const type=text(row?.operation_type),tx=text(row?.client_tx_id),payload=row?.envelope?.payload?.rpc_payload||{};await projectDirectOperation(type,payload,tx,row)}
  for(const row of foodAdjustmentRows){const type=text(row?.operation_type),tx=text(row?.client_tx_id),payload=row?.envelope?.payload?.rpc_payload||{};await projectDirectOperation(type,payload,tx,row)}
  for(const row of foodProductionRows){const type=text(row?.operation_type),tx=text(row?.client_tx_id),payload=row?.envelope?.payload?.rpc_payload||{};await projectDirectOperation(type,payload,tx,row)}
  for(const row of foodWasteRows){const type=text(row?.operation_type),tx=text(row?.client_tx_id),payload=row?.envelope?.payload?.rpc_payload||{};await projectDirectOperation(type,payload,tx,row)}
  for(const row of foodIngredientMasterRows){const type=text(row?.operation_type),tx=text(row?.client_tx_id),payload=row?.envelope?.payload?.rpc_payload||{};await projectDirectOperation(type,payload,tx,row)}
  for(const row of foodRecipeRows){const type=text(row?.operation_type),tx=text(row?.client_tx_id),payload=row?.envelope?.payload?.rpc_payload||{};await projectDirectOperation(type,payload,tx,row)}
  for(const row of foodPrepRows){const type=text(row?.operation_type),tx=text(row?.client_tx_id),payload=row?.envelope?.payload?.rpc_payload||{};await projectDirectOperation(type,payload,tx,row)}
  for(const row of rows){
    const type=text(row?.operation_type),tx=text(row?.client_tx_id),payload=row?.envelope?.payload?.rpc_payload||{},created=text(row?.created_local_at)||nowIso(),serverResult=row?.server_ack?.result||{},pending=row?.status!=='synced';
    if(type==='customer_create'&&customers){
      const localId=`offline-customer-${tx}`,serverId=num(serverResult.customer_id,0),id=serverId||localId;
      const customer={id,name:text(payload?.p_name)||text(payload?.p_phone),phone:text(payload?.p_phone),area:payload?.p_area??null,address:payload?.p_address??null,notes:payload?.p_notes??null,created_at:created,client_tx_id:tx,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
      const phone=text(customer.phone).replace(/\D/g,'').slice(-10);
      customers=[customer,...customers.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx&&(!phone||text(x.phone).replace(/\D/g,'').slice(-10)!==phone))].slice(0,10000);
      customersChanged=true;
    }else if(type==='customer_update'&&customers){
      const localId=text(payload?.p_customer_id)||`offline-customer-${text(payload?.p_customer_create_tx)}`,serverId=num(serverResult.customer_id,0);
      const i=customers.findIndex(x=>String(x.id)===localId||String(x.id)===String(serverId)||String(x.client_tx_id||'')===text(payload?.p_customer_create_tx));
      const base=i>=0?customers[i]:{id:serverId||localId};
      const customer={...base,id:serverId||base.id,name:payload?.p_name??base.name,phone:payload?.p_phone??base.phone,area:payload?.p_area??null,address:payload?.p_address??null,notes:payload?.p_notes??null,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
      if(i>=0)customers.splice(i,1);customers.unshift(customer);customers=customers.slice(0,10000);customersChanged=true;
    }else if(type==='customer_address_save'&&addresses){
      const localId=`offline-customer_address_save-${tx}`,serverId=num(serverResult.address_id,0),id=serverId||localId;
      const customerId=serverResult.customer_id??payload?.p_customer_id??(payload?.p_customer_create_tx?`offline-customer-${payload.p_customer_create_tx}`:null);
      const address={id,customer_id:customerId,label:payload?.p_label??null,area:payload?.p_area??null,address:payload?.p_address??null,notes:payload?.p_notes??null,is_default:payload?.p_is_default===true,created_at:created,updated_at:created,client_tx_id:tx,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
      addresses=[address,...addresses.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_address_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,20000);addressesChanged=true;
    }else if(type==='customer_address_delete'&&addresses){
      const addressId=text(payload?.p_address_id)||`offline-customer_address_save-${text(payload?.p_address_save_tx)}`;
      const next=addresses.filter(x=>String(x.id)!==addressId&&String(x.client_tx_id||'')!==text(payload?.p_address_save_tx));
      if(next.length!==addresses.length){addresses=next;addressesChanged=true}
    }else if(type==='delivery_assign_driver'&&bundles){
      const orderId=text(payload?.p_order_id);let touched=false;
      for(const bundle of bundles){if(String(bundle?.order?.id)!==orderId)continue;bundle.order={...bundle.order,driver_id:num(payload?.p_driver_id),status:'out_for_delivery',assigned_at:created,_offline_status_pending:pending,_offline_status_tx:tx,_offline_status_at:created};touched=true}
      if(touched)ordersChanged=true;
    }else if(type==='supplier_save'&&suppliers){
      const localId=`offline-supplier-${tx}`,serverId=num(serverResult.supplier_id,0),id=serverId||localId;
      const supplier={id,name:text(payload?.p_name),phone:payload?.p_phone??null,email:payload?.p_email??null,tax_no:payload?.p_tax_no??null,address:payload?.p_address??null,notes:payload?.p_notes??null,active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
      suppliers=[supplier,...suppliers.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_supplier_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,5000);suppliersChanged=true;
    }else if(type==='driver_save'&&drivers){
      const localId=`offline-driver-${tx}`,serverId=num(serverResult.driver_id,0),id=serverId||localId;
      const driver={id,branch_id:num(payload?.p_branch_id),name:text(payload?.p_name),phone:payload?.p_phone??null,active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
      drivers=[driver,...drivers.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_driver_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,5000);driversChanged=true;
    }else if(type==='zone_save'&&zones){
      const localId=`offline-zone-${tx}`,serverId=num(serverResult.zone_id,0),id=serverId||localId;
      const zone={id,branch_id:num(payload?.p_branch_id),name:text(payload?.p_name),delivery_fee:num(payload?.p_delivery_fee),active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
      zones=[zone,...zones.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_zone_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,5000);zonesChanged=true;
    }else if(type==='floor_save'&&floors){
      const localId=`offline-floor-${tx}`,serverId=num(serverResult.floor_id,0),id=serverId||localId,item={id,branch_id:num(payload?.p_branch_id),name:text(payload?.p_name),sort_order:num(payload?.p_sort_order,100),active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
      floors=[item,...floors.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_floor_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,5000);floorsChanged=true;
    }else if(type==='table_save'&&tables){
      const localId=`offline-table-${tx}`,serverId=num(serverResult.table_id,0),id=serverId||localId,item={id,branch_id:num(payload?.p_branch_id),floor_id:payload?.p_floor_id??null,name:text(payload?.p_name),code:payload?.p_code??null,capacity:Math.max(1,num(payload?.p_capacity,2)),status:payload?.p_active===false?'disabled':'available',active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
      tables=[item,...tables.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_table_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,5000);tablesChanged=true;
    }else if(type==='table_session_open'&&sessions){
      const localId=`offline-table-session-${tx}`,serverId=num(serverResult.session_id,0),id=serverId||localId,item={id,branch_id:num(row?.branch_id,runtimeBranch()),table_id:payload?.p_table_id,guest_count:Math.max(1,num(payload?.p_guest_count,1)),notes:payload?.p_notes??null,status:'open',client_tx_id:tx,opened_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
      sessions=[item,...sessions.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000);sessionsChanged=true;
      if(tables){tables=tables.map(x=>String(x.id)===String(payload?.p_table_id)?{...x,status:'occupied',_offline_session_tx:pending?tx:null}:x);tablesChanged=true}
    }else if(type==='table_session_attach'&&sessionLinks){
      const sessionId=num(serverResult.session_id,0)||payload?.p_session_id||`offline-table-session-${text(payload?.p_session_open_tx)}`,orderId=num(serverResult.order_id,0)||payload?.p_order_id||`offline-${text(payload?.p_order_sale_tx)}`,item={id:`offline-table-session-order-${tx}`,session_id:sessionId,order_id:orderId,client_tx_id:tx,created_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
      sessionLinks=[item,...sessionLinks.filter(x=>String(x.client_tx_id||'')!==tx&&String(x.order_id)!==String(orderId))].slice(0,20000);sessionLinksChanged=true;
    }else if(type==='table_session_close'&&sessions){
      const sessionId=num(serverResult.session_id,0)||payload?.p_session_id||`offline-table-session-${text(payload?.p_session_open_tx)}`;let tableId=null;
      sessions=sessions.map(x=>{if(String(x.id)!==String(sessionId)&&String(x.client_tx_id||'')!==text(payload?.p_session_open_tx))return x;tableId=x.table_id;return {...x,id:num(serverResult.session_id,0)||x.id,status:'closed',closed_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'}});sessionsChanged=true;
      if(tables&&tableId!=null){tables=tables.map(x=>String(x.id)===String(tableId)?{...x,status:'available',_offline_session_tx:null}:x);tablesChanged=true}
    }else if(type==='recipe_version_activate'&&recipeVersions){
      const id=num(serverResult.recipe_version_id,0)||num(payload?.p_recipe_version_id,0);recipeVersions=recipeVersions.map(x=>String(x.id)===String(id)?{...x,status:'active',_offline:pending,_offline_sync_status:text(row?.status)||'pending',updated_at:created}:x);recipeVersionsChanged=true;
    }else if(type==='recipe_draft_save'&&recipeVersions){
      const localId=`offline-recipe-version-${tx}`,serverId=num(serverResult.recipe_version_id,0),id=serverId||localId,item={id,product_id:payload?.p_product_id,variant_id:payload?.p_variant_id??null,name:payload?.p_name??null,status:'draft',output_quantity:num(payload?.p_output_quantity,1),output_unit_code:payload?.p_output_unit_code,lines:clone(payload?.p_lines||[]),modifier_impacts:clone(payload?.p_modifier_impacts||[]),removal_mappings:clone(payload?.p_removal_mappings||[]),notes:payload?.p_notes??null,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
      recipeVersions=[item,...recipeVersions.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000);recipeVersionsChanged=true;
    }else if(type==='ingredient_save'&&ingredients){
      const localId=`offline-ingredient-${tx}`,serverId=num(serverResult.ingredient_id,0),id=serverId||localId,item={id,name:text(payload?.p_name),unit:payload?.p_base_unit_code,base_unit_code:payload?.p_base_unit_code,purchase_unit_code:payload?.p_purchase_unit_code||payload?.p_base_unit_code,sku:payload?.p_sku??null,barcode:payload?.p_barcode??null,cost_per_unit:num(payload?.p_cost_per_base_unit),minimum_quantity:num(payload?.p_minimum_quantity),track_inventory:payload?.p_track_inventory!==false,usable_yield_percent:num(payload?.p_usable_yield_percent,100),shelf_life_minutes:payload?.p_shelf_life_minutes??null,active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
      ingredients=[item,...ingredients.filter(x=>String(x.id)!==localId&&String(x.id)!==String(payload?.p_ingredient_id??'')&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,10000);ingredientsChanged=true;
    }else if(type==='ingredient_conversion_save'&&ingredientConversions){
      const localId=`offline-ingredient-conversion-${tx}`,serverId=num(serverResult.conversion_id,0),id=serverId||localId,ingredientId=num(serverResult.ingredient_id,0)||payload?.p_ingredient_id||(payload?.p_ingredient_create_tx?`offline-ingredient-${payload.p_ingredient_create_tx}`:null),item={id,ingredient_id:ingredientId,from_unit_code:payload?.p_from_unit_code,to_unit_code:payload?.p_to_unit_code,factor:num(payload?.p_factor),active:payload?.p_active!==false,client_tx_id:tx,created_at:created,updated_at:created,_offline:pending,_offline_sync_status:text(row?.status)||'pending'};
      ingredientConversions=[item,...ingredientConversions.filter(x=>String(x.id)!==localId&&String(x.id)!==String(id)&&String(x.client_tx_id||'')!==tx)].slice(0,20000);ingredientConversionsChanged=true;
    }else if(type==='sale'&&bundles){
      if(row?.status!=='synced'){const localId='offline-'+tx,order={...clone(payload?.p_order||{}),id:localId,client_tx_id:tx,invoice_number:null,bon_number:null,offline_reference:'OFF-'+text(tx).replace(/-/g,'').slice(0,10).toUpperCase(),_official_number_pending:true,created_at:created,payment_status:'confirmed',_offline:true,_offline_sync_status:text(row?.status)||'pending'},items=(clone(payload?.p_items)||[]).map((x,i)=>({...x,id:x.line_uid?localId+'-line-'+x.line_uid:localId+'-legacy-i'+(i+1),order_id:localId}));bundles=[{order,items},...bundles.filter(b=>String(b?.order?.id)!==localId&&String(b?.order?.client_tx_id||'')!==tx)].slice(0,250);ordersChanged=true;continue}

      const result=serverResult||{},serverOrder=result.order||null,serverId=text(serverOrder?.id||row?.server_ack?.server_entity_id);if(!serverId)continue;
      const localId=`offline-${tx}`;const before=bundles.length;
      bundles=bundles.filter(b=>String(b?.order?.id)!==localId&&String(b?.order?.client_tx_id||'')!==tx&&String(b?.order?.id)!==serverId);
      if(serverOrder)bundles.unshift({order:{...serverOrder,_offline:false,_official_number_pending:false},items:clone(result.items||[])});
      bundles=bundles.slice(0,250);if(serverOrder||bundles.length!==before)ordersChanged=true;
    }
  }
  const writes=[];
  if(customersChanged)writes.push(global.odbSet('customersCache',customers));
  if(addressesChanged)writes.push(global.odbSet('customerAddressesCache',addresses));
  if(ordersChanged)writes.push(global.odbSet('cachedOrders',bundles));
  if(suppliersChanged)writes.push(global.odbSet('offlineV2Suppliers',suppliers));
  if(driversChanged)writes.push(global.odbSet('offlineV2Drivers',drivers));
  if(zonesChanged)writes.push(global.odbSet('offlineV2Zones',zones));
  if(floorsChanged)writes.push(global.odbSet('offlineV2RestaurantFloors',floors));
  if(tablesChanged)writes.push(global.odbSet('offlineV2RestaurantTables',tables));
  if(sessionsChanged)writes.push(global.odbSet('offlineV2RestaurantTableSessions',sessions));
  if(sessionLinksChanged)writes.push(global.odbSet('offlineV2RestaurantTableSessionOrders',sessionLinks));
  if(ingredientsChanged)writes.push(global.odbSet('offlineV2Ingredients',ingredients));
  if(ingredientConversionsChanged)writes.push(global.odbSet('offlineV2IngredientConversions',ingredientConversions));
  if(recipeVersionsChanged)writes.push(global.odbSet('offlineV2RecipeVersions',recipeVersions));
  if(writes.length)await Promise.all(writes);
}
async function reconcileOrderStatusProjection(){
  if(typeof global.odbGet!=='function'||typeof global.odbSet!=='function'||typeof global.rest!=='function')return;
  const bundles=clone(await global.odbGet('cachedOrders'))||[];let changed=false;
  for(const bundle of bundles){
    const o=bundle?.order;if(!o?._offline_status_pending||!numericServerId(o.id))continue;
    try{
      const rows=await global.rest('orders',`select=id,status&id=eq.${Number(o.id)}&limit=1`);
      const server=rows?.[0];if(!server)continue;
      // Clear pending only after the server confirms the projected target.
      if(text(server.status)!==text(o.status))continue;
      bundle.order={...o,status:server.status};
      delete bundle.order._offline_status_pending;delete bundle.order._offline_status_tx;delete bundle.order._offline_status_at;
      changed=true;
    }catch(e){if(typeof global.isNetError==='function'&&global.isNetError(e))break;console.warn('Offline V2 order projection reconcile',e)}
  }
  if(changed)await global.odbSet('cachedOrders',bundles);
}
async function syncNow(){
  if(syncing)return {ok:true,skipped:'renderer_sync_running'};
  const api=global.topBurgerDesktop?.offlineV2;if(!api?.syncNow)return {ok:true,skipped:'transport_unavailable'};
  const st=await api.takeoverState();if(st?.active!==true||st?.migration_verified!==true||st?.transport_ready!==true)return {ok:true,skipped:'takeover_inactive'};
  syncing=true;try{const result=await api.syncNow(await syncContext());await reconcileOrderStatusProjection();await reconcileCompatibilityProjections();return result}finally{syncing=false}
}
async function attestTransport(){const api=global.topBurgerDesktop?.offlineV2;if(!api?.transportAttest)throw new Error('Offline V2 transport attestation unavailable');return api.transportAttest({...await syncContext(),approved:true})}
async function manualRetry(clientTx){
  const api=global.topBurgerDesktop?.offlineV2;if(!api?.manualRetry)throw new Error('Offline V2 manual retry unavailable');
  const c=await syncContext();const r=await api.manualRetry({client_tx_id:text(clientTx),device_id:c.device_id,business_id:c.business_id,device_fingerprint:c.device_fingerprint});
  try{await syncNow()}catch{}return r;
}
async function activeState(){const api=global.topBurgerDesktop?.offlineV2;if(!api?.takeoverState)return null;const st=await api.takeoverState();return st?.active===true&&st?.migration_verified===true&&st?.transport_ready===true?st:null}
function rememberFallback(type,tx){fallbackByType.set(type,{tx:text(tx),at:Date.now()})}
function consumeFallback(type){const x=fallbackByType.get(type);if(!x)return null;fallbackByType.delete(type);return Date.now()-x.at<=FALLBACK_CONTEXT_MS?x:null}
function networkDeferred(type,tx,row=null){rememberFallback(type,tx);const e=new TypeError('Failed to fetch');e.code=text(row?.last_error_code)||'OFFLINE_V2_DEFERRED';e.offline_v2_status=text(row?.status)||'pending';return e}
function durableError(row,tx){const e=new Error(text(row?.last_error_message)||`Offline V2 sync failed: ${text(row?.status)||'unknown'}`);e.code=text(row?.last_error_code)||'OFFLINE_V2_SYNC_TERMINAL';e.client_tx_id=text(tx);e.kind=row?.status==='conflict'?'business_conflict':'permanent';return e}
function onlineOnlyError(name,cause=null){const e=new Error(`العملية ${text(name)||'المطلوبة'} تحتاج اتصالًا بالإنترنت. لم تُسجل كحركة أوفلاين.`);e.code='ONLINE_ONLY_INTERNET_REQUIRED';if(cause)e.cause=cause;return e}
function networkFailure(error){return /failed to fetch|networkerror|load failed|network request failed/i.test(text(error?.message||error))}
function numericServerId(v){const n=Number(v);return Number.isFinite(n)&&n>0}
function mustUseOriginalEntityFallback(type,payload={}){
  if(type==='expense'||type==='shift_close')return !numericServerId(payload?.p_shift_id);
  if(type==='return')return !numericServerId(payload?.p_order_id)&&!localOrderTx(payload?.p_order_id);
  if(type==='order_status'||type==='delivery_assign_driver'||type==='delivery_mark_delivered')return !numericServerId(payload?.p_order_id);
  if(type==='delivery_driver_settle')return !numericServerId(payload?.p_driver_id)||!numericServerId(payload?.p_expected_receiving_shift_id)||(Array.isArray(payload?.p_order_ids)?payload.p_order_ids:[]).length===0||(payload.p_order_ids||[]).some(x=>!numericServerId(x));
  if(type==='customer_update')return !numericServerId(payload?.p_customer_id)&&!text(payload?.p_customer_create_tx);
  if(type==='customer_address_save'){
    const customerMissing=!numericServerId(payload?.p_customer_id)&&!text(payload?.p_customer_create_tx);
    const addressInvalid=payload?.p_address_id!=null&&!numericServerId(payload?.p_address_id)&&!text(payload?.p_address_save_tx);
    return customerMissing||addressInvalid;
  }
  if(type==='customer_address_delete')return !numericServerId(payload?.p_address_id)&&!text(payload?.p_address_save_tx);
  if(type==='floor_save')return payload?.p_floor_id!=null&&!numericServerId(payload?.p_floor_id);
  if(type==='supplier_save'&&payload?.p_supplier_id!=null)return !numericServerId(payload.p_supplier_id);
  if(type==='driver_save'&&payload?.p_driver_id!=null)return !numericServerId(payload.p_driver_id);
  if(type==='zone_save'&&payload?.p_zone_id!=null)return !numericServerId(payload.p_zone_id);
  if(type==='table_session_open')return !numericServerId(payload?.p_table_id);
  if(type==='table_session_attach'){
    const sessionMissing=!numericServerId(payload?.p_session_id)&&!text(payload?.p_session_open_tx);
    const orderMissing=!numericServerId(payload?.p_order_id)&&!text(payload?.p_order_sale_tx);
    return sessionMissing||orderMissing;
  }
  if(type==='table_session_close')return !numericServerId(payload?.p_session_id)&&!text(payload?.p_session_open_tx);
  if(type==='ingredient_save'&&payload?.p_ingredient_id!=null)return !numericServerId(payload.p_ingredient_id);
  if(type==='ingredient_conversion_save'){
    if(payload?.p_ingredient_id!=null&&!numericServerId(payload.p_ingredient_id)&&!text(payload?.p_ingredient_create_tx))return true;
  }
  if(type==='recipe_version_activate')return !numericServerId(payload?.p_recipe_version_id);
  if(type==='prep_item_save'){
    if(payload?.p_prep_item_id!=null&&!numericServerId(payload.p_prep_item_id))return true;
    if(payload?.p_output_ingredient_id!=null&&!numericServerId(payload.p_output_ingredient_id))return true;
  }
  if(type==='prep_recipe_draft_save'){
    if(!numericServerId(payload?.p_prep_item_id))return true;
    return (Array.isArray(payload?.p_lines)?payload.p_lines:[]).some(x=>!numericServerId(x?.ingredient_id));
  }
  if(type==='food_po_create')return !numericServerId(payload?.p_supplier_id)||(Array.isArray(payload?.p_items)?payload.p_items:[]).some(x=>!numericServerId(x?.ingredient_id));
  if(type==='food_po_approve'||type==='food_po_cancel')return !numericServerId(payload?.p_purchase_id);
  if(['inventory_supply_request_submit','inventory_supply_request_decide','inventory_supply_request_prepare','inventory_supply_request_dispatch','inventory_supply_request_receive'].includes(type))return !numericServerId(payload?.p_request_id);
  if(type==='food_purchase_receive')return !numericServerId(payload?.p_purchase_id)||(Array.isArray(payload?.p_items)?payload.p_items:[]).some(x=>!numericServerId(x?.purchase_item_id));
  if(type==='food_supplier_return')return (payload?.p_supplier_id!=null&&!numericServerId(payload.p_supplier_id))||(Array.isArray(payload?.p_items)?payload.p_items:[]).some(x=>!numericServerId(x?.ingredient_id));
  if(type==='food_stock_count')return (Array.isArray(payload?.p_items)?payload.p_items:[]).some(x=>!numericServerId(x?.ingredient_id));
  if(type==='food_transfer_create')return !numericServerId(payload?.p_from_branch_id)||!numericServerId(payload?.p_to_branch_id)||(Array.isArray(payload?.p_items)?payload.p_items:[]).some(x=>!numericServerId(x?.ingredient_id));
  if(type==='food_transfer_receive'||type==='food_transfer_cancel')return !numericServerId(payload?.p_transfer_id);
  if(type==='food_ingredient_stock_adjust')return !numericServerId(payload?.p_branch_id)||!numericServerId(payload?.p_ingredient_id);
  if(type==='food_production_start')return !numericServerId(payload?.p_branch_id)||!numericServerId(payload?.p_prep_item_id);
  if(type==='food_production_complete')return !numericServerId(payload?.p_production_batch_id)||(Array.isArray(payload?.p_consumptions)?payload.p_consumptions:[]).some(x=>!numericServerId(x?.ingredient_id));
  if(type==='food_waste_post')return !numericServerId(payload?.p_branch_id)||!numericServerId(payload?.p_ingredient_id)||(payload?.p_prep_item_id!=null&&!numericServerId(payload?.p_prep_item_id))||(payload?.p_shift_id!=null&&!numericServerId(payload?.p_shift_id));
  if(type==='food_ingredient_save')return payload?.p_ingredient_id!=null&&!numericServerId(payload?.p_ingredient_id);
  if(type==='food_ingredient_conversion_save')return !numericServerId(payload?.p_ingredient_id);
  if(type==='food_recipe_save_draft')return !numericServerId(payload?.p_product_id)||(payload?.p_variant_id!=null&&!numericServerId(payload?.p_variant_id))||(Array.isArray(payload?.p_lines)?payload.p_lines:[]).some(x=>!numericServerId(x?.ingredient_id))||(Array.isArray(payload?.p_modifier_impacts)?payload.p_modifier_impacts:[]).some(x=>!numericServerId(x?.modifier_id)||!numericServerId(x?.ingredient_id))||(Array.isArray(payload?.p_removal_mappings)?payload.p_removal_mappings:[]).some(x=>!numericServerId(x?.ingredient_id));
  if(type==='food_recipe_activate')return !numericServerId(payload?.p_recipe_version_id);
  if(type==='food_prep_item_save')return (payload?.p_prep_item_id!=null&&!numericServerId(payload?.p_prep_item_id))||(payload?.p_output_ingredient_id!=null&&!numericServerId(payload?.p_output_ingredient_id));
  if(type==='food_prep_recipe_save_draft')return !numericServerId(payload?.p_prep_item_id)||(Array.isArray(payload?.p_lines)?payload.p_lines:[]).some(x=>!numericServerId(x?.ingredient_id));
  if(type==='recipe_draft_save'){
    const refs=[...(Array.isArray(payload?.p_lines)?payload.p_lines:[]),...(Array.isArray(payload?.p_modifier_impacts)?payload.p_modifier_impacts:[]),...(Array.isArray(payload?.p_removal_mappings)?payload.p_removal_mappings:[])];
    return refs.some(x=>!numericServerId(x?.ingredient_id));
  }
  if(type==='table_save'){
    if(payload?.p_table_id!=null&&!numericServerId(payload?.p_table_id))return true;
    if(payload?.p_floor_id!=null&&!numericServerId(payload?.p_floor_id))return true;
  }
  return false;
}
function unwrapResult(type,row){const result=row?.server_ack?.result;if(type==='customer_create'||type==='customer_update'){const n=Number(result?.customer_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 customer ACK missing customer_id');return n}if(type==='customer_address_save'){const n=Number(result?.address_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 customer address ACK missing address_id');return n}if(type==='customer_address_delete')return result?.ok===true;if(type==='supplier_save'){const n=Number(result?.supplier_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 supplier ACK missing supplier_id');return n}if(type==='driver_save'){const n=Number(result?.driver_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 driver ACK missing driver_id');return n}if(type==='zone_save'){const n=Number(result?.zone_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 zone ACK missing zone_id');return n}if(type==='floor_save'){const n=Number(result?.floor_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 floor ACK missing floor_id');return n}if(type==='table_save'){const n=Number(result?.table_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 table ACK missing table_id');return n}if(type==='table_session_open'||type==='table_session_attach'||type==='table_session_close'){const n=Number(result?.session_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 table session ACK missing session_id');return n}if(type==='ingredient_save'){const n=Number(result?.ingredient_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 ingredient ACK missing ingredient_id');return n}if(type==='ingredient_conversion_save'){const n=Number(result?.conversion_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 ingredient conversion ACK missing conversion_id');return n}if(type==='food_purchase_receive'){const n=Number(result?.receipt_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 food receipt ACK missing receipt_id');return n}if(type==='food_supplier_return'){const n=Number(result?.supplier_return_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 food supplier return ACK missing supplier_return_id');return n}if(type==='food_stock_count'){const n=Number(result?.stock_count_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 food stock count ACK missing stock_count_id');return n}if(type==='food_transfer_create'||type==='food_transfer_receive'||type==='food_transfer_cancel'){const n=Number(result?.transfer_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 food transfer ACK missing transfer_id');return n}if(type==='food_ingredient_stock_adjust'){const n=Number(result?.adjustment_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 food ingredient adjustment ACK missing adjustment_id');return n}if(type==='food_production_start'||type==='food_production_complete'){const n=Number(result?.production_batch_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 food production ACK missing production_batch_id');return n}if(type==='food_waste_post'){const n=Number(result?.waste_event_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 food waste ACK missing waste_event_id');return n}if(type==='food_ingredient_save'){const n=Number(result?.ingredient_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 food ingredient ACK missing ingredient_id');return n}if(type==='food_ingredient_conversion_save'){const n=Number(result?.conversion_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 food ingredient conversion ACK missing conversion_id');return n}if(type==='food_recipe_save_draft'||type==='food_recipe_activate'||type==='food_prep_recipe_save_draft'){const n=Number(result?.recipe_version_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 food recipe ACK missing recipe_version_id');return n}if(type==='food_prep_item_save'){const n=Number(result?.prep_item_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 food prep item ACK missing prep_item_id');return n}if(type==='inventory_supply_request_create'){const n=Number(result?.request_id??result);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 supply request ACK missing request_id');return n}if(type==='food_po_create'||type==='food_po_approve'||type==='food_po_cancel'){const n=Number(result?.purchase_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 food PO ACK missing purchase_id');return n}if(type==='prep_item_save'){const n=Number(result?.prep_item_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 prep item ACK missing prep_item_id');return n}if(type==='prep_recipe_draft_save'||type==='recipe_draft_save'||type==='recipe_version_activate'){const n=Number(result?.recipe_version_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 recipe ACK missing recipe_version_id');return n}if(type==='return'){const n=Number(result?.return_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 return ACK missing return_id');return n}if(result===undefined||result===null)throw new Error('Offline V2 ACK missing operational result');return clone(result)}

async function salePayloadWithReservedBon(payload,identity){
  const out=clone(payload||{}),order=out?.p_order;
  if(!order||order.bon_reservation)return out;
  const api=global.topBurgerDesktop?.offlineV2;
  const branchId=num(order.branch_id,runtimeBranch()),shiftId=num(order.shift_id,0);
  if(!api?.nextReservedBon||typeof global.odbGet!=='function'||branchId<1||shiftId<1)return out;
  const open=await global.odbGet(`openShift:${runtimeEmployee()}:${branchId}`);
  const shiftOpenTx=text(open?.client_tx_id);
  if(!open||num(open.id,0)!==shiftId||text(open.status)!=='open'||!shiftOpenTx)return out;
  const evidence=await api.nextReservedBon({business_id:identity.business_id,branch_id:branchId,server_shift_id:shiftId,shift_open_tx_id:shiftOpenTx,device_fingerprint:identity.device_fingerprint});
  if(evidence)out.p_order={...order,bon_reservation:clone(evidence)};
  return out;
}
async function ensureEvent(type,payload,tx){
  const api=global.topBurgerDesktop?.offlineV2;if(!api?.event||!api?.commitOperation)throw new Error('Offline V2 event bridge unavailable');
  let row=await api.event(tx);if(row)return row;
  const a=adaptersByType.get(type);if(!a)throw new Error(`Offline V2 transport adapter missing: ${type}`);
  const identity=await canonicalIdentity();
  const durablePayload=type==='sale'?await salePayloadWithReservedBon(payload,identity):clone(payload);
  await api.commitOperation(a.buildCommit({payload:durablePayload,clientTx:tx,identity,createdAt:nowIso()}));
  row=await api.event(tx);if(!row)throw new Error(`Offline V2 durable event missing after commit: ${tx}`);return row;
}
async function authoritativeRpc(name,payload={}){
  const type=typeByRpc.get(text(name));
  if(!type){
    if(global.navigator?.onLine===false)throw onlineOnlyError(name);
    try{return await bridge.rpc(name,payload)}catch(error){if(networkFailure(error))throw onlineOnlyError(name,error);throw error}
  }
  if(!(await activeState()))return bridge.rpc(name,payload);
  const a=adaptersByType.get(type),tx=text(a?.extractTx?.(payload));
  if(!tx){const e=new Error(`Offline V2 operational RPC requires client_tx_id: ${type}`);e.code='OFFLINE_V2_CLIENT_TX_REQUIRED';throw e}
  if(mustUseOriginalEntityFallback(type,payload))throw networkDeferred(type,tx);
  let row=await ensureEvent(type,payload,tx);await projectDirectOperation(type,payload,tx,row);
  if(row.last_error_code==='OFFLINE_V2_LEGACY_PRESERVED'){const e=durableError(row,tx);e.code='OFFLINE_V2_LEGACY_AUTHORITY_ACTIVE';throw e}
  if(row.status==='synced')return unwrapResult(type,row);
  try{await syncNow()}catch(e){/* row state below is authoritative */}
  row=await global.topBurgerDesktop.offlineV2.event(tx);
  if(row?.status==='synced'){await projectDirectOperation(type,payload,tx,row);return unwrapResult(type,row)}
  if(row?.last_error_code==='OFFLINE_V2_LEGACY_PRESERVED'){const e=durableError(row,tx);e.code='OFFLINE_V2_LEGACY_AUTHORITY_ACTIVE';throw e}
  if(row?.status==='conflict'||row?.status==='dead_letter')throw durableError(row,tx);
  // pending/retryable/syncing/dependency/auth blocked are durable local work and
  // must flow through the caller's existing offline-success branch, never through
  // the legacy server RPC.
  throw networkDeferred(type,tx,row);
}

async function commitOptionalTxRpc(name,payload={},options={}){
  const canonical={...clone(payload)};delete canonical.p_client_tx_id;for(const k of Array.isArray(options?.stripKeys)?options.stripKeys:[])delete canonical[k];
  const t=typeByRpc.get(text(name)),active=await activeState(),offline=global.navigator?.onLine===false;
  if(!t){if(offline)throw onlineOnlyError(name);return bridge.rpc(name,canonical)}
  if(active){const withTx={...canonical,p_client_tx_id:text(payload?.p_client_tx_id)||text(global.crypto?.randomUUID?.())};if(!withTx.p_client_tx_id){const e=new Error('Offline V2 operational RPC requires client_tx_id');e.code='OFFLINE_V2_CLIENT_TX_REQUIRED';throw e}return offline?commitRpcLocal(name,withTx):authoritativeRpc(name,withTx)}
  if(offline){const e=new Error('Offline operation has no safe active mutation owner');e.code='OFFLINE_OPERATION_NO_SAFE_OWNER';throw e}
  return bridge.rpc(name,canonical);
}
async function commitRpcLocal(name,payload={}){
  const type=typeByRpc.get(text(name));
  if(!type)throw Object.assign(new Error(`Offline V2 local result target is not registered: ${text(name)}`),{code:'OFFLINE_V2_OPERATION_UNREGISTERED'});
  if(!(await activeState()))throw Object.assign(new Error('Offline V2 takeover is not active'),{code:'OFFLINE_V2_TAKEOVER_INACTIVE'});
  const a=adaptersByType.get(type),tx=text(a?.extractTx?.(payload));
  if(!tx)throw Object.assign(new Error(`Offline V2 operational RPC requires client_tx_id: ${type}`),{code:'OFFLINE_V2_CLIENT_TX_REQUIRED'});
  if(mustUseOriginalEntityFallback(type,payload))throw Object.assign(new Error('Offline V2 local dependency is not identified'),{code:'OFFLINE_V2_LOCAL_DEPENDENCY_REQUIRED'});
  let row=await ensureEvent(type,payload,tx);await projectDirectOperation(type,payload,tx,row);
  if(row?.status!=='synced'&&global.navigator?.onLine!==false)setTimeout(()=>{syncNow().catch(()=>{})},0);
  row=await global.topBurgerDesktop.offlineV2.event(tx);
  if(row?.status==='conflict'||row?.status==='dead_letter'||row?.last_error_code==='OFFLINE_V2_LEGACY_PRESERVED')throw durableError(row,tx);
  await projectDirectOperation(type,payload,tx,row);
  let result;
  if(row?.status==='synced')result=unwrapResult(type,row);
  else if(type==='sale'){const localId='offline-'+tx,all=clone(await global.odbGet('cachedOrders'))||[],b=all.find(x=>String(x?.order?.id)===localId||String(x?.order?.client_tx_id||'')===tx),durable=clone(row?.envelope?.payload?.rpc_payload)||clone(payload)||{},rb=num(durable?.p_order?.bon_reservation?.bon_number,0);result=b||{order:{...clone(durable?.p_order||{}),id:localId,client_tx_id:tx,bon_number:rb||null,offline_reference:rb?null:'OFF-'+text(tx).replace(/-/g,'').slice(0,10).toUpperCase(),_offline:true,_official_number_pending:!rb,created_at:nowIso()},items:clone(durable?.p_items||[])}}
  else if(type==='return'){const localId='offline-ret-'+tx,all=clone(await global.odbGet('cachedReturns:'+runtimeBranch()))||[],r=all.find(x=>String(x.id)===localId||String(x.client_tx_id||'')===tx);result=r||{id:localId,return_number:'OFF-'+tx.slice(0,6),branch_id:runtimeBranch(),order_id:payload?.p_order_id,reason:payload?.p_reason,total:Number(payload?.p_payments?.[0]?.amount||0),created_at:nowIso(),client_tx_id:tx,_offline:true}}
     else if(type==='shift_open')result=`offline-shift-${tx}`;
   else if(type==='expense')result=`offline-exp-${tx}`;
   else if(type==='shift_close')result={...clone(payload?.p_metrics||{}),id:payload?.p_shift_id,status:'closed',closing_cash:Number(payload?.p_closing_cash||0),closed_at:nowIso(),client_tx_id:tx,_offline:true};
   else if(type==='customer_create')result=`offline-customer-${tx}`;
  else if(type==='customer_update')result=payload.p_customer_id??`offline-customer-${text(payload.p_customer_create_tx)}`;
  else if(type==='customer_address_save')result=`offline-customer_address_save-${tx}`;
  else if(type==='customer_address_delete')result=true;
  else if(type==='delivery_assign_driver')result={ok:true,order_id:payload.p_order_id,driver_id:payload.p_driver_id,status:'out_for_delivery',client_tx_id:tx,_offline:true};
  else if(type==='delivery_mark_delivered')result={ok:true,order:{id:payload.p_order_id,status:'delivered',payment_method:payload.p_payment_method},client_tx_id:tx,_offline:true};
  else if(type==='delivery_driver_settle')result={ok:true,order_ids:clone(payload.p_order_ids)||[],receiving_shift_id:payload.p_expected_receiving_shift_id,client_tx_id:tx,_offline:true};
  else if(type==='supplier_save')result=`offline-supplier-${tx}`;
  else if(type==='driver_save')result=`offline-driver-${tx}`;
  else if(type==='zone_save')result=`offline-zone-${tx}`;
  else if(type==='floor_save')result=`offline-floor-${tx}`;
  else if(type==='table_save')result=`offline-table-${tx}`;
  else if(type==='table_session_open')result=`offline-table-session-${tx}`;
  else if(type==='table_session_attach'||type==='table_session_close')result=payload?.p_session_id||`offline-table-session-${payload?.p_session_open_tx}`;
  else if(type==='ingredient_save')result=`offline-ingredient-${tx}`;
  else if(type==='ingredient_conversion_save')result=`offline-ingredient-conversion-${tx}`;
  else if(type==='recipe_draft_save')result=`offline-recipe-version-${tx}`;
  else if(type==='recipe_version_activate')result=payload?.p_recipe_version_id;
  else if(type==='food_po_create')result=`offline-food-po-${tx}`;
  else if(type==='food_po_approve'||type==='food_po_cancel')result=payload?.p_purchase_id;
  else if(type==='food_purchase_receive')result=`offline-food-receipt-${tx}`;
  else if(type==='food_supplier_return')result=`offline-food-supplier-return-${tx}`;
  else if(type==='food_stock_count')result=`offline-food-stock-count-${tx}`;
  else if(type==='food_transfer_create')result=`offline-food-transfer-${tx}`;
  else if(type==='food_transfer_receive'||type==='food_transfer_cancel')result=payload?.p_transfer_id;
  else if(type==='food_ingredient_stock_adjust')result=`offline-food-ingredient-adjustment-${tx}`;
  else if(type==='food_production_start')result=`offline-food-production-batch-${tx}`;
  else if(type==='food_production_complete')result=payload?.p_production_batch_id;
  else if(type==='food_waste_post')result=`offline-food-waste-${tx}`;
  else if(type==='food_ingredient_save')result=payload?.p_ingredient_id||`offline-food-ingredient-${tx}`;
  else if(type==='food_ingredient_conversion_save')result=`offline-food-ingredient-conversion-${tx}`;
  else if(type==='food_recipe_save_draft')result=`offline-food-recipe-version-${tx}`;
  else if(type==='food_recipe_activate')result=payload?.p_recipe_version_id;
  else if(type==='food_prep_item_save')result=payload?.p_prep_item_id||`offline-food-prep-item-${tx}`;
  else if(type==='food_prep_recipe_save_draft')result=`offline-food-recipe-version-${tx}`;
   else if(type==='inventory_supply_request_create')result=`offline-supply-request-${tx}`;
   else if(['inventory_supply_request_submit','inventory_supply_request_decide','inventory_supply_request_prepare','inventory_supply_request_dispatch','inventory_supply_request_receive'].includes(type))result=payload?.p_request_id;
  else result={ok:true,client_tx_id:tx,_offline:true};
  return {ok:true,durable:true,synced:row?.status==='synced',status:text(row?.status)||'pending',client_tx_id:tx,local_entity_id:text(row?.local_entity_id)||null,result,row};
}

function installFallbackWrappers(){
  const saveExpense=bridge.saveOfflineExpense,saveShiftOpen=bridge.saveOfflineShiftOpen,saveReturn=bridge.saveOfflineReturn,saveShiftClose=bridge.saveOfflineShiftClose;
  if(saveExpense){const f=async(shift,description,amount,provided=null)=>{const x=provided?null:consumeFallback('expense');return saveExpense(shift,description,amount,provided||x?.tx||null)};try{saveOfflineExpense=f}catch{};global.saveOfflineExpense=f}
  if(saveShiftOpen){const f=async(opening,provided=null)=>{const x=provided?null:consumeFallback('shift_open');return saveShiftOpen(opening,provided||x?.tx||null)};try{saveOfflineShiftOpen=f}catch{};global.saveOfflineShiftOpen=f}
  if(saveReturn){const f=async(o,selected,reason,notes,method,total,available,provided=null)=>{const x=provided?null:consumeFallback('return');return saveReturn(o,selected,reason,notes,method,total,available,provided||x?.tx||null)};try{saveOfflineReturn=f}catch{};global.saveOfflineReturn=f}
  if(saveShiftClose){const f=async(shift,metrics,actual,provided=null)=>{const x=provided?null:consumeFallback('shift_close');return saveShiftClose(shift,metrics,actual,provided||x?.tx||null)};try{saveOfflineShiftClose=f}catch{};global.saveOfflineShiftClose=f}
}
function captureBridge(){
  const r=(typeof rpc==='function'?rpc:global.rpc);
  if(typeof r!=='function')return false;
  bridge={rpc:r,saveOfflineExpense:(typeof saveOfflineExpense==='function'?saveOfflineExpense:global.saveOfflineExpense),saveOfflineShiftOpen:(typeof saveOfflineShiftOpen==='function'?saveOfflineShiftOpen:global.saveOfflineShiftOpen),saveOfflineReturn:(typeof saveOfflineReturn==='function'?saveOfflineReturn:global.saveOfflineReturn),saveOfflineShiftClose:(typeof saveOfflineShiftClose==='function'?saveOfflineShiftClose:global.saveOfflineShiftClose)};
  return true;
}
function installAuthority(){
  if(installed)return true;if(!captureBridge())return false;
  try{rpc=authoritativeRpc}catch{};global.rpc=authoritativeRpc;installFallbackWrappers();installed=true;return true;
}
function start(){
  if(!registerTransportAdapters())return setTimeout(start,80);
  if(!installAuthority())return setTimeout(start,80);
  global.addEventListener('online',()=>{syncNow().catch(e=>console.warn('Offline V2 online sync',e))});
  timer=setInterval(()=>{if(navigator.onLine)syncNow().catch(()=>{})},60_000);
  global.SharawlaOfflineV2Transport=Object.freeze({version:VERSION,syncNow,manualRetry,attestTransport,resolveSale,resolveReturn,commitRpc:authoritativeRpc,commitRpcLocal,commitOptionalTxRpc,isActive:activeState,reconcileCompatibilityProjections,validatePoint4Identity:(type,payload)=>clone(assertPoint4Payload(type,clone(payload))),registerTransportAdapters,authoritativeRpc});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
