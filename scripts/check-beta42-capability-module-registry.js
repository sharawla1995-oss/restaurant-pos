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
    enabled_features:['food.ingredients','food.recipes','food.prep','food.production']
  }));
  const appended=[];
  const docEvents=new Map();
  const document={
    readyState:'complete',
    head:{appendChild(el){appended.push(el)}},
    createElement(tag){return {tagName:String(tag).toUpperCase(),dataset:{},defer:false,async:true,src:'',onload:null,onerror:null,getAttribute(name){return name==='src'?this.src:null}}},
    querySelector(){return null},
    querySelectorAll(selector){if(selector==='script[src]')return appended;return []},
    addEventListener(name,fn){docEvents.set(name,fn)}
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

  const sql=read('supabase-beta42-recipe-track-inventory-acceptance.sql');
  must(sql.includes('if v_line.track_inventory then'),'sale path does not gate stock mutation by track_inventory');
  must(sql.includes('if v.track_inventory then'),'return path does not gate stock restoration by track_inventory');
  must(sql.includes("insert into public.food_order_item_consumption_snapshots"),'untracked ingredients would lose consumption snapshots/cost history');
  must(sql.includes("insert into public.food_return_consumption_snapshots"),'returns would lose consumption reversal snapshots');
  must(sql.includes('v_base_cost:=v_base_cost+(v_need*v_unit_cost)'),'base recipe costing missing');
  must(sql.includes('v_mod_cost:=v_mod_cost+(v_need*v_unit_cost)'),'modifier costing missing');
}

sourceContractTest();
behaviorTest();
console.log('Beta42 Capability Module Registry + Recipe track_inventory gate OK.');
