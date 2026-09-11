(function(global){
'use strict';
const VERSION='10.5.4-beta.33';
const base=global.SharawlaCapabilities;
if(!base)throw new Error('Sharawla Capability Registry must load before Beta33 extension.');

const SERVICE_FEATURES=Object.freeze([
  'core.audit','core.auth','core.branches','core.customers','core.expenses','core.licensing','core.notifications','core.offline','core.payments','core.permissions','core.reports','core.shifts','core.updates','core.users',
  'service.appointments','service.assets','service.jobs'
]);
const SERVICE_PROFILE=Object.freeze({
  code:'service',
  domain:'service',
  label:'خدمات ومواعيد وصيانة',
  implemented:false,
  features:SERVICE_FEATURES
});

function norm(v){return String(v||'').trim().toLowerCase()}
function getProfile(code){
  return norm(code)==='service'?SERVICE_PROFILE:base.getProfile(code);
}
function listProfiles(){
  const rows=base.listProfiles().filter(x=>norm(x?.code)!=='service');
  return [...rows,{...SERVICE_PROFILE,features:[...SERVICE_PROFILE.features]}];
}
function resolveRuntime(config){
  if(norm(config?.pos_profile)!=='service')return base.resolveRuntime(config);
  let features=[];
  let source='profile-preset';
  if(Array.isArray(config?.enabled_features)&&config.enabled_features.length){
    features=base.dependencyClosure(config.enabled_features);
    source='cloud-features';
  }else if(config?.modules_configured===true){
    features=base.fromModules(config.enabled_modules);
    source='legacy-modules';
  }else{
    features=base.dependencyClosure(SERVICE_PROFILE.features);
  }
  return Object.freeze({profile:'service',domain:'service',implemented:false,source,features:Object.freeze(features)});
}
function selfValidate(){
  base.selfValidate();
  for(const code of SERVICE_PROFILE.features)if(!base.getFeature(code))throw new Error(`Unknown service feature ${code}`);
  const check=base.validateSelection(SERVICE_PROFILE.features);
  if(!check.ok)throw new Error(`Service profile dependency mismatch: ${JSON.stringify(check.missing)}`);
  return true;
}
selfValidate();

global.SharawlaCapabilities=Object.freeze({
  ...base,
  VERSION,
  PROFILE_COUNT:base.PROFILE_COUNT+1,
  getProfile,
  listProfiles,
  resolveRuntime,
  selfValidate,
  SERVICE_PROFILE
});
})(window);
