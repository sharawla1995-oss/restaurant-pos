(function(global){
'use strict';
const VERSION='10.5.4-beta.34';
const RUNTIME_KEY='sharawlaRuntimeConfigV1';

function runtimeConfig(){
  try{
    if(typeof global.runtimeConfig==='function')return global.runtimeConfig();
    const raw=JSON.parse(localStorage.getItem(RUNTIME_KEY)||'null');
    return raw&&typeof raw==='object'?raw:null;
  }catch{return null}
}
function featureEnabled(code){
  const cfg=runtimeConfig();
  const core=global.SharawlaRuntimeCore;
  if(core&&typeof core.featureEnabled==='function')return core.featureEnabled(cfg,code)===true;
  return (Array.isArray(cfg?.enabled_features)?cfg.enabled_features:[]).map(x=>String(x||'').trim().toLowerCase()).includes(String(code||'').trim().toLowerCase());
}
function ensureKitchenHomeCard(){
  const grid=document.querySelector('#page .home-grid');
  if(!grid)return false;
  const existing=grid.querySelector('[data-beta34-feature-card="food.kitchen"]');
  if(!featureEnabled('food.kitchen')){if(existing)existing.remove();return false}
  if(grid.querySelector('[data-home-page="kitchen"]'))return true;
  const button=document.createElement('button');
  button.className='home-card tone-amber';
  button.type='button';
  button.dataset.homePage='kitchen';
  button.dataset.beta34FeatureCard='food.kitchen';
  button.innerHTML='<span class="home-icon">👨‍🍳</span><span class="home-copy"><b>المطبخ</b><small>متابعة وتجهيز الطلبات</small></span><span class="home-arrow">‹</span>';
  const logout=grid.querySelector('[data-home-logout]');
  if(logout)grid.insertBefore(button,logout);else grid.appendChild(button);
  return true;
}
function refresh(){ensureKitchenHomeCard()}
function start(){
  refresh();
  const page=document.getElementById('page');
  if(page){
    const observer=new MutationObserver(()=>queueMicrotask(refresh));
    observer.observe(page,{childList:true,subtree:true});
  }
  document.addEventListener('sharawla-runtime-config-updated',refresh);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

global.__SharawlaBeta34FeatureUI=Object.freeze({VERSION,featureEnabled,ensureKitchenHomeCard,refresh});
})(window);
