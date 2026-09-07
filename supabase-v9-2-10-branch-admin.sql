-- TOP BURGER POS V9.2.10 - Branch Admin
-- Full branch edit / disable / reactivate / safe delete / copy configuration.

create or replace function public.update_branch_full(
  p_branch_id bigint,
  p_name text,
  p_phone text default null,
  p_address text default null,
  p_website_visible boolean default true,
  p_sort_order integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.current_employee_role()='admin' or public.has_permission('branchManagement')) then
    raise exception 'ليس لديك صلاحية إدارة الفروع';
  end if;
  if not exists(select 1 from public.branches where id=p_branch_id) then raise exception 'الفرع غير موجود'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'اسم الفرع مطلوب'; end if;
  if exists(select 1 from public.branches where id<>p_branch_id and active=true and lower(trim(name))=lower(trim(p_name))) then
    raise exception 'يوجد فرع فعال بنفس الاسم';
  end if;
  update public.branches
  set name=trim(p_name),
      phone=nullif(trim(coalesce(p_phone,'')),''),
      address=nullif(trim(coalesce(p_address,'')),''),
      website_visible=coalesce(p_website_visible,true),
      sort_order=coalesce(p_sort_order,sort_order,id)
  where id=p_branch_id;
end;
$$;

create or replace function public.set_branch_active(p_branch_id bigint,p_active boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not (public.current_employee_role()='admin' or public.has_permission('branchManagement')) then
    raise exception 'ليس لديك صلاحية إدارة الفروع';
  end if;
  if not exists(select 1 from public.branches where id=p_branch_id) then raise exception 'الفرع غير موجود'; end if;
  update public.branches
  set active=coalesce(p_active,false),
      website_visible=case when coalesce(p_active,false)=false then false else website_visible end
  where id=p_branch_id;
end;
$$;

create or replace function public.copy_branch_configuration(p_source_branch_id bigint,p_target_branch_id bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not (public.current_employee_role()='admin' or public.has_permission('branchManagement')) then
    raise exception 'ليس لديك صلاحية إدارة الفروع';
  end if;
  if p_source_branch_id=p_target_branch_id then raise exception 'اختر فرعين مختلفين'; end if;
  if not exists(select 1 from public.branches where id=p_source_branch_id) or not exists(select 1 from public.branches where id=p_target_branch_id) then
    raise exception 'أحد الفروع غير موجود';
  end if;

  insert into public.branch_products(branch_id,product_id,active,price_override,website_paused_until)
  select p_target_branch_id,p.id,coalesce(src.active,true),src.price_override,null
  from public.products p
  left join public.branch_products src on src.branch_id=p_source_branch_id and src.product_id=p.id
  on conflict(branch_id,product_id) do update set
    active=excluded.active,
    price_override=excluded.price_override,
    website_paused_until=null;

  insert into public.branch_website_settings(branch_id,orders_open,orders_paused_until,prep_min,prep_max,updated_at)
  select p_target_branch_id,true,null,coalesce(s.prep_min,30),coalesce(s.prep_max,45),now()
  from (select 1) x
  left join public.branch_website_settings s on s.branch_id=p_source_branch_id
  on conflict(branch_id) do update set
    prep_min=excluded.prep_min,
    prep_max=excluded.prep_max,
    orders_paused_until=null,
    updated_at=now();
end;
$$;

create or replace function public.delete_branch_if_empty(p_branch_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare r record; n bigint;
begin
  if not (public.current_employee_role()='admin' or public.has_permission('branchManagement')) then
    raise exception 'ليس لديك صلاحية إدارة الفروع';
  end if;
  if not exists(select 1 from public.branches where id=p_branch_id) then raise exception 'الفرع غير موجود'; end if;

  -- Any operational row referencing this branch blocks deletion.
  for r in
    select c.table_name
    from information_schema.columns c
    where c.table_schema='public' and c.column_name='branch_id'
      and c.table_name not in ('branches','branch_products','branch_website_settings','employee_branches')
  loop
    execute format('select count(*) from public.%I where branch_id=$1',r.table_name) into n using p_branch_id;
    if n>0 then
      raise exception 'لا يمكن حذف الفرع لأنه مرتبط ببيانات في %',r.table_name;
    end if;
  end loop;

  delete from public.employee_branches where branch_id=p_branch_id;
  delete from public.branch_products where branch_id=p_branch_id;
  delete from public.branch_website_settings where branch_id=p_branch_id;
  delete from public.branches where id=p_branch_id;
end;
$$;

grant execute on function public.update_branch_full(bigint,text,text,text,boolean,integer) to authenticated;
grant execute on function public.set_branch_active(bigint,boolean) to authenticated;
grant execute on function public.copy_branch_configuration(bigint,bigint) to authenticated;
grant execute on function public.delete_branch_if_empty(bigint) to authenticated;

notify pgrst, 'reload schema';
