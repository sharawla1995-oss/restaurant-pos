-- Top Burger V9.1.8 — إصلاح آمن لأصناف برجر اللحمة فقط
-- لا ينشئ تكرارًا: يستخدم الاسم الموجود إن وُجد ويعيد تفعيله وربطه بتصنيف برجر.

do $$
declare
  cid bigint;
  r record;
  pid bigint;
begin
  select id into cid from public.categories where name='برجر' order by id limit 1;
  if cid is null then
    insert into public.categories(name,active,website_visible,sort_order,website_sort_order)
    values('برجر',true,true,20,20) returning id into cid;
  else
    update public.categories set active=true, website_visible=true where id=cid;
  end if;

  for r in select * from (values
    ('أوريجنال لحم',90::numeric,130::numeric,10),
    ('رانش برجر',95::numeric,135::numeric,20),
    ('تيستي ستكس',100::numeric,140::numeric,30),
    ('توب برجر',110::numeric,145::numeric,40),
    ('مشروم بيف',110::numeric,145::numeric,50),
    ('أونيون رينج بيف',110::numeric,145::numeric,60)
  ) as x(name,single_price,double_price,ord)
  loop
    select id into pid from public.products where name=r.name order by id limit 1;
    if pid is null then
      insert into public.products(name,category_id,price,cost,active,website_visible,website_sort_order,allow_extras,allow_removals,allow_item_notes)
      values(r.name,cid,r.single_price,0,true,true,r.ord,true,true,true) returning id into pid;
    else
      update public.products set category_id=cid,price=r.single_price,active=true,website_visible=true,website_sort_order=r.ord where id=pid;
    end if;

    insert into public.product_variants(product_id,name,price,sort_order,active)
    values(pid,'سينجل',r.single_price,10,true)
    on conflict(product_id,name) do update set price=excluded.price,sort_order=excluded.sort_order,active=true;

    insert into public.product_variants(product_id,name,price,sort_order,active)
    values(pid,'دبل',r.double_price,20,true)
    on conflict(product_id,name) do update set price=excluded.price,sort_order=excluded.sort_order,active=true;

    insert into public.branch_products(branch_id,product_id,active)
    select b.id,pid,true from public.branches b
    on conflict(branch_id,product_id) do update set active=true;
  end loop;
end $$;

notify pgrst, 'reload schema';
