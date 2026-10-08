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
const recipe=read('food-recipe-ui-v1.js');
const main=read('main.js');
const wf=read('.github/workflows/v10-5-12-branch-open-fix.yml');

for(const [name,src] of [['app.js',app],['main.js',main],['sharawla-runtime-core.js',core],['restaurant-engine.js',engine],['food-recipe-ui-v1.js',recipe]]){
  try{new Function(src)}catch(e){console.error('FAIL:',name,'syntax',e);process.exit(1)}
}

assert(['10.5.13','10.5.14','10.5.15','10.5.16','10.5.17','10.5.18'].includes(pkg.version),'package version');
assert(ver.version===pkg.version&&['candidate','stable'].includes(ver.channel),'version candidate');
assert(index.includes('V'+pkg.version),'UI badge');
for(const asset of ['styles.css','sharawla-runtime-core.js','restaurant-engine.js','food-recipe-ui-v1.js','app.js'])
  assert(index.includes(asset+'?v='+pkg.version),'cache stamp '+asset);

// Root-cause regression guard: querySelector result must never be treated as a NodeList here.
assert(app.includes("function navActive(p){$$('#nav button').forEach("),'navActive must use querySelectorAll helper');
assert(!app.includes("function navActive(p){$('#nav button').forEach("),'broken querySelector.forEach must be absent');

// Branch open path must remain selectBranch -> showPage(home) -> navActive.
assert(app.includes("function selectBranch(id){"),'selectBranch exists');
assert(app.includes("showPage('home');"),'branch open routes to home');
assert(app.includes("function renderBranchPicker(){"),'branch picker exists');

// Preserve emergency-restore baseline and remove 10.5.10 hotfix.
assert(!app.includes("classList.toggle('delivery-mode',delivery)"),'10.5.10 runtime hotfix absent');
assert(!css.includes('.cart.delivery-mode'),'10.5.10 CSS absent');
assert(app.includes('get_sharawla_business_runtime_config_v2'),'Runtime V2 preserved');
assert(core.includes('enabled_features:enabledFeatures'),'feature cache preserved');
assert(engine.includes("foodRecipes:'food.recipes'"),'Recipe mapping preserved');
assert(recipe.includes('recipe_pos_save_ingredient_v1'),'Recipe owner preserved');
assert(main.includes('startUpdateWatch()'),'updater preserved');

assert(wf.includes('candidate/v10.5.12-branch-open-fix'),'candidate branch gate');
assert(wf.includes('contents: read'),'workflow read-only');
assert(!wf.includes('contents: write'),'candidate cannot write');
assert((wf.match(/--publish never/g)||[]).length>=2,'candidate never publishes');
assert(!wf.includes('gh release'),'candidate cannot release');
assert(!wf.includes('git tag'),'candidate cannot tag');

console.log('V10.5.13_BRANCH_OPEN_REGRESSION_PASS');
