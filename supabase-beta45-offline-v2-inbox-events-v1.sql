-- Sharawla Offline Engine V2 — Phase 7 Inbox + Website/Customer/Order Events
-- Beta backend only during validation. Additive, with compatibility wrapper around
-- the already deployed Phase 5 apply_event transport.

create table if not exists public.offline_v2_domain_events (
  event_id uuid primary key default gen_random_uuid(),
  branch_id bigint,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  source text not null default 'cloud',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists offline_v2_domain_events_branch_cursor_idx
  on public.offline_v2_domain_events(branch_id, created_at, event_id);
create index if not exists offline_v2_domain_events_entity_idx
  on public.offline_v2_domain_events(entity_type, entity_id, created_at desc);

alter table public.offline_v2_domain_events enable row level security;
revoke all on table public.offline_v2_domain_events from public, anon, authenticated;

create table if not exists public.offline_v2_customer_merge_receipts (
  client_tx_id text primary key,
  normalized_phone text not null,
  customer_id bigint not null references public.customers(id),
  result_json jsonb not null,
  auth_user_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.offline_v2_customer_merge_receipts enable row level security;
revoke all on table public.offline_v2_customer_merge_receipts from public, anon, authenticated;

create or replace function public.offline_v2_normalize_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g');
begin
  if left(v,2)='20' and length(v)>=12 then v := substr(v,3); end if;
  if length(v)=10 and left(v,1)='1' then v := '0'||v; end if;
  return v;
end;
$$;

create or replace function public.offline_v2_emit_order_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_source text := case when coalesce(new.source,'')='website' then 'website' else 'cloud' end;
begin
  if tg_op='INSERT' then
    v_type := case when coalesce(new.source,'')='website' then 'website.order_created' else 'order.created' end;
  elsif new.status is distinct from old.status then
    v_type := 'order.status_changed';
  elsif new.payment_status is distinct from old.payment_status then
    v_type := 'order.payment_changed';
  elsif new.driver_id is distinct from old.driver_id then
    v_type := 'order.driver_changed';
  else
    v_type := 'order.updated';
  end if;

  insert into public.offline_v2_domain_events(branch_id,event_type,entity_type,entity_id,source,payload)
  values(new.branch_id,v_type,'order',new.id::text,v_source,to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists trg_offline_v2_order_event on public.orders;
create trigger trg_offline_v2_order_event
after insert or update on public.orders
for each row execute function public.offline_v2_emit_order_event();

create or replace function public.offline_v2_emit_customer_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.offline_v2_domain_events(branch_id,event_type,entity_type,entity_id,source,payload)
  values(null,'customer.upsert','customer',new.id::text,'cloud',to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists trg_offline_v2_customer_event on public.customers;
create trigger trg_offline_v2_customer_event
after insert or update on public.customers
for each row execute function public.offline_v2_emit_customer_event();

create or replace function public.offline_v2_emit_customer_address_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op='DELETE' then
    insert into public.offline_v2_domain_events(branch_id,event_type,entity_type,entity_id,source,payload)
    values(null,'customer_address.deleted','customer_address',old.id::text,'cloud',to_jsonb(old));
    return old;
  end if;
  insert into public.offline_v2_domain_events(branch_id,event_type,entity_type,entity_id,source,payload)
  values(null,'customer_address.upsert','customer_address',new.id::text,'cloud',to_jsonb(new));
  return new;
end;
$$;

drop trigger if exists trg_offline_v2_customer_address_event on public.customer_addresses;
create trigger trg_offline_v2_customer_address_event
after insert or update or delete on public.customer_addresses
for each row execute function public.offline_v2_emit_customer_address_event();

create or replace function public.offline_v2_pull_events_v1(
  p_branch_id bigint,
  p_after_created_at timestamptz default null,
  p_after_event_id uuid default null,
  p_limit integer default 100
)
returns table(
  event_id uuid,
  branch_id bigint,
  event_type text,
  entity_type text,
  entity_id text,
  source text,
  payload jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee bigint;
  v_role text;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='غير مصرح';
  end if;
  if coalesce(p_branch_id,0)<=0 then
    raise exception using errcode='22023', message='branch_id مطلوب';
  end if;
  v_employee := public.current_employee_id();
  select e.role into v_role from public.employees e where e.id=v_employee and e.active=true;
  if v_employee is null then
    raise exception using errcode='42501', message='لا يوجد موظف نشط للجلسة';
  end if;
  if not (
    v_role in ('admin','manager','callcenter')
    or exists(select 1 from public.employees e where e.id=v_employee and e.branch_id=p_branch_id)
    or exists(select 1 from public.employee_branches eb where eb.employee_id=v_employee and eb.branch_id=p_branch_id)
  ) then
    raise exception using errcode='42501', message='الفرع غير متاح لهذا الموظف';
  end if;

  return query
  select e.event_id,e.branch_id,e.event_type,e.entity_type,e.entity_id,e.source,e.payload,e.created_at
  from public.offline_v2_domain_events e
  where (e.branch_id is null or e.branch_id=p_branch_id)
    and (
      p_after_created_at is null
      or e.created_at>p_after_created_at
      or (e.created_at=p_after_created_at and (p_after_event_id is null or e.event_id::text>p_after_event_id::text))
    )
  order by e.created_at,e.event_id
  limit greatest(1,least(coalesce(p_limit,100),500));
end;
$$;

create or replace function public.offline_v2_merge_customer_v1(
  p_name text,
  p_phone text,
  p_area text,
  p_address text,
  p_notes text,
  p_client_tx_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx text := nullif(trim(coalesce(p_client_tx_id,'')),'');
  v_phone text := public.offline_v2_normalize_phone(p_phone);
  v_customer public.customers%rowtype;
  v_receipt public.offline_v2_customer_merge_receipts%rowtype;
  v_result jsonb;
  v_existing boolean := false;
begin
  if auth.uid() is null then raise exception using errcode='42501', message='غير مصرح'; end if;
  if v_tx is null or length(v_phone)<10 then raise exception using errcode='22023', message='بيانات العميل/TX غير مكتملة'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ov2-customer:'||right(v_phone,10),0));

  select * into v_receipt from public.offline_v2_customer_merge_receipts where client_tx_id=v_tx;
  if found then
    if v_receipt.normalized_phone is distinct from v_phone or v_receipt.auth_user_id is distinct from auth.uid() then
      raise exception using errcode='22000', message='Offline V2 customer duplicate TX mismatch';
    end if;
    return v_receipt.result_json;
  end if;

  select c.* into v_customer
  from public.customers c
  where right(public.offline_v2_normalize_phone(c.phone),10)=right(v_phone,10)
  order by c.id
  limit 1;

  if found then
    v_existing := true;
    update public.customers c set
      name=case when nullif(trim(coalesce(c.name,'')),'') is null then coalesce(nullif(trim(p_name),''),c.name) else c.name end,
      area=case when nullif(trim(coalesce(c.area,'')),'') is null then coalesce(nullif(trim(p_area),''),c.area) else c.area end,
      address=case when nullif(trim(coalesce(c.address,'')),'') is null then coalesce(nullif(trim(p_address),''),c.address) else c.address end,
      notes=case when nullif(trim(coalesce(c.notes,'')),'') is null then coalesce(nullif(trim(p_notes),''),c.notes) else c.notes end,
      updated_at=now()
    where c.id=v_customer.id
    returning * into v_customer;
  else
    insert into public.customers(name,phone,area,address,notes,created_at,updated_at)
    values(coalesce(nullif(trim(p_name),''),v_phone),v_phone,nullif(trim(p_area),''),nullif(trim(p_address),''),nullif(trim(p_notes),''),now(),now())
    returning * into v_customer;
  end if;

  v_result := jsonb_build_object(
    'ok',true,'client_tx_id',v_tx,'customer_id',v_customer.id,
    'merged_existing',v_existing,'customer',to_jsonb(v_customer)
  );
  insert into public.offline_v2_customer_merge_receipts(client_tx_id,normalized_phone,customer_id,result_json,auth_user_id)
  values(v_tx,v_phone,v_customer.id,v_result,auth.uid());
  return v_result;
end;
$$;

create or replace function public.offline_v2_update_order_status_v1(
  p_order_id bigint,
  p_branch_id bigint,
  p_status text,
  p_driver_id bigint,
  p_cancelled_reason text,
  p_client_tx_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee bigint := public.current_employee_id();
  v_role text;
  v_status text := lower(trim(coalesce(p_status,'')));
  v_order public.orders%rowtype;
begin
  if auth.uid() is null or v_employee is null then raise exception using errcode='42501', message='غير مصرح'; end if;
  if nullif(trim(coalesce(p_client_tx_id,'')),'') is null then raise exception using errcode='22023', message='client_tx_id مطلوب'; end if;
  if v_status not in ('new','preparing','ready','out_for_delivery','completed','delivered','cancelled') then
    raise exception using errcode='22023', message='حالة الطلب غير مدعومة';
  end if;
  select e.role into v_role from public.employees e where e.id=v_employee and e.active=true;
  if not (
    v_role in ('admin','manager','callcenter')
    or exists(select 1 from public.employees e where e.id=v_employee and e.branch_id=p_branch_id)
    or exists(select 1 from public.employee_branches eb where eb.employee_id=v_employee and eb.branch_id=p_branch_id)
  ) then raise exception using errcode='42501', message='الفرع غير متاح لهذا الموظف'; end if;

  update public.orders o set
    status=v_status,
    driver_id=case when v_status='out_for_delivery' then coalesce(p_driver_id,o.driver_id) else o.driver_id end,
    assigned_at=case when v_status='out_for_delivery' then coalesce(o.assigned_at,now()) else o.assigned_at end,
    delivered_at=case when v_status in ('completed','delivered') then coalesce(o.delivered_at,now()) else o.delivered_at end,
    cancelled_reason=case when v_status='cancelled' then nullif(trim(p_cancelled_reason),'') else o.cancelled_reason end
  where o.id=p_order_id and o.branch_id=p_branch_id
  returning * into v_order;
  if not found then raise exception using errcode='P0002', message='الطلب غير موجود في الفرع'; end if;
  return jsonb_build_object('ok',true,'order_id',v_order.id,'order',to_jsonb(v_order));
end;
$$;

-- Preserve Phase 5 exactly by renaming it once, then install a compatibility
-- dispatcher that handles new Phase 7 operations and delegates all old ones.
do $$
begin
  if to_regprocedure('public.sharawla_offline_v2_apply_event_core_v1(jsonb)') is null
     and to_regprocedure('public.sharawla_offline_v2_apply_event(jsonb)') is not null then
    alter function public.sharawla_offline_v2_apply_event(jsonb) rename to sharawla_offline_v2_apply_event_core_v1;
  end if;
end $$;

create or replace function public.sharawla_offline_v2_apply_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx text := nullif(trim(coalesce(p_event->>'client_tx_id','')), '');
  v_digest text := nullif(trim(coalesce(p_event->>'payload_digest','')), '');
  v_operation text := nullif(trim(coalesce(p_event->>'operation_type','')), '');
  v_rpc text := nullif(trim(coalesce(p_event#>>'{payload,rpc_name}','')), '');
  v_payload jsonb := coalesce(p_event#>'{payload,rpc_payload}','{}'::jsonb);
  v_protocol integer := coalesce(nullif(p_event->>'protocol_version','')::integer,0);
  v_device_id text := nullif(trim(coalesce(p_event->>'device_id','')), '');
  v_sequence bigint := coalesce(nullif(p_event->>'device_sequence','')::bigint,0);
  v_branch bigint := coalesce(nullif(p_event->>'branch_id','')::bigint,0);
  v_employee bigint := coalesce(nullif(p_event->>'employee_id','')::bigint,0);
  v_current_employee bigint;
  v_receipt public.offline_v2_server_receipts%rowtype;
  v_result jsonb;
  v_entity_id text;
  v_event_id text;
begin
  if v_operation not in ('customer_merge','order_status') then
    return public.sharawla_offline_v2_apply_event_core_v1(p_event);
  end if;
  if auth.uid() is null then raise exception using errcode='42501', message='غير مصرح'; end if;
  if v_protocol<>2 or v_tx is null or v_digest is null or v_rpc is null or v_device_id is null or v_sequence<=0 or v_branch<=0 or v_employee<=0 then
    raise exception using errcode='22023', message='Offline V2 Phase 7 event contract غير مكتمل';
  end if;
  v_current_employee := public.current_employee_id();
  if v_current_employee is null or v_current_employee is distinct from v_employee then
    raise exception using errcode='42501', message='بيانات الموظف غير مطابقة لجلسة المزامنة';
  end if;
  if (v_operation='customer_merge' and v_rpc<>'offline_v2_merge_customer_v1')
     or (v_operation='order_status' and v_rpc<>'offline_v2_update_order_status_v1') then
    raise exception using errcode='22023', message='Offline V2 Phase 7 operation/RPC binding غير مدعومة';
  end if;
  if nullif(trim(coalesce(v_payload->>'p_client_tx_id','')),'') is distinct from v_tx then
    raise exception using errcode='22023', message='Offline V2 Phase 7 client_tx_id mismatch';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('offline-v2:'||v_tx,0));
  select * into v_receipt from public.offline_v2_server_receipts where client_tx_id=v_tx;
  if found then
    if v_receipt.payload_digest is distinct from v_digest or v_receipt.rpc_name is distinct from v_rpc
       or v_receipt.operation_type is distinct from v_operation or v_receipt.device_id is distinct from v_device_id
       or v_receipt.device_sequence is distinct from v_sequence or v_receipt.branch_id is distinct from v_branch
       or v_receipt.employee_id is distinct from v_employee or v_receipt.auth_user_id is distinct from auth.uid() then
      raise exception using errcode='22000', message='Offline V2 duplicate TX payload/identity mismatch';
    end if;
    return jsonb_build_object('ok',true,'acknowledged',false,'duplicate',true,'idempotent_replay',true,
      'client_tx_id',v_receipt.client_tx_id,'protocol_version',v_receipt.protocol_version,
      'payload_digest',v_receipt.payload_digest,'server_event_id',v_receipt.server_event_id,
      'server_entity_id',v_receipt.server_entity_id,'server_version',v_receipt.server_version,
      'result',v_receipt.result_json);
  end if;

  if v_operation='customer_merge' then
    v_result := public.offline_v2_merge_customer_v1(v_payload->>'p_name',v_payload->>'p_phone',v_payload->>'p_area',v_payload->>'p_address',v_payload->>'p_notes',v_tx);
    v_entity_id := nullif(v_result->>'customer_id','');
  else
    if coalesce(nullif(v_payload->>'p_branch_id','')::bigint,0) is distinct from v_branch then
      raise exception using errcode='22023', message='Offline V2 order status branch mismatch';
    end if;
    v_result := public.offline_v2_update_order_status_v1(
      (v_payload->>'p_order_id')::bigint,v_branch,v_payload->>'p_status',
      nullif(v_payload->>'p_driver_id','')::bigint,v_payload->>'p_cancelled_reason',v_tx
    );
    v_entity_id := nullif(v_result->>'order_id','');
  end if;
  if v_entity_id is null then raise exception using errcode='22000', message='Offline V2 Phase 7 backend result missing entity id'; end if;

  v_event_id := 'ov2-'||md5(v_tx||':'||v_digest);
  insert into public.offline_v2_server_receipts(
    client_tx_id,server_event_id,protocol_version,payload_digest,operation_type,rpc_name,
    device_id,device_sequence,branch_id,employee_id,auth_user_id,server_entity_id,server_version,result_json
  ) values(v_tx,v_event_id,2,v_digest,v_operation,v_rpc,v_device_id,v_sequence,v_branch,v_employee,auth.uid(),v_entity_id,'transport-v1',v_result);

  return jsonb_build_object('ok',true,'acknowledged',true,'duplicate',false,'idempotent_replay',false,
    'client_tx_id',v_tx,'protocol_version',2,'payload_digest',v_digest,'server_event_id',v_event_id,
    'server_entity_id',v_entity_id,'server_version','transport-v1','result',v_result);
end;
$$;

revoke all on function public.offline_v2_pull_events_v1(bigint,timestamptz,uuid,integer) from public, anon;
revoke all on function public.offline_v2_merge_customer_v1(text,text,text,text,text,text) from public, anon;
revoke all on function public.offline_v2_update_order_status_v1(bigint,bigint,text,bigint,text,text) from public, anon;
revoke all on function public.sharawla_offline_v2_apply_event(jsonb) from public, anon;
grant execute on function public.offline_v2_pull_events_v1(bigint,timestamptz,uuid,integer) to authenticated;
grant execute on function public.offline_v2_merge_customer_v1(text,text,text,text,text,text) to authenticated;
grant execute on function public.offline_v2_update_order_status_v1(bigint,bigint,text,bigint,text,text) to authenticated;
grant execute on function public.sharawla_offline_v2_apply_event(jsonb) to authenticated;
