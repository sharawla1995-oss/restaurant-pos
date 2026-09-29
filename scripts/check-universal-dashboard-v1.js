const assert=require('assert');
const fs=require('fs');
const path=require('path');
const engine=require('../universal-dashboard-engine-v1');
const root=path.resolve(__dirname,'..');

function test(name,fn){try{fn();console.log(`✓ ${name}`)}catch(error){error.message=`${name}: ${error.message}`;throw error}}
const capabilities=['commerce.orders','commerce.products','commerce.returns','core.reports','core.payments','core.customers','inventory.stock','inventory.purchasing','commerce.delivery','food.tables'];
const baseContext={profile:'restaurant',capabilities,permissions:['reports','orders','customers','inventory','purchasing'],actionPermissions:[],online:true,branchMode:'current'};
const profileWidgetIds=['restaurant_orders','pharmacy_expiry','service_operations','membership_operations','logistics_operations','warehouse_operations'];
function registry(profile,profileCapabilities,permissions){return engine.resolveWidgetRegistry({profile,capabilities:profileCapabilities,permissions,actionPermissions:[],online:true,branchMode:'current'},{includeUnavailable:true})}
function assertProfileWidget(profile,expected,profileCapabilities,permissions){
 const rows=registry(profile,profileCapabilities,permissions);
 for(const id of profileWidgetIds)assert.equal(rows.find(row=>row.id===id).state,id===expected?engine.STATES.READY:engine.STATES.CAPABILITY_UNAVAILABLE,`${profile}:${id}`);
}

test('profile widget resolution',()=>{
 const restaurant=engine.resolveWidgetRegistry(baseContext,{includeUnavailable:true});
 assert.equal(restaurant.find(row=>row.id==='restaurant_orders').state,engine.STATES.READY);
 assert.equal(restaurant.find(row=>row.id==='pharmacy_expiry').state,engine.STATES.CAPABILITY_UNAVAILABLE);
 const service=engine.resolveWidgetRegistry({...baseContext,profile:'service',capabilities:['service.jobs'],permissions:['orders']},{includeUnavailable:true});
 assert.equal(service.find(row=>row.id==='service_operations').state,engine.STATES.READY);
});

test('all seven active profiles allow only their applicable profile widget',()=>{
 assertProfileWidget('restaurant','restaurant_orders',['commerce.orders','commerce.delivery'],['orders']);
 assertProfileWidget('retail',null,['commerce.orders','inventory.stock','inventory.purchasing'],['orders','inventory','purchasing']);
 assertProfileWidget('pharmacy','pharmacy_expiry',['inventory.stock','inventory.batch','inventory.expiry'],['inventory']);
 assertProfileWidget('service','service_operations',['service.jobs','service.appointments'],['orders']);
 assertProfileWidget('warehouse','warehouse_operations',['inventory.stock','inventory.purchasing'],['inventory','purchasing']);
 assertProfileWidget('membership','membership_operations',['membership.subscriptions','membership.checkin'],['customers']);
 assertProfileWidget('logistics','logistics_operations',['logistics.shipments'],['orders']);
 const general=registry('general',['commerce.orders','inventory.stock'],['orders','inventory']);
 assert(profileWidgetIds.every(id=>general.find(row=>row.id===id).state===engine.STATES.CAPABILITY_UNAVAILABLE));
});

test('retail, warehouse, pharmacy and restaurant capability widgets resolve independently',()=>{
 const retail=registry('retail',['inventory.stock','inventory.purchasing'],['inventory','purchasing']);
 assert.equal(retail.find(row=>row.id==='inventory_alerts').state,engine.STATES.READY);
 assert.equal(retail.find(row=>row.id==='purchasing_status').state,engine.STATES.READY);
 const restaurant=registry('restaurant',['inventory.stock','food.production'],['inventory']);
 assert.equal(restaurant.find(row=>row.id==='restaurant_food_ops').state,engine.STATES.READY);
 const pharmacy=registry('pharmacy',['inventory.stock','inventory.batch','inventory.expiry'],['inventory']);
 assert.equal(pharmacy.find(row=>row.id==='pharmacy_expiry').state,engine.STATES.READY);
});

