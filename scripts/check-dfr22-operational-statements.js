const fs=require('fs'),path=require('path');
const root=process.argv[2]||process.cwd();
const sql=fs.readFileSync(path.join(root,'supabase-dfr22-operational-statements.sql'),'utf8');
const js=fs.readFileSync(path.join(root,'operational-statements-v1.js'),'utf8');
for(const t of ['customer_operational_statement_v1','supplier_operational_parties_v1','supplier_operational_statement_v1',"has_permission('reports')",'public.retail_supplier_invoices','public.retail_goods_receipts','public.retail_supplier_returns','public.order_payments','public.return_payments','ليس كشف حساب مالي','ليس حسابات دائنة'])if(!(sql+js).includes(t))throw new Error('DFR-22 missing '+t);
for(const bad of [/\b(opening balance|aged debtors|accounts payable|accounts receivable|balance due)\b/i,/\bsupplier[_ ]?payment\b/i])if(bad.test(sql+js))throw new Error('DFR-22 forbidden accounting/payment claim');
for(const bad of [/\binsert\s+into\s+public\.(orders|returns|retail_supplier_invoices|retail_goods_receipts|retail_supplier_returns)\b/i,/\bupdate\s+public\./i,/\bdelete\s+from\s+public\./i])if(bad.test(sql))throw new Error('DFR-22 operational DML forbidden');
console.log('DFR-22 PASS — operational-only customer/supplier streams, invoice/GRN/return authority, no AP/AR/payment/balance claim');