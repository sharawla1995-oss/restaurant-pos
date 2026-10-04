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
