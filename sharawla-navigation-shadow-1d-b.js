(function(root,factory){
'use strict';
if(typeof module==='object'&&module.exports){
  module.exports=factory(null,false);
}else{
  const api=factory(root,true);
  root.__SharawlaNavigationShadow1DB=api;
  api.autoStart();
}
})(typeof window!=='undefined'?window:globalThis,function(globalObject,browserMode){
'use strict';

const VERSION='1.0.0-1d-b-runtime';
const SANDBOX=Object.freeze({
  supportCode:'SH-0007',
  businessId:'91826502-590e-4afa-8826-2c0f4b99c490',
  backendHost:'xihcxydjnzemflhedzor.supabase.co',
  profile:'restaurant',
  channel:'beta'
});

const READINESS_GLOBALS=Object.freeze([
  '__SharawlaBeta54SharedCore',
  '__SharawlaRestaurantClosureV55',
  '__SharawlaBeta55CentralWarehouse'
]);

const SIGNATURES=Object.freeze([
  Object.freeze({
    id:'app-customers-v1',routeKey:'customers',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'app.js',renderer:'renderCustomers',navigationOwner:'app.js',
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="customers"].active'}),
      Object.freeze({selector:'#customerSearch'}),
      Object.freeze({selector:'#customersBody'})
    ])
  }),
  Object.freeze({
    id:'orders-v58-3',routeKey:'orders',classification:'LOCKED',canonicalCapable:true,
    sourceOwner:'app.js',renderer:'renderOrders',navigationOwner:'app.js',
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="orders"].active'}),
      Object.freeze({selector:'[data-orders-runtime="ORDERS-DATE-WINDOW-V58.3"]'})
    ])
  }),
  Object.freeze({
    id:'restaurant-tables-v55',routeKey:'tables',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta55-restaurant-closure-ui.js',renderer:'renderTables',navigationOwner:'beta55-restaurant-closure-ui.js',
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="tables"].active'}),
      Object.freeze({selector:'.restaurant-table-grid'}),
      Object.freeze({selector:'#page h2',textIncludes:'الصالات والترابيزات'})
    ])
  }),
  Object.freeze({
    id:'restaurant-ingredients-v55',routeKey:'foodIngredients',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta55-restaurant-closure-ui.js',renderer:'renderIngredients',navigationOwner:'beta55-restaurant-closure-ui.js',
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="foodIngredients"].active'}),
      Object.freeze({selector:'#page h2',textIncludes:'الخامات — الفرع الحالي'})
    ])
  }),
  Object.freeze({
    id:'restaurant-recipes-v55',routeKey:'foodRecipes',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta55-restaurant-closure-ui.js',renderer:'renderRecipes',navigationOwner:'beta55-restaurant-closure-ui.js',
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="foodRecipes"].active'}),
      Object.freeze({selector:'#page h2',textIncludes:'الوصفات وFood Cost'})
    ])
  }),
  Object.freeze({
    id:'restaurant-food-operations-v55',routeKey:'foodOperations',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta55-restaurant-closure-ui.js',renderer:'renderFoodOperations',navigationOwner:'beta55-restaurant-closure-ui.js',
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="foodOperations"].active'}),
      Object.freeze({selector:'.restaurant-subtabs'}),
      Object.freeze({selector:'[data-tab="production"]'}),
      Object.freeze({selector:'[data-op-body]'})
    ])
  }),
  Object.freeze({
    id:'beta54-employees',routeKey:'employees',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta54-shared-core-ui.js',renderer:'renderEmployees',navigationOwner:'beta54-shared-core-ui.js',
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-beta54-page="employees"].active'}),
      Object.freeze({selector:'#pageTitle',textEquals:'الموظفون'}),
      Object.freeze({selector:'#page .beta54-toolbar'})
    ])
  }),
  Object.freeze({
    id:'beta54-advances',routeKey:'advances',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta54-shared-core-ui.js',renderer:'renderAdvances',navigationOwner:'beta54-shared-core-ui.js',
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-beta54-page="advances"].active'}),
      Object.freeze({selector:'#pageTitle',textEquals:'سلف الموظفين'}),
      Object.freeze({selector:'#page .beta54-toolbar'})
    ])
  }),
  Object.freeze({
    id:'beta54-adjustments',routeKey:'adjustments',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta54-shared-core-ui.js',renderer:'renderAdjustments',navigationOwner:'beta54-shared-core-ui.js',
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-beta54-page="adjustments"].active'}),
      Object.freeze({selector:'#pageTitle',textEquals:'الخصومات والمكافآت'}),
      Object.freeze({selector:'#page .beta54-table'})
    ])
  }),
  Object.freeze({
    id:'beta54-payroll',routeKey:'payroll',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta54-shared-core-ui.js',renderer:'renderPayroll',navigationOwner:'beta54-shared-core-ui.js',
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-beta54-page="payroll"].active'}),
      Object.freeze({selector:'#pageTitle',textEquals:'المرتبات'}),
      Object.freeze({selector:'#page .beta54-toolbar'})
    ])
  }),
  Object.freeze({
    id:'beta54-treasury',routeKey:'treasury',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta54-shared-core-ui.js',renderer:'renderTreasury',navigationOwner:'beta54-shared-core-ui.js',
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-beta54-page="treasury"].active'}),
      Object.freeze({selector:'#pageTitle',textEquals:'الخزنة'}),
      Object.freeze({selector:'#page .beta54-kpi'})
    ])
  }),
  Object.freeze({
    id:'central-warehouse-supply-v55',routeKey:'internalSupply',classification:'AUGMENTED',canonicalCapable:true,
    sourceOwner:'beta55-central-warehouse-ui.js',renderer:'render',navigationOwner:'beta55-central-warehouse-ui.js',
    augmentationLayers:Object.freeze(['beta55-central-warehouse-v2.js']),
    augmentationGlobals:Object.freeze([Object.freeze({layer:'beta55-central-warehouse-v2.js',globalName:'__SharawlaBeta55CentralWarehouseV2'})]),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav [data-beta55-supply-page].active'}),
      Object.freeze({selector:'#page .b55s-toolbar'}),
      Object.freeze({selector:'#page .b55s-card'})
    ])
  }),
  Object.freeze({
    id:'app-users-permissions-v2',routeKey:'users',classification:'AUGMENTED',canonicalCapable:true,
    sourceOwner:'app.js',renderer:'renderUsers',navigationOwner:'app.js',
    augmentationLayers:Object.freeze(['permissions-v2-ui.js']),
    augmentationGlobals:Object.freeze([Object.freeze({layer:'permissions-v2-ui.js',globalName:'__SharawlaPermissionsV2'})]),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="users"].active'}),
      Object.freeze({selector:'#page .users-admin-head'}),
      Object.freeze({selector:'#page .user-management-list'})
    ])
  }),
  Object.freeze({
    id:'website-availability-app',routeKey:'branchProductAvailability',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'app.js',renderer:'renderWebsiteAvailability',navigationOwner:'websiteManagement hub',
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#page .website-availability-panel'}),
      Object.freeze({selector:'#page .website-availability-table'})
    ])
  }),
  Object.freeze({
    id:'website-payments-deferred',routeKey:'websitePayments',classification:'DEFERRED',canonicalCapable:false,
    sourceOwner:'app.js',renderer:'renderWebsitePayments',navigationOwner:'websiteManagement hub',
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#webPayBranch'}),
      Object.freeze({selector:'#page .site-pay-list'})
    ])
  }),
  Object.freeze({
    id:'purchasing-conflict-active-route',routeKey:'purchasing',classification:'CONFLICT',canonicalCapable:false,
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="purchasing"].active'})
    ])
  })
]);

