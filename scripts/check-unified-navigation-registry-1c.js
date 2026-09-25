'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..');
const registry=require(path.join(ROOT,'sharawla-navigation-registry.js'));
const adapters=require(path.join(ROOT,'sharawla-navigation-adapters.js'));
const ownership=require(path.join(__dirname,'navigation-ownership-contract-v1.js'));
const detector=require(path.join(__dirname,'lib','navigation-ownership-detector.js'));
const negativeFixture=require(path.join(__dirname,'fixtures','navigation-ownership-negative-fixture.js'));

const errors=[];
const routeMap=new Map((registry.routes||[]).map(r=>[r.routeKey,r]));
const routeKeys=[...routeMap.keys()];
const runtime=detector.loadRuntimeSources(ROOT);
const sources=runtime.sources;
const runtimeScripts=new Set(runtime.runtimeScripts);
const observed=detector.discoverRendererOwners(sources,routeKeys);
const navEvidence=detector.discoverNavigationEvidence(sources);
const navOwnersSeen=new Set(navEvidence.map(x=>x.ownerLayer));

function fileExists(name){return fs.existsSync(path.join(ROOT,name))}
function runtimeHas(name){return runtimeScripts.has(name)}
function hasAll(name,needles){
  if(!runtimeHas(name)||!fileExists(name))return false;
  const s=fs.readFileSync(path.join(ROOT,name),'utf8');
  return needles.every(n=>s.includes(n));
}
function physicalOwnerFromRegistry(r){
  if(!r)return [];
  if(r.rendererOwner==='Orders V58.3')return ['app.js'];
  if(typeof r.rendererOwner==='string'&&r.rendererOwner.endsWith('.js'))return [r.rendererOwner];
  return [];
}
function navOwnerFromRegistry(r){
  if(!r)return [];
  if(typeof r.navigationOwner==='string'&&(r.navigationOwner.endsWith('.js')||r.navigationOwner==='websiteManagement hub'))return [r.navigationOwner];
  return [];
}
function declaredAugmentations(r){
  const out=[];
  for(const x of r?.augmentationLayers||[]){
    const m=String(x).match(/([A-Za-z0-9_.-]+\.js)/);
    if(m)out.push(m[1]);
  }
  return [...new Set(out)];
}

if(runtime.missingRefs.length)errors.push('runtime script graph has missing local references: '+runtime.missingRefs.join(', '));

const expectedRendererOwners={};
const expectedNavigationOwners={};
const expectedAugmentations={};

for(const r of registry.routes||[]){
  if(r.migrationStatus==='NEW_TARGET')continue;
  const p=ownership.policies[r.routeKey];
  expectedRendererOwners[r.routeKey]=p?[...p.rendererOwners]:physicalOwnerFromRegistry(r);
  expectedNavigationOwners[r.routeKey]=p?[...p.navigationOwners]:navOwnerFromRegistry(r);
  expectedAugmentations[r.routeKey]=p?[...p.augmentationLayers]:declaredAugmentations(r);
}

for(const [routeKey,expected] of Object.entries(expectedRendererOwners)){
  const seen=(observed.byRoute.get(routeKey)||[]).map(x=>x.ownerLayer);
  for(const owner of expected){
    if(!runtimeHas(owner))errors.push(routeKey+': expected renderer owner is not runtime-loaded: '+owner);
    if(!seen.includes(owner))errors.push(routeKey+': expected renderer owner not evidenced in runtime source: '+owner);
  }
}

for(const row of detector.unexpectedRendererOwners(observed.byRoute,expectedRendererOwners)){
  errors.push(row.routeKey+': undeclared renderer owner detected: '+row.ownerLayer+' -> '+row.renderer);
}

for(const [routeKey,owners] of Object.entries(expectedNavigationOwners)){
  for(const owner of owners){
    if(owner==='app.js'){
      if(!runtimeHas('app.js')||!navOwnersSeen.has('app.js'))errors.push(routeKey+': app.js navigation evidence missing');
    }else if(owner==='websiteManagement hub'){
      if(!navOwnersSeen.has('websiteManagement hub'))errors.push(routeKey+': website hub navigation evidence missing');
    }else{
      if(!runtimeHas(owner))errors.push(routeKey+': navigation owner is not runtime-loaded: '+owner);
      if(!navOwnersSeen.has(owner))errors.push(routeKey+': navigation owner evidence missing: '+owner);
    }
  }
}

for(const [routeKey,layers] of Object.entries(expectedAugmentations)){
  const r=routeMap.get(routeKey);
  const declared=new Set(declaredAugmentations(r));
  for(const layer of layers){
    if(!fileExists(layer))errors.push(routeKey+': augmentation file missing: '+layer);
    if(!runtimeHas(layer))errors.push(routeKey+': augmentation layer is not runtime-loaded: '+layer);
    if(!declared.has(layer))errors.push(routeKey+': augmentation not declared in registry: '+layer);
  }
}

if(!hasAll('advanced-purchasing-v1.js',['advanced-purchasing-v1.1','purchasing','data-advanced-purchasing'])){
  errors.push('purchasing: advanced-purchasing-v1.js augmentation evidence incomplete');
}
if(!hasAll('beta55-ui-workflow-fixes.js',['openPurchaseOrderWorkspace','purchaseCapture','purchasing'])){
  errors.push('purchasing: beta55-ui-workflow-fixes.js augmentation evidence incomplete');
}
if(!hasAll('beta55-central-warehouse-v2.js',['inventory.supply','shortage'])){
  errors.push('internalSupply: central warehouse V2 augmentation evidence incomplete');
}
if(!hasAll('permissions-v2-ui.js',['permissions-v2.1','isUsersPage','صلاحيات متقدمة'])){
  errors.push('users: permissions-v2-ui.js augmentation evidence incomplete');
}

