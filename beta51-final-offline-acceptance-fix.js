(function(global){
'use strict';
const VERSION='10.5.4-beta.51';
const READY_STATES=new Set(['pending','retryable','syncing','blocked','synced']);
const text=v=>String(v??'').trim();
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
let installed=false,tries=0,originalSaveOfflineSale=null;
async function takeoverActive(){
  try{
    const s=await global.topBurgerDesktop?.offlineV2?.takeoverState?.();
    return s?.active===true&&s?.migration_verified===true&&s?.transport_ready===true;
  }catch{return false}
}
function localSaleResult(orderPayload,itemPayload,tx,row){
  const localId=`offline-${tx}`,created=row?.created_local_at||new Date().toISOString(),code=`OFF-${tx.slice(0,8)}`;
  const order={...(clone(orderPayload)||{}),id:localId,client_tx_id:tx,invoice_number:code,bon_number:code,created_at:created,payment_status:'confirmed',_offline:true};
  const items=(itemPayload||[]).map((x,i)=>({...clone(x),id:`${localId}-i${i+1}`,order_id:localId}));
  return {order,items,client_tx_id:tx};
}
async function saveOfflineSale51(orderPayload,itemPayload,payRows,providedClientTx=null){
  const tx=text(providedClientTx||orderPayload?.client_tx_id);
  if(tx&&await takeoverActive()){
    const row=await global.topBurgerDesktop?.offlineV2?.event?.(tx).catch(()=>null);
    if(row&&row.operation_type==='sale'&&READY_STATES.has(text(row.status))){
      return localSaleResult(orderPayload,itemPayload,tx,row);
    }
  }
  return originalSaveOfflineSale(orderPayload,itemPayload,payRows,providedClientTx);
}
function install(){
  if(installed)return true;
  const f=global.saveOfflineSale;
  if(typeof f!=='function'||!global.topBurgerDesktop?.offlineV2?.event){
    if(++tries<30)setTimeout(install,80);
    return false;
  }
  originalSaveOfflineSale=f;
  global.saveOfflineSale=saveOfflineSale51;
  try{saveOfflineSale=saveOfflineSale51}catch{}
  installed=true;
  global.__SharawlaBeta51FinalOfflineAcceptanceFix=Object.freeze({version:VERSION,installed:true});
  global.dispatchEvent(new CustomEvent('sharawla-beta51-final-offline-acceptance-ready',{detail:{version:VERSION}}));
  return true;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);
