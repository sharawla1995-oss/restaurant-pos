(function(global){
'use strict';
const VERSION='food-recipe-runtime-v1.1';
const FEATURE='food.recipes';
let wrapped=false,bootTimer=null;
function cfg(){try{return JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'{}')||{}}catch{return {}}}
function operational(){const c=cfg();return (Array.isArray(c.enabled_features)?c.enabled_features:[]).map(x=>String(x||'').trim().toLowerCase()).includes(FEATURE)}
function variants(){try{return Array.isArray(state?.productVariants)?state.productVariants:[]}catch{return []}}
function variantById(id){return variants().find(v=>String(v.id)===String(id))||null}
function enrich(items){
 const out=(Array.isArray(items)?items:[]).map(x=>({...x}));
 if(!operational())return out;
 let cart=[];try{cart=Array.isArray(state?.cart)?state.cart:[]}catch{}
 for(let i=0;i<out.length;i++){
   const c=cart[i];if(!c||String(c.product_id)!==String(out[i].product_id))continue;
   if(c.variant_id&&!out[i].variant_id)out[i].variant_id=Number(c.variant_id);
   if(c.variant_name&&!out[i].variant_name)out[i].variant_name=c.variant_name;
   out[i].removed=Array.isArray(c.removed)?c.removed.map(String):[];
   if(!Array.isArray(out[i].modifiers))out[i].modifiers=Array.isArray(c.modifiers)?c.modifiers.map(m=>({id:m.id,name:m.name,price:Number(m.price||0)})):[];
   const v=c.variant_id?variantById(c.variant_id):null;
   if(v&&v.cost!==null&&v.cost!==undefined&&Number.isFinite(Number(v.cost)))out[i].cost=Number(v.cost);
 }
 return out;
}
function boot(){
 if(wrapped)return;
 if(typeof global.rpc!=='function'||typeof global.saveOfflineSale!=='function'){
   clearTimeout(bootTimer);bootTimer=setTimeout(boot,80);return;
 }
 const baseRpc=global.rpc.bind(global),baseOffline=global.saveOfflineSale.bind(global);
 global.rpc=async function(name,payload={}){
   if(!operational())return baseRpc(name,payload);
   if(name==='create_pos_order_atomic')return baseRpc('create_food_pos_order_atomic_v1',{...payload,p_items:enrich(payload?.p_items)});
   if(name==='create_order_return_idempotent')return baseRpc('create_food_order_return_idempotent_v1',payload);
   return baseRpc(name,payload);
 };
 global.saveOfflineSale=async function(orderPayload,itemPayload,payRows,clientTx){
   if(!operational())return baseOffline(orderPayload,itemPayload,payRows,clientTx);
   return baseOffline(orderPayload,enrich(itemPayload),payRows,clientTx);
 };
 wrapped=true;
 global.__SharawlaFoodRecipeRuntimeV1=Object.freeze({version:VERSION,feature:FEATURE,operational,enrich});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
