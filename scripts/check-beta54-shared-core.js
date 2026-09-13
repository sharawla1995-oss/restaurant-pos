'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const blueprint=read('docs/SHARAWLA-FUNCTIONAL-BLUEPRINT-V1.md');
const sql=read('supabase-beta54-shared-customer-foundation.sql');
const ui=read('shared-business-core-v1.js');
const loader=read('beta36-integration-loader.js');

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
])assert(sql.includes(token),`Beta54 customer backend invariant missing: ${token}`);

for(const token of [
 "const VERSION='10.5.4-beta.54'",
 "allowed('customers.create')",
 "b.textContent='➕ عميل جديد'",
 "global.rpc('customer_create_v2'",
 "global.__SharawlaSharedBusinessCoreV1"
])assert(ui.includes(token),`Beta54 customer UI invariant missing: ${token}`);

assert(loader.includes("['shared-business-core-v1','shared-business-core-v1.js?v=10.5.4-beta.54']"),'Shared Business Core must be wired into integration loader');
assert(loader.indexOf("['permissions-v2'")<loader.indexOf("['shared-business-core-v1'"),'Shared Business Core must load after Permissions V2');
assert(loader.includes('beta51FinalOfflineAcceptanceFix:true'),'Accepted Offline V2 final fix marker must remain loaded');
assert(loader.includes('takeoverSafety:\'explicit-owner-only\''),'Explicit-owner-only takeover safety must remain preserved');
assert(!sql.includes('SH-0005')&&!sql.includes('SH-0006'),'Beta54 SQL must not target production devices');

console.log('Beta54 Shared Business Core gate PASS — blueprint + customer action permission + backend enforcement + audit + permission-aware UI wiring');
