'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const need=(src,token,label)=>{if(!src.includes(token))throw new Error(`${label} missing: ${token}`)};
const reject=(src,pattern,label)=>{if(pattern.test(src))throw new Error(label)};

const app=read('app.js');
const transport=read('beta45-offline-v2-transport-runtime.js');
const takeover=read('beta45-offline-v2-runtime-takeover.js');
const recovery=read('beta55-4-runtime-recovery.js');
const nativeStore=read('beta45-offline-v2-native-store.js');
const customerCreate=read('permissions-v2-customers-create-routing.js');
const customerEdit=read('permissions-v2-customers-edit-address-routing.js');
const driver=read('permissions-v2-order-driver-assignment-routing.js');
const hardening=read('beta55-5-runtime-hardening.js');

for(const token of [
  'async function commitRpcLocal(',
  'await projectDirectOperation(type,payload,tx,row)',
  'await reconcileCompatibilityProjections()',
  'commitRpcLocal,isActive:activeState,reconcileCompatibilityProjections'
])need(transport,token,'durable local-success transport');

for(const token of [
  "operation_type)==='customer_update'",
  "operation_type)==='customer_address_save'",
  "operation_type)==='customer_address_delete'"
])need(nativeStore,token,'native dependency validation');

for(const [src,label] of [[customerCreate,'customer create'],[customerEdit,'customer edit/address'],[driver,'driver assignment']])
  need(src,'commitRpcLocal',`${label} durable owner`);
need(customerCreate,'استيراد ملف العملاء يحتاج إنترنت. لم يتم استيراد أي صف.','bulk customer import fail-closed');

need(recovery,'async function nativeProjection()','native outbox read projection');
for(const token of ["table==='orders'","table==='order_items'","table==='customers'","table==='customer_addresses'","table==='delivery_drivers'"])
  need(recovery,token,'cached operational screen fallback');
