-- Sharawla POS — Permissions V2 Effective Permission Evaluator (PV2-C)
-- SOURCE-ONLY artifact. Do not deploy without an explicit Beta deployment window.
-- Requires PV2-A Profile/Feature applicability + PV2-B trusted Business/Profile binding.
-- No Cloud/Business/Feature binding rows are inserted by this artifact.
-- Production SH-0005 / SH-0006 remain untouched.

begin;

-- Server-owned local projection of Sharawla Cloud Business Feature entitlement.
-- This is NOT a second entitlement authority. Sharawla Cloud remains source of truth.
-- Provisioning/refresh is deliberately outside PV2-C.
create table if not exists sharawla_internal.operational_feature_entitlements_v1(
  cloud_business_id uuid not null,
  feature_code text not null,
  enabled boolean not null,
  entitlement_version bigint not null,
  source text not null,
  valid_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key(cloud_business_id,feature_code),
  constraint operational_feature_entitlements_v1_feature_not_blank check(trim(feature_code)<>''),
  constraint operational_feature_entitlements_v1_feature_canonical check(feature_code=lower(trim(feature_code))),
  constraint operational_feature_entitlements_v1_source_not_blank check(trim(source)<>''),
  constraint operational_feature_entitlements_v1_version_positive check(entitlement_version>0)
);

comment on table sharawla_internal.operational_feature_entitlements_v1 is
'Private server-owned projection of Sharawla Cloud Business Feature entitlement used by Permissions V2. Missing/disabled/expired rows fail closed. Clients cannot write this table.';

alter table sharawla_internal.operational_feature_entitlements_v1 enable row level security;
revoke all on table sharawla_internal.operational_feature_entitlements_v1 from public,anon,authenticated;

create or replace function sharawla_internal.operational_feature_entitled_v1(p_feature_code text)
returns boolean
language plpgsql
stable
security definer
set search_path=pg_catalog,sharawla_internal
as $$
declare
  v_feature text:=lower(trim(coalesce(p_feature_code,'')));
  v_business uuid;
begin
  if v_feature='' then
    return false;
  end if;

  v_business:=sharawla_internal.current_operational_business_id_v1();

  return exists(
    select 1
    from sharawla_internal.operational_feature_entitlements_v1 e
    where e.cloud_business_id=v_business
      and e.feature_code=v_feature
      and e.enabled=true
      and (e.valid_until is null or e.valid_until>pg_catalog.statement_timestamp())
  );
end;
$$;

-- PV2-E owns creation/seeding of public.permission_role_action_defaults_v2.
-- PV2-C can consume it when present without taking ownership of that batch.
-- Once the table exists, a missing Role default is an explicit DENY; legacy
-- fallback is only available while the Role-default subsystem is absent.
create or replace function sharawla_internal.role_action_default_state_v2(
  p_profile_code text,
  p_role_code text,
  p_action_code text
)
returns table(
  table_available boolean,
  default_found boolean,
  default_allowed boolean
)
language plpgsql
stable
security definer
set search_path=pg_catalog,sharawla_internal
as $$
declare
  v_allowed boolean;
  v_count bigint:=0;
begin
  if pg_catalog.to_regclass('public.permission_role_action_defaults_v2') is null then
    return query select false,false,null::boolean;
    return;
  end if;

  execute
    'select d.allowed
       from public.permission_role_action_defaults_v2 d
      where d.profile_code=$1
        and d.role_code=$2
        and d.action_code=$3
        and d.active=true
      limit 1'
    into v_allowed
    using lower(trim(coalesce(p_profile_code,''))),
          lower(trim(coalesce(p_role_code,''))),
          lower(trim(coalesce(p_action_code,'')));

  get diagnostics v_count=row_count;

  if v_count>0 then
    return query select true,true,v_allowed;
  else
    return query select true,false,null::boolean;
  end if;
end;
$$;

