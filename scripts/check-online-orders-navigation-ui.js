'use strict';
const fs=require('fs');const app=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8'),reg=fs.readFileSync('sharawla-navigation-registry.js','utf8');const fail=[];const need=(x,m)=>{if(!x)fail.push(m)};
need((html.match(/data-page="onlineOrders"/g)||[]).length===1,'Online Orders must have exactly one primary sidebar entry');
need(/data-page="customers"[\s\S]*data-page="onlineOrders"[\s\S]*data-page="deliveryOrders"/.test(html),'Online Orders sidebar placement must precede Delivery operations');
need(/\['onlineOrders','🌐','الطلبات الأونلاين','استقبال ومتابعة طلبات القنوات الرقمية','green'\]/.test(app),'Online Orders Home entry missing');
need(/routeKey:'onlineOrders'[^\n]+navigationType:'data-page'/.test(reg),'Registry navigation type not promoted');
need(/routeKey:'onlineOrders'[^\n]+profile:'core'[^\n]+module:null/.test(reg),'Core ownership regressed');
need(/routeKey:'onlineOrders'[^\n]+navigationOwner:'index\.html'/.test(reg),'Primary navigation owner missing');
need(/CORE_CHANNEL_UI_EXPOSED_COMPAT_PERMISSION/.test(reg),'UI exposure marker missing');
need(/onlineOrders:renderOnlineOrders/.test(app),'Online Orders renderer binding missing');
need(/if\(page==='onlineOrders'\).*canAccessPage\('deliveryOrders'\)/.test(app),'Compatibility permission bridge regressed');
need((app.match(/rpc\('accept_website_order'/g)||[]).length===1,'Accept RPC ownership regressed');
need((app.match(/rpc\('reject_website_order'/g)||[]).length===1,'Reject RPC ownership regressed');
if(fail.length){console.error('Online Orders Batch 14 Navigation UI Consolidation: FAIL');fail.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Online Orders Batch 14 Navigation UI Consolidation: PASS');
console.log('sidebar=onlineOrders; home=onlineOrders; registry=data-page/index.html; delivery=separate; compat-permission=preserved');
