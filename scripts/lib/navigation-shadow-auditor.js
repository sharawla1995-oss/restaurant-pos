'use strict';

const STATUS=Object.freeze({
  MATCH:'SHADOW_MATCH',
  LOCKED_MATCH:'SHADOW_LOCKED_MATCH',
  CONFLICT_BLOCKED:'SHADOW_CONFLICT_BLOCKED',
  DEFERRED:'SHADOW_DEFERRED',
  NEW_TARGET:'SHADOW_NEW_TARGET',
  MISMATCH:'SHADOW_MISMATCH',
  UNKNOWN:'UNKNOWN',
  GROUP:'GROUP_NON_ROUTE',
  ACTION:'ACTION_NON_ROUTE'
});

function uniq(xs){return [...new Set(xs||[])]}
function asSet(xs){return new Set(xs||[])}

function buildMaps(registry,ownership){
  const routeMap=new Map((registry?.routes||[]).map(r=>[r.routeKey,r]));
  const policies=ownership?.policies||{};
  return {routeMap,policies};
}

function physicalRendererOwners(route,policy){
  if(policy?.rendererOwners?.length)return [...policy.rendererOwners];
  if(route?.rendererOwner==='Orders V58.3')return ['app.js'];
  if(typeof route?.rendererOwner==='string'&&route.rendererOwner.endsWith('.js'))return [route.rendererOwner];
  return [];
}

function physicalNavigationOwners(route,policy){
  if(policy?.navigationOwners?.length)return [...policy.navigationOwners];
  if(typeof route?.navigationOwner==='string')return [route.navigationOwner];
  return [];
}

function expectedAugmentations(route,policy){
  if(policy?.augmentationLayers?.length)return [...policy.augmentationLayers];
  const out=[];
  for(const x of route?.augmentationLayers||[]){
    const m=String(x).match(/([A-Za-z0-9_.-]+\.js)/);
    if(m)out.push(m[1]);
  }
  return uniq(out);
}

function disposition(route){
  if(!route)return 'UNKNOWN';
  if(route.migrationStatus==='CONFLICT_BLOCKED')return 'CONFLICT';
  if(route.migrationStatus==='DEFERRED_FIX')return 'DEFERRED';
  if(route.migrationStatus==='NEW_TARGET')return 'NEW_TARGET';
  if(route.migrationStatus==='LOCKED_ACCEPTED_OWNER')return 'LOCKED';
  return 'NORMAL';
}

function hasEvidence(actual){
  return !!actual &&
    actual.opened===true &&
    typeof actual.rendererOwner==='string' &&
    typeof actual.renderer==='string' &&
    typeof actual.navigationOwner==='string' &&
    Array.isArray(actual.sourceEvidence) &&
    actual.sourceEvidence.length>0;
}

function compareDispatch(route,policy,actual){
  const mode=disposition(route);
  if(mode==='CONFLICT')return {status:STATUS.CONFLICT_BLOCKED,canonical:false,reasons:['CONFLICT_BLOCKED']};
  if(mode==='DEFERRED')return {status:STATUS.DEFERRED,canonical:false,reasons:['DEFERRED_FIX']};
  if(mode==='NEW_TARGET')return {status:STATUS.NEW_TARGET,canonical:false,reasons:['NEW_TARGET']};
  if(!hasEvidence(actual))return {status:STATUS.MISMATCH,canonical:false,reasons:['INSUFFICIENT_ACTUAL_OWNER_EVIDENCE']};

  const reasons=[];
  const rendererOwners=physicalRendererOwners(route,policy);
  const navigationOwners=physicalNavigationOwners(route,policy);
  const augmentations=expectedAugmentations(route,policy);
  const actualAug=asSet(actual.augmentationLayers);

  if(rendererOwners.length&&!rendererOwners.includes(actual.rendererOwner))reasons.push('RENDERER_OWNER_MISMATCH');
  if(route.renderer&&route.renderer!==actual.renderer)reasons.push('RENDERER_MISMATCH');
  if(navigationOwners.length&&!navigationOwners.includes(actual.navigationOwner))reasons.push('NAVIGATION_OWNER_MISMATCH');
  for(const layer of augmentations)if(!actualAug.has(layer))reasons.push('AUGMENTATION_EVIDENCE_MISSING:'+layer);

  if(reasons.length)return {status:STATUS.MISMATCH,canonical:false,reasons};
  return {
    status:mode==='LOCKED'?STATUS.LOCKED_MATCH:STATUS.MATCH,
    canonical:true,
    reasons:[]
  };
}

function profileAllowed(route,profile){
  if(!route||!profile)return null;
  return route.profile==='core'||route.profile===profile;
}

function compareVisibility(route,actualVisible,context){
  const ctx=context||{};
  const checks=[];
  const p=profileAllowed(route,ctx.profile);
  if(p!==null)checks.push(['PROFILE',p]);
  if(typeof ctx.featureAllowed==='boolean')checks.push(['FEATURE',ctx.featureAllowed]);
  if(typeof ctx.permissionAllowed==='boolean')checks.push(['PERMISSION',ctx.permissionAllowed]);
  if(typeof ctx.locationAllowed==='boolean')checks.push(['LOCATION',ctx.locationAllowed]);
  if(typeof ctx.expectedVisible==='boolean')checks.push(['EXPLICIT',ctx.expectedVisible]);

  const denied=checks.filter(([,ok])=>ok===false).map(([k])=>k);
  const expectedVisible=denied.length?false:(checks.length?true:null);
  if(expectedVisible===null)return {status:STATUS.MISMATCH,canonical:false,reasons:['INSUFFICIENT_VISIBILITY_EXPECTATION']};
  if(Boolean(actualVisible)!==expectedVisible){
    return {status:STATUS.MISMATCH,canonical:false,reasons:[expectedVisible?'EXPECTED_VISIBLE':'UNEXPECTED_VISIBILITY',...denied]};
  }
  return {status:STATUS.MATCH,canonical:true,reasons:[]};
}

function auditDescriptor(descriptor){
  if(!descriptor)return {status:STATUS.UNKNOWN,canonical:false,reasons:['NO_DESCRIPTOR']};
  if(descriptor.kind==='group')return {status:STATUS.GROUP,canonical:false,reasons:[]};
  if(descriptor.kind==='action')return {status:STATUS.ACTION,canonical:false,reasons:[]};
  return null;
}

function createAuditor(registry,ownership){
  const {routeMap,policies}=buildMaps(registry,ownership);
  return Object.freeze({
    version:'1.0.0-1d-a',
    mode:'shadow-pure',
    sideEffects:false,
    status:STATUS,
    auditDispatch(routeKey,actual){
      const route=routeMap.get(routeKey);
      if(!route)return {status:STATUS.UNKNOWN,canonical:false,reasons:['UNKNOWN_ROUTE']};
      return compareDispatch(route,policies[routeKey],actual||null);
    },
    auditVisibility(routeKey,actualVisible,context){
      const route=routeMap.get(routeKey);
      if(!route)return {status:STATUS.UNKNOWN,canonical:false,reasons:['UNKNOWN_ROUTE']};
      return compareVisibility(route,actualVisible,context||{});
    },
    auditDescriptor
  });
}

module.exports=Object.freeze({
  STATUS,
  createAuditor,
  disposition,
  compareDispatch,
  compareVisibility,
  auditDescriptor
});