const VISIBILITY_CHECKS=Object.freeze([
  Object.freeze({id:'restaurant-no-market-settings',routeKey:'marketSettings',selector:'#nav button[data-page="marketSettings"]',profile:'restaurant',expectedVisible:false}),
  Object.freeze({id:'restaurant-no-retail-offers',routeKey:'retailOffers',selector:'#nav button[data-page="retailOffers"]',profile:'restaurant',expectedVisible:false})
]);

function safeJson(raw){try{return JSON.parse(raw||'null')}catch{return null}}

function scrubSnapshot(x){
  return Object.freeze({
    supportCode:String(x&&x.supportCode||''),
    businessId:String(x&&x.businessId||''),
    backendHost:String(x&&x.backendHost||''),
    profile:String(x&&x.profile||'').toLowerCase(),
    channel:String(x&&x.channel||'').toLowerCase(),
    version:String(x&&x.version||'')
  });
}

async function readSnapshot(g){
  const storage=g&&g.localStorage;
  const runtime=safeJson(storage&&storage.getItem&&storage.getItem('sharawlaRuntimeConfigV1'))||{};
  const connection=safeJson(storage&&storage.getItem&&storage.getItem('sharawlaBusinessConnectionV1'))||{};
  let license=safeJson(storage&&storage.getItem&&storage.getItem('sharawlaLicenseStateV1'))||{};
  try{
    const local=await g.topBurgerDesktop?.licenseState?.get?.();
    if(local&&typeof local==='object')license=local;
  }catch{}
  let update={};
  try{update=(await g.topBurgerDesktop?.update?.info?.())||{}}catch{}
  let host='';
  try{host=new URL(String(connection.url||'')).host}catch{}
  return scrubSnapshot({
    supportCode:license.support_code,
    businessId:runtime.business_id||connection.business_id,
    backendHost:host,
    profile:runtime.pos_profile,
    channel:update.channel,
    version:update.version
  });
}

