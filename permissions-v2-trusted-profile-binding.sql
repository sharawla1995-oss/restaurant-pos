-- Sharawla POS — Permissions V2 Trusted Operational Profile Binding (PV2-B)
-- SOURCE-ONLY artifact. Do not deploy without an explicit Beta deployment window.
-- No Business/Profile binding row is inserted by this artifact.
-- Production SH-0005 / SH-0006 remain untouched.

begin;

create schema if not exists sharawla_internal;

revoke all on schema sharawla_internal from public,anon,authenticated;

create table if not exists sharawla_internal.operational_business_identity_v1(
  id smallint primary key,
  cloud_business_id uuid not null,
  profile_code text not null,
  binding_version integer not null,
  source text not null,
  bound_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_business_identity_v1_singleton check(id=1),
  constraint operational_business_identity_v1_profile_not_blank check(trim(profile_code)<>''),
  constraint operational_business_identity_v1_source_not_blank check(trim(source)<>''),
  constraint operational_business_identity_v1_binding_version_positive check(binding_version>0)
);

comment on table sharawla_internal.operational_business_identity_v1 is
'Private server-owned singleton binding between the operational backend and its authoritative Sharawla Cloud Business/POS Profile. Not client writable and not part of the public Data API.';

alter table sharawla_internal.operational_business_identity_v1 enable row level security;

revoke all on table sharawla_internal.operational_business_identity_v1 from public,anon,authenticated;

create or replace function sharawla_internal.current_operational_profile_v1()
returns text
language plpgsql
stable
security definer
set search_path=pg_catalog,sharawla_internal
as $$
declare
  v_count integer;
  v_profile text;
begin
  select count(*),max(trim(profile_code))
    into v_count,v_profile
  from sharawla_internal.operational_business_identity_v1;

  if v_count<>1 or v_profile is null or v_profile='' then
    raise exception 'OPERATIONAL_PROFILE_BINDING_MISSING';
  end if;

  return lower(v_profile);
end;
$$;

create or replace function sharawla_internal.current_operational_business_id_v1()
returns uuid
language plpgsql
stable
security definer
set search_path=pg_catalog,sharawla_internal
as $$
declare
  v_count integer;
  v_business uuid;
begin
  select count(*),(array_agg(cloud_business_id order by id))[1]
    into v_count,v_business
  from sharawla_internal.operational_business_identity_v1;

  if v_count<>1 or v_business is null then
    raise exception 'OPERATIONAL_BUSINESS_BINDING_MISSING';
  end if;

  return v_business;
end;
$$;

create or replace function sharawla_internal.assert_operational_profile_v1(p_expected_profile text)
returns void
language plpgsql
stable
security definer
set search_path=pg_catalog,sharawla_internal
as $$
declare
  v_expected text:=lower(trim(coalesce(p_expected_profile,'')));
  v_actual text;
begin
  if v_expected='' then
    raise exception 'EXPECTED_PROFILE_REQUIRED';
  end if;

  v_actual:=sharawla_internal.current_operational_profile_v1();

  if v_actual<>v_expected then
    raise exception 'PROFILE_MISMATCH expected=% actual=%',v_expected,v_actual;
  end if;
end;
$$;

create or replace function sharawla_internal.assert_operational_profile_allowed_v1(p_allowed_profiles text[])
returns void
language plpgsql
stable
security definer
set search_path=pg_catalog,sharawla_internal
as $$
declare
  v_actual text;
  v_allowed text[];
begin
  if p_allowed_profiles is null or coalesce(array_length(p_allowed_profiles,1),0)=0 then
    raise exception 'ALLOWED_PROFILE_SET_REQUIRED';
  end if;

  select array_agg(distinct lower(trim(x)))
    into v_allowed
  from unnest(p_allowed_profiles) as t(x)
  where nullif(trim(x),'') is not null;

  if v_allowed is null or coalesce(array_length(v_allowed,1),0)=0 then
    raise exception 'ALLOWED_PROFILE_SET_REQUIRED';
  end if;

  v_actual:=sharawla_internal.current_operational_profile_v1();

  if not (v_actual=any(v_allowed)) then
    raise exception 'PROFILE_MISMATCH actual=% allowed=%',v_actual,array_to_string(v_allowed,',');
  end if;
end;
$$;

revoke all on function sharawla_internal.current_operational_profile_v1() from public,anon,authenticated;
revoke all on function sharawla_internal.current_operational_business_id_v1() from public,anon,authenticated;
revoke all on function sharawla_internal.assert_operational_profile_v1(text) from public,anon,authenticated;
revoke all on function sharawla_internal.assert_operational_profile_allowed_v1(text[]) from public,anon,authenticated;

commit;
