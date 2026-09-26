(function(global){
'use strict';
const VERSION='10.5.4-beta.58.33';
const FILES=[
 ['offline-v2','beta36-offline-v2.js?v=10.5.4-beta.58.33'],
 ['permissions-v2','permissions-v2-ui.js?v=10.5.4-beta.58.33'],
 ['shared-business-core-v1','shared-business-core-v1.js?v=10.5.4-beta.58.33'],
 ['beta54-shared-core-ui','beta54-shared-core-ui.js?v=10.5.4-beta.58.33'],
 ['purchasing-attachments-v1','purchasing-attachments-v1.js?v=10.5.4-beta.58.33'],
 ['beta55-ui-workflow-fixes','beta55-ui-workflow-fixes.js?v=10.5.4-beta.58.33'],
 ['beta55-ui-hardening','beta55-ui-hardening.js?v=10.5.4-beta.58.33'],
 ['beta55-central-warehouse-ui','beta55-central-warehouse-ui.js?v=10.5.4-beta.58.33'],
 ['beta55-central-warehouse-v2','beta55-central-warehouse-v2.js?v=10.5.4-beta.58.33'],
 ['beta55-emergency-permission-hardening','beta55-emergency-permission-hardening.js?v=10.5.4-beta.58.33'],
 ['food-recipe-runtime-v1','food-recipe-runtime-bridge.js?v=10.5.4-beta.55'],
 ['beta55-restaurant-closure-ui','beta55-restaurant-closure-ui.js?v=10.5.4-beta.58.33'],
 ['beta55-navigation-parity','beta55-navigation-parity.js?v=10.5.4-beta.58.33'],
 ['beta55-delivery-settlement-shift-cash','beta55-delivery-settlement-shift-cash.js?v=10.5.4-beta.58.33'],
 ['permissions-v2-order-fulfillment-routing','permissions-v2-order-fulfillment-routing.js?v=10.5.4-beta.58.29'],
 ['permissions-v2-order-driver-assignment-routing','permissions-v2-order-driver-assignment-routing.js?v=10.5.4-beta.58.29'],
 ['beta55-print-order-type','beta55-print-order-type.js?v=10.5.4-beta.58.33'],
 ['owner-acceptance-beta55-navigation','owner-acceptance-beta55-navigation-v55.js?v=10.5.4-beta.58.33'],
 ['printing-v2','printing-v2.js?v=10.5.4-beta.58.33'],
 ['landed-cost-v1','landed-cost-posting-v1.js?v=10.5.4-beta.58.33'],
 ['orders-v2','commerce-orders-v2-ui.js?v=10.5.4-beta.58.33'],
 ['reports-v2','reports-v2-ui.js?v=10.5.4-beta.58.33'],
 ['finance-b2b','finance-b2b-ui.js?v=10.5.4-beta.58.33'],
 ['service-v1','service-v1-ui.js?v=10.5.4-beta.58.33'],
 ['warehouse-v1','warehouse-v1-ui.js?v=10.5.4-beta.58.33'],
 ['membership-v1','membership-v1-ui.js?v=10.5.4-beta.58.33'],
 ['logistics-v1','logistics-v1-ui.js?v=10.5.4-beta.58.33'],
 ['beta47-performance-sync-hotfix','beta47-performance-sync-hotfix.js?v=10.5.4-beta.58.33'],
 ['beta49-takeover-activation-safety','beta49-takeover-activation-safety.js?v=10.5.4-beta.58.33'],
 ['beta51-final-offline-acceptance-fix','beta51-final-offline-acceptance-fix.js?v=10.5.4-beta.58.33'],
 ['beta55-4-runtime-recovery','beta55-4-runtime-recovery.js?v=10.5.4-beta.58.33'],
 ['beta55-5-runtime-hardening','beta55-5-runtime-hardening.js?v=10.5.4-beta.58.33'],
 ['owner-acceptance-lazy-v47','owner-acceptance-lazy-loader-v47.js?v=10.5.4-beta.58.33']
];
function load(key,src){return new Promise((resolve,reject)=>{if(document.querySelector(`script[data-beta36-${key}]`))return resolve();const s=document.createElement('script');s.src=src;s.async=false;s.setAttribute(`data-beta36-${key}`,'1');s.onload=()=>resolve();s.onerror=()=>reject(new Error(`Beta55.5 failed to load ${src}`));document.head.appendChild(s)})}
function ready(){return typeof global.rpc==='function'&&typeof global.rest==='function'&&global.SharawlaRuntimeCore}
async function loadAll(){
 for(const [k,s] of FILES)await load(k,s);
 global.__SharawlaBeta36Integration=Object.freeze({version:VERSION,files:FILES.map(x=>x[1]),loaded:true,ownerAcceptance:'lazy',takeoverSafety:'explicit-owner-only',beta51FinalOfflineAcceptanceFix:true,beta554RuntimeRecovery:true,beta555RuntimeHardening:true,sharedBusinessCoreV1:true,beta54SharedCoreUI:true,purchasingAttachmentsV1:true,beta55UiWorkflowFixes:true,beta55UiHardening:true,beta55CentralWarehouse:true,beta55CentralWarehouseV2:true,beta55EmergencyPermissionHardening:true,foodRecipeRuntimeV1:true,beta55RestaurantClosureUI:true,beta55NavigationParity:true,beta55DeliverySettlementShiftCash:true,beta55PrintOrderType:true,beta55NavigationAcceptance:true});
 for(const name of ['sharawla-beta36-integrations-ready','sharawla-beta37-integrations-ready','sharawla-beta38-integrations-ready','sharawla-beta39-integrations-ready','sharawla-beta47-integrations-ready','sharawla-beta48-integrations-ready','sharawla-beta49-integrations-ready','sharawla-beta51-integrations-ready','sharawla-beta54-integrations-ready','sharawla-beta55-integrations-ready','sharawla-beta55-4-integrations-ready','sharawla-beta55-5-integrations-ready'])global.dispatchEvent(new CustomEvent(name));
}
function start(){let tries=0;const t=setInterval(()=>{tries++;if(ready()){clearInterval(t);loadAll().catch(e=>console.error(e));return}if(tries>=100){clearInterval(t);console.error('Beta55.5 integration loader: app runtime not ready')}},50)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
