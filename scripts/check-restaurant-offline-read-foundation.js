const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'beta55-4-runtime-recovery.js'),'utf8');

const store=new Map();
const remote={
 ingredients:[{id:11,name:'Tomato',active:true}],
 ingredient_stock:[{ingredient_id:11,branch_id:1,quantity:7}],
 inventory_units:[{code:'kg',active:true}],
 restaurant_floors:[{id:21,branch_id:1,name:'Main'}],
 restaurant_tables:[{id:31,branch_id:1,floor_id:21,name:'T1'}],
 suppliers:[{id:41,name:'Supplier A',active:true}],
 food_prep_items:[{id:51,name:'Sauce',active:true}],
 products:[{id:61,name:'Burger',active:true}],
 product_variants:[{id:62,product_id:61,name:'Single',active:true}],
 food_recipe_headers:[{id:71,recipe_kind:'sale',product_id:61,variant_id:62}],
 food_recipe_versions:[{id:72,recipe_id:71,version_no:1,status:'active'}],
 food_recipe_branch_cost_v1:[{recipe_version_id:72,branch_id:1,recipe_cost:25}]
};

function makeRuntime({online,business='biz-a',branch=1}){
 const listeners={};let intervalCallback=null;
 const ctx={
  console,JSON,Date,Map,Set,Promise,URLSearchParams,
  navigator:{onLine:online},
  state:{activeBranchId:branch,employee:{id:7},products:[],categories:[],branchProducts:[],modifiers:[],productModifiers:[],productVariants:[],deliveryZones:[],drivers:[],branches:[]},
  session:{access_token:'token'},
  sharawlaRuntimeConfig:{business_id:business},
  currentBranchId:()=>branch,
  rest:async(table)=>{if(!ctx.navigator.onLine)throw new Error('Failed to fetch');return JSON.parse(JSON.stringify(remote[table]||[]))},
  syncOfflineQueue:async()=>true,
  saveOfflineSale:async()=>({}),
  updateNextBonBadge:async()=>{},
  getOpenShift:async()=>null,
  offlineQueue:async()=>[],
  odbGet:async k=>store.has(k)?JSON.parse(JSON.stringify(store.get(k))):null,
  odbSet:async(k,v)=>{store.set(k,JSON.parse(JSON.stringify(v)));return v},
  setOfflineQueue:async()=>{},
  cachedOpenShift:async()=>null,
  rememberOpenShift:async x=>x,
  isNetError:e=>/failed to fetch/i.test(String(e?.message||e)),
  CustomEvent:function(type,opt){this.type=type;this.detail=opt?.detail},
  document:{querySelector:()=>null},
  setTimeout:()=>0,
  clearTimeout:()=>{},
  setInterval:fn=>{intervalCallback=fn;return 1},
  clearInterval:()=>{},
  addEventListener:(n,fn)=>{(listeners[n]||(listeners[n]=[])).push(fn)},
  dispatchEvent:()=>true
 };
 ctx.window=ctx;ctx.globalThis=ctx;
 vm.runInNewContext(source,ctx,{filename:'beta55-4-runtime-recovery.js'});
 if(intervalCallback)intervalCallback();
 return ctx;
}

(async()=>{
 const online=makeRuntime({online:true});
 assert(online.__SharawlaBeta554RuntimeRecovery?.installed,'runtime recovery did not install');
 await online.__SharawlaBeta554RuntimeRecovery.warmRuntimeCaches();

 const expectedTables=['ingredients','ingredient_stock','inventory_units','restaurant_floors','restaurant_tables','suppliers','food_prep_items','products','product_variants','food_recipe_headers','food_recipe_versions','food_recipe_branch_cost_v1'];
 for(const table of expectedTables)assert([...store.keys()].some(k=>k.includes(':biz-a:1:')&&k.includes(`:${table}:`)),`missing scoped snapshot for ${table}`);

 const cold=makeRuntime({online:false,business:'biz-a'});
 const ingredients=await cold.rest('ingredients','select=*&order=active.desc,name');
 assert.strictEqual(ingredients.length,1,'cold restart did not restore ingredient snapshot');
 assert.strictEqual(ingredients[0].name,'Tomato');
 const tables=await cold.rest('restaurant_tables','select=*&branch_id=eq.1&order=floor_id,id');
 assert.strictEqual(tables.length,1,'cold restart did not restore table snapshot');
 const products=await cold.rest('products','select=id,name,active&active=eq.true&order=name');
 assert.strictEqual(products.length,1,'cold restart did not restore product snapshot');
 const variants=await cold.rest('product_variants','select=id,product_id,name,active&active=eq.true&order=product_id,id');
 assert.strictEqual(variants.length,1,'cold restart did not restore variant snapshot');
 const headers=await cold.rest('food_recipe_headers','select=*&order=id');
 assert.strictEqual(headers.length,1,'cold restart did not restore recipe header snapshot');
 const versions=await cold.rest('food_recipe_versions','select=*&order=recipe_id,version_no.desc');
 assert.strictEqual(versions.length,1,'cold restart did not restore recipe version snapshot');
 const costs=await cold.rest('food_recipe_branch_cost_v1','select=*&branch_id=eq.1');
 assert.strictEqual(costs.length,1,'cold restart did not restore recipe cost snapshot');

 const otherBusiness=makeRuntime({online:false,business:'biz-b'});
 let isolated=false;
 try{await otherBusiness.rest('ingredients','select=*&order=active.desc,name')}catch(e){isolated=/not saved|مش محفوظة|تعذر الاتصال/i.test(String(e?.message||e))}
 assert(isolated,'restaurant snapshot leaked across business scope');

 const otherBranch=makeRuntime({online:false,business:'biz-a',branch:2});
 let branchIsolated=false;
 try{await otherBranch.rest('ingredients','select=*&order=active.desc,name')}catch(e){branchIsolated=/not saved|مش محفوظة|تعذر الاتصال/i.test(String(e?.message||e))}
 assert(branchIsolated,'restaurant snapshot leaked across branch scope');

 console.log('Restaurant offline read foundation runtime acceptance OK');
})().catch(e=>{console.error(e);process.exit(1)});
