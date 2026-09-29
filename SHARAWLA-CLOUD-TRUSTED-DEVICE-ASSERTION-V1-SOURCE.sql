-- Sharawla Cloud — Trusted Device Assertion V1
-- SOURCE ONLY / DEPLOYMENT 0 / RUNTIME ACTIVATION BLOCKED
-- Does not modify Activation, licensing, canonical fingerprint generation, or business connection.

create table if not exists public.trusted_device_assertions_v1(
  assertion_id uuid primary key default gen_random_uuid(),
  assertion_token uuid not null unique default gen_random_uuid(),
  business_id uuid not null,
  device_id uuid not null,
  device_fingerprint text not null,
  purpose text not null check(purpose='restaurant_bon_device_verification'),
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  check(expires_at>issued_at)
);

revoke all on table public.trusted_device_assertions_v1 from public,anon,authenticated;

-- Called only after the native/main process already possesses the canonical pair from
-- the existing verified license state. Cloud re-verifies the pair and derives business.
create or replace function public.issue_trusted_device_assertion_v1(
  p_device_id uuid,
  p_device_fingerprint text,
  p_purpose text default 'restaurant_bon_device_verification'
)
returns table(assertion_token uuid,expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare
  v_fp text:=trim(coalesce(p_device_fingerprint,''));
  v_business uuid;
  v_token uuid;
  v_exp timestamptz:=clock_timestamp()+interval '2 minutes';
begin
  if p_device_id is null or v_fp='' or p_purpose<>'restaurant_bon_device_verification' then
    raise exception 'trusted device assertion request rejected';
  end if;

  select d.business_id into v_business
  from public.devices d
  join public.businesses b on b.id=d.business_id
  where d.id=p_device_id and d.device_fingerprint=v_fp and b.active=true
  limit 1;
  if v_business is null then raise exception 'canonical device not verified'; end if;

  insert into public.trusted_device_assertions_v1(
    business_id,device_id,device_fingerprint,purpose,expires_at
  ) values(v_business,p_device_id,v_fp,p_purpose,v_exp)
  returning trusted_device_assertions_v1.assertion_token into v_token;

  return query select v_token,v_exp;
end $$;

-- IMPORTANT: this consume RPC is a SERVER-BRIDGE contract. It MUST NOT be granted to
-- anon/authenticated POS clients. A trusted Restaurant verification service calls it
-- with server-held Cloud credentials unavailable to renderer/preload/request payloads.
create or replace function public.consume_trusted_device_assertion_v1(
  p_assertion_token uuid,
  p_purpose text default 'restaurant_bon_device_verification'
)
returns table(
  business_id uuid,
  device_id uuid,
  device_fingerprint text,
  assertion_id uuid
)
language plpgsql security definer set search_path=public as $$
declare v public.trusted_device_assertions_v1%rowtype;
begin
  if p_assertion_token is null or p_purpose<>'restaurant_bon_device_verification' then
    raise exception 'trusted device assertion rejected';
  end if;

  select * into v from public.trusted_device_assertions_v1
  where assertion_token=p_assertion_token
  for update;

  if not found then raise exception 'trusted device assertion unknown'; end if;
  if v.purpose<>p_purpose then raise exception 'trusted device assertion wrong purpose'; end if;
  if v.consumed_at is not null then raise exception 'trusted device assertion replay'; end if;
  if v.expires_at<=clock_timestamp() then raise exception 'trusted device assertion expired'; end if;

  update public.trusted_device_assertions_v1
  set consumed_at=clock_timestamp()
  where trusted_device_assertions_v1.assertion_id=v.assertion_id;

  return query select v.business_id,v.device_id,v.device_fingerprint,v.assertion_id;
end $$;

revoke all on function public.consume_trusted_device_assertion_v1(uuid,text) from public,anon,authenticated;
-- issue grant intentionally remains DEPLOYMENT-BLOCKED until the native/main acquisition
-- path and trusted server bridge are reviewed together. No runtime activation here.
revoke all on function public.issue_trusted_device_assertion_v1(uuid,text,text) from public,anon,authenticated;
