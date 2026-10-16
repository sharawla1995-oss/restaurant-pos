// SOURCE CANDIDATE — NO DEPLOY / NO HOSTED PASS.
// Beta xihcxydjnzemflhedzor only. Central Admin JWT validated in Central; Beta operator JWT validated in Beta.\n// verify_jwt=false at gateway; both paths validate authentication inside Edge.
// Dedicated HMAC proof from Central; NO Central service key in Beta, no browser-supplied grant.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import {BUSINESS,buildTopChickenCentralLease} from '../top-chicken-entitlement-bridge/central-decision.mjs';
import {requireBridgeKey,verifyBody,signBody,withinSeconds} from '../top-chicken-entitlement-bridge/hmac.mjs';
const BETA='https://xihcxydjnzemflhedzor.supabase.co';
const CENTRAL='https://ikppryeavoabnugcijeq.supabase.co/functions/v1/top-chicken-commercial-proof';
const CENTRAL_PUBLIC_KEY='sb_publishable_Lv-eHHXQnWGy-g0rrc2x3w_daXKN2LI';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const secret=Deno.env.get('TC_BRIDGE_HMAC_KEY')??'';
if(Deno.env.get('SUPABASE_URL')!==BETA||!service)throw Error('WRONG_BETA_PROJECT');
requireBridgeKey(secret);
const admin=createClient(BETA,service,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, content-type, apikey'};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return response({ok:false,error:'METHOD_NOT_ALLOWED'},405);
 try{
  if((Number(req.headers.get('content-length')||0))>2048)return response({ok:false,error:'BAD_INPUT'},400);
  const raw=await req.text();
  if(raw.length>2048||raw.trim()!=='{}')return response({ok:false,error:'BODY_MUST_BE_EMPTY_OBJECT'},400);
  const bearer=req.headers.get('authorization')||'';
  if(!/^Bearer [^\s]+$/.test(bearer))return response({ok:false,error:'UNAUTHORIZED'},401);
  // Cross-project JWTs are not interchangeable. Beta users may refresh only
  // their own verified branch-22 tenant leases. Central admins use the existing
  // separately authenticated control-plane mode.
  const identity=await admin.auth.getUser(bearer.slice(7));
  let mode:'beta_operator'|'central_admin'='central_admin';
  let beta_actor_id:string|undefined;
  if(!identity.error&&UUID.test(identity.data.user?.id||'')){
    const uid=identity.data.user!.id;
    const [employee,membership,branch]=await Promise.all([
      admin.from('employees').select('id').eq('auth_user_id',uid).eq('business_id',BUSINESS).eq('branch_id',22).eq('active',true).maybeSingle(),
      admin.from('business_auth_memberships').select('auth_user_id').eq('auth_user_id',uid).eq('business_id',BUSINESS).eq('active',true).maybeSingle(),
      admin.from('branches').select('id').eq('id',22).eq('business_id',BUSINESS).eq('active',true).maybeSingle()
    ]);
    if(employee.error||membership.error||branch.error||!employee.data||!membership.data||!branch.data)
      return response({ok:false,error:'TC_BRANCH22_MEMBER_REQUIRED'},403);
    mode='beta_operator';beta_actor_id=uid;
  }
  const nonce=crypto.randomUUID(),issued_at=new Date().toISOString();
  const requestBody=JSON.stringify({business_id:BUSINESS,nonce,issued_at,mode,...(beta_actor_id?{beta_actor_id}:{})});
  const proof=await fetch(CENTRAL,{method:'POST',headers:{'Content-Type':'application/json','x-tc-request-signature':await signBody(secret,requestBody),apikey:CENTRAL_PUBLIC_KEY,...(mode==='central_admin'?{authorization:bearer}:{})},
    body:requestBody,signal:AbortSignal.timeout(7000)});
  if(!proof.ok)return response({ok:false,error:'CENTRAL_PROOF_UNAVAILABLE'},503);
  const text=await proof.text();
  if(!await verifyBody(secret,text,proof.headers.get('x-tc-proof-signature')))
   return response({ok:false,error:'CENTRAL_PROOF_SIGNATURE_INVALID'},503);
  const snapshot=JSON.parse(text);
  if(snapshot.nonce!==nonce||snapshot.business_id!==BUSINESS||snapshot.mode!==mode||!UUID.test(snapshot.actor_user_id||'')||
     (beta_actor_id&&snapshot.actor_user_id!==beta_actor_id)||
     !withinSeconds(snapshot.observed_at,new Date(),5))return response({ok:false,error:'CENTRAL_PROOF_SCOPE_INVALID'},503);
  const plan=buildTopChickenCentralLease(snapshot,{now:new Date()});
  const written=await admin.rpc('top_chicken_commit_entitlement_lease_v1',{
    p_actor_auth_user_id:snapshot.actor_user_id,p_nonce:nonce,p_observed_at:plan.observed_at,
    p_proof_digest:await digest(text),p_rows:plan.rows
  });
  if(written.error||written.data?.ok!==true)return response({ok:false,error:'BETA_ENTITLEMENT_COMMIT_DENIED'},503);
  return response({ok:true,receipt_id:nonce,business_id:BUSINESS,
    features:plan.rows.map(r=>({code:r.feature_code,enabled:r.enabled,valid_until:r.valid_until}))});
 }catch{return response({ok:false,error:'TC_SYNC_FAILED_CLOSED'},503)}
});
