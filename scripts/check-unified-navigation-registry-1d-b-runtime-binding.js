'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..');
const detector=require(path.join(__dirname,'lib','navigation-ownership-detector.js'));
const prebind=require(path.join(__dirname,'navigation-shadow-runtime-signatures-v1.js'));
const runtime=require(path.join(ROOT,'sharawla-navigation-shadow-1d-b.js'));

const errors=[];
const runtimeRel='sharawla-navigation-shadow-1d-b.js';
const runtimePath=path.join(ROOT,runtimeRel);
const source=fs.readFileSync(runtimePath,'utf8');
const index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const graph=detector.loadRuntimeSources(ROOT);

function fail(x){errors.push(x)}
function eq(name,a,b){if(a!==b)fail(name+': expected '+String(b)+' got '+String(a))}
function stable(x){return JSON.stringify(x)}
function normSig(x){
  return {
    id:x.id,
    routeKey:x.routeKey,
    classification:x.classification,
    canonicalCapable:x.canonicalCapable,
    sourceOwner:x.sourceOwner||null,
    renderer:x.renderer||null,
    navigationOwner:x.navigationOwner||null,
    augmentationLayers:[...(x.augmentationLayers||[])],
    augmentationGlobals:(x.augmentationGlobals||[]).map(function(a){return {layer:a.layer,globalName:a.globalName}}),
    runtimeChecks:(x.runtimeChecks||[]).map(function(c){
      const out={selector:c.selector};
      if(c.textEquals!==undefined)out.textEquals=c.textEquals;
      if(c.textIncludes!==undefined)out.textIncludes=c.textIncludes;
      return out;
    })
  };
}

const refs=[...index.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi)].map(function(m){return m[1].split('?')[0]});
eq('runtime binding occurs exactly once',refs.filter(function(x){return x===runtimeRel}).length,1);
eq('runtime binding is final script',refs[refs.length-1],runtimeRel);
if(!graph.runtimeScripts.includes(runtimeRel))fail('bound runtime probe is not in Runtime Source Graph');

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
for(const pair of forbidden)if(pair[1].test(source))fail('1D-B Runtime Self-Non-Interference violation: '+pair[0]);
if(!/setInterval\s*\(/.test(source))fail('read-only sampler interval missing');
if(!/getItem\s*\(/.test(source))fail('read-only sandbox cache reads missing');
if(!source.includes("topBurgerDesktop?.licenseState?.get?.()"))fail('read-only license-state lock read missing');
if(!source.includes("topBurgerDesktop?.update?.info?.()"))fail('read-only update-info lock read missing');

eq('sandbox support code parity',runtime.sandbox.supportCode,prebind.sandbox.supportCode);
eq('sandbox business parity',runtime.sandbox.businessId,prebind.sandbox.businessId);
eq('sandbox backend parity',runtime.sandbox.backendHost,prebind.sandbox.backendHost);
eq('sandbox profile parity',runtime.sandbox.profile,prebind.sandbox.profile);
eq('sandbox channel parity',runtime.sandbox.channel,prebind.sandbox.channel);
eq('readiness globals parity',stable(runtime.readinessGlobals),stable(prebind.readinessGlobals));

const preSigs=(prebind.signatures||[]).map(normSig);
const runSigs=(runtime.signatures||[]).map(normSig);
eq('signature count parity',runSigs.length,preSigs.length);
eq('runtime signature contract parity',stable(runSigs),stable(preSigs));
eq('visibility contract parity',stable(runtime.visibilityChecks),stable(prebind.visibilityChecks));

const good=runtime.lockState({
  supportCode:'SH-0007',
  businessId:'91826502-590e-4afa-8826-2c0f4b99c490',
  backendHost:'xihcxydjnzemflhedzor.supabase.co',
  profile:'restaurant',
  channel:'beta',
  version:'10.5.4-beta.58.3'
});
eq('SH-0007 hard lock positive',good.state,'PASS');
eq('SH-0007 hard lock positive bool',good.ok,true);

const prod=runtime.lockState({
  supportCode:'SH-0005',
  businessId:'prod-business',
  backendHost:'prod.example',
  profile:'restaurant',
  channel:'stable',
  version:'10.5.3'
});
eq('Production hard lock rejection',prod.state,'BLOCKED');
eq('Production hard lock rejection bool',prod.ok,false);

const waiting=runtime.lockState({
  supportCode:'',
  businessId:'',
  backendHost:'',
  profile:'',
  channel:'',
  version:''
});
eq('Incomplete lock waits without fallback',waiting.state,'WAITING');

const byRoute=new Map((runtime.signatures||[]).map(function(x){return [x.routeKey,x]}));
const actualFor=function(sig,augmentations){
  return {
    opened:true,
    routeKey:sig.routeKey,
    rendererOwner:sig.sourceOwner||'classification-only',
    renderer:sig.renderer||'classification-only',
    navigationOwner:sig.navigationOwner||'classification-only',
    augmentationLayers:augmentations||[],
    sourceEvidence:['runtime-signature:'+sig.id]
  };
};

const customers=byRoute.get('customers');
eq('customers normal classification',runtime.classify(customers,actualFor(customers,[])).status,'SHADOW_MATCH');
const orders=byRoute.get('orders');
eq('Orders locked classification',runtime.classify(orders,actualFor(orders,[])).status,'SHADOW_LOCKED_MATCH');
const purchasing=byRoute.get('purchasing');
eq('Purchasing stays conflict blocked',runtime.classify(purchasing,actualFor(purchasing,[])).status,'SHADOW_CONFLICT_BLOCKED');
const websitePayments=byRoute.get('websitePayments');
eq('Website Payments stays deferred',runtime.classify(websitePayments,actualFor(websitePayments,[])).status,'SHADOW_DEFERRED');
const users=byRoute.get('users');
eq('Users missing augmentation fails',runtime.classify(users,actualFor(users,[])).status,'SHADOW_MISMATCH');
eq('Users augmentation succeeds',runtime.classify(users,actualFor(users,['permissions-v2-ui.js'])).status,'SHADOW_MATCH');

if(!source.includes("status:'EVIDENCE_GAP'")||!source.includes('NO_SOURCE_BOUND_RUNTIME_SIGNATURE')){
  fail('active route evidence-gap behavior missing');
}
if(source.includes('SHADOW_CONFLICT_BLOCKED\',canonical:true')||source.includes('SHADOW_DEFERRED\',canonical:true')){
  fail('non-canonical classifications must not become canonical');
}

if(errors.length){
  console.error('Unified Navigation Registry 1D-B Runtime Binding: FAIL');
  errors.forEach(function(e){console.error(' - '+e)});
  process.exit(1);
}

console.log('Unified Navigation Registry 1D-B Runtime Binding: PASS');
console.log('runtime_loaded=true; final_script=true; signatures='+runSigs.length+'; non_interference=PASS; sh0007_hard_lock=PASS; contract_parity=PASS; conflict_deferred_noncanonical=PASS; evidence_gap=PASS');
