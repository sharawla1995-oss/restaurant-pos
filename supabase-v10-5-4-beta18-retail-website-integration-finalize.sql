-- Sharawla POS V10.5.4-beta.18 candidate — Retail Website Integration Finalize
-- Run immediately AFTER supabase-v10-5-4-beta18-retail-website-integration.sql
-- BETA backend only.

begin;

-- Reuse the already-proven Restaurant/website weekly-hours authority instead of
-- duplicating schedule logic. Retail adds branch active + website-visible checks.
create or replace function public.retail_website_branch_open(p_branch_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare v_branch public.branches%rowtype;
begin
  select * into v_branch from public.branches where id=p_branch_id;
  if not found or v_branch.active is not true or coalesce(v_branch.website_visible,true) is not true then
    return false;
  end if;
  return public.is_branch_website_open(p_branch_id,now());
end $$;
revoke all on function public.retail_website_branch_open(bigint) from public;
grant execute on function public.retail_website_branch_open(bigint) to anon,authenticated;

-- Move the first implementation behind a private core, then put a hardened
-- public wrapper in front of it. Safe to re-run: only rename when the core is
-- not present yet.
do $$
begin
  if to_regprocedure('public.retail_create_website_order_beta18_core(bigint,text,text,text,text,text,bigint,text,text,text,text,jsonb)') is null
     and to_regprocedure('public.retail_create_website_order(bigint,text,text,text,text,text,bigint,text,text,text,text,jsonb)') is not null then
    execute 'alter function public.retail_create_website_order(bigint,text,text,text,text,text,bigint,text,text,text,text,jsonb) rename to retail_create_website_order_beta18_core';
  end if;
end $$;

create or replace function public.retail_create_website_order(
  p_branch_id bigint,
  p_idempotency_key text,
  p_reservation_key text,
  p_customer_name text,
  p_customer_phone text,
  p_order_type text,
  p_delivery_zone_id bigint,
  p_customer_address text,
  p_customer_notes text,
  p_payment_method_code text,
  p_payment_reference text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_idem text:=nullif(trim(coalesce(p_idempotency_key,'')),'');
  v_res text:=nullif(trim(coalesce(p_reservation_key,'')),'');
  v_phone text:=public.retail_website_normalize_phone(p_customer_phone);
  v_existing public.retail_website_orders%rowtype;
begin
  if v_idem is null or length(v_idem)<8 or length(v_idem)>160 then raise exception 'معرف الطلب غير صالح'; end if;
  if v_res is null or length(v_res)<8 or length(v_res)>160 then raise exception 'معرف الحجز غير صالح'; end if;

  -- Lock both public keys so two concurrent submissions cannot cross-use them.
  perform pg_advisory_xact_lock(hashtextextended('retail-web-idem:'||v_idem,0));
  perform pg_advisory_xact_lock(hashtextextended('retail-web-res:'||v_res,0));

  select * into v_existing from public.retail_website_orders where idempotency_key=v_idem;
  if found then
    -- Idempotency may only replay the same customer's order at the same branch.
    if v_existing.branch_id<>p_branch_id or v_existing.customer_phone<>v_phone then
      raise exception 'معرف الطلب مستخدم بالفعل';
    end if;
    return jsonb_build_object(
      'ok',true,'id',v_existing.id,'order_code',v_existing.public_order_code,
      'status',case when v_existing.status='pending' and v_existing.reservation_expires_at<=now() then 'expired' else v_existing.status end,
      'subtotal',v_existing.subtotal,'offer_discount',v_existing.offer_discount,
      'delivery_fee',v_existing.delivery_fee,'total',v_existing.total,
      'reservation_expires_at',v_existing.reservation_expires_at,'idempotent',true
    );
  end if;

  if exists(select 1 from public.retail_website_orders where reservation_key=v_res) then
    raise exception 'معرف الحجز مستخدم بالفعل';
  end if;

  return public.retail_create_website_order_beta18_core(
    p_branch_id,v_idem,v_res,p_customer_name,p_customer_phone,p_order_type,
    p_delivery_zone_id,p_customer_address,p_customer_notes,p_payment_method_code,
    p_payment_reference,p_items
  );
end $$;

revoke all on function public.retail_create_website_order_beta18_core(bigint,text,text,text,text,text,bigint,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.retail_create_website_order(bigint,text,text,text,text,text,bigint,text,text,text,text,jsonb) from public;
grant execute on function public.retail_create_website_order(bigint,text,text,text,text,text,bigint,text,text,text,text,jsonb) to anon,authenticated;

-- The beta.17 standalone reservation RPC is no longer part of the public Website API.
-- Reservation must be tied atomically to a staged website order.
revoke execute on function public.retail_reserve_stock(bigint,text,jsonb,integer) from anon,authenticated;

notify pgrst,'reload schema';
commit;
