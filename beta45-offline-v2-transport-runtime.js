(function(global){
'use strict';

// Sharawla Offline Engine V2 — Phase 5 renderer bridge.
// Once controlled takeover is active, mapped operational RPCs use the V2
// outbox/explicit-ACK transport as their only network authority. Inactive mode
// delegates unchanged to the protected Phase 4/legacy runtime.
const VERSION='10.5.4-beta.58.33';
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
  if(type==='shift_close')return {rpc_name:'close_pos_shift_idempotent',rpc_payload:clone(payload)};
  if(type==='order_status')return {rpc_name:'order_status_apply_offline_v2',rpc_payload:clone(payload)};
  if(type==='customer_create')return {rpc_name:'offline_customer_create_v1',rpc_payload:clone(payload)};
  if(type==='customer_update')return {rpc_name:'offline_customer_update_v1',rpc_payload:clone(payload)};
  if(type==='customer_address_save')return {rpc_name:'offline_customer_address_save_v1',rpc_payload:clone(payload)};
  if(type==='customer_address_delete')return {rpc_name:'offline_customer_address_delete_v1',rpc_payload:clone(payload)};
  if(type==='delivery_assign_driver')return {rpc_name:'offline_delivery_assign_driver_v1',rpc_payload:clone(payload)};
  throw new Error(`Offline V2 transport target is not registered: ${type}`);
}
function dependencyTx(type,payload={}){
  if(type==='sale')return localShiftTx(payload?.p_order?.shift_id);
  if(type==='expense'||type==='shift_close')return localShiftTx(payload?.p_shift_id);
  if(type==='return'||type==='order_status'||type==='delivery_assign_driver')return localOrderTx(payload?.p_order_id);
  if(type==='customer_update'&&text(payload?.p_customer_create_tx))return text(payload.p_customer_create_tx);
  if(type==='customer_address_save'&&text(payload?.p_address_save_tx))return text(payload.p_address_save_tx);
  if(type==='customer_address_save'&&text(payload?.p_customer_create_tx))return text(payload.p_customer_create_tx);
  if(type==='customer_address_delete'&&text(payload?.p_address_save_tx))return text(payload.p_address_save_tx);
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
  registerOne('shift_close',adapter('shift_close','shift_event',['close_pos_shift_idempotent']));
  registerOne('order_status',adapter('order_status','order_event',['order_status_apply_offline_v2']));
  registerOne('customer_create',adapter('customer_create','customer',['offline_customer_create_v1']));
  registerOne('customer_update',adapter('customer_update','customer',['offline_customer_update_v1']));
  registerOne('customer_address_save',adapter('customer_address_save','customer_address',['offline_customer_address_save_v1']));
  registerOne('customer_address_delete',adapter('customer_address_delete','customer_address',['offline_customer_address_delete_v1']));
  registerOne('delivery_assign_driver',adapter('delivery_assign_driver','order_event',['offline_delivery_assign_driver_v1']));
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
  if(type==='customer_create'){
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
  }
  try{global.dispatchEvent(new CustomEvent('sharawla:offline-v2-projection-changed',{detail:{type,client_tx_id:tx,status:row?.status||'pending'}}))}catch{}
}
async function reconcileCompatibilityProjections(){
  const api=global.topBurgerDesktop?.offlineV2;if(!api?.outbox||typeof global.odbGet!=='function'||typeof global.odbSet!=='function')return;
  const rows=await api.outbox();if(!Array.isArray(rows)||!rows.length)return;
  const hasCustomers=rows.some(r=>['customer_create','customer_update'].includes(text(r?.operation_type)));
  const hasAddresses=rows.some(r=>['customer_address_save','customer_address_delete'].includes(text(r?.operation_type)));
  const hasOrders=rows.some(r=>text(r?.operation_type)==='delivery_assign_driver'||(text(r?.operation_type)==='sale'&&r?.status==='synced'));
  let customers=hasCustomers?(clone(await global.odbGet('customersCache'))||[]):null;
  let addresses=hasAddresses?(clone(await global.odbGet('customerAddressesCache'))||[]):null;
  let bundles=hasOrders?(clone(await global.odbGet('cachedOrders'))||[]):null;
  let customersChanged=false,addressesChanged=false,ordersChanged=false;
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
    }else if(type==='sale'&&row?.status==='synced'&&bundles){
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
  if(type==='order_status'||type==='delivery_assign_driver')return !numericServerId(payload?.p_order_id);
  if(type==='customer_update')return !numericServerId(payload?.p_customer_id)&&!text(payload?.p_customer_create_tx);
  if(type==='customer_address_save'){
    const customerMissing=!numericServerId(payload?.p_customer_id)&&!text(payload?.p_customer_create_tx);
    const addressInvalid=payload?.p_address_id!=null&&!numericServerId(payload?.p_address_id)&&!text(payload?.p_address_save_tx);
    return customerMissing||addressInvalid;
  }
  if(type==='customer_address_delete')return !numericServerId(payload?.p_address_id)&&!text(payload?.p_address_save_tx);
  return false;
}
function unwrapResult(type,row){const result=row?.server_ack?.result;if(type==='customer_create'||type==='customer_update'){const n=Number(result?.customer_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 customer ACK missing customer_id');return n}if(type==='customer_address_save'){const n=Number(result?.address_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 customer address ACK missing address_id');return n}if(type==='customer_address_delete')return result?.ok===true;if(type==='return'){const n=Number(result?.return_id);if(!Number.isFinite(n)||n<=0)throw new Error('Offline V2 return ACK missing return_id');return n}if(result===undefined||result===null)throw new Error('Offline V2 ACK missing operational result');return clone(result)}

async function ensureEvent(type,payload,tx){
  const api=global.topBurgerDesktop?.offlineV2;if(!api?.event||!api?.commitOperation)throw new Error('Offline V2 event bridge unavailable');
  let row=await api.event(tx);if(row)return row;
  const a=adaptersByType.get(type);if(!a)throw new Error(`Offline V2 transport adapter missing: ${type}`);
  const identity=await canonicalIdentity();
  await api.commitOperation(a.buildCommit({payload:clone(payload),clientTx:tx,identity,createdAt:nowIso()}));
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
  else if(type==='customer_create')result=`offline-customer-${tx}`;
  else if(type==='customer_update')result=payload.p_customer_id??`offline-customer-${text(payload.p_customer_create_tx)}`;
  else if(type==='customer_address_save')result=`offline-customer_address_save-${tx}`;
  else if(type==='customer_address_delete')result=true;
  else if(type==='delivery_assign_driver')result={ok:true,order_id:payload.p_order_id,driver_id:payload.p_driver_id,status:'out_for_delivery',client_tx_id:tx,_offline:true};
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
  global.SharawlaOfflineV2Transport=Object.freeze({version:VERSION,syncNow,manualRetry,attestTransport,resolveSale,resolveReturn,commitRpc:authoritativeRpc,commitRpcLocal,isActive:activeState,reconcileCompatibilityProjections,validatePoint4Identity:(type,payload)=>clone(assertPoint4Payload(type,clone(payload))),registerTransportAdapters,authoritativeRpc});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
