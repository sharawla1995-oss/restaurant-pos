const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const assert=(ok,msg)=>{if(!ok){console.error('FAIL:',msg);process.exit(1)}};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');

const pkg=JSON.parse(read('package.json'));
const ver=JSON.parse(read('version.json'));
const index=read('index.html');
const app=read('app.js');
const css=read('styles.css');
const core=read('sharawla-runtime-core.js');
const engine=read('restaurant-engine.js');
const recipe=read('food-recipe-ui-v1.js');
const main=read('main.js');
const wf=read('.github/workflows/v10-5-11-emergency-restore.yml');

for(const [name,src] of [['app.js',app],['main.js',main],['sharawla-runtime-core.js',core],['restaurant-engine.js',engine],['food-recipe-ui-v1.js',recipe]]){
  try{new Function(src)}catch(e){console.error('FAIL:',name,'syntax',e);process.exit(1)}
}
assert(pkg.version==='10.5.11','package version');
assert(ver.version==='10.5.11'&&ver.channel==='stable','version stable');
assert(index.includes('V10.5.11'),'UI badge');
for(const asset of ['styles.css','sharawla-runtime-core.js','restaurant-engine.js','food-recipe-ui-v1.js','app.js'])
  assert(index.includes(asset+'?v=10.5.11'),'cache stamp '+asset);

// Explicitly prove the 10.5.10 hotfix is absent.
assert(!app.includes("classList.toggle('delivery-mode',delivery)"),'10.5.10 JS hotfix must be absent');
assert(!css.includes('V10.5.10 — compact delivery cashier hotfix'),'10.5.10 CSS hotfix must be absent');
assert(!css.includes('.cart.delivery-mode'),'delivery-mode CSS must be absent');

// Preserve certified 10.5.9 production capabilities.
assert(app.includes('get_sharawla_business_runtime_config_v2'),'Runtime V2 preserved');
assert(core.includes('enabled_features:enabledFeatures'),'feature cache preserved');
assert(engine.includes("foodRecipes:'food.recipes'"),'Recipe page mapping preserved');
assert(recipe.includes('recipe_pos_save_ingredient_v1'),'Recipe ingredient owner preserved');
assert(recipe.includes('recipe_pos_replace_recipe_v1'),'Recipe replace owner preserved');
assert(main.includes('startUpdateWatch()'),'desktop updater preserved');

assert(wf.includes('candidate/v10.5.11-emergency-restore'),'candidate branch gate');
assert(wf.includes('contents: read'),'workflow read-only');
assert(!wf.includes('contents: write'),'candidate cannot write');
assert((wf.match(/--publish never/g)||[]).length>=2,'candidate never publishes');
assert(!wf.includes('gh release'),'candidate cannot release');
assert(!wf.includes('git tag'),'candidate cannot tag');

console.log('V10.5.11_EMERGENCY_RESTORE_CHECK_PASS');
