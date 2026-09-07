-- Top Burger V9.2.8
-- Website branch order status + preparation time

create table if not exists public.branch_website_settings (
  branch_id bigint primary key references public.branches(id) on delete cascade,
  orders_open boolean not null default true,
  orders_paused_until timestamptz,
  prep_min integer not null default 30 check (prep_min between 5 and 240),
  prep_max integer not null default 45 check (prep_max between 5 and 240),
  updated_at timestamptz not null default now(),
  check (prep_max >= prep_min)
);

insert into public.branch_website_settings (branch_id)
select id from public.branches
on conflict (branch_id) do nothing;

alter table public.branch_website_settings enable row level security;

grant select on public.branch_website_settings to anon, authenticated;
grant insert, update on public.branch_website_settings to authenticated;

drop policy if exists branch_website_settings_public_read on public.branch_website_settings;
create policy branch_website_settings_public_read
on public.branch_website_settings
for select
to anon, authenticated
using (true);

drop policy if exists branch_website_settings_staff_write on public.branch_website_settings;
create policy branch_website_settings_staff_write
on public.branch_website_settings
for all
to authenticated
using (
  public.current_employee_role() = 'admin'
  or (
    public.has_permission('websiteBranchSettings')
    and public.has_branch_access(branch_id)
  )
)
with check (
  public.current_employee_role() = 'admin'
  or (
    public.has_permission('websiteBranchSettings')
    and public.has_branch_access(branch_id)
  )
);

-- Server-side protection: even if the website UI is stale,
-- an order cannot be inserted while that branch is stopped.
create or replace function public.guard_website_order_branch_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.branch_website_settings%rowtype;
begin
  select * into s
  from public.branch_website_settings
  where branch_id = new.branch_id;

  if found then
    if s.orders_open = false then
      raise exception 'الفرع لا يستقبل طلبات الموقع حاليا';
    end if;

    if s.orders_paused_until is not null and s.orders_paused_until > now() then
      raise exception 'الفرع لا يستقبل طلبات الموقع حاليا';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_website_order_branch_open on public.website_orders;
create trigger trg_guard_website_order_branch_open
before insert on public.website_orders
for each row
execute function public.guard_website_order_branch_open();

notify pgrst, 'reload schema';
