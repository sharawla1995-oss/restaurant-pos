'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const loader=read('beta36-integration-loader.js'),registry=read('owner-acceptance-registry-v3.js'),lab=read('owner-acceptance-network-lab.js'),mainLab=read('beta46-acceptance-network-main.js'),mainAdvanced=read('beta46-acceptance-advanced-main.js'),mainRecovery=read('beta46-acceptance-recovery-main.js'),e2e=read('owner-acceptance-e2e-v3.js'),packs=read('owner-acceptance-profile-packs-v3.js'),advanced=read('owner-acceptance-advanced-v4.js'),recoveryPermissions=read('owner-acceptance-recovery-permissions-v5.js'),preload=read('preload.js'),main44=read('main-beta44.js');
function need(src,t,msg=t){assert(src.includes(t),`Beta46 acceptance missing: ${msg}`)}
function no(src,t,msg=t){assert(!src.includes(t),`Beta46 acceptance forbidden: ${msg}`)}
for(const t of ['owner-acceptance-registry-v3.js','owner-acceptance-network-lab.js','owner-diagnostics-universal-v2.js','owner-acceptance-e2e-v3.js','owner-acceptance-profile-packs-v3.js','owner-acceptance-advanced-v4.js','owner-acceptance-recovery-permissions-v5.js'])need(loader,t);
assert(loader.indexOf('owner-acceptance-registry-v3.js')<loader.indexOf('owner-acceptance-network-lab.js'),'Registry must load before network lab');
assert(loader.indexOf('owner-acceptance-network-lab.js')<loader.indexOf('owner-acceptance-e2e-v3.js'),'Network lab must load before E2E pack');
assert(loader.indexOf('owner-acceptance-e2e-v3.js')<loader.indexOf('owner-acceptance-profile-packs-v3.js'),'Core E2E must load before profile packs');
assert(loader.indexOf('owner-acceptance-profile-packs-v3.js')<loader.indexOf('owner-acceptance-advanced-v4.js'),'Profile packs must load before advanced reliability pack');
assert(loader.indexOf('owner-acceptance-advanced-v4.js')<loader.indexOf('owner-acceptance-recovery-permissions-v5.js'),'Advanced reliability pack must load before recovery/permissions pack');
for(const t of ['SH-0007','91826502-590e-4afa-8826-2c0f4b99c490','xihcxydjnzemflhedzor.supabase.co','FLAKY','QUARANTINED','READY_FOR_RC','setResume','coverage'])need(registry,t);
for(const t of ['offline','timeout','http500','slow','flap','lost_ack','networkSet','networkDisable'])need(lab,t);
for(const t of ['SH-0007','91826502-590e-4afa-8826-2c0f4b99c490','xihcxydjnzemflhedzor.supabase.co','lost_ack','ACCEPTANCE_SANDBOX_LOCK','acceptance:restart'])need(mainLab,t);
for(const t of ['SH-0007','91826502-590e-4afa-8826-2c0f4b99c490','offline_v2_outbox','VACUUM INTO','after_local_commit','acceptance:sqlite-compatibility','acceptance:crash-restart'])need(mainAdvanced,t);
for(const t of ['SH-0007','91826502-590e-4afa-8826-2c0f4b99c490','acceptance-lab','VACUUM INTO','sharawla-offline-v2.lastgood.sqlite','manifest.sha256','system_clock_changed:false','restored_into_live:false','acceptance:backup-restore-probe','acceptance:corruption-probe','acceptance:clock-sequence-probe','acceptance:temp-restore-cycle'])need(mainRecovery,t);
for(const t of ['Sandbox Triple Lock','retail.customer-crud','retail.sale-return-stock','retail.expense-idempotent','retail.offline-sale-sync','retail.lost-ack-idempotency','sharawla_acceptance_cleanup_v1','sharawla_acceptance_scan_v1','Full E2E Acceptance'])need(e2e,t);
for(const t of ['logistics.full-flow','membership.full-flow','service.full-flow','warehouse.po-idempotency','pharmacy.core-flow','restaurant.sale-return','sharawla_acceptance_cleanup_v3','sharawla_acceptance_scan_v3'])need(packs,t);
for(const t of ['offline.migration-compatibility-snapshot','retail.concurrent-idempotency-20x','finance.inventory-reconciliation','recovery.crash-point-guided','sharawla_acceptance_reconcile_v1','20 concurrent calls','Crash Resume Test'])need(advanced,t);
for(const t of ['permissions.all-profile-role-contracts','permissions.current-session-boundary','capabilities.enabled-feature-test-coverage','recovery.guard-health','auth.offline-cache-boundary','recovery.backup-lastgood-restore-copy','recovery.temp-restore-cycle','recovery.corruption-copy-detection','recovery.clock-drift-device-sequence','permissions.backend-role-impersonation','recovery.live-db-restore','system_clock_changed'])need(recoveryPermissions,t);
for(const t of ['acceptance:network-set','acceptance:network-state','acceptance:network-disable','acceptance:restart','acceptance:sqlite-compatibility','acceptance:crash-marker','acceptance:crash-marker-clear','acceptance:crash-restart','acceptance:backup-restore-probe','acceptance:corruption-probe','acceptance:clock-sequence-probe','acceptance:temp-restore-cycle'])need(preload,t);
need(main44,"require('./beta46-acceptance-network-main.js').installAcceptanceNetworkMain()",'main process network lab install');
need(main44,"require('./beta46-acceptance-advanced-main.js').installAcceptanceAdvancedMain()",'main process advanced lab install');
need(main44,"require('./beta46-acceptance-recovery-main.js').installAcceptanceRecoveryMain()",'main process recovery lab install');
for(const src of [registry,lab,mainLab,mainAdvanced,mainRecovery,e2e,packs,advanced,recoveryPermissions]){no(src,'SH-0005','production support code SH-0005');no(src,'SH-0006','production support code SH-0006');no(src,'3e405b6f-feba-4d5c-a4bf-bebb77f2d5d7','production business id');no(src,'kzokretuuigjhxjzdlmk','production backend host')}
no(mainRecovery,'setSystemTime','Windows system clock mutation');
no(mainRecovery,'SetSystemTime','Windows system clock mutation');
need(mainRecovery,'fs.truncateSync(bad','corruption must target isolated bad copy');
no(mainRecovery,'fs.truncateSync(live','live database corruption');
console.log('Beta46 Full Acceptance Center gate PASS — sandbox lock / all profile E2E / concurrency / reconciliation / migration / crash / permissions / backup-restore / corruption-copy / clock-sequence contracts verified');
