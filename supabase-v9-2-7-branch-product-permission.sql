-- V9.2.7 - branch product availability permission
-- Run this once in Supabase SQL Editor.
grant select, insert, update, delete on public.branch_products to authenticated;

drop policy if exists branch_products_branch_availability_write on public.branch_products;
create policy branch_products_branch_availability_write
on public.branch_products
for all to authenticated
using (
  public.current_employee_role() = 'admin'
  or (
    public.has_permission('branchProductAvailability')
    and public.has_branch_access(branch_id)
  )
)
with check (
  public.current_employee_role() = 'admin'
  or (
    public.has_permission('branchProductAvailability')
    and public.has_branch_access(branch_id)
  )
);

notify pgrst, 'reload schema';
