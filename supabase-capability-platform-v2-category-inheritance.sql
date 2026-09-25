-- Sharawla Cloud Capability Platform V2
-- Category inheritance layer + feature classification.
-- Additive migration: no existing business/category override rows are created or changed.
-- Resolution order: Core lock -> Profile defaults -> Activity Category overrides -> Business overrides.

begin;

-- -----------------------------------------------------------------------------
-- 1) Feature classification
-- -----------------------------------------------------------------------------
alter table public.features
  add column if not exists feature_class text;

update public.features f
set feature_class = case
  when lower(f.domain) = 'core' then 'core'
  when f.implemented = false then 'planned'
  when exists (
    select 1
    from public.profile_features pf
    where pf.feature_id = f.id
      and pf.enabled = true
      and pf.required = true
  ) then 'standard'
  else 'add_on'
end
where f.feature_class is null
   or f.feature_class not in ('core','standard','add_on','planned');

alter table public.features
  alter column feature_class set default 'planned',
  alter column feature_class set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'features_feature_class_check'
      and conrelid = 'public.features'::regclass
  ) then
    alter table public.features
      add constraint features_feature_class_check
      check (feature_class in ('core','standard','add_on','planned'));
  end if;
end $$;

comment on column public.features.feature_class is
  'Capability classification: core, standard, add_on, planned. Planned capabilities are never activatable until implemented=true.';

-- -----------------------------------------------------------------------------
-- 2) Activity Category override layer
--    No row = inherit from POS Profile.
-- -----------------------------------------------------------------------------
create table if not exists public.activity_category_features (
  activity_category_id uuid not null references public.activity_categories(id) on delete cascade,
  feature_id uuid not null references public.features(id) on delete cascade,
  enabled boolean not null,
  required boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (activity_category_id, feature_id),
  constraint activity_category_features_required_enabled_check
    check (required = false or enabled = true)
);

create index if not exists idx_activity_category_features_feature
  on public.activity_category_features(feature_id);

alter table public.activity_category_features enable row level security;

comment on table public.activity_category_features is
  'Activity Category capability overrides. No row means inherit the Profile baseline.';
comment on column public.activity_category_features.required is
  'When true, the capability is locked ON for businesses in this category and cannot be disabled by Business Override.';

