-- Sharawla POS — Beta Multi-Tenant V1 anonymous SECURITY DEFINER hardening
-- SOURCE PREPARATION ONLY.
-- Restaurant public allowlist only. This must run after website RPC tenant guards.

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

-- The only SECURITY DEFINER functions intentionally callable by anon in the
-- Restaurant V1 surface after hardening.
create temporary table mt1_anon_allowlist(name text primary key) on commit drop;
insert into mt1_anon_allowlist(name) values
  ('create_website_order'),
  ('track_website_order'),
  ('track_website_orders'),
  ('cancel_website_order_customer'),
  ('is_branch_website_open'),
  ('is_branch_website_schedule_open'),
  ('preview_promo_code'),
  ('request_business_id');

-- Every allowlisted SECURITY DEFINER must visibly bind tenant context in source.
do $allowlist_source_proof$
declare bad text;
begin
  select string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',', ')
  into bad
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  join mt1_anon_allowlist a on a.name=p.proname
  where n.nspname='public'
    and p.prosecdef
    and pg_get_functiondef(p.oid) !~* '\m(request_business_id|current_business_id|has_branch_access)\M';

  if bad is not null then
    raise exception 'MULTITENANT_PUBLIC_RPC missing tenant guard: %',bad;
  end if;
end
$allowlist_source_proof$;

-- Revoke accidental anonymous EXECUTE from all other SECURITY DEFINER functions.
do $revoke_anon$
declare r record;
begin
  for r in
    select p.oid,p.proname,p.oid::regprocedure sig
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and has_function_privilege('anon',p.oid,'EXECUTE')
      and not exists(select 1 from mt1_anon_allowlist a where a.name=p.proname)
  loop
    execute format('revoke execute on function %s from anon',r.sig);
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
