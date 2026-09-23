const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function need(src,tokens,label){for(const t of tokens)if(!src.includes(t))throw new Error(`${label} missing: ${t}`)}

const ui=read('beta55-ui-workflow-fixes.js');
need(ui,[
 "#newRetailPO,[data-ap-po]",'beta55-po-modal','data-b55-supplier','data-b55-search','data-b55-item-row','retail_purchase_order_create_v2',
 "keys=['employees','advances','adjustments','payroll']",'data-beta55-hr-group',"querySelectorAll('[data-advanced-purchasing]')",
 "rest('products','select=id,name,barcode,cost,price,active&active=eq.true&order=name')","sku:v.sku||''","sku:''"
],'Beta55 UI workflow');
if(ui.includes('select=id,name,sku,barcode,cost,price,active&active=eq.true&order=name'))throw new Error('Beta55 purchase workspace must not query nonexistent products.sku');
if(ui.includes('v.sku||p.sku')||ui.includes('sku:p.sku'))throw new Error('Beta55 purchase workspace must not reference products.sku fallback');

const hard=read('beta55-ui-hardening.js');
need(hard,["#page [data-advanced-purchasing]","panels.slice(1).forEach(x=>x.remove())",'📋 بيانات الموظفين','data-beta55-hr-group'],'Beta55 UI hardening');

const supply=read('beta55-central-warehouse-ui.js');
need(supply,["const FEATURE='inventory.multi_warehouse'","'inventory.supply.view'","'inventory.supply.configure'","'inventory.supply.request.create'","'inventory.supply.request.approve'","'inventory.supply.request.fulfill'","'inventory.supply.request.receive'",'inventory_supply_request_create_v1','inventory_supply_request_dispatch_v1','inventory_supply_request_receive_v1','inventory_location_set_type_v1','inventory_supply_catalog_live_v1','متاح بالمخزن','مخزون الفرع','كمية الصرف','تالف','عجز'],'Beta55 central warehouse UI');

const supplyV2=read('beta55-central-warehouse-v2.js');
need(supplyV2,[
 'inventory_supply_branch_catalog_v2','inventory_supply_shortages_v1','inventory_supply_shortage_request_create_v1','inventory_supply_catalog_policy_set_v1','inventory_supply_request_cancel_v1',
 "'inventory.supply.stock.availability'","'inventory.supply.stock.exact'","'inventory.supply.shortages.view'","'inventory.supply.shortages.create'",
 'طلبات مفتوحة','في الطريق','Min / Target','🟢 متاح','🟡 محدود','🔴 غير متاح','🔒 مخفي','📊 نواقص الفروع','إنشاء توريد داخلي','إنشاء طلب شراء للمخزن',
 'retail_purchase_request_create_v1','retail_purchase_request_submit_v1','__SharawlaBeta55CentralWarehouseV2'
],'Beta55 Warehouse V2 UI');

const emergencyUi=read('beta55-emergency-permission-hardening.js');
need(emergencyUi,[
 "const ACTION='inventory.supply.request.emergency'",'option[value="emergency"]','selected?.allow_emergency===true','has_action_permission_v2','inventory_supply_my_routes_v1','__SharawlaBeta55EmergencyPermissionHardening'
],'Beta55 emergency permission UI hardening');

const foundation=read('supabase-beta55-central-warehouse-foundation.sql');
need(foundation,["location_type text not null default 'branch'","check (location_type in ('branch','central_warehouse'))",'inventory_supply_routes','inventory_supply_catalog','inventory_supply_requests','inventory_supply_request_items','inventory_supply_request_events',"public.has_action_permission_v2('inventory.supply.configure')","public.has_action_permission_v2('inventory.supply.request.create')","public.has_action_permission_v2('inventory.supply.request.approve')","public.has_action_permission_v2('inventory.supply.request.emergency')",'public.has_branch_access','inventory_supply_request_create_v1','inventory_supply_request_submit_v1','inventory_supply_request_decide_v1'],'Beta55 supply foundation');

const fulfill=read('supabase-beta55-central-warehouse-fulfillment.sql');
need(fulfill,['inventory_supply_receipts','quantity_backordered','quantity_shortage','inventory_supply_request_prepare_v1','inventory_supply_request_dispatch_v1','inventory_supply_request_receive_v1',"'transfer_out'","'transfer_in'","'supply_transfer_out'","'supply_transfer_in'","public.has_action_permission_v2('inventory.supply.request.fulfill')","public.has_action_permission_v2('inventory.supply.request.receive')"],'Beta55 fulfillment');

const hardened=read('supabase-beta55-central-warehouse-hardening.sql');
need(hardened,['security_barrier=true',"public.has_action_permission_v2('inventory.supply.view')",'v_existing_request_id','return v_existing_request_id'],'Beta55 supply hardening');

