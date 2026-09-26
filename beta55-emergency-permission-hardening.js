(function(global){
'use strict';
const VERSION='10.5.4-beta.58.32';
const ACTION='inventory.supply.request.emergency';
let observer=null,queued=false;
const rpc=(n,p={})=>global.rpc(n,p);
async function allowed(){try{return (await rpc('has_action_permission_v2',{p_action_code:ACTION}))===true}catch{return false}}
async function myRoutes(){try{const rows=await rpc('inventory_supply_my_routes_v1');return Array.isArray(rows)?rows:[]}catch{return []}}
function setEmergencyOption(select,show){
 if(!select)return;
 let opt=select.querySelector('option[value="emergency"]');
 if(show){
   if(!opt){opt=document.createElement('option');opt.value='emergency';opt.textContent='🚨 عاجل';select.appendChild(opt)}
 }else{
   if(opt)opt.remove();
   if(select.value==='emergency')select.value='normal';
 }
}
async function reconcileModal(modal){
 if(!modal?.isConnected)return false;
 const type=modal.querySelector('[data-v2-type]'),route=modal.querySelector('[data-v2-route]');
 if(!type||!route)return false;
 const [canEmergency,routes]=await Promise.all([allowed(),myRoutes()]);
 if(!modal.isConnected)return false;
 const sync=()=>{
   const selected=routes.find(r=>String(r.route_id)===String(route.value));
   setEmergencyOption(type,canEmergency&&selected?.allow_emergency===true);
 };
 sync();
 if(route.dataset.b55EmergencyHardened!=='1'){
   route.dataset.b55EmergencyHardened='1';
   route.addEventListener('change',sync);
 }
 modal.dataset.beta55EmergencyPermissionHardened='1';
 return true;
}
function scan(){
 document.querySelectorAll('.b55v2-modal').forEach(m=>{
   if(m.querySelector('[data-v2-type]'))reconcileModal(m).catch(()=>setEmergencyOption(m.querySelector('[data-v2-type]'),false));
 });
}
function queue(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;scan()})}
function start(){
 scan();
 observer=new MutationObserver(queue);observer.observe(document.body,{childList:true,subtree:true});
 document.addEventListener('focusin',e=>{const type=e.target?.closest?.('[data-v2-type]');if(type)reconcileModal(type.closest('.b55v2-modal')).catch(()=>setEmergencyOption(type,false))},true);
 global.__SharawlaBeta55EmergencyPermissionHardening=Object.freeze({version:VERSION,action:ACTION,reconcile:scan});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
