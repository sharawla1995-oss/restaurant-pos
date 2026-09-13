-- Sharawla POS 10.5.4-beta.54
-- Sandbox acceptance cleanup for HR/Treasury fixtures.
-- Exact ACC run only; admin only. Never targets normal employee codes.

begin;

create or replace function public.sharawla_beta54_hr_acceptance_cleanup_v1(p_run_id text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
 r text:=trim(coalesce(p_run_id,''));
 codev text;
 hid bigint;
 adv_ids bigint[]:=array[]::bigint[];
 adj_ids bigint[]:=array[]::bigint[];
 period_ids bigint[]:=array[]::bigint[];
 treasury_ids bigint[]:=array[]::bigint[];
 d_treasury integer:=0;d_items integer:=0;d_periods integer:=0;d_adj integer:=0;d_adv integer:=0;d_comp integer:=0;d_emp integer:=0;d_audit integer:=0;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'للمدير فقط';end if;
 if r !~ '^ACC-[A-Za-z0-9-]{8,80}$' then raise exception 'Acceptance run id غير صالح';end if;
 codev:='ACC-HR-'||r;
 select id into hid from public.hr_employees where employee_code=codev;
 if hid is null then
   return jsonb_build_object('ok',true,'run_id',r,'employee_found',false,'deleted',jsonb_build_object('treasury',0,'payroll_items',0,'payroll_periods',0,'adjustments',0,'advances',0,'compensation',0,'employees',0,'audit',0),'residue',0);
 end if;

 select coalesce(array_agg(id),array[]::bigint[]) into adv_ids from public.hr_employee_advances where employee_id=hid and client_tx_id like r||'-%';
 select coalesce(array_agg(id),array[]::bigint[]) into adj_ids from public.hr_employee_adjustments where employee_id=hid and client_tx_id like r||'-%';
 select coalesce(array_agg(distinct p.id),array[]::bigint[]) into period_ids
 from public.hr_payroll_periods p join public.hr_payroll_items i on i.payroll_period_id=p.id
 where i.employee_id=hid and p.client_tx_id like r||'-%';
 select coalesce(array_agg(id),array[]::bigint[]) into treasury_ids from public.treasury_movements where client_tx_id like r||'-%';

 delete from public.audit_logs
 where (entity_type='hr_employee' and entity_id=hid)
    or (entity_type='hr_advance' and entity_id=any(adv_ids))
    or (entity_type='hr_adjustment' and entity_id=any(adj_ids))
    or (entity_type='hr_payroll_period' and entity_id=any(period_ids))
    or (entity_type='treasury_movement' and entity_id=any(treasury_ids));
 get diagnostics d_audit=row_count;

 delete from public.treasury_movements where id=any(treasury_ids);get diagnostics d_treasury=row_count;
 delete from public.hr_payroll_items where payroll_period_id=any(period_ids);get diagnostics d_items=row_count;
 delete from public.hr_payroll_periods where id=any(period_ids);get diagnostics d_periods=row_count;
 delete from public.hr_employee_adjustments where id=any(adj_ids);get diagnostics d_adj=row_count;
 delete from public.hr_employee_advances where id=any(adv_ids);get diagnostics d_adv=row_count;
 delete from public.hr_employee_compensation where employee_id=hid;get diagnostics d_comp=row_count;
 delete from public.hr_employees where id=hid and employee_code=codev;get diagnostics d_emp=row_count;

 return jsonb_build_object(
  'ok',true,'run_id',r,'employee_found',true,
  'deleted',jsonb_build_object('treasury',d_treasury,'payroll_items',d_items,'payroll_periods',d_periods,'adjustments',d_adj,'advances',d_adv,'compensation',d_comp,'employees',d_emp,'audit',d_audit),
  'residue',
    (select count(*) from public.hr_employees where employee_code=codev)
   +(select count(*) from public.hr_employee_advances where client_tx_id like r||'-%')
   +(select count(*) from public.hr_employee_adjustments where client_tx_id like r||'-%')
   +(select count(*) from public.hr_payroll_periods where client_tx_id like r||'-%')
   +(select count(*) from public.treasury_movements where client_tx_id like r||'-%')
 );
end;$$;

grant execute on function public.sharawla_beta54_hr_acceptance_cleanup_v1(text) to authenticated;

commit;
