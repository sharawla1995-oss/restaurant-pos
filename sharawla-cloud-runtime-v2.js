(function(global){
'use strict';
const VERSION='10.5.4-beta.33';
const LEGACY_RPC='get_sharawla_business_runtime_config';
const V2_RPC='get_sharawla_business_runtime_config_v2';
const originalFetch=global.fetch.bind(global);

function requestUrl(input){
  if(typeof input==='string')return input;
  if(input&&typeof input.url==='string')return input.url;
  return '';
}
function isLegacyRuntimeRequest(input,init){
  const url=requestUrl(input);
  const method=String(init?.method||input?.method||'GET').toUpperCase();
  return method==='POST'&&new RegExp(`/rest/v1/rpc/${LEGACY_RPC}(?:\\?|$)`).test(url);
}
function toV2Url(url){
  return String(url).replace(new RegExp(`/${LEGACY_RPC}(?=\\?|$)`),`/${V2_RPC}`);
}
async function isMissingV2Rpc(response){
  if(!response||Number(response.status)!==404)return false;
  try{
    const body=await response.clone().json();
    const code=String(body?.code||'');
    const text=[body?.message,body?.hint,body?.details].filter(Boolean).join(' ');
    return code==='PGRST202'||/could not find.*function|requested function was not found|function .* does not exist|schema cache/i.test(text);
  }catch{return false}
}
async function v2FirstFetch(input,init){
  if(!isLegacyRuntimeRequest(input,init))return originalFetch(input,init);
  const legacyUrl=requestUrl(input);
  const v2Url=toV2Url(legacyUrl);
  const v2Response=await originalFetch(v2Url,init);
  if(await isMissingV2Rpc(v2Response))return originalFetch(input,init);
  return v2Response;
}

global.fetch=v2FirstFetch;
global.__SharawlaCloudRuntimeV2=Object.freeze({
  VERSION,
  LEGACY_RPC,
  V2_RPC,
  fallbackPolicy:'missing-v2-rpc-only',
  isLegacyRuntimeRequest,
  isMissingV2Rpc
});
})(window);
