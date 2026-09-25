-- V9.3.1 - Branch printing settings
-- Safe to run more than once.

create table if not exists public.branch_print_settings (
  branch_id bigint primary key references public.branches(id) on delete cascade,
  paper_size text not null default '80' check (paper_size in ('80','58')),
  customer_copies integer not null default 1 check (customer_copies between 1 and 5),
  prep_copies integer not null default 1 check (prep_copies between 1 and 5),
  show_logo boolean not null default true,
  show_business_name boolean not null default true,
  show_branch_phone boolean not null default true,
  show_branch_address boolean not null default true,
  receipt_header text,
  receipt_footer text,
  prep_show_prices boolean not null default false,
  auto_print_customer boolean not null default false,
  auto_print_prep boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.branch_print_settings(branch_id)
select id from public.branches
on conflict(branch_id) do nothing;

alter table public.branch_print_settings enable row level security;
grant select, insert, update on public.branch_print_settings to authenticated;

drop policy if exists branch_print_settings_read on public.branch_print_settings;
create policy branch_print_settings_read on public.branch_print_settings
for select to authenticated
using (public.is_admin() or public.has_branch_access(branch_id));

drop policy if exists branch_print_settings_write on public.branch_print_settings;
create policy branch_print_settings_write on public.branch_print_settings
for all to authenticated
using (public.is_admin() or (public.has_permission('printingSettings') and public.has_branch_access(branch_id)))
with check (public.is_admin() or (public.has_permission('printingSettings') and public.has_branch_access(branch_id)));

notify pgrst, 'reload schema';
