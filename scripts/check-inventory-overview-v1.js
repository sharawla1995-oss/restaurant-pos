'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const js=fs.readFileSync('inventory-overview-v1.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const fail=[];
const need=(ok,msg)=>{if(!ok)fail.push(msg)};

try{new Function(js)}catch(e){fail.push('Inventory Overview syntax: '+e.message)}
need(pkg.version.startsWith('10.5.4-beta.58.'),'Inventory Overview must stay on Beta58 line');
need(js.includes("const VERSION='1.0.0-core-profile-aware'"),'Core Inventory Overview marker missing');
need(js.includes("global.SharawlaRuntimeConfig?.current?.()"),'Authoritative Runtime Config profile read missing');
need(js.includes("mode:'CORE_PROFILE_AWARE_READ_ONLY'"),'Read-only Core mode marker missing');
need(!/\brpc\s*\(/.test(js),'Core Inventory Overview must not call mutation RPCs');
need(!/global\.state\b/.test(js),'Inventory Overview must not depend on lexical app state through global.state');

for(const pair of [
  ["restaurant:renderFoodOverview",'Restaurant adapter missing'],
  ["cafe:renderFoodOverview",'Cafe adapter missing'],
  ["retail:renderRetailOverview",'Retail adapter missing'],
  ["market:renderRetailOverview",'Market adapter missing'],
  ["warehouse:renderWarehouseOverview",'Warehouse adapter missing'],
  ["pharmacy:renderPharmacyOverview",'Pharmacy adapter missing']
]) need(js.includes(pair[0]),pair[1]);

need(js.includes("ingredient_stock"),'Restaurant/Cafe inventory source missing');
need(js.includes("retail_inventory_balances"),'Retail/Warehouse inventory source missing');
need(js.includes("retail_variant_inventory_balances"),'Variant inventory source missing');
need(js.includes("pharmacy_batches"),'Pharmacy batch inventory source missing');
need(js.includes("PROFILE_ADAPTER_MISSING"),'Unsupported-profile fail-closed guard missing');
need(js.includes("بدل استخدام Restaurant fallback"),'Restaurant-fallback prevention marker missing');
need(js.includes("global.renderRetailInventory"),'Retail detail preservation hook missing');
need(js.includes("target.click()"),'Quick actions must delegate through existing navigation owner');

const start=app.indexOf('async function renderInventory(){');
const end=app.indexOf('function retailQty(',start);
need(start>=0&&end>start,'renderInventory delegate boundary missing');
if(start>=0&&end>start){
  const body=app.slice(start,end);
  need(body.includes('INVENTORY-OVERVIEW-V1-CORE-DELEGATE'),'app Inventory Overview delegate marker missing');
  need(body.includes('__SharawlaInventoryOverviewV1'),'app does not delegate inventory to Core Overview runtime');
  need(!body.includes('ingredient_stock'),'Legacy Restaurant ingredient table still owns core inventory route');
  need(!body.includes('isRetailProfile()'),'Core inventory route still branches Restaurant-vs-Retail in app.js');
}

const ref='inventory-overview-v1.js?v='+pkg.version;
need(html.split(ref).length-1===1,'Inventory Overview runtime must load exactly once at package version');
need(html.indexOf('app.js?v=')<html.indexOf(ref),'Inventory Overview must load after app.js delegate');
need(html.includes('sharawla-navigation-registry.js?v='+pkg.version),'Navigation Registry package ref not synchronized');
need(html.includes('product-map-navigation-v1.js?v='+pkg.version),'Product Map package ref not synchronized');

if(fail.length){
  console.error('Core Inventory Overview V1: FAIL');
  fail.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('Core Inventory Overview V1: PASS');
console.log('mode=read-only; core-route=inventory; profile-aware=true; restaurant-fallback=false; stock-writes=none');