function lockState(snapshot){
  const s=scrubSnapshot(snapshot);
  const incomplete=!s.supportCode||!s.businessId||!s.backendHost||!s.profile||!s.channel||!s.version;
  if(incomplete)return Object.freeze({state:'WAITING',ok:false,reasons:Object.freeze(['LOCK_DATA_INCOMPLETE']),snapshot:s});
  const reasons=[];
  if(s.supportCode!==SANDBOX.supportCode)reasons.push('SUPPORT_CODE_MISMATCH');
  if(s.businessId!==SANDBOX.businessId)reasons.push('BUSINESS_MISMATCH');
  if(s.backendHost!==SANDBOX.backendHost)reasons.push('BACKEND_MISMATCH');
  if(s.profile!==SANDBOX.profile)reasons.push('PROFILE_MISMATCH');
  if(s.channel!==SANDBOX.channel)reasons.push('CHANNEL_MISMATCH');
  if(!/(?:^|[-.])beta(?:[.-]|$)/i.test(s.version))reasons.push('VERSION_NOT_BETA');
  return Object.freeze({state:reasons.length?'BLOCKED':'PASS',ok:reasons.length===0,reasons:Object.freeze(reasons),snapshot:s});
}

function readiness(g){
  const missing=READINESS_GLOBALS.filter(function(name){return !g||!g[name]});
  return Object.freeze({ok:missing.length===0,missing:Object.freeze(missing)});
}

function visible(el,g){
  if(!el)return false;
  if(el.hidden||el.classList?.contains?.('hidden')||el.getAttribute?.('aria-hidden')==='true')return false;
  const s=g&&g.getComputedStyle?g.getComputedStyle(el):null;
  return !s||!(s.display==='none'||s.visibility==='hidden');
}

function matchCheck(doc,check){
  const el=doc&&doc.querySelector?doc.querySelector(check.selector):null;
  if(!el)return false;
  if(check.textEquals!==undefined&&String(el.textContent||'').trim()!==String(check.textEquals))return false;
  if(check.textIncludes!==undefined&&!String(el.textContent||'').includes(String(check.textIncludes)))return false;
  return true;
}

function matchSignature(doc,signature){
  const checks=signature.runtimeChecks||[];
  return checks.length>0&&checks.every(function(check){return matchCheck(doc,check)});
}

function augmentationEvidence(g,signature){
  const out=[];
  for(const item of signature.augmentationGlobals||[]){
    if(g&&g[item.globalName])out.push(item.layer);
  }
  return out;
}

function classify(signature,actual){
  if(signature.classification==='CONFLICT')return Object.freeze({status:'SHADOW_CONFLICT_BLOCKED',canonical:false,reasons:Object.freeze(['CONFLICT_BLOCKED'])});
  if(signature.classification==='DEFERRED')return Object.freeze({status:'SHADOW_DEFERRED',canonical:false,reasons:Object.freeze(['DEFERRED_FIX'])});
  if(!actual||!actual.rendererOwner||!actual.renderer||!actual.navigationOwner||!actual.sourceEvidence?.length){
    return Object.freeze({status:'SHADOW_MISMATCH',canonical:false,reasons:Object.freeze(['INSUFFICIENT_ACTUAL_OWNER_EVIDENCE'])});
  }
  const missing=(signature.augmentationLayers||[]).filter(function(x){return !actual.augmentationLayers.includes(x)});
  if(missing.length)return Object.freeze({status:'SHADOW_MISMATCH',canonical:false,reasons:Object.freeze(missing.map(function(x){return 'AUGMENTATION_EVIDENCE_MISSING:'+x}))});
  if(signature.classification==='LOCKED')return Object.freeze({status:'SHADOW_LOCKED_MATCH',canonical:true,reasons:Object.freeze([])});
  return Object.freeze({status:'SHADOW_MATCH',canonical:true,reasons:Object.freeze([])});
}

