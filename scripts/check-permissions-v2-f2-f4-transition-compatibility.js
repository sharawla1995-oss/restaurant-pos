'use strict';
const fs=require('fs');
for(const file of ['permissions-v2-customers-create-routing.js','permissions-v2-customers-edit-address-routing.js','permissions-v2-expense-edit-routing.js','permissions-v2-delivery-settings-routing.js']){
 const s=fs.readFileSync(file,'utf8');
 if(!s.includes('missingOwner(err)'))throw new Error('PV2_TRANSITION_FALLBACK_MISSING '+file);
 if(!/PGRST202\|could not find the function\|404/i.test(s))throw new Error('PV2_TRANSITION_FALLBACK_NOT_FAIL_CLOSED '+file);
 if(/DENIED[^\n]{0,120}missingOwner|missingOwner[^\n]{0,120}DENIED/i.test(s))throw new Error('PV2_TRANSITION_PERMISSION_BYPASS '+file);
}
console.log('PV2 F2-F4 transition compatibility: PASS');
