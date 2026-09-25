-- ============================================================
-- Sharawla POS V10.4.18
-- Weekly Website Opening Hours
-- RUN ON THE BUSINESS SUPABASE PROJECT (Top Burger), NOT Sharawla Cloud
--
-- Adds weekly automatic opening/closing while preserving the existing:
-- orders_open manual switch + orders_paused_until temporary pause.
-- Schedule is disabled by default, so existing behavior does not change
-- until it is explicitly enabled from POS > Website Management.
-- ============================================================

begin;

alter table public.branch_website_settings
  add column if not exists schedule_enabled boolean not null default false;

alter table public.branch_website_settings
  add column if not exists schedule_timezone text not null default 'Africa/Cairo';

create table if not exists public.branch_website_hours (
  branch_id bigint not null references public.branches(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  enabled boolean not null default true,
  open_time time without time zone not null default '12:00',
  close_time time without time zone not null default '03:00',
  updated_at timestamptz not null default now(),
  primary key (branch_id, day_of_week)
);

-- Default rows are harmless because schedule_enabled defaults to false.
insert into public.branch_website_hours (branch_id, day_of_week)
select b.id, d.day_of_week
from public.branches b
cross join generate_series(0,6) as d(day_of_week)
on conflict (branch_id, day_of_week) do nothing;

alter table public.branch_website_hours enable row level security;

grant select on public.branch_website_hours to anon, authenticated;
grant insert, update, delete on public.branch_website_hours to authenticated;

drop policy if exists branch_website_hours_public_read on public.branch_website_hours;
create policy branch_website_hours_public_read
on public.branch_website_hours
for select
to anon, authenticated
using (true);

drop policy if exists branch_website_hours_staff_write on public.branch_website_hours;
create policy branch_website_hours_staff_write
on public.branch_website_hours
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

-- Returns TRUE when the weekly schedule permits ordering at p_at.
-- day_of_week follows PostgreSQL DOW: Sunday=0 ... Saturday=6.
-- If close_time <= open_time, the range crosses midnight.
create or replace function public.is_branch_website_schedule_open(
  p_branch_id bigint,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.branch_website_settings%rowtype;
  today_hours public.branch_website_hours%rowtype;
  prev_hours public.branch_website_hours%rowtype;
  local_ts timestamp without time zone;
  local_dow integer;
  local_time time without time zone;
  prev_dow integer;
begin
  select * into s
  from public.branch_website_settings
  where branch_id = p_branch_id;

  if not found or not coalesce(s.schedule_enabled, false) then
    return true;
  end if;

  begin
    local_ts := p_at at time zone coalesce(nullif(trim(s.schedule_timezone), ''), 'Africa/Cairo');
  exception when invalid_parameter_value then
    local_ts := p_at at time zone 'Africa/Cairo';
  end;

  local_dow := extract(dow from local_ts)::integer;
  local_time := local_ts::time;
  prev_dow := (local_dow + 6) % 7;

  select * into today_hours
  from public.branch_website_hours
  where branch_id = p_branch_id
    and day_of_week = local_dow;

  if found and coalesce(today_hours.enabled, false) then
    -- Equal open/close means 24 hours for that day.
    if today_hours.open_time = today_hours.close_time then
      return true;
    end if;

    if today_hours.open_time < today_hours.close_time then
      if local_time >= today_hours.open_time
         and local_time < today_hours.close_time then
        return true;
      end if;
    else
      -- Overnight range: today's late-night portion.
      if local_time >= today_hours.open_time then
        return true;
      end if;
    end if;
  end if;

  -- Previous day's overnight range: today's after-midnight portion.
  select * into prev_hours
  from public.branch_website_hours
  where branch_id = p_branch_id
    and day_of_week = prev_dow;

  if found
     and coalesce(prev_hours.enabled, false)
     and prev_hours.open_time > prev_hours.close_time
     and local_time < prev_hours.close_time then
    return true;
  end if;

  return false;
end;
$$;

-- Combines existing manual/temporary controls with the weekly schedule.
create or replace function public.is_branch_website_open(
  p_branch_id bigint,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.branch_website_settings%rowtype;
begin
  select * into s
  from public.branch_website_settings
  where branch_id = p_branch_id;

  if found then
    if not coalesce(s.orders_open, true) then
      return false;
    end if;

    if s.orders_paused_until is not null
       and s.orders_paused_until > p_at then
      return false;
    end if;
  end if;

  return public.is_branch_website_schedule_open(p_branch_id, p_at);
end;
$$;

-- Server-side protection remains authoritative even if the website UI is stale.
create or replace function public.guard_website_order_branch_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_branch_website_open(new.branch_id, now()) then
    raise exception 'الفرع لا يستقبل طلبات الموقع حاليا';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_website_order_branch_open on public.website_orders;
create trigger trg_guard_website_order_branch_open
before insert on public.website_orders
for each row
execute function public.guard_website_order_branch_open();

-- Internal helper functions do not need direct PUBLIC execution.
revoke all on function public.is_branch_website_schedule_open(bigint,timestamptz) from public;
revoke all on function public.is_branch_website_open(bigint,timestamptz) from public;
revoke all on function public.guard_website_order_branch_open() from public;

commit;

notify pgrst, 'reload schema';

-- Verification: 7 rows per branch should exist.
select
  b.id as branch_id,
  b.name as branch_name,
  s.schedule_enabled,
  s.schedule_timezone,
  count(h.day_of_week) as schedule_days
from public.branches b
left join public.branch_website_settings s on s.branch_id = b.id
left join public.branch_website_hours h on h.branch_id = b.id
group by b.id, b.name, s.schedule_enabled, s.schedule_timezone
order by b.id;
