-- Restaurant POS V6 - Shifts, reports, delivery receipt snapshots
-- Run once in Supabase SQL Editor BEFORE uploading V6 files.

alter table public.orders add column if not exists shift_id bigint references public.shifts(id) on delete set null;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists delivery_area text;
alter table public.expenses add column if not exists shift_id bigint references public.shifts(id) on delete set null;

alter table public.shifts add column if not exists closed_by_employee_id bigint references public.employees(id) on delete set null;
alter table public.shifts add column if not exists sales_total numeric(12,2) not null default 0;
alter table public.shifts add column if not exists cash_sales numeric(12,2) not null default 0;
alter table public.shifts add column if not exists wallet_sales numeric(12,2) not null default 0;
alter table public.shifts add column if not exists instapay_sales numeric(12,2) not null default 0;
alter table public.shifts add column if not exists expenses_total numeric(12,2) not null default 0;
alter table public.shifts add column if not exists expected_cash numeric(12,2) not null default 0;
alter table public.shifts add column if not exists cash_difference numeric(12,2) not null default 0;
alter table public.shifts add column if not exists orders_count integer not null default 0;
alter table public.shifts add column if not exists close_notes text;

create index if not exists idx_orders_shift_id on public.orders(shift_id);
create index if not exists idx_expenses_shift_id on public.expenses(shift_id);
create index if not exists idx_orders_created_branch on public.orders(created_at,branch_id);
create index if not exists idx_shifts_opened_branch on public.shifts(opened_at,branch_id);

-- Keep previous orders readable in reports; new orders will store customer_name/area snapshots.
update public.orders o
set customer_name = coalesce(o.customer_name,c.name)
from public.customers c
where o.customer_id=c.id and o.customer_name is null;

notify pgrst, 'reload schema';