test('capability filtering',()=>{
 const rows=engine.resolveWidgetRegistry({...baseContext,capabilities:capabilities.filter(code=>code!=='commerce.delivery'&&code!=='food.tables')},{includeUnavailable:true});
 assert.equal(rows.find(row=>row.id==='restaurant_orders').state,engine.STATES.CAPABILITY_UNAVAILABLE);
});

test('permission filtering is fail closed',()=>{
 const rows=engine.resolveWidgetRegistry({...baseContext,permissions:['orders']},{includeUnavailable:true});
 assert.equal(rows.find(row=>row.id==='business_kpis').state,engine.STATES.NO_PERMISSION);
 assert.equal(rows.find(row=>row.id==='recent_orders').state,engine.STATES.READY);
 assert(!engine.requiredDatasets(rows.filter(row=>row.state===engine.STATES.READY)).includes('returns'));
});

test('unauthorized financial datasets are excluded before any read plan',()=>{
 const plan=engine.buildReadPlan({...baseContext,permissions:['orders']},{includeUnavailable:true});
 assert(plan.datasets.includes('order_operations'));
 for(const sensitive of ['orders','returns','expenses','order_payments','return_payments','order_items','return_items','employees'])assert(!plan.datasets.includes(sensitive),sensitive);
 assert.equal(plan.widgets.find(row=>row.id==='business_kpis').state,engine.STATES.NO_PERMISSION);
});

test('central warehouse requires exact Permissions V2 action',()=>{
 const denied=registry('warehouse',['inventory.stock','inventory.multi_warehouse'],['inventory']);
 assert.equal(denied.find(row=>row.id==='central_supply').state,engine.STATES.NO_PERMISSION);
 const allowed=engine.resolveWidgetRegistry({profile:'warehouse',capabilities:['inventory.stock','inventory.multi_warehouse'],permissions:['inventory'],actionPermissions:['inventory.supply.view'],online:true,branchMode:'current'},{includeUnavailable:true});
 assert.equal(allowed.find(row=>row.id==='central_supply').state,engine.STATES.READY);
});

test('branch filtering and all-branch authorization',()=>{
 assert.deepEqual(engine.resolveBranchScope({mode:'current',branchId:2,allowedBranchIds:[2,3]}).branchIds,['2']);
 assert.equal(engine.resolveBranchScope({mode:'specific',selectedBranchId:4,allowedBranchIds:[2,3]}).ok,false);
 assert.equal(engine.resolveBranchScope({mode:'all',allowedBranchIds:[2,3],canAllBranches:false}).ok,false);
 assert.deepEqual(engine.resolveBranchScope({mode:'all',allowedBranchIds:[2,3],canAllBranches:true}).branchIds,['2','3']);
});

test('date filters preserve explicit device-local boundaries',()=>{
 const period=engine.resolvePeriod('custom',new Date('2026-09-29T12:00:00'),{from:'2026-09-01',to:'2026-09-29'});
 assert.equal(period.fromDate,'2026-09-01');assert.equal(period.toDate,'2026-09-29');assert.equal(period.boundary,'device-local');
 assert.throws(()=>engine.resolvePeriod('custom',new Date(),{from:'2026-09-30',to:'2026-09-01'}),/INVALID_CUSTOM_PERIOD_ORDER/);
});

test('today, yesterday, week and month presets remain device-local',()=>{
 const now=new Date('2026-09-29T12:00:00');
 assert.deepEqual(['today','yesterday','week','month'].map(key=>{const p=engine.resolvePeriod(key,now);return [p.key,p.fromDate,p.toDate,p.boundary]}),[
  ['today','2026-09-29','2026-09-29','device-local'],
  ['yesterday','2026-09-28','2026-09-28','device-local'],
  ['week','2026-09-28','2026-09-29','device-local'],
  ['month','2026-09-01','2026-09-29','device-local']
 ]);
});

test('offline ACK replay does not double count',()=>{
 const cloud=[{id:42,client_tx_id:'sale-a',branch_id:1,status:'completed',total:100,created_at:'2026-09-29T10:00:00Z'}];
 const local=[{id:'offline-sale-a',_server_entity_id:42,client_tx_id:'sale-a',branch_id:1,status:'completed',total:100,created_at:'2026-09-29T10:00:00Z'}];
 assert.equal(engine.reconcileRows(cloud,local,'orders').length,1);
 const metrics=engine.aggregateDashboard({orders:cloud,localOrders:local},{branchIds:['1']});
 assert.equal(metrics.grossSales,100);assert.equal(metrics.orderCount,1);
});

