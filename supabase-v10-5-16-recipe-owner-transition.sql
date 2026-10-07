-- V10.5.16 — Recipe owner transition
-- Source only. Apply after all V10.5.16 food migrations pass Candidate PostgreSQL contract.
begin;

do $$
begin
  if to_regprocedure('public.create_food_pos_order_atomic_v1(jsonb,jsonb,jsonb)') is null then
    raise exception 'Advanced food sale owner is not installed';
  end if;
  if to_regprocedure('public.create_food_order_return_idempotent_v1(bigint,text,text,jsonb,jsonb,text)') is null then
    raise exception 'Advanced food return owner is not installed';
  end if;
  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='order_item_modifiers' and column_name='quantity'
  ) then
    raise exception 'V10.5.15 Exact Extras quantity is required before owner transition';
  end if;
end
$$;

-- Keep legacy functions for compatibility/evidence, but remove their write triggers.
drop trigger if exists trg_recipe_order_item_fail_open_v1 on public.order_items;
drop trigger if exists trg_recipe_return_item_fail_open_v1 on public.return_items;

do $$
begin
  if exists(
    select 1 from pg_trigger
    where tgrelid='public.order_items'::regclass
      and tgname='trg_recipe_order_item_fail_open_v1'
      and not tgisinternal
  ) then raise exception 'Legacy sale recipe owner is still active'; end if;
  if exists(
    select 1 from pg_trigger
    where tgrelid='public.return_items'::regclass
      and tgname='trg_recipe_return_item_fail_open_v1'
      and not tgisinternal
  ) then raise exception 'Legacy return recipe owner is still active'; end if;
end
$$;

commit;
