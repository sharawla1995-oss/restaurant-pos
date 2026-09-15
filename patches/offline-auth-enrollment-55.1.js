(function(global){
'use strict';
// SH-0007 sandbox corrective patch: guarantee Offline V2 auth enrollment after
// an authenticated online login has produced a cached bootstrap. No activation,
// fingerprint, business identity, or production behavior is changed here.
let installed=false;
function text(v){return String(v??'').trim()}
function api(){return global.topBurgerDesktop?.offlineV2||null}
async function identityAndLicense(){
  const st=typeof loadLicenseState==='function'?await loadLicenseState():null;
  const identity={device_id:text(st?.device_id),business_id:text(st?.business_id),device_fingerprint:text(st?.device_fingerprint)};
  if(!identity.device_id||!identity.business_id||!identity.device_fingerprint)throw new Error('Offline V2 canonical identity required');
  return {identity,license:st};
}
function install(){
  if(installed)return;installed=true;
  const a=api();
  if(!a?.authEnroll||typeof signIn!=='function'||typeof cacheBootstrap!=='function')return;
  const baseSignIn=signIn;
  const baseCacheBootstrap=cacheBootstrap;
  let credentials=null;
  async function enroll(){
    if(!navigator.onLine||!credentials)return null;
    const boot=await odbGet('bootstrap');
    if(!boot?.employee?.id)return null;
    const {identity,license}=await identityAndLicense();
    const result=await a.authEnroll({identity,license,bootstrap:boot,email:credentials.email,password:credentials.password});
    if(result?.enrolled!==true)throw new Error('Offline V2 auth enrollment failed');
    return result;
  }
  signIn=async function(email,password){
    const out=await baseSignIn(email,password);
    if(navigator.onLine){
      credentials={email:text(email).toLowerCase(),password:String(password||'')};
      try{await enroll()}catch(e){console.warn('SH-0007 offline auth post-login enrollment',e)}
    }
    return out;
  };
  cacheBootstrap=async function(){
    const out=await baseCacheBootstrap();
    if(navigator.onLine&&credentials)await enroll();
    return out;
  };
}
try{install()}catch(e){console.error('Offline auth enrollment patch install failed',e)}
})(window);
