const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const assert=(ok,msg)=>{if(!ok){console.error('FAIL:',msg);process.exit(1)}};

const pkg=JSON.parse(read('package.json'));
const ver=JSON.parse(read('version.json'));
const index=read('index.html');
const app=read('app.js');
const css=read('styles.css');
const core=read('sharawla-runtime-core.js');
const engine=read('restaurant-engine.js');
const recipeUi=read('food-recipe-ui-v1.js');
const softSql=read('supabase-v10-5-8-recipe-soft-consumption-v1.sql');
const recipeSql=read('supabase-v10-5-9-recipe-pos-admin-wrappers-v1.sql');
const main=read('main.js');
const wf=read('.github/workflows/v10-5-10-delivery-ui-hotfix-candidate.yml');

for(const [name,src] of [['app.js',app],['main.js',main],['sharawla-runtime-core.js',core],['restaurant-engine.js',engine],['food-recipe-ui-v1.js',recipeUi]]){
  try{new Function(src)}catch(e){console.error('FAIL:',name,'syntax',e);process.exit(1)}
}

assert(pkg.version==='10.5.10','package version');
assert(ver.version==='10.5.10'&&ver.channel==='stable','version.json stable 10.5.10');
assert(index.includes('V10.5.10'),'UI badge');
for(const asset of ['styles.css','sharawla-runtime-core.js','restaurant-engine.js','food-recipe-ui-v1.js','app.js'])
  assert(index.includes(asset+'?v=10.5.10'),'cache stamp '+asset);

assert(app.includes("$('.cart')?.classList.toggle('delivery-mode',delivery);"),'delivery-mode class toggle');
assert(css.includes('V10.5.10 — compact delivery cashier hotfix'),'hotfix CSS marker');
for(const marker of [
  '.cart.delivery-mode .cart-head',
  '.cart.delivery-mode .delivery-fields',
  '.cart.delivery-mode #deliveryAddress',
  '.cart.delivery-mode .cart-items',
  '.cart.delivery-mode .cart-foot',
  '.cart.delivery-mode .pay-actions'
]) assert(css.includes(marker),'compact delivery marker '+marker);

for(const marker of [
  'function checkout(',
  'function lookupCustomerByPhone(',
  'function refreshDeliveryDrivers(',
  'function drawCart(',
  "get_sharawla_business_runtime_config_v2"
]) assert(app.includes(marker),'production POS owner '+marker);

assert(core.includes('enabled_features:enabledFeatures'),'Runtime V2 feature cache preserved');
assert(engine.includes("foodRecipes:'food.recipes'"),'Recipe feature mapping preserved');
for(const marker of ['recipe_pos_save_ingredient_v1','recipe_pos_replace_recipe_v1'])
  assert(recipeUi.includes(marker),'Recipe UI owner preserved '+marker);
for(const marker of ['public.is_admin()','recipe_admin_save_ingredient_v1','recipe_admin_replace_recipe_v1'])
  assert(recipeSql.toLowerCase().includes(marker.toLowerCase()),'Recipe wrapper preserved '+marker);
for(const marker of ['exception when others','set quantity=round(coalesce(v_stock_quantity,0)-v_need,6)','from public.recipe_order_item_consumption_v1 s'])
  assert(softSql.includes(marker),'fail-open/frozen Recipe safety '+marker);

assert(wf.includes('candidate/v10.5.10-delivery-ui-hotfix'),'candidate branch gate');
assert(wf.includes('contents: read'),'candidate workflow read-only');
assert(!wf.includes('contents: write'),'candidate cannot write repo');
assert((wf.match(/--publish never/g)||[]).length>=2,'candidate must never publish');
assert(!wf.includes('gh release'),'candidate cannot create release');
assert(!wf.includes('git tag'),'candidate cannot create tag');

console.log('V10.5.10_DELIVERY_UI_HOTFIX_CHECK_PASS');
