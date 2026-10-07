const fs=require('fs');
const root=p=>fs.readFileSync(p,'utf8'), p='top-burger-unified/';
const app=root(p+'app.js'), idx=root(p+'index.html'), eng=root(p+'restaurant-engine.js'), sw=root(p+'sw.js');
const must=(s,x,m)=>{if(!s.includes(x))throw new Error(m)};
must(app,"https://kzokretuuigjhxjzdlmk.supabase.co",'production URL');
must(app,"sb_publishable_m8gAAZTKnOvCSWNvQijIXw_H1obE9vg",'verified publishable key');
must(app,"business_id:'3e405b6f-feba-4d5c-a4bf-bebb77f2d5d7'",'Top Burger business');
for(const m of ['inventory','pos','returns','reports'])must(app,m,'module '+m);
for(const f of ['food.ingredients','food.recipes','food.prep','food.production','food.waste','food.costing'])must(app,f,'feature '+f);
for(const r of ['suppliers','purchasing','stockCount','transfers','foodIngredients','foodRecipes','foodOperations']){must(eng,r,'engine route '+r);must(idx,'data-page="'+r+'"','nav route '+r)}
must(app,'foodPort.renderSharedRoute(p)','shared route dispatcher');
must(app,'foodPort.openPage(p)','food route dispatcher');
/* routes */
for(const r of ['suppliers','purchasing','stockCount','transfers','foodIngredients','foodRecipes','foodOperations'])must(eng,r,'engine route '+r);
for(const x of ['app.js','restaurant-engine.js','v10-5-16-restaurant-closure-ui.js','inventory-overview-v10-5-16.js','food-advanced-ui-v10-5-16.js']){must(idx,x,'index '+x);must(sw,x,'sw '+x)}
must(app,'window.topBurgerDesktop?.isDesktop','desktop adapter boundary');
must(app,'state.checkoutAttemptTx||uuid()','stable checkout identity');
must(app,"delivery_zone_id:orderType==='delivery'&&deliveryZone?Number(deliveryZoneId):null",'delivery null-zone');
if(app.includes('sb_publishable_9PmytJQY2MhrYUVgMDHzVQ_Av8JH7mP'))throw new Error('unverified key remained');
console.log('TOP_BURGER_UNIFIED_PWA_10_5_16_PASS');