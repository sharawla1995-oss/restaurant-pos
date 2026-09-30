'use strict';
const fs=require('fs'),assert=require('assert');
const sql=fs.readFileSync('supabase-hr-attendance-payroll-extension-v1.sql','utf8');
const ui=fs.readFileSync('hr-attendance-admin-v1.js','utf8');
const loader=fs.readFileSync('beta36-integration-loader.js','utf8');

const tables=[
 'hr_settings','hr_work_schedules','hr_employee_schedule_assignments','hr_branch_geofences',
 'hr_staff_accounts','hr_attendance_devices','hr_staff_sessions','hr_staff_selfie_uploads',
 'hr_attendance_events','hr_attendance_daily_summary','hr_attendance_adjustments',
 'hr_deduction_rules','hr_deduction_rule_assignments','hr_leave_requests',
 'hr_recurring_adjustments','hr_payroll_item_lines'
];
for(const table of tables)assert(new RegExp('create table if not exists public\\.'+table+'\\b','i').test(sql),'HR extension source missing table '+table);

const rpcs=[
 'hr_attendance_summary_approve_v1','hr_attendance_adjust_v1','hr_work_schedule_save_v1',
 'hr_schedule_assign_v1','hr_leave_decide_v1','hr_recurring_adjustments_generate_v1',
 'hr_deduction_rule_save_v1','hr_recurring_adjustment_save_v1','hr_staff_account_set_active_v1',
 'hr_staff_logout_all_v1','hr_staff_device_revoke_v1','hr_staff_account_create_or_reset_v1',
 'hr_geofence_set_v1','hr_settings_set_v1','hr_payroll_run_attendance_v1','hr_payroll_pay_attendance_v1'
];
for(const rpc of rpcs){
 assert(ui.includes(rpc)||['hr_payroll_run_attendance_v1','hr_payroll_pay_attendance_v1'].includes(rpc),'HR UI/contract unexpectedly lost '+rpc);
 assert(new RegExp('create or replace function public\\.'+rpc+'\\s*\\(','i').test(sql),'HR extension source missing RPC '+rpc);
}
assert(loader.includes("['hr-attendance-admin-v1','hr-attendance-admin-v1.js?v=10.5.4-beta.58.32']"),'HR runtime loader entry missing');
assert(sql.includes('insert into public.permission_actions_v2'),'HR permission action extension missing');
assert(sql.includes('create extension if not exists pgcrypto'),'HR pgcrypto prerequisite declaration missing');
assert(sql.includes('begin;')&&sql.includes('commit;'),'HR extension must remain transactional');
console.log('RC1 HR live contract source gate PASS — tables='+tables.length+'; rpcs='+rpcs.length+'; loader=present');
