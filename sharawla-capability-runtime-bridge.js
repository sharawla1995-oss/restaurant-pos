(function(global){
'use strict';
const VERSION='10.5.4-beta.33';
const base=global.SharawlaRuntimeCore;
const capabilities=global.SharawlaCapabilities;
if(!base)throw new Error('Sharawla Runtime Core must load before capability bridge.');
if(!capabilities)throw new Error('Sharawla Capabilities must load before capability bridge.');

const basePrepare=base.prepareConfig.bind(base);
function prepareConfig(raw){
  const row=basePrepare(raw);
  const resolved=capabilities.resolveRuntime(raw||{});
  const capabilityVersion=Number(raw?.capability_version||0)||0;
  const featuresConfigured=raw?.features_configured===true||Array.isArray(raw?.enabled_features);
  return {
    ...row,
    features_configured:featuresConfigured,
    enabled_features:[...resolved.features],
    capability_version:capabilityVersion,
    capability_source:String(resolved.source||''),
    runtime_contract:capabilityVersion>=1?'v2':'legacy'
  };
}
function saveCache(storageKey,raw){
  const row=prepareConfig(raw);
  localStorage.setItem(storageKey,JSON.stringify(row));
  return row;
}
function loadCache(storageKey,businessId){
  try{
    const parsed=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(!parsed||String(parsed.business_id)!==String(businessId||''))return null;
    return prepareConfig(parsed);
  }catch{return null}
}
function featureEnabled(config,code){
  if(!config)return false;
  const wanted=String(code||'').trim().toLowerCase();
  if(!wanted)return true;
  return (Array.isArray(config.enabled_features)?config.enabled_features:[])
    .map(x=>String(x||'').trim().toLowerCase())
    .includes(wanted);
}

global.SharawlaRuntimeCore=Object.freeze({
  ...base,
  prepareConfig,
  saveCache,
  loadCache,
  featureEnabled,
  capabilityBridgeVersion:VERSION
});
})(window);
