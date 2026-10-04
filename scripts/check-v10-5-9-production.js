const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const assert=(ok,msg)=>{if(!ok){console.error('FAIL:',msg);process.exit(1)}};

const pkg=JSON.parse(read('package.json'));
const ver=JSON.parse(read('version.json'));
const index=read('index.html');
const app=read('app.js');
const core=read('sharawla-runtime-core.js');
const engine=read('restaurant-engine.js');
const recipeUi=read('food-recipe-ui-v1.js');
const recipeSql=read('supabase-v10-5-9-recipe-pos-admin-wrappers-v1.sql');
const softSql=read('supabase-v10-5-8-recipe-soft-consumption-v1.sql');
const main=read('main.js');
const wf=read('.github/workflows/v10-5-9-production-recipe-ui-candidate.yml');
const releaseWf=read('.github/workflows/build-windows-release.yml');

for(const [name,src] of [['app.js',app],['main.js',main],['sharawla-runtime-core.js',core],['restaurant-engine.js',engine],['food-recipe-ui-v1.js',recipeUi]]){
  try{new Function(src)}catch(e){console.error('FAIL:',name,'syntax',e);process.exit(1)}
}

assert(pkg.version==='10.5.9','package version');
assert(ver.version==='10.5.9'&&ver.channel==='stable','version.json stable 10.5.9');
assert(index.includes('V10.5.9'),'UI badge');
for(const asset of ['styles.css','sharawla-runtime-core.js','restaurant-engine.js','food-recipe-ui-v1.js','app.js'])
  assert(index.includes(asset+'?v=10.5.9'),'cache stamp '+asset);

assert(app.includes('get_sharawla_business_runtime_config_v2'),'runtime v2 preferred');
assert(app.includes("get_sharawla_business_runtime_config'"),'runtime v1 fallback preserved');
assert(core.includes('enabled_features:enabledFeatures'),'runtime cache preserves enabled features');
assert(core.includes('function featureEnabled(config,code)'),'runtime feature helper');
assert(engine.includes("foodRecipes:'food.recipes'"),'recipe page feature mapping');
assert(!/foodRecipes\s*:\s*['"]inventory['"]/.test(engine),'recipe page must not depend on disabled inventory module');
assert(app.includes("if(page==='foodRecipes')return isAdmin()"),'recipe UI admin-only');
assert(app.includes('foodRecipes:renderFoodRecipes'),'recipe page dispatch');
assert(index.includes('data-page="foodRecipes"'),'recipe nav item');

for(const marker of ['recipe_pos_save_ingredient_v1','recipe_pos_replace_recipe_v1','runtimeFeatureEnabled?.(FEATURE)','إدارة الوصفات متاحة للمدير فقط','Snapshot'])
  assert(recipeUi.includes(marker),'recipe UI marker '+marker);
assert(!recipeUi.includes('SharawlaOfflineV2Transport'),'no Offline V2 transport in production recipe UI');
assert(!recipeUi.includes('food_recipe_save_draft'),'no Beta versioned recipe owner in production UI');
assert(!recipeUi.includes('SUPABASE_SERVICE_ROLE_KEY'),'no service role in client');
assert(!/rest\(['"]recipes['"][\s\S]{0,120}method\s*:\s*['"](POST|PATCH|DELETE)/i.test(recipeUi),'no direct recipe writes');
assert(!/rest\(['"]ingredient_stock['"][\s\S]{0,160}method\s*:/i.test(recipeUi),'recipe UI must not adjust stock');

for(const marker of ['public.is_admin()','recipe_admin_save_ingredient_v1','recipe_admin_replace_recipe_v1','grant execute on function public.recipe_pos_save_ingredient_v1','grant execute on function public.recipe_pos_replace_recipe_v1'])
  assert(recipeSql.toLowerCase().includes(marker.toLowerCase()),'wrapper SQL '+marker);
assert(!/insert\s+into\s+public\.(ingredients|recipes|ingredient_stock)/i.test(recipeSql),'wrapper must not introduce direct writers');
assert(!/update\s+public\.(ingredients|recipes|ingredient_stock)/i.test(recipeSql),'wrapper must not introduce direct writers');
assert(!/delete\s+from\s+public\.(ingredients|recipes|ingredient_stock)/i.test(recipeSql),'wrapper must not introduce direct writers');

for(const marker of ['exception when others','set quantity=round(coalesce(v_stock_quantity,0)-v_need,6)','from public.recipe_order_item_consumption_v1 s',"hashtextextended('recipe-return-order-item-v1:'"])
  assert(softSql.includes(marker),'10.5.8 recipe safety preserved '+marker);

for(const forbiddenPath of ['supabase-v10-5-6-return-approval-v1.sql','scripts/check-return-approval-v1.js','.github/workflows/return-approval-v1-candidate.yml'])
  assert(!fs.existsSync(path.join(root,forbiddenPath)),'forbidden beta/return-approval artifact '+forbiddenPath);

assert(wf.includes('candidate/v10.5.9-production-recipe-ui'),'candidate workflow branch');
assert(wf.includes('contents: read'),'candidate workflow read-only');
assert(!wf.includes('contents: write'),'candidate workflow cannot write repo');
assert((wf.match(/--publish never/g)||[]).length>=2,'candidate must never publish');
assert(!wf.includes('gh release'),'candidate cannot create release');
assert(!wf.includes('git tag'),'candidate cannot create tag');

assert(releaseWf.includes('release/v10.5.8-production-recipe'),'10.5.8 stable workflow stays pinned');
assert(!releaseWf.includes('v10.5.9'),'candidate must not mutate stable release workflow');

console.log('V10.5.9_PRODUCTION_RECIPE_UI_CHECK_PASS');
