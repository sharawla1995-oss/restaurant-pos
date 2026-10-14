'use strict';
// Main-process-only update feed. Never used by ordinary Sharawla Production installs.
const TC_BUSINESS = '5358328c-9724-49aa-affc-1bce8be90f92';
const TC_DEVICE = '44162475-3ca2-4a2b-8bd5-aee1c7bb1c73';
const TC_CHANNEL = 'top-chicken-sh0008';
const SUPABASE_CENTRAL = 'https://ikppryeavoabnugcijeq.supabase.co';
const CENTRAL_PUBLISHABLE_KEY = 'sb_publishable_Lv-eHHXQnWGy-g0rrc2x3w_daXKN2LI';
const FEED_URL = 'https://raw.githubusercontent.com/sharawla1995-oss/restaurant-pos/refs/heads/release/top-chicken-sh0008-primary-v10.5.19-candidate/top-chicken-updates/sh0008.json';
const RELEASE_BASE = 'https://github.com/sharawla1995-oss/restaurant-pos/releases/download/';
function identify(state, fingerprintCandidates){
  if (!state || String(state.business_id||'')!==TC_BUSINESS || String(state.device_id||'')!==TC_DEVICE) return false;
  const canonical=String(state.device_fingerprint||'');
  return /^[a-f0-9]{64}$/i.test(canonical) && fingerprintCandidates.includes(canonical);
}
function parseVersion(version){
  const m=String(version||'').match(/^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/);
  if(!m) return null;
  return {major:+m[1],minor:+m[2],patch:+m[3],rc:m[4]===undefined?Infinity:+m[4]};
}
function newer(remote,local){
  const a=parseVersion(remote),b=parseVersion(local);
  if(!a||!b)return false;
  for(const k of ['major','minor','patch','rc'])if(a[k]!==b[k])return a[k]>b[k];
  return false;
}
function choose(feed,local,arch){
  if(!feed || feed.schema!==1 || feed.channel!==TC_CHANNEL || feed.business_id!==TC_BUSINESS ||
    feed.device_id!==TC_DEVICE || feed.enabled!==true)return {available:false,reason:'no-targeted-release'};
  if(!parseVersion(feed.version)||!newer(feed.version,local))return {available:false,reason:'up-to-date'};
  const item=feed.assets?.[arch];
  const url=String(item?.url||'');
  const tail=url.startsWith(RELEASE_BASE)?url.slice(RELEASE_BASE.length):'';
  if(!item || !/^[0-9a-f]{64}$/i.test(String(item.sha256||'')) ||
    !/^[0-9A-Za-z._-]+\/Top-Chicken-SH0008-Primary-[0-9A-Za-z.-]+\.exe$/.test(tail))
    return {available:false,reason:'no-verified-installer'};
  return {available:true,version:feed.version,url,sha256:item.sha256.toLowerCase(),filename:url.slice(url.lastIndexOf('/')+1)};
}
function verifyResponse(data){
  const row=Array.isArray(data)?data[0]:data;
  return !!row && row.ok===true && String(row.business_id)===TC_BUSINESS;
}
module.exports={TC_BUSINESS,TC_DEVICE,TC_CHANNEL,SUPABASE_CENTRAL,CENTRAL_PUBLISHABLE_KEY,FEED_URL,
 identify,parseVersion,newer,choose,verifyResponse};
