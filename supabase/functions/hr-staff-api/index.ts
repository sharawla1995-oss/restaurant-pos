// SOURCE ONLY — NOT DEPLOYED.
// Sharawla Staff API: a narrow Staff-session boundary with no POS/Admin privileges.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors={
 "access-control-allow-origin":"*",
 "access-control-allow-headers":"authorization, apikey, content-type, x-staff-session",
 "access-control-allow-methods":"POST, OPTIONS",
};
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json","cache-control":"no-store"}});
const env=(key:string)=>{const value=Deno.env.get(key)?.trim();if(!value)throw new Error(`server_config_missing:${key}`);return value};
const session=(request:Request)=>request.headers.get("x-staff-session")?.trim()||"";
const cleanError=(error:unknown)=>{
 const message=error instanceof Error?error.message:String(error||"");
 if(message.includes("client_tx_id"))return "IDEMPOTENCY_CONFLICT";
 if(message.includes("جلسة الموظف"))return "STAFF_SESSION_INVALID";
 if(message.includes("PIN"))return "PIN_REJECTED";
 return "REQUEST_REJECTED";
};
const digestHex=async(bytes:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(v=>v.toString(16).padStart(2,"0")).join("");

Deno.serve(async (request:Request)=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(request.method!=="POST")return json(405,{ok:false,code:"METHOD_NOT_ALLOWED"});
 try{
  const server=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
  const contentType=request.headers.get("content-type")||"";

  if(contentType.includes("multipart/form-data")){
   const staffSession=session(request);if(!staffSession)return json(401,{ok:false,code:"STAFF_SESSION_REQUIRED"});
   const form=await request.formData();
   if(String(form.get("action")||"")!=="selfie-upload")return json(400,{ok:false,code:"UNKNOWN_MULTIPART_ACTION"});
   const file=form.get("selfie");
   const clientTxId=String(form.get("client_tx_id")||"").trim();
   const capturedAt=String(form.get("captured_at_device")||"").trim();
   if(!(file instanceof File)||!clientTxId||!capturedAt)return json(400,{ok:false,code:"SELFIE_FIELDS_REQUIRED"});
   if(!["image/jpeg","image/webp"].includes(file.type)||file.size<1000||file.size>5*1024*1024)return json(400,{ok:false,code:"SELFIE_FORMAT_REJECTED"});
   const bytes=await file.arrayBuffer();const sha=await digestHex(bytes);
   const {data:reservation,error:reserveError}=await server.rpc("hr_staff_selfie_reserve_v1",{
    p_session_token:staffSession,p_client_tx_id:clientTxId,p_content_sha256:sha,p_captured_at_device:capturedAt,
    p_metadata:{content_type:file.type,size_bytes:file.size,source:"live_camera"}
   });
   if(reserveError)throw reserveError;
   if(!["uploaded","attached"].includes(String(reservation?.status||""))){
    const {error:uploadError}=await server.storage.from(String(reservation.bucket)).upload(String(reservation.path),bytes,{contentType:file.type,upsert:false,cacheControl:"0"});
    if(uploadError){
     const {data:existing,error:downloadError}=await server.storage.from(String(reservation.bucket)).download(String(reservation.path));
     if(downloadError||!existing||await digestHex(await existing.arrayBuffer())!==sha)throw uploadError;
    }
   }
   const {data:completed,error:completeError}=await server.rpc("hr_staff_selfie_complete_v1",{p_session_token:staffSession,p_client_tx_id:clientTxId,p_content_sha256:sha});
   if(completeError)throw completeError;
   return json(200,{ok:true,selfie:completed,replay:reservation?.replay===true});
  }

  const body=await request.json().catch(()=>null);const action=String(body?.action||"");
  if(action==="login"){
   const {data,error}=await server.rpc("hr_staff_login_v1",{
    p_identity:String(body?.identity||""),p_pin:String(body?.pin||""),p_device_uid:String(body?.device_uid||""),
    p_device_name:String(body?.device_name||""),p_device_model:String(body?.device_model||""),
    p_platform:String(body?.platform||""),p_user_agent:String(request.headers.get("user-agent")||"")
   });if(error)throw error;if(data?.ok===false)return json(401,{ok:false,code:"INVALID_CREDENTIALS"});return json(200,{ok:true,...data});
  }
  const staffSession=session(request);if(!staffSession)return json(401,{ok:false,code:"STAFF_SESSION_REQUIRED"});
  if(action==="change-pin"){
   const {data,error}=await server.rpc("hr_staff_change_pin_v1",{p_session_token:staffSession,p_current_pin:String(body?.current_pin||""),p_new_pin:String(body?.new_pin||"")});
   if(error)throw error;return json(200,{ok:data===true,reauthenticate:true});
  }
  if(action==="snapshot"){
   const {data,error}=await server.rpc("hr_staff_self_snapshot_v1",{p_session_token:staffSession,p_from:body?.from||null,p_to:body?.to||null});
   if(error)throw error;return json(200,{ok:true,data});
  }
  if(action==="attendance"){
   const {data,error}=await server.rpc("hr_staff_attendance_submit_v1",{p_session_token:staffSession,p_payload:body?.payload||{}});
   if(error)throw error;return json(200,{ok:true,ack:data});
  }
  if(action==="leave-request"){
   const {data,error}=await server.rpc("hr_staff_leave_request_v1",{p_session_token:staffSession,p_request_type:String(body?.request_type||""),p_starts_at:body?.starts_at,p_ends_at:body?.ends_at,p_reason:String(body?.reason||""),p_client_tx_id:String(body?.client_tx_id||"")});
   if(error)throw error;return json(200,{ok:true,leave_request_id:data});
  }
  if(action==="sync-state"){
   const {data,error}=await server.rpc("hr_staff_sync_state_v1",{p_session_token:staffSession,p_pending_count:Number(body?.pending_count||0),p_last_error:body?.last_error?String(body.last_error):null});
   if(error)throw error;return json(200,{ok:data===true});
  }
  if(action==="logout"){
   const {data,error}=await server.rpc("hr_staff_logout_v1",{p_session_token:staffSession});if(error)throw error;return json(200,{ok:data===true});
  }
  return json(404,{ok:false,code:"UNKNOWN_ACTION"});
 }catch(error){
  const message=error instanceof Error?error.message:String(error||"");
  const serverConfig=message.startsWith("server_config_missing:");
  return json(serverConfig?503:400,{ok:false,code:serverConfig?"SERVER_CONFIG_MISSING":cleanError(error)});
 }
}));
