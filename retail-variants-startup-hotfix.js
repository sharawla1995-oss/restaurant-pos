(function(global){
'use strict';
const VERSION='10.5.4-beta.37';
const KEY='sharawlaRuntimeConfigV1';
let timer=null;
let tries=0;
function cfg(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{return {}}}
function ready(){
 const c=cfg();
 const features=Array.isArray(c.enabled_features)?c.enabled_features:[];
 return String(c.pos_profile||'').toLowerCase()==='retail'&&global.SharawlaRuntimeCore?.hasEngine?.('retail')===true&&features.map(x=>String(x||'').toLowerCase()).includes('commerce.variants');
}
function ensure(){
 if(global.__SharawlaRetailVariantsV1)return true;
 if(!ready())return false;
 if(document.querySelector('script[data-retail-variants-startup-hotfix]'))return false;
 const s=document.createElement('script');
 s.src='retail-variants-ui.js?v=10.5.4-beta.37-runtime-retry';
 s.async=false;
 s.setAttribute('data-retail-variants-startup-hotfix','1');
 s.onload=()=>global.dispatchEvent(new CustomEvent('sharawla-retail-variants-retried'));
 s.onerror=()=>console.error('Retail Variants startup hotfix failed to reload UI');
 document.head.appendChild(s);
 return true;
}
function start(){
 if(timer)return;
 timer=setInterval(()=>{
  tries++;
  if(global.__SharawlaRetailVariantsV1||ensure()||tries>=300){clearInterval(timer);timer=null}
 },100);
 ensure();
}
global.addEventListener('sharawla-beta36-integrations-ready',start);
global.addEventListener('sharawla-beta37-integrations-ready',start);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
