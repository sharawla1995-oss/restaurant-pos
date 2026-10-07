const fs=require('fs');
const app=fs.readFileSync('top-burger-mobile/app.js','utf8');
const idx=fs.readFileSync('top-burger-mobile/index.html','utf8');
const sw=fs.readFileSync('top-burger-mobile/sw.js','utf8');
const closure=fs.readFileSync('top-burger-mobile/v10-5-16-restaurant-closure-ui.js','utf8');
const must=(s,x,m)=>{if(!s.includes(x))throw new Error(m)};
must(app,"'inventory'","inventory entitlement");
for(const f of ['food.ingredients','food.recipes','food.prep','food.production','food.waste','food.costing'])must(app,f,'feature '+f);
for(const p of ['suppliers','purchasing','stockCount','transfers','foodIngredients','foodRecipes','foodOperations']){must(idx,'data-page="'+p+'"','nav '+p);must(app,"['"+p+"'","home "+p)}
must(app,'foodPort.renderSharedRoute(p)','shared inventory routing');
must(app,'foodPort.openPage(p)','food routing');
for(const p of ['renderSuppliers','renderPurchasing','renderStockCount','renderTransfers','renderIngredients','renderFoodOperations'])must(closure,p,'production UI '+p);
for(const a of ['v10-5-16-restaurant-closure-ui.js','inventory-overview-v10-5-16.js','food-advanced-ui-v10-5-16.js','food-recipe-runtime-bridge-v10-5-16.js']){must(idx,a,'index '+a);must(sw,a,'cache '+a)}
must(app,'state.checkoutAttemptTx||uuid()','stable checkout transaction');
must(app,"delivery_zone_id:orderType==='delivery'&&deliveryZone?Number(deliveryZoneId):null",'delivery null zone');
console.log('TOP_BURGER_MOBILE_FULL_V10_5_16_PASS');
