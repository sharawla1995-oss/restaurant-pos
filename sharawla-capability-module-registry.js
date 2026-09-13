(function(global){
'use strict';

const VERSION='10.5.4-beta.50';
const RUNTIME_KEY='sharawlaRuntimeConfigV1';

const MODULES=Object.freeze([
  Object.freeze({
    code:'food.recipe.runtime',
    kind:'runtime',
    featuresAny:Object.freeze(['food.recipes']),
    permission:'inventory',
    contracts:Object.freeze(['create_food_pos_order_atomic_v1','create_food_order_return_idempotent_v1']),
    assets:Object.freeze(['food-recipe-runtime-bridge.js?v=10.5.4-beta.50'])
  }),
  Object.freeze({
    code:'food.recipe.ui',
    kind:'ui',
    featuresAny:Object.freeze(['food.ingredients','food.recipes']),
    permission:'inventory',
    contracts:Object.freeze(['food_ingredient_save_v1','food_recipe_save_draft_v1','food_recipe_activate_version_v1']),
    assets:Object.freeze(['food-recipe-ui-v1.js?v=10.5.4-beta.50']),
    cleanupSelectors:Object.freeze(['[data-food-center]','[data-food-inventory-btn]'])
  }),
  Object.freeze({
    code:'food.advanced.ui',
    kind:'ui',
    featuresAny:Object.freeze(['food.prep','food.production','food.waste','food.costing']),
    permission:'inventory',
    contracts:Object.freeze(['food_prep_item_save_v1','food_production_batch_start_v1','food_production_batch_complete_v1','food_waste_post_v1']),
    assets:Object.freeze(['food-advanced-ui-v1.js?v=10.5.4-beta.50']),
    cleanupSelectors:Object.freeze(['[data-food-advanced]'])
  })
]);

const loadedAssets=new Set();
const listeners=new Map();

function norm(v){return String(v||'').trim().toLowerCase()}
function config(){
  try{
    if(typeof global.runtimeConfig==='function'){
      const c=global.runtimeConfig();
      if(c&&typeof c==='object')return c;
    }
    return JSON.parse(global.localStorage?.getItem(RUNTIME_KEY)||'{}')||{};
  }catch{return {}}
}
function enabledSet(cfg=config()){
  return new Set((Array.isArray(cfg?.enabled_features)?cfg.enabled_features:[]).map(norm).filter(Boolean));
}
function moduleEnabled(def,cfg=config()){
  const enabled=enabledSet(cfg);
  const any=Array.isArray(def.featuresAny)?def.featuresAny:[];
  const all=Array.isArray(def.featuresAll)?def.featuresAll:[];
  if(any.length&&!any.some(code=>enabled.has(norm(code))))return false;
  if(all.length&&!all.every(code=>enabled.has(norm(code))))return false;
  return any.length>0||all.length>0;
}
function emit(name,detail){
  try{global.dispatchEvent?.(new CustomEvent(name,{detail}))}catch{}
  const rows=listeners.get(name)||[];
  for(const fn of rows){try{fn(detail)}catch(e){console.error(e)}}
}
function on(name,fn){
  if(typeof fn!=='function')return()=>{};
  const rows=listeners.get(name)||[];rows.push(fn);listeners.set(name,rows);
  return()=>{const current=listeners.get(name)||[];listeners.set(name,current.filter(x=>x!==fn))};
}
function removeDisabledUi(def){
  if(!Array.isArray(def.cleanupSelectors)||typeof document==='undefined')return;
  for(const selector of def.cleanupSelectors){
    document.querySelectorAll(selector).forEach(el=>{try{el.remove()}catch{}});
  }
}
function loadAsset(def,src){
  if(loadedAssets.has(src))return;
  if(typeof document==='undefined')return;
  const path=String(src).split('?')[0];
  const existing=[...document.querySelectorAll('script[src]')].find(s=>String(s.getAttribute('src')||'').split('?')[0]===path);
  if(existing){loadedAssets.add(src);return}
  const script=document.createElement('script');
  script.src=src;
  script.defer=true;
  script.async=false;
  script.dataset.sharawlaCapabilityModule=def.code;
  script.onload=()=>emit('sharawla-capability-module-loaded',{module:def.code,asset:src});
  script.onerror=()=>emit('sharawla-capability-module-error',{module:def.code,asset:src});
  document.head.appendChild(script);
  loadedAssets.add(src);
}
function reconcile(cfg=config()){
  const active=[];
  for(const def of MODULES){
    if(moduleEnabled(def,cfg)){
      active.push(def.code);
      for(const src of def.assets||[])loadAsset(def,src);
    }else removeDisabledUi(def);
  }
  emit('sharawla-capability-modules-reconciled',{active:[...active],profile:norm(cfg?.pos_profile)||null});
  return active;
}
function featureModules(code){
  const key=norm(code);
  return MODULES.filter(def=>[...(def.featuresAny||[]),...(def.featuresAll||[])].map(norm).includes(key)).map(def=>({code:def.code,kind:def.kind,permission:def.permission||null,contracts:[...(def.contracts||[])],assets:[...(def.assets||[])]}));
}
function definitions(){return MODULES.map(def=>({code:def.code,kind:def.kind,featuresAny:[...(def.featuresAny||[])],featuresAll:[...(def.featuresAll||[])],permission:def.permission||null,contracts:[...(def.contracts||[])],assets:[...(def.assets||[])]}))}

const api=Object.freeze({VERSION,reconcile,moduleEnabled,featureModules,definitions,on});
global.SharawlaCapabilityModuleRegistry=api;

function start(){reconcile()}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  document.addEventListener('sharawla-runtime-config-updated',()=>reconcile());
}
global.addEventListener?.('storage',e=>{if(e?.key===RUNTIME_KEY)reconcile()});
})(window);
