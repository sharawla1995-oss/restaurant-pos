-- V8.8: flexible per-user permissions
-- Safe to run once. Existing users without rows keep the old role defaults until edited in Users.

create table if not exists public.employee_permissions (
  employee_id bigint not null references public.employees(id) on delete cascade,
  permission_key text not null,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (employee_id, permission_key)
);

alter table public.employee_permissions enable row level security;
grant select, insert, update, delete on public.employee_permissions to authenticated;
grant select, insert, update, delete on public.employee_permissions to service_role;

drop policy if exists employee_permissions_self_read on public.employee_permissions;
create policy employee_permissions_self_read
on public.employee_permissions for select to authenticated
using (
  employee_id = public.current_employee_id()
  or public.current_employee_role() = 'admin'
);

drop policy if exists employee_permissions_admin_write on public.employee_permissions;
create policy employee_permissions_admin_write
on public.employee_permissions for all to authenticated
using (public.current_employee_role() = 'admin')
with check (public.current_employee_role() = 'admin');

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_employee_role() = 'admin'
    or exists (
      select 1 from public.employee_permissions ep
      where ep.employee_id = public.current_employee_id()
        and ep.permission_key = p_permission
        and ep.allowed = true
    ), false
  );
$$;

grant execute on function public.has_permission(text) to authenticated, service_role;

-- Allow users explicitly granted product management to manage the shared catalog.
drop policy if exists products_permission_write on public.products;
create policy products_permission_write on public.products
for all to authenticated
using (public.has_permission('products'))
with check (public.has_permission('products'));

drop policy if exists categories_permission_write on public.categories;
create policy categories_permission_write on public.categories
for all to authenticated
using (public.has_permission('products'))
with check (public.has_permission('products'));

-- Delivery setup permission, still branch-scoped.
drop policy if exists delivery_drivers_permission_write on public.delivery_drivers;
create policy delivery_drivers_permission_write on public.delivery_drivers
for all to authenticated
using (public.has_permission('deliverySettings') and public.has_branch_access(branch_id))
with check (public.has_permission('deliverySettings') and public.has_branch_access(branch_id));

drop policy if exists delivery_zones_permission_write on public.delivery_zones;
create policy delivery_zones_permission_write on public.delivery_zones
for all to authenticated
using (public.has_permission('deliverySettings') and public.has_branch_access(branch_id))
with check (public.has_permission('deliverySettings') and public.has_branch_access(branch_id));

notify pgrst, 'reload schema';
