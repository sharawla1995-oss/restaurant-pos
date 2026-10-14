// The caller supplies server-owned clients; never load a service key into the browser.
export const TC_BUSINESS='5358328c-9724-49aa-affc-1bce8be90f92';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-sharawla-business','Content-Type':'application/json'};
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
export function createTopChickenStaffHandler({admin,authClient,digestSecret}){
  if(!digestSecret)throw new Error('Staff digest secret required');
  const call=async(name,payload)=>{const r=await admin.rpc(name,payload);if(r.error)throw r.error;return r.data;};
  async function fingerprint(value){
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(digestSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(value)));
    return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  }
  return async function handle(req){
    if(req.method==='OPTIONS')return respond({ok:true});
    if(req.method!=='POST')return respond({ok:false,message:'POST required'},405);
    try{
      const b=await req.json();const action=String(b.action||'');
      if(!['create','password','login'].includes(action))return respond({ok:false,message:'عملية غير معروفة'},400);
      if(action==='login'){
        const username=String(b.username||'').trim().toLowerCase(),password=String(b.password||'');
        if(!username||!password)return respond({ok:false,message:'بيانات الدخول غير صحيحة'},401);
        const context=await call('top_chicken_staff_login_context_v1',{p_username:username});
        if(!context)return respond({ok:false,message:'بيانات الدخول غير صحيحة'},401);
        const account=await admin.auth.admin.getUserById(context.auth_user_id);
        if(account.error||!account.data?.user?.email)return respond({ok:false,message:'بيانات الدخول غير صحيحة'},401);
        const login=await authClient.auth.signInWithPassword({email:account.data.user.email,password});
        if(login.error||!login.data?.session||login.data.user?.id!==context.auth_user_id)return respond({ok:false,message:'بيانات الدخول غير صحيحة'},401);
        const after=await call('top_chicken_staff_login_context_v1',{p_username:username});
        if(after?.auth_user_id!==context.auth_user_id)return respond({ok:false,message:'حساب الموظف غير فعال'},401);
        return respond({ok:true,...login.data.session,user:login.data.user,username});
      }
      const match=(req.headers.get('Authorization')||'').match(/^Bearer\s+(.+)$/i);
      if(!match)return respond({ok:false,message:'غير مصرح'},401);
      const verified=await admin.auth.getUser(match[1]);
      if(verified.error||!verified.data?.user)return respond({ok:false,message:'جلسة غير صالحة'},401);
      const actor=verified.data.user.id;
      const request=String(b.request_id||'');
      if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(request))return respond({ok:false,message:'معرّف الطلب مطلوب'},400);
      const password=String(b.password||'');
      if(password.length<6)return respond({ok:false,message:'كلمة المرور 6 أحرف على الأقل'},400);
      let profile;
      if(action==='create'){
        if(!Array.isArray(b.permissions)||!Array.isArray(b.branch_ids)||typeof b.active!=='boolean')return respond({ok:false,message:'الفروع والصلاحيات مطلوبة'},400);
        profile={name:String(b.name||'').trim(),username:String(b.username||'').trim().toLowerCase(),role:String(b.role||'').trim().toLowerCase(),branch_id:Number(b.branch_id),branch_ids:b.branch_ids,permissions:[...new Set(b.permissions)].sort(),active:b.active};
      }else profile={employee_id:Number(b.employee_id)};
      const digest=await fingerprint({actor,request,action,profile,password});
      const reserved=await call('top_chicken_reserve_staff_v1',{p_actor:actor,p_request_id:request,p_operation:action,p_payload:profile,p_digest:digest});
      if(reserved.result)return respond({...reserved.result,replayed:true});
      const id=reserved.auth_user_id;
      if(action==='create'){
        // Server-assigned UUID makes response-loss recovery deterministic; no listUsers or DELETE.
        const email=`tc-${id}@staff.sharawla.local`;
        let account=await admin.auth.admin.getUserById(id);
        if(account.error&&account.error.status!==404)throw account.error;
        if(!account.data?.user){
          account=await admin.auth.admin.createUser({id,email,password,email_confirm:true,app_metadata:{business_id:TC_BUSINESS,tc_staff_request:request}});
          if(account.error)account=await admin.auth.admin.getUserById(id);
        }
        const user=account.data?.user;
        if(account.error||!user||user.id!==id||user.email!==email||user.app_metadata?.business_id!==TC_BUSINESS||user.app_metadata?.tc_staff_request!==request)
          return respond({ok:false,message:'تعذر تأكيد حساب الدخول؛ أعد المحاولة بنفس الطلب'},503);
      }else{
        const changed=await admin.auth.admin.updateUserById(id,{password});
        if(changed.error)throw changed.error;
      }
      const result=await call('top_chicken_complete_staff_v1',{p_actor:actor,p_request_id:request,p_digest:digest});
      return respond(result);
    }catch(e){
      const status=e?.code==='42501'?403:e?.code==='23505'?409:400;
      // Passwords, tokens and raw request bodies are never logged or persisted.
      return respond({ok:false,message:status===403?'ليس لديك صلاحية للنشاط أو الفرع':status===409?'اسم المستخدم أو معرّف الطلب مستخدم بالفعل':'تعذر إكمال العملية؛ أعد المحاولة بنفس الطلب',code:e?.code||'STAFF_OPERATION_FAILED'},status);
    }
  };
}
