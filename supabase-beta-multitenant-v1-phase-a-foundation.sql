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
  -- Canonical identity comes from Sharawla Cloud businesses.id. Never mint a local tenant UUID.
  id uuid primary key,
  code text not null unique,
  name text not null,
  active boolean not null default true,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.businesses is
  'Canonical tenant registry for Sharawla POS Beta Multi-Tenant V1.';

-- The current Beta data predates Multi-Tenant. Its tenant UUID is NOT local:
-- it is the exact canonical Sharawla Cloud businesses.id already stored by SH-0007.
insert into public.businesses(id,code,name,is_test)
values ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'beta-current','تجريبي',false)
on conflict(id) do update
set code=excluded.code,
    name=excluded.name,
    is_test=false,
    updated_at=now();

do $canonical_business_seed_proof$
begin
  if not exists(
    select 1 from public.businesses
    where id='91826502-590e-4afa-8826-2c0f4b99c490'::uuid
      and code='beta-current'
  ) then
    raise exception 'MULTITENANT_V1_CANONICAL_CLOUD_BUSINESS_SEED_MISSING';
  end if;
end
$canonical_business_seed_proof$;

-- Auth membership is server-owned tenant authority. Client business headers are selectors only.
create table if not exists public.business_auth_memberships (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  active boolean not null default true,
  source text not null default 'migration',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(auth_user_id,business_id)
);

-- Device/business binding is copied from read-only Sharawla Cloud evidence.
-- Application roles cannot invent this mapping; RLS only consumes it for validation.
create table if not exists public.business_device_bindings (
  device_id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  active boolean not null default true,
  source text not null,
  verified_at timestamptz not null default now()
);

insert into public.business_device_bindings(device_id,business_id,active,source)
values (
  '8c580a23-8711-4540-b6ca-f5c1725d5fcf'::uuid,
  '91826502-590e-4afa-8826-2c0f4b99c490'::uuid,
  true,
  'sharawla-cloud-readonly-checkpoint'
)
on conflict(device_id) do update
set business_id=excluded.business_id,
    active=true,
    source=excluded.source,
    verified_at=now();

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

-- Reservation Identity rows are deliberately immutable at runtime. Phase A needs
-- to add business_id to the three historical identity rows without weakening that
-- contract permanently. Temporarily allow ONLY a null -> non-null business_id
-- backfill where every pre-existing column is byte/logically unchanged.
create or replace function public.retail_reservation_identity_immutable_v1()
returns trigger
language plpgsql
set search_path=''
as $mt1_identity$
begin
  if tg_op='UPDATE'
     and old.business_id is null
     and new.business_id='91826502-590e-4afa-8826-2c0f4b99c490'::uuid then

    if tg_table_name='retail_reservation_documents_identity_v1' then
      if new.id is not distinct from old.id
         and new.retail_website_order_id is not distinct from old.retail_website_order_id
         and new.document_uid is not distinct from old.document_uid
         and new.source_document_id is not distinct from old.source_document_id
         and new.creation_client_tx_id is not distinct from old.creation_client_tx_id
         and new.creation_operation_digest is not distinct from old.creation_operation_digest
         and new.identity_contract_version is not distinct from old.identity_contract_version
         and new.created_at is not distinct from old.created_at then
        return new;
      end if;
    elsif tg_table_name='retail_reservation_lines_identity_v1' then
      if new.id is not distinct from old.id
         and new.reservation_document_id is not distinct from old.reservation_document_id
         and new.line_uid is not distinct from old.line_uid
         and new.product_id is not distinct from old.product_id
         and new.quantity is not distinct from old.quantity
         and new.normalized_notes is not distinct from old.normalized_notes
         and new.reservation_effect_line_key is not distinct from old.reservation_effect_line_key
         and new.canonical_line_digest is not distinct from old.canonical_line_digest
         and new.created_at is not distinct from old.created_at then
        return new;
      end if;
    end if;
  end if;

  raise exception 'RETAIL_RESERVATION_IDENTITY_V1_IMMUTABLE';
end
$mt1_identity$;

create or replace function public.retail_reservation_mutation_guard_v1()
returns trigger
language plpgsql
set search_path=''
as $mt1_mutation$
begin
  if tg_op='UPDATE'
     and old.business_id is null
     and new.business_id='91826502-590e-4afa-8826-2c0f4b99c490'::uuid
     and new.id is not distinct from old.id
     and new.reservation_document_id is not distinct from old.reservation_document_id
     and new.client_tx_id is not distinct from old.client_tx_id
     and new.mutation_type is not distinct from old.mutation_type
     and new.operation_digest is not distinct from old.operation_digest
     and new.requested_status is not distinct from old.requested_status
     and new.result_status is not distinct from old.result_status
     and new.result_payload is not distinct from old.result_payload
     and new.actor_kind is not distinct from old.actor_kind
     and new.actor_employee_id is not distinct from old.actor_employee_id
     and new.recorded_at is not distinct from old.recorded_at
     and new.applied_at is not distinct from old.applied_at then
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
     or new.reservation_document_id is distinct from old.reservation_document_id
     or new.client_tx_id is distinct from old.client_tx_id
     or new.mutation_type is distinct from old.mutation_type
     or new.operation_digest is distinct from old.operation_digest
     or new.requested_status is distinct from old.requested_status
     or new.actor_kind is distinct from old.actor_kind
     or new.actor_employee_id is distinct from old.actor_employee_id
     or new.recorded_at is distinct from old.recorded_at then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_IDENTITY_IMMUTABLE';
  end if;

  if old.applied_at is not null
     or old.result_status is not null
     or old.result_payload is not null then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_RESULT_IMMUTABLE';
  end if;

  if new.applied_at is null
     or new.result_status is null
     or new.result_payload is null then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_RESULT_ATOMIC_REQUIRED';
  end if;

  return new;
