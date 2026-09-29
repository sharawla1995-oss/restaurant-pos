-- Sharawla RC1 — Bon Reservation V1 server source artifact
-- SOURCE ONLY. Do not deploy until the Bon Reservation runtime/acceptance gate is authorized.
-- Additive foundation: does not replace create_pos_order_atomic or numbering triggers.

create table if not exists public.pos_bon_reservations(
  reservation_uid uuid primary key,
  business_id uuid not null,
  branch_id bigint not null references public.branches(id) on delete restrict,
  shift_id bigint not null references public.shifts(id) on delete cascade,
  shift_open_tx_id text not null,
  device_fingerprint text not null,
  request_uid uuid not null,
  start_bon integer not null check(start_bon>=1),
  end_bon integer not null check(end_bon>=start_bon),
  status text not null default 'active' check(status in ('active','closed')),
  issued_at timestamptz not null default now(),
  unique(shift_id,request_uid),
  unique(shift_id,start_bon,end_bon)
);

create table if not exists public.pos_bon_consumptions(
  reservation_uid uuid not null references public.pos_bon_reservations(reservation_uid) on delete restrict,
  bon_number integer not null check(bon_number>=1),
  sale_client_tx_id text not null,
  consumed_at timestamptz not null default now(),
  primary key(reservation_uid,bon_number),
  unique(sale_client_tx_id)
);

create index if not exists pos_bon_reservations_shift_device_idx
  on public.pos_bon_reservations(shift_id,device_fingerprint,status);

revoke all on public.pos_bon_reservations,public.pos_bon_consumptions from anon,authenticated;

