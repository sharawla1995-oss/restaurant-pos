// SOURCE CANDIDATE — DO NOT DEPLOY without independent Central Edge approval.
// Must deploy to Central ikppryeavoabnugcijeq ONLY with verify_jwt=false.
// HMAC-verified server-to-server only; never accept a browser / arbitrary tenant.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import {BUSINESS,CODES} from '../top-chicken-entitlement-bridge/central-decision.mjs';
import {requireBridgeKey,verifyBody,signBody,withinSeconds} from '../top-chicken-entitlement-bridge/hmac.mjs';
const U='https://ikppryeavoabnugcijeq.supabase.co';
const key=Deno.env.get('TC_BRIDGE_HMAC_KEY')??'';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
if(Deno.env.get('SUPABASE_URL')!==U||!service)throw Error('WRONG_CENTRAL_PROJECT');
requireBridgeKey(key);
const cloud=createClient(U,service,{auth:{persistSession:false,autoRefreshToken:false}});
const json=(body:unknown,code=200,signature?:string)=>new Response(JSON.stringify(body),{status:code,headers:{'content-type':'application/json','cache-control':'no-store',...(signature?{'x-tc-proof-signature':signature}:{})}});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 try{
  const raw=await req.text();
  if(raw.length>1024||!await verifyBody(key,raw,req.headers.get('x-tc-request-signature')))return json({error:'UNAUTHORIZED'},403);
  const body=JSON.parse(raw);
  if(body?.business_id!==BUSINESS||!UUID.test(body?.nonce??'')||
     !withinSeconds(body?.issued_at,new Date(),5)||
     Object.keys(body).sort().join(',')!=='business_id,issued_at,nonce')return json({error:'PROOF_REQUEST_INVALID'},403);
  const observed_at=new Date().toISOString();
  const data:Record<string,unknown>={};
  for(const code of CODES){
   const r=await cloud.rpc('resolve_sharawla_commercial_entitlement_cloud_v1',
     {p_business_id:BUSINESS,p_feature_code:code,p_at_time:observed_at});
   if(r.error||!r.data||Array.isArray(r.data))throw Error('CENTRAL_UNAVAILABLE');
   data[code]=r.data;
  }
  const responseBody=JSON.stringify({business_id:BUSINESS,observed_at,nonce:body.nonce,decisions:data});
  const signature=await signBody(key,responseBody);
  return new Response(responseBody,{status:200,headers:{'content-type':'application/json','cache-control':'no-store','x-tc-proof-signature':signature}});
 }catch{return json({error:'CENTRAL_PROOF_UNAVAILABLE'},503)}
});
