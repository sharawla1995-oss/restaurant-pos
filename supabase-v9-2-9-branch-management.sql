-- TOP BURGER POS V9.2.9 - Dynamic Branch Management
-- Safe to run more than once.

alter table public.branches add column if not exists phone text;
alter table public.branches add column if not exists address text;
alter table public.branches add column if not exists website_visible boolean not null default true;
alter table public.branches add column if not exists sort_order integer;

update public.branches
set sort_order = id
where sort_order is null;

-- Branch creator is an atomic server-side transaction: either everything succeeds or nothing is created.
create or replace function public.create_branch_full(
  p_name text,
  p_phone text default null,
  p_address text default null,
  p_source_branch_id bigint default null,
  p_website_visible boolean default true
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id bigint;
  v_employee_id bigint;
  v_prep_min integer := 30;
  v_prep_max integer := 45;
begin
  if not (public.current_employee_role() = 'admin' or public.has_permission('branchManagement')) then
    raise exception 'ليس لديك صلاحية إدارة الفروع';
  end if;

  if nullif(trim(p_name),'') is null then
    raise exception 'اسم الفرع مطلوب';
  end if;

  if exists(select 1 from public.branches where lower(trim(name)) = lower(trim(p_name)) and active = true) then
    raise exception 'يوجد فرع فعال بنفس الاسم';
  end if;

  if p_source_branch_id is not null and not exists(select 1 from public.branches where id=p_source_branch_id) then
    raise exception 'الفرع النموذج غير موجود';
  end if;

  insert into public.branches(name, active, phone, address, website_visible, sort_order)
  values(trim(p_name), true, nullif(trim(coalesce(p_phone,'')),''), nullif(trim(coalesce(p_address,'')),''), coalesce(p_website_visible,true), (select coalesce(max(sort_order),0)+1 from public.branches))
  returning id into v_branch_id;

  if p_source_branch_id is not null then
    select coalesce(prep_min,30), coalesce(prep_max,45)
      into v_prep_min, v_prep_max
    from public.branch_website_settings
    where branch_id=p_source_branch_id;
  end if;

  insert into public.branch_website_settings(branch_id,orders_open,orders_paused_until,prep_min,prep_max,updated_at)
  values(v_branch_id,true,null,v_prep_min,v_prep_max,now())
  on conflict(branch_id) do update set prep_min=excluded.prep_min,prep_max=excluded.prep_max,updated_at=now();

  -- Every existing product gets a branch row. Stable availability and price override are cloned from the template.
  -- Temporary pauses are intentionally cleared for the new branch.
  insert into public.branch_products(branch_id,product_id,active,price_override,website_paused_until)
  select v_branch_id,p.id,coalesce(src.active,true),src.price_override,null
  from public.products p
  left join public.branch_products src
    on src.product_id=p.id and src.branch_id=p_source_branch_id
  on conflict(branch_id,product_id) do nothing;

  -- A non-admin creator automatically gets access to the new branch.
  v_employee_id := public.current_employee_id();
  if v_employee_id is not null then
    insert into public.employee_branches(employee_id,branch_id)
    values(v_employee_id,v_branch_id)
    on conflict do nothing;
  end if;

  return v_branch_id;
end;
$$;

grant execute on function public.create_branch_full(text,text,text,bigint,boolean) to authenticated;

-- Existing branch read policy remains in place. These grants are needed by the POS and website.
grant select on public.branches to authenticated, anon;

notify pgrst, 'reload schema';
