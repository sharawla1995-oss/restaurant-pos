const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const assert=(ok,msg)=>{if(!ok){console.error('V10.5.6_RC1_FAIL:',msg);process.exit(1)}};

const app=read('app.js');
const main=read('main.js');
const pkg=JSON.parse(read('package.json'));
const ver=JSON.parse(read('version.json'));
const updater=JSON.parse(read('update-config.json'));
const releaseWorkflow=read('.github/workflows/build-windows-release.yml');
const settlementSql=read('supabase-v10-5-4-delivery-settlement-atomic.sql');

assert(pkg.version==='10.5.6-rc.1','package version');
assert(ver.version==='10.5.6-rc.1'&&ver.channel==='candidate','candidate version.json');
assert(updater.enabled===true&&updater.channel==='stable','stable updater config retained for final line');
assert(!/\n\s*push:\s*\n/.test(releaseWorkflow),'stable release workflow must not publish on push');
assert(releaseWorkflow.includes('workflow_dispatch'),'stable release workflow must be manual');

for(const marker of [
  'function receiptModifierHTML',
  'مبيعات التصنيفات والأصناف',
  'مبيعات الإضافات الداخلية',
  'تفاصيل الطلبات',
  'settle_driver_orders_v1',
  'data-settle-driver',
  'data-settle-order',
  'const settlementHistoryPanel=',
  'missingReturnedItemIds',
  'لا يمكن قفل الوردية:',
  'auto_print_customer:printCfg(currentBranchId()).auto_print_customer',
  'request_order_return_approval_v1',
  'decide_order_return_approval_v1',
  'renderReturnApprovals',
  'طلب اعتماد مدير'
])assert(app.includes(marker),'app marker '+marker);

for(const marker of [
  'function pendingLocalOperationCount',
  "status='pending'",
  'function sha256File',
  'asset.digest',
  'Downloaded installer SHA-256 mismatch',
  "createBackup('pre-update')",
  "blocked:'pending-local-operations'"
])assert(main.includes(marker),'updater marker '+marker);

for(const marker of [
  'driver_settlements_client_tx_uidx',
  'public.is_admin()',
  'for update',
  "raise exception 'client_tx_id مستخدم ببيانات مختلفة'"
])assert(settlementSql.toLowerCase().includes(marker.toLowerCase()),'settlement marker '+marker);

console.log('V10.5.6_RC1_CANDIDATE_CHECK_PASS');
