(function(global){
'use strict';
const VERSION='10.5.4-beta.36';
const FILES=[
 ['orders-v2','commerce-orders-v2-ui.js?v=10.5.4-beta.36'],
 ['reports-v2','reports-v2-ui.js?v=10.5.4-beta.36'],
 ['finance-b2b','finance-b2b-ui.js?v=10.5.4-beta.36'],
 ['service-v1','service-v1-ui.js?v=10.5.4-beta.36']
];
function load(key,src){if(document.querySelector(`script[data-beta36-${key}]`))return;const s=document.createElement('script');s.src=src;s.defer=true;s.dataset[`beta36${key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())}`]='1';document.head.appendChild(s)}
function ready(){return typeof global.rpc==='function'&&typeof global.rest==='function'&&global.SharawlaRuntimeCore}
function start(){let tries=0;const t=setInterval(()=>{tries++;if(ready()){clearInterval(t);FILES.forEach(([k,s])=>load(k,s));global.__SharawlaBeta36Integration=Object.freeze({version:VERSION,files:FILES.map(x=>x[1])});return}if(tries>=100){clearInterval(t);console.error('Beta36 integration loader: app runtime not ready')}},50)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
