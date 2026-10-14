import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const fail=(message:string,status=400)=>json({ok:false,error:message,message},status);
const normalizeUsername=(value:unknown)=>String(value??"").trim().toLowerCase();
const usernameValid=(value:string)=>value.length>=3&&value.length<=40&&!value.includes("@")&&/^[\p{L}\p{N}._-]+$/u.test(value);
async function sha256Hex(value:string){const bytes=new TextEncoder().encode(value);const hash=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("")}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  try{
    const supabaseUrl=Deno.env.get("SUPABASE_URL");
    const serviceRoleKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey=Deno.env.get("SUPABASE_ANON_KEY");
    if(!supabaseUrl||!serviceRoleKey||!anonKey)throw new Error("إعدادات السيرفر غير مكتملة");
    const admin=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||"").trim().toLowerCase();

    if(action==="login"){
      const username=normalizeUsername(body?.username),password=String(body?.password||"");
      if(!username||!password)return fail("بيانات الدخول غير صحيحة");
      const {data:employee,error:employeeError}=await admin.from("employees").select("id,username,active,auth_user_id,business_id").eq("username",username).maybeSingle();
      if(employeeError){console.error("LOGIN_EMPLOYEE_LOOKUP",employeeError);return fail("تعذر التحقق من اسم المستخدم")}
      if(employee?.business_id==="5358328c-9724-49aa-affc-1bce8be90f92")return fail("استخدم مسار دخول توب تشيكن المخصص",403);
      if(!employee||employee.active!==true||!employee.auth_user_id)return fail("بيانات الدخول غير صحيحة");
      const {data:userData,error:userLookupError}=await admin.auth.admin.getUserById(employee.auth_user_id);
      const internalEmail=userData?.user?.email;
      if(userLookupError||!internalEmail){console.error("LOGIN_AUTH_LOOKUP",userLookupError);return fail("بيانات الدخول غير صحيحة")}
      const authClient=createClient(supabaseUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
      const {data:loginData,error:loginError}=await authClient.auth.signInWithPassword({email:internalEmail,password});
      if(loginError||!loginData.session||!loginData.user)return fail("بيانات الدخول غير صحيحة");
      const s=loginData.session;
      return json({ok:true,access_token:s.access_token,refresh_token:s.refresh_token,expires_in:s.expires_in,expires_at:s.expires_at,token_type:s.token_type,user:loginData.user,username});
    }

    const authHeader=req.headers.get("Authorization")||"";
    const token=authHeader.replace(/^Bearer\s+/i,"").trim();
    if(!token)return fail("غير مصرح",401);
    const {data:{user},error:userError}=await admin.auth.getUser(token);
    if(userError||!user)return fail("جلسة الدخول غير صالحة",401);
    const {data:actor,error:actorError}=await admin.from("employees").select("id,role,active,business_id").eq("auth_user_id",user.id).maybeSingle();
    if(actorError||!actor)return fail("حساب الدخول غير مربوط بموظف",403);
    if(actor.business_id==="5358328c-9724-49aa-affc-1bce8be90f92")return fail("استخدم إدارة موظفي توب تشيكن المخصصة",403);
    if(actor.active!==true)return fail("حساب المدير غير فعال",403);
    if(String(actor.role||"").toLowerCase()!=="admin")return fail("هذه العملية للمدير فقط",403);

    if(action==="create"){
      const name=String(body?.name||"").trim(),username=normalizeUsername(body?.username),password=String(body?.password||""),role=String(body?.role||"").trim().toLowerCase();
      const branchIds=Array.isArray(body?.branch_ids)?[...new Set(body.branch_ids.map((x:unknown)=>Number(x)).filter((x:number)=>Number.isFinite(x)&&x>0))]:[];
      if(branchIds.includes(22))return fail("استخدم إدارة موظفي توب تشيكن المخصصة",403);
      if(username.includes("@"))return fail("اسم المستخدم لا يحتوي على @");
      if(!name||!usernameValid(username)||password.length<6||!role||!branchIds.length)return fail("أكمل بيانات المستخدم وتأكد أن اسم المستخدم 3-40 حرفًا بدون مسافات");
      const {data:existing,error:existingError}=await admin.from("employees").select("id").eq("username",username).maybeSingle();
      if(existingError){console.error("USERNAME_CHECK",existingError);return fail("تعذر التحقق من اسم المستخدم")}
      if(existing)return fail("اسم المستخدم مستخدم بالفعل",409);
      const hash=await sha256Hex(username),internalEmail=`u-${hash.slice(0,32)}@sharawla.local`;
      const {data:authData,error:authError}=await admin.auth.admin.createUser({email:internalEmail,password,email_confirm:true,user_metadata:{sharawla_username:username}});
      if(authError){console.error("CREATE_AUTH",authError);return fail(authError.message.includes("already")?"اسم المستخدم مستخدم بالفعل":"تعذر إنشاء حساب الدخول")}
      if(!authData.user)return fail("تعذر إنشاء حساب الدخول");
      let employeeId:number|null=null;
      try{
        const {data:newEmployee,error:employeeError}=await admin.from("employees").insert({name,username,role,branch_id:branchIds[0],active:true,auth_user_id:authData.user.id}).select("id").single();
        if(employeeError||!newEmployee)throw employeeError||new Error("تعذر إنشاء الموظف");
        employeeId=Number(newEmployee.id);
        const {error:branchesError}=await admin.from("employee_branches").insert(branchIds.map((branch_id:number)=>({employee_id:employeeId,branch_id})));
        if(branchesError)throw branchesError;
        return json({ok:true,employee_id:employeeId,username});
      }catch(err){
        console.error("CREATE_EMPLOYEE",err);if(employeeId)await admin.from("employees").delete().eq("id",employeeId);await admin.auth.admin.deleteUser(authData.user.id);return fail(err instanceof Error?err.message:"تعذر إنشاء المستخدم");
      }
    }

    if(action==="password"){
      const employeeId=Number(body?.employee_id||0),password=String(body?.password||"");
      if(!employeeId)return fail("رقم المستخدم غير موجود");
      if(password.length<6)return fail("كلمة المرور 6 أحرف على الأقل");
      const {data:target,error:targetError}=await admin.from("employees").select("auth_user_id,business_id").eq("id",employeeId).maybeSingle();
      if(target?.business_id==="5358328c-9724-49aa-affc-1bce8be90f92")return fail("تغيير كلمة مرور توب تشيكن من المسار المخصص فقط",403);
      if(targetError||!target?.auth_user_id)return fail("المستخدم غير مرتبط بحساب دخول");
      const {error:passwordError}=await admin.auth.admin.updateUserById(target.auth_user_id,{password});
      if(passwordError)return fail(passwordError.message);
      return json({ok:true});
    }

    return fail("عملية غير معروفة");
  }catch(error){console.error("SMART_FUNCTION",error);return fail(error instanceof Error?error.message:String(error))}
});
