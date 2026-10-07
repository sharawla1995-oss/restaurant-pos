-- Sharawla POS — Beta Multi-Tenant V1 anonymous SECURITY DEFINER hardening
-- SOURCE PREPARATION ONLY.
-- Exact Restaurant + Retail + Generic Web public allowlist. Run only after all public RPC tenant-guard drafts.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
  if current_setting('sharawla.multitenant_public_rpc_ready', true) is distinct from 'yes' then
    raise exception 'MULTITENANT_PUBLIC_RPC_NOT_READY';
  end if;
end
$guard$;

-- Exact public API signatures only. Name-only allowlists are forbidden because
-- overloaded legacy functions must not inherit public access accidentally.
create temporary table mt1_anon_allowlist(oid oid primary key) on commit drop;
insert into mt1_anon_allowlist(oid) values
  ('public.request_business_id()'::regprocedure),

  ('public.create_website_order(bigint,text,text,text,text,jsonb,text,text,text,text,text,bigint)'::regprocedure),
  ('public.track_website_order(bigint,text)'::regprocedure),
  ('public.track_website_orders(text)'::regprocedure),
  ('public.cancel_website_order_customer(bigint,text)'::regprocedure),
  ('public.is_branch_website_open(bigint,timestamp with time zone)'::regprocedure),
  ('public.is_branch_website_schedule_open(bigint,timestamp with time zone)'::regprocedure),
  ('public.preview_promo_code(text,bigint,text,text,jsonb,numeric)'::regprocedure),

  ('public.retail_website_bootstrap()'::regprocedure),
  ('public.retail_website_branch_open(bigint)'::regprocedure),
  ('public.retail_website_catalog(bigint)'::regprocedure),
  ('public.retail_website_quote(bigint,text,bigint,jsonb)'::regprocedure),
  ('public.retail_create_website_order(bigint,text,text,text,text,text,bigint,text,text,text,text,jsonb)'::regprocedure),
  ('public.track_retail_website_order(text,text)'::regprocedure),
  ('public.cancel_retail_website_order_customer(text,text)'::regprocedure),

  ('public.web_profile_bootstrap_v1(text)'::regprocedure),
  ('public.web_service_booking_v1(bigint,bigint,text,text,timestamp with time zone,text,text)'::regprocedure),
  ('public.web_membership_request_v1(bigint,bigint,text,text,text,text)'::regprocedure),
  ('public.web_membership_book_class_v1(bigint,text,text,text)'::regprocedure),
  ('public.web_logistics_track_v1(text,text)'::regprocedure),
  ('public.web_logistics_pickup_v1(bigint,text,text,text,timestamp with time zone,text,text)'::regprocedure);

-- Every allowlisted SECURITY DEFINER must visibly bind tenant context in source.
do $allowlist_source_proof$
declare bad text;
begin
  select string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',', ')
  into bad
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  join mt1_anon_allowlist a on a.oid=p.oid
  where n.nspname='public'
    and p.prosecdef
    and pg_get_functiondef(p.oid) !~* '\m(request_business_id|current_business_id|has_branch_access|mt1_require_request_business|mt1_require_public_branch|mt1_assert_restaurant_items|mt1_assert_retail_items|business_id)\M';

  if bad is not null then
    raise exception 'MULTITENANT_PUBLIC_RPC missing tenant guard: %',bad;
  end if;
end
$allowlist_source_proof$;

-- Revoke accidental anonymous EXECUTE from all other SECURITY DEFINER functions.
-- Most legacy functions inherited EXECUTE from PUBLIC, so revoking anon alone is
-- insufficient. Preserve existing authenticated/service_role capability explicitly
-- before removing PUBLIC/anon.
do $revoke_anon$
declare
  r record;
  keep_authenticated boolean;
  keep_service_role boolean;
begin
  for r in
    select p.oid,p.proname,p.oid::regprocedure sig
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and has_function_privilege('anon',p.oid,'EXECUTE')
      and not exists(select 1 from mt1_anon_allowlist a where a.oid=p.oid)
  loop
    keep_authenticated:=has_function_privilege('authenticated',r.oid,'EXECUTE');
    keep_service_role:=has_function_privilege('service_role',r.oid,'EXECUTE');

    execute format('revoke execute on function %s from public, anon',r.sig);

    if keep_authenticated then
      execute format('grant execute on function %s to authenticated',r.sig);
    end if;
    if keep_service_role then
      execute format('grant execute on function %s to service_role',r.sig);
    end if;
  end loop;
end
$revoke_anon$;

-- Admin/staff operations are never anonymous.
do $staff_only_proof$
declare bad text;
begin
  select string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',', ')
  into bad
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (
      'accept_website_order','reject_website_order',
      'update_business_settings',
      'create_branch_full','update_branch_full','delete_branch_if_empty',
      'admin_set_employee_action_permission_v2','admin_reset_employee_action_permission_v2'
    )
    and has_function_privilege('anon',p.oid,'EXECUTE');

  if bad is not null then
    raise exception 'MULTITENANT_V1 staff RPC still anonymous after revoke: %',bad;
  end if;
end
$staff_only_proof$;

commit;
