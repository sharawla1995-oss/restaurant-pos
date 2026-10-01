const fs=require('fs'),path=require('path');
const root=process.argv[2]||process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const loaderFile=fs.existsSync(path.join(root,'beta36-integration-loader.js'))?'beta36-integration-loader.js':'wave1-loader-hook.patch';
const files={
 d2:read('supabase-dfr02-customer-timeline-read-model.sql'),
 d4:read('supabase-dfr04-activity-log-read-model.sql'),
 d22:read('supabase-dfr22-operational-statements.sql'),
 j2:read('customer-timeline-v1.js'),j4:read('activity-log-v1.js'),j22:read('operational-statements-v1.js'),
 loader:read(loaderFile)
};
const required=[
 ['DFR02 original-order return attribution',files.d2,'join public.orders o on o.id=r.order_id'],
 ['DFR02 branch scope',files.d2,'o.branch_id=p_branch_id'],
 ['DFR02 payment timestamp source',files.d2,'public.order_payments'],
 ['DFR04 only safe summary output',files.d4,'safe_summary jsonb'],
 ['DFR04 action permission',files.d4,"audit.activity.view"],
 ['DFR22 supplier invoice authority',files.d22,'public.retail_supplier_invoices'],
 ['DFR22 GRN authority',files.d22,'public.retail_goods_receipts'],
 ['DFR22 supplier return authority',files.d22,'public.retail_supplier_returns'],
 ['DFR22 PO currency source',files.d22,'po.currency_code'],
 ['loader DFR02',files.loader,'customer-timeline-v1.js'],
 ['loader DFR04',files.loader,'activity-log-v1.js'],
 ['loader DFR22',files.loader,'operational-statements-v1.js']
];
for(const [name,text,token] of required)if(!text.includes(token))throw new Error(`${name}: missing ${token}`);
const sql=files.d2+'\n'+files.d4+'\n'+files.d22;
for(const bad of [/\btruncate\b/i,/\bdrop\s+table\b/i,/\bdelete\s+from\s+public\.(orders|returns|customers|retail_)/i,/\bupdate\s+public\.(orders|returns|customers|retail_)/i])if(bad.test(sql))throw new Error('Wave1 destructive/operational mutation detected: '+bad);
const ui=files.j2+'\n'+files.j4+'\n'+files.j22;
for(const bad of ['Balance Due','Accounts Receivable','Accounts Payable','Opening Balance','Aged Debtors'])if(ui.includes(bad))throw new Error('Wave1 forbidden accounting claim: '+bad);
if(files.d4.includes('returns table(\n  audit_id bigint,\n  created_at timestamptz,\n  employee_id bigint,\n  employee_name text,\n  action text,\n  entity_type text,\n  entity_id bigint,\n  details'))throw new Error('DFR04 raw details leaked in return contract');
console.log('WAVE1 SOURCE CONTRACT PASS — DFR02/04/22 authority, safety, loader hooks, non-accounting boundaries');