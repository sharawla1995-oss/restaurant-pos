'use strict';
const fs=require('fs');
const sql=fs.readFileSync('supabase-rc1-branch-scoped-reset-v7.sql','utf8');
const app=fs.readFileSync('app.js','utf8');
const native=fs.readFileSync('beta45-offline-v2-native-store.js','utf8');
const main=fs.readFileSync('main.js','utf8');
const must=(x,m)=>{if(!x)throw new Error(m)};

must(sql.includes('reset_pos_data_v7(p_branch_id bigint,p_groups text[])'),'V7 branch contract missing');
must(sql.includes("v_role is distinct from 'admin'"),'admin-only cloud guard missing');
must(sql.includes('eb.branch_id=p_branch_id'),'admin branch-access guard missing');
must(sql.includes("RESET_V7_BRANCH_ACCESS_DENIED"),'branch access fail-closed missing');
must(sql.includes("RESET_V7_UNSUPPORTED_GROUPS"),'unknown-group fail-closed missing');

for(const [group,needle] of [
 ['orders','select id from public.orders where branch_id=p_branch_id'],
 ['expenses','delete from public.expenses where branch_id=p_branch_id'],
 ['shifts','select id from public.shifts where branch_id=p_branch_id'],
 ['delivery','delete from public.delivery_zones where branch_id=p_branch_id'],
 ['catalog','delete from public.branch_products where branch_id=p_branch_id'],
 ['promos','delete from public.promo_code_branches where branch_id=p_branch_id'],
 ['audit','delete from public.audit_logs where branch_id=p_branch_id']
]) must(sql.includes(needle),group+' is not branch-scoped');

must(sql.includes("customers is intentionally business-global"),'customer global-scope contract missing');
must(sql.includes("'scope','business_global'"),'customer result scope missing');
must(!sql.includes('delete from public.products where true'),'catalog master must survive branch reset');
must(!sql.includes('delete from public.categories where true'),'category master must survive branch reset');
must(!sql.includes('delete from public.promo_codes where true'),'promo master must survive branch reset');
must(!sql.includes('delete from public.payment_methods where true'),'payment master must survive branch reset');
must(!sql.includes('delete from public.app_settings where true'),'global app settings must survive branch reset');
must(!sql.includes('delete from public.employee_permissions'),'employee-global permissions must survive branch reset');

must(sql.includes('order_id in(select id from _reset_v7_orders)'),'order child-ID scoping missing');
must(sql.includes('return_id in(select id from _reset_v7_returns)'),'return child-ID scoping missing');
must(sql.includes('update public.branch_invoice_counters set next_number=1 where branch_id=p_branch_id'),'invoice counter branch scope missing');
must(sql.includes('update public.branch_return_counters set next_number=1 where branch_id=p_branch_id'),'return counter branch scope missing');
must(sql.includes('delete from public.shift_bon_counters where branch_id=p_branch_id'),'BON counter branch scope missing');

must(app.includes("backup.create('pre-reset-full')"),'full local pre-reset backup missing');
must(app.includes("createDesktopFullBackup('pre-reset-full')"),'full cloud pre-reset backup missing');
must(app.includes("req('/rest/v1/rpc/reset_pos_data_v7'"),'renderer is not using V7');
must(app.includes('p_branch_id:branchId,p_groups:groups'),'renderer does not pass current branch');
must(!app.includes("req('/rest/v1/rpc/reset_pos_data',{method:'POST'"),'unsafe legacy reset fallback still reachable');
const resetStart=app.indexOf('async function resetGroups(groups)');
const resetEnd=app.indexOf('async function restoreBackup',resetStart);
const resetBody=app.slice(resetStart,resetEnd);
must(resetBody.indexOf("backup.create('pre-reset-full')")<resetBody.indexOf("req('/rest/v1/rpc/reset_pos_data_v7'"),'destructive cloud reset happens before backup');

must(native.includes("Offline V2 scoped reset verification failed"),'Offline V2 selected-group verification missing');
must(!native.includes('RESET_PROTECTED_DEVICE_SEQUENCES'),'obsolete protected reset sequence contract must be removed');
must(main.includes('Sandbox scoped reset verification failed'),'legacy/cache selected-group verification missing');

console.log('RC1 branch-scoped reset V7 source gate PASS');
