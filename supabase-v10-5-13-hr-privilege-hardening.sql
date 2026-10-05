-- Sharawla POS 10.5.13 Candidate — HR privilege hardening
-- SOURCE ONLY. Restrict legacy Beta54 HR/Payroll SECURITY DEFINER RPCs
-- so they are never directly executable by anon/public.

begin;

revoke all on function public.hr_employee_create_v1(bigint,text,text,text,text,text,date,text,text) from public,anon;
grant execute on function public.hr_employee_create_v1(bigint,text,text,text,text,text,date,text,text) to authenticated,service_role;

revoke all on function public.hr_employee_compensation_set_v1(bigint,text,numeric,date) from public,anon;
grant execute on function public.hr_employee_compensation_set_v1(bigint,text,numeric,date) to authenticated,service_role;

revoke all on function public.hr_advance_create_v1(bigint,numeric,text,numeric,integer,text,text,text) from public,anon;
grant execute on function public.hr_advance_create_v1(bigint,numeric,text,numeric,integer,text,text,text) to authenticated,service_role;

revoke all on function public.hr_advance_decide_v1(bigint,boolean,text) from public,anon;
grant execute on function public.hr_advance_decide_v1(bigint,boolean,text) to authenticated,service_role;

revoke all on function public.hr_advance_disburse_v1(bigint,text,text,bigint,text) from public,anon;
grant execute on function public.hr_advance_disburse_v1(bigint,text,text,bigint,text) to authenticated,service_role;

revoke all on function public.hr_adjustment_create_v1(bigint,text,numeric,date,text,text) from public,anon;
grant execute on function public.hr_adjustment_create_v1(bigint,text,numeric,date,text,text) to authenticated,service_role;

revoke all on function public.hr_payroll_run_v1(bigint,date,date,text,text) from public,anon;
grant execute on function public.hr_payroll_run_v1(bigint,date,date,text,text) to authenticated,service_role;

revoke all on function public.hr_payroll_approve_v1(bigint,text) from public,anon;
grant execute on function public.hr_payroll_approve_v1(bigint,text) to authenticated,service_role;

revoke all on function public.hr_payroll_pay_v1(bigint,text,text,bigint,text) from public,anon;
grant execute on function public.hr_payroll_pay_v1(bigint,text,text,bigint,text) to authenticated,service_role;

revoke all on function public.treasury_manual_post_v1(bigint,text,numeric,text,text,text,bigint,text) from public,anon;
grant execute on function public.treasury_manual_post_v1(bigint,text,numeric,text,text,text,bigint,text) to authenticated,service_role;

revoke all on function public.hr_employee_update_v1(bigint,text,text,text,text,text,date,text,text,boolean) from public,anon;
grant execute on function public.hr_employee_update_v1(bigint,text,text,text,text,text,date,text,text,boolean) to authenticated,service_role;


do $
begin
  if to_regprocedure('public.sharawla_beta54_hr_acceptance_cleanup_v1(text)') is not null then
    execute 'revoke all on function public.sharawla_beta54_hr_acceptance_cleanup_v1(text) from public,anon';
    execute 'grant execute on function public.sharawla_beta54_hr_acceptance_cleanup_v1(text) to service_role';
  end if;
end
$;

commit;
