-- Sharawla POS — Permissions V2 Owner Coverage PV2-F3
-- Shift Open/Close + Expense Create/Edit authorization boundary.
-- SOURCE-ONLY. No historical Shift/Expense owner body is replaced here.
-- Permission enforcement is attached at the durable table mutation boundary so
-- Online, Legacy Offline, and Native Offline paths share the same Action gate.
-- Production SH-0005 / SH-0006 remain untouched.

begin;

select sharawla_internal.assert_operational_profile_v1('restaurant');

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,active,sort_order)
values
 ('shifts.open','فتح وردية','shifts','shifts',true,1100),
 ('shifts.close','قفل وردية','shifts','shifts',true,1110),
 ('expenses.create','إضافة مصروف','expenses','expenses',true,1120),
 ('expenses.edit','تعديل مصروف','expenses','expenses',true,1130)
on conflict(code) do update set
 name_ar=excluded.name_ar,
 domain=excluded.domain,
 legacy_permission=excluded.legacy_permission,
 active=true,
 sort_order=excluded.sort_order;

-- F3 is Restaurant closure only. Other Profiles remain fail-closed until their
-- dedicated owner/profile acceptance is performed.
insert into public.permission_action_profiles_v2(action_code,profile_code,required_feature_code,active)
values
 ('shifts.open','restaurant',null,true),
 ('shifts.close','restaurant',null,true),
 ('expenses.create','restaurant',null,true),
 ('expenses.edit','restaurant',null,true)
on conflict(action_code,profile_code) do update set
 required_feature_code=excluded.required_feature_code,
 active=true,
 updated_at=now();

do $$
begin
 if pg_catalog.to_regclass('public.permission_role_action_defaults_v2') is null then
   raise exception 'PV2_F3_ROLE_DEFAULTS_REQUIRED';
 end if;
 if pg_catalog.to_regclass('sharawla_internal.permission_role_migration_evidence_v1') is null then
   raise exception 'PV2_F3_MIGRATION_EVIDENCE_REQUIRED';
 end if;
end;
$$;

-- Accepted Restaurant 58.29 role-page intent:
-- Admin: all applicable Actions.
-- Cashier: Shifts page yes, Expenses page no.
-- Call Center / Delivery: neither Shifts nor Expenses page by default.
insert into public.permission_role_action_defaults_v2(
 profile_code,role_code,action_code,allowed,active,source,created_at,updated_at
)
select
 'restaurant',
 r.role_code,
 a.action_code,
 case
   when r.role_code='admin' then true
   when r.role_code='cashier' and a.page_key='shifts' then true
   else false
 end,
 true,
 'restaurant-runtime-role-pages-58.29',
 now(),
 now()
from (values ('admin'),('cashier'),('callcenter'),('delivery')) as r(role_code)
cross join (
 values
   ('shifts.open','shifts'),
   ('shifts.close','shifts'),
   ('expenses.create','expenses'),
   ('expenses.edit','expenses')
) as a(action_code,page_key)
on conflict(profile_code,role_code,action_code) do nothing;

-- Preserve each existing non-admin employee's current renderer page intent.
-- If any persisted page-permission rows exist, those rows own the current UI result.
-- Otherwise the accepted Restaurant role template is the compatibility baseline.
insert into sharawla_internal.permission_role_migration_evidence_v1(
 migration_batch,
 employee_id,
 profile_code,
 role_code,
 action_code,
 legacy_allowed,
 role_default_allowed,
 explicit_override_before,
 preservation_override_inserted,
 captured_at
)
with employee_state as (
 select
   e.id as employee_id,
   lower(trim(coalesce(e.role,''))) as role_code,
   exists(select 1 from public.employee_permissions ep0 where ep0.employee_id=e.id) as has_persisted_pages
 from public.employees e
 where e.active is distinct from false
   and lower(trim(coalesce(e.role,'')))<>'admin'
),
actions(action_code,page_key) as (
 values
   ('shifts.open','shifts'),
   ('shifts.close','shifts'),
   ('expenses.create','expenses'),
   ('expenses.edit','expenses')
),
intent as (
 select
   es.employee_id,
   es.role_code,
   a.action_code,
   case
     when es.has_persisted_pages then exists(
       select 1
       from public.employee_permissions ep
       where ep.employee_id=es.employee_id
         and ep.permission_key=a.page_key
         and ep.allowed=true
     )
     when a.page_key='shifts' then es.role_code='cashier'
     else false
   end as old_allowed
 from employee_state es
 cross join actions a
)
select
 'PV2-F3-SHIFT-EXPENSE-58.29',
 i.employee_id,
 'restaurant',
 i.role_code,
 i.action_code,
 i.old_allowed,
 coalesce(d.allowed,false),
 (
   select eap.allowed
   from public.employee_action_permissions_v2 eap
   where eap.employee_id=i.employee_id
     and eap.action_code=i.action_code
   limit 1
 ),
 false,
 now()
from intent i
left join public.permission_role_action_defaults_v2 d
  on d.profile_code='restaurant'
 and d.role_code=i.role_code
 and d.action_code=i.action_code
 and d.active=true
on conflict(migration_batch,employee_id,action_code) do nothing;

insert into public.employee_action_permissions_v2(employee_id,action_code,allowed,updated_at)
select
 ev.employee_id,
 ev.action_code,
 ev.legacy_allowed,
 now()