need(recovery,'offset=(\\d+)','cached pagination offset');
need(recovery,"order=([a-zA-Z0-9_]+)\\.(asc|desc)",'cached query ordering');
need(recovery,"'invoice_number','bon_number'",'cached official-number search filters');
need(recovery,"parseEq(query,'returns.order_id')",'return-item parent filter');
reject(recovery,/\['driver_settlements','website_orders'/,'live Cloud tables must not fall back to a misleading empty dataset');
need(recovery,"rowTx&&text(out[i]?.client_tx_id)===rowTx",'ACK projection deduplicates matching local client TX');
need(recovery,"type==='shift_open'",'native shift-open projection');
need(recovery,"type==='shift_close'",'native shift-close projection');

need(takeover,'p_shift_id:o?._offline_return_shift_id??null','offline return shift projection');
need(takeover,'shiftHistory:${runtimeBranch()}','offline shift history projection');
need(app,'o._offline_return_shift_id=sh.id','return binds active local shift');
need(app,'const id=b.dataset.returnDetails','local return detail id preserved');
need(app,'deleteAddress(del.dataset.deleteAddress)','local address delete id preserved');

reject(app,/openDriverPicker[\s\S]{0,1800}navigator\.onLine===false\)throw new Error/,'driver picker still blocks durable Offline owner');
need(app,'تم حفظ تسليم الطلب إلى ${d.name} للمزامنة','driver assignment local-success UX');
need(app,'هذه الشاشة تحتاج اتصالًا بالإنترنت.','online-orders explicit fail-closed screen');
reject(app,/rest\('website_orders',[^\n]*\.catch\(\(\)=>\[\]\)/,'online orders still collapses network failure to empty data');
need(app,'عرض إيصال الدفع يحتاج اتصالًا بالإنترنت. لم يتم تغيير أي بيانات.','cloud receipt fail-closed UX');
need(transport,"e.code='ONLINE_ONLY_INTERNET_REQUIRED'",'unregistered Cloud RPC fail-closed UX');
need(recovery,'راجع البيانات بعد رجوع الاتصال قبل إعادة المحاولة','REST mutation lost-ACK warning');
need(recovery,"publishFallback(table,networkFailed?'network-failure':'offline')",'DNS/fetch cache fallback state');
for(const page of ['home','orders','returns','customers','deliveryOrders','kitchen','reports'])
  need(hardening,`${page}:Object.freeze(`,`${page} visible Offline contract`);
need(hardening,'وضع أوفلاين — بيانات محلية','cached-data stale label');
need(hardening,'sharawla:offline-cache-fallback','DNS/fetch stale-label event');

// RC1 official numbering: Offline uses a local reference only; the server trigger owns
// invoice/bon allocation and ACK reconciliation installs the authoritative server row.
need(takeover,'invoice_number:null,bon_number:null,offline_reference:offlineReference,_official_number_pending:true','native local-reference numbering contract');
reject(takeover,/invoice_number:code|bon_number:code/,'native takeover still invents official OFF-* numbers');

for(const src of [app,transport,takeover,recovery,nativeStore,customerCreate,customerEdit,driver,hardening])
  reject(src,/Seq(?:293|304|316)/i,'protected historical evidence was referenced by runtime source');

async function proveRouterLocalSuccess(){
  const calls=[];
  const window={navigator:{onLine:false},crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(calls.length+1).padStart(12,'0')}`}};
  window.window=window;
  window.SharawlaOfflineV2Transport={
    isActive:async()=>true,
    commitRpcLocal:async(name,payload)=>{calls.push({name,payload});const tx=payload.p_client_tx_id;let result=true;if(name==='offline_customer_create_v1')result=`offline-customer-${tx}`;else if(name==='offline_customer_update_v1')result=payload.p_customer_id??`offline-customer-${payload.p_customer_create_tx}`;else if(name==='offline_customer_address_save_v1')result=`offline-customer_address_save-${tx}`;else if(name==='offline_delivery_assign_driver_v1')result={ok:true,order_id:payload.p_order_id};return {durable:true,synced:false,status:'pending',result}}
  };
  const context=vm.createContext({window,console});
  vm.runInContext(customerCreate,context,{filename:'permissions-v2-customers-create-routing.js'});
  vm.runInContext(customerEdit,context,{filename:'permissions-v2-customers-edit-address-routing.js'});
  vm.runInContext(driver,context,{filename:'permissions-v2-order-driver-assignment-routing.js'});
  const customerId=await window.__SharawlaPV2CustomerCreate.createCustomer({name:'عميل تجريبي',phone:'01000000000'});
  if(!String(customerId).startsWith('offline-customer-'))throw new Error('customer create did not return durable local success');
  await window.__SharawlaPV2CustomerEditAddress.updateCustomer({id:customerId,name:'عميل معدل',phone:'01000000000'});
  const update=calls.at(-1);if(update.payload.p_customer_id!==null||!update.payload.p_customer_create_tx)throw new Error('local customer update dependency was not preserved');
  const addressId=await window.__SharawlaPV2CustomerEditAddress.saveAddress({customer_id:customerId,label:'المنزل',address:'عنوان'});
  const address=calls.at(-1);if(address.payload.p_customer_id!==null||!address.payload.p_customer_create_tx)throw new Error('local customer address dependency was not preserved');
  await window.__SharawlaPV2CustomerEditAddress.deleteAddress(addressId);
  if(!calls.at(-1).payload.p_address_save_tx)throw new Error('local address delete dependency was not preserved');
  const localOrder='offline-00000000-0000-4000-8000-000000000099';
  await window.__SharawlaPV2OrderDriverAssignment.assignDriver(localOrder,7);
  if(calls.at(-1).payload.p_order_id!==localOrder)throw new Error('local order driver assignment id was coerced');
}

proveRouterLocalSuccess().then(()=>{
  console.log('Beta58.30 practical Offline RC1 regression gate PASS');
  console.log('Official numbering contract: local reference only → server allocation → ACK reconciliation');
}).catch(error=>{console.error(error.stack||error);process.exitCode=1});
