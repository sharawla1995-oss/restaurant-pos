-- Sharawla POS — Phase B tenant-safe canonical customer create owner
-- Generated from current live Beta customer_create_v2 body.

begin;

do $guard$
begin
  if current_setting('sharawla.multitenant_apply',true) is distinct from 'beta-only-approved' then
    raise exception 'MULTITENANT_V1_SOURCE_ONLY';
  end if;
end
$guard$;

create or replace function public.customer_create_v2(
  p_name text,
  p_phone text,
  p_area text default null,
  p_address text default null,
  p_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  e bigint;
  b bigint;
  idv bigint;
  v_business_id uuid;
  nm text:=nullif(trim(coalesce(p_name,'')),'');
  ph text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  ar text:=nullif(trim(coalesce(p_area,'')),'');
  ad text:=nullif(trim(coalesce(p_address,'')),'');
  nt text:=nullif(trim(coalesce(p_notes,'')),'');
begin
  if auth.uid() is null then raise exception 'غير مصرح'; end if;

  v_business_id:=public.current_business_id();
  if v_business_id is null then
    raise exception 'MULTITENANT_CONTEXT_REQUIRED' using errcode='42501';
  end if;

  if not public.has_action_permission_v2('customers.create') then
    raise exception 'ليس لديك صلاحية إضافة عميل';
  end if;

  if nm is null then raise exception 'اسم العميل مطلوب'; end if;
  if ph='' then ph:=null; end if;

  if ph is not null and ph !~ '^01[0125][0-9]{8}$' then
    raise exception 'رقم الموبايل غير صحيح';
  end if;

  if ph is not null and exists(
    select 1
    from public.customers c
    where c.business_id=v_business_id
      and regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=ph
  ) then
    raise exception 'رقم الموبايل مسجل لعميل موجود';
  end if;

  e:=public.current_employee_id();
  select branch_id into b
  from public.employees
  where id=e
    and business_id=v_business_id;

  insert into public.customers(
    business_id,name,phone,area,address,notes,created_at,updated_at
  )
  values(
    v_business_id,nm,ph,ar,ad,nt,now(),now()
  )
  returning id into idv;

  insert into public.audit_logs(
    business_id,employee_id,branch_id,action,entity_type,entity_id,details,created_at
  )
  values(
    v_business_id,e,b,'customer_create','customer',idv,
    jsonb_build_object('name',nm,'phone',ph,'area',ar),now()
  );

  return idv;
end;
$$;

commit;
