'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
const version=String(pkg.version||'');
const m=version.match(/^10\.5\.4-beta\.(\d+)(?:\.\d+)*$/);
assert(m&&Number(m[1])>=54,`Beta54+ package version required; got ${version}`);
const versionQuery=`?v=${version}`;
const sql=read('supabase-purchasing-attachments-v1.sql');
const cleanup=read('supabase-beta54-acceptance-purchase-attachments-cleanup.sql');
const hotfix=read('supabase-beta54-purchasing-attachments-storage-api-cleanup-fix.sql');
const ui=read('purchasing-attachments-v1.js');
const acceptance=read('owner-acceptance-purchasing-attachments-v54.js');
const loader=read('beta36-integration-loader.js');
const ownerLazy=read('owner-acceptance-lazy-loader-v47.js');
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
 'create policy purchase_documents_delete_v1',
 "has_action_permission_v2('purchasing.attachments.view')",
 "has_action_permission_v2('purchasing.attachments.upload')",
 "has_action_permission_v2('purchasing.attachments.delete')",
 'purchase_attachment_prepare_v1',
 'purchase_attachment_finalize_v1',
 'purchase_attachment_abort_v1',
 'purchase_attachment_soft_delete_v1',
 'purchase_attachment_list_v1',
 "'purchase_attachment_finalize'",
 "'purchase_attachment_abort'",
 "'purchase_attachment_soft_delete'"
])assert(sql.includes(token),`Purchasing attachments SQL invariant missing: ${token}`);
assert(!sql.includes("public=true"),'Purchase document bucket must never be public');
assert(!/delete\s+from\s+storage\.objects/i.test(sql),'Base attachment SQL must never mutate managed Storage tables directly');
assert(!sql.includes('SH-0005')&&!sql.includes('SH-0006'),'Production devices must not appear in attachment migration');

for(const token of [
 'sharawla_beta54_purchase_attachment_cleanup_manifest_v1',
 'sharawla_beta54_purchase_attachment_cleanup_v1',
 "r !~ '^ACC-[A-Za-z0-9-]{8,80}$'",
 "refv:='ACC-PA-'||r",
 "original_file_name=('acceptance-'||r||'.png')",
 'Storage objects remain; remove them through the Storage API first',
 "entity_type='purchase_attachment'",
 "'storage_residue'",
 "'residue'"
])assert(cleanup.includes(token),`Attachment acceptance cleanup invariant missing: ${token}`);
assert(!/delete\s+from\s+storage\.objects/i.test(cleanup),'Acceptance cleanup must never mutate managed Storage tables directly');
assert(!cleanup.includes('SH-0005')&&!cleanup.includes('SH-0006'),'Attachment cleanup must never target production devices');

for(const token of ['create policy purchase_documents_delete_v1','purchase_attachment_abort_v1','sharawla_beta54_purchase_attachment_cleanup_manifest_v1','Storage objects remain; remove them through the Storage API first'])assert(hotfix.includes(token),`Attachment Storage API hotfix invariant missing: ${token}`);
assert(!/delete\s+from\s+storage\.objects/i.test(hotfix),'Attachment hotfix must never mutate managed Storage tables directly');
assert(!hotfix.includes('SH-0005')&&!hotfix.includes('SH-0006'),'Attachment hotfix must never target production devices');

for(const token of [
 "const P={view:'purchasing.attachments.view',upload:'purchasing.attachments.upload',del:'purchasing.attachments.delete'}",
 "b.textContent='🗂️ أرشيف فواتير الموردين'",
 'purchase_attachment_prepare_v1','purchase_attachment_finalize_v1','purchase_attachment_abort_v1','purchase_attachment_soft_delete_v1','purchase_attachment_list_v1',
 '/storage/v1/object/','method:\'DELETE\'','JSON.stringify({prefixes:[String(path||\'\')]})',
 '/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath(path)}','حد أقصى 15MB للملف',
 'async function requireCloud(action)',
 "await requireCloud('رفع مرفقات المشتريات')",
 "await requireCloud('فتح أرشيف مرفقات المشتريات')",
 'global.__SharawlaPurchasingAttachmentsV1'
])assert(ui.includes(token),`Purchasing attachments UI invariant missing: ${token}`);

for(const token of [
 "id:'purchasing.attachments-runtime-roundtrip'",
 'sharawla_beta54_purchase_attachment_cleanup_manifest_v1',
 'sharawla_beta54_purchase_attachment_cleanup_v1',
 "'purchasing.attachments.view','purchasing.attachments.upload','purchasing.attachments.delete'",
 'purchase_attachment_prepare_v1','method:\'DELETE\'','JSON.stringify({prefixes:[String(path||\'\')]})',
 '/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath(path)}',
 'purchase_attachment_finalize_v1','if(f1!==true||f2!==true)','purchase_attachment_list_v1',
 'p_supplier_id:supplier,p_from:today,p_to:today,p_search:ref','sameBytes(got,payload)',
 "purchase_attachment_prepare'","purchase_attachment_finalize'",'purchase_attachment_soft_delete_v1',"purchase_attachment_soft_delete'",'cleanup=zero'
])assert(acceptance.includes(token),`Attachment runtime acceptance invariant missing: ${token}`);

assert(loader.includes(`['purchasing-attachments-v1','purchasing-attachments-v1.js${versionQuery}']`),'Attachment runtime must be wired after permissions/shared core');
assert(loader.indexOf("['permissions-v2'")<loader.indexOf("['purchasing-attachments-v1'"),'Attachment runtime load order must follow permissions');
assert(ownerLazy.includes(`['owner-acceptance-purchasing-attachments-v54','owner-acceptance-purchasing-attachments-v54.js${versionQuery}']`),'Owner lazy runtime must actually load purchasing attachment acceptance');
assert(ownerLazy.indexOf("['owner-acceptance-shared-core-v54'")<ownerLazy.indexOf("['owner-acceptance-purchasing-attachments-v54'"),'Attachment acceptance runtime must load after shared-core acceptance');
assert(sync.includes("'purchasing-attachments-v1.js'"),'Version sync must own attachment runtime');
assert(sync.includes("'owner-acceptance-purchasing-attachments-v54.js'"),'Version sync must own purchasing attachment runtime acceptance');
assert(sync.includes('Owner acceptance lazy loader missing required asset before version sync'),'Version sync must fail closed on missing owner acceptance wiring');
assert(syntax.includes("'purchasing-attachments-v1.js'"),'Runtime syntax gate must include attachment runtime');
assert(syntax.includes("'owner-acceptance-purchasing-attachments-v54.js'"),'Runtime syntax gate must include attachment acceptance runtime');
assert(blueprint.includes('Supplier invoices'),'Functional Blueprint must retain supplier invoice attachments scope');

console.log(`Purchasing Attachments V1 regression gate PASS on ${version} — private Storage + Storage API cleanup + runtime upload/read/archive/delete roundtrip + exact cleanup + permissions/audit + owner acceptance wiring`);
