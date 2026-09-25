-- Sharawla POS — Permissions V2 Profile/Feature-aware Admin Action Catalog (PV2-D)
-- SOURCE-ONLY artifact. Do not deploy without the coordinated PV2-A/B/C/D Beta window.
-- Depends on:
--   PV2-A public.permission_action_profiles_v2
--   PV2-B sharawla_internal.current_operational_profile_v1()
--   PV2-C sharawla_internal.operational_feature_entitled_v1(text)
-- No Runtime UI is switched by this artifact.
-- Production SH-0005 / SH-0006 remain untouched.

begin;

create or replace function public.admin_list_permission_actions_v2(p_employee_id bigint)
returns table(
  code text,
  name_ar text,
  domain text,
  legacy_permission text,
  sort_order integer,
  profile_code text,
  required_feature_code text,
  inheritance_mode text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,sharawla_internal
as $$
declare
  v_profile text;
  v_role_defaults_available boolean;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_employee_id is null or not exists(
    select 1
    from public.employees e
    where e.id=p_employee_id
      and e.active is distinct from false
  ) then
    raise exception 'EMPLOYEE_NOT_FOUND_OR_INACTIVE';
  end if;

  -- Never accept Profile/Feature input from the client.
  -- The trusted operational Profile is server-owned by PV2-B.
  v_profile:=sharawla_internal.current_operational_profile_v1();
  v_role_defaults_available:=
    pg_catalog.to_regclass('public.permission_role_action_defaults_v2') is not null;

  return query
  select
    a.code,
    a.name_ar,
    a.domain,
    a.legacy_permission,
    a.sort_order,
    v_profile as profile_code,
    pap.required_feature_code,
    case
      when v_role_defaults_available then 'role_default'::text
      else 'legacy_transition'::text
    end as inheritance_mode
  from public.permission_actions_v2 a
  join public.permission_action_profiles_v2 pap
    on pap.action_code=a.code
   and pap.profile_code=v_profile
   and pap.active=true
  where a.active=true
    and (
      pap.required_feature_code is null
      or sharawla_internal.operational_feature_entitled_v1(pap.required_feature_code)
    )
  order by a.domain,a.sort_order,a.code;
end;
$$;

revoke all on function public.admin_list_permission_actions_v2(bigint) from public,anon;
grant execute on function public.admin_list_permission_actions_v2(bigint) to authenticated;

commit;
