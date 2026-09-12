(function(global){
'use strict';

const VERSION='10.5.4-beta.35';

function currentConfig(){
  try{return typeof sharawlaRuntimeConfig!=='undefined' ? sharawlaRuntimeConfig : null}catch{return null}
}
function configuredFeatureEnabled(config,code){
  if(!config)return true;
  const capabilityConfigured=config.features_configured===true || Number(config.capability_version||0)>=1;
  // Legacy runtime fallback must preserve the historical POS behavior.
  if(!capabilityConfigured)return true;
  const core=global.SharawlaRuntimeCore;
  if(!core||typeof core.featureEnabled!=='function')return false;
  return core.featureEnabled(config,code)===true;
}
function featureEnabled(code){return configuredFeatureEnabled(currentConfig(),code)}
function modifiersEnabled(){return featureEnabled('food.modifiers')}
function tablesEnabled(){return featureEnabled('food.tables')}

function hide(el){if(el)el.style.display='none'}
function hideClosest(el,selector){if(el)hide(el.closest(selector)||el)}

function syncDineInGate(){
  if(tablesEnabled())return;
  const order=document.querySelector('#orderType');
  if(order){
    const opt=order.querySelector('option[value="dinein"]');
    if(order.value==='dinein')order.value='takeaway';
    opt?.remove();
  }
  const report=document.querySelector('#repType');
  if(report){
    const opt=report.querySelector('option[value="dinein"]');
    if(report.value==='dinein')report.value='all';
    opt?.remove();
  }
}

function syncModifierGate(){
  if(modifiersEnabled())return;

  // New product form: do not create modifier/removal behavior while the feature is disabled.
  const pExtras=document.querySelector('#pExtras');
  const pRemove=document.querySelector('#pRemove');
  if(pExtras){pExtras.checked=false;pExtras.disabled=true;hideClosest(pExtras,'label')}
  if(pRemove){pRemove.checked=false;pRemove.disabled=true;hideClosest(pRemove,'label')}
  hideClosest(document.querySelector('#pRemovals'),'label');
  hide(document.querySelector('#pExtrasBox'));
  hideClosest(document.querySelector('#addModifier'),'.panel');

  // Existing product edit: preserve stored values but make modifier controls read-only/hidden.
  for(const id of ['#editExtras','#editRemove']){
    const el=document.querySelector(id);
    if(el){el.disabled=true;hideClosest(el,'label')}
  }
  const editRem=document.querySelector('#editProductRemovals');
  if(editRem){editRem.disabled=true;hideClosest(editRem,'label')}
  hide(document.querySelector('#editExtrasBox'));

  // The legacy "Options" dialog is modifier-focused. Keep notes available from Edit Product.
  document.querySelectorAll('[data-config]').forEach(hide);
}

function syncDomGates(){
  syncDineInGate();
  syncModifierGate();
}

// Runtime sale gate: when modifiers are disabled, reuse the existing stable cart flow
// while temporarily suppressing Extras and removable-components only. Item notes and
// product variants remain unchanged.
let originalAddProductToCart=null;
try{if(typeof addProductToCart==='function')originalAddProductToCart=addProductToCart}catch{}
if(originalAddProductToCart){
  addProductToCart=function(p){
    if(modifiersEnabled())return originalAddProductToCart.call(this,p);
    let settings=null;
    try{settings=state?.settings||null}catch{}
    if(!settings)return originalAddProductToCart.call(this,p);
    const oldExtras=settings.enable_extras;
    const oldRemovals=settings.enable_removals;
    settings.enable_extras=false;
    settings.enable_removals=false;
    try{return originalAddProductToCart.call(this,p)}
    finally{
      settings.enable_extras=oldExtras;
      settings.enable_removals=oldRemovals;
    }
  };
}

if(typeof document!=='undefined'){
  syncDomGates();
  if(typeof MutationObserver!=='undefined'){
    const observer=new MutationObserver(()=>syncDomGates());
    if(document.body)observer.observe(document.body,{childList:true,subtree:true});
  }
  if(typeof setInterval==='function')setInterval(syncDomGates,500);
}

global.__SharawlaFeatureBehavior=Object.freeze({
  VERSION,
  configuredFeatureEnabled,
  featureEnabled,
  modifiersEnabled,
  tablesEnabled,
  syncDomGates
});
})(window);
