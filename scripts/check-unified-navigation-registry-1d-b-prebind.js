'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..');
const registry=require(path.join(ROOT,'sharawla-navigation-registry.js'));
const ownership=require(path.join(__dirname,'navigation-ownership-contract-v1.js'));
const detector=require(path.join(__dirname,'lib','navigation-ownership-detector.js'));
const auditorLib=require(path.join(__dirname,'lib','navigation-shadow-auditor.js'));
const contract=require(path.join(__dirname,'navigation-shadow-runtime-signatures-v1.js'));
const probe=require(path.join(__dirname,'lib','navigation-shadow-runtime-probe.js'));
const fixtures=require(path.join(__dirname,'fixtures','navigation-shadow-runtime-probe-fixtures.js'));

const errors=[];
const routeMap=new Map((registry.routes||[]).map(function(x){return [x.routeKey,x]}));
const runtime=detector.loadRuntimeSources(ROOT);
const runtimeScripts=new Set(runtime.runtimeScripts);
const probeRel='scripts/lib/navigation-shadow-runtime-probe.js';
const contractRel='scripts/navigation-shadow-runtime-signatures-v1.js';
const probeSource=fs.readFileSync(path.join(ROOT,probeRel),'utf8');
const indexSource=String(runtime.index||'');

function fail(x){errors.push(x)}
function eq(name,a,b){if(a!==b)fail(name+': expected '+b+' got '+a)}
function fileSource(name){try{return fs.readFileSync(path.join(ROOT,name),'utf8')}catch{return ''}}
function expectedOwners(routeKey){
  const p=ownership.policies?.[routeKey];
  if(p?.rendererOwners?.length)return [...p.rendererOwners];
  const r=routeMap.get(routeKey);
  if(r?.rendererOwner==='Orders V58.3')return ['app.js'];
  if(typeof r?.rendererOwner==='string'&&r.rendererOwner.endsWith('.js'))return [r.rendererOwner];
  return [];
}
function expectedNavOwners(routeKey){
  const p=ownership.policies?.[routeKey];
  if(p?.navigationOwners?.length)return [...p.navigationOwners];
  const r=routeMap.get(routeKey);
  if(typeof r?.navigationOwner==='string')return [r.navigationOwner];
  return [];
}

if(runtimeScripts.has(probeRel)||runtimeScripts.has(contractRel))fail('1D-B pre-bind files must not be in Runtime Source Graph');
if(indexSource.includes('navigation-shadow-runtime-probe.js')||indexSource.includes('navigation-shadow-runtime-signatures-v1.js'))fail('1D-B pre-bind files must not be loaded by index.html');

