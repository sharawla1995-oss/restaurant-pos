-- Sharawla RC1 — Bon Numbering Policy V1 online migration SOURCE
-- SOURCE ONLY / DEPLOYMENT 0. Invoice numbering semantics are preserved.
-- Historical orders remain legacy SHIFT-scoped; no historical Bon is renumbered.

alter table public.orders
  add column if not exists bon_numbering_mode text,
  add column if not exists bon_business_date date;

alter table public.orders
  drop constraint if exists orders_bon_numbering_mode_ck;
alter table public.orders
  add constraint orders_bon_numbering_mode_ck
  check(bon_numbering_mode is null or bon_numbering_mode in ('SHIFT','BRANCH')) not valid;

-- Existing rows deliberately stay NULL: NULL means historical legacy SHIFT semantics.
-- New BRANCH rows get branch uniqueness without colliding with historical repeated Bons.
create unique index if not exists orders_branch_bon_policy_unique
on public.orders(branch_id,bon_business_date,bon_number)
where bon_numbering_mode='BRANCH' and bon_business_date is not null and bon_number is not null;

-- Preserve the historical SHIFT unique index. Add an explicit policy-scoped index for
-- new SHIFT-stamped rows; the old index remains the compatibility authority.
create unique index if not exists orders_shift_bon_policy_unique
on public.orders(shift_id,bon_number)
where bon_numbering_mode='SHIFT' and shift_id is not null and bon_number is not null;

create or replace function public.assign_order_numbers()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v bigint;
  v_bon_mode text;
  v_bon_date date;
begin
  -- Preserve existing shift attachment behavior.
  if new.shift_id is null and new.employee_id is not null then
    select s.id into new.shift_id
    from public.shifts s
    where s.branch_id=new.branch_id and s.employee_id=new.employee_id
      and s.status='open' and s.closed_at is null
    order by s.opened_at desc limit 1;
  end if;

  -- Invoice contract is intentionally unchanged.
  if new.invoice_number is null then
    insert into public.branch_invoice_counters(branch_id,next_number)
    values(new.branch_id,2)
    on conflict(branch_id) do update
      set next_number=public.branch_invoice_counters.next_number+1
    returning next_number-1 into v;
    new.invoice_number:=v;
  end if;

  v_bon_mode:=public.pos_bon_numbering_mode_v1(new.branch_id);
  if v_bon_mode not in ('SHIFT','BRANCH') then
    raise exception 'سياسة ترقيم البونات غير صالحة';
  end if;

  -- Freeze the policy on every newly numbered order. A caller may not smuggle a
  -- different scope with a supplied reserved Bon.
  if new.bon_numbering_mode is not null and new.bon_numbering_mode<>v_bon_mode then
    raise exception 'سياسة البون المرسلة لا تطابق سياسة الفرع';
  end if;
  new.bon_numbering_mode:=v_bon_mode;
  if v_bon_mode='BRANCH' then
    v_bon_date:=public.pos_bon_business_date_v1(new.branch_id);
    if new.bon_business_date is not null and new.bon_business_date<>v_bon_date then
      raise exception 'يوم البون المرسل لا يطابق يوم تشغيل الفرع';
    end if;
    new.bon_business_date:=v_bon_date;
  else
    new.bon_business_date:=null;
  end if;

  if new.bon_number is null then
    if v_bon_mode='SHIFT' then
      if new.shift_id is not null then
        insert into public.shift_bon_counters(shift_id,branch_id,next_number)
        values(new.shift_id,new.branch_id,2)
        on conflict(shift_id) do update
          set next_number=public.shift_bon_counters.next_number+1
        returning next_number-1 into v;
        new.bon_number:=v::integer;
      end if;
    else
      insert into public.branch_bon_counters_v1(branch_id,business_date,next_number)
      values(new.branch_id,v_bon_date,2)
      on conflict(branch_id,business_date) do update
        set next_number=public.branch_bon_counters_v1.next_number+1
      returning next_number-1 into v;
      new.bon_number:=v::integer;
    end if;
  end if;

  return new;
end $$;

-- Preflight evidence query for a future authorized deployment. It performs no writes.
-- BRANCH activation must additionally require trusted-device assertion for Offline
-- reservations and a clean policy-transition gate (no active reservation/pending sale).
create or replace function public.pos_bon_policy_preflight_v1(p_branch_id bigint)
returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'branch_id',p_branch_id,
    'mode',public.pos_bon_numbering_mode_v1(p_branch_id),
    'historical_branch_duplicate_groups',(
      select count(*) from (
        select bon_number
        from public.orders
        where branch_id=p_branch_id and bon_number is not null
          and bon_numbering_mode is null
        group by bon_number having count(*)>1
      ) d
    ),
    'active_reservations_v2',(
      -- Keep this migration deployable before Bon Reservation V2 exists.
      -- Transition authorization must still be rechecked after V2 deployment.
      case when to_regclass('public.pos_bon_reservations_v2') is null then null
      else (
        select count(*)
        from public.pos_bon_reservations_v2
        where branch_id=p_branch_id and status='active'
      ) end
    )
  )
$$;

notify pgrst,'reload schema';
