'use strict';
const fs=require('fs');const app=fs.readFileSync('app.js','utf8'),eng=fs.readFileSync('restaurant-engine.js','utf8'),reg=fs.readFileSync('sharawla-navigation-registry.js','utf8');const fail=[];const need=(x,m)=>{if(!x)fail.push(m)};
const can=(app.match(/function canAccessPage\([\s\S]*?\n}/)||[])[0]||'';
const pageModule=(eng.match(/const PAGE_MODULE=Object\.freeze\(\{[\s\S]*?\n  \}\);/)||[])[0]||'';
const flags=(eng.match(/const OPERATIONAL_FLAGS=Object\.freeze\(\{[\s\S]*?\n  \}\);/)||[])[0]||'';
need(/page==='onlineOrders'.*runtimeAllowsPage\(page\).*runtimeOperationalAllowsPage\(page\).*canAccessPage\('deliveryOrders'\)/.test(can),'Online Orders capability+compat permission chain missing');
need(!/onlineOrders:'delivery'/.test(pageModule),'Core Online Orders still owned by Restaurant delivery module');
need(!/onlineOrders:'enable_delivery'/.test(flags),'Core Online Orders still gated by Restaurant delivery operational flag');
need(/deliveryOrders:'delivery'/.test(pageModule),'Restaurant Delivery module mapping regressed');
need(/deliveryOrders:'enable_delivery'/.test(flags),'Restaurant Delivery operational gate regressed');
need(/routeKey:'onlineOrders'[^\n]+profile:'core'[^\n]+module:null/.test(reg),'Registry Core ownership regressed');
need(/pagePermission:'deliveryOrders'/.test((reg.match(/\{routeKey:'onlineOrders'[^\n]+/)||[])[0]||''),'Compatibility permission bridge must remain explicit');
need(/CORE_CHANNEL_CAPABILITY_COMPAT_PERMISSION/.test(reg),'Core capability marker missing');
need((app.match(/rpc\('accept_website_order'/g)||[]).length===1,'Accept RPC ownership regressed');
need((app.match(/rpc\('reject_website_order'/g)||[]).length===1,'Reject RPC ownership regressed');
if(fail.length){console.error('Online Orders Batch 13 Capability Permission Boundary: FAIL');fail.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Online Orders Batch 13 Capability Permission Boundary: PASS');
console.log('capability=core; restaurant_delivery_gate=removed; permission=deliveryOrders-compat; delivery_ops=preserved');
