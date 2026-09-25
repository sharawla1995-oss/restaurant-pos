-- Sharawla POS — Permissions V2 Role Defaults + Safe Legacy Preservation (PV2-E)
-- SOURCE-ONLY artifact. Do not deploy outside the coordinated isolated-Beta window.
-- Current seed scope: trusted Restaurant profile only, matching accepted 58.29 Runtime role templates.
-- Existing explicit Action overrides are never overwritten.
-- Existing non-admin effective legacy Action decisions are preserved when they differ from the new Role default.
-- Production SH-0005 / SH-0006 remain untouched.

begin;

-- This source is intentionally Restaurant-scoped for the current closure.
-- A wrong operational Profile must fail before any Role-default data is created.
select sharawla_internal.assert_operational_profile_v1('restaurant');

create table if not exists public.permission_role_action_defaults_v2(
  profile_code text not null,
  role_code text not null,
  action_code text not null references public.permission_actions_v2(code) on delete cascade,
  allowed boolean not null,
  active boolean not null default true,
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(profile_code,role_code,action_code),
  constraint permission_role_action_defaults_v2_profile_not_blank check(trim(profile_code)<>''),
  constraint permission_role_action_defaults_v2_role_not_blank check(trim(role_code)<>''),
  constraint permission_role_action_defaults_v2_source_not_blank check(trim(source)<>''),
  constraint permission_role_action_defaults_v2_profile_canonical check(profile_code=lower(trim(profile_code))),
  constraint permission_role_action_defaults_v2_role_canonical check(role_code=lower(trim(role_code)))
);

comment on table public.permission_role_action_defaults_v2 is
'Permissions V2 Profile x Role x Action defaults. User Action overrides remain separate and take precedence only after trusted Profile/Feature gates.';

alter table public.permission_role_action_defaults_v2 enable row level security;
revoke all on table public.permission_role_action_defaults_v2 from public,anon,authenticated;

-- Private deployment evidence: snapshot what the pre-Role-default backend would
-- decide for every existing non-admin employee/action before preservation rows are added.
create table if not exists sharawla_internal.permission_role_migration_evidence_v1(
  migration_batch text not null,
  employee_id bigint not null,
  profile_code text not null,
  role_code text not null,
  action_code text not null,
  legacy_allowed boolean not null,
  role_default_allowed boolean not null,
  explicit_override_before boolean,
  preservation_override_inserted boolean not null default false,
  captured_at timestamptz not null default now(),
  primary key(migration_batch,employee_id,action_code)
);

alter table sharawla_internal.permission_role_migration_evidence_v1 enable row level security;
revoke all on table sharawla_internal.permission_role_migration_evidence_v1 from public,anon,authenticated;

-- Restaurant Runtime role templates accepted on 58.29:
-- cashier   => home,pos,orders,returns,customers,deliveryOrders,delivery,tables,shifts
-- callcenter=> home,pos,orders,returns,customers,deliveryOrders,delivery
-- delivery  => home,pos,orders,returns,customers,deliveryOrders,delivery
-- admin     => all applicable Restaurant actions (upper Profile/Feature gates still apply)
with roles(role_code) as (
  values ('admin'),('cashier'),('callcenter'),('delivery')
),
role_legacy_keys(role_code,permission_key) as (
  values
    ('cashier','pos'),
    ('cashier','orders'),
    ('cashier','returns'),
    ('cashier','customers'),
    ('cashier','deliveryOrders'),
    ('cashier','delivery'),
    ('cashier','tables'),
    ('cashier','shifts'),
    ('callcenter','pos'),
    ('callcenter','orders'),
    ('callcenter','returns'),
    ('callcenter','customers'),
    ('callcenter','deliveryOrders'),
    ('callcenter','delivery'),
    ('delivery','pos'),
    ('delivery','orders'),
    ('delivery','returns'),
    ('delivery','customers'),
    ('delivery','deliveryOrders'),
    ('delivery','delivery')
)
insert into public.permission_role_action_defaults_v2(
  profile_code,role_code,action_code,allowed,active,source,created_at,updated_at
)
select
  'restaurant',
  r.role_code,
  a.code,
  case
    when r.role_code='admin' then true
    when a.legacy_permission is not null and exists(
      select 1
      from role_legacy_keys k
      where k.role_code=r.role_code
        and k.permission_key=a.legacy_permission
    ) then true
    else false
  end,
  true,
  'restaurant-runtime-role-pages-58.29',
  now(),
  now()
