'use strict';
const fs=require('fs');
const app=fs.readFileSync('app.js','utf8');
const restaurant=fs.readFileSync('beta55-restaurant-closure-ui.js','utf8');
const reg=fs.readFileSync('sharawla-navigation-registry.js','utf8');
const advanced=fs.readFileSync('advanced-purchasing-v1.js','utf8');
const fail=[];const need=(ok,msg)=>{if(!ok)fail.push(msg)};

need(app.includes('SHARED-INVENTORY-PURCHASING-ROUTER-V1'),'Core shared router marker missing');
need(app.includes("new Set(['suppliers','purchasing','stockCount','transfers'])"),'Core shared route set missing');
need(app.includes("if(profile==='restaurant')"),'Restaurant adapter dispatch missing');
need(app.includes("if(profile==='retail')"),'Retail adapter dispatch missing');
need(app.includes('data-shared-inventory-route-fail-closed'),'Unsupported-profile fail-closed missing');

for(const route of ['suppliers','purchasing','stockCount','transfers']){
  need(app.includes(route+":(...args)=>renderSharedInventoryPurchasingRoute('"+route+"'"),route+' PAGE_RENDERERS does not delegate to Core router');
  need(new RegExp("routeKey:'"+route+"'[^\n]+profile:'core'[^\n]+renderer:'renderSharedInventoryPurchasingRoute'[^\n]+rendererOwner:'app\\.js'[^\n]+conflictStatus:'NONE'[^\n]+migrationStatus:S").test(reg),route+' Registry Core ownership not closed');
}

need(restaurant.includes("const PAGES=new Set(['foodIngredients','foodRecipes','foodOperations','tables'])"),'Restaurant capture still owns shared inventory routes');
need(restaurant.includes("const SHARED_ROUTES=new Set(['suppliers','purchasing','stockCount','transfers'])"),'Restaurant shared adapter set missing');
need(restaurant.includes('async function renderSharedRoute(page)'),'Restaurant adapter API missing');
need(restaurant.includes('sharedRoutes:[...SHARED_ROUTES],openPage,renderSharedRoute,canPage'),'Restaurant adapter export missing');
need(!/const PAGES=new Set\([^\n]*(suppliers|purchasing|stockCount|transfers)/.test(restaurant),'Restaurant capture PAGES still includes shared route');

need(advanced.includes("function enabled(){return retail()"),'Advanced Purchasing must remain Retail-only augmentation');
need(!advanced.includes('button[data-page="purchasing"]'),'Advanced Purchasing must not own the route');

if(fail.length){console.error('Shared Inventory/Purchasing Routing V1: FAIL');fail.forEach(x=>console.error('- '+x));process.exit(1)}
console.log('Shared Inventory/Purchasing Routing V1: PASS');
console.log('owner=core; adapters=restaurant,retail; unsupported=fail-closed; business-rpcs=unchanged');
