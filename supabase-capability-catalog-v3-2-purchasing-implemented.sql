-- Sharawla Capability Catalog V3.2
-- Graduates only the purchasing capabilities with completed V1 runtime.
-- Landed Cost stays planned until valuation/COGS posting is fully accepted.

begin;

update public.features
set implemented=true,feature_class='add_on',updated_at=now()
where code in (
  'inventory.purchase_orders',
  'inventory.supplier_returns',
  'inventory.replenishment'
) and active=true;

do $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.features
  where code in ('inventory.purchase_orders','inventory.supplier_returns','inventory.replenishment')
    and active=true and implemented=true and feature_class='add_on';
  if v_count<>3 then raise exception 'Advanced purchasing capability graduation failed: %',v_count; end if;

  if exists(select 1 from public.features where code='inventory.landed_cost' and implemented=true) then
    raise exception 'inventory.landed_cost must remain planned until valuation posting is accepted';
  end if;
end $$;

commit;
