'use strict';
const fs=require('fs');
function read(p){return fs.readFileSync(p,'utf8')}
const app=read('app.js');
const engine=read('restaurant-engine.js');
const registry=read('sharawla-navigation-registry.js');
const html=read('index.html');
const fail=[];
function need(ok,msg){if(!ok)fail.push(msg)}
need(/onlineOrders:renderDeliveryOrders/.test(app),'onlineOrders renderer compatibility binding missing');
need(/page==='onlineOrders'\)return canAccessPage\('deliveryOrders'\)/.test(app),'onlineOrders permission compatibility binding missing');
need(/onlineOrders:'delivery'/.test(engine),'restaurant module binding missing');
need(/onlineOrders:'enable_delivery'/.test(engine),'restaurant operational gate missing');
need(/routeKey:'onlineOrders'[^\n]+pagePermission:'deliveryOrders'/.test(registry),'registry compatibility permission missing');
need(/routeKey:'onlineOrders'[^\n]+COMPATIBILITY_ALIAS_FOUNDATION/.test(registry),'registry foundation marker missing');
need(!/data-page="onlineOrders"/.test(html),'Batch 1 must not expose sidebar navigation yet');
need((app.match(/accept_website_order/g)||[]).length===1,'accept website RPC ownership changed unexpectedly');
need((app.match(/reject_website_order/g)||[]).length===1,'reject website RPC ownership changed unexpectedly');
if(fail.length){console.error('Online Orders Batch 1 Route Foundation: FAIL');fail.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Online Orders Batch 1 Route Foundation: PASS');
console.log('route=onlineOrders; renderer=compatibility; permission=deliveryOrders; nav_exposed=false; db_changes=none');
