// Top Chicken Beta staff only: refresh leases with the already-authenticated
// Beta JWT and signed Central proof; never grant from client flags.
const BUSINESS='5358328c-9724-49aa-affc-1bce8be90f92';
const CODES=Object.freeze(['core.auth','core.users','core.permissions','commerce.delivery','inventory.suppliers']);
export async function ensureStaffLease({url='',anon='',bearer='',now=Date.now(),fetcher=fetch}={}){
 const host='https://xihcxydjnzemflhedzor.supabase.co';
 if(url!==host||typeof anon!=='string'||anon.length<10||
    typeof bearer!=='string'||bearer.length<25||bearer.length>5000)
   return {ok:false,code:'TC_STAFF_SYNC_SCOPE_INVALID',status:403};
 let reply;
 try{
   reply=await fetcher(host+'/functions/v1/top-chicken-commercial-sync',{
     method:'POST',headers:{apikey:anon,Authorization:'Bearer '+bearer,
       'Content-Type':'application/json'},
     body:'{}',cache:'no-store',signal:AbortSignal.timeout(10000)
   });
 }catch{return {ok:false,code:'TC_STAFF_SYNC_UNAVAILABLE',status:503}}
 if(!reply?.ok)
   return {ok:false,code:reply?.status===401||reply?.status===403
     ?'TC_STAFF_SYNC_AUTH_DENIED':'TC_STAFF_SYNC_UNAVAILABLE',
     status:reply?.status===401||reply?.status===403?403:503};
 let proof;
 try{proof=await reply.json()}catch{return {ok:false,code:'TC_STAFF_SYNC_INVALID_REPLY',status:503}}
 if(proof?.ok!==true||proof.business_id!==BUSINESS||
    typeof proof.receipt_id!=='string'||!Array.isArray(proof.features)||
    proof.features.length!==CODES.length)
   return {ok:false,code:'TC_STAFF_SYNC_INVALID_PROOF',status:503};
 const seen=new Set();
 for(const feature of proof.features){
   if(!feature||!CODES.includes(feature.code)||seen.has(feature.code)||
      feature.enabled!==true||typeof feature.valid_until!=='string')
     return {ok:false,code:'TC_STAFF_SYNC_NOT_ENTITLED',status:403};
   seen.add(feature.code);
   const ttl=Date.parse(feature.valid_until)-now;
   if(!Number.isFinite(ttl)||ttl<=12000||ttl>120000)
     return {ok:false,code:'TC_STAFF_SYNC_STALE_LEASE',status:503};
 }
 if(seen.size!==CODES.length)return {ok:false,code:'TC_STAFF_SYNC_INVALID_PROOF',status:503};
 return {ok:true,status:200,receipt_id:proof.receipt_id};
}
