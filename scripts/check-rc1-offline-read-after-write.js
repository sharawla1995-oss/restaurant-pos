'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const recoverySource=fs.readFileSync(path.join(root,'beta55-4-runtime-recovery.js'),'utf8');
const appSource=fs.readFileSync(path.join(root,'app.js'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function nativeEvent(type,tx,payload,options={}){
 return {
  operation_type:type,client_tx_id:tx,status:options.status||'pending',branch_id:options.branchId??1,employee_id:options.employeeId??7,
  local_entity_id:options.localId||`offline-${type}-${tx}`,created_local_at:options.created||'2026-09-27T10:00:00.000Z',
  envelope:{payload:{rpc_payload:payload}},server_ack:options.ack||null
 };
}
function saleEvent(tx,options={}){
 const id=options.localId||`offline-${tx}`;
 return nativeEvent('sale',tx,{p_order:{branch_id:options.branchId??1,employee_id:7,shift_id:options.shiftId||'offline-shift-main',order_type:options.orderType||'delivery',status:options.statusValue||'new',source:'pos',payment_status:'confirmed',payment_method:options.method||'cash',customer_phone:options.phone||'01011111111',total:options.total??100,document_uid:`sale-doc-${tx}`,source_document_id:`sale-src-${tx}`},p_items:[{line_uid:`line-${tx}`,product_name:'Burger',quantity:1,total:options.total??100}],p_payments:[{method:options.method||'cash',amount:options.total??100}]},{...options,localId:id});
}

async function makeRecovery(options={}){
 const db=options.db||new Map(),events=options.events||[],legacyQueue=options.legacyQueue||[],remote=options.remote||{},networkCalls=[];
 let intervalCallback=null;
 const baseRest=async(table,query)=>{networkCalls.push({table,query});if(options.networkError)throw new TypeError('Failed to fetch');return JSON.parse(JSON.stringify(remote[table]||[]))};
 const ctx={
  console,Date,JSON,Math,Number,String,RegExp,Set,Map,Promise,encodeURIComponent,decodeURIComponent,
  navigator:{onLine:options.online===true},session:{access_token:'test-token'},state:{activeBranchId:1,employee:{id:7},products:[],categories:[],branchProducts:[],modifiers:[],productModifiers:[],productVariants:[],deliveryZones:[],drivers:[],branches:[],branchPrintSettings:[],paymentMethods:[],branchPaymentMethods:[],branchFinancialSettings:[],employeeBranches:[],userPermissions:[],business:{id:1},settings:{}},
  currentBranchId:()=>1,rest:baseRest,syncOfflineQueue:async()=>{},saveOfflineSale:async()=>{},updateNextBonBadge:async()=>{},getOpenShift:async()=>null,
  odbGet:async key=>{if(options.compatibilityReadFails)throw new Error('compatibility cache unavailable');return db.has(key)?JSON.parse(JSON.stringify(db.get(key))):null},
  odbSet:async(key,value)=>{db.set(key,JSON.parse(JSON.stringify(value)));return value},offlineQueue:async()=>legacyQueue,setOfflineQueue:async()=>{},
  SharawlaOfflineOwnership:{resolve:async()=>({owner:'LEGACY_FALLBACK'}),legacyMayRead:owner=>owner==='LEGACY_FALLBACK',legacyMayOperate:owner=>owner==='LEGACY_FALLBACK'},
  topBurgerDesktop:options.native===false?{}:{offlineV2:{outbox:async()=>{if(options.outboxError)throw new Error('native outbox unavailable');return JSON.parse(JSON.stringify(events))}}},
  document:{readyState:'complete',addEventListener:()=>{}},addEventListener:()=>{},dispatchEvent:()=>{},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},
  setTimeout:()=>0,setInterval:fn=>{intervalCallback=fn;return 1},clearInterval:()=>{},toast:()=>{}
 };
 ctx.window=ctx;ctx.globalThis=ctx;
 vm.createContext(ctx);vm.runInContext(recoverySource,ctx,{filename:'beta55-4-runtime-recovery.js'});
 assert(intervalCallback,'recovery installer was not scheduled');intervalCallback();
 assert(ctx.__SharawlaBeta554RuntimeRecovery?.readOperationalRows,'unified operational reader was not installed');
 return {ctx,db,events,legacyQueue,remote,networkCalls};
}

async function testStaleExactNativeAndAck(){
 const remote={orders:[{id:11,branch_id:1,order_type:'delivery',status:'new',created_at:'2026-09-27T08:00:00.000Z',customer_phone:'01000000000'}]};
 const env=await makeRecovery({online:true,remote});
 const query='select=*&branch_id=eq.1&order_type=eq.delivery&status=in.(new,ready,out_for_delivery)&order=created_at.desc&limit=100';
 assert.strictEqual((await env.ctx.rest('orders',query)).length,1,'cloud baseline should seed one exact-cache row');
 const pending=saleEvent('tx-delivery',{created:'2026-09-27T10:00:00.000Z'});env.events.push(pending);
 env.db.set('cachedOrders',[{order:{...pending.envelope.payload.rpc_payload.p_order,id:pending.local_entity_id,client_tx_id:'tx-delivery',created_at:pending.created_local_at},items:[]}]);
 env.ctx.navigator.onLine=false;
 let rows=await env.ctx.rest('orders',query);
 assert.strictEqual(rows.filter(x=>x.client_tx_id==='tx-delivery').length,1,'stale exact cache must union the Native delivery sale exactly once');
 assert.strictEqual(rows.length,2,'stale cloud row and new local delivery row must both remain visible');

 pending.status='synced';pending.server_ack={server_entity_id:900,result:{order:{id:900,branch_id:1,order_type:'delivery',status:'new',created_at:pending.created_local_at,customer_phone:'01011111111',total:100}}};
 remote.orders=[remote.orders[0],{id:900,client_tx_id:'tx-delivery',branch_id:1,order_type:'delivery',status:'new',created_at:pending.created_local_at,customer_phone:'01011111111',total:100}];
 env.ctx.navigator.onLine=true;rows=await env.ctx.rest('orders',query);
 assert.strictEqual(rows.filter(x=>x.client_tx_id==='tx-delivery').length,1,'ACK union must not render Local+Server duplicates');
 assert.strictEqual(rows.find(x=>x.client_tx_id==='tx-delivery').id,900,'ACK canonical server identity must replace the local identity');
 env.ctx.navigator.onLine=false;rows=await env.ctx.rest('orders',query);
 assert.strictEqual(rows.filter(x=>x.client_tx_id==='tx-delivery').length,1,'reconciled exact cache must remain deduplicated offline');
}

async function testFieldAwareIdentityDedup(){
 const collision=nativeEvent('sale','collision-b',{p_order:{branch_id:1,order_type:'delivery',status:'new',document_uid:'doc-b',source_document_id:'cross-field-value'},p_items:[],p_payments:[]},{localId:'offline-collision-b'}),collisionEnv=await makeRecovery({events:[collision],online:false});
 const collisionRows=await collisionEnv.ctx.__SharawlaBeta554RuntimeRecovery.readOperationalRows('orders','select=*',[{id:'collision-a',document_uid:'cross-field-value',source_document_id:'source-a'}]);
 assert.strictEqual(collisionRows.length,2,'cross-field canonical value collision must not merge distinct rows');

 const ack=nativeEvent('sale','ack-field-aware',{p_order:{branch_id:1,order_type:'delivery',status:'new'},p_items:[],p_payments:[]},{localId:'offline-ack-field-aware',status:'synced',ack:{server_entity_id:701,result:{order:{id:701,branch_id:1,order_type:'delivery',status:'new'}}}}),ackEnv=await makeRecovery({events:[ack],online:false});
 const ackRows=await ackEnv.ctx.__SharawlaBeta554RuntimeRecovery.readOperationalRows('orders','select=*',[{id:'offline-ack-field-aware',branch_id:1,order_type:'delivery',status:'new'}]);
 assert.strictEqual(ackRows.length,1,'Local-to-Server ACK mapping must still reconcile to one row');
 assert.strictEqual(ackRows[0].id,701,'Local-to-Server ACK must retain the canonical server id');
}

async function testLegacyFallback(){
 const legacy={type:'sale',client_tx_id:'legacy-sale',local_order:{id:'offline-legacy-sale',client_tx_id:'legacy-sale',branch_id:1,shift_id:'offline-shift-main',order_type:'delivery',status:'new',source:'pos',payment_status:'confirmed',payment_method:'cash',total:45,created_at:'2026-09-27T11:00:00.000Z'},local_items:[],p_payments:[{method:'cash',amount:45}]};
 const env=await makeRecovery({native:false,legacyQueue:[legacy],online:false});
 const rows=await env.ctx.rest('orders','select=*&branch_id=eq.1&order_type=eq.delivery&status=eq.new');
 assert.strictEqual(rows.length,1,'eligible Legacy pending projection must remain readable');
 assert.strictEqual(rows[0].client_tx_id,'legacy-sale','Legacy fallback identity was lost');
}

async function testFilteringAndCustomerIsolation(){
 const events=[
  saleEvent('sale-good',{branchId:1,statusValue:'new',phone:'01012345678',created:'2026-09-27T10:00:00.000Z'}),
  saleEvent('sale-other-branch',{branchId:2,statusValue:'new',phone:'01012345678',created:'2026-09-27T10:00:00.000Z'}),
  saleEvent('sale-old',{branchId:1,statusValue:'new',phone:'01012345678',created:'2026-09-20T10:00:00.000Z'}),
  saleEvent('sale-wrong-status',{branchId:1,statusValue:'completed',phone:'01012345678',created:'2026-09-27T10:00:00.000Z'}),
  saleEvent('sale-other-phone',{branchId:1,statusValue:'new',phone:'01099999999',created:'2026-09-27T10:00:00.000Z'}),
  nativeEvent('customer_create','customer-a',{p_name:'A',p_phone:'01012345678'},{localId:'offline-customer-a'}),
  nativeEvent('customer_create','customer-b',{p_name:'B',p_phone:'01099999999'},{localId:'offline-customer-b'}),
  nativeEvent('customer_address_save','address-a',{p_customer_id:'offline-customer-a',p_label:'Home A',p_address:'A Street'},{localId:'offline-address-a'}),
  nativeEvent('customer_address_save','address-b',{p_customer_id:'offline-customer-b',p_label:'Home B',p_address:'B Street'},{localId:'offline-address-b'})
 ];
 const env=await makeRecovery({events,online:false});
 const from=encodeURIComponent('2026-09-27T00:00:00.000Z'),to=encodeURIComponent('2026-09-27T23:59:59.999Z');
 const filtered=await env.ctx.rest('orders',`select=*&branch_id=eq.1&status=eq.new&created_at=gte.${from}&created_at=lte.${to}&customer_phone=eq.01012345678&order=created_at.desc&limit=20`);
 assert.strictEqual(filtered.length,1,'branch/date/status/phone filters must run after the local union');
 assert.strictEqual(filtered[0].client_tx_id,'sale-good','a local order from another branch/date/status/customer leaked through filtering');
 const ilikeRows=await env.ctx.rest('orders','select=*&customer_phone=ilike.*12345678*&order=created_at.desc&limit=20');
 assert(ilikeRows.length>=1&&ilikeRows.every(x=>x.customer_phone==='01012345678'),'customer_phone ilike must not leak another phone');
 const customers=await env.ctx.rest('customers','select=*&phone=eq.01012345678&limit=1');
 assert.strictEqual(customers.length,1,'customer phone equality must select only one local customer');
 assert.strictEqual(customers[0].name,'A','customer phone equality returned another customer');
 const addresses=await env.ctx.rest('customer_addresses','select=*&customer_id=eq.offline-customer-a');
 assert.strictEqual(addresses.length,1,'customer address filter leaked another customer address');
 assert.strictEqual(addresses[0].label,'Home A','wrong local customer address returned');

 const paging=await makeRecovery({events:[
  saleEvent('page-1',{created:'2026-09-27T01:00:00.000Z'}),
  saleEvent('page-2',{created:'2026-09-27T02:00:00.000Z'}),
  saleEvent('page-3',{created:'2026-09-27T03:00:00.000Z'}),
  saleEvent('page-4',{created:'2026-09-27T04:00:00.000Z'})
 ],online:false});
 const page=await paging.ctx.rest('orders','select=*&branch_id=eq.1&order=created_at.asc&limit=2&offset=1');
 assert.strictEqual(page.length,2,'pagination must run once after the complete local union');
 assert.strictEqual(page[0].client_tx_id,'page-2','post-union sorting/offset selected the wrong first row');
 assert.strictEqual(page[1].client_tx_id,'page-3','post-union limit selected the wrong second row');
}

async function testPersistentReloadAndNativeAuthority(){
 const db=new Map(),events=[saleEvent('reload-sale',{created:'2026-09-27T12:00:00.000Z'})];
 const first=await makeRecovery({db,events,online:false});
 assert.strictEqual((await first.ctx.rest('orders','select=*&id=eq.offline-reload-sale')).length,1,'Native row missing before reload');
 const reloaded=await makeRecovery({db,events,online:false});
 assert.strictEqual((await reloaded.ctx.rest('orders','select=*&id=eq.offline-reload-sale')).length,1,'persistent Native state was not readable after navigation/reload');
 const nativeOnly=await makeRecovery({events:[saleEvent('native-authority')],online:false,compatibilityReadFails:true});
 assert.strictEqual((await nativeOnly.ctx.rest('orders','select=*&id=eq.offline-native-authority')).length,1,'Native durable outbox must remain readable when compatibility cache projection fails');
}

async function testOrderStatusReloadAckNoResurrection(){
 const db=new Map(),sale=saleEvent('status-reload-sale',{orderType:'pickup',statusValue:'new',created:'2026-09-27T12:30:00.000Z'});
 const patch=nativeEvent('order_status','status-reload-patch',{p_order_id:sale.local_entity_id,p_target_status:'ready'},{localId:'offline-status-reload-patch',created:'2026-09-27T12:31:00.000Z'});
 const events=[sale,patch];
 let env=await makeRecovery({db,events,online:false}),rows=await env.ctx.rest('orders',`select=*&id=eq.${sale.local_entity_id}`);
 assert.strictEqual(rows.length,1,'pending order status must remain one row before reload');assert.strictEqual(rows[0].status,'ready','pending order status projection missing before reload');
 env=await makeRecovery({db,events,online:false});rows=await env.ctx.rest('orders',`select=*&id=eq.${sale.local_entity_id}`);
 assert.strictEqual(rows.length,1,'pending order status duplicated after runtime reload');assert.strictEqual(rows[0].status,'ready','pending order status was lost after runtime reload');
 sale.status='synced';sale.server_ack={server_entity_id:880,result:{order:{id:880,client_tx_id:'status-reload-sale',branch_id:1,order_type:'pickup',status:'new',created_at:sale.created_local_at}}};
 patch.status='synced';patch.server_ack={server_entity_id:880,result:{order_id:880,status:'ready'}};
 const remote={orders:[{id:880,client_tx_id:'status-reload-sale',branch_id:1,order_type:'pickup',status:'ready',created_at:sale.created_local_at}]};
 env=await makeRecovery({db,events,online:true,remote});rows=await env.ctx.rest('orders','select=*&branch_id=eq.1&order_type=eq.pickup');
 assert.strictEqual(rows.filter(x=>String(x.id)==='880'||x.client_tx_id==='status-reload-sale').length,1,'ACK reconciliation must collapse local/server status identity to one row');
 env=await makeRecovery({db,events,online:false,remote});rows=await env.ctx.rest('orders','select=*&branch_id=eq.1&order_type=eq.pickup');
 const canonical=rows.filter(x=>String(x.id)==='880'||x.client_tx_id==='status-reload-sale');
 assert.strictEqual(canonical.length,1,'reconciled order resurrected or duplicated after second reload');assert.strictEqual(String(canonical[0].id),'880','canonical server identity was not retained after reload');assert.strictEqual(canonical[0].status,'ready','reconciled status regressed after reload');
}

async function testNativePatchesAndTombstones(){
 const shiftId='offline-shift-lifecycle',order=saleEvent('status-sale',{shiftId,orderType:'pickup',statusValue:'new'}),events=[
  nativeEvent('shift_open','shift-open',{p_branch_id:1,p_opening_cash:40},{localId:shiftId}),
  nativeEvent('shift_close','shift-close',{p_shift_id:shiftId,p_closing_cash:90,p_metrics:{sales_total:50,expenses_total:0}},{localId:'offline-shift-close-event'}),
  order,
  nativeEvent('order_status','status-change',{p_order_id:order.local_entity_id,p_target_status:'ready'},{localId:'offline-status-change'}),
  nativeEvent('customer_create','customer-create',{p_name:'Before',p_phone:'01055555555'},{localId:'offline-customer-lifecycle'}),
  nativeEvent('customer_update','customer-update',{p_customer_id:'offline-customer-lifecycle',p_name:'After',p_phone:'01055555555'},{localId:'offline-customer-update'}),
  nativeEvent('customer_address_save','address-save',{p_customer_id:'offline-customer-lifecycle',p_label:'Temporary',p_address:'Street'},{localId:'offline-address-lifecycle'}),
  nativeEvent('customer_address_delete','address-delete',{p_address_id:'offline-address-lifecycle'},{localId:'offline-address-delete'})
 ];
 const env=await makeRecovery({events,online:false});
 const shifts=await env.ctx.rest('shifts',`select=*&id=eq.${shiftId}`);
 assert.strictEqual(shifts.length,1,'Native shift open/close projections must reconcile to one shift');
 assert.strictEqual(shifts[0].status,'closed','Native shift-close patch was not applied locally');
 const orders=await env.ctx.rest('orders',`select=*&id=eq.${order.local_entity_id}`);
 assert.strictEqual(orders.length,1,'Native pickup sale must remain visible through its status patch');
 assert.strictEqual(orders[0].status,'ready','Native order-status patch was not applied locally');
 const customers=await env.ctx.rest('customers','select=*&phone=eq.01055555555');
 assert.strictEqual(customers.length,1,'Native customer create/update must reconcile to one row');
 assert.strictEqual(customers[0].name,'After','Native customer update patch was not applied');
 const addresses=await env.ctx.rest('customer_addresses','select=*&customer_id=eq.offline-customer-lifecycle');
 assert.strictEqual(addresses.length,0,'Native customer-address tombstone did not remove the local row');
}

function appBlock(startToken,endToken){
 const start=appSource.indexOf(startToken),end=appSource.indexOf(endToken,start);
 assert(start>=0&&end>start,`cannot extract app runtime block: ${startToken}`);
 return appSource.slice(start,end);
}

async function testExpenseImmediateRefresh(){
 const events=[],env=await makeRecovery({events,online:false});
 const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',innerHTML:'',onclick:null,addEventListener:()=>{}});return elements.get(id)};
 for(const id of ['page','exTitle','exAmount','exFrom','exTo','expenseTotal','expenseRows','loadExpenses','addExpense'])element(id);
 element('exFrom').value='2026-09-27';element('exTo').value='2026-09-27';
 const toasts=[];
 const ctx={console,Date,Number,String,Promise,TypeError,navigator:{onLine:false},$:selector=>element(String(selector).replace(/^#/,'')),localDateInput:()=> '2026-09-27',currentBranchId:()=>1,
  rest:(...args)=>env.ctx.rest(...args),money:value=>Number(value||0).toFixed(2),fmtDate:value=>String(value),esc:value=>String(value??''),toast:value=>toasts.push(String(value)),uiPrompt:async()=>null,
  getOpenShift:async()=>({id:'offline-shift-expense',opening_cash:0}),isServerShiftId:value=>/^\d+$/.test(String(value??''))&&Number(value)>0,rpc:async()=>{throw new Error('RPC must not receive a local shift')},
  uuid:()=> 'expense-runtime-tx',audit:async()=>{},isNetError:error=>/fetch|network/i.test(String(error?.message||error)),
  saveOfflineExpense:async(shift,description,amount)=>{events.push(nativeEvent('expense','expense-runtime-tx',{p_shift_id:shift.id,p_description:description,p_amount:amount},{localId:'offline-expense-runtime',created:'2026-09-27T14:00:00.000Z'}));return {id:'offline-expense-runtime'}},globalThis:null};
 ctx.globalThis=ctx;vm.createContext(ctx);
 const source=appBlock('async function renderExpenses(){','\nfunction catalogOrderValue');
 vm.runInContext(`${source}\nthis.__renderExpenses=renderExpenses;`,ctx,{filename:'app.js#renderExpenses'});
 await ctx.__renderExpenses();await flush();await flush();
 element('exTitle').value='Offline fuel';element('exAmount').value='25';
 await element('addExpense').onclick();
 assert.strictEqual(element('expenseTotal').textContent,'25.00','Offline expense must update the active period total without reconnect');
 assert(element('expenseRows').innerHTML.includes('Offline fuel'),'Offline expense row must render immediately without reconnect');
 assert(toasts.some(x=>x.includes('أوفلاين')),'Offline durable-success message was not emitted');
}

async function runShiftProjectionRegression(){
 const shiftId='offline-shift-metrics',events=[
  saleEvent('metric-sale',{shiftId,total:100,method:'cash',orderType:'takeaway',statusValue:'completed'}),
  nativeEvent('expense','metric-expense',{p_shift_id:shiftId,p_description:'Supplies',p_amount:20},{localId:'offline-exp-metric'}),
  nativeEvent('return','metric-return',{p_order_id:'offline-metric-sale',p_shift_id:shiftId,p_reason:'customer',p_notes:null,p_items:[{line_uid:'return-line',quantity:1}],p_payments:[{method:'cash',amount:30}]},{localId:'offline-ret-metric'})
 ];
 const env=await makeRecovery({events,online:false});
 const ctx={console,Number,String,Promise,encodeURIComponent,globalThis:null,__SharawlaBeta554RuntimeRecovery:env.ctx.__SharawlaBeta554RuntimeRecovery,rest:(...args)=>env.ctx.rest(...args),isNetError:error=>/fetch|network/i.test(String(error?.message||error)),cachedOrderBundles:async()=>[],offlineQueue:async()=>[]};
 ctx.globalThis=ctx;vm.createContext(ctx);
 const source=appBlock('function isServerShiftId(value)','\nasync function shiftMetrics(shift){');
 vm.runInContext(`${source}\nthis.__localShiftMetrics=localShiftMetrics;`,ctx,{filename:'app.js#localShiftMetrics'});
 const metrics=await ctx.__localShiftMetrics({id:shiftId,opening_cash:50});
 assert.strictEqual(metrics.grossSales,100,'Native local sale missing from local shift metrics');
 assert.strictEqual(metrics.returnTotal,30,'Native local return missing from local shift metrics');
 assert.strictEqual(metrics.exp,20,'Native local expense missing from local shift metrics');
 assert.strictEqual(metrics.cash,70,'Native return payment must reduce local cash payment total');
 assert.strictEqual(metrics.expected,100,'expected cash must include opening + net cash - Native expenses');
 assert.strictEqual(metrics.returnCash,30,'Native return cash breakdown missing');
}

async function run(){
 await testFieldAwareIdentityDedup();
 await testStaleExactNativeAndAck();
 await testLegacyFallback();
 await testFilteringAndCustomerIsolation();
 await testPersistentReloadAndNativeAuthority();
 await testOrderStatusReloadAckNoResurrection();
 await testNativePatchesAndTombstones();
 await testExpenseImmediateRefresh();
 await runShiftProjectionRegression();
 console.log('RC1 Offline read-after-write runtime regression PASS');
}

module.exports={run,runShiftProjectionRegression};
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1});
