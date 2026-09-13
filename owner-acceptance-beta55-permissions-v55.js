(function(global){
'use strict';
const VERSION='10.5.4-beta.55';
const R=()=>global.__SharawlaAcceptanceRegistry;
const CODES=[
 'inventory.supply.request.emergency',
 'inventory.supply.stock.exact',
 'inventory.supply.shortages.view',
 'inventory.supply.shortages.create'
];
async function permissionBoundaryContract(){
 if(!global.__SharawlaBeta55EmergencyPermissionHardening)throw new Error('Beta55 emergency permission UI hardening is not loaded');
 if(typeof global.rest!=='function'||typeof global.rpc!=='function')throw new Error('Runtime REST/RPC unavailable');
 const rows=await global.rest('permission_actions_v2',`select=code,legacy_permission,active&code=in.(${CODES.join(',')})&order=code`);
 const map=new Map((rows||[]).map(x=>[String(x.code),x]));
 for(const code of CODES){
   const row=map.get(code);
   if(!row)throw new Error(`Sensitive warehouse action missing: ${code}`);
   if(row.active!==true)throw new Error(`Sensitive warehouse action inactive: ${code}`);
   if(row.legacy_permission!==null&&row.legacy_permission!==undefined)throw new Error(`Sensitive warehouse action still inherits legacy permission: ${code} -> ${row.legacy_permission}`);
 }
 global.__SharawlaBeta55EmergencyPermissionHardening.reconcile?.();
 return {status:'PASS',detail:'Emergency / exact source stock / shortages view+create require explicit Action Permission V2 grants',evidence:{explicit_only:CODES}};
}
function register(){
 const reg=R();if(!reg||global.__SharawlaBeta55PermissionsAcceptanceRegistered)return false;
 global.__SharawlaBeta55PermissionsAcceptanceRegistered=true;
 reg.registerMany([{id:'beta55.permission-boundary-contract',name:'Warehouse sensitive action permission boundaries',pack:'beta55',profile:'retail',level:'full',mode:'readonly',critical:true,features:['inventory.multi_warehouse'],run:permissionBoundaryContract}]);
 return true;
}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
global.__SharawlaBeta55PermissionsAcceptanceV55=Object.freeze({version:VERSION,register});
})(window);
