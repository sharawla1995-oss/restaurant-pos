-- Sharawla Offline V2 — Customer + Delivery durable owners v1
-- SOURCE ONLY. Isolated SH-0007 candidate. Production untouched.
begin;

create table if not exists public.offline_customer_delivery_receipts_v1(
 client_tx_id text primary key,
 operation_type text not null,
 payload_digest text not null,
 entity_id bigint,
 result_json jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.offline_customer_delivery_receipts_v1 enable row level security;
revoke all on table public.offline_customer_delivery_receipts_v1 from public,anon,authenticated;

create or replace function public.offline_customer_create_v1(
 p_name text,p_phone text,p_area text,p_address text,p_notes text,
 p_client_tx_id text,p_payload_digest text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');
 r public.offline_customer_delivery_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_CUSTOMER_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-customer:'||v_tx,0));
 select * into r from public.offline_customer_delivery_receipts_v1 where client_tx_id=v_tx;
 if found then
  if r.operation_type<>'customer_create' or r.payload_digest<>v_d then raise exception 'OFFLINE_CUSTOMER_REPLAY_MISMATCH'; end if;
  return r.result_json||jsonb_build_object('idempotent_replay',true);
 end if;
 v_id:=public.customer_create_v2(p_name,p_phone,p_area,p_address,p_notes);
 v_result:=jsonb_build_object('ok',true,'customer_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_customer_delivery_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)
 values(v_tx,'customer_create',v_d,v_id,v_result);
 return v_result;
end;$$;

create or replace function public.offline_customer_update_v1(
 p_customer_id bigint,p_name text,p_phone text,p_area text,p_address text,p_notes text,
 p_client_tx_id text,p_payload_digest text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');
 r public.offline_customer_delivery_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_CUSTOMER_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-customer:'||v_tx,0));
 select * into r from public.offline_customer_delivery_receipts_v1 where client_tx_id=v_tx;
 if found then
  if r.operation_type<>'customer_update' or r.payload_digest<>v_d then raise exception 'OFFLINE_CUSTOMER_REPLAY_MISMATCH'; end if;
  return r.result_json||jsonb_build_object('idempotent_replay',true);
 end if;
 v_id:=public.customer_update_v2(p_customer_id,p_name,p_phone,p_area,p_address,p_notes);
 v_result:=jsonb_build_object('ok',true,'customer_id',v_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_customer_delivery_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)
 values(v_tx,'customer_update',v_d,v_id,v_result);
 return v_result;
end;$$;

create or replace function public.offline_customer_address_save_v1(
 p_address_id bigint,p_customer_id bigint,p_label text,p_area text,p_address text,p_notes text,p_is_default boolean,
 p_client_tx_id text,p_payload_digest text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');
 r public.offline_customer_delivery_receipts_v1%rowtype;v_id bigint;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_CUSTOMER_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-customer:'||v_tx,0));
 select * into r from public.offline_customer_delivery_receipts_v1 where client_tx_id=v_tx;
 if found then
  if r.operation_type<>'customer_address_save' or r.payload_digest<>v_d then raise exception 'OFFLINE_CUSTOMER_REPLAY_MISMATCH'; end if;
  return r.result_json||jsonb_build_object('idempotent_replay',true);
 end if;
 v_id:=public.customer_address_save_v2(p_address_id,p_customer_id,p_label,p_area,p_address,p_notes,p_is_default);
 v_result:=jsonb_build_object('ok',true,'address_id',v_id,'customer_id',p_customer_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_customer_delivery_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)
 values(v_tx,'customer_address_save',v_d,v_id,v_result);
 return v_result;
end;$$;

create or replace function public.offline_customer_address_delete_v1(
 p_address_id bigint,p_client_tx_id text,p_payload_digest text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');
 r public.offline_customer_delivery_receipts_v1%rowtype;v_ok boolean;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_CUSTOMER_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-customer:'||v_tx,0));
 select * into r from public.offline_customer_delivery_receipts_v1 where client_tx_id=v_tx;
 if found then
  if r.operation_type<>'customer_address_delete' or r.payload_digest<>v_d then raise exception 'OFFLINE_CUSTOMER_REPLAY_MISMATCH'; end if;
  return r.result_json||jsonb_build_object('idempotent_replay',true);
 end if;
 v_ok:=public.customer_address_delete_v2(p_address_id);
 v_result:=jsonb_build_object('ok',coalesce(v_ok,false),'address_id',p_address_id,'client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_customer_delivery_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)
 values(v_tx,'customer_address_delete',v_d,p_address_id,v_result);
 return v_result;
end;$$;

create or replace function public.offline_delivery_assign_driver_v1(
 p_order_id bigint,p_driver_id bigint,p_client_tx_id text,p_payload_digest text
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_tx text:=nullif(trim(coalesce(p_client_tx_id,'')),'');v_d text:=nullif(trim(coalesce(p_payload_digest,'')),'');
 r public.offline_customer_delivery_receipts_v1%rowtype;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
 if v_tx is null or v_d is null then raise exception 'OFFLINE_DRIVER_ASSIGN_IDENTITY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-driver:'||v_tx,0));
 select * into r from public.offline_customer_delivery_receipts_v1 where client_tx_id=v_tx;
 if found then
  if r.operation_type<>'delivery_assign_driver' or r.payload_digest<>v_d then raise exception 'OFFLINE_DRIVER_ASSIGN_REPLAY_MISMATCH'; end if;
  return r.result_json||jsonb_build_object('idempotent_replay',true);
 end if;
 v_result:=coalesce(public.order_assign_driver_v2(p_order_id,p_driver_id),'{}'::jsonb)
   ||jsonb_build_object('client_tx_id',v_tx,'idempotent_replay',false);
 insert into public.offline_customer_delivery_receipts_v1(client_tx_id,operation_type,payload_digest,entity_id,result_json)
 values(v_tx,'delivery_assign_driver',v_d,p_order_id,v_result);
 return v_result;
end;$$;

revoke all on function public.offline_customer_create_v1(text,text,text,text,text,text,text) from public,anon;
revoke all on function public.offline_customer_update_v1(bigint,text,text,text,text,text,text,text) from public,anon;
revoke all on function public.offline_customer_address_save_v1(bigint,bigint,text,text,text,text,boolean,text,text) from public,anon;
revoke all on function public.offline_customer_address_delete_v1(bigint,text,text) from public,anon;
revoke all on function public.offline_delivery_assign_driver_v1(bigint,bigint,text,text) from public,anon;
grant execute on function public.offline_customer_create_v1(text,text,text,text,text,text,text) to authenticated;
grant execute on function public.offline_customer_update_v1(bigint,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.offline_customer_address_save_v1(bigint,bigint,text,text,text,text,boolean,text,text) to authenticated;
grant execute on function public.offline_customer_address_delete_v1(bigint,text,text) to authenticated;
grant execute on function public.offline_delivery_assign_driver_v1(bigint,bigint,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
