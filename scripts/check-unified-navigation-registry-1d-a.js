'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..');
const registry=require(path.join(ROOT,'sharawla-navigation-registry.js'));
const ownership=require(path.join(__dirname,'navigation-ownership-contract-v1.js'));
const adapters=require(path.join(ROOT,'sharawla-navigation-adapters.js'));
const detector=require(path.join(__dirname,'lib','navigation-ownership-detector.js'));
const shadow=require(path.join(__dirname,'lib','navigation-shadow-auditor.js'));
const fixtures=require(path.join(__dirname,'fixtures','navigation-shadow-auditor-fixtures.js'));

const errors=[];
const AUDITOR_REL='scripts/lib/navigation-shadow-auditor.js';
const auditorPath=path.join(ROOT,AUDITOR_REL);
const source=fs.readFileSync(auditorPath,'utf8');
const runtime=detector.loadRuntimeSources(ROOT);

function fail(msg){errors.push(msg)}
function test(name,actual,expected){if(actual!==expected)fail(name+': expected '+expected+' got '+actual)}

if(shadow.createAuditor(registry,ownership).sideEffects!==false)fail('auditor sideEffects must be false');
if(shadow.createAuditor(registry,ownership).mode!=='shadow-pure')fail('auditor mode must be shadow-pure');

const forbidden=[
  ['browser-global',/\b(?:document|window)\b/],
  ['event-listener',/\b(?:addEventListener|removeEventListener|MutationObserver)\b/],
  ['event-control',/\b(?:preventDefault|stopPropagation|stopImmediatePropagation)\b/],
  ['navigation-control',/\bshowPage\s*\(/],
  ['synthetic-click',/\.click\s*\(/],
  ['renderer-invocation',/\brender[A-Z0-9_$][A-Za-z0-9_$]*\s*\(/],
  ['dom-mutation',/\.(?:appendChild|append|prepend|insertBefore|removeChild|replaceChildren|replaceWith|remove|setAttribute)\s*\(/],
  ['dom-assignment',/\.(?:innerHTML|outerHTML|textContent)\s*=/],
  ['class-mutation',/\.classList\.(?:add|remove|toggle|replace)\s*\(/],
  ['storage',/\b(?:localStorage|sessionStorage|indexedDB)\b/],
  ['network-write-surface',/\b(?:fetch|XMLHttpRequest|supabase|rpc|rest)\s*\(/]
];
for(const [name,re] of forbidden)if(re.test(source))fail('Auditor Self-Non-Interference violation: '+name);

if(runtime.runtimeScripts.includes(AUDITOR_REL))fail('1D-A auditor must not be in Runtime Source Graph');
if(String(runtime.index||'').includes('navigation-shadow-auditor.js'))fail('1D-A auditor must not be loaded by index.html');

const auditor=shadow.createAuditor(registry,ownership);
for(const f of fixtures){
  let result;
  if(f.kind==='dispatch')result=auditor.auditDispatch(f.routeKey,f.actual);
  else if(f.kind==='visibility')result=auditor.auditVisibility(f.routeKey,f.actualVisible,f.context);
  else if(f.kind==='descriptor')result=auditor.auditDescriptor(f.descriptor);
  else {fail(f.name+': unknown fixture kind');continue}
  test(f.name,result?.status,f.expected);
}

for(const routeKey of ['suppliers','purchasing','stockCount','transfers']){
  test(routeKey+' conflict preservation',auditor.auditDispatch(routeKey,{
    opened:true,rendererOwner:'app.js',renderer:'renderRetailPurchasing',navigationOwner:'app.js',augmentationLayers:[],sourceEvidence:['fixture:conflict']
  }).status,'SHADOW_CONFLICT_BLOCKED');
}

test('websitePayments deferred preservation',auditor.auditDispatch('websitePayments',{
  opened:true,rendererOwner:'app.js',renderer:'renderWebsitePayments',navigationOwner:'websiteManagement hub',augmentationLayers:[],sourceEvidence:['fixture:deferred']
}).status,'SHADOW_DEFERRED');

test('summary new target preservation',auditor.auditDispatch('summary',null).status,'SHADOW_NEW_TARGET');

const ordersNoEvidence=auditor.auditDispatch('orders',{opened:true});
test('orders cannot match without attributable owner evidence',ordersNoEvidence.status,'SHADOW_MISMATCH');

const group=adapters.normalizeDescriptor({type:'data-beta55-hr-group',value:'1'});
test('group descriptor classification',auditor.auditDescriptor(group).status,'GROUP_NON_ROUTE');

const action=adapters.classifyDomElement({id:'manageBranchesBtn',dataset:{}});
test('action descriptor classification',auditor.auditDescriptor(action).status,'ACTION_NON_ROUTE');

if(errors.length){
  console.error('Unified Navigation Registry 1D-A: FAIL');
  errors.forEach(e=>console.error(' - '+e));
  process.exit(1);
}

console.log('Unified Navigation Registry 1D-A: PASS');
console.log('fixtures='+fixtures.length+'; runtime_loaded=false; non_interference=PASS; conflict_preservation=PASS; attributable_owner_evidence=PASS');
