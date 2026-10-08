'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json')),ver=JSON.parse(read('version.json'));
const app=read('app.js'),css=read('styles.css'),engine=read('restaurant-engine.js'),index=read('index.html');
const runtime=read('v10-5-14-ops-hr-summary.js'),hr=read('hr-core-admin-v1.js'),staff=read('staff/app.js');
const staffIndex=read('staff/index.html'),staffSw=read('staff/sw.js'),edge=read('supabase/functions/hr-staff-api/index.ts');
const hrStaffHost=read('supabase/functions/hr-staff-app/index.ts');
const sql=read('supabase-v10-5-14-ops-hr-notifications-summary.sql');
const must=(s,n,m)=>assert(s.includes(n),m||('missing '+n));
const mustNot=(s,n,m)=>assert(!s.includes(n),m||('forbidden '+n));

assert(['10.5.14','10.5.15','10.5.16','10.5.17'].includes(pkg.version),'supported package version');assert.equal(ver.version,pkg.version);assert.ok(['candidate','stable'].includes(ver.channel));
must(index,'V'+pkg.version,'UI version');must(index,'v10-5-14-ops-hr-summary.js?v='+pkg.version,'v14 runtime loaded');
for(const asset of ['styles.css','sharawla-runtime-core.js','restaurant-engine.js','food-recipe-ui-v1.js','app.js','hr-core-admin-v1.js','hr-attendance-admin-v1.js'])must(index,asset+'?v='+pkg.version,'cache stamp '+asset);

// Orders: day-first, date-bounded server query, 100/page, no old sequential online cache loop.
must(app,'const today=()=>','orders today default');must(app,"created_at=gte.","orders server from");must(app,"created_at=lt.","orders server to");
must(app,'pageSize=100','orders page size');must(app,'offset=','orders pagination');must(app,'ordersFrom','orders from UI');must(app,'ordersTo','orders to UI');
mustNot(app,'for(const o of rows){const old=bundles.find','old sequential order cache loop');

// Delivery: permission-based settlement + payment editable before settlement + handover confirmation.
must(app,"hasFeaturePermission('deliverySettlement')",'settlement permission');must(app,'تحتاج صلاحية التسوية','settlement copy');
must(app,'confirmDeliveryPaymentAtHandover','handover payment confirmation');must(app,"change_delivery_order_payment_v1",'payment correction owner');
must(app,"!o.driver_settled_at",'payment edit before settlement');must(app,"data-change-payment",'payment edit action');

// Customer 360 contrast.
must(css,'.customer-360-kpis b{color:#111827!important}','Customer 360 light contrast');
must(css,'.customer-360-kpis b,.v14-summary-kpis b{color:#f8fafc!important}','Customer 360 dark contrast');

// Permission model: HR approval group separated from branch finance.
must(engine,"['branch.hr.adjustments.request','الفرع • رفع طلب جزاء / مكافأة']",'branch adjustment request permission');
must(engine,"['branch.hr.finance.disburse','الفرع • صرف السلف والمرتبات المعتمدة']",'branch finance permission');
const hrGroup=engine.slice(engine.indexOf("['👥 الموارد البشرية'"),engine.indexOf("['🏪 مدير الفرع / HR المالي'"));
assert(hrGroup.length>0);mustNot(hrGroup,'treasury.post','treasury must not be in HR group');mustNot(hrGroup,'hr.advances.disburse','advance pay must not be in HR group');mustNot(hrGroup,'hr.payroll.pay','payroll pay must not be in HR group');
must(app,'data-toggle-hr-all','HR select all UI');must(app,"startsWith('hr.')",'HR select all scope');

// HR approval-only UI and approved-only payroll source.
must(hr,'hr_adjustment_decide_v2','adjustment decision UI');must(hr,'HR يعتمد السلفة فقط','HR advance wording');must(hr,'HR يجهز ويعتمد المسير','HR payroll wording');
must(sql,"approval_status='approved'",'approved-only adjustment payroll');
must(sql,"public.has_permission('branch.hr.finance.disburse')",'branch finance server guard');
must(sql,'create or replace function public.hr_payroll_pay_v1','legacy payroll pay secured');
must(sql,'create or replace function public.hr_advance_disburse_v1','advance pay secured');

// Notifications, strict request replay, Staff self-service and Edge boundary.
for(const token of ['app_notifications_v1','app_notify_permission_v14','trg_app_notify_return_approval_v14','trg_app_notify_advance_v14','trg_app_notify_adjustment_v14','trg_app_notify_leave_v14'])must(sql,token,'notification contract '+token);
must(sql,'hr_staff_advance_request_v1','Staff advance RPC');must(sql,'hr_staff_notification_read_v1','Staff notification ack');
must(sql,'request_digest text','request digest');must(sql,'client_tx_id مستخدم بطلب خصم/مكافأة مختلف','adjustment changed-payload rejection');must(sql,'نفس client_tx_id مستخدم بطلب سلفة مختلف','advance changed-payload rejection');
must(edge,'action==="advance-request"','Edge advance route');must(edge,'action==="notification-read"','Edge notification route');
must(staff,'openAdvanceRequest','Staff advance UI');must(staff,'advance_requests','Staff advance snapshot');must(staff,'notifications','Staff notifications');must(staff,'payroll','Staff payroll view');
must(staffSw,'sharawla-staff-v10.5.14-hr2','Staff cache generation');must(staffIndex,'app.js?v=10.5.14','Staff app cache stamp');
must(hrStaffHost,'/functions/v1/hr-staff-app','production Staff host route');must(hrStaffHost,'https://kzokretuuigjhxjzdlmk.supabase.co','production Staff project');must(hrStaffHost,'10.5.14-hr2','production Staff host embeds current app');mustNot(hrStaffHost,'xihcxydjnzemflhedzor','production Staff host must not target Beta');
mustNot(staff,'SUPABASE_SERVICE_ROLE_KEY','Staff client must not contain service key');

// Summary V2.
must(sql,'business_summary_v2','Summary RPC');for(const t of ["'orders_count'","'sales_total'","'returns_total'","'expenses_total'","'discounts_total'","'order_types'","'payments'","'hourly'","'top_products'","'branches'","'latest_orders'"])must(sql,t,'summary field '+t);
must(runtime,'📈 الملخص','Summary nav');must(runtime,'كل الفروع المصرح بها','Summary branch scope');must(runtime,'مقارنة الفروع','Summary branch comparison');must(runtime,'أحدث الطلبات','Summary latest orders');

// Candidate safety.
mustNot(sql,'canonical stock','Canonical Stock must stay off');mustNot(sql,'drop table','no destructive table drop');
assert(((sql.match(/\$\$/g)||[]).length%2)===0,'unbalanced SQL $$ quoting');
assert(!/\bas \$\s*$/m.test(sql),'malformed SQL function opener');assert(!/^\$;\s*$/m.test(sql),'malformed SQL function closer');
must(runtime,'setInterval(syncContext,10000)','notification/context polling');
must(runtime,'branch_hr_finance_queue_v1','branch finance queue UI');
must(runtime,'hr_adjustment_create_v1','branch adjustment request UI');

console.log('V10.5.14_OPS_HR_NOTIFICATIONS_SUMMARY_STATIC_PASS');