-- -----------------------------------------------------------------------------
-- 3) Existing Admin business matrix, now Category-aware.
--    Signature is unchanged for Sharawla Admin V3.6 compatibility.
-- -----------------------------------------------------------------------------
create or replace function public.admin_get_business_feature_matrix(p_business_id uuid)
returns table(
  feature_code text,
  domain text,
  name_ar text,
  implemented boolean,
  default_enabled boolean,
  required boolean,
  override_enabled boolean,
  effective_enabled boolean,
  depends_on text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_sharawla_admin() then
    raise exception 'Admin access required';
  end if;
  if not exists(select 1 from public.businesses where id=p_business_id) then
    raise exception 'Business not found';
  end if;

  return query
  with biz as (
    select b.id, b.pos_profile_id, b.activity_category_id
    from public.businesses b
    where b.id = p_business_id
  ), resolved as (
    select
      f.id as feature_id,
      f.code,
      f.domain,
      f.name_ar,
      f.implemented,
      f.feature_class,
      coalesce(pf.enabled,false) as profile_enabled,
      coalesce(pf.required,false) and coalesce(pf.enabled,false) as profile_required,
      acf.enabled as category_override_enabled,
      coalesce(acf.required,false) and coalesce(acf.enabled,false) as category_required,
      bf.enabled as business_override_enabled
    from biz b
    cross join public.features f
    left join public.profile_features pf
      on pf.profile_id=b.pos_profile_id and pf.feature_id=f.id
    left join public.activity_category_features acf
      on acf.activity_category_id=b.activity_category_id and acf.feature_id=f.id
    left join public.business_features bf
      on bf.business_id=b.id and bf.feature_id=f.id
    where f.active=true
  )
  select
    r.code,
    r.domain,
    r.name_ar,
    r.implemented,
    case
      when r.feature_class='core' then true
      when r.profile_required then true
      else coalesce(r.category_override_enabled,r.profile_enabled,false)
    end as default_enabled,
    (r.feature_class='core' or r.profile_required or r.category_required) as required,
    r.business_override_enabled,
    case
      when r.feature_class='core' or r.profile_required or r.category_required then true
      when r.business_override_enabled is not null then r.business_override_enabled
      else coalesce(r.category_override_enabled,r.profile_enabled,false)
    end as effective_enabled,
    coalesce((
      select array_agg(dep.code order by dep.code)
      from public.feature_dependencies d
      join public.features dep on dep.id=d.depends_on_feature_id
      where d.feature_id=r.feature_id
    ),array[]::text[]) as depends_on
  from resolved r
  order by r.domain,r.code;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Extended V2 business matrix with inheritance source + classification.
-- -----------------------------------------------------------------------------
create or replace function public.admin_get_business_feature_matrix_v2(p_business_id uuid)
returns table(
  feature_code text,
  domain text,
  name_ar text,
  name_en text,
  feature_class text,
  implemented boolean,
  profile_enabled boolean,
  profile_required boolean,
  category_override_enabled boolean,
  category_required boolean,
  baseline_enabled boolean,
  required boolean,
  business_override_enabled boolean,
  effective_enabled boolean,
  inheritance_source text,
  depends_on text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_sharawla_admin() then
    raise exception 'Admin access required';
  end if;
  if not exists(select 1 from public.businesses where id=p_business_id) then
    raise exception 'Business not found';
  end if;

  return query
  with biz as (
    select b.id, b.pos_profile_id, b.activity_category_id
    from public.businesses b
    where b.id=p_business_id
  ), resolved as (
    select
      f.id as feature_id,
      f.code,
      f.domain,
      f.name_ar,
      f.name_en,
      f.feature_class,
      f.implemented,
      coalesce(pf.enabled,false) as p_enabled,
      coalesce(pf.required,false) and coalesce(pf.enabled,false) as p_required,
      acf.enabled as c_enabled,
      coalesce(acf.required,false) and coalesce(acf.enabled,false) as c_required,
      bf.enabled as b_enabled
    from biz b
    cross join public.features f
    left join public.profile_features pf
      on pf.profile_id=b.pos_profile_id and pf.feature_id=f.id
    left join public.activity_category_features acf
      on acf.activity_category_id=b.activity_category_id and acf.feature_id=f.id
    left join public.business_features bf
      on bf.business_id=b.id and bf.feature_id=f.id
    where f.active=true
  )
  select
    r.code,
    r.domain,
    r.name_ar,
    r.name_en,
    r.feature_class,
    r.implemented,
    r.p_enabled,
    r.p_required,
    r.c_enabled,
    r.c_required,
    case
      when r.feature_class='core' or r.p_required then true
      else coalesce(r.c_enabled,r.p_enabled,false)
    end as baseline_enabled,
    (r.feature_class='core' or r.p_required or r.c_required) as required,
    r.b_enabled,
    case
      when r.feature_class='core' or r.p_required or r.c_required then true
      when r.b_enabled is not null then r.b_enabled
      else coalesce(r.c_enabled,r.p_enabled,false)
    end as effective_enabled,
    case
      when r.b_enabled is not null then 'business'
      when r.c_enabled is not null or r.c_required then 'category'
      when r.feature_class='core' then 'core'
      when r.p_enabled or r.p_required then 'profile'
      else 'none'
    end as inheritance_source,
    coalesce((
      select array_agg(dep.code order by dep.code)
      from public.feature_dependencies d
      join public.features dep on dep.id=d.depends_on_feature_id
      where d.feature_id=r.feature_id
    ),array[]::text[]) as depends_on
  from resolved r
  order by r.domain,r.code;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Activity Category matrix + setters.
-- -----------------------------------------------------------------------------
create or replace function public.admin_get_activity_category_feature_matrix(p_activity_category_id uuid)
returns table(
  feature_code text,
  domain text,
  name_ar text,
  name_en text,
  feature_class text,
  implemented boolean,
  profile_code text,
  profile_enabled boolean,
  profile_required boolean,
  category_override_enabled boolean,
  category_required boolean,
  effective_enabled boolean,
  effective_required boolean,
  inheritance_source text,
  depends_on text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_profile_code text;
begin
  if not public.is_sharawla_admin() then
    raise exception 'Admin access required';
  end if;
  if not exists(select 1 from public.activity_categories where id=p_activity_category_id) then
    raise exception 'Activity Category not found';
  end if;

  select apd.pos_profile_id, pp.code
    into v_profile_id, v_profile_code
  from public.activity_profile_defaults apd
  join public.pos_profiles pp on pp.id=apd.pos_profile_id
  where apd.activity_category_id=p_activity_category_id
    and apd.active=true
  order by apd.updated_at desc
  limit 1;

  return query
  select
    f.code,
    f.domain,
    f.name_ar,
    f.name_en,
    f.feature_class,
    f.implemented,
    v_profile_code,
    coalesce(pf.enabled,false),
    (coalesce(pf.required,false) and coalesce(pf.enabled,false)),
    acf.enabled,
    (coalesce(acf.required,false) and coalesce(acf.enabled,false)),
    case
      when f.feature_class='core' then true
      when coalesce(pf.required,false) and coalesce(pf.enabled,false) then true
      else coalesce(acf.enabled,pf.enabled,false)
    end as effective_enabled,
    (
      f.feature_class='core'
      or (coalesce(pf.required,false) and coalesce(pf.enabled,false))
      or (coalesce(acf.required,false) and coalesce(acf.enabled,false))
    ) as effective_required,
    case
      when acf.enabled is not null or acf.required then 'category'
      when f.feature_class='core' then 'core'
      when coalesce(pf.enabled,false) or coalesce(pf.required,false) then 'profile'
      else 'none'
    end as inheritance_source,
    coalesce((
      select array_agg(dep.code order by dep.code)
      from public.feature_dependencies d
      join public.features dep on dep.id=d.depends_on_feature_id
      where d.feature_id=f.id
    ),array[]::text[])
  from public.features f
  left join public.profile_features pf
    on pf.profile_id=v_profile_id and pf.feature_id=f.id
  left join public.activity_category_features acf
    on acf.activity_category_id=p_activity_category_id and acf.feature_id=f.id
  where f.active=true
  order by f.domain,f.code;
end;
$$;

create or replace function public.admin_set_activity_category_features(
  p_activity_category_id uuid,
  p_feature_codes text[] default array[]::text[],
  p_required_feature_codes text[] default array[]::text[]
)
returns table(ok boolean, message text, effective_features text[], required_features text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codes text[] := array(
    select distinct lower(trim(x))
    from unnest(coalesce(p_feature_codes,array[]::text[])) x
    where trim(coalesce(x,''))<>''
    order by 1
  );
  v_required_codes text[] := array(
    select distinct lower(trim(x))
    from unnest(coalesce(p_required_feature_codes,array[]::text[])) x
    where trim(coalesce(x,''))<>''
    order by 1
  );
  v_profile_id uuid;
  v_unknown text[];
  v_required_not_enabled text[];
  v_locked_missing text[];
  v_missing_deps text[];
  v_old text[];
begin
  if not public.is_sharawla_admin() then
    raise exception 'Admin access required';
  end if;

  select apd.pos_profile_id into v_profile_id
  from public.activity_profile_defaults apd
  where apd.activity_category_id=p_activity_category_id
    and apd.active=true
  order by apd.updated_at desc
  limit 1;

  if not found then
    if not exists(select 1 from public.activity_categories where id=p_activity_category_id) then
      raise exception 'Activity Category not found';
    end if;
    raise exception 'Activity Category has no active default POS Profile';
  end if;

  select coalesce(array_agg(c order by c),array[]::text[])
    into v_unknown
  from (
    select unnest(v_codes) c
    union
    select unnest(v_required_codes) c
  ) q
  where not exists(
    select 1 from public.features f
    where f.code=q.c and f.active=true and f.implemented=true and f.feature_class<>'planned'
  );
  if cardinality(v_unknown)>0 then
    raise exception 'Invalid, inactive, planned or not implemented features: %',array_to_string(v_unknown,', ');
  end if;

  select coalesce(array_agg(c order by c),array[]::text[])
    into v_required_not_enabled
  from unnest(v_required_codes) c
  where not (c=any(v_codes));
  if cardinality(v_required_not_enabled)>0 then
    raise exception 'Required category features must also be enabled: %',array_to_string(v_required_not_enabled,', ');
  end if;

  select coalesce(array_agg(f.code order by f.code),array[]::text[])
    into v_locked_missing
  from public.features f
  left join public.profile_features pf
    on pf.profile_id=v_profile_id and pf.feature_id=f.id
  where f.active=true and f.implemented=true
    and (
      f.feature_class='core'
      or (coalesce(pf.enabled,false)=true and coalesce(pf.required,false)=true)
    )
    and not (f.code=any(v_codes));
  if cardinality(v_locked_missing)>0 then
    raise exception 'Core/required profile features cannot be removed: %',array_to_string(v_locked_missing,', ');
  end if;

  select coalesce(array_agg(distinct (f.code||' -> '||dep.code) order by (f.code||' -> '||dep.code)),array[]::text[])
    into v_missing_deps
  from public.features f
  join public.feature_dependencies d on d.feature_id=f.id
  join public.features dep on dep.id=d.depends_on_feature_id
  where f.code=any(v_codes)
    and not (dep.code=any(v_codes));
  if cardinality(v_missing_deps)>0 then
    raise exception 'Missing feature dependencies: %',array_to_string(v_missing_deps,', ');
  end if;

  select coalesce(array_agg(m.feature_code order by m.feature_code),array[]::text[])
    into v_old
  from public.admin_get_activity_category_feature_matrix(p_activity_category_id) m
  where m.effective_enabled=true and m.implemented=true;

  delete from public.activity_category_features
  where activity_category_id=p_activity_category_id;

  insert into public.activity_category_features(
    activity_category_id,feature_id,enabled,required,settings,created_at,updated_at
  )
  select
    p_activity_category_id,
    f.id,
    (f.code=any(v_codes)) as enabled,
    (f.code=any(v_required_codes)) as required,
    '{}'::jsonb,
    now(),
    now()
  from public.features f
  left join public.profile_features pf
    on pf.profile_id=v_profile_id and pf.feature_id=f.id
  where f.active=true and f.implemented=true
    and (
      (f.code=any(v_codes)) is distinct from coalesce(pf.enabled,false)
      or (f.code=any(v_required_codes))
    );

  insert into public.admin_audit_log(
    actor_user_id,action,entity_type,entity_id,business_id,old_values,new_values,details
  ) values (
    auth.uid(),
    'activity_category_features_update',
    'activity_category',
    p_activity_category_id::text,
    null,
    jsonb_build_object('effective_features',to_jsonb(v_old)),
    jsonb_build_object('effective_features',to_jsonb(v_codes),'required_features',to_jsonb(v_required_codes)),
    jsonb_build_object('source','Sharawla Capability Platform','capability_version',2,'resolution','profile->category->business')
  );

  return query select true,'Activity Category features updated'::text,v_codes,v_required_codes;
end;
$$;

create or replace function public.admin_reset_activity_category_features(p_activity_category_id uuid)
returns table(ok boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_sharawla_admin() then
    raise exception 'Admin access required';
  end if;
  if not exists(select 1 from public.activity_categories where id=p_activity_category_id) then
    raise exception 'Activity Category not found';
  end if;

  delete from public.activity_category_features
  where activity_category_id=p_activity_category_id;

  insert into public.admin_audit_log(
    actor_user_id,action,entity_type,entity_id,business_id,old_values,new_values,details
  ) values (
    auth.uid(),
    'activity_category_features_reset',
    'activity_category',
    p_activity_category_id::text,
    null,
    null,
    jsonb_build_object('overrides','cleared'),
    jsonb_build_object('source','Sharawla Capability Platform','capability_version',2)
  );

  return query select true,'Activity Category feature overrides reset to Profile defaults'::text;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6) Business setter now compares against Category-aware baseline.
--    Signature is unchanged for Admin V3.6/V3.7 compatibility.
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_business_features(
  p_business_id uuid,
  p_feature_codes text[] default array[]::text[]
)
returns table(ok boolean, message text, effective_features text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codes text[] := array(
    select distinct lower(trim(x))
    from unnest(coalesce(p_feature_codes,array[]::text[])) x
    where trim(coalesce(x,''))<>''
    order by 1
  );
  v_profile_id uuid;
  v_category_id uuid;
  v_unknown text[];
  v_required_missing text[];
  v_missing_deps text[];
  v_old text[];
begin
  if not public.is_sharawla_admin() then
    raise exception 'Admin access required';
  end if;

  select b.pos_profile_id,b.activity_category_id
    into v_profile_id,v_category_id
  from public.businesses b
  where b.id=p_business_id
  for update;
  if not found then raise exception 'Business not found'; end if;
  if v_profile_id is null then raise exception 'Business POS Profile is required'; end if;

  select coalesce(array_agg(c order by c),array[]::text[])
    into v_unknown
  from unnest(v_codes) c
  where not exists(
    select 1 from public.features f
    where f.code=c and f.active=true and f.implemented=true and f.feature_class<>'planned'
  );
  if cardinality(v_unknown)>0 then
    raise exception 'Invalid, inactive, planned or not implemented features: %',array_to_string(v_unknown,', ');
  end if;

  with baseline as (
    select
      f.code,
      (
        f.feature_class='core'
        or (coalesce(pf.enabled,false) and coalesce(pf.required,false))
        or (coalesce(acf.enabled,false) and coalesce(acf.required,false))
      ) as locked
    from public.features f
    left join public.profile_features pf
      on pf.profile_id=v_profile_id and pf.feature_id=f.id
    left join public.activity_category_features acf
      on acf.activity_category_id=v_category_id and acf.feature_id=f.id
    where f.active=true and f.implemented=true
  )
  select coalesce(array_agg(code order by code),array[]::text[])
    into v_required_missing
  from baseline
  where locked=true and not (code=any(v_codes));
  if cardinality(v_required_missing)>0 then
    raise exception 'Core/category/profile required features cannot be removed: %',array_to_string(v_required_missing,', ');
  end if;

  select coalesce(array_agg(distinct (f.code||' -> '||dep.code) order by (f.code||' -> '||dep.code)),array[]::text[])
    into v_missing_deps
  from public.features f
  join public.feature_dependencies d on d.feature_id=f.id
  join public.features dep on dep.id=d.depends_on_feature_id
  where f.code=any(v_codes)
    and not (dep.code=any(v_codes));
  if cardinality(v_missing_deps)>0 then
    raise exception 'Missing feature dependencies: %',array_to_string(v_missing_deps,', ');
  end if;

  select coalesce(array_agg(m.feature_code order by m.feature_code),array[]::text[])
    into v_old
  from public.admin_get_business_feature_matrix_v2(p_business_id) m
  where m.effective_enabled=true and m.implemented=true;

  delete from public.business_features where business_id=p_business_id;

  with baseline as (
    select
      f.id as feature_id,
      f.code,
      case
        when f.feature_class='core' then true
        when coalesce(pf.required,false) and coalesce(pf.enabled,false) then true
        else coalesce(acf.enabled,pf.enabled,false)
      end as baseline_enabled,
      (
        f.feature_class='core'
        or (coalesce(pf.enabled,false) and coalesce(pf.required,false))
        or (coalesce(acf.enabled,false) and coalesce(acf.required,false))
      ) as locked
    from public.features f
    left join public.profile_features pf
      on pf.profile_id=v_profile_id and pf.feature_id=f.id
    left join public.activity_category_features acf
      on acf.activity_category_id=v_category_id and acf.feature_id=f.id
    where f.active=true and f.implemented=true
  )
  insert into public.business_features(business_id,feature_id,enabled,settings,created_at,updated_at)
  select
    p_business_id,
    b.feature_id,
    (b.code=any(v_codes)) as enabled,
    '{}'::jsonb,
    now(),
    now()
  from baseline b
  where b.locked=false
    and ((b.code=any(v_codes)) is distinct from b.baseline_enabled);

  insert into public.admin_audit_log(
    actor_user_id,action,entity_type,entity_id,business_id,old_values,new_values,details
  ) values (
    auth.uid(),
    'business_features_update',
    'business',
    p_business_id::text,
    p_business_id,
    jsonb_build_object('effective_features',to_jsonb(v_old)),
    jsonb_build_object('effective_features',to_jsonb(v_codes)),
    jsonb_build_object('source','Sharawla Capability Platform','method','SECURITY DEFINER RPC','capability_version',2,'resolution','profile->category->business')
  );

  return query select true,'Business features updated'::text,v_codes;
end;
$$;

create or replace function public.admin_reset_business_features(p_business_id uuid)
returns table(ok boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_sharawla_admin() then raise exception 'Admin access required'; end if;
  if not exists(select 1 from public.businesses where id=p_business_id) then raise exception 'Business not found'; end if;

  delete from public.business_features where business_id=p_business_id;

  insert into public.admin_audit_log(actor_user_id,action,entity_type,entity_id,business_id,old_values,new_values,details)
  values(
    auth.uid(),
    'business_features_reset',
    'business',
    p_business_id::text,
    p_business_id,
    null,
    jsonb_build_object('overrides','cleared'),
    jsonb_build_object('source','Sharawla Capability Platform','capability_version',2,'reset_to','category_or_profile_baseline')
  );

  return query select true,'Business feature overrides reset to Category/Profile defaults'::text;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) Runtime V2: same public contract, Capability Version becomes 2.
--    Existing V2 clients continue to consume enabled_features exactly as before.
-- -----------------------------------------------------------------------------
create or replace function public.get_sharawla_business_runtime_config_v2(
  p_device_id uuid,
  p_device_fingerprint text
)
returns table(
  ok boolean,
  business_id uuid,
  business_name text,
  business_active boolean,
  pos_profile text,
  profile_active boolean,
  profile_implemented boolean,
  modules_configured boolean,
  enabled_modules text[],
  features_configured boolean,
  enabled_features text[],
  capability_version integer,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base record;
  v_features text[] := array[]::text[];
  v_features_configured boolean := false;
  v_profile_id uuid;
  v_category_id uuid;
begin
  select * into v_base
  from public.get_sharawla_business_runtime_config(p_device_id,p_device_fingerprint)
  limit 1;

  if coalesce(v_base.ok,false)=false then
    return query select
      v_base.ok,v_base.business_id,v_base.business_name,v_base.business_active,
      v_base.pos_profile,v_base.profile_active,v_base.profile_implemented,
      v_base.modules_configured,v_base.enabled_modules,
      false,array[]::text[],2,v_base.message;
    return;
  end if;

  select b.pos_profile_id,b.activity_category_id
    into v_profile_id,v_category_id
  from public.businesses b
  where b.id=v_base.business_id;

  select
    exists(select 1 from public.profile_features pf where pf.profile_id=v_profile_id and pf.enabled=true)
    or exists(select 1 from public.activity_category_features acf where acf.activity_category_id=v_category_id)
    or exists(select 1 from public.business_features bf where bf.business_id=v_base.business_id)
  into v_features_configured;

  with resolved as (
    select
      f.code,
      f.feature_class,
      f.active,
      f.implemented,
      coalesce(pf.enabled,false) as p_enabled,
      (coalesce(pf.enabled,false) and coalesce(pf.required,false)) as p_required,
      acf.enabled as c_enabled,
      (coalesce(acf.enabled,false) and coalesce(acf.required,false)) as c_required,
      bf.enabled as b_enabled
    from public.features f
    left join public.profile_features pf
      on pf.profile_id=v_profile_id and pf.feature_id=f.id
    left join public.activity_category_features acf
      on acf.activity_category_id=v_category_id and acf.feature_id=f.id
    left join public.business_features bf
      on bf.business_id=v_base.business_id and bf.feature_id=f.id
  ), effective as (
    select r.code
    from resolved r
    where r.active=true
      and r.implemented=true
      and r.feature_class<>'planned'
      and case
        when r.feature_class='core' or r.p_required or r.c_required then true
        when r.b_enabled is not null then r.b_enabled
        else coalesce(r.c_enabled,r.p_enabled,false)
      end = true
  )
  select coalesce(array_agg(code order by code),array[]::text[])
    into v_features
  from effective;

  return query select
    true,
    v_base.business_id,
    v_base.business_name,
    v_base.business_active,
    v_base.pos_profile,
    v_base.profile_active,
    v_base.profile_implemented,
    v_base.modules_configured,
    v_base.enabled_modules,
    v_features_configured,
    v_features,
    2,
    'OK'::text;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8) RPC hardening. Runtime contract keeps its existing execute semantics.
-- -----------------------------------------------------------------------------
revoke all on function public.admin_get_business_feature_matrix_v2(uuid) from public, anon;
revoke all on function public.admin_get_activity_category_feature_matrix(uuid) from public, anon;
revoke all on function public.admin_set_activity_category_features(uuid,text[],text[]) from public, anon;
revoke all on function public.admin_reset_activity_category_features(uuid) from public, anon;

grant execute on function public.admin_get_business_feature_matrix_v2(uuid) to authenticated, service_role;
grant execute on function public.admin_get_activity_category_feature_matrix(uuid) to authenticated, service_role;
grant execute on function public.admin_set_activity_category_features(uuid,text[],text[]) to authenticated, service_role;
grant execute on function public.admin_reset_activity_category_features(uuid) to authenticated, service_role;

-- Keep existing V1 Admin RPCs hardened after CREATE OR REPLACE.
revoke all on function public.admin_get_business_feature_matrix(uuid) from public, anon;
revoke all on function public.admin_set_business_features(uuid,text[]) from public, anon;
revoke all on function public.admin_reset_business_features(uuid) from public, anon;
grant execute on function public.admin_get_business_feature_matrix(uuid) to authenticated, service_role;
grant execute on function public.admin_set_business_features(uuid,text[]) to authenticated, service_role;
grant execute on function public.admin_reset_business_features(uuid) to authenticated, service_role;

commit;
