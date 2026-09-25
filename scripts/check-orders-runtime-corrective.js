'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const read=f=>fs.readFileSync(f,'utf8');
const pkg=JSON.parse(read('package.json'));
const app=read('app.js');
const recovery=read('beta55-4-runtime-recovery.js');
const sync=read('scripts/sync-version.js');
const loader=read('beta36-integration-loader.js');
const offline43=read('beta43-offline-core.js');
const m58=/^10\.5\.4-beta\.58\.(\d+)$/.exec(pkg.version);
assert(!!m58&&Number(m58[1])>=3,'expected beta58.3+ package version');
assert(app.includes('async function renderOrders(opts={})'),'new Orders renderer missing');
assert(app.includes("ORDERS-DATE-WINDOW-V58.3"),'visible Orders runtime ownership marker missing');
assert(app.includes('id="ordersFrom"')&&app.includes('id="ordersTo"'),'Orders date controls missing');
assert(app.includes('pageSize=100'),'Orders page size contract missing');
assert(app.includes('await cacheOrderRows(rows.slice(0,pageSize))'),'Orders batch cache contract missing');
assert(offline43.includes('if(!base.renderOrders){try{renderOrders=renderOrders43}catch{};try{global.renderOrders=renderOrders43}catch{}}'),'Beta43 Orders fallback guard missing');
assert(!offline43.includes('\n  try{renderOrders=renderOrders43}catch{};try{global.renderOrders=renderOrders43}catch{};'),'Beta43 still unconditionally overrides the Orders renderer');
assert(!recovery.includes("['orders',\`select=*&branch_id=eq.\${b}&order=created_at.desc&limit=300\`]"),'legacy 300-order warm prefetch still active');
for(const file of ['beta51-final-offline-acceptance-fix.js','beta55-4-runtime-recovery.js','beta55-5-runtime-hardening.js']){
 assert(sync.includes(file),'sync-version missing '+file);
 assert(loader.includes(file),'integration loader missing '+file);
}
console.log('Orders runtime corrective contract PASS:',pkg.version);

assert(app.includes("if(window.topBurgerDesktop?.isDesktop)"),'desktop service worker bypass missing');
assert(app.includes("getRegistrations()"),'desktop service worker unregister missing');
const main=fs.readFileSync(path.join(root,'main.js'),'utf8');
assert(main.includes("clearDesktopRendererAssetCaches"),'main desktop renderer cache cleanup missing');
assert(main.includes("storages:['serviceworkers','cachestorage']"),'serviceworker/cachestorage cleanup missing');
assert(main.includes("await clearDesktopRendererAssetCaches();createWindow()"),'cache cleanup must precede createWindow');
console.log('Beta58.3+ desktop renderer cache ownership contract PASS');
