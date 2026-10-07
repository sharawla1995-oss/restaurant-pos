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

create or replace function public.header_business_id()
returns uuid
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $mt1_header_business$
declare
  h jsonb;
  raw_id text;
  v uuid;
begin
  begin
    h:=coalesce(current_setting('request.headers',true),'{}')::jsonb;
  exception when others then
    h:='{}'::jsonb;
  end;
  raw_id:=nullif(trim(coalesce(h->>'x-sharawla-business','')),'');
  if raw_id is null then return null; end if;

  begin
    v:=raw_id::uuid;
  exception when invalid_text_representation then
    return null;
  end;

  if exists(select 1 from public.businesses b where b.id=v and b.active=true) then
    return v;
  end if;
  return null;
end
$mt1_header_business$;

revoke all on function public.header_business_id() from public;
grant execute on function public.header_business_id() to anon,authenticated;

create or replace function public.header_device_id()
returns uuid
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $mt1_header_device$
declare
  h jsonb;
  raw_id text;
  v uuid;
begin
  begin
    h:=coalesce(current_setting('request.headers',true),'{}')::jsonb;
  exception when others then
    h:='{}'::jsonb;
  end;
  raw_id:=nullif(trim(coalesce(h->>'x-sharawla-device','')),'');
  if raw_id is null then return null; end if;
  begin
    v:=raw_id::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  return v;
end
$mt1_header_device$;

revoke all on function public.header_device_id() from public;
grant execute on function public.header_device_id() to authenticated;

create or replace function public.current_business_id()
returns uuid
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $mt1_current_business$
declare
  v_header uuid;
  v_device uuid;
  v_business uuid;
  v_count integer;
begin
  if auth.uid() is null then return null; end if;

  v_header:=public.header_business_id();
  v_device:=public.header_device_id();

  -- Header business_id is only a selector. Server-owned membership + active employee
  -- must independently prove the caller belongs to the selected canonical Cloud tenant.
  if v_header is not null then
    select m.business_id into v_business
    from public.business_auth_memberships m
    where m.auth_user_id=auth.uid()
      and m.business_id=v_header
      and m.active=true
      and exists(
        select 1 from public.employees e
        where e.auth_user_id=m.auth_user_id
          and e.business_id=m.business_id
          and e.active=true
      )
    limit 1;

    if v_business is null then return null; end if;

    -- New desktop clients send the canonical Cloud device_id. If supplied, it must
    -- match the server-owned device/business binding. A forged device header cannot widen access.
    if v_device is not null and not exists(
      select 1 from public.business_device_bindings d
      where d.device_id=v_device
        and d.business_id=v_business
        and d.active=true
    ) then
      return null;
    end if;

    return v_business;
  end if;

  -- Legacy SH-0007 compatibility: no tenant is guessed unless the authenticated
  -- user has exactly one active server-side membership and matching active employee.
  select count(distinct m.business_id), min(m.business_id::text)::uuid
  into v_count,v_business
  from public.business_auth_memberships m
  where m.auth_user_id=auth.uid()
    and m.active=true
    and exists(
      select 1 from public.employees e
      where e.auth_user_id=m.auth_user_id
        and e.business_id=m.business_id
        and e.active=true
    );

  if v_count=1 then return v_business; end if;
  return null;
end
$mt1_current_business$;

revoke all on function public.current_business_id() from public,anon;
grant execute on function public.current_business_id() to authenticated;

create or replace function public.request_business_id()
returns uuid
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $mt1_request_business$
begin
  if auth.uid() is not null then
    return public.current_business_id();
  end if;

  -- Anonymous website traffic has no Auth membership; the UUID is only a public
  -- tenant selector and remains constrained to public RPC/RLS surfaces.
  return public.header_business_id();
end
$mt1_request_business$;

revoke all on function public.request_business_id() from public;
grant execute on function public.request_business_id() to anon,authenticated;

create or replace function public.mt1_assert_device_business(p_device_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=pg_catalog,public
as $mt1_device_assert$
declare v_business uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED' using errcode='42501';
  end if;

  v_business:=public.current_business_id();
  if v_business is null then
    raise exception 'MULTITENANT_CONTEXT_DENIED' using errcode='42501';
  end if;

  if p_device_id is null or not exists(
    select 1 from public.business_device_bindings d
    where d.device_id=p_device_id
      and d.business_id=v_business
      and d.active=true
  ) then
    raise exception 'DEVICE_BUSINESS_MISMATCH' using errcode='42501';
  end if;

  return true;
end
$mt1_device_assert$;

revoke all on function public.mt1_assert_device_business(uuid) from public,anon;
grant execute on function public.mt1_assert_device_business(uuid) to authenticated;

create or replace function public.current_employee_id()
returns bigint
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select e.id
  from public.employees e
  where e.auth_user_id=auth.uid()
    and e.business_id=public.current_business_id()
    and e.active=true
  limit 1
$$;

create or replace function public.current_employee_role()
returns text
language sql
stable
security definer
set search_path=pg_catalog,public
as $$
  select e.role
  from public.employees e
  where e.auth_user_id=auth.uid()
    and e.business_id=public.current_business_id()
    and e.active=true
  limit 1
$$;

revoke all on function public.current_employee_id() from public,anon;
revoke all on function public.current_employee_role() from public,anon;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.current_employee_role() to authenticated;

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

-- Request-context write guard uses auth.role(), which safely supports both
-- request.jwt.claim.role and request.jwt.claims. Do not parse one claim format manually.
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
  role_name:=coalesce(auth.role(),'');
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
