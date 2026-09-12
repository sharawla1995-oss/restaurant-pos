const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const must=(cond,msg)=>{if(!cond)throw new Error(`Beta35 Feature Behavior gate failed: ${msg}`)};

function testBehaviorHelper(){
  const source=read('beta35-feature-behavior.js');
  const document={
    body:{},
    querySelector:()=>null,
    querySelectorAll:()=>[]
  };
  class MutationObserver{constructor(fn){this.fn=fn}observe(){}}
  const window={
    SharawlaRuntimeCore:{featureEnabled:(config,code)=>Array.isArray(config?.enabled_features)&&config.enabled_features.includes(code)}
  };
  window.window=window;
  const sandbox={window,document,MutationObserver,setInterval:()=>0,console};
  vm.runInNewContext(source,sandbox,{filename:'beta35-feature-behavior.js'});
  const b=window.__SharawlaFeatureBehavior;
  must(b?.VERSION==='10.5.4-beta.35','behavior version mismatch');
  must(b.configuredFeatureEnabled(null,'food.modifiers')===true,'bootstrap must preserve legacy behavior');
  must(b.configuredFeatureEnabled({},'food.modifiers')===true,'legacy runtime fallback must stay fail-open');
  const mods={features_configured:true,capability_version:1,enabled_features:['food.modifiers']};
  must(b.configuredFeatureEnabled(mods,'food.modifiers')===true,'food.modifiers should be enabled');
  must(b.configuredFeatureEnabled(mods,'food.tables')===false,'food.tables should stay disabled');
  const tables={features_configured:true,capability_version:1,enabled_features:['food.tables']};
  must(b.configuredFeatureEnabled(tables,'food.tables')===true,'food.tables should be enabled');
  must(b.configuredFeatureEnabled(tables,'food.modifiers')===false,'food.modifiers should stay disabled');
  const none={features_configured:true,capability_version:1,enabled_features:[]};
  must(b.configuredFeatureEnabled(none,'food.modifiers')===false,'configured runtime must fail closed for missing modifiers');
  must(b.configuredFeatureEnabled(none,'food.tables')===false,'configured runtime must fail closed for missing tables');
}

function testStaticWiring(){
  const pkg=JSON.parse(read('package.json'));
  must(pkg.version==='10.5.4-beta.35','package version must be Beta35');
  must(String(pkg.scripts?.check||'').includes('check-beta35-feature-behavior.js'),'npm check missing Beta35 gate');

  const app=read('app.js');
  must(app.includes('enable_extras')&&app.includes('enable_removals'),'stable modifier flow not found');
  must(app.includes('option value="dinein"'),'stable dine-in flow not found');
  must(!app.includes('table_id')&&!app.includes('table_number'),'Beta35 must not claim full table assignment implementation');

  const behavior=read('beta35-feature-behavior.js');
  for(const token of ['food.modifiers','food.tables','features_configured','capability_version','option[value="dinein"]','enable_extras','enable_removals']){
    must(behavior.includes(token),`behavior source missing ${token}`);
  }

  const index=read('index.html'),sw=read('sw.js');
  must(index.includes(`beta35-feature-behavior.js?v=${pkg.version}`),'index missing Beta35 behavior asset');
  must(sw.includes(`./beta35-feature-behavior.js?v=${pkg.version}`),'service worker shell missing Beta35 behavior asset');
  must(sw.includes("url.pathname.endsWith('/beta35-feature-behavior.js')"),'service worker fetch policy missing Beta35 behavior asset');
  const pApp=index.indexOf(`app.js?v=${pkg.version}`);
  const pBeta34=index.indexOf(`beta34-feature-ui.js?v=${pkg.version}`);
  const pBeta35=index.indexOf(`beta35-feature-behavior.js?v=${pkg.version}`);
  must(pApp>=0&&pBeta34>pApp&&pBeta35>pBeta34,'Beta35 load order must be app -> Beta34 UI -> Beta35 behavior');
}

function testProtectedScope(){
  const source=read('beta35-feature-behavior.js');
  for(const forbidden of ['SH-0005','SH-0006','top burger','business_features','admin_set_business_features','admin_reset_business_features']){
    must(!source.toLowerCase().includes(forbidden.toLowerCase()),`Beta35 runtime source must not target Production or Cloud writes: ${forbidden}`);
  }
}

try{
  testBehaviorHelper();
  testStaticWiring();
  testProtectedScope();
  console.log('Beta35 Feature Behavior gate OK.');
}catch(e){console.error(e);process.exit(1)}