test('field-aware identity avoids unrelated cross-field collisions',()=>{
 const rows=engine.reconcileRows([{id:7,total:10}],[{client_tx_id:'7',id:'local-7',total:20}],'orders');
 assert.equal(rows.length,2);
});

test('returned and discounted sales reconcile',()=>{
 const metrics=engine.aggregateDashboard({orders:[{id:1,branch_id:1,status:'completed',total:120,discount:20,payment_method:'cash',created_at:'2026-09-29T10:00:00Z'}],returns:[{id:9,branch_id:1,order_id:1,total:30,created_at:'2026-09-29T11:00:00Z'}],expenses:[{id:4,branch_id:1,amount:15,created_at:'2026-09-29T12:00:00Z'}]},{branchIds:['1']});
 assert.equal(metrics.grossSales,120);assert.equal(metrics.returnsTotal,30);assert.equal(metrics.netSales,90);assert.equal(metrics.discounts,20);assert.equal(metrics.expenseTotal,15);assert.equal(metrics.averageOrderValue,120);
});

test('date and shift boundaries include only the selected instant range',()=>{
 const metrics=engine.aggregateDashboard({orders:[
  {id:1,branch_id:1,shift_id:10,employee_id:5,status:'completed',total:25,created_at:'2026-09-28T23:59:59.999Z'},
  {id:2,branch_id:1,shift_id:10,employee_id:5,status:'completed',total:50,created_at:'2026-09-29T00:00:00.000Z'},
  {id:3,branch_id:1,shift_id:11,employee_id:6,status:'completed',total:75,created_at:'2026-09-29T23:59:59.999Z'},
  {id:4,branch_id:1,shift_id:11,employee_id:6,status:'completed',total:100,created_at:'2026-09-30T00:00:00.000Z'}
 ]},{branchIds:['1'],from:'2026-09-29T00:00:00.000Z',to:'2026-09-29T23:59:59.999Z'});
 assert.equal(metrics.grossSales,125);assert.equal(metrics.orderCount,2);assert.deepEqual(metrics.employees.map(row=>row.employeeId).sort(),['5','6']);
});

test('website collection and cancelled order rules match current reports',()=>{
 const metrics=engine.aggregateDashboard({orders:[
  {id:1,branch_id:1,status:'cancelled',total:500,created_at:'2026-09-29T10:00:00Z'},
  {id:2,branch_id:1,status:'new',source:'website',payment_method:'cash',payment_status:'pending',total:90,created_at:'2026-09-29T10:00:00Z'},
  {id:3,branch_id:1,status:'delivered',source:'website',payment_method:'cash',payment_status:'pending',total:80,created_at:'2026-09-29T10:00:00Z'},
  {id:4,branch_id:1,status:'new',source:'website',payment_method:'card',payment_status:'confirmed',total:70,created_at:'2026-09-29T10:00:00Z'}
 ]},{branchIds:['1']});
 assert.equal(metrics.grossSales,150);assert.equal(metrics.orderCount,2);assert.equal(metrics.cancelledCount,1);assert.equal(metrics.uncollectedWebsiteCount,1);
});

test('payment totals subtract return payment by method',()=>{
 const metrics=engine.aggregateDashboard({orders:[{id:1,branch_id:1,status:'completed',total:100,payment_method:'mixed',created_at:'2026-09-29T10:00:00Z'}],orderPayments:[{id:1,order_id:1,method:'cash',amount:60},{id:2,order_id:1,method:'instapay',amount:40}],returns:[{id:2,branch_id:1,total:25,created_at:'2026-09-29T11:00:00Z'}],returnPayments:[{id:3,return_id:2,method:'cash',amount:25}]},{branchIds:['1']});
 assert.deepEqual(Object.fromEntries(metrics.payments.map(row=>[row.method,row.total])),{instapay:40,cash:35});
});

test('customer activity distinguishes repeat customers from unlinked orders',()=>{
 const metrics=engine.aggregateDashboard({orders:[{id:1,branch_id:1,customer_id:9,status:'completed',total:10,created_at:'2026-09-29T10:00:00Z'},{id:2,branch_id:1,customer_id:9,status:'completed',total:20,created_at:'2026-09-29T11:00:00Z'},{id:3,branch_id:1,customer_id:null,status:'completed',total:30,created_at:'2026-09-29T12:00:00Z'}]},{branchIds:['1']});
 assert.equal(metrics.customerCount,1);assert.equal(metrics.unlinkedOrderCount,1);
});

