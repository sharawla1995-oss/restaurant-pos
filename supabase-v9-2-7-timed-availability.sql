-- Top Burger POS V9.2.7 — temporary website product availability
alter table public.branch_products
  add column if not exists website_paused_until timestamptz null;

comment on column public.branch_products.website_paused_until is
  'If in the future, the product is temporarily unavailable on the website for this branch. NULL means no timed pause.';

-- Existing branch_products RLS/permissions remain unchanged.
notify pgrst, 'reload schema';
