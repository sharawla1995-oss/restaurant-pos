'use strict';

// Batch 1D-B pre-bind probe.
// Intentionally unbound: no navigation handlers, renderer calls, DOM writes,
// storage writes, or network writes.

function safeJson(raw){try{return JSON.parse(raw||'null')}catch{return null}}

function visible(el,view){
  if(!el)return false;
  if(el.hidden||el.classList?.contains?.('hidden')||el.getAttribute?.('aria-hidden')==='true')return false;
  const s=view?.getComputedStyle?.(el);
  return !s||!(s.display==='none'||s.visibility==='hidden');
}

function matchCheck(doc,check){
  const el=doc?.querySelector?.(check.selector);
  if(!el)return false;
  if(check.textEquals!==undefined&&String(el.textContent||'').trim()!==String(check.textEquals))return false;
  if(check.textIncludes!==undefined&&!String(el.textContent||'').includes(String(check.textIncludes)))return false;
  if(check.attr){
    const got=el.getAttribute?.(check.attr.name);
    if(String(got??'')!==String(check.attr.equals??''))return false;
  }
  return true;
}

function matchSignature(doc,signature){
  const checks=signature?.runtimeChecks||[];
  return checks.length>0&&checks.every(function(x){return matchCheck(doc,x)});
}

function augmentationEvidence(globalObject,signature){
  const out=[];
  for(const x of signature?.augmentationGlobals||[]){
    if(globalObject&&globalObject[x.globalName])out.push(x.layer);
  }
  return out;
}

function evidenceFor(globalObject,doc,signature){
  if(!matchSignature(doc,signature))return null;
  return {
    opened:true,
    routeKey:signature.routeKey,
    rendererOwner:signature.sourceOwner||'classification-only',
    renderer:signature.renderer||'classification-only',
    navigationOwner:signature.navigationOwner||'classification-only',
    augmentationLayers:augmentationEvidence(globalObject,signature),
    sourceEvidence:['runtime-signature:'+signature.id],
    runtimeSignatureId:signature.id,
    observedAt:new Date().toISOString()
  };
}

function sampleRoutes(globalObject,doc,contract,auditor){
  const out=[];
  for(const signature of contract?.signatures||[]){
    if(!matchSignature(doc,signature))continue;
    const actual=evidenceFor(globalObject,doc,signature);
    const result=auditor.auditDispatch(signature.routeKey,actual);
    out.push(Object.freeze({
      kind:'route',
      routeKey:signature.routeKey,
      signatureId:signature.id,
      status:result.status,
      canonical:result.canonical===true,
      reasons:Object.freeze([...(result.reasons||[])]),
      actual:Object.freeze({
        ...actual,
        augmentationLayers:Object.freeze([...(actual.augmentationLayers||[])]),
        sourceEvidence:Object.freeze([...(actual.sourceEvidence||[])])
      })
    }));
  }
  return out;
}

function sampleVisibility(globalObject,doc,contract,auditor,context){
  const out=[];
  for(const check of contract?.visibilityChecks||[]){
    const el=doc?.querySelector?.(check.selector);
    const actualVisible=visible(el,globalObject);
    const ctx={...(context||{}),profile:context?.profile||check.profile,expectedVisible:check.expectedVisible};
    const result=auditor.auditVisibility(check.routeKey,actualVisible,ctx);
    out.push(Object.freeze({
      kind:'visibility',
      routeKey:check.routeKey,
      checkId:check.id,
      actualVisible,
      status:result.status,
      canonical:result.canonical===true,
      reasons:Object.freeze([...(result.reasons||[])])
    }));
  }
  return out;
}

function fingerprint(rows){
  return JSON.stringify((rows||[]).map(function(x){
    return [x.kind,x.routeKey,x.signatureId||x.checkId,x.status,x.actualVisible??null];
  }));
}

function scrubSnapshot(x){
  return Object.freeze({
    supportCode:String(x?.supportCode||''),
    businessId:String(x?.businessId||''),
    backendHost:String(x?.backendHost||''),
    profile:String(x?.profile||'').toLowerCase(),
    channel:String(x?.channel||'').toLowerCase(),
    version:String(x?.version||'')
  });
}

