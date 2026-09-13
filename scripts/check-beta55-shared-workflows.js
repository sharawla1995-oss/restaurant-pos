const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function need(src,tokens,label){for(const t of tokens)if(!src.includes(t))throw new Error(`${label} missing: ${t}`)}

const ui=read('beta55-ui-workflow-fixes.js');
need(ui,[
 "#newRetailPO,[data-ap-po]",
 'beta55-po-modal',
 'data-b55-supplier',
 'data-b55-search',
 'data-b55-item-row',
 'retail_purchase_order_create_v2',
 "keys=['employees','advances','adjustments','payroll']",
 'data-beta55-hr-group',
 "querySelectorAll('[data-advanced-purchasing]')"
],'Beta55 UI workflow');

const hard=read('beta55-ui-hardening.js');
need(hard,[
 "#page [data-advanced-purchasing]",
 "panels.slice(1).forEach(x=>x.remove())",
 '📋 بيانات الموظفين',
 'data-beta55-hr-group'
],'Beta55 UI hardening');

const supply=read('beta55-central-warehouse-ui.js');
need(supply,[
 "const FEATURE='inventory.multi_warehouse'",
 "'inventory.supply.view'",
 "'inventory.supply.configure'",
 "'inventory.supply.request.create'",
 "'inventory.supply.request.approve'",
 "'inventory.supply.request.fulfill'",
 "'inventory.supply.request.receive'",
 'inventory_supply_request_create_v1',
 'inventory_supply_request_dispatch_v1',
 'inventory_supply_request_receive_v1',
 'inventory_location_set_type_v1',
 'inventory_supply_catalog_live_v1',
 'متاح بالمخزن',
 'مخزون الفرع',
 'كمية الصرف',
 'تالف',
 'عجز'
],'Beta55 central warehouse UI');

const foundation=read('supabase-beta55-central-warehouse-foundation.sql');
need(foundation,[
 "location_type text not null default 'branch'",
 "check (location_type in ('branch','central_warehouse'))",
 'inventory_supply_routes',
 'inventory_supply_catalog',
 'inventory_supply_requests',
 'inventory_supply_request_items',
 'inventory_supply_request_events',
 "public.has_action_permission_v2('inventory.supply.configure')",
 "public.has_action_permission_v2('inventory.supply.request.create')",
 "public.has_action_permission_v2('inventory.supply.request.approve')",
 'public.has_branch_access',
 'inventory_supply_request_create_v1',
 'inventory_supply_request_submit_v1',
 'inventory_supply_request_decide_v1'
],'Beta55 supply foundation');

const fulfill=read('supabase-beta55-central-warehouse-fulfillment.sql');
need(fulfill,[
 'inventory_supply_receipts',
 'quantity_backordered',
 'quantity_shortage',
 'inventory_supply_request_prepare_v1',
 'inventory_supply_request_dispatch_v1',
 'inventory_supply_request_receive_v1',
 "'transfer_out'",
 "'transfer_in'",
 "'supply_transfer_out'",
 "'supply_transfer_in'",
 "public.has_action_permission_v2('inventory.supply.request.fulfill')",
 "public.has_action_permission_v2('inventory.supply.request.receive')"
],'Beta55 fulfillment');

const hardened=read('supabase-beta55-central-warehouse-hardening.sql');
need(hardened,[
 'security_barrier=true',
 "public.has_action_permission_v2('inventory.supply.view')",
 'v_existing_request_id',
 'return v_existing_request_id'
],'Beta55 supply hardening');

const loader=read('beta36-integration-loader.js');
const order=['beta55-ui-workflow-fixes.js','beta55-ui-hardening.js','beta55-central-warehouse-ui.js'].map(x=>loader.indexOf(x));
if(order.some(x=>x<0)||!(order[0]<order[1]&&order[1]<order[2]))throw new Error('Beta55 loader order invalid');

for(const src of [ui,hard,supply,foundation,fulfill,hardened]){
 if(src.includes('3e405b6f-feba-4d5c-a4bf-bebb77f2d5d7')||src.includes('SH-0005')||src.includes('SH-0006'))throw new Error('Production identifier leaked into Beta55 workflow implementation');
}

console.log('Beta55 shared workflow / central warehouse static gate OK.');
