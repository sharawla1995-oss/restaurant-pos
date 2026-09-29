// SOURCE ONLY — NOT DEPLOYED.
// Trusted Device Bridge V1. Secrets belong only in server-side Edge Function env.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
const env=(k:string)=>{const v=Deno.env.get(k)?.trim();if(!v)throw new Error("server_config_missing:"+k);return v};

Deno.serve(async(req)=>{
 if(req.method!=="POST")return json(405,{ok:false,code:"METHOD_NOT_ALLOWED"});
 try{
  const auth=req.headers.get("authorization")||"";
  if(!auth.toLowerCase().startsWith("bearer "))return json(401,{ok:false,code:"AUTH_REQUIRED"});
  const body=await req.json().catch(()=>null);
  const assertionToken=typeof body?.assertion_token==="string"?body.assertion_token.trim():"";
  if(!assertionToken)return json(400,{ok:false,code:"ASSERTION_REQUIRED"});
  // Deliberately reject caller-selected business/device/fingerprint proof fields.
  if(body?.business_id||body?.device_id||body?.device_fingerprint)return json(400,{ok:false,code:"SELF_ASSERTED_DEVICE_FORBIDDEN"});

  const restaurantUrl=env("RESTAURANT_SUPABASE_URL");
  const restaurantAnon=env("RESTAURANT_SUPABASE_ANON_KEY");
  const restaurantService=env("RESTAURANT_SUPABASE_SERVICE_ROLE_KEY");
  const restaurantBusiness=env("RESTAURANT_BUSINESS_ID");
  const cloudUrl=env("SHARAWLA_CLOUD_SUPABASE_URL");
  const cloudService=env("SHARAWLA_CLOUD_SERVICE_ROLE_KEY");

  // Employee session is verified independently against Restaurant auth.
  const employeeClient=createClient(restaurantUrl,restaurantAnon,{global:{headers:{Authorization:auth}}});
  const {data:userData,error:userErr}=await employeeClient.auth.getUser();
  if(userErr||!userData.user)return json(401,{ok:false,code:"EMPLOYEE_AUTH_REJECTED"});

  // Server-only Cloud authority consumes the opaque one-time assertion.
  const cloud=createClient(cloudUrl,cloudService,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:rows,error:consumeErr}=await cloud.rpc("consume_trusted_device_assertion_v1",{
    p_assertion_token:assertionToken,
    p_purpose:"restaurant_bon_device_verification"
  });
  if(consumeErr||!Array.isArray(rows)||rows.length!==1)return json(403,{ok:false,code:"ASSERTION_REJECTED"});
  const canonical=rows[0];
  if(String(canonical.business_id)!==restaurantBusiness)return json(403,{ok:false,code:"WRONG_BUSINESS"});

  // Only the server bridge can mint the Restaurant context.
  const restaurantServer=createClient(restaurantUrl,restaurantService,{auth:{persistSession:false,autoRefreshToken:false}});
  const expiresAt=new Date(Date.now()+120000).toISOString();
  const {data:contextId,error:contextErr}=await restaurantServer.rpc("pos_register_trusted_device_context_v1",{
    p_cloud_assertion_id:canonical.assertion_id,
    p_business_id:canonical.business_id,
    p_device_id:canonical.device_id,
    p_device_fingerprint:canonical.device_fingerprint,
    p_purpose:"restaurant_bon_device_verification",
    p_expires_at:expiresAt
  });
  if(contextErr||!contextId)return json(403,{ok:false,code:"CONTEXT_REJECTED"});
  return json(200,{ok:true,verified_device_context_id:contextId,expires_at:expiresAt});
 }catch(e){
  const code=e instanceof Error&&e.message.startsWith("server_config_missing:")?"SERVER_CONFIG_MISSING":"BRIDGE_UNAVAILABLE";
  return json(503,{ok:false,code});
 }
});
