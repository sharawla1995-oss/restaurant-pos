-- Sharawla Restaurant Offline V2 — reference/config durable owners v1
-- SOURCE ONLY. DO NOT deploy without explicit authorization.
begin;

create table if not exists public.offline_restaurant_reference_receipts_v1(
 client_tx_id text primary key,
 operation_type text not null,
 payload_digest text not null,
 entity_id bigint,
 result_json jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.offline_restaurant_reference_receipts_v1 enable row level security;
revoke all on table public.offline_restaurant_reference_receipts_v1 from public,anon,authenticated;

create or replace function public.offline_food_supplier_save_v1(
 p_supplier_id bigint,p_name text,p_phone text,p_email text,p_tax_no text,p_address text,p_notes text,p_active boolean,
 p_client_tx_id text,p_payload_digest text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare
 v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');
 v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');
 r public.offline_restaurant_reference_receipts_v1%rowtype;
 v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_SUPPLIER_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-restaurant-ref:'||v_tx,0));
 select * into r from public.offline_restaurant_reference_receipts_v1 where client_tx_id=v_tx;
 if found then
  if r.operation_type<>'supplier_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_RESTAURANT_REFERENCE_REPLAY_MISMATCH'; end if;
  return r.result_json||jsonb_build_object('idempotent_replay',true);
 end if;
 v_id:=public.food_supplier_save_v1(p_supplier_id,p_name,p_phone,p_email,p_tax_no,p_address,p_notes,p_active);
 if v_id is null then raise exception 'OFFLINE_SUPPLIER_RESULT_MISSING'; end if;
 v_result:=jsonb_build_object('ok',true,'supplier_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_restaurant_reference_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)
 values(v_tx,'supplier_save',v_d,v_id,v_result);
 return v_result;
end;$$;

revoke all on function public.offline_food_supplier_save_v1(bigint,text,text,text,text,text,text,boolean,text,text) from public,anon;
grant execute on function public.offline_food_supplier_save_v1(bigint,text,text,text,text,text,text,boolean,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
