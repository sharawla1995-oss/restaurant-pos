'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..');

const registry=require(path.join(ROOT,'sharawla-navigation-registry.js'));
const adapters=require(path.join(ROOT,'sharawla-navigation-adapters.js'));
const coverage=require(path.join(__dirname,'navigation-coverage-contract-v1.js'));
const ownershipDetector=require(path.join(__dirname,'lib','navigation-ownership-detector.js'));
const coverageDetector=require(path.join(__dirname,'lib','navigation-coverage-detector.js'));
const negativeFixture=require(path.join(__dirname,'fixtures','navigation-coverage-negative-fixture.js'));
const runtimeShadow=require(path.join(ROOT,'sharawla-navigation-shadow-1d-b.js'));

const errors=[];
const fail=m=>errors.push(m);
const routeMap=new Map((registry.routes||[]).map(r=>[r.routeKey,r]));
const excluded=new Set(coverage.excludedTargets||[]);
const currentRoutes=[...(registry.routes||[])].filter(r=>!excluded.has(r.routeKey));
const currentKeys=new Set(currentRoutes.map(r=>r.routeKey));
const allowedStates=new Set(coverage.allowedCoverageStates||[]);

function setOf(xs){return new Set(xs||[])}
function sameSet(a,b){
  if(a.size!==b.size)return false;
  for(const x of a)if(!b.has(x))return false;
  return true;
}
function duplicates(xs){
  const seen=new Set(),dup=new Set();
  for(const x of xs||[]){if(seen.has(x))dup.add(x);seen.add(x)}
  return [...dup].sort();
}
function source(name){
  const p=path.join(ROOT,name);
  return fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
}

if(registry.mode!=='shadow')fail('registry must remain shadow during 1E');
if(adapters.mode!=='shadow-describe-only'||adapters.sideEffects!==false)fail('adapters must remain describe-only / sideEffects=false');

const buckets={
  SHADOW_VERIFIED:[...(coverage.shadowVerified||[])],
  CONFLICT_BLOCKED:[...(coverage.conflictBlocked||[])],
  DEFERRED_FIX:[...(coverage.deferredFix||[])]
};

for(const [state,keys] of Object.entries(buckets)){
  if(!allowedStates.has(state))fail('coverage state not allowed: '+state);
  for(const d of duplicates(keys))fail(state+': duplicate route '+d);
}

const assigned=new Map();
for(const [state,keys] of Object.entries(buckets)){
  for(const key of keys){
    if(assigned.has(key))fail(key+': assigned to multiple coverage states');
    assigned.set(key,state);
    if(!currentKeys.has(key))fail(key+': coverage contract references unknown/current-excluded route');
  }
}
for(const key of currentKeys)if(!assigned.has(key))fail(key+': UNREGISTERED COVERAGE STATE');
for(const key of assigned.keys())if(!currentKeys.has(key))fail(key+': coverage state has no current route');
if(assigned.size!==currentKeys.size)fail('coverage assignment count mismatch');

// Target-only routes are not current navigation entries and must stay out of 1E coverage buckets.
for(const key of excluded){
  const r=routeMap.get(key);
  if(!r)fail(key+': excluded target missing from registry');
  else if(r.migrationStatus!=='NEW_TARGET')fail(key+': excluded target must remain NEW_TARGET');
  if(assigned.has(key))fail(key+': NEW_TARGET must not be treated as current navigation coverage');
}

// Conflict coverage must exactly match the registry's blocked routes.
const registryConflicts=new Set(currentRoutes.filter(r=>r.migrationStatus==='CONFLICT_BLOCKED').map(r=>r.routeKey));
const coverageConflicts=setOf(coverage.conflictBlocked);
if(!sameSet(registryConflicts,coverageConflicts)){
  fail('CONFLICT_BLOCKED coverage must exactly match registry blocked routes');
}

// Every registry-level deferred route must remain deferred at 1E.
for(const r of currentRoutes){
  if(r.migrationStatus==='DEFERRED_FIX'&&assigned.get(r.routeKey)!=='DEFERRED_FIX'){
    fail(r.routeKey+': registry DEFERRED_FIX must remain deferred in 1E');
  }
}

