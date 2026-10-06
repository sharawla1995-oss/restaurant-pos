-- Sharawla POS 10.5.14 — RPC privilege hardening follow-up
begin;

revoke all on function public.app_notify_return_approval_v14() from public,anon,authenticated;
revoke all on function public.app_notify_adjustment_v14() from public,anon,authenticated;
revoke all on function public.app_notify_advance_v14() from public,anon,authenticated;
revoke all on function public.app_notify_leave_v14() from public,anon,authenticated;

revoke all on function public.hr_adjustment_decide_v2(bigint,boolean,text) from public,anon,authenticated;
grant execute on function public.hr_adjustment_decide_v2(bigint,boolean,text) to authenticated;

revoke all on function public.branch_hr_finance_queue_v1(bigint) from public,anon,authenticated;
grant execute on function public.branch_hr_finance_queue_v1(bigint) to authenticated;

revoke all on function public.business_summary_v2(bigint,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.business_summary_v2(bigint,timestamptz,timestamptz) to authenticated;

revoke all on function public.branch_hr_staff_list_v1(bigint) from public,anon,authenticated;
grant execute on function public.branch_hr_staff_list_v1(bigint) to authenticated;

commit;
