const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-sharawla-business,x-sharawla-device'};
export function operationHandler({admin,executeRPC}){
 return async req=>{
  const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method==='OPTIONS')return respond({ok:true});
  if(req.method!=='POST')return respond({ok:false,message:'POST required'},405);
  try{
   const bearer=(req.headers.get('Authorization')||'').match(/^Bearer\s+(.+)$/i);
   if(!bearer)return respond({ok:false,message:'غير مصرح'},401);
   const verified=await admin.auth.getUser(bearer[1]);if(verified.error||!verified.data?.user)return respond({ok:false,message:'جلسة غير صالحة'},401);
   const b=await req.json();if(!['top_chicken_transition_order_status','top_chicken_assign_order_driver'].includes(b.rpc)||!b.params||typeof b.params!=='object'||Array.isArray(b.params))return respond({ok:false,message:'عملية غير معروفة'},400);
   const result=await executeRPC(b.rpc,b.params,verified.data.user.id,{device:req.headers.get('x-sharawla-device')});
   if(result.error)return respond({ok:false,message:'تعذر اعتماد صلاحية العملية',code:result.error.code},result.error.code==='CLOUD_AUTHORITY_UNAVAILABLE'?503:result.error.code==='42501'?403:400);
   return respond(result.data);
  }catch{return respond({ok:false,message:'تعذر التحقق من العملية'},400);}
 };
}
