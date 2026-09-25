-- Sharawla POS — Permissions V2 Owner Coverage PV2-F1
-- Customers Create direct-DML hardening.
-- SOURCE-ONLY. Do not deploy outside the isolated Beta authorization window.
-- Requires the already established public.customer_create_v2(...) Action owner.
-- Production SH-0005 / SH-0006 remain untouched.

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.customer_create_v2(text,text,text,text,text)') is null then
    raise exception 'PV2_F1_CUSTOMER_CREATE_OWNER_MISSING';
  end if;
end;
$$;

-- customer_create_v2 is SECURITY DEFINER and remains the authenticated mutation owner.
-- Direct table INSERT is removed so UI/REST callers cannot bypass customers.create.
drop policy if exists customers_staff_insert on public.customers;

revoke insert on table public.customers from public,anon,authenticated;

-- Read and update are intentionally NOT changed in F1.
-- They remain open for later PV2-F customer.edit / customer.address.manage batches.
grant select,update on table public.customers to authenticated;

revoke all on function public.customer_create_v2(text,text,text,text,text) from public,anon;
grant execute on function public.customer_create_v2(text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';

commit;
