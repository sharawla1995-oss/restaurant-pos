-- Restaurant POS Cloud V3 migration

create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

insert into public.app_settings(key,value) values
('enable_extras','true'),
('enable_removals','true'),
('enable_item_notes','true'),
('enable_kitchen','true'),
('enable_receipt_print','true'),
('enable_inventory','true'),
('enable_delivery','true')
on conflict (key) do nothing;

alter table public.products add column if not exists allow_extras boolean not null default true;
alter table public.products add column if not exists allow_removals boolean not null default true;
alter table public.products add column if not exists allow_item_notes boolean not null default true;
alter table public.products add column if not exists removable_components text[] not null default '{}';

alter table public.app_settings enable row level security;

grant select, insert, update, delete on public.app_settings to authenticated;

drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated using (true);

drop policy if exists settings_admin_write on public.app_settings;
create policy settings_admin_write on public.app_settings for all to authenticated
using (public.is_admin()) with check (public.is_admin());
