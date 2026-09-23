(function(global){
'use strict';

// Sharawla Unified Navigation Registry V1 — Batch 1B
// Pure discovery/normalization adapters only.
// No click handlers, no routing, no renderer invocation, no permission mutation.
const VERSION='1.0.0-shadow-1b';

const WEBSITE_HUB_MAP=Object.freeze({
  'availability':'branchProductAvailability',
  'branch-settings':'websiteBranchSettings',
  'payments':'websitePayments',
  'appearance':'websiteAppearance'
});

const BETA54_ROUTES=Object.freeze(['employees','advances','adjustments','payroll','treasury']);
const NON_ROUTE_CONTROLS=Object.freeze({
  manageBranchesBtn:'action',
  addBranchBtn:'action',
  changeBranchBtn:'action',
  logoutMenuBtn:'action'
});

const ADAPTERS=Object.freeze([
  Object.freeze({id:'data-page',kind:'route',selector:'button[data-page]',datasetKey:'page'}),
  Object.freeze({id:'data-beta54-page',kind:'route',selector:'button[data-beta54-page]',datasetKey:'beta54Page',knownRoutes:BETA54_ROUTES}),
  Object.freeze({id:'data-beta55-supply-page',kind:'route',selector:'[data-beta55-supply-page]',fixedRouteKey:'internalSupply'}),
  Object.freeze({id:'data-beta55-hr-group',kind:'group',selector:'[data-beta55-hr-group]',fixedNavigationKey:'group:hr'}),
  Object.freeze({id:'data-site-tool',kind:'hub-child',selector:'[data-site-tool]',datasetKey:'siteTool',routeMap:WEBSITE_HUB_MAP})
]);

function normalizeDescriptor(input){
  if(!input||typeof input!=='object')return null;
  const type=String(input.type||input.adapterId||'').trim();
  if(type==='data-page'){
    const routeKey=String(input.value||input.page||'').trim();
    return routeKey?{kind:'route',routeKey,navigationKey:'page:'+routeKey,adapterId:type}:null;
  }
  if(type==='data-beta54-page'){
    const routeKey=String(input.value||input.beta54Page||'').trim();
    return routeKey?{kind:'route',routeKey,navigationKey:'beta54:'+routeKey,adapterId:type}:null;
  }
  if(type==='data-beta55-supply-page'){
    return {kind:'route',routeKey:'internalSupply',navigationKey:'custom:supply',adapterId:type};
  }
  if(type==='data-beta55-hr-group'){
    return {kind:'group',routeKey:null,navigationKey:'group:hr',adapterId:type};
  }
  if(type==='data-site-tool'){
    const raw=String(input.value||input.siteTool||'').trim();
    const routeKey=WEBSITE_HUB_MAP[raw]||null;
    return routeKey?{kind:'hub-child',routeKey,navigationKey:'hub:website:'+raw,adapterId:type}:null;
  }
  return null;
}

function classifyDomElement(el){
  if(!el||!el.dataset)return null;
  if(el.dataset.page!==undefined)return normalizeDescriptor({type:'data-page',value:el.dataset.page});
  if(el.dataset.beta54Page!==undefined)return normalizeDescriptor({type:'data-beta54-page',value:el.dataset.beta54Page});
  if(Object.prototype.hasOwnProperty.call(el.dataset,'beta55SupplyPage'))return normalizeDescriptor({type:'data-beta55-supply-page',value:el.dataset.beta55SupplyPage});
  if(Object.prototype.hasOwnProperty.call(el.dataset,'beta55HrGroup'))return normalizeDescriptor({type:'data-beta55-hr-group',value:el.dataset.beta55HrGroup});
  if(el.dataset.siteTool!==undefined)return normalizeDescriptor({type:'data-site-tool',value:el.dataset.siteTool});
  if(el.id&&NON_ROUTE_CONTROLS[el.id])return {kind:NON_ROUTE_CONTROLS[el.id],routeKey:null,navigationKey:'id:'+el.id,adapterId:'non-route-control'};
  return null;
}

const API=Object.freeze({
  version:VERSION,
  mode:'shadow-describe-only',
  sideEffects:false,
  adapters:ADAPTERS,
  websiteHubMap:WEBSITE_HUB_MAP,
  beta54Routes:BETA54_ROUTES,
  nonRouteControls:NON_ROUTE_CONTROLS,
  normalizeDescriptor,
  classifyDomElement
});

if(typeof module!=='undefined'&&module.exports)module.exports=API;
global.__SharawlaUnifiedNavigationAdaptersV1=API;
})(typeof window!=='undefined'?window:globalThis);
