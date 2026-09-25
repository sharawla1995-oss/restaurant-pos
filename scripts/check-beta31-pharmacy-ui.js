const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const must=(cond,msg)=>{if(!cond)throw new Error(`Beta31 Pharmacy UI gate failed: ${msg}`)};

const pkg=JSON.parse(read('package.json'));
const engine=read('pharmacy-engine.js');
const ui=read('pharmacy-ui.js');
const index=read('index.html');
const sw=read('sw.js');
const version=String(pkg.version||'');
const betaNo=Number((version.match(/10\.5\.4-beta\.(\d+)/)||[])[1]||0);

must(betaNo>=31,'requires Beta31 or later package version');
must(engine.includes("localStorage.getItem('sharawlaRuntimeConfigV1')"),'Runtime Config cache getter missing');
must(engine.includes("phase:'pharmacy-complete-beta31'"),'Pharmacy engine Beta31 phase contract missing');
must(ui.includes("global.runtimeConfig?.()?.pos_profile"),'Pharmacy UI is not wired to runtimeConfig getter');
for(const page of ['pharmacyCatalog','pharmacyBatches','pharmacyExpiry','pharmacyPrescriptions','pharmacyInsurance','pharmacyClaims']){
  must(ui.includes(page),`Pharmacy UI page missing: ${page}`);
  must(engine.includes(page),`Pharmacy engine page missing: ${page}`);
}
must(ui.includes('function addNav()')&&ui.includes('function injectHome()'),'Sidebar/Home Pharmacy injection missing');
must(index.indexOf(`pharmacy-engine.js?v=${version}`)>=0,'Pharmacy engine asset missing from index');
must(index.indexOf(`pharmacy-ui.js?v=${version}`)>index.indexOf(`pharmacy-engine.js?v=${version}`),'Pharmacy UI must load after Pharmacy engine');
must(sw.includes(`pharmacy-engine.js?v=${version}`)&&sw.includes(`pharmacy-ui.js?v=${version}`),'Pharmacy assets missing from service worker cache');

let registered=null;
const sandbox={
  console,
  localStorage:{getItem:key=>key==='sharawlaRuntimeConfigV1'?JSON.stringify({pos_profile:'pharmacy',enabled_modules:['pharmacy','insurance']}):null},
  SharawlaRuntimeCore:{
    registerEngine:e=>{registered=e;return e},
    hasEngine:code=>String(code)==='pharmacy',
    normalizeModules:v=>Array.isArray(v)?v:[],
    moduleEnabled:()=>true
  }
};
sandbox.window=sandbox;
vm.runInNewContext(engine,sandbox,{filename:'pharmacy-engine.js'});
must(typeof sandbox.runtimeConfig==='function','runtimeConfig getter was not exposed');
must(sandbox.runtimeConfig()?.pos_profile==='pharmacy','runtimeConfig getter did not resolve pharmacy profile');
must(registered?.code==='pharmacy','Pharmacy engine did not register in runtime simulation');

console.log('Beta31 Pharmacy UI runtime regression gate OK');
