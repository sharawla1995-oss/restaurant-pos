(function(global){
'use strict';
const VERSION='10.5.4-beta.47';
const FILES=[
 ['offline-v2','beta36-offline-v2.js?v=10.5.4-beta.47'],
 ['permissions-v2','permissions-v2-ui.js?v=10.5.4-beta.47'],
 ['printing-v2','printing-v2.js?v=10.5.4-beta.47'],
 ['landed-cost-v1','landed-cost-posting-v1.js?v=10.5.4-beta.47'],
 ['orders-v2','commerce-orders-v2-ui.js?v=10.5.4-beta.47'],
 ['reports-v2','reports-v2-ui.js?v=10.5.4-beta.47'],
 ['finance-b2b','finance-b2b-ui.js?v=10.5.4-beta.47'],
 ['service-v1','service-v1-ui.js?v=10.5.4-beta.47'],
 ['warehouse-v1','warehouse-v1-ui.js?v=10.5.4-beta.47'],
 ['membership-v1','membership-v1-ui.js?v=10.5.4-beta.47'],
 ['logistics-v1','logistics-v1-ui.js?v=10.5.4-beta.47'],
 ['beta47-performance-sync-hotfix','beta47-performance-sync-hotfix.js?v=10.5.4-beta.47'],
 ['owner-acceptance-lazy-v47','owner-acceptance-lazy-loader-v47.js?v=10.5.4-beta.47']
];
function load(key,src){return new Promise((resolve,reject)=>{if(document.querySelector(`script[data-beta36-${key}]`))return resolve();const s=document.createElement('script');s.src=src;s.async=false;s.setAttribute(`data-beta36-${key}`,'1');s.onload=()=>resolve();s.onerror=()=>reject(new Error(`Beta47 failed to load ${src}`));document.head.appendChild(s)})}
function ready(){return typeof global.rpc==='function'&&typeof global.rest==='function'&&global.SharawlaRuntimeCore}
async function loadAll(){
 for(const [k,s] of FILES)await load(k,s);
 global.__SharawlaBeta36Integration=Object.freeze({version:VERSION,files:FILES.map(x=>x[1]),loaded:true,ownerAcceptance:'lazy'});
 for(const name of ['sharawla-beta36-integrations-ready','sharawla-beta37-integrations-ready','sharawla-beta38-integrations-ready','sharawla-beta39-integrations-ready','sharawla-beta47-integrations-ready'])global.dispatchEvent(new CustomEvent(name));
}
function start(){let tries=0;const t=setInterval(()=>{tries++;if(ready()){clearInterval(t);loadAll().catch(e=>console.error(e));return}if(tries>=100){clearInterval(t);console.error('Beta47 integration loader: app runtime not ready')}},50)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
