(function(global){
'use strict';
const VERSION='10.5.4-beta.58.31';
async function rpc(name,payload){if(typeof global.rpc!=='function')throw new Error('RPC غير جاهز');return global.rpc(name,payload)}
function clean(v){const s=String(v??'').trim();return s||null}
function tx(){return global.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function offline(){return global.navigator?.onLine===false}
function normalizePhone(v){const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';let x=String(v??'').replace(/[٠-٩]/g,c=>String(ar.indexOf(c))).replace(/[۰-۹]/g,c=>String(fa.indexOf(c))).replace(/\D/g,'');if(x.startsWith('0020'))x=x.slice(4);else if(x.startsWith('20')&&x.length>=12)x=x.slice(2);if(x.length===10&&x.startsWith('1'))x='0'+x;return x||null}
function validatedCustomerInput(input={}){const name=clean(input.name);if(!name)throw new Error('اسم العميل مطلوب');const rawPhone=clean(input.phone),phone=rawPhone?normalizePhone(rawPhone):null;if(rawPhone&&!/^01[0125][0-9]{8}$/.test(phone||''))throw new Error('رقم الموبايل غير صحيح');return {name,phone,area:clean(input.area),address:clean(input.address),notes:clean(input.notes)}}
function durablePendingStatus(v){return ['pending','retryable','syncing'].includes(String(v||''))}
function deferredLike(e){const m=String(e?.message||e||'').toLowerCase();return durablePendingStatus(e?.offline_v2_status)||m.includes('failed to fetch')||m.includes('network')||m.includes('offline')||m.includes('deferred')}
async function commitLocalFirst(data){const transport=global.SharawlaOfflineV2Transport;if(typeof transport?.commitRpcLocal!=='function')throw new Error('Offline V2 غير جاهز');const clientTx=tx();const payload={p_name:data.name,p_phone:data.phone,p_area:data.area,p_address:data.address,p_notes:data.notes,p_client_tx_id:clientTx};const committed=await transport.commitRpcLocal('offline_customer_create_v1',payload);if(committed?.synced===true){const n=Number(committed.result);if(Number.isFinite(n)&&n>0)return n}return String(committed?.result||committed?.local_entity_id||`offline-customer-${clientTx}`)}
async function createCustomer(input={}){const data=validatedCustomerInput(input);const transport=global.SharawlaOfflineV2Transport;const takeoverActive=typeof transport?.isActive==='function'&&!!(await transport.isActive());if(takeoverActive&&typeof transport?.commitRpcLocal==='function')return commitLocalFirst(data);if(offline())throw new Error('إنشاء العميل أوفلاين يحتاج تفعيل Offline V2 على الجهاز. لم يتم حفظ أي بيانات.');const id=await rpc('customer_create_v2',{p_name:data.name,p_phone:data.phone,p_area:data.area,p_address:data.address,p_notes:data.notes});const n=Number(id);if(!Number.isFinite(n)||n<=0)throw new Error('تعذر قراءة رقم العميل بعد الحفظ');return n}
async function createManyCustomers(rows=[]){if(offline())throw new Error('استيراد ملف العملاء يحتاج إنترنت. لم يتم استيراد أي صف.');const ids=[];for(const row of (Array.isArray(rows)?rows:[]))ids.push(await createCustomer(row));return ids}
global.__SharawlaPV2CustomerCreate=Object.freeze({version:VERSION,createCustomer,createManyCustomers,normalizePhone,validatedCustomerInput});
})(window);
