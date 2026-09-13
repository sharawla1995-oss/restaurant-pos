(function(global){
'use strict';
const VERSION='10.5.4-beta.47';
const FILES=[
 ['owner-acceptance-registry-v3','owner-acceptance-registry-v3.js?v=10.5.4-beta.47'],
 ['owner-acceptance-network-lab','owner-acceptance-network-lab.js?v=10.5.4-beta.47'],
 ['owner-acceptance-e2e-v3','owner-acceptance-e2e-v3.js?v=10.5.4-beta.47'],
 ['owner-acceptance-profile-packs-v3','owner-acceptance-profile-packs-v3.js?v=10.5.4-beta.47'],
 ['owner-acceptance-advanced-v4','owner-acceptance-advanced-v4.js?v=10.5.4-beta.47'],
 ['owner-acceptance-recovery-permissions-v5','owner-acceptance-recovery-permissions-v5.js?v=10.5.4-beta.47'],
 ['owner-acceptance-ui-v47','owner-acceptance-ui-v47.js?v=10.5.4-beta.47']
];
let loading=null,loaded=false;
function load(key,src){return new Promise((resolve,reject)=>{if(document.querySelector(`script[data-owner-lazy-${key}]`))return resolve();const s=document.createElement('script');s.src=src;s.async=false;s.setAttribute(`data-owner-lazy-${key}`,'1');s.onload=()=>resolve();s.onerror=()=>reject(new Error(`Beta47 owner lazy load failed: ${src}`));document.head.appendChild(s)})}
async function loadAll(){if(loaded)return true;if(loading)return loading;loading=(async()=>{for(const [k,s] of FILES)await load(k,s);loaded=true;global.dispatchEvent(new CustomEvent('sharawla-beta47-acceptance-ready',{detail:{version:VERSION}}));return true})().finally(()=>{loading=null});return loading}
function onOwner(e){if(e?.detail?.unlocked===true)loadAll().catch(err=>console.error(err))}
document.addEventListener('sharawla-owner-diagnostics-change',onOwner);
if(global.__SharawlaOwnerDiagnostics?.isUnlocked?.())loadAll().catch(err=>console.error(err));
global.__SharawlaOwnerAcceptanceLazyV47=Object.freeze({version:VERSION,loaded:()=>loaded,load:loadAll,files:FILES.map(x=>x[1])});
})(window);
