'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const sql=read('supabase-purchasing-attachments-v1.sql');
const cleanup=read('supabase-beta54-acceptance-purchase-attachments-cleanup.sql');
const ui=read('purchasing-attachments-v1.js');
const acceptance=read('owner-acceptance-purchasing-attachments-v54.js');
const loader=read('beta36-integration-loader.js');
const sync=read('scripts/sync-version.js');
const syntax=read('scripts/check-runtime-syntax.js');
const blueprint=read('docs/SHARAWLA-FUNCTIONAL-BLUEPRINT-V1.md');

for(const token of [
 "'purchasing.attachments.view'",
 "'purchasing.attachments.upload'",
 "'purchasing.attachments.delete'",
 "'purchase-documents','purchase-documents',false",
 'file_size_limit=excluded.file_size_limit',
 'create table if not exists public.purchase_attachments',
 "status text not null default 'pending'",
 'create policy purchase_documents_read_v1',
 'create policy purchase_documents_upload_v1',
 "has_action_permission_v2('purchasing.attachments.view')",
 "has_action_permission_v2('purchasing.attachments.upload')",
 'purchase_attachment_prepare_v1',
 'purchase_attachment_finalize_v1',
 'purchase_attachment_soft_delete_v1',
 'purchase_attachment_list_v1',
 "'purchase_attachment_finalize'",
 "'purchase_attachment_soft_delete'"
])assert(sql.includes(token),`Purchasing attachments SQL invariant missing: ${token}`);
assert(!sql.includes("public=true"),'Purchase document bucket must never be public');
assert(!sql.includes('SH-0005')&&!sql.includes('SH-0006'),'Production devices must not appear in attachment migration');

for(const token of [
 'sharawla_beta54_purchase_attachment_cleanup_v1',
 "r !~ '^ACC-[A-Za-z0-9-]{8,80}$'",
 "refv:='ACC-PA-'||r",
 "original_file_name=('acceptance-'||r||'.png')",
 'delete from storage.objects',
 "entity_type='purchase_attachment'",
 "'residue'"
])assert(cleanup.includes(token),`Attachment acceptance cleanup invariant missing: ${token}`);
assert(!cleanup.includes('SH-0005')&&!cleanup.includes('SH-0006'),'Attachment cleanup must never target production devices');

for(const token of [
 "const P={view:'purchasing.attachments.view',upload:'purchasing.attachments.upload',del:'purchasing.attachments.delete'}",
 "b.textContent='🗂️ أرشيف فواتير الموردين'",
 'purchase_attachment_prepare_v1','purchase_attachment_finalize_v1','purchase_attachment_abort_v1','purchase_attachment_soft_delete_v1','purchase_attachment_list_v1',
 '/storage/v1/object/','/storage/v1/object/authenticated/','حد أقصى 15MB للملف',
 'رفع الصور يحتاج اتصال بالإنترنت. يمكنك فتح الفاتورة ورفع المستند لاحقًا.',
 'global.__SharawlaPurchasingAttachmentsV1'
])assert(ui.includes(token),`Purchasing attachments UI invariant missing: ${token}`);

for(const token of [
 "id:'purchasing.attachments-runtime-roundtrip'",
 'sharawla_beta54_purchase_attachment_cleanup_v1',
 "'purchasing.attachments.view','purchasing.attachments.upload','purchasing.attachments.delete'",
 'purchase_attachment_prepare_v1',
 '/storage/v1/object/',
 'purchase_attachment_finalize_v1',
 'if(f1!==true||f2!==true)',
 'purchase_attachment_list_v1',
 'p_supplier_id:supplier,p_from:today,p_to:today,p_search:ref',
 '/storage/v1/object/authenticated/',
 'sameBytes(got,payload)',
 "purchase_attachment_prepare'",
 "purchase_attachment_finalize'",
 'purchase_attachment_soft_delete_v1',
 "purchase_attachment_soft_delete'",
 "cleanup=zero"
])assert(acceptance.includes(token),`Attachment runtime acceptance invariant missing: ${token}`);

assert(loader.includes("['purchasing-attachments-v1','purchasing-attachments-v1.js?v=10.5.4-beta.54']"),'Attachment runtime must be wired after permissions/shared core');
assert(loader.indexOf("['permissions-v2'")<loader.indexOf("['purchasing-attachments-v1'"),'Attachment runtime load order must follow permissions');
assert(sync.includes("'purchasing-attachments-v1.js'"),'Version sync must own attachment runtime');
assert(sync.includes("'owner-acceptance-purchasing-attachments-v54.js'"),'Owner acceptance lazy loader must include purchasing attachment runtime acceptance');
assert(sync.indexOf("'owner-acceptance-shared-core-v54.js'")<sync.indexOf("'owner-acceptance-purchasing-attachments-v54.js'"),'Attachment acceptance must load after shared-core acceptance');
assert(syntax.includes("'purchasing-attachments-v1.js'"),'Runtime syntax gate must include attachment runtime');
assert(syntax.includes("'owner-acceptance-purchasing-attachments-v54.js'"),'Runtime syntax gate must include attachment acceptance runtime');
assert(blueprint.includes('Supplier invoices'),'Functional Blueprint must retain supplier invoice attachments scope');

console.log('Purchasing Attachments V1 gate PASS — private Storage + real runtime upload/read/archive/delete roundtrip + exact cleanup + permissions/audit');
