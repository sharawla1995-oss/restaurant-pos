-- Sharawla POS — Beta Multi-Tenant V1 Foundation
-- SOURCE PREPARATION ONLY. DO NOT APPLY without explicit Beta DB cutover approval.
-- Authorized future target ONLY: xihcxydjnzemflhedzor (sharawla beta restaurant test).
-- Production/Top Burger is out of scope.
--
-- Apply guard:
--   SET sharawla.multitenant_apply = 'beta-only-approved';
-- must be set explicitly in the same database session before this migration is run.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
end
$guard$;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  external_business_id text unique,
  active boolean not null default true,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.businesses is
  'Canonical tenant registry for Sharawla POS Beta Multi-Tenant V1.';

-- The current Beta data predates Multi-Tenant and is known to belong to one
-- existing business. Preserve it as the canonical tenant named "تجريبي".
insert into public.businesses(code,name,is_test)
values ('beta-current','تجريبي',false)
on conflict(code) do update
set name=excluded.name,
    is_test=false,
    updated_at=now();

-- Platform-global immutable/action catalog tables are deliberately not tenant-owned.
-- Everything else in public is treated as tenant-owned unless explicitly reviewed.
do $add_business_id$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind in ('r','p')
      and c.relname not in (
        'businesses',
        'permission_actions_v2',
        'permission_action_profiles_v2',
        'permission_role_action_defaults_v2'
      )
  loop
    execute format('alter table public.%I add column if not exists business_id uuid',r.relname);
  end loop;
end
$add_business_id$;

-- Add NOT VALID FK first. Validation occurs only after canonical backfill.
do $add_business_fk$
declare r record; cname text;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid
      and a.attname='business_id' and a.attnum>0 and not a.attisdropped
    where n.nspname='public'
      and c.relkind in ('r','p')
      and c.relname <> 'businesses'
  loop
    cname:=left(r.relname || '_business_id_fkey',63);
    if not exists (
      select 1 from pg_constraint co
      where co.conrelid=format('public.%I',r.relname)::regclass
        and co.conname=cname
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (business_id) references public.businesses(id) not valid',
        r.relname,cname
      );
    end if;
  end loop;
end
$add_business_fk$;

-- Root entities are canonical tenant owners even when they have optional parent FKs.
-- Historical rows in these roots belong to the one pre-existing Beta tenant.
do $root_backfill$
declare t text; seed uuid;
begin
  select id into seed from public.businesses where code='beta-current';
  if seed is null then raise exception 'beta-current tenant missing'; end if;

  foreach t in array array[
    'app_settings',
    'automotive_vehicle_models_v1',
    'business_settings',
    'branches',
    'categories',
    'customers',
    'education_school_lists_v1',
    'employees',
    'food_prep_items',
    'food_waste_reasons',
    'healthcare_insurance_providers_v1',
    'ingredients',
    'inventory_units',
    'logistics_zones_v1',
    'membership_plans_v1',
    'modifiers',
    'payment_methods',
    'pharmacy_insurance_companies',
    'products',
    'promo_codes',
    'retail_suppliers',
    'service_catalog',
    'sharawla_licenses',
    'suppliers',
    'website_settings'
  ]
  loop
    if to_regclass('public.'||t) is not null then
      execute format('update public.%I set business_id=$1 where business_id is null',t) using seed;
    end if;
  end loop;
end
$root_backfill$;

-- Any tenant-owned table with no FK to another tenant-owned table is also a root.
-- This covers legacy receipt/config tables that have no canonical parent relation.
do $catalog_roots$
declare r record; seed uuid;
begin
  select id into seed from public.businesses where code='beta-current';
  for r in
    select c.oid,c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute ba on ba.attrelid=c.oid
      and ba.attname='business_id' and ba.attnum>0 and not ba.attisdropped
    where n.nspname='public'
      and c.relkind in ('r','p')
      and c.relname <> 'businesses'
      and not exists (
        select 1
        from pg_constraint fk
        join pg_class p on p.oid=fk.confrelid
        join pg_namespace pn on pn.oid=p.relnamespace and pn.nspname='public'
        join pg_attribute pba on pba.attrelid=p.oid
          and pba.attname='business_id' and pba.attnum>0 and not pba.attisdropped
        where fk.contype='f' and fk.conrelid=c.oid
      )
  loop
    execute format('update public.%I set business_id=$1 where business_id is null',r.relname) using seed;
  end loop;
