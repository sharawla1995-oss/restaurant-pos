'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const cleanup=read('supabase-beta54-acceptance-shared-core-extra-cleanup.sql');
const acceptance=read('owner-acceptance-shared-core-extra-v54.js');
const lazy=read('owner-acceptance-lazy-loader-v47.js');
const sync=read('scripts/sync-version.js');
const syntax=read('scripts/check-runtime-syntax.js');

for(const token of [
 'sharawla_beta54_customer_acceptance_cleanup_v1',
 'sharawla_beta54_treasury_acceptance_cleanup_v1',
 "r !~ '^ACC-[A-Za-z0-9-]{8,80}$'",
 "name='Acceptance Customer '||r",
 "notes='SHARAWLA_ACCEPTANCE:'||r",
 "movement_type in ('cash_in','cash_out')",
 "reference=r",
 "if auth.uid() is null or not public.is_admin()",
 "'residue'"
])assert(cleanup.includes(token),`Beta54 shared-core extra cleanup invariant missing: ${token}`);
for(const forbidden of ['SH-0005','SH-0006','Top Burger'])assert(!cleanup.includes(forbidden),`Acceptance cleanup contains production token: ${forbidden}`);

for(const token of [
 "id:'shared.customer-create-roundtrip'",
 "id:'shared.treasury-manual-roundtrip'",
 "id:'shared.permission-ui-contract'",
 "rpc('customer_create_v2'",
 'Duplicate customer phone was not rejected',
 "action=eq.customer_create",
 "rpc('treasury_manual_post_v1'",
 'Treasury cash-in idempotency failed',
 'Treasury cash-out idempotency failed',
 "action=eq.treasury_manual_post",
 "'customers.create'",
 "'hr.employees.view'",
 "'hr.payroll.pay'",
 "'treasury.post'",
 "'purchasing.attachments.view'",
 "global.__SharawlaBeta54SharedCore.refreshPermissions()",
 "global.showPage('customers')",
 "document.querySelector('#newCustomerBtn')",
 "global.showPage('purchasing')",
 'أرشيف فواتير الموردين',
 'cleanup=zero'
])assert(acceptance.includes(token),`Beta54 shared-core runtime coverage invariant missing: ${token}`);
assert(!acceptance.includes("features:['core.users']"),'Shared Core extra acceptance must not fake capability coverage');

assert(lazy.includes("['owner-acceptance-shared-core-extra-v54','owner-acceptance-shared-core-extra-v54.js?v=10.5.4-beta.54']"),'Extended shared-core acceptance must be lazy-loaded');
assert(lazy.indexOf('owner-acceptance-shared-core-v54.js')<lazy.indexOf('owner-acceptance-shared-core-extra-v54.js')&&lazy.indexOf('owner-acceptance-shared-core-extra-v54.js')<lazy.indexOf('owner-acceptance-purchasing-attachments-v54.js'),'Extended shared-core acceptance load order is unsafe');
assert(sync.includes("'owner-acceptance-shared-core-extra-v54.js'"),'Version sync must own extended shared-core acceptance');
assert(syntax.includes("'owner-acceptance-shared-core-extra-v54.js'"),'Runtime syntax gate must cover extended shared-core acceptance');

console.log('Beta54 Shared Core Runtime Coverage gate PASS — customer create/duplicate/audit/cleanup + manual treasury idempotency/audit/cleanup + permission-gated UI visibility');
