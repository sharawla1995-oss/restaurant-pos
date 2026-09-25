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

-- Effective runtime snapshot: Restaurant profile defaults plus explicit Business feature enables,
-- verified read-only from Sharawla Cloud for Business تجريبي on 2026-09-25.
insert into sharawla_internal.operational_feature_entitlements_v1
(cloud_business_id,feature_code,enabled,entitlement_version,source,valid_until,updated_at)
values
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'commerce.barcode',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'commerce.delivery',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'commerce.orders',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'commerce.pickup',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'commerce.pos',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'commerce.products',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'commerce.promotions',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'commerce.returns',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'commerce.website',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.audit',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.auth',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.branches',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.customers',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.expenses',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.licensing',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.notifications',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.offline',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.payments',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.permissions',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.reports',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.shifts',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.updates',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'core.users',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'food.kitchen',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'food.modifiers',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'food.tables',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'inventory.purchasing',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'inventory.receiving',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'inventory.stock',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'inventory.suppliers',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'food.costing',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'food.ingredients',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'food.prep',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'food.production',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'food.recipes',true,2,'restaurant-runtime-effective-2026-09-25',null,now()),
 ('91826502-590e-4afa-8826-2c0f4b99c490'::uuid,'food.waste',true,2,'restaurant-runtime-effective-2026-09-25',null,now())
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
   and feature_code=any(array['commerce.barcode','commerce.delivery','commerce.orders','commerce.pickup','commerce.pos','commerce.products','commerce.promotions','commerce.returns','commerce.website','core.audit','core.auth','core.branches','core.customers','core.expenses','core.licensing','core.notifications','core.offline','core.payments','core.permissions','core.reports','core.shifts','core.updates','core.users','food.kitchen','food.modifiers','food.tables','inventory.purchasing','inventory.receiving','inventory.stock','inventory.suppliers','food.costing','food.ingredients','food.prep','food.production','food.recipes','food.waste']);
 if v_count<>36 then raise exception 'SH0007_PV2_ENTITLEMENT_ASSERTION_FAILED count=%',v_count; end if;
end $$;

commit;