const visibility=read('supabase-beta55-central-warehouse-visibility-shortages.sql');
need(visibility,[
 "'inventory.supply.stock.availability'","'inventory.supply.stock.exact'","'inventory.supply.shortages.view'","'inventory.supply.shortages.create'",
 'reorder_min_qty','target_stock_qty','quantity_reserved','source_visibility','source_availability','inventory_supply_shortages_v1','inventory_supply_shortage_request_create_v1',
 'inventory_supply_catalog_policy_set_v1','inventory_supply_request_cancel_v1','inventory_supply_release_reservation_on_dispatch_v1','source_reserved_qty','purchase_shortage_qty'
],'Beta55 visibility / shortages SQL');

const permissionHard=read('supabase-beta55-permission-boundary-hardening.sql');
need(permissionHard,[
 "'inventory.supply.request.emergency'","'inventory.supply.stock.exact'","'inventory.supply.shortages.view'","'inventory.supply.shortages.create'",
 "'inventory',null,true,1327","'inventory',null,true,1329","'inventory',null,true,1330","'inventory',null,true,1331",'legacy_permission is not null','must not inherit a legacy permission'
],'Beta55 permission boundary hardening SQL');

const branchRead=read('supabase-beta55-branch-request-read-model.sql');
need(branchRead,['inventory_supply_branch_catalog_v2','open_committed_qty','in_transit_qty','effective_stock_qty','suggested_qty','source_visibility','source_availability','reorder_min_qty','target_stock_qty'],'Beta55 branch request read model');

const allocation=read('supabase-beta55-shortages-allocation-hardening.sql');
need(allocation,['prior_shortage_qty','partition by s.item_type,s.item_id','source_available_qty-a.prior_shortage_qty','purchase_shortage_qty'],'Beta55 source allocation hardening');

const fixture=read('supabase-beta55-acceptance-supply.sql');
need(fixture,['sharawla_beta55_supply_acceptance_fixture_v1','sharawla_beta55_supply_acceptance_cleanup_v1',"coalesce(p_run_id,'') !~ '^ACC-'",'ACC55-WH-','ACC55-BR-','residue'],'Beta55 acceptance fixture');

const acc=read('owner-acceptance-beta55-v55.js'),accPerm=read('owner-acceptance-beta55-permissions-v55.js'),registry55=read('owner-acceptance-registry-v55.js'),lazy=read('owner-acceptance-lazy-loader-v47.js'),accUi=read('owner-acceptance-ui-v47.js');
need(acc,['beta55.runtime-contract','beta55.ui-workflow-contract','beta55.warehouse-shortage-roundtrip','reservation_guard_blocked','inventory_supply_request_dispatch_v1','inventory_supply_request_receive_v1','cleanup_zero'],'Beta55 acceptance pack');
need(accPerm,['beta55.permission-boundary-contract','inventory.supply.request.emergency','inventory.supply.stock.exact','inventory.supply.shortages.view','inventory.supply.shortages.create','legacy_permission!==null','__SharawlaBeta55EmergencyPermissionHardening'],'Beta55 permission acceptance pack');
need(registry55,[`const VERSION='${currentVersion}'`,'SH-0007','91826502-590e-4afa-8826-2c0f4b99c490','xihcxydjnzemflhedzor.supabase.co','READY_FOR_RC','harness_version:VERSION','lastComparableResult'],'Beta55 acceptance registry');
need(lazy,[`owner-acceptance-registry-v55.js?v=${currentVersion}`,`owner-acceptance-beta55-v55.js?v=${currentVersion}`,`owner-acceptance-beta55-permissions-v55.js?v=${currentVersion}`,'sharawla-beta55-acceptance-ready'],'Beta55 acceptance lazy loader');
need(accUi,[`const VERSION='${currentVersion}'`,'Full Sandbox','Beta55 — Warehouse / Purchasing / HR closure'],'Beta55 acceptance UI');

const loader=read('beta36-integration-loader.js');
const order=['beta55-ui-workflow-fixes.js','beta55-ui-hardening.js','beta55-central-warehouse-ui.js','beta55-central-warehouse-v2.js','beta55-emergency-permission-hardening.js','owner-acceptance-lazy-loader-v47.js'].map(x=>loader.indexOf(x));
if(order.some(x=>x<0)||!order.every((x,i)=>i===0||order[i-1]<x))throw new Error('Beta55 loader order invalid');
need(loader,['beta55CentralWarehouseV2:true','beta55EmergencyPermissionHardening:true'],'Beta55 loader marker');

for(const src of [ui,hard,supply,supplyV2,emergencyUi,foundation,fulfill,hardened,visibility,permissionHard,branchRead,allocation]){
 if(src.includes('3e405b6f-feba-4d5c-a4bf-bebb77f2d5d7')||src.includes('SH-0005')||src.includes('SH-0006')||src.includes('kzokretuuigjhxjzdlmk'))throw new Error('Production identifier leaked into Beta55 workflow implementation');
}

console.log('Beta55 shared workflow / Warehouse V2 / explicit permission boundaries / v55 Acceptance static gate OK.');
