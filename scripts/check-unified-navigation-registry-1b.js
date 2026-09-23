'use strict';
const path=require('path');
const registry=require(path.join('..','sharawla-navigation-registry.js'));
const adapters=require(path.join('..','sharawla-navigation-adapters.js'));

const errors=[];
const routeMap=new Map((registry.routes||[]).map(r=>[r.routeKey,r]));
const adapterIds=new Set();

if(registry.mode!=='shadow')errors.push('registry must remain shadow');
if(adapters.mode!=='shadow-describe-only')errors.push('adapters must remain shadow-describe-only');
if(adapters.sideEffects!==false)errors.push('adapters must declare sideEffects=false');

for(const a of adapters.adapters||[]){
  if(!a.id)errors.push('adapter without id');
  if(adapterIds.has(a.id))errors.push('duplicate adapter id: '+a.id);
  adapterIds.add(a.id);
  if(!['route','group','hub-child'].includes(a.kind))errors.push(a.id+': unsupported adapter kind '+a.kind);
}

for(const id of ['data-page','data-home-page','data-beta54-page','data-beta55-supply-page','data-beta55-hr-group','data-site-tool','data-pharmacy-page','data-pharmacy-home','custom-retail-website-orders','data-beta29-website-orders-card']){
  if(!adapterIds.has(id))errors.push('missing required adapter: '+id);
}

for(const key of adapters.beta54Routes||[]){
  if(!routeMap.has(key))errors.push('Beta54 route missing from registry: '+key);
  const d=adapters.normalizeDescriptor({type:'data-beta54-page',value:key});
  if(!d||d.routeKey!==key||d.kind!=='route')errors.push('Beta54 normalization failed: '+key);
}

const supply=adapters.normalizeDescriptor({type:'data-beta55-supply-page',value:'1'});
if(!supply||supply.routeKey!=='internalSupply'||supply.navigationKey!=='custom:supply')errors.push('Central Warehouse adapter mismatch');
if(!routeMap.has('internalSupply'))errors.push('internalSupply missing from registry');

const hr=adapters.normalizeDescriptor({type:'data-beta55-hr-group',value:'1'});
if(!hr||hr.kind!=='group'||hr.routeKey!==null||hr.navigationKey!=='group:hr')errors.push('HR group must remain a non-route navigation group');

for(const [tool,routeKey] of Object.entries(adapters.websiteHubMap||{})){
  if(!routeMap.has(routeKey))errors.push('Website hub child missing from registry: '+routeKey);
  const d=adapters.normalizeDescriptor({type:'data-site-tool',value:tool});
  if(!d||d.routeKey!==routeKey||d.kind!=='hub-child')errors.push('Website hub normalization failed: '+tool);
}

const home=adapters.normalizeDescriptor({type:'data-home-page',value:'orders'});
if(!home||home.routeKey!=='orders'||home.navigationKey!=='home:orders')errors.push('Home route proxy normalization failed');

for(const key of adapters.pharmacyRoutes||[]){
  if(!routeMap.has(key))errors.push('Pharmacy route missing from registry: '+key);
  const nav=adapters.normalizeDescriptor({type:'data-pharmacy-page',value:key});
  const card=adapters.normalizeDescriptor({type:'data-pharmacy-home',value:key});
  if(!nav||nav.routeKey!==key||nav.kind!=='route')errors.push('Pharmacy nav normalization failed: '+key);
  if(!card||card.routeKey!==key||card.kind!=='route')errors.push('Pharmacy home normalization failed: '+key);
}
const retailWeb=adapters.normalizeDescriptor({type:'custom-retail-website-orders'});
if(!retailWeb||retailWeb.routeKey!=='retailWebsiteOrders'||!routeMap.has('retailWebsiteOrders'))errors.push('Retail Website Orders custom adapter mismatch');
const retailWebCard=adapters.normalizeDescriptor({type:'data-beta29-website-orders-card',value:'1'});
if(!retailWebCard||retailWebCard.routeKey!=='retailWebsiteOrders')errors.push('Retail Website Orders home-card adapter mismatch');

for(const id of ['manageBranchesBtn','addBranchBtn','changeBranchBtn','logoutMenuBtn']){
  if(adapters.nonRouteControls?.[id]!=='action')errors.push(id+' must remain classified as non-route action');
}
for(const id of ['ownerDiagnosticsNav','betaSelfTestNav']){
  if(adapters.nonRouteControls?.[id]!=='diagnostic')errors.push(id+' must remain classified as diagnostic non-business navigation');
  const d=adapters.classifyDomElement({id,dataset:{}});
  if(!d||d.kind!=='diagnostic'||d.routeKey!==null)errors.push(id+' diagnostic classification failed');
}

const unknown=adapters.normalizeDescriptor({type:'data-site-tool',value:'__unknown__'});
if(unknown!==null)errors.push('unknown website hub child must normalize to null');

const purchasing=routeMap.get('purchasing');
if(purchasing?.migrationStatus!=='CONFLICT_BLOCKED')errors.push('purchasing must remain CONFLICT_BLOCKED');
const orders=routeMap.get('orders');
if(orders?.migrationStatus!=='LOCKED_ACCEPTED_OWNER')errors.push('orders must remain LOCKED_ACCEPTED_OWNER');
const wp=routeMap.get('websitePayments');
if(wp?.migrationStatus!=='DEFERRED_FIX'||wp?.conflictStatus!=='KNOWN_PERMISSION_MISMATCH')errors.push('websitePayments mismatch must remain deferred');

if(errors.length){
  console.error('Unified Navigation Registry 1B: FAIL');
  errors.forEach(e=>console.error(' - '+e));
  process.exit(1);
}
console.log('Unified Navigation Registry 1B: PASS');
console.log('adapters='+adapters.adapters.length+'; beta54_routes='+adapters.beta54Routes.length+'; website_hub_children='+Object.keys(adapters.websiteHubMap).length+'; non_route_controls='+Object.keys(adapters.nonRouteControls).length);
