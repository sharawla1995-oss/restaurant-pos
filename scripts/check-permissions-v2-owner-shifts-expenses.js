const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'permissions-v2-owner-shifts-expenses.sql'),'utf8');
const helper=fs.readFileSync(path.join(root,'permissions-v2-expense-edit-routing.js'),'utf8');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const shiftRuntime=fs.readFileSync(path.join(root,'beta55-delivery-settlement-shift-cash.js'),'utf8');
const offlineTransport=fs.readFileSync(path.join(root,'beta45-offline-v2-transport.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const audit=fs.readFileSync(path.join(root,'scripts/audit-permissions-v2-shift-expense-provenance.js'),'utf8');

function need(src,token,label){
  if(!src.toLowerCase().includes(token.toLowerCase()))throw new Error(label+' missing: '+token);
}

for(const token of [
  "('shifts.open','فتح وردية'",
  "('shifts.close','قفل وردية'",
  "('expenses.create','إضافة مصروف'",
  "('expenses.edit','تعديل مصروف'",
  "assert_operational_profile_v1('restaurant')",
  'PV2-F3-SHIFT-EXPENSE-58.29',
  'create or replace function sharawla_internal.enforce_shift_action_permission_v2()',
  "v_action:='shifts.open'",
  "v_action:='shifts.close'",
  'create trigger trg_pv2_shift_action_permission',
  'create or replace function sharawla_internal.enforce_expense_action_permission_v2()',
  "v_action:='expenses.create'",
  "v_action:='expenses.edit'",
  'create trigger trg_pv2_expense_action_permission',
  'create or replace function public.expense_update_v2',
  "has_action_permission_v2('expenses.edit')",
  'revoke insert,update,delete on table public.shifts from public,anon,authenticated',
  'revoke insert,update,delete on table public.expenses from public,anon,authenticated'
])need(sql,token,'PV2-F3 SQL');

for(const historical of [
  'open_pos_shift_idempotent',
  'close_pos_shift_idempotent',
  'close_pos_shift_v2',
  'create_pos_expense_idempotent'
]){
  const re=new RegExp('create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?'+historical+'\\s*\\(','i');
  if(re.test(sql))throw new Error('PV2-F3 must not replace historical owner body '+historical);
}

if(!/if\s+auth\.uid\(\)\s+is\s+null\s+then[\s\S]*return/i.test(sql))
  throw new Error('PV2-F3 trusted migration/service trigger bypass missing');

if(!/old\.status\s+is\s+distinct\s+from\s+'closed'[\s\S]*new\.status='closed'/i.test(sql))
  throw new Error('PV2-F3 shift close transition guard missing');

if(/on\s+conflict\s*\(employee_id,action_code\)\s*do\s+update/i.test(sql))
  throw new Error('PV2-F3 must not overwrite explicit employee Action overrides');

for(const token of [
  "rpc('expense_update_v2'",
  'updateExpense'
])need(helper,token,'PV2-F3 renderer candidate');

if(/rest\(\s*['"]expenses['"][\s\S]{0,240}?method\s*:\s*['"]PATCH['"]/i.test(helper))
  throw new Error('PV2-F3 candidate must not retain direct expense PATCH fallback');

if(!index.includes(`permissions-v2-expense-edit-routing.js?v=${pkg.version}`))
  throw new Error('PV2-F3 runtime routing asset must be wired at package version');

const shiftDirect=(app.match(/rest\(\s*['"]shifts['"][\s\S]{0,260}?method\s*:\s*['"](?:POST|PATCH|DELETE)['"]/g)||[]).length;
const expensePatch=(app.match(/rest\(\s*['"]expenses['"][\s\S]{0,260}?method\s*:\s*['"]PATCH['"]/g)||[]).length;
if(shiftDirect!==0)throw new Error('PV2-F3 unexpected direct Shift DML paths='+shiftDirect);
if(expensePatch!==0)throw new Error('PV2-F3 direct Expense PATCH regression: expected 0, found '+expensePatch);
const routed=(app.match(/__SharawlaPV2ExpenseEdit/g)||[]).length;
if(routed!==1)throw new Error('PV2-F3 expected exactly one routed Expense Edit surface, found '+routed);

for(const token of [
  "rpc('open_pos_shift_idempotent'",
  "rpc('close_pos_shift_idempotent'",
  "rpc('create_pos_expense_idempotent'"
])need(app,token,'PV2-F3 accepted legacy/offline renderer route');

need(shiftRuntime,"rpc('close_pos_shift_v2'",'PV2-F3 accepted live Shift V2 route');
need(offlineTransport,"const APPLY_RPC='sharawla_offline_v2_apply_event'",'PV2-F3 Native Offline entrypoint');

need(audit,'OWNER_PROVENANCE_DRIFT','PV2-F3 provenance gate');
need(audit,'NEGATIVE REPLACEMENT SCAN PASS','PV2-F3 provenance gate');

console.log('PV2-F3 Shift/Expense RUNTIME CUTOVER PASS — routed='+routed);
