-- Sharawla RC1 — Bon V3 trusted-device sale integration contract
-- SOURCE ONLY / DEPLOYMENT 0 / RUNTIME ACTIVATION BLOCKED.
-- This is the required integration shape for sale owners that accept reserved Bons.
-- It does not replace any live sale RPC in this commit.

create or replace function public.pos_consume_sale_bon_v3(
  p_order jsonb,
  p_sale_client_tx_id text
) returns integer
language plpgsql security definer set search_path=public as $$
declare
  v_evidence jsonb:=p_order->'bon_reservation';
  v_trusted jsonb:=p_order->'bon_trusted_device_context';
  v_reservation uuid;
  v_context uuid;
  v_bon integer;
  v_branch bigint;
  v_shift bigint;
  v_shift_open_tx text;
  v_row public.pos_bon_consumptions_v2%rowtype;
begin
  if v_evidence is null then return null; end if;
  if nullif(trim(coalesce(p_sale_client_tx_id,'')),'') is null then
    raise exception 'sale client_tx_id required for reserved Bon';
  end if;
  if v_trusted is null then raise exception 'trusted device context required for reserved Bon'; end if;

  v_reservation:=nullif(v_evidence->>'reservation_uid','')::uuid;
  v_context:=nullif(v_trusted->>'verified_device_context_id','')::uuid;
  v_bon:=nullif(v_evidence->>'bon_number','')::integer;
  v_branch:=nullif(p_order->>'branch_id','')::bigint;
  v_shift:=nullif(p_order->>'shift_id','')::bigint;
  v_shift_open_tx:=coalesce(nullif(v_evidence->>'shift_open_tx_id',''),nullif(p_order->>'shift_open_tx_id',''));

  if v_reservation is null or v_context is null or v_bon is null or v_bon<1 or v_branch is null then
    raise exception 'reserved Bon V3 evidence incomplete';
  end if;

  -- Replay is owned by the V2 consumption ledger under V3 trusted-device validation.
  select * into v_row from public.pos_consume_reserved_bon_v3(
    v_reservation,v_bon,p_sale_client_tx_id,v_branch,v_shift,v_shift_open_tx,v_context
  );
  if not found or v_row.bon_number<>v_bon then raise exception 'reserved Bon V3 consume failed'; end if;
  return v_bon;
end $$;

revoke all on function public.pos_consume_sale_bon_v3(jsonb,text) from public;
grant execute on function public.pos_consume_sale_bon_v3(jsonb,text) to authenticated;

-- INTEGRATION REQUIREMENT:
-- Every final sale-owner RPC that persists an order with p_order.bon_reservation MUST,
-- in the SAME database transaction and BEFORE the first durable order write, execute:
--   v_reserved_bon := public.pos_consume_sale_bon_v3(p_order, v_client_tx_id);
-- and persist exactly v_reserved_bon as the order Bon.
-- A reserved Bon MUST NOT fall back to V1/request-supplied fingerprint validation.
-- A sale without bon_reservation keeps the existing online numbering behavior.
