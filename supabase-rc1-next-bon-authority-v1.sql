-- Sharawla RC1 — Authoritative next BON preview V1
-- SOURCE ONLY. Do not deploy without explicit Beta DB authorization.
-- Production SH-0005 / SH-0006 are out of scope.
--
-- Purpose:
-- The POS must never infer the next BON from surviving orders after a Reset.
-- shift_bon_counters is the numbering authority and may intentionally continue
-- after business-data cleanup. This scoped SECURITY DEFINER reader exposes only
-- the current employee's open shift counter.

begin;

create or replace function public.pos_next_bon_v1(p_shift_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp bigint;
  v_branch bigint;
  v_next integer;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='غير مصرح';
  end if;

  v_emp := public.current_employee_id();
  if v_emp is null then
    raise exception using errcode='42501', message='تعذر تحديد الموظف الحالي';
  end if;

  select s.branch_id
    into v_branch
  from public.shifts s
  where s.id = p_shift_id
    and s.employee_id = v_emp
    and s.status = 'open'
    and s.closed_at is null
    and public.has_branch_access(s.branch_id)
  limit 1;

  if v_branch is null then
    raise exception using errcode='42501', message='الوردية غير مفتوحة أو غير مطابقة للموظف والفرع';
  end if;

  select c.next_number
    into v_next
  from public.shift_bon_counters c
  where c.shift_id = p_shift_id
    and c.branch_id = v_branch;

  -- A missing counter means no BON has been issued for this shift yet.
  -- Do not derive from orders: Reset may intentionally remove order history.
  v_next := coalesce(v_next, 1);

  return jsonb_build_object(
    'shift_id', p_shift_id,
    'branch_id', v_branch,
    'next_bon', v_next,
    'authority', 'shift_bon_counters'
  );
end;
$$;

revoke all on function public.pos_next_bon_v1(bigint) from public;
revoke all on function public.pos_next_bon_v1(bigint) from anon;
grant execute on function public.pos_next_bon_v1(bigint) to authenticated;
grant execute on function public.pos_next_bon_v1(bigint) to service_role;

commit;
