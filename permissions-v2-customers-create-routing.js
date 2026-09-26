(function(global){
'use strict';

// RC1 practical customer-create routing.
// Desktop uses the accepted Offline V2 owner as a local-first durable path.
// Browser/non-V2 runtime keeps the accepted online customer_create_v2 owner.
const VERSION='pv2-f1-customers-create-rc1-practical';

async function rpc(name,payload){
  if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
  return global.rpc(name,payload);
}
function clean(v){const s=String(v??'').trim();return s||null}
function tx(){return global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function normalizePhone(v){
  const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
  let x=String(v??'').replace(/[٠-٩]/g,c=>String(ar.indexOf(c))).replace(/[۰-۹]/g,c=>String(fa.indexOf(c))).replace(/\D/g,'');
  if(x.startsWith('0020'))x=x.slice(4);
  else if(x.startsWith('20')&&x.length>=12)x=x.slice(2);
  if(x.length===10&&x.startsWith('1'))x='0'+x;
  return x||null;
}
function validatedCustomerInput(input={}){
  const name=clean(input.name);
  if(!name)throw new Error('اسم العميل مطلوب');
  const rawPhone=clean(input.phone),phone=rawPhone?normalizePhone(rawPhone):null;
  if(rawPhone&&!/^01[0125][0-9]{8}$/.test(phone||''))throw new Error('رقم الموبايل غير صحيح');
  return {name,phone,area:clean(input.area),address:clean(input.address),notes:clean(input.notes)};
}
function durablePendingStatus(v){return ['pending','retryable','syncing'].includes(String(v||''))}
function deferredLike(e){
  const m=String(e?.message||e||'').toLowerCase();
  return durablePendingStatus(e?.offline_v2_status)||m.includes('failed to fetch')||m.includes('network')||m.includes('offline')||m.includes('deferred');
}
async function commitLocalFirst(data){
  const transport=global.SharawlaOfflineV2Transport;
  if(typeof transport?.commitRpc!=='function')throw new Error('Offline V2 غير جاهز');
  const clientTx=tx();
  const payload={p_name:data.name,p_phone:data.phone,p_area:data.area,p_address:data.address,p_notes:data.notes,p_client_tx_id:clientTx};
  try{
    return await transport.commitRpc('offline_customer_create_v1',payload);
  }catch(e){
    if(!deferredLike(e))throw e;
    const row=await global.topBurgerDesktop?.offlineV2?.event?.(clientTx);
    if(!row||row.operation_type!=='customer_create'||!durablePendingStatus(row.status))throw e;
    return {
      offline:true,durable:true,client_tx_id:clientTx,
      local_id:row.local_entity_id||`offline-customer_create-${clientTx}`,
      status:String(row.status),
      customer:{name:data.name,phone:data.phone,area:data.area,address:data.address,notes:data.notes}
    };
  }
}
async function createCustomer(input={}){
  // Validation is intentionally before tx()/durable allocation.
  const data=validatedCustomerInput(input);
  if(global.topBurgerDesktop?.isDesktop&&typeof global.SharawlaOfflineV2Transport?.commitRpc==='function'){
    return commitLocalFirst(data);
  }
  const id=await rpc('customer_create_v2',{
    p_name:data.name,p_phone:data.phone,p_area:data.area,p_address:data.address,p_notes:data.notes
  });
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
  version:VERSION,createCustomer,createManyCustomers,normalizePhone,validatedCustomerInput
});
})(window);
