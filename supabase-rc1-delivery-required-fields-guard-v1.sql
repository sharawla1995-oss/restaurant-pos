-- Sharawla RC1 Practical Offline — Delivery Required Fields Server Guard V1
-- SOURCE ONLY. Isolated Beta SH-0007 only after explicit deployment authorization.
-- Production SH-0005 / SH-0006 are out of scope.
-- Live Beta prerequisite read-only evidence on 2026-09-26:
--   create_pos_order_atomic(jsonb,jsonb,jsonb) MD5 = a677482d9944aa8ae40003408506c7c1
-- This trigger is deliberately ordered before trg_assign_order_numbers so invalid
-- delivery payloads fail before numbering/order insert work in the transaction.

begin;

do $pre$
declare v_md5 text;
begin
  select md5(pg_get_functiondef('public.create_pos_order_atomic(jsonb,jsonb,jsonb)'::regprocedure)) into v_md5;
  if v_md5 is distinct from 'a677482d9944aa8ae40003408506c7c1' then
    raise exception 'RC1 delivery guard refused: create_pos_order_atomic drifted (md5=%)', v_md5;
  end if;
  if to_regclass('public.orders') is null or to_regclass('public.delivery_zones') is null then
    raise exception 'RC1 delivery guard refused: required tables are missing';
  end if;
end;
$pre$;

create or replace function public.rc1_assert_delivery_required_fields_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_phone text;
begin
  if coalesce(new.order_type,'') <> 'delivery' then
    return new;
  end if;

  v_phone := regexp_replace(coalesce(new.customer_phone,''),'[^0-9]','','g');
  if left(v_phone,4)='0020' then
    v_phone := substr(v_phone,5);
  elsif left(v_phone,2)='20' and length(v_phone)>=12 then
    v_phone := substr(v_phone,3);
  elsif length(v_phone)=10 and left(v_phone,1)='1' then
    v_phone := '0'||v_phone;
  end if;

  if v_phone !~ '^01[0125][0-9]{8}$' then
    raise exception using errcode='22023', message='رقم موبايل الدليفري غير صحيح — اكتب رقم مصري 11 رقم';
  end if;
  if nullif(trim(coalesce(new.delivery_address,'')),'') is null then
    raise exception using errcode='22023', message='عنوان التوصيل مطلوب لأوردر الدليفري';
  end if;
  if new.delivery_zone_id is null then
    raise exception using errcode='22023', message='منطقة التوصيل مطلوبة لأوردر الدليفري';
  end if;
  if not exists(
    select 1
    from public.delivery_zones z
    where z.id=new.delivery_zone_id
      and z.branch_id=new.branch_id
      and z.active=true
  ) then
    raise exception using errcode='22023', message='منطقة التوصيل غير صحيحة أو لا تتبع نفس الفرع';
  end if;

  new.customer_phone := v_phone;
  new.delivery_address := trim(new.delivery_address);
  return new;
end;
$function$;

revoke all on function public.rc1_assert_delivery_required_fields_v1() from public, anon, authenticated;

drop trigger if exists trg_00_rc1_delivery_required_fields_v1 on public.orders;
create trigger trg_00_rc1_delivery_required_fields_v1
before insert or update of order_type, customer_phone, delivery_address, delivery_zone_id, branch_id
on public.orders
for each row execute function public.rc1_assert_delivery_required_fields_v1();

do $post$
declare v_def text; v_trigger text;
begin
  v_def := pg_get_functiondef('public.rc1_assert_delivery_required_fields_v1()'::regprocedure);
  select pg_get_triggerdef(t.oid) into v_trigger
  from pg_trigger t
  where t.tgrelid='public.orders'::regclass
    and t.tgname='trg_00_rc1_delivery_required_fields_v1'
    and not t.tgisinternal;
  if position('delivery_zone_id' in v_def)=0
     or position('^01[0125][0-9]{8}$' in v_def)=0
     or position('z.branch_id=new.branch_id' in v_def)=0
     or v_trigger is null then
    raise exception 'RC1 delivery required-fields guard postcondition failed';
  end if;
end;
$post$;

commit;
