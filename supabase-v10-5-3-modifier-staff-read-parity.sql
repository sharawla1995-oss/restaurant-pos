-- Top Burger / Sharawla POS — cashier modifier read parity
-- Production-safe RLS patch: read-only access for authenticated staff.
-- Does not grant INSERT/UPDATE/DELETE and does not alter website anon policies.

drop policy if exists modifiers_staff_read on public.modifiers;
create policy modifiers_staff_read
on public.modifiers
for select
to authenticated
using (public.current_employee_id() is not null and active = true);

drop policy if exists product_modifiers_staff_read on public.product_modifiers;
create policy product_modifiers_staff_read
on public.product_modifiers
for select
to authenticated
using (public.current_employee_id() is not null);
