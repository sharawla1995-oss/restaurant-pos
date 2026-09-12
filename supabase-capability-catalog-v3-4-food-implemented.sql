-- Capability Catalog V3.4 — Food runtime graduation
-- No Profile / Category / Business assignments are created by this migration.

begin;

update public.features
set implemented=true,feature_class='add_on',updated_at=now()
where code in (
  'food.ingredients','food.recipes','food.prep',
  'food.production','food.waste','food.costing'
) and active=true;

do $$
declare v_count integer; v_bad integer;
begin
  select count(*) into v_count from public.features
  where code in ('food.ingredients','food.recipes','food.prep','food.production','food.waste','food.costing')
    and active=true and implemented=true and feature_class='add_on';
  if v_count<>6 then raise exception 'Food capability graduation failed: %',v_count; end if;

  select count(*) into v_bad
  from public.feature_dependencies fd
  join public.features f on f.id=fd.feature_id
  join public.features d on d.id=fd.depends_on_feature_id
  where f.code in ('food.ingredients','food.recipes','food.prep','food.production','food.waste','food.costing')
    and d.implemented is distinct from true;
  if v_bad<>0 then raise exception 'Food capability dependency not implemented: %',v_bad; end if;
end $$;

commit;
