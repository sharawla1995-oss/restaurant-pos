'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const pkg=JSON.parse(read('package.json'));
const blueprint=read('docs/SHARAWLA-FUNCTIONAL-BLUEPRINT-V1.md');
const customerSql=read('supabase-beta54-shared-customer-foundation.sql');
const customerUi=read('shared-business-core-v1.js');
const hrSql=read('supabase-beta54-hr-treasury-foundation.sql');
const payrollSql=read('supabase-beta54-hr-payroll-runtime.sql');
const hrSupportSql=read('supabase-beta54-hr-ui-support.sql');
const hrUi=read('beta54-shared-core-ui.js');
const loader=read('beta36-integration-loader.js');
const sync=read('scripts/sync-version.js');
const syntax=read('scripts/check-runtime-syntax.js');

assert.strictEqual(pkg.version,'10.5.4-beta.54','Beta54 package version mismatch');
assert(String(pkg.description||'').includes('Offline Engine V2'),'Accepted Offline V2 release identity must remain present');
assert(String(pkg.description||'').includes('Shared Business Core'),'Beta54 Shared Business Core release identity missing');

for(const token of [
 'Feature Enable -> Page Permission -> Action Permission -> Branch/Data Scope -> Audit Log',
 'Production SH-0005 / SH-0006 / Top Burger: READ-ONLY and OUT OF SCOPE',
 'Employees are business people records and are separate from Login Users.',
 'Delivery OTP',
 'Beta54: Shared Business Core + permissions foundations'
])assert(blueprint.includes(token),`Functional Blueprint invariant missing: ${token}`);

for(const token of [
 "('customers.create','إضافة عميل','customers','customers',1000)",
 "has_action_permission_v2('customers.create')",
 'create or replace function public.customer_create_v2',
 "raise exception 'ليس لديك صلاحية إضافة عميل'",
 "raise exception 'رقم الموبايل مسجل لعميل موجود'",
 "'customer_create'",
 'insert into public.audit_logs'
])assert(customerSql.includes(token),`Beta54 customer backend invariant missing: ${token}`);
for(const token of [
 "const VERSION='10.5.4-beta.54'",
 "allowed('customers.create')",
 "b.textContent='➕ عميل جديد'",
 "global.rpc('customer_create_v2'",
 'global.__SharawlaSharedBusinessCoreV1'
])assert(customerUi.includes(token),`Beta54 customer UI invariant missing: ${token}`);

for(const token of [
 'create table if not exists public.hr_employees',
 'login_employee_id bigint unique references public.employees',
 'create table if not exists public.hr_employee_advances',
 'create table if not exists public.hr_payroll_periods',
 'create table if not exists public.hr_payroll_items',
 'create table if not exists public.treasury_movements',
 "'hr.employees.view'","'hr.salary.view'","'hr.advances.view'","'hr.payroll.view'","'treasury.view'",
 "has_action_permission_v2('hr.advances.disburse')",
 "has_action_permission_v2('treasury.post')",
 "'employee_advance'",
 "'hr_advance_disburse'"
])assert(hrSql.includes(token),`Beta54 HR/Treasury foundation invariant missing: ${token}`);

for(const token of [
 'create or replace function public.hr_adjustment_create_v1',
 'create or replace function public.hr_payroll_run_v1',
 'create or replace function public.hr_payroll_approve_v1',
 'create or replace function public.hr_payroll_pay_v1',
 'create or replace function public.treasury_manual_post_v1',
 "has_action_permission_v2('hr.payroll.run')",
 "has_action_permission_v2('hr.payroll.approve')",
 "has_action_permission_v2('hr.payroll.pay')",
 "has_action_permission_v2('treasury.post')",
 "movement_type,amount,method,entity_type,entity_id",
 "'payroll'",
 "status='applied'",
 "status=case when outstanding_amount-takev<=0.009 then 'settled' else 'active' end",
 "يوجد مسير مرتبات متداخل لنفس الفرع",
 "الأجر اليومي/بالساعة يحتاج إدخال حضور/ساعات قبل الاعتماد"
])assert(payrollSql.includes(token),`Beta54 payroll invariant missing: ${token}`);

for(const token of [
 "('hr.adjustments.view','عرض الخصومات والمكافآت'",
 'create or replace function public.hr_employee_update_v1',
 "has_action_permission_v2('hr.employees.edit')",
 "'hr_employee_update'",
 "jsonb_build_object('before',beforev,'after'"
])assert(hrSupportSql.includes(token),`Beta54 HR support invariant missing: ${token}`);

for(const token of [
 "const VERSION='10.5.4-beta.54'",
 "employees:{label:'👨‍💼 الموظفون'",
 "advances:{label:'💰 السلف'",
 "adjustments:{label:'➕➖ الخصومات والمكافآت'",
 "payroll:{label:'🧾 المرتبات'",
 "treasury:{label:'🏦 الخزنة'",
 "permission:'hr.employees.view'",
 "permission:'hr.advances.view'",
 "permission:'hr.adjustments.view'",
 "permission:'hr.payroll.view'",
 "permission:'treasury.view'",
 "rpc('hr_advance_disburse_v1'",
 "rpc('hr_payroll_pay_v1'",
 "rpc('treasury_manual_post_v1'",
 'global.__SharawlaBeta54SharedCore'
])assert(hrUi.includes(token),`Beta54 HR UI invariant missing: ${token}`);

assert(loader.includes("['shared-business-core-v1','shared-business-core-v1.js?v=10.5.4-beta.54']"),'Customer Shared Core must be wired into integration loader');
assert(loader.includes("['beta54-shared-core-ui','beta54-shared-core-ui.js?v=10.5.4-beta.54']"),'Beta54 HR UI must be wired into integration loader');
assert(loader.indexOf("['permissions-v2'")<loader.indexOf("['shared-business-core-v1'")&&loader.indexOf("['shared-business-core-v1'")<loader.indexOf("['beta54-shared-core-ui'"),'Permission/customer/HR UI load order is unsafe');
assert(loader.includes('beta51FinalOfflineAcceptanceFix:true'),'Accepted Offline V2 final fix marker must remain loaded');
assert(loader.includes("takeoverSafety:'explicit-owner-only'"),'Explicit-owner-only takeover safety must remain preserved');
assert(sync.includes("'shared-business-core-v1.js','beta54-shared-core-ui.js'"),'Version sync must own Beta54 shared core runtime assets');
assert(syntax.includes("'shared-business-core-v1.js','beta54-shared-core-ui.js'"),'Runtime syntax gate must cover Beta54 shared core assets');

const beta54Sql=[customerSql,hrSql,payrollSql,hrSupportSql].join('\n');
for(const forbidden of ['SH-0005','SH-0006','takeoverActivate','takeoverPrepare'])assert(!beta54Sql.includes(forbidden),`Beta54 sandbox-safe source contains forbidden token: ${forbidden}`);

console.log('Beta54 Shared Business Core gate PASS — customers + HR + advances + adjustments + payroll + treasury + action permissions + branch scope + audit + runtime wiring');
