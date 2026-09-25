(function(global){
'use strict';

// PV2-F1 SOURCE CANDIDATE ONLY.
// Do not wire until customer_create_v2 presence and direct-INSERT hardening are
// deployed together in the isolated Beta authorization window.
const VERSION='pv2-f1-customers-create-source';

async function rpc(name,payload){
  if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');
  return global.rpc(name,payload);
}

function clean(v){const s=String(v??'').trim();return s||null}

async function createCustomer(input={}){
  const name=clean(input.name);
  const phone=clean(input.phone);
  if(!name)throw new Error('اسم العميل مطلوب');
  if(!phone)throw new Error('رقم الموبايل مطلوب');

  const id=await rpc('customer_create_v2',{
    p_name:name,
    p_phone:phone,
    p_area:clean(input.area),
    p_address:clean(input.address),
    p_notes:clean(input.notes)
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
  version:VERSION,
  createCustomer,
  createManyCustomers
});
})(window);
