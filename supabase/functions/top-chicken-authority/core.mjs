// Cloud-side read-only endpoint. Requests have no business/device selector; only TC can be read.
import {requirements,assertTCChannelSecret,TC} from '../top-chicken-staff/cloud-authority.mjs';
export function authorityHandler({readSnapshot,secret,clock=()=>new Date()}){
 assertTCChannelSecret(secret);
 return async req=>{
  const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  if(req.method!=='POST')return respond({ok:false},405);
  try{
   const body=await req.text(),sig=req.headers.get('x-tc-authority-signature')||'';
   if(!/^[a-f0-9]{64}$/i.test(sig)||body.length>2048)return respond({ok:false},403);
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
   const signature=new Uint8Array(sig.match(/../g).map(s=>parseInt(s,16)));
   if(!await crypto.subtle.verify('HMAC',key,signature,new TextEncoder().encode(body)))return respond({ok:false},403);
   const p=JSON.parse(body);if(typeof p.nonce!=='string'||!/^[-a-f0-9]{36}$/i.test(p.nonce)||!Number.isFinite(Date.parse(p.issued_at))||Math.abs(clock().getTime()-Date.parse(p.issued_at))>5000||p.business_id!==undefined||p.device_id!==undefined)return respond({ok:false},403);
   const params={p_new_status:p.new_status};requirements(p.rpc,params);
   const snapshot=await readSnapshot(p.rpc,params);if(snapshot.business_id!==TC)return respond({ok:false},503);
   return respond({ok:true,nonce:p.nonce,rpc:p.rpc,snapshot});
  }catch{return respond({ok:false},503);}
 };
}
