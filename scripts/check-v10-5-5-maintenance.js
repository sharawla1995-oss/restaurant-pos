const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const assert=(ok,msg)=>{if(!ok){console.error('FAIL:',msg);process.exit(1)}};

const app=read('app.js');
const sql=read('supabase-v10-5-4-delivery-settlement-atomic.sql');
const pkg=JSON.parse(read('package.json'));
const ver=JSON.parse(read('version.json'));
const updater=JSON.parse(read('update-config.json'));

try{new Function(app)}catch(e){console.error('FAIL: app.js syntax',e);process.exit(1)}

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
  'add column if not exists client_tx_id text',
  'add column if not exists request_digest text',
  'driver_settlements_client_tx_uidx',
  'security definer',
  'public.is_admin()',
  'for update',
  "raise exception 'client_tx_id مستخدم ببيانات مختلفة'",
  'revoke all on function public.settle_driver_orders_v1',
  'grant execute on function public.settle_driver_orders_v1'
])assert(sql.toLowerCase().includes(marker.toLowerCase()),'sql marker '+marker);

console.log('V10.5.5_PRODUCTION_MAINTENANCE_CHECK_PASS');
