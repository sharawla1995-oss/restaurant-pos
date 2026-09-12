const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const must=(cond,msg)=>{if(!cond)throw new Error(`Beta39 Capability V3 gate failed: ${msg}`)};

function runtimeTest(){
 const store=new Map();
 const localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const window={localStorage};window.window=window;
 const sandbox={window,localStorage};
 for(const file of ['sharawla-runtime-core.js','sharawla-capabilities.js','sharawla-capabilities-beta33.js','sharawla-capabilities-v3.js','sharawla-capability-runtime-bridge.js'])vm.runInNewContext(read(file),sandbox,{filename:file});
 const caps=window.SharawlaCapabilities,core=window.SharawlaRuntimeCore;
 must(caps.CATALOG_VERSION===3,'catalog version must be 3');
 must(caps.FEATURE_COUNT===107,`expected 107 features, found ${caps.FEATURE_COUNT}`);
 must(caps.PROFILE_COUNT===8,`expected 8 profiles, found ${caps.PROFILE_COUNT}`);
 must(caps.V3_EXTRA_CODES.length===42,`expected 42 V3 additions, found ${caps.V3_EXTRA_CODES.length}`);
 must(caps.listFeatures().length===107,'listFeatures must return 107 unique rows');
 const variants=caps.getFeature('commerce.variants');
 must(variants&&variants.dependsOn.includes('commerce.products'),'commerce.variants dependency is wrong');
 const ingredients=caps.getFeature('food.ingredients');
 const recipes=caps.getFeature('food.recipes');
 must(ingredients&&ingredients.dependsOn.length===1&&ingredients.dependsOn[0]==='inventory.stock','food.ingredients dependency correction missing');
 must(recipes&&recipes.dependsOn.includes('food.ingredients')&&!recipes.dependsOn.includes('food.recipes'),'food.recipes dependency correction missing');
 must(caps.getProfile('service')?.implemented===true,'Service profile must be implemented in V3 parity');
 must(caps.getProfile('general')?.active===false&&caps.getProfile('general')?.implemented===false,'General profile must remain inactive/unimplemented');
 core.registerEngine({code:'retail',resolveModules:(m)=>m,pageAllowed:()=>true});
 const raw={business_id:'beta-business',business_name:'تجريبي',pos_profile:'retail',profile_active:true,profile_implemented:true,modules_configured:true,enabled_modules:['pos','inventory'],features_configured:true,enabled_features:['commerce.variants','future.experimental'],capability_version:1};
 const cfg=core.prepareConfig(raw);
 must(cfg.runtime_contract==='v2','Cloud Runtime contract must remain V2');
 must(cfg.capability_catalog_version===3,'runtime cache must record catalog V3');
 must(cfg.capability_source==='cloud-features-v3-authoritative','Cloud V3 authority marker missing');
 for(const code of ['commerce.variants','commerce.products','commerce.pos','future.experimental'])must(core.featureEnabled(cfg,code),`runtime dropped ${code}`);
 core.saveCache('runtime',cfg);
 const cached=core.loadCache('runtime','beta-business');
 for(const code of ['commerce.variants','future.experimental'])must(core.featureEnabled(cached,code),`cache roundtrip dropped ${code}`);
 must(cached.capability_catalog_version===3,'cache roundtrip lost catalog version');
}

function shellTest(){
 const pkg=JSON.parse(read('package.json')),version=String(pkg.version||'');
 must(/^10\.5\.4-beta\.(\d+)$/.test(version)&&Number(version.match(/beta\.(\d+)$/)[1])>=39,'package version must be Beta39 or newer');
 const index=read('index.html'),sw=read('sw.js');
 const chain=['sharawla-runtime-core.js','sharawla-capabilities.js','sharawla-capabilities-beta33.js','sharawla-capabilities-v3.js','sharawla-capability-runtime-bridge.js','sharawla-feature-consumption.js','sharawla-cloud-runtime-v2.js','restaurant-engine.js'];
 let prev=-1;
 for(const asset of chain){
  const token=`${asset}?v=${version}`;const pos=index.indexOf(token);
  must(pos>=0,`index missing ${asset}`);must(pos>prev,`unsafe load order at ${asset}`);prev=pos;
  must(sw.includes(`./${asset}?v=${version}`),`service worker shell missing ${asset}`);
 }
 must(sw.includes("url.pathname.endsWith('/sharawla-capabilities-v3.js')"),'service worker fetch policy missing V3 registry');
 const sync=read('scripts/sync-version.js');
 must(sync.includes('Source shell missing required asset before version sync'),'sync-version must fail closed on missing source wiring');
}

runtimeTest();
shellTest();
console.log('Beta39 Capability Runtime V3 parity gate OK.');
