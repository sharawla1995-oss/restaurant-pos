'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const registry=fs.readFileSync('sharawla-navigation-registry.js','utf8');
const engine=fs.readFileSync('restaurant-engine.js','utf8');
const fail=[];const need=(x,m)=>{if(!x)fail.push(m)};
const row=(registry.split('\n').find(x=>x.includes("routeKey:'onlineOrders'"))||'');
need(/profile:'core'/.test(row),'onlineOrders must be classified as Core');
need(/module:null/.test(row),'Core online inbox must not be intrinsically owned by Restaurant delivery module');
need(/CORE_CHANNEL_INBOX_FOUNDATION_COMPAT_PERMISSION/.test(row),'Core/channel compatibility marker missing');
need(/pagePermission:'deliveryOrders'/.test(row),'current Restaurant compatibility permission must remain explicit');
need(/onlineOrders:renderOnlineOrders/.test(app),'online inbox renderer binding missing');
need(/page==='onlineOrders'\)return canAccessPage\('deliveryOrders'\)/.test(app),'compatibility permission bridge missing');
need((app.match(/accept_website_order/g)||[]).length===1,'Accept ownership changed before generic action boundary');
need((app.match(/reject_website_order/g)||[]).length===1,'Reject ownership changed before generic action boundary');
need(/onlineOrders:'delivery'/.test(engine),'Restaurant compatibility module bridge unexpectedly removed');
if(fail.length){console.error('Online Orders Core Boundary Gate: FAIL');fail.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Online Orders Core Boundary Gate: PASS');
console.log('classification=core; current_consumer=restaurant-compat; generic_actions=not-yet-migrated; accept_reject=unchanged');