function evidenceFor(g,doc,signature){
  if(!matchSignature(doc,signature))return null;
  return Object.freeze({
    opened:true,
    routeKey:signature.routeKey,
    rendererOwner:signature.sourceOwner||'classification-only',
    renderer:signature.renderer||'classification-only',
    navigationOwner:signature.navigationOwner||'classification-only',
    augmentationLayers:Object.freeze(augmentationEvidence(g,signature)),
    sourceEvidence:Object.freeze(['runtime-signature:'+signature.id]),
    runtimeSignatureId:signature.id,
    observedAt:new Date().toISOString()
  });
}

function activeRoute(doc){
  const supply=doc?.querySelector?.('#nav [data-beta55-supply-page].active');
  if(supply)return 'internalSupply';
  const b54=doc?.querySelector?.('#nav button[data-beta54-page].active');
  if(b54?.dataset?.beta54Page)return String(b54.dataset.beta54Page);
  const classic=doc?.querySelector?.('#nav button[data-page].active');
  if(classic?.dataset?.page)return String(classic.dataset.page);
  return '';
}

function collectRows(g,doc){
  const rows=[];
  let matchedRoute='';
  for(const signature of SIGNATURES){
    const actual=evidenceFor(g,doc,signature);
    if(!actual)continue;
    matchedRoute=signature.routeKey;
    const result=classify(signature,actual);
    rows.push(Object.freeze({
      kind:'route',
      routeKey:signature.routeKey,
      signatureId:signature.id,
      status:result.status,
      canonical:result.canonical,
      reasons:result.reasons,
      actual
    }));
  }

  const active=activeRoute(doc);
  if(active&&active!==matchedRoute&&!SIGNATURES.some(function(x){return x.routeKey===active&&matchSignature(doc,x)})){
    rows.push(Object.freeze({
      kind:'route',
      routeKey:active,
      signatureId:null,
      status:'EVIDENCE_GAP',
      canonical:false,
      reasons:Object.freeze(['NO_SOURCE_BOUND_RUNTIME_SIGNATURE'])
    }));
  }

  for(const check of VISIBILITY_CHECKS){
    const el=doc?.querySelector?.(check.selector);
    const actualVisible=visible(el,g);
    rows.push(Object.freeze({
      kind:'visibility',
      routeKey:check.routeKey,
      checkId:check.id,
      actualVisible,
      status:actualVisible===check.expectedVisible?'SHADOW_MATCH':'SHADOW_MISMATCH',
      canonical:actualVisible===check.expectedVisible,
      reasons:Object.freeze(actualVisible===check.expectedVisible?[]:['VISIBILITY_MISMATCH'])
    }));
  }
  return Object.freeze(rows);
}

function rowsFingerprint(rows){
  return JSON.stringify(rows.map(function(x){
    return [x.kind,x.routeKey,x.signatureId||x.checkId||'',x.status,x.actualVisible===undefined?null:x.actualVisible];
  }));
}

function publicRecord(record){
  return {
    at:record.at,
    rows:record.rows.map(function(row){
      return {
        kind:row.kind,
        routeKey:row.routeKey,
        signatureId:row.signatureId||null,
        checkId:row.checkId||null,
        status:row.status,
        canonical:row.canonical===true,
        reasons:[...(row.reasons||[])],
        actual:row.actual?{
          rendererOwner:row.actual.rendererOwner,
          renderer:row.actual.renderer,
          navigationOwner:row.actual.navigationOwner,
          augmentationLayers:[...(row.actual.augmentationLayers||[])],
          runtimeSignatureId:row.actual.runtimeSignatureId
        }:null,
        actualVisible:row.actualVisible
      };
    })
  };
}

