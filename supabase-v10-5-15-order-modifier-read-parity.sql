-- Sharawla POS 10.5.15 — order modifier read parity
-- Allows authenticated staff to read modifier rows only for orders in branches they can access.
-- Needed for receipt/prep reprints and order details. No write privilege is added.
begin;

grant select on table public.order_item_modifiers to authenticated;

drop policy if exists order_item_modifiers_staff_read_v15 on public.order_item_modifiers;
create policy order_item_modifiers_staff_read_v15
on public.order_item_modifiers
for select
to authenticated
using (
  exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = order_item_modifiers.order_item_id
      and public.has_branch_access(o.branch_id)
  )
);

commit;