// Conflict enforcement: every observed multi-renderer route must be explicitly blocked.
for(const [routeKey,rows] of observed.byRoute.entries()){
  const owners=[...new Set(rows.map(x=>x.ownerLayer))];
  if(owners.length<2)continue;
  const r=routeMap.get(routeKey);
  const p=ownership.policies[routeKey];
  if(!p||p.case!=='CONFLICT')errors.push(routeKey+': multiple renderer owners found but no CONFLICT policy');
  if(r?.migrationStatus!=='CONFLICT_BLOCKED')errors.push(routeKey+': multiple renderer owners must be CONFLICT_BLOCKED');
}

// Known conflict/deferred/locked boundaries must remain unchanged.
for(const routeKey of ['suppliers','purchasing','stockCount','transfers']){
  const r=routeMap.get(routeKey);
  if(r?.migrationStatus!=='CONFLICT_BLOCKED')errors.push(routeKey+': ownership review/conflict must remain CONFLICT_BLOCKED');
}
const purchasing=routeMap.get('purchasing');
if(purchasing?.conflictStatus!=='CONFIRMED_MULTI_OWNER')errors.push('purchasing: CONFIRMED_MULTI_OWNER marker lost');
const wp=routeMap.get('websitePayments');
if(wp?.migrationStatus!=='DEFERRED_FIX'||wp?.conflictStatus!=='KNOWN_PERMISSION_MISMATCH')errors.push('websitePayments deferred permission mismatch boundary changed');
const orders=routeMap.get('orders');
if(orders?.migrationStatus!=='LOCKED_ACCEPTED_OWNER'||orders?.rendererOwner!=='Orders V58.3')errors.push('orders locked owner boundary changed');

// Adapter/source relationship checks.
const adapterIds=new Set((adapters.adapters||[]).map(x=>x.id));
if(adapterIds.has('data-beta54-page')&&!navOwnersSeen.has('beta54-shared-core-ui.js'))errors.push('data-beta54-page adapter has no runtime navigation evidence');
if(adapterIds.has('data-beta55-supply-page')&&!navOwnersSeen.has('beta55-central-warehouse-ui.js'))errors.push('data-beta55-supply-page adapter has no runtime navigation evidence');
if(adapterIds.has('data-beta55-hr-group')&&!navOwnersSeen.has('beta55-ui-workflow-fixes.js'))errors.push('data-beta55-hr-group adapter has no runtime augmentation evidence');
if(adapterIds.has('data-site-tool')&&!navOwnersSeen.has('websiteManagement hub'))errors.push('data-site-tool adapter has no website hub runtime evidence');
if(adapterIds.has('data-pharmacy-page')&&!navOwnersSeen.has('pharmacy-ui.js'))errors.push('data-pharmacy-page adapter has no pharmacy runtime navigation evidence');
if(adapterIds.has('data-pharmacy-home')&&!navOwnersSeen.has('pharmacy-ui.js'))errors.push('data-pharmacy-home adapter has no pharmacy runtime navigation evidence');
if(adapterIds.has('custom-retail-website-orders')&&!navOwnersSeen.has('retail-website-pos.js'))errors.push('Retail Website Orders adapter has no runtime navigation evidence');

// Four required evidence classes plus SINGLE from an ordinary one-owner route.
const caseSeen=new Set();
for(const p of Object.values(ownership.policies))caseSeen.add(p.case);
for(const [routeKey,rows] of observed.byRoute.entries()){
  const owners=[...new Set(rows.map(x=>x.ownerLayer))];
  const p=ownership.policies[routeKey];
  if(owners.length===1&&!p)caseSeen.add('SINGLE');
}
for(const c of ownership.requiredCases){
  if(!caseSeen.has(c))errors.push('required 1C evidence case not represented: '+c);
}

// Negative detection self-test: a rogue source owner must be detected.
const fixtureBindings=detector.extractRendererBindings(negativeFixture.fileName,negativeFixture.source,routeKeys);
const fixtureMap=new Map();
for(const row of fixtureBindings){
  if(!fixtureMap.has(row.routeKey))fixtureMap.set(row.routeKey,[]);
  fixtureMap.get(row.routeKey).push(row);
}
const rogue=detector.unexpectedRendererOwners(fixtureMap,expectedRendererOwners);
if(!rogue.some(x=>x.routeKey==='orders'&&x.ownerLayer===negativeFixture.fileName)){
  errors.push('negative detection failed: rogue orders owner was not rejected');
}
if(!rogue.some(x=>x.routeKey==='purchasing'&&x.ownerLayer===negativeFixture.fileName)){
  errors.push('negative detection failed: rogue purchasing owner was not rejected');
}

if(errors.length){
  console.error('Unified Navigation Registry 1C: FAIL');
  errors.forEach(e=>console.error(' - '+e));
  process.exit(1);
}

const conflicts=[...observed.byRoute.entries()].filter(([,rows])=>new Set(rows.map(x=>x.ownerLayer)).size>1).map(([k])=>k);
const augmented=Object.entries(ownership.policies).filter(([,p])=>p.case==='AUGMENTED').map(([k])=>k);
console.log('Unified Navigation Registry 1C: PASS');
console.log('runtime_scripts='+runtime.runtimeScripts.length+'; renderer_bindings='+observed.bindings.length+'; conflicts='+conflicts.length+'; augmented='+augmented.length+'; nav_evidence='+navEvidence.length+'; negative_detection=PASS');
