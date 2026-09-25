-- Capability Catalog V3.5 — Orders V2 + Finance/B2B graduation
-- No assignments are created here.
begin;
update public.features set implemented=true,feature_class='add_on',updated_at=now()
where code in (
 'commerce.custom_orders','commerce.b2b_orders','commerce.quotations','commerce.price_tiers',
 'finance.credit','finance.receivables','finance.collections','finance.aging'
) and active=true;

do $$declare c integer;bad integer;begin
 select count(*) into c from public.features where code in ('commerce.custom_orders','commerce.b2b_orders','commerce.quotations','commerce.price_tiers','finance.credit','finance.receivables','finance.collections','finance.aging') and implemented=true and feature_class='add_on';
 if c<>8 then raise exception 'Orders/Finance capability graduation failed: %',c;end if;
 select count(*) into bad from public.feature_dependencies fd join public.features f on f.id=fd.feature_id join public.features d on d.id=fd.depends_on_feature_id where f.code in ('commerce.custom_orders','commerce.b2b_orders','commerce.quotations','commerce.price_tiers','finance.credit','finance.receivables','finance.collections','finance.aging') and d.implemented is distinct from true;
 if bad<>0 then raise exception 'Orders/Finance dependency not implemented: %',bad;end if;
end$$;
commit;