// Runtime-verified claims must point to a real 1D-B signature/check.
const sigById=new Map((runtimeShadow.signatures||[]).map(s=>[s.id,s]));
const checkById=new Map((runtimeShadow.visibilityChecks||[]).map(x=>[x.id,x]));
for(const key of coverage.shadowVerified||[]){
  const ev=coverage.runtimeEvidence?.[key];
  if(!ev){fail(key+': SHADOW_VERIFIED without runtime evidence');continue}
  if(ev.signature){
    const sig=sigById.get(ev.signature);
    if(!sig)fail(key+': runtime signature missing: '+ev.signature);
    else if(sig.routeKey!==key)fail(key+': runtime signature route mismatch: '+ev.signature);
  }else if(ev.check){
    const ck=checkById.get(ev.check);
    if(!ck)fail(key+': runtime visibility check missing: '+ev.check);
    else if(ck.routeKey!==key)fail(key+': runtime visibility check route mismatch: '+ev.check);
  }else{
    fail(key+': runtime evidence has neither signature nor visibility check');
  }
}

// Known runtime conflict evidence remains non-canonical.
const purchasingEvidence=coverage.runtimeEvidence?.purchasing;
if(!purchasingEvidence||purchasingEvidence.status!=='SHADOW_CONFLICT_BLOCKED')fail('purchasing runtime conflict evidence missing');
if(assigned.get('purchasing')!=='CONFLICT_BLOCKED')fail('purchasing must remain CONFLICT_BLOCKED');

// Orders V58.3 remains locked and runtime-verified.
const orders=routeMap.get('orders');
if(orders?.migrationStatus!=='LOCKED_ACCEPTED_OWNER'||orders?.rendererOwner!=='Orders V58.3')fail('Orders V58.3 locked boundary changed');
if(assigned.get('orders')!=='SHADOW_VERIFIED')fail('Orders must remain SHADOW_VERIFIED in 1E');

// Website Payments remains explicitly deferred.
const wp=routeMap.get('websitePayments');
if(wp?.migrationStatus!=='DEFERRED_FIX'||wp?.conflictStatus!=='KNOWN_PERMISSION_MISMATCH')fail('websitePayments deferred permission boundary changed');
if(assigned.get('websitePayments')!=='DEFERRED_FIX')fail('websitePayments must remain DEFERRED_FIX in 1E');

// Newly discovered Retail Website route must be registered and normalized.
const retailWeb=routeMap.get(coverage.retailWebsiteRoute);
if(!retailWeb)fail('Retail Website Orders route is not registered');
else{
  if(retailWeb.profile!=='retail')fail('Retail Website Orders must remain retail profile');
  if(retailWeb.rendererOwner!=='retail-website-pos.js'||retailWeb.navigationOwner!=='retail-website-pos.js')fail('Retail Website Orders owner mismatch');
  if(assigned.get(retailWeb.routeKey)!=='DEFERRED_FIX')fail('Retail Website Orders must remain deferred until profile runtime acceptance');
}
const retailWebDesc=adapters.normalizeDescriptor({type:'custom-retail-website-orders'});
if(!retailWebDesc||retailWebDesc.routeKey!==coverage.retailWebsiteRoute)fail('Retail Website Orders adapter normalization failed');
const retailWebCard=adapters.normalizeDescriptor({type:'data-beta29-website-orders-card',value:'1'});
if(!retailWebCard||retailWebCard.routeKey!==coverage.retailWebsiteRoute)fail('Retail Website Orders home-card proxy normalization failed');

// Pharmacy dynamic routes must all be registered and remain deferred until their own runtime/permission acceptance.
for(const key of coverage.pharmacyRoutes||[]){
  const r=routeMap.get(key);
  if(!r)fail('Pharmacy route missing from registry: '+key);
  else{
    if(r.profile!=='pharmacy'||r.rendererOwner!=='pharmacy-ui.js'||r.navigationOwner!=='pharmacy-ui.js')fail(key+': pharmacy ownership/profile mismatch');
    if(assigned.get(key)!=='DEFERRED_FIX')fail(key+': pharmacy route must remain deferred in 1E');
  }
  const nav=adapters.normalizeDescriptor({type:'data-pharmacy-page',value:key});
  const home=adapters.normalizeDescriptor({type:'data-pharmacy-home',value:key});
  if(!nav||nav.routeKey!==key)fail(key+': pharmacy nav adapter mismatch');
  if(!home||home.routeKey!==key)fail(key+': pharmacy home adapter mismatch');
}

// Existing dynamic families must stay covered.
for(const key of adapters.beta54Routes||[])if(!routeMap.has(key))fail('Beta54 route missing: '+key);
if(!routeMap.has('internalSupply'))fail('internalSupply missing');
for(const routeKey of Object.values(adapters.websiteHubMap||{}))if(!routeMap.has(routeKey))fail('Website hub route missing: '+routeKey);

