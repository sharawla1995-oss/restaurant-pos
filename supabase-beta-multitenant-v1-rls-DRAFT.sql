-- Sharawla POS — Beta Multi-Tenant V1 RLS + write guard
-- SOURCE PREPARATION ONLY. Apply only after Foundation PASS and client context PASS.
-- Requires: SET sharawla.multitenant_apply = 'beta-only-approved';

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply', true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY: explicit Beta apply guard is not set';
  end if;
end
$guard$;

create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select e.business_id
  from public.employees e
  where e.auth_user_id=auth.uid()
    and e.active=true
  limit 1
$$;

revoke all on function public.current_business_id() from public,anon;
grant execute on function public.current_business_id() to authenticated;

-- Public/website requests must identify tenant explicitly. Staff requests use
-- the authenticated employee mapping and therefore do not require a header.
create or replace function public.request_business_id()
returns uuid
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $$
declare
  v uuid;
  h jsonb;
  ext text;
begin
  if auth.uid() is not null then
    return public.current_business_id();
  end if;

  begin
    h:=coalesce(current_setting('request.headers',true),'{}')::jsonb;
  exception when others then
    h:='{}'::jsonb;
  end;
  ext:=nullif(trim(coalesce(h->>'x-sharawla-business','')),'');
  if ext is null then return null; end if;

  select b.id into v
  from public.businesses b
  where b.active=true
    and (b.external_business_id=ext or b.code=ext)
  limit 1;
  return v;
end
$$;

revoke all on function public.request_business_id() from public;
grant execute on function public.request_business_id() to anon,authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1
    from public.employees e
    where e.auth_user_id=auth.uid()
      and e.business_id=public.current_business_id()
      and e.role='admin'
      and e.active=true
  )
$$;

create or replace function public.has_branch_access(p_branch_id bigint)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select exists(
    select 1
    from public.branches b
    where b.id=p_branch_id
      and b.business_id=public.current_business_id()
      and (
        public.is_admin()
        or exists(
          select 1
          from public.employee_branches eb
          where eb.employee_id=public.current_employee_id()
            and eb.branch_id=b.id
            and eb.business_id=b.business_id
        )
      )
  )
$$;

-- Request-context write guard also applies to writes performed by SECURITY DEFINER
-- RPCs because JWT/request settings remain present during the request.
create or replace function public.mt1_business_write_guard()
returns trigger
language plpgsql
set search_path=pg_catalog,public
as $$
declare
  req uuid;
  role_name text;
begin
  role_name:=coalesce(current_setting('request.jwt.claim.role',true),'');
  if role_name not in ('anon','authenticated') then
    return case when tg_op='DELETE' then old else new end;
  end if;

  req:=public.request_business_id();
  if req is null then
    raise exception 'MULTITENANT_CONTEXT_REQUIRED' using errcode='42501';
  end if;

  if tg_op='DELETE' then
    if old.business_id is distinct from req then
      raise exception 'CROSS_TENANT_DELETE_DENIED' using errcode='42501';
    end if;
    return old;
  end if;

  if new.business_id is null then new.business_id:=req; end if;
  if new.business_id is distinct from req then
    raise exception 'CROSS_TENANT_WRITE_DENIED' using errcode='42501';
  end if;

  if tg_op='UPDATE' and old.business_id is distinct from new.business_id then
    raise exception 'TENANT_REBIND_DENIED' using errcode='42501';
  end if;
  return new;
end
$$;

revoke all on function public.mt1_business_write_guard() from public,anon,authenticated;

-- Add RESTRICTIVE tenant guard. Existing permission policies remain in force,
-- but can no longer widen access beyond the current tenant.
do $tenant_rls$
declare r record; pol text; trig text;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid
      and a.attname='business_id' and a.attnum>0 and not a.attisdropped
    where n.nspname='public' and c.relkind in ('r','p')
      and c.relname<>'businesses'
  loop
    execute format('alter table public.%I enable row level security',r.relname);

    pol:=left('mt1_authenticated_tenant_guard_'||r.relname,63);
    execute format('drop policy if exists %I on public.%I',pol,r.relname);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '||
      'using (business_id=public.current_business_id()) '||
      'with check (business_id=public.current_business_id())',
      pol,r.relname
    );

    -- Only tables that already expose something to anon get an anon restrictive
    -- tenant guard. No new public surface is introduced here.
    if exists(
      select 1 from pg_policies p
      where p.schemaname='public' and p.tablename=r.relname and 'anon'=any(p.roles)
    ) then
      pol:=left('mt1_anon_tenant_guard_'||r.relname,63);
      execute format('drop policy if exists %I on public.%I',pol,r.relname);
      execute format(
        'create policy %I on public.%I as restrictive for select to anon '||
        'using (business_id=public.request_business_id())',
        pol,r.relname
      );
    end if;

    trig:=left('mt1_business_write_guard_'||r.relname,63);
    execute format('drop trigger if exists %I on public.%I',trig,r.relname);
    execute format(
      'create trigger %I before insert or update or delete on public.%I '||
      'for each row execute function public.mt1_business_write_guard()',
      trig,r.relname
    );
  end loop;
end
$tenant_rls$;

-- businesses itself is visible only as the caller's tenant to authenticated users.
alter table public.businesses enable row level security;
drop policy if exists mt1_businesses_self_read on public.businesses;
create policy mt1_businesses_self_read
on public.businesses for select to authenticated
using (id=public.current_business_id());

-- Anonymous direct table access now requires x-sharawla-business.
-- Public RPC hardening is a separate gate; this migration must not be applied
-- until the explicit SECURITY DEFINER allowlist is complete.

commit;
