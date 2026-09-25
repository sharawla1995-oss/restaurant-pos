-- Sharawla POS 10.5.4-beta.54
-- Shared Business Core — Customer create foundation
-- Sandbox-first additive migration. Does not alter existing checkout/customer auto-save behavior.

begin;

insert into public.permission_actions_v2(code,name_ar,domain,legacy_permission,sort_order) values
 ('customers.create','إضافة عميل','customers','customers',1000)
on conflict(code) do update set
 name_ar=excluded.name_ar,
 domain=excluded.domain,
 legacy_permission=excluded.legacy_permission,
 sort_order=excluded.sort_order,
 active=true;

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
set search_path=public
as $$
declare
 e bigint;
 b bigint;
 idv bigint;
 nm text:=nullif(trim(coalesce(p_name,'')),'');
 ph text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
 ar text:=nullif(trim(coalesce(p_area,'')),'');
 ad text:=nullif(trim(coalesce(p_address,'')),'');
 nt text:=nullif(trim(coalesce(p_notes,'')),'');
begin
 if auth.uid() is null then raise exception 'غير مصرح'; end if;
 if not public.has_action_permission_v2('customers.create') then
  raise exception 'ليس لديك صلاحية إضافة عميل';
 end if;
 if nm is null then raise exception 'اسم العميل مطلوب'; end if;
 if ph='' then ph:=null; end if;
 if ph is not null and ph !~ '^01[0125][0-9]{8}$' then
  raise exception 'رقم الموبايل غير صحيح';
 end if;
 if ph is not null and exists(
  select 1 from public.customers c
  where regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')=ph
 ) then
  raise exception 'رقم الموبايل مسجل لعميل موجود';
 end if;
 e:=public.current_employee_id();
 select branch_id into b from public.employees where id=e;
 insert into public.customers(name,phone,area,address,notes,created_at,updated_at)
 values(nm,ph,ar,ad,nt,now(),now())
 returning id into idv;
 insert into public.audit_logs(employee_id,branch_id,action,entity_type,entity_id,details,created_at)
 values(e,b,'customer_create','customer',idv,jsonb_build_object('name',nm,'phone',ph,'area',ar),now());
 return idv;
end;
$$;

grant execute on function public.customer_create_v2(text,text,text,text,text) to authenticated;

commit;
