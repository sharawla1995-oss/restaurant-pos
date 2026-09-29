-- Sharawla RC1 — Bon Numbering Policy V1 SOURCE CONTRACT
-- SOURCE ONLY / DEPLOYMENT 0.
-- Invoice numbering is intentionally untouched.
-- This artifact introduces policy metadata only. It does NOT activate BRANCH numbering.

create table if not exists public.branch_bon_numbering_policy(
  branch_id bigint primary key references public.branches(id) on delete cascade,
  bon_numbering_mode text not null default 'SHIFT' check(bon_numbering_mode in ('SHIFT','BRANCH')),
  updated_at timestamptz not null default now()
);

insert into public.branch_bon_numbering_policy(branch_id,bon_numbering_mode)
select id,'SHIFT' from public.branches
on conflict(branch_id) do nothing;

-- BRANCH counter is additive/dormant until the explicit scope migration is authorized.
create table if not exists public.branch_bon_counters_v1(
  branch_id bigint primary key references public.branches(id) on delete cascade,
  next_number integer not null default 1 check(next_number>=1)
);

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
