// Server-only Cloud decision reader. Never derives grants from profile defaults.
export const TC='5358328c-9724-49aa-affc-1bce8be90f92';
export function requirements(rpc,p={}){
 if(rpc==='top_chicken_staff_login_context_v1')return {features:['core.auth'],modules:[]};
 if(['top_chicken_reserve_staff_v1','top_chicken_complete_staff_v1'].includes(rpc))return {features:['core.auth','core.users','core.permissions'],modules:[]};
 if(rpc==='top_chicken_assign_order_driver')return {features:['commerce.orders','commerce.delivery'],modules:['pos','delivery']};
 if(rpc==='top_chicken_transition_order_status'){
  const f=['commerce.orders'],m=['pos'];
  if(p.p_new_status==='completed'){f.push('commerce.pickup');m.push('pickup');}
  if(['out_for_delivery','delivered'].includes(p.p_new_status)){f.push('commerce.delivery');m.push('delivery');}
  if(p.p_new_status==='delivered')f.push('core.payments');
  return {features:f,modules:m};
 }
 throw Error('Unsupported TC operation');
}
const exactlyOne=r=>{if(r.error||!r.data||Array.isArray(r.data))throw Error('Cloud authority unavailable');return r.data};
export function cloudSnapshotReader({cloud,clock=()=>new Date()}){
 async function snapshot(rpc,p){
  const needed=requirements(rpc,p),at=clock().toISOString();
  const business=exactlyOne(await cloud.from('businesses').select('id,active,pos_profile_id').eq('id',TC).single());
  const profile=exactlyOne(await cloud.from('pos_profiles').select('id,code,active,implemented').eq('id',business.pos_profile_id).single());
  const decisions={},modules={};
  for(const code of needed.features){
   const f=exactlyOne(await cloud.from('features').select('id,code,active,implemented').eq('code',code).single());
   const override=await cloud.from('business_features').select('enabled').eq('business_id',TC).eq('feature_id',f.id).maybeSingle();
   if(override.error)throw Error('Cloud feature override unavailable');
   const d=exactlyOne(await cloud.rpc('resolve_sharawla_commercial_entitlement_cloud_v1',{p_business_id:TC,p_feature_code:code,p_at_time:at}));
   if(d.business_id!==TC||d.feature_code!==code||d.evaluation_time!==at&&new Date(d.evaluation_time).getTime()!==new Date(at).getTime())throw Error('Cloud decision scope mismatch');
   decisions[code]={...d,feature_active:f.active===true,feature_implemented:f.implemented===true,override_disabled:override.data?.enabled===false};
  }
  for(const code of needed.modules){
   const module=exactlyOne(await cloud.from('modules').select('id,code,active').eq('code',code).single());
   const grant=await cloud.from('business_modules').select('enabled').eq('business_id',TC).eq('module_id',module.id).maybeSingle();
   if(grant.error)throw Error('Cloud module unavailable');modules[code]=module.active===true&&grant.data?.enabled===true;
  }
  return {business_id:TC,business_active:business.active===true,profile_code:profile.code,profile_active:profile.active===true&&profile.implemented===true,observed_at:at,decisions,modules};
 }
 return snapshot;
}
export function cloudExecutor({readSnapshot,beta}){
 if(!readSnapshot)throw Error('TC authority reader required');
 return async(rpc,p={},actor=p.p_actor||null,context={})=>{
  try{const source=await readSnapshot(rpc,p);source.device_selector=context.device||null;return await beta.rpc('top_chicken_execute_cloud_authorized_v1',{p_actor:actor,p_rpc:rpc,p_payload:p,p_cloud:source});}
  catch{return {data:null,error:{code:'CLOUD_AUTHORITY_UNAVAILABLE',message:'Cloud authority verification unavailable'}};}
 };
}
export function assertTCChannelSecret(key){
 if(typeof key!=='string'||!/^[a-f0-9]{64}$/i.test(key))throw Error('A dedicated 32-byte TC channel secret is required');
}
export function assertCloudPublicKey(key){
 let valid=typeof key==='string'&&key.startsWith('sb_publishable_')&&key.length>=32;
 if(!valid)try{const c=JSON.parse(atob(String(key).split('.')[1].replaceAll('-','+').replaceAll('_','/')));valid=c.role==='anon'&&c.ref==='ikppryeavoabnugcijeq';}catch{}
 if(!valid)throw Error('Only a public Cloud API key is allowed in the Beta authority client');
}
export async function signAuthorityBody(text,secret){
 assertTCChannelSecret(secret);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
}
export function signedAuthorityReader({publicKey,secret,fetchImpl=fetch,clock=()=>new Date()}){
 assertCloudPublicKey(publicKey);assertTCChannelSecret(secret);
 return async(rpc,p={})=>{
  requirements(rpc,p);const nonce=crypto.randomUUID();const body=JSON.stringify({rpc,new_status:p.p_new_status??null,nonce,issued_at:clock().toISOString()});
  const response=await fetchImpl('https://ikppryeavoabnugcijeq.supabase.co/functions/v1/top-chicken-authority',{method:'POST',headers:{apikey:publicKey,'Content-Type':'application/json','x-tc-authority-signature':await signAuthorityBody(body,secret)},body,signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('TC Cloud authority unavailable');const data=await response.json();
  if(data.ok!==true||data.nonce!==nonce||data.rpc!==rpc||data.snapshot?.business_id!==TC)throw Error('TC Cloud reply mismatch');
  return data.snapshot;
 };
}
