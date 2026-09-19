-- Point 4B-2 genuine committed-concurrency acceptance harness
-- Disposable PostgreSQL only. Never run against Production or operational Beta.
\set ON_ERROR_STOP on

create extension if not exists pgcrypto;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table public.branches(
  id bigint primary key,
  active boolean not null default true,
  location_type text not null default 'branch'
);
create table public.products(
  id bigint primary key,
  name text not null default 'Test product'
);
create table public.product_variants(
  id bigint primary key,
  product_id bigint not null references public.products(id),
  is_stock_unit boolean not null default false
);
create table public.ingredients(
  id bigint primary key
);
create table public.employees(
  id bigint primary key
);
create or replace function public.has_branch_access(bigint)
returns boolean language sql stable as $$ select true $$;

\i supabase-point4-stock-v2-foundation.sql
\i supabase-point4-stock-v2-writer.sql

insert into public.branches(id,active,location_type) values (1,true,'branch');
insert into public.products(id,name) values (1,'Concurrency Test Product');

select public.inventory_stock_apply_movement_v2(
  'seed-open','seed-line',1,'product',1,'opening',
  100,0,10,null,'ci_seed','seed-doc',null,null,clock_timestamp(),0,null,'ci', '{}'::jsonb
);

create or replace function public.p4b2_ci_apply(
  p_client_tx_id text,
  p_line_key text,
  p_movement_type text,
  p_quantity numeric,
  p_reversal_of bigint default null
) returns jsonb
language sql
as $$
  select public.inventory_stock_apply_movement_v2(
    p_client_tx_id,p_line_key,
    case when p_movement_type='reversal' then null else 1 end,
    case when p_movement_type='reversal' then null else 'product' end,
    case when p_movement_type='reversal' then null else 1 end,
    p_movement_type,
    p_quantity,0,null,null,
    'ci_concurrency','ci-doc',
    null,p_reversal_of,clock_timestamp(),null,null,'ci','{}'::jsonb
  )
$$;
