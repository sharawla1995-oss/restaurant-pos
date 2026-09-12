(function(global){
'use strict';
const VERSION='10.5.4-beta.34';
const base=global.SharawlaRuntimeCore;
if(!base)throw new Error('Sharawla Runtime Core must load before Feature Consumption Bridge.');

const PAGE_FEATURES=Object.freeze({
  kitchen:Object.freeze({feature:'food.kitchen',title:'المطبخ',permissionLabel:'المطبخ / KDS'})
});

function norm(v){return String(v||'').trim().toLowerCase()}
function featureEnabled(config,feature){
  if(typeof base.featureEnabled==='function')return base.featureEnabled(config,feature)===true;
  return (Array.isArray(config?.enabled_features)?config.enabled_features:[]).map(norm).includes(norm(feature));
}
function featureForPage(page){return PAGE_FEATURES[String(page||'')]||null}
function featurePageEnabled(config,page){const row=featureForPage(page);return !!row&&featureEnabled(config,row.feature)}
function unique(values){return [...new Set((Array.isArray(values)?values:[]).map(String))]}

function pageAllowed(config,page){
  if(base.pageAllowed(config,page)===true)return true;
  return featurePageEnabled(config,page);
}
function pageOperationalAllowed(config,page,settings){
  if(base.pageAllowed(config,page)===true)return base.pageOperationalAllowed(config,page,settings)===true;
  return featurePageEnabled(config,page);
}
function pageTitle(config,page){
  if(featurePageEnabled(config,page))return featureForPage(page).title;
  return base.pageTitle(config,page);
}
function allPages(config){
  const rows=unique(base.allPages(config));
  for(const page of Object.keys(PAGE_FEATURES))if(featurePageEnabled(config,page))rows.push(page);
  return unique(rows);
}
function rolePages(config,role){
  // New cross-profile feature pages are not granted to non-admin roles by default.
  // Admin access is already derived from allPages() in app.js. Other roles can
  // receive the explicit permission through the normal employee permission flow.
  return unique(base.rolePages(config,role));
}
function permissionDefs(config){
  const rows=base.permissionDefs(config).map(r=>[r[0],r[1]]);
  for(const [page,row] of Object.entries(PAGE_FEATURES)){
    if(featurePageEnabled(config,page)&&!rows.some(x=>x[0]===page))rows.push([page,row.permissionLabel]);
  }
  return rows;
}
function permissionGroups(config){
  const groups=base.permissionGroups(config).map(([title,keys])=>[title,[...keys]]);
  const extra=Object.keys(PAGE_FEATURES).filter(page=>featurePageEnabled(config,page));
  if(extra.length)groups.push(['🧩 خصائص إضافية',extra]);
  return groups;
}
function activeFeaturePages(config){
  return Object.entries(PAGE_FEATURES)
    .filter(([page])=>featurePageEnabled(config,page))
    .map(([page,row])=>({page,feature:row.feature,title:row.title}));
}

global.SharawlaRuntimeCore=Object.freeze({
  ...base,
  pageAllowed,
  pageOperationalAllowed,
  pageTitle,
  allPages,
  rolePages,
  permissionDefs,
  permissionGroups,
  featureForPage,
  featurePageEnabled,
  activeFeaturePages,
  featureConsumptionVersion:VERSION
});

global.__SharawlaFeatureConsumption=Object.freeze({VERSION,PAGE_FEATURES,featurePageEnabled,activeFeaturePages});

// Capability modules are bootstrapped from the shared layer so they are not owned
// by Restaurant/Retail/Pharmacy engines. Runtime entitlements decide what loads.
if(typeof document!=='undefined'&&!document.querySelector('script[data-sharawla-capability-module-registry]')){
  const s=document.createElement('script');
  s.src='sharawla-capability-module-registry.js?v=10.5.4-beta.42';
  s.defer=true;
  s.dataset.sharawlaCapabilityModuleRegistry='1';
  document.head.appendChild(s);
}
})(window);
