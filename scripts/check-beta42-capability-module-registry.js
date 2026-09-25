const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const must=(cond,msg)=>{if(!cond)throw new Error(`Beta42 Capability Registry failed: ${msg}`)};

function behaviorTest(){
  const store=new Map();
  store.set('sharawlaRuntimeConfigV1',JSON.stringify({
    pos_profile:'retail',
    capability_version:2,
    enabled_features:['commerce.variants','food.ingredients','food.recipes','food.prep','food.production']
  }));
  const appended=[];
  const document={
    readyState:'complete',
    head:{appendChild(el){appended.push(el)}},
    createElement(tag){return {tagName:String(tag).toUpperCase(),dataset:{},defer:false,async:true,src:'',onload:null,onerror:null,getAttribute(name){return name==='src'?this.src:null}}},
    querySelector(){return null},
    querySelectorAll(selector){return selector==='script[src]'?appended:[]},
    addEventListener(){}
  };
  const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))};
  const window={localStorage,addEventListener(){},dispatchEvent(){},console};
  window.window=window;
  const sandbox={window,document,localStorage,console,CustomEvent:function(name,opts){this.type=name;this.detail=opts?.detail},Set,Map};
  vm.runInNewContext(read('sharawla-capability-module-registry.js'),sandbox,{filename:'sharawla-capability-module-registry.js'});
  const api=window.SharawlaCapabilityModuleRegistry;
  must(api,'registry API missing');
  const paths=appended.map(x=>String(x.src).split('?')[0]);
  must(paths.includes('food-recipe-runtime-bridge.js'),'Retail entitlement did not load Recipe runtime');
  must(paths.includes('food-recipe-ui-v1.js'),'Retail entitlement did not load Recipe UI');
  must(paths.includes('food-advanced-ui-v1.js'),'Retail entitlement did not load advanced food UI');
  must(new Set(paths).size===paths.length,'registry loaded duplicate assets');
  const before=appended.length;api.reconcile();must(appended.length===before,'reconcile duplicated already loaded assets');
  must(api.featureModules('food.recipes').some(x=>x.code==='food.recipe.runtime'),'feature→runtime mapping missing');
  must(api.featureModules('food.recipes').some(x=>x.code==='food.recipe.ui'),'feature→UI mapping missing');
  must(api.featureModules('food.production').some(x=>x.permission==='inventory'),'feature permission metadata missing');
  store.set('sharawlaRuntimeConfigV1',JSON.stringify({pos_profile:'retail',capability_version:2,enabled_features:[]}));
  must(api.reconcile().length===0,'disabled entitlements still report active modules');
}

async function recipeRoutingTest(){
  const store=new Map([['sharawlaRuntimeConfigV1',JSON.stringify({
    pos_profile:'retail',enabled_features:['food.recipes','commerce.variants']
  })]]);
  const calls=[];
  const localStorage={getItem:k=>store.get(k)||null};
  const document={readyState:'complete',addEventListener(){}};
  const window={
    window:null,localStorage,console,
    rpc:async(name,payload)=>{calls.push({name,payload});return {ok:true}},
    saveOfflineSale:async(...args)=>{calls.push({name:'offline',args});return {ok:true}}
  };
  window.window=window;
  const sandbox={window,document,localStorage,console,setTimeout,clearTimeout};
  vm.runInNewContext(read('food-recipe-runtime-bridge.js'),sandbox,{filename:'food-recipe-runtime-bridge.js'});

  await window.rpc('create_retail_pos_order_atomic',{p_items:[{product_id:1,variant_id:7,quantity:1,cost:25}]});
  await window.rpc('create_retail_order_return_idempotent',{p_order_id:1});
  await window.rpc('create_pos_order_atomic',{p_items:[{product_id:1,quantity:1}]});
  await window.rpc('create_order_return_idempotent',{p_order_id:1});

  must(calls[0].name==='create_food_retail_pos_order_atomic_v1','Retail sale is not routed through canonical Food+Retail RPC');
  must(calls[0].payload.p_use_variants===true,'Retail Variant sale lost p_use_variants');
  must(calls[1].name==='create_food_retail_order_return_idempotent_v1','Retail return is not routed through canonical Food+Retail RPC');
  must(calls[1].payload.p_use_variants===true,'Retail Variant return lost p_use_variants');
  must(calls[2].name==='create_food_pos_order_atomic_v1','Restaurant/base sale Recipe route regressed');
  must(calls[3].name==='create_food_order_return_idempotent_v1','Restaurant/base return Recipe route regressed');

  await window.saveOfflineSale({branch_id:1},[{product_id:1,variant_id:7,removed:['x'],modifiers:[{id:9}]}],[], 'tx');
  const offline=calls.find(x=>x.name==='offline');
  must(offline&&offline.args[1][0].variant_id===7,'Offline Recipe payload lost variant identity');
  must(Array.isArray(offline.args[1][0].removed)&&offline.args[1][0].removed[0]==='x','Offline Recipe payload lost removals');
  must(Array.isArray(offline.args[1][0].modifiers)&&offline.args[1][0].modifiers[0].id===9,'Offline Recipe payload lost modifiers');
}