const forbidden=[
  ['event-listener',/\b(?:addEventListener|removeEventListener|MutationObserver)\b/],
  ['event-control',/\b(?:preventDefault|stopPropagation|stopImmediatePropagation)\b/],
  ['navigation-control',/\bshowPage\s*\(/],
  ['synthetic-click',/\.click\s*\(/],
  ['renderer-invocation',/\brender[A-Z0-9_$][A-Za-z0-9_$]*\s*\(/],
  ['dom-mutation-call',/\.(?:appendChild|append|prepend|insertBefore|removeChild|replaceChildren|replaceWith|remove|setAttribute)\s*\(/],
  ['dom-assignment',/\.(?:innerHTML|outerHTML|textContent)\s*=/],
  ['class-mutation',/\.classList\.(?:add|remove|toggle|replace)\s*\(/],
  ['storage-write',/\b(?:localStorage|sessionStorage)\.(?:setItem|removeItem|clear)\s*\(/],
  ['indexeddb-surface',/\bindexedDB\b/],
  ['network-surface',/\b(?:fetch|XMLHttpRequest|WebSocket|supabase|rpc|rest)\s*\(/],
  ['event-dispatch',/\b(?:dispatchEvent|CustomEvent)\b/],
  ['prototype-patch',/\.prototype\s*(?:\.|\[|=)/],
  ['define-property',/\bObject\.defineProperty\s*\(/],
  ['secret-material',/\b(?:device_fingerprint|license_key|publishable_key|access_token|refresh_token)\b/]
];
for(const pair of forbidden){
  if(pair[1].test(probeSource))fail('1D-B Self-Non-Interference violation: '+pair[0]);
}

if(contract.mode!=='source-only-unbound')fail('contract must remain source-only-unbound');
if(contract.sandbox?.supportCode!=='SH-0007')fail('sandbox support code lock missing');
if(contract.sandbox?.businessId!=='91826502-590e-4afa-8826-2c0f4b99c490')fail('sandbox business lock changed');
if(contract.sandbox?.backendHost!=='xihcxydjnzemflhedzor.supabase.co')fail('sandbox backend lock changed');
if(contract.sandbox?.profile!=='restaurant'||contract.sandbox?.channel!=='beta')fail('sandbox profile/channel lock changed');

const ids=new Set(),routes=new Set();
for(const sig of contract.signatures||[]){
  if(ids.has(sig.id))fail('duplicate signature id: '+sig.id);
  ids.add(sig.id);
  if(routes.has(sig.routeKey))fail('duplicate signature route: '+sig.routeKey);
  routes.add(sig.routeKey);
  const r=routeMap.get(sig.routeKey);
  if(!r){fail('signature route not registered: '+sig.routeKey);continue}
  if(!Array.isArray(sig.runtimeChecks)||!sig.runtimeChecks.length)fail(sig.routeKey+': runtime checks missing');

  if(sig.classification==='CONFLICT'){
    if(r.migrationStatus!=='CONFLICT_BLOCKED')fail(sig.routeKey+': conflict signature lost CONFLICT_BLOCKED');
    if(sig.canonicalCapable!==false)fail(sig.routeKey+': conflict must not be canonical-capable');
  }else if(sig.classification==='DEFERRED'){
    if(r.migrationStatus!=='DEFERRED_FIX')fail(sig.routeKey+': deferred signature lost DEFERRED_FIX');
    if(sig.canonicalCapable!==false)fail(sig.routeKey+': deferred must not be canonical-capable');
  }else if(sig.canonicalCapable===true){
    const owners=expectedOwners(sig.routeKey);
    const navOwners=expectedNavOwners(sig.routeKey);
    if(!owners.includes(sig.sourceOwner))fail(sig.routeKey+': signature owner not allowed by 1C ownership: '+sig.sourceOwner);
    if(!navOwners.includes(sig.navigationOwner))fail(sig.routeKey+': navigation owner not allowed by 1C/registry: '+sig.navigationOwner);
    if(r.renderer&&r.renderer!==sig.renderer)fail(sig.routeKey+': renderer mismatch vs registry');
    if(!runtimeScripts.has(sig.sourceOwner))fail(sig.routeKey+': source owner is not runtime-loaded: '+sig.sourceOwner);

    const ownerSource=fileSource(sig.sourceOwner);
    const tokens=[...(sig.sourceTokens||[])];
    if(tokens.length<2)fail(sig.routeKey+': canonical signature needs at least two source tokens');
    for(const t of tokens){
      if(!ownerSource.includes(t))fail(sig.routeKey+': source token missing from '+sig.sourceOwner+': '+t);
    }
    const matching=[];
    for(const entry of runtime.sources.entries()){
      const name=entry[0],source=entry[1];
      if(tokens.length&&tokens.every(function(t){return source.includes(t)}))matching.push(name);
    }
    if(matching.length!==1||matching[0]!==sig.sourceOwner){
      fail(sig.routeKey+': source-bound signature is not unique to owner; matches='+matching.join(','));
    }
  }

  for(const aug of sig.augmentationGlobals||[]){
    if(!(sig.augmentationLayers||[]).includes(aug.layer))fail(sig.routeKey+': augmentation global layer not declared');
    const declared=(r.augmentationLayers||[]).join(' ');
    if(!declared.includes(aug.layer))fail(sig.routeKey+': augmentation layer not declared by registry: '+aug.layer);
    if(!runtimeScripts.has(aug.layer))fail(sig.routeKey+': augmentation layer not runtime-loaded: '+aug.layer);
    const augSource=fileSource(aug.layer);
    if(!augSource.includes(aug.globalName))fail(sig.routeKey+': augmentation global evidence missing: '+aug.globalName);
  }
}

for(const routeKey of ['suppliers','purchasing','stockCount','transfers']){
  if(routeMap.get(routeKey)?.migrationStatus!=='CONFLICT_BLOCKED')fail(routeKey+': conflict boundary changed');
}
if(routeMap.get('websitePayments')?.migrationStatus!=='DEFERRED_FIX')fail('websitePayments deferred boundary changed');
if(routeMap.get('summary')?.migrationStatus!=='NEW_TARGET')fail('summary NEW_TARGET boundary changed');
const orders=routeMap.get('orders');
if(orders?.migrationStatus!=='LOCKED_ACCEPTED_OWNER'||orders?.rendererOwner!=='Orders V58.3')fail('Orders V58.3 lock changed');

for(const v of contract.visibilityChecks||[]){
  if(!routeMap.has(v.routeKey))fail('visibility route not registered: '+v.routeKey);
  if(v.profile==='restaurant'&&['marketSettings','retailOffers'].includes(v.routeKey)&&v.expectedVisible!==false){
    fail(v.routeKey+': Restaurant leakage expectation changed');
  }
}

const auditor=auditorLib.createAuditor(registry,ownership);
eq('SH-0007 positive lock',probe.validateSandboxLock(fixtures.goodLock,contract).ok,true);
eq('Production/foreign lock rejection',probe.validateSandboxLock(fixtures.badLock,contract).ok,false);

const ordersSig=contract.signatures.find(function(x){return x.routeKey==='orders'});
const ordersActual=probe.evidenceFor({},fixtures.ordersDoc,ordersSig);
if(!ordersActual)fail('Orders signature fixture did not produce evidence');
else eq('Orders V58.3 attributable owner',auditor.auditDispatch('orders',ordersActual).status,'SHADOW_LOCKED_MATCH');

const customersSig=contract.signatures.find(function(x){return x.routeKey==='customers'});
const customersActual=probe.evidenceFor({},fixtures.customerDoc,customersSig);
if(!customersActual)fail('Customers signature fixture did not produce evidence');
else eq('Customers attributable owner',auditor.auditDispatch('customers',customersActual).status,'SHADOW_MATCH');

const purchasingActual={
  opened:true,
  rendererOwner:'classification-only',
  renderer:'classification-only',
  navigationOwner:'classification-only',
  augmentationLayers:[],
  sourceEvidence:['fixture:purchasing']
};
eq('Purchasing stays conflict-blocked',auditor.auditDispatch('purchasing',purchasingActual).status,'SHADOW_CONFLICT_BLOCKED');
eq('websitePayments stays deferred',auditor.auditDispatch('websitePayments',null).status,'SHADOW_DEFERRED');
eq('summary stays new target',auditor.auditDispatch('summary',null).status,'SHADOW_NEW_TARGET');

const view={getComputedStyle:function(){return {display:'block',visibility:'visible'}}};
const leakRows=probe.sampleVisibility(view,fixtures.restaurantLeakageDoc,contract,auditor,{profile:'restaurant'});
const market=leakRows.find(function(x){return x.routeKey==='marketSettings'});
const offers=leakRows.find(function(x){return x.routeKey==='retailOffers'});
eq('Retail leakage detected',market?.status,'SHADOW_MISMATCH');
eq('Hidden retailOffers accepted',offers?.status,'SHADOW_MATCH');

if(errors.length){
  console.error('Unified Navigation Registry 1D-B Pre-Bind: FAIL');
  errors.forEach(function(e){console.error(' - '+e)});
  process.exit(1);
}

const canonical=(contract.signatures||[]).filter(function(x){return x.canonicalCapable===true}).length;
const nonCanonical=(contract.signatures||[]).filter(function(x){return x.canonicalCapable===false}).length;
console.log('Unified Navigation Registry 1D-B Pre-Bind: PASS');
console.log('signatures='+(contract.signatures||[]).length+'; canonical_bound='+canonical+'; noncanonical_observed='+nonCanonical+'; visibility_checks='+(contract.visibilityChecks||[]).length+'; runtime_loaded=false; non_interference=PASS; sh0007_lock=PASS; source_binding=PASS');
