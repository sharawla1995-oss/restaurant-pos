// Source-only Top Chicken Beta username + 4-digit PIN identity primitives.
// The PIN never becomes a raw Supabase Auth password or plain SQL receipt.
// Deploy only after the admin-approved, tenant-bound PIN login SQL gate is applied.
export const PIN_BUSINESS='5358328c-9724-49aa-affc-1bce8be90f92';
export const PIN_BRANCH=22;
const ID=/^[a-z][a-z0-9._-]{2,31}$/;
const PIN=/^[0-9]{4}$/;
export function pinUsername(v){
 const handle=String(v??'').normalize('NFKC').trim().toLowerCase();
 if(!ID.test(handle))throw Error('USERNAME_LATIN_3_TO_32');
 return handle;
}
export function pin4(v){
 const pin=String(v??'');
 if(!PIN.test(pin))throw Error('PIN_EXACT_4_DIGITS');
 return pin;
}
export function syntheticEmail(handle){
 return 'tc-sh0008-'+pinUsername(handle)+'@accounts.example';
}
async function hmac(secret, message){
 if(typeof secret!=='string'||secret.length<32)throw Error('PIN_SECRET_MISSING');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function internalPassword(handle,pin,secret){
 const username=pinUsername(handle);
 return 'TC4_'+await hmac(secret,'top-chicken:auth:v1:'+username+':'+pin4(pin));
}
export async function pinReceiptDigest(body,secret){
 return await hmac(secret,'top-chicken:staff-create:v1:'+JSON.stringify({
   username:pinUsername(body.username),pin:pin4(body.pin),name:body.name,
   role:body.role,active:body.active,permissions:body.permissions,
   branch_id:PIN_BRANCH
 }));
}
export function pinCreatePayload(body){
 if(!body||body.action!=='create'||body.auth_mode!=='pin4')
   throw Error('PIN_CREATE_ACTION_INVALID');
 const username=pinUsername(body.username),pin=pin4(body.password);
 const name=String(body.name||'').trim(),role=String(body.role||'').toLowerCase();
 if(!name||name.length>120)throw Error('STAFF_NAME_INVALID');
 if(!['cashier','callcenter','admin'].includes(role))throw Error('STAFF_ROLE_INVALID');
 if(Number(body.branch_id)!==22||!Array.isArray(body.branch_ids)||body.branch_ids.some(x=>Number(x)!==22))
   throw Error('BRANCH_22_ONLY');
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(body.request_id||'')))
   throw Error('REQUEST_ID_INVALID');
 if(!Array.isArray(body.permissions)||body.permissions.length>100)
   throw Error('PERMISSION_LIST_INVALID');
 // Full allowlist is validated by the existing staff SQL function at finish.
 const permissions=role==='admin'?[]:[...new Set(body.permissions.map(x=>String(x).trim()))].sort();
 return {action:'create',auth_mode:'pin4',username,pin,name,role,active:body.active!==false,
   permissions,branch_id:22,branch_ids:[22],request_id:String(body.request_id)};
}
