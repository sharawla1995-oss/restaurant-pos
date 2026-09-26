'use strict';
const fs=require('fs');
const contracts={
 'permissions-v2-customers-create-routing.js':["rpc('customer_create_v2'"],
 'permissions-v2-customers-edit-address-routing.js':["rpc('customer_update_v2'","rpc('customer_address_save_v2'","rpc('customer_address_delete_v2'"],
 'permissions-v2-expense-edit-routing.js':["rpc('expense_update_v2'"],
 'permissions-v2-delivery-settings-routing.js':["rpc('delivery_driver_save_v2'","rpc('delivery_zone_save_v2'"]
};
for(const [file,rpcs] of Object.entries(contracts)){
 const s=fs.readFileSync(file,'utf8');
 for(const rpc of rpcs)if(!s.includes(rpc))throw new Error('PV2_CUTOVER_OWNER_RPC_MISSING '+file+' '+rpc);
 if(s.includes('missingOwner(err)')||/PGRST202\|could not find the function\|404/i.test(s))
   throw new Error('PV2_CUTOVER_LEGACY_FALLBACK_REINTRODUCED '+file);
 if(/rest\(\s*['"][^'"]+['"][\s\S]{0,260}?method\s*:\s*['"](?:POST|PATCH|DELETE)['"]/i.test(s))
   throw new Error('PV2_CUTOVER_DIRECT_DML_FALLBACK_REINTRODUCED '+file);
}
console.log('PV2 F1-F4 fail-closed cutover compatibility: PASS');