// Diagnostics are navigation controls but not business routes.
for(const id of coverage.diagnosticNavIds||[]){
  if(routeMap.has(id))fail(id+': diagnostic control must not become a business route');
  const d=adapters.classifyDomElement({id,dataset:{}});
  if(!d||d.kind!=='diagnostic'||d.routeKey!==null)fail(id+': diagnostic classification failed');
}

// Runtime graph discovery: unknown mechanisms/IDs/writers are forbidden.
const runtime=ownershipDetector.loadRuntimeSources(ROOT);
if(runtime.missingRefs.length)fail('runtime graph missing refs: '+runtime.missingRefs.join(', '));
const surface=coverageDetector.discoverCoverageSurface(runtime.sources,runtime.index);
const unknown=coverageDetector.unknownCoverageSurface(surface,coverage);
for(const [kind,rows] of Object.entries(unknown)){
  if(rows.length)fail('UNKNOWN '+kind+': '+rows.join(', '));
}

// Every literal data-page route discovered in the current runtime graph must be registered.
for(const key of surface.literalRoutes||[]){
  if(!routeMap.has(key))fail('UNREGISTERED KNOWN ROUTE literal: '+key);
}

// Static shell routes must remain covered by the registry.
for(const m of String(runtime.index||'').matchAll(/<button[^>]+data-page=["']([^"']+)["']/gi)){
  if(!routeMap.has(m[1]))fail('index.html data-page route missing from registry: '+m[1]);
}

// Source evidence for the newly discovered dynamic families.
const pharmacySource=source('pharmacy-ui.js');
for(const key of coverage.pharmacyRoutes||[])if(!pharmacySource.includes("'"+key+"'"))fail(key+': pharmacy source evidence missing');
const retailWebsiteSource=source('retail-website-pos.js');
if(!retailWebsiteSource.includes('retailWebsiteOrdersNav')||!retailWebsiteSource.includes('global.renderRetailWebsiteOrders=render'))fail('Retail Website Orders source evidence incomplete');

// Profile leakage fix remains intact for the two retail-only routes verified during 1D-B.
const appSource=source('app.js');
if(!appSource.includes("if((page==='marketSettings'||page==='retailOffers')&&!isRetailProfile())return false;"))fail('restaurant retail-only navigation guard missing');
const indexSource=source('index.html');
if(!/<button data-page="marketSettings" class="hidden">/.test(indexSource))fail('marketSettings default hidden boundary missing');
if(!/<button data-page="retailOffers" class="hidden">/.test(indexSource))fail('retailOffers default hidden boundary missing');

// 1F is still separate and must NOT be activated by 1E.
if(!appSource.includes('}[p]||renderPOS)'))fail('1F boundary changed: unknown-route fallback no longer matches pre-1F baseline');

// Negative detector: an unknown mechanism, nav id, writer and literal route must be rejected.
const fixtureSurface=coverageDetector.discoverCoverageSurface(negativeFixture.sources,negativeFixture.index);
const fixtureUnknown=coverageDetector.unknownCoverageSurface(fixtureSurface,coverage);
if(!fixtureUnknown.datasetPage.includes('roguePage'))fail('negative detection failed: rogue dataset page mechanism not rejected');
if(!fixtureUnknown.navIds.includes('rogueNav'))fail('negative detection failed: rogue nav id not rejected');
if(!fixtureUnknown.navWriters.includes(negativeFixture.fileName))fail('negative detection failed: rogue nav writer not rejected');
if(!(fixtureSurface.literalRoutes||[]).includes('rogueRoute'))fail('negative detection failed: rogue literal route not discovered');
if(routeMap.has('rogueRoute'))fail('negative fixture unexpectedly matches registered route');

if(errors.length){
  console.error('Unified Navigation Registry 1E: FAIL');
  errors.forEach(e=>console.error(' - '+e));
  process.exit(1);
}

console.log('Unified Navigation Registry 1E: PASS');
console.log(
  'current_routes='+currentKeys.size+
  '; shadow_verified='+(coverage.shadowVerified||[]).length+
  '; conflict_blocked='+(coverage.conflictBlocked||[]).length+
  '; deferred_fix='+(coverage.deferredFix||[]).length+
  '; runtime_scripts='+runtime.runtimeScripts.length+
  '; literal_routes='+(surface.literalRoutes||[]).length+
  '; unknown_mechanisms=0; unknown_ids=0; unknown_writers=0; unregistered_known_routes=0; negative_detection=PASS; 1F=LOCKED'
);
