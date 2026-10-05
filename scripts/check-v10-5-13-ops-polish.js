const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const app=read('app.js');
const eng=read('restaurant-engine.js');
const index=read('index.html');
const sql=read('supabase-v10-5-13-ops-polish-batch.sql');
const recipe=read('supabase-v10-5-8-recipe-soft-consumption-v1.sql');
const css=read('styles.css');

function must(hay,needle,label){
  if(!hay.includes(needle))throw new Error('FAIL '+label+': missing '+needle);
}
function mustNot(hay,needle,label){
  if(hay.includes(needle))throw new Error('FAIL '+label+': forbidden '+needle);
}
function count(hay,needle){return hay.split(needle).length-1}

must(index,'V10.5.13','candidate UI version');
must(index,'data-page="approvals"','approvals navigation');
must(app,"$$('#nav button').forEach",'10.5.12 branch-open fix preserved');
must(app,"approvals:renderReturnApprovals",'approval route');
must(app,"request_order_return_approval_v1",'return approval request');
must(app,"decide_order_return_approval_v1",'return approval decision');
must(app,"hasFeaturePermission('returnExecute')",'direct return permission');
must(app,"hasFeaturePermission('returnApprovals')",'approval permission');
must(app,"hasFeaturePermission('deliverySettlement')",'settlement permission');
must(app,"change_delivery_order_payment_v1",'delivery payment correction UI');
must(app,"data-change-payment",'delivery payment action');
must(app,"customer_360_v1",'Customer 360 RPC');
must(app,'data-customer-file','Customer 360 list action');
must(app,'loadCustomerQuickSummary(c)','POS Customer 360 summary');
must(app,'مصدر الإضافات الآن هو الأصناف داخل تصنيف «إضافات»','unified extras UI');
mustNot(app,'id="mName"','legacy direct modifier editor removed');
mustNot(app,"$('#addModifier').onclick",'legacy direct modifier writer removed');
must(app,'مبيعات الإضافات</h3>','unified extras report');
must(app,'standaloneExtraRows','standalone/internal extras merge');
must(app,'font-size:12px;line-height:1.32;font-weight:700','shift print readability');
must(css,'.customer-360-kpis','Customer 360 styling');
must(css,'#returnApprovalBadge','approval badge styling');

must(eng,"approvals:'returns'",'approval module ownership');
must(eng,"['returnExecute','↩️ تنفيذ المرتجع مباشرة']", 'return execute permission definition');
must(eng,"['returnApprovals','✅ اعتماد المرتجعات']", 'return approvals permission definition');
must(eng,"['deliverySettlement','💰 تسوية تحصيلات المندوبين']", 'delivery settlement permission definition');
must(eng,"['deliveryPaymentCorrection','💳 تعديل طريقة دفع الدليفري']", 'delivery payment correction permission definition');
must(eng,"foodRecipes:'food.recipes'",'Recipe feature gate preserved');

must(sql,'source_product_id bigint references public.products','extras source product link');
must(sql,'sync_extra_product_modifier_v1','extras sync owner');
must(sql,"public.has_permission('deliverySettlement')",'server settlement permission');
must(sql,'change_delivery_order_payment_v1','atomic delivery payment RPC');
must(sql,'for update;','row lock contracts');
must(sql,'public.order_payments','payment ledger updated');
must(sql,'delivery_payment_method_changed','payment change audit');
must(sql,'customer_360_v1','Customer 360 read model');
must(sql,'return_approval_requests','return approval durable table');
must(sql,'request_order_return_approval_v1','return approval request RPC');
must(sql,'decide_order_return_approval_v1','return approval decision RPC');
must(sql,"public.has_permission('returnApprovals')",'server approval permission');
must(sql,"public.has_permission('returnExecute')",'server direct-return permission');
must(sql,'معرف الحركة مستخدم ببيانات مختلفة','return replay changed-payload rejection');
must(sql,'client_tx_id text not null','durable idempotency');
must(recipe,'trg_recipe_return_item_fail_open_v1','Recipe return snapshot trigger preserved');
mustNot(sql,'drop trigger trg_recipe_return_item_fail_open_v1','Recipe return trigger not removed');
mustNot(sql,'canonical stock','Canonical Stock not activated');

if(count(app,"hasFeaturePermission('deliverySettlement')")<2)throw new Error('FAIL settlement permission must cover bulk and single order UI');
if(count(app,'startReturnApprovalWatch()')<2)throw new Error('FAIL approval watcher not wired to runtime');

console.log('V10.5.13_OPS_POLISH_STATIC_PASS');
console.log('Six-scope contract gate PASS');
