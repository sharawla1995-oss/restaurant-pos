#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=process.argv[2]||process.cwd();
const sqlPath=path.join(root,'supabase-dfr01-readonly-report-drilldowns.sql');
const uiPath=path.join(root,'reports-v2-ui.js');
const sql=fs.readFileSync(sqlPath,'utf8');
const ui=fs.readFileSync(uiPath,'utf8');
function ok(cond,msg){if(!cond)throw new Error(msg)}
const functions=[
 'report_sales_by_payment_method_v1',
 'report_sales_by_employee_v1',
 'report_sales_by_customer_v1',
 'report_purchases_by_supplier_v1',
 'report_purchases_by_employee_v1',
 'report_purchase_orders_detail_v1'
];
for(const name of functions){
 ok(sql.includes(`function public.${name}(`),`missing SQL function ${name}`);
 ok(sql.includes(`grant execute on function public.${name}`),`missing execute grant ${name}`);
 ok(ui.includes(`rpc('${name}'`),`UI does not call ${name}`);
}
ok((sql.match(/public\.has_branch_access\(p_branch_id\)/g)||[]).length>=6,'every DFR-01 report must be branch guarded');
ok((sql.match(/public\.has_permission\('reports'\)/g)||[]).length===6,'every DFR-01 report must enforce reports permission');
ok(sql.includes('public.order_payments'),'payment breakdown must use order_payments');
ok(sql.includes('public.return_payments'),'payment breakdown must use return_payments');
ok(/public\.returns r\s+join public\.orders o on o\.id=r\.order_id/.test(sql),'customer returns must resolve through original order');
ok(sql.includes("'po_created'::text")&&sql.includes("'grn_received'::text")&&sql.includes("'supplier_return_created'::text"),'purchase employee roles must stay separate');
ok((sql.match(/from (po_docs|grn_docs|return_docs) d group by d\.employee_id/g)||[]).length===3,'purchase employee role aggregates must qualify employee_id to avoid PL/pgSQL output-variable ambiguity');
ok(sql.includes('greatest(i.quantity_ordered-i.quantity_received,0)'),'PO outstanding quantity must use ordered minus received');
const stripped=sql
 .replace(/--.*$/gm,'')
 .replace(/'(?:''|[^'])*'/g,"''");
ok(!/\b(insert|update|delete|truncate)\b/i.test(stripped),'DFR-01 SQL must not contain operational DML');
ok(!/inventory_stock|canonical_stock|offline_v2|create_pos_order_atomic|retail_purchase_receive_v2/i.test(sql),'DFR-01 must not call operational stock/offline owners');
ok(ui.includes('data-r-detail'),'DFR-01 detail UI button missing');
ok(ui.includes('المرتجعات هنا منسوبة للموظف الذي نفّذ المرتجع'),'employee attribution explanation missing');
ok(ui.includes('وليست رصيد حسابات مدينة'),'customer report must not claim AR balance');
ok(ui.includes('وليس رصيدًا مستحقًا للمورد'),'supplier report must not claim AP balance');
ok(!/\brpc\('(?!report_)/.test(ui),'DFR-01 UI must only call report RPCs');
console.log(`DFR-01 PASS — ${functions.length} read-only RPCs; branch guards; payment/refund/customer/purchasing attribution; no operational DML`);