function createRuntime(g,doc){
  const records=[];
  let bootTimer=null,sampleTimer=null;
  let bootTicks=0,sampleTicks=0,lastFingerprint='';
  let state=Object.freeze({phase:'CREATED',lock:null,ready:null});

  function setState(next){state=Object.freeze(next);return state}

  function collect(){
    const rows=collectRows(g,doc);
    const fp=rowsFingerprint(rows);
    if(fp===lastFingerprint)return null;
    lastFingerprint=fp;
    const record=Object.freeze({at:new Date().toISOString(),rows});
    records.push(record);
    try{
      const short=rows.map(function(x){return x.routeKey+':'+x.status}).join('|');
      g.console?.info?.('[NAV-1D-B]',short);
    }catch{}
    return record;
  }

  function stopSampler(){
    if(sampleTimer!==null){g.clearInterval(sampleTimer);sampleTimer=null}
    return setState({...state,phase:'STOPPED',sampleTicks,records:records.length});
  }

  function startSampler(lock,ready){
    if(sampleTimer!==null)return state;
    setState({phase:'RUNNING',lock,ready,sampleTicks:0,records:records.length});
    collect();
    sampleTimer=g.setInterval(function(){
      sampleTicks++;
      collect();
      if(sampleTicks>=900)stopSampler();
    },800);
    return state;
  }

  async function bootOnce(){
    bootTicks++;
    const lock=lockState(await readSnapshot(g));
    if(lock.state==='BLOCKED'){
      if(bootTimer!==null){g.clearInterval(bootTimer);bootTimer=null}
      return setState({phase:'BLOCKED',lock,ready:null,bootTicks});
    }
    if(lock.state!=='PASS'){
      if(bootTicks>=120){
        if(bootTimer!==null){g.clearInterval(bootTimer);bootTimer=null}
        return setState({phase:'NO_START',lock,ready:null,bootTicks});
      }
      return setState({phase:'WAITING_LOCK',lock,ready:null,bootTicks});
    }
    const ready=readiness(g);
    if(!ready.ok){
      if(bootTicks>=120){
        if(bootTimer!==null){g.clearInterval(bootTimer);bootTimer=null}
        return setState({phase:'NO_START',lock,ready,bootTicks});
      }
      return setState({phase:'WAITING_RUNTIME',lock,ready,bootTicks});
    }
    if(bootTimer!==null){g.clearInterval(bootTimer);bootTimer=null}
    return startSampler(lock,ready);
  }

  function autoStart(){
    if(!browserMode||!g||!doc)return Object.freeze({started:false,reason:'NOT_BROWSER'});
    if(bootTimer!==null||sampleTimer!==null)return Object.freeze({started:true,phase:state.phase});
    setState({phase:'BOOTSTRAP',lock:null,ready:null,bootTicks:0});
    bootOnce().catch(function(){});
    bootTimer=g.setInterval(function(){bootOnce().catch(function(){})},1000);
    return Object.freeze({started:true,phase:'BOOTSTRAP'});
  }

  function stop(){
    if(bootTimer!==null){g.clearInterval(bootTimer);bootTimer=null}
    if(sampleTimer!==null){g.clearInterval(sampleTimer);sampleTimer=null}
    return setState({...state,phase:'STOPPED',bootTicks,sampleTicks,records:records.length});
  }

  function report(){
    return Object.freeze({
      version:VERSION,
      mode:'SH-0007_READ_ONLY_SHADOW',
      phase:state.phase,
      records:records.map(publicRecord),
      counts:records.reduce(function(acc,r){
        for(const row of r.rows)acc[row.status]=(acc[row.status]||0)+1;
        return acc;
      },{})
    });
  }

  return Object.freeze({
    version:VERSION,
    mode:'SH-0007_READ_ONLY_SHADOW',
    autoStart,
    stop,
    collect,
    status:function(){return state},
    records:function(){return Object.freeze(records.map(publicRecord))},
    report
  });
}

const exported=Object.freeze({
  version:VERSION,
  sandbox:SANDBOX,
  readinessGlobals:READINESS_GLOBALS,
  signatures:SIGNATURES,
  visibilityChecks:VISIBILITY_CHECKS,
  safeJson,
  scrubSnapshot,
  lockState,
  readiness,
  visible,
  matchCheck,
  matchSignature,
  augmentationEvidence,
  classify,
  evidenceFor,
  activeRoute,
  collectRows,
  createRuntime
});

if(browserMode&&globalObject&&globalObject.document){
  return createRuntime(globalObject,globalObject.document);
}
return exported;
});