create or replace function public.pos_reserve_bon_range_v1(
  p_branch_id bigint,
  p_shift_id bigint,
  p_shift_open_tx_id text,
  p_device_fingerprint text,
  p_request_uid uuid,
  p_size integer default 50
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_emp bigint;
  v_shift public.shifts%rowtype;
  v_existing public.pos_bon_reservations%rowtype;
  v_start integer;
  v_end integer;
  v_business uuid;
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  v_emp:=public.current_employee_id();
  if v_emp is null then raise exception 'تعذر تحديد الموظف الحالي'; end if;
  if p_request_uid is null then raise exception 'معرف طلب الحجز مطلوب'; end if;
  if nullif(trim(coalesce(p_shift_open_tx_id,'')),'') is null then raise exception 'معرف فتح الوردية مطلوب'; end if;
  if nullif(trim(coalesce(p_device_fingerprint,'')),'') is null then raise exception 'بصمة الجهاز مطلوبة'; end if;
  if coalesce(p_size,0)<1 or p_size>500 then raise exception 'حجم نطاق البونات غير صحيح'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية على هذا الفرع'; end if;

  perform pg_advisory_xact_lock(hashtextextended('bon-reserve:'||p_shift_id::text,0));

  select * into v_existing
    from public.pos_bon_reservations
   where shift_id=p_shift_id and request_uid=p_request_uid;
  if found then
    if v_existing.branch_id<>p_branch_id
       or v_existing.shift_open_tx_id<>trim(p_shift_open_tx_id)
       or v_existing.device_fingerprint<>trim(p_device_fingerprint) then
      raise exception 'طلب الحجز المعاد لا يطابق الحجز الأصلي';
    end if;
    return to_jsonb(v_existing);
  end if;

  select * into v_shift from public.shifts
   where id=p_shift_id and branch_id=p_branch_id and employee_id=v_emp
   for update;
  if not found or v_shift.status<>'open' or v_shift.closed_at is not null then
    raise exception 'الوردية غير مفتوحة أو غير مطابقة';
  end if;
  if nullif(trim(coalesce(v_shift.client_open_tx_id,'')),'') is distinct from trim(p_shift_open_tx_id) then
    raise exception 'هوية فتح الوردية غير مطابقة';
  end if;

  -- business identity is derived from the branch; caller cannot choose another business.
  select b.business_id into v_business from public.branches b where b.id=p_branch_id;
  if v_business is null then raise exception 'تعذر تحديد النشاط'; end if;

  insert into public.shift_bon_counters(shift_id,branch_id,next_number)
  values(p_shift_id,p_branch_id,1)
  on conflict(shift_id) do nothing;
  select next_number into v_start from public.shift_bon_counters where shift_id=p_shift_id for update;
  v_end:=v_start+p_size-1;
  update public.shift_bon_counters set next_number=v_end+1 where shift_id=p_shift_id;

  insert into public.pos_bon_reservations(
    reservation_uid,business_id,branch_id,shift_id,shift_open_tx_id,
    device_fingerprint,request_uid,start_bon,end_bon,status
  ) values(
    gen_random_uuid(),v_business,p_branch_id,p_shift_id,trim(p_shift_open_tx_id),
    trim(p_device_fingerprint),p_request_uid,v_start,v_end,'active'
  ) returning * into v_existing;
  return to_jsonb(v_existing);
end $$;

create or replace function public.pos_consume_reserved_bon_v1(
  p_reservation_uid uuid,
  p_bon_number integer,
  p_sale_client_tx_id text,
  p_branch_id bigint,
  p_shift_id bigint,
  p_shift_open_tx_id text,
  p_device_fingerprint text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_res public.pos_bon_reservations%rowtype;
  v_existing public.pos_bon_consumptions%rowtype;
  v_shift public.shifts%rowtype;
  v_key text:=nullif(trim(coalesce(p_sale_client_tx_id,'')),'');
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;
  if v_key is null then raise exception 'معرف البيع مطلوب'; end if;
  if not public.has_branch_access(p_branch_id) then raise exception 'ليس لديك صلاحية على هذا الفرع'; end if;

  perform pg_advisory_xact_lock(hashtextextended('bon-consume:'||v_key,0));

  select * into v_existing from public.pos_bon_consumptions where sale_client_tx_id=v_key;
  if found then
    if v_existing.reservation_uid is distinct from p_reservation_uid or v_existing.bon_number<>p_bon_number then
      raise exception 'إعادة تشغيل البيع لا تطابق البون المحجوز';
    end if;
    return to_jsonb(v_existing);
  end if;

  select * into v_res from public.pos_bon_reservations where reservation_uid=p_reservation_uid for update;
  if not found or v_res.status<>'active' then raise exception 'حجز البون غير صالح'; end if;
  if v_res.branch_id<>p_branch_id or v_res.shift_id<>p_shift_id
     or v_res.shift_open_tx_id<>trim(coalesce(p_shift_open_tx_id,''))
     or v_res.device_fingerprint<>trim(coalesce(p_device_fingerprint,'')) then
    raise exception 'حجز البون لا يطابق الفرع أو الوردية أو الجهاز';
  end if;
  if p_bon_number<v_res.start_bon or p_bon_number>v_res.end_bon then
    raise exception 'رقم البون خارج النطاق المحجوز';
  end if;

  select * into v_shift from public.shifts where id=p_shift_id and branch_id=p_branch_id for update;
  if not found or v_shift.status<>'open' or v_shift.closed_at is not null then
    raise exception 'لا يمكن استهلاك حجز وردية مغلقة';
  end if;
  if nullif(trim(coalesce(v_shift.client_open_tx_id,'')),'') is distinct from v_res.shift_open_tx_id then
    raise exception 'هوية الوردية تغيرت';
  end if;

  insert into public.pos_bon_consumptions(reservation_uid,bon_number,sale_client_tx_id)
  values(p_reservation_uid,p_bon_number,v_key)
  returning * into v_existing;
  return to_jsonb(v_existing);
end $$;

revoke all on function public.pos_reserve_bon_range_v1(bigint,bigint,text,text,uuid,integer) from public;
grant execute on function public.pos_reserve_bon_range_v1(bigint,bigint,text,text,uuid,integer) to authenticated;
revoke all on function public.pos_consume_reserved_bon_v1(uuid,integer,text,bigint,bigint,text,text) from public;
grant execute on function public.pos_consume_reserved_bon_v1(uuid,integer,text,bigint,bigint,text,text) to authenticated;

notify pgrst,'reload schema';
