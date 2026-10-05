-- Sharawla POS 10.5.13 Candidate — HR table privilege hardening
-- All HR writes go through permission-checked SECURITY DEFINER RPCs.
-- Admin UI receives SELECT only; Staff session/selfie internals remain service-only.

begin;

do $hr_priv$
declare t text;
begin
  foreach t in array array[
    'hr_attendance_adjustments','hr_attendance_daily_summary','hr_attendance_devices',
    'hr_attendance_events','hr_branch_geofences','hr_deduction_rule_assignments',
    'hr_deduction_rules','hr_employee_adjustments','hr_employee_advances',
    'hr_employee_compensation','hr_employee_schedule_assignments','hr_employees',
    'hr_leave_requests','hr_payroll_item_lines','hr_payroll_items','hr_payroll_periods',
    'hr_recurring_adjustments','hr_settings','hr_staff_accounts',
    'hr_staff_selfie_uploads','hr_staff_sessions','hr_work_schedules'
  ] loop
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
  end loop;
end
$hr_priv$;

grant select on
  public.hr_employees,
  public.hr_employee_compensation,
  public.hr_employee_advances,
  public.hr_employee_adjustments,
  public.hr_payroll_periods,
  public.hr_payroll_items,
  public.hr_settings,
  public.hr_work_schedules,
  public.hr_employee_schedule_assignments,
  public.hr_branch_geofences,
  public.hr_attendance_devices,
  public.hr_attendance_events,
  public.hr_attendance_daily_summary,
  public.hr_attendance_adjustments,
  public.hr_deduction_rules,
  public.hr_deduction_rule_assignments,
  public.hr_leave_requests,
  public.hr_recurring_adjustments,
  public.hr_payroll_item_lines
to authenticated;

grant select(
  id,employee_id,must_change_pin,active,failed_attempts,locked_until,token_version,
  last_login_at,pin_changed_at,disabled_at,disabled_by_employee_id,created_by_employee_id,
  created_at,updated_at
) on public.hr_staff_accounts to authenticated;

do $hr_seq$
declare s text;
begin
  for s in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind='S'
      and c.relname like 'hr\_%' escape '\'
  loop
    execute format('revoke all on sequence public.%I from public,anon,authenticated',s);
  end loop;
end
$hr_seq$;

commit;
