-- Sharawla Capability Platform V2.1
-- Matrix hardening: planned/unimplemented capabilities are visible for architecture
-- but are never Effective and cannot leak into Admin save payloads.

begin;

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
  if not public.is_sharawla_admin() then raise exception 'Admin access required'; end if;
  if not exists(select 1 from public.businesses where id=p_business_id) then raise exception 'Business not found'; end if;

  return query
  with biz as (
    select b.id,b.pos_profile_id,b.activity_category_id
    from public.businesses b where b.id=p_business_id
  ), resolved as (
    select
      f.id as feature_id,f.code,f.domain,f.name_ar,f.implemented,f.feature_class,
      coalesce(pf.enabled,false) as profile_enabled,
      coalesce(pf.required,false) and coalesce(pf.enabled,false) as profile_required,
      acf.enabled as category_override_enabled,
      coalesce(acf.required,false) and coalesce(acf.enabled,false) as category_required,
      bf.enabled as business_override_enabled
    from biz b
    cross join public.features f
    left join public.profile_features pf on pf.profile_id=b.pos_profile_id and pf.feature_id=f.id
    left join public.activity_category_features acf on acf.activity_category_id=b.activity_category_id and acf.feature_id=f.id
    left join public.business_features bf on bf.business_id=b.id and bf.feature_id=f.id
    where f.active=true
  )
  select
    r.code,r.domain,r.name_ar,r.implemented,
    case
      when r.implemented=false or r.feature_class='planned' then false
      when r.feature_class='core' or r.profile_required then true
      else coalesce(r.category_override_enabled,r.profile_enabled,false)
    end as default_enabled,
    case
      when r.implemented=false or r.feature_class='planned' then false
      else (r.feature_class='core' or r.profile_required or r.category_required)
    end as required,
    r.business_override_enabled,
    case
      when r.implemented=false or r.feature_class='planned' then false
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
  if not public.is_sharawla_admin() then raise exception 'Admin access required'; end if;
  if not exists(select 1 from public.businesses where id=p_business_id) then raise exception 'Business not found'; end if;

  return query
  with biz as (
    select b.id,b.pos_profile_id,b.activity_category_id
    from public.businesses b where b.id=p_business_id
  ), resolved as (
    select
      f.id as feature_id,f.code,f.domain,f.name_ar,f.name_en,f.feature_class,f.implemented,
      coalesce(pf.enabled,false) as p_enabled,
      coalesce(pf.required,false) and coalesce(pf.enabled,false) as p_required,
      acf.enabled as c_enabled,
      coalesce(acf.required,false) and coalesce(acf.enabled,false) as c_required,
      bf.enabled as b_enabled
    from biz b
    cross join public.features f
    left join public.profile_features pf on pf.profile_id=b.pos_profile_id and pf.feature_id=f.id
    left join public.activity_category_features acf on acf.activity_category_id=b.activity_category_id and acf.feature_id=f.id
    left join public.business_features bf on bf.business_id=b.id and bf.feature_id=f.id
    where f.active=true
  )
  select
    r.code,r.domain,r.name_ar,r.name_en,r.feature_class,r.implemented,
    r.p_enabled,r.p_required,r.c_enabled,r.c_required,
    case
      when r.implemented=false or r.feature_class='planned' then false
      when r.feature_class='core' or r.p_required then true
      else coalesce(r.c_enabled,r.p_enabled,false)
    end as baseline_enabled,
    case
      when r.implemented=false or r.feature_class='planned' then false
      else (r.feature_class='core' or r.p_required or r.c_required)
    end as required,
    r.b_enabled,
    case
      when r.implemented=false or r.feature_class='planned' then false
      when r.feature_class='core' or r.p_required or r.c_required then true
      when r.b_enabled is not null then r.b_enabled
      else coalesce(r.c_enabled,r.p_enabled,false)
    end as effective_enabled,
    case
      when r.implemented=false or r.feature_class='planned' then 'planned'
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
  if not public.is_sharawla_admin() then raise exception 'Admin access required'; end if;
  if not exists(select 1 from public.activity_categories where id=p_activity_category_id) then raise exception 'Activity Category not found'; end if;

  select apd.pos_profile_id,pp.code into v_profile_id,v_profile_code
  from public.activity_profile_defaults apd
  join public.pos_profiles pp on pp.id=apd.pos_profile_id
  where apd.activity_category_id=p_activity_category_id and apd.active=true
  order by apd.updated_at desc
  limit 1;

  return query
  select
    f.code,f.domain,f.name_ar,f.name_en,f.feature_class,f.implemented,v_profile_code,
    coalesce(pf.enabled,false),
    (coalesce(pf.required,false) and coalesce(pf.enabled,false)),
    acf.enabled,
    (coalesce(acf.required,false) and coalesce(acf.enabled,false)),
    case
      when f.implemented=false or f.feature_class='planned' then false
      when f.feature_class='core' then true
      when coalesce(pf.required,false) and coalesce(pf.enabled,false) then true
      else coalesce(acf.enabled,pf.enabled,false)
    end as effective_enabled,
    case
      when f.implemented=false or f.feature_class='planned' then false
      else (
        f.feature_class='core'
        or (coalesce(pf.required,false) and coalesce(pf.enabled,false))
        or (coalesce(acf.required,false) and coalesce(acf.enabled,false))
      )
    end as effective_required,
    case
      when f.implemented=false or f.feature_class='planned' then 'planned'
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
  left join public.profile_features pf on pf.profile_id=v_profile_id and pf.feature_id=f.id
  left join public.activity_category_features acf on acf.activity_category_id=p_activity_category_id and acf.feature_id=f.id
  where f.active=true
  order by f.domain,f.code;
end;
$$;

-- CREATE OR REPLACE resets function ACLs on some PostgreSQL paths; reassert hardening.
revoke all on function public.admin_get_business_feature_matrix(uuid) from public, anon;
revoke all on function public.admin_get_business_feature_matrix_v2(uuid) from public, anon;
revoke all on function public.admin_get_activity_category_feature_matrix(uuid) from public, anon;
grant execute on function public.admin_get_business_feature_matrix(uuid) to authenticated, service_role;
grant execute on function public.admin_get_business_feature_matrix_v2(uuid) to authenticated, service_role;
grant execute on function public.admin_get_activity_category_feature_matrix(uuid) to authenticated, service_role;

commit;