function sourceContractTest(){
  const registry=read('sharawla-capability-module-registry.js');
  for(const token of ['food.recipe.runtime','food.recipe.ui','food.advanced.ui','food.recipes','food.prep','food.production','food.waste','food.costing','contracts','permission'])must(registry.includes(token),`registry invariant missing: ${token}`);

  const restaurant=read('restaurant-engine.js');
  for(const oldLoader of ['food-recipe-runtime-bridge.js','food-recipe-ui-v1.js','food-advanced-ui-v1.js'])must(!restaurant.includes(oldLoader),`Restaurant engine still owns ${oldLoader}`);

  for(const file of ['food-recipe-runtime-bridge.js','food-recipe-ui-v1.js','food-advanced-ui-v1.js']){
    const src=read(file);
    must(!src.includes('pos_profile'),`${file} is still hard-gated by POS profile`);
  }

  const consumption=read('sharawla-feature-consumption.js');
  must(consumption.includes('sharawla-capability-module-registry.js?v='),'shared consumption layer does not bootstrap registry');
  const sync=read('scripts/sync-version.js');
  for(const token of ['sharawla-capability-module-registry.js','food-recipe-runtime-bridge.js','food-recipe-ui-v1.js','food-advanced-ui-v1.js'])must(sync.includes(token),`version sync missing ${token}`);
  const sw=read('sw.js');
  for(const token of ['sharawla-capability-module-registry.js','food-recipe-runtime-bridge.js','food-recipe-ui-v1.js','food-advanced-ui-v1.js'])must(sw.includes(token),`service worker missing ${token}`);

  const trackSql=read('supabase-beta42-recipe-track-inventory-acceptance.sql');
  must(trackSql.includes('if v_line.track_inventory then'),'sale path does not gate stock mutation by track_inventory');
  must(trackSql.includes('if v.track_inventory then'),'return path does not gate stock restoration by track_inventory');
  must(trackSql.includes('food_order_item_consumption_snapshots'),'untracked ingredients would lose sale snapshots/cost history');
  must(trackSql.includes('food_return_consumption_snapshots'),'returns would lose reversal snapshots');

  const canonicalSql=read('supabase-beta42-food-cross-profile-retail-runtime-v1.sql');
  for(const token of [
    'create_food_retail_pos_order_atomic_v1',
    'create_retail_variant_pos_order_atomic_v1',
    'create_retail_pos_order_atomic',
    'food_apply_order_consumption_v1',
    'create_food_retail_order_return_idempotent_v1',
    'food_apply_return_consumption_v1',
    'order_items.cost'
  ])must(canonicalSql.includes(token),`Canonical Retail/Recipe runtime missing ${token}`);
  must(canonicalSql.includes('set cost=coalesce'),'Retail COGS preservation contract missing');

  const helperSql=read('supabase-beta42-food-helper-duplicate-composition-fix.sql');
  must(helperSql.includes('food_apply_order_consumption_v1'),'Recipe helper patch missing');
  must(helperSql.includes('food_order_item_cost_snapshots where order_item_id=v_order_item_id'),'Recipe helper per-item idempotency guard not asserted');

  const bridge=read('food-recipe-runtime-bridge.js');
  must(bridge.includes("baseRpc('create_food_retail_pos_order_atomic_v1'"),'Canonical Retail Recipe sale routing missing');
  must(bridge.includes("baseRpc('create_food_retail_order_return_idempotent_v1'"),'Canonical Retail Recipe return routing missing');
  must(!bridge.includes("baseRpc('create_retail_food_pos_order_atomic_v1'"),'Obsolete Retail/Food sale alias reintroduced');
  must(!bridge.includes("baseRpc('create_retail_food_order_return_idempotent_v1'"),'Obsolete Retail/Food return alias reintroduced');

  const app=read('app.js');
  must(app.includes("job.engine==='retail'?'create_retail_pos_order_atomic':'create_pos_order_atomic'"),'offline sale engine routing contract changed unexpectedly');
  must(app.includes("job.engine==='retail'?'create_retail_order_return_idempotent':'create_order_return_idempotent'"),'offline return engine routing contract changed unexpectedly');
}

(async()=>{
  sourceContractTest();
  behaviorTest();
  await recipeRoutingTest();
  console.log('Beta42 Capability Registry + canonical Retail Recipe composition gates OK.');
})().catch(e=>{console.error(e);process.exit(1)});
