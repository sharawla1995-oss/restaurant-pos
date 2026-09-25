(function(global){
'use strict';

// PV2-F1 SOURCE CANDIDATE ONLY.
// Runtime bridge: prefer the V2 owner; fall back only when that RPC is absent during the coordinated Beta transition.
const VERSION='pv2-f1-customers-create-source';

async function rpc(name,payload){
  if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
  return global.rpc(name,payload);
}

function missingOwner(err){return /PGRST202|could not find the function|404/i.test(String(err?.message||err||''))}
async function rest(table,query,options){if(typeof global.rest!=='function')throw new Error('REST غير جاهز');return global.rest(table,query,options)}
function clean(v){const s=String(v??'').trim();return s||null}
function tx(){return global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function offline(){return global.navigator?.onLine===false}

async function createCustomer(input={}){
  const name=clean(input.name);
  const phone=clean(input.phone);
  if(!name)throw new Error('اسم العميل مطلوب');
  if(!phone)throw new Error('رقم الموبايل مطلوب');

  let id;
  if(offline()){
    const clientTx=tx();
    return global.SharawlaOfflineV2Transport.commitRpc('offline_customer_create_v1',{p_name:name,p_phone:phone,p_area:clean(input.area),p_address:clean(input.address),p_notes:clean(input.notes),p_client_tx_id:clientTx});
  }
  try{
    id=await rpc('customer_create_v2',{
      p_name:name,
      p_phone:phone,
      p_area:clean(input.area),
      p_address:clean(input.address),
      p_notes:clean(input.notes)
    });
  }catch(err){
    if(!missingOwner(err))throw err;
    const rows=await rest('customers','select=id',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify([{name,phone,area:clean(input.area),address:clean(input.address),notes:clean(input.notes)}])});
    id=rows?.[0]?.id;
  }

  const n=Number(id);
  if(!Number.isFinite(n)||n<=0)throw new Error('تعذر قراءة رقم العميل بعد الحفظ');
  return n;
}

async function createManyCustomers(rows=[]){
  const ids=[];
  for(const row of (Array.isArray(rows)?rows:[]))ids.push(await createCustomer(row));
  return ids;
}

global.__SharawlaPV2CustomerCreate=Object.freeze({
  version:VERSION,
  createCustomer,
  createManyCustomers
});
})(window);
