-- Sharawla POS — Permissions V2 SH-0007 trusted Cloud projection
-- SOURCE-ONLY deployment input. Isolated Beta only.
-- Authoritative Cloud Business: تجريبي / 91826502-590e-4afa-8826-2c0f4b99c490
-- Authoritative POS Profile: restaurant / 9e53ccf1-3960-4bbd-93bd-028db023f538
-- Snapshot verified read-only from Sharawla Cloud on 2026-09-25.
-- Production SH-0005 / SH-0006 MUST NEVER receive this artifact.

begin;

-- PV2-B and PV2-C must already have created these private tables.
do $$
begin
  if to_regclass('sharawla_internal.operational_business_identity_v1') is null then
    raise exception 'PV2_B_BINDING_TABLE_REQUIRED';
  end if;
  if to_regclass('sharawla_internal.operational_feature_entitlements_v1') is null then
    raise exception 'PV2_C_ENTITLEMENT_TABLE_REQUIRED';
  end if;
end $$;

insert into sharawla_internal.operational_business_identity_v1
(id,cloud_business_id,profile_code,binding_version,source,bound_at,updated_at)
values
(1,'91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'restaurant',1,'sharawla-cloud-pos-profile-2026-09-25',now(),now())
on conflict(id) do update set
 cloud_business_id=excluded.cloud_business_id,
 profile_code=excluded.profile_code,
 binding_version=excluded.binding_version,
 source=excluded.source,
 updated_at=now();

-- Restrictive snapshot: only Features required by the current F1-F5 Restaurant owners.
insert into sharawla_internal.operational_feature_entitlements_v1
(cloud_business_id,feature_code,enabled,entitlement_version,source,valid_until,updated_at)
values
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.customers',true,1,'restaurant-profile-9e53ccf1-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.expenses',true,1,'restaurant-profile-9e53ccf1-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'commerce.delivery',true,1,'restaurant-profile-9e53ccf1-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'commerce.orders',true,1,'restaurant-profile-9e53ccf1-2026-09-25',null,now())
on conflict(cloud_business_id,feature_code) do update set
 enabled=excluded.enabled,
 entitlement_version=excluded.entitlement_version,
 source=excluded.source,
 valid_until=excluded.valid_until,
 updated_at=now();

-- Fail closed if the local projection is not exactly the intended Beta identity.
do $$
declare v_business uuid; v_profile text; v_count integer;
begin
 select cloud_business_id,profile_code into v_business,v_profile
 from sharawla_internal.operational_business_identity_v1 where id=1;
 if v_business<>'91826502-590e-4afa-8826-2c0f4b99c490'::uuid or v_profile<>'restaurant' then
   raise exception 'SH0007_PV2_BINDING_ASSERTION_FAILED';
 end if;
 select count(*) into v_count from sharawla_internal.operational_feature_entitlements_v1
 where cloud_business_id=v_business and enabled=true
   and feature_code in ('core.customers','core.expenses','commerce.delivery','commerce.orders');
 if v_count<>4 then raise exception 'SH0007_PV2_ENTITLEMENT_ASSERTION_FAILED count=%',v_count; end if;
end $$;

commit;
