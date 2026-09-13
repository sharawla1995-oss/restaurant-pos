-- Sharawla POS — Beta55 Permission Boundary Hardening
-- Final additive permission state for Shared Central Warehouse / Branch Replenishment.
-- Sensitive actions below require an explicit Permission Actions V2 grant; they do
-- not inherit the broad legacy `inventory` permission.

begin;

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,active,sort_order)
values
 ('inventory.supply.request.emergency','إنشاء طلب توريد عاجل','inventory',null,true,1327),
 ('inventory.supply.stock.exact','عرض الكمية الدقيقة لمخزون المصدر','inventory',null,true,1329),
 ('inventory.supply.shortages.view','عرض تقرير نواقص الفروع','inventory',null,true,1330),
 ('inventory.supply.shortages.create','إنشاء توريد من تقرير النواقص','inventory',null,true,1331)
on conflict(code) do update set
 name_ar=excluded.name_ar,
 domain=excluded.domain,
 legacy_permission=excluded.legacy_permission,
 active=excluded.active,
 sort_order=excluded.sort_order;

-- The request RPC already checks this action independently when p_request_type
-- is emergency. Keep this assertion in the migration so future source changes
-- cannot silently restore legacy inheritance without an explicit migration.
do $$
begin
 if exists(
   select 1 from public.permission_actions_v2
   where code in (
     'inventory.supply.request.emergency',
     'inventory.supply.stock.exact',
     'inventory.supply.shortages.view',
     'inventory.supply.shortages.create'
   ) and legacy_permission is not null
 ) then
   raise exception 'Beta55 sensitive warehouse actions must not inherit a legacy permission';
 end if;
end$$;

commit;
