'use strict';
const fs=require('fs');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const read=f=>fs.readFileSync(f,'utf8');
const pkg=JSON.parse(read('package.json'));
const app=read('app.js');
const recovery=read('beta55-4-runtime-recovery.js');
const sync=read('scripts/sync-version.js');
const loader=read('beta36-integration-loader.js');
assert(pkg.version==='10.5.4-beta.58.1','expected beta58.1 package version');
assert(app.includes('async function renderOrders(opts={})'),'new Orders renderer missing');
assert(app.includes('id="ordersFrom"')&&app.includes('id="ordersTo"'),'Orders date controls missing');
assert(app.includes('pageSize=100'),'Orders page size contract missing');
assert(app.includes('await cacheOrderRows(rows.slice(0,pageSize))'),'Orders batch cache contract missing');
assert(!recovery.includes("['orders',\`select=*&branch_id=eq.\${b}&order=created_at.desc&limit=300\`]"),'legacy 300-order warm prefetch still active');
for(const file of ['beta51-final-offline-acceptance-fix.js','beta55-4-runtime-recovery.js','beta55-5-runtime-hardening.js']){
 assert(sync.includes(file),'sync-version missing '+file);
 assert(loader.includes(file),'integration loader missing '+file);
}
console.log('Orders runtime corrective contract PASS:',pkg.version);
