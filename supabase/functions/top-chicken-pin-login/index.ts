// SOURCE ONLY. Deploy to Top Chicken Beta exclusively after independent
// review of secret and rate-limited SQL ownership. verify_jwt=false intentionally:
// the user must obtain a session with username+PIN, not already own a JWT.
import {pinUsername,pin4,syntheticEmail,internalPassword,PIN_BUSINESS} from '../top-chicken-staff/pin-login-domain.mjs';
import {ensureStaffLease} from '../top-chicken-staff/entitlement-preflight.mjs';
const cors={
 'access-control-allow-origin':'*',
 'access-control-allow-headers':'content-type,apikey,authorization',
 'access-control-allow-methods':'POST,OPTIONS'
};
function result(status:number,body:unknown){
 return new Response(JSON.stringify(body),{status,
  headers:{...cors,'content-type':'application/json','cache-control':'no-store'}});
}
const config=()=>({
 url:String(Deno.env.get('SUPABASE_URL')||'').replace(/\/$/,''),
 anon:String(Deno.env.get('SUPABASE_ANON_KEY')||''),
 service:String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''),
 secret:String(Deno.env.get('TOP_CHICKEN_STAFF_PIN_SECRET')||'')
});
async function requestJson(url:string,key:string,method:string,body:unknown){
 const r=await fetch(url,{method,headers:{
  'apikey':key,'authorization':'Bearer '+key,'content-type':'application/json'},
  body:JSON.stringify(body),signal:AbortSignal.timeout(12000)
 });
 const data=await r.json().catch(()=>null);
 return {ok:r.ok,data,status:r.status};
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return result(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
 const env=config();
 if(env.url!=='https://xihcxydjnzemflhedzor.supabase.co'||!env.anon||!env.service||env.secret.length<32)
  return result(503,{ok:false,code:'STAFF_PIN_BACKEND_UNCONFIGURED'});
 const body=await req.json().catch(()=>null);
 let handle:string,pin:string;
 try{handle=pinUsername(body?.username);pin=pin4(body?.pin)}
 catch{return result(422,{ok:false,code:'INVALID_LOGIN_INPUT'})}
 const generic={ok:false,code:'INVALID_STAFF_CREDENTIALS'};
 // Admission is transactional, enforces an account-level lockout, employee
 // membership and the 3 live Top Chicken core operational entitlements.
 let gate;
 try{gate=await requestJson(env.url+'/rest/v1/rpc/top_chicken_pin_login_attempt_v1',
   env.service,'POST',{p_username:handle})}
 catch{return result(503,{ok:false,code:'STAFF_PIN_BACKEND_UNAVAILABLE'})}
 if(!gate.ok)return result(503,{ok:false,code:'STAFF_PIN_GATE_UNAVAILABLE'});
 if(gate.data?.allowed!==true)return result(401,generic);
 const pwd=await internalPassword(handle,pin,env.secret);
 let signed;
 try{signed=await requestJson(env.url+'/auth/v1/token?grant_type=password',
   env.anon,'POST',{email:syntheticEmail(handle),password:pwd})}
 catch{return result(503,{ok:false,code:'STAFF_AUTH_UNAVAILABLE'})}
 if(!signed.ok)return result(401,generic);
 const session=signed.data;
 const uid=String(session?.user?.id||'');
 if(!/^[0-9a-f-]{36}$/i.test(uid)||!session?.access_token||!session?.refresh_token)
  return result(503,{ok:false,code:'STAFF_SESSION_INVALID'});
 // Only after a correct PIN has been verified by Supabase Auth, use this real
 // Beta Auth JWT to refresh the 60-second signed Central entitlement lease.
 // No anonymous sync and no broad exemption to post-auth SQL permission checks.
 const commercial=await ensureStaffLease({
  url:env.url,anon:env.anon,bearer:String(session.access_token)
 });
 if(commercial.ok!==true)
  return result(commercial.status,{ok:false,code:commercial.code});
 let completed;
 try{completed=await requestJson(env.url+'/rest/v1/rpc/top_chicken_pin_login_success_v1',
  env.service,'POST',{p_username:handle,p_auth_user_id:uid})}
 catch{return result(503,{ok:false,code:'STAFF_SESSION_COMMIT_UNAVAILABLE'})}
 if(!completed.ok||completed.data!==true)
  return result(403,{ok:false,code:'STAFF_SESSION_NOT_AUTHORIZED'});
 return result(200,{ok:true,session:{
  access_token:session.access_token,token_type:session.token_type||'bearer',
  expires_in:session.expires_in,expires_at:session.expires_at,
  refresh_token:session.refresh_token,user:session.user},business_id:PIN_BUSINESS});
});