end
$catalog_roots$;

-- Canonical branch owner takes precedence wherever a real FK to branches exists.
do $branch_backfill$
declare r record; join_sql text;
begin
  for r in
    select fk.oid,fk.conrelid,child.relname child_table,
           ca.attname child_col, pa.attname parent_col
    from pg_constraint fk
    join pg_class child on child.oid=fk.conrelid
    join pg_namespace cn on cn.oid=child.relnamespace and cn.nspname='public'
    join pg_class parent on parent.oid=fk.confrelid
    join pg_namespace pn on pn.oid=parent.relnamespace and pn.nspname='public'
    join pg_attribute ca on ca.attrelid=child.oid and ca.attnum=fk.conkey[1]
    join pg_attribute pa on pa.attrelid=parent.oid and pa.attnum=fk.confkey[1]
    where fk.contype='f'
      and parent.relname='branches'
      and array_length(fk.conkey,1)=1
      and exists (
        select 1 from pg_attribute x
        where x.attrelid=child.oid and x.attname='business_id'
          and x.attnum>0 and not x.attisdropped
      )
  loop
    join_sql:=format(
      'update public.%I c set business_id=b.business_id from public.branches b '||
      'where c.business_id is null and c.%I=b.%I and b.business_id is not null',
      r.child_table,r.child_col,r.parent_col
    );
    execute join_sql;
  end loop;
end
$branch_backfill$;

-- Propagate tenant ownership through canonical single-column FK owners.
-- No random child mapping: a child receives business_id only from an existing parent row.
do $parent_backfill$
declare pass int; r record; changed bigint; total_changed bigint;
begin
  for pass in 1..32 loop
    total_changed:=0;
    for r in
      select child.relname child_table,parent.relname parent_table,
             ca.attname child_col,pa.attname parent_col
      from pg_constraint fk
      join pg_class child on child.oid=fk.conrelid
      join pg_namespace cn on cn.oid=child.relnamespace and cn.nspname='public'
      join pg_class parent on parent.oid=fk.confrelid
      join pg_namespace pn on pn.oid=parent.relnamespace and pn.nspname='public'
      join pg_attribute ca on ca.attrelid=child.oid and ca.attnum=fk.conkey[1]
      join pg_attribute pa on pa.attrelid=parent.oid and pa.attnum=fk.confkey[1]
      where fk.contype='f'
        and array_length(fk.conkey,1)=1
        and exists(select 1 from pg_attribute x where x.attrelid=child.oid and x.attname='business_id' and x.attnum>0 and not x.attisdropped)
        and exists(select 1 from pg_attribute x where x.attrelid=parent.oid and x.attname='business_id' and x.attnum>0 and not x.attisdropped)
    loop
      execute format(
        'update public.%I c set business_id=p.business_id from public.%I p '||
        'where c.business_id is null and c.%I=p.%I and p.business_id is not null',
        r.child_table,r.parent_table,r.child_col,r.parent_col
      );
      get diagnostics changed = row_count;
      total_changed:=total_changed+changed;
    end loop;
    exit when total_changed=0;
  end loop;
end
$parent_backfill$;

-- If a table still has unresolved historical rows, abort rather than guessing.
do $no_unresolved_rows$
declare r record; n bigint;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace ns on ns.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid
      and a.attname='business_id' and a.attnum>0 and not a.attisdropped
    where ns.nspname='public' and c.relkind in ('r','p') and c.relname<>'businesses'
  loop
    execute format('select count(*) from public.%I where business_id is null',r.relname) into n;
    if n>0 then
      raise exception 'MULTITENANT_V1 unresolved business ownership: table %, rows %',r.relname,n;
    end if;
  end loop;
