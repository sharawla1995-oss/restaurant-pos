-- Restaurant — Trusted Device Context V1 + Bon V3 binding
-- SOURCE ONLY / DEPLOYMENT 0 / RUNTIME ACTIVATION BLOCKED.
-- This file does NOT call Sharawla Cloud. A trusted server bridge must first consume
-- the opaque Cloud assertion, then create a short-lived Restaurant context using a
-- server-only execution role. POS client roles cannot mint trusted contexts.

create table if not exists public.pos_trusted_device_contexts_v1(
  context_id uuid primary key default gen_random_uuid(),
  cloud_assertion_id uuid not null unique,
  business_id uuid not null,
  device_id uuid not null,
  device_fingerprint text not null,
  purpose text not null check(purpose='restaurant_bon_device_verification'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check(expires_at>created_at)
);
revoke all on table public.pos_trusted_device_contexts_v1 from public,anon,authenticated;

-- SERVER-BRIDGE ONLY. No anon/authenticated grant.
create or replace function public.pos_register_trusted_device_context_v1(
  p_cloud_assertion_id uuid,
  p_business_id uuid,
  p_device_id uuid,
  p_device_fingerprint text,
  p_purpose text,
  p_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if p_cloud_assertion_id is null or p_business_id is null or p_device_id is null
     or nullif(trim(coalesce(p_device_fingerprint,'')),'') is null
     or p_purpose<>'restaurant_bon_device_verification'
     or p_expires_at<=clock_timestamp()
     or p_expires_at>clock_timestamp()+interval '2 minutes' then
    raise exception 'trusted device context rejected';
  end if;
  insert into public.pos_trusted_device_contexts_v1(
    cloud_assertion_id,business_id,device_id,device_fingerprint,purpose,expires_at
  ) values(
    p_cloud_assertion_id,p_business_id,p_device_id,trim(p_device_fingerprint),p_purpose,p_expires_at
  ) returning context_id into v_id;
  return v_id;
end $$;
revoke all on function public.pos_register_trusted_device_context_v1(uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated;

create or replace function public.pos_verified_device_context_v1(
  p_context_id uuid
) returns table(business_id uuid,device_id uuid,device_fingerprint text)
language sql security definer set search_path=public stable as $$
  select c.business_id,c.device_id,c.device_fingerprint
  from public.pos_trusted_device_contexts_v1 c
  where c.context_id=p_context_id
    and c.purpose='restaurant_bon_device_verification'
    and c.expires_at>clock_timestamp()
$$;
revoke all on function public.pos_verified_device_context_v1(uuid) from public,anon;
grant execute on function public.pos_verified_device_context_v1(uuid) to authenticated;

-- V3 wrappers deliberately retain independent employee/branch authorization in V2.
-- The caller supplies only an opaque Restaurant context id. Fingerprint is derived
-- from the server-registered verified tuple, never accepted as proof from request JSON.
create or replace function public.pos_reserve_bon_range_v3(
  p_branch_id bigint,
  p_shift_id bigint,
  p_shift_open_tx_id text,
  p_verified_device_context_id uuid,
  p_request_uid uuid,
  p_count integer default 50
) returns setof public.pos_bon_reservations_v2
language plpgsql security definer set search_path=public as $$
declare v record;
begin
  select * into v from public.pos_verified_device_context_v1(p_verified_device_context_id);
  if not found then raise exception 'trusted device context missing or expired'; end if;
  -- Restaurant database is business-isolated; employee branch authorization remains
  -- enforced by pos_reserve_bon_range_v2/current_employee_id/has_branch_access.
  -- V2 returns jsonb. Rehydrate that JSON into the declared V2 table row type
  -- instead of treating a scalar jsonb value as a SETOF composite row.
  return query
  select *
  from jsonb_populate_record(
    null::public.pos_bon_reservations_v2,
    public.pos_reserve_bon_range_v2(
      p_branch_id,p_shift_id,p_shift_open_tx_id,v.device_fingerprint,p_request_uid,p_count
    )
  );
end $$;

create or replace function public.pos_consume_reserved_bon_v3(
  p_reservation_uid uuid,
  p_bon_number integer,
  p_sale_client_tx_id text,
  p_branch_id bigint,
  p_shift_id bigint,
  p_shift_open_tx_id text,
  p_verified_device_context_id uuid
) returns setof public.pos_bon_consumptions_v2
language plpgsql security definer set search_path=public as $$
declare v record;
begin
  select * into v from public.pos_verified_device_context_v1(p_verified_device_context_id);
  if not found then raise exception 'trusted device context missing or expired'; end if;
  -- V2 returns jsonb; preserve the V3 SETOF contract by explicitly
  -- converting the returned JSON into the consumption table row type.
  return query
  select *
  from jsonb_populate_record(
    null::public.pos_bon_consumptions_v2,
    public.pos_consume_reserved_bon_v2(
      p_reservation_uid,p_bon_number,p_sale_client_tx_id,p_branch_id,p_shift_id,p_shift_open_tx_id,v.device_fingerprint
    )
  );
end $$;

revoke all on function public.pos_reserve_bon_range_v3(bigint,bigint,text,uuid,uuid,integer) from public;
grant execute on function public.pos_reserve_bon_range_v3(bigint,bigint,text,uuid,uuid,integer) to authenticated;
-- Consumption is sale-owner internal. Direct client execution could burn a Bon
-- without atomically persisting its sale.
revoke all on function public.pos_consume_reserved_bon_v3(uuid,integer,text,bigint,bigint,text,uuid) from public,anon,authenticated;
