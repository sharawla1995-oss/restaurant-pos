const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const must=(cond,msg)=>{if(!cond)throw new Error(`Beta33 Cloud Runtime V2 gate failed: ${msg}`)};

class FakeResponse{
  constructor(status,body){this.status=status;this.ok=status>=200&&status<300;this.body=body}
  clone(){return new FakeResponse(this.status,this.body)}
  async json(){return this.body}
}
async function testTransport(){
  const calls=[];
  let mode='v2-ok-false';
  const baseFetch=async(url,init)=>{
    calls.push({url:String(url),method:String(init?.method||'GET')});
    if(!String(url).includes('/get_sharawla_business_runtime_config_v2'))return new FakeResponse(200,{ok:true,legacy:true});
    if(mode==='v2-ok-false')return new FakeResponse(200,{ok:false,message:'Device rejected'});
    if(mode==='missing')return new FakeResponse(404,{code:'PGRST202',message:'Could not find the function public.get_sharawla_business_runtime_config_v2 in the schema cache'});
    if(mode==='server-error')return new FakeResponse(500,{message:'Server error'});
    if(mode==='network')throw new Error('offline');
    return new FakeResponse(200,{ok:true,capability_version:1});
  };
  const window={fetch:baseFetch};window.window=window;
  vm.runInNewContext(read('sharawla-cloud-runtime-v2.js'),{window},{filename:'sharawla-cloud-runtime-v2.js'});
  must(window.__SharawlaCloudRuntimeV2?.fallbackPolicy==='missing-v2-rpc-only','fallback policy marker missing');
  const legacy='https://cloud.test/rest/v1/rpc/get_sharawla_business_runtime_config';

  calls.length=0;mode='v2-ok-false';
  let r=await window.fetch(legacy,{method:'POST'});
  must(calls.length===1,'V2 ok=false must not fall back');
  must(calls[0].url.endsWith('get_sharawla_business_runtime_config_v2'),'V2 must be requested first');
  must((await r.json()).ok===false,'V2 application rejection must be preserved');

  calls.length=0;mode='missing';
  r=await window.fetch(legacy,{method:'POST'});
  must(calls.length===2,'Missing V2 RPC must fall back exactly once');
  must(calls[0].url.endsWith('get_sharawla_business_runtime_config_v2'),'Missing-RPC path must still try V2 first');
  must(calls[1].url.endsWith('get_sharawla_business_runtime_config'),'Missing-RPC fallback must call legacy RPC');
  must((await r.json()).legacy===true,'Legacy response must be returned after safe fallback');

  calls.length=0;mode='server-error';
  r=await window.fetch(legacy,{method:'POST'});
  must(calls.length===1&&r.status===500,'HTTP 500 must not fall back to legacy');

  calls.length=0;mode='network';
  let threw=false;try{await window.fetch(legacy,{method:'POST'})}catch{threw=true}
  must(threw&&calls.length===1,'Network failure must fail closed without legacy fallback');

  calls.length=0;mode='success';
  const other='https://cloud.test/rest/v1/rpc/get_sharawla_business_connection';
  await window.fetch(other,{method:'POST'});
  must(calls.length===1&&calls[0].url===other,'Non-runtime RPC must pass through untouched');
}
function testCapabilityBridge(){
  const store=new Map();
  const localStorage={
    getItem:k=>store.has(k)?store.get(k):null,
    setItem:(k,v)=>store.set(k,String(v)),
    removeItem:k=>store.delete(k)
  };
  const window={localStorage};window.window=window;
  const sandbox={window,localStorage};
  vm.runInNewContext(read('sharawla-runtime-core.js'),sandbox,{filename:'sharawla-runtime-core.js'});
  vm.runInNewContext(read('sharawla-capabilities.js'),sandbox,{filename:'sharawla-capabilities.js'});
  vm.runInNewContext(read('sharawla-capabilities-beta33.js'),sandbox,{filename:'sharawla-capabilities-beta33.js'});
  vm.runInNewContext(read('sharawla-capability-runtime-bridge.js'),sandbox,{filename:'sharawla-capability-runtime-bridge.js'});
  const core=window.SharawlaRuntimeCore,caps=window.SharawlaCapabilities;
  must(caps.VERSION==='10.5.4-beta.33','extended capability version mismatch');
  const service=caps.getProfile('service');
  must(service&&service.implemented===false,'Service profile must exist as planned/not implemented');
  must(service.features.length===17,'Service profile must match Cloud feature count');
  for(const code of ['service.jobs','service.appointments','service.assets'])must(service.features.includes(code),`Service profile missing ${code}`);

  core.registerEngine({code:'pharmacy',resolveModules:(requested)=>requested,pageAllowed:()=>true});
  const v2=core.prepareConfig({
    business_id:'test-business',business_name:'تجريبي',pos_profile:'pharmacy',profile_active:true,profile_implemented:true,
    modules_configured:true,enabled_modules:['pos','pharmacy'],features_configured:true,enabled_features:['food.kitchen'],capability_version:1
  });
  must(v2.runtime_contract==='v2','V2 contract marker missing');
  must(v2.capability_source==='cloud-features','Cloud features must win for V2');
  must(core.featureEnabled(v2,'food.kitchen'),'Cloud feature must be enabled');
  must(core.featureEnabled(v2,'commerce.orders'),'Feature dependency closure must be retained');

  const legacy=core.prepareConfig({
    business_id:'test-business',business_name:'تجريبي',pos_profile:'pharmacy',profile_active:true,profile_implemented:true,
    modules_configured:true,enabled_modules:['pos','customers','pharmacy','insurance']
  });
  must(legacy.runtime_contract==='legacy','Legacy contract marker missing');
  must(legacy.capability_source==='legacy-modules','Legacy modules must bridge into capabilities');
  must(core.featureEnabled(legacy,'pharmacy.claims'),'Legacy insurance module must bridge to pharmacy claims');

  core.saveCache('runtime',v2);
  const cached=core.loadCache('runtime','test-business');
  must(cached&&cached.runtime_contract==='v2'&&core.featureEnabled(cached,'food.kitchen'),'V2 capability config must survive cache roundtrip');
}
function testShellWiring(){
  const pkg=JSON.parse(read('package.json'));
  const version=String(pkg.version||'');
  must(version==='10.5.4-beta.33','package version must be Beta33');
  const index=read('index.html'),sw=read('sw.js');
  const assets=['sharawla-capabilities-beta33.js','sharawla-capability-runtime-bridge.js','sharawla-cloud-runtime-v2.js'];
  for(const asset of assets){
    must(index.includes(`${asset}?v=${version}`),`index is missing ${asset}`);
    must(sw.includes(`./${asset}?v=${version}`),`service worker shell is missing ${asset}`);
    must(sw.includes(`url.pathname.endsWith('/${asset}')`),`service worker fetch policy is missing ${asset}`);
  }
  const pBase=index.indexOf(`sharawla-capabilities.js?v=${version}`);
  const pExt=index.indexOf(`sharawla-capabilities-beta33.js?v=${version}`);
  const pBridge=index.indexOf(`sharawla-capability-runtime-bridge.js?v=${version}`);
  const pTransport=index.indexOf(`sharawla-cloud-runtime-v2.js?v=${version}`);
  const pEngine=index.indexOf(`restaurant-engine.js?v=${version}`);
  const pApp=index.indexOf(`app.js?v=${version}`);
  must(pBase>=0&&pExt>pBase&&pBridge>pExt&&pTransport>pBridge&&pEngine>pTransport&&pApp>pEngine,'Beta33 script load order is unsafe');
}
(async()=>{
  await testTransport();
  testCapabilityBridge();
  testShellWiring();
  console.log('Beta33 Cloud Runtime V2 gate OK.');
})().catch(e=>{console.error(e);process.exit(1)});
