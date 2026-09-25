-- Capability Catalog V3.6 — graduate implemented engines/profiles for Beta36
-- No Business overrides are created. Existing Restaurant/Retail/Pharmacy mappings are untouched.
begin;

update public.features
set implemented=true,
    feature_class=case when feature_class='planned' then 'add_on' else feature_class end,
    updated_at=now()
where active=true and code in (
  'finance.commissions',
  'service.appointments','service.assets','service.jobs','service.packages','service.warranty','service.installation',
  'membership.members','membership.plans','membership.subscriptions','membership.renewals','membership.freeze','membership.checkin','membership.classes','membership.trainers','membership.bookings',
  'logistics.shipments','logistics.waybills','logistics.pickup_requests','logistics.tracking','logistics.zones_pricing','logistics.drivers','logistics.cod','logistics.client_settlements','logistics.returns'
);

update public.pos_profiles
set implemented=true,updated_at=now()
where code in ('service','warehouse','membership','logistics') and active=true;

do $$
declare v_bad integer; v_profiles integer;begin
  select count(*) into v_bad
  from public.feature_dependencies fd
  join public.features f on f.id=fd.feature_id
  join public.features d on d.id=fd.depends_on_feature_id
  where f.code in (
    'service.appointments','service.assets','service.jobs','service.packages','service.warranty','service.installation',
    'membership.members','membership.plans','membership.subscriptions','membership.renewals','membership.freeze','membership.checkin','membership.classes','membership.trainers','membership.bookings',
    'logistics.shipments','logistics.waybills','logistics.pickup_requests','logistics.tracking','logistics.zones_pricing','logistics.drivers','logistics.cod','logistics.client_settlements','logistics.returns'
  ) and d.implemented is distinct from true;
  if v_bad<>0 then raise exception 'Profile graduation blocked by unimplemented dependencies: %',v_bad;end if;

  select count(*) into v_profiles from public.pos_profiles where code in ('service','warehouse','membership','logistics') and active=true and implemented=true;
  if v_profiles<>4 then raise exception 'Expected 4 graduated profiles, got %',v_profiles;end if;
end $$;

commit;