from sharawla_internal.permission_role_migration_evidence_v1 ev
where ev.migration_batch='PV2-F3-SHIFT-EXPENSE-58.29'
  and ev.explicit_override_before is null
  and ev.legacy_allowed is distinct from ev.role_default_allowed
on conflict(employee_id,action_code) do nothing;

update sharawla_internal.permission_role_migration_evidence_v1 ev
set preservation_override_inserted=true
where ev.migration_batch='PV2-F3-SHIFT-EXPENSE-58.29'
  and ev.explicit_override_before is null
  and ev.legacy_allowed is distinct from ev.role_default_allowed
  and exists(
    select 1
    from public.employee_action_permissions_v2 eap
    where eap.employee_id=ev.employee_id
      and eap.action_code=ev.action_code
      and eap.allowed=ev.legacy_allowed
  );

-- Durable mutation boundary for every authenticated Shift path.
-- No open/close RPC body is replaced, preserving idempotency, custody guards,
-- Offline V2 ownership, and Point4 same-context behavior.
create or replace function sharawla_internal.enforce_shift_action_permission_v2()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,sharawla_internal
as $$
declare
 v_action text;
begin
 -- Trusted migration/service execution has no end-user JWT and is outside
 -- employee authorization. anon/public table DML is removed below.
 if auth.uid() is null then
   if tg_op='DELETE' then return old; else return new; end if;
 end if;

 if tg_op='INSERT' then
   v_action:='shifts.open';
 elsif tg_op='UPDATE'
   and (
     (old.status is distinct from 'closed' and new.status='closed')
     or (old.closed_at is null and new.closed_at is not null)
   ) then
   v_action:='shifts.close';
 elsif tg_op='DELETE' then
   raise exception using errcode='42501',message='SHIFT_DELETE_NOT_SUPPORTED';
 else
   return new;
 end if;

 if not public.has_action_permission_v2(v_action) then
   raise exception using errcode='42501',message='ACTION_PERMISSION_DENIED '||v_action;
 end if;

 if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_pv2_shift_action_permission on public.shifts;
create trigger trg_pv2_shift_action_permission
before insert or update or delete on public.shifts
for each row execute function sharawla_internal.enforce_shift_action_permission_v2();

-- Durable mutation boundary for every authenticated Expense path.
create or replace function sharawla_internal.enforce_expense_action_permission_v2()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,sharawla_internal
as $$
declare
 v_action text;
begin
 if auth.uid() is null then
   if tg_op='DELETE' then return old; else return new; end if;
 end if;

 if tg_op='INSERT' then
   v_action:='expenses.create';
 elsif tg_op='UPDATE' then
   v_action:='expenses.edit';
 elsif tg_op='DELETE' then
   raise exception using errcode='42501',message='EXPENSE_DELETE_NOT_SUPPORTED';
 end if;

 if not public.has_action_permission_v2(v_action) then
   raise exception using errcode='42501',message='ACTION_PERMISSION_DENIED '||v_action;
 end if;

 if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_pv2_expense_action_permission on public.expenses;
create trigger trg_pv2_expense_action_permission
before insert or update or delete on public.expenses
for each row execute function sharawla_internal.enforce_expense_action_permission_v2();

-- Expense Edit gets an explicit mutation owner. Expense Create and Shift Open/Close
-- retain their existing authoritative RPC bodies; the triggers guard those bodies.
create or replace function public.expense_update_v2(
 p_expense_id bigint,
 p_description text,
 p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
 v_row public.expenses%rowtype;
 v_employee bigint;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if not public.has_action_permission_v2('expenses.edit') then
   raise exception 'EXPENSE_EDIT_DENIED';
 end if;
 if p_expense_id is null then raise exception 'EXPENSE_NOT_FOUND'; end if;
 if nullif(trim(coalesce(p_description,'')),'') is null then
   raise exception 'EXPENSE_DESCRIPTION_REQUIRED';
 end if;
 if coalesce(p_amount,0)<=0 then raise exception 'EXPENSE_AMOUNT_INVALID'; end if;

 select * into v_row
 from public.expenses
 where id=p_expense_id
 for update;

 if not found then raise exception 'EXPENSE_NOT_FOUND'; end if;
 if not public.has_branch_access(v_row.branch_id) then
   raise exception 'BRANCH_ACCESS_DENIED';
 end if;

 update public.expenses
 set description=trim(p_description),
     amount=p_amount
 where id=p_expense_id
 returning * into v_row;

 v_employee:=public.current_employee_id();
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details)
 values(v_employee,v_row.branch_id,'expenses.edit','expense',v_row.id,
        jsonb_build_object('amount',v_row.amount,'shift_id',v_row.shift_id));

 return to_jsonb(v_row);
end;
$$;

-- Direct authenticated DML is no longer a separate authority.
-- Existing SECURITY DEFINER owners keep their business/idempotency logic and still
-- hit the trigger boundary with the caller JWT context available through auth.uid().
revoke insert,update,delete on table public.shifts from public,anon,authenticated;
grant select on table public.shifts to authenticated;

revoke insert,update,delete on table public.expenses from public,anon,authenticated;
grant select on table public.expenses to authenticated;

revoke all on function sharawla_internal.enforce_shift_action_permission_v2() from public,anon,authenticated;
revoke all on function sharawla_internal.enforce_expense_action_permission_v2() from public,anon,authenticated;

revoke all on function public.expense_update_v2(bigint,text,numeric) from public,anon;
grant execute on function public.expense_update_v2(bigint,text,numeric) to authenticated;

notify pgrst, 'reload schema';

commit;