async function readSandboxSnapshot(globalObject){
  const storage=globalObject?.localStorage;
  const runtime=safeJson(storage?.getItem?.('sharawlaRuntimeConfigV1'))||{};
  const connection=safeJson(storage?.getItem?.('sharawlaBusinessConnectionV1'))||{};
  let license=safeJson(storage?.getItem?.('sharawlaLicenseStateV1'))||{};
  try{
    const local=await globalObject?.topBurgerDesktop?.licenseState?.get?.();
    if(local&&typeof local==='object')license=local;
  }catch{}
  let update={};
  try{update=(await globalObject?.topBurgerDesktop?.update?.info?.())||{}}catch{}
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

function validateSandboxLock(snapshot,contract){
  const s=scrubSnapshot(snapshot),want=contract?.sandbox||{};
  const reasons=[];
  if(s.supportCode!==want.supportCode)reasons.push('SUPPORT_CODE_MISMATCH');
  if(s.businessId!==want.businessId)reasons.push('BUSINESS_MISMATCH');
  if(s.backendHost!==want.backendHost)reasons.push('BACKEND_MISMATCH');
  if(s.profile!==String(want.profile||'').toLowerCase())reasons.push('PROFILE_MISMATCH');
  if(s.channel!==String(want.channel||'').toLowerCase())reasons.push('CHANNEL_MISMATCH');
  if(!/(?:^|[-.])beta(?:[.-]|$)/i.test(s.version))reasons.push('VERSION_NOT_BETA');
  return Object.freeze({ok:reasons.length===0,reasons:Object.freeze(reasons),snapshot:s});
}

function readiness(globalObject,contract){
  const missing=(contract?.readinessGlobals||[]).filter(function(name){return !globalObject?.[name]});
  return Object.freeze({ok:missing.length===0,missing:Object.freeze(missing)});
}

function createProbe(options){
  const contract=options?.contract;
  const auditor=options?.auditor;
  const globalObject=options?.globalObject;
  const documentObject=options?.documentObject;
  const intervalMs=options?.intervalMs??800;
  const maxTicks=options?.maxTicks??900;
  const onRecord=options?.onRecord;
  if(!contract||!auditor||!globalObject||!documentObject)throw new Error('1D-B probe dependencies missing');

  const records=[];
  let timer=null,ticks=0,lastFingerprint='';

  function collect(){
    const runtime=safeJson(globalObject.localStorage?.getItem?.('sharawlaRuntimeConfigV1'))||{};
    const routeRows=sampleRoutes(globalObject,documentObject,contract,auditor);
    const visibilityRows=sampleVisibility(globalObject,documentObject,contract,auditor,{profile:String(runtime.pos_profile||'').toLowerCase()});
    const rows=[...routeRows,...visibilityRows];
    const fp=fingerprint(rows);
    if(fp===lastFingerprint)return null;
    lastFingerprint=fp;
    const record=Object.freeze({at:new Date().toISOString(),rows:Object.freeze(rows)});
    records.push(record);
    if(typeof onRecord==='function')onRecord(record);
    return record;
  }

  function stop(){
    if(timer!==null){globalObject.clearInterval(timer);timer=null}
    return Object.freeze({stopped:true,ticks,records:records.length});
  }

  async function start(){
    const lock=validateSandboxLock(await readSandboxSnapshot(globalObject),contract);
    if(!lock.ok)return Object.freeze({started:false,lock});
    const ready=readiness(globalObject,contract);
    if(!ready.ok)return Object.freeze({started:false,lock,ready});
    if(timer!==null)return Object.freeze({started:true,alreadyRunning:true,lock,ready});
    collect();
    timer=globalObject.setInterval(function(){
      ticks++;
      collect();
      if(ticks>=maxTicks)stop();
    },Math.max(500,Number(intervalMs)||800));
    return Object.freeze({started:true,lock,ready});
  }

  return Object.freeze({
    version:'1.0.0-1d-b-prebind',
    mode:'read-only-sampler-unbound',
    sideEffects:'read-only-memory-timer',
    start,
    stop,
    collect,
    records:function(){return Object.freeze([...records])},
    readiness:function(){return readiness(globalObject,contract)}
  });
}

module.exports=Object.freeze({
  safeJson,
  visible,
  matchCheck,
  matchSignature,
  augmentationEvidence,
  evidenceFor,
  sampleRoutes,
  sampleVisibility,
  scrubSnapshot,
  readSandboxSnapshot,
  validateSandboxLock,
  readiness,
  createProbe
});
