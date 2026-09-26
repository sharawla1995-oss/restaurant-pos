(function(global){
'use strict';
const VERSION='10.5.4-beta.58.33';
const R=()=>global.__SharawlaAcceptanceRegistry;
const branch=()=>Number(global.currentBranchId?.()||0);
function ensure(){if(typeof global.rpc!=='function'||typeof global.rest!=='function')throw new Error('Runtime RPC/REST unavailable');if(!branch())throw new Error('Active branch missing')}
function conn(){try{return {url:String(cfg?.url||'').replace(/\/$/,''),key:String(cfg?.key||''),token:String(session?.access_token||'')}}catch{return {url:'',key:'',token:''}}}
function encodedPath(p){return String(p||'').split('/').map(encodeURIComponent).join('/')}
async function removeObject(bucket,path){
 const c=conn();if(!c.url||!c.key||!c.token)throw new Error('Storage session unavailable');
 const r=await fetch(`${c.url}/storage/v1/object/${encodeURIComponent(bucket)}`,{method:'DELETE',headers:{apikey:c.key,Authorization:`Bearer ${c.token}`,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[String(path||'')]})});
 let d=null;try{d=await r.json()}catch{}if(!r.ok)throw new Error(d?.message||d?.error||`Storage delete failed (${r.status})`);return true;
}
async function cleanup(run){
 const manifest=await global.rpc('sharawla_beta54_purchase_attachment_cleanup_manifest_v1',{p_run_id:run});
 if(manifest?.ok!==true)throw new Error(`Attachment cleanup manifest failed: ${JSON.stringify(manifest)}`);
 for(const o of (manifest?.objects||[])){if(o?.bucket&&o?.path)await removeObject(o.bucket,o.path)}
 const out=await global.rpc('sharawla_beta54_purchase_attachment_cleanup_v1',{p_run_id:run});
 if(out?.ok!==true||Number(out?.residue||0)!==0||Number(out?.storage_residue||0)!==0)throw new Error(`Attachment cleanup failed: ${JSON.stringify(out)}`);return out;
}
async function uploadObject(bucket,path,bytes){
 const c=conn();if(!c.url||!c.key||!c.token)throw new Error('Storage session unavailable');
 const body=new Blob([bytes],{type:'image/png'});
 const r=await fetch(`${c.url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(path)}`,{method:'POST',headers:{apikey:c.key,Authorization:`Bearer ${c.token}`,'Content-Type':'image/png','x-upsert':'false'},body});
 let d=null;try{d=await r.json()}catch{}if(!r.ok)throw new Error(d?.message||d?.error||`Storage upload failed (${r.status})`);return true;
}
async function readObject(bucket,path){
 const c=conn();if(!c.url||!c.key||!c.token)throw new Error('Storage session unavailable');
 const r=await fetch(`${c.url}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath(path)}`,{headers:{apikey:c.key,Authorization:`Bearer ${c.token}`}});
 if(!r.ok)throw new Error(`Authenticated attachment read failed (${r.status})`);
 return new Uint8Array(await r.arrayBuffer());
}
function sameBytes(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true}
async function purchasingAttachmentRoundtrip(ctx){
 ensure();
 const run=ctx.run_id,ref=`ACC-PA-${run}`,fileName=`acceptance-${run}.png`,today=new Date().toISOString().slice(0,10);
 let originalError=null,evidence=null;
 await cleanup(run);
 try{
  const perms=await Promise.all(['purchasing.attachments.view','purchasing.attachments.upload','purchasing.attachments.delete'].map(code=>global.rpc('has_action_permission_v2',{p_action_code:code})));
  if(perms.some(x=>x!==true))throw new Error(`Attachment permissions unavailable for acceptance admin: ${JSON.stringify(perms)}`);
  const suppliers=await global.rest('retail_suppliers','select=id,name,active&active=eq.true&order=id&limit=1');
  if(!suppliers?.length)throw new Error('No active supplier available for attachment acceptance');
  const supplier=Number(suppliers[0].id);
  const payload=new TextEncoder().encode(`SHARAWLA-PURCHASE-ATTACHMENT:${run}`);
  const prep=await global.rpc('purchase_attachment_prepare_v1',{
   p_branch_id:branch(),p_supplier_id:supplier,p_supplier_invoice_id:null,p_document_type:'supplier_invoice',p_document_date:today,
   p_reference_number:ref,p_note:`SHARAWLA_ACCEPTANCE:${run}`,p_original_file_name:fileName,p_mime_type:'image/png',p_file_size:payload.length
  });
  const id=Number(prep?.attachment_id||0);if(!id||prep?.bucket!=='purchase-documents'||!prep?.path)throw new Error(`Attachment prepare mismatch: ${JSON.stringify(prep)}`);
  await uploadObject(prep.bucket,prep.path,payload);
  const f1=await global.rpc('purchase_attachment_finalize_v1',{p_attachment_id:id});
  const f2=await global.rpc('purchase_attachment_finalize_v1',{p_attachment_id:id});
  if(f1!==true||f2!==true)throw new Error('Attachment finalize idempotency failed');

  const rows=await global.rpc('purchase_attachment_list_v1',{p_branch_id:branch(),p_supplier_id:supplier,p_from:today,p_to:today,p_search:ref});
  const exact=(rows||[]).filter(x=>Number(x.id)===id&&x.reference_number===ref&&x.original_file_name===fileName);
  if(exact.length!==1)throw new Error(`Supplier/date/reference archive lookup mismatch=${exact.length}`);
  const got=await readObject(prep.bucket,prep.path);if(!sameBytes(got,payload))throw new Error('Authenticated attachment read content mismatch');

  const auditsBefore=await global.rest('audit_logs',`select=id,action,entity_type,entity_id&entity_type=eq.purchase_attachment&entity_id=eq.${id}&order=id`);
  const actionsBefore=new Set((auditsBefore||[]).map(x=>x.action));
  if(!actionsBefore.has('purchase_attachment_prepare')||!actionsBefore.has('purchase_attachment_finalize'))throw new Error(`Attachment audit missing prepare/finalize: ${JSON.stringify([...actionsBefore])}`);

  const del1=await global.rpc('purchase_attachment_soft_delete_v1',{p_attachment_id:id,p_reason:`Acceptance cleanup ${run}`});
  const del2=await global.rpc('purchase_attachment_soft_delete_v1',{p_attachment_id:id,p_reason:`Acceptance cleanup ${run}`});
  if(del1!==true||del2!==true)throw new Error('Attachment soft-delete idempotency failed');
  const hidden=await global.rpc('purchase_attachment_list_v1',{p_branch_id:branch(),p_supplier_id:supplier,p_from:today,p_to:today,p_search:ref});
  if((hidden||[]).some(x=>Number(x.id)===id))throw new Error('Soft-deleted attachment still appears in archive');
  const auditsAfter=await global.rest('audit_logs',`select=id,action&entity_type=eq.purchase_attachment&entity_id=eq.${id}&order=id`);
  if(!(auditsAfter||[]).some(x=>x.action==='purchase_attachment_soft_delete'))throw new Error('Attachment soft-delete audit missing');
  evidence={attachment_id:id,supplier_id:supplier,archive_matches:exact.length,bytes:payload.length,audit_rows:(auditsAfter||[]).length,soft_deleted:true};
 }catch(e){originalError=e}
 let clean=null;try{clean=await cleanup(run)}catch(e){if(!originalError)originalError=e}
 if(originalError)throw originalError;
 return {status:'PASS',detail:`supplier=${evidence.supplier_id}; upload=ok; finalize=idempotent; archive=supplier+date+reference; authenticated_read=ok; soft_delete=hidden; audit=${evidence.audit_rows}; cleanup=zero`,evidence:{...evidence,cleanup_zero:Number(clean?.residue||0)===0&&Number(clean?.storage_residue||0)===0}};
}
function register(){const reg=R();if(!reg||global.__SharawlaPurchasingAttachmentsAcceptanceV54Registered)return false;global.__SharawlaPurchasingAttachmentsAcceptanceV54Registered=true;reg.registerMany([
 {id:'purchasing.attachments-runtime-roundtrip',name:'Purchasing Attachment → Private Storage → Archive Filter → Read → Soft Delete → Cleanup',pack:'shared-core',profile:'retail',level:'full',mode:'write',features:['inventory.purchase_orders'],run:purchasingAttachmentRoundtrip}
 ]);return true}
if(!register())global.addEventListener('sharawla-acceptance-registry-ready',register,{once:true});
global.__SharawlaPurchasingAttachmentsAcceptanceV54=Object.freeze({version:VERSION,register});
})(window);