create or replace function sharawla_internal.evaluate_action_permission_v2(p_action_code text)
returns table(
  allowed boolean,
  reason_code text,
  profile_code text,
  required_feature_code text,
  role_code text,
  decision_source text
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,sharawla_internal
as $$
declare
  v_action text:=lower(trim(coalesce(p_action_code,'')));
  v_employee_id bigint;
  v_profile_code text;
  v_required_feature_code text;
  v_role_code text;
  v_legacy_permission text;
  v_role_table_available boolean:=false;
  v_role_default_found boolean:=false;
  v_role_default_allowed boolean;
  v_user_override_found boolean:=false;
  v_user_override_allowed boolean;
begin
  allowed:=false;
  reason_code:='DENY';
  profile_code:=null;
  required_feature_code:=null;
  role_code:=null;
  decision_source:='fail_closed';

  if auth.uid() is null then
    reason_code:='UNAUTHENTICATED';
    return next;
    return;
  end if;

  if v_action='' then
    reason_code:='ACTION_REQUIRED';
    return next;
    return;
  end if;

  -- Trusted Profile is server-owned (PV2-B). Missing binding raises and fails closed.
  v_profile_code:=sharawla_internal.current_operational_profile_v1();
  profile_code:=v_profile_code;

  -- Unknown, inactive, or inapplicable Actions are denied before any employee grant.
  select a.legacy_permission,pap.required_feature_code
    into v_legacy_permission,v_required_feature_code
  from public.permission_actions_v2 a
  join public.permission_action_profiles_v2 pap
    on pap.action_code=a.code
   and pap.profile_code=v_profile_code
   and pap.active=true
  where a.code=v_action
    and a.active=true
  limit 1;

  if not found then
    reason_code:='ACTION_UNKNOWN_OR_INAPPLICABLE';
    decision_source:='profile_applicability';
    return next;
    return;
  end if;

  -- Required Feature is a restrictive Cloud entitlement gate.
  required_feature_code:=v_required_feature_code;
  if v_required_feature_code is not null
     and not sharawla_internal.operational_feature_entitled_v1(v_required_feature_code) then
    reason_code:='FEATURE_NOT_ENTITLED';
    decision_source:='cloud_feature';
    return next;
    return;
  end if;

  v_role_code:=lower(trim(coalesce(public.current_employee_role(),'')));
  role_code:=v_role_code;
  v_employee_id:=public.current_employee_id();

  if v_employee_id is null then
    reason_code:='EMPLOYEE_CONTEXT_MISSING';
    decision_source:='employee_context';
    return next;
    return;
  end if;

  -- Admin keeps broad operational authority, but never bypasses Profile/Feature gates.
  if public.is_admin() then
    allowed:=true;
    reason_code:='ALLOW_ADMIN';
    decision_source:='admin';
    return next;
    return;
  end if;

  -- Compute the Role baseline first. PV2-E supplies this table later.
  select s.table_available,s.default_found,s.default_allowed
    into v_role_table_available,v_role_default_found,v_role_default_allowed
  from sharawla_internal.role_action_default_state_v2(v_profile_code,v_role_code,v_action) s;

  -- Explicit employee override has final precedence inside the already-entitled
  -- Profile/Feature boundary.
  select eap.allowed
    into v_user_override_allowed
  from public.employee_action_permissions_v2 eap
  where eap.employee_id=v_employee_id
    and eap.action_code=v_action;

  v_user_override_found:=found;

  if v_user_override_found then
    allowed:=v_user_override_allowed;
    reason_code:=case when allowed then 'ALLOW_USER_OVERRIDE' else 'DENY_USER_OVERRIDE' end;
    decision_source:='user_override';
    return next;
    return;
  end if;

  if v_role_table_available then
    if v_role_default_found then
      allowed:=v_role_default_allowed;
      reason_code:=case when allowed then 'ALLOW_ROLE_DEFAULT' else 'DENY_ROLE_DEFAULT' end;
      decision_source:='role_default';
    else
      allowed:=false;
      reason_code:='ROLE_DEFAULT_MISSING';
      decision_source:='role_default';
    end if;
    return next;
    return;
  end if;

  -- Transitional compatibility only. This path disappears semantically once
  -- PV2-E creates the Role-default table. No legacy key means DENY.
  if v_legacy_permission is null or trim(v_legacy_permission)='' then
    allowed:=false;
    reason_code:='LEGACY_FALLBACK_UNAVAILABLE';
    decision_source:='legacy_transition';
    return next;
    return;
  end if;

  allowed:=public.has_permission(v_legacy_permission);
  reason_code:=case when allowed then 'ALLOW_LEGACY_TRANSITION' else 'DENY_LEGACY_TRANSITION' end;
  decision_source:='legacy_transition';
  return next;
end;
$$;

-- Preserve the public contract used by existing guarded mutation owners.
create or replace function public.has_action_permission_v2(p_action_code text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,sharawla_internal
as $$
  select coalesce((
    select d.allowed
    from sharawla_internal.evaluate_action_permission_v2(p_action_code) d
    limit 1
  ),false);
$$;

revoke all on function sharawla_internal.operational_feature_entitled_v1(text) from public,anon,authenticated;
revoke all on function sharawla_internal.role_action_default_state_v2(text,text,text) from public,anon,authenticated;
revoke all on function sharawla_internal.evaluate_action_permission_v2(text) from public,anon,authenticated;

revoke all on function public.has_action_permission_v2(text) from public,anon;
grant execute on function public.has_action_permission_v2(text) to authenticated;

commit;