test('multi-branch aggregation preserves each authoritative order once',()=>{
 const metrics=engine.aggregateDashboard({orders:[{id:1,branch_id:1,status:'completed',total:50,created_at:'2026-09-29T10:00:00Z'},{id:2,branch_id:2,status:'completed',total:75,created_at:'2026-09-29T10:00:00Z'},{id:3,branch_id:3,status:'completed',total:900,created_at:'2026-09-29T10:00:00Z'}]},{branchIds:['1','2']});
 assert.equal(metrics.grossSales,125);assert.equal(metrics.branches.length,2);
});

test('empty and unavailable states do not collapse into zero',()=>{
 assert.equal(engine.aggregateDashboard({},{}).isEmpty,true);
 assert.equal(engine.dataState({available:false,data:0}).state,engine.STATES.OFFLINE_UNAVAILABLE);
 assert.equal(engine.dataState({data:[]}).state,engine.STATES.EMPTY);
});

test('loading, error, empty and unavailable data states are distinct',()=>{
 assert.equal(engine.dataState({loading:true}).state,engine.STATES.LOADING);
 assert.equal(engine.dataState({error:new Error('boom')}).state,engine.STATES.ERROR);
 assert.equal(engine.dataState({data:[]}).state,engine.STATES.EMPTY);
 assert.equal(engine.dataState({available:false,data:0}).state,engine.STATES.OFFLINE_UNAVAILABLE);
 assert.equal(engine.dataState({data:0}).state,engine.STATES.READY);
});

test('offline widgets are labeled unavailable and all-branch is blocked',()=>{
 const rows=engine.resolveWidgetRegistry({...baseContext,online:false,branchMode:'current'},{includeUnavailable:true});
 assert.equal(rows.find(row=>row.id==='inventory_alerts').state,engine.STATES.OFFLINE_UNAVAILABLE);
 assert.equal(engine.resolveBranchScope({mode:'all',allowedBranchIds:[1,2],canAllBranches:false}).reason,'NO_ALL_BRANCH_PERMISSION');
});

test('offline UI is explicitly local and forces current branch behavior',()=>{
 const ui=fs.readFileSync(path.join(root,'universal-dashboard-v1.js'),'utf8');
 assert(ui.includes("'LOCAL / OFFLINE'"));
 assert(ui.includes('بيانات محلية على هذا الجهاز — ليست تجميعًا مركزيًا'));
 assert(ui.includes("if(!ctx.online){runtime.branchMode='current';runtime.selectedBranchId=ctx.branchId}"));
});

test('stale request protection rejects old generations',()=>{
 const gate=engine.createRequestGate(),first=gate.next(),second=gate.next();assert.equal(gate.isCurrent(first),false);assert.equal(gate.isCurrent(second),true);gate.cancel();assert.equal(gate.isCurrent(second),false);
});

test('widget failures remain isolated',()=>{
 const settled=engine.settleResources({orders:{status:'fulfilled',value:[{id:1}]},inventory:{status:'rejected',reason:new Error('inventory down')}});
 assert.equal(settled.orders.state,engine.STATES.READY);assert.equal(settled.inventory.state,engine.STATES.ERROR);assert.equal(settled.inventory.error,'inventory down');
});

test('source shell keeps the dashboard read-only and correctly ordered',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8'),ui=fs.readFileSync(path.join(root,'universal-dashboard-v1.js'),'utf8'),index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert(app.includes('__SharawlaUniversalDashboardHostV1'));assert(ui.includes("mode:'READ_ONLY_CAPABILITY_DRIVEN'"));
 assert(!/method\s*:\s*['\"](?:POST|PATCH|PUT|DELETE)['\"]/i.test(ui));
 assert(!/MutationObserver|setInterval\s*\(/.test(ui));
 assert(index.indexOf('universal-dashboard-engine-v1.js')<index.indexOf('app.js'));assert(index.indexOf('app.js')<index.indexOf('universal-dashboard-v1.js'));
});

console.log(`Universal Dashboard V1 checks passed (${engine.WIDGETS.length} registered widgets).`);
