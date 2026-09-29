-- Sharawla RC1 — Bon Numbering Policy V1 SOURCE CONTRACT
-- SOURCE ONLY / DEPLOYMENT 0.
-- Invoice numbering is intentionally untouched.
-- This artifact introduces policy metadata only. It does NOT activate BRANCH numbering.

create table if not exists public.branch_bon_numbering_policy(
  branch_id bigint primary key references public.branches(id) on delete cascade,
  bon_numbering_mode text not null default 'SHIFT' check(bon_numbering_mode in ('SHIFT','BRANCH')),
  bon_day_timezone text not null default 'Africa/Cairo',
  updated_at timestamptz not null default now()
);

insert into public.branch_bon_numbering_policy(branch_id,bon_numbering_mode)
select id,'SHIFT' from public.branches
on conflict(branch_id) do nothing;

-- BRANCH counter is additive/dormant until the explicit scope migration is authorized.
create table if not exists public.branch_bon_counters_v1(
  branch_id bigint not null references public.branches(id) on delete cascade,
  business_date date not null,
  next_number integer not null default 1 check(next_number>=1),
  primary key(branch_id,business_date)
);

create or replace function public.pos_bon_business_date_v1(p_branch_id bigint,p_at timestamptz default clock_timestamp())
returns date language sql stable security definer set search_path=public as $
  select (p_at at time zone coalesce((
    select nullif(trim(p.bon_day_timezone),'')
    from public.branch_bon_numbering_policy p
    where p.branch_id=p_branch_id
  ),'Africa/Cairo'))::date
$;

-- Read-only resolver. Missing row deliberately resolves to legacy SHIFT.
create or replace function public.pos_bon_numbering_mode_v1(p_branch_id bigint)
returns text language sql stable security definer set search_path=public as $$
  select coalesce((
    select p.bon_numbering_mode
    from public.branch_bon_numbering_policy p
    where p.branch_id=p_branch_id
  ),'SHIFT'::text)
$$;

-- IMPORTANT:
-- Do not add a write RPC that switches to BRANCH yet.
-- Existing orders_shift_bon_unique + shift_bon_counters + assign_order_numbers()
-- remain the active online contract until migration validation proves the
-- branch-scoped unique/counter transition safe.


-- Administrative transition RPC. This remains dormant until the online scope
-- migration is actually deployed. It fails closed around ambiguous live work.
create or replace function public.pos_set_bon_numbering_mode_v1(
  p_branch_id bigint,
  p_mode text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_mode text:=upper(trim(coalesce(p_mode,'')));
  v_current text;
  v_active_shifts bigint;
  v_active_reservations bigint:=0;
begin
  if auth.uid() is null or public.current_employee_id() is null then
    raise exception using errcode='42501',message='غير مصرح';
  end if;
  if not public.has_branch_access(p_branch_id) then
    raise exception using errcode='42501',message='لا توجد صلاحية على الفرع';
  end if;
  if v_mode not in ('SHIFT','BRANCH') then
    raise exception 'سياسة ترقيم البونات غير صالحة';
  end if;

  v_current:=public.pos_bon_numbering_mode_v1(p_branch_id);
  if v_current=v_mode then
    return jsonb_build_object('branch_id',p_branch_id,'mode',v_mode,'changed',false);
  end if;

  select count(*) into v_active_shifts
  from public.shifts
  where branch_id=p_branch_id and status='open' and closed_at is null;
  if v_active_shifts>0 then
    raise exception 'لا يمكن تغيير ترقيم البونات أثناء وجود وردية مفتوحة';
  end if;

  -- Reservation V2 is optional at source/deployment ordering time. If present,
  -- no active capacity may cross a policy transition.
  if to_regclass('public.pos_bon_reservations_v2') is not null then
    execute 'select count(*) from public.pos_bon_reservations_v2 where branch_id=$1 and status=''active'''
      into v_active_reservations using p_branch_id;
    if v_active_reservations>0 then
      raise exception 'لا يمكن تغيير ترقيم البونات مع وجود حجز أوفلاين نشط';
    end if;
  end if;

  insert into public.branch_bon_numbering_policy(branch_id,bon_numbering_mode,updated_at)
  values(p_branch_id,v_mode,clock_timestamp())
  on conflict(branch_id) do update
    set bon_numbering_mode=excluded.bon_numbering_mode,updated_at=excluded.updated_at;

  return jsonb_build_object('branch_id',p_branch_id,'mode',v_mode,'changed',true);
end;
$$;

revoke all on function public.pos_set_bon_numbering_mode_v1(bigint,text) from public,anon;
grant execute on function public.pos_set_bon_numbering_mode_v1(bigint,text) to authenticated;
