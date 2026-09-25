(function(global){
'use strict';
const VERSION='advanced-purchasing-runtime-bridge.1';
const FEATURES=Object.freeze({po:'inventory.purchase_orders',returns:'inventory.supplier_returns'});
let installed=false;
let installTimer=null;
let installTries=0;
const INSTALL_MAX=600;

function cfg(){try{return JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'{}')||{}}catch{return {}}}
function retail(){const c=cfg();return String(c.pos_profile||'').toLowerCase()==='retail'&&global.SharawlaRuntimeCore?.hasEngine?.('retail')===true}
function has(code){const c=cfg();return (Array.isArray(c.enabled_features)?c.enabled_features:[]).map(x=>String(x||'').trim().toLowerCase()).includes(String(code).toLowerCase())}
function purchaseOrdersEnabled(){return retail()&&has(FEATURES.po)}
function supplierReturnsEnabled(){return retail()&&has(FEATURES.returns)}

function install(){
 installTries++;
 if(installed)return true;
 if(typeof global.rpc!=='function'){
  if(installTries>=INSTALL_MAX&&installTimer){clearInterval(installTimer);installTimer=null}
  return false;
 }
 const baseRpc=global.rpc.bind(global);
 const bridge=async function(name,payload={}){
  if(name==='retail_purchase_receive'&&purchaseOrdersEnabled()){
   return baseRpc('retail_purchase_receive_v2',payload);
  }
  if(name==='retail_supplier_return_create'&&supplierReturnsEnabled()){
   return baseRpc('retail_supplier_return_create_v2',payload);
  }
  return baseRpc(name,payload);
 };
 Object.defineProperty(bridge,'__sharawlaAdvancedPurchasingBridge',{value:true,enumerable:false});
 global.rpc=bridge;
 installed=true;
 if(installTimer){clearInterval(installTimer);installTimer=null}
 global.__SharawlaAdvancedPurchasingRuntimeBridge=Object.freeze({
  version:VERSION,
  features:FEATURES,
  installed:true,
  purchaseOrdersEnabled,
  supplierReturnsEnabled
 });
 return true;
}
function start(){
 if(install())return;
 if(!installTimer)installTimer=setInterval(install,100);
}
for(const eventName of ['sharawla-beta36-integrations-ready','sharawla-beta37-integrations-ready','sharawla-beta38-integrations-ready','sharawla-beta39-integrations-ready'])global.addEventListener?.(eventName,install);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
