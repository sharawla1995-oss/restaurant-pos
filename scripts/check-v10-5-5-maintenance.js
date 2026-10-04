const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const assert=(ok,msg)=>{if(!ok){console.error('FAIL:',msg);process.exit(1)}};

const app=read('app.js');
const main=read('main.js');
const sql=read('supabase-v10-5-4-delivery-settlement-atomic.sql');
const pkg=JSON.parse(read('package.json'));
const ver=JSON.parse(read('version.json'));
const updater=JSON.parse(read('update-config.json'));

try{new Function(app)}catch(e){console.error('FAIL: app.js syntax',e);process.exit(1)}
try{new Function(main)}catch(e){console.error('FAIL: main.js syntax',e);process.exit(1)}

assert(pkg.version==='10.5.5','package version');
assert(ver.version==='10.5.5'&&ver.channel==='stable','version.json stable');
assert(updater.enabled===true&&updater.channel==='stable','stable updater enabled');

for(const marker of [
  'function receiptModifierHTML',
  "rest('order_item_modifiers'",
  'مبيعات التصنيفات والأصناف',
  'مبيعات الإضافات الداخلية',
  'تفاصيل الطلبات',
  'settle_driver_orders_v1',
  'data-settle-driver',
  'data-settle-order',
  'data-filter="unsettled"',
  'const settlementHistoryPanel=',
  'missingReturnedItemIds',
  'لا يمكن قفل الوردية:',
  'تعذر فحص التسويات القديمة',
  "auto_print_customer:printCfg(currentBranchId()).auto_print_customer"
])assert(app.includes(marker),'app marker '+marker);

assert(app.includes("fetchAll('orders',`select=*&branch_id=eq.\${currentBranchId()}&order_type=eq.delivery&status=eq.delivered&payment_method=eq.cash&driver_settled_at=is.null"),'all accumulated unsettled deliveries are loaded');
assert(!app.includes('تعذر فحص تسويات الدليفري — اتأكد من الإنترنت قبل قفل الوردية'),'network failure must not create a new hard close blocker');

const dsStart=app.indexOf('async function renderDeliverySettings(){');
const dsEnd=app.indexOf('\nasync function renderUsers()',dsStart);
assert(dsStart>=0&&dsEnd>dsStart,'delivery settings bounds');
const ds=app.slice(dsStart,dsEnd);
assert(!ds.includes('driver_settlements'),'settlements removed from delivery settings');
assert(!ds.includes('data-settle='),'legacy settlement button removed');


for(const marker of [
  'function pendingLocalOperationCount',
  'function sha256File',
  'function createPreUpdateBackup(remoteVersion)',
  "asset.digest",
  'Downloaded installer SHA-256 mismatch',
  'pendingAfterDownload',
  'createPreUpdateBackup(remote)',
  "blocked:'pending-local-operations'"
])assert(main.includes(marker),'updater safety marker '+marker);

const backupStart=main.indexOf('function createPreUpdateBackup(remoteVersion)');
const backupEnd=main.indexOf('function saveJsonBackup(',backupStart);
assert(backupStart>=0&&backupEnd>backupStart,'pre-update backup bounds');
const backupBody=main.slice(backupStart,backupEnd);
assert(!backupBody.includes('persistDb()'),'pre-update backup must not call persistDb');
assert(!backupBody.includes('createBackup('),'pre-update backup must not call createBackup');
for(const marker of [
  'db.export()',
  'process.pid',
  'Date.now()',
  'crypto.randomBytes',
  "fs.openSync(tmp,'wx')",
  'fs.fsyncSync(fd)',
  'fs.renameSync(tmp,target)',
  'fs.constants.COPYFILE_EXCL',
  "fs.openSync(target,'r+')",
  'fs.fsyncSync(finalFd)',
  'if(targetCreated&&!success)try{fs.unlinkSync(target)}catch{}'
])assert(backupBody.includes(marker),'pre-update backup hardening marker '+marker);

assert(!main.includes("createBackup('pre-update')"),'unsafe pre-update backup path must stay absent');

// ===== Production Isolation Guard =====
const releaseWorkflow=read('.github/workflows/build-windows-release.yml');
const candidateWorkflow=read('.github/workflows/v10-5-5-production-maintenance-candidate.yml');
const restaurantEngine=read('restaurant-engine.js');

assert(!/[-+](?:beta|rc|alpha|dev|canary)/i.test(pkg.version),'production package version must not be prerelease');
assert(ver.channel==='stable','production version channel must stay stable');
assert(updater.channel==='stable','production updater channel must stay stable');
assert(main.includes('/releases/latest'),'production updater must use GitHub latest stable release endpoint');

for(const forbiddenPath of [
  'supabase-v10-5-6-return-approval-v1.sql',
  'scripts/check-return-approval-v1.js',
  '.github/workflows/return-approval-v1-candidate.yml'
]){
  assert(!fs.existsSync(path.join(root,forbiddenPath)),'beta/return-approval artifact leaked into production maintenance: '+forbiddenPath);
}

for(const [name,source] of [['app.js',app],['main.js',main],['restaurant-engine.js',restaurantEngine]]){
  for(const marker of ['return_approval_requests','returnApprovals','v10_5_6_return_approval']){
    assert(!source.includes(marker),'return-approval marker leaked into production source: '+name+' -> '+marker);
  }
}

assert(releaseWorkflow.includes('workflow_dispatch:'),'stable release workflow must remain manual');
assert(!releaseWorkflow.includes('\n  push:\n'),'stable release workflow must not publish on push');
assert(releaseWorkflow.includes("if: github.ref_name == 'release/v10.5.5-production-maintenance'"),'stable release workflow must be locked to the dedicated release branch');
assert(!releaseWorkflow.includes('--clobber'),'stable release assets must be immutable');
assert(!releaseWorkflow.includes('git tag -f'),'stable tags must never be force-moved');
assert(!releaseWorkflow.includes('git push origin')||!releaseWorkflow.includes('--force'),'stable tags must never be force-pushed');
assert(releaseWorkflow.includes('Refuse existing stable tag or release'),'stable workflow must refuse existing immutable releases');

assert(candidateWorkflow.includes('contents: read'),'candidate workflow must stay read-only to repository contents');
assert(!candidateWorkflow.includes('contents: write'),'candidate workflow must not gain write permission');
assert((candidateWorkflow.match(/--publish never/g)||[]).length>=2,'candidate x64/ia32 builds must never publish');
assert(!candidateWorkflow.includes('gh release'),'candidate workflow must never create or mutate releases');
assert(!candidateWorkflow.includes('git tag'),'candidate workflow must never create or move tags');

for(const marker of [
  'add column if not exists client_tx_id text',
  'add column if not exists request_digest text',
  'driver_settlements_client_tx_uidx',
  'security definer',
  'public.is_admin()',
  'pg_advisory_xact_lock',
  "hashtextextended('settle_driver_orders_v1:'",
  'for update',
  "raise exception 'client_tx_id مستخدم ببيانات مختلفة'",
  'revoke all on function public.settle_driver_orders_v1',
  'grant execute on function public.settle_driver_orders_v1'
])assert(sql.toLowerCase().includes(marker.toLowerCase()),'sql marker '+marker);

console.log('V10.5.5_PRODUCTION_MAINTENANCE_CHECK_PASS');
