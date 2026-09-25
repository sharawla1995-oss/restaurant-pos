-- Capability Catalog V3.7 — Landed Cost is operational after safe valuation posting gate.
begin;
update public.features set implemented=true,feature_class='add_on',updated_at=now() where code='inventory.landed_cost' and active=true;
do $$declare v_bad integer;begin
 select count(*) into v_bad from public.feature_dependencies fd join public.features f on f.id=fd.feature_id join public.features d on d.id=fd.depends_on_feature_id where f.code='inventory.landed_cost' and d.implemented is distinct from true;
 if v_bad<>0 then raise exception 'Landed Cost dependency not implemented: %',v_bad;end if;
end $$;
commit;