from roles r
join public.permission_actions_v2 a on a.active=true
join public.permission_action_profiles_v2 pap
  on pap.action_code=a.code
 and pap.profile_code='restaurant'
 and pap.active=true
on conflict(profile_code,role_code,action_code) do nothing;

-- Capture the exact legacy backend inheritance result for current non-admin employees.
-- IMPORTANT: this mirrors public.has_permission() behavior, not renderer ROLE_PAGES.
-- That distinction prevents silent authority expansion for existing users who have no
-- persisted employee_permissions rows.
insert into sharawla_internal.permission_role_migration_evidence_v1(
  migration_batch,
  employee_id,
  profile_code,
  role_code,
  action_code,
  legacy_allowed,
  role_default_allowed,
  explicit_override_before,
  preservation_override_inserted,
  captured_at
)
select
  'PV2-E-RESTAURANT-58.29',
  e.id,
  'restaurant',
  lower(trim(coalesce(e.role,''))),
  a.code,
  case
    when a.legacy_permission is null or trim(a.legacy_permission)='' then false
    else exists(
      select 1
      from public.employee_permissions ep
      where ep.employee_id=e.id
        and ep.permission_key=a.legacy_permission
        and ep.allowed=true
    )
  end as legacy_allowed,
  coalesce(d.allowed,false) as role_default_allowed,
  (
    select eap.allowed
    from public.employee_action_permissions_v2 eap
    where eap.employee_id=e.id
      and eap.action_code=a.code
    limit 1
  ) as explicit_override_before,
  false,
  now()
from public.employees e
join public.permission_actions_v2 a on a.active=true
join public.permission_action_profiles_v2 pap
  on pap.action_code=a.code
 and pap.profile_code='restaurant'
 and pap.active=true
left join public.permission_role_action_defaults_v2 d
  on d.profile_code='restaurant'
 and d.role_code=lower(trim(coalesce(e.role,'')))
 and d.action_code=a.code
 and d.active=true
where e.active is distinct from false
  and lower(trim(coalesce(e.role,'')))<>'admin'
on conflict(migration_batch,employee_id,action_code) do nothing;

-- Preserve only the deltas:
-- if old effective legacy decision already equals Role default, keep Inherit.
-- if it differs, add an explicit employee Action override equal to the old decision.
-- Pre-existing Action overrides are left untouched.
insert into public.employee_action_permissions_v2(employee_id,action_code,allowed,updated_at)
select
  ev.employee_id,
  ev.action_code,
  ev.legacy_allowed,
  now()
from sharawla_internal.permission_role_migration_evidence_v1 ev
where ev.migration_batch='PV2-E-RESTAURANT-58.29'
  and ev.explicit_override_before is null
  and ev.legacy_allowed is distinct from ev.role_default_allowed
on conflict(employee_id,action_code) do nothing;

update sharawla_internal.permission_role_migration_evidence_v1 ev
set preservation_override_inserted=true
where ev.migration_batch='PV2-E-RESTAURANT-58.29'
  and ev.explicit_override_before is null
  and ev.legacy_allowed is distinct from ev.role_default_allowed
  and exists(
    select 1
    from public.employee_action_permissions_v2 eap
    where eap.employee_id=ev.employee_id
      and eap.action_code=ev.action_code
      and eap.allowed=ev.legacy_allowed
  );

-- Admin-only readout for deployment/acceptance evidence.
create or replace function public.admin_permission_role_migration_summary_v1()
returns table(
  migration_batch text,
  employees bigint,
  action_rows bigint,
  preexisting_overrides bigint,
  preservation_overrides bigint,
  effective_mismatches bigint
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,sharawla_internal
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return query
  select
    'PV2-E-RESTAURANT-58.29'::text,
    count(distinct ev.employee_id)::bigint,
    count(*)::bigint,
    count(*) filter(where ev.explicit_override_before is not null)::bigint,
    count(*) filter(where ev.preservation_override_inserted)::bigint,
    count(*) filter(
      where coalesce(ev.explicit_override_before,ev.legacy_allowed)
            is distinct from
            coalesce(
              (
                select eap.allowed
                from public.employee_action_permissions_v2 eap
                where eap.employee_id=ev.employee_id
                  and eap.action_code=ev.action_code
                limit 1
              ),
              ev.role_default_allowed
            )
    )::bigint
  from sharawla_internal.permission_role_migration_evidence_v1 ev
  where ev.migration_batch='PV2-E-RESTAURANT-58.29';
end;
$$;

revoke all on function public.admin_permission_role_migration_summary_v1() from public,anon;
grant execute on function public.admin_permission_role_migration_summary_v1() to authenticated;

commit;
