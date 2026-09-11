const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const must=(cond,msg)=>{if(!cond)throw new Error(`Beta34 Feature Consumption gate failed: ${msg}`)};

function makeStorage(){
  const map=new Map();
  return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
}
function buildRuntime(){
  const localStorage=makeStorage();
  const window={localStorage};window.window=window;
  const sandbox={window,localStorage,console};
  vm.runInNewContext(read('sharawla-runtime-core.js'),sandbox,{filename:'sharawla-runtime-core.js'});
  vm.runInNewContext(read('sharawla-capabilities.js'),sandbox,{filename:'sharawla-capabilities.js'});
  vm.runInNewContext(read('sharawla-capabilities-beta33.js'),sandbox,{filename:'sharawla-capabilities-beta33.js'});
  vm.runInNewContext(read('sharawla-capability-runtime-bridge.js'),sandbox,{filename:'sharawla-capability-runtime-bridge.js'});
  vm.runInNewContext(read('sharawla-feature-consumption.js'),sandbox,{filename:'sharawla-feature-consumption.js'});
  vm.runInNewContext(read('pharmacy-engine.js'),sandbox,{filename:'pharmacy-engine.js'});
  return {window,localStorage};
}
function pharmacyConfig(caps,extra=[]){
  return {
    business_id:'test-business',business_name:'تجريبي',pos_profile:'pharmacy',profile_active:true,profile_implemented:true,
    modules_configured:true,enabled_modules:['pos','customers','inventory','returns','reports','expenses','barcode','delivery','website','promocodes','pharmacy','insurance'],
    features_configured:true,enabled_features:[...caps.getProfile('pharmacy').features,...extra],capability_version:1
  };
}
function testRuntime(){
  const {window}=buildRuntime();
  const core=window.SharawlaRuntimeCore,caps=window.SharawlaCapabilities;
  must(core.featureConsumptionVersion==='10.5.4-beta.34','feature consumption bridge version mismatch');
  must(window.__SharawlaFeatureConsumption?.PAGE_FEATURES?.kitchen?.feature==='food.kitchen','food.kitchen mapping missing');

  const baseline=core.prepareConfig(pharmacyConfig(caps));
  must(core.pageAllowed(baseline,'kitchen')===false,'Pharmacy baseline must not expose kitchen');
  must(!core.allPages(baseline).includes('kitchen'),'Pharmacy baseline allPages leaked kitchen');
  must(!core.permissionDefs(baseline).some(x=>x[0]==='kitchen'),'Pharmacy baseline permissions leaked kitchen');

  const withKitchen=core.prepareConfig(pharmacyConfig(caps,['food.kitchen']));
  must(core.featureEnabled(withKitchen,'food.kitchen')===true,'Cloud feature was not consumed');
  must(core.pageAllowed(withKitchen,'kitchen')===true,'food.kitchen must unlock the kitchen route');
  must(core.pageOperationalAllowed(withKitchen,'kitchen',{})===true,'feature page must be operationally reachable');
  must(core.allPages(withKitchen).includes('kitchen'),'food.kitchen must extend allPages');
  must(core.pageTitle(withKitchen,'kitchen')==='المطبخ','feature page title mismatch');
  must(core.permissionDefs(withKitchen).some(x=>x[0]==='kitchen'),'feature page permission definition missing');
  must(core.permissionGroups(withKitchen).some(([t,keys])=>t==='🧩 خصائص إضافية'&&keys.includes('kitchen')),'feature permission group missing');
  must(!core.rolePages(withKitchen,'cashier').includes('kitchen'),'cross-profile feature must not auto-grant cashier access');

  const unknown=core.prepareConfig(pharmacyConfig(caps,['feature.does.not.exist']));
  must(core.pageAllowed(unknown,'kitchen')===false,'unknown feature must never unlock a page');
}
function testStaticWiring(){
  const pkg=JSON.parse(read('package.json'));
  const version=String(pkg.version||'');
  must(version==='10.5.4-beta.34','package version must be Beta34');
  const index=read('index.html'),sw=read('sw.js'),app=read('app.js'),ui=read('beta34-feature-ui.js');
  for(const asset of ['sharawla-feature-consumption.js','beta34-feature-ui.js']){
    must(index.includes(`${asset}?v=${version}`),`index missing ${asset}`);
    must(sw.includes(`./${asset}?v=${version}`),`service worker shell missing ${asset}`);
    must(sw.includes(`url.pathname.endsWith('/${asset}')`),`service worker fetch policy missing ${asset}`);
  }
  const pBridge=index.indexOf(`sharawla-capability-runtime-bridge.js?v=${version}`);
  const pConsume=index.indexOf(`sharawla-feature-consumption.js?v=${version}`);
  const pEngine=index.indexOf(`restaurant-engine.js?v=${version}`);
  const pApp=index.indexOf(`app.js?v=${version}`);
  const pUi=index.indexOf(`beta34-feature-ui.js?v=${version}`);
  must(pBridge>=0&&pConsume>pBridge&&pEngine>pConsume&&pApp>pEngine&&pUi>pApp,'Beta34 load order is unsafe');
  must(app.includes('kitchen:renderKitchen'),'app has no kitchen route implementation');
  must(index.includes('data-page="kitchen"'),'sidebar has no kitchen route button');
  for(const token of ['data-home-page="kitchen"','food.kitchen','home-card tone-amber'])must(ui.includes(token),`Beta34 UI wiring missing ${token}`);
}
function testProtectedScope(){
  const source=read('sharawla-feature-consumption.js')+'\n'+read('beta34-feature-ui.js');
  for(const forbidden of ['SH-0005','SH-0006','top burger','business_features','admin_set_business_features','admin_reset_business_features']){
    must(!source.toLowerCase().includes(forbidden.toLowerCase()),`Beta34 runtime source must not target Production or Cloud writes: ${forbidden}`);
  }
}

try{
  testRuntime();
  testStaticWiring();
  testProtectedScope();
  console.log('Beta34 Feature Consumption gate OK.');
}catch(e){console.error(e);process.exit(1)}
