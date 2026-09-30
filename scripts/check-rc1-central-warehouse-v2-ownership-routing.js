'use strict';
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const s=fs.readFileSync('beta55-central-warehouse-v2.js','utf8');
assert(s.includes("commitOptionalTxRpc('inventory_supply_request_create_v1'"),'shortage create must use Offline V2 supply request owner');
assert(!s.includes("rpc('inventory_supply_shortage_request_create_v1'"),'direct shortage create bypass remains');
const pr=s.indexOf("rpc('retail_purchase_request_create_v1'"),prGuard=s.lastIndexOf('requireConfigOnline();',pr);assert(pr>=0&&prGuard>=0&&pr-prGuard<1500,'purchase request shortcut must fail closed Offline');
const cancel=s.indexOf("rpc('inventory_supply_request_cancel_v1'"),cancelGuard=s.lastIndexOf('requireConfigOnline();',cancel);assert(cancel>=0&&cancelGuard>=0&&cancel-cancelGuard<300,'cancel must fail closed Offline');
new vm.Script(s,{filename:'beta55-central-warehouse-v2.js'});
console.log('RC1 Central Warehouse V2 ownership routing gate PASS');
