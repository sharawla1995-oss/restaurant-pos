// SOURCE-ONLY: a dedicated Top Chicken SH-0008 staff-creation service.
// DO NOT DEPLOY without independent Edge + reviewed SQL + Cloud entitlement
// approvals and isolated recovery evidence. No shared smart-function updates.
import {staffCreatePayload,staffDigest,TOP_CHICKEN_BUSINESS} from './staff-domain.mjs';

const cors={
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'authorization,apikey,content-type',
  'access-control-allow-methods':'POST,OPTIONS'
};
const response=(status:number,body:unknown)=>new Response(JSON.stringify(body),{
  status,headers:{...cors,'content-type':'application/json','cache-control':'no-store'}
});
const config=()=>({
  url:String(Deno.env.get('SUPABASE_URL')||'').replace(/\/$/,''),
  anon:String(Deno.env.get('SUPABASE_ANON_KEY')||''),
  service:String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'')
});
async function jsonResponse(r:Response){
  let payload:Record<string,unknown>|null=null;
  try{payload=await r.json()}catch{}
  return payload;
}
async function invokeRpc(url:string,key:string,rpc:string,payload:Record<string,unknown>){
  const r=await fetch(url+'/rest/v1/rpc/'+rpc,{
    method:'POST',headers:{'apikey':key,'authorization':'Bearer '+key,'content-type':'application/json'},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)
  });
  const data=await jsonResponse(r);
  if(!r.ok)throw Error('BACKEND_'+rpc+'_'+r.status);
  return data;
}
async function verifiedUser(url:string,anon:string,token:string){
  if(!token||token.length>5000)return null;
  const r=await fetch(url+'/auth/v1/user',{
    headers:{apikey:anon,authorization:'Bearer '+token},
    signal:AbortSignal.timeout(10000)
  });
  if(!r.ok)return null;
  const user=await jsonResponse(r);
  return /^[0-9a-f-]{36}$/i.test(String(user?.id||''))?String(user!.id):null;
}
async function createAuthUser(url:string,key:string,email:string,password:string,requestId:string){
  const r=await fetch(url+'/auth/v1/admin/users',{
    method:'POST',headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json'},
    body:JSON.stringify({email,password,email_confirm:true,
      user_metadata:{created_for:'top-chicken-beta',staff_request_id:requestId}}),
    signal:AbortSignal.timeout(12000)
  });
  const data=await jsonResponse(r);
  if(!r.ok){
    if(r.status===422||r.status===409)throw Error('AUTH_EMAIL_ALREADY_IN_USE');
    throw Error('AUTH_CREATE_OUTCOME_UNCERTAIN');
  }
  const id=String(data?.id||'');
  if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('AUTH_CREATE_OUTCOME_UNCERTAIN');
  return id;
}
Deno.serve(async(request:Request)=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return response(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const env=config();
  if(!env.url||!env.anon||!env.service)return response(503,{ok:false,code:'STAFF_BACKEND_UNCONFIGURED'});
  const bearer=String(request.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1]||'';
  let actor:string|null=null;
  try{actor=await verifiedUser(env.url,env.anon,bearer)}
  catch{return response(503,{ok:false,code:'AUTH_VERIFICATION_UNAVAILABLE'})}
  if(!actor)return response(401,{ok:false,code:'UNAUTHENTICATED'});

  let parsed:ReturnType<typeof staffCreatePayload>;
  try{parsed=staffCreatePayload(await request.json())}
  catch(e){return response(422,{ok:false,code:String((e as Error).message||'INVALID_INPUT')})}

  // The identity is ALWAYS the verified JWT identity and the PostgreSQL service
  // gate rechecks active Top Chicken admin membership + branch 22.
  let digest:string;
  try{digest=await staffDigest(parsed)}
  catch{return response(503,{ok:false,code:'REQUEST_DIGEST_UNAVAILABLE'})}
  let reserved:Record<string,unknown>|null;
  try{
    reserved=await invokeRpc(env.url,env.service,'top_chicken_staff_create_reserve_v1',{
      p_actor_auth_user_id:actor,p_request_id:parsed.request_id,
      p_payload_digest:digest,p_email:parsed.username
    });
  }catch(e){
    const code=String((e as Error)?.message||'');
    return response(code.includes('_403')?403:503,{ok:false,
      code:code.includes('_403')?'STAFF_ADMIN_DENIED':'STAFF_BACKEND_NOT_READY'});
  }
  if(reserved?.ok!==true||reserved.business_id!==TOP_CHICKEN_BUSINESS)
    return response(403,{ok:false,code:'STAFF_TENANT_DENIED'});
  if(reserved.status==='completed')return response(200,{
    ok:true,replay:true,business_id:TOP_CHICKEN_BUSINESS,branch_id:22,
    employee_id:reserved.employee_id,permissions_persisted:true
  });
  if(reserved.new_reservation!==true)return response(409,{
    ok:false,code:'STAFF_PENDING_RECONCILIATION',
    message:'Previous attempt has unknown outcome; do not repeat creating Auth user'
  });

  // Single attempt ONLY: no automatic retry after an uncertain Auth response.
  // A reservation stays pending for manual reconciliation, never silently
  // creates another credential or overwrites an existing user.
  let authUserId:string;
  try{authUserId=await createAuthUser(env.url,env.service,parsed.username,
    parsed.password,parsed.request_id)}
  catch(e){
    const code=String((e as Error).message);
    return response(code==='AUTH_EMAIL_ALREADY_IN_USE'?409:503,{ok:false,code});
  }
  // The DB finalization is atomic for employees, membership, branch, permissions,
  // audit, receipt. Auth and DB are not one transaction: uncertain failure stays
  // pending for explicit operator reconciliation. NEVER delete a possibly linked
  // auth user, and NEVER generate another request ID automatically.
  try{
    const committed=await invokeRpc(env.url,env.service,'top_chicken_staff_create_finish_v1',{
      p_actor_auth_user_id:actor,p_request_id:parsed.request_id,p_payload_digest:digest,
      p_auth_user_id:authUserId,p_name:parsed.name,p_role:parsed.role,
      p_active:parsed.active,p_permissions:parsed.permissions
    });
    if(committed?.ok!==true||committed.business_id!==TOP_CHICKEN_BUSINESS
      ||Number(committed.branch_id)!==22||committed.permissions_persisted!==true)
      return response(503,{ok:false,code:'STAFF_COMMIT_RECONCILIATION_REQUIRED'});
    return response(200,committed);
  }catch{
    return response(503,{ok:false,code:'STAFF_COMMIT_RECONCILIATION_REQUIRED'});
  }
});
