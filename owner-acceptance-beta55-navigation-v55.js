(function(global){
'use strict';
const VERSION='10.5.4-beta.55';
const R=()=>global.__SharawlaAcceptanceRegistry;
function cfg(){try{return JSON.parse(localStorage.getItem('sharawlaRuntimeConfigV1')||'{}')||{}}catch{return {}}}
async function navigationParity(){
 const profile=String(cfg().pos_profile||'').trim().toLowerCase();
 if(profile!=='restaurant')throw new Error(`Restaurant profile required, current=${profile||'none'}`);
 const parity=global.__SharawlaBeta55NavigationParity;
 if(!parity||typeof parity.contractAudit!=='function')throw new Error('Beta55 navigation parity runtime is not loaded');
 const contract=parity.contractAudit();
 if(contract?.ok!==true)throw new Error(`Navigation registry contract mismatch: ${JSON.stringify(contract)}`);
 const sync=parity.syncHomeCards?.();
 const dom=parity.audit?.();
 if(dom?.home_present&&dom?.ok!==true)throw new Error(`Sidebar/Home navigation mismatch: ${JSON.stringify(dom)}`);
 const required=['page:foodIngredients','page:foodRecipes','page:foodOperations','page:tables'];
 const registry=parity.registry||{};
 const missing=required.filter(k=>!registry[k]);
 if(missing.length)throw new Error(`Restaurant navigation metadata missing: ${missing.join(', ')}`);
 return {status:'PASS',detail:'Sidebar and Dashboard use one Beta55 navigation model; Restaurant pages, HR group and shared dynamic entries are parity-gated',evidence:{profile,top_level_keys:contract.keys,missing_metadata:contract.missing_metadata,home_present:!!dom?.home_present,home_order_match:dom?.home_present?dom.order_match:null,sync_skipped:!!sync?.skipped}};
}
function register(){
 const reg=R();if(!reg||global.__SharawlaBeta55NavigationAcceptanceRegistered)return false;
 global.__SharawlaBeta55NavigationAcceptanceRegistered=true;
 reg.registerMany([{id:'beta55.restaurant-navigation-parity',name:'Restaurant Sidebar ↔ Dashboard navigation parity',pack:'beta55-restaurant',profile:'restaurant',level:'quick',mode:'readonly',critical:true,run:navigationParity}]);
 return true;
}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
global.__SharawlaBeta55NavigationAcceptanceV55=Object.freeze({version:VERSION,register,navigationParity});
})(window);
