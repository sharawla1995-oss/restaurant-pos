'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const sql=read('supabase-purchasing-attachments-v1.sql');
const ui=read('purchasing-attachments-v1.js');
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
 "const P={view:'purchasing.attachments.view',upload:'purchasing.attachments.upload',del:'purchasing.attachments.delete'}",
 "b.textContent='🗂️ أرشيف فواتير الموردين'",
 "purchase_attachment_prepare_v1",
 "purchase_attachment_finalize_v1",
 "purchase_attachment_abort_v1",
 "purchase_attachment_soft_delete_v1",
 "purchase_attachment_list_v1",
 "/storage/v1/object/",
 "/storage/v1/object/authenticated/",
 'حد أقصى 15MB للملف',
 'رفع الصور يحتاج اتصال بالإنترنت. يمكنك فتح الفاتورة ورفع المستند لاحقًا.',
 'global.__SharawlaPurchasingAttachmentsV1'
])assert(ui.includes(token),`Purchasing attachments UI invariant missing: ${token}`);

assert(loader.includes("['purchasing-attachments-v1','purchasing-attachments-v1.js?v=10.5.4-beta.54']"),'Attachment runtime must be wired after permissions/shared core');
assert(loader.indexOf("['permissions-v2'")<loader.indexOf("['purchasing-attachments-v1'"),'Attachment runtime load order must follow permissions');
assert(sync.includes("'purchasing-attachments-v1.js'"),'Version sync must own attachment runtime');
assert(syntax.includes("'purchasing-attachments-v1.js'"),'Runtime syntax gate must include attachment runtime');
assert(blueprint.includes('Supplier invoices'),'Functional Blueprint must retain supplier invoice attachments scope');

console.log('Purchasing Attachments V1 gate PASS — private Storage + supplier/date archive + permission-gated upload/view/delete + audit + soft delete');
