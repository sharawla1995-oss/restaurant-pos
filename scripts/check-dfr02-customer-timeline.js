const fs=require('fs'),path=require('path');
const root=process.argv[2]||process.cwd();
const sql=fs.readFileSync(path.join(root,'supabase-dfr02-customer-timeline-read-model.sql'),'utf8');
const js=fs.readFileSync(path.join(root,'customer-timeline-v1.js'),'utf8');
const need=["customer_timeline_v1","auth.uid() is null","has_permission('customers')","has_branch_access(p_branch_id)","o.customer_id=p_customer_id","join public.orders o on o.id=r.order_id","public.order_payments","public.return_payments","سجل مبيعات تشغيلي — ليس كشف حساب مالي","data-customer-file"];
for(const t of need)if(!(sql+js).includes(t))throw new Error('DFR-02 missing '+t);
for(const bad of [/\binsert\s+into\s+public\.(orders|returns|customers|customer_addresses)\b/i,/\bupdate\s+public\.(orders|returns|customers|customer_addresses)\b/i,/\bdelete\s+from\s+public\.(orders|returns|customers|customer_addresses)\b/i])if(bad.test(sql))throw new Error('DFR-02 operational DML forbidden');
if(/accounts receivable|balance due|كشف حساب مدين|رصيد مستحق/i.test(js))throw new Error('DFR-02 must not claim AR/balance');
console.log('DFR-02 PASS — read-only customer timeline, branch/customer gates, original-order return attribution, non-accounting UI');