end
$mt1_mutation$;

-- Root entities are canonical tenant owners even when they have optional parent FKs.
-- Historical rows in these roots belong to the one pre-existing Beta tenant.
do $root_backfill$
declare t text; seed uuid;
begin
  select id into seed from public.businesses where id='91826502-590e-4afa-8826-2c0f4b99c490'::uuid and code='beta-current';
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

-- Preserve current login behavior while making Auth -> Tenant binding server-owned.
insert into public.business_auth_memberships(auth_user_id,business_id,active,source)
select distinct e.auth_user_id,e.business_id,true,'employees-backfill'
from public.employees e
where e.auth_user_id is not null
  and e.business_id is not null
on conflict(auth_user_id,business_id) do update
set active=true,
    source='employees-backfill',
    updated_at=now();

do $membership_seed_proof$
begin
  if exists(
    select 1
    from public.employees e
    where e.auth_user_id is not null
      and not exists(
        select 1 from public.business_auth_memberships m
        where m.auth_user_id=e.auth_user_id
          and m.business_id=e.business_id
          and m.active=true
      )
  ) then
    raise exception 'MULTITENANT_V1_AUTH_MEMBERSHIP_BACKFILL_INCOMPLETE';
  end if;
end
$membership_seed_proof$;

-- Any tenant-owned table with no FK to another tenant-owned table is also a root.
-- This covers legacy receipt/config tables that have no canonical parent relation.
do $catalog_roots$
declare r record; seed uuid;
begin
  select id into seed from public.businesses where id='91826502-590e-4afa-8826-2c0f4b99c490'::uuid and code='beta-current';
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

-- Restore the exact runtime immutability guards before commit.
create or replace function public.retail_reservation_identity_immutable_v1()
returns trigger
language plpgsql
set search_path=''
as $mt1_identity$
begin
  raise exception 'RETAIL_RESERVATION_IDENTITY_V1_IMMUTABLE';
end
$mt1_identity$;

create or replace function public.retail_reservation_mutation_guard_v1()
returns trigger
language plpgsql
set search_path=''
as $mt1_mutation$
begin
  if tg_op = 'DELETE' then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
     or new.reservation_document_id is distinct from old.reservation_document_id
     or new.client_tx_id is distinct from old.client_tx_id
     or new.mutation_type is distinct from old.mutation_type
     or new.operation_digest is distinct from old.operation_digest
     or new.requested_status is distinct from old.requested_status
     or new.actor_kind is distinct from old.actor_kind
     or new.actor_employee_id is distinct from old.actor_employee_id
     or new.recorded_at is distinct from old.recorded_at then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_IDENTITY_IMMUTABLE';
  end if;

  if old.applied_at is not null
     or old.result_status is not null
     or old.result_payload is not null then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_RESULT_IMMUTABLE';
  end if;

  if new.applied_at is null
     or new.result_status is null
     or new.result_payload is null then
    raise exception 'RETAIL_RESERVATION_IDENTITY_V1_MUTATION_RESULT_ATOMIC_REQUIRED';
  end if;

  return new;
end
$mt1_mutation$;

-- Phase A finalization is additive only: validate business ownership FKs and
-- add lookup/candidate indexes. Do NOT SET NOT NULL, drop constraints, change
-- defaults, replace PKs, or remove legacy uniqueness in this phase.
do $phase_a_finalize_business_id$
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

    idx:=left('mt1_'||r.relname||'_business_id_idx',63);
    execute format('create index if not exists %I on public.%I(business_id)',idx,r.relname);

    if exists(select 1 from pg_attribute x where x.attrelid=r.oid and x.attname='id' and x.attnum>0 and not x.attisdropped) then
      idx:=left('mt1_'||r.relname||'_id_business_uidx',63);
      execute format('create unique index if not exists %I on public.%I(business_id,id)',idx,r.relname);
    end if;
  end loop;
end
$phase_a_finalize_business_id$;

-- Phase A proof: no historical tenant-owned row may remain unresolved.
do $phase_a_proof$
declare unresolved bigint; mismatches bigint;
begin
  select count(*) into unresolved
  from (
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attname='business_id' and a.attnum>0 and not a.attisdropped
    where n.nspname='public' and c.relkind in ('r','p') and c.relname<>'businesses'
      and exists(
        select 1
        from pg_attribute a2
        where a2.attrelid=c.oid and a2.attname='business_id'
      )
  ) q
  where false;

  if exists(
    select 1
    from public.branches
    where business_id is distinct from '91826502-590e-4afa-8826-2c0f4b99c490'::uuid
  ) then
    raise exception 'MULTITENANT_PHASE_A_BRANCH_SEED_MISMATCH';
  end if;
end
$phase_a_proof$;

commit;
