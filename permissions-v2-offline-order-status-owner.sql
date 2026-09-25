-- Sharawla POS — Permissions V2 / Offline V2 order-status owner
-- SOURCE-ONLY. Additive candidate; no DB deployment authorized.

begin;
create table if not exists public.offline_order_status_receipts_v2(
 client_tx_id text primary key,
 order_id bigint not null,
 target_status text not null,
 result_json jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.offline_order_status_receipts_v2 enable row level security;
revoke all on table public.offline_order_status_receipts_v2 from public,anon,authenticated;

create or replace function public.order_status_apply_offline_v2(
 p_order_id bigint,p_target_status text,p_client_tx_id text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare
 v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
 v_target text:=lower(trim(coalesce(p_target_status,'')));
 v_order public.orders%rowtype;
 v_receipt public.offline_order_status_receipts_v2%rowtype;
 v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null then raise exception 'OFFLINE_ORDER_STATUS_CLIENT_TX_REQUIRED'; end if;
 if v_target not in ('preparing','ready','completed','delivered') then raise exception 'OFFLINE_ORDER_STATUS_TARGET_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-order-status:'||v_tx,0));

 select * into v_receipt from public.offline_order_status_receipts_v2 where client_tx_id=v_tx;
 if found then
   if v_receipt.order_id is distinct from p_order_id or v_receipt.target_status is distinct from v_target then
     raise exception 'OFFLINE_ORDER_STATUS_REPLAY_MISMATCH';
   end if;
   return v_receipt.result_json||jsonb_build_object('idempotent_replay',true);
 end if;

 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if not public.has_branch_access(v_order.branch_id) then raise exception 'BRANCH_ACCESS_DENIED'; end if;

 if v_target='delivered' then
   if lower(coalesce(v_order.order_type,''))<>'delivery' then raise exception 'ORDER_NOT_DELIVERY'; end if;
   -- Delegate delivery payment/custody/settlement and Action gates to the accepted owner.
   v_result:=public.delivery_mark_delivered_v2(v_order.id,v_order.payment_method,v_tx);
 else
   -- Delegate preparing/ready/pickup-completed transitions and Action gate to F5A owner.
   v_result:=public.order_fulfillment_transition_v2(v_order.id,v_target);
 end if;

 insert into public.offline_order_status_receipts_v2(client_tx_id,order_id,target_status,result_json)
 values(v_tx,p_order_id,v_target,coalesce(v_result,'{}'::jsonb));

 return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
   'ok',true,'client_tx_id',v_tx,'order_id',p_order_id,'target_status',v_target,'idempotent_replay',false
 );
end;
$$;
revoke all on function public.order_status_apply_offline_v2(bigint,text,text) from public,anon;
grant execute on function public.order_status_apply_offline_v2(bigint,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