end
$no_unresolved_rows$;

-- Detect any existing cross-parent mismatch before constraints become strict.
do $parent_consistency$
declare r record; n bigint;
begin
  for r in
    select child.relname child_table,parent.relname parent_table,
           ca.attname child_col,pa.attname parent_col
    from pg_constraint fk
    join pg_class child on child.oid=fk.conrelid
    join pg_namespace cn on cn.oid=child.relnamespace and cn.nspname='public'
    join pg_class parent on parent.oid=fk.confrelid
    join pg_namespace pn on pn.oid=parent.relnamespace and pn.nspname='public'
    join pg_attribute ca on ca.attrelid=child.oid and ca.attnum=fk.conkey[1]
    join pg_attribute pa on pa.attrelid=parent.oid and pa.attnum=fk.confkey[1]
    where fk.contype='f'
      and array_length(fk.conkey,1)=1
      and exists(select 1 from pg_attribute x where x.attrelid=child.oid and x.attname='business_id' and x.attnum>0 and not x.attisdropped)
      and exists(select 1 from pg_attribute x where x.attrelid=parent.oid and x.attname='business_id' and x.attnum>0 and not x.attisdropped)
  loop
    execute format(
      'select count(*) from public.%I c join public.%I p on c.%I=p.%I '||
      'where c.business_id is distinct from p.business_id',
      r.child_table,r.parent_table,r.child_col,r.parent_col
    ) into n;
    if n>0 then
      raise exception 'MULTITENANT_V1 parent tenant mismatch %.% -> %.% (% rows)',
        r.child_table,r.child_col,r.parent_table,r.parent_col,n;
    end if;
  end loop;
end
$parent_consistency$;

-- Validate tenant FKs, enforce NOT NULL and create lookup indexes.
do $finalize_business_id$
declare r record; cname text; idx text;
begin
  for r in
    select c.oid,c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid
      and a.attname='business_id' and a.attnum>0 and not a.attisdropped
    where n.nspname='public' and c.relkind in ('r','p') and c.relname<>'businesses'
  loop
    cname:=left(r.relname || '_business_id_fkey',63);
    if exists(select 1 from pg_constraint co where co.conrelid=r.oid and co.conname=cname and not co.convalidated) then
      execute format('alter table public.%I validate constraint %I',r.relname,cname);
    end if;
    execute format('alter table public.%I alter column business_id set not null',r.relname);
    idx:=left('mt1_'||r.relname||'_business_id_idx',63);
    execute format('create index if not exists %I on public.%I(business_id)',idx,r.relname);

    -- Simple id PK tables get a composite candidate key so child composite FKs
    -- can be added without changing legacy global IDs.
    if exists(select 1 from pg_attribute x where x.attrelid=r.oid and x.attname='id' and x.attnum>0 and not x.attisdropped) then
      idx:=left('mt1_'||r.relname||'_id_business_uidx',63);
      execute format('create unique index if not exists %I on public.%I(id,business_id)',idx,r.relname);
    end if;
  end loop;
end
$finalize_business_id$;

-- Legacy singleton compatibility:
-- keep logical id=1 for every tenant, so existing v10.5.x reads can continue.
-- Existing row stays id=1; future tenants can also own id=1 because uniqueness
-- is changed from global id to (business_id,id).
do $singleton_compat$
declare t text; pkname text;
begin
  foreach t in array array['business_settings','website_settings']
  loop
    if to_regclass('public.'||t) is null then continue; end if;
    select co.conname into pkname
    from pg_constraint co
    where co.conrelid=to_regclass('public.'||t) and co.contype='p'
    limit 1;
    if pkname is not null then
      execute format('alter table public.%I drop constraint %I',t,pkname);
    end if;
    execute format('alter table public.%I add primary key (business_id,id)',t);
  end loop;
end
$singleton_compat$;

commit;